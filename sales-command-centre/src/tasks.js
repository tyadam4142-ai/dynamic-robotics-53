'use strict';
const { id, nowIso, str, istParts } = require('./util');

const ACTIVE = ['pending', 'running', 'awaiting_approval'];
const TERMINAL = ['completed', 'failed', 'cancelled', 'skipped'];

/**
 * Durable task queue with leases. State lives in data/tasks.json, so a restart resumes
 * work instead of losing it — except for actions that may already have happened
 * externally (calls, messages), which are parked as "needs_review" rather than re-run.
 */
function createTaskQueue({ store, log, getSettings, execute, events, notify = async () => {} }) {
  const LEASE_MS = 120000;
  let timer = null;
  let running = new Set();
  let stopping = false;

  const emit = (payload) => { if (events) events.publish('task', payload); };

  async function read() { return store.read('tasks'); }

  async function get(taskId) { return (await read()).find((t) => t.id === taskId) || null; }

  async function patch(taskId, mutator) {
    return store.update('tasks', (rows) => {
      const t = rows.find((x) => x.id === taskId);
      if (!t) return { value: rows, result: { error: 'Task not found.' } };
      const out = mutator(t);
      if (out && out.remove) return { value: rows.filter((x) => x.id !== taskId), result: { ok: true, removed: true } };
      t.updatedAt = nowIso();
      return { value: rows, result: { task: t } };
    });
  }

  async function enqueue({ kind, title, payload = {}, customerId = '', campaignId = '', priority = 'normal', runAfter = null, maxAttempts = 2, dedupeKey = '', createdBy = 'operator', approval = null, consequential = false }) {
    if (!str(title, 300)) return { error: 'A task needs a title.' };
    if (!approval && consequential && getSettings().agent.requireApprovalForConsequential) {
      approval = { id: id(), title: str(title, 200), reason: 'This action is marked consequential and needs operator approval.', status: 'pending', decision: null, origin: createdBy, createdAt: nowIso() };
    }
    const key = str(dedupeKey, 200) || `${kind}:${customerId || str(payload.phone, 20)}:${str(payload.message || payload.purpose || '', 120)}`;
    const rows = await read();
    const clash = rows.find((t) => t.dedupeKey === key && ACTIVE.includes(t.status));
    if (clash) return { duplicate: true, task: clash, message: `Already queued as task "${clash.title}" (${clash.status}).` };
    const task = {
      id: id(), kind, title: str(title, 300), payload: sanitize(payload), customerId: str(customerId, 60), campaignId: str(campaignId, 60),
      status: approval ? 'awaiting_approval' : 'pending', priority: ['low', 'normal', 'high'].includes(priority) ? priority : 'normal',
      runAfter: runAfter || null, attempts: 0, maxAttempts: Math.max(1, Math.min(5, Number(maxAttempts) || 2)),
      dedupeKey: key, leaseUntil: null, result: null, error: '', events: [{ at: nowIso(), type: 'created', text: `Queued by ${createdBy}` }],
      createdBy, approvalId: approval?.id || null, createdAt: nowIso(), startedAt: null, finishedAt: null, updatedAt: nowIso(),
    };
    await store.prepend('tasks', task);
    emit({ type: 'created', task });
    if (approval) {
      approval.taskId = task.id;
      await store.prepend('approvals', approval);
      log('approval', `Approval required before: ${title}`, { customerId: customerId || undefined, text: str(approval.reason || '', 300), meta: { approvalId: approval.id, taskId: task.id } });
    }
    return { task };
  }

  function sanitize(payload) {
    if (!payload || typeof payload !== 'object') return {};
    try { return JSON.parse(JSON.stringify(payload)); } catch { return {}; }
  }

  async function cancel(taskId, reason = 'Cancelled by operator') {
    const t = await get(taskId);
    if (!t) return { error: 'Task not found.' };
    if (TERMINAL.includes(t.status)) return { error: `That task is already ${t.status}.` };
    const out = await patch(taskId, (task) => { task.status = 'cancelled'; task.finishedAt = nowIso(); task.error = str(reason, 300); task.events.push({ at: nowIso(), type: 'cancelled', text: reason }); if (task.status === 'cancelled') task.leaseUntil = null; });
    if (t.campaignId) await bumpCampaignCounter(t.campaignId, 'cancelled');
    emit({ type: 'cancelled', task: out.task });
    log('task', `Task cancelled: ${t.title}`, { text: str(reason, 200) });
    return out;
  }

  async function pause(taskId) {
    const out = await patch(taskId, (task) => { if (TERMINAL.includes(task.status)) return {}; task.status = 'paused'; task.events.push({ at: nowIso(), type: 'paused', text: 'Paused by operator' }); });
    emit({ type: 'paused', task: out.task });
    return out;
  }

  async function resume(taskId) {
    const out = await patch(taskId, (task) => { if (TERMINAL.includes(task.status)) return {}; task.status = 'pending'; task.runAfter = null; task.events.push({ at: nowIso(), type: 'resumed', text: 'Resumed by operator' }); });
    emit({ type: 'resumed', task: out.task });
    return out;
  }

  async function retry(taskId) {
    const t = await get(taskId);
    if (!t) return { error: 'Task not found.' };
    if (!['failed', 'needs_review', 'cancelled'].includes(t.status)) return { error: `Only failed, review-parked or cancelled tasks can be retried (this one is ${t.status}).` };
    const out = await patch(taskId, (task) => { task.status = 'pending'; task.attempts = 0; task.error = ''; task.runAfter = null; task.finishedAt = null; task.events.push({ at: nowIso(), type: 'retry_requested', text: 'Retry requested by operator' }); });
    emit({ type: 'resumed', task: out.task });
    return out;
  }

  async function approve(approvalId, decision, note = '') {
    const rows = await store.read('approvals');
    const approval = rows.find((a) => a.id === approvalId);
    if (!approval) return { error: 'Approval request not found.' };
    if (approval.decision) return { error: `That request was already ${approval.decision}.` };
    await store.update('approvals', (all) => {
      const a = all.find((x) => x.id === approvalId);
      a.decision = decision === 'approve' ? 'approved' : 'rejected';
      a.decidedAt = nowIso();
      a.decidedBy = 'operator';
      a.note = str(note, 400);
      return all;
    });
    const task = approval.taskId ? await get(approval.taskId) : null;
    if (task && task.status === 'awaiting_approval') {
      if (decision === 'approve') await patch(task.id, (t) => { t.status = 'pending'; t.approvedAt = nowIso(); t.events.push({ at: nowIso(), type: 'approved', text: 'Approved by operator' }); });
      else await patch(task.id, (t) => { t.status = 'cancelled'; t.finishedAt = nowIso(); t.error = 'Rejected by operator'; t.events.push({ at: nowIso(), type: 'rejected', text: 'Rejected by operator' }); });
    }
    log('approval', `${decision === 'approve' ? 'Approved' : 'Rejected'}: ${approval.title}`, { text: str(note, 200) });
    emit({ type: 'approval', approvalId, decision });
    return { approval: await store.read('approvals').then((all) => all.find((a) => a.id === approvalId)), task };
  }

  async function bumpCampaignCounter(campaignId, field) {
    await store.update('campaigns', (rows) => { const c = rows.find((x) => x.id === campaignId); if (c) { c.stats = c.stats || {}; c.stats[field] = (c.stats[field] || 0) + 1; c.updatedAt = nowIso(); } return rows; });
  }

  function inCallingWindow(settings) {
    const hour = istParts(new Date()).hour;
    return hour >= settings.calling.windowStartHour && hour < settings.calling.windowEndHour;
  }

  async function claimNext() {
    const settings = getSettings();
    if (settings.agent.killSwitch) return null;
    const now = Date.now();
    const candidates = (await read())
      .filter((t) => t.status === 'pending' && (!t.runAfter || new Date(t.runAfter).getTime() <= now) && !running.has(t.id))
      .filter((t) => (t.kind === 'call' || t.kind === 'message') ? inCallingWindow(settings) : true)
      .sort((a, b) => (a.priority === b.priority ? new Date(a.createdAt) - new Date(b.createdAt) : (a.priority === 'high' ? -1 : b.priority === 'high' ? 1 : 0)));
    for (const candidate of candidates) {
      if (candidate.kind === 'call' || candidate.kind === 'message') {
        const gate = await rateGate(candidate.kind, settings);
        if (!gate.ok) {
          await patch(candidate.id, (t) => { t.runAfter = gate.retryAt; t.events.push({ at: nowIso(), type: 'deferred', text: gate.reason }); });
          continue;
        }
      }
      if (candidate.campaignId) {
        const campaigns = await store.read('campaigns');
        const c = campaigns.find((x) => x.id === candidate.campaignId);
        if (c && c.status !== 'running') { await patch(candidate.id, (t) => { t.status = c.status === 'paused' ? 'paused' : 'cancelled'; t.error = `Campaign is ${c.status}.`; }); continue; }
      }
      const claimed = await store.update('tasks', (rows) => {
        const t = rows.find((x) => x.id === candidate.id && x.status === 'pending');
        if (!t) return { value: rows, result: null };
        t.status = 'running'; t.attempts += 1; t.startedAt = nowIso(); t.leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
        t.events.push({ at: nowIso(), type: 'started', text: `Attempt ${t.attempts}/${t.maxAttempts}` });
        return { value: rows, result: t };
      });
      if (claimed) { running.add(candidate.id); return claimed; }
    }
    return null;
  }

  async function rateGate(kind, settings) {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const tasks = await read();
    const today = tasks.filter((t) => t.kind === kind && new Date(t.createdAt) >= since && ['running', 'completed', 'pending'].includes(t.status));
    const limit = kind === 'call' ? settings.calling.dailyCallLimit : settings.messaging.dailyMessageLimit;
    if (today.length >= limit) return { ok: false, reason: `Daily ${kind} limit (${limit}) reached — deferred to tomorrow.`, retryAt: new Date(Date.now() + 3600000).toISOString() };
    if (kind === 'call') {
      const recent = tasks.filter((t) => t.kind === 'call' && t.startedAt && Date.now() - new Date(t.startedAt).getTime() < settings.calling.minSecondsBetweenCalls * 1000);
      if (recent.length) return { ok: false, reason: `Calls are spaced ${settings.calling.minSecondsBetweenCalls}s apart.`, retryAt: new Date(new Date(recent[recent.length - 1].startedAt).getTime() + settings.calling.minSecondsBetweenCalls * 1000 + 500).toISOString() };
      if (runningCallCount() >= settings.calling.maxConcurrentCalls) return { ok: false, reason: 'A call is already in progress.', retryAt: new Date(Date.now() + 20000).toISOString() };
    }
    return { ok: true };
  }

  function runningCallCount() { return [...running].filter((taskId) => taskKinds.get(taskId) === 'call').length; }
  const taskKinds = new Map();

  async function tick() {
    if (stopping) return;
    const settings = getSettings();
    await recoverLeases();
    while (running.size < Math.max(1, settings.agent.concurrency)) {
      const task = await claimNext();
      if (!task) return;
      taskKinds.set(task.id, task.kind);
      runTask(task).finally(() => { running.delete(task.id); taskKinds.delete(task.id); });
    }
  }

  async function recoverLeases() {
    const rows = await read();
    for (const t of rows) {
      if (t.status !== 'running' || running.has(t.id)) continue;
      // At process startup, every `running` task not present in this instance's
      // in-memory worker set belongs to a prior/dead worker, even if its old lease
      // has not expired. Never replay non-idempotent calls/messages blindly.
      const nonIdempotent = ['call', 'message'].includes(t.kind);
      await patch(t.id, (task) => {
        task.status = nonIdempotent ? 'needs_review' : 'pending';
        task.leaseUntil = null;
        task.error = nonIdempotent
          ? 'The app restarted (or the worker died) while this action was running. The provider may already have completed it — check the call/message history, then retry manually.'
          : 'Re-queued after an interrupted run.';
        task.events.push({ at: nowIso(), type: 'recovered', text: task.error });
      });
      log('task_recovery', `Recovered interrupted task "${t.title}" as ${nonIdempotent ? 'needs_review' : 'pending'}`);
    }
  }

  async function heartbeat(taskId) {
    await patch(taskId, (t) => { if (t.status === 'running') t.leaseUntil = new Date(Date.now() + LEASE_MS).toISOString(); });
  }

  async function notifyTask(task, title, body) {
    try { if (getSettings().notifications && ['call', 'message'].includes(task.kind)) await notify(title, body); } catch { /* notifications must never break task execution */ }
  }

  async function runTask(task) {
    emit({ type: 'started', task });
    const settings = getSettings();
    let outcome = null;
    try {
      if (settings.agent.killSwitch) throw new KillSwitchError();
      outcome = await execute(task, { onEvent: (type, text, data) => appendEvent(task.id, type, text, data), heartbeat: () => heartbeat(task.id), getSettings });
    } catch (e) {
      outcome = { ok: false, error: e instanceof KillSwitchError ? 'Stopped by the kill switch.' : str(e.message, 400), retryable: !(e instanceof KillSwitchError) };
    }
    const fresh = await get(task.id);
    if (!fresh) return;
    if (fresh.status === 'cancelled') { emit({ type: 'cancelled', task: fresh }); return; }
    if (outcome?.ok) {
      await patch(task.id, (t) => { t.status = 'completed'; t.result = outcome.result ?? null; t.error = outcome.message || ''; t.finishedAt = nowIso(); t.leaseUntil = null; t.events.push({ at: nowIso(), type: 'completed', text: str(outcome.message || 'Done', 300) }); });
      if (task.campaignId) await bumpCampaignCounter(task.campaignId, task.kind === 'call' ? 'callsCompleted' : task.kind === 'message' ? 'messagesCompleted' : 'completed');
      const completed = await get(task.id);
      emit({ type: 'completed', task: completed });
      if (task.kind === 'call') await notifyTask(task, 'DR53 call update', `${task.title}: ${outcome.message || 'Call task completed.'}`);
      else if (task.kind === 'message') await notifyTask(task, 'DR53 message update', `${task.title}: ${outcome.message || 'Message task completed.'}`);
      return;
    }
    if (outcome?.defer) {
      await patch(task.id, (t) => { t.status = 'pending'; t.attempts = Math.max(0, t.attempts - 1); t.runAfter = outcome.runAfter || new Date(Date.now() + 60000).toISOString(); t.leaseUntil = null; t.events.push({ at: nowIso(), type: 'deferred', text: str(outcome.reason || 'Deferred', 300) }); });
      return;
    }
    const retryable = outcome?.retryable !== false && task.attempts < task.maxAttempts && settings.calling.retryDelayMinutes >= 0;
    if (retryable && !(outcome?.noRetry)) {
      const delay = (task.kind === 'call' ? settings.calling.retryDelayMinutes : 5) * 60000;
      await patch(task.id, (t) => { t.status = 'pending'; t.error = str(outcome?.error, 400); t.runAfter = new Date(Date.now() + delay).toISOString(); t.leaseUntil = null; t.events.push({ at: nowIso(), type: 'retrying', text: `${str(outcome?.error, 200)} — retry ${t.attempts}/${t.maxAttempts} scheduled` }); });
      const retryTask = await get(task.id);
      emit({ type: 'retrying', task: retryTask });
      const noticeTitle = task.kind === 'call' ? 'DR53 call rescheduled' : 'DR53 message retry scheduled';
      await notifyTask(task, noticeTitle, `${task.title}: ${str(outcome?.error, 180)}. Retry scheduled for ${new Date(retryTask.runAfter).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.`);
      return;
    }
    await patch(task.id, (t) => { t.status = outcome?.noRetry ? 'needs_review' : 'failed'; t.error = str(outcome?.error || 'The task did not complete.', 400); t.finishedAt = nowIso(); t.leaseUntil = null; t.events.push({ at: nowIso(), type: 'failed', text: t.error }); });
    if (task.campaignId) await bumpCampaignCounter(task.campaignId, 'failed');
    const failedTask = await get(task.id);
    emit({ type: 'failed', task: failedTask });
    if (task.kind === 'call') await notifyTask(task, failedTask.status === 'needs_review' ? 'DR53 call needs review' : 'DR53 call failed', `${task.title}: ${failedTask.error || 'The call task did not complete.'}`);
    else if (task.kind === 'message') await notifyTask(task, failedTask.status === 'needs_review' ? 'DR53 message needs review' : 'DR53 message failed', `${task.title}: ${failedTask.error || 'The message task did not complete.'}`);
  }

  async function appendEvent(taskId, type, text, data) {
    await patch(taskId, (t) => { t.events.push({ at: nowIso(), type: str(type, 40), text: str(text, 500), data: data || undefined }); });
    emit({ type: 'event', taskId, eventType: type, text });
  }

  class KillSwitchError extends Error { }

  async function list({ status = '', kind = '', campaignId = '', limit = 200 } = {}) {
    const rows = await read();
    return rows.filter((t) => (!status || (status === 'active' ? ACTIVE.includes(t.status) : t.status === status)) && (!kind || t.kind === kind) && (!campaignId || t.campaignId === campaignId)).slice(0, limit);
  }

  async function counts() {
    const rows = await read();
    const out = {};
    for (const t of rows) out[t.status] = (out[t.status] || 0) + 1;
    return { byStatus: out, inFlight: running.size, total: rows.length };
  }

  /** Cancel everything not yet finished — used by campaigns and the kill switch. */
  async function cancelPending({ campaignId = '', reason = 'Cancelled', kinds = [] } = {}) {
    const rows = await read();
    const targets = rows.filter((t) => ACTIVE.includes(t.status) && (!campaignId || t.campaignId === campaignId) && (!kinds.length || kinds.includes(t.kind)));
    for (const t of targets) {
      if (t.status === 'running') { await patch(t.id, (task) => { task.status = 'cancelled'; task.finishedAt = nowIso(); task.error = reason; task.events.push({ at: nowIso(), type: 'cancelled', text: reason }); }); }
      else await cancel(t.id, reason);
      if (t.campaignId) await bumpCampaignCounter(t.campaignId, 'cancelled');
    }
    return { cancelled: targets.length };
  }

  function start(intervalMs = 2000) {
    if (timer) return;
    stopping = false;
    timer = setInterval(() => { tick().catch((e) => log('task_error', `Task runner error: ${str(e.message, 200)}`)); }, intervalMs);
    timer.unref?.();
    tick().catch(() => {});
  }

  async function stop() {
    stopping = true;
    if (timer) clearInterval(timer);
    timer = null;
    const deadline = Date.now() + 1500;
    while (running.size && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  }

  return { enqueue, cancel, pause, resume, retry, approve, list, get, counts, start, stop, recoverLeases, tick, appendEvent, patch, cancelPending, isRunning: () => !!timer };
}

module.exports = { createTaskQueue, ACTIVE, TERMINAL };
