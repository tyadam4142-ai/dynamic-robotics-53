#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required. Install it from https://nodejs.org/en/download, then run setup.sh."
  read -r -p "Press Return to close this window..."
  exit 1
fi
if [ ! -f .env ] && [ -f .env.example ]; then cp .env.example .env; chmod 600 .env; fi
mkdir -p data
echo "Starting DR53 AI Sales Command Centre…"
( sleep 2; open "http://127.0.0.1:3053" ) &
node server.js
