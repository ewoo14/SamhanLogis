[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
    $script = Join-Path $repoRoot 'scripts/repair-flyway-checksums.ps1'
    $flywayOutputFixture = Join-Path $repoRoot 'scripts/fixtures/flyway-validate-checksum-mismatch.txt'
    $flywayOutput = Get-Content -LiteralPath $flywayOutputFixture -Raw -Encoding UTF8
    if ($flywayOutput -notmatch 'Flyway OSS Edition 10\.10\.0' -or $flywayOutput -notmatch 'Migration checksum mismatch for migration version 1' -or $flywayOutput -notmatch 'Applied to database : 123') { throw 'captured Flyway validate output fixture is incomplete' }
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("flyway-repair-test-" + [guid]::NewGuid().ToString('N'))
$fakeBin = Join-Path $fixtureRoot 'bin'
$fakeDocker = Join-Path $fakeBin 'docker.cmd'
$dockerArgsLog = Join-Path $fixtureRoot 'docker-args.log'
$modeFile = Join-Path $fixtureRoot 'mode.txt'
$secret = 'test-' + [guid]::NewGuid().ToString('N')
$normalFixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("flyway-repair-normal-test-" + [guid]::NewGuid().ToString('N'))
    $normalServices = @(
    'accounting-service', 'arologis-service', 'auth-service', 'dashboard-service',
    'dc-config-service', 'groupware-service', 'inventory-service', 'notification-service',
    'partner-auth-service', 'partner-order-service', 'partner-service', 'product-service',
    'slip-service', 'user-service'
    )
    $gitBaselineMigration = 'services/dashboard-service/src/main/resources/db/migration/V1__init_dashboard.sql'
    $gitBaselineMigrationSource = Join-Path $repoRoot $gitBaselineMigration
    $authMigration = 'services/auth-service/src/main/resources/db/migration/V10__sp_d4_remaining_domains_page_permissions.sql'
    $authMigrationSource = Join-Path $repoRoot $authMigration
    $migrationRoot = Join-Path $fixtureRoot 'migration-root'

try {
    New-Item -ItemType Directory -Path $fakeBin -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'infrastructure') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'services/auth-service/src/main/resources/db/migration') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'services/arologis-service/src/main/resources/db/migration') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'services/new-service/src/main/resources/db/migration') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'services/dashboard-service/src/main/resources') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $migrationRoot 'services/dashboard-service/src/main/resources/db/migration') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $migrationRoot 'services/auth-service/src/main/resources/db/migration') -Force | Out-Null
    Copy-Item -LiteralPath $gitBaselineMigrationSource -Destination (Join-Path $migrationRoot $gitBaselineMigration) -Force
    Copy-Item -LiteralPath $authMigrationSource -Destination (Join-Path $migrationRoot $authMigration) -Force
    Copy-Item -LiteralPath $authMigrationSource -Destination (Join-Path $fixtureRoot $authMigration) -Force
    New-Item -ItemType Directory -Path (Join-Path $normalFixtureRoot 'infrastructure') -Force | Out-Null
    foreach ($normalService in $normalServices) {
        New-Item -ItemType Directory -Path (Join-Path $normalFixtureRoot "services/$normalService/src/main/resources/db/migration") -Force | Out-Null
    }
    New-Item -ItemType Directory -Path (Join-Path $normalFixtureRoot 'services/api-gateway') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $fixtureRoot 'infrastructure/.env') -Value "POSTGRES_USER=samhan`nPOSTGRES_PASSWORD=$secret`n" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $normalFixtureRoot 'infrastructure/.env') -Value "POSTGRES_USER=samhan`nPOSTGRES_PASSWORD=$secret`n" -Encoding UTF8
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
if "%FAKE_DOCKER_MODE%"=="inspect-env" (
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
  echo Migration checksum mismatch for migration version 10 1>&2
  echo -^> Applied to database : -670111044 1>&2
  echo -^> Resolved locally    : 400076994 1>&2
  echo Either revert the changes to the migration, or run repair to update the schema history. 1>&2
  echo Need more flexibility with validation rules? Learn more: https://rd.gt/3AbJUZE 1>&2
  exit /b 1
)
findstr /l /x /c:"checksum-mismatch-real" "$modeFile" >nul
if not errorlevel 1 (
  echo WARNING: Storing migrations in 'sql' is not recommended and default scanning of this location may be deprecated in a future release 1>&2
  echo WARNING: This version of Flyway is out of date. Upgrade to Flyway 13.2.0: https://rd.gt/3rXiSlV 1>&2
  echo Flyway OSS Edition 10.10.0 by Redgate 1>&2
  echo See release notes here: https://rd.gt/416ObMi 1>&2
  echo Database: jdbc:postgresql://127.0.0.1:5432/auth_db (PostgreSQL 16.13) 1>&2
  echo ERROR: Validate failed: Migrations have failed validation 1>&2
  echo Migration checksum mismatch for migration version 1 1>&2
  echo -^> Applied to database : 123 1>&2
  echo -^> Resolved locally    : 906221903 1>&2
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
echo Migration checksum mismatch for migration version 10 1>&2
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

        if (Test-Path -LiteralPath $dockerArgsLog) { Remove-Item -LiteralPath $dockerArgsLog -Force }
        Set-Content -LiteralPath $modeFile -Value 'checksum-mismatch' -NoNewline -Encoding ASCII
        try { $preview = @(& $script -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -Service 'auth-service' -PostgresContainer 'unused' -WhatIf 2>&1) } catch { $preview = @($_) }
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
        try { $normalCommitted = @(& $script -RepoPath $repoRoot -MigrationRoot $migrationRoot -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -Service auth-service -PostgresContainer 'unused' -WhatIf 2>&1) } catch { $normalCommitted = @($_) }
        if ($LASTEXITCODE -ne 0) { throw "committed migration repair preview failed: $($normalCommitted -join "`n")" }
        $normalCommittedText = $normalCommitted -join "`n"
        Write-Output "RED-A raw output:`n$normalCommittedText"
        if ($normalCommittedText -notmatch 'What if|repair') { throw "committed migration did not reach repair preview: $normalCommittedText" }

        Set-Content -LiteralPath (Join-Path $migrationRoot $authMigration) -Value "-- uncommitted destruction`n" -Encoding UTF8
        try { $uncommittedDamage = @(& $script -RepoPath $repoRoot -MigrationRoot $migrationRoot -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -Service auth-service -PostgresContainer 'unused' -DockerCommand $fakeDocker -WhatIf 2>&1) } catch { $uncommittedDamage = @($_) }
        $uncommittedDamageText = $uncommittedDamage -join "`n"
        Write-Output "RED-B raw output:`n$uncommittedDamageText"
        if ($uncommittedDamageText -notmatch 'working tree|commit|baseline|mismatch') { throw "uncommitted migration damage was not rejected with baseline evidence: $uncommittedDamageText" }

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
        Set-Content -LiteralPath $modeFile -Value 'checksum-mismatch' -NoNewline -Encoding ASCII
        try { $omissionGuard = @(& $script -RepoPath $fixtureRoot -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -PostgresContainer 'unused' -DockerCommand $fakeDocker -WhatIf 2>&1) } catch { $omissionGuard = @($_) }
        $omissionText = $omissionGuard -join "`n"
        $omissionFailure = @()
        if ($omissionText -notmatch 'new-service.*(?:unmapped|no database mapping)|(?:unmapped|no database mapping).*new-service') { $omissionFailure += "unmapped service omission was not diagnosed: $omissionText" }
        if ($omissionText -notmatch 'dashboard-service.*migration|migration.*dashboard-service') { $omissionFailure += "missing migration directory omission was not diagnosed: $omissionText" }
        Write-Output "RED-A raw output:`n$omissionText"

        try { $explicitUnmapped = @(& $script -RepoPath $fixtureRoot -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -Service new-service -PostgresContainer 'unused' -DockerCommand $fakeDocker -WhatIf 2>&1) } catch { $explicitUnmapped = @($_) }
        if (($explicitUnmapped -join "`n") -notmatch 'new-service.*no database mapping') { throw "explicit unmapped service was not diagnosed: $($explicitUnmapped -join "`n")" }
        try { $explicitMissing = @(& $script -RepoPath $fixtureRoot -EnvFile (Join-Path $fixtureRoot 'infrastructure/.env') -Service dashboard-service -PostgresContainer 'unused' -DockerCommand $fakeDocker -WhatIf 2>&1) } catch { $explicitMissing = @($_) }
        if (($explicitMissing -join "`n") -notmatch 'dashboard-service.*migration directory not found') { throw "explicit missing migration directory was not diagnosed: $($explicitMissing -join "`n")" }

        if (Test-Path -LiteralPath $dockerArgsLog) { Remove-Item -LiteralPath $dockerArgsLog -Force }
        Set-Content -LiteralPath $modeFile -Value 'inspect-env' -NoNewline -Encoding ASCII
        $normalRun = @(& $script -RepoPath $normalFixtureRoot -EnvFile (Join-Path $normalFixtureRoot 'infrastructure/.env') -PostgresContainer 'unused' -DockerCommand $fakeDocker -WhatIf 2>&1)
        if ($LASTEXITCODE -ne 0) { throw "14-service normal execution failed with exit code $LASTEXITCODE`: $($normalRun -join "`n")" }
        if (($normalRun -join "`n") -notmatch 'accounting-service|user-service') { throw "14-service normal execution did not process expected targets: $($normalRun -join "`n")" }
        Write-Output "RED-B raw output:`n$($normalRun -join "`n")"
        if ($omissionFailure.Count -gt 0) { throw ($omissionFailure -join "`n") }

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
    if (Test-Path -LiteralPath $normalFixtureRoot) { Remove-Item -LiteralPath $normalFixtureRoot -Recurse -Force }
}
