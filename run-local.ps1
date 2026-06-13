# run-local.ps1 -- Verified Agent Rails (VAR), full local end-to-end.
#
# Walks the five steps of SPEC_MVP.md Section 6 ("Run flow"). Each step is
# labelled and corresponds 1:1 to a spec bullet:
#
#   1. hardhat node   (chain 31337)
#   2. deploy:local   (writes deployment.json + ABIs into backend/src/var/)
#   3. backend        (FastAPI / uvicorn on :8000)
#   4. frontend       (Next.js dev server on :3000)
#   5. demo_arc.py    (headless proof of the reject->grant->...->locked-out arc)
#
# Long-running services (node, backend, frontend) start in their own
# background PowerShell windows so this script can move on and finally run the
# headless demo against them. Re-running is safe: closing the spawned windows
# tears everything down.
#
# Usage (from the repo root):
#     ./run-local.ps1
#
# Prerequisites are already installed in this environment (Node 22, the Python
# venv at .venv, Hardhat + OpenZeppelin under contracts/, and the backend
# requirements). See docs/verified-agent-rails/RUN.md for details.

$ErrorActionPreference = "Stop"

# Resolve paths relative to this script so it works from any cwd.
$Root    = $PSScriptRoot
$Venv    = Join-Path $Root ".venv\Scripts\python.exe"
$Backend = Join-Path $Root "backend"

Write-Host "==> VAR local run -- repo root: $Root" -ForegroundColor Cyan
if (-not (Test-Path $Venv)) {
    throw "Python venv not found at $Venv. Create it and pip install -r backend/requirements.txt."
}

# A small helper that opens a new PowerShell window running a command, titled so
# you can tell the windows apart. $Title and $Command are composed into a single
# -Command payload; quoting inside $Command uses single quotes to stay simple.
function Start-Service-Window([string]$Title, [string]$Command) {
    Write-Host "==> launching: $Title" -ForegroundColor Yellow
    $payload = '$host.UI.RawUI.WindowTitle = ''' + $Title + '''; ' + $Command
    Start-Process powershell -ArgumentList @("-NoExit", "-Command", $payload) | Out-Null
}

# ---------------------------------------------------------------------------
# STEP 1 -- Hardhat node (chain 31337). Long-running; own window.
#   SPEC 6.1:  npm --prefix contracts run node
# ---------------------------------------------------------------------------
Start-Service-Window "VAR: hardhat node (31337)" "npm --prefix '$Root\contracts' run node"

# Give the JSON-RPC endpoint a moment to bind :8545 before we deploy against it.
Write-Host "==> waiting for hardhat JSON-RPC on :8545 ..." -ForegroundColor Yellow
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
    if ((Test-NetConnection -ComputerName 127.0.0.1 -Port 8545 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
        Write-Host "    hardhat node is up." -ForegroundColor Green
        break
    }
    Start-Sleep -Milliseconds 500
}

# ---------------------------------------------------------------------------
# STEP 2 -- Deploy contracts to the local node; write deployment.json + ABIs.
#   SPEC 6.2:  npm --prefix contracts run deploy:local
#   This one runs in THIS window (foreground) so the demo only fires after a
#   confirmed deploy.
# ---------------------------------------------------------------------------
Write-Host "==> deploying contracts (deploy:local) ..." -ForegroundColor Yellow
npm --prefix "$Root\contracts" run deploy:local
if ($LASTEXITCODE -ne 0) { throw "deploy:local failed (exit $LASTEXITCODE)" }
Write-Host "    contracts deployed; deployment.json + ABIs written to backend." -ForegroundColor Green

# ---------------------------------------------------------------------------
# STEP 3 -- Backend (FastAPI / uvicorn on :8000). Long-running; own window.
#   SPEC 6.3:  uvicorn src.main:app --port 8000   (run from backend/, venv)
# ---------------------------------------------------------------------------
Start-Service-Window "VAR: backend (uvicorn :8000)" `
    "Set-Location '$Backend'; & '$Venv' -m uvicorn src.main:app --reload --port 8000"

# ---------------------------------------------------------------------------
# STEP 4 -- Frontend (Next.js dev server on :3000). Long-running; own window.
#   SPEC 6.4:  npm run dev   (in frontend/, served on :3000)
# ---------------------------------------------------------------------------
Start-Service-Window "VAR: frontend (next dev :3000)" "npm --prefix '$Root\frontend' run dev"

# ---------------------------------------------------------------------------
# STEP 5 -- Headless demo arc (the proof). Runs in THIS window with the venv
#   python, from backend/ so `from src.var.chain import ...` resolves.
#   SPEC 6.5:  scripts/demo_arc.py
# ---------------------------------------------------------------------------
Write-Host "==> running the headless demo arc ..." -ForegroundColor Yellow
Push-Location $Backend
try {
    & $Venv "scripts\demo_arc.py"
    $demoExit = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($demoExit -eq 0) {
    Write-Host ""
    Write-Host "==> ARC OK -- backend (:8000) and frontend (:3000) are still running." -ForegroundColor Green
    Write-Host "    Open http://localhost:3000 for the dashboard. Close the spawned" -ForegroundColor Green
    Write-Host "    PowerShell windows to stop the node / backend / frontend." -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "==> demo arc FAILED (exit $demoExit). Check the hardhat + backend windows." -ForegroundColor Red
}

exit $demoExit
