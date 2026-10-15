'use strict';
const { id, nowIso, str } = require('./util');
const { STATUSES } = require('./crm');

const CAMPAIGN_STATUSES = ['draft', 'running', 'paused', 'stopped', 'completed'];

function createCampaigns({ store, log, getSettings, crm, queue }) {
  async function list() { return store.read('campaigns'); }
  async function get(campaignId) { return (await list()).find((c) => c.id === campaignId) || null; }

  async function resolveTargets(input) {
    const all = await crm.list();
    if (Array.isArray(input.customerIds) && input.customerIds.length) {
      const wanted = new Set(input.customerIds.map((x) => str(x, 60)));
      return all.filter((c) => wanted.has(c.id));
    }
    const f = input.filters || {};
    return crm.query ? (await crm.query({ ...f, limit: 500 })).rows : all;
  }

  function summarise(campaign, tasks) {
    const scoped = tasks.filter((t) => t.campaignId === campaign.id);
    const byStatus = {};
    for (const t of scoped) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    const outcomes = {};
    for (const t of scoped.filter((x) => x.kind === 'call')) {
      const outcome = t.result?.outcome || t.payload?.outcomeHint || 'unknown';
      outcomes[outcome] = (outcomes[outcome] || 0) + 1;
    }
    const completed = byStatus.completed || 0;
    const terminal = ['completed', 'failed', 'cancelled', 'skipped'].reduce((sum, s) => sum + (byStatus[s] || 0), 0);
    return {
      ...campaign,
      progress: { total: scoped.length, completed, remaining: (byStatus.pending || 0) + (byStatus.running || 0) + (byStatus.awaiting_approval || 0), needsReview: byStatus.needs_review || 0, percent: scoped.length ? Math.round((terminal / scoped.length) * 100) : 0 },
      byStatus, outcomes,
    };
  }

  async function create(input, actor = 'operator') {
    const name = str(input.name, 120);
    const objective = str(input.objective, 400);
    if (!name) return { error: 'A campaign needs a name.' };
    if (!objective) return { error: 'A campaign needs an objective, e.g. "follow up on Tap Tag sticker enquiries".' };
    const channel = ['call', 'whatsapp', 'sms', 'agent'].includes(input.channel) ? input.channel : 'call';
    const settings = getSettings();
    const targets = await resolveTargets(input);
    if (!targets.length) return { error: 'No customers matched this campaign. Pick contacts or relax the filters.' };
    const eligible = [];
    const blocked = [];
    for (const c of targets) {
      const gate = await crm.eligibility(c.id, channel === 'agent' ? 'call' : channel);
      if (gate.ok) eligible.push(c); else blocked.push({ id: c.id, name: c.name, reason: gate.reason });
    }
    if (!eligible.length) return { error: `Every selected contact is blocked (${blocked.length}). Fix consent/opt-out flags first.`, blocked: blocked.slice(0, 25) };
    const needsApproval = settings.messaging.requireApprovalForBulk && channel !== 'agent' && eligible.length > 10;
    const campaign = {
      id: id(), name, objective, channel, status: 'draft',
      openingLine: str(input.openingLine, 1200), guidelines: str(input.guidelines, 2000), messageTemplate: str(input.messageTemplate, 1600),
      customerIds: eligible.map((c) => c.id), blocked: blocked.slice(0, 50),
      maxAttempts: Math.min(5, Math.max(1, Number(input.maxAttempts) || settings.calling.maxAttemptsPerContact)),
      retryDelayMinutes: Math.min(4320, Math.max(5, Number(input.retryDelayMinutes) || settings.calling.retryDelayMinutes)),
      followUp: { days: Math.min(90, Math.max(0, Number(input.followUpDays) || 1)), action: ['followup', 'callback', 'none'].includes(input.followUpAction) ? input.followUpAction : 'followup' },
      windowStartHour: Number.isFinite(+input.windowStartHour) ? Math.min(23, Math.max(0, +input.windowStartHour)) : settings.calling.windowStartHour,
      windowEndHour: Number.isFinite(+input.windowEndHour) ? Math.min(24, Math.max(1, +input.windowEndHour)) : settings.calling.windowEndHour,
      spreadMinutes: Math.min(600, Math.max(0, Number(input.spreadMinutes) || 0)),
      approvalRequired: needsApproval, approvalId: null,
      sourceDescription: str(input.sourceDescription, 300) || `${eligible.length} of ${targets.length} matched contacts`,
      stats: { queued: 0, callsCompleted: 0, messagesCompleted: 0, completed: 0, failed: 0, cancelled: 0 },
      createdBy: actor, createdAt: nowIso(), startedAt: null, endedAt: null, updatedAt: nowIso(),
    };
    if (campaign.windowStartHour >= campaign.windowEndHour) return { error: 'The calling window must start before it ends.' };
    await store.prepend('campaigns', campaign);
    log('campaign', `Campaign "${name}" drafted for ${eligible.length} contacts via ${channel}${needsApproval ? ' (approval required)' : ''}`, { text: objective });
    return { campaign, eligible: eligible.length, blocked: blocked.length, needsApproval };
  }

  /** Turn a campaign into concrete queue entries. Idempotent per contact+attempt. */
  async function start(campaignId, actor = 'operator') {
    const campaign = await get(campaignId);
    if (!campaign) return { error: 'Campaign not found.' };
    if (campaign.status === 'running') return { error: 'That campaign is already running.' };
    if (campaign.status === 'stopped') return { error: 'A stopped campaign cannot be restarted. Create a new one so the history stays honest.' };
    if (getSettings().agent.killSwitch) return { error: 'The kill switch is on. Turn it off in Settings → Safety before starting any campaign.' };
    const customers = (await crm.list()).filter((c) => campaign.customerIds.includes(c.id));
    if (!customers.length) return { error: 'No eligible customers remain for this campaign.' };
    let queued = 0;
    const skipped = [];
    const now = Date.now();
    for (const [i, c] of customers.entries()) {
      const gate = await crm.eligibility(c.id, campaign.channel === 'agent' ? 'call' : campaign.channel);
      if (!gate.ok) { skipped.push({ name: c.name, reason: gate.reason }); continue; }
      const runAfter = new Date(now + (campaign.spreadMinutes ? Math.round((i * campaign.spreadMinutes * 60000) / customers.length) : i * 5000)).toISOString();
      let task;
      if (campaign.channel === 'agent') {
        const out = await queue.enqueue({
          kind: 'agent_goal', title: `${campaign.name}: ${c.name}`, customerId: c.id, campaignId: campaign.id,
          payload: { goal: `${campaign.objective}. Contact ${c.name} (${campaign.channel}) about ${c.product || 'their enquiry'}. Opening line: ${campaign.openingLine || 'introduce the company and ask what they need'}. Guidelines: ${campaign.guidelines || 'follow catalogue only'}.`, context: { customerId: c.id, campaignId: campaign.id, campaignName: campaign.name } },
          maxAttempts: 1, dedupeKey: `campaign:${campaign.id}:${c.id}:attempt:1`, createdBy: actor,
        });
        task = out.task;
        if (out.duplicate) { skipped.push({ name: c.name, reason: 'already queued' }); continue; }
      } else {
        const payload = campaign.channel === 'call'
          ? { phone: c.phone, customerId: c.id, customerName: c.name, purpose: campaign.objective, productInterest: c.product || '', openingLine: campaign.openingLine, guidelines: campaign.guidelines, mode: getSettings().voice.mode }
          : { phone: c.phone, customerId: c.id, customerName: c.name, channel: campaign.channel, message: renderTemplate(campaign.messageTemplate || campaign.objective, c), consentConfirmed: true, source: `campaign:${campaign.name}` };
        const out = await queue.enqueue({
          kind: campaign.channel === 'call' ? 'call' : 'message', title: `${campaign.channel === 'call' ? 'Call' : 'Message'} ${c.name}`, customerId: c.id, campaignId: campaign.id,
          payload, maxAttempts: campaign.maxAttempts, runAfter, dedupeKey: `campaign:${campaign.id}:${c.id}:attempt:1`, createdBy: actor,
        });
        task = out.task;
        if (out.duplicate) { skipped.push({ name: c.name, reason: 'already queued' }); continue; }
      }
      if (task) queued++;
    }
    await store.update('campaigns', (rows) => {
      const x = rows.find((r) => r.id === campaignId);
      x.status = 'running'; x.startedAt = x.startedAt || nowIso(); x.endedAt = null; x.stats.queued += queued; x.updatedAt = nowIso();
      return rows;
    });
    log('campaign', `Campaign "${campaign.name}" started: ${queued} task(s) queued, ${skipped.length} skipped`, { text: campaign.objective });
    return { campaign: await get(campaignId), queued, skipped: skipped.slice(0, 20) };
  }

  function renderTemplate(template, customer) {
    return String(template || '')
      .replace(/\{name\}/g, customer.name || 'there')
      .replace(/\{first_name\}/g, String(customer.name || 'there').split(' ')[0])
      .replace(/\{product\}/g, customer.product || 'your enquiry')
      .replace(/\{company\}/g, customer.company || '');
  }

  async function control(campaignId, action) {
    const campaign = await get(campaignId);
    if (!campaign) return { error: 'Campaign not found.' };
    if (!CAMPAIGN_STATUSES.includes(action) && !['pause', 'resume', 'stop'].includes(action)) return { error: `Unknown campaign action "${action}".` };
    if (action === 'pause') {
      await store.update('campaigns', (rows) => { const c = rows.find((x) => x.id === campaignId); c.status = 'paused'; c.updatedAt = nowIso(); return rows; });
      const rows = await store.read('tasks');
      for (const t of rows.filter((x) => x.campaignId === campaignId && x.status === 'pending')) await queue.pause(t.id);
      log('campaign', `Campaign "${campaign.name}" paused`);
    } else if (action === 'resume') {
      if (getSettings().agent.killSwitch) return { error: 'The kill switch is on — turn it off before resuming.' };
      await store.update('campaigns', (rows) => { const c = rows.find((x) => x.id === campaignId); c.status = 'running'; c.updatedAt = nowIso(); return rows; });
      const rows = await store.read('tasks');
      for (const t of rows.filter((x) => x.campaignId === campaignId && x.status === 'paused')) await queue.resume(t.id);
      log('campaign', `Campaign "${campaign.name}" resumed`);
    } else if (action === 'stop') {
      await store.update('campaigns', (rows) => { const c = rows.find((x) => x.id === campaignId); c.status = 'stopped'; c.endedAt = nowIso(); c.updatedAt = nowIso(); return rows; });
      const { cancelled } = await queue.cancelPending({ campaignId, reason: `Campaign "${campaign.name}" stopped` });
      log('campaign', `Campaign "${campaign.name}" stopped: ${cancelled} pending task(s) cancelled`);
    }
    return { campaign: await get(campaignId) };
  }

  async function report(campaignId) {
    const campaign = await get(campaignId);
    if (!campaign) return { error: 'Campaign not found.' };
    const tasks = await queue.list({ campaignId, limit: 2000 });
    const summary = summarise(campaign, tasks);
    const perContact = [];
    for (const customerId of campaign.customerIds) {
      const c = await crm.get(customerId);
      if (!c) continue;
      const mine = tasks.filter((t) => t.customerId === customerId);
      perContact.push({ id: c.id, name: c.name, phone: c.phone, status: c.status, lastCallOutcome: c.lastCallOutcome, attempts: mine.filter((t) => t.kind !== 'agent_goal').length, taskStates: mine.map((t) => `${t.kind}:${t.status}`).join(', ') });
    }
    return { campaign: summary, perContact: perContact.slice(0, 200), recentTasks: tasks.slice(0, 40) };
  }

  async function finishIfComplete(campaignId) {
    const campaign = await get(campaignId);
    if (!campaign || campaign.status !== 'running') return;
    const tasks = await queue.list({ campaignId, limit: 2000 });
    if (!tasks.length || tasks.some((t) => ['pending', 'running', 'awaiting_approval'].includes(t.status))) return;
    await store.update('campaigns', (rows) => { const c = rows.find((x) => x.id === campaignId); if (c && c.status === 'running') { c.status = 'completed'; c.endedAt = nowIso(); } return rows; });
    log('campaign', `Campaign "${campaign.name}" finished automatically`);
  }

  async function update(campaignId, patch) {
    return store.update('campaigns', (rows) => {
      const c = rows.find((x) => x.id === campaignId);
      if (!c) return { value: rows, result: { error: 'Campaign not found.' } };
      if (c.status === 'running') return { value: rows, result: { error: 'Pause the campaign before editing it.' } };
      for (const key of ['name', 'objective', 'openingLine', 'guidelines', 'messageTemplate']) if (patch[key] !== undefined) c[key] = str(patch[key], key === 'messageTemplate' ? 1600 : 1200);
      if (Array.isArray(patch.customerIds)) c.customerIds = patch.customerIds.map((x) => str(x, 60));
      c.updatedAt = nowIso();
      return { value: rows, result: { campaign: c } };
    });
  }

  async function withProgress() {
    const [campaigns, tasks] = await Promise.all([list(), queue.list({ limit: 3000 })]);
    return campaigns.map((c) => summarise(c, tasks));
  }

  return { create, start, control, report, list, get, update, withProgress, finishIfComplete, CAMPAIGN_STATUSES, STATUSES };
}

module.exports = { createCampaigns, CAMPAIGN_STATUSES };
