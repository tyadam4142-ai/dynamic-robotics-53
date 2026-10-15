# DR53 AI Sales Command Centre — Validation Report

**Validation date:** 15 October 2026
**Package version:** 0.9.0-local
**Runtime checked:** Node.js 24.21.0
**Automated tests:** 46 passed, 0 failed

## Checks run

- `npm test` from the repository root — 46 automated tests passed, 0 failed.
- `node --check` on `server.js`, every `src/*.js`, `public/app.js`, every `tests/*.js`, and every `scripts/*.js` file — passed.
- `./scripts/setup.sh` from the repository root — test suite and local boot/health check passed; health reports version `0.9.0-local`.
- Targeted regression coverage verifies deterministic catalogue-grounded product answers even when the model returns an unsupported claim, exact product search, complete voice replies, final unterminated Ollama/OpenAI-compatible streaming records, Ollama native tool-history serialization, stream cancellation after headers, and uninterrupted sentence chunking.
- Quick-save integration test verifies persistence into `data/customers.json`, canonical Indian phone normalization, duplicate contact reuse, and no new-lead outbound automation side effects.
- Voice session integration test checks catalogue-grounded replies for Tap Tag Sticker, Tap Tag Card, Website Development, and E-Adapter, including refusal to invent unknown technical specifications.
- Local-only safety test confirms outbound provider calls/messages remain blocked by default.

## What this report does not certify

Automated checks run without the user's physical Mac, browser microphone, speakers or installed speech voices. Therefore they cannot certify acoustic echo cancellation, microphone permissions, the naturalness of a specific installed voice, or reliable full-duplex interruption on every browser. The app uses best-effort voice activity detection and browser speech recognition, plus **Stop speech** and typed-reply fallbacks. Browser speech recognition may use a remote recognition service; Ollama text reasoning remains local.

The local voice console is **not an autonomous telephone or WhatsApp caller**. It does not control cellular or WhatsApp call audio. Real unattended calls require an approved calling integration with its own account permissions. External provider delivery was not tested and no real customer call/message was made as part of this validation.

The app stores its CRM records locally in `data/`. Back up that folder before replacing project versions. Saving a contact does not imply contact consent; opted-out contacts remain blocked.

The public website's `npm run lint` and `npm run build` were not verified in this environment because the repository's Vite/TypeScript dependencies are not installed and are not available in the local npm cache. They were not fetched from an external package registry.
