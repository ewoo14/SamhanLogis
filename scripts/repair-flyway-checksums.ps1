[CmdletBinding(SupportsShouldProcess)]
param(
    [string] $EnvFile,
    [string] $PostgresContainer = 'samhan-postgres',
    [string] $Network = 'samhan-net',
    [string] $FlywayImage = 'flyway/flyway:10.10.0'
)

$ErrorActionPreference = 'Stop'

function Read-DotEnv([string] $Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $values }
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
            $value = $Matches[2].Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $values[$Matches[1]] = $value
        }
    }
    return $values
}

function Invoke-Docker([string[]] $Arguments, [switch] $AllowFailure) {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & docker @Arguments 2>&1
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if (-not $AllowFailure -and $LASTEXITCODE -ne 0) {
        throw "docker $($Arguments -join ' ') failed with exit code $LASTEXITCODE`n$($output -join [Environment]::NewLine)"
    }
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = @($output) }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$infraRoot = Join-Path $repoRoot 'infrastructure'
$composeWorkDir = $null
if (-not $EnvFile) {
    $composeWorkDir = (Invoke-Docker @('inspect', 'samhan-auth-service', '--format', '{{.Config.Labels}}') -AllowFailure).Output | Select-Object -First 1
}
$candidateEnvFiles = @()
if ($EnvFile) { $candidateEnvFiles += (Resolve-Path -LiteralPath $EnvFile).Path }
if ($composeWorkDir) {
    $candidateEnvFiles += (Join-Path $composeWorkDir '.env')
    $candidateEnvFiles += (Join-Path $composeWorkDir '.env.local')
}
$candidateEnvFiles += (Join-Path $infraRoot '.env')
$candidateEnvFiles += (Join-Path $infraRoot '.env.local')

$envPath = $candidateEnvFiles | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $envPath) {
    throw "환경 파일을 찾지 못했습니다. 확인한 경로: $($candidateEnvFiles -join ', ')"
}
$envValues = Read-DotEnv $envPath
Write-Output "Environment file: $envPath"

$dbUser = if ($envValues.ContainsKey('POSTGRES_USER')) { $envValues['POSTGRES_USER'] } else { 'samhan' }
$dbPassword = $null
foreach ($key in @('POSTGRES_PASSWORD', 'DB_PASSWORD')) {
    if ($envValues.ContainsKey($key) -and $envValues[$key]) { $dbPassword = $envValues[$key]; break }
}
if (-not $dbPassword) {
    $postgresEnv = (Invoke-Docker @('inspect', $PostgresContainer, '--format', '{{range .Config.Env}}{{println .}}{{end}}')).Output
    $passwordLine = $postgresEnv | Where-Object { $_ -like 'POSTGRES_PASSWORD=*' } | Select-Object -First 1
    if ($passwordLine) { $dbPassword = ($passwordLine -split '=', 2)[1] }
}
if (-not $dbPassword) { throw 'DB 비밀번호가 환경 파일 또는 실행 중 Postgres 컨테이너에서 제공되지 않았습니다.' }

$targets = @(
    [pscustomobject]@{ Name = 'auth_db'; Database = 'auth_db'; Location = (Join-Path $repoRoot 'services/auth-service/src/main/resources/db/migration') },
    [pscustomobject]@{ Name = 'arologis_db'; Database = 'arologis_db'; Location = (Join-Path $repoRoot 'services/arologis-service/src/main/resources/db/migration') }
)

foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target.Location)) { throw "Migration location not found: $($target.Location)" }
    $jdbcUrl = "jdbc:postgresql://postgres:5432/$($target.Database)"
    $common = @('run', '--rm', '--network', $Network, '-e', "FLYWAY_URL=$jdbcUrl", '-e', "FLYWAY_USER=$dbUser", '-e', "FLYWAY_PASSWORD=$dbPassword", '-v', "$($target.Location):/flyway/sql:ro", $FlywayImage)
    $validate = Invoke-Docker ($common + @('validate')) -AllowFailure
    $mismatchLines = @($validate.Output | Where-Object { $_ -match 'Migration checksum mismatch for migration version' })
    $versions = @($mismatchLines | ForEach-Object { if ($_ -match 'version\s+([0-9.]+)') { $Matches[1] } })
    if ($versions.Count -eq 0 -and $validate.ExitCode -ne 0) {
        throw "$($target.Name) validate failed for a reason other than a checksum mismatch:`n$($validate.Output -join [Environment]::NewLine)"
    }
    $displayVersions = if ($versions.Count) { $versions -join ', ' } else { '(none)' }
    Write-Output "$($target.Name): checksum mismatch versions = $displayVersions"
    if ($PSCmdlet.ShouldProcess($target.Name, 'Flyway repair (checksum metadata only)')) {
        $repair = Invoke-Docker ($common + @('repair'))
        Write-Output "$($target.Name): repair completed"
        $repair.Output | Where-Object { $_ -match 'Successfully repaired|Repair of' } | ForEach-Object { Write-Output $_ }
    }
}
