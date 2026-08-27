<#
  Builds SafeRobot.exe from run-robot.ps1 using ps2exe.

  The resulting .exe is a single double-click file that lives inside this
  playwright-tests folder. On first run it auto-installs Node, the test
  dependencies, and Chromium (no manual setup), then drives the wizard.

  Share it by zipping the whole playwright-tests folder.

  Run:  powershell -ExecutionPolicy Bypass -File build-exe.ps1
#>
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

Write-Host "Ensuring ps2exe is installed…" -ForegroundColor Cyan
if (-not (Get-Module -ListAvailable -Name ps2exe)) {
  try {
    Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber
  } catch {
    Write-Host "Could not install ps2exe from PSGallery: $_" -ForegroundColor Yellow
    Write-Host "You can still use run-robot.bat (double-click) instead of the exe." -ForegroundColor Yellow
    exit 1
  }
}
Import-Module ps2exe

$src = Join-Path $root 'run-robot.ps1'
$out = Join-Path $root 'SafeRobot.exe'

Write-Host "Compiling $src -> $out" -ForegroundColor Cyan
Invoke-ps2exe -InputFile $src -OutputFile $out `
  -title 'Safe Robot' `
  -description 'Automated desk-case tester for Online Apps' `
  -company 'Safe Financial' `
  -product 'Safe Robot' `
  -noConsole:$false `
  -requireAdmin:$false

if (Test-Path $out) {
  Write-Host "Built: $out" -ForegroundColor Green
  Write-Host "Double-click SafeRobot.exe to run. Zip this folder to share it." -ForegroundColor Green
} else {
  Write-Host "Build did not produce an exe." -ForegroundColor Red
  exit 1
}
