function Stop-TrackedProcessAndWait {
  param(
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [Parameter(Mandatory = $true)][string]$Description,
    [int]$TimeoutSeconds = 30
  )

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { return }
  Stop-Process -Id $ProcessId -Force -ErrorAction Stop

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  throw "timed out waiting for $Description (PID $ProcessId) to exit"
}

function Remove-DirectoryWithRetry {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$MaxAttempts = 120,
    [int]$RetryDelayMilliseconds = 1000
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      return
    } catch {
      if ($attempt -eq $MaxAttempts) { throw }
      Start-Sleep -Milliseconds $RetryDelayMilliseconds
    }
  }
}
