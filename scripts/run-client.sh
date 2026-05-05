#!/usr/bin/env bash
# Runs the Vite client. From repo root: bash scripts/run-client.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/client"
if [[ ! -d node_modules ]]; then
  echo "[run-client] npm install..."
  npm install
fi
echo "[run-client] http://localhost:5173/pitchpulse/ (typical)"
exec npm run dev -- --host
