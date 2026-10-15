'use strict';
const { mergeDeep, str, isPlainObject, isValidEmail } = require('./util');

const VERSION = '0.9.0-local';

const DEFAULT_PRODUCTS = [
  { id: 'tap-sticker', name: 'Tap Tag Sticker', price: 553, priceType: 'fixed', active: true, description: "Tap Tag Sticker — ₹553 fixed listed price. A personalised tap-enabled sticker that opens the customer’s digital profile or webpage, which can contain Instagram and other links. Confirm artwork, quantity, compatibility, delivery timeline, and any customisation requirements with the DR53 team before promising them. Do not invent material, durability, water resistance, chip type, or delivery dates." },
  { id: 'tap-card', name: 'Tap Tag Card', price: 753, priceType: 'fixed', active: true, description: 'Tap Tag Card — ₹753 fixed listed price. A tap-enabled card with the customer’s logo printed on it; tapping opens its associated profile webpage. Confirm artwork, quantity, compatibility, delivery timeline, and customisation requirements with the DR53 team. Do not invent card material, dimensions, durability, chip type, or delivery dates.' },
  { id: 'website', name: 'Website Development', price: 5300, priceType: 'starting', active: true, description: 'Website Development — projects start at ₹5,300. Custom website work is scoped to the customer’s needs. Ask about purpose, pages, content, features, design preferences, domain/hosting, and deadline before quoting a final price. ₹5,300 is a starting price, not a guaranteed total. Visit https://dynamicrobotics53.com to discuss requirements. Do not promise hosting, SEO, e-commerce, maintenance, or delivery dates unless confirmed by the team.' },
  { id: 'e-adapter', name: 'E-Adapter', price: 2553, priceType: 'fixed', active: true, description: 'E-Adapter — listed price ₹2,553, but all technical specifications and exact included components are unverified. Describe it only as a compact electronics/backup-power concept and say the DR53 team must confirm compatibility, output, capacity, ports, safety certifications, warranty, availability, and use cases before purchase. Never claim it can power a specific device or promise technical performance until verified.' },
];

const DEFAULT_PROVIDERS = [
  { id: 'ollama-local', type: 'ollama', label: 'Ollama (local)', baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5:3b', apiKeyEnv: '', enabled: true },
];

const DEFAULT_SETTINGS = {
  business: { name: 'Dynamic Robotics 53', website: 'https://dynamicrobotics53.com', founder: 'Adam Bhaimia', timezone: 'Asia/Kolkata' },
  agent: {
    autoExecute: true,
    maxToolSteps: 10,
    concurrency: 2,
    requireApprovalForConsequential: true,
    killSwitch: false,
    extraGuidance: '',
  },
  llm: {
    primary: 'ollama-local',
    fallback: 'none',
    allowFallback: true,
    shareCustomerDataWithCloud: false,
    temperature: 0.4,
    maxOutputTokens: 800,
    requestTimeoutMs: 120000,
    providers: DEFAULT_PROVIDERS,
  },
  voice: { mode: 'local', discloseAi: true, maxSeconds: 900, silenceRetries: 2, tts: { engine: 'browser', voice: 'natural-local', rate: 0.96 }, provider: { elevenlabs: false, twilio: false } },
  calling: {
    windowStartHour: 9, windowEndHour: 19, maxConcurrentCalls: 1, maxAttemptsPerContact: 2,
    retryDelayMinutes: 180, minSecondsBetweenCalls: 45, dailyCallLimit: 50, requireConsent: true,
  },
  messaging: { requireApprovalForBulk: true, dailyMessageLimit: 200, respectOptOut: true },
  callbacks: { startHour: 16, endHour: 17 },
  automation: { autoMessageNewLead: true, autoCallNewLead: true, newLeadMessageChannel: 'whatsapp' },
  data: { saveTranscripts: true },
  notifications: true,
};

const CREDENTIALS = {
  elevenlabs: ['ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID', 'ELEVENLABS_AGENT_PHONE_NUMBER_ID'],
  twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
  twilioSms: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER|TWILIO_MESSAGING_SERVICE_SID'],
  twilioWhatsapp: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'],
};

function present(env, spec) {
  const options = spec.split('|');
  return { spec, present: options.some((name) => !!str(env[name], 200)), missing: !options.some((name) => !!str(env[name], 200)) };
}

/** Never returns credential values — only which names are configured. */
function integrationStatus(env) {
  const missing = (list) => list.filter((name) => !name.includes('|') && !str(env[name], 200));
  const voice = [
    present(env, 'ELEVENLABS_API_KEY'), present(env, 'ELEVENLABS_AGENT_ID'), present(env, 'ELEVENLABS_AGENT_PHONE_NUMBER_ID'),
    ...CREDENTIALS.twilio.map((n) => present(env, n)),
  ];
  const sms = [present(env, 'TWILIO_ACCOUNT_SID'), present(env, 'TWILIO_AUTH_TOKEN'), present(env, 'TWILIO_FROM_NUMBER|TWILIO_MESSAGING_SERVICE_SID')];
  const wa = [present(env, 'TWILIO_ACCOUNT_SID'), present(env, 'TWILIO_AUTH_TOKEN'), present(env, 'TWILIO_WHATSAPP_FROM')];
  const voiceReady = voice.every((c) => c.present);
  return {
    aiVoiceCall: { ready: voiceReady, label: 'AI voice calls (Twilio + ElevenLabs Agents)', missing: voice.filter((c) => !c.present).map((c) => c.spec) },
    sms: { ready: sms.every((c) => c.present), label: 'SMS via Twilio', missing: sms.filter((c) => !c.present).map((c) => c.spec) },
    whatsapp: { ready: wa.every((c) => c.present), label: 'WhatsApp via Twilio', missing: wa.filter((c) => !c.present).map((c) => c.spec) },
    nativeMac: { ready: process.platform === 'darwin', label: 'Native Mac dialer / Messages hand-off', missing: process.platform === 'darwin' ? [] : ['macOS'] },
    localVoiceAssist: { ready: true, label: 'Local browser voice assist (free)', missing: [] },
    access: { ready: !!str(env.DR53_ACCESS_TOKEN, 200), label: 'Access token protection', missing: str(env.DR53_ACCESS_TOKEN, 200) ? [] : ['DR53_ACCESS_TOKEN'] },
  };
}

function normaliseSettings(raw) {
  const merged = mergeDeep(DEFAULT_SETTINGS, isPlainObject(raw) ? raw : {});
  merged.llm.providers = (Array.isArray(raw?.llm?.providers) && raw.llm.providers.length ? raw.llm.providers : DEFAULT_PROVIDERS)
    .map((p, i) => ({
      id: str(p.id, 40) || `provider-${i}`,
      type: ['ollama', 'openai'].includes(p.type) ? p.type : 'ollama',
      label: str(p.label, 60) || str(p.id, 60) || `Provider ${i + 1}`,
      baseUrl: str(p.baseUrl, 200) || (p.type === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.openai.com/v1'),
      model: str(p.model, 100),
      apiKeyEnv: str(p.apiKeyEnv, 60),
      enabled: p.enabled !== false,
    }));
  for (const key of ['primary', 'fallback']) {
    const value = str(merged.llm[key], 60);
    merged.llm[key] = value || (key === 'primary' ? 'ollama-local' : 'none');
  }
  merged.agent.maxToolSteps = clamp(merged.agent.maxToolSteps, 1, 20, 10);
  merged.agent.concurrency = clamp(merged.agent.concurrency, 1, 4, 2);
  merged.agent.extraGuidance = str(merged.agent.extraGuidance, 4000);
  merged.business.name = str(merged.business.name, 100) || 'Dynamic Robotics 53';
  merged.business.website = str(merged.business.website, 200);
  merged.calling.windowStartHour = clamp(merged.calling.windowStartHour, 0, 23, 9);
  merged.calling.windowEndHour = clamp(merged.calling.windowEndHour, 1, 24, 19);
  if (merged.calling.windowStartHour >= merged.calling.windowEndHour) { merged.calling.windowStartHour = 9; merged.calling.windowEndHour = 19; }
  merged.callbacks.startHour = clamp(merged.callbacks.startHour, 0, 23, 16);
  merged.callbacks.endHour = clamp(merged.callbacks.endHour, 1, 24, 17);
  if (merged.callbacks.startHour >= merged.callbacks.endHour) { merged.callbacks.startHour = 16; merged.callbacks.endHour = 17; }
  merged.llm.temperature = Math.min(1.5, Math.max(0, Number(merged.llm.temperature) || 0.4));
  merged.llm.maxOutputTokens = clamp(merged.llm.maxOutputTokens, 128, 4096, 800);
  merged.llm.requestTimeoutMs = clamp(merged.llm.requestTimeoutMs, 5000, 600000, 120000);
  merged.voice.mode = ['local', 'provider'].includes(merged.voice.mode) ? merged.voice.mode : 'local';
  // This version speaks through the browser's installed system voices. Do not expose
  // the former file-rendering macOS say option, which added latency and is not used.
  merged.voice.tts.engine = 'browser';
  merged.voice.maxSeconds = clamp(merged.voice.maxSeconds, 30, 3600, 900);
  merged.voice.tts.voice = str(merged.voice.tts.voice, 80) || 'natural-local';
  const speechRate = Number(merged.voice.tts.rate);
  merged.voice.tts.rate = Number.isFinite(speechRate) ? Math.min(1.2, Math.max(0.8, speechRate)) : 0.96;
  return merged;
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function validateSettingsPatch(patch) {
  const errors = [];
  const p = patch || {};
  if (p.llm && Array.isArray(p.llm.providers)) {
    for (const provider of p.llm.providers) {
      if (provider.type === 'openai' && !/^(https?:\/\/)/.test(str(provider.baseUrl, 200))) errors.push(`Provider ${provider.id}: base URL must start with http(s)://`);
      if (provider.apiKeyEnv && !/^[A-Z0-9_]{3,60}$/.test(provider.apiKeyEnv)) errors.push(`Provider ${provider.id}: API key variable name must look like OPENAI_API_KEY`);
    }
  }
  if (p.business && p.business.website && !/^https?:\/\//.test(str(p.business.website))) errors.push('Business website must start with http(s)://');
  if (p.business && p.business.email && !isValidEmail(p.business.email)) errors.push('Business email is invalid.');
  if (p.calling) {
    const start = p.calling.windowStartHour;
    const end = p.calling.windowEndHour;
    if (start !== undefined && (!Number.isInteger(Number(start)) || Number(start) < 0 || Number(start) > 23)) errors.push('Calling window start must be an hour from 0 to 23.');
    if (end !== undefined && (!Number.isInteger(Number(end)) || Number(end) < 1 || Number(end) > 24)) errors.push('Calling window end must be an hour from 1 to 24.');
    if (start !== undefined && end !== undefined && Number(start) >= Number(end)) errors.push('Calling window start must be earlier than the end.');
  }
  if (p.callbacks) {
    const start = p.callbacks.startHour; const end = p.callbacks.endHour;
    if (start !== undefined && end !== undefined && Number(start) >= Number(end)) errors.push('Callback window start must be earlier than the end.');
  }
  if (p.automation && p.automation.newLeadMessageChannel !== undefined && !['sms', 'whatsapp'].includes(p.automation.newLeadMessageChannel)) errors.push('New-lead message channel must be SMS or WhatsApp.');
  return errors;
}

function catalogueText(products) {
  return (products || []).filter((x) => x.active !== false)
    .map((x) => `- ${x.name}: ₹${Number(x.price).toLocaleString('en-IN')}${x.priceType === 'starting' ? ' (starting price)' : ''}. ${x.description}`)
    .join('\n');
}

function systemPrompt(settings, products) {
  const b = settings.business;
  return [
    `You are the AI Sales and Customer Follow-up Agent for ${b.name}${b.founder ? `, founded by ${b.founder}` : ''}.`,
    'You work inside a CRM and you have real tools. When the user asks for work, call a tool instead of describing it.',
    'Use ONLY the approved catalogue below for prices and product facts. Never invent prices, discounts, specifications, warranties, delivery promises or policies. If something is not in the catalogue, say the team must confirm it.',
    'For product questions, use search_products to retrieve the relevant approved record before answering. Do not use customer lookup tools for product questions. For customer lookups, use only identifiers the operator explicitly provided; never invent names, phone numbers, emails or customer IDs.',
    'Never claim that a call was placed, a message was sent, or a record was changed unless a tool returned that result in this conversation.',
    'You are an AI, not a human. In any customer-facing script or live call you must disclose that you are an AI assistant, and you must stop immediately if the customer declines, asks to stop, or opts out.',
    'Reply in English unless the customer or user writes in Hindi or Marathi. Be concise and practical.',
    settings.agent.extraGuidance ? `Extra operator guidance: ${settings.agent.extraGuidance}` : '',
    `Business website: ${b.website || 'not configured'}.`,
    `Calling window: ${settings.calling.windowStartHour}:00-${settings.calling.windowEndHour}:00 ${settings.business.timezone}. Callback booking window: ${settings.callbacks.startHour}:00-${settings.callbacks.endHour}:00 IST.`,
    `Approved catalogue:\n${catalogueText(products) || '(no active products)'}`,
  ].filter(Boolean).join('\n\n');
}

module.exports = { VERSION, DEFAULT_PRODUCTS, DEFAULT_SETTINGS, DEFAULT_PROVIDERS, CREDENTIALS, integrationStatus, normaliseSettings, validateSettingsPatch, systemPrompt, catalogueText, clamp };
