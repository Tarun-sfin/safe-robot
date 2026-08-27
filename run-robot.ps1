<#
  SAFE ROBOT launcher.

  Double-click SafeRobot.exe (or run this script). On first run it makes sure
  Node, the test dependencies, and the Chromium browser are present, then drives
  the mini-loan wizard with the on-screen red/white tracker.

  Usage:
    run-robot.ps1                 # asks beta or local
    run-robot.ps1 -Target beta
    run-robot.ps1 -Target local
    run-robot.ps1 -Target beta -StopAtBank   # stop at the bank step (quick demo)
#>
param(
  [ValidateSet('beta', 'local', '')]
  [string]$Target = '',
  [switch]$StopAtBank,
  [switch]$Headless
)

$ErrorActionPreference = 'Stop'
# Work from the folder the script/exe lives in.
$root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent ([System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName) }
Set-Location $root

function Write-Head($msg) { Write-Host ""; Write-Host "  $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "    $msg" -ForegroundColor Gray }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }

Write-Host ""
Write-Host "  ####  SAFE ROBOT  ####" -ForegroundColor Red
Write-Host "  Automated desk-case tester" -ForegroundColor DarkGray

# --- 1. Pick the target ------------------------------------------------------
if (-not $Target) {
  Write-Head "Where should the robot test?"
  Write-Host "    [1] Beta   (https://beta2.safefinancial.com.au)"
  Write-Host "    [2] Local  (http://localhost:4200  +  API on :5000)"
  $choice = Read-Host "    Choose 1 or 2"
  $Target = if ($choice -eq '2') { 'local' } else { 'beta' }
}
Write-Ok "Target: $Target"

# --- 2. Ensure Node is available --------------------------------------------
function Test-Node { try { node -v *> $null; return $LASTEXITCODE -eq 0 } catch { return $false } }

if (-not (Test-Node)) {
  Write-Head "Node.js not found — installing a private copy (first run only)…"
  $nodeVersion = 'v20.17.0'
  $nodeDir = Join-Path $root ".runtime\node-$nodeVersion-win-x64"
  if (-not (Test-Path (Join-Path $nodeDir 'node.exe'))) {
    $zip = Join-Path $root ".runtime\node.zip"
    New-Item -ItemType Directory -Force -Path (Join-Path $root '.runtime') | Out-Null
    $url = "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip"
    Write-Info "Downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $zip
    Write-Info "Extracting…"
    Expand-Archive -Path $zip -DestinationPath (Join-Path $root '.runtime') -Force
    Remove-Item $zip -Force
  }
  $env:Path = "$nodeDir;$env:Path"
  Write-Ok "Node ready: $(node -v)"
} else {
  Write-Ok "Node found: $(node -v)"
}

# --- 3. Ensure dependencies + browser ---------------------------------------
# Node tools write progress/warnings to stderr; don't let that abort us.
$ErrorActionPreference = 'Continue'
$env:NODE_NO_WARNINGS = '1'
$env:FORCE_COLOR = ''

if (-not (Test-Path (Join-Path $root 'node_modules\@playwright\test'))) {
  Write-Head "Installing test dependencies (first run only)…"
  if (Test-Path (Join-Path $root 'package-lock.json')) { npm ci } else { npm install }
}
Write-Info "Ensuring Chromium is installed…"
npx playwright install chromium 2>$null | Out-Null
Write-Ok "Dependencies ready."

# --- 4. Run ------------------------------------------------------------------
$env:TARGET = $Target
$env:SHOW_HUD = '1'
if ($StopAtBank) { $env:STOP_AT_BANK = '1' } else { $env:STOP_AT_BANK = '0' }

Write-Head "Launching the robot ($Target)…"
if ($Headless) {
  npx playwright test
} else {
  npx playwright test --headed
}
$code = $LASTEXITCODE

Write-Host ""
if ($code -eq 0) {
  Write-Ok "Run finished. See report:  npx playwright show-report"
} else {
  Write-Host "    Run ended with issues (exit $code). Trace/video saved under test-results\." -ForegroundColor Yellow
}
Write-Host ""
Read-Host "  Press Enter to close"
exit $code
