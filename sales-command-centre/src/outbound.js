'use strict';
const { id, nowIso, str, normalizePhone, fmtIst } = require('./util');
const { integrationStatus } = require('./config');
const { scoreLead } = require('./crm');

const MESSAGE_STATES = ['draft', 'queued', 'sending', 'accepted', 'queued_by_provider', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'cancelled', 'handoff_opened'];

function mapTwilioStatus(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'queued') return 'queued';
  if (v === 'sending') return 'sending';
  if (v === 'sent') return 'sent';
  if (v === 'delivered') return 'delivered';
  if (v === 'read') return 'read';
  if (v === 'failed') return 'failed';
  if (v === 'undelivered' || v === 'received_not_supported') return 'undelivered';
  if (v === 'canceled' || v === 'cancelled') return 'cancelled';
  return 'accepted';
}

function normalizeProviderCallStatus(value) {
  const status = str(value, 60).toLowerCase().replace(/[ -]+/g, '_');
  if (['done', 'concluded', 'complete', 'completed'].includes(status)) return 'completed';
  if (['canceled', 'cancelled'].includes(status)) return 'cancelled';
  if (['error', 'failure'].includes(status)) return 'failed';
  if (['busy', 'ring_busy', 'ring_nr_busy'].includes(status)) return 'ring_nr_busy';
  return status;
}

function createOutbound({ store, log, getSettings, env, providerFetch, exec, platform = process.platform }) {
  const doFetch = providerFetch || fetch;

  function providers() { return integrationStatus(env || process.env); }

  function base(u, init, timeoutMs = 30000) {
    return doFetch(u, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  }

  /* ---------------------------------------------------------------- native */

  async function nativeDial({ phone, customerId = '', customerName = '', purpose = '', source = 'manual' }) {
    const n = normalizePhone(phone);
    if (n.error) return { error: n.error };
    const record = { id: id(), kind: 'native_dial', customerId: str(customerId, 60), customerName: str(customerName, 120), phone: n.phone, purpose: str(purpose, 300), source, status: 'dial_opened', outcome: '', notes: '', error: '', startedAt: nowIso(), endedAt: null, audio: 'none', createdAt: nowIso() };
    if (platform !== 'darwin') { record.status = 'dial_failed'; record.error = 'The native dialer only exists on macOS.'; }
    else {
      try { await exec('open', [`tel:${n.phone}`]); }
      catch (e) { record.status = 'dial_failed'; record.error = `Could not open the Mac call handler: ${str(e.message, 200)}`; }
    }
    await store.prepend('calls', record);
    log('call', record.status === 'dial_opened' ? `Opened the Mac dialer for ${record.customerName || record.phone}` : `Dialer failed for ${record.phone}: ${record.error}`, { customerId: record.customerId || undefined, meta: { callId: record.id } });
    return { call: record, message: record.status === 'dial_opened'
      ? 'The Mac call handler is open — you confirm and place the call. The AI cannot hear or speak on a native cellular call; use a voice mode for that.'
      : record.error };
  }

  async function openMessagesApp() {
    if (platform !== 'darwin') return { error: 'Opening the Mac Messages app only works on macOS.' };
    try { await exec('open', ['-a', 'Messages']); } catch (e) { return { error: `Could not open Messages: ${str(e.message, 160)}` }; }
    return { opened: true, message: 'Messages opened on this Mac. Start the conversation, paste the draft, review and press Send yourself.' };
  }

  /* -------------------------------------------------------------- messaging */

  async function send({ channel, phone, message, customerId = '', customerName = '', consentConfirmed = false, idempotencyKey = '', draftOnly = false, source = 'manual' }) {
    if (env?.DR53_LOCAL_ONLY !== 'false' && !draftOnly) return { error: 'DR53 local-only mode is enabled: real SMS/WhatsApp sending is disabled. Review and send manually from WhatsApp or Messages.' };
    if (!['sms', 'whatsapp'].includes(channel)) return { error: 'Choose SMS or WhatsApp.' };
    const n = normalizePhone(phone);
    if (n.error) return { error: n.error };
    const body = str(message, 1600);
    if (!body) return { error: 'Write a message before sending.' };
    const key = str(idempotencyKey, 80) || `${channel}:${n.phone}:${body.slice(0, 240)}`;
    const existing = (await store.read('messages')).find((m) => m.idempotencyKey === key && !['failed', 'undelivered', 'cancelled'].includes(m.status));
    if (existing) return { duplicate: true, messageRecord: existing, message: `This exact message was already ${existing.status} at ${fmtIst(existing.createdAt)} (provider id ${existing.providerSid || 'n/a'}). Not sent again.` };

    const record = {
      id: id(), channel, customerId: str(customerId, 60), customerName: str(customerName, 120), phone: n.phone, message: body,
      status: draftOnly ? 'draft' : 'queued', provider: draftOnly ? 'none' : 'twilio', providerSid: '', providerStatus: '', error: '',
      consentConfirmed: !!consentConfirmed, idempotencyKey: key, source, states: [], createdAt: nowIso(), updatedAt: nowIso(),
    };
    if (draftOnly) { await store.prepend('messages', record); log('message', `Draft saved for ${record.customerName || n.phone} (${channel}) — not sent`, { customerId: record.customerId || undefined }); return { messageRecord: record, message: 'Draft saved. Nothing was sent.' }; }
    if (!consentConfirmed) { return { error: 'Confirm that this customer agreed to receive this message before sending.' }; }
    const cfg = providers()[channel];
    if (!cfg.ready) { record.status = 'failed'; record.error = `${channel === 'sms' ? 'SMS' : 'WhatsApp'} is not configured. Add to .env and restart: ${cfg.missing.join(', ')}`; await store.prepend('messages', record); return { error: record.error, messageRecord: record }; }

    const params = new URLSearchParams();
    params.set('To', channel === 'whatsapp' ? `whatsapp:${n.phone}` : n.phone);
    params.set('Body', body);
    if (channel === 'whatsapp') {
      let from = str(env.TWILIO_WHATSAPP_FROM, 60);
      if (!from.startsWith('whatsapp:')) from = `whatsapp:${from}`;
      params.set('From', from);
    } else if (env.TWILIO_MESSAGING_SERVICE_SID) params.set('MessagingServiceSid', env.TWILIO_MESSAGING_SERVICE_SID);
    else params.set('From', str(env.TWILIO_FROM_NUMBER, 40));

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`;
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    try {
      const r = await base(url, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) { record.status = 'failed'; record.error = `Twilio HTTP ${r.status}: ${str(result.message || result.error_message || 'rejected', 300)}`; }
      else { record.providerSid = str(result.sid, 150); record.providerStatus = str(result.status, 40); record.status = mapTwilioStatus(result.status); }
    } catch (e) {
      record.status = 'sending';
      record.error = e.name === 'TimeoutError'
        ? 'The request to Twilio timed out. Check the Twilio message log before retrying — the message may already have been accepted.'
        : `Could not reach Twilio: ${str(e.message, 200)}`;
    }
    record.states.push({ at: nowIso(), status: record.status, note: record.error || 'submitted' });
    record.updatedAt = nowIso();
    await store.prepend('messages', record);
    if (record.customerId) await store.update('customers', (rows) => { const c = rows.find((x) => x.id === record.customerId); if (c) { c.lastMessageAt = nowIso(); c.lastMessagePreview = body.slice(0, 200); } return rows; });
    log('message', `${record.status === 'failed' || record.status === 'sending' ? `${channel} ${record.status} for` : `${channel} ${record.status} to`} ${record.customerName || record.phone}${record.error ? `: ${record.error}` : ''}`, { customerId: record.customerId || undefined });
    return { messageRecord: record, message: record.status === 'failed' ? record.error : `Twilio ${record.status === 'sending' ? 'did not confirm the request' : `accepted the ${channel} message`} — delivery is confirmed only after a status sync.` };
  }

  async function syncStatus(messageId) {
    const rows = await store.read('messages');
    const record = rows.find((m) => m.id === messageId);
    if (!record) return { error: 'Message not found.' };
    if (!record.providerSid) return { error: 'This message has no provider id, so delivery cannot be checked. ' + (record.error || '') };
    const cfg = providers()[record.channel];
    if (!cfg.ready) return { error: 'Twilio credentials are not configured.' };
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    try {
      const r = await base(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages/${encodeURIComponent(record.providerSid)}.json`, { headers: { Authorization: `Basic ${auth}` } });
      if (!r.ok) return { error: `Twilio replied HTTP ${r.status}.` };
      const j = await r.json();
      const next = mapTwilioStatus(j.status);
      return store.update('messages', (all) => {
        const m = all.find((x) => x.id === messageId);
        m.status = next; m.providerStatus = str(j.status, 40); m.error = str(j.error_message || j.errorMessage || '', 300); m.updatedAt = nowIso();
        m.states = m.states || [];
        if (!m.states.length || m.states[m.states.length - 1].status !== next) m.states.push({ at: nowIso(), status: next, note: m.error || 'provider status' });
        return { value: all, result: { messageRecord: m, changed: true } };
      });
    } catch (e) { return { error: `Could not reach Twilio: ${str(e.message, 160)}` }; }
  }

  async function syncAllPending() {
    const rows = await store.read('messages');
    const pending = rows.filter((m) => m.providerSid && !['delivered', 'read', 'failed', 'undelivered', 'cancelled'].includes(m.status)).slice(0, 25);
    const results = [];
    for (const m of pending) { const r = await syncStatus(m.id); results.push(r.messageRecord || { id: m.id, error: r.error }); }
    return { checked: pending.length, messages: results };
  }

  /* ----------------------------------------------------------------- voice */

  /** ElevenLabs Agents (ConvAI) outbound call through a Twilio number. */
  async function startProviderCall({ phone, customerId = '', customerName = '', purpose = '', productInterest = '', campaignId = '', source = 'manual', consentConfirmed = false }) {
    if (env?.DR53_LOCAL_ONLY !== 'false') return { error: 'DR53 local-only mode is enabled: provider AI calls are disabled. Use the local voice console with a manually placed speakerphone call.' };
    const n = normalizePhone(phone);
    if (n.error) return { error: n.error };
    if (consentConfirmed !== true) return { error: 'Confirm that this customer agreed to receive an AI phone call before calling.' };
    const cfg = providers();
    if (!cfg.aiVoiceCall.ready) return { error: `AI voice calls are not configured. Add to .env and restart: ${cfg.aiVoiceCall.missing.join(', ')}. See SETUP.md.` };
    const s = getSettings();
    const { catalogueText } = require('./config');
    const products = await store.read('products');
    const record = {
      id: id(), kind: 'ai_voice_call', provider: 'elevenlabs', customerId: str(customerId, 60), customerName: str(customerName, 120), phone: n.phone,
      purpose: str(purpose, 300), productInterest: str(productInterest, 150), campaignId: str(campaignId, 60), source,
      status: 'starting', conversationId: '', callSid: '', error: '', transcript: [], outcome: '', startedAt: nowIso(), endedAt: null, updatedAt: nowIso(),
      audio: 'provider_bidirectional',
    };
    try {
      const r = await base('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': env.ELEVENLABS_API_KEY },
        body: JSON.stringify({
          agent_id: env.ELEVENLABS_AGENT_ID,
          agent_phone_number_id: env.ELEVENLABS_AGENT_PHONE_NUMBER_ID,
          to_number: n.phone,
          conversation_initiation_client_data: {
            dynamic_variables: {
              customer_name: record.customerName || 'there', call_purpose: record.purpose || 'follow up on a customer enquiry',
              product_interest: record.productInterest || 'their enquiry', product_catalog: catalogueText(products),
              business_name: s.business.name, business_website: s.business.website,
            },
            conversation_config_override: {
              agent: { first_message: `Hi, this is the ${s.business.name} AI assistant speaking with ${record.customerName || 'you'} about ${record.productInterest || 'your enquiry'}. I am an AI assistant, not a person. Is it a good time for a quick chat?`, language: 'en' },
            },
          },
        }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok || result.success === false) { record.status = 'failed'; record.error = `Provider HTTP ${r.status}: ${str(result.detail?.message || result.detail || result.message || 'request rejected', 300)}`; }
      else { record.status = 'initiated'; record.conversationId = str(result.conversation_id || result.conversation?.conversation_id, 150); record.callSid = str(result.callSid || result.call_sid, 150); }
    } catch (e) {
      record.status = 'failed';
      record.error = e.name === 'TimeoutError' ? 'The provider request timed out. Check the provider call log before retrying — the call may already be placed.' : `Could not reach the voice provider: ${str(e.message, 200)}`;
    }
    await store.prepend('calls', record);
    log('ai_call', record.status === 'initiated' ? `AI voice call started for ${record.customerName || record.phone}` : `AI voice call failed for ${record.phone}: ${record.error}`, { customerId: record.customerId || undefined, meta: { callId: record.id } });
    return { call: record, message: record.status === 'initiated' ? 'The voice provider accepted the outbound request; the phone should ring shortly. Live status and transcript sync in automatically.' : record.error };
  }

  async function fetchProviderCall(callId) {
    const rows = await store.read('calls');
    const record = rows.find((c) => c.id === callId);
    if (!record) return { error: 'Call not found.' };
    if (record.kind !== 'ai_voice_call' || !record.conversationId) return { call: record, error: record.error || 'This call has no provider conversation id, so there is nothing to sync.' };
    if (!env.ELEVENLABS_API_KEY) return { error: 'ELEVENLABS_API_KEY is not configured.' };
    try {
      const r = await base(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(record.conversationId)}`, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { error: `Provider replied HTTP ${r.status}.` };
      const providerData = j.data || j;
      const status = normalizeProviderCallStatus(providerData.status || j.status);
      const transcript = Array.isArray(providerData.transcript) ? providerData.transcript : Array.isArray(providerData.conversation_transcript) ? providerData.conversation_transcript : [];
      const ended = ['completed', 'cancelled', 'failed', 'ring_nr_busy', 'no_answer', 'voice_timeout'].includes(status);
      return store.update('calls', (all) => {
        const c = all.find((x) => x.id === callId);
        if (status) c.status = status;
        c.providerMeta = { businessStatus: str(providerData.business_status || j.business_status, 60), totalCost: providerData.metadata?.cost?.total_cost ?? j.metadata?.cost?.total_cost ?? null, from: providerData.metadata?.from ?? j.metadata?.from ?? providerData.from ?? j.from ?? null, to: providerData.metadata?.to ?? j.metadata?.to ?? providerData.to ?? j.to ?? null };
        if (transcript.length) c.transcript = transcript.map((t) => ({ speaker: str(t.speaker || t.role, 20) || 'customer', text: str(t.text || t.message, 4000), seconds: t.time_in_call_secs ?? null }));
        if (providerData.analysis?.call_destination || j.analysis?.call_destination) c.destination = str(providerData.analysis?.call_destination || j.analysis?.call_destination, 40);
        if (providerData.analysis?.transcript_summary || j.analysis?.transcript_summary) c.summary = str(providerData.analysis?.transcript_summary || j.analysis?.transcript_summary, 4000);
        if (ended && !c.endedAt) c.endedAt = nowIso();
        c.updatedAt = nowIso();
        return { value: all, result: { call: c } };
      });
    } catch (e) { return { error: `Could not reach the provider: ${str(e.message, 160)}` }; }
  }

  /** Receive the signed post-call event shape used by ElevenLabs; duplicate delivery is safe. */
  async function ingestProviderEvent(payload) {
    const data = payload?.data || payload?.event?.data || {};
    const conversationId = str(data.conversation_id || payload?.conversation?.conversation_id || payload?.conversation_id || payload?.event?.conversation_id, 150);
    const eventType = str(payload?.type || payload?.event?.type, 60);
    if (!conversationId) return { ignored: true, error: 'No conversation id in the webhook body.' };
    return store.update('calls', (all) => {
      const c = all.find((x) => x.conversationId === conversationId);
      if (!c) return { value: all, result: { ignored: true, error: `No local call matches conversation ${conversationId}.` } };
      if (eventType) c.lastEvent = { type: eventType, at: nowIso(), eventTimestamp: payload?.event_timestamp || null };
      const transcript = data.transcript || payload?.conversation?.transcript || payload?.transcript;
      if (Array.isArray(transcript)) c.transcript = transcript.map((t) => ({ speaker: str(t.speaker || t.role, 20) || 'customer', text: str(t.text || t.message, 4000), seconds: t.time_in_call_secs ?? null }));
      const status = normalizeProviderCallStatus(data.status || payload?.conversation?.status || payload?.status);
      if (status) c.status = status;
      if (data.analysis?.transcript_summary || data.analysis?.call_summary || payload?.analysis?.transcript_summary) c.summary = str(data.analysis?.transcript_summary || data.analysis?.call_summary || payload?.analysis?.transcript_summary, 4000);
      if (data.analysis?.call_successful) c.providerMeta = { ...(c.providerMeta || {}), callSuccessful: str(data.analysis.call_successful, 60) };
      if (data.metadata?.cost?.total_cost !== undefined) c.providerMeta = { ...(c.providerMeta || {}), totalCost: data.metadata.cost.total_cost };
      if (['completed', 'cancelled', 'failed', 'ring_nr_busy', 'no_answer', 'voice_timeout'].includes(c.status) && !c.endedAt) c.endedAt = nowIso();
      c.updatedAt = nowIso();
      return { value: all, result: { call: { id: c.id, status: c.status, transcriptLength: (c.transcript || []).length } } };
    });
  }

  async function recordOutcome({ callId, outcome, notes = '', customerId, nextFollowUpAt, summary, tags }) {
    const valid = ['', 'answered', 'no_answer', 'busy', 'callback_requested', 'not_interested', 'wrong_number', 'voicemail', 'completed', 'failed', 'cancelled', 'hot_lead', 'interested', 'callback_booked'];
    const value = str(outcome, 40);
    if (callId) {
      if (!valid.includes(value)) return { error: `Outcome must be one of: ${valid.filter(Boolean).join(', ')}.` };
      await store.update('calls', (all) => { const c = all.find((x) => x.id === callId); if (c) { c.outcome = value; c.notes = str(notes, 4000); if (summary) c.summary = str(summary, 4000); c.updatedAt = nowIso(); } return all; });
    }
    const targetId = customerId || (callId ? (await store.read('calls')).find((c) => c.id === callId)?.customerId : '');
    if (targetId) {
      await store.update('customers', (rows) => {
        const c = rows.find((x) => x.id === targetId);
        if (c) {
          if (value) { c.lastCallOutcome = value; c.lastContactAt = nowIso(); }
          if (['not_interested', 'wrong_number'].includes(value)) c.status = value === 'wrong_number' ? c.status : 'Not Interested';
          else if (['answered', 'completed', 'callback_requested', 'callback_booked', 'interested', 'hot_lead'].includes(value)) c.status = value === 'hot_lead' || value === 'interested' ? 'Interested' : 'Contacted';
          else if (['no_answer', 'voicemail', 'busy', 'failed'].includes(value)) c.status = 'Unreachable';
          if (nextFollowUpAt) c.nextFollowUpAt = nextFollowUpAt;
          if (Array.isArray(tags) && tags.length) c.tags = [...new Set([...(c.tags || []), ...tags.map((t) => str(t, 40))])].slice(0, 25);
          c.score = scoreLead(c);
        }
        return rows;
      });
      log('call_outcome', `Outcome recorded: ${value || 'notes only'}`, { customerId: targetId, text: str(summary || notes, 500) });
    }
    return { ok: true, callId: callId || null, customerId: targetId || null, outcome: value };
  }

  async function listCalls({ limit = 200, kind = '', status = '', customerId = '' } = {}) {
    const rows = await store.read('calls');
    return rows.filter((c) => (!kind || c.kind === kind) && (!status || c.status === status) && (!customerId || c.customerId === customerId)).slice(0, limit);
  }

  return { providers, nativeDial, openMessagesApp, send, syncStatus, syncAllPending, startProviderCall, fetchProviderCall, ingestProviderEvent, recordOutcome, listCalls, MESSAGE_STATES, mapTwilioStatus };
}

module.exports = { createOutbound, MESSAGE_STATES };
