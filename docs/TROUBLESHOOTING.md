# DR53 troubleshooting

Run the following commands from the repository root. `scripts/start.sh` and `scripts/setup.sh` resolve paths relative to themselves, so they do not depend on the shell's current directory.

## Wrong directory or missing package files

The repository root contains the website `package.json`, and `sales-command-centre/server.js` is the local application server. If npm reports `ENOENT` for a home-directory `package.json`, change to the repository root before running npm commands. For the command centre, prefer `./scripts/setup.sh` and `./scripts/start.sh`; no packages are installed for the local backend.

If a script reports missing repository files, check that the repository checkout is complete and run the script from that checkout. Do not create a `package.json` in your home directory or rely on an old version-named Downloads folder.

## Setup and startup

- Run `./scripts/setup.sh` once. It verifies Node.js 18+, runs the test suite, prepares local data/configuration, and performs an isolated boot check.
- Run `./scripts/start.sh` to start the command centre. Open `http://127.0.0.1:3053` in a browser. Stop it with Ctrl+C in the terminal running the server.
- Run `./scripts/health-check.sh` while the server is running. For a custom port, use `PORT=3060 ./scripts/health-check.sh`.
- If the root website dependencies are already available, `npm run dev`, `npm run lint`, and `npm run build` operate on the public Vite site, not the local CRM backend.

## Port already in use

If startup reports that port 3053 is occupied, the command centre may already be running. Check `http://127.0.0.1:3053` first. To use another port, start with `PORT=3060 ./scripts/start.sh`, then check with `PORT=3060 ./scripts/health-check.sh`. Do not kill a process just because it owns that port; identify it and stop only the process you intend to stop.

## Ollama and local model

The dashboard works without Ollama using its clearly labelled catalogue/offline fallback. Ollama is optional.

1. Check whether it is already running with `curl --fail --silent http://127.0.0.1:11434/api/tags`. If it responds, reuse it; do not start a second `ollama serve` process.
2. If unavailable, start the Ollama app or run `ollama serve` once. A port-in-use error usually means the service is already running; check the API instead of terminating it.
3. In Settings, verify the Ollama URL and selected model. A missing model is reported by the app. Download a model only after reviewing its storage and performance requirements; the app does not automatically pull large models.
4. If the configured service is unreachable, check the URL/port and use the provider status in Settings. Text mode and CRM features continue to work without a model.

## Voice and speech

- Text chat works independently of microphone support.
- Allow microphone and speech-recognition permission in the browser and keep the tab active. Browser speech recognition may use an online recognition service; the app does not claim it is offline.
- If recognition is unsupported or denied, type the customer's words in the voice console. The transcript shows what the app received.
- Browser speech synthesis uses the installed system voices where available. If playback fails, use replay/Stop Speech or continue in text mode. Longer replies are queued in sentence-sized chunks.
- Acoustic interruption sensing depends on the browser, microphone, echo cancellation and speaker volume. The Stop Speech button is the manual fallback.
- The local voice console is not connected to cellular or WhatsApp call audio and cannot place an autonomous real telephone call.

## Product answers and local CRM data

The agent uses the approved catalogue in `sales-command-centre/knowledge/product-catalogue.json`. Unknown product specifications, stock, compatibility, warranty and delivery details must be confirmed by the team. Back up `sales-command-centre/data/` before moving or replacing a checkout. Customer records do not imply consent to call or message.

## Telephony, SMS and WhatsApp

Without configured provider credentials the corresponding integration status is not configured, and the local app remains usable. Real calls, telephone numbers, messaging access and provider usage may incur costs and require account approval and customer consent. Drafts require operator review. Tests use mocked providers and do not place calls or send messages.
