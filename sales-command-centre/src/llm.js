'use strict';
const { str, redact } = require('./util');

/**
 * Provider abstraction. One call surface, two wire formats (Ollama /api/chat and any
 * OpenAI-compatible /chat/completions gateway), plus a strict-JSON tool loop for models
 * that do not advertise tool-calling. Cloud providers are never used for customer data
 * unless the operator explicitly allowed it.
 */
function createLlm({ getSettings, env, fetchImpl }) {
  const doFetch = fetchImpl || fetch;

  function providers() {
    const s = getSettings();
    return (s.llm.providers || []).filter((p) => p.enabled !== false);
  }

  function byId(id) {
    const list = providers();
    return list.find((p) => p.id === id) || null;
  }

  function apiKeyFor(provider) {
    if (!provider.apiKeyEnv) return '';
    return str(env[provider.apiKeyEnv], 400);
  }

  function isCloud(provider) {
    return provider.type === 'openai' && !/^(http:\/\/(127\.0\.0\.1|localhost))|^http:\/\/192\.168|^http:\/\/10\./.test(provider.baseUrl) && !provider.baseUrl.includes('127.0.0.1') && !provider.baseUrl.includes('localhost');
  }

  async function request(url, init, timeoutMs, externalSignal, consume = (response) => response) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(Object.assign(new Error('The model request timed out.'), { name: 'TimeoutError' })), timeoutMs);
    const onExternal = () => controller.abort(Object.assign(new Error('The request was cancelled.'), { name: 'AbortError' }));
    if (externalSignal) { if (externalSignal.aborted) onExternal(); else externalSignal.addEventListener('abort', onExternal, { once: true }); }
    try {
      const response = await doFetch(url, { ...init, signal: controller.signal });
      return await consume(response);
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternal);
    }
  }

  /** Cheap reachability + capability probe. Never throws. */
  async function probe(provider, timeoutMs = 5000) {
    const base = { id: provider.id, label: provider.label, type: provider.type, model: provider.model, baseUrl: provider.baseUrl, cloud: isCloud(provider), needsKey: !!provider.apiKeyEnv, keyConfigured: !!apiKeyFor(provider), ok: false, modelReady: false, supportsTools: provider.type === 'openai', error: '' };
    if (provider.type === 'openai' && base.needsKey && !base.keyConfigured) { base.error = `Set ${provider.apiKeyEnv} in .env, then restart.`; return base; }
    try {
      if (provider.type === 'ollama') {
        const result = await request(`${provider.baseUrl.replace(/\/$/, '')}/api/tags`, { method: 'GET' }, timeoutMs, null, async (response) => ({
          response,
          data: response.ok ? await response.json() : null,
        }));
        const r = result.response;
        if (!r.ok) { base.error = `Ollama replied HTTP ${r.status}.`; return base; }
        const j = result.data;
        const models = (j.models || []).map((m) => m.name);
        base.models = models;
        const match = models.find((m) => m === provider.model || m === `${provider.model}:latest`);
        base.modelReady = !!match;
        base.ok = !!match;
        const entry = (j.models || []).find((m) => m.name === match);
        if (entry) {
          const caps = entry.capabilities || entry.details?.capabilities || [];
          base.supportsTools = Array.isArray(caps) ? caps.includes('tools') : true;
          base.contextLength = entry.details?.context_length || null;
        }
        if (!base.modelReady) base.error = base.models.length ? `Model "${provider.model}" is not downloaded. Run: ollama pull ${provider.model}` : `No models installed. Run: ollama pull ${provider.model}`;
        return base;
      }
      const headers = { Authorization: `Bearer ${apiKeyFor(provider)}` };
      const result = await request(`${provider.baseUrl.replace(/\/$/, '')}/models`, { headers }, timeoutMs, null, async (response) => ({
        response,
        data: response.ok ? await response.json().catch(() => ({})) : null,
      }));
      const r = result.response;
      if (!r.ok) { base.error = `Provider replied HTTP ${r.status} (${r.status === 401 ? 'the API key was rejected' : r.status === 429 ? 'rate limited' : 'check the base URL'}).`; return base; }
      const j = result.data;
      const ids = (j.data || j.models || []).map((m) => (typeof m === 'string' ? m : m.id));
      base.models = ids.slice(0, 60);
      base.modelReady = !ids.length || ids.includes(provider.model);
      base.ok = true;
      if (!base.modelReady) base.error = `Model "${provider.model}" was not found for this key. Available: ${base.models.slice(0, 6).join(', ')}`;
      return base;
    } catch (e) {
      base.error = e.name === 'AbortError' || e.name === 'TimeoutError' || str(e.message) === 'timeout'
        ? `No response within ${timeoutMs}ms. Is ${provider.label} running and reachable?`
        : `Could not reach ${provider.label}: ${str(e.message, 160)}`;
      return base;
    }
  }

  async function status(timeoutMs) {
    const s = getSettings();
    const list = await Promise.all(providers().map((p) => probe(p, timeoutMs)));
    const pick = (id) => list.find((p) => p.id === id) || null;
    const primary = pick(s.llm.primary) || list.find((p) => p.ok) || null;
    const fallback = s.llm.fallback && s.llm.fallback !== 'none' ? pick(s.llm.fallback) : null;
    const usable = (p) => p && (p.ok || (p.type === 'openai' && p.keyConfigured && p.modelReady));
    return {
      providers: list,
      primary: primary ? primary.id : null,
      fallback: fallback ? fallback.id : null,
      ready: !!(usable(primary) || usable(fallback)),
      activeProvider: usable(primary) ? primary.id : usable(fallback) ? fallback.id : (primary ? primary.id : null),
      activeLabel: usable(primary) ? primary.label : usable(fallback) ? `${fallback.label} (fallback)` : 'No model available — offline rules are in use',
      message: primary && primary.error ? primary.error : (list.length ? 'Ready.' : 'No AI provider is configured.'),
      shareCustomerDataWithCloud: !!s.llm.shareCustomerDataWithCloud,
    };
  }

  /**
   * Neutral agent messages -> provider wire format. Tool-calling models get real
   * tool_calls/tool roles; models without tool support get a JSON contract instead.
   */
  function toWire(messages, nativeTools, providerType) {
    const out = [];
    for (const m of messages) {
      if (m.role === 'system') { out.push({ role: 'system', content: str(m.content, 20000) }); continue; }
      if (m.role === 'tool') {
        const body = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        if (nativeTools) { const wire = { role: 'tool', content: str(body, 12000) }; if (m.toolCallId) wire.tool_call_id = m.toolCallId; if (m.name) wire.tool_name = m.name; out.push(wire); }
        else out.push({ role: 'user', content: `TOOL_RESULT ${m.name || 'tool'}: ${str(body, 6000)}` });
        continue;
      }
      if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length) {
        if (nativeTools) out.push({ role: 'assistant', content: str(m.content, 8000), tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: providerType === 'ollama' ? (c.args || {}) : JSON.stringify(c.args || {}) } })) });
        else out.push({ role: 'assistant', content: JSON.stringify({ thought: str(m.content, 300) || 'I will use a tool.', action: { tool: m.toolCalls[0].name, args: m.toolCalls[0].args || {} } }) });
        continue;
      }
      out.push({ role: m.role === 'user' || m.role === 'assistant' ? m.role : 'user', content: str(m.content, 20000) });
    }
    return out;
  }

  function toolSpec(tools) {
    return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }));
  }

  function jsonInstruction(tools) {
    return [
      'You control the CRM only through the tools listed below. To use a tool, reply with EXACTLY one JSON object and nothing else:',
      '{"thought":"one short sentence","action":{"tool":"tool_name","args":{"...": "..."}}}',
      'When you have finished and want to answer the user, reply:',
      '{"thought":"one short sentence","response":"your answer to the user"}',
      'Rules: valid JSON only, no markdown fences, no commentary outside the JSON, "args" must match the tool schema, one action per reply.',
      `Tools:\n${tools.map((t) => `- ${t.name}: ${t.description}\n  args schema: ${JSON.stringify(t.schema)}`).join('\n')}`,
    ].join('\n');
  }

  function extractJson(text) {
    const cleaned = String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const start = cleaned.indexOf('{');
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; } } }
    }
    return null;
  }

  async function callOnce({ provider, messages, tools, signal, onDelta, maxOutputTokens, temperature }) {
    const s = getSettings();
    const wantsTools = !!(tools && tools.length);
    const useNativeTools = wantsTools && provider.type === 'ollama' ? await ollamaSupportsTools(provider) : wantsTools;
    const payloadMessages = toWire(messages, useNativeTools, provider.type);
    const timeout = s.llm.requestTimeoutMs;

    if (provider.type === 'ollama') {
      const body = { model: provider.model, messages: payloadMessages, stream: !!onDelta, keep_alive: '15m', options: { temperature: Number.isFinite(temperature) ? temperature : s.llm.temperature, num_predict: Number.isFinite(maxOutputTokens) ? Math.max(24, Math.min(512, Math.round(maxOutputTokens))) : s.llm.maxOutputTokens } };
      if (useNativeTools) body.tools = toolSpec(tools);
      else if (wantsTools) body.messages = [{ role: 'system', content: jsonInstruction(tools) }, ...payloadMessages];
      return request(`${provider.baseUrl.replace(/\/$/, '')}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, timeout, signal, async (response) => {
        if (!response.ok) { const t = await response.text().catch(() => ''); throw new LlmError(`Ollama HTTP ${response.status}: ${str(t, 300)}`, provider); }
        if (onDelta) return postProcess(await readNdjson(response, provider, useNativeTools, onDelta), wantsTools ? tools : null, useNativeTools);
        return postProcess(normaliseOllama(await response.json(), provider, useNativeTools ? 'native-tools' : 'json-tools'), wantsTools ? tools : null, useNativeTools);
      });
    }

    if (provider.type === 'openai') {
      if (!apiKeyFor(provider)) throw new LlmError(`Missing API key: set ${provider.apiKeyEnv} in .env and restart.`, provider);
      const body = { model: provider.model, messages: payloadMessages, stream: !!onDelta, temperature: s.llm.temperature, max_tokens: s.llm.maxOutputTokens };
      if (useNativeTools) { body.tools = toolSpec(tools); body.tool_choice = 'auto'; }
      else if (wantsTools) body.messages = [{ role: 'system', content: jsonInstruction(tools) }, ...payloadMessages];
      return request(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKeyFor(provider)}` }, body: JSON.stringify(body) }, timeout, signal, async (response) => {
        if (!response.ok) { const t = await response.text().catch(() => ''); throw new LlmError(`${provider.label} HTTP ${response.status}: ${redactText(str(t, 300))}`, provider); }
        if (onDelta) return postProcess(await readSse(response, provider, useNativeTools, onDelta), wantsTools ? tools : null, useNativeTools);
        return postProcess(normaliseOpenai(await response.json(), provider, useNativeTools ? 'native-tools' : 'json-tools'), wantsTools ? tools : null, useNativeTools);
      });
    }
    throw new LlmError(`Unknown provider type ${provider.type}`, provider);
  }

  /** In JSON tool mode the model's "action" arrives as text: turn it into a toolCall. */
  function postProcess(result, tools, nativeTools) {
    if (!tools || nativeTools || result.toolCalls.length) return result;
    const parsed = extractJson(result.text);
    if (!parsed) return result;
    const action = parsed.action || parsed.tool_call || (parsed.tool ? parsed : null);
    if (action && action.tool) {
      const known = tools.some((t) => t.name === String(action.tool));
      result.text = str(parsed.thought || parsed.response || '', 4000);
      result.toolCalls = [{ id: `json_${Date.now()}`, name: String(action.tool), args: action.args || action.arguments || {}, known }];
      if (!known) result.invalidToolName = String(action.tool);
    } else if (typeof parsed.response === 'string') {
      result.text = parsed.response;
    }
    return result;
  }

  const toolSupportCache = new Map();
  async function ollamaSupportsTools(provider) {
    const key = `${provider.id}:${provider.model}`;
    if (toolSupportCache.has(key)) return toolSupportCache.get(key);
    const p = await probe(provider, 4000);
    toolSupportCache.set(key, p.supportsTools);
    return p.supportsTools;
  }

  function redactText(text) {
    return String(text || '').replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]').replace(/Bearer\s+[A-Za-z0-9._-]{8,}/g, 'Bearer [redacted]');
  }

  function normaliseOllama(json, provider, mode) {
    const msg = json.message || {};
    return {
      provider: { id: provider.id, label: provider.label, model: provider.model, type: provider.type },
      text: str(msg.content, 20000),
      toolCalls: (msg.tool_calls || []).map((c, i) => ({ id: c.id || `call_${i}`, name: str(c.function?.name, 80), args: c.function?.arguments && typeof c.function.arguments === 'string' ? safeParse(c.function.arguments) : (c.function?.arguments || {}) })),
      mode,
      usage: { totalTokens: json.eval_count || json.total_duration || null },
    };
  }

  function normaliseOpenai(json, provider, mode) {
    const choice = (json.choices || [])[0] || {};
    const msg = choice.message || {};
    return {
      provider: { id: provider.id, label: provider.label, model: provider.model, type: provider.type },
      text: str(msg.content, 20000),
      toolCalls: (msg.tool_calls || []).map((c, i) => ({ id: c.id || `call_${i}`, name: str(c.function?.name, 80), args: safeParse(c.function?.arguments) })),
      mode,
      usage: { totalTokens: json.usage?.total_tokens || null },
    };
  }

  async function readNdjson(response, provider, nativeTools, onDelta) {
    let text = '';
    const calls = new Map();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const readLine = (line) => {
      if (!line.trim()) return;
      let json; try { json = JSON.parse(line); } catch { return; }
      const piece = typeof json.message?.content === 'string' ? json.message.content : '';
      if (piece) { text += piece; onDelta(piece); }
      for (const [i, c] of (json.message?.tool_calls || []).entries()) {
        const existing = calls.get(i) || { name: '', args: '' };
        existing.name += c.function?.name || '';
        const a = c.function?.arguments;
        existing.args += typeof a === 'string' ? a : JSON.stringify(a || {});
        calls.set(i, existing);
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) { buffer += decoder.decode(); break; }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) readLine(line);
    }
    readLine(buffer);
    return {
      provider: { id: provider.id, label: provider.label, model: provider.model, type: provider.type },
      text,
      toolCalls: nativeTools ? [...calls.values()].map((c, i) => ({ id: `call_${i}`, name: str(c.name, 80), args: safeParse(c.args) })) : [],
      mode: nativeTools ? 'native-tools' : 'json-tools',
    };
  }

  async function readSse(response, provider, nativeTools, onDelta) {
    let text = '';
    const calls = new Map();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const readEvent = (event) => {
      const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') return;
      let json; try { json = JSON.parse(data); } catch { return; }
      const delta = (json.choices || [])[0]?.delta || {};
      const piece = typeof delta.content === 'string' ? delta.content : '';
      if (piece) { text += piece; onDelta(piece); }
      for (const c of delta.tool_calls || []) {
        const key = c.index ?? 0;
        const existing = calls.get(key) || { name: '', args: '' };
        existing.name += c.function?.name || '';
        existing.args += c.function?.arguments || '';
        calls.set(key, existing);
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) { buffer += decoder.decode(); break; }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      for (const event of events) readEvent(event);
    }
    readEvent(buffer);
    return {
      provider: { id: provider.id, label: provider.label, model: provider.model, type: provider.type },
      text,
      toolCalls: nativeTools ? [...calls.values()].map((c, i) => ({ id: `call_${i}`, name: str(c.name, 80), args: safeParse(c.args) })) : [],
      mode: nativeTools ? 'native-tools' : 'json-tools',
    };
  }

  /**
   * Route one completion through primary then fallback. Falls back only when
   * llm.allowFallback is on, and reports which provider actually answered.
   */
  async function complete({ messages, tools, signal, onDelta, containsCustomerData, preferProviderId, onlyProviderId, localOnly = false, maxOutputTokens, temperature } = {}) {
    const s = getSettings();
    const order = [];
    const allowCloud = (p) => !isCloud(p) || s.llm.shareCustomerDataWithCloud !== false;
    const push = (id) => { const p = id ? byId(id) : null; if (p && !order.includes(p)) order.push(p); };
    if (onlyProviderId) push(onlyProviderId);
    else {
      if (preferProviderId) push(preferProviderId);
      push(s.llm.primary);
      if (s.llm.allowFallback && s.llm.fallback && s.llm.fallback !== 'none') push(s.llm.fallback);
      for (const p of providers()) push(p.id);
    }
    const eligible = order.filter((p) => (!localOnly || p.type === 'ollama') && (!containsCustomerData || allowCloud(p)) && (!p.apiKeyEnv || apiKeyFor(p)));
    if (!eligible.length) {
      const blocked = order.filter((p) => containsCustomerData && !allowCloud(p));
      return { ok: false, error: blocked.length && blocked.length === order.length
        ? `Every configured provider is a cloud service and "Share customer data with cloud models" is off. Turn it on in AI settings or configure a local Ollama model.`
        : (order.length && order[0].apiKeyEnv ? `No usable model. Set ${order[0].apiKeyEnv} in .env or configure a local provider.` : 'No AI provider is configured.'), attempts: [] };
    }
    const attempts = [];
    for (const provider of eligible) {
      try {
        const result = await callOnce({ provider, messages, tools, signal, onDelta, maxOutputTokens, temperature });
        result.ok = true;
        result.attempts = attempts;
        result.fallbackUsed = provider.id !== (preferProviderId || s.llm.primary);
        return result;
      } catch (e) {
        const aborted = e.name === 'AbortError';
        attempts.push({ provider: provider.id, error: aborted ? 'cancelled before completion' : str(e.message, 200) });
        if (aborted) return { ok: false, cancelled: true, error: 'The request was cancelled.', attempts };
        if (e instanceof LlmError && e.permanent) return { ok: false, error: str(e.message, 300), attempts };
      }
    }
    return { ok: false, error: `No configured model could answer. ${attempts.map((a) => `${a.provider}: ${a.error}`).join('; ')}`, attempts };
  }

  class LlmError extends Error {
    constructor(message, provider) {
      super(message);
      this.name = 'LlmError';
      this.providerId = provider.id;
      this.permanent = /HTTP 4(00|01|03|04|29)/.test(message);
    }
  }

  function safeParse(text) {
    if (!text) return {};
    if (typeof text === 'object') return text;
    try { return JSON.parse(String(text)) || {}; } catch { return {}; }
  }

  return { providers, byId, probe, status, complete, extractJson, isCloud, apiKeyFor, clearToolCache: () => toolSupportCache.clear() };
}

module.exports = { createLlm };
