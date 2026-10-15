#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "DR53 AI Sales Command Centre — setup"
echo "======================================"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 18+ is required. Install it from https://nodejs.org/en/download and run this again."
  exit 1
fi
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node.js $(node --version) is too old. Install Node 18 or newer."
  exit 1
fi
echo "Node $(node --version) found."

mkdir -p data
chmod 700 data 2>/dev/null || true

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo "Created .env from .env.example (chmod 600). Edit it to add credentials — it works empty."
fi

echo "Running the test suite..."
node --test tests/*.test.js

echo ""
echo "Boot check..."
PORT=31953 node -e "
const { createApp } = require('./src/app');
(async () => {
  const app = createApp(require('path').join(process.cwd(), 'data'));
  await app.init();
  const server = await app.listen(31953, '127.0.0.1');
  app.boot();
  const r = await fetch('http://127.0.0.1:31953/api/health');
  const j = await r.json();
  console.log('Health check:', j.ok ? 'OK' : 'FAILED', '— version', j.version);
  app.queue.stop(); app.events.close(); server.close();
  process.exit(j.ok ? 0 : 1);
})().catch((e) => { console.error('Boot failed:', e.message); process.exit(1); });
"

echo ""
echo "Setup complete. Start the app with:  npm start"
echo "Then open:                           http://127.0.0.1:3053"
echo "Ollama is optional. If it is not already running, start the Ollama app or run 'ollama serve' once."
echo "Choose an installed model in Settings; review its download size before installing a new model."
