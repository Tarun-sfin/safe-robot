<#
  Downloads the bank statement JSON (OA_BankResponse) behind an Albert contract so the robot
  can replay it on Beta.

    tools\fetch-statement.ps1 -Contract 2226000 -OutFile runs\x\statement.json
    tools\fetch-statement.ps1 -Contract 2224674 -Source uat -OutFile ...

  -Source live (default) reads OnlineApps live (lbplive); uat reads LBPUAT. Both are read-only
  through the safe-db runner. Takes the latest response that did not fail. Prints the chosen
  response id to stdout as JSON.
#>
param(
  [Parameter(Mandatory)][long]$Contract,
  [ValidateSet('live', 'uat')][string]$Source = 'live',
  [Parameter(Mandatory)][string]$OutFile
)

$ErrorActionPreference = 'Stop'
$runner = Join-Path $env:USERPROFILE '.safe-db\query.ps1'
if (-not (Test-Path $runner)) { throw "safe-db runner not found at $runner" }
$target = if ($Source -eq 'live') { 'lbplive' } else { 'lbpuat' }

$csv = [IO.Path]::GetTempFileName()
$sql = @"
SELECT TOP 1 s.Id, s.EntryDate, s.Status, s.ResponseLocation, r.Id AS BankRequestId, r.Core_Id
FROM OA_BankRequest r
JOIN OA_BankResponse s ON s.BankRequest_Id = r.Id
WHERE r.AlbertContractId = $Contract AND s.Status <> 4 AND s.ResponseLocation IS NOT NULL
ORDER BY s.Id DESC
"@
& $runner -Target $target -Sql $sql -Csv $csv | Out-Null
$row = Import-Csv $csv | Select-Object -First 1
Remove-Item $csv -Force
if (-not $row) { throw "No usable bank response found for contract $Contract on $Source." }

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
Invoke-WebRequest -Uri $row.ResponseLocation -OutFile $OutFile -UseBasicParsing
$json = Get-Content $OutFile -Raw | ConvertFrom-Json
if (-not $json.bankData) { throw "Downloaded file is not a bank statement response: $OutFile" }

[pscustomobject]@{
  sourceContract = $Contract
  source         = $Source
  bankResponseId = [long]$row.Id
  bankRequestId  = [long]$row.BankRequestId
  coreId         = [long]$row.Core_Id
  receivedAt     = $row.EntryDate
  accounts       = @($json.bankData.bankAccounts).Count
  transactions   = (@($json.bankData.bankAccounts | ForEach-Object { @($_.transactions).Count }) | Measure-Object -Sum).Sum
  file           = (Resolve-Path $OutFile).Path
} | ConvertTo-Json -Compress
