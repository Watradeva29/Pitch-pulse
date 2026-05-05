# Master script: opens two terminals — backend + frontend — so logs stay separate.
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1
# Optional: free ports 3001 and 5173 first (may close other apps using those ports):
#   .\scripts\run-all.ps1 -CleanPorts

param(
  [switch] $CleanPorts
)

$ErrorActionPreference = "Stop"
$ScriptsDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Split-Path -Parent $ScriptsDir)).Path
# Full paths so spaces in "Cricket scoring app" never break argv parsing
$ServerScript = (Resolve-Path (Join-Path $ScriptsDir "run-server.ps1")).Path
$ClientScript = (Resolve-Path (Join-Path $ScriptsDir "run-client.ps1")).Path
$PwshExe = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"

function Escape-SingleQuoted([string] $s) {
  return ($s -replace "'", "''")
}

function Stop-ListenersOnPort([int] $Port) {
  try {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object {
        # Do not use $PID / $pid here — $PID is reserved in PowerShell.
        $owningProcessId = $_.OwningProcess
        if ($owningProcessId) {
          Write-Host "[run-all] Stopping process $owningProcessId listening on port $Port" -ForegroundColor Yellow
          Stop-Process -Id $owningProcessId -Force -ErrorAction SilentlyContinue
        }
      }
  } catch {
    Write-Host "[run-all] Could not clean port $Port (Get-NetTCPConnection unavailable or no listener)." -ForegroundColor DarkYellow
  }
}

if ($CleanPorts) {
  Stop-ListenersOnPort 3001
  Stop-ListenersOnPort 5173
  Start-Sleep -Milliseconds 500
}

Write-Host "[run-all] Repo root: $RepoRoot" -ForegroundColor Cyan
if (-not (Test-Path $PwshExe)) {
  Write-Error "PowerShell not found at: $PwshExe"
}

# Use -Command (not -File) so paths with spaces never get split by the shell that Start-Process spawns.
$serverCmd = "& '" + (Escape-SingleQuoted $ServerScript) + "'"
$clientCmd = "& '" + (Escape-SingleQuoted $ClientScript) + "'"

Write-Host "[run-all] Launching server window..." -ForegroundColor Green
Start-Process -FilePath $PwshExe -WorkingDirectory $RepoRoot -ArgumentList @(
  "-NoExit",
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command",
  $serverCmd
)

Start-Sleep -Milliseconds 400

Write-Host "[run-all] Launching client window..." -ForegroundColor Green
Start-Process -FilePath $PwshExe -WorkingDirectory $RepoRoot -ArgumentList @(
  "-NoExit",
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command",
  $clientCmd
)

Write-Host "[run-all] Done. Close each window to stop that server." -ForegroundColor Cyan
