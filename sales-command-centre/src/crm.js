'use strict';
const { id, nowIso, str, normalizePhone, isValidEmail, fmtIst, istParts, fromIst, isIstDate, parseCsv, toCsv } = require('./util');

const STATUSES = ['New', 'Contacted', 'Interested', 'Follow-up Required', 'Callback Scheduled', 'Converted', 'Not Interested', 'Unreachable', 'Opted Out'];
const OUTCOMES = ['', 'answered', 'no_answer', 'busy', 'callback_requested', 'not_interested', 'wrong_number', 'voicemail', 'completed', 'failed', 'cancelled'];
const CHANNELS = ['any', 'call', 'whatsapp', 'sms'];

function scoreLead(c) {
  let score = 0;
  const weights = { Interested: 40, 'Follow-up Required': 36, 'Callback Scheduled': 32, Contacted: 18, New: 14, Unreachable: 6, Converted: 2, 'Not Interested': 0, 'Opted Out': -50 };
  score += weights[c.status] ?? 10;
  score += (Number(c.interestLevel) || 0) * 6;
  if (c.phone) score += 10;
  if (!c.consent?.optOut) score += 4; else score -= 60;
  const last = c.lastContactAt ? new Date(c.lastContactAt).getTime() : 0;
  const days = last ? (Date.now() - last) / 86400000 : 999;
  score += Math.min(18, days * 0.7);
  if (c.nextFollowUpAt && new Date(c.nextFollowUpAt) <= new Date()) score += 22;
  return Math.round(score);
}

function createCrm({ store, log, getSettings }) {
  async function list() { return store.read('customers'); }

  async function get(customerId) {
    const rows = await list();
    return rows.find((c) => c.id === customerId) || null;
  }

  function normalise(input, existing) {
    const errors = [];
    const name = str(input.name, 120);
    if (!name) errors.push('Name is required.');
    const email = str(input.email, 120).toLowerCase();
    if (email && !isValidEmail(email)) errors.push('Email is invalid.');
    let phone = '';
    const rawPhone = str(input.phone, 30);
    if (rawPhone) {
      const n = normalizePhone(rawPhone);
      if (n.error) errors.push(n.error); else phone = n.phone;
    }
    const status = input.status === undefined || input.status === '' ? (existing?.status || 'New') : str(input.status, 40);
    if (!STATUSES.includes(status)) errors.push(`Status must be one of: ${STATUSES.join(', ')}.`);
    const interestLevel = input.interestLevel === undefined || input.interestLevel === null || input.interestLevel === '' ? (existing?.interestLevel ?? null) : Math.min(5, Math.max(0, Number(input.interestLevel)));
    if (Number.isNaN(interestLevel)) errors.push('Interest level must be a number 0-5.');
    const tags = Array.isArray(input.tags) ? [...new Set(input.tags.map((t) => str(t, 40)).filter(Boolean))].slice(0, 25) : (existing?.tags || []);
    const consent = input.consent && typeof input.consent === 'object' ? {
      contactApproved: !!input.consent.contactApproved,
      channels: Array.isArray(input.consent.channels) ? [...new Set(input.consent.channels.map((t) => str(t, 20)).filter((t) => CHANNELS.includes(t) && t !== 'any'))].slice(0, 4) : [],
      optOut: !!input.consent.optOut,
      evidence: str(input.consent.evidence, 400),
    } : (existing?.consent || { contactApproved: false, channels: [], optOut: false, evidence: '' });
    const preferredChannel = CHANNELS.includes(input.preferredChannel) ? input.preferredChannel : (existing?.preferredChannel || 'any');
    return {
      error: errors.length ? errors.join(' ') : null,
      value: {
        name, email, phone, status, interestLevel, tags, consent, preferredChannel,
        company: str(input.company, 120) || (existing?.company || ''),
        source: str(input.source, 60) || existing?.source || 'Manual',
        product: str(input.product, 120) || existing?.product || '',
        notes: input.notes === undefined ? (existing?.notes || '') : str(input.notes, 4000),
        assignedAgent: str(input.assignedAgent, 60) || existing?.assignedAgent || 'me',
        nextFollowUpAt: input.nextFollowUpAt === undefined ? (existing?.nextFollowUpAt || null) : (input.nextFollowUpAt ? safeDate(input.nextFollowUpAt) : null),
      },
    };
  }

  function safeDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  async function create(input) {
    const v = normalise(input, null);
    if (v.error) return { error: v.error };
    return store.update('customers', (rows) => {
      const clash = rows.find((c) => (v.value.email && c.email === v.value.email) || (v.value.phone && c.phone === v.value.phone));
      if (clash) return { value: rows, result: { error: `Possible duplicate of "${clash.name}" (${clash.phone || clash.email}). Edit that record or search before adding.`, duplicateOf: clash.id } };
      const record = { id: id(), ...v.value, lastContactAt: null, lastCallOutcome: '', lastMessageAt: null, lastMessagePreview: '', attemptCount: 0, createdAt: nowIso(), updatedAt: nowIso(), score: scoreLead(v.value) };
      rows.unshift(record);
      log('customer', `Created lead ${record.name}${record.phone ? ` (${record.phone})` : ''}`, { customerId: record.id });
      return { value: rows, result: record };
    });
  }

  async function update(customerId, patch) {
    return store.update('customers', (rows) => {
      const i = rows.findIndex((c) => c.id === customerId);
      if (i < 0) return { value: rows, result: { error: 'Customer not found.' } };
      const v = normalise({ ...rows[i], ...patch }, rows[i]);
      if (v.error) return { value: rows, result: { error: v.error } };
      rows[i] = { ...rows[i], ...v.value, updatedAt: nowIso(), score: scoreLead({ ...rows[i], ...v.value }) };
      log('customer', `Updated ${rows[i].name}${patch.status && patch.status !== rows[i].status ? ` → ${patch.status}` : ''}`, { customerId });
      return { value: rows, result: rows[i] };
    });
  }

  async function remove(customerId) {
    return store.update('customers', (rows) => {
      const c = rows.find((x) => x.id === customerId);
      if (!c) return { value: rows, result: { error: 'Customer not found.' } };
      log('customer', `Deleted ${c.name} and their history references`, { customerId });
      return { value: rows.filter((x) => x.id !== customerId), result: { ok: true, name: c.name } };
    });
  }

  async function note(customerId, text) {
    const body = str(text, 4000);
    if (!body) return { error: 'Write a note first.' };
    return store.update('customers', (rows) => {
      const c = rows.find((x) => x.id === customerId);
      if (!c) return { value: rows, result: { error: 'Customer not found.' } };
      const stamp = `[${fmtIst(new Date())}]`;
      c.notes = `${stamp} ${body}\n${c.notes || ''}`.slice(0, 8000);
      c.updatedAt = nowIso();
      log('note', `Note added on ${c.name}`, { customerId, text: body });
      return { value: rows, result: c };
    });
  }

  function search(rows, { q = '', status = '', tag = '', channel = '', onlyWithPhone = false, optOut = '' } = {}) {
    const needle = str(q, 120).toLowerCase();
    return rows.filter((c) => {
      if (status && c.status !== status) return false;
      if (tag && !(c.tags || []).some((t) => t.toLowerCase() === tag.toLowerCase())) return false;
      if (channel && c.preferredChannel !== 'any' && c.preferredChannel !== channel) return false;
      if (onlyWithPhone && !c.phone) return false;
      if (optOut === 'yes' && !c.consent?.optOut) return false;
      if (optOut === 'no' && c.consent?.optOut) return false;
      if (!needle) return true;
      return [c.name, c.phone, c.email, c.company, c.product, c.notes, ...(c.tags || [])].join(' ').toLowerCase().includes(needle);
    });
  }

  async function query(params = {}) {
    const rows = await list();
    const sort = params.sort || 'score';
    const filtered = search(rows, params);
    const dir = params.dir === 'asc' ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'name') return dir * String(a.name).localeCompare(String(b.name));
      if (sort === 'created') return dir * (new Date(a.createdAt) - new Date(b.createdAt));
      if (sort === 'lastContact') return dir * ((a.lastContactAt ? new Date(a.lastContactAt) : 0) - (b.lastContactAt ? new Date(b.lastContactAt) : 0));
      if (sort === 'followUp') return dir * ((a.nextFollowUpAt ? new Date(a.nextFollowUpAt) : 8.64e15) - (b.nextFollowUpAt ? new Date(b.nextFollowUpAt) : 8.64e15));
      return dir * ((a.score || scoreLead(a)) - (b.score || scoreLead(b)));
    });
    const offset = Math.max(0, Number(params.offset) || 0);
    const limit = Math.min(500, Number(params.limit) || 100);
    return { rows: sorted.slice(offset, offset + limit), total: sorted.length, statuses: STATUSES };
  }

  /** Consent / reachability gate used by every outbound channel. */
  async function eligibility(customerIdOrPhone, channel = 'call') {
    const rows = await list();
    const needle = str(customerIdOrPhone, 120);
    let c = rows.find((x) => x.id === needle) || null;
    if (!c && needle) {
      const normalizedNeedle = normalizePhone(needle);
      if (!normalizedNeedle.error) c = rows.find((x) => { const pn = normalizePhone(x.phone); return !pn.error && pn.phone === normalizedNeedle.phone; }) || null;
    }
    const s = getSettings();
    if (!c) {
      const n = normalizePhone(needle);
      if (n.error) return { ok: false, reason: `No matching customer and "${needle}" is not a usable number: ${n.error}` };
      return { ok: false, reason: `${n.phone} is not in the CRM, so consent cannot be verified. Add the lead first.`, phone: n.phone };
    }
    if (!c.phone) return { ok: false, reason: `${c.name} has no phone number on record.`, customerId: c.id };
    if (c.consent?.optOut) return { ok: false, reason: `${c.name} has opted out of ${channel} contact. Do not contact them.`, customerId: c.id, optOut: true };
    if (s[channel === 'call' ? 'calling' : 'messaging'].requireConsent !== false && !c.consent?.contactApproved) {
      return { ok: false, reason: `${c.name} is not marked as having agreed to be contacted. Record the consent evidence on the customer first.`, customerId: c.id, needsConsent: true };
    }
    if (c.consent?.channels?.length && !c.consent.channels.includes(channel)) return { ok: false, reason: `${c.name} only agreed to ${c.consent.channels.join(' / ')}, not ${channel}.`, customerId: c.id };
    if (c.status === 'Converted' && channel === 'call') return { ok: true, reason: 'Converted customer — permitted, but confirm the customer wants another call.', customerId: c.id };
    if (c.status === 'Not Interested') return { ok: false, reason: `${c.name} is marked Not Interested. Only contact them if they reach out again.`, customerId: c.id };
    return { ok: true, reason: 'Eligible.', customerId: c.id, customer: publicCustomer(c), phone: c.phone };
  }

  function publicCustomer(c) {
    return { ...c, score: c.score ?? scoreLead(c) };
  }

  async function markContact({ customerId, channel, kind, summary, at = nowIso(), outcome, nextFollowUpAt, messagePreview, direction = 'out' }) {
    return store.update('customers', (rows) => {
      const c = rows.find((x) => x.id === customerId);
      if (c) {
        c.updatedAt = nowIso();
        if (channel === 'call') { if (outcome !== undefined) c.lastCallOutcome = str(outcome, 40); c.lastContactAt = at; if (kind === 'call') c.attemptCount = Number(c.attemptCount || 0) + 1; }
        if (channel === 'sms' || channel === 'whatsapp') { c.lastMessageAt = at; c.lastMessagePreview = str(messagePreview ?? summary, 200); if (!c.lastContactAt) c.lastContactAt = at; }
        if (nextFollowUpAt) c.nextFollowUpAt = nextFollowUpAt;
        c.score = scoreLead(c);
      }
      return rows;
    });
  }

  async function importCsv(csvText) {
    const rows = parseCsv(csvText).slice(0, 5000);
    if (!rows.length) return { error: 'The CSV had no data rows (a header row plus at least one record is required).' };
    const out = { added: 0, skipped: [], total: rows.length };
    await store.update('customers', (current) => {
      for (const [i, raw] of rows.entries()) {
        const mapped = {
          name: raw.name || raw.fullname || '', phone: raw.phone || raw.mobile || raw.number || '', email: raw.email || '',
          company: raw.company || '', source: raw.source || raw.leadsource || 'CSV import', status: STATUSES.includes(raw.status) ? raw.status : 'New',
          product: raw.product || '', notes: raw.notes || '', tags: str(raw.tags, 200).split(/[;|]/).map((t) => t.trim()).filter(Boolean),
          consent: { contactApproved: /^(yes|true|1|y)$/i.test(String(raw.consent || raw.optin || '')), channels: [], optOut: /^(opt.?out|no)$/i.test(String(raw.consent || '')), evidence: str(raw.consent_source || '', 200) },
        };
        const v = normalise(mapped, null);
        if (v.error) { out.skipped.push({ row: i + 2, reason: v.error }); continue; }
        if (current.some((c) => (v.value.email && c.email === v.value.email) || (v.value.phone && c.phone === v.value.phone))) { out.skipped.push({ row: i + 2, reason: 'duplicate of an existing customer' }); continue; }
        current.unshift({ id: id(), ...v.value, lastContactAt: null, lastCallOutcome: '', lastMessageAt: null, lastMessagePreview: '', attemptCount: 0, createdAt: nowIso(), updatedAt: nowIso(), score: scoreLead(v.value) });
        out.added++;
      }
      return current;
    });
    log('customer', `CSV import: ${out.added} added, ${out.skipped.length} skipped`);
    return out;
  }

  async function exportCsv(params = {}) {
    const rows = await list();
    const columns = ['name', 'phone', 'email', 'company', 'source', 'status', 'interestLevel', 'tags', 'product', 'preferredChannel', 'consentApproved', 'optOut', 'lastContactAt', 'lastCallOutcome', 'lastMessageAt', 'nextFollowUpAt', 'assignedAgent', 'notes', 'createdAt'];
    const flat = search(rows, params).map((c) => ({ ...c, tags: (c.tags || []).join('; '), consentApproved: c.consent?.contactApproved ? 'yes' : 'no', optOut: c.consent?.optOut ? 'yes' : 'no' }));
    return toCsv(flat, columns);
  }

  async function timeline(customerId, limit = 60) {
    const activities = await store.read('activities');
    return activities.filter((a) => a.customerId === customerId).slice(0, limit);
  }

  async function upcoming(limit = 50) {
    const [followups, callbacks, customers] = await Promise.all([store.read('followups'), store.read('callbacks'), list()]);
    const byId = new Map(customers.map((c) => [c.id, c.name]));
    return {
      followups: followups.filter((f) => !f.done).sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999'))).slice(0, limit)
        .map((f) => ({ ...f, customerName: byId.get(f.customerId) || f.customerName || '' })),
      callbacks: callbacks.filter((c) => c.status === 'scheduled').sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)).slice(0, limit)
        .map((c) => ({ ...c, customerName: c.customerName || byId.get(c.customerId) || '', displayAt: fmtIst(c.scheduledAt) })),
    };
  }

  async function addFollowup(input, actor = 'operator') {
    const title = str(input.title, 200);
    if (!title) return { error: 'A follow-up needs a title.' };
    const due = input.due ? safeDate(input.due) : null;
    if (input.due && !due) return { error: 'The due date is not valid.' };
    const record = { id: id(), title, customerId: str(input.customerId, 60), customerName: str(input.customerName, 120), due, priority: ['low', 'medium', 'high'].includes(input.priority) ? input.priority : 'medium', notes: str(input.notes, 2000), source: str(input.source || actor, 40), done: false, createdAt: nowIso() };
    await store.push('followups', record);
    if (record.customerId) await store.update('customers', (rows) => { const c = rows.find((x) => x.id === record.customerId); if (c && (!c.nextFollowUpAt || (due && new Date(due) < new Date(c.nextFollowUpAt)))) c.nextFollowUpAt = due || new Date(Date.now() + 86400000).toISOString(); return rows; });
    log('followup', `Follow-up created: ${title}`, { customerId: record.customerId || undefined });
    return record;
  }

  async function completeFollowup(followupId) {
    return store.update('followups', (rows) => {
      const r = rows.find((x) => x.id === followupId);
      if (!r) return { value: rows, result: { error: 'Follow-up not found.' } };
      r.done = true; r.completedAt = nowIso();
      log('followup', `Follow-up completed: ${r.title}`, { customerId: r.customerId || undefined });
      return { value: rows, result: r };
    });
  }

  async function validateCallback(input) {
    const s = getSettings();
    const customerId = str(input.customerId, 60);
    const customer = customerId ? await get(customerId) : null;
    const customerName = str(input.customerName, 120) || customer?.name || '';
    const reason = str(input.reason, 300);
    if (!customerName && !customer) return { error: 'Select a customer or enter a name.' };
    if (!reason) return { error: 'Reason is required.' };
    const date = str(input.date, 12), time = str(input.time, 8);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: 'Date (YYYY-MM-DD) and time (HH:MM) are required.' };
    if (!isIstDate(date)) return { error: 'That date does not exist.' };
    const [h, m] = time.split(':').map(Number);
    if (h > 23 || m > 59) return { error: 'That time is not valid.' };
    const when = fromIst(date, time);
    if (Number.isNaN(when.getTime())) return { error: 'Invalid date or time.' };
    if (istParts(when).date !== date) return { error: 'Invalid date.' };
    if (h < s.callbacks.startHour || h >= s.callbacks.endHour) return { error: `Callbacks are only available between ${s.callbacks.startHour}:00 and ${s.callbacks.endHour}:00 IST.` };
    if (when.getTime() <= Date.now()) return { error: 'The callback must be in the future.' };
    return { when, customerName, customerId, customer, reason, notes: str(input.notes, 1000), phone: str(input.phone, 30) || customer?.phone || '' };
  }

  async function addCallback(input) {
    const v = await validateCallback(input);
    if (v.error) return v;
    const record = { id: id(), customerId: v.customerId, customerName: v.customerName, phone: v.phone, reason: v.reason, notes: v.notes, scheduledAt: v.when.toISOString(), status: 'scheduled', source: str(input.source, 40) || 'manual', createdAt: nowIso() };
    await store.push('callbacks', record);
    if (v.customerId) await store.update('customers', (rows) => { const c = rows.find((x) => x.id === v.customerId); if (c) { c.status = 'Callback Scheduled'; c.nextFollowUpAt = record.scheduledAt; c.score = scoreLead(c); } return rows; });
    log('callback', `Callback booked with ${v.customerName} for ${fmtIst(record.scheduledAt)}`, { customerId: v.customerId || undefined, meta: { callbackId: record.id } });
    return { callback: record };
  }

  async function cancelCallback(callbackId) {
    return store.update('callbacks', (rows) => {
      const c = rows.find((x) => x.id === callbackId);
      if (!c) return { value: rows, result: { error: 'Callback not found.' } };
      c.status = 'cancelled'; c.cancelledAt = nowIso();
      log('callback', `Callback cancelled with ${c.customerName}`, { customerId: c.customerId || undefined });
      return { value: rows, result: c };
    });
  }

  async function optOut(customerId, reason = 'Requested by customer') {
    return store.update('customers', (rows) => {
      const c = rows.find((x) => x.id === customerId);
      if (!c) return { value: rows, result: { error: 'Customer not found.' } };
      c.consent = { ...(c.consent || {}), optOut: true, contactApproved: false, evidence: str(reason, 400) };
      c.status = 'Opted Out';
      c.updatedAt = nowIso();
      c.score = scoreLead(c);
      log('consent', `${c.name} marked as opted out`, { customerId, text: str(reason, 300) });
      return { value: rows, result: c };
    });
  }

  return {
    list, get, create, update, remove, note, query, eligibility, markContact, importCsv, exportCsv,
    timeline, upcoming, addFollowup, completeFollowup, addCallback, cancelCallback, validateCallback, optOut,
    STATUSES, OUTCOMES, scoreLead,
  };
}

module.exports = { createCrm, STATUSES, OUTCOMES, scoreLead };
