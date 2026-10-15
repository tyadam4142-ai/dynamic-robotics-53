# Dynamic Robotics 53

This repository keeps the existing public DR53 website and the local-first DR53 AI Sales Command Centre together. The public site remains the GitHub Pages deployment; the command centre is a local Node.js service and is not exposed by GitHub Pages.

## Local AI Sales Command Centre

The standalone command centre is in the stable `sales-command-centre/` directory. It uses Node.js 18+ built-ins and a browser; it does not need npm dependencies. From the repository root:

```bash
./scripts/setup.sh
./scripts/start.sh
```

Open <http://127.0.0.1:3053>. Press **Ctrl+C** in the terminal running the server to stop it. Check status with `./scripts/health-check.sh`; run the command-centre tests with `npm test`.

Ollama is optional. The CRM and text interface remain available without it, with a clear offline/catalogue fallback. If Ollama is already running, the app reuses it; do not start another server. Configure/select the local model in Settings. The app does not download a model automatically. Browser speech recognition may use an online recognition service; the local voice console is an acoustic assist, not a direct telephone-audio connection.

CRM data stays in `sales-command-centre/data/`. Back up that directory before moving or replacing the checkout. Optional real telephony, SMS and WhatsApp require provider credentials, approved account access, valid customer consent and may incur charges. No test places real calls or sends real messages.

## Public website

The website uses Vite, React, TypeScript and Tailwind:

```bash
npm run dev      # local website at http://127.0.0.1:3000
npm run lint     # TypeScript check
npm run build    # static site output in dist/
```

GitHub Pages deploys only the root Vite website. It does not host the local CRM backend or customer data.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — repository and local-service architecture.
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) — setup, path, Ollama, voice and integration diagnostics.
- [`sales-command-centre/SETUP.md`](sales-command-centre/SETUP.md) — detailed local application setup and feature limitations.
- [`sales-command-centre/AGENT-GUIDE.md`](sales-command-centre/AGENT-GUIDE.md) — operator workflow.
