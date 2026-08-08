[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$script = Join-Path $repoRoot 'scripts/repair-flyway-checksums.ps1'
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("flyway-repair-test-" + [guid]::NewGuid().ToString('N'))
$fakeBin = Join-Path $fixtureRoot 'bin'
$fakeDocker = Join-Path $fakeBin 'docker.cmd'
$dockerArgsLog = Join-Path $fixtureRoot 'docker-args.log'
$secret = 'test-' + [guid]::NewGuid().ToString('N')

try {
    New-Item -ItemType Directory -Path $fakeBin -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'infrastructure') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'services/auth-service/src/main/resources/db/migration') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'services/arologis-service/src/main/resources/db/migration') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $fixtureRoot 'infrastructure/.env') -Value "POSTGRES_USER=samhan`nPOSTGRES_PASSWORD=$secret`n" -Encoding UTF8
    Set-Content -LiteralPath $fakeDocker -Value @"
@echo off
echo %*>>"$dockerArgsLog"
if "%FAKE_DOCKER_MODE%"=="auth-failure" (
  echo fake Flyway validate failed: authentication rejected 1>&2
  exit /b 17
)
echo %* | findstr /c:" repair" >nul
if "%FAKE_DOCKER_MODE%"=="repair-success" if not errorlevel 1 (
  echo Successfully repaired migration metadata
  exit /b 0
)
echo Migration checksum mismatch for migration version 1 1>&2
exit /b 1
"@ -Encoding ASCII

    $oldPath = $env:PATH
    $env:PATH = "$fakeBin;$oldPath"
    try {
        $env:FAKE_DOCKER_MODE = 'auth-failure'
        try {
            $output = @(& $script -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -PostgresContainer 'unused' -WhatIf 2>&1)
        } catch {
            $output = @($_)
        }
        $LASTEXITCODE = 0
        $text = $output -join "`n"
        if ($text -match [regex]::Escape($secret)) { throw "plaintext credential leaked in failure output: $text" }
        if ($text -notmatch 'authentication rejected|validate failed') { throw "useful failure cause was lost: $text" }
        $args = Get-Content -LiteralPath $dockerArgsLog -Raw
        if ($args -match [regex]::Escape($secret)) { throw "plaintext credential leaked in docker process arguments: $args" }
        if ($args -notmatch '--env-file') { throw "repair did not pass an env-file to Docker: $args" }
        if ($args -match 'FLYWAY_PASSWORD=') { throw "repair still passes FLYWAY_PASSWORD as a process argument: $args" }
        $envFileArg = [regex]::Match($args, '--env-file\s+([^\s]+)').Groups[1].Value
        if ($envFileArg -and (Test-Path -LiteralPath $envFileArg)) { throw "temporary credential file was not removed after failure: $envFileArg" }

        Remove-Item -LiteralPath $dockerArgsLog -Force
        $env:FAKE_DOCKER_MODE = 'checksum-mismatch'
        $preview = @(& $script -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -PostgresContainer 'unused' -WhatIf 2>&1)
        $LASTEXITCODE = 0
        $previewText = $preview -join "`n"
        if ($previewText -notmatch 'checksum mismatch|What if') { throw "useful preview result was lost: $previewText" }
        $previewArgs = Get-Content -LiteralPath $dockerArgsLog -Raw
        $previewEnvFile = [regex]::Match($previewArgs, '--env-file\s+([^\s]+)').Groups[1].Value
        if ($previewEnvFile -and (Test-Path -LiteralPath $previewEnvFile)) { throw "temporary credential file was not removed after preview: $previewEnvFile" }

        Remove-Item -LiteralPath $dockerArgsLog -Force
        $env:FAKE_DOCKER_MODE = 'repair-success'
        $repair = @(& $script -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -PostgresContainer 'unused' 2>&1)
        $LASTEXITCODE = 0
        $repairText = $repair -join "`n"
        if ($repairText -notmatch 'repair completed|Successfully repaired') { throw "repair command did not complete: $repairText" }
        $repairArgs = Get-Content -LiteralPath $dockerArgsLog -Raw
        if ($repairArgs -notmatch '\brepair\b') { throw "repair command was not executed: $repairArgs" }
        if ($repairArgs -match [regex]::Escape($secret)) { throw "plaintext credential leaked during repair: $repairArgs" }
        $source = Get-Content -LiteralPath $script -Raw -Encoding UTF8
        if ($source -notmatch "common \+ @\('repair'\)") { throw 'repair command path was removed' }
        Write-Output 'Flyway repair credential scenarios: PASS'
        exit 0
    } finally {
        $env:PATH = $oldPath
    }
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
