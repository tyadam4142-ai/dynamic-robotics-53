# DR53 AI Sales Command Centre v0.9.0-local — Setup

This release is local-first. It uses Ollama for text reasoning and your Mac/browser's installed speech voices. It does not require ElevenLabs or a paid LLM key for local voice assistance or WhatsApp message drafts.

## 1. Requirements

- macOS and Node.js 18 or newer: <https://nodejs.org/en/download>
- Ollama: <https://ollama.com/download>
- Enough free memory to run `qwen2.5:3b` comfortably.

## 2. Install or upgrade without losing CRM data

From the repository root, run:

```bash
./scripts/setup.sh
```

The setup wrapper locates `sales-command-centre/` relative to itself, checks Node.js 18+, runs the automated tests, prepares the local data directory and performs a local boot/health check. The command-centre backend has no npm dependencies. No versioned Downloads path or manual `chmod` command is needed.

Before moving to a new checkout or importing old customer records, stop the running server with **Ctrl+C**, back up `sales-command-centre/data/` and `.env`, and preserve the backup. Import only the old data files that match the current collection format; never overwrite the only copy of customer data. `.env` should contain local configuration only and must not be committed.

## 3. Start the local AI and DR53

Check whether Ollama is already running before starting it:

```bash
curl --fail --silent http://127.0.0.1:11434/api/tags
```

If the check succeeds, reuse the running service; do not start a second `ollama serve`. Otherwise, launch the Ollama app or run `ollama serve` once. In Settings, choose a downloaded model. To install one, first review the model's download size and local memory requirements; no model is downloaded automatically.

Start the command centre in a terminal:

```bash
./scripts/start.sh
```

Open <http://127.0.0.1:3053>. Press **Ctrl+C** in the server terminal to stop the app. If port 3053 is already occupied, first check whether DR53 is already available there; otherwise use `PORT=3060 ./scripts/start.sh`. Run `PORT=3060 ./scripts/health-check.sh` for the alternate port.

## 4. Daya's local voice

- In **Calls & Voice**, choose a CRM contact or enter a new contact name and phone number.
- A new contact is auto-saved to `data/customers.json` when you leave the name/phone field and both a plausible name and at least 10 phone digits are present. It then appears selected in the customer dropdown. Check the status under the form.
- Saving a contact is not permission to call it. Tick the call-consent confirmation only when you have valid consent. If the contact is opted out, DR53 blocks the outreach session.
- Start the local voice session. Daya should introduce herself once, speak briefly, then listen. v0.9 attempts to stop her when the microphone detects your voice and uses browser recognition to capture your words.
- Grant microphone permission. Voice activity sensing uses Web Audio with echo cancellation/noise suppression. Keep the browser tab active and the speaker volume moderate.
- If speaking does not interrupt automatically, click **Stop speech**, then talk. If the browser cannot recognise speech, type the customer's reply instead. Full-duplex recognition depends on browser and device support, so this is a fallback-enabled best-effort feature rather than guaranteed studio-grade duplex audio.
- In **Settings & System → Voice**, `natural-local` selects the best available installed English system voice. You can enter an exact local voice name if you prefer another. A rate around `0.90`–`1.00` is a useful starting point. Voice naturalness depends on which voices are installed in macOS/browser.
- Text reasoning stays in local Ollama. Browser speech recognition may use a browser/provider recognition service, so speech-to-text is not guaranteed to be local or offline.

## 5. Load product knowledge

The approved starter catalogue is `knowledge/product-catalogue.json`. Import it into the CRM product collection with:

```bash
node scripts/import-product-knowledge.js
```

The script backs up `data/products.json`, updates four DR53 products, preserves custom products, and preserves any products explicitly disabled by the operator. Restart DR53 after import. Verify prices and technical details with the business before using the information with customers.

The approved starter facts are:

- Tap Tag Sticker — listed at ₹553; personalised tap-enabled sticker opening a profile/webpage.
- Tap Tag Card — listed at ₹753; logo card opening its linked profile webpage when tapped.
- Website Development — starts at ₹5,300; final pricing depends on scope.
- E-Adapter — listed at ₹2,553; technical specifications are unverified, so Daya must not guess.

## 6. WhatsApp and SMS drafts

Daya can generate message text locally and open WhatsApp with a pre-filled draft for you to review and send. Automatic sends are disabled in local-only mode. Do not enable API sending until provider credentials, sender permissions, customer consent, and applicable Indian commercial communication requirements have been confirmed.

## 7. Where the data is stored

Customer records and app history live in JSON files in `data/` next to `server.js`. Back up this folder before moving to another release. New customer auto-save writes to `data/customers.json`; it does not write customer information into source code and does not trigger the new-lead calling/messaging automation.

## 8. Important calling limit

This is a local voice console, not an autonomous telephone or WhatsApp caller. The Mac microphone/speaker does not by itself connect Daya to cellular or WhatsApp call audio. Real autonomous calling requires a supported telephony or calling integration and account permissions. No real phone-call, SMS, or WhatsApp voice call is created by the local voice console.

## 9. Run diagnostics

```bash
npm test
./scripts/health-check.sh
```

The automated tests validate server routes and mock provider flows. Physical microphone behavior, exact voice quality and automatic interruption still require a test on your Mac.
