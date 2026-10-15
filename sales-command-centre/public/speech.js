(function (root, factory) {
  const speech = factory();
  if (typeof module === 'object' && module.exports) module.exports = speech;
  else root.DR53Speech = speech;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  function splitSpeechChunks(text, maxLength = 220) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    const sentences = normalized.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [normalized];
    const chunks = [];
    let current = '';

    for (const sentence of sentences) {
      const part = sentence.trim();
      const combined = current ? `${current} ${part}` : part;
      if (part.length <= maxLength && combined.length <= maxLength) {
        current = combined;
        continue;
      }

      if (current) chunks.push(current);
      current = '';
      if (part.length <= maxLength) {
        current = part;
        continue;
      }

      let phrase = '';
      for (const word of part.split(/\s+/)) {
        const next = phrase ? `${phrase} ${word}` : word;
        if (next.length <= maxLength) {
          phrase = next;
        } else {
          if (phrase) chunks.push(phrase);
          phrase = word;
        }
      }
      current = phrase;
    }

    if (current) chunks.push(current);
    return chunks;
  }

  function speakChunks(synth, createUtterance, chunks, isActive = () => true) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const speakNext = (index) => {
        if (!isActive()) { finish({ cancelled: true }); return; }
        if (index >= chunks.length) { finish({ completed: true }); return; }
        try {
          const utterance = createUtterance(chunks[index], index);
          utterance.onend = () => speakNext(index + 1);
          utterance.onerror = (event) => {
            if (!isActive() || event.error === 'canceled') finish({ cancelled: true });
            else finish({ error: event.error || 'unknown speech error' });
          };
          synth.speak(utterance);
        } catch (error) {
          finish({ error: error instanceof Error ? error.message : String(error) });
        }
      };

      speakNext(0);
    });
  }

  return { splitSpeechChunks, speakChunks };
});
