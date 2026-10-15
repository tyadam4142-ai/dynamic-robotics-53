'use strict';
const { str, validate, normalizePhone, fmtIst, id, nowIso } = require('./util');
const { integrationStatus } = require('./config');

const S = (props, required = []) => ({ type: 'object', properties: props, required });
const text = (description, maxLength = 400) => ({ type: 'string', description, maxLength });
const optText = (description, maxLength = 400) => ({ type: 'string', description, maxLength });
const int = (description, minimum = 0, maximum = 1000) => ({ type: 'integer', description, minimum, maximum });

/**
 * Every tool is: short description, strict input schema, permission tier, real handler.
 * Handlers return { ok, data, summary } or { ok:false, error } — never a fake success.
 */
function createTools(services) {
  const { crm, outbound, voice, queue, campaigns, store, log, getSettings, llm, reports } = services;

  const registry = [];
  const add = (tool) => { registry.push(tool); return tool; };

  add({
    name: 'search_products', tier: 'read',
    description: 'Search the approved DR53 product catalogue for verified descriptions, listed prices and explicit unknowns. Use this for product questions; do not use CRM customer tools to answer product questions.',
    schema: S({ q: optText('product name or keywords', 200), limit: int('maximum products to return', 1, 20) }),
    async handler(args) {
      const query = str(args.q, 200).toLowerCase();
      const terms = query.split(/\s+/).filter(Boolean);
      const limit = args.limit || 10;
      const products = (await store.read('products'))
        .filter((product) => product.active !== false)
        .filter((product) => {
          const name = String(product.name || '').toLowerCase();
          const content = `${name} ${product.description || ''}`.toLowerCase();
          return !terms.length || name.includes(query) || terms.every((term) => content.includes(term));
        })
        .slice(0, limit)
        .map(({ id, name, price, priceType, description }) => ({ id, name, price, priceType, description }));
      return {
        ok: true,
        summary: products.length ? `Found ${products.length} approved product record(s).` : 'No approved product matched those terms.',
        data: { products },
      };
    },
  });

  /* -------------------------------------------------------------------- CRM */

  add({
    name: 'search_customers', tier: 'read',
    description: 'Find CRM customers. Returns name, id, phone, status, score, next follow-up.',
    schema: S({ q: optText('name, phone, email, company or free text'), status: optText('one of the CRM statuses', 40), tag: optText('tag', 40), channel: optText('call|whatsapp|sms|any', 20), onlyWithPhone: { type: 'boolean', description: 'only rows that have a phone number' }, sort: optText('score|name|created|lastContact|followUp', 20), limit: int('rows to return', 1, 100) }),
    async handler(args) {
      const r = await crm.query({ ...args, limit: args.limit || 20 });
      return { ok: true, summary: `${r.total} customer(s) matched, showing ${r.rows.length}.`, data: { total: r.total, rows: r.rows.map(publicRow), statuses: r.statuses } };
    },
  });

  add({
    name: 'get_customer', tier: 'read',
    description: 'Read one customer plus their recent activity timeline. Accepts a customer id or a phone number.',
    schema: S({ customerId: optText('customer id', 60), phone: optText('phone number', 30) }),
    async handler(args) {
      let c = args.customerId ? await crm.get(args.customerId) : null;
      if (!c && args.phone) { const n = normalizePhone(args.phone); if (n.error) return { ok: false, error: n.error }; c = (await crm.list()).find((x) => x.phone === n.phone); }
      if (!c) return { ok: false, error: 'No matching customer was found. Search first.' };
      const timeline = await crm.timeline(c.id, 15);
      return { ok: true, summary: `${c.name} — ${c.status}${c.phone ? ` (${c.phone})` : ''}.`, data: { customer: publicRow(c), timeline: timeline.map((a) => ({ at: a.at, type: a.type, text: a.text })) } };
    },
  });

  add({
    name: 'create_customer', tier: 'write',
    description: 'Add a new lead. Never invent a phone number — use what the user gave you.',
    schema: S({ name: text('full name', 120), phone: optText('E.164 or 10-digit Indian mobile', 30), email: optText('email', 120), company: optText('company', 120), source: optText('where the lead came from', 60), product: optText('product interest', 120), status: optText('CRM status', 40), tags: { type: 'array', items: { type: 'string' }, description: 'up to 10 tags', maxItems: 10 }, notes: optText('notes', 2000), consentApproved: { type: 'boolean', description: 'true only if the customer agreed to be contacted' }, consentEvidence: optText('how consent was given', 200) }, ['name']),
    async handler(args) {
      const input = { ...args, consent: { contactApproved: !!args.consentApproved, channels: [], optOut: false, evidence: args.consentEvidence || '' } };
      delete input.consentApproved; delete input.consentEvidence;
      const r = await crm.create(input);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `Saved ${r.name} (id ${r.id}).`, data: { customer: publicRow(r) } };
    },
  });

  add({
    name: 'update_customer', tier: 'write',
    description: 'Change fields on an existing customer (status, notes, tags, interest level, follow-up date, consent, product, company, source).',
    schema: S({ customerId: text('customer id', 60), status: optText('CRM status', 40), notes: optText('notes', 4000), tags: { type: 'array', items: { type: 'string' }, maxItems: 25 }, interestLevel: int('0 to 5', 0, 5), nextFollowUpAt: optText('ISO date-time', 40), product: optText('product interest', 120), company: optText('company', 120), source: optText('lead source', 60), preferredChannel: optText('any|call|whatsapp|sms', 20), consentApproved: { type: 'boolean' }, optOut: { type: 'boolean', description: 'true stops all future contact' } }, ['customerId']),
    async handler(args) {
      const patch = { ...args };
      delete patch.customerId;
      if (args.consentApproved !== undefined || args.optOut !== undefined) {
        const existing = await crm.get(args.customerId);
        if (!existing) return { ok: false, error: 'Customer not found.' };
        patch.consent = { ...(existing.consent || {}), contactApproved: args.consentApproved ?? existing.consent?.contactApproved ?? false, optOut: args.optOut ?? existing.consent?.optOut ?? false };
        delete patch.consentApproved; delete patch.optOut;
      }
      const r = await crm.update(args.customerId, patch);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `Updated ${r.name}.`, data: { customer: publicRow(r) } };
    },
  });

  add({
    name: 'add_note', tier: 'write',
    description: 'Append a timestamped note to a customer record.',
    schema: S({ customerId: text('customer id', 60), text: text('note body', 2000) }, ['customerId', 'text']),
    async handler(args) {
      const r = await crm.note(args.customerId, args.text);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: 'Note added.', data: { customer: publicRow(r) } };
    },
  });

  add({
    name: 'schedule_followup', tier: 'write',
    description: 'Create a follow-up task for a customer and set their next follow-up date.',
    schema: S({ customerId: optText('customer id', 60), title: text('what to do', 200), due: optText('ISO date-time, e.g. 2026-10-16T11:00:00+05:30', 40), priority: optText('low|medium|high', 12), notes: optText('details', 1000) }, ['title']),
    async handler(args) {
      const r = await crm.addFollowup({ ...args, source: 'agent' }, 'agent');
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `Follow-up "${r.title}" saved${r.due ? ` for ${fmtIst(r.due)}` : ''}.`, data: { followup: r } };
    },
  });

  add({
    name: 'complete_followup', tier: 'write',
    description: 'Mark a follow-up task as done.',
    schema: S({ followupId: text('follow-up id', 60) }, ['followupId']),
    async handler(args) {
      const r = await crm.completeFollowup(args.followupId);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `Completed "${r.title}".`, data: { followup: r } };
    },
  });

  add({
    name: 'list_followups', tier: 'read',
    description: 'List open follow-ups and scheduled callbacks.',
    schema: S({ limit: int('rows', 1, 100) }),
    async handler(args) {
      const r = await crm.upcoming(args.limit || 30);
      return { ok: true, summary: `${r.followups.length} open follow-up(s), ${r.callbacks.length} scheduled callback(s).`, data: r };
    },
  });

  add({
    name: 'prioritize_leads', tier: 'read',
    description: 'Rank leads most worth contacting now, with the reason for each score.',
    schema: S({ limit: int('rows', 1, 50) }),
    async handler(args) {
      const rows = await crm.list();
      const ranked = rows.map((c) => ({ c, s: crm.scoreLead(c) })).sort((a, b) => b.s - a.s).slice(0, args.limit || 10);
      return {
        ok: true, summary: `${ranked.length} ranked lead(s).`,
        data: { leads: ranked.map(({ c, s }) => ({ id: c.id, name: c.name, phone: c.phone, status: c.status, score: s, reason: reasonFor(c, s) })) },
      };
    },
  });

  add({
    name: 'opt_out_customer', tier: 'consequential',
    description: 'Record that a customer demanded no further contact. Blocks every outbound channel for them.',
    schema: S({ customerId: text('customer id', 60), reason: text('what they said', 300) }, ['customerId', 'reason']),
    async handler(args) {
      const r = await crm.optOut(args.customerId, args.reason);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `${r.name} is now opted out of all contact.`, data: { customer: publicRow(r) } };
    },
  });

  add({
    name: 'delete_customer', tier: 'consequential',
    description: 'Permanently delete a customer record. Needs confirm=true.',
    schema: S({ customerId: text('customer id', 60), confirm: { type: 'boolean', description: 'must be true' } }, ['customerId', 'confirm']),
    async handler(args) {
      if (args.confirm !== true) return { ok: false, error: 'Deletion needs confirm=true.' };
      const r = await crm.remove(args.customerId);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `Deleted ${r.name}.`, data: r };
    },
  });

  /* ---------------------------------------------------------------- calling */

  add({
    name: 'check_calling_setup', tier: 'read',
    description: 'Report which calling and messaging modes are configured and usable right now.',
    schema: S({}),
    async handler() {
      const p = outbound.providers();
      return { ok: true, summary: describeProviders(p), data: p };
    },
  });

  add({
    name: 'check_call_eligibility', tier: 'read',
    description: 'Check whether one customer may legally be called or messaged right now (consent, opt-out, status, number).',
    schema: S({ customerId: optText('customer id', 60), phone: optText('phone number', 30), channel: optText('call|whatsapp|sms', 20) }, []),
    async handler(args) {
      const r = await crm.eligibility(args.customerId || args.phone, args.channel || 'call');
      return { ok: true, summary: r.ok ? `${r.customer?.name || args.customerId} is eligible: ${r.reason}` : `BLOCKED — ${r.reason}`, data: r };
    },
  });

  add({
    name: 'open_native_call', tier: 'consequential',
    description: 'Open the Mac dialer for a number. The operator still places the call; the AI cannot hear or speak on it.',
    schema: S({ customerId: optText('customer id', 60), phone: optText('number if no customer id', 30), purpose: optText('why you are calling', 300), operatorConfirmed: { type: 'boolean', description: 'true only when the operator explicitly approved contacting this person' } }),
    async handler(args) {
      const c = args.customerId ? await crm.get(args.customerId) : null;
      const phone = args.phone || c?.phone || '';
      const gate = await crm.eligibility(args.customerId || phone, 'call');
      const hardBlock = gate.optOut || /Not Interested|opted out|only agreed to/i.test(gate.reason || '');
      if (!gate.ok && (hardBlock || !args.operatorConfirmed)) return { ok: false, error: hardBlock ? gate.reason : `${gate.reason} Set operatorConfirmed=true only if the operator has already confirmed consent.` };
      const r = await outbound.nativeDial({ phone, customerId: c?.id || '', customerName: c?.name || '', purpose: args.purpose || '', source: 'agent' });
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: r.message, data: r.call };
    },
  });

  add({
    name: 'start_ai_voice_call', tier: 'consequential',
    description: 'Start an AI voice conversation. mode="provider" needs ElevenLabs+Twilio credentials and gives real two-way phone audio; mode="local" creates a Mac browser-assist session you must join on an answered call.',
    schema: S({ customerId: optText('customer id', 60), phone: optText('number if no customer id', 30), purpose: optText('purpose', 300), productInterest: optText('product', 150), mode: text('provider|local', 20), operatorConfirmed: { type: 'boolean' } }, ['mode']),
    async handler(args) {
      const settings = getSettings();
      const mode = args.mode === 'provider' ? 'provider' : 'local';
      const phone = args.phone || (args.customerId ? (await crm.get(args.customerId))?.phone : '') || '';
      const r = await voice.start({ customerId: args.customerId || '', phone, purpose: args.purpose || 'follow up', productInterest: args.productInterest || '', mode, operatorConfirmed: !!args.operatorConfirmed, source: 'agent' });
      if (r.error) return { ok: false, error: r.error };
      const s = r.session;
      return {
        ok: true,
        summary: mode === 'provider'
          ? `Provider call requested for ${s.customerName || s.phone} (session ${s.id}).`
          : `Local voice session ${s.id} is ready for ${s.customerName || s.phone}. It only hears the customer if their voice reaches the Mac microphone.`,
        data: { session: s, openingLine: s.opening, tts: r.tts, callingWindow: `${settings.calling.windowStartHour}:00-${settings.calling.windowEndHour}:00 IST` },
      };
    },
  });

  add({
    name: 'get_call_status', tier: 'read',
    description: 'Read one call record, syncing the provider for live AI calls when credentials exist.',
    schema: S({ callId: text('call id', 60) }, ['callId']),
    async handler(args) {
      const rows = await store.read('calls');
      const c = rows.find((x) => x.id === args.callId);
      if (!c) return { ok: false, error: 'Call not found.' };
      if (c.kind === 'ai_voice_call' && c.conversationId) { const synced = await outbound.fetchProviderCall(c.id); if (synced.error) return { ok: true, summary: `Local record: ${c.status}. Provider sync failed: ${synced.error}`, data: c }; return { ok: true, summary: `Status: ${(synced.call || c).status}`, data: synced.call }; }
      if (c.voiceSessionId) { const s = await voice.get(c.voiceSessionId); return { ok: true, summary: `Voice session state: ${s?.state || 'unknown'} after ${s?.turn || 0} turn(s).`, data: { call: c, session: s } }; }
      return { ok: true, summary: `Native dial: ${c.status}${c.outcome ? `, outcome ${c.outcome}` : ''}.`, data: c };
    },
  });

  add({
    name: 'list_calls', tier: 'read',
    description: 'Recent call records, newest first.',
    schema: S({ limit: int('rows', 1, 100), customerId: optText('filter by customer', 60), kind: optText('native_dial|ai_voice_call|local_voice_assist', 30) }),
    async handler(args) {
      const rows = await outbound.listCalls({ limit: args.limit || 20, customerId: args.customerId || '', kind: args.kind || '' });
      return { ok: true, summary: `${rows.length} call record(s).`, data: { calls: rows.map((c) => ({ id: c.id, kind: c.kind, name: c.customerName, phone: c.phone, status: c.status, outcome: c.outcome, at: c.startedAt || c.createdAt })) } };
    },
  });

  add({
    name: 'record_call_outcome', tier: 'write',
    description: 'Store how a call went and optionally schedule the next step.',
    schema: S({ callId: optText('call id', 60), customerId: optText('customer id', 60), outcome: text('answered|no_answer|busy|callback_requested|not_interested|wrong_number|voicemail|completed|failed|cancelled|hot_lead|interested|callback_booked', 40), notes: optText('notes', 2000), summary: optText('what happened', 2000), nextFollowUpAt: optText('ISO date-time', 40), tags: { type: 'array', items: { type: 'string' }, maxItems: 10 } }, ['outcome']),
    async handler(args) {
      const r = await outbound.recordOutcome(args);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `Recorded outcome "${args.outcome}".`, data: r };
    },
  });

  add({
    name: 'cancel_pending_calls', tier: 'consequential',
    description: 'Cancel queued call tasks (optionally for one campaign).',
    schema: S({ campaignId: optText('campaign id', 60), customerId: optText('customer id', 60), reason: optText('why', 200) }),
    async handler(args) {
      const rows = await queue.list({ status: 'active', kind: 'call', limit: 2000 });
      const targets = rows.filter((t) => (!args.campaignId || t.campaignId === args.campaignId) && (!args.customerId || t.customerId === args.customerId));
      let cancelled = 0;
      for (const t of targets) { const r = await queue.cancel(t.id, args.reason || 'Cancelled by the agent at the operator request'); if (r.task) cancelled++; }
      return { ok: true, summary: `${cancelled} queued call task(s) cancelled.`, data: { cancelled } };
    },
  });

  /* -------------------------------------------------------------- messaging */

  add({
    name: 'draft_message', tier: 'read',
    description: 'Save a message draft against a customer. Nothing is sent.',
    schema: S({ customerId: text('customer id', 60), channel: text('whatsapp|sms', 20), message: text('draft body', 1600) }, ['customerId', 'channel', 'message']),
    async handler(args) {
      const c = await crm.get(args.customerId);
      if (!c) return { ok: false, error: 'Customer not found.' };
      const r = await outbound.send({ channel: args.channel, phone: c.phone, message: args.message, customerId: c.id, customerName: c.name, draftOnly: true, source: 'agent' });
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `Draft saved (id ${r.messageRecord.id}). Not sent.`, data: r.messageRecord };
    },
  });

  add({
    name: 'send_message', tier: 'consequential',
    description: 'Send an SMS or WhatsApp message through Twilio. Requires configured credentials and recorded consent.',
    schema: S({ customerId: text('customer id', 60), channel: text('whatsapp|sms', 20), message: text('body', 1600), consentConfirmed: { type: 'boolean' }, messageId: optText('send an existing draft instead of new text', 60) }, ['customerId', 'channel']),
    async handler(args) {
      const c = await crm.get(args.customerId);
      if (!c) return { ok: false, error: 'Customer not found.' };
      const gate = await crm.eligibility(c.id, args.channel);
      if (!gate.ok) return { ok: false, error: gate.reason };
      let body = args.message || '';
      if (args.messageId) {
        const draft = (await store.read('messages')).find((m) => m.id === args.messageId);
        if (!draft) return { ok: false, error: 'That draft does not exist.' };
        body = draft.message;
      }
      if (!body) return { ok: false, error: 'No message text — write it or pass a draft id.' };
      const r = await outbound.send({ channel: args.channel, phone: c.phone, message: body, customerId: c.id, customerName: c.name, consentConfirmed: args.consentConfirmed === true || c.consent?.contactApproved === true, source: 'agent', idempotencyKey: args.messageId ? `resend:${args.messageId}` : '' });
      if (r.error) return { ok: false, error: r.error };
      return { ok: r.messageRecord.status !== 'failed', summary: r.message, data: r.messageRecord };
    },
  });

  add({
    name: 'message_status', tier: 'read',
    description: 'Check delivery for one message, or refresh every unfinished one.',
    schema: S({ messageId: optText('message id', 60) }),
    async handler(args) {
      if (args.messageId) { const r = await outbound.syncStatus(args.messageId); return r.error ? { ok: false, error: r.error } : { ok: true, summary: `Status: ${r.messageRecord.status}`, data: r.messageRecord }; }
      const r = await outbound.syncAllPending();
      return { ok: true, summary: `${r.checked} message(s) refreshed.`, data: r };
    },
  });

  add({
    name: 'message_history', tier: 'read',
    description: 'Message threads recorded for a customer (drafts, sends, delivery states).',
    schema: S({ customerId: text('customer id', 60), limit: int('rows', 1, 100) }),
    async handler(args) {
      const rows = (await store.read('messages')).filter((m) => m.customerId === args.customerId).slice(0, args.limit || 20);
      return { ok: true, summary: `${rows.length} message(s).`, data: { messages: rows.map((m) => ({ id: m.id, channel: m.channel, status: m.status, at: m.createdAt, text: m.message.slice(0, 160) })) } };
    },
  });

  /* ----------------------------------------------------------- tasks + plans */

  add({
    name: 'create_task', tier: 'write',
    description: 'Queue background work the agent should perform later or now: kinds are call, message, followup, agent_goal (a goal you want executed step by step).',
    schema: S({ kind: text('call|message|followup|agent_goal|reminder', 20), title: text('short title', 200), customerId: optText('customer id', 60), runAfter: optText('ISO date-time', 40), payload: { type: 'object', description: 'kind-specific fields: goal / message / channel / phone / notes', properties: { goal: optText('objective text', 2000), message: optText('message body', 1600), channel: optText('whatsapp|sms', 20), notes: optText('notes', 1000) } }, priority: optText('low|normal|high', 12) }, ['kind', 'title']),
    async handler(args) {
      const r = await queue.enqueue({ kind: args.kind, title: args.title, customerId: args.customerId || '', payload: args.payload || {}, runAfter: args.runAfter || null, priority: args.priority || 'normal', createdBy: 'agent', maxAttempts: args.kind === 'call' ? getSettings().calling.maxAttemptsPerContact : 1 });
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: r.duplicate ? `Already queued: ${r.message}` : `Queued task ${r.task.id} (${args.kind}).`, data: r.task };
    },
  });

  add({
    name: 'list_tasks', tier: 'read',
    description: 'Inspect the task queue by status.',
    schema: S({ status: optText('pending|running|completed|failed|cancelled|awaiting_approval|needs_review|paused|active', 30), limit: int('rows', 1, 100) }),
    async handler(args) {
      const rows = await queue.list({ status: args.status || 'active', limit: args.limit || 25 });
      const counts = await queue.counts();
      return { ok: true, summary: `${rows.length} task(s); by status ${JSON.stringify(counts.byStatus)}.`, data: { counts, tasks: rows.map((t) => ({ id: t.id, kind: t.kind, title: t.title, status: t.status, attempts: `${t.attempts}/${t.maxAttempts}`, runAfter: t.runAfter, error: t.error })) } };
    },
  });

  add({
    name: 'control_task', tier: 'write',
    description: 'Cancel, pause, resume or retry a queued task.',
    schema: S({ taskId: text('task id', 60), action: text('cancel|pause|resume|retry', 12) }, ['taskId', 'action']),
    async handler(args) {
      const map = { cancel: queue.cancel, pause: queue.pause, resume: queue.resume, retry: queue.retry };
      const fn = map[args.action];
      if (!fn) return { ok: false, error: 'Action must be cancel, pause, resume or retry.' };
      const r = await fn(args.taskId, 'Requested by the agent at operator instruction');
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `Task ${args.taskId} is now ${r.task ? r.task.status : args.action}ed.`, data: r.task };
    },
  });

  add({
    name: 'create_campaign', tier: 'consequential',
    description: 'Draft a campaign for a filtered or explicit contact list. Does not start it.',
    schema: S({ name: text('campaign name', 120), objective: text('what the agent should achieve', 400), channel: text('call|whatsapp|sms|agent', 20), customerIds: { type: 'array', items: { type: 'string' }, maxItems: 500 }, filters: { type: 'object', properties: { status: optText('CRM status', 40), tag: optText('tag', 40), q: optText('text', 80), onlyWithPhone: { type: 'boolean' } } }, openingLine: optText('approved opening line', 1200), guidelines: optText('sales guidelines', 2000), messageTemplate: optText('template with {name} {product}', 1600), maxAttempts: int('per contact', 1, 5), spreadMinutes: int('spread the queue over N minutes', 0, 600) }, ['name', 'objective', 'channel']),
    async handler(args) {
      const r = await campaigns.create(args, 'agent');
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `Campaign "${r.campaign.name}" drafted for ${r.eligible} contact(s), ${r.blocked} blocked${r.needsApproval ? '. Approval is required before it starts.' : '.'}`, data: r };
    },
  });

  add({
    name: 'control_campaign', tier: 'consequential',
    description: 'Start, pause, resume or stop a campaign.',
    schema: S({ campaignId: text('campaign id', 60), action: text('start|pause|resume|stop', 12) }, ['campaignId', 'action']),
    async handler(args) {
      const r = args.action === 'start' ? await campaigns.start(args.campaignId, 'agent') : await campaigns.control(args.campaignId, args.action);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `Campaign ${r.campaign.name}: ${r.campaign.status}${r.queued !== undefined ? ` (${r.queued} queued)` : ''}.`, data: r };
    },
  });

  add({
    name: 'campaign_report', tier: 'read',
    description: 'Progress, outcomes and per-contact state for a campaign.',
    schema: S({ campaignId: optText('id; omit to list all campaigns', 60) }),
    async handler(args) {
      if (!args.campaignId) { const rows = await campaigns.withProgress(); return { ok: true, summary: `${rows.length} campaign(s).`, data: { campaigns: rows.map((c) => ({ id: c.id, name: c.name, status: c.status, channel: c.channel, progress: c.progress })) } }; }
      const r = await campaigns.report(args.campaignId);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `${r.campaign.name}: ${r.campaign.progress.completed}/${r.campaign.progress.total} done.`, data: r };
    },
  });

  add({
    name: 'summarise_activity', tier: 'read',
    description: 'Build a report over a period: calls, messages, leads by status, promising leads and blockers.',
    schema: S({ scope: optText('today|week|all', 12) }),
    async handler(args) {
      const r = await reports.summary(args.scope || 'today');
      return { ok: true, summary: r.headline, data: r };
    },
  });

  add({
    name: 'book_callback', tier: 'write',
    description: 'Schedule a callback inside the configured window (IST).',
    schema: S({ customerId: optText('customer id', 60), customerName: optText('name if no id', 120), date: text('YYYY-MM-DD', 12), time: text('HH:MM 24-hour IST', 8), reason: text('reason', 300), notes: optText('notes', 1000) }, ['date', 'time', 'reason']),
    async handler(args) {
      const r = await crm.addCallback(args);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, summary: `Callback booked for ${fmtIst(r.callback.scheduledAt)}.`, data: r.callback };
    },
  });

  /* ----------------------------------------------------------------- system */

  add({
    name: 'check_system_health', tier: 'read',
    description: 'Application health: version, database readability, queue, model, integrations.',
    schema: S({}),
    async handler() {
      const r = await reports.health();
      return { ok: true, summary: r.headline, data: r };
    },
  });

  add({
    name: 'check_model', tier: 'read',
    description: 'Probe each configured AI provider and say which one answers.',
    schema: S({}),
    async handler() {
      const s = await llm.status();
      return { ok: !!s.ready, summary: s.ready ? `${s.activeLabel} is ready.` : `No model is usable: ${s.message}`, data: s };
    },
  });

  add({
    name: 'get_activity_log', tier: 'read',
    description: 'Recent audited actions (customer changes, calls, messages, campaigns, approvals).',
    schema: S({ limit: int('rows', 1, 100), type: optText('customer|call|message|campaign|task|approval|voice|consent', 30) }),
    async handler(args) {
      const rows = await store.read('activities');
      const filtered = rows.filter((a) => !args.type || a.type === args.type).slice(0, args.limit || 25);
      return { ok: true, summary: `${filtered.length} log entries.`, data: { entries: filtered } };
    },
  });

  add({
    name: 'set_kill_switch', tier: 'consequential',
    description: 'Turn the autonomous kill switch on (stops all outbound work) or off. Turning it off needs the operator to press the control in the dashboard.',
    schema: S({ on: { type: 'boolean', description: 'true = stop everything' } }, ['on']),
    async handler(args) {
      if (args.on === false) return { ok: false, error: 'The agent cannot disarm the kill switch. Use Settings → Safety → Kill switch in the dashboard.' };
      await services.setSetting(['agent', 'killSwitch'], true);
      await queue.cancelPending({ reason: 'Kill switch engaged' });
      log('safety', 'Kill switch engaged by the agent: all pending outbound work cancelled');
      return { ok: true, summary: 'Kill switch ON. Pending outbound work cancelled. Only the operator can turn it off.', data: { killSwitch: true } };
    },
  });

  function publicRow(c) {
    if (!c) return null;
    return { id: c.id, name: c.name, phone: c.phone, email: c.email, company: c.company, source: c.source, status: c.status, product: c.product, interestLevel: c.interestLevel ?? null, tags: c.tags || [], preferredChannel: c.preferredChannel, consent: c.consent, lastContactAt: c.lastContactAt, lastCallOutcome: c.lastCallOutcome, lastMessageAt: c.lastMessageAt, nextFollowUpAt: c.nextFollowUpAt, score: c.score ?? crm.scoreLead(c), notes: (c.notes || '').slice(0, 600), createdAt: c.createdAt };
  }

  function reasonFor(c, score) {
    const bits = [];
    if (c.status === 'Interested' || c.status === 'Follow-up Required') bits.push(c.status.toLowerCase());
    if (c.nextFollowUpAt && new Date(c.nextFollowUpAt) <= new Date()) bits.push('follow-up overdue');
    if (!c.lastContactAt) bits.push('never contacted');
    else bits.push(`last contacted ${Math.round((Date.now() - new Date(c.lastContactAt)) / 86400000)}d ago`);
    if (c.consent?.optOut) bits.push('OPTED OUT — do not contact');
    else if (!c.consent?.contactApproved) bits.push('consent not recorded');
    return `score ${score}: ${bits.join(', ')}`;
  }

  function describeProviders(p) {
    const lines = Object.entries(p).map(([k, v]) => `${k}: ${v.ready ? 'ready' : `not configured (${v.missing.join(', ') || 'n/a'})`}`);
    return lines.join('; ');
  }

  const tools = Object.freeze(registry.map((t) => ({ name: t.name, description: t.description, tier: t.tier, schema: t.schema })));

  const OUTBOUND_TOOLS = new Set(['open_native_call', 'start_ai_voice_call', 'send_message']);

  async function execute(name, rawArgs, ctx = {}) {
    const tool = registry.find((t) => t.name === name);
    if (!tool) return { ok: false, error: `Unknown tool "${name}". Available: ${registry.map((t) => t.name).join(', ')}` };
    const v = validate(tool.schema, rawArgs || {}, 'arguments');
    if (!v.ok) return { ok: false, error: `Invalid arguments for ${name}: ${v.error}` };
    if (getSettings().agent.killSwitch && OUTBOUND_TOOLS.has(name)) {
      return { ok: false, error: 'The kill switch is ON, so no outbound action can run. The operator can disarm it in Settings → Safety.' };
    }
    try {
      const result = await tool.handler(v.value, ctx);
      if (result && result.ok) services.audit(name, v.value, result);
      return result;
    } catch (e) {
      return { ok: false, error: `Tool ${name} failed: ${str(e.message, 300)}` };
    }
  }

  /** Actions that must be explicitly approved by the operator before they run. */
  function needsApproval(name, args) {
    const settings = getSettings();
    if (!settings.agent.requireApprovalForConsequential) return null;
    if (name === 'control_campaign' && args.action === 'start') return { reason: 'Starting a campaign sends outbound work to real customers.' };
    if (name === 'start_ai_voice_call') return { reason: 'An AI voice call rings a real customer.' };
    if (name === 'delete_customer') return { reason: 'Deleting a customer record cannot be undone.' };
    return null; // opt-out, cancellation, drafts and single consented messages are gated elsewhere
  }

  return { tools, execute, needsApproval, registry, publicRow };
}

module.exports = { createTools, S, id, nowIso };
