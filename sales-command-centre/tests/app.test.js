'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createApp } = require('../src/app');
const { runtimeConfig } = require('../server');

async function boot(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dr53-test-'));
  const app = createApp(dir, { env: {}, llmFetch: async () => { throw new Error('No model in tests.'); }, ...opts });
  await app.init();
  const server = await app.listen(0, '127.0.0.1');
  app.boot();
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, headers = { 'x-dr53': '1' }) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, body: j, headers: r.headers };
  };
  const close = async () => { app.queue.stop(); app.events.close(); await new Promise((r) => server.close(r)); };
  return { app, call, dir, base, close };
}

const nextDay = (time) => {
  const istNow = new Date(Date.now() + 19800000);
  const d = new Date(istNow.getTime() + 2 * 86400000);
  return { date: d.toISOString().slice(0, 10), time };
};

const consented = { name: 'Asha Patel', phone: '9876543210', email: 'asha@example.com', consent: { contactApproved: true, evidence: 'test consent' } };

test('health, session and static page serving', async () => {
  const a = await boot();
  const h = await a.call('GET', '/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.body.ok, true);
  assert.equal(h.body.version, '0.9.0-local');
  const s = await a.call('GET', '/api/session');
  assert.equal(s.body.authRequired, false);
  assert.equal(s.body.authenticated, true);
  const page = await fetch(a.base + '/');
  const html = await page.text();
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(html, /^<!doctype html>/i);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.ok(!html.includes('<script>'), 'no inline scripts (CSP)');
  const js = await fetch(a.base + '/app.js');
  assert.equal(js.status, 200);
  assert.equal((await fetch(a.base + '/../src/app.js')).status, 404);
  assert.equal((await fetch(a.base + '/%2e%2e/server.js')).status, 404);
  await a.close();
});

test('CSRF header required for non-GET', async () => {
  const a = await boot();
  const r = await a.call('POST', '/api/customers', { name: 'X' }, {});
  assert.equal(r.status, 403);
  await a.close();
});

test('access token auth: 401 without cookie, login sets cookie, logout clears', async () => {
  const a = await boot({ env: { DR53_ACCESS_TOKEN: 'test-token-123' } });
  const denied = await a.call('GET', '/api/customers');
  assert.equal(denied.status, 401);
  const bad = await a.call('POST', '/api/login', { token: 'wrong' });
  assert.equal(bad.status, 401);
  const good = await a.call('POST', '/api/login', { token: 'test-token-123' });
  assert.equal(good.status, 200);
  const cookie = good.headers.get('set-cookie');
  assert.match(cookie, /dr53_session=/);
  assert.match(cookie, /HttpOnly/);
  const okRes = await fetch(a.base + '/api/customers', { headers: { cookie: cookie.split(';')[0] } });
  assert.equal(okRes.status, 200);
  await a.close();
});

test('quick-save persists new call contacts without firing new-lead automation', async () => {
  const a = await boot();
  const saved = await a.call('POST', '/api/customers/quick-save', {
    name: 'Call Lead', phone: '9876543212', product: 'Tap Tag Sticker', source: 'Calls & Voice',
    consent: { contactApproved: true, channels: ['call'], optOut: false, evidence: 'operator confirmed' },
  });
  assert.equal(saved.status, 201);
  assert.equal(saved.body.created, true);
  assert.equal(saved.body.customer.name, 'Call Lead');
  assert.equal(saved.body.customer.phone, '+919876543212');
  assert.equal('automation' in saved.body, false, 'quick-save must not queue outbound tasks');
  const stored = JSON.parse(fs.readFileSync(path.join(a.dir, 'customers.json'), 'utf8'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, saved.body.customer.id);

  const duplicate = await a.call('POST', '/api/customers/quick-save', { name: 'Different Name', phone: '9876543212' });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.customer.name, 'Call Lead', 'duplicate matching must not overwrite the original record');
  await a.close();
});

test('customer create/validate/update/dedupe/delete', async () => {
  const a = await boot();
  assert.equal((await a.call('POST', '/api/customers', { name: '' })).status, 400);
  assert.equal((await a.call('POST', '/api/customers', { name: 'T', email: 'bad' })).status, 400);
  assert.equal((await a.call('POST', '/api/customers', { name: 'T', phone: 'abc' })).status, 400);
  const c = (await a.call('POST', '/api/customers', consented)).body;
  assert.equal(c.phone, '+919876543210');
  assert.equal(c.consent.contactApproved, true);
  const dup = await a.call('POST', '/api/customers', consented);
  assert.equal(dup.status, 409);
  assert.ok(dup.body.duplicateOf);
  const upd = await a.call('PUT', '/api/customers/' + c.id, { status: 'Interested', interestLevel: 4 });
  assert.equal(upd.body.status, 'Interested');
  assert.equal(upd.body.interestLevel, 4);
  assert.ok(upd.body.score > 0);
  const det = await a.call('GET', '/api/customers/' + c.id);
  assert.ok(det.body.customer && Array.isArray(det.body.timeline));
  assert.equal((await a.call('DELETE', '/api/customers/' + c.id)).status, 400);
  assert.equal((await a.call('DELETE', '/api/customers/' + c.id + '?confirm=true')).status, 200);
  await a.close();
});

test('opt-out blocks outreach eligibility honestly', async () => {
  const a = await boot();
  const c = (await a.call('POST', '/api/customers', consented)).body;
  await a.call('POST', `/api/customers/${c.id}/opt-out`, { reason: 'asked to stop' });
  const det = await a.call('GET', '/api/customers/' + c.id);
  assert.equal(det.body.customer.consent.optOut, true);
  assert.equal(det.body.customer.status, 'Opted Out');
  const dial = await a.call('POST', '/api/calls/dial', { customerId: c.id, phone: c.phone });
  assert.equal(dial.status, 400);
  assert.match(dial.body.error, /opted out/i);
  await a.close();
});

test('CSV import skips duplicates and bad rows; export escapes formula injection', async () => {
  const a = await boot();
  const r = await a.call('POST', '/api/customers/import', { csv: 'name,email,phone,notes\nA,a@x.com,9876543210,hello\nB,a@x.com,,\n,c@x.com,,\n=HYPERLINK("http://evil"),e@x.com,,=1+1' });
  assert.equal(r.body.added, 2);
  assert.equal(r.body.skipped.length, 2);
  const csv = await a.call('GET', '/api/customers.csv');
  assert.match(csv.body, /A,/);
  assert.ok(csv.body.includes("'=HYPERLINK"), 'formula escaped');
  await a.close();
});

test('callback window validation is enforced in IST', async () => {
  const a = await boot({ notify: async () => {} });
  const b = { customerName: 'Test', reason: 'Tap Tag' };
  assert.equal((await a.call('POST', '/api/callbacks', { ...b, ...nextDay('15:30') })).status, 422);
  assert.equal((await a.call('POST', '/api/callbacks', { ...b, ...nextDay('17:00') })).status, 422);
  assert.equal((await a.call('POST', '/api/callbacks', { ...b, date: '2020-01-01', time: '16:30' })).status, 422);
  assert.equal((await a.call('POST', '/api/callbacks', { ...b, date: '2027-02-30', time: '16:30' })).status, 422);
  const okRes = await a.call('POST', '/api/callbacks', { ...b, ...nextDay('16:30') });
  assert.equal(okRes.status, 201);
  assert.equal(okRes.body.callback.status, 'scheduled');
  const del = await a.call('DELETE', '/api/callbacks/' + okRes.body.callback.id + '?confirm=true');
  assert.equal(del.body.status, 'cancelled');
  await a.close();
});

test('follow-ups create, list, complete', async () => {
  const a = await boot();
  assert.equal((await a.call('POST', '/api/followups', { title: '' })).status, 400);
  const f = (await a.call('POST', '/api/followups', { title: 'Send price list', priority: 'high' })).body;
  assert.equal(f.priority, 'high');
  assert.equal((await a.call('POST', `/api/followups/${f.id}/complete`)).body.done, true);
  await a.close();
});

test('settings update validates and never stores secrets', async () => {
  const a = await boot();
  const s = (await a.call('GET', '/api/settings')).body;
  assert.equal(s.business.name, 'Dynamic Robotics 53');
  const bad = await a.call('PUT', '/api/settings', { calling: { windowStartHour: 19, windowEndHour: 9 } });
  assert.equal(bad.status, 400);
  const sneaky = await a.call('PUT', '/api/settings', { llm: { providers: [{ id: 'evil', type: 'openai', baseUrl: 'https://x', apiKey: 'sk-should-not-store' }] } });
  const after = (await a.call('GET', '/api/settings')).body;
  assert.equal(JSON.stringify(after).includes('sk-should-not-store'), false, 'secret value stripped');
  await a.close();
});

test('kill switch cancels pending tasks and blocks new outbound', async () => {
  const a = await boot();
  const c = (await a.call('POST', '/api/customers', consented)).body;
  const camp = (await a.call('POST', '/api/campaigns', { name: 'K', objective: 'test', channel: 'agent' })).body;
  assert.ok(camp.campaign);
  const ks = await a.call('POST', '/api/settings/kill-switch', { on: true });
  assert.equal(ks.body.killSwitch, true);
  const start = await a.call('POST', `/api/campaigns/${camp.campaign.id}/start`, {});
  assert.equal(start.status, 400);
  assert.match(start.body.error, /kill switch/i);
  await a.call('POST', '/api/settings/kill-switch', { on: false });
  const s2 = (await a.call('GET', '/api/settings')).body;
  assert.equal(s2.agent.killSwitch, false);
  await a.close();
});

test('task queue: dedupe, lifecycle, restart recovery marks in-flight calls needs_review', async () => {
  const a = await boot();
  const t1 = (await a.call('POST', '/api/tasks', { kind: 'followup', title: 'Task A', dedupeKey: 'x1', payload: {} })).body;
  assert.equal(t1.task.status, 'pending');
  const dupe = await a.call('POST', '/api/tasks', { kind: 'followup', title: 'Task A', dedupeKey: 'x1', payload: {} });
  assert.equal(dupe.body.duplicate, true);
  assert.equal((await a.call('POST', `/api/tasks/${t1.task.id}/pause`)).body.task.status, 'paused');
  assert.equal((await a.call('POST', `/api/tasks/${t1.task.id}/resume`)).body.task.status, 'pending');
  assert.equal((await a.call('POST', `/api/tasks/${t1.task.id}/cancel`)).body.task.status, 'cancelled');

  // Simulate a restart with an in-flight provider call task.
  await a.app.store.push('tasks', { id: 'stuck1', kind: 'call', title: 'Stuck call', status: 'running', payload: { phone: '+919876543210' }, attempts: 1, maxAttempts: 2, runAfter: new Date().toISOString(), leaseUntil: new Date(Date.now() + 60000).toISOString(), createdAt: new Date().toISOString(), events: [] });
  await a.app.queue.recoverLeases();
  const stuck = await a.call('GET', '/api/tasks/stuck1');
  assert.equal(stuck.body.status, 'needs_review');
  assert.match(stuck.body.error, /may already have/i);
  await a.close();
});

test('approvals: consequential task waits, approve runs, reject cancels', async () => {
  const a = await boot();
  const c = (await a.call('POST', '/api/customers', consented)).body;
  // requireApprovalForConsequential is on by default; send_message is consequential.
  const t = (await a.call('POST', '/api/tasks', { kind: 'message', title: 'Message Asha', consequential: true, payload: { phone: c.phone, channel: 'sms', message: 'Hi from test', customerId: c.id, consentConfirmed: true } })).body;
  assert.equal(t.task.status, 'awaiting_approval');
  const approvals = (await a.call('GET', '/api/approvals')).body;
  assert.equal(approvals.length, 1);
  const rej = await a.call('POST', `/api/approvals/${approvals[0].id}/decide`, { decision: 'reject', note: 'not now' });
  assert.equal(rej.status, 200);
  const after = await a.call('GET', '/api/tasks/' + t.task.id);
  assert.equal(after.body.status, 'cancelled');
  await a.close();
});

test('campaign: eligibility gates unconsented contacts, start queues tasks, stop is final', async () => {
  const a = await boot();
  await a.call('POST', '/api/customers', { name: 'NoConsent', phone: '9000000001' });
  await a.call('POST', '/api/customers', consented);
  const mk = await a.call('POST', '/api/campaigns', { name: 'Spring', objective: 'follow up', channel: 'agent' });
  assert.equal(mk.status, 201);
  assert.equal(mk.body.eligible, 1);
  assert.equal(mk.body.blocked, 1);
  const started = await a.call('POST', `/api/campaigns/${mk.body.campaign.id}/start`, {});
  assert.equal(started.status, 200);
  const list = await a.call('GET', '/api/tasks?status=active');
  assert.equal(list.body.tasks.filter((t) => t.campaignId === mk.body.campaign.id).length, 1);
  const rep = await a.call('GET', `/api/campaigns/${mk.body.campaign.id}`);
  assert.ok(rep.body.campaign.progress);
  const stopped = await a.call('POST', `/api/campaigns/${mk.body.campaign.id}/stop`, {});
  assert.equal(stopped.body.campaign.status, 'stopped');
  const restart = await a.call('POST', `/api/campaigns/${mk.body.campaign.id}/start`, {});
  assert.equal(restart.status, 400);
  await a.close();
});

test('messaging: drafts work without Twilio; real send fails honestly when unconfigured', async () => {
  const a = await boot({ env: { DR53_LOCAL_ONLY: 'false' } });
  const draft = await a.call('POST', '/api/messages/draft', { phone: '9876543210', channel: 'sms', message: 'Draft hello' });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.messageRecord.status, 'draft');
  const send = await a.call('POST', '/api/messages/send', { phone: '9876543210', channel: 'sms', message: 'Real hello', consentConfirmed: true });
  assert.equal(send.status, 503);
  assert.match(send.body.error, /TWILIO/);
  const listed = (await a.call('GET', '/api/messages')).body;
  assert.equal(listed.length, 2);
  assert.equal(listed.find((m) => m.status !== 'draft').status, 'failed');
  await a.close();
});

test('messaging with mocked Twilio: sends once, duplicate blocked by idempotency key', async () => {
  const env = { DR53_LOCAL_ONLY: 'false', TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM_NUMBER: '+15005550006' };
  const requests = [];
  const a = await boot({
    env,
    providerFetch: async (url, init) => { requests.push({ url, init }); return { ok: true, status: 201, json: async () => ({ sid: 'SM' + requests.length, status: 'queued' }) }; },
  });
  const body = { phone: '9876543210', channel: 'sms', message: 'Hello customer', consentConfirmed: true, idempotencyKey: 'test-key-1' };
  const first = await a.call('POST', '/api/messages/send', body);
  assert.equal(first.status, 201);
  assert.equal(first.body.messageRecord.status, 'queued');
  const second = await a.call('POST', '/api/messages/send', body);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(requests.length, 1, 'provider called exactly once');
  await a.close();
});

test('AI provider call: unconfigured → 503 with missing vars; configured → ElevenLabs payload correct', async () => {
  const a = await boot({ env: { DR53_LOCAL_ONLY: 'false' } });
  const noCfg = await a.call('POST', '/api/calls/ai', { phone: '9876543210', consentConfirmed: true });
  assert.equal(noCfg.status, 503);
  assert.match(noCfg.body.error, /ELEVENLABS_API_KEY/);

  let seen;
  const b = await boot({
    env: { DR53_LOCAL_ONLY: 'false', ELEVENLABS_API_KEY: 'k', ELEVENLABS_AGENT_ID: 'ag', ELEVENLABS_AGENT_PHONE_NUMBER_ID: 'ph', TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'tok' },
    providerFetch: async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ success: true, conversation_id: 'conv-1' }) }; },
  });
  assert.equal((await b.call('POST', '/api/calls/ai', { phone: '9876543210' })).status, 400); // consent missing
  const okCall = await b.call('POST', '/api/calls/ai', { phone: '9876543210', customerName: 'Test', purpose: 'follow up', consentConfirmed: true });
  assert.equal(okCall.status, 201);
  assert.equal(okCall.body.call.status, 'initiated');
  assert.equal(seen.url, 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call');
  const payload = JSON.parse(seen.init.body);
  assert.equal(payload.to_number, '+919876543210');
  assert.equal(seen.init.headers['xi-api-key'], 'k');
  await b.close();
  await a.close();
});

test('local-only mode blocks provider sends and AI phone calls even if credentials exist', async () => {
  let providerRequests = 0;
  const a = await boot({
    env: { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'secret', TWILIO_FROM_NUMBER: '+15005550006', ELEVENLABS_API_KEY: 'key', ELEVENLABS_AGENT_ID: 'agent', ELEVENLABS_AGENT_PHONE_NUMBER_ID: 'phone' },
    providerFetch: async () => { providerRequests++; return { ok: true, status: 201, json: async () => ({ sid: 'unexpected' }) }; },
  });
  const send = await a.call('POST', '/api/messages/send', { phone: '9876543210', channel: 'whatsapp', message: 'Hello', consentConfirmed: true });
  assert.equal(send.status, 400);
  assert.match(send.body.error, /local-only mode/i);
  const call = await a.call('POST', '/api/calls/ai', { phone: '9876543210', customerName: 'Test', consentConfirmed: true });
  assert.equal(call.status, 400);
  assert.match(call.body.error, /local-only mode/i);
  assert.equal(providerRequests, 0, 'no outbound provider requests in local-only mode');
  await a.close();
});

test('voice session: consent gate, permission flow, refusal triggers opt-out, end summarises', async () => {
  const a = await boot();
  const noConsent = (await a.call('POST', '/api/customers', { name: 'NC', phone: '9000000002' })).body;
  const blocked = await a.call('POST', '/api/voice/sessions', { customerId: noConsent.id });
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.error, /consent/i);

  const c = (await a.call('POST', '/api/customers', consented)).body;
  const vs = await a.call('POST', '/api/voice/sessions', { customerId: c.id });
  assert.equal(vs.status, 201);
  assert.match(vs.body.session.opening, /AI sales assistant/i);
  const sid = vs.body.session.id;

  // A greeting is not treated as consent; the agent asks again without launching the pitch.
  const greeting = await a.call('POST', `/api/voice/sessions/${sid}/utterance`, { text: 'hello' });
  assert.match(greeting.body.reply, /is now a good time/i);

  // First utterance: permission granted.
  const u1 = await a.call('POST', `/api/voice/sessions/${sid}/utterance`, { text: 'yes, go ahead' });
  assert.match(u1.body.reply, /following up/i);

  const price = await a.call('POST', `/api/voice/sessions/${sid}/utterance`, { text: 'How much is the Tap Tag Sticker?' });
  assert.equal(price.status, 200);
  assert.match(price.body.reply, /₹553/);
  assert.equal(price.body.provider, 'local-catalogue', 'approved price facts should answer without model latency');

  const spec = await a.call('POST', `/api/voice/sessions/${sid}/utterance`, { text: 'Is the sticker waterproof?' });
  assert.match(spec.body.reply, /verified answer/i);
  const card = await a.call('POST', `/api/voice/sessions/${sid}/utterance`, { text: 'What does the Tap Tag Card do?' });
  assert.match(card.body.reply, /logo/i);
  const website = await a.call('POST', `/api/voice/sessions/${sid}/utterance`, { text: 'How much does website development cost?' });
  assert.match(website.body.reply, /start at ₹5,300/i);
  const adapter = await a.call('POST', `/api/voice/sessions/${sid}/utterance`, { text: 'Can the E-Adapter power my laptop?' });
  assert.match(adapter.body.reply, /don’t want to guess|do not want to guess/i);
  const thanks = await a.call('POST', `/api/voice/sessions/${sid}/utterance`, { text: 'Thanks' });
  assert.match(thanks.body.reply, /welcome/i);
  assert.doesNotMatch(thanks.body.reply, /Tap Tag Sticker|E-Adapter|₹553|₹2,553/i, 'a simple acknowledgement should not re-pitch a product');

  // Refusal with stop-calling → opted out + session ended.
  const u2 = await a.call('POST', `/api/voice/sessions/${sid}/utterance`, { text: 'stop calling me' });
  assert.equal(u2.body.ended, true);
  const det = await a.call('GET', '/api/customers/' + c.id);
  assert.equal(det.body.customer.consent.optOut, true);
  const dead = await a.call('POST', `/api/voice/sessions/${sid}/utterance`, { text: 'hello?' });
  assert.equal(dead.status, 400);
  await a.close();
});

test('voice keeps a complete generated answer instead of truncating its spoken transcript', async () => {
  const generated = 'For this project, first confirm the customer’s intended use and the conditions where the device will operate. Then compare the verified requirements with the available product details, identify anything the team still needs to confirm, and agree on a clear next step before making a recommendation.';
  let generationOptions;
  const a = await boot({
    llmFetch: async (_url, init) => {
      generationOptions = JSON.parse(init.body).options;
      return new Response(JSON.stringify({ message: { content: generated } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  const customer = (await a.call('POST', '/api/customers', consented)).body;
  const session = (await a.call('POST', '/api/voice/sessions', { customerId: customer.id })).body.session;
  await a.call('POST', `/api/voice/sessions/${session.id}/utterance`, { text: 'Yes, go ahead.' });
  const response = await a.call('POST', `/api/voice/sessions/${session.id}/utterance`, {
    text: 'Please explain how I should evaluate this project and what information you need from me.',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.reply, generated);
  assert.equal(generationOptions.num_predict, 192);
  await a.close();
});

test('runtime configuration reads overrides and rejects invalid ports', () => {
  const config = runtimeConfig({ PORT: '3099', HOST: '127.0.0.1', DR53_DATA_DIR: 'var/customer-data' });
  assert.equal(config.port, 3099);
  assert.equal(config.host, '127.0.0.1');
  assert.ok(config.dataDir.endsWith(path.join('sales-command-centre', 'var', 'customer-data')));
  assert.throws(() => runtimeConfig({ PORT: '70000' }), /PORT must be a whole number/);
});

test('agent: offline fallback answers from catalogue and never invents prices', async () => {
  const a = await boot();
  const r = await a.call('POST', '/api/agent/run', { body: undefined, text: 'How much is the Tap Tag Sticker?' });
  assert.equal(r.status, 200);
  assert.match(r.body.message.content, /553/);
  assert.ok(r.body.message.provider, 'provider labelled honestly');
  const convos = (await a.call('GET', '/api/conversations')).body;
  assert.equal(convos.length, 1);
  const convo = (await a.call('GET', '/api/conversations/' + r.body.conversationId)).body;
  assert.ok(convo.messages.length >= 2);
  await a.close();
});

test('agent answers product facts from the local catalogue without trusting model output', async () => {
  let modelCalls = 0;
  const a = await boot({
    llmFetch: async () => {
      modelCalls++;
      return new Response(JSON.stringify({ message: { content: 'The sticker is waterproof.' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  try {
    const price = await a.call('POST', '/api/agent/run', { text: 'How much is the Tap Tag Sticker and what does it do?' });
    assert.equal(price.status, 200);
    assert.match(price.body.message.content, /₹553/);
    assert.match(price.body.message.provider, /approved catalogue/i);
    assert.equal(modelCalls, 0);

    const specification = await a.call('POST', '/api/agent/run', {
      conversationId: price.body.conversationId,
      text: 'Is it waterproof?',
    });
    assert.equal(specification.status, 200);
    assert.match(specification.body.message.content, /no verified answer|team needs to confirm/i);
    assert.doesNotMatch(specification.body.message.content, /waterproof\./i);
    assert.equal(modelCalls, 0);
  } finally {
    await a.close();
  }
});

test('agent rate limit returns 429 honestly', async () => {
  const a = await boot();
  let last;
  for (let i = 0; i < 6; i++) last = await a.call('POST', '/api/agent/run', { text: 'hi ' + i });
  assert.equal(last.status, 429);
  await a.close();
});

test('tools registry exposes 36 tools with schemas and tiers', async () => {
  const a = await boot();
  try {
    const tools = (await a.call('GET', '/api/tools')).body;
    assert.equal(tools.length, 36);
    assert.ok(tools.some((tool) => tool.name === 'search_products' && tool.tier === 'read'));
    const products = await a.app.tools.execute('search_products', { q: 'Tap Tag Sticker', limit: 5 }, { origin: 'test' });
    assert.equal(products.ok, true);
    assert.equal(products.data.products.length, 1);
    assert.equal(products.data.products[0].name, 'Tap Tag Sticker');
    assert.match(products.data.products[0].description, /Do not invent material, durability/i);
    for (const t of tools) {
      assert.ok(t.name && t.description && t.schema, t.name);
      assert.ok(['read', 'write', 'consequential'].includes(t.tier), t.name);
    }
  } finally {
    await a.close();
  }
});

test('native dial validates numbers and never passes shell metacharacters', async () => {
  const dialed = [];
  const a = await boot({ exec: async (cmd, args) => { dialed.push([cmd, args]); return ''; } });
  assert.equal((await a.call('POST', '/api/calls/dial', { phone: 'abc' })).status, 400);
  assert.equal((await a.call('POST', '/api/calls/dial', { phone: '+91 98765-43210; rm -rf /' })).status, 400);
  const r = await a.call('POST', '/api/calls/dial', { phone: '9876543210', customerName: 'T' });
  assert.equal(r.status, 201);
  assert.deepEqual(dialed, [['open', ['tel:+919876543210']]]);
  await a.close();
});

test('malformed JSON data file is quarantined, not fatal', async () => {
  const a = await boot();
  fs.writeFileSync(path.join(a.dir, 'customers.json'), '{bad json');
  const r = await a.call('GET', '/api/customers');
  assert.equal(r.status, 200);
  assert.equal(r.body.rows.length, 0);
  const backups = fs.readdirSync(path.join(a.dir, 'backups'));
  assert.ok(backups.some((f) => f.includes('customers')));
  await a.close();
});

test('analytics only reflects real records', async () => {
  const a = await boot();
  const empty = (await a.call('GET', '/api/analytics')).body;
  assert.equal(empty.totals.customers, 0);
  assert.equal(empty.totals.connectRate, 0);
  await a.call('POST', '/api/customers', consented);
  const after = (await a.call('GET', '/api/analytics')).body;
  assert.equal(after.totals.customers, 1);
  await a.close();
});

test('new-lead automation queues only consented contacts and partial settings are preserved', async () => {
  const a = await boot();
  const baseSettings = (await a.call('GET', '/api/settings')).body;
  assert.equal(baseSettings.automation.autoMessageNewLead, true);
  assert.equal(baseSettings.automation.autoCallNewLead, true);

  const save = await a.call('PUT', '/api/settings', {
    automation: { autoMessageNewLead: true, autoCallNewLead: false, newLeadMessageChannel: 'sms' },
    agent: { extraGuidance: 'keep this setting across partial saves' },
  });
  assert.equal(save.status, 200);
  assert.equal(save.body.agent.extraGuidance, 'keep this setting across partial saves');
  assert.equal(save.body.agent.killSwitch, false);

  const lead = await a.call('POST', '/api/customers', {
    ...consented,
    consent: { contactApproved: true, channels: ['sms'], evidence: 'explicit opt-in form' },
  });
  assert.equal(lead.status, 201);
  assert.equal(lead.body.automation.length, 1);
  assert.equal(lead.body.automation[0].kind, 'message');
  const task = await a.call('GET', `/api/tasks/${lead.body.automation[0].taskId}`);
  assert.equal(task.body.kind, 'message');
  assert.equal(task.body.payload.channel, 'sms');
  assert.equal(task.body.customerId, lead.body.id);

  const noConsent = await a.call('POST', '/api/customers', { name: 'No consent lead', phone: '9876543211' });
  assert.equal(noConsent.status, 201);
  assert.deepEqual(noConsent.body.automation, []);
  await a.close();
});

test('linked opt-out blocks direct message and local voice even with manual confirmation', async () => {
  const a = await boot();
  const c = (await a.call('POST', '/api/customers', consented)).body;
  await a.call('POST', `/api/customers/${c.id}/opt-out`, { reason: 'please stop contacting me' });
  const msg = await a.call('POST', '/api/messages/send', {
    customerId: c.id, phone: c.phone, channel: 'sms', message: 'Should never send', consentConfirmed: true,
  });
  assert.equal(msg.status, 400);
  assert.match(msg.body.error, /opted out/i);
  const msgByNumber = await a.call('POST', '/api/messages/send', { phone: c.phone, channel: 'sms', message: 'Must not send by phone-only lookup', consentConfirmed: true });
  assert.equal(msgByNumber.status, 400);
  assert.match(msgByNumber.body.error, /opted out/i);
  const dialByNumber = await a.call('POST', '/api/calls/dial', { phone: c.phone, operatorConfirmed: true });
  assert.equal(dialByNumber.status, 400);
  assert.match(dialByNumber.body.error, /opted out/i);
  const voice = await a.call('POST', '/api/voice/sessions', { customerId: c.id, operatorConfirmed: true });
  assert.equal(voice.status, 400);
  assert.match(voice.body.error, /opted out/i);
  await a.close();
});

test('providers status lists missing vars without leaking values', async () => {
  const a = await boot({ env: { TWILIO_ACCOUNT_SID: 'AC-secret-value', TWILIO_AUTH_TOKEN: 'super-secret-token' } });
  const r = await a.call('GET', '/api/providers/status');
  assert.equal(r.body.sms.ready, false);
  const text = JSON.stringify(r.body);
  assert.equal(text.includes('super-secret-token'), false);
  assert.equal(text.includes('AC-secret-value'), false);
  await a.close();
});


test('ElevenLabs webhook requires a secret and verifies signed native post-call payloads', async () => {
  const unconfigured = await boot();
  const disabled = await unconfigured.call('POST', '/api/webhooks/elevenlabs', { type: 'post_call_transcription', data: { conversation_id: 'x' } });
  assert.equal(disabled.status, 503);
  await unconfigured.close();

  const secret = 'test-webhook-signing-secret';
  const a = await boot({ env: { DR53_WEBHOOK_SECRET: secret } });
  await a.app.store.prepend('calls', {
    id: 'call-webhook-1', kind: 'ai_voice_call', provider: 'elevenlabs', customerId: '', customerName: 'Asha',
    phone: '+919876543210', status: 'initiated', conversationId: 'conv-webhook-1', transcript: [], startedAt: new Date().toISOString(),
  });
  const rawBody = JSON.stringify({
    type: 'post_call_transcription', event_timestamp: Math.floor(Date.now() / 1000),
    data: {
      conversation_id: 'conv-webhook-1', status: 'done',
      transcript: [
        { role: 'agent', message: 'Hi, this is the DR53 AI assistant.', time_in_call_secs: 0 },
        { role: 'user', message: 'Yes, tell me more.', time_in_call_secs: 3 },
      ],
      analysis: { transcript_summary: 'Customer asked for details.' },
      metadata: { cost: { total_cost: 12 } },
    },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const validSig = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const sendRaw = (signature) => fetch(`${a.base}/api/webhooks/elevenlabs`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'elevenlabs-signature': signature }, body: rawBody,
  });
  const bad = await sendRaw(`t=${ts},v0=${'0'.repeat(64)}`);
  assert.equal(bad.status, 401);
  const accepted = await sendRaw(`t=${ts},v0=${validSig}`);
  assert.equal(accepted.status, 200);
  const call = (await a.app.store.read('calls')).find((c) => c.id === 'call-webhook-1');
  assert.equal(call.status, 'completed', 'ElevenLabs status "done" is terminal');
  assert.equal(call.endedAt !== null, true);
  assert.equal(call.summary, 'Customer asked for details.');
  assert.equal(call.transcript.length, 2);
  assert.equal(call.transcript[0].speaker, 'agent');
  assert.equal(call.transcript[1].text, 'Yes, tell me more.');
  assert.equal(call.providerMeta.totalCost, 12);
  await a.close();
});

test('provider conversation sync normalizes ElevenLabs done status and captures summary', async () => {
  const a = await boot({
    env: { ELEVENLABS_API_KEY: 'test-key' },
    providerFetch: async () => ({ ok: true, status: 200, json: async () => ({
      status: 'done', transcript: [{ role: 'agent', message: 'Hello', time_in_call_secs: 0 }],
      analysis: { transcript_summary: 'Short completed call.' },
    }) }),
  });
  await a.app.store.prepend('calls', {
    id: 'call-sync-1', kind: 'ai_voice_call', provider: 'elevenlabs', status: 'initiated', conversationId: 'conv-sync-1', transcript: [],
  });
  const synced = await a.app.outbound.fetchProviderCall('call-sync-1');
  assert.equal(synced.call.status, 'completed');
  assert.ok(synced.call.endedAt);
  assert.equal(synced.call.summary, 'Short completed call.');
  await a.close();
});


test('callback reminder only marks sent after success and retries failed desktop notifications', async () => {
  const record = (id) => ({
    id, customerName: 'Reminder Test', customerId: '', phone: '+919876543210', reason: 'requested callback',
    scheduledAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), status: 'scheduled', createdAt: new Date().toISOString(),
  });
  const sentNotes = [];
  const success = await boot({ notify: async (title, body) => { sentNotes.push({ title, body }); } });
  await success.app.store.push('callbacks', record('callback-success'));
  const successResult = await success.app.executeTask({ kind: 'callback_check' }, { onEvent() {}, heartbeat: async () => {} });
  assert.equal(successResult.ok, true);
  assert.equal(successResult.result.notified, 1);
  assert.equal((await success.app.store.read('callbacks'))[0].status, 'due_notified');
  assert.equal(sentNotes.length, 1);
  await success.close();

  const failed = await boot({ notify: async () => { throw new Error('macOS notification denied'); } });
  await failed.app.store.push('callbacks', record('callback-failed'));
  const failedResult = await failed.app.executeTask({ kind: 'callback_check' }, { onEvent() {}, heartbeat: async () => {} });
  assert.equal(failedResult.ok, true);
  assert.equal(failedResult.result.notified, 0);
  const saved = (await failed.app.store.read('callbacks'))[0];
  assert.equal(saved.status, 'scheduled', 'failed alert remains eligible for a future retry');
  assert.equal(saved.notificationSent, false);
  assert.match(saved.notificationError, /notification denied/i);
  await failed.close();
});


test('provider call task automatically schedules a retry after no answer', async () => {
  const a = await boot({
    providerCallPollMs: 10,
    env: { DR53_LOCAL_ONLY: 'false', ELEVENLABS_API_KEY: 'key', ELEVENLABS_AGENT_ID: 'agent', ELEVENLABS_AGENT_PHONE_NUMBER_ID: 'phone', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'token' },
    providerFetch: async (url, init) => {
      if (String(url).includes('/outbound-call')) return { ok: true, status: 200, json: async () => ({ success: true, conversation_id: 'conv-no-answer' }) };
      return { ok: true, status: 200, json: async () => ({ status: 'no_answer', transcript: [] }) };
    },
  });
  await a.app.persistSettings({ ...a.app.getSettings(), automation: { autoMessageNewLead: false, autoCallNewLead: false, newLeadMessageChannel: 'whatsapp' } });
  const c = await a.app.crm.create(consented);
  const result = await a.app.executeTask({
    id: 'retry-call-task', kind: 'call', customerId: c.id, campaignId: '', attempts: 1, maxAttempts: 2,
    payload: { phone: c.phone, customerName: c.name, purpose: 'follow up', productInterest: c.product, mode: 'provider', consentConfirmed: true },
  }, { onEvent() {}, heartbeat: async () => {} });
  assert.equal(result.ok, false);
  assert.equal(result.retryable, true);
  assert.match(result.error, /automatically rescheduling/i);
  const calls = await a.app.store.read('calls');
  assert.equal(calls[0].status, 'no_answer');
  const updated = await a.app.crm.get(c.id);
  assert.equal(updated.lastCallOutcome, 'no_answer');
  await a.close();
});

test('provider status sync failure never fabricates an answered outcome', async () => {
  const a = await boot({
    providerCallPollMs: 10,
    env: { DR53_LOCAL_ONLY: 'false', ELEVENLABS_API_KEY: 'key', ELEVENLABS_AGENT_ID: 'agent', ELEVENLABS_AGENT_PHONE_NUMBER_ID: 'phone', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'token' },
    providerFetch: async (url, init) => {
      if (String(url).includes('/outbound-call')) return { ok: true, status: 200, json: async () => ({ success: true, conversation_id: 'conv-pending' }) };
      return { ok: false, status: 503, json: async () => ({ detail: 'temporary outage' }) };
    },
  });
  await a.app.persistSettings({ ...a.app.getSettings(), automation: { autoMessageNewLead: false, autoCallNewLead: false, newLeadMessageChannel: 'whatsapp' } });
  const c = await a.app.crm.create(consented);
  const result = await a.app.executeTask({
    id: 'uncertain-call-task', kind: 'call', customerId: c.id, campaignId: '', attempts: 1, maxAttempts: 2,
    payload: { phone: c.phone, customerName: c.name, purpose: 'follow up', productInterest: c.product, mode: 'provider', consentConfirmed: true },
  }, { onEvent() {}, heartbeat: async () => {} });
  assert.equal(result.ok, false);
  assert.equal(result.noRetry, true);
  assert.match(result.error, /avoid a duplicate call/i);
  const updated = await a.app.crm.get(c.id);
  assert.equal(updated.lastCallOutcome, '', 'unknown provider state is not recorded as answered');
  await a.close();
});
