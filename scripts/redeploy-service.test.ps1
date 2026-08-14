$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'redeploy-service.ps1'
$bytes = [System.IO.File]::ReadAllBytes($scriptPath)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)

$failures = [System.Collections.Generic.List[string]]::new()
function Assert-Contract([bool] $condition, [string] $message) {
    if (-not $condition) { [void]$failures.Add($message) }
}

Assert-Contract ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) 'redeploy-service.ps1 must be UTF-8 BOM encoded for Windows PowerShell 5.1'
Assert-Contract ($text -match '& docker compose @composeArgs up -d --build --no-deps \$svc') 'deployment must invoke docker compose with compose file arguments'
Assert-Contract ($text -match 'if \(Test-Path \$portfix\)') 'portfix overlay must remain conditional'
Assert-Contract ($text -match '--no-deps') 'deployment must not recreate dependencies'
Assert-Contract ($text -match '\$LASTEXITCODE -ne 0') 'external command failures must be propagated'
Assert-Contract ($text -notmatch '& docker @composeArgs up') 'deployment must not invoke top-level docker with compose arguments'
Assert-Contract ($text -match 'Start-Sleep') 'deployment must wait for service health after recreation'
Assert-Contract ($text -match 'healthy') 'deployment must require a healthy target before success'
Assert-Contract ($text -match 'REDEPLOY_HEALTH_TIMEOUT_SECONDS') 'deployment must have a finite, visible health timeout'
Assert-Contract ($text -match 'healthTimeoutSeconds' -and $text -match 'throw') 'health timeout must fail with a user-visible message'
Assert-Contract ($text -match 'Encoding\]::UTF8.GetString') 'actuator response bytes must be decoded before JSON readiness parsing'

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Output "RED_CONTRACT_FAILED: $_" }
    exit 1
}

Write-Output 'PASS: redeploy service contract'
