'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { id, nowIso, str, normalizePhone, fmtIst, deepClone } = require('./util');
const { catalogueText } = require('./config');

const STATES = ['draft', 'ready', 'awaiting_answer', 'disclosing', 'listening', 'thinking', 'speaking', 'pausing', 'ended', 'failed'];
const REFUSAL = /\b(no thanks|no thank you|not interested|don'?t call|stop calling|remove me|opt ?out|unsubscribe|hang up|end the call|wrong number)\b/i;
const TEMPORARY_DECLINE = /\b(not a good time|busy right now|can'?t talk|cannot talk|call me later|another time|later please)\b/i;
const AFFIRMATIVE = /\b(yes|yeah|yep|sure|okay|ok|go ahead|fine|thats fine|that'?s fine)\b/i;
const WHO_ARE_YOU = /\b(who are you|are you human|are you a robot|are you ai|real person|automated|bot)\b/i;

/**
 * Voice session engine.
 *  - mode "local": the browser captures speech (Web Speech API) and the Mac speaks the reply
 *    through browser speech synthesis. Text reasoning stays on the configured local model. The
 *    customer's voice must reach the Mac microphone, so on a cellular call this is an acoustic
 *    bridge, not call audio. Browser speech recognition may use an online service.
 *  - mode "provider": ElevenLabs/Twilio owns the media; this engine only tracks the session and
 *    syncs status + transcript (see outbound.js).
 */
function createVoice({ store, log, getSettings, llm, crm, exec, dataDir, platform = process.platform }) {
  const ttsDir = path.join(dataDir, 'tts');
  fs.mkdirSync(ttsDir, { recursive: true });

  function ttsCapability() {
    return { available: true, engine: 'browser speech synthesis (system voice)', reason: 'Fast, local system speech synthesis is used for each reply; no audio file is generated per turn.' };
  }

  async function speakToAudioFile(text, voice, rate) {
    const cap = ttsCapability();
    if (!cap.available) return { error: cap.reason };
    const clean = String(text || '').replace(/[*#`>_]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    if (!clean) return { error: 'Nothing to speak.' };
    const hash = crypto.createHash('sha256').update(`${voice}|${rate}|${clean}`).digest('hex').slice(0, 24);
    const m4a = path.join(ttsDir, `${hash}.m4a`);
    if (fs.existsSync(m4a) && fs.statSync(m4a).size > 0) return { file: m4a, cached: true, text: clean };
    const aiff = path.join(ttsDir, `${hash}.aiff`);
    try {
      await exec('say', voice ? ['-v', voice, '-r', String(rate), '-o', aiff, clean] : ['-r', String(rate), '-o', aiff, clean]);
      await exec('afconvert', ['-f', 'm4af', '-d', 'aac', aiff, m4a]);
      try { fs.unlinkSync(aiff); } catch { /* keep going */ }
      pruneCache();
      return { file: m4a, cached: false, text: clean };
    } catch (e) {
      return { error: `macOS speech failed: ${str(e.message, 160)}. The browser can speak instead (set the TTS engine to "browser").` };
    }
  }

  function pruneCache() {
    try {
      const files = fs.readdirSync(ttsDir).map((f) => ({ f, t: fs.statSync(path.join(ttsDir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      files.slice(60).forEach(({ f }) => fs.unlinkSync(path.join(ttsDir, f)));
    } catch { /* non-critical */ }
  }

  async function openingLine(session, settings) {
    const name = session.customerName ? ` ${session.customerName}` : '';
    const interest = session.productInterest ? `your enquiry about ${session.productInterest}` : 'your enquiry';
    return `Hi${name}, I’m the AI sales assistant from ${settings.business.name}. I’m following up on ${interest}. Is now a good time for a quick chat?`;
  }

  async function start(input) {
    const settings = getSettings();
    const mode = input.mode === 'provider' ? 'provider' : 'local';
    let customer = null;
    if (input.customerId) customer = await crm.get(input.customerId);
    const n = normalizePhone(input.phone || customer?.phone || '');
    if (n.error) return { error: n.error };
    if (settings.calling.requireConsent !== false) {
      const gate = await crm.eligibility(customer?.id || n.phone, 'call');
      const hardBlock = gate.optOut || /Not Interested|opted out|only agreed to/i.test(gate.reason || '');
      if (!gate.ok && (hardBlock || !input.operatorConfirmed)) return { error: hardBlock ? gate.reason : `${gate.reason} If you have confirmed consent verbally, tick "operator confirmed" and try again.` };
      if (!gate.ok) log('consent_override', `Manual consent confirmation to place a call to ${customer?.name || n.phone}: ${gate.reason}`);
    }
    const session = {
      id: id(), mode, customerId: customer?.id || str(input.customerId, 60), customerName: customer?.name || str(input.customerName, 120) || '',
      phone: n.phone, productInterest: str(input.productInterest, 150) || customer?.product || '', purpose: str(input.purpose, 300) || 'follow up on an existing enquiry',
      state: 'ready', turn: 0, transcript: [], notes: [], opening: '', startedAt: nowIso(), updatedAt: nowIso(), endedAt: null,
      silenceCount: 0, awaitingPermission: true, maxSeconds: settings.voice.maxSeconds, error: '', summary: '', outcome: '',
      source: str(input.source, 40) || 'console', campaignId: str(input.campaignId, 60),
    };
    session.opening = await openingLine(session, settings);
    await store.prepend('voice_sessions', session);
    await store.prepend('calls', {
      id: id(), voiceSessionId: session.id, kind: mode === 'local' ? 'local_voice_assist' : 'ai_voice_call', provider: mode === 'local' ? 'local-mac' : 'elevenlabs',
      customerId: session.customerId, customerName: session.customerName, phone: session.phone, purpose: session.purpose, productInterest: session.productInterest,
      status: 'session_created', outcome: '', notes: '', transcript: [], startedAt: session.startedAt, endedAt: null, createdAt: nowIso(), updatedAt: nowIso(),
      audio: mode === 'local' ? 'acoustic_bridge' : 'provider_bidirectional',
    });
    log('voice', `${mode === 'local' ? 'Local voice session' : 'Provider voice session'} opened with ${session.customerName || session.phone}`, { customerId: session.customerId || undefined, meta: { voiceSessionId: session.id } });
    return { session, tts: ttsCapability(), next: 'Speak the opening line, then switch to listening.' };
  }

  async function get(sessionId) {
    const rows = await store.read('voice_sessions');
    return rows.find((s) => s.id === sessionId) || null;
  }

  async function setState(sessionId, state, extra = {}) {
    return store.update('voice_sessions', (rows) => {
      const s = rows.find((x) => x.id === sessionId);
      if (!s) return { value: rows, result: { error: 'Voice session not found.' } };
      if (!STATES.includes(state)) return { value: rows, result: { error: `Unknown voice state ${state}.` } };
      if (['ended', 'failed'].includes(s.state) && !['ended', 'failed'].includes(state)) return { value: rows, result: { error: `The session already ${s.state}.` } };
      s.state = state; s.updatedAt = nowIso();
      Object.assign(s, deepClone(extra));
      return { value: rows, result: { session: s } };
    });
  }

  async function pushLine(sessionId, speaker, text, meta = {}) {
    return store.update('voice_sessions', (rows) => {
      const s = rows.find((x) => x.id === sessionId);
      if (!s) return { value: rows, result: { error: 'Voice session not found.' } };
      s.transcript.push({ at: nowIso(), speaker, text: str(text, 4000), ...meta });
      s.updatedAt = nowIso();
      return { value: rows, result: s };
    });
  }

  function callLivePrompt(session, settings, products) {
    return [
      `You are Daya, the AI sales assistant for ${settings.business.name}. You speak with customers in a real-time, voice-first conversation. Be transparent that you are an AI if asked; never pretend to be human.`,
      'Sound like a calm, attentive, capable sales professional—not a call-centre script. Use ordinary spoken English, contractions, short sentences, and a warm but restrained tone. Do not say “Certainly”, “Absolutely”, “Great question”, or the customer’s name on every turn. Avoid filler, sales jargon, repeated greetings, and over-cheerful exclamation marks.',
      'Answer the customer’s latest point first. Usually use one to three short sentences, adapting the detail to the question. Never omit an important qualification just to be brief. Ask at most one short follow-up question, and only when it genuinely helps. No markdown, bullets, emojis, stage directions, or internal labels.',
      'Never repeat the opening, re-state facts the customer already heard, answer a different question, or talk without a new customer turn. If the customer asks a direct price question, give the exact approved listed price. Website Development is a starting price, not a final quote. Never invent specifications, compatibility, discounts, warranty, stock, taxes, shipping, or delivery dates.',
      'Product facts: Tap Tag Sticker is a personalised tap-enabled sticker that opens a digital profile or webpage, potentially with links such as Instagram; listed price ₹553. Tap Tag Card has the customer’s logo and opens its linked profile webpage when tapped; listed price ₹753. Website Development projects start at ₹5,300 and the final quote depends on scope. E-Adapter is listed at ₹2,553, but technical specifications and exact included parts are unverified and must be confirmed by the team.',
      'If a customer asks about unverified material, waterproofing, durability, chip type, device compatibility, warranty, stock, delivery, or E-Adapter output/capacity/ports, say plainly that you do not have a verified answer and offer team confirmation. Do not bluff.',
      'If the customer declines, asks to stop, or requests a human, acknowledge briefly, do not argue, say goodbye, and include [END CALL] at the end. If they explicitly ask not to be contacted, treat that as an opt-out.',
      'If the customer is vague, ask one focused question. If they sound busy or confused, slow down and simplify. If unsure, offer a human follow-up.',
      settings.agent.extraGuidance ? `Extra guidance: ${settings.agent.extraGuidance}` : '',
      `Customer: ${session.customerName || 'not named'} | Product interest: ${session.productInterest || 'not specified'} | Call purpose: ${session.purpose}`,
      `Approved live catalogue:
${catalogueText(products) || '(none)'}`,
    ].filter(Boolean).join('\n\n');
  }

  function productForQuestion(text, session, products) {
    const q = String(text || '').toLowerCase();
    const active = (products || []).filter((p) => p.active !== false);
    const aliases = {
      'tap-sticker': /tap[ -]?tag sticker|tap sticker|sticker/i,
      'tap-card': /tap[ -]?tag card|tap card|logo card|business card|\bcard\b/i,
      website: /website development|website|web site|web development|web design/i,
      'e-adapter': /e[ -]?adapter|adapter|backup power/i,
    };
    const explicit = active.find((p) => aliases[p.id]?.test(q) || q.includes(String(p.name || '').toLowerCase()));
    if (explicit) return explicit;
    const interest = String(session.productInterest || '').toLowerCase();
    return active.find((p) => aliases[p.id]?.test(interest) || interest.includes(String(p.name || '').toLowerCase())) || null;
  }

  function accurateProductReply(text, session, products) {
    const q = String(text || '').toLowerCase();
    const priceIntent = /\b(price|cost|how much|rate|price list|rupees|afford|charge)\b/i.test(q) || /how much|₹/i.test(q);
    const specIntent = /waterproof|water resistant|durab|material|chip|compatib|iphone|android|deliver|shipping|dispatch|warranty|guarantee|voltage|capacity|ports?|output|battery|runtime|power|supported device|laptop|in stock|availability|included|tax|gst|discount/i.test(q);
    const definitionIntent = /what is|what's|tell me about|explain|what does|how does|how do|what are|purpose|work|use|feature|details/i.test(q);
    const asksList = /what products|which products|product list|what do you sell|what does dr53 sell/i.test(q);
    const active = (products || []).filter((p) => p.active !== false);
    if (asksList) {
      const names = active.map((p) => `${p.name} ${p.priceType === 'starting' ? 'starting at ' : ''}₹${Number(p.price).toLocaleString('en-IN')}`);
      if (names.length) return `We currently list ${names.join(', ')}. Which one would you like to know about?`;
    }
    const p = productForQuestion(q, session, active);
    if (!p) return null;
    const idValue = String(p.id || '').toLowerCase();
    if (specIntent) {
      if (idValue === 'e-adapter') return 'I don’t want to guess about the E-Adapter’s specifications. Our team needs to confirm its compatibility and exact included components.';
      if (idValue === 'website') return 'That depends on the project scope. Our team can confirm whether that feature is included in your quote.';
      return `I don’t have a verified answer about that ${idValue === 'tap-sticker' ? 'sticker' : 'card'} detail yet. Our team can confirm compatibility and delivery before you decide.`;
    }
    if (priceIntent) {
      if (idValue === 'tap-sticker') return 'The Tap Tag Sticker is listed at ₹553. It opens your digital profile or webpage when someone taps it.';
      if (idValue === 'tap-card') return 'The Tap Tag Card is listed at ₹753. It carries your logo and opens your linked profile webpage when tapped.';
      if (idValue === 'website') return 'Website projects start at ₹5,300. The final quote depends on your pages, content, and required features.';
      if (idValue === 'e-adapter') return 'The E-Adapter is listed at ₹2,553. Its technical specifications still need confirmation from our team.';
      return `${p.name} is listed at ₹${Number(p.price).toLocaleString('en-IN')}${p.priceType === 'starting' ? ' as a starting price' : ''}. The team can confirm any order-specific details.`;
    }
    const mentionsProduct = /\bsticker\b|\bcard\b|\bwebsite\b|\bsite\b|\badapter\b|\bproduct\b/i.test(q);
    if (definitionIntent || (mentionsProduct && q.trim().split(/\s+/).length <= 5)) {
      if (idValue === 'tap-sticker') return 'The Tap Tag Sticker is a personalised tap-enabled sticker that opens your digital profile or webpage, including links such as Instagram.';
      if (idValue === 'tap-card') return 'The Tap Tag Card has your logo and opens your linked profile webpage when tapped. Its listed price is ₹753.';
      if (idValue === 'website') return 'We build websites around your needs and features. Projects start at ₹5,300, with the final quote based on scope.';
      if (idValue === 'e-adapter') return 'The E-Adapter is listed at ₹2,553, but its technical specifications are not yet verified. Our team should confirm details for your use case.';
    }
    return null;
  }

  function cleanSpokenText(text) {
    return String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/[*#`_>]/g, '').replace(/\[END CALL\]/gi, '').replace(/\s+/g, ' ').trim();
  }

  async function utterance(sessionId, text) {
    const session = await get(sessionId);
    if (!session) return { error: 'Voice session not found.' };
    if (session.state === 'ended') return { error: 'This voice session has ended.' };
    const settings = getSettings();
    const heard = str(text, 2000);
    if (!heard) return { error: 'No speech was recognised. Check the microphone and try again.' };
    session.silenceCount = 0;
    await pushLine(sessionId, 'customer', heard);
    await setState(sessionId, 'thinking', { lastUtterance: heard });

    if (TEMPORARY_DECLINE.test(heard)) {
      const reply = 'Of course. I’ll note that now isn’t a good time. Thank you, and goodbye.';
      await pushLine(sessionId, 'ai', reply);
      await setState(sessionId, 'speaking', { lastReply: reply, pendingEnd: true });
      const endResult = await end(sessionId, { reason: 'customer_busy', outcome: 'callback_requested' });
      return { reply, state: 'ended', tts: ttsCapability(), ended: true, summary: endResult.summary, outcome: 'callback_requested' };
    }

    const wantsToStop = REFUSAL.test(heard);
    if (wantsToStop) {
      const goodbye = 'Understood, thank you for your time. I will stop contacting you. Goodbye.';
      await pushLine(sessionId, 'ai', goodbye);
      const outcome = /not interested/i.test(heard) ? 'not_interested' : /wrong number/i.test(heard) ? 'wrong_number' : 'callback_requested';
      await setState(sessionId, 'speaking', { lastReply: goodbye, pendingEnd: true });
      if (session.customerId && /stop calling|don'?t call|no more|opt ?out|remove me/i.test(heard)) await crm.optOut(session.customerId, `Said during call: ${heard.slice(0, 200)}`);
      const endResult = await end(sessionId, { reason: 'customer_declined', outcome });
      return { reply: goodbye, state: 'ended', tts: ttsCapability(), ended: true, summary: endResult.summary, outcome };
    }

    if (session.awaitingPermission) {
      if (/^(hello|hi|are you there|can you hear me)[.!? ]*$/i.test(heard.trim())) {
        const reply = 'Hi, I’m here. Is now a good time for a quick chat?';
        await pushLine(sessionId, 'ai', reply);
        await setState(sessionId, 'speaking', { lastReply: reply });
        return { reply, state: 'speaking', tts: await audioFor(sessionId, reply) };
      }
      const asksSomething = /\?|\b(what|which|how|price|cost|tell me|explain|does it|can you|could you|details|more about)\b/i.test(heard);
      if (AFFIRMATIVE.test(heard) && !asksSomething) {
        await setState(sessionId, 'listening', { awaitingPermission: false });
        const reply = `Thanks. I’m following up about ${session.productInterest || 'your enquiry'}. What would you like to know?`;
        await pushLine(sessionId, 'ai', reply);
        await setState(sessionId, 'speaking', { lastReply: reply });
        return { reply, state: 'speaking', tts: await audioFor(sessionId, reply) };
      }
      if (!AFFIRMATIVE.test(heard) && !asksSomething) {
        const reply = 'No problem. Is this a better time, or would you prefer that I end the call?';
        await pushLine(sessionId, 'ai', reply);
        await setState(sessionId, 'speaking', { lastReply: reply });
        return { reply, state: 'speaking', tts: await audioFor(sessionId, reply) };
      }
      // A customer can answer the greeting and ask a real question in the same turn.
      // Don't discard that question just because their reply also contains “yes”.
      await setState(sessionId, 'listening', { awaitingPermission: false });
    }

    // Keep routine acknowledgements natural and avoid pitching the current product
    // again when the customer only says thanks/okay.
    const simpleTurn = heard.trim().toLowerCase().replace(/[.!?]+$/g, '').trim();
    let smallTalkReply = '';
    if (/^(thanks|thank you|thanks a lot|thank you so much)$/.test(simpleTurn)) {
      smallTalkReply = 'You’re welcome. Is there anything else you’d like to know?';
    } else if (/^(okay|ok|sure|right|got it|understood)$/.test(simpleTurn)) {
      smallTalkReply = 'Of course. What would be most useful to know next?';
    } else if (/^(hello|hi|are you there|can you hear me)$/.test(simpleTurn)) {
      smallTalkReply = 'I’m here. What would you like to know?';
    }
    if (smallTalkReply) {
      await pushLine(sessionId, 'ai', smallTalkReply, { provider: 'local-conversation-rule' });
      await store.update('voice_sessions', (rows) => { const s = rows.find((x) => x.id === sessionId); s.turn = (s.turn || 0) + 1; return rows; });
      await setState(sessionId, 'speaking', { lastReply: smallTalkReply, model: 'local conversation rule' });
      return { reply: smallTalkReply, state: 'speaking', tts: await audioFor(sessionId, smallTalkReply), provider: 'local-conversation-rule' };
    }

    const products = await store.read('products');
    const factualReply = accurateProductReply(heard, session, products);
    if (factualReply) {
      await pushLine(sessionId, 'ai', factualReply, { provider: 'local-catalogue' });
      await store.update('voice_sessions', (rows) => { const s = rows.find((x) => x.id === sessionId); s.turn = (s.turn || 0) + 1; return rows; });
      await setState(sessionId, 'speaking', { lastReply: factualReply, model: 'local catalogue / exact approved facts' });
      return { reply: factualReply, state: 'speaking', tts: await audioFor(sessionId, factualReply), provider: 'local-catalogue' };
    }
    const current = await get(sessionId);
    // The current utterance is appended separately below; do not send it twice.
    const history = current.transcript.slice(-17, -1).slice(-16).map((t) => ({ role: t.speaker === 'ai' ? 'assistant' : 'user', content: t.text }));
    const messages = [
      { role: 'system', content: callLivePrompt(session, settings, products) },
      ...history,
      { role: 'user', content: heard + (WHO_ARE_YOU.test(heard) ? '\n(Answer honestly: you are an AI assistant.)' : '') },
    ];
    const result = await llm.complete({ messages, containsCustomerData: true, localOnly: true, onlyProviderId: 'ollama-local', maxOutputTokens: 192, temperature: 0.15 });
    if (!result.ok) {
      const reply = 'Sorry, my local assistant could not think just then. Would you like me to arrange a callback from the team instead?';
      await pushLine(sessionId, 'ai', reply, { degraded: true, reason: result.error });
      await setState(sessionId, 'speaking', { lastReply: reply, modelError: result.error });
      return { reply, state: 'speaking', error: `No model was available (${result.error}). The call was handled with a fixed safety line.`, tts: await audioFor(sessionId, reply) };
    }
    const wantsEnd = /\[END CALL\]/i.test(result.text || '');
    let reply = cleanSpokenText(str(result.text, 8000))
      || 'Sorry, I didn’t catch that. Could you repeat it?';
    await pushLine(sessionId, 'ai', reply, { provider: result.provider?.label });
    await store.update('voice_sessions', (rows) => { const s = rows.find((x) => x.id === sessionId); s.turn = (s.turn || 0) + 1; return rows; });
    await setState(sessionId, 'speaking', { lastReply: reply, model: result.provider ? `${result.provider.label} / ${result.provider.model}` : 'unknown' });
    if (wantsEnd) {
      const endResult = await end(sessionId, { reason: 'agent_concluded', outcome: 'answered' });
      return { reply, state: 'ended', ended: true, summary: endResult.summary, tts: await audioFor(sessionId, reply) };
    }
    return { reply, state: 'speaking', tts: await audioFor(sessionId, reply), provider: result.provider?.label };
  }

  async function audioFor(sessionId, text) {
    // Keep each turn responsive: use the browser's built-in macOS speech synthesiser.
    // Generating a fresh AIFF/M4A on the server delayed every reply and caused stale audio.
    return { engine: 'browser', url: null, local: true };
  }

  function ttsFile(name) {
    const safe = path.basename(String(name || '')).replace(/[^a-f0-9.]/g, '');
    const file = path.join(ttsDir, safe);
    if (!safe.endsWith('.m4a') || !fs.existsSync(file)) return null;
    return file;
  }

  async function silence(sessionId) {
    const s = await get(sessionId);
    if (!s) return { error: 'Voice session not found.' };
    const count = (s.silenceCount || 0) + 1;
    const limit = getSettings().voice.silenceRetries || 2;
    if (count > limit) {
      const reply = 'I cannot hear you, so I will let you go. You can call us again any time. Goodbye.';
      await pushLine(sessionId, 'ai', reply, { silence: true });
      const ended = await end(sessionId, { reason: 'silence_timeout', outcome: 'no_answer' });
      return { reply, state: 'ended', ended: true, summary: ended.summary };
    }
    const reply = 'Are you still there? I am an AI assistant from ' + getSettings().business.name + '.';
    await setState(sessionId, 'speaking', { silenceCount: count, lastReply: reply });
    return { reply, state: 'speaking', silenceCount: count, tts: await audioFor(sessionId, reply) };
  }

  async function end(sessionId, { reason = 'operator_stopped', outcome = '' } = {}) {
    const session = await get(sessionId);
    if (!session) return { error: 'Voice session not found.' };
    if (session.state === 'ended') return { session, summary: session.summary, alreadyEnded: true };
    const settings = getSettings();
    const turns = (session.transcript || []).filter((t) => t.speaker === 'customer').length;
    const aiTurns = (session.transcript || []).filter((t) => t.speaker === 'ai').length;
    let summary = `${turns} customer turn(s), ${aiTurns} assistant turn(s). Ended: ${reason}.`;
    const meaningful = (session.transcript || []).length >= 3;
    if (meaningful) {
      const transcriptText = session.transcript.map((t) => `${t.speaker === 'ai' ? 'AI' : 'Customer'}: ${t.text}`).join('\n').slice(0, 6000);
      const result = await llm.complete({
        messages: [
          { role: 'system', content: 'You summarise sales calls. Reply with: OUTCOME: <one of answered|no_answer|not_interested|callback_requested|interested|voicemail|wrong_number>; INTEREST: <high|medium|low>; SUMMARY: two short sentences; NEXT: one concrete next step or NONE. Use only what the transcript says.' },
          { role: 'user', content: transcriptText },
        ],
        containsCustomerData: true,
        localOnly: true,
      });
      if (result.ok) summary = str(result.text, 1500);
      else summary += ` (No model was available to summarise: ${result.error})`;
    }
    const parsed = /OUTCOME:\s*([a-z_]+)/i.exec(summary);
    const finalOutcome = ['answered', 'no_answer', 'not_interested', 'callback_requested', 'interested', 'voicemail', 'wrong_number'].includes(parsed?.[1]) ? parsed[1] : (outcome || 'answered');

    await store.update('voice_sessions', (rows) => {
      const s = rows.find((x) => x.id === sessionId);
      s.state = 'ended'; s.endedAt = nowIso(); s.endReason = reason; s.outcome = finalOutcome; s.summary = summary; s.updatedAt = nowIso();
      return rows;
    });
    await store.update('calls', (all) => {
      const c = all.find((x) => x.voiceSessionId === sessionId);
      if (c) { c.status = 'ended'; c.outcome = finalOutcome; c.endedAt = nowIso(); c.summary = summary; c.transcript = settings.data.saveTranscripts ? session.transcript : []; c.durationSeconds = Math.round((new Date(c.endedAt) - new Date(c.startedAt)) / 1000); c.updatedAt = nowIso(); }
      return all;
    });
    if (session.customerId) {
      const next = finalOutcome === 'callback_requested' || finalOutcome === 'interested' ? new Date(Date.now() + 86400000).toISOString() : null;
      await crm.markContact({ customerId: session.customerId, channel: 'call', kind: 'call', summary: summary.slice(0, 400), outcome: finalOutcome, nextFollowUpAt: next });
      await store.update('customers', (rows) => { const c = rows.find((x) => x.id === session.customerId); if (c) { c.notes = `[call ${fmtIst(new Date())}] ${summary}\n${c.notes || ''}`.slice(0, 8000); if (finalOutcome === 'interested') c.status = 'Interested'; else if (finalOutcome === 'not_interested') c.status = 'Not Interested'; } return rows; });
      log('voice_end', `Voice session with ${session.customerName || session.phone} ended (${finalOutcome})`, { customerId: session.customerId, text: summary.slice(0, 500) });
    } else {
      log('voice_end', `Voice session with ${session.phone} ended (${finalOutcome})`, { text: summary.slice(0, 500) });
    }
    return { summary, outcome: finalOutcome, session: await get(sessionId) };
  }

  async function active() {
    const rows = await store.read('voice_sessions');
    return rows.filter((s) => !['ended', 'failed'].includes(s.state)).slice(0, 10)
      .map((s) => ({ ...s, elapsedSeconds: Math.round((Date.now() - new Date(s.startedAt)) / 1000) }));
  }

  async function recent(limit = 30) {
    const rows = await store.read('voice_sessions');
    return rows.slice(0, limit).map((s) => ({ id: s.id, mode: s.mode, customerName: s.customerName, phone: s.phone, state: s.state, outcome: s.outcome, turns: s.turn, startedAt: s.startedAt, endedAt: s.endedAt, summary: s.summary }));
  }

  return { start, get, setState, utterance, silence, end, active, recent, ttsCapability, ttsFile, audioFor, STATES, openingLine };
}

module.exports = { createVoice, STATES };
