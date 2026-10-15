# DR53 AI Sales Command Centre v0.9.0-local — Local-first edition

A self-hosted AI sales agent + CRM for Dynamic Robotics 53. Zero npm dependencies — plain Node.js 18+ and a browser. CRM data stays on your Mac in `data/`; the local voice and draft workflows do not require paid AI APIs.

## What it actually does

- **Local AI agent** — Ollama with `qwen2.5:3b` is the default brain. Customer-facing voice replies and message drafts are forced through a local Ollama model; the draft generator does not fall back to a cloud LLM.
- **Local voice assist** — the app uses the browser’s built-in system speech synthesiser to speak replies immediately. For a real call, you place the call manually and use speakerphone near the Mac microphone. This is an acoustic assist, not a direct or unattended AI telephone connection. Browser speech recognition may use a browser speech service; typing what the customer says is available as a fallback.
- **WhatsApp/SMS draft writer** — the local model generates a draft. WhatsApp opens with the number and text prefilled, but the operator must review and press Send. SMS can be saved as a draft and then handled manually in Messages.
- **Local-only safety** — provider AI calls and API-based SMS/WhatsApp sends are blocked by default, even if old credentials exist. `DR53_LOCAL_ONLY` defaults to `true`; enabling paid provider actions requires deliberately setting it to `false` and restarting.
- **CRM** — contacts with consent records, opt-out enforcement, lead scoring, tags, notes, timeline, CSV import/export with duplicate detection.
- **Sales workflow** — local agent chat, call notes, follow-ups, analytics and approvals. No campaigns or automatic message sending should be used for live outreach in this local-only phase.

## Quick start (macOS)

From the repository root, run `./scripts/setup.sh` once and then `./scripts/start.sh`. Open <http://127.0.0.1:3053>; press **Ctrl+C** in the server terminal to stop it. The wrappers resolve the stable `sales-command-centre/` path and do not depend on a versioned Downloads directory. You can also run `npm start` from this directory.

The standalone app runs without installing npm dependencies. It stores local CRM data in this directory's `data/` folder.

For the free local AI (recommended):
```bash
curl --fail --silent http://127.0.0.1:11434/api/tags
```
If that check responds, Ollama is already running and should be reused. Otherwise, launch the Ollama app or start `ollama serve` once. Select a downloaded model in Settings. The app does not pull a model automatically; review its disk and performance requirements before downloading one. The app remains usable without Ollama and identifies when its catalogue/offline fallback is active.

## Tests

```bash
npm test
```
Automated tests cover CRM, consent/opt-out gating, callback windows, queue recovery, approvals, campaigns, messaging idempotency, live voice sessions, signed provider webhooks, auth, and analytics honesty. See `docs/TEST-REPORT.md` for the packaged validation report.

## Docs

- `SETUP.md` — full install + provider configuration
- `AGENT-GUIDE.md` — how to work with the agent day to day
- `docs/TEST-REPORT.md` — latest verified test results
- `docs/CHANGELOG.md` — version history
- `docs/TROUBLESHOOTING.md` — common issues

## Security model

- Binds to `127.0.0.1` only; Host header is checked.
- Optional access token (`DR53_ACCESS_TOKEN`) with HMAC-signed HttpOnly cookie, login rate limiting, timing-safe comparison.
- CSRF: non-GET API calls require the `x-dr53: 1` header.
- Strict CSP: no inline scripts; all frontend JS is served from `/app.js`.
- Secrets live only in `.env` (never shipped in the ZIP, never sent to the browser, stripped from settings, redacted from logs).
- No shell access, filesystem access, or raw data access is exposed to the AI — only the 35 audited tools.


## Local-first mode (v0.9.0-local)

- Ollama is the default local LLM for CRM chat and WhatsApp/SMS draft generation. The configured model can be changed in Settings.
- On macOS, the local voice console uses built-in system speech synthesis to speak AI replies quickly.
- To assist on a real call, place the call manually, enable speakerphone, and keep the Mac microphone near the audio. This is an acoustic assist, not direct cellular audio integration or an unattended autonomous caller.
- Browser speech recognition may use the browser's recognition service; type the customer's words if you want to avoid using it.
- `DR53_LOCAL_ONLY` defaults to local-only behavior. Real provider AI calls and SMS/WhatsApp API sending are blocked unless you explicitly set `DR53_LOCAL_ONLY=false`. The UI is draft-only and opens WhatsApp with a prefilled message; you must review and press Send yourself.
- The local model and macOS TTS have no per-call LLM/TTS API charge, but real carrier calls and internet usage can still cost money.


## v0.9.0 voice, CRM quick-save and product improvements

- Live local voice replies use the Ollama model selected in Settings, kept warm for 15 minutes. Replies are no longer hard-truncated to a fixed word count; speech is queued in chunks for longer answers.
- **Interrupt sensing:** microphone voice-activity detection uses browser echo cancellation/noise suppression to stop speech promptly, while browser recognition tries to capture the user's words. **Stop speech** and typed reply are fallbacks. Results depend on browser and audio hardware.
- **More natural turn-taking:** concise replies, no repeated opener, acknowledgements like “thanks” do not re-pitch the product, and “hello” is not interpreted as call consent.
- **Customer auto-save:** entering a plausible name and phone in Calls & Voice then leaving the field saves the contact to `data/customers.json`. The quick-save route reuses duplicate contacts, does not trigger new-lead automations, and does not assume consent. Confirming call consent is saved against the contact, while opted-out contacts remain blocked.
- **Product accuracy:** direct price/description questions are answered from the active local product catalogue. The four starting products are Tap Tag Sticker (₹553), Tap Tag Card (₹753), Website Development (starts at ₹5,300) and E-Adapter (₹2,553; technical details unverified).
- **Product knowledge import:** run `node scripts/import-product-knowledge.js` to back up and merge the approved catalogue while preserving custom and explicitly disabled products.
- See `PRODUCT-KNOWLEDGE-AND-SALES-SCRIPT.md` for detailed approved facts and the professional Daya prompt.

**Calling limitation:** this is local acoustic voice assistance, not an autonomous phone/WhatsApp caller. It does not receive cellular or WhatsApp call audio. Live autonomous calling requires a supported integration and account permissions. Browser speech recognition may rely on an online service even though text reasoning stays in local Ollama.
