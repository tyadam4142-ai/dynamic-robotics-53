#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/sales-command-centre"

if [ ! -f "$ROOT_DIR/package.json" ] || [ ! -f "$APP_DIR/server.js" ]; then
  echo "ERROR: DR53 project files are incomplete. Expected sales-command-centre/server.js under $ROOT_DIR." >&2
  echo "Run this script from a complete repository checkout." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 18 or newer is required. Run ./scripts/setup.sh after installing Node.js." >&2
  exit 1
fi

node -e "if (Number(process.versions.node.split('.')[0]) < 18) { console.error('ERROR: Node.js 18 or newer is required; found ' + process.version); process.exit(1); }"

cd "$APP_DIR"
exec node server.js
