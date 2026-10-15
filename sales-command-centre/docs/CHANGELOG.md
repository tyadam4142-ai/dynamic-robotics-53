# Changelog

## v0.7.0-local — local-first voice assist and draft-only messaging (2026-10-15)

- Added local Ollama-generated WhatsApp/SMS message drafts.
- Added a WhatsApp deep link that opens the selected recipient chat with the draft prefilled; the operator must press Send.
- Removed paid-provider call and send actions from the primary UI.
- Added default local-only backend guard to block provider calls and SMS/WhatsApp API sending.
- Clarified that local voice assistance requires a manually placed speakerphone call and is not a direct autonomous phone-line connection.
- Kept the CRM, local AI agent, call notes, and manual review workflow.

## v0.6.0 — full rebuild (2026-10-15)

### Architecture
- New modular backend: `src/` — store (atomic JSON persistence, schema migrations, corruption quarantine), config, LLM provider abstraction, tool registry, agent orchestrator, CRM, durable task queue, campaigns, voice, outbound, reports, SSE events.
- Zero npm dependencies; Node 18+ only.
- JSON storage with per-collection write locks, tmp+rename atomic writes, automatic backups and corrupt-file quarantine.

### AI agent
- 35 audited tools across read / write / consequential tiers with JSON-schema validation.
- Multi-provider LLM layer: Ollama (local, default) + any OpenAI-compatible API (OpenAI, DeepSeek, OpenRouter). Capability probing, per-provider timeouts, no silent cloud fallback — customer data never leaves the Mac unless the operator explicitly allows it.
- Persistent conversation threads with tool-call traces shown in the UI.
- Approvals for consequential actions; the agent can arm but never disarm the kill switch.
- Offline catalogue-aware fallback that labels itself instead of faking a model.

### Calling & voice (honest by design)
- Native Mac dialer hand-off (validated, injection-safe).
- Local live voice console: browser speech recognition + local model + macOS TTS — an acoustic bridge next to a speakerphone call. Discloses it is an AI, asks permission, honours refusals with automatic opt-out.
- Provider AI calls via ElevenLabs ConvAI + Twilio with status polling and webhook ingestion. First message discloses the AI.
- Automatic call summaries (outcome, interest, next step) written to the CRM timeline.

### CRM
- Expanded records: company, source, interest level, tags, preferred channel, consent (approval, channels, evidence, opt-out), contact/attempt tracking, lead scoring.
- CSV import (duplicate detection, per-row skip reasons) and export (formula-injection safe).
- Timeline per customer; global activity log; opt-out enforcement across every outbound path.

### Campaigns & queue
- Eligibility-filtered targeting, staggered scheduling, dedupe keys, daily limits, call spacing, IST calling window.
- Durable queue with leases; restart recovery parks in-flight call/message tasks as `needs_review` instead of blind retrying.
- Pause / resume / stop with task cascade; stopped campaigns cannot be restarted (create a new one for honest history).

### Messaging
- Twilio SMS + WhatsApp with idempotency keys and delivery-state sync (queued → accepted → delivered/read / failed / undelivered).
- Draft mode and Mac Messages hand-off when Twilio is not configured — nothing is faked.

### Dashboard
- 12 sections: Overview, AI Agent, Customers, Calls & Voice, Messaging, Campaigns, Tasks, Approvals, Follow-ups, Analytics, Products, Settings & System.
- Live updates over SSE; every chart and number is computed from real records.

### Security
- Localhost binding + Host allowlist, optional access-token login (HMAC cookie, rate-limited, timing-safe), CSRF header, strict CSP, secrets confined to `.env`, redacted logs, settings scrubbed of credential values.

## v0.5.0
- Original release: CRM basics, offline chat fallback, native dialling, callbacks, CSV import/export.


## 0.8.0-local — turn-taking voice + product knowledge
- Fixed repeated opening speech when the Calls view re-renders.
- Changed local TTS to immediate browser/macOS speech synthesis rather than generating an audio file for each response.
- Added auto-listen after each reply, single-turn guards, pause listening, stale speech cancellation, and safer voice model limits.
- Removed duplicate inclusion of the latest customer utterance in the LLM prompt.
- Locked live local voice responses to the `ollama-local` provider and limited output to 96 tokens.
- Expanded approved product facts and added a catalogue import script plus detailed professional sales script.
- Clarified that local voice assist is not connected to live phone/WhatsApp call audio.


## v0.9.0-local — natural turn-taking and persistent contacts (2026-10-15)

- Kept the conversational model fixed to local Ollama (`qwen2.5:3b`) with 15-minute keep-alive, low-temperature voice generation and a short response budget.
- Added microphone voice-activity sensing with echo cancellation/noise suppression to interrupt browser speech synthesis promptly; retained browser recognition and manual stop/typed fallback.
- Improved voice selection for installed local English voices, stable voice selection per turn, natural speech-rate defaults and currency pronunciation.
- Added direct catalogue-backed answers for product price/description questions and short, non-pitchy acknowledgements.
- Added automatic Calls & Voice quick-save on completed name/phone entry, duplicate reuse and explicit persistence of operator-confirmed call consent without triggering new-lead automation.
- Expanded validation for customer quick-save and product fact responses; documented that hardware microphone behavior and full duplex recognition require on-device validation.
