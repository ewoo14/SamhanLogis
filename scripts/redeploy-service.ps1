<#
.SYNOPSIS
  Spring 서비스를 Gradle 빌드 후 로컬 스택에 재배포한다.

.DESCRIPTION
  🚨 docker compose --build 는 Gradle 을 돌리지 않는다.
     Dockerfile 이 services/<svc>/build/libs/<svc>.jar 를 복사만 하므로,
     jar 를 먼저 새로 만들지 않으면 컨테이너를 재생성해도 코드가 그대로다.

  2026-08-13 실측 — groupware 이미지는 방금 만들었는데 jar 는 3주 전 것이었고,
  그 때문에 하루에 세 번 "없는 결함" 을 쫓았다.
  → .claude/memory/feedback_docker_build_does_not_run_gradle.md

  이 스크립트는 그 순서를 고정한다: bootJar → compose up --build --no-deps → 검증.

.PARAMETER Service
  재배포할 서비스 이름. 쉼표로 여러 개.  예: groupware-service,dashboard-service

.PARAMETER SkipBuild
  jar 를 이미 만들어 둔 경우 Gradle 을 건너뛴다. 🚨 웬만하면 쓰지 마라.

.EXAMPLE
  .\scripts\redeploy-service.ps1 groupware-service
  .\scripts\redeploy-service.ps1 dashboard-service,accounting-service
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string[]] $Service,
    [switch] $SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# 로컬 자격은 저장소 밖 infrastructure/.env.local 에서만 읽는다.
# compose 파일/소스에 값을 복사하지 않고 현재 프로세스 환경으로만 전달한다.
$localEnvPath = Join-Path $repoRoot 'infrastructure/.env.local'
if (Test-Path $localEnvPath) {
    foreach ($line in Get-Content -LiteralPath $localEnvPath -Encoding UTF8) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
            $name = $matches[1]
            $value = $matches[2].Trim()
            if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Substring(1, $value.Length - 2) }
            if ($value.StartsWith("'") -and $value.EndsWith("'")) { $value = $value.Substring(1, $value.Length - 2) }
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

$services = @($Service | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() })
if ($services.Count -eq 0 -or $services -contains '') {
    throw '서비스 이름이 비어 있습니다.'
}
foreach ($svc in $services) {
    if ($svc -notmatch '^[a-z0-9-]+$') {
        throw "잘못된 서비스 이름입니다: $svc"
    }
}

# 집PC 는 influxd 가 로컬호스트의 InfluxDB 기본값 8086 을 점유해 portfix 오버레이가 필요하다.
# 회사PC 등 충돌이 없는 곳에서는 파일이 없을 수 있으므로 존재할 때만 얹는다.
$composeFiles = @(
    'infrastructure/docker-compose.yml',
    'infrastructure/docker-compose.local-all.yml'
)
$portfix = 'infrastructure/docker-compose.local-portfix.yml'
if (Test-Path $portfix) { $composeFiles += $portfix }

$composeArgs = @()
foreach ($f in $composeFiles) { $composeArgs += @('-f', $f) }

. "$repoRoot\scripts\lib\local-stack-port.ps1"

function Convert-ComposeDurationToSeconds {
    param([AllowNull()][string] $Duration)

    if ([string]::IsNullOrWhiteSpace($Duration)) { return 0 }
    $total = 0.0
    foreach ($match in [regex]::Matches($Duration, '(?<value>\d+(?:\.\d+)?)(?<unit>ns|us|µs|ms|s|m|h)')) {
        $value = [double]$match.Groups['value'].Value
        switch ($match.Groups['unit'].Value) {
            'h' { $total += $value * 3600 }
            'm' { $total += $value * 60 }
            's' { $total += $value }
            'ms' { $total += $value / 1000 }
            { $_ -in @('us', 'µs') } { $total += $value / 1000000 }
            'ns' { $total += $value / 1000000000 }
        }
    }
    return [math]::Ceiling($total)
}

function Get-ComposeHealthTimeoutSeconds {
    # Docker Compose health failure horizon (per service), conservatively including
    # every probe timeout: start_period + retries * (interval + timeout).
    # Recalculate this from compose config so a future compose edit changes the
    # default automatically; the measured current maximum is 75 + 20 * (15 + 5) = 475s.
    $configJson = & docker compose @composeArgs config --format json 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "compose healthcheck 정의를 읽지 못했습니다 (exit $LASTEXITCODE): $configJson"
    }
    try {
        $config = ($configJson -join [Environment]::NewLine) | ConvertFrom-Json
    } catch {
        throw "compose healthcheck 정의 JSON을 해석하지 못했습니다: $($_.Exception.Message)"
    }

    $maxSeconds = 0
    $maxService = ''
    foreach ($serviceProperty in $config.services.PSObject.Properties) {
        $healthcheck = $serviceProperty.Value.healthcheck
        if ($null -eq $healthcheck -or $healthcheck -eq $false) { continue }

        $startPeriod = Convert-ComposeDurationToSeconds $healthcheck.start_period
        $interval = Convert-ComposeDurationToSeconds $healthcheck.interval
        $timeout = Convert-ComposeDurationToSeconds $healthcheck.timeout
        $retries = if ($null -eq $healthcheck.retries) { 0 } else { [int]$healthcheck.retries }
        $horizon = $startPeriod + ($retries * ($interval + $timeout))
        if ($horizon -gt $maxSeconds) {
            $maxSeconds = $horizon
            $maxService = $serviceProperty.Name
        }
    }

    if ($maxSeconds -le 0) {
        throw 'compose에 유효한 healthcheck 정의가 없어 health 대기 상한을 계산할 수 없습니다.'
    }
    Write-Host ("compose health 상한 계산: {0}초 ({1}) = start_period + retries × (interval + timeout)" -f $maxSeconds, $maxService) -ForegroundColor DarkGray
    return $maxSeconds
}

$timeoutText = [Environment]::GetEnvironmentVariable('REDEPLOY_HEALTH_TIMEOUT_SECONDS')
$healthTimeoutSeconds = Get-ComposeHealthTimeoutSeconds
if (-not [string]::IsNullOrWhiteSpace($timeoutText)) {
    if ($timeoutText -notmatch '^[1-9][0-9]*$') {
        throw "REDEPLOY_HEALTH_TIMEOUT_SECONDS 는 양의 정수여야 합니다: $timeoutText"
    }
    $healthTimeoutSeconds = [int]$timeoutText
}

function Wait-ServiceReady {
    param([Parameter(Mandatory = $true)][string]$Service)

    $deadline = (Get-Date).AddSeconds($healthTimeoutSeconds)
    $container = "samhan-$Service"
    $port = Get-LocalStackPort -Service $Service
    $lastHealth = 'unknown'
    $lastActuator = 'unavailable'

    Write-Host ("[{0}] health 대기 시작 (상한 {1}초)" -f $Service, $healthTimeoutSeconds) -ForegroundColor Yellow
    do {
        $healthOutput = & docker inspect $container --format '{{.State.Health.Status}}' 2>$null
        $inspectExit = $LASTEXITCODE
        if ($inspectExit -eq 0 -and $healthOutput) {
            $lastHealth = ([string]$healthOutput).Trim()
        } else {
            $lastHealth = 'container-unavailable'
        }

        $lastActuator = 'unavailable'
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri ("http://localhost:{0}/actuator/health" -f $port) -TimeoutSec 5
            $contentText = if ($response.Content -is [byte[]]) {
                [Text.Encoding]::UTF8.GetString([byte[]]$response.Content)
            } else {
                [string]$response.Content
            }
            $payload = $contentText | ConvertFrom-Json
            if ([int]$response.StatusCode -eq 200 -and $payload.status -eq 'UP') {
                $lastActuator = '200/UP'
            } else {
                $lastActuator = "{0}/{1}" -f [int]$response.StatusCode, $payload.status
            }
        } catch {
            if ($_.Exception.Response) {
                $lastActuator = "{0}/DOWN" -f [int]$_.Exception.Response.StatusCode
            }
        }

        Write-Host ("[{0}] readiness health={1} actuator={2}" -f $Service, $lastHealth, $lastActuator)
        if ($lastHealth -eq 'healthy' -and $lastActuator -eq '200/UP') {
            return
        }
        if ((Get-Date) -ge $deadline) {
            throw "[$Service] health 대기 시간 초과 ({0}초): health={1}, actuator={2}" -f $healthTimeoutSeconds, $lastHealth, $lastActuator
        }
        Start-Sleep -Seconds 5
    } while ($true)
}

foreach ($svc in $services) {
    $jar = "services/$svc/build/libs/$svc.jar"

    if (-not $SkipBuild) {
        Write-Host "[$svc] Gradle bootJar ..." -ForegroundColor Cyan
        & "$repoRoot\gradlew.bat" ":services:${svc}:bootJar" --no-daemon -q
        if ($LASTEXITCODE -ne 0) { throw "[$svc] bootJar 실패 (exit $LASTEXITCODE)" }
    }

    if (-not (Test-Path $jar)) { throw "[$svc] jar 가 없다: $jar" }

    $jarTime = (Get-Item $jar).LastWriteTime
    $ageMin = [math]::Round(((Get-Date) - $jarTime).TotalMinutes, 1)
    Write-Host ("[{0}] jar {1}  ({2}분 전)" -f $svc, $jarTime.ToString('yyyy-MM-dd HH:mm:ss'), $ageMin)

    # 🚨 --no-deps 를 빼면 postgres·eureka·gateway 가 재생성돼 스택이 Created 로 멈춘다.
    Write-Host "[$svc] compose up --build --no-deps ..." -ForegroundColor Cyan
    & docker compose @composeArgs up -d --build --no-deps $svc
    if ($LASTEXITCODE -ne 0) { throw "[$svc] compose up 실패 (exit $LASTEXITCODE)" }
    Wait-ServiceReady -Service $svc
}

Write-Host ''
Write-Host '=== 배포본 확인 (컨테이너 시각이 아니라 jar 가 정본이다) ===' -ForegroundColor Yellow
foreach ($svc in $services) {
    $jar = "services/$svc/build/libs/$svc.jar"
    $containerCreated = & docker inspect "samhan-$svc" --format '{{.Created}}' 2>$null
    $health = & docker inspect "samhan-$svc" --format '{{.State.Health.Status}}' 2>$null
    $jarTime = (Get-Item $jar).LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
    Write-Host ("  {0,-26} jar={1}  container={2}  health={3}" -f $svc, $jarTime, $containerCreated, $health)
}

Write-Host ''
Write-Host '배포본 readiness 확인 완료: 모든 대상 서비스가 healthy 및 actuator 200/UP 입니다.' -ForegroundColor Green
Write-Host '🚩 Flyway 신규 마이그레이션이 있으면 적용 여부를 직접 확인하십시오:' -ForegroundColor Yellow
Write-Host '   docker exec samhan-postgres psql -U samhan -d <db> -c "select version, description from flyway_schema_history order by installed_rank desc limit 3;"'
