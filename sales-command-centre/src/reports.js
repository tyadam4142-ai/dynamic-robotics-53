'use strict';
const { fmtIst, istParts, nowIso } = require('./util');
const { VERSION, integrationStatus } = require('./config');

function createReports({ store, getSettings, llm, queue, crm, campaigns, startedAt, platform }) {
  let modelCache = { at: 0, value: null };

  async function modelStatus(force = false) {
    if (!force && modelCache.value && Date.now() - modelCache.at < 15000) return modelCache.value;
    const value = await llm.status();
    modelCache = { at: Date.now(), value };
    return value;
  }

  function refreshModelCache(value) { modelCache = { at: Date.now(), value }; }

  async function health() {
    const settings = getSettings();
    const [counts, model] = await Promise.all([queue.counts(), modelStatus()]);
    const providers = integrationStatus(process.env);
    const blocked = Object.entries(providers).filter(([key, v]) => !v.ready && ['aiVoiceCall', 'sms', 'whatsapp'].includes(key)).map(([, v]) => v.label);
    const customers = await crm.list();
    return {
      ok: true,
      version: VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      platform,
      timeIst: fmtIst(new Date()),
      data: { readable: true, customers: customers.length },
      ai: { ready: model.ready, active: model.activeLabel, providers: model.providers.map((p) => ({ id: p.id, label: p.label, model: p.model, ok: p.ok, modelReady: p.modelReady, cloud: p.cloud, error: p.error })), message: model.message },
      providers,
      queue: counts,
      safety: { killSwitch: settings.agent.killSwitch, callingWindow: `${settings.calling.windowStartHour}:00-${settings.calling.windowEndHour}:00 IST`, autoExecute: settings.agent.autoExecute, requireApproval: settings.agent.requireApprovalForConsequential },
      headline: `${model.ready ? model.activeLabel : 'no model'} · ${counts.byStatus.running || 0} running, ${counts.byStatus.pending || 0} queued${settings.agent.killSwitch ? ' · KILL SWITCH ON' : ''}`,
      blockedIntegrations: blocked,
    };
  }

  async function analytics({ days = 14 } = {}) {
    const [calls, messages, customers, tasks, callbacks] = await Promise.all([
      store.read('calls'), store.read('messages'), crm.list(), queue.list({ limit: 3000 }), store.read('callbacks'),
    ]);
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000);
      const label = istParts(day).date;
      const inDay = (at) => at && istParts(new Date(at)).date === label;
      series.push({
        date: label,
        calls: calls.filter((c) => inDay(c.startedAt || c.createdAt)).length,
        connected: calls.filter((c) => inDay(c.startedAt || c.createdAt) && ['answered', 'completed', 'interested', 'hot_lead', 'callback_booked', 'callback_requested'].includes(c.outcome)).length,
        messages: messages.filter((m) => inDay(m.createdAt) && m.status !== 'draft').length,
        delivered: messages.filter((m) => inDay(m.createdAt) && ['delivered', 'read'].includes(m.status)).length,
        leads: customers.filter((c) => inDay(c.createdAt)).length,
        converted: customers.filter((c) => inDay(c.updatedAt) && c.status === 'Converted').length,
      });
    }
    const byStatus = {};
    for (const c of customers) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    const outcomes = {};
    for (const c of calls) if (c.outcome) outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;
    const messageStates = {};
    for (const m of messages) messageStates[m.status] = (messageStates[m.status] || 0) + 1;
    const totalCalls = calls.length;
    const connected = calls.filter((c) => ['answered', 'completed', 'interested', 'hot_lead', 'callback_booked', 'callback_requested'].includes(c.outcome)).length;
    return {
      series, byStatus, outcomes, messageStates,
      totals: {
        customers: customers.length, calls: totalCalls, messages: messages.length, drafts: messages.filter((m) => m.status === 'draft').length,
        tasks: { total: tasks.length, completed: tasks.filter((t) => t.status === 'completed').length, failed: tasks.filter((t) => t.status === 'failed').length, awaiting: tasks.filter((t) => t.status === 'awaiting_approval').length },
        connectRate: totalCalls ? Math.round((connected / totalCalls) * 100) : 0,
        conversionRate: customers.length ? Math.round(((byStatus.Converted || 0) / customers.length) * 100) : 0,
        callbacks: callbacks.filter((c) => c.status === 'scheduled').length,
        optedOut: customers.filter((c) => c.consent?.optOut).length,
        withoutConsent: customers.filter((c) => !c.consent?.contactApproved && !c.consent?.optOut).length,
      },
    };
  }

  async function summary(scope = 'today') {
    const [a, upcoming, campaignRows, model] = await Promise.all([analytics({ days: scope === 'week' ? 7 : scope === 'all' ? 30 : 1 }), crm.upcoming(10), campaigns.withProgress(), modelStatus()]);
    const rows = await crm.query({ sort: 'score', limit: 5 });
    const blockers = [];
    const providers = integrationStatus(process.env);
    if (!providers.aiVoiceCall.ready) blockers.push('AI voice calls need Twilio + ElevenLabs credentials (the free Mac path cannot put the AI on a cellular call).');
    if (!providers.sms.ready) blockers.push('SMS sending needs Twilio credentials.');
    if (!providers.whatsapp.ready) blockers.push('WhatsApp sending needs Twilio + an approved WhatsApp sender.');
    if (!model.ready) blockers.push(`No AI model is reachable: ${model.message}`);
    if ((await getSettings()).agent.killSwitch) blockers.push('The kill switch is ON — outbound work will not run.');
    const settings = getSettings();
    const hour = istParts(new Date()).hour;
    const outsideWindow = hour < settings.calling.windowStartHour || hour >= settings.calling.windowEndHour;
    return {
      scope, headline: `${a.totals.customers} leads, ${a.totals.calls} call(s) logged, ${a.totals.messages} message(s) sent, ${a.totals.tasks.awaiting} action(s) awaiting approval${outsideWindow ? ', outside the calling window' : ''}.`,
      totals: a.totals, byStatus: a.byStatus, outcomes: a.outcomes, messageStates: a.messageStates,
      topLeads: rows.rows.map((c) => ({ id: c.id, name: c.name, status: c.status, score: c.score, reason: c.consent?.contactApproved ? 'consent recorded' : 'consent missing' })),
      upcoming, campaigns: campaignRows.map((c) => ({ id: c.id, name: c.name, status: c.status, progress: c.progress })),
      blockers, outsideWindow,
    };
  }

  async function recentLogs({ limit = 100, type = '', q = '' } = {}) {
    const [activities, runs] = await Promise.all([store.read('activities'), store.read('logs')]);
    const merged = [...activities.map((a) => ({ ...a, source: 'audit' })), ...runs.map((l) => ({ ...l, source: l.level || 'log' }))].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const needle = String(q || '').toLowerCase();
    return merged.filter((e) => (!type || e.type === type) && (!needle || `${e.type} ${e.text}`.toLowerCase().includes(needle))).slice(0, limit);
  }

  function log(level, type, text, meta = {}) {
    store.prepend('logs', { id: require('crypto').randomUUID(), level, type, text, meta, at: nowIso() }).catch(() => {});
  }

  return { health, analytics, summary, recentLogs, log, modelStatus, refreshModelCache, VERSION };
}

module.exports = { createReports };
