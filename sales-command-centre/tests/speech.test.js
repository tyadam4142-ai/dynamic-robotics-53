'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitSpeechChunks, speakChunks } = require('../public/speech');

test('speech chunks preserve the complete response and natural sentence boundaries', () => {
  const text = 'First, the customer needs a clear answer about the request. Next, explain the verified details and note any uncertainty. Finally, agree on one practical next step.';
  const chunks = splitSpeechChunks(text, 80);

  assert.equal(chunks.join(' '), text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.slice(0, -1).every((chunk) => chunk.length <= 80));
});

test('long speech paragraphs are split without dropping final words', () => {
  const text = `${'This sentence remains part of the complete spoken response. '.repeat(18)}The closing sentence is also spoken.`;
  const chunks = splitSpeechChunks(text, 120);

  assert.equal(chunks.join(' '), text);
  assert.ok(chunks.every((chunk) => chunk.length <= 120));
  assert.match(chunks.at(-1), /closing sentence is also spoken\.$/);
});

test('empty speech produces no queued utterances', () => {
  assert.deepEqual(splitSpeechChunks(' \n\t '), []);
});

test('speech queue waits for each utterance to finish before starting the next', async () => {
  const utterances = [];
  const synth = { speak: (utterance) => utterances.push(utterance) };
  const playback = speakChunks(synth, (text) => ({ text }), ['First.', 'Second.']);

  assert.deepEqual(utterances.map((utterance) => utterance.text), ['First.']);
  utterances[0].onend();
  assert.deepEqual(utterances.map((utterance) => utterance.text), ['First.', 'Second.']);
  utterances[1].onend();
  assert.deepEqual(await playback, { completed: true });
});

test('speech queue cancels immediately after interruption and does not speak remaining chunks', async () => {
  const utterances = [];
  const synth = { speak: (utterance) => utterances.push(utterance) };
  let active = true;
  const playback = speakChunks(synth, (text) => ({ text }), ['First.', 'Should not speak.'], () => active);

  active = false;
  utterances[0].onerror({ error: 'canceled' });

  assert.deepEqual(await playback, { cancelled: true });
  assert.equal(utterances.length, 1);
});

test('speech queue surfaces playback errors instead of reporting completion', async () => {
  const utterances = [];
  const synth = { speak: (utterance) => utterances.push(utterance) };
  const playback = speakChunks(synth, (text) => ({ text }), ['First.', 'Second.']);
  utterances[0].onerror({ error: 'audio-busy' });

  assert.deepEqual(await playback, { error: 'audio-busy' });
  assert.equal(utterances.length, 1);
});
