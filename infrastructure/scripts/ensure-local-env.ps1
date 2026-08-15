# 로컬 Docker 자격 초기화 helper.
#
# 이 파일은 start-local-full.ps1 / scripts/launch-local-stack.ps1 에서 dot-source 한다.
# 자격 값은 화면에 출력하지 않는다. infrastructure/.env 는 gitignore 대상이다.

function Get-LocalEnvMap {
    param([Parameter(Mandatory)][string]$Path)

    $map = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $map
    }

    foreach ($line in (Get-Content -LiteralPath $Path -Encoding UTF8)) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $parts = $trimmed -split '=', 2
        if ($parts.Count -ne 2) { continue }
        $name = $parts[0].Trim()
        if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { continue }
        $value = $parts[1].Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $map[$name] = $value
    }
    return $map
}

function New-LocalSecretValue {
    $bytes = New-Object byte[] 24
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($bytes)
    } finally {
        $random.Dispose()
    }
    return ([BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant())
}

function Get-RunningContainerEnvValue {
    param(
        [Parameter(Mandatory)][string]$Container,
        [Parameter(Mandatory)][string]$Key
    )

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return '' }
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = @(& docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $Container 2>$null)
        if ($LASTEXITCODE -ne 0) { return '' }
        foreach ($line in $lines) {
            $prefix = "$Key="
            if ([string]$line -like "$prefix*") {
                return ([string]$line).Substring($prefix.Length)
            }
        }
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    return ''
}

function Set-LocalEnvProcessValues {
    param([Parameter(Mandatory)][hashtable]$Values)

    foreach ($entry in $Values.GetEnumerator()) {
        Set-Item -Path "env:$($entry.Key)" -Value ([string]$entry.Value)
    }
}

function Initialize-SamhanLocalEnv {
    param([Parameter(Mandatory)][string]$ProjectRoot)

    $infraDir = Join-Path $ProjectRoot 'infrastructure'
    $envFile = Join-Path $infraDir '.env'
    $exampleFile = Join-Path $infraDir '.env.example'
    $placeholderValues = @('', 'CHANGE_ME_LOCAL_ONLY', 'SET_BY_LOCAL_ENV_BOOTSTRAP')
    $secretKeys = @(
        'POSTGRES_PASSWORD', 'DB_PASSWORD', 'RABBITMQ_DEFAULT_PASS', 'RABBIT_PASSWORD',
        'MINIO_ROOT_PASSWORD', 'GF_SECURITY_ADMIN_PASSWORD',
        'SAMHAN_INTERNAL_TOKEN', 'INTERNAL_AUTH_TOKEN', 'SAMHAN_JWT_SECRET', 'JWT_SECRET',
        'SAMHAN_AROLOGIS_JWT_SECRET', 'SAMHAN_GATEWAY_ATTESTATION'
    ) + @('SAMHAN_S3_SECRET_KEY') + @('SAMHAN_SLIP_MINIO_SECRET_KEY')
    $requiredKeys = @(
        'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB',
        'DB_USER', 'DB_PASSWORD',
        'RABBITMQ_DEFAULT_USER', 'RABBITMQ_DEFAULT_PASS', 'RABBIT_USER', 'RABBIT_PASSWORD',
        'MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD',
        'GF_SECURITY_ADMIN_USER', 'GF_SECURITY_ADMIN_PASSWORD',
        'SAMHAN_INTERNAL_TOKEN', 'INTERNAL_AUTH_TOKEN',
        'SAMHAN_JWT_SECRET', 'JWT_SECRET', 'SAMHAN_AROLOGIS_JWT_SECRET',
        'SAMHAN_GATEWAY_ATTESTATION', 'SAMHAN_S3_ACCESS_KEY'
    ) + @('SAMHAN_S3_SECRET_KEY') + @('SAMHAN_SLIP_MINIO_SECRET_KEY')

    $envFileExists = Test-Path -LiteralPath $envFile
    if ($envFileExists) {
        $values = Get-LocalEnvMap -Path $envFile
        $sourceLines = @(Get-Content -LiteralPath $envFile -Encoding UTF8)
    } else {
        if (-not (Test-Path -LiteralPath $exampleFile)) {
            throw "로컬 환경 템플릿을 찾을 수 없습니다: $exampleFile"
        }
        $values = Get-LocalEnvMap -Path $exampleFile
        $sourceLines = @(Get-Content -LiteralPath $exampleFile -Encoding UTF8)
    }

    $missingKeys = @($requiredKeys | Where-Object {
        -not $values.ContainsKey($_) -or $placeholderValues -contains ([string]$values[$_]).Trim()
    })
    $allSecretValuesArePlaceholders = @($secretKeys | Where-Object {
        -not $values.ContainsKey($_) -or $placeholderValues -contains ([string]$values[$_]).Trim()
    }).Count -eq $secretKeys.Count

    if ($envFileExists -and $missingKeys.Count -gt 0 -and -not $allSecretValuesArePlaceholders) {
        throw "infrastructure/.env 에 필수 키가 일부만 설정되었습니다. 누락/placeholder 키: $($missingKeys -join ', ')"
    }

    if ($missingKeys.Count -gt 0) {
        $postgresPassword = Get-RunningContainerEnvValue -Container 'samhan-postgres' -Key 'POSTGRES_PASSWORD'
        $rabbitPassword = Get-RunningContainerEnvValue -Container 'samhan-rabbitmq' -Key 'RABBITMQ_DEFAULT_PASS'
        $minioPassword = Get-RunningContainerEnvValue -Container 'samhan-minio' -Key 'MINIO_ROOT_PASSWORD'
        $grafanaPassword = Get-RunningContainerEnvValue -Container 'samhan-grafana' -Key 'GF_SECURITY_ADMIN_PASSWORD'

        if ([string]::IsNullOrWhiteSpace($postgresPassword)) { $postgresPassword = New-LocalSecretValue }
        if ([string]::IsNullOrWhiteSpace($rabbitPassword)) { $rabbitPassword = New-LocalSecretValue }
        if ([string]::IsNullOrWhiteSpace($minioPassword)) { $minioPassword = New-LocalSecretValue }
        if ([string]::IsNullOrWhiteSpace($grafanaPassword)) { $grafanaPassword = New-LocalSecretValue }

        $internalToken = New-LocalSecretValue
        $jwtSecret = New-LocalSecretValue
        $gatewayAttestation = New-LocalSecretValue
        $localUser = [string]$values['POSTGRES_USER']
        $localS3AccessKey = [string]$values['SAMHAN_S3_ACCESS_KEY']
        $generated = @{
            POSTGRES_USER = $localUser
            POSTGRES_PASSWORD = $postgresPassword
            POSTGRES_DB = 'postgres'
            DB_USER = $localUser
            DB_PASSWORD = $postgresPassword
            RABBITMQ_DEFAULT_USER = $localUser
            RABBITMQ_DEFAULT_PASS = $rabbitPassword
            RABBIT_USER = $localUser
            RABBIT_PASSWORD = $rabbitPassword
            MINIO_ROOT_USER = $localUser
            MINIO_ROOT_PASSWORD = $minioPassword
            GF_SECURITY_ADMIN_USER = 'admin'
            GF_SECURITY_ADMIN_PASSWORD = $grafanaPassword
            SAMHAN_INTERNAL_TOKEN = $internalToken
            INTERNAL_AUTH_TOKEN = $internalToken
            SAMHAN_JWT_SECRET = $jwtSecret
            JWT_SECRET = $jwtSecret
            SAMHAN_AROLOGIS_JWT_SECRET = $jwtSecret
            SAMHAN_GATEWAY_ATTESTATION = $gatewayAttestation
            SAMHAN_S3_ACCESS_KEY = $localS3AccessKey
            SAMHAN_S3_SECRET_KEY = $minioPassword
            SAMHAN_SLIP_MINIO_SECRET_KEY = $minioPassword
        }
        foreach ($entry in $generated.GetEnumerator()) {
            $values[$entry.Key] = $entry.Value
        }

        $outputLines = foreach ($line in $sourceLines) {
            if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=') {
                $name = $Matches[1]
                if ($generated.ContainsKey($name)) {
                    "$name=$($values[$name])"
                    continue
                }
            }
            $line
        }
        $knownKeys = @($outputLines | ForEach-Object {
            if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=') { $Matches[1] }
        })
        foreach ($entry in $generated.GetEnumerator()) {
            if ($knownKeys -notcontains $entry.Key) {
                $outputLines += "$($entry.Key)=$($entry.Value)"
            }
        }

        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($envFile, (($outputLines -join [Environment]::NewLine) + [Environment]::NewLine), $utf8NoBom)
        Write-Host "로컬 자격 파일을 준비했습니다: $envFile (값은 출력하지 않음)" -ForegroundColor DarkGray
    }

    Set-LocalEnvProcessValues -Values $values
    return $envFile
}
