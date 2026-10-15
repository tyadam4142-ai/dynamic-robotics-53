'use strict';
/* DR53 Command Centre frontend. Every control calls a real backend endpoint; nothing is simulated. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let session = { authRequired: false, authenticated: true };
let healthCache = null;
let es = null;
let currentPage = 'Overview';

async function api(method, path, body) {
  const r = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-dr53': '1' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { error: t.slice(0, 300) || `HTTP ${r.status}` }; }
  if (r.status === 401 && session.authRequired) { showLogin(); throw new Error('Session expired — unlock again.'); }
  if (!r.ok) { const e = new Error(j.error || `Request failed (${r.status})`); e.status = r.status; e.payload = j; throw e; }
  return j;
}

const ist = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : '—');
const istDay = (d) => new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

let toastTimer = null;
function toast(text, kind = 'ok') {
  const el = $('#toast');
  el.textContent = text;
  el.className = 'toast ' + (kind === 'err' ? 'errT' : 'okT');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, kind === 'err' ? 9000 : 4500);
}
function run(promise, okMsg) {
  return promise.then((r) => { if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); return r; })
    .catch((e) => { toast(e.message, 'err'); throw e; });
}

/* ------------------------------------------------------------------ boot */

async function boot() {
  try { session = await api('GET', '/session'); } catch { session = { authRequired: false, authenticated: true }; }
  if (session.authRequired && !session.authenticated) { showLogin(); return; }
  showApp();
}

function showLogin() {
  $('#login').hidden = false; $('#nav').hidden = true; $('#main').hidden = true;
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    await api('POST', '/login', { token: $('#loginToken').value });
    $('#loginToken').value = '';
    session = await api('GET', '/session');
    showApp();
  } catch (err) { $('#loginError').textContent = err.message; }
});
$('#logoutBtn').addEventListener('click', async () => { try { await api('POST', '/logout'); } catch {} location.reload(); });

function showApp() {
  $('#login').hidden = true; $('#nav').hidden = false; $('#main').hidden = false;
  $('#logoutBtn').hidden = !session.authRequired;
  buildNav();
  connectEvents();
  refreshPills();
  setInterval(() => { $('#clock').textContent = ist(new Date()); }, 1000);
  $('#clock').textContent = ist(new Date());
  go(location.hash ? location.hash.slice(1) : 'Overview');
}
window.addEventListener('hashchange', () => { const p = location.hash.slice(1); if (PAGES[p] && p !== currentPage) go(p); });

async function refreshPills() {
  try {
    const h = await api('GET', '/health');
    healthCache = h;
    const dot = h.ai.ready ? 'ok' : 'warn';
    $('#pillAi').innerHTML = `<i class="dot ${dot}"></i>AI: ${esc(h.ai.active || 'offline')}`;
    $('#pillKill').hidden = !h.safety.killSwitch;
    $('#headline').textContent = h.headline || '';
    updateBadges();
  } catch { /* health is best-effort */ }
}

function updateBadges() {
  const open = healthCache?.queue?.byStatus?.awaiting_approval || 0;
  const b = $('[data-badge="Approvals"]');
  if (b) { b.textContent = open; b.hidden = !open; b.classList.toggle('hot', open > 0); }
}

function connectEvents() {
  if (es) es.close();
  es = new EventSource('/api/events');
  es.onopen = () => { $('#connState').textContent = 'live updates on'; };
  es.onerror = () => { $('#connState').textContent = 'reconnecting…'; };
  for (const type of ['task', 'safety', 'settings', 'activity', 'voice', 'callback']) {
    es.addEventListener(type, (event) => {
      if (type === 'callback') {
        try { const payload = JSON.parse(event.data || '{}'); if (payload.type === 'callback_due') toast(`Callback due soon: ${payload.customerName || 'customer'} — ${ist(payload.scheduledAt)}`); } catch { /* ignore malformed event */ }
      }
      if (type === 'task') {
        try {
          const payload = JSON.parse(event.data || '{}');
          const task = payload.task || {};
          if (['retrying', 'failed', 'completed', 'cancelled'].includes(payload.type) && ['call', 'message'].includes(task.kind)) {
            const prefix = payload.type === 'retrying' ? 'Rescheduled' : payload.type === 'completed' ? 'Completed' : payload.type === 'cancelled' ? 'Cancelled' : 'Needs attention';
            toast(`${prefix}: ${task.title || task.kind}${task.error ? ' — ' + task.error : ''}`, payload.type === 'failed' ? 'err' : 'ok');
          }
        } catch { /* an event may be a lightweight status-only update */ }
      }
      refreshPills();
      const liveVoiceTurn = type === 'voice' && currentPage === 'Calls & Voice' && voiceUi.session && !['ended', 'failed'].includes(voiceUi.session.state);
      if (!liveVoiceTurn && ['Tasks', 'Approvals', 'Overview', 'Calls & Voice', 'Follow-ups'].includes(currentPage)) renderCurrent();
    });
  }
}

/* ------------------------------------------------------------------ nav */

const PAGES = {
  Overview: renderOverview,
  'AI Agent': renderAgent,
  Customers: renderCustomers,
  'Calls & Voice': renderCalls,
  Messaging: renderMessaging,
  Campaigns: renderCampaigns,
  Tasks: renderTasks,
  Approvals: renderApprovals,
  'Follow-ups': renderFollowups,
  Analytics: renderAnalytics,
  Products: renderProducts,
  'Settings & System': renderSettings,
};

function buildNav() {
  $('#navButtons').innerHTML = Object.keys(PAGES)
    .map((k) => `<button data-page="${esc(k)}">${esc(k)}${k === 'Approvals' ? ' <span class="nbadge" data-badge="Approvals" hidden></span>' : ''}</button>`).join('');
  $('#navButtons').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-page]');
    if (b) go(b.dataset.page);
  });
}

async function go(name) {
  currentPage = name;
  location.hash = name;
  $$('#navButtons button').forEach((b) => b.classList.toggle('on', b.dataset.page === name));
  $('#pageTitle').textContent = name;
  $('#view').innerHTML = '<div class="empty">Loading…</div>';
  try { await PAGES[name](); } catch (e) { $('#view').innerHTML = `<div class="empty err">${esc(e.message)}</div>`; }
}
function renderCurrent() { PAGES[currentPage]().catch(() => {}); }

/* ------------------------------------------------------------------ shared bits */

const statusChip = (s) => {
  const good = ['completed', 'delivered', 'read', 'Converted', 'answered', 'interested', 'hot_lead', 'running', 'accepted', 'callback_booked'];
  const bad = ['failed', 'undelivered', 'cancelled', 'Opted Out', 'Not Interested', 'needs_review', 'dial_failed', 'Unreachable'];
  const warn = ['awaiting_approval', 'paused', 'queued', 'Callback Scheduled', 'Follow-up Required', 'sending', 'session_created', 'deferred'];
  const cls = good.includes(s) ? 'good' : bad.includes(s) ? 'bad' : warn.includes(s) ? 'warn' : '';
  return `<span class="chip ${cls}">${esc(s || '—')}</span>`;
};
const consentChip = (c) => c?.consent?.optOut ? '<span class="chip bad">opted out</span>'
  : c?.consent?.contactApproved ? '<span class="chip good">consent ✓</span>' : '<span class="chip warn">no consent</span>';

function customerOptions(customers, selectedId) {
  return '<option value="">— pick a saved customer —</option>' + customers.map((c) =>
    `<option value="${esc(c.id)}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)} · ${esc(c.phone || 'no phone')}</option>`).join('');
}

/* ------------------------------------------------------------------ 1. Overview */

async function renderOverview() {
  const [sum, health] = await Promise.all([api('GET', '/summary?scope=today'), api('GET', '/health')]);
  const t = sum.totals;
  const cards = [
    ['Leads in CRM', t.customers], ['Calls logged', t.calls], ['Messages sent', t.messages],
    ['Connect rate', t.connectRate + '%'], ['Conversion', t.conversionRate + '%'],
    ['Callbacks booked', t.callbacks], ['Awaiting approval', t.tasks.awaiting], ['Opted out', t.optedOut],
  ];
  $('#view').innerHTML = `
    <div class="grid">${cards.map(([l, v]) => `<div class="card stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    ${sum.blockers.length ? `<div class="card warnCard"><h3>Needs attention before outreach works</h3><ul>${sum.blockers.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>` : ''}
    ${health.safety.killSwitch ? '<div class="card badCard"><b>Kill switch is ON.</b> No outbound calls or messages will run until it is switched off in Settings &amp; System.</div>' : ''}
    <div class="grid2">
      <div class="card">
        <div class="sectionTitle"><h2>Top leads to act on</h2><button class="ghost small" data-nav="Customers">Open CRM</button></div>
        ${sum.topLeads.length ? `<table><tr><th>Lead</th><th>Status</th><th>Score</th><th>Consent</th></tr>${sum.topLeads.map((c) => `<tr><td>${esc(c.name)}</td><td>${statusChip(c.status)}</td><td>${c.score}</td><td class="subtle">${esc(c.reason)}</td></tr>`).join('')}</table>` : '<div class="empty">No leads yet. Add customers or import a CSV from the Customers page.</div>'}
      </div>
      <div class="card">
        <div class="sectionTitle"><h2>Coming up</h2><button class="ghost small" data-nav="Follow-ups">Open follow-ups</button></div>
        ${(sum.upcoming.followups.length + sum.upcoming.callbacks.length) ? '' : '<div class="empty">Nothing scheduled. Book callbacks or create follow-ups.</div>'}
        ${sum.upcoming.callbacks.map((c) => `<div class="logRow"><span class="lt">${esc(istDay(c.scheduledAt))}</span><span class="chip info">callback</span> ${esc(c.customerName || c.phone)} — ${esc(c.reason)}</div>`).join('')}
        ${sum.upcoming.followups.map((f) => `<div class="logRow"><span class="lt">${f.due ? esc(istDay(f.due)) : '—'}</span><span class="chip">follow-up</span> ${esc(f.title)}${f.customerName ? ` · ${esc(f.customerName)}` : ''}</div>`).join('')}
      </div>
    </div>
    <div class="grid2">
      <div class="card">
        <div class="sectionTitle"><h2>Campaigns</h2><button class="ghost small" data-nav="Campaigns">Open campaigns</button></div>
        ${sum.campaigns.length ? sum.campaigns.map((c) => `<div class="logRow"><span style="flex:1">${esc(c.name)} ${statusChip(c.status)}</span><span class="bar" style="width:110px"><i style="width:${c.progress?.percent || 0}%"></i></span> <span class="subtle">${c.progress?.percent || 0}%</span></div>`).join('') : '<div class="empty">No campaigns yet.</div>'}
      </div>
      <div class="card">
        <div class="sectionTitle"><h2>System</h2><button class="ghost small" data-nav="Settings & System">Open settings</button></div>
        <dl class="kv">
          <dt>Version</dt><dd>${esc(health.version)} on ${esc(health.platform)}</dd>
          <dt>AI model</dt><dd>${esc(health.ai.active)}${health.ai.ready ? '' : ' — ' + esc(health.ai.message || '')}</dd>
          <dt>Queue</dt><dd>${esc(health.headline)}</dd>
          <dt>Calling window</dt><dd>${esc(health.safety.callingWindow)}</dd>
          <dt>Approvals</dt><dd>${health.safety.requireApproval ? 'Consequential actions need approval' : 'Auto-execute is on'}</dd>
        </dl>
      </div>
    </div>`;
  $('#view').addEventListener('click', (e) => { const b = e.target.closest('[data-nav]'); if (b) go(b.dataset.nav); });
}

/* ------------------------------------------------------------------ 2. AI Agent */

const agentState = { conversationId: null, threads: [], busy: false };

async function renderAgent() {
  agentState.threads = await api('GET', '/conversations');
  if (!agentState.conversationId && agentState.threads[0]) agentState.conversationId = agentState.threads[0].id;
  const convo = agentState.conversationId ? await api('GET', '/conversations/' + agentState.conversationId) : null;
  const tools = await api('GET', '/tools');
  const health = healthCache || await api('GET', '/health');

  $('#view').innerHTML = `
    <div class="card ${health.ai.ready ? '' : 'warnCard'}">
      <b>Model: ${esc(health.ai.active)}</b> — ${health.ai.ready
        ? 'The agent reasons with this model and executes real tools (CRM changes, queued calls/messages, tasks).'
        : esc(health.ai.message || 'No model reachable.') + ' The agent falls back to built-in catalogue-aware rules and will say so in its replies.'}
      Consequential actions (sending messages, starting AI calls, launching campaigns) are held for your approval on the Approvals page.
    </div>
    <div class="agentLayout">
      <div>
        <button class="b wide" id="newThread">+ New instruction thread</button>
        <div class="threadList" id="threadList" style="margin-top:10px">
          ${agentState.threads.map((t) => `<button data-id="${esc(t.id)}" class="${t.id === agentState.conversationId ? 'on' : ''}">${esc(t.title || 'Thread')}<br><span class="subtle">${esc(ist(t.updatedAt || t.createdAt))}</span></button>`).join('') || '<div class="empty">No threads yet.</div>'}
        </div>
        <div class="card" style="margin-top:12px"><h3>${tools.length} registered tools</h3><p class="subtle">The agent can use these after validating inputs. Read tools run freely; write tools follow settings; consequential tools need your approval.</p>
        <div class="row">${tools.slice(0, 12).map((t) => `<span class="chip" title="${esc(t.description)}">${esc(t.name)}</span>`).join('')}<span class="chip">+${tools.length - 12} more</span></div></div>
      </div>
      <div>
        <div class="chatLog" id="chatLog"></div>
        <div class="composer">
          <textarea id="agentInput" placeholder="Tell the agent what to do — e.g. “Find my hottest leads and queue a follow-up task for each”, or “Draft a WhatsApp follow-up for the Tap Tag Card”"></textarea>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="b" id="agentSend">Run</button>
            <button class="ghost" id="agentStop">Stop</button>
          </div>
        </div>
        <div class="row">
          ${['Prioritise my leads', 'Check the calling setup', 'Draft a WhatsApp follow-up template', 'What should I do next?'].map((q) => `<button class="ghost small agentQuick">${esc(q)}</button>`).join('')}
        </div>
      </div>
    </div>`;

  const logEl = $('#chatLog');
  const drawMsgs = (messages) => {
    logEl.innerHTML = (messages || []).map((m) => `
      <div class="msg ${m.role === 'user' ? 'user' : 'assistant'}">${esc(m.content)}
        ${m.trace?.length ? `<div class="trace">${m.trace.map((t) => `<div><span class="${t.ok ? 't-ok' : t.summary.includes('approval') ? 't-held' : 't-fail'}">●</span> ${esc(t.tool)} — ${esc(t.summary || '')}</div>`).join('')}</div>` : ''}
        <div class="meta">${m.role === 'assistant' ? esc(m.provider || '') + ' · ' : ''}${esc(ist(m.at))}</div>
      </div>`).join('') || '<div class="empty">Give the agent an instruction below. It will use real CRM tools and show every step.</div>';
    logEl.scrollTop = logEl.scrollHeight;
  };
  drawMsgs(convo?.messages);

  $('#newThread').onclick = async () => {
    const c = await run(api('POST', '/conversations', {}), 'New thread started');
    agentState.conversationId = c.id;
    renderAgent();
  };
  $('#threadList').onclick = (e) => {
    const b = e.target.closest('button[data-id]');
    if (b) { agentState.conversationId = b.dataset.id; renderAgent(); }
  };
  $$('.agentQuick').forEach((b) => b.onclick = () => { $('#agentInput').value = b.textContent; $('#agentInput').focus(); });

  const send = async () => {
    if (agentState.busy) return;
    const text = $('#agentInput').value.trim();
    if (!text) return;
    agentState.busy = true;
    $('#agentInput').value = '';
    $('#agentSend').disabled = true; $('#agentSend').textContent = 'Working…';
    logEl.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(text)}</div><div class="msg assistant" id="thinking"><span class="subtle">The agent is reasoning and using tools…</span></div>`);
    logEl.scrollTop = logEl.scrollHeight;
    try {
      const r = await api('POST', '/agent/run', { conversationId: agentState.conversationId, text });
      agentState.conversationId = r.conversationId;
      await renderAgent();
      if (r.message?.trace?.some((t) => !t.ok && /approval/i.test(t.summary || ''))) toast('An action is waiting for your approval on the Approvals page.');
    } catch (e) {
      $('#thinking')?.remove();
      logEl.insertAdjacentHTML('beforeend', `<div class="msg assistant"><span class="err">${esc(e.message)}</span></div>`);
    } finally { agentState.busy = false; }
  };
  $('#agentSend').onclick = send;
  $('#agentInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  $('#agentStop').onclick = () => run(api('POST', '/agent/stop', {}), (r) => r.stopped ? 'Stopped. Anything already delivered cannot be recalled.' : 'Nothing was running.');
}

/* ------------------------------------------------------------------ 3. Customers */

const custState = { q: '', status: '', sort: 'score', statuses: [] };

async function renderCustomers() {
  const params = new URLSearchParams({ q: custState.q, status: custState.status, sort: custState.sort, limit: '200' });
  const data = await api('GET', '/customers?' + params);
  custState.statuses = data.statuses;
  $('#view').innerHTML = `
    <div class="card">
      <div class="sectionTitle"><h2>Customers & leads (${data.total})</h2>
        <div class="row" style="margin:0">
          <input id="cSearch" placeholder="Search name, phone, notes, tags…" value="${esc(custState.q)}" style="width:240px">
          <select id="cStatus"><option value="">All statuses</option>${data.statuses.map((s) => `<option ${s === custState.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
          <select id="cSort">${[['score', 'Sort: score'], ['name', 'Sort: name'], ['created', 'Sort: newest'], ['lastContact', 'Sort: last contact'], ['followUp', 'Sort: next follow-up']].map(([v, l]) => `<option value="${v}" ${v === custState.sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <a class="ghost small" href="/api/customers.csv" download="dr53-customers.csv">Export CSV</a>
        </div>
      </div>
      <div style="overflow-x:auto"><table>
        <tr><th>Name</th><th>Phone</th><th>Status</th><th>Score</th><th>Interest</th><th>Consent</th><th>Last contact</th><th>Next follow-up</th><th></th></tr>
        ${data.rows.map((c) => `<tr>
          <td><b>${esc(c.name)}</b>${c.company ? `<br><span class="subtle">${esc(c.company)}</span>` : ''}${c.tags?.length ? `<br>${c.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join(' ')}` : ''}</td>
          <td class="mono">${esc(c.phone || '—')}</td>
          <td>${statusChip(c.status)}</td><td>${c.score ?? '—'}</td>
          <td>${c.interestLevel != null ? '★'.repeat(c.interestLevel) || '0' : '—'}</td>
          <td>${consentChip(c)}</td>
          <td class="subtle">${c.lastContactAt ? ist(c.lastContactAt) : 'never'}</td>
          <td class="subtle">${c.nextFollowUpAt ? ist(c.nextFollowUpAt) : '—'}</td>
          <td><button class="ghost small" data-open="${esc(c.id)}">Open</button></td>
        </tr>`).join('') || '<tr><td colspan="9"><div class="empty">No customers match. Add one below or import a CSV.</div></td></tr>'}
      </table></div>
    </div>
    <div class="grid2">
      <div class="card">
        <h2>Add customer</h2>
        <div class="fieldGrid">
          <input id="ncName" placeholder="Name *">
          <input id="ncPhone" placeholder="Phone, e.g. +919876543210">
          <input id="ncEmail" placeholder="Email">
          <input id="ncCompany" placeholder="Company">
          <input id="ncProduct" placeholder="Product interest">
          <input id="ncSource" placeholder="Source (walk-in, referral…)" value="Manual">
        </div>
        <label class="consent"><input type="checkbox" id="ncConsent"><span>This person agreed to be contacted about their enquiry (consent recorded).</span></label>
        <textarea id="ncNotes" class="wide" rows="2" placeholder="Notes"></textarea>
        <div class="row"><button class="b" id="ncAdd">Save customer</button></div>
      </div>
      <div class="card">
        <h2>Import CSV</h2>
        <p class="subtle">Header row required. Columns like <code>name,phone,email,company,source,status,product,notes,tags,consent</code>. Duplicates (same email/phone) are skipped and reported, not overwritten.</p>
        <input type="file" id="csvFile" accept=".csv,text/csv" class="wide">
        <div class="row"><button class="b" id="csvImport">Import</button></div>
        <div id="csvResult" class="subtle"></div>
      </div>
    </div>
    <div id="drawerHost"></div>`;

  let deb = null;
  $('#cSearch').oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { custState.q = e.target.value; renderCustomers(); }, 350); };
  $('#cStatus').onchange = (e) => { custState.status = e.target.value; renderCustomers(); };
  $('#cSort').onchange = (e) => { custState.sort = e.target.value; renderCustomers(); };
  $('#ncAdd').onclick = () => run(api('POST', '/customers', {
    name: $('#ncName').value, phone: $('#ncPhone').value, email: $('#ncEmail').value, company: $('#ncCompany').value,
    product: $('#ncProduct').value, source: $('#ncSource').value, notes: $('#ncNotes').value,
    consent: { contactApproved: $('#ncConsent').checked, channels: [], optOut: false, evidence: $('#ncConsent').checked ? 'Recorded in the add-customer form by the operator' : '' },
  }), 'Customer saved').then(renderCustomers);
  $('#csvImport').onclick = async () => {
    const f = $('#csvFile').files[0];
    if (!f) return toast('Choose a CSV file first.', 'err');
    const text = await f.text();
    const r = await run(api('POST', '/customers/import', { csv: text }), (x) => `Imported ${x.added} of ${x.total}.`);
    $('#csvResult').innerHTML = r.skipped.length ? `<span class="warn2">Skipped:</span><br>` + r.skipped.slice(0, 20).map((s) => `Row ${s.row}: ${esc(s.reason)}`).join('<br>') : 'No rows skipped.';
    renderCustomers();
  };
  $('#view').onclick = (e) => { const b = e.target.closest('[data-open]'); if (b) openCustomerDrawer(b.dataset.open); };
}

async function openCustomerDrawer(customerId) {
  const d = await run(api('GET', '/customers/' + customerId));
  const c = d.customer;
  const host = $('#drawerHost');
  host.innerHTML = `
    <div class="drawer">
      <div class="sectionTitle"><h2>${esc(c.name)}</h2><button class="ghost" id="drawerClose">✕ Close</button></div>
      <dl class="kv">
        <dt>Phone</dt><dd class="mono">${esc(c.phone || '—')}</dd>
        <dt>Email</dt><dd>${esc(c.email || '—')}</dd>
        <dt>Company</dt><dd>${esc(c.company || '—')}</dd>
        <dt>Source</dt><dd>${esc(c.source || '—')}</dd>
        <dt>Score</dt><dd>${c.score ?? '—'}</dd>
        <dt>Product</dt><dd>${esc(c.product || '—')}</dd>
        <dt>Consent</dt><dd>${consentChip(c)} ${c.consent?.evidence ? `<span class="subtle">${esc(c.consent.evidence)}</span>` : ''}</dd>
        <dt>Attempts</dt><dd>${c.attemptCount || 0} call(s)</dd>
      </dl>
      <hr class="sep">
      <h3>Edit</h3>
      <div class="fieldGrid">
        <select id="edStatus">${custState.statuses.map((s) => `<option ${s === c.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <select id="edInterest">${[['', 'Interest level…'], [0, '0 — cold'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5 — hot']].map(([v, l]) => `<option value="${v}" ${String(c.interestLevel ?? '') === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="edChannel">${['any', 'call', 'whatsapp', 'sms'].map((ch) => `<option ${ch === c.preferredChannel ? 'selected' : ''}>${ch}</option>`).join('')}</select>
        <input id="edProduct" value="${esc(c.product || '')}" placeholder="Product interest">
      </div>
      <label class="consent"><input type="checkbox" id="edConsent" ${c.consent?.contactApproved ? 'checked' : ''}><span>Consent to contact recorded</span></label>
      <input id="edEvidence" class="wide" placeholder="Consent evidence (call recording ref, form, date…)" value="${esc(c.consent?.evidence || '')}">
      <div class="row">
        <button class="b" id="edSave">Save changes</button>
        ${c.consent?.optOut ? '' : '<button class="ghost" id="edOptOut">Mark opted out</button>'}
        <button class="b danger" id="edDelete">Delete</button>
      </div>
      <hr class="sep">
      <h3>Add note</h3>
      <textarea id="noteText" class="wide" rows="2" placeholder="Call summary, preference, promise made…"></textarea>
      <div class="row"><button class="b" id="noteAdd">Add note</button></div>
      <hr class="sep">
      <h3>Timeline</h3>
      ${d.timeline.length ? d.timeline.map((t) => `<div class="logRow"><span class="lt">${esc(ist(t.at))}</span> <span class="chip">${esc(t.type)}</span> ${esc(t.text)}</div>`).join('') : '<div class="empty">No activity yet.</div>'}
      <h3 style="margin-top:14px">Notes</h3>
      <div class="subtle" style="white-space:pre-wrap">${esc(c.notes || 'No notes.')}</div>
    </div>`;
  $('#drawerClose').onclick = () => { host.innerHTML = ''; };
  $('#edSave').onclick = () => run(api('PUT', '/customers/' + c.id, {
    status: $('#edStatus').value, interestLevel: $('#edInterest').value === '' ? null : +$('#edInterest').value,
    preferredChannel: $('#edChannel').value, product: $('#edProduct').value,
    consent: { contactApproved: $('#edConsent').checked, channels: c.consent?.channels || [], optOut: !!c.consent?.optOut, evidence: $('#edEvidence').value },
  }), 'Saved').then(() => { host.innerHTML = ''; renderCustomers(); });
  $('#edOptOut')?.addEventListener('click', () => {
    const reason = prompt('Reason for opt-out (recorded for compliance):', 'Customer asked not to be contacted');
    if (reason === null) return;
    run(api('POST', `/customers/${c.id}/opt-out`, { reason }), 'Opted out. All outreach to this contact is now blocked.')
      .then(() => { host.innerHTML = ''; renderCustomers(); });
  });
  $('#edDelete').onclick = () => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    run(api('DELETE', `/customers/${c.id}?confirm=true`), 'Deleted').then(() => { host.innerHTML = ''; renderCustomers(); });
  };
  $('#noteAdd').onclick = () => run(api('POST', `/customers/${c.id}/notes`, { text: $('#noteText').value }), 'Note added').then(() => openCustomerDrawer(c.id));
}

/* ------------------------------------------------------------------ 4. Calls & Voice */

const voiceUi = {
  session: null, rec: null, bargeRec: null, listening: false, speaking: false, busy: false,
  autoListen: true, initializedFor: null, speechVoice: null, speechGeneration: 0,
  currentSpeechText: '', interrupting: false, bargeInPending: false, pendingBargeText: '',
  bargeCandidate: '', bargeTimer: null, bargeTextQueued: false, drainBargeIn: null,
  voicePreference: 'natural-local', speechRate: 0.96, quickSavedCustomer: null, quickSavedKey: '', quickSaveKeyInFlight: '', quickSavePromise: null,
  micMonitor: null, vadStartPromise: null, vadUnavailable: false,
};

function refreshNaturalVoice() {
  const synth = window.speechSynthesis;
  if (!synth?.getVoices) return;
  const voices = synth.getVoices().filter(v => /^en(-|_)/i.test(v.lang || ''));
  if (!voices.length) return;
  const preferredNames = [
    /ava.*(enhanced|premium)/i, /samantha.*(enhanced|premium)/i, /daniel.*(enhanced|premium)/i,
    /ava/i, /samantha/i, /allison/i, /daniel/i, /karen/i, /moira/i, /nicky/i, /rishi/i,
  ];
  let selected = null;
  const requested = String(voiceUi.voicePreference || 'natural-local').trim().toLowerCase();
  if (requested && !['natural-local', 'system', 'auto'].includes(requested)) {
    selected = voices.find(v => v.name.toLowerCase() === requested && v.localService !== false)
      || voices.find(v => v.name.toLowerCase().includes(requested) && v.localService !== false);
  }
  for (const pat of selected ? [] : preferredNames) {
    selected = voices.find(v => pat.test(v.name) && v.localService !== false);
    if (selected) break;
  }
  if (!selected) selected = voices.find(v => /enhanced|premium|natural/i.test(v.name) && v.localService !== false);
  if (!selected) selected = voices.find(v => /^en-IN$/i.test(v.lang) && v.localService !== false);
  if (!selected) selected = voices.find(v => v.localService !== false && /^en-(US|GB|AU|CA)/i.test(v.lang));
  if (!selected) selected = voices.find(v => v.localService !== false) || voices[0];
  voiceUi.speechVoice = selected;
}
if (window.speechSynthesis) {
  refreshNaturalVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshNaturalVoice);
}

function normaliseVoiceText(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9₹]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function looksLikeSpeakerEcho(candidate, spoken) {
  const heard = normaliseVoiceText(candidate);
  const said = normaliseVoiceText(spoken);
  if (!heard || heard.length < 3) return true;
  // Ignore short transcripts that are contained in the assistant's current spoken reply.
  // This is a practical guard against the Mac microphone hearing its own speakers.
  if (said.includes(heard)) return true;
  const heardWords = heard.split(' ');
  const saidWords = said.split(' ');
  if (heardWords.length >= 2 && heardWords.length <= saidWords.length) {
    const firstWords = saidWords.slice(0, heardWords.length).join(' ');
    if (firstWords === heard) return true;
  }
  return false;
}

function stopBargeRecognition() {
  const rec = voiceUi.bargeRec;
  voiceUi.bargeRec = null;
  if (voiceUi.rec === rec) voiceUi.rec = null;
  if (!voiceUi.bargeInPending) voiceUi.listening = false;
  if (rec) { try { rec.stop(); } catch { try { rec.abort(); } catch {} } }
}

function queueBargeInText(text) {
  const clean = String(text || '').trim();
  if (!clean || voiceUi.bargeTextQueued || looksLikeSpeakerEcho(clean, voiceUi.currentSpeechText)) return;
  voiceUi.bargeTextQueued = true;
  if (voiceUi.bargeTimer) { clearTimeout(voiceUi.bargeTimer); voiceUi.bargeTimer = null; }
  voiceUi.pendingBargeText = clean;
  voiceUi.bargeInPending = true;
  stopBargeRecognition();
  voiceUi.listening = false;
  if ($('#vcState')) $('#vcState').textContent = 'I heard you — processing your turn';
  if (typeof voiceUi.drainBargeIn === 'function') voiceUi.drainBargeIn();
}

function startBargeRecognition(spoken, speechToken) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || !voiceUi.autoListen || !voiceUi.session) return;
  if (voiceUi.bargeRec) { try { voiceUi.bargeRec.stop(); } catch {} }
  const rec = new SR();
  voiceUi.bargeRec = rec;
  voiceUi.rec = rec;
  voiceUi.listening = true;
  voiceUi.bargeCandidate = '';
  rec.lang = 'en-IN';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onstart = () => {
    if (voiceUi.bargeRec === rec && voiceUi.speaking) {
      if ($('#vcState')) $('#vcState').textContent = 'speaking — you can interrupt at any time';
      if ($('#vcListen')) $('#vcListen').textContent = '⏹ Pause listening';
    }
  };
  rec.onresult = (ev) => {
    if (voiceUi.bargeRec !== rec || speechToken !== voiceUi.speechGeneration || (!voiceUi.speaking && !voiceUi.interrupting)) return;
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i];
      const candidate = String(result?.[0]?.transcript || '').trim();
      if (!candidate || looksLikeSpeakerEcho(candidate, spoken)) continue;
      const oneWordInterrupt = /^(no|stop|wait|hold on|one moment|actually|sorry|excuse me|yes|yeah|hello|listen|but)\b/i.test(candidate);
      if (!result.isFinal && candidate.split(/\s+/).length < 2 && !oneWordInterrupt) continue;
      voiceUi.bargeCandidate = candidate;
      if (!voiceUi.interrupting) {
        voiceUi.interrupting = true;
        voiceUi.bargeInPending = true;
        // Cancel audio immediately but keep this recognizer alive until the customer's
        // final transcript arrives; the generation token remains valid for this turn.
        voiceUi.speaking = false;
        try { window.speechSynthesis?.cancel(); } catch {}
        if ($('#vcState')) $('#vcState').textContent = 'I hear you — go ahead';
        if ($('#vcInterrupt')) $('#vcInterrupt').disabled = true;
        if (voiceUi.bargeTimer) clearTimeout(voiceUi.bargeTimer);
        voiceUi.bargeTimer = setTimeout(() => {
          if (voiceUi.bargeInPending && voiceUi.bargeCandidate) queueBargeInText(voiceUi.bargeCandidate);
        }, 2400);
      }
      if (result.isFinal) queueBargeInText(candidate);
    }
  };
  rec.onerror = (ev) => {
    if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(ev.error)) {
      if ($('#vcState') && voiceUi.speaking) $('#vcState').textContent = 'microphone unavailable — type the reply';
    }
  };
  rec.onend = () => {
    if (voiceUi.bargeRec === rec) {
      voiceUi.bargeRec = null;
      if (voiceUi.rec === rec) voiceUi.rec = null;
      if (!voiceUi.bargeInPending) voiceUi.listening = false;
    }
    // Some browsers terminate recognition mid-utterance. Re-arm it while the same
    // assistant sentence is still playing, but never after a user interruption.
    if (voiceUi.speaking && !voiceUi.interrupting && voiceUi.autoListen && voiceUi.session && voiceUi.speechGeneration === speechToken) {
      setTimeout(() => {
        if (voiceUi.speaking && !voiceUi.interrupting && voiceUi.speechGeneration === speechToken && !voiceUi.bargeRec) {
          startBargeRecognition(spoken, speechToken);
        }
      }, 300);
    }
  };
  try { rec.start(); } catch { if (voiceUi.bargeRec === rec) voiceUi.bargeRec = null; voiceUi.listening = false; }
}

function callContactKey(name, phone) {
  return `${String(name || '').trim().toLowerCase()}|${String(phone || '').replace(/\D/g, '')}`;
}

async function persistConfirmedCallConsent(customer) {
  if (!customer?.id) return customer;
  if (customer.consent?.optOut || customer.status === 'Opted Out') {
    throw new Error('This contact has opted out. DR53 will not start an outreach session for them.');
  }
  const channels = [...new Set([...(customer.consent?.channels || []), 'call'])];
  if (customer.consent?.contactApproved && channels.every((c) => (customer.consent?.channels || []).includes(c))) return customer;
  const result = await api('PUT', `/customers/${customer.id}`, {
    consent: {
      contactApproved: true, channels, optOut: false,
      evidence: 'Operator confirmed consent in the Calls & Voice screen',
    },
  });
  return result.customer || result;
}

async function autoSaveCallContact() {
  const select = $('#vcCustomer');
  if (!select || select.value) return null;
  const name = String($('#vcName')?.value || '').trim();
  const phone = String($('#vcPhone')?.value || '').trim();
  const digits = phone.replace(/\D/g, '');
  if (name.length < 2 || digits.length < 10) return null;
  const key = callContactKey(name, phone);
  if (voiceUi.quickSavedKey === key && voiceUi.quickSavedCustomer) return voiceUi.quickSavedCustomer;
  if (voiceUi.quickSavePromise && voiceUi.quickSaveKeyInFlight === key) return voiceUi.quickSavePromise;
  voiceUi.quickSaveKeyInFlight = key;
  voiceUi.quickSavePromise = api('POST', '/customers/quick-save', {
    name, phone, product: String($('#vcProduct')?.value || '').trim(), source: 'Calls & Voice',
    notes: 'Contact automatically saved from Calls & Voice.',
    consent: { contactApproved: false, channels: [], optOut: false, evidence: '' },
  }).then((saved) => {
    const customer = saved.customer;
    if (!customer?.id) throw new Error('DR53 could not save this contact. Check the name and phone number.');
    voiceUi.quickSavedKey = key;
    voiceUi.quickSavedCustomer = customer;
    let option = [...select.options].find((o) => o.value === customer.id);
    if (!option) {
      option = document.createElement('option'); option.value = customer.id; option.textContent = `${customer.name} — ${customer.phone || 'no phone'}`; select.append(option);
    }
    select.value = customer.id;
    if (saved.duplicate) {
      $('#vcName').value = customer.name || name;
      $('#vcPhone').value = customer.phone || phone;
    }
    const status = $('#callStartResult');
    if (status) status.textContent = saved.duplicate ? `Found and selected existing CRM contact: ${customer.name}.` : `Auto-saved ${customer.name} to the local DR53 CRM.`;
    return customer;
  }).catch((error) => {
    const status = $('#callStartResult'); if (status) status.textContent = `Contact not saved yet: ${error.message}`;
    return null;
  }).finally(() => {
    voiceUi.quickSavePromise = null; voiceUi.quickSaveKeyInFlight = '';
  });
  return voiceUi.quickSavePromise;
}

async function ensureCallCustomer(payload) {
  let customer;
  if (payload.customerId) {
    const detail = await api('GET', `/customers/${payload.customerId}`);
    customer = detail.customer || detail;
    if (!customer?.id) throw new Error('The selected CRM contact could not be loaded. Refresh and try again.');
    if (customer.consent?.optOut || customer.status === 'Opted Out') {
      throw new Error('This contact has opted out. DR53 will not start an outreach session for them.');
    }
    if (payload.productInterest && payload.productInterest !== customer.product) {
      const update = await api('PUT', `/customers/${customer.id}`, { product: payload.productInterest });
      customer = update.customer || update;
    }
    if (payload.operatorConfirmed) customer = await persistConfirmedCallConsent(customer);
    return { ...payload, customerId: customer.id, customerName: customer.name, phone: customer.phone || payload.phone };
  }
  const name = String(payload.customerName || '').trim();
  const phone = String(payload.phone || '').trim();
  if (!name && !phone) throw new Error('Choose a saved customer or enter a customer name and phone number.');
  if (!name) throw new Error('Enter the new customer’s name so DR53 can save the contact in the CRM.');
  if (!phone) throw new Error('Enter the customer’s phone number before starting.');
  const confirmed = !!payload.operatorConfirmed;
  const saved = await api('POST', '/customers/quick-save', {
    name, phone, product: payload.productInterest || '', source: 'Calls & Voice',
    notes: 'Contact created automatically from Calls & Voice.',
    consent: { contactApproved: confirmed, channels: confirmed ? ['call'] : [], optOut: false, evidence: confirmed ? 'Operator confirmed consent in the Calls & Voice screen' : '' },
  });
  customer = saved.customer;
  if (!customer?.id) throw new Error('DR53 could not save the customer. Please retry.');
  if (saved.duplicate) toast(saved.message || 'Existing CRM customer matched; reused its record.');
  else toast('Customer saved to the local DR53 CRM.');
  if (confirmed) customer = await persistConfirmedCallConsent(customer);
  return { ...payload, customerId: customer.id, customerName: customer.name, phone: customer.phone };
}

async function renderCalls() {
  const [calls, cap, sessions, customers, health, settings] = await Promise.all([
    api('GET', '/calls?limit=60'), api('GET', '/voice/capability'), api('GET', '/voice/sessions'), api('GET', '/customers?limit=200'), api('GET', '/health'), api('GET', '/settings'),
  ]);
  voiceUi.voicePreference = settings.voice?.tts?.voice || 'natural-local';
  voiceUi.speechRate = Math.min(1.2, Math.max(0.8, Number(settings.voice?.tts?.rate) || 0.96));
  refreshNaturalVoice();
  const provider = health.providers?.aiVoiceCall;
  $('#view').innerHTML = `
    <div class="card warnCard">
      <b>DR53 Local Voice Agent — local AI, no paid voice API required.</b> Daya uses the Ollama model selected in Settings, answers from the approved catalogue, and speaks through an installed browser/system voice. Reply detail adapts to the question; longer replies are spoken in queued chunks. The app listens during speech to try to detect interruptions. Keep this tab active and allow microphone access. Browser speech recognition may use an online service. This is a local acoustic assist, <u>not an autonomous phone-line connection</u>.
    </div>
    <div class="voiceLayout">
      <div class="card">
        <h2>Start a call</h2>
        <label class="lab">Customer</label>
        <select id="vcCustomer" class="wide">${customerOptions(customers.rows, voiceUi.session?.customerId)}</select>
        <div class="fieldGrid">
          <input id="vcName" placeholder="Name (new customers are saved automatically)">
          <input id="vcPhone" placeholder="Phone +91…">
          <input id="vcProduct" placeholder="Product interest">
          <input id="vcPurpose" placeholder="Purpose" value="Follow up on existing enquiry">
        </div>
        <label class="consent"><input type="checkbox" id="vcConsent"><span>I confirm this person agreed to this follow-up call (or I am dialling them manually right now with permission).</span></label>
        <div class="row">
          <button class="b" id="dialNative">Save contact & open Mac dialer</button>
          <button class="b" id="startLocalVoice">Save contact & start voice session</button>
        </div>
        <p class="subtle">For an actual phone call, place the call using your Mac/iPhone and use speakerphone near the Mac microphone. The console does not receive direct call audio.</p>
        <div id="callStartResult" class="subtle"></div>
      </div>
      <div class="card">
        <div class="sectionTitle"><h2>Live voice console</h2><span id="vcState" class="stateBadge off">no session</span></div>
        <p class="subtle">Natural local system voice with interruption sensing. The agent answers at a useful length, then listens. You can interrupt while it is speaking; if recognition is unavailable, type the customer's words. Voice engine: <b>${esc(cap.engine)}</b>${cap.reason ? ' — ' + esc(cap.reason) : ''}.</p>
        <div class="transcript" id="vcTranscript">Start a session to see the transcript.</div>
        <div class="row">
          <button class="b" id="vcListen" disabled>🎙 Listen</button>
          <button class="ghost" id="vcInterrupt" disabled>Stop speech</button>
          <input id="vcTyped" placeholder="…or type what the customer said" style="flex:1">
          <button class="ghost" id="vcSendTyped" disabled>Send</button>
          <button class="ghost" id="vcSilence" disabled>No answer</button>
          <button class="b danger" id="vcEnd" disabled>End session</button>
        </div>
        <div id="vcSummary" class="subtle"></div>
      </div>
    </div>
    <div class="card">
      <div class="sectionTitle"><h2>Call history</h2><button class="ghost small" id="syncCalls">Sync provider calls</button></div>
      <div style="overflow-x:auto"><table>
        <tr><th>When</th><th>Customer</th><th>Kind</th><th>Status</th><th>Outcome</th><th>Notes / summary</th><th></th></tr>
        ${calls.map((c) => `<tr>
          <td class="subtle">${ist(c.startedAt || c.createdAt)}</td>
          <td>${esc(c.customerName || c.phone || '—')}</td>
          <td><span class="chip info">${esc(c.kind || c.provider || '')}</span></td>
          <td>${statusChip(c.status)}</td>
          <td>${c.outcome ? statusChip(c.outcome) : `<select data-outcome-for="${esc(c.id)}"><option value="">record…</option>${['answered', 'no_answer', 'busy', 'callback_requested', 'not_interested', 'wrong_number', 'voicemail'].map((o) => `<option>${o}</option>`).join('')}</select>`}</td>
          <td class="subtle">${esc((c.summary || c.notes || '').slice(0, 140))}</td>
          <td>${c.conversationId && c.status !== 'completed' && c.status !== 'failed' ? `<button class="ghost small" data-sync-call="${esc(c.id)}">Sync</button>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="7"><div class="empty">No calls yet.</div></td></tr>'}
      </table></div>
    </div>`;

  const fillFromCustomer = () => {
    const c = customers.rows.find((x) => x.id === $('#vcCustomer').value);
    $('#vcName').value = c?.name || '';
    $('#vcPhone').value = c?.phone || '';
    $('#vcProduct').value = c?.product || '';
    if (c) $('#vcConsent').checked = !!(c.consent?.contactApproved && !c.consent?.optOut && (!c.consent.channels?.length || c.consent.channels.includes('call')));
  };
  $('#vcCustomer').onchange = () => {
    if ($('#vcCustomer').value) { voiceUi.quickSavedCustomer = null; voiceUi.quickSavedKey = ''; }
    fillFromCustomer();
  };
  const clearSelectedIfEdited = () => {
    const id = $('#vcCustomer').value;
    if (!id) return;
    const selected = customers.rows.find((x) => x.id === id) || (voiceUi.quickSavedCustomer?.id === id ? voiceUi.quickSavedCustomer : null);
    if (!selected) return;
    const typedName = String($('#vcName').value || '').trim().toLowerCase();
    const typedPhone = String($('#vcPhone').value || '').replace(/\D/g, '');
    const savedName = String(selected.name || '').trim().toLowerCase();
    const savedPhone = String(selected.phone || '').replace(/\D/g, '');
    if ((typedName && typedName !== savedName) || (typedPhone && savedPhone && typedPhone !== savedPhone)) {
      $('#vcCustomer').value = '';
      voiceUi.quickSavedCustomer = null; voiceUi.quickSavedKey = '';
    }
  };
  $('#vcName').addEventListener('input', clearSelectedIfEdited);
  $('#vcPhone').addEventListener('input', clearSelectedIfEdited);
  if (voiceUi.session?.customerId) fillFromCustomer();
  // Save as soon as the form has a plausible name + phone, not only when a call starts.
  // Blur avoids a request for every keystroke; the server's duplicate detection is authoritative.
  $('#vcPhone').addEventListener('blur', () => { autoSaveCallContact(); });
  $('#vcName').addEventListener('blur', () => { autoSaveCallContact(); });
  const callPayload = () => ({
    customerId: $('#vcCustomer').value || undefined, customerName: $('#vcName').value, phone: $('#vcPhone').value,
    productInterest: $('#vcProduct').value, purpose: $('#vcPurpose').value, operatorConfirmed: $('#vcConsent').checked,
  });
  $('#dialNative').onclick = async () => {
    try {
      const payload = await ensureCallCustomer(callPayload());
      const r = await run(api('POST', '/calls/dial', payload), (x) => x.message);
      $('#callStartResult').textContent = r.message;
      renderCalls();
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#startLocalVoice').onclick = async () => {
    try {
      const payload = await ensureCallCustomer(callPayload());
      const r = await run(api('POST', '/voice/sessions', payload), 'Voice session created');
      voiceUi.session = r.session;
      voiceUi.autoListen = true;
      voiceUi.busy = false;
      voiceUi.interrupting = false;
      voiceUi.vadUnavailable = false;
      voiceUi.bargeInPending = false;
      voiceUi.pendingBargeText = '';
      renderCalls();
      openVoiceConsole(r);
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#syncCalls').onclick = () => run(api('POST', '/calls/sync-all', {}), (r) => `Synced ${r.synced ?? 0} call(s)`).then(renderCalls);
  $('#view').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-outcome-for]');
    if (sel && sel.value) run(api('PUT', '/calls/' + sel.dataset.outcomeFor, { outcome: sel.value }), 'Outcome recorded').then(renderCalls);
  });
  $('#view').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sync-call]');
    if (b) run(api('POST', `/calls/${b.dataset.syncCall}/sync`, {}), 'Synced').then(renderCalls);
  });

  if (voiceUi.session && !['ended', 'failed'].includes(voiceUi.session.state)) wireVoiceConsole(cap);
}

function stopSpeechActivityMonitor() {
  const monitor = voiceUi.micMonitor;
  voiceUi.micMonitor = null;
  if (monitor?.raf) cancelAnimationFrame(monitor.raf);
  if (monitor?.source) { try { monitor.source.disconnect(); } catch {} }
  if (monitor?.analyser) { try { monitor.analyser.disconnect(); } catch {} }
  if (monitor?.stream) monitor.stream.getTracks().forEach((track) => { try { track.stop(); } catch {} });
  if (monitor?.context && monitor.context.state !== 'closed') { try { monitor.context.close(); } catch {} }
}

function interruptOnVoiceActivity(speechToken) {
  if (!voiceUi.speaking || voiceUi.interrupting || !voiceUi.autoListen || speechToken !== voiceUi.speechGeneration) return;
  voiceUi.interrupting = true;
  voiceUi.bargeInPending = true;
  voiceUi.speaking = false;
  if ($('#vcState')) $('#vcState').textContent = 'I hear you — go ahead';
  if ($('#vcInterrupt')) $('#vcInterrupt').disabled = true;
  try { window.speechSynthesis?.cancel(); } catch {}
  stopSpeechActivityMonitor();
}

async function startSpeechActivityMonitor(speechToken) {
  if (voiceUi.vadUnavailable || voiceUi.micMonitor || voiceUi.vadStartPromise || !navigator.mediaDevices?.getUserMedia) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  voiceUi.vadStartPromise = (async () => {
    let stream;
    let context;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!voiceUi.speaking || speechToken !== voiceUi.speechGeneration) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      context = new AudioCtx();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.25;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const monitor = { stream, context, source, analyser, raf: 0, activeFrames: 0, baseline: 0 };
      voiceUi.micMonitor = monitor;
      const check = () => {
        if (voiceUi.micMonitor !== monitor || !voiceUi.speaking || speechToken !== voiceUi.speechGeneration) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) { const v = (samples[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / samples.length);
        // Voice onset energy is measured with browser echo cancellation enabled. A short
        // multi-frame threshold avoids stopping on a single click or transient noise.
        monitor.baseline = monitor.baseline ? monitor.baseline * 0.94 + Math.min(rms, 0.02) * 0.06 : Math.min(rms, 0.02);
        const threshold = Math.max(0.035, monitor.baseline * 2.8 + 0.018);
        monitor.activeFrames = rms > threshold ? monitor.activeFrames + 1 : Math.max(0, monitor.activeFrames - 2);
        if (monitor.activeFrames >= 4) {
          interruptOnVoiceActivity(speechToken);
          return;
        }
        monitor.raf = requestAnimationFrame(check);
      };
      monitor.raf = requestAnimationFrame(check);
    } catch {
      if (stream) stream.getTracks().forEach((track) => { try { track.stop(); } catch {} });
      if (context && context.state !== 'closed') { try { context.close(); } catch {} }
      // No repeated permission pop-ups; browser speech recognition still provides the fallback.
      voiceUi.vadUnavailable = true;
    }
  })().finally(() => { voiceUi.vadStartPromise = null; });
  await voiceUi.vadStartPromise;
}

function speakReply(reply) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { resolve(); return; }
    try {
      try { stopBargeRecognition(); } catch {}
      stopSpeechActivityMonitor();
      synth.cancel();
      const clean = String(reply || '').replace(/[*#`>_]/g, '').replace(/₹\s*([\d,]+)/g, '$1 rupees').replace(/\s+/g, ' ').trim();
      if (!clean) { voiceUi.speaking = false; resolve(); return; }
      const chunks = window.DR53Speech?.splitSpeechChunks(clean) || [clean];
      const token = ++voiceUi.speechGeneration;
      voiceUi.currentSpeechText = clean;
      voiceUi.interrupting = false;
      voiceUi.bargeTextQueued = false;
      voiceUi.speaking = true;
      if ($('#vcInterrupt')) $('#vcInterrupt').disabled = false;
      refreshNaturalVoice();
      let done = false;
      const finish = (error = '') => {
        if (done) return;
        done = true;
        const isCurrent = voiceUi.speechGeneration === token;
        if (isCurrent) {
          voiceUi.speaking = false;
          if ($('#vcInterrupt')) $('#vcInterrupt').disabled = true;
          if (!voiceUi.interrupting) stopBargeRecognition();
          stopSpeechActivityMonitor();
          if (error && !voiceUi.interrupting) {
            if ($('#vcState')) $('#vcState').textContent = 'speech playback stopped';
            toast(`Speech playback stopped: ${error}. You can replay the reply or continue by text.`, 'err');
          }
        }
        resolve();
      };
      const playback = window.DR53Speech.speakChunks(
        synth,
        (chunk) => {
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = voiceUi.speechVoice?.lang || 'en-IN';
          utterance.rate = voiceUi.speechRate;
          utterance.pitch = 0.98;
          if (voiceUi.speechVoice) utterance.voice = voiceUi.speechVoice;
          return utterance;
        },
        chunks,
        () => voiceUi.speechGeneration === token && !voiceUi.interrupting,
      );
      playback.then((result) => finish(result.error || ''));
      startSpeechActivityMonitor(token);
      // Full-duplex recognition is used only during speech; transcripts that match
      // the assistant's own words are ignored to reduce speaker-echo false triggers.
      startBargeRecognition(clean, token);
    } catch { voiceUi.speaking = false; stopBargeRecognition(); resolve(); }
  });
}

function wireVoiceConsole(cap) {
  const s = voiceUi.session;
  if (!s) return;
  $('#vcState').textContent = 'session ' + s.state;
  $('#vcState').className = 'stateBadge live';
  ['vcListen', 'vcSendTyped', 'vcSilence', 'vcEnd'].forEach(id => { if ($('#' + id)) $('#' + id).disabled = false; });
  if ($('#vcInterrupt')) $('#vcInterrupt').disabled = !voiceUi.speaking;
  const tp = $('#vcTranscript');
  tp.textContent = '';
  const line = (who, text) => { tp.textContent += `${who}: ${text}\n\n`; tp.scrollTop = tp.scrollHeight; };
  if (voiceUi.initializedFor !== s.id) {
    voiceUi.initializedFor = s.id;
    line('Daya (AI)', s.opening);
    speakReply(s.opening).then(() => {
      if (voiceUi.session?.id === s.id && !voiceUi.busy && voiceUi.autoListen && !voiceUi.bargeInPending) startListening();
    });
  } else {
    (s.transcript || []).forEach(t => line(t.speaker === 'ai' ? 'Daya (AI)' : 'Customer', t.text));
  }

  const endVoiceUi = (msg) => {
    voiceUi.session = null; voiceUi.autoListen = false; voiceUi.busy = false;
    voiceUi.initializedFor = null; voiceUi.bargeInPending = false; voiceUi.pendingBargeText = '';
    if (voiceUi.bargeTimer) { clearTimeout(voiceUi.bargeTimer); voiceUi.bargeTimer = null; }
    voiceUi.drainBargeIn = null;
    $('#vcSummary').textContent = msg;
    ['vcListen', 'vcSendTyped', 'vcSilence', 'vcEnd', 'vcInterrupt'].forEach(id => { if ($('#' + id)) $('#' + id).disabled = true; });
    $('#vcState').textContent = 'ended'; $('#vcState').className = 'stateBadge off';
    try { voiceUi.rec?.stop(); } catch {}
    stopBargeRecognition();
    try { window.speechSynthesis?.cancel(); } catch {}
    stopSpeechActivityMonitor();
    voiceUi.speaking = false;
    voiceUi.speechGeneration++;
    setTimeout(renderCalls, 1200);
  };

  const startListening = () => {
    if (!voiceUi.session || voiceUi.busy || voiceUi.speaking || voiceUi.listening || voiceUi.bargeInPending || !voiceUi.autoListen) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { $('#vcState').textContent = 'speech recognition unavailable — type the reply'; return; }
    const rec = new SR();
    voiceUi.rec = rec;
    let gotResult = false;
    let retryNoSpeech = false;
    rec.lang = 'en-IN'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
    rec.onstart = () => { voiceUi.listening = true; $('#vcListen').textContent = '⏹ Pause listening'; $('#vcState').textContent = 'listening — your turn'; };
    rec.onend = () => {
      if (voiceUi.rec === rec) voiceUi.rec = null;
      voiceUi.listening = false;
      if ($('#vcListen')) $('#vcListen').textContent = voiceUi.autoListen ? '🎙 Listening enabled' : '🎙 Listen';
      if (retryNoSpeech && !gotResult && voiceUi.autoListen && voiceUi.session && !voiceUi.busy && !voiceUi.speaking && !voiceUi.bargeInPending) {
        setTimeout(startListening, 500);
      }
    };
    rec.onerror = (ev) => {
      retryNoSpeech = ev.error === 'no-speech';
      voiceUi.listening = false;
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(ev.error)) {
        voiceUi.autoListen = false;
        $('#vcListen').textContent = '🎙 Listen';
        $('#vcState').textContent = ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'allow microphone / speech recognition' : 'microphone unavailable — type reply';
        toast('Speech recognition is unavailable. Check browser microphone permissions or type the customer reply.', 'err');
      } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        toast('Speech recognition: ' + ev.error + '. You can type the customer reply instead.', 'err');
      }
    };
    rec.onresult = (ev) => {
      if (gotResult) return;
      const text = ev.results?.[0]?.[0]?.transcript || '';
      if (!text.trim()) return;
      gotResult = true;
      try { rec.stop(); } catch {}
      sendUtterance(text);
    };
    try { rec.start(); } catch { voiceUi.listening = false; $('#vcState').textContent = 'could not start listening — type reply'; }
  };

  const drainBargeIn = () => {
    if (!voiceUi.pendingBargeText || voiceUi.busy || !voiceUi.session || voiceUi.session.id !== s.id) return;
    const text = voiceUi.pendingBargeText;
    voiceUi.pendingBargeText = '';
    voiceUi.bargeInPending = false;
    voiceUi.interrupting = false;
    sendUtterance(text);
  };
  voiceUi.drainBargeIn = drainBargeIn;

  const sendUtterance = async (text) => {
    if (!String(text || '').trim() || voiceUi.busy || !voiceUi.session) return;
    voiceUi.bargeInPending = false;
    voiceUi.pendingBargeText = '';
    voiceUi.bargeTextQueued = false;
    voiceUi.interrupting = false;
    if (voiceUi.bargeTimer) { clearTimeout(voiceUi.bargeTimer); voiceUi.bargeTimer = null; }
    voiceUi.busy = true;
    try { voiceUi.rec?.stop(); } catch {}
    stopBargeRecognition();
    voiceUi.listening = false;
    try { window.speechSynthesis?.cancel(); } catch {}
    stopSpeechActivityMonitor();
    voiceUi.speaking = false;
    voiceUi.speechGeneration++;
    line('Customer', text);
    $('#vcState').textContent = 'thinking…';
    try {
      const r = await api('POST', `/voice/sessions/${s.id}/utterance`, { text });
      line('Daya (AI)', r.reply);
      $('#vcState').textContent = r.ended ? 'ending…' : 'speaking…';
      await speakReply(r.reply);
      if (r.ended) { endVoiceUi('Session ended. ' + (r.summary ? 'Summary: ' + r.summary : '')); return; }
    } catch (e) { toast(e.message, 'err'); }
    finally { voiceUi.busy = false; }
    if (voiceUi.session?.id === s.id && voiceUi.autoListen && !voiceUi.bargeInPending) startListening();
    drainBargeIn();
  };

  $('#vcInterrupt').onclick = () => {
    if (!voiceUi.speaking) return;
    // Manual backup for browsers whose speech recognition does not support full-duplex input.
    voiceUi.interrupting = true;
    voiceUi.bargeInPending = true;
    voiceUi.speaking = false;
    if ($('#vcState')) $('#vcState').textContent = 'speech stopped — go ahead';
    if (!voiceUi.bargeRec) startBargeRecognition(voiceUi.currentSpeechText, voiceUi.speechGeneration);
    try { window.speechSynthesis?.cancel(); } catch {}
    stopSpeechActivityMonitor();
    $('#vcInterrupt').disabled = true;
  };
  $('#vcSendTyped').onclick = () => { const v = $('#vcTyped').value; $('#vcTyped').value = ''; sendUtterance(v); };
  $('#vcTyped').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#vcSendTyped').click(); } });
  $('#vcListen').onclick = () => {
    if (voiceUi.listening || voiceUi.autoListen) {
      voiceUi.autoListen = false;
      try { voiceUi.rec?.stop(); } catch {}
      stopBargeRecognition();
      voiceUi.listening = false;
      $('#vcListen').textContent = '🎙 Listen';
      $('#vcState').textContent = voiceUi.speaking ? 'speaking — listening paused' : 'listening paused';
      return;
    }
    voiceUi.autoListen = true;
    if (voiceUi.speaking) startBargeRecognition(voiceUi.currentSpeechText, voiceUi.speechGeneration);
    else startListening();
  };
  $('#vcSilence').onclick = async () => {
    if (voiceUi.busy) return;
    voiceUi.busy = true;
    try {
      const r = await api('POST', `/voice/sessions/${s.id}/silence`, {});
      line('Daya (AI)', r.reply); await speakReply(r.reply);
      if (r.ended) endVoiceUi(r.summary || 'Session ended after silence.');
      else if (voiceUi.autoListen && !voiceUi.bargeInPending) startListening();
    } catch (e) { toast(e.message, 'err'); }
    finally { voiceUi.busy = false; }
    drainBargeIn();
  };
  $('#vcEnd').onclick = () => run(api('POST', `/voice/sessions/${s.id}/end`, { reason: 'operator_ended' }), (r) => 'Ended. ' + (r.summary || '')).then((r) => endVoiceUi(r.summary || 'Session ended by operator.'));
}

function openVoiceConsole(r) {
  toast('Daya is ready. Speak naturally and interrupt during its reply; matching speaker echo is ignored where possible. The local model answers from the approved product catalogue.');
}

/* ------------------------------------------------------------------ 5. Messaging */

async function renderMessaging() {
  const [messages, customers, health] = await Promise.all([
    api('GET', '/messages?limit=80'), api('GET', '/customers?limit=200'), api('GET', '/health'),
  ]);
  const smsReady = health.providers?.sms?.ready, waReady = health.providers?.whatsapp?.ready;
  $('#view').innerHTML = `
    <div class="grid2">
      <div class="card">
        <h2>Draft a customer message</h2>
        <p class="subtle"><span class="chip good">Local AI drafting</span> Paid-provider sending is disabled in local-only mode. Generate a draft, review it, then open WhatsApp with the text prefilled. You must press Send yourself.</p>
        <label class="lab">Customer</label>
        <select id="msCustomer" class="wide">${customerOptions(customers.rows)}</select>
        <div class="fieldGrid">
          <input id="msName" placeholder="Name (if not saved)">
          <input id="msPhone" placeholder="Phone +91…">
          <select id="msChannel"><option value="whatsapp">WhatsApp</option><option value="sms">SMS draft</option></select>
          <input id="msProduct" placeholder="Product / customer interest">
          <input id="msPurpose" placeholder="Message goal" value="Follow up on an existing enquiry">
        </div>
        <textarea id="msBody" class="wide" rows="4" placeholder="Generate a local AI draft, then review and edit it here."></textarea>
        <label class="consent"><input type="checkbox" id="msConsent"><span>This customer agreed to receive this message.</span></label>
        <div class="row">
          <button class="b" id="msGenerate">Generate with local AI</button>
          <button class="ghost" id="msDraft">Save draft</button>
          <button class="ghost" id="msOpenDraft">Open WhatsApp / Messages draft</button>
        </div>
        <div id="msResult" class="subtle"></div>
      </div>
      <div class="card">
        <div class="sectionTitle"><h2>Delivery states</h2><button class="ghost small" id="msSync">Sync pending</button></div>
        <p class="subtle">Local-only mode stores drafts only. No message is sent automatically. Review each draft and press Send in WhatsApp or Messages yourself.</p>
        <div style="max-height:420px;overflow-y:auto"><table>
          <tr><th>When</th><th>To</th><th>Channel</th><th>Status</th><th>Message</th></tr>
          ${messages.map((m) => `<tr>
            <td class="subtle">${ist(m.createdAt)}</td>
            <td>${esc(m.customerName || m.to)}</td>
            <td><span class="chip info">${esc(m.channel)}</span></td>
            <td>${statusChip(m.status)}${m.error ? `<br><span class="err" style="font-size:11px">${esc(m.error.slice(0, 120))}</span>` : ''}</td>
            <td class="subtle">${esc((m.body || '').slice(0, 90))}</td>
          </tr>`).join('') || '<tr><td colspan="5"><div class="empty">No messages yet.</div></td></tr>'}
        </table></div>
      </div>
    </div>`;
  $('#msCustomer').onchange = () => {
    const c = customers.rows.find((x) => x.id === $('#msCustomer').value);
    if (c) { $('#msName').value = c.name || ''; $('#msPhone').value = c.phone || ''; }
  };
  const payload = () => ({
    customerId: $('#msCustomer').value || undefined, customerName: $('#msName').value, phone: $('#msPhone').value,
    channel: $('#msChannel').value, message: $('#msBody').value, consentConfirmed: $('#msConsent').checked,
    idempotencyKey: $('#msBody').value ? `ui-${$('#msChannel').value}-${$('#msPhone').value}-${$('#msBody').value.length}-${Date.now()}` : undefined,
  });
  $('#msGenerate').onclick = async () => {
    const b = $('#msGenerate'); b.disabled = true; b.textContent = 'Generating…';
    try {
      const r = await api('POST', '/messages/generate-draft', { customerName: $('#msName').value, channel: $('#msChannel').value, productInterest: $('#msProduct').value, purpose: $('#msPurpose').value });
      $('#msBody').value = r.draft || ''; $('#msResult').textContent = `Draft generated by ${r.provider || 'local AI'}. Review and edit before using it.`;
    } catch (e) { $('#msResult').textContent = e.message; toast(e.message, 'err'); }
    finally { b.disabled = false; b.textContent = 'Generate with local AI'; }
  };
  $('#msDraft').onclick = () => run(api('POST', '/messages/draft', payload()), (r) => r.message).then((r) => { $('#msResult').textContent = r.message; renderMessaging(); });
  $('#msOpenDraft').onclick = async () => {
    const body = $('#msBody').value.trim();
    if (!body) return toast('Generate or enter a draft first.', 'err');
    let phone = $('#msPhone').value.replace(/[^0-9]/g, '');
    if (phone.length === 10) phone = '91' + phone;
    if (!phone) return toast('Enter a customer phone number first.', 'err');
    if ($('#msChannel').value === 'whatsapp') {
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      $('#msResult').textContent = 'WhatsApp opened with a prefilled draft. Check the recipient and press Send yourself.';
    } else {
      const saved = await run(api('POST', '/messages/draft', payload()), (r) => r.message || 'Draft saved');
      $('#msResult').textContent = saved.message || 'Draft saved. Open Messages and paste the draft manually.';
      run(api('POST', '/native/open-messages', {}), (r) => r.message);
    }
  };
  $('#msSync').onclick = () => run(api('POST', '/messages/sync-pending', {}), (r) => `Synced ${r.synced ?? 0}, still pending ${r.pending ?? 0}`).then(renderMessaging);
}

/* ------------------------------------------------------------------ 6. Campaigns */

async function renderCampaigns() {
  const [rows, customers] = await Promise.all([api('GET', '/campaigns'), api('GET', '/customers?limit=300')]);
  $('#view').innerHTML = `
    <div class="card">
      <h2>New campaign</h2>
      <div class="fieldGrid">
        <input id="cpName" placeholder="Campaign name *">
        <input id="cpObjective" placeholder="Objective * e.g. follow up sticker enquiries">
        <select id="cpChannel"><option value="call">Calls (native/voice console)</option><option value="whatsapp">WhatsApp messages</option><option value="sms">SMS</option><option value="agent">Agent goals (AI works each lead)</option></select>
        <select id="cpStatus"><option value="">Target: all eligible</option>${['New', 'Contacted', 'Interested', 'Follow-up Required', 'Callback Scheduled'].map((s) => `<option>Only status: ${s}</option>`).join('')}</select>
        <input id="cpSpread" type="number" min="0" max="600" placeholder="Spread minutes (0 = all at once)" value="30">
        <input id="cpAttempts" type="number" min="1" max="5" placeholder="Max attempts" value="2">
      </div>
      <textarea id="cpTemplate" class="wide" rows="3" placeholder="Message template or call opening. Placeholders: {name} {first_name} {product} {company}"></textarea>
      <p class="subtle">Only consented, non-opted-out contacts are queued; blocked contacts are listed before anything runs. Sending follows the calling window, daily limits and spacing from Settings. Campaigns &gt;10 contacts need approval.</p>
      <div class="row"><button class="b" id="cpCreate">Create campaign</button></div>
      <div id="cpResult" class="subtle"></div>
    </div>
    <div class="card">
      <h2>Campaigns</h2>
      ${rows.map((c) => `
        <div class="card" style="background:var(--panel)">
          <div class="sectionTitle">
            <div><b>${esc(c.name)}</b> ${statusChip(c.status)} <span class="chip info">${esc(c.channel)}</span><br><span class="subtle">${esc(c.objective)}</span></div>
            <div class="row" style="margin:0">
              ${c.status === 'draft' || c.status === 'paused' ? `<button class="b small" data-cp="${esc(c.id)}" data-act="start">Start</button>` : ''}
              ${c.status === 'running' ? `<button class="ghost small" data-cp="${esc(c.id)}" data-act="pause">Pause</button>` : ''}
              ${c.status === 'paused' ? `<button class="ghost small" data-cp="${esc(c.id)}" data-act="resume">Resume</button>` : ''}
              ${['running', 'paused'].includes(c.status) ? `<button class="b danger small" data-cp="${esc(c.id)}" data-act="stop">Stop</button>` : ''}
              <button class="ghost small" data-report="${esc(c.id)}">Report</button>
            </div>
          </div>
          <div class="row"><span class="bar" style="flex:1"><i style="width:${c.progress?.percent || 0}%"></i></span><span class="subtle">${c.progress?.percent || 0}% · ${c.progress?.completed || 0} done · ${c.progress?.remaining || 0} left${c.progress?.needsReview ? ` · <span class="warn2">${c.progress.needsReview} need review</span>` : ''}</span></div>
          ${c.blocked?.length ? `<div class="subtle">Blocked: ${c.blocked.slice(0, 6).map((b) => esc(b.name)).join(', ')}${c.blocked.length > 6 ? ` +${c.blocked.length - 6} more` : ''}</div>` : ''}
          <div id="report-${esc(c.id)}"></div>
        </div>`).join('') || '<div class="empty">No campaigns yet.</div>'}
    </div>`;
  $('#cpCreate').onclick = () => {
    const statusSel = $('#cpStatus').value.replace('Only status: ', '');
    run(api('POST', '/campaigns', {
      name: $('#cpName').value, objective: $('#cpObjective').value, channel: $('#cpChannel').value,
      filters: statusSel ? { status: statusSel } : {},
      messageTemplate: $('#cpTemplate').value, openingLine: $('#cpTemplate').value,
      spreadMinutes: +$('#cpSpread').value || 0, maxAttempts: +$('#cpAttempts').value || 2,
    }), (r) => r.needsApproval ? `Created — ${r.eligible} contacts eligible. Approval required before it starts (see Approvals).` : `Campaign created — ${r.eligible} contacts eligible${r.blocked ? `, ${r.blocked} blocked` : ''}.`)
      .then(() => renderCampaigns());
  };
  $('#view').onclick = async (e) => {
    const act = e.target.closest('[data-cp]');
    if (act) return run(api('POST', `/campaigns/${act.dataset.cp}/${act.dataset.act}`, {}), 'Done').then(renderCampaigns);
    const rep = e.target.closest('[data-report]');
    if (rep) {
      const r = await run(api('GET', '/campaigns/' + rep.dataset.report));
      const c = r.campaign || r;
      const host = $('#report-' + rep.dataset.report);
      host.innerHTML = `<hr class="sep"><div class="subtle mono" style="white-space:pre-wrap">${esc(JSON.stringify({ byStatus: c.byStatus, outcomes: c.outcomes, stats: c.stats, blocked: (c.blocked || []).slice(0, 10), perContact: (r.perContact || []).slice(0, 10) }, null, 2))}</div>`;
    }
  };
}

/* ------------------------------------------------------------------ 7. Tasks */

const taskState = { status: 'active' };

async function renderTasks() {
  const data = await api('GET', '/tasks?status=' + taskState.status + '&limit=120');
  const c = data.counts.byStatus;
  const chip = (k, label) => `<button class="ghost small" data-ts="${k}" ${taskState.status === k ? 'style="border-color:var(--gold);color:var(--gold2)"' : ''}>${label} (${c[k] || 0})</button>`;
  $('#view').innerHTML = `
    <div class="card">
      <div class="sectionTitle"><h2>Task queue</h2>
        <div class="row" style="margin:0">
          ${chip('active', 'Active')}${chip('awaiting_approval', 'Awaiting approval')}${chip('needs_review', 'Needs review')}${chip('completed', 'Done')}${chip('failed', 'Failed')}${chip('cancelled', 'Cancelled')}
        </div>
      </div>
      <p class="subtle">The queue survives restarts. After a restart, in-flight calls/messages move to <b>needs review</b> instead of being blindly retried — the provider may already have completed them.</p>
      <div style="overflow-x:auto"><table>
        <tr><th>Task</th><th>Kind</th><th>Status</th><th>Runs at</th><th>Attempts</th><th>Last error / note</th><th></th></tr>
        ${data.tasks.map((t) => `<tr>
          <td><b>${esc(t.title)}</b>${t.customerId ? `<br><span class="subtle mono">${esc(t.customerId.slice(0, 8))}</span>` : ''}</td>
          <td><span class="chip info">${esc(t.kind)}</span></td>
          <td>${statusChip(t.status)}</td>
          <td class="subtle">${t.runAfter ? ist(t.runAfter) : '—'}</td>
          <td>${t.attempts || 0}/${t.maxAttempts || 1}</td>
          <td class="subtle">${esc((t.error || '').slice(0, 140))}</td>
          <td style="white-space:nowrap">
            ${t.status === 'running' || t.status === 'pending' ? `<button class="ghost small" data-t="${esc(t.id)}" data-op="pause">Pause</button>` : ''}
            ${t.status === 'paused' ? `<button class="ghost small" data-t="${esc(t.id)}" data-op="resume">Resume</button>` : ''}
            ${['failed', 'needs_review', 'cancelled'].includes(t.status) ? `<button class="ghost small" data-t="${esc(t.id)}" data-op="retry">Retry</button>` : ''}
            ${!['completed', 'failed', 'cancelled'].includes(t.status) ? `<button class="b danger small" data-t="${esc(t.id)}" data-op="cancel">Cancel</button>` : ''}
          </td>
        </tr>`).join('') || '<tr><td colspan="7"><div class="empty">No tasks in this state.</div></td></tr>'}
      </table></div>
    </div>
    <div class="card">
      <h2>Queue a manual task</h2>
      <div class="fieldGrid">
        <input id="tkTitle" placeholder="Title *">
        <select id="tkKind"><option value="followup">followup</option><option value="reminder">reminder</option><option value="call">call</option><option value="message">message</option><option value="agent_goal">agent goal</option></select>
        <input id="tkWhen" type="datetime-local">
      </div>
      <div class="row"><button class="b" id="tkAdd">Queue task</button></div>
    </div>`;
  $$('#view [data-ts]').forEach((b) => b.onclick = () => { taskState.status = b.dataset.ts; renderTasks(); });
  $$('#view [data-t]').forEach((b) => b.onclick = () => run(api('POST', `/tasks/${b.dataset.t}/${b.dataset.op}`, {}), 'Done').then(renderTasks));
  $('#tkAdd').onclick = () => {
    const when = $('#tkWhen').value;
    run(api('POST', '/tasks', { title: $('#tkTitle').value, kind: $('#tkKind').value, runAfter: when ? new Date(when).toISOString() : undefined, payload: {} }), 'Task queued').then(renderTasks);
  };
}

/* ------------------------------------------------------------------ 8. Approvals */

async function renderApprovals() {
  const rows = await api('GET', '/approvals');
  $('#view').innerHTML = `
    <div class="card">
      <h2>Waiting for your decision (${rows.length})</h2>
      <p class="subtle">Consequential actions — sending messages, AI calls, bulk campaigns, deletions — pause here until you approve or reject them. Approving runs the real action; rejecting cancels it.</p>
      ${rows.map((a) => `
        <div class="approvalCard">
          <div class="sectionTitle"><b>${esc(a.title || a.action || a.kind || 'Action')}</b><span class="subtle">${ist(a.createdAt)}</span></div>
          <p class="subtle" style="white-space:pre-wrap">${esc(a.detail || a.summary || JSON.stringify(a.payload || {}, null, 1))}</p>
          <div class="row">
            <button class="b" data-ap="${esc(a.id)}" data-dec="approve">Approve & run</button>
            <button class="b danger" data-ap="${esc(a.id)}" data-dec="reject">Reject</button>
          </div>
        </div>`).join('') || '<div class="empty">Nothing waiting. When the agent or a campaign needs a consequential action, it appears here.</div>'}
    </div>`;
  $$('#view [data-ap]').forEach((b) => b.onclick = () => {
    const note = b.dataset.dec === 'reject' ? (prompt('Reason for rejection (optional):') || '') : '';
    run(api('POST', `/approvals/${b.dataset.ap}/decide`, { decision: b.dataset.dec, note }), b.dataset.dec === 'approve' ? 'Approved — running now' : 'Rejected').then(() => { renderApprovals(); refreshPills(); });
  });
}

/* ------------------------------------------------------------------ 9. Follow-ups & Callbacks */

async function renderFollowups() {
  const [followups, callbacks, customers, health] = await Promise.all([
    api('GET', '/followups'), api('GET', '/callbacks'), api('GET', '/customers?limit=200'), api('GET', '/health'),
  ]);
  const open = followups.filter((f) => !f.done);
  const sched = callbacks.filter((c) => c.status === 'scheduled');
  $('#view').innerHTML = `
    <div class="grid2">
      <div class="card">
        <h2>Follow-ups (${open.length} open)</h2>
        <div class="fieldGrid">
          <input id="fuTitle" placeholder="Task * e.g. Send sticker price list">
          <select id="fuCustomer">${customerOptions(customers.rows)}</select>
          <input id="fuDue" type="date">
          <select id="fuPriority"><option>low</option><option selected>medium</option><option>high</option></select>
        </div>
        <div class="row"><button class="b" id="fuAdd">Add follow-up</button></div>
        ${open.map((f) => `<div class="logRow" style="display:flex;gap:8px;align-items:center">
          <button class="ghost small" data-fu="${esc(f.id)}">✓</button>
          <span style="flex:1"><b>${esc(f.title)}</b> <span class="chip">${esc(f.priority)}</span>${f.customerName ? `<br><span class="subtle">${esc(f.customerName)}</span>` : ''}</span>
          <span class="subtle">${f.due ? ist(f.due) : 'no date'}</span>
        </div>`).join('') || '<div class="empty">No open follow-ups.</div>'}
        <h3 style="margin-top:12px">Completed</h3>
        ${followups.filter((f) => f.done).slice(0, 8).map((f) => `<div class="logRow subtle">✓ ${esc(f.title)} — ${ist(f.completedAt)}</div>`).join('') || '<div class="subtle">None yet.</div>'}
      </div>
      <div class="card">
        <h2>Callbacks</h2>
        <p class="subtle">Bookings are only accepted inside the configured window (${esc(health.safety?.callingWindow || '')} for calls; callback window in Settings). Times are IST.</p>
        <div class="fieldGrid">
          <select id="cbCustomer">${customerOptions(customers.rows)}</select>
          <input id="cbName" placeholder="Name (if not saved)">
          <input id="cbPhone" placeholder="Phone">
          <input id="cbReason" placeholder="Reason * e.g. asked to call after 4">
          <input id="cbDate" type="date">
          <input id="cbTime" type="time">
        </div>
        <div class="row"><button class="b" id="cbAdd">Book callback</button></div>
        ${sched.map((c) => `<div class="logRow" style="display:flex;gap:8px;align-items:center">
          <span style="flex:1"><b>${esc(c.customerName || c.phone)}</b> — ${esc(c.reason)}<br><span class="subtle">${ist(c.scheduledAt)}</span></span>
          <button class="b danger small" data-cb="${esc(c.id)}">Cancel</button>
        </div>`).join('') || '<div class="empty">No callbacks scheduled.</div>'}
      </div>
    </div>`;
  $('#fuAdd').onclick = () => {
    const cust = customers.rows.find((x) => x.id === $('#fuCustomer').value);
    run(api('POST', '/followups', { title: $('#fuTitle').value, customerId: cust?.id, customerName: cust?.name, due: $('#fuDue').value || undefined, priority: $('#fuPriority').value }), 'Follow-up added').then(renderFollowups);
  };
  $('#cbCustomer').onchange = () => {
    const c = customers.rows.find((x) => x.id === $('#cbCustomer').value);
    if (c) { $('#cbName').value = c.name || ''; $('#cbPhone').value = c.phone || ''; }
  };
  $('#cbAdd').onclick = () => {
    const cust = customers.rows.find((x) => x.id === $('#cbCustomer').value);
    run(api('POST', '/callbacks', { customerId: cust?.id, customerName: $('#cbName').value, phone: $('#cbPhone').value, reason: $('#cbReason').value, date: $('#cbDate').value, time: $('#cbTime').value }), 'Callback booked').then(renderFollowups);
  };
  $$('#view [data-fu]').forEach((b) => b.onclick = () => run(api('POST', `/followups/${b.dataset.fu}/complete`, {}), 'Done').then(renderFollowups));
  $$('#view [data-cb]').forEach((b) => b.onclick = () => { if (confirm('Cancel this callback?')) run(api('DELETE', `/callbacks/${b.dataset.cb}?confirm=true`), 'Cancelled').then(renderFollowups); });
}

/* ------------------------------------------------------------------ 10. Analytics */

async function renderAnalytics() {
  const a = await api('GET', '/analytics?days=14');
  const maxCalls = Math.max(1, ...a.series.map((s) => s.calls));
  const maxMsgs = Math.max(1, ...a.series.map((s) => s.messages));
  const bar = (v, max) => `<div class="barg" style="height:${Math.max(2, Math.round((v / max) * 70))}px" title="${v}"></div>`;
  $('#view').innerHTML = `
    <div class="grid">
      <div class="card stat"><b>${a.totals.customers}</b><span>Leads</span></div>
      <div class="card stat"><b>${a.totals.calls}</b><span>Calls</span></div>
      <div class="card stat"><b>${a.totals.connectRate}%</b><span>Connect rate</span></div>
      <div class="card stat"><b>${a.totals.messages}</b><span>Messages (${a.totals.drafts} drafts)</span></div>
      <div class="card stat"><b>${a.totals.conversionRate}%</b><span>Conversion</span></div>
      <div class="card stat"><b>${a.totals.withoutConsent}</b><span>Leads missing consent</span></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>Calls per day (14d)</h2><div class="chart">${a.series.map((s) => `<div class="col">${bar(s.calls, maxCalls)}<span>${esc(s.date.slice(5))}</span></div>`).join('')}</div></div>
      <div class="card"><h2>Messages per day (14d)</h2><div class="chart chart2">${a.series.map((s) => `<div class="col">${bar(s.messages, maxMsgs)}<span>${esc(s.date.slice(5))}</span></div>`).join('')}</div></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>Leads by status</h2>${Object.entries(a.byStatus).map(([k, v]) => `<div class="logRow"><span style="flex:1">${statusChip(k)}</span><b>${v}</b></div>`).join('') || '<div class="empty">No leads yet.</div>'}</div>
      <div class="card"><h2>Call outcomes</h2>${Object.entries(a.outcomes).map(([k, v]) => `<div class="logRow"><span style="flex:1">${statusChip(k)}</span><b>${v}</b></div>`).join('') || '<div class="empty">No calls logged yet.</div>'}
      <h3 style="margin-top:10px">Message states</h3>${Object.entries(a.messageStates).map(([k, v]) => `<div class="logRow"><span style="flex:1">${statusChip(k)}</span><b>${v}</b></div>`).join('') || '<div class="subtle">No messages yet.</div>'}</div>
    </div>
    <p class="subtle">Every number above is computed from the CRM's real records — there is no demo or projected data.</p>`;
}

/* ------------------------------------------------------------------ 11. Products */

async function renderProducts() {
  const products = await api('GET', '/products');
  $('#view').innerHTML = `
    <div class="card">
      <h2>Approved catalogue</h2>
      <p class="subtle">The AI uses only this list for prices and product facts. If you change a price here, the agent's answers change too — it cannot invent other numbers.</p>
      <table>
        <tr><th>Product</th><th>Price (₹)</th><th>Type</th><th>Active</th><th>Description</th><th></th></tr>
        ${products.map((p) => `<tr>
          <td><b>${esc(p.name)}</b></td>
          <td><input type="number" min="0" value="${p.price}" data-price="${esc(p.id)}" style="width:100px"></td>
          <td>${esc(p.priceType)}</td>
          <td><input type="checkbox" ${p.active !== false ? 'checked' : ''} data-active="${esc(p.id)}"></td>
          <td class="subtle">${esc(p.description)}</td>
          <td><button class="ghost small" data-save-product="${esc(p.id)}">Save</button></td>
        </tr>`).join('')}
      </table>
    </div>`;
  $$('#view [data-save-product]').forEach((b) => b.onclick = () => {
    const pid = b.dataset.saveProduct;
    run(api('PUT', '/products/' + pid, {
      price: +$(`[data-price="${pid}"]`).value,
      active: $(`[data-active="${pid}"]`).checked,
    }), 'Product saved').then(renderProducts);
  });
}

/* ------------------------------------------------------------------ 12. Settings & System */

async function renderSettings() {
  const [s, health, providers, logs, backups] = await Promise.all([
    api('GET', '/settings'), api('GET', '/health'), api('GET', '/providers/status'), api('GET', '/system/logs?limit=60'), api('GET', '/system/backups'),
  ]);
  const providerRows = Object.entries(providers).map(([k, v]) => `
    <div class="logRow" style="display:flex;gap:8px;align-items:center">
      <span style="flex:1"><b>${esc(v.label || k)}</b></span>
      ${v.ready ? '<span class="chip good">ready</span>' : `<span class="chip warn">missing</span> <span class="subtle mono">${esc((v.missing || []).join(', '))}</span>`}
    </div>`).join('');
  $('#view').innerHTML = `
    <div class="grid2">
      <div class="card ${s.agent.killSwitch ? 'badCard' : ''}">
        <h2>Safety</h2>
        <p class="subtle">The kill switch stops all outbound calls/messages and cancels pending tasks. The agent can turn it on but can never turn it off — only you can, here.</p>
        <button class="b ${s.agent.killSwitch ? '' : 'danger'}" id="killBtn">${s.agent.killSwitch ? 'Turn kill switch OFF' : 'Turn kill switch ON'}</button>
        <hr class="sep">
        <label class="consent"><input type="checkbox" id="stAuto" ${s.agent.autoExecute ? 'checked' : ''}><span>Auto-execute write tools (create customer, add note, schedule follow-up) without approval</span></label>
        <label class="consent"><input type="checkbox" id="stRequire" ${s.agent.requireApprovalForConsequential ? 'checked' : ''}><span>Require approval for consequential actions (sends, AI calls, campaigns, deletions)</span></label>
        <label class="lab">Max tool steps per instruction</label>
        <input id="stSteps" type="number" min="1" max="25" value="${s.agent.maxToolSteps}">
      </div>
      <div class="card">
        <h2>AI model</h2>
        <dl class="kv">
          <dt>Active</dt><dd>${esc(health.ai.active)}</dd>
          <dt>Status</dt><dd>${esc(health.ai.message || (health.ai.ready ? 'Ready' : 'Not ready'))}</dd>
          ${health.ai.providers.map((p) => `<dt>${esc(p.label)}</dt><dd>${p.ok && p.modelReady ? '<span class="chip good">ready</span>' : '<span class="chip warn">not ready</span>'} <span class="subtle">${esc(p.error || '')}</span></dd>`).join('')}
        </dl>
        <div class="row"><button class="ghost" id="probeBtn">Re-check models</button></div>
        <label class="lab">Primary provider</label>
        <select id="stPrimary">${s.llm.providers.map((p) => `<option value="${esc(p.id)}" ${p.id === s.llm.primary ? 'selected' : ''}>${esc(p.label)} (${esc(p.model)})</option>`).join('')}</select>
        <label class="consent"><input type="checkbox" id="stCloud" ${s.llm.shareCustomerDataWithCloud ? 'checked' : ''}><span>Allow customer data to leave this Mac when a cloud provider is primary (OFF = cloud providers receive generic prompts only)</span></label>
        <p class="subtle">Cloud keys stay in <code>.env</code> on the backend; browsers never see them. To add OpenAI/DeepSeek/OpenRouter, edit <code>data/settings.json</code> providers or <code>.env</code> per README.</p>
      </div>
    </div>
    <div class="card">
      <h2>New-lead automation</h2>
      <p class="subtle">When a new customer is saved, queue the enabled actions automatically. Outreach is only queued for leads with recorded consent; opt-outs and channel restrictions still block execution. AI phone calls require the paid provider mode and working credentials.</p>
      <div class="grid2">
        <div>
          <label class="consent"><input type="checkbox" id="stAutoMessage" ${(s.automation || {}).autoMessageNewLead ? 'checked' : ''}><span>Automatically send a welcome message to a consented new lead</span></label>
          <label class="lab">Welcome message channel</label>
          <select id="stAutoMessageChannel"><option value="whatsapp" ${((s.automation || {}).newLeadMessageChannel || 'whatsapp') === 'whatsapp' ? 'selected' : ''}>WhatsApp</option><option value="sms" ${(s.automation || {}).newLeadMessageChannel === 'sms' ? 'selected' : ''}>SMS</option></select>
        </div>
        <div>
          <label class="consent"><input type="checkbox" id="stAutoCall" ${(s.automation || {}).autoCallNewLead ? 'checked' : ''}><span>Automatically queue an AI voice call to a consented new lead</span></label>
          <p class="subtle">Calls are queued for the configured calling window and automatically rescheduled after a no-answer outcome while attempts remain. Turn this on only after testing the voice provider and consent workflow.</p>
        </div>
      </div>
    </div>
    <div class="grid2">
      <div class="card">
        <h2>Calling & messaging rules</h2>
        <div class="fieldGrid">
          <div><label class="lab">Calling window start (IST hour)</label><input id="stWinStart" type="number" min="0" max="23" value="${s.calling.windowStartHour}"></div>
          <div><label class="lab">Calling window end</label><input id="stWinEnd" type="number" min="1" max="24" value="${s.calling.windowEndHour}"></div>
          <div><label class="lab">Daily call limit</label><input id="stCallLimit" type="number" min="1" max="500" value="${s.calling.dailyCallLimit}"></div>
          <div><label class="lab">Daily message limit</label><input id="stMsgLimit" type="number" min="1" max="2000" value="${s.messaging.dailyMessageLimit}"></div>
          <div><label class="lab">Min seconds between calls</label><input id="stSpacing" type="number" min="0" max="3600" value="${s.calling.minSecondsBetweenCalls}"></div>
          <div><label class="lab">Retry delay (minutes)</label><input id="stRetry" type="number" min="5" max="4320" value="${s.calling.retryDelayMinutes}"></div>
        </div>
        <label class="consent"><input type="checkbox" id="stReqConsent" ${s.calling.requireConsent ? 'checked' : ''}><span>Require recorded consent before any outbound call/message</span></label>
        <label class="consent"><input type="checkbox" id="stTranscripts" ${s.data.saveTranscripts ? 'checked' : ''}><span>Save call transcripts in the CRM</span></label>
        <label class="consent"><input type="checkbox" id="stNotify" ${s.notifications !== false ? 'checked' : ''}><span>macOS desktop notifications for call results, retries and callback reminders</span></label>
      </div>
      <div class="card">
        <h2>Integrations</h2>
        ${providerRows}
        <p class="subtle">Add the missing values to <code>.env</code> and restart. Secrets never appear in this UI, in logs, or in the exported ZIP.</p>
        <hr class="sep">
        <h2>Voice</h2>
        <div class="fieldGrid">
          <div><label class="lab">Speech engine</label><select id="stTts"><option value="browser" selected>Local system voice (browser)</option></select></div>
          <div><label class="lab">Voice preference</label><input id="stVoice" value="${esc(s.voice.tts.voice)}" placeholder="natural-local or installed voice name"></div>
          <div><label class="lab">Speech speed</label><input id="stRate" type="number" min="0.8" max="1.2" step="0.05" value="${s.voice.tts.rate}"></div>
          <p class="subtle">Use <code>natural-local</code> to select the best available installed English voice automatically, or enter an installed voice name. The chosen voice stays fixed during a conversation.</p>
        </div>
      </div>
    </div>
    <div class="card"><div class="row"><button class="b" id="saveSettings">Save all settings</button><span id="settingsSaved" class="subtle"></span></div></div>
    <div class="grid2">
      <div class="card">
        <div class="sectionTitle"><h2>System log</h2><div class="row" style="margin:0"><button class="ghost small" id="backupBtn">Backup data now</button></div></div>
        <div style="max-height:380px;overflow-y:auto">${logs.map((l) => `<div class="logRow"><span class="lt">${esc(ist(l.at))}</span><span class="chip">${esc(l.type || l.source)}</span> ${esc(l.text)}</div>`).join('') || '<div class="empty">No log entries.</div>'}</div>
      </div>
      <div class="card">
        <h2>Data & backups</h2>
        <dl class="kv">
          <dt>Uptime</dt><dd>${Math.floor(health.uptimeSeconds / 60)} min</dd>
          <dt>Time (IST)</dt><dd>${esc(health.timeIst)}</dd>
          <dt>Queue</dt><dd>${esc(health.headline)}</dd>
          <dt>Backups</dt><dd>${backups.length ? backups.slice(0, 5).map((b) => esc(b.name || b)).join('<br>') : 'None yet'}</dd>
        </dl>
      </div>
    </div>`;
  $('#killBtn').onclick = () => run(api('POST', '/settings/kill-switch', { on: !s.agent.killSwitch }), (r) => r.killSwitch ? 'Kill switch ON — outbound stopped.' : 'Kill switch OFF.').then(() => { renderSettings(); refreshPills(); });
  $('#probeBtn').onclick = () => run(api('POST', '/ai/probe', {}), 'Model status refreshed').then(renderSettings);
  $('#backupBtn').onclick = () => run(api('POST', '/system/backup', {}), (r) => r.message).then(renderSettings);
  $('#saveSettings').onclick = () => run(api('PUT', '/settings', {
    agent: { autoExecute: $('#stAuto').checked, requireApprovalForConsequential: $('#stRequire').checked, maxToolSteps: +$('#stSteps').value },
    llm: { primary: $('#stPrimary').value, shareCustomerDataWithCloud: $('#stCloud').checked },
    calling: { windowStartHour: +$('#stWinStart').value, windowEndHour: +$('#stWinEnd').value, dailyCallLimit: +$('#stCallLimit').value, minSecondsBetweenCalls: +$('#stSpacing').value, retryDelayMinutes: +$('#stRetry').value, requireConsent: $('#stReqConsent').checked },
    messaging: { dailyMessageLimit: +$('#stMsgLimit').value, requireConsent: $('#stReqConsent').checked },
    automation: { autoMessageNewLead: $('#stAutoMessage').checked, autoCallNewLead: $('#stAutoCall').checked, newLeadMessageChannel: $('#stAutoMessageChannel').value },
    data: { saveTranscripts: $('#stTranscripts').checked },
    notifications: $('#stNotify').checked,
    voice: { tts: { engine: $('#stTts').value, voice: $('#stVoice').value, rate: +$('#stRate').value } },
  }), 'Settings saved').then(() => { $('#settingsSaved').textContent = 'Saved ' + new Date().toLocaleTimeString(); refreshPills(); });
}

boot();
