[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$guard = Join-Path $repoRoot 'scripts/check-applied-migrations.ps1'
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("flyway-guard-test-" + [guid]::NewGuid().ToString('N'))

function Invoke-Git([string] $WorkingDirectory, [string[]] $Arguments) {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & git -C $WorkingDirectory @Arguments 2>&1
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return @($output)
}

function Assert-ExitCode([string] $Name, [scriptblock] $Action, [int] $Expected) {
    $output = @(& $Action 2>&1)
    $actual = $LASTEXITCODE
    if ($actual -ne $Expected) {
        throw "${Name}: expected exit $Expected, got $actual`n$($output -join [Environment]::NewLine)"
    }
    return $output
}

function New-Fixture {
    New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
    Invoke-Git $fixtureRoot @('init', '-b', 'main') | Out-Null
    Invoke-Git $fixtureRoot @('config', 'user.email', 'test@example.invalid') | Out-Null
    Invoke-Git $fixtureRoot @('config', 'user.name', 'Flyway Guard Test') | Out-Null
    $migration = Join-Path $fixtureRoot 'services/example/src/main/resources/db/migration/V1__initial.sql'
    New-Item -ItemType Directory -Path (Split-Path $migration) -Force | Out-Null
    Set-Content -LiteralPath $migration -Value "CREATE TABLE fixture (id integer);`n" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $fixtureRoot 'README.md') -Value 'fixture' -Encoding UTF8
    Invoke-Git $fixtureRoot @('add', '.') | Out-Null
    Invoke-Git $fixtureRoot @('commit', '-m', 'fixture') | Out-Null
    Invoke-Git $fixtureRoot @('checkout', '-b', 'feature') | Out-Null
}

function Commit-Fixture([string] $Message) {
    Invoke-Git $fixtureRoot @('add', '-A') | Out-Null
    Invoke-Git $fixtureRoot @('commit', '-m', $Message) | Out-Null
}

function Reset-Fixture {
    Invoke-Git $fixtureRoot @('reset', '--hard', 'main') | Out-Null
    Invoke-Git $fixtureRoot @('clean', '-fd') | Out-Null
}

try {
    New-Fixture

    # RED-B: an already-present migration modified, deleted, or renamed must fail.
    Set-Content -LiteralPath (Join-Path $fixtureRoot 'services/example/src/main/resources/db/migration/V1__initial.sql') -Value "-- comment changed`nCREATE TABLE fixture (id integer);`n" -Encoding UTF8
    Commit-Fixture 'modify applied migration'
    $modified = Assert-ExitCode 'modified applied migration' { & $guard -RepoPath $fixtureRoot -BaseRef main } 1
    if (($modified -join "`n") -notmatch 'V1__initial\.sql|Flyway|checksum') { throw "modified migration message was incomplete: $($modified -join "`n")" }
    Reset-Fixture

    Remove-Item -LiteralPath (Join-Path $fixtureRoot 'services/example/src/main/resources/db/migration/V1__initial.sql')
    Commit-Fixture 'delete applied migration'
    $deleted = Assert-ExitCode 'deleted applied migration' { & $guard -RepoPath $fixtureRoot -BaseRef main } 1
    if (($deleted -join "`n") -notmatch 'D.*V1__initial\.sql|V1__initial\.sql') { throw "deleted migration was not reported: $($deleted -join "`n")" }
    Reset-Fixture

    Move-Item -LiteralPath (Join-Path $fixtureRoot 'services/example/src/main/resources/db/migration/V1__initial.sql') -Destination (Join-Path $fixtureRoot 'services/example/src/main/resources/db/migration/V1__renamed.sql')
    Commit-Fixture 'rename applied migration'
    $renamed = Assert-ExitCode 'renamed applied migration' { & $guard -RepoPath $fixtureRoot -BaseRef main } 1
    if (($renamed -join "`n") -notmatch 'R.*V1__initial\.sql|V1__renamed\.sql') { throw "renamed migration was not reported: $($renamed -join "`n")" }
    Reset-Fixture

    # RED-A: a new migration, unrelated change, and the current main state pass.
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'services/example/src/main/resources/db/migration') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $fixtureRoot 'services/example/src/main/resources/db/migration/V2__new.sql') -Value 'CREATE TABLE new_fixture (id integer);' -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $fixtureRoot 'README.md') -Value 'unrelated' -Encoding UTF8
    Commit-Fixture 'new and unrelated changes'
    $allowed = Assert-ExitCode 'new and unrelated changes' { & $guard -RepoPath $fixtureRoot -BaseRef main } 0
    if (($allowed -join "`n") -notmatch 'PASS') { throw "allowed result was not explicit: $($allowed -join "`n")" }

    $current = Assert-ExitCode 'current main state' { & $guard -RepoPath $repoRoot -BaseRef origin/main } 0
    if (($current -join "`n") -notmatch 'PASS') { throw "current main result was not explicit: $($current -join "`n")" }

    Write-Output 'Flyway applied-migration guard scenarios: PASS'
    exit 0
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
