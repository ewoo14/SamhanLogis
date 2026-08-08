[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$script = Join-Path $repoRoot 'scripts/repair-flyway-checksums.ps1'
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("flyway-repair-test-" + [guid]::NewGuid().ToString('N'))
$fakeBin = Join-Path $fixtureRoot 'bin'
$fakeDocker = Join-Path $fakeBin 'docker.cmd'
$dockerArgsLog = Join-Path $fixtureRoot 'docker-args.log'
$modeFile = Join-Path $fixtureRoot 'mode.txt'
$secret = 'test-' + [guid]::NewGuid().ToString('N')

try {
    New-Item -ItemType Directory -Path $fakeBin -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'infrastructure') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'services/auth-service/src/main/resources/db/migration') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'services/arologis-service/src/main/resources/db/migration') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'services/new-service/src/main/resources/db/migration') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'services/no-migration-service/src/main/resources') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $fixtureRoot 'infrastructure/.env') -Value "POSTGRES_USER=samhan`nPOSTGRES_PASSWORD=$secret`n" -Encoding UTF8
    $composeJsonPath = ((Join-Path $fixtureRoot 'infrastructure') -replace '\\', '/')
    Set-Content -LiteralPath $fakeDocker -Value @"
@echo off
set /p FAKE_DOCKER_MODE=<"$modeFile"
echo %*>>"$dockerArgsLog"
if "%FAKE_DOCKER_MODE%"=="inspect-env" echo %* | findstr /b /c:"inspect " >nul
if "%FAKE_DOCKER_MODE%"=="inspect-env" if not errorlevel 1 (
  echo [{"Config":{"Labels":{"com.docker.compose.project.working_dir":"$composeJsonPath"}}}]
  exit /b 0
)
if "%FAKE_DOCKER_MODE%"=="inspect-missing" echo Error: No such object: samhan-auth-service 1>&2
if "%FAKE_DOCKER_MODE%"=="inspect-missing" echo %* | findstr /b /c:"inspect " >nul
if "%FAKE_DOCKER_MODE%"=="inspect-missing" if not errorlevel 1 (
  exit /b 1
)
if "%FAKE_DOCKER_MODE%"=="checksum-mismatch-multiline" (
  echo WARNING: Storing migrations in 'sql' is not recommended and default scanning of this location may be deprecated in a future release 1>&2
  echo WARNING: This version of Flyway is out of date. Upgrade to Flyway 13.2.0: https://rd.gt/3rXiSlV 1>&2
  echo Flyway OSS Edition 10.10.0 by Redgate 1>&2
  echo See release notes here: https://rd.gt/416ObMi 1>&2
  echo Database: jdbc:postgresql://postgres:5432/auth_db (PostgreSQL 16.14) 1>&2
  echo ERROR: Validate failed: Migrations have failed validation 1>&2
  echo Migration checksum mismatch for migration version 1 1>&2
  echo -^> Applied to database : -670111044 1>&2
  echo -^> Resolved locally    : 400076994 1>&2
  echo Either revert the changes to the migration, or run repair to update the schema history. 1>&2
  echo Need more flexibility with validation rules? Learn more: https://rd.gt/3AbJUZE 1>&2
  exit /b 1
)
if "%FAKE_DOCKER_MODE%"=="auth-failure" (
  echo fake Flyway validate failed: authentication rejected 1>&2
  exit /b 17
)
if "%FAKE_DOCKER_MODE%"=="mixed-validate-errors" (
  echo Migration checksum mismatch for migration version 1 1>&2
  echo Detected failed migration version 2 1>&2
  exit /b 1
)
echo %* | findstr /c:" repair" >nul
if not errorlevel 1 (
  echo Successfully repaired migration metadata
  exit /b 0
)
echo Migration checksum mismatch for migration version 1 1>&2
exit /b 1
"@ -Encoding ASCII

    $oldPath = $env:PATH
    $env:PATH = "$fakeBin;$oldPath"
    $oldDockerCommand = $env:FLYWAY_REPAIR_DOCKER_COMMAND
    $env:FLYWAY_REPAIR_DOCKER_COMMAND = $fakeDocker
    try {
        Set-Content -LiteralPath $modeFile -Value 'mixed-validate-errors' -NoNewline -Encoding ASCII
        try {
            $output = @(& $script -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -Service 'auth-service' -PostgresContainer 'unused' -DockerCommand $fakeDocker -WhatIf 2>&1)
        } catch {
            $output = @($_)
        }
        $LASTEXITCODE = 0
        $text = $output -join "`n"
        if ($text -match [regex]::Escape($secret)) { throw "plaintext credential leaked in failure output: $text" }
        if ($text -notmatch 'checksum mismatch|Detected failed migration|validate failed') { throw "useful failure cause was lost: $text" }
        $args = Get-Content -LiteralPath $dockerArgsLog -Raw
        if ($args -match [regex]::Escape($secret)) { throw "plaintext credential leaked in docker process arguments: $args" }
        if ($args -notmatch '--env-file') { throw "repair did not pass an env-file to Docker: $args" }
        if ($args -match 'FLYWAY_PASSWORD=') { throw "repair still passes FLYWAY_PASSWORD as a process argument: $args" }
        $envFileArg = [regex]::Match($args, '--env-file\s+([^\s]+)').Groups[1].Value
        if ($envFileArg -and (Test-Path -LiteralPath $envFileArg)) { throw "temporary credential file was not removed after failure: $envFileArg" }

        Remove-Item -LiteralPath $dockerArgsLog -Force
        Set-Content -LiteralPath $modeFile -Value 'checksum-mismatch' -NoNewline -Encoding ASCII
        $preview = @(& $script -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -Service 'auth-service' -PostgresContainer 'unused' -WhatIf 2>&1)
        $LASTEXITCODE = 0
        $previewText = $preview -join "`n"
        if ($previewText -notmatch 'checksum mismatch|What if') { throw "useful preview result was lost: $previewText" }
        $previewArgs = Get-Content -LiteralPath $dockerArgsLog -Raw
        $previewEnvFile = [regex]::Match($previewArgs, '--env-file\s+([^\s]+)').Groups[1].Value
        if ($previewEnvFile -and (Test-Path -LiteralPath $previewEnvFile)) { throw "temporary credential file was not removed after preview: $previewEnvFile" }

        Remove-Item -LiteralPath $dockerArgsLog -Force
        Set-Content -LiteralPath $modeFile -Value 'inspect-missing' -NoNewline -Encoding ASCII
        try {
            $missingEnv = @(& $script -PostgresContainer 'unused' 2>&1)
        } catch {
            $missingEnv = @($_)
        }
        $missingEnvText = $missingEnv -join "`n"
        if ($missingEnvText -notmatch 'Environment file not found|Checked') { throw "missing env failure did not explain checked paths: $missingEnvText" }

        Remove-Item -LiteralPath $dockerArgsLog -Force
        Set-Content -LiteralPath $modeFile -Value 'inspect-env' -NoNewline -Encoding ASCII
        $discovered = @(& $script -PostgresContainer 'unused' -WhatIf 2>&1)
        $discoveredText = $discovered -join "`n"
        if ($discoveredText -notmatch [regex]::Escape((Join-Path $fixtureRoot 'infrastructure/.env'))) { throw "default env discovery did not use Compose working_dir: $discoveredText" }

        Remove-Item -LiteralPath $dockerArgsLog -Force
        Set-Content -LiteralPath $modeFile -Value 'mixed-validate-errors' -NoNewline -Encoding ASCII
        try {
            $mixed = @(& $script -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -Service auth-service -PostgresContainer 'unused' -DockerCommand $fakeDocker 2>&1)
        } catch {
            $mixed = @($_)
        }
        $mixedText = $mixed -join "`n"
        $mixedArgs = if (Test-Path -LiteralPath $dockerArgsLog) { Get-Content -LiteralPath $dockerArgsLog -Raw } else { '' }
        if ($mixedText -notmatch 'checksum mismatch|Detected failed migration|validate') { throw "mixed validate failure cause was not reported: $mixedText" }


        Remove-Item -LiteralPath $dockerArgsLog -Force
        Set-Content -LiteralPath $modeFile -Value 'checksum-mismatch-multiline' -NoNewline -Encoding ASCII
        $multiline = @(& $script -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -Service auth-service -PostgresContainer 'unused' -DockerCommand $fakeDocker -WhatIf 2>&1)
        $multilineText = $multiline -join "`n"
        if ($multilineText -notmatch 'checksum mismatch|What if') { throw "checksum-only multiline output did not reach repair preview: $multilineText" }

        Remove-Item -LiteralPath $dockerArgsLog -Force
        Set-Content -LiteralPath $modeFile -Value 'checksum-mismatch-multiline' -NoNewline -Encoding ASCII
        $mapped = @(& $script -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -Service auth-service -PostgresContainer 'unused' -DockerCommand $fakeDocker -WhatIf 2>&1)
        $mappedText = $mapped -join "`n"
        $mappedArgs = Get-Content -LiteralPath $dockerArgsLog -Raw
        if ($mappedText -notmatch 'checksum mismatch|What if') { throw "auth DB mapping did not reach checksum repair preview: $mappedText" }
        $source = Get-Content -LiteralPath $script -Raw -Encoding UTF8
        if ($source -notmatch "'auth-service'\s*=\s*'auth_db'") { throw 'auth-service DB mapping is missing' }
        if ($source -match '\$\(_\.Name -replace') { throw 'legacy service-derived database calculation remains' }

        Remove-Item -LiteralPath $dockerArgsLog -Force
        Set-Content -LiteralPath $modeFile -Value 'repair-success' -NoNewline -Encoding ASCII
        try { $newService = @(& $script -RepoPath $fixtureRoot -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -Service new-service -PostgresContainer 'unused' -DockerCommand $fakeDocker -WhatIf 2>&1) } catch { $newService = @($_) }
        $newServiceText = $newService -join "`n"
        if ($newServiceText -notmatch 'Unknown service target|new-service') { throw "unmapped service was not rejected fail-closed: $newServiceText" }
        try {
            $noMigration = @(& $script -RepoPath $fixtureRoot -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -Service no-migration-service -PostgresContainer 'unused' -DockerCommand $fakeDocker -WhatIf 2>&1)
        } catch {
            $noMigration = @($_)
        }
        if (($noMigration -join "`n") -notmatch 'Unknown service target') { throw "service without migrations was not excluded: $($noMigration -join "`n")" }

        $source = Get-Content -LiteralPath $script -Raw -Encoding UTF8
        if ($source -notmatch "common \+ @\('repair'\)") { throw 'repair command path was removed' }
        Write-Output 'Flyway repair credential scenarios: PASS'
        exit 0
    } finally {
        $env:FLYWAY_REPAIR_DOCKER_COMMAND = $oldDockerCommand
        $env:PATH = $oldPath
    }
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
