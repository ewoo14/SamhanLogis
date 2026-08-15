$ErrorActionPreference = 'Stop'

$sourceRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('redeploy-credential-test-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path (Join-Path $tempRoot 'scripts/lib') -Force
$null = New-Item -ItemType Directory -Path (Join-Path $tempRoot 'infrastructure') -Force

try {
    Copy-Item (Join-Path $sourceRoot 'scripts/redeploy-service.ps1') (Join-Path $tempRoot 'scripts/redeploy-service.ps1')
    Copy-Item (Join-Path $sourceRoot 'scripts/lib/local-stack-port.ps1') (Join-Path $tempRoot 'scripts/lib')
    Copy-Item (Join-Path $sourceRoot 'infrastructure/docker-compose.yml') (Join-Path $tempRoot 'infrastructure')
    Copy-Item (Join-Path $sourceRoot 'infrastructure/docker-compose.local-all.yml') (Join-Path $tempRoot 'infrastructure')

    $script = Join-Path $tempRoot 'scripts/redeploy-service.ps1'
    function Invoke-Validation {
        param([string]$Content, [switch]$CreateFile)
        $envPath = Join-Path $tempRoot 'infrastructure/.env.local'
        if (Test-Path $envPath) { Remove-Item -LiteralPath $envPath -Force }
        if ($CreateFile) {
            [IO.File]::WriteAllText($envPath, $Content, [Text.UTF8Encoding]::new($false))
        }
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script test-service -ValidateOnly 2>&1 | Out-String
            $exitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        [pscustomobject]@{ Output = $output; ExitCode = $exitCode }
    }

    $missing = Invoke-Validation
    if ($missing.ExitCode -eq 0 -or $missing.Output -notmatch 'infrastructure[\\/]\.env\.local' -or $missing.Output -notmatch 'CREDENTIAL_FILE_MISSING') {
        throw "RED/GREEN contract failed for missing file: $($missing.Output)"
    }

    $empty = Invoke-Validation "SAMHAN_INTERNAL_TOKEN=`nSAMHAN_GATEWAY_ATTESTATION=present" -CreateFile
    if ($empty.ExitCode -eq 0 -or $empty.Output -notmatch 'SAMHAN_INTERNAL_TOKEN' -or $empty.Output -notmatch 'CREDENTIAL_KEY_EMPTY') {
        throw "RED/GREEN contract failed for empty key: $($empty.Output)"
    }

    $valid = Invoke-Validation "SAMHAN_INTERNAL_TOKEN=redacted-test-token`nSAMHAN_GATEWAY_ATTESTATION=redacted-test-attestation" -CreateFile
    if ($valid.ExitCode -ne 0 -or $valid.Output -notmatch 'CREDENTIAL_CHECK_PASS') {
        throw "normal credential validation failed: $($valid.Output)"
    }

    $localCompose = Join-Path $tempRoot 'infrastructure/docker-compose.local-all.yml'
    $composeWithRenamedCredential = (Get-Content -LiteralPath $localCompose -Raw -Encoding UTF8).Replace('SAMHAN_INTERNAL_TOKEN', 'SAMHAN_REDEPLOY_TOKEN')
    [IO.File]::WriteAllText($localCompose, $composeWithRenamedCredential, [Text.UTF8Encoding]::new($false))
    $staleList = Invoke-Validation "SAMHAN_INTERNAL_TOKEN=redacted-old-token`nSAMHAN_GATEWAY_ATTESTATION=redacted-test-attestation" -CreateFile
    if ($staleList.ExitCode -eq 0 -or $staleList.Output -notmatch 'SAMHAN_REDEPLOY_TOKEN' -or $staleList.Output -notmatch 'CREDENTIAL_KEY_EMPTY') {
        throw "stale credential discovery was not detected: $($staleList.Output)"
    }
    Write-Output 'PASS: stale compose credential contract'

    Write-Output 'PASS: redeploy credential gate'
} finally {
    if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
