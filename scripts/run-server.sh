#!/usr/bin/env bash
# Runs the API server. From repo root: bash scripts/run-server.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/server"
if [[ ! -d node_modules ]]; then
  echo "[run-server] npm install..."
  npm install
fi
echo "[run-server] http://localhost:3001/api/health"
exec npm run dev
