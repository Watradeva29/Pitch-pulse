# Runs the Vite React dev server (default port 5173, base /pitchpulse/).
# Usage: .\scripts\run-client.ps1
# From repo root: powershell -ExecutionPolicy Bypass -File .\scripts\run-client.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ClientDir = Join-Path $RepoRoot "client"

if (-not (Test-Path $ClientDir)) {
  Write-Error "Client folder not found: $ClientDir"
}

Set-Location $ClientDir

if (-not (Test-Path "node_modules")) {
  Write-Host "[run-client] Installing dependencies..." -ForegroundColor Cyan
  npm install
}

Write-Host "[run-client] Starting from $ClientDir" -ForegroundColor Green
Write-Host "[run-client] App (typical): http://localhost:5173/pitchpulse/" -ForegroundColor DarkGray
npm run dev -- --host
