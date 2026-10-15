'use strict';
const { id, nowIso, str, deepClone } = require('./util');
const { systemPrompt } = require('./config');

const MAX_PERSISTED_MESSAGES = 40;
const REPLAY_MESSAGES = 26;
const TOOL_RESULT_LIMIT = 3000;

function findMentionedProduct(text, products) {
  const q = String(text || '').toLowerCase();
  return (products || [])
    .filter((product) => product.active !== false)
    .sort((a, b) => String(b.name || '').length - String(a.name || '').length)
    .find((product) => q.includes(String(product.name || '').toLowerCase()) ||
      (product.id === 'tap-sticker' && /\bsticker\b/.test(q)) ||
      (product.id === 'tap-card' && /\bcard\b/.test(q)) ||
      (product.id === 'website' && /\bwebsite\b|\bweb site\b/.test(q)) ||
      (product.id === 'e-adapter' && /\badapter\b/.test(q))) || null;
}

function productCatalogueReply(userText, products, previousUserMessages = []) {
  const q = String(userText || '').toLowerCase();
  if (/\b(customer|contact|lead|crm|call|campaign|task|message|follow.?up|update|create|delete)\b/i.test(q)) return null;
  const currentProduct = findMentionedProduct(q, products);
  const product = currentProduct || [...previousUserMessages].reverse()
    .map((message) => findMentionedProduct(message, products))
    .find(Boolean);
  if (!product) return null;

  const asksPriceOrDescription = /\b(price|cost|how much|what is|what's|what does|tell me about|explain|details|product)\b/i.test(q);
  const asksUnverifiedSpecification = /\b(waterproof|water resistant|durab|material|chip|compatib|iphone|android|deliver|shipping|dispatch|warranty|guarantee|voltage|capacity|ports?|output|battery|runtime|power|in stock|availability|included|tax|gst|discount)\b/i.test(q);
  if (!asksPriceOrDescription && !asksUnverifiedSpecification) return null;
  if (asksUnverifiedSpecification) return `I don’t have a verified answer about that specification for ${product.name}. The DR53 team needs to confirm it.`;

  const description = String(product.description || '').replace(/https?:\/\/\S+/g, '').trim();
  return description || `${product.name} is listed at ₹${Number(product.price).toLocaleString('en-IN')}${product.priceType === 'starting' ? ' as a starting price' : ''}.`;
}

/** Catalogue-aware safety net so the app still answers when every model is down. */
function offlineReply(userText, products, settings) {
  const q = String(userText || '').toLowerCase();
  const active = (products || []).filter((p) => p.active !== false);
  const productAnswer = productCatalogueReply(userText, active);
  if (productAnswer) return productAnswer;
  const fmt = (p) => `${p.name}: ₹${Number(p.price).toLocaleString('en-IN')}${p.priceType === 'starting' ? ' starting' : ''} — ${p.description}`;
  const money = active.filter((p) => q.includes(p.name.toLowerCase().split(' ')[0])).map(fmt);
  if (/^(hi|hello|hey|good (morning|afternoon|evening))/.test(q.trim())) return `Hi. I am the ${settings.business.name} sales assistant. I can search your CRM, draft and send approved messages, queue calls, run campaigns and report results. No model is running right now, so I can only answer from the catalogue — start Ollama or configure a provider for full agent work.`;
  if (/(price|cost|how much|catalogue|catalog|product)/.test(q)) return `Approved catalogue:\n${(money.length ? money : active.map(fmt)).join('\n')}\n\nI will not invent discounts, specifications or delivery promises.`;
  if (/(what can you do|help|commands)/.test(q)) return 'With a model configured I can: search customers, create leads, update statuses, add notes, schedule follow-ups and callbacks, queue calls and messages, build and run campaigns, produce daily reports and start voice sessions. Without a model I can only quote the catalogue above.';
  return 'No AI model is reachable right now, so I could not run this as an agent task. I have not changed any data and I have not contacted anyone. Start Ollama (ollama serve + ollama pull qwen2.5:3b) or configure a provider in AI Settings, then send the instruction again.';
}

function createAgent({ store, log, getSettings, llm, tools, queue, events, crm }) {
  const emit = (payload) => events && events.publish('agent', payload);

  async function listConversations() {
    const rows = await store.read('conversations');
    return rows.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messages.length, last: (c.messages.filter((m) => m.role === 'user').slice(-1)[0] || {}).content || '' })).slice(0, 40);
  }

  async function getConversation(conversationId) {
    const rows = await store.read('conversations');
    return rows.find((c) => c.id === conversationId) || null;
  }

  async function createConversation(title = 'New instruction thread') {
    const record = { id: id(), title: str(title, 120) || 'Agent thread', messages: [], contextSummary: '', createdAt: nowIso(), updatedAt: nowIso(), createdBy: 'operator' };
    await store.prepend('conversations', record);
    return record;
  }

  async function clearConversation(conversationId) {
    return store.update('conversations', (rows) => ({ value: rows.filter((c) => c.id !== conversationId), result: { ok: true } }));
  }

  async function appendMessage(conversationId, message) {
    return store.update('conversations', (rows) => {
      let c = rows.find((x) => x.id === conversationId);
      if (!c) { c = { id: conversationId || id(), title: str(message.content, 60) || 'Agent thread', messages: [], contextSummary: '', createdAt: nowIso(), createdBy: 'operator' }; rows.unshift(c); }
      c.messages.push(message);
      if (c.messages.length > MAX_PERSISTED_MESSAGES) {
        const dropped = c.messages.slice(0, c.messages.length - MAX_PERSISTED_MESSAGES);
        c.messages = c.messages.slice(-MAX_PERSISTED_MESSAGES);
        c.contextSummary = `${c.contextSummary ? c.contextSummary + '\n' : ''}${dropped.filter((m) => m.role === 'user').map((m) => `- ${String(m.content).slice(0, 120)}`).join('\n')}`.slice(-3000);
      }
      c.updatedAt = nowIso();
      if (c.title === 'Agent thread' && message.role === 'user') c.title = String(message.content).slice(0, 70);
      return { value: rows, result: c };
    });
  }

  function toolManifest() {
    return tools.tools.map((t) => ({ name: t.name, description: t.description, schema: t.schema }));
  }

  function agentPolicy(settings) {
    return [
      'You are operating a real CRM through real tools. Actions you take change stored data.',
      'Always call a tool before claiming something was done. If a tool fails, tell the operator exactly what failed and what would fix it.',
      'Never invent customer ids, phone numbers, prices or message content. Search first, then act on the record you found.',
      'Before contacting anyone, check consent with check_call_eligibility. If a customer has opted out or has not consented, refuse and explain.',
      'One step at a time: choose the single most useful tool, look at its result, then decide the next step.',
      settings.agent.autoExecute
        ? 'You may run read and write tools immediately. Consequential outbound actions are intercepted by the approval system — propose them and say the operator must approve.'
        : 'Ask before any write action; read-only tools are fine to run directly.',
      `Safety: kill switch ${settings.agent.killSwitch ? 'ON — no outbound work will run' : 'off'}. Calling window ${settings.calling.windowStartHour}:00-${settings.calling.windowEndHour}:00 IST.`,
      'Finish with a short report: what you did, what changed (with ids), what is queued, and what still needs the operator.',
    ].join('\n');
  }

  function replayMessages(conversation, settings, products) {
    const recent = conversation.messages.slice(-REPLAY_MESSAGES);
    const base = [
      { role: 'system', content: systemPrompt(settings, products) + '\n\n' + agentPolicy(settings) },
    ];
    if (conversation.contextSummary) base.push({ role: 'system', content: `Earlier in this thread:\n${conversation.contextSummary}` });
    for (const m of recent) {
      if (m.role === 'tool') base.push({ role: 'tool', name: m.name, toolCallId: m.toolCallId, content: typeof m.result === 'string' ? m.result : JSON.stringify(m.result) });
      else if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length) base.push({ role: 'assistant', content: m.content || '', toolCalls: m.toolCalls.map((c) => ({ id: c.id, name: c.name, args: c.args })) });
      else base.push({ role: m.role, content: String(m.content || '') });
    }
    return base;
  }

  async function requestApproval({ conversationId, toolName, args, reason, origin }) {
    const approvalId = id();
    const task = (await queue.enqueue({
      kind: 'tool', title: `Approved action: ${toolName}`, payload: { toolName, args }, createdBy: 'agent', maxAttempts: 1,
      approval: { id: approvalId, conversationId: conversationId || '', tool: toolName, args: deepClone(args), title: `${toolName}: ${str(reason, 80)}`, reason: str(reason, 300), status: 'pending', decision: null, origin: origin || 'agent', createdAt: nowIso() },
    }));
    if (task.error) return { error: task.error };
    emit({ type: 'approval_required', conversationId, approvalId, tool: toolName, args, reason, taskId: task.task?.id });
    return { approvalId, taskId: task.task?.id };
  }

  /**
   * One operator instruction -> plan -> tool calls -> results -> report.
   * Returns the assistant message that was persisted.
   */
  async function runTurn({ conversationId, text, onEvent = () => {}, signal = null, origin = 'operator', autoApprove = false }) {
    const instruction = str(text, 6000);
    if (!instruction) return { error: 'Type an instruction first.' };
    const settings = getSettings();
    const products = await store.read('products');
    let conversation = conversationId ? await getConversation(conversationId) : null;
    if (!conversation) conversation = await createConversation(instruction.slice(0, 70));

    const userMessage = { id: id(), role: 'user', content: instruction, at: nowIso(), origin };
    await appendMessage(conversation.id, userMessage);
    emit({ type: 'user_message', conversationId: conversation.id, message: userMessage });
    onEvent('user_message', userMessage);

    conversation = await getConversation(conversation.id);
    const messages = replayMessages(conversation, settings, products);
    const toolList = toolManifest();
    const trace = [];
    const previousUserMessages = conversation.messages
      .filter((message) => message.role === 'user')
      .slice(0, -1)
      .map((message) => message.content);
    let finalText = productCatalogueReply(instruction, products, previousUserMessages) || '';
    let provider = finalText ? { label: 'approved catalogue', model: 'local data' } : null;
    let stepsUsed = 0;

    if (settings.agent.killSwitch) {
      messages.push({ role: 'system', content: 'NOTE: the kill switch is ON. Do not attempt outbound actions; offer to prepare work instead and tell the operator how to disarm it.' });
    }

    const maxSteps = Math.max(1, settings.agent.maxToolSteps);
    for (let step = 0; !finalText && step < maxSteps; step++) {
      if (signal && signal.aborted) { finalText = 'You stopped me. Nothing further was done; queued tasks were left as they are.'; break; }
      stepsUsed = step + 1;
      emit({ type: 'thinking', conversationId: conversation.id, step, message: step === 0 ? 'Reading your instruction…' : `Step ${step + 1}: deciding the next action…` });
      onEvent('thinking', { step });
      const result = await llm.complete({ messages, tools: toolList, signal, containsCustomerData: true });

      if (!result.ok) {
        if (result.cancelled) { finalText = 'That run was cancelled.'; break; }
        const notice = `Model unavailable: ${result.error}`;
        emit({ type: 'model_error', conversationId: conversation.id, error: result.error });
        onEvent('model_error', { error: result.error });
        log('model_error', notice);
        finalText = `${offlineReply(instruction, products, settings)}\n\n(${notice})`;
        if (!trace.length) { messages.push({ role: 'assistant', content: finalText }); }
        break;
      }
      provider = result.provider;
      const thought = str(result.text, 2000);
      if (thought) emit({ type: 'thought', conversationId: conversation.id, text: thought, provider: provider.label });

      if (!result.toolCalls.length) { finalText = thought || offlineReply(instruction, products, settings); break; }

      const assistantMessage = { id: id(), role: 'assistant', content: thought, at: nowIso(), toolCalls: result.toolCalls.map((c) => ({ id: c.id, name: c.name, args: c.args })), provider };
      await appendMessage(conversation.id, assistantMessage);
      messages.push({ role: 'assistant', content: thought, toolCalls: assistantMessage.toolCalls });
      if (result.mode === 'json-tools') emit({ type: 'mode', conversationId: conversation.id, mode: 'Structured JSON tool loop (this model has no native tool calling).' });

      for (const call of result.toolCalls) {
        if (result.invalidToolName && !call.known) {
          const error = `The model asked for "${call.name}" which is not an implemented tool.`;
          emit({ type: 'tool_error', conversationId: conversation.id, tool: call.name, error });
          messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify({ ok: false, error }) });
          await appendMessage(conversation.id, { id: id(), role: 'tool', name: call.name, toolCallId: call.id, result: { ok: false, error }, at: nowIso() });
          continue;
        }
        emit({ type: 'tool_call', conversationId: conversation.id, toolCallId: call.id, tool: call.name, args: call.args, tier: (tools.tools.find((t) => t.name === call.name) || {}).tier });
        onEvent('tool_call', { tool: call.name, args: call.args });

        const approval = autoApprove ? null : tools.needsApproval(call.name, call.args);
        if (approval) {
          const requested = await requestApproval({ conversationId: conversation.id, toolName: call.name, args: call.args, reason: approval.reason, origin });
          const pendingResult = { ok: false, status: 'awaiting_approval', approvalId: requested.approvalId, message: `Proposed but not executed: ${call.name} needs operator approval. ${approval.reason}` };
          trace.push({ tool: call.name, args: call.args, result: pendingResult });
          messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify(pendingResult) });
          await appendMessage(conversation.id, { id: id(), role: 'tool', name: call.name, toolCallId: call.id, result: pendingResult, at: nowIso() });
          emit({ type: 'tool_result', conversationId: conversation.id, tool: call.name, ok: false, awaitingApproval: true, summary: 'Awaiting approval' });
          continue;
        }

        if (!settings.agent.autoExecute && (tools.tools.find((t) => t.name === call.name) || {}).tier !== 'read') {
          const held = { ok: false, status: 'not_authorized', message: 'Auto-execute is off in AI Settings, so write actions were not run.' };
          trace.push({ tool: call.name, args: call.args, result: held });
          messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify(held) });
          await appendMessage(conversation.id, { id: id(), role: 'tool', name: call.name, toolCallId: call.id, result: held, at: nowIso() });
          continue;
        }

        const executed = await tools.execute(call.name, call.args, { conversationId: conversation.id, origin: 'agent' });
        const compact = { ok: executed.ok, summary: str(executed.summary || executed.error || '', 600), data: executed.data === undefined ? undefined : deepClone(executed.data) };
        if (JSON.stringify(compact).length > TOOL_RESULT_LIMIT) compact.data = { note: 'Result was large and has been trimmed.', ...(compact.data && typeof compact.data === 'object' ? { keys: Object.keys(compact.data) } : {}) };
        trace.push({ tool: call.name, args: call.args, result: compact });
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify(compact) });
        await appendMessage(conversation.id, { id: id(), role: 'tool', name: call.name, toolCallId: call.id, result: compact, at: nowIso() });
        emit({ type: 'tool_result', conversationId: conversation.id, tool: call.name, ok: executed.ok, summary: compact.summary });
        onEvent('tool_result', { tool: call.name, ok: executed.ok, summary: compact.summary });
      }
    }

    if (!finalText) {
      const done = trace.filter((t) => t.result.ok).length;
      const held = trace.filter((t) => t.result.status === 'awaiting_approval').length;
      const failed = trace.filter((t) => !t.result.ok && t.result.status !== 'awaiting_approval').length;
      finalText = `I used ${stepsUsed} planning step(s): ${done} action(s) succeeded, ${held} awaiting your approval, ${failed} failed.\n` +
        trace.map((t) => `- ${t.tool}: ${t.result.ok ? (t.result.summary || 'done') : (t.result.message || t.result.summary || t.result.error || 'not completed')}`).join('\n') +
        '\nThat is the limit of the steps I was allowed; tell me to continue and I will pick it up from here.';
    }

    const assistantFinal = { id: id(), role: 'assistant', content: finalText, at: nowIso(), provider: provider ? `${provider.label} / ${provider.model}` : 'offline rules', trace: trace.map((t) => ({ tool: t.tool, ok: !!t.result.ok, summary: t.result.summary || t.result.message || '' })) };
    await appendMessage(conversation.id, assistantFinal);
    emit({ type: 'final', conversationId: conversation.id, message: assistantFinal });
    onEvent('final', assistantFinal);
    return { conversationId: conversation.id, message: assistantFinal, trace, provider };
  }

  async function runGoal(goal, context = {}) {
    const conversation = await createConversation(`Task: ${str(context.title || goal, 80)}`);
    await appendMessage(conversation.id, { id: id(), role: 'system', content: `This run was started automatically by the task queue. Context: ${JSON.stringify(context).slice(0, 800)}`, at: nowIso() });
    return runTurn({ conversationId: conversation.id, text: goal, origin: 'queue', autoApprove: false });
  }

  return { runTurn, runGoal, listConversations, getConversation, createConversation, clearConversation, appendMessage, offlineReply, toolManifest };
}

module.exports = { createAgent, offlineReply, productCatalogueReply };
