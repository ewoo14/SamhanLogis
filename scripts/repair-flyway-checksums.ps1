[CmdletBinding(SupportsShouldProcess)]
param(
    [string] $EnvFile,
    [string] $Service,
    [string] $RepoPath,
    [string] $MigrationRoot,
    [string] $PostgresContainer = 'samhan-postgres',
    [string] $Network = 'samhan-net',
    [string] $FlywayImage = 'flyway/flyway:10.10.0',
    [string] $DockerCommand = $(if ($env:FLYWAY_REPAIR_DOCKER_COMMAND) { $env:FLYWAY_REPAIR_DOCKER_COMMAND } else { 'docker' })
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

function Get-GitOutput([string[]] $Arguments) {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $output = & git -C $repoRoot @Arguments 2>$null } finally { $ErrorActionPreference = $previousErrorAction }
    if ($LASTEXITCODE -ne 0) { return $null }
    return ([string]($output -join [Environment]::NewLine)).Trim()
}

function Get-RepositoryRelativePath([string] $Path) {
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $root = $migrationRoot.TrimEnd('\') + '\'
    if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
    return $fullPath.Substring($root.Length).Replace('\', '/')
}

function Get-MigrationBaselineIssues([string] $Location, [string[]] $Versions) {
    $issues = @()
    foreach ($version in $Versions) {
        $files = @(Get-ChildItem -LiteralPath $Location -Filter "V${version}__*.sql" -File -ErrorAction SilentlyContinue)
        if ($files.Count -eq 0) {
            $issues += "V${version}: 작업 트리 파일 없음 또는 저장소 대응 파일 없음 ($Location)"
            continue
        }
        foreach ($file in $files) {
            $relative = Get-RepositoryRelativePath $file.FullName
            if (-not $relative) {
                $issues += "$($file.FullName): 작업 트리 파일이 저장소 기준 경로 밖입니다"
                continue
            }
            $committedBlob = Get-GitOutput @('rev-parse', "HEAD:$relative")
            $workingBlob = Get-GitOutput @('hash-object', '--', $file.FullName)
            if (-not $committedBlob) {
                $issues += "${relative}: 커밋 원본 없음 (untracked 또는 현재 HEAD에 없음)"
            } elseif (-not $workingBlob) {
                $issues += "${relative}: 작업 트리 파일을 읽을 수 없음"
            } elseif ($committedBlob -ne $workingBlob) {
                $issues += "${relative}: 작업 트리 내용이 현재 HEAD 커밋 원본과 불일치 (HEAD=$committedBlob, working-tree=$workingBlob)"
            }
        }
    }
    return $issues
}

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
    try { $output = & $DockerCommand @Arguments 2>&1; $exitCode = $LASTEXITCODE } finally { $ErrorActionPreference = $previousErrorAction }
    $redactedOutput = @($output | ForEach-Object { Redact-Text ([string] $_) })
    if (-not $AllowFailure -and $exitCode -ne 0) { throw "docker $((Redact-Arguments $Arguments) -join ' ') failed with exit code $exitCode`n$($redactedOutput -join [Environment]::NewLine)" }
    return [pscustomobject]@{ ExitCode = $exitCode; Output = $redactedOutput }
}

$repoRoot = if ($RepoPath) { (Resolve-Path -LiteralPath $RepoPath).Path } else { Split-Path -Parent $PSScriptRoot }
$migrationRoot = if ($MigrationRoot) { (Resolve-Path -LiteralPath $MigrationRoot).Path } else { $repoRoot }
$infraRoot = Join-Path $repoRoot 'infrastructure'
$composeWorkDir = $null
if (-not $EnvFile) {
    # PowerShell 5.1 can strip quotes inside a Docker Go-template argument.
    # Read inspect JSON instead so discovery is shell-independent.
    $composeInspect = Invoke-Docker @('inspect', 'samhan-auth-service') -AllowFailure
    if ($composeInspect.ExitCode -eq 0) {
        try {
            $inspectJson = ($composeInspect.Output -join [Environment]::NewLine) | ConvertFrom-Json
            $composeCandidate = $inspectJson[0].Config.Labels.'com.docker.compose.project.working_dir'
            if ($composeCandidate -and [string]$composeCandidate -match '^(?:[A-Za-z]:[\\/]|/)') {
                $composeWorkDir = [string] $composeCandidate
            }
        } catch {
            $composeWorkDir = $null
        }
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

$databaseByService = @{
    'accounting-service' = 'accounting_db'
    'arologis-service' = 'arologis_db'
    'auth-service' = 'auth_db'
    'dashboard-service' = 'dashboard_db'
    'dc-config-service' = 'dc_config_db'
    'groupware-service' = 'groupware_db'
    'inventory-service' = 'inventory_db'
    'notification-service' = 'notification_db'
    'partner-auth-service' = 'partner_auth_db'
    'partner-order-service' = 'partner_order_db'
    'partner-service' = 'partner_db'
    'product-service' = 'product_db'
    'slip-service' = 'slip_db'
    'user-service' = 'user_db'
}
$targetDefinitions = @()
$discoveryIssues = @()
foreach ($serviceDirectory in (Get-ChildItem -LiteralPath (Join-Path $repoRoot 'services') -Directory)) {
    $relativeService = $serviceDirectory.Name
    $location = Join-Path (Join-Path $migrationRoot 'services') "$relativeService/src/main/resources/db/migration"
    if (-not $databaseByService.ContainsKey($serviceDirectory.Name)) {
        if (Test-Path -LiteralPath $location -PathType Container) {
            $discoveryIssues += [pscustomobject]@{
                Name = $serviceDirectory.Name
                Reason = 'no database mapping'
                Location = $location
            }
        }
        continue
    }
    if (-not (Test-Path -LiteralPath $location -PathType Container)) {
        $discoveryIssues += [pscustomobject]@{
            Name = $serviceDirectory.Name
            Reason = 'migration directory not found'
            Location = $location
        }
        continue
    }
    $targetDefinitions += [pscustomobject]@{
        Name = $serviceDirectory.Name
        Database = $databaseByService[$serviceDirectory.Name]
        Location = $location
    }
}
$relevantDiscoveryIssues = @($discoveryIssues | Where-Object { -not $Service -or $_.Name -eq $Service })
foreach ($issue in $relevantDiscoveryIssues) {
    Write-Output "Service omitted from Flyway repair targets: $($issue.Name) ($($issue.Reason)): $($issue.Location)"
}
if ($relevantDiscoveryIssues.Count -gt 0) {
    $issueSummary = $relevantDiscoveryIssues | ForEach-Object {
        "$($_.Name) ($($_.Reason)): $($_.Location)"
    }
    throw "Service discovery failed; resolve the omitted service(s) before running Flyway repair.`n$($issueSummary -join [Environment]::NewLine)"
}
$targets = @($targetDefinitions | Where-Object { -not $Service -or $_.Name -eq $Service })
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
            return $line -notmatch '(?i)^\s*WARNING:\s*.*$' -and
                $line -notmatch '(?i)^\s*Flyway OSS Edition\s+.*$' -and
                $line -notmatch '(?i)^\s*See release notes here:.*$' -and
                $line -notmatch '(?i)^\s*Database:\s+.*$' -and
                $line -notmatch '(?i)^\s*(?:ERROR:\s*)?Validate failed:.*$' -and
                $line -notmatch '(?i)^\s*Successfully validated\s+[0-9]+(?:,[0-9]{3})*\s+migrations\s+\(execution time\s+\d{2}:\d{2}\.\d{3}s\)\s*$' -and
                $line -notmatch '(?i)^\s*Migration checksum mismatch for migration version\s+[0-9.]+' -and
                $line -notmatch '(?i)^\s*(?:->\s*|-\s*)(Applied to database|Resolved locally)\s*:' -and
                $line -notmatch '(?i)^\s*Either revert the changes to the migration, or run repair to update the schema history\.\s*$' -and
                $line -notmatch '(?i)^\s*Need more flexibility with validation rules\? Learn more:.*$'
        })
        if ($unexpectedLines.Count -gt 0 -or ($validate.ExitCode -ne 0 -and $mismatchLines.Count -eq 0)) { throw "$($target.Name) validate failed for a reason other than a checksum mismatch:`n$validateText" }
        $displayVersions = if ($versions.Count) { $versions -join ', ' } else { '(none)' }
        Write-Output "$($target.Name): checksum mismatch versions = $displayVersions"
        if ($versions.Count -gt 0) {
            $baselineIssues = @(Get-MigrationBaselineIssues $target.Location $versions)
            if ($baselineIssues.Count -gt 0) {
                Write-Output "$($target.Name): repair 거부 — git baseline 검증 실패"
                $baselineIssues | ForEach-Object { Write-Output "  $_" }
                throw "Flyway repair refused because the migration file is not identical to the current HEAD commit.`n$($baselineIssues -join [Environment]::NewLine)"
            }
            if ($PSCmdlet.ShouldProcess($target.Name, 'Flyway repair (checksum metadata only)')) {
                $repair = Invoke-Docker ($common + @('repair'))
                Write-Output "$($target.Name): repair completed"
                $repair.Output | Where-Object { $_ -match 'Successfully repaired|Repair of' } | ForEach-Object { Write-Output $_ }
            }
        }
    } finally {
        if (Test-Path -LiteralPath $credentialFile) { Remove-Item -LiteralPath $credentialFile -Force -Confirm:$false -WhatIf:$false }
    }
}
