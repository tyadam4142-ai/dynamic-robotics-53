# DR53 project architecture

## Two intentionally different runtimes

This repository contains the existing public DR53 website and the local AI Sales Command Centre supplied with the engineering assignment. The website remains the GitHub Pages deployment at the repository root. The command centre lives in the stable `sales-command-centre/` directory and is a separate local service in the same repository; it does not replace the public website or pretend that GitHub Pages can host a private database or Node API.

The marketing site uses Vite, React, TypeScript and Tailwind. Use `npm run dev`, `npm run lint`, and `npm run build` from the repository root. The GitHub Pages workflow builds only this static site.

The command centre uses Node.js 18+ built-in modules and browser APIs. It has no npm runtime dependencies. Run `./scripts/start.sh` from the repository root; the wrapper resolves its own location, enters the command-centre directory and starts the backend on `127.0.0.1:3053` by default. Its same-origin HTTP server serves the browser app and the `/api/*` routes. Use Ctrl+C in that terminal to stop it cleanly. `PORT` and `DR53_DATA_DIR` can override the defaults; relative data paths are resolved from `sales-command-centre/`.

## Command-centre services

- `src/app.js` wires the local HTTP API, configuration, store, customer CRM, LLM providers, tools, agent, voice, outbound integrations, scheduler, notifications and reports.
- `src/llm.js` implements Ollama and OpenAI-compatible provider adapters. Ollama is the default local provider; cloud providers are optional and customer data is not sent to them unless the operator explicitly enables sharing.
- `src/agent.js` builds conversation context and calls only the registered, schema-validated tools in `src/tools.js`. Consequential outbound work uses the approval/queue system.
- `src/crm.js` and `src/store.js` validate and persist CRM collections in `sales-command-centre/data/`. The JSON store uses atomic replacement and quarantines malformed collections rather than treating them as valid records.
- `src/tasks.js`, `src/campaigns.js`, and `src/events.js` persist queued work and publish application events. Pending work is recovered at startup; uncertain in-flight calls are marked for review.
- `src/voice.js` manages local acoustic-assist sessions and provider call state. Browser speech recognition and system speech synthesis are best-effort capabilities, not a direct phone-audio bridge.
- `public/app.js` is the dashboard and interaction layer. `public/speech.js` splits long voice replies into ordered, cancellable utterance chunks.
- `knowledge/product-catalogue.json` contains approved starter product facts. Product import preserves operator-maintained catalogue entries.

## Data and security boundaries

CRM data, settings, consent records, conversations and tasks remain in the local `data/` directory. `.env` is read by the backend only and is excluded from version control. The server binds to loopback by default, checks the Host header, applies same-origin/CSP/CSRF protections and can require `DR53_ACCESS_TOKEN`. Never expose the local server to a network without deliberately configuring and securing that deployment.

Real calls and provider messaging require configured provider accounts, operator consent checks and applicable legal permissions. Local voice is an acoustic assist only; it cannot hear cellular or WhatsApp call audio directly. Local speech synthesis does not mean browser speech recognition is offline. Provider delivery statuses are based on provider responses; tests do not place real calls or send real messages.

## Verified reliability changes

The original voice path requested only 72 generated tokens and then hard-truncated every reply to 38 words. The local spoken path now allows 192 output tokens, removes the fixed word cutoff, and preserves the full generated transcript. Browser speech output is divided into ordered chunks so longer answers do not depend on a single long utterance.

Streaming previously dropped a final Ollama NDJSON record or SSE event when the server closed without a trailing delimiter. The readers now flush the decoder and parse the remaining buffer. Request timeouts and cancellation now remain active while the response body is consumed, not merely until response headers arrive. Runtime `.env` values are loaded before port, host and data-path configuration is resolved.

## Local verification

From the repository root:

```bash
./scripts/setup.sh
npm test
npm run lint
npm run build
./scripts/start.sh
```

The setup command runs the command-centre tests and an isolated health smoke test. Voice hardware, installed speech voices, external provider credentials and real telephony are not certified by automated tests.
