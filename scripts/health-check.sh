#!/bin/bash
set -euo pipefail

PORT="${PORT:-3053}"
URL="${DR53_HEALTH_URL:-http://127.0.0.1:${PORT}/api/health}"

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required for the health check." >&2
  exit 1
fi

if ! response="$(curl --silent --show-error --fail "$URL" 2>&1)"; then
  echo "ERROR: DR53 did not answer at $URL." >&2
  echo "Start it from the repository root with ./scripts/start.sh, then retry." >&2
  echo "$response" >&2
  exit 1
fi

printf '%s' "$response" | node -e '
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  try {
    const health = JSON.parse(input);
    console.log(`Server: ${health.ok ? "OK" : "NOT OK"} | version ${health.version}`);
    console.log(`AI: ${health.ai?.active || "unknown"}${health.ai?.ready ? " (ready)" : " (offline fallback available)"}`);
    for (const provider of Object.values(health.providers || {})) {
      console.log(`- ${provider.label}: ${provider.ready ? "ready" : `not configured (${(provider.missing || []).join(", ") || "unavailable"})`}`);
    }
    if (!health.ok) process.exitCode = 1;
  } catch {
    console.error("ERROR: Health endpoint returned invalid JSON.");
    process.exitCode = 1;
  }
});'
