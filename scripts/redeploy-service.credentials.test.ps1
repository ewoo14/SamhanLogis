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
    $requiredKeys = @(
        'DB_PASSWORD', 'DB_USER', 'GF_SECURITY_ADMIN_PASSWORD', 'GF_SECURITY_ADMIN_USER',
        'MINIO_ROOT_PASSWORD', 'MINIO_ROOT_USER', 'POSTGRES_DB', 'POSTGRES_PASSWORD',
        'POSTGRES_USER', 'RABBIT_PASSWORD', 'RABBIT_USER', 'RABBITMQ_DEFAULT_PASS',
        'RABBITMQ_DEFAULT_USER', 'SAMHAN_AROLOGIS_JWT_SECRET', 'SAMHAN_GATEWAY_ATTESTATION',
        'SAMHAN_INTERNAL_TOKEN', 'SAMHAN_JWT_SECRET', 'SAMHAN_S3_ACCESS_KEY', 'SAMHAN_S3_SECRET_KEY'
    )
    $completeEnv = (($requiredKeys | ForEach-Object { "$_=test-credential" }) -join "`n") + "`n"
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

    $empty = Invoke-Validation ($completeEnv -replace 'DB_PASSWORD=test-credential', 'DB_PASSWORD=') -CreateFile
    if ($empty.ExitCode -eq 0 -or $empty.Output -notmatch 'DB_PASSWORD' -or $empty.Output -notmatch 'CREDENTIAL_KEY_EMPTY') {
        throw "RED/GREEN contract failed for empty key: $($empty.Output)"
    }

    $valid = Invoke-Validation $completeEnv -CreateFile
    if ($valid.ExitCode -ne 0 -or $valid.Output -notmatch 'CREDENTIAL_CHECK_PASS' -or $valid.Output -notmatch '19/19') {
        throw "normal credential validation failed: $($valid.Output)"
    }
    Write-Output $valid.Output.Trim()

    $localCompose = Join-Path $tempRoot 'infrastructure/docker-compose.local-all.yml'
    $baseCompose = Join-Path $tempRoot 'infrastructure/docker-compose.yml'
    $composeWithRenamedCredential = (Get-Content -LiteralPath $baseCompose -Raw -Encoding UTF8).Replace('RABBITMQ_DEFAULT_USER', 'RABBITMQ_REDEPLOY_USER')
    [IO.File]::WriteAllText($baseCompose, $composeWithRenamedCredential, [Text.UTF8Encoding]::new($false))
    $staleList = Invoke-Validation $completeEnv -CreateFile
    if ($staleList.ExitCode -eq 0 -or $staleList.Output -notmatch 'RABBITMQ_REDEPLOY_USER' -or $staleList.Output -notmatch 'CREDENTIAL_KEY_EMPTY') {
        throw "stale credential discovery was not detected: $($staleList.Output)"
    }
    Write-Output 'PASS: stale compose credential contract'

    Write-Output 'PASS: redeploy credential gate'
} finally {
    if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
