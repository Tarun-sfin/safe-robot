<#
  Checks what a robot run created in LBPUAT (OnlineApps) and AlbertUAT, and writes
  check.md + check.json next to result.json.

    tools\check-run.ps1 -RunDir runs\20261030-0830-c2226000
    tools\check-run.ps1 -RunDir runs\latest -WaitMinutes 0     # no waiting for Nexus / Adam

  Nexus and Adam start after submit and finish a few minutes later, so by default it waits
  up to -WaitMinutes for both to appear. Read-only (safe-db runner).
#>
param(
  [Parameter(Mandatory)][string]$RunDir,
  [int]$WaitMinutes = 8
)

$ErrorActionPreference = 'Stop'
$runner = Join-Path $env:USERPROFILE '.safe-db\query.ps1'
$resultFile = Join-Path $RunDir 'result.json'
if (-not (Test-Path $resultFile)) { throw "No result.json in $RunDir" }
$result = Get-Content $resultFile -Raw | ConvertFrom-Json

# Budget types Nexus keeps as one row per contract (AiAllocation.MergeIntoExistingRowTypes).
$oneRowTypes = 275, 210, 276, 253, 278, 250, 221, 273, 271, 272
$typeNames = @{
  101 = 'Wage'; 102 = 'Benefit'; 150 = 'Other Income'; 200 = 'Board'; 201 = 'Rent'; 203 = 'Mortgage'
  210 = 'Groceries'; 220 = 'Vehicle Loan'; 221 = 'Transport'; 222 = 'Vehicle Running'; 238 = 'General Insurance'
  239 = 'Short Term Loan'; 240 = 'Personal Loan'; 241 = 'Credit Card'; 242 = 'Store Card'; 243 = 'Payment Plans'
  246 = 'Health Insurance'; 250 = 'Children'; 253 = 'Clothing & Entertainment'; 254 = 'Other Expense'
  265 = 'Dishonours'; 266 = 'Credit Default'; 267 = 'Credit Enquiry'; 268 = 'BNPL'; 269 = 'Debt Repayment'
  270 = 'Unallocated'; 271 = 'Telecommunications'; 272 = 'Utilities'; 273 = 'Subscription TV'; 275 = 'Gambling'
  276 = 'Dining Out'; 278 = 'Online Retail'
}
$appStates = 'InProgress', 'Cancelled', 'Submitted', 'InAlbert', 'FailedInAlbert'
$responseStates = 'Received', 'Parsed', 'Confirmed', 'Transferred', 'Failed', 'Mapped', 'FeedSourced'
$runStates = 'Ready', 'Applied', 'Failed'

function Query([string]$target, [string]$sql) {
  $csv = [IO.Path]::GetTempFileName()
  try {
    & $runner -Target $target -Sql $sql -Csv $csv | Out-Null
    return @(Import-Csv $csv)
  } finally { Remove-Item $csv -Force -ErrorAction SilentlyContinue }
}
function TypeName($t) { $n = $typeNames[[int]$t]; if ($n) { "$t $n" } else { "$t" } }

if (-not $result.coreSlug -and -not $result.verificationCode) { throw "result.json has neither coreSlug nor verificationCode; the run did not get far enough to check." }

$coreFilter = if ($result.coreSlug) { "c.Slug = '$($result.coreSlug)'" } else { "c.Id = (SELECT Core_Id FROM OA_BankRequest WHERE VerificationCode = '$($result.verificationCode)')" }
$core = Query 'lbpuat' "SELECT TOP 1 c.Id, c.AppState, c.ContractId, c.CompletedDate FROM OA_Core c WHERE $coreFilter" | Select-Object -First 1
if (-not $core) { throw "No OA_Core found on LBPUAT for this run." }
$bank = Query 'lbpuat' "SELECT r.Id, r.AlbertContractId, s.Id AS ResponseId, s.Status FROM OA_BankRequest r LEFT JOIN OA_BankResponse s ON s.BankRequest_Id = r.Id WHERE r.Core_Id = $($core.Id) ORDER BY r.Id, s.Id"

$contractId = if ($result.albertContractId) { [long]$result.albertContractId }
              elseif ($core.ContractId) { [long]$core.ContractId }
              else { ($bank | Where-Object { $_.AlbertContractId } | Select-Object -First 1).AlbertContractId }

$report = [ordered]@{
  runOutcome      = $result.outcome
  finalUrl        = $result.finalUrl
  sourceContract  = $result.sourceContract
  coreId          = [long]$core.Id
  appState        = $appStates[[int]$core.AppState]
  albertContractId = $contractId
  bankResponses   = @($bank | Where-Object { $_.ResponseId } | ForEach-Object { "$($_.ResponseId) $($responseStates[[int]$_.Status])" })
  nexus           = $null
  adam            = $null
  budget          = @()
  flags           = @()
}

if ($contractId) {
  $deadline = (Get-Date).AddMinutes($WaitMinutes)
  do {
    $nexus = Query 'lbpuat' "SELECT TOP 1 Id, Status, EntryDate, LEFT(ResultJson, 300) AS Result FROM OA_AiAllocationRuns WHERE AlbertContractId = $contractId ORDER BY Id DESC" | Select-Object -First 1
    $adam = Query 'lbpuat' "SELECT TOP 1 Id, Status, EntryDate, SentAt, ReviewedAt FROM OA_AiQuestionSubmissions WHERE AlbertContractId = $contractId ORDER BY Id DESC" | Select-Object -First 1
    if (($nexus -and $adam) -or (Get-Date) -ge $deadline) { break }
    Write-Host "    waiting for Nexus/Adam (nexus=$([bool]$nexus) adam=$([bool]$adam))..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 30
  } while ($true)

  if ($nexus) {
    $res = $null; try { $res = ($nexus.Result | ConvertFrom-Json) } catch {}
    $report.nexus = [ordered]@{ runId = [long]$nexus.Id; status = $runStates[[int]$nexus.Status]; at = $nexus.EntryDate; summary = $nexus.Result }
  }
  if ($adam) {
    $report.adam = [ordered]@{ submissionId = [long]$adam.Id; status = [int]$adam.Status; at = $adam.EntryDate; reviewedAt = $adam.ReviewedAt }
  }

  $rows = Query 'albert' "SELECT ID, Type, Amount, Frequency, AmountConfirmed, AccountName, CountOfTransactions, LEFT(Note, 160) AS Note FROM dbo.BudgetItems WHERE Contract = $contractId AND ISNULL(IsDeleted, 0) = 0 ORDER BY Type, ID"
  $report.budget = @($rows | ForEach-Object {
    [ordered]@{ id = [long]$_.ID; type = (TypeName $_.Type); amount = $_.Amount; freq = $_.Frequency; confirmed = $_.AmountConfirmed; name = $_.AccountName; txns = $_.CountOfTransactions; note = $_.Note }
  })

  $aiRows = @($rows | Where-Object { $_.Note -like 'AI:*' })
  foreach ($g in ($rows | Group-Object Type)) {
    if ([int]$g.Name -in $oneRowTypes -and $g.Count -gt 1) {
      $report.flags += "Repeat rows: $($g.Count) x $(TypeName $g.Name) (should be one row per contract)"
    }
  }
  $unalloc = @($rows | Where-Object { [int]$_.Type -eq 270 })
  if ($unalloc.Count -gt 0) {
    $left = Query 'albert' "SELECT COUNT(*) AS N FROM dbo.BankAccountVerificationTransactions WHERE BudgetItemID IN ($(($unalloc.ID) -join ','))"
    $report.flags += "Unallocated row still has $($left[0].N) transaction(s)"
  }
  if (-not $report.nexus) { $report.flags += "No Nexus run found within $WaitMinutes min" }
  elseif ($report.nexus.status -ne 'Applied') { $report.flags += "Nexus run $($report.nexus.runId) is $($report.nexus.status)" }
  if (-not $report.adam) { $report.flags += "No Adam submission found within $WaitMinutes min" }
  $report.aiRowsCreated = $aiRows.Count
} else {
  $report.flags += "No Albert contract was created"
}

$report | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $RunDir 'check.json') -Encoding UTF8

$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine("# Safe Robot run check")
[void]$md.AppendLine("")
[void]$md.AppendLine("- Outcome: **$($report.runOutcome)** ($($report.finalUrl))")
if ($report.sourceContract) { [void]$md.AppendLine("- Statement replayed from live contract: $($report.sourceContract)") }
[void]$md.AppendLine("- Albert UAT contract: **$($report.albertContractId)**; OnlineApps core $($report.coreId) ($($report.appState))")
[void]$md.AppendLine("- Bank responses: $($report.bankResponses -join ', ')")
[void]$md.AppendLine("- Nexus: $(if ($report.nexus) { "run $($report.nexus.runId) $($report.nexus.status)" } else { 'none' })")
[void]$md.AppendLine("- Adam: $(if ($report.adam) { "submission $($report.adam.submissionId) status $($report.adam.status)" } else { 'none' })")
[void]$md.AppendLine("")
[void]$md.AppendLine("## Flags")
if ($report.flags.Count -eq 0) { [void]$md.AppendLine("- None") } else { $report.flags | ForEach-Object { [void]$md.AppendLine("- $_") } }
[void]$md.AppendLine("")
[void]$md.AppendLine("## Budget rows ($($report.budget.Count))")
[void]$md.AppendLine("| ID | Type | Amount | Freq | Confirmed | Name | Txns | Note |")
[void]$md.AppendLine("|---|---|---|---|---|---|---|---|")
foreach ($b in $report.budget) {
  [void]$md.AppendLine("| $($b.id) | $($b.type) | $($b.amount) | $($b.freq) | $($b.confirmed) | $($b.name) | $($b.txns) | $(($b.note -replace '\|', '/')) |")
}
$md.ToString() | Set-Content (Join-Path $RunDir 'check.md') -Encoding UTF8
$md.ToString()
