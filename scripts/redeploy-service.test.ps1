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
Assert-Contract ($text -match '\$portfixFiles' -and $text -match 'SilentlyContinue') 'portfix overlay discovery must remain conditional'
Assert-Contract ($text -match 'Get-ChildItem' -and $text -match 'docker-compose\.\*-port-override\.yml') 'portfix overlays must be discovered from existing override files'
Assert-Contract ($text -notmatch 'docker-compose\.local-portfix\.yml') 'deployment must not depend on the removed local-portfix filename'
Assert-Contract ($text -match '--no-deps') 'deployment must not recreate dependencies'
Assert-Contract ($text -match '\$LASTEXITCODE -ne 0') 'external command failures must be propagated'
Assert-Contract ($text -notmatch '& docker @composeArgs up') 'deployment must not invoke top-level docker with compose arguments'
Assert-Contract ($text -match 'Start-Sleep') 'deployment must wait for service health after recreation'
Assert-Contract ($text -match 'healthy') 'deployment must require a healthy target before success'
Assert-Contract ($text -match 'REDEPLOY_HEALTH_TIMEOUT_SECONDS') 'deployment must have a finite, visible health timeout'
Assert-Contract ($text -match 'healthTimeoutSeconds' -and $text -match 'throw') 'health timeout must fail with a user-visible message'
Assert-Contract ($text -match 'Encoding\]::UTF8.GetString') 'actuator response bytes must be decoded before JSON readiness parsing'
Assert-Contract ($text -match 'Get-ComposeHealthTimeoutSeconds' -and $text -match '475s') 'default health timeout must cover the measured compose failure horizon'
Assert-Contract ($text -match 'start_period' -and $text -match 'retries' -and $text -match 'interval' -and $text -match 'timeout') 'default health timeout must document all compose healthcheck inputs'
Assert-Contract ($text -match 'interval[^\r\n]*timeout|timeout[^\r\n]*interval') 'compose health horizon calculation must include probe timeout alongside interval'
Assert-Contract ($text -match 'Get-RequiredComposeEnvNames') 'redeploy must derive required credentials from compose references'
Assert-Contract ($text -match '\\\$\\\{\(\?<name>\[A-Za-z_\]') 'compose credential discovery must parse variable names generically'
Assert-Contract ($text -match 'StrictRequiredCount' -and $text -match 'DerivedCount') 'compose credential discovery must compare strict and derived counts'
Assert-Contract ($text -notmatch 'SAMHAN_INTERNAL_TOKEN\s*=|SAMHAN_GATEWAY_ATTESTATION\s*=') 'credential names must not be maintained as a script assignment list'
Assert-Contract ($text -match 'infrastructure/.env.local') 'credential failure guidance must name the local env file'
Assert-Contract ($text -match 'CREDENTIAL_FILE_MISSING') 'missing credential file must be distinguished from empty keys'
Assert-Contract ($text -match 'CREDENTIAL_KEY_EMPTY') 'empty credential keys must be reported distinctly'
Assert-Contract ($text -match 'ValidateOnly') 'credential validation must be independently testable without redeploying'

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Output "RED_CONTRACT_FAILED: $_" }
    exit 1
}

Write-Output 'PASS: redeploy service contract'
