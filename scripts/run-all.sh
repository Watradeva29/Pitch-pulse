#!/usr/bin/env bash
# Runs server + client in one terminal (foreground logs interleaved). Ctrl+C stops both.
# Usage: bash scripts/run-all.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx not found. Install Node.js LTS." >&2
  exit 1
fi

echo "[run-all] Starting server and client (Ctrl+C stops both)..."
exec npx --yes concurrently -n server,client -c blue,green \
  "cd server && npm run dev" \
  "cd client && npm run dev -- --host"
