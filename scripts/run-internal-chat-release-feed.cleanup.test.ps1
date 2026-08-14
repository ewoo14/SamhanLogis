$ErrorActionPreference = 'Stop'

$helperPath = Join-Path $PSScriptRoot 'internal-chat-release-feed-cleanup.ps1'
if (-not (Test-Path -LiteralPath $helperPath)) {
  throw "RED: cleanup helper is missing: $helperPath"
}
. $helperPath

$runId = [guid]::NewGuid().ToString('N')
$work = Join-Path ([IO.Path]::GetTempPath()) "samhan-910-feed-cleanup-test-$runId"
$lockFile = Join-Path $work 'Samhan Internal Chat.exe'
$holder = $null
try {
  New-Item -ItemType Directory -Path $work -Force | Out-Null
  $holder = Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -PassThru -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    "`$stream = [IO.File]::Open('$lockFile', [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None); try { Start-Sleep -Seconds 30 } finally { `$stream.Dispose() }"
  )
  Start-Sleep -Milliseconds 500

  Stop-TrackedProcessAndWait -ProcessId $holder.Id -Description 'locked app process'
  Remove-DirectoryWithRetry -Path $work

  if (Test-Path -LiteralPath $work) {
    throw 'cleanup helper returned before the locked process released its handle.'
  }
  Write-Host 'PASS: process exit is observed before temporary work cleanup.'

  $failureWork = Join-Path ([IO.Path]::GetTempPath()) "samhan-910-feed-cleanup-failure-test-$runId"
  $failureLock = Join-Path $failureWork 'Samhan Internal Chat.exe'
  New-Item -ItemType Directory -Path $failureWork -Force | Out-Null
  $failureHolder = Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -PassThru -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    "`$stream = [IO.File]::Open('$failureLock', [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None); Start-Sleep -Seconds 30"
  )
  try {
    Start-Sleep -Milliseconds 500
    $failedAsExpected = $false
    try { Remove-DirectoryWithRetry -Path $failureWork -MaxAttempts 1 -RetryDelayMilliseconds 0 }
    catch { $failedAsExpected = $true; Write-Host "PASS: genuine cleanup failure remains fatal: $($_.Exception.Message)" }
    if (-not $failedAsExpected) { throw 'cleanup unexpectedly swallowed a genuine locked-file failure.' }
  } finally {
    if ($failureHolder -and -not $failureHolder.HasExited) { Stop-TrackedProcessAndWait -ProcessId $failureHolder.Id -Description 'genuine failure holder' }
    if (Test-Path -LiteralPath $failureWork) { Remove-Item -LiteralPath $failureWork -Recurse -Force -ErrorAction SilentlyContinue }
  }
} finally {
  if ($holder -and -not $holder.HasExited) { Stop-TrackedProcessAndWait -ProcessId $holder.Id -Description 'locked app process' }
  if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
}
