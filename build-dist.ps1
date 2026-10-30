<#
  Build-SafeRobot-Zip - packages the tester into a single shareable ZIP.

  Double-click Build-SafeRobot-Zip.exe (or run this script). It:
    1. makes sure SafeRobot.exe exists (builds it if missing),
    2. generates How-To-Use.pdf from docs/how-to-use.html,
    3. copies only the files a recipient needs (source + launchers + exe + PDF),
       deliberately EXCLUDING secrets (.env, real bank statement), node_modules,
       and the builder's own files,
    4. zips it to SafeRobot-dist.zip - that single file is what you send.
#>
$ErrorActionPreference = 'Stop'

function Say($m)  { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    $m" -ForegroundColor Yellow }

# Locate the project folder (works as .ps1 and as a ps2exe .exe).
$root = $PSScriptRoot
if (-not $root) { $root = [System.AppDomain]::CurrentDomain.BaseDirectory }
$root = $root.TrimEnd('\')
Set-Location $root

Write-Host ""
Write-Host "  Safe Robot - distributable builder" -ForegroundColor White
Write-Host "  Folder: $root" -ForegroundColor DarkGray
Write-Host ""

# --- 1. Build SafeRobot.exe from the current script -------------------------
Say "Building SafeRobot.exe..."
powershell -ExecutionPolicy Bypass -File (Join-Path $root 'build-exe.ps1')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $root 'SafeRobot.exe'))) {
  Warn "SafeRobot.exe was not built."
  exit 1
}
Ok "SafeRobot.exe present."

# --- 2. Ensure deps + browser (needed to render the PDF) --------------------
if (-not (Test-Path (Join-Path $root 'node_modules\@playwright\test'))) {
  Say "Installing dependencies (first build only)..."
  if (Test-Path (Join-Path $root 'package-lock.json')) { npm ci } else { npm install }
}
Say "Ensuring the PDF renderer (Chromium) is installed..."
npx playwright install chromium 2>$null | Out-Null

# --- 3. Generate How-To-Use.pdf ---------------------------------------------
Say "Generating How-To-Use.pdf..."
$pdf = Join-Path $root 'How-To-Use.pdf'
node (Join-Path $root 'tools\make-howto-pdf.js') $pdf
if (Test-Path $pdf) { Ok "How-To-Use.pdf created." } else { Warn "PDF was not created - continuing without it." }

# --- 4. Stage the files a recipient needs -----------------------------------
Say "Collecting files to package..."
$stageParent = Join-Path $env:TEMP ("saferobot-dist-" + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $stageParent 'SafeRobot'
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$files = @(
  'SafeRobot.exe', 'run-robot.bat', 'run-robot.ps1', 'README.md', 'How-To-Use.pdf',
  'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json', '.env.example'
)
foreach ($f in $files) {
  $src = Join-Path $root $f
  if (Test-Path $src) { Copy-Item $src (Join-Path $stage $f) -Force }
}

foreach ($d in @('pages', 'helpers', 'tests')) {
  $src = Join-Path $root $d
  if (Test-Path $src) { Copy-Item $src (Join-Path $stage $d) -Recurse -Force }
}

# fixtures: ship ONLY the placeholder sample, never the real statement.
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'fixtures') | Out-Null
$sample = Join-Path $root 'fixtures\bank-statement.sample.json'
if (Test-Path $sample) { Copy-Item $sample (Join-Path $stage 'fixtures\bank-statement.sample.json') -Force }

# --- 5. Zip it --------------------------------------------------------------
Say "Creating the ZIP..."
$zip = Join-Path $root 'SafeRobot-dist.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $stage -DestinationPath $zip -Force
Remove-Item $stageParent -Recurse -Force -ErrorAction SilentlyContinue

if (Test-Path $zip) {
  $sizeMB = [math]::Round((Get-Item $zip).Length / 1MB, 2)
  Write-Host ""
  Ok "Done!  ->  $zip  ($sizeMB MB)"
  Write-Host "    Send that single ZIP. The recipient extracts it and double-clicks SafeRobot.exe." -ForegroundColor Green
  # Reveal it in Explorer.
  Start-Process explorer.exe "/select,`"$zip`"" -ErrorAction SilentlyContinue
} else {
  Warn "ZIP was not created."
}

Write-Host ""
Read-Host "Press Enter to close"
