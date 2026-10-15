'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const { Store } = require('./store');
const { VERSION, DEFAULT_SETTINGS, DEFAULT_PRODUCTS, normaliseSettings, validateSettingsPatch, integrationStatus } = require('./config');
const { createLlm } = require('./llm');
const { createCrm } = require('./crm');
const { createOutbound } = require('./outbound');
const { createVoice } = require('./voice');
const { createTaskQueue, ACTIVE: ACTIVE_TASKS } = require('./tasks');
const { createCampaigns } = require('./campaigns');
const { createTools } = require('./tools');
const { createAgent } = require('./agent');
const { createEvents } = require('./events');
const { createReports } = require('./reports');
const { id, nowIso, str, validate, normalizePhone, isPlainObject, mergeDeep } = require('./util');

/** Settings can name an environment variable, but never hold a credential itself. */
const SECRET_VALUE_RE = /^(api[_-]?key|apikey|auth[_-]?token|token|secret|password|access[_-]?key|xi-api-key)$/i;
function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    if (SECRET_VALUE_RE.test(key)) continue;
    out[key] = stripSecrets(inner);
  }
  return out;
}

function loadLocalEnv(dir, target = process.env) {
  const file = path.join(dir, '.env');
  if (!fs.existsSync(file)) return false;
  try { fs.chmodSync(file, 0o600); } catch { /* not fatal */ }
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value.startsWith('#')) continue;
    if (target[m[1]] === undefined) target[m[1]] = value;
  }
  return true;
}

function compile(pattern) {
  const names = [];
  const source = pattern.replace(/:[A-Za-z][A-Za-z0-9]*/g, (match) => { names.push(match.slice(1)); return '([^/]+)'; });
  return { re: new RegExp(`^${source}$`), names };
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => execFile(command, args, { timeout: 45000 }, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, { stderr: String(stderr || '') })); else resolve(String(stdout || ''));
  }));
}

/** Verify ElevenLabs' timestamped HMAC-SHA256 webhook signature before parsing trust. */
function verifyElevenLabsSignature(rawBody, header, secret, nowMs = Date.now()) {
  if (!secret || !header || typeof rawBody !== 'string') return false;
  const parts = String(header).split(',').map((p) => p.trim());
  const timePart = parts.find((p) => p.startsWith('t='));
  const signatures = parts.filter((p) => p.startsWith('v0=')).map((p) => p.slice(3)).filter((s) => /^[a-f0-9]{64}$/i.test(s));
  if (!timePart || !signatures.length) return false;
  const timestampText = timePart.slice(2);
  if (!/^\d{1,12}$/.test(timestampText)) return false;
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(nowMs / 1000) - timestamp) > 30 * 60) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestampText}.${rawBody}`).digest('hex');
  return signatures.some((signature) => {
    const a = Buffer.from(signature.toLowerCase(), 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

function createApp(dataDir, opts = {}) {
  const startedAt = Date.now();
  let callbackReminderTimer = null;
  let callbackReminderBusy = false;
  const env = opts.env || process.env;
  const platform = opts.platform || (opts.exec ? 'darwin' : process.platform);
  const exec = opts.exec || runCommand;
  const providerFetch = opts.providerFetch || fetch;
  const providerCallPollMs = Math.max(10, Math.min(10000, Number(opts.providerCallPollMs) || 5000));
  const store = new Store(dataDir);
  const events = createEvents();

  let settingsCache = null;
  function getSettings() {
    if (!settingsCache) settingsCache = normaliseSettings(readSettingsFile());
    return settingsCache;
  }
  function readSettingsFile() {
    try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')); } catch { return {}; }
  }
  function reloadSettings() { settingsCache = null; return getSettings(); }
  async function persistSettings(next) {
    await store.update('settings', () => next);
    settingsCache = normaliseSettings(next);
    return settingsCache;
  }
  async function setSetting([group, key], value) {
    const current = getSettings();
    const next = { ...current, [group]: { ...current[group], [key]: value } };
    await persistSettings(next);
    return next;
  }

  /** Audit trail entry. `meta` may carry customerId, callId, text, etc. */
  function audit(type, text, meta = {}) {
    const entry = { id: id(), type, text: str(text, 900), ...meta, at: nowIso() };
    store.prepend('activities', entry).catch(() => {});
    events.publish('activity', entry);
    return entry;
  }
  const log = (type, text, meta = {}) => audit(type, text, meta);

  const llm = createLlm({ getSettings, env, fetchImpl: opts.llmFetch || providerFetch });
  const crm = createCrm({ store, log, getSettings });
  const outbound = createOutbound({ store, log, getSettings, env, providerFetch, exec, platform });
  const notify = opts.notify || ((title, body) => platform === 'darwin' ? exec('osascript', ['-e', 'on run argv\ndisplay notification (item 1 of argv) with title (item 2 of argv)\nend run', body, title]) : Promise.reject(new Error('macOS notifications are unavailable here.')));

  const services = { store, log, getSettings, crm, outbound, llm, setSetting, audit: (name, args, result) => {} };
  const voice = createVoice({ store, log, getSettings, llm, crm, exec, dataDir, platform });
  const queue = createTaskQueue({ store, log, getSettings, events, notify, execute: (task, ctx) => executeTask(task, ctx) });
  services.queue = queue;
  const campaigns = createCampaigns({ store, log, getSettings, crm, queue });
  services.campaigns = campaigns;
  const reports = createReports({ store, getSettings, llm, queue, crm, campaigns, startedAt, platform });
  services.reports = reports;
  const tools = createTools(services);
  services.tools = tools;
  const agent = createAgent({ store, log, getSettings, llm, tools, queue, events, crm });
  services.agent = agent;

  async function checkDueCallbacks() {
    if (!getSettings().notifications || callbackReminderBusy) return { notified: 0, skipped: true };
    callbackReminderBusy = true;
    let notified = 0;
    try {
      const callbacks = await store.read('callbacks');
      const due = callbacks.filter((c) => c.status === 'scheduled' && new Date(c.scheduledAt).getTime() <= Date.now() + 15 * 60000);
      for (const callback of due) {
        const localTime = new Date(callback.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
        let sent = false;
        let error = '';
        try { await notify('DR53 callback due soon', `Callback with ${callback.customerName} at ${localTime} IST.`); sent = true; }
        catch (e) { error = str(e.message, 160); }
        await store.update('callbacks', (rows) => {
          const found = rows.find((r) => r.id === callback.id);
          if (found && found.status === 'scheduled') {
            found.lastNotificationAttemptAt = nowIso();
            found.notificationSent = sent;
            if (sent) {
              found.status = 'due_notified';
              found.notifiedAt = nowIso();
              delete found.notificationError;
            } else {
              // Keep it eligible for the next reminder tick instead of silently losing a reminder.
              found.notificationError = error || 'Notification delivery failed.';
            }
          }
          return rows;
        });
        events.publish('callback', { type: 'callback_due', callbackId: callback.id, customerName: callback.customerName, scheduledAt: callback.scheduledAt, notificationSent: sent });
        if (sent) notified++;
        else log('notification', `Could not show callback reminder for ${callback.customerName}: ${error || 'notifications unavailable'}`, { customerId: callback.customerId || undefined });
      }
      return { notified, checked: due.length };
    } finally { callbackReminderBusy = false; }
  }

  /* ------------------------------------------------------------ task runner */

  async function executeTask(task, { onEvent, heartbeat }) {
    if (getSettings().agent.killSwitch && ['call', 'message'].includes(task.kind)) return { ok: false, noRetry: true, error: 'The kill switch is ON, so outbound work was not run.' };
    onEvent('working', `Starting ${task.kind}`);
    switch (task.kind) {
      case 'tool': {
        const approvals = await store.read('approvals');
        const approval = approvals.find((a) => a.taskId === task.id);
        if (approval && approval.decision !== 'approved') return { ok: false, noRetry: true, error: `The operator ${approval.decision || 'has not decided'} on this action.` };
        const { toolName, args } = task.payload || {};
        if (!toolName) return { ok: false, noRetry: true, error: 'The approved action lost its tool name.' };
        const result = await tools.execute(toolName, args, { origin: 'approved-task' });
        if (!result.ok) return { ok: false, noRetry: true, error: result.error };
        onEvent('done', result.summary || 'Completed');
        return { ok: true, result: result.data, message: result.summary };
      }
      case 'call': {
        const settings = getSettings();
        const gate = await crm.eligibility(task.customerId || task.payload.phone, 'call');
        if (!gate.ok) return { ok: false, noRetry: true, error: gate.reason };
        const mode = task.payload.mode || settings.voice.mode;
        if (mode === 'provider') {
          // The CRM eligibility gate above is the server-side consent check for queued calls.
          const started = await outbound.startProviderCall({ ...task.payload, consentConfirmed: true, customerId: task.customerId, source: task.campaignId ? 'campaign' : 'queue' });
          if (started.error) return { ok: false, error: started.error, noRetry: /not configured/i.test(started.error) };
          if (started.call?.status !== 'initiated') {
            const startupError = started.message || started.call?.error || 'The voice provider did not confirm the call start.';
            const uncertain = /timed out|may already be placed/i.test(startupError);
            return { ok: false, error: startupError, noRetry: uncertain || /Provider HTTP 4\d\d/.test(startupError), retryable: !uncertain && !/Provider HTTP 4\d\d/.test(startupError) };
          }
          const callId = started.call.id;
          let state = started.call.status;
          const deadline = Date.now() + Math.min(600000, settings.voice.maxSeconds * 1000);
          while (Date.now() < deadline && !['concluded', 'completed', 'cancelled', 'failed', 'no_answer', 'ring_nr_busy', 'voice_timeout'].includes(String(state).toLowerCase())) {
            await heartbeat();
            await new Promise((r) => setTimeout(r, providerCallPollMs));
            const synced = await outbound.fetchProviderCall(callId);
            state = (synced.call && synced.call.status) || state;
            if (synced.error) { onEvent('sync_error', synced.error); break; }
            onEvent('call_status', `Provider status: ${state}`);
          }
          const final = await store.read('calls').then((rows) => rows.find((c) => c.id === callId));
          const normalState = String(state).toLowerCase();
          const terminal = ['completed', 'concluded', 'cancelled', 'failed', 'no_answer', 'ring_nr_busy', 'voice_timeout'].includes(normalState);
          if (!terminal) {
            return { ok: false, noRetry: true, error: `The provider call remains in status "${normalState || 'unknown'}" and could not be confirmed complete. Check Calls & Voice before retrying to avoid a duplicate call.` };
          }
          const outcome = ['concluded', 'completed'].includes(normalState) ? 'answered' : ['no_answer', 'ring_nr_busy', 'voice_timeout'].includes(normalState) ? 'no_answer' : ['cancelled', 'failed'].includes(normalState) ? normalState : 'answered';
          await outbound.recordOutcome({ callId, customerId: task.customerId, outcome, summary: final?.summary || '' });
          if (outcome === 'no_answer' && task.attempts < task.maxAttempts) {
            return { ok: false, retryable: true, error: `No answer (${state}). Automatically rescheduling attempt ${task.attempts + 1} of ${task.maxAttempts}.` };
          }
          if (outcome === 'failed') return { ok: false, error: `The voice provider reported a failed call (${state}).`, retryable: true };
          if (outcome === 'cancelled') return { ok: false, noRetry: true, error: 'The provider call was cancelled; no further attempt was made.' };
          if (task.campaignId) await campaigns.finishIfComplete(task.campaignId);
          return { ok: true, result: { callId, state, outcome, transcript: (final?.transcript || []).length }, message: `Provider call ${state}.` };
        }
        const session = await voice.start({ customerId: task.customerId, phone: task.payload.phone, purpose: task.payload.purpose, productInterest: task.payload.productInterest, mode: 'local', operatorConfirmed: true, source: 'queue' });
        if (session.error) return { ok: false, noRetry: true, error: session.error };
        onEvent('needs_console', 'Local voice session prepared.');
        return {
          ok: true,
          result: { voiceSessionId: session.session.id, openingLine: session.session.opening },
          message: 'A local voice session is ready in the Live Call console. The browser has to be open with microphone access for the AI to hear the customer, so this is not an unattended call.',
        };
      }
      case 'message': {
        const gate = await crm.eligibility(task.customerId || task.payload.phone, task.payload.channel || 'whatsapp');
        if (!gate.ok) return { ok: false, noRetry: true, error: gate.reason };
        const r = await outbound.send({ ...task.payload, customerId: task.customerId, consentConfirmed: true, source: task.campaignId ? 'campaign' : 'queue' });
        if (r.error) return { ok: false, error: r.error, noRetry: /not configured/i.test(r.error) };
        if (r.duplicate) return { ok: true, result: r.messageRecord, message: r.message };
        if (r.messageRecord.status === 'failed') return { ok: false, error: r.messageRecord.error };
        if (task.campaignId) await campaigns.finishIfComplete(task.campaignId);
        return { ok: true, result: { messageId: r.messageRecord.id, status: r.messageRecord.status }, message: r.message };
      }
      case 'followup': {
        const r = await crm.addFollowup({ ...task.payload, title: task.payload.title || task.title, customerId: task.customerId }, 'queue');
        if (r.error) return { ok: false, noRetry: true, error: r.error };
        return { ok: true, result: r, message: `Follow-up "${r.title}" saved.` };
      }
      case 'reminder': {
        const settings = getSettings();
        let notification = { sent: false, reason: 'disabled' };
        if (settings.notifications) { try { await notify('DR53 reminder', task.title); notification = { sent: true }; } catch (e) { notification = { sent: false, reason: str(e.message, 120) }; } }
        return { ok: true, result: notification, message: `Reminder shown: ${notification.sent ? 'yes' : notification.reason}.` };
      }
      case 'callback_check': {
        const result = await checkDueCallbacks();
        return { ok: true, result, message: `${result.notified || 0} callback reminder(s) shown.` };
      }
      case 'agent_goal': {
        const result = await agent.runGoal(str(task.payload.goal, 4000), { title: task.title, customerId: task.customerId, campaignId: task.campaignId });
        if (result.error) return { ok: false, error: result.error };
        const actions = (result.trace || []).filter((t) => t.result.ok).length;
        if (task.campaignId) await campaigns.finishIfComplete(task.campaignId);
        return { ok: true, result: { conversationId: result.conversationId, actions, reply: str(result.message?.content, 2000) }, message: `${actions} tool action(s) completed. See thread ${result.conversationId}.` };
      }
      default:
        return { ok: false, noRetry: true, error: `Unsupported task kind "${task.kind}".` };
    }
  }

  /* -------------------------------------------------------------- http layer */

  const routes = [];
  const add = (method, pattern, handler, options = {}) => routes.push({ method, ...compile(pattern), handler, options });
  const ok = (body, status = 200) => ({ status, body });
  const fail = (status, error) => ({ status, body: { error } });
  async function linkedCustomerForOutbound(body) {
    if (body.customerId) { const byId = await crm.get(body.customerId); if (byId) return byId; }
    const normalized = normalizePhone(body.phone || '');
    if (normalized.error) return null;
    const customers = await crm.list();
    return customers.find((c) => { const existing = normalizePhone(c.phone || ''); return !existing.error && existing.phone === normalized.phone; }) || null;
  }
  function isHardOutreachBlock(gate) { return !!gate?.optOut || /Not Interested|opted out|only agreed to/i.test(gate?.reason || ''); }

  add('GET', '/api/session', async ({ req, query }) => {
    const required = !!str(env.DR53_ACCESS_TOKEN, 200);
    return ok({ authRequired: required, authenticated: !required || cookieValid(req, query), version: VERSION, platform, hostname: require('os').hostname() });
  });
  add('POST', '/api/login', async ({ body, req, res }) => {
    const expected = str(env.DR53_ACCESS_TOKEN, 200);
    if (!expected) return fail(400, 'No access token is configured; the app is already open on this machine.');
    if (loginAttempts(req) > 8) return fail(429, 'Too many failed attempts. Wait a minute.');
    const candidate = str(body.token, 200);
    if (!expected || !timingEqual(candidate, expected)) { recordLoginFailure(req); return fail(401, 'That access token is not correct.'); }
    res.setHeader('Set-Cookie', `dr53_session=${expectedSession()}; Max-Age=${60 * 60 * 24 * 30}; Path=/; HttpOnly; SameSite=Strict`);
    return ok({ ok: true });
  });
  add('POST', '/api/logout', async ({ res }) => { res.setHeader('Set-Cookie', 'dr53_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict'); return ok({ ok: true }); });

  add('GET', '/api/health', async () => ({ body: await reports.health() }));
  add('GET', '/api/system/health', async () => ({ body: await reports.health() }));
  add('GET', '/api/system/logs', async ({ query }) => ({ body: await reports.recentLogs({ limit: +(query.get('limit') || 100), type: query.get('type') || '', q: query.get('q') || '' }) }));
  add('GET', '/api/system/audit', async ({ query }) => ({ body: (await store.read('activities')).slice(0, +(query.get('limit') || 200)) }));
  add('POST', '/api/system/backup', async () => { const file = store.backup('manual'); return ok({ file: path.basename(file), message: 'Snapshot written to data/backups.' }); });
  add('GET', '/api/system/backups', async () => ({ body: store.listBackups() }));
  add('GET', '/api/analytics', async ({ query }) => ({ body: await reports.analytics({ days: Math.min(60, +query.get('days') || 14) }) }));
  add('GET', '/api/summary', async ({ query }) => ({ body: await reports.summary(query.get('scope') || 'today') }));

  add('GET', '/api/settings', async () => ({ body: getSettings() }));
  add('PUT', '/api/settings', async ({ body }) => {
    const current = getSettings();
    const candidate = mergeDeep(current, body || {});
    const errors = validateSettingsPatch(candidate);
    if (errors.length) return fail(400, errors.join(' '));
    const patch = stripSecrets(body);
    const next = normaliseSettings(mergeDeep(current, patch));
    if (body.llm) {
      next.llm = normaliseSettings({ llm: { ...current.llm, ...body.llm } }).llm;
      if (body.llm.providers) {
        const ids = new Set(body.llm.providers.map((p) => p.id));
        if (!ids.has(next.llm.primary)) next.llm.primary = body.llm.providers[0].id;
        if (next.llm.fallback !== 'none' && !ids.has(next.llm.fallback)) next.llm.fallback = 'none';
      }
    }
    await persistSettings(next);
    llm.clearToolCache();
    log('settings', 'Settings updated');
    events.publish('settings', { at: nowIso() });
    return ok(next);
  });
  add('POST', '/api/settings/kill-switch', async ({ body }) => {
    const value = !!body.on;
    const next = await setSetting(['agent', 'killSwitch'], value);
    if (value) await queue.cancelPending({ reason: 'Kill switch engaged by the operator' });
    log('safety', `Kill switch turned ${value ? 'ON' : 'OFF'} by the operator`);
    events.publish('safety', { killSwitch: value });
    return ok({ killSwitch: value, settings: next.agent });
  });

  add('GET', '/api/providers/status', async () => ({ body: integrationStatus(env) }));
  add('GET', '/api/ai/status', async () => ({ body: await reports.modelStatus(true) }));
  add('POST', '/api/ai/probe', async () => ({ body: await reports.modelStatus(true) }));
  add('POST', '/api/ai/test', async ({ body }) => {
    const prompt = str(body?.prompt, 400) || 'Reply with the single word: ready';
    const result = await llm.complete({ messages: [{ role: 'user', content: prompt }], containsCustomerData: false, preferProviderId: str(body?.providerId, 60) || undefined });
    if (!result.ok) return fail(502, result.error);
    return ok({ reply: str(result.text, 500), provider: result.provider, mode: result.mode, attempts: result.attempts });
  });

  add('GET', '/api/products', async () => ({ body: await store.read('products') }));
  add('POST', '/api/products', async ({ body }) => {
    const v = validate({ type: 'object', properties: { name: { type: 'string', minLength: 2, maxLength: 100 }, price: { type: 'number', minimum: 0 }, priceType: { type: 'string', enum: ['fixed', 'starting'] }, description: { type: 'string', maxLength: 1000 }, active: { type: 'boolean' } }, required: ['name', 'price'] }, body, 'product');
    if (!v.ok) return fail(400, v.error);
    const product = { id: str(body.id, 40) || v.value.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40), ...v.value, priceType: v.value.priceType || 'fixed', description: v.value.description || '', active: v.value.active !== false };
    await store.update('products', (rows) => { rows.unshift(product); return rows; });
    log('product', `Added product ${product.name}`);
    return ok(product, 201);
  });
  add('PUT', '/api/products/:id', async ({ params, body }) => {
    return store.update('products', (rows) => {
      const p = rows.find((x) => x.id === params[0]);
      if (!p) return { value: rows, result: fail(404, 'Product not found.') };
      if (body.price !== undefined) { const n = Number(body.price); if (!(n >= 0)) return { value: rows, result: fail(400, 'Price must be zero or more.') }; p.price = n; }
      if (body.name !== undefined) p.name = str(body.name, 100) || p.name;
      if (body.description !== undefined) p.description = str(body.description, 1000);
      if (['fixed', 'starting'].includes(body.priceType)) p.priceType = body.priceType;
      if (body.active !== undefined) p.active = !!body.active;
      log('product', `Updated ${p.name}`);
      return { value: rows, result: ok(p) };
    });
  });

  add('GET', '/api/customers', async ({ query }) => ({
    body: await crm.query({
      q: query.get('q') || '', status: query.get('status') || '', tag: query.get('tag') || '', channel: query.get('channel') || '',
      onlyWithPhone: query.get('onlyWithPhone') === 'true', optOut: query.get('optOut') || '',
      sort: query.get('sort') || 'score', dir: query.get('dir') || 'desc',
      limit: Math.min(500, Number(query.get('limit')) || 100), offset: Math.max(0, Number(query.get('offset')) || 0),
    }),
  }));
  add('POST', '/api/customers', async ({ body }) => {
    const r = await crm.create(body);
    if (r.error) return { status: r.duplicateOf ? 409 : 400, body: { error: r.error, ...(r.duplicateOf ? { duplicateOf: r.duplicateOf } : {}) } };
    const customer = r;
    const automation = [];
    const a = getSettings().automation || {};
    if (customer.phone && customer.consent?.contactApproved && !customer.consent?.optOut) {
      const channel = ['sms', 'whatsapp'].includes(a.newLeadMessageChannel) ? a.newLeadMessageChannel : 'whatsapp';
      const allowedChannel = !customer.consent.channels?.length || customer.consent.channels.includes(channel);
      if (a.autoMessageNewLead && allowedChannel) {
        const welcome = `Hi ${customer.name}, thanks for your interest in Dynamic Robotics 53. I'm the DR53 AI assistant. How can we help with ${customer.product || 'your enquiry'}? Reply STOP if you do not want further messages.`;
        const queued = await queue.enqueue({ kind: 'message', title: `Welcome message to ${customer.name}`, customerId: customer.id, payload: { phone: customer.phone, customerName: customer.name, channel, message: welcome, consentConfirmed: true }, createdBy: 'new-lead automation', maxAttempts: 1, dedupeKey: `new-lead:${customer.id}:${channel}` });
        if (queued.task) automation.push({ kind: 'message', taskId: queued.task.id, status: queued.task.status });
      }
      const callAllowed = !customer.consent.channels?.length || customer.consent.channels.includes('call');
      if (a.autoCallNewLead && callAllowed) {
        const runAfter = new Date(Date.now() + (a.autoMessageNewLead ? 3 * 60000 : 0)).toISOString();
        const queued = await queue.enqueue({ kind: 'call', title: `AI follow-up call to ${customer.name}`, customerId: customer.id, payload: { phone: customer.phone, customerName: customer.name, purpose: 'follow up on a new customer enquiry', productInterest: customer.product || '', mode: 'provider', consentConfirmed: true }, createdBy: 'new-lead automation', maxAttempts: getSettings().calling.maxAttemptsPerContact, runAfter, dedupeKey: `new-lead:${customer.id}:call` });
        if (queued.task) automation.push({ kind: 'call', taskId: queued.task.id, status: queued.task.status, scheduledAt: runAfter });
      }
    }
    return ok({ ...customer, automation }, 201);
  });
  // Save a new contact explicitly initiated from Calls & Voice without triggering
  // new-lead automation. The CRM Store persists this record to data/customers.json.
  add('POST', '/api/customers/quick-save', async ({ body }) => {
    const r = await crm.create({ ...body, source: body.source || 'Calls & Voice' });
    if (!r.error) return ok({ customer: r, created: true, duplicate: false }, 201);
    if (r.duplicateOf) {
      const existing = await crm.get(r.duplicateOf);
      if (existing) return ok({ customer: existing, created: false, duplicate: true, message: `Existing customer record found for ${existing.name}; reused it without overwriting details.` });
    }
    return fail(400, r.error);
  });
  add('GET', '/api/customers.csv', async ({ query }) => ({ raw: await crm.exportCsv(Object.fromEntries(query)), type: 'text/csv' }));
  add('POST', '/api/customers/import', async ({ body }) => {
    const r = await crm.importCsv(body.csv);
    return r.error ? fail(400, r.error) : ok(r, 201);
  });
  add('POST', '/api/customers/:id/opt-out', async ({ params, body }) => { const r = await crm.optOut(params[0], body.reason || 'Requested by customer'); return r.error ? fail(404, r.error) : ok(r); });
  add('GET', '/api/customers/:id', async ({ params }) => {
    const c = await crm.get(params[0]);
    if (!c) return fail(404, 'Customer not found.');
    const [timeline, messages, calls, tasks] = await Promise.all([crm.timeline(params[0], 40), store.read('messages').then((r) => r.filter((m) => m.customerId === params[0]).slice(0, 20)), outbound.listCalls({ customerId: params[0], limit: 20 }), queue.list({ limit: 50 }).then((r) => r.filter((t) => t.customerId === params[0]))]);
    return ok({ customer: c, timeline, messages, calls, tasks });
  });
  add('PUT', '/api/customers/:id', async ({ params, body }) => { const r = await crm.update(params[0], body); return r.error ? fail(r.error.includes('not found') ? 404 : 400, r.error) : ok(r); });
  add('DELETE', '/api/customers/:id', async ({ params, query }) => {
    if (query.get('confirm') !== 'true') return fail(400, 'Deletion requires confirm=true.');
    const r = await crm.remove(params[0]);
    return r.error ? fail(404, r.error) : ok(r);
  });
  add('POST', '/api/customers/:id/notes', async ({ params, body }) => { const r = await crm.note(params[0], body.text); return r.error ? fail(400, r.error) : ok(r); });

  add('GET', '/api/callbacks', async () => ({ body: await store.read('callbacks') }));
  add('POST', '/api/callbacks', async ({ body }) => {
    const r = await crm.addCallback(body);
    if (r.error) return fail(422, r.error);
    let notification = { sent: false, reason: 'disabled' };
    if (getSettings().notifications) { try { await notify('DR53 callback booked', `Callback with ${r.callback.customerName} scheduled.`); notification = { sent: true }; } catch (e) { notification = { sent: false, reason: str(e.message, 120) }; } }
    return ok({ callback: r.callback, notification }, 201);
  });
  add('DELETE', '/api/callbacks/:id', async ({ params, query }) => {
    if (query.get('confirm') !== 'true') return fail(400, 'Cancellation requires confirm=true.');
    const r = await crm.cancelCallback(params[0]);
    return r.error ? fail(404, r.error) : ok(r);
  });

  add('GET', '/api/followups', async () => ({ body: await store.read('followups') }));
  add('POST', '/api/followups', async ({ body }) => { const r = await crm.addFollowup(body); return r.error ? fail(400, r.error) : ok(r, 201); });
  add('POST', '/api/followups/:id/complete', async ({ params }) => { const r = await crm.completeFollowup(params[0]); return r.error ? fail(404, r.error) : ok(r); });
  add('DELETE', '/api/followups/:id', async ({ params, query }) => {
    if (query.get('confirm') !== 'true') return fail(400, 'Deletion requires confirm=true.');
    return store.update('followups', (rows) => ({ value: rows.filter((f) => f.id !== params[0]), result: ok({ ok: true }) }));
  });

  add('GET', '/api/calls', async ({ query }) => ({ body: await outbound.listCalls({ limit: +(query.get('limit') || 100), kind: query.get('kind') || '', status: query.get('status') || '', customerId: query.get('customerId') || '' }) }));
  add('POST', '/api/calls/dial', async ({ body }) => {
    const linkedCustomer = await linkedCustomerForOutbound(body);
    if (linkedCustomer) {
      const gate = await crm.eligibility(linkedCustomer.id, 'call');
      if (!gate.ok && (isHardOutreachBlock(gate) || !body.operatorConfirmed)) return fail(400, gate.reason);
    }
    const r = await outbound.nativeDial(body);
    return r.error ? fail(400, r.error) : ok(r, r.call.status === 'dial_opened' ? 201 : 502);
  });
  add('POST', '/api/calls/ai', async ({ body }) => {
    const linkedCustomer = await linkedCustomerForOutbound(body);
    if (linkedCustomer) {
      const gate = await crm.eligibility(linkedCustomer.id, 'call');
      if (!gate.ok && (isHardOutreachBlock(gate) || !(body.consentConfirmed && gate.needsConsent))) return fail(400, gate.reason);
    }
    const r = await outbound.startProviderCall(body);
    return r.error ? fail(/not configured/i.test(r.error) ? 503 : 400, r.error) : ok(r, r.call.status === 'initiated' ? 201 : 502);
  });
  add('GET', '/api/calls/:id', async ({ params }) => { const c = (await store.read('calls')).find((x) => x.id === params[0]); return c ? ok({ call: c }) : fail(404, 'Call not found.'); });
  add('PUT', '/api/calls/:id', async ({ params, body }) => { const r = await outbound.recordOutcome({ callId: params[0], ...body }); return r.error ? fail(400, r.error) : ok(r); });
  add('POST', '/api/calls/:id/sync', async ({ params }) => { const r = await outbound.fetchProviderCall(params[0]); return r.error ? fail(502, r.error) : ok(r); });
  add('POST', '/api/calls/sync-all', async () => {
    const rows = (await store.read('calls')).filter((c) => c.conversationId && !['concluded', 'completed', 'cancelled', 'failed'].includes(String(c.status)));
    const out = [];
    for (const c of rows.slice(0, 20)) out.push(await outbound.fetchProviderCall(c.id));
    return ok({ synced: out.length, calls: out.map((r) => r.call || r) });
  });

  add('GET', '/api/messages', async ({ query }) => ({ body: (await store.read('messages')).filter((m) => !query.get('customerId') || m.customerId === query.get('customerId')).slice(0, +(query.get('limit') || 100)) }));
  add('POST', '/api/messages/send', async ({ body }) => {
    const linkedCustomer = await linkedCustomerForOutbound(body);
    if (linkedCustomer) {
      const gate = await crm.eligibility(linkedCustomer.id, body.channel || 'whatsapp');
      if (!gate.ok && (isHardOutreachBlock(gate) || !(body.consentConfirmed && gate.needsConsent))) return fail(400, gate.reason);
    }
    const r = await outbound.send(body);
    if (r.error) return fail(/not configured/.test(r.error) ? 503 : 400, r.error);
    if (r.messageRecord?.status === 'failed') return ok({ messageRecord: r.messageRecord, message: r.error || r.messageRecord.error }, 502);
    return ok(r, r.duplicate ? 200 : 201);
  });
  add('POST', '/api/messages/draft', async ({ body }) => {
    const r = await outbound.send({ ...body, draftOnly: true });
    return r.error ? fail(400, r.error) : ok(r, 201);
  });
  add('POST', '/api/messages/generate-draft', async ({ body }) => {
    const channel = ['whatsapp', 'sms'].includes(body.channel) ? body.channel : 'whatsapp';
    const customerName = str(body.customerName, 120) || 'customer';
    const productInterest = str(body.productInterest, 180) || 'their enquiry';
    const purpose = str(body.purpose, 300) || 'a polite follow-up to an existing enquiry';
    const settings = getSettings();
    const products = await store.read('products');
    const approved = require('./config').catalogueText(products);
    const result = await llm.complete({
      containsCustomerData: true,
      preferProviderId: 'ollama-local',
      localOnly: true,
      messages: [
        { role: 'system', content: `You write short, natural customer follow-up messages for ${settings.business.name}. Produce only the message body, with no quotation marks or explanation. Be truthful, polite and non-pushy. Do not invent prices, specifications, discounts or promises. Do not claim a message was sent. Respect opt-outs. Keep WhatsApp to 2-5 short sentences and SMS concise. Approved catalogue:\n${approved || '(No approved catalogue available; do not state product facts or prices.)'}` },
        { role: 'user', content: `Draft a ${channel.toUpperCase()} message for customer ${customerName}. Product/interest: ${productInterest}. Goal: ${purpose}. Website: ${settings.business.website || 'not configured'}. Make it ready for the operator to review and edit. Do not send it.` },
      ],
    });
    if (!result.ok || !str(result.text, 1600)) return fail(503, `Local AI could not draft the message. Check that Ollama is running and qwen2.5:3b is installed. ${result.error || ''}`.trim());
    return ok({ draft: str(result.text, 1600).replace(/^['"]|['"]$/g, '').trim(), provider: result.provider?.label || 'local AI' });
  });
  add('POST', '/api/messages/:id/sync', async ({ params }) => { const r = await outbound.syncStatus(params[0]); return r.error ? fail(502, r.error) : ok(r); });
  add('POST', '/api/messages/sync-pending', async () => ok(await outbound.syncAllPending()));
  add('POST', '/api/native/open-messages', async () => { const r = await outbound.openMessagesApp(); return r.error ? fail(platform === 'darwin' ? 502 : 501, r.error) : ok(r); });

  add('GET', '/api/voice/capability', async () => ({ body: { ...voice.ttsCapability(), states: voice.STATES, mode: getSettings().voice.mode } }));
  add('GET', '/api/voice/sessions', async () => ({ body: { active: await voice.active(), recent: await voice.recent(20) } }));
  add('POST', '/api/voice/sessions', async ({ body }) => { const r = await voice.start(body); return r.error ? fail(400, r.error) : ok(r, 201); });
  add('GET', '/api/voice/sessions/:id', async ({ params }) => { const s = await voice.get(params[0]); return s ? ok({ session: s }) : fail(404, 'Session not found.'); });
  add('POST', '/api/voice/sessions/:id/state', async ({ params, body }) => { const r = await voice.setState(params[0], body.state, body); return r.error ? fail(400, r.error) : ok(r); });
  add('POST', '/api/voice/sessions/:id/utterance', async ({ params, body }) => { const r = await voice.utterance(params[0], body.text); if (r.error) return fail(400, r.error); events.publish('voice', { sessionId: params[0], state: r.state }); return ok(r); });
  add('POST', '/api/voice/sessions/:id/silence', async ({ params }) => { const r = await voice.silence(params[0]); return r.error ? fail(404, r.error) : ok(r); });
  add('POST', '/api/voice/sessions/:id/end', async ({ params, body }) => { const r = await voice.end(params[0], body || {}); if (r.error) return fail(404, r.error); events.publish('voice', { sessionId: params[0], state: 'ended' }); return ok(r); });

  add('GET', '/api/tools', async () => ({ body: tools.tools.map((t) => ({ name: t.name, description: t.description, tier: t.tier, schema: t.schema })) }));
  add('GET', '/api/conversations', async () => ({ body: await agent.listConversations() }));
  add('POST', '/api/conversations', async ({ body }) => ok(await agent.createConversation(body?.title), 201));
  add('GET', '/api/conversations/:id', async ({ params }) => { const c = await agent.getConversation(params[0]); return c ? ok(c) : fail(404, 'Thread not found.'); });
  add('DELETE', '/api/conversations/:id', async ({ params, query }) => { if (query.get('confirm') !== 'true') return fail(400, 'Deleting a thread requires confirm=true.'); await agent.clearConversation(params[0]); return ok({ ok: true }); });
  add('POST', '/api/agent/run', async ({ body }) => {
    if (agentRateLimited()) return fail(429, 'Slow down — one instruction at a time.');
    const text = str(body.text, 6000);
    if (!text) return fail(400, 'Type an instruction first.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(60000, getSettings().llm.requestTimeoutMs * 3));
    timeouts.set(controller, timeout);
    try {
      const r = await agent.runTurn({ conversationId: str(body.conversationId, 60) || undefined, text, signal: controller.signal, origin: 'operator', autoApprove: false });
      if (r.error) return fail(400, r.error);
      return ok(r);
    } catch (e) {
      return fail(500, `The agent run failed: ${str(e.message, 200)}`);
    } finally {
      clearTimeout(timeout);
      timeouts.delete(controller);
    }
  });
  add('POST', '/api/agent/goal', async ({ body }) => {
    const r = await queue.enqueue({ kind: 'agent_goal', title: str(body.title || body.goal, 200), payload: { goal: str(body.goal, 4000), context: body.context || {} }, customerId: str(body.customerId, 60), createdBy: 'operator', maxAttempts: 1 });
    return r.error ? fail(400, r.error) : ok(r, 201);
  });
  add('POST', '/api/agent/stop', async ({ body }) => {
    const controller = [...timeouts.keys()].pop();
    if (body.taskId) await queue.cancel(body.taskId, 'Stopped by the operator');
    if (controller) controller.abort();
    return ok({ stopped: !!controller || !!body.taskId, note: 'A model reply already delivered cannot be recalled.' });
  });

  add('GET', '/api/tasks', async ({ query }) => ({ body: { counts: await queue.counts(), tasks: await queue.list({ status: query.get('status') || 'active', kind: query.get('kind') || '', campaignId: query.get('campaignId') || '', limit: +(query.get('limit') || 100) }) } }));
  add('POST', '/api/tasks', async ({ body }) => {
    const r = await queue.enqueue({ ...body, createdBy: 'operator' });
    return r.error ? fail(400, r.error) : ok(r, 201);
  });
  add('GET', '/api/tasks/:id', async ({ params }) => { const t = await queue.get(params[0]); return t ? ok(t) : fail(404, 'Task not found.'); });
  for (const action of ['cancel', 'pause', 'resume', 'retry']) {
    add('POST', `/api/tasks/:id/${action}`, async ({ params }) => {
      const fn = { cancel: queue.cancel, pause: queue.pause, resume: queue.resume, retry: queue.retry }[action];
      const r = await fn(params[0], `Operator ${action}ed this task`);
      return r.error ? fail(400, r.error) : ok(r);
    });
  }

  add('GET', '/api/approvals', async () => ({ body: (await store.read('approvals')).filter((a) => !a.decision).slice(0, 50) }));
  add('POST', '/api/approvals/:id/decide', async ({ params, body }) => {
    const decision = body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : null;
    if (!decision) return fail(400, 'decision must be approve or reject');
    const r = await queue.approve(params[0], decision, str(body.note, 400));
    return r.error ? fail(404, r.error) : ok(r);
  });

  add('GET', '/api/campaigns', async () => ({ body: await campaigns.withProgress() }));
  add('POST', '/api/campaigns', async ({ body }) => { const r = await campaigns.create(body, 'operator'); return r.error ? fail(400, r.error) : ok(r, 201); });
  add('GET', '/api/campaigns/:id', async ({ params }) => { const r = await campaigns.report(params[0]); return r.error ? fail(404, r.error) : ok(r); });
  add('PUT', '/api/campaigns/:id', async ({ params, body }) => { const r = await campaigns.update(params[0], body); return r.error ? fail(400, r.error) : ok(r); });
  for (const action of ['start', 'pause', 'resume', 'stop']) {
    add('POST', `/api/campaigns/:id/${action}`, async ({ params }) => {
      const r = action === 'start' ? await campaigns.start(params[0], 'operator') : await campaigns.control(params[0], action);
      return r.error ? fail(400, r.error) : ok(r);
    });
  }

  add('POST', '/api/webhooks/elevenlabs', async ({ body, req, rawBody }) => {
    const secret = str(env.DR53_WEBHOOK_SECRET, 200);
    if (!secret) return fail(503, 'Webhook receiver is disabled until DR53_WEBHOOK_SECRET is configured.');
    const signature = str(req.headers['elevenlabs-signature'], 1000);
    if (!verifyElevenLabsSignature(rawBody, signature, secret)) return fail(401, 'Invalid or expired ElevenLabs webhook signature.');
    const r = await outbound.ingestProviderEvent(body);
    return r.error ? fail(404, r.error) : ok(r);
  });

  /* -------------------------------------------------------------- auth plumbing */

  const loginFailures = new Map();
  const timeouts = new Map();
  const agentCalls = [];
  function loginAttempts(req) { const key = req.socket.remoteAddress || 'x'; const entry = loginFailures.get(key); return entry && Date.now() - entry.at < 60000 ? entry.count : 0; }
  function recordLoginFailure(req) { const key = req.socket.remoteAddress || 'x'; const entry = loginFailures.get(key) || { count: 0, at: 0 }; loginFailures.set(key, { count: entry.count + 1, at: Date.now() }); }
  function agentRateLimited() { const now = Date.now(); while (agentCalls.length && now - agentCalls[0] > 10000) agentCalls.shift(); if (agentCalls.length >= 4) return true; agentCalls.push(now); return false; }
  function timingEqual(a, b) {
    const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
    if (x.length !== y.length) return false;
    return crypto.timingSafeEqual(x, y);
  }
  function sessionSecret() {
    const file = path.join(dataDir, '.session-secret');
    if (env.DR53_SESSION_SECRET) return str(env.DR53_SESSION_SECRET, 200);
    try { if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim(); } catch { /* regenerate */ }
    const secret = crypto.randomBytes(32).toString('hex');
    try { fs.writeFileSync(file, secret, { mode: 0o600 }); } catch { /* in-memory only */ }
    return secret;
  }
  function readCookies(req) {
    return Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => {
      const idx = part.indexOf('=');
      return idx < 0 ? [] : [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
    }).filter((p) => p[0]));
  }
  function expectedSession() {
    const expected = str(env.DR53_ACCESS_TOKEN, 200);
    if (!expected) return null;
    return crypto.createHmac('sha256', sessionSecret()).update(expected).digest('hex').slice(0, 48);
  }
  function cookieValid(req, query) {
    const required = expectedSession();
    if (required === null) return true;
    const supplied = readCookies(req).dr53_session || str(query?.get?.('t') || '', 80);
    return !!supplied && timingEqual(supplied, required);
  }
  function checkAuth(req, url) { return cookieValid(req, url.searchParams); }

  /* ------------------------------------------------------------ static files */

  const PUB = path.join(__dirname, '..', 'public');
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
  const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

  function serveStatic(req, res, url) {
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.normalize(path.join(PUB, rel));
    if (!file.startsWith(PUB + path.sep) && file !== path.join(PUB, 'index.html')) return respond(res, 404, 'Not found', 'text/plain; charset=utf-8');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return respond(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
    res.end(body);
  }

  function respond(res, status, body, type = 'application/json; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  }

  /* -------------------------------------------------------------- the server */

  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); } catch { return respond(res, 400, { error: 'Bad request.' }); }
    const host = String(req.headers.host || '').split(':')[0];
    if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) return respond(res, 403, JSON.stringify({ error: 'This app only serves requests addressed to localhost.' }), 'application/json; charset=utf-8');

    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);

    const tts = url.pathname.match(/^\/api\/voice\/sessions\/([\w-]+)\/tts$/);
    if (tts) {
      if (!checkAuth(req, url)) return respond(res, 401, { error: 'Not authenticated.' });
      const file = voice.ttsFile(url.searchParams.get('file'));
      if (!file) return respond(res, 404, { error: 'No Mac speech audio for this line; the browser speech engine will speak instead.' });
      res.writeHead(200, { 'Content-Type': 'audio/mp4', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return fs.createReadStream(file).pipe(res);
    }

    if (url.pathname === '/api/events') {
      if (!checkAuth(req, url)) return respond(res, 401, { error: 'Enter the access token first.' });
      return events.subscribe(req, res);
    }
    const isPublic = ['/api/health', '/api/session', '/api/login'].includes(url.pathname) || url.pathname.startsWith('/api/webhooks/');
    if (!isPublic && !checkAuth(req, url)) return respond(res, 401, { error: 'This app is protected by an access token. Open the dashboard and enter it.' });
    if (!isPublic && req.method !== 'GET' && req.headers['x-dr53'] !== '1') return respond(res, 403, { error: 'Missing CSRF header.' });
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return respond(res, 405, { error: 'Method not allowed.' });

    let body = {};
    let rawBody = '';
    if (req.method !== 'GET') {
      for await (const chunk of req) { rawBody += chunk; if (rawBody.length > 800000) return respond(res, 413, { error: 'Request body too large (800 KB limit).' }); }
      if (rawBody) { try { body = JSON.parse(rawBody); } catch { return respond(res, 400, { error: 'Malformed JSON body.' }); } }
    }

    for (const route of routes) {
      if (route.method !== req.method) continue;
      const match = url.pathname.match(route.re);
      if (!match) continue;
      const params = match.slice(1).map(decodeURIComponent);
      try {
        const out = await route.handler({ body, rawBody, params, query: url.searchParams, req, res });
        if (out.raw !== undefined) return respond(res, out.status || 200, out.raw, (out.type || 'application/json') + '; charset=utf-8');
        if (out.file) {
          const data = fs.readFileSync(out.file);
          res.writeHead(200, { 'Content-Type': out.type || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${path.basename(out.file)}"` });
          return res.end(data);
        }
        return respond(res, out.status || 200, out.body === undefined ? { ok: true } : out.body);
      } catch (e) {
        reports.log('error', 'request', `${req.method} ${url.pathname}: ${str(e.message, 200)}`);
        return respond(res, 500, { error: 'Internal error. Check Logs & Diagnostics.' });
      }
    }
    respond(res, 404, { error: `No endpoint for ${req.method} ${url.pathname}.` });
  });

  server.on('close', () => { events.close(); if (callbackReminderTimer) clearInterval(callbackReminderTimer); callbackReminderTimer = null; for (const t of timeouts.keys()) t.abort(); });

  async function init() {
    if (!fs.existsSync(path.join(dataDir, 'settings.json'))) await persistSettings(normaliseSettings(DEFAULT_SETTINGS));
    else reloadSettings();
    const products = await store.read('products');
    if (!products.length) await store.update('products', () => JSON.parse(JSON.stringify(DEFAULT_PRODUCTS)));
    await queue.recoverLeases();
    return true;
  }

  function boot() {
    queue.start();
    events.start();
    if (!callbackReminderTimer) {
      checkDueCallbacks().catch((e) => log('notification', `Callback reminder check failed: ${str(e.message, 160)}`));
      callbackReminderTimer = setInterval(() => checkDueCallbacks().catch((e) => log('notification', `Callback reminder check failed: ${str(e.message, 160)}`)), 60000);
      callbackReminderTimer.unref?.();
    }
    return server;
  }

  return {
    server, init, boot, store, events, queue, agent, tools, crm, voice, outbound, campaigns, llm, reports, getSettings,
    services, executeTask, reloadSettings, persistSettings, setSetting, log, notify, audit,
    listen: (port, host = '127.0.0.1') => new Promise((resolve) => server.listen(port, host, () => resolve(server))),
  };
}

module.exports = { createApp, loadLocalEnv, runCommand, verifyElevenLabsSignature, ACTIVE_TASKS };
