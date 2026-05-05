# Runs the API + Socket.IO server (Express on port 3001 by default).
# Usage: .\scripts\run-server.ps1
# From repo root: powershell -ExecutionPolicy Bypass -File .\scripts\run-server.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ServerDir = Join-Path $RepoRoot "server"

if (-not (Test-Path $ServerDir)) {
  Write-Error "Server folder not found: $ServerDir"
}

Set-Location $ServerDir

if (-not (Test-Path "node_modules")) {
  Write-Host "[run-server] Installing dependencies..." -ForegroundColor Cyan
  npm install
}

Write-Host "[run-server] Starting from $ServerDir" -ForegroundColor Green
Write-Host "[run-server] API: http://localhost:3001/api/health" -ForegroundColor DarkGray
npm run dev
