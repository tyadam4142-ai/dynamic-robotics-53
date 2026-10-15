'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLlm } = require('../src/llm');

const ollamaSettings = {
  llm: {
    providers: [{ id: 'local', type: 'ollama', label: 'Ollama', baseUrl: 'http://127.0.0.1:11434', model: 'test-model', enabled: true }],
    primary: 'local',
    fallback: 'none',
    allowFallback: false,
    shareCustomerDataWithCloud: false,
    temperature: 0.4,
    maxOutputTokens: 800,
    requestTimeoutMs: 5000,
  },
};

function responseStream(chunks, signal) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (signal) signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      else controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

test('Ollama streaming retains the final NDJSON record without a trailing newline', async () => {
  const llm = createLlm({
    getSettings: () => structuredClone(ollamaSettings),
    env: {},
    fetchImpl: async () => responseStream([
      '{"message":{"content":"The complete "}}\n',
      '{"message":{"content":"answer stays intact."}}',
    ]),
  });
  const deltas = [];
  const result = await llm.complete({
    messages: [{ role: 'user', content: 'Explain the product clearly.' }],
    onDelta: (piece) => deltas.push(piece),
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'The complete answer stays intact.');
  assert.equal(deltas.join(''), result.text);
});

test('OpenAI-compatible streaming handles CRLF and its final unterminated SSE event', async () => {
  const settings = structuredClone(ollamaSettings);
  settings.llm.providers = [{
    id: 'local-openai',
    type: 'openai',
    label: 'Local gateway',
    baseUrl: 'http://127.0.0.1:8080/v1',
    model: 'test-model',
    apiKeyEnv: 'TEST_KEY',
    enabled: true,
  }];
  settings.llm.primary = 'local-openai';
  const llm = createLlm({
    getSettings: () => settings,
    env: { TEST_KEY: 'test-only' },
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"A complete "}}]}\r\n\r\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"SSE reply."}}]}\r\n\r\ndata: [DONE]'));
        controller.close();
      },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
  });
  const result = await llm.complete({
    messages: [{ role: 'user', content: 'Explain the product clearly.' }],
    onDelta: () => {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'A complete SSE reply.');
});

test('Ollama tool-history arguments are sent as objects, not JSON-encoded strings', async () => {
  const settings = structuredClone(ollamaSettings);
  let chatBody;
  const llm = createLlm({
    getSettings: () => settings,
    env: {},
    fetchImpl: async (url, init) => {
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'test-model', capabilities: ['tools'] }] }), { status: 200 });
      }
      chatBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ message: { content: 'The customer was not found.' } }), { status: 200 });
    },
  });
  const result = await llm.complete({
    messages: [
      { role: 'assistant', content: '', toolCalls: [{ id: 'call_0', name: 'get_customer', args: { phone: '9876543210' } }] },
      { role: 'tool', toolCallId: 'call_0', name: 'get_customer', content: JSON.stringify({ ok: false, summary: 'No match.' }) },
    ],
    tools: [{ name: 'get_customer', description: 'Find a customer.', schema: { type: 'object', properties: { phone: { type: 'string' } } } }],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(chatBody.messages[0].tool_calls[0].function.arguments, { phone: '9876543210' });
  assert.equal(chatBody.messages[1].tool_name, 'get_customer');
});

test('stream cancellation remains active after response headers arrive', async () => {
  const llm = createLlm({
    getSettings: () => structuredClone(ollamaSettings),
    env: {},
    fetchImpl: async (_url, init) => responseStream([
      '{"message":{"content":"partial response"}}\n',
    ], init.signal),
  });
  const controller = new AbortController();
  const pending = llm.complete({
    messages: [{ role: 'user', content: 'Answer this.' }],
    onDelta: () => {},
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 20);
  const result = await pending;

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
});
