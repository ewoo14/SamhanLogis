[CmdletBinding(SupportsShouldProcess)]
param(
    [string] $EnvFile,
    [string] $Service,
    [string] $RepoPath,
    [string] $PostgresContainer = 'samhan-postgres',
    [string] $Network = 'samhan-net',
    [string] $FlywayImage = 'flyway/flyway:10.10.0'
)

$ErrorActionPreference = 'Stop'
$script:RedactionValues = @()

function Redact-Text([string] $Text) {
    $redacted = $Text
    foreach ($value in $script:RedactionValues) {
        if (-not [string]::IsNullOrEmpty($value)) { $redacted = $redacted.Replace($value, '<redacted>') }
    }
    return $redacted
}

function Redact-Arguments([string[]] $Arguments) { return @($Arguments | ForEach-Object { Redact-Text ([string] $_) }) }

function Read-DotEnv([string] $Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $values }
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
            $value = $Matches[2].Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) { $value = $value.Substring(1, $value.Length - 2) }
            $values[$Matches[1]] = $value
        }
    }
    return $values
}

function Invoke-Docker([string[]] $Arguments, [switch] $AllowFailure) {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $output = & docker @Arguments 2>&1; $exitCode = $LASTEXITCODE } finally { $ErrorActionPreference = $previousErrorAction }
    $redactedOutput = @($output | ForEach-Object { Redact-Text ([string] $_) })
    if (-not $AllowFailure -and $exitCode -ne 0) { throw "docker $((Redact-Arguments $Arguments) -join ' ') failed with exit code $exitCode`n$($redactedOutput -join [Environment]::NewLine)" }
    return [pscustomobject]@{ ExitCode = $exitCode; Output = $redactedOutput }
}

$repoRoot = if ($RepoPath) { (Resolve-Path -LiteralPath $RepoPath).Path } else { Split-Path -Parent $PSScriptRoot }
$infraRoot = Join-Path $repoRoot 'infrastructure'
$composeWorkDir = $null
if (-not $EnvFile) {
    $composeInspect = Invoke-Docker @('inspect', 'samhan-auth-service', '--format', '{{index .Config.Labels "com.docker.compose.project.working_dir"}}') -AllowFailure
    if ($composeInspect.ExitCode -eq 0) {
        $composeCandidate = $composeInspect.Output | Where-Object { [string] $_ -match '^(?:[A-Za-z]:[\\/]|/)' } | Select-Object -First 1
        if ($composeCandidate) { $composeWorkDir = [string] $composeCandidate }
    }
}
$candidateEnvFiles = @()
if ($EnvFile) { $candidateEnvFiles += (Resolve-Path -LiteralPath $EnvFile).Path }
if ($composeWorkDir) { $candidateEnvFiles += (Join-Path $composeWorkDir '.env'); $candidateEnvFiles += (Join-Path $composeWorkDir '.env.local') }
$candidateEnvFiles += (Join-Path $infraRoot '.env'); $candidateEnvFiles += (Join-Path $infraRoot '.env.local')
$envPath = $candidateEnvFiles | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $envPath) { throw "Environment file not found. Checked: $($candidateEnvFiles -join ', ')" }
$envValues = Read-DotEnv $envPath
Write-Output "Environment file: $envPath"

$dbUser = if ($envValues.ContainsKey('POSTGRES_USER')) { $envValues['POSTGRES_USER'] } else { 'samhan' }
$dbPassword = $null
foreach ($key in @('POSTGRES_PASSWORD', 'DB_PASSWORD')) { if ($envValues.ContainsKey($key) -and $envValues[$key]) { $dbPassword = $envValues[$key]; break } }
if (-not $dbPassword) {
    $postgresEnv = (Invoke-Docker @('inspect', $PostgresContainer, '--format', '{{range .Config.Env}}{{println .}}{{end}}')).Output
    $passwordLine = $postgresEnv | Where-Object { $_ -like 'POSTGRES_PASSWORD=*' } | Select-Object -First 1
    if ($passwordLine) { $dbPassword = ($passwordLine -split '=', 2)[1] }
}
if (-not $dbPassword) { throw 'Database password was not provided by the environment file or running Postgres container.' }
$script:RedactionValues = @($dbPassword)

$targetDefinitions = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'services') -Directory | ForEach-Object {
    $location = Join-Path $_.FullName 'src/main/resources/db/migration'
    if (Test-Path -LiteralPath $location -PathType Container) {
        ,@($_.Name, (($_.Name -replace '-', '_') + '_db'), $location)
    }
})
$targets = @($targetDefinitions | Where-Object { -not $Service -or $_[0] -eq $Service } | ForEach-Object {
    [pscustomobject]@{ Name = $_[0]; Database = $_[1]; Location = $_[2] }
})
if ($targets.Count -eq 0) { throw "Unknown service target: $Service" }

foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target.Location)) { throw "Migration location not found: $($target.Location)" }
    $jdbcUrl = "jdbc:postgresql://postgres:5432/$($target.Database)"
    $credentialFile = [System.IO.Path]::GetTempFileName()
    try {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($credentialFile, "FLYWAY_URL=$jdbcUrl`nFLYWAY_USER=$dbUser`nFLYWAY_PASSWORD=$dbPassword`n", $utf8NoBom)
        $common = @('run', '--rm', '--network', $Network, '--env-file', $credentialFile, '-v', "$($target.Location):/flyway/sql:ro", $FlywayImage)
        $validate = Invoke-Docker ($common + @('validate')) -AllowFailure
        $mismatchLines = @($validate.Output | Where-Object { $_ -match 'Migration checksum mismatch for migration version' })
        $versions = @($mismatchLines | ForEach-Object { if ($_ -match 'version\s+([0-9.]+)') { $Matches[1] } })
        $validateText = $validate.Output -join [Environment]::NewLine
        $unexpectedLines = @($validate.Output | Where-Object {
            $line = [string] $_
            if ([string]::IsNullOrWhiteSpace($line)) { return $false }
            return $line -notmatch '(?i)^\s*(?:ERROR:\s*)?Validate failed:.*$' -and
                $line -notmatch '(?i)^\s*Migration checksum mismatch for migration version\s+[0-9.]+' -and
                $line -notmatch '(?i)^\s*-\s*(Applied to database|Resolved locally)\s*:'
        })
        if ($unexpectedLines.Count -gt 0 -or ($validate.ExitCode -ne 0 -and $mismatchLines.Count -eq 0)) { throw "$($target.Name) validate failed for a reason other than a checksum mismatch:`n$validateText" }
        $displayVersions = if ($versions.Count) { $versions -join ', ' } else { '(none)' }
        Write-Output "$($target.Name): checksum mismatch versions = $displayVersions"
        if ($versions.Count -gt 0 -and $PSCmdlet.ShouldProcess($target.Name, 'Flyway repair (checksum metadata only)')) {
            $repair = Invoke-Docker ($common + @('repair'))
            Write-Output "$($target.Name): repair completed"
            $repair.Output | Where-Object { $_ -match 'Successfully repaired|Repair of' } | ForEach-Object { Write-Output $_ }
        }
    } finally {
        if (Test-Path -LiteralPath $credentialFile) { Remove-Item -LiteralPath $credentialFile -Force -Confirm:$false -WhatIf:$false }
    }
}
