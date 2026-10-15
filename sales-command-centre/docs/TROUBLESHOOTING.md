# Troubleshooting

## The app will not start

- **`EADDRINUSE: port 3053`** — another copy may already be running. Check http://127.0.0.1:3053 first. If it is not DR53, identify the process before deciding how to stop it; do not kill an unknown process. Or start on another port with `PORT=3060 ./scripts/start.sh` from the repository root.
- **`EACCES`** — the `data/` folder is not writable. Fix with `chmod -R u+w data`.
- **Node version errors** — run `node --version`; you need 18 or newer.

## The AI says it is using offline rules

1. Check `curl --fail --silent http://127.0.0.1:11434/api/tags`. If it responds, Ollama is already running; reuse it rather than starting another `ollama serve`.
2. If it does not respond, start the Ollama app or run `ollama serve` once.
3. In Settings, select a model that is installed. Review its size and performance needs before downloading it; the app does not automatically pull models.
4. Settings → AI model → **Re-check models**.

The offline mode is deliberate: the app tells you instead of faking a smart reply.

## Calls

- **"Callbacks are only available between 16:00 and 17:00 IST"** — that is the configured window. Change it in Settings.
- **The Mac dialer does not open** — the FaceTime/Phone app must be set up and you must be signed in. The app opens `tel:` links; macOS decides which app handles them.
- **The AI cannot hear/speak on my normal call** — correct, that is a macOS limitation, not a bug. Use the live voice console (speakerphone bridge) or configure provider AI calls.

## Voice console

- **No speech recognised** — allow microphone and speech recognition access in the browser, keep the tab active, and check the language setting. Speech recognition may use an online browser service. You can always type the customer's words instead.
- **Daya does not stop when I interrupt** — ensure microphone access is allowed; v0.9 tries local Web Audio voice-activity detection (with echo cancellation) and simultaneous browser recognition. If your browser does not support full-duplex recognition, click **Stop speech** and speak. Lower the speakerphone volume to reduce acoustic echo.
- **Robotic voice** — in Settings & System → Voice leave `natural-local` selected or enter a local English voice name available in macOS/browser. Download/enable an enhanced system voice in macOS if needed. Keep speed around `0.90`–`1.00` for clearer pacing. Voice quality depends on which system voices are installed.
- **It repeats the product description after “okay/thanks”** — restart the app and refresh the page. Short acknowledgements should receive a brief acknowledgement rather than another product pitch.
- **A long spoken answer stops early** — replies are now spoken in ordered sentence-sized chunks. Refresh after restarting the server. If a browser reports a speech error, the status and toast identify the failure; replay the response or use text.

## Messages

- **503 "SMS is not configured"** — add the Twilio variables to `.env` and restart. Until then, use **Save draft** or **Open Mac Messages** — nothing is sent.
- **Status stays "queued/accepted"** — press **Sync pending**; Twilio updates delivery states asynchronously.

## Data

- **A JSON file got corrupted** — the app quarantines it into `data/backups/*.corrupt.*` and starts that collection empty. Restore from a dated backup file if needed.
- **Where is my data?** — `data/` next to `server.js`. Delete the folder to factory-reset.

## Login

- **Locked out** — stop the server, remove `DR53_ACCESS_TOKEN` from `.env` (or fix it), restart.
- **"Missing CSRF header"** — API calls from outside the dashboard must include header `x-dr53: 1`. This is intentional CSRF protection.


## Voice agent repeats itself, lags, or does not listen (v0.9)

- Start the repository-root app with `./scripts/start.sh`; the stable path is `sales-command-centre/`, not a versioned Downloads folder. An older process can continue serving old JavaScript on port 3053.
- Check Ollama with `curl --fail --silent http://127.0.0.1:11434/api/tags`, then select a model available on that service. Download a model only after reviewing the storage and performance requirements.
- Allow microphone access in the browser and keep the tab active. After the opening line, the console should listen automatically. The button pauses/resumes listening; typed replies remain available.
- Voice generation uses a larger configurable output budget and no fixed word cutoff. If the Mac is under memory pressure, close other heavy apps or choose a smaller locally installed model.
- Browser speech recognition may use an online service. This local voice console does not receive direct cellular/WhatsApp call audio and cannot place/answer real calls autonomously without a supported calling integration.
- To refresh the product facts in an existing installation, run `node scripts/import-product-knowledge.js` and restart DR53. The script creates a backup before changing the catalogue.


## Customer does not appear in the CRM

- In Calls & Voice, enter both a name and a phone number. When you leave a field, the app autosaves if the phone looks complete (at least 10 digits). Check the status line under the form.
- Open Customers or inspect `data/customers.json`. If that phone/email already exists, DR53 reuses the existing record rather than overwriting the stored contact.
- If no record appears, confirm the browser request reached the local app and check the Terminal for validation errors. Ensure the `data/` directory is writable.
- Quick-save does not automatically mark consent and does not trigger any call/message automation. Consent must be captured separately.
