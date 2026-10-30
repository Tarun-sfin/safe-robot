<#
  Builds SafeRobot.exe from run-robot.ps1 using ps2exe, then Authenticode-signs
  it when a code-signing certificate is available.

  Signing (any one of these):
    $env:SIGN_THUMBPRINT   = thumbprint of a Code Signing cert in this user's store
    $env:SIGN_PFX          = path to a .pfx  +  $env:SIGN_PFX_PASSWORD
    A Code Signing cert already in Cert:\CurrentUser\My  (picked automatically)

  Timestamping uses DigiCert's public TSA so the signature stays valid after
  the cert expires. Self-signed certs do NOT stop Defender/SmartScreen on
  other machines - you need an OV/EV cert or Azure Trusted Signing.

  Run:  powershell -ExecutionPolicy Bypass -File build-exe.ps1
        powershell -ExecutionPolicy Bypass -File build-exe.ps1 -SkipSign
#>
param(
  [switch]$SkipSign
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

Write-Host "Ensuring ps2exe is installed..." -ForegroundColor Cyan
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

# Windows locks an exe while it runs, so ps2exe cannot replace it.
$running = Get-CimInstance Win32_Process -Filter "Name = 'SafeRobot.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -eq $out }
if ($running) {
  Write-Host "SafeRobot.exe is still running (process id: $(($running.ProcessId) -join ', '))." -ForegroundColor Red
  Write-Host "Close every Safe Robot window, then run this build again." -ForegroundColor Red
  Write-Host "Or stop them with:  Stop-Process -Name SafeRobot" -ForegroundColor DarkGray
  exit 1
}

Write-Host "Compiling $src -> $out" -ForegroundColor Cyan
Invoke-ps2exe -InputFile $src -OutputFile $out `
  -title 'Safe Robot' `
  -description 'Automated desk-case tester for Online Apps' `
  -company 'Safe Financial' `
  -product 'Safe Robot' `
  -noConsole:$false `
  -requireAdmin:$false

if (-not (Test-Path $out)) {
  Write-Host "Build did not produce an exe." -ForegroundColor Red
  exit 1
}

Write-Host "Built: $out" -ForegroundColor Green

function Get-SigningCertificate {
  $thumb = $env:SIGN_THUMBPRINT
  if ($thumb) {
    $cert = Get-ChildItem Cert:\CurrentUser\My, Cert:\LocalMachine\My |
      Where-Object { $_.Thumbprint -eq ($thumb -replace '\s','') } |
      Select-Object -First 1
    if (-not $cert) { throw "SIGN_THUMBPRINT $thumb was not found in the certificate store." }
    return $cert
  }

  $pfx = $env:SIGN_PFX
  if ($pfx) {
    if (-not (Test-Path $pfx)) { throw "SIGN_PFX not found: $pfx" }
    $pass = $env:SIGN_PFX_PASSWORD
    if ($null -eq $pass) { $pass = '' }
    $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::PersistKeySet -bor
             [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
    return New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfx, $pass, $flags)
  }

  return Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue |
    Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1
}

function Test-TrustedCodeSigningCert([System.Security.Cryptography.X509Certificates.X509Certificate2]$cert) {
  $selfSigned = $cert.Subject -eq $cert.Issuer
  if ($selfSigned) { return $false }
  $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
  $chain.ChainPolicy.RevocationMode = 'NoCheck'
  return $chain.Build($cert)
}

if ($SkipSign) {
  Write-Host "Signing skipped (-SkipSign)." -ForegroundColor Yellow
} else {
  $cert = Get-SigningCertificate
  if (-not $cert) {
    Write-Host ""
    Write-Host "Not signed - no code-signing certificate on this machine." -ForegroundColor Yellow
    Write-Host "  Defender/SmartScreen will keep flagging an unsigned ps2exe binary." -ForegroundColor Yellow
    Write-Host "  Ask IT for an OV/EV Authenticode cert (or Azure Trusted Signing), then rerun:" -ForegroundColor Yellow
    Write-Host '    $env:SIGN_THUMBPRINT = "<thumbprint>"' -ForegroundColor DarkGray
    Write-Host '    powershell -ExecutionPolicy Bypass -File build-exe.ps1' -ForegroundColor DarkGray
    Write-Host "  Or: `$env:SIGN_PFX = 'C:\path\to\codesign.pfx'  (keep the PFX off git)." -ForegroundColor DarkGray
  } else {
    Write-Host "Signing with $($cert.Subject)  (expires $($cert.NotAfter.ToString('yyyy-MM-dd')))..." -ForegroundColor Cyan
    if (-not (Test-TrustedCodeSigningCert $cert)) {
      Write-Host "  This cert is self-signed / untrusted. Teammates' Defender will still flag the exe" -ForegroundColor Yellow
      Write-Host "  until you use a publicly-trusted OV/EV cert or Azure Trusted Signing." -ForegroundColor Yellow
    }
    $sig = Set-AuthenticodeSignature -FilePath $out -Certificate $cert `
      -TimestampServer 'http://timestamp.digicert.com' -HashAlgorithm SHA256
    if ($sig.Status -ne 'Valid' -and $sig.Status -ne 'UnknownError') {
      # UnknownError often means the timestamp server was unreachable; local signature may still be present.
      Write-Host "  Signature status: $($sig.Status) - $($sig.StatusMessage)" -ForegroundColor Yellow
    } else {
      Write-Host "  Signature status: $($sig.Status)" -ForegroundColor Green
    }
    Get-AuthenticodeSignature $out | Format-List Status, SignerCertificate, TimeStamperCertificate | Out-String | Write-Host
  }
}

Write-Host "Double-click SafeRobot.exe to run. Zip this folder to share it." -ForegroundColor Green
