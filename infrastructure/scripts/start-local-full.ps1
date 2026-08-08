<#
.SYNOPSIS
    SamhanLogis 풀 수준 로컬 테스트 환경 일괄 기동 스크립트.

.DESCRIPTION
    14 backend MSA + 인프라 (postgres + redis + rabbitmq + elasticsearch + minio)
    를 의존 순서대로 기동하고 시드 데이터 row count 를 검증한다.

    동작 순서:
        0) Pre-flight — 필수 도구 검증 + 8080~8200 port 점유 검사 + 충돌 안내
        1) docker-compose up -d (인프라 + 모니터링 stack)
        2) infrastructure/env-templates/.env.dev-seed 환경변수 일괄 로드
           + LEGACY_DB_USER / LEGACY_DB_PASSWORD 자동 export (chained-default 호환)
        3) 14 service 의존순 startup (Gradle bootRun, background job)
           eureka -> auth -> user -> product -> inventory -> slip -> accounting
                  -> partner -> partner-order -> arologis -> groupware
                  -> notification -> dashboard -> api-gateway
           각 service health check (~5분 timeout, /actuator/health 200 폴링)
           — 특히 auth-service health UP 확인 후 user-service 시작 (OrgChartSeeder
             의 auth-service.createAccount RPC 사전 ready 의무)
        4) 각 service health 종합 요약
        5) 시드 데이터 row count psql 검증
        6) 사용 가이드 출력

.PARAMETER SkipDocker
    docker-compose up -d 단계 생략 (인프라가 이미 떠 있는 경우).

.PARAMETER SkipServices
    backend service 기동 단계 생략 (인프라 + 시드 검증만).

.PARAMETER ServiceTimeoutSec
    각 service 기동 health check 최대 대기 (기본 300초 = 5분).

.PARAMETER SkipPortCheck
    Pre-flight port 점유 검사 생략 (외부 의존 서비스 사전 가동 인지 시).

.PARAMETER RunSeed
    표준 toggle를 덮어 product/inventory seed를 명시적으로 실행한다.

.EXAMPLE
    .\infrastructure\scripts\start-local-full.ps1

.EXAMPLE
    .\infrastructure\scripts\start-local-full.ps1 -SkipDocker

.EXAMPLE
    .\infrastructure\scripts\start-local-full.ps1 -RunSeed

.NOTES
    - Windows PowerShell 5.1 / PowerShell 7+ 호환 (?? null-coalescing 미사용)
    - JDK 17 + Docker Desktop 사전 설치 필수
    - 영문 경로 권장 (C:\dev\SamhanLogis) — 한글 path 는 JDK 17 @argfile 인코딩 한계
    - UTF-8 로 저장 — 한글 주석 보존
    - W10-5 회고: PR #100 머지 후 회귀 정정 — health-gated startup 의무
      (auth-service 미 ready 상태에서 user-service 가 시작 시 OrgChartSeeder 16명
       모두 fail. 본 PR 에서 각 service 의 health check 통과 확인 후 다음 service
       시작하도록 sequential gate 적용)
#>

[CmdletBinding()]
param(
    [switch] $SkipDocker,
    [switch] $SkipServices,
    [int]    $ServiceTimeoutSec = 300,
    [switch] $SkipPortCheck,
    [switch] $RunSeed
)

$ErrorActionPreference = 'Stop'

# SAMHAN_SEED_TEST_DATA 는 호출자 PowerShell 프로세스에서 상속되는 공통 toggle 이다.
# 스크립트가 .env.dev-seed 를 로드하거나 -RunSeed 로 덮어써도, 반환 시 진입 전 상태를
# 복원해야 같은 셸에서 이어지는 표준 compose 가 명시적 seed 실행으로 오인되지 않는다.
$seedEnvWasDefined = Test-Path 'env:SAMHAN_SEED_TEST_DATA'
$seedEnvOriginalValue = [Environment]::GetEnvironmentVariable('SAMHAN_SEED_TEST_DATA', 'Process')

try {

# -----------------------------------------------------------------------------
# 0. Pre-flight — 경로 + 환경 + port 충돌 검증
# -----------------------------------------------------------------------------
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$InfraDir    = Join-Path $ProjectRoot 'infrastructure'
$ComposeFile = Join-Path $InfraDir   'docker-compose.yml'
$EnvSeedFile = Join-Path $InfraDir   'env-templates\.env.dev-seed'
$LogsDir     = Join-Path $ProjectRoot '.local-logs'
$portResolver = Join-Path $ProjectRoot 'scripts\lib\local-stack-port.ps1'
. (Resolve-Path -LiteralPath $portResolver)

if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }

Write-Host ''
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host ' SamhanLogis 풀 수준 로컬 테스트 환경 기동' -ForegroundColor Cyan
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host " ProjectRoot : $ProjectRoot"
Write-Host " ComposeFile : $ComposeFile"
Write-Host " EnvSeedFile : $EnvSeedFile"
Write-Host " LogsDir     : $LogsDir"
Write-Host ''

# JDK 17 + gradlew 존재 검증
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    throw 'java 명령을 찾을 수 없습니다. JDK 17 (Eclipse Temurin) 을 설치하고 PATH 에 등록하세요.'
}
$gradleW = Join-Path $ProjectRoot 'gradlew.bat'
if (-not (Test-Path $gradleW)) { throw "gradlew.bat 을 찾을 수 없습니다: $gradleW" }

# Docker 가용성 검증 — 인프라 startup 전 미리 fail-fast
#
# PS 5.1 native exe 가드 (memory feedback_powershell_utf8_writes — "Avoid 2>&1 on native executables"):
#   $ErrorActionPreference='Stop' 환경에서 native exe (docker) 의 stderr 한 줄이라도 발생하면
#   PS 가 ErrorRecord 로 wrap 하여 NativeCommandError throw → script abort.
#   본 스크립트는 docker daemon ready 여부만 검증하면 되므로 ErrorActionPreference 를 scope 로 풀고
#   stderr 무시 + $LASTEXITCODE 만 검사. 2>&1 redirect 는 사용 금지 (NativeCommandError 유발).
if (-not $SkipDocker) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'docker 명령을 찾을 수 없습니다. Docker Desktop 을 설치/시작하세요.'
    }
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $null = docker info 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw 'Docker daemon 미응답. Docker Desktop 이 시작되어 있는지 확인하세요.'
        }
    } finally {
        $ErrorActionPreference = $prevEAP
    }
}

Write-Host '[0/6] Pre-flight — local-stack service port 점유 검사' -ForegroundColor Yellow

# 14 service + eureka 가 사용하는 port 범위.
# 각 service 의 port 와 충돌 안내 메시지 사전 매핑.
$expectedPorts = @{}
foreach ($serviceName in (Get-LocalStackPortDefinitions).Keys) {
    $expectedPorts[(Get-LocalStackPort -Service $serviceName)] = $serviceName
}

# 점유 자동 우회 — port → SAMHAN_<X>_PORT 환경변수 매핑.
# pre-flight 시점에 점유 발견된 default port 가 있으면 +100 으로 자동 export.
# application.yml 의 ${SERVER_PORT:${SAMHAN_<X>_PORT:default}} chained-default 와 정합.
$portToEnvVar = @{}
foreach ($serviceName in (Get-LocalStackPortDefinitions).Keys) {
    $definition = (Get-LocalStackPortDefinitions)[$serviceName]
    $portToEnvVar[(Get-LocalStackPort -Service $serviceName)] = $definition.Environment
}

if (-not $SkipPortCheck) {
    $occupied = @()
    foreach ($p in $expectedPorts.Keys) {
        try {
            $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
            if ($conn) {
                $procName = '?'
                try {
                    $procId = $conn[0].OwningProcess
                    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
                    if ($proc) { $procName = "$($proc.ProcessName) (PID $procId)" }
                } catch { }
                $occupied += [pscustomobject]@{
                    Port    = $p
                    Service = $expectedPorts[$p]
                    Holder  = $procName
                }
            }
        } catch {
            # Get-NetTCPConnection 미가용 환경 — silent skip
        }
    }
    if ($occupied.Count -gt 0) {
        Write-Host ''
        Write-Host '   다음 port 가 이미 점유 중입니다 — 자동 우회 (+100) 적용:' -ForegroundColor Yellow
        $occupied | Format-Table -AutoSize

        # 자동 우회 — 점유된 default port 마다 SAMHAN_<X>_PORT = port + 100 자동 export.
        # 가드 1: 사용자가 이미 SAMHAN_<X>_PORT 환경변수 설정 시 그것 우선 (override 안 함).
        # 가드 2: Java/gradlew/javaw 점유 시 skip (이미 SamhanLogis service 가동 중 — 사용자에게
        #         stop-local-full.ps1 실행 후 재시도 안내).
        foreach ($occ in $occupied) {
            $envVar = $portToEnvVar[[int]$occ.Port]
            if (-not $envVar) { continue }
            $existing = [Environment]::GetEnvironmentVariable($envVar)
            if ($existing) {
                Write-Host "   [skip-auto] $envVar 이미 설정됨 ($existing) — 사용자 override 우선" -ForegroundColor DarkGray
                continue
            }
            # Java 점유 시 skip — 이미 SamhanLogis service 가동 중. 두 인스턴스 동시 시작 회피.
            if ($occ.Holder -match 'java|gradle') {
                Write-Host "   [skip-auto] port $($occ.Port) Java/Gradle 점유 ($($occ.Holder)) — 이미 SamhanLogis service 가동 중" -ForegroundColor DarkYellow
                Write-Host "                stop-local-full.ps1 실행 후 재시도 권장" -ForegroundColor DarkGray
                continue
            }
            $newPort = [int]$occ.Port + 100
            Set-Item "env:$envVar" $newPort
            Write-Host "   [auto-bypass] port $($occ.Port) 점유 ($($occ.Holder)) → $envVar = $newPort 자동 export" -ForegroundColor Cyan
        }
        Write-Host ''
    } else {
        Write-Host '   port 충돌 없음 — 진행' -ForegroundColor Green
    }
} else {
    Write-Host '   port 검사 생략 (-SkipPortCheck)' -ForegroundColor DarkGray
}

# -----------------------------------------------------------------------------
# 1. 인프라 기동 (docker-compose up -d)
# -----------------------------------------------------------------------------
if (-not $SkipDocker) {
    Write-Host ''
    Write-Host '[1/6] 인프라 stack 기동 (postgres + redis + rabbitmq + elasticsearch + minio + monitoring)' -ForegroundColor Yellow
    Push-Location $InfraDir
    # PS 5.1 native exe 가드 — docker compose pull 진행 메시지가 stderr 로 흐르며
    # ErrorActionPreference='Stop' + 미가공 ErrorRecord wrap 시 NativeCommandError 로 script abort.
    # ErrorActionPreference 를 scope 로 풀고 $LASTEXITCODE 로만 결과 판정. 2>&1 redirect 금지.
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        docker compose -f docker-compose.yml up -d
        if ($LASTEXITCODE -ne 0) {
            $ErrorActionPreference = $prevEAP
            throw 'docker compose up 실패'
        }
    } finally {
        $ErrorActionPreference = $prevEAP
        Pop-Location
    }
    Write-Host '   인프라 healthy 대기 (~30초) ...' -ForegroundColor DarkGray
    Start-Sleep -Seconds 30

    # MinIO 버킷 멱등 초기화 — partner-attachments (P0-3) + slip-attachments (P1-8)
    # 매뉴얼 출처: docs/manual/04-모바일/04-사진-첨부.md §4-2
    Write-Host ''
    Write-Host '   MinIO 버킷 초기화 (partner-attachments + slip-attachments) ...' -ForegroundColor DarkGray
    $bucketScript = Join-Path $PSScriptRoot 'setup-minio-buckets.ps1'
    if (Test-Path $bucketScript) {
        try {
            & $bucketScript
            if ($LASTEXITCODE -ne 0) {
                Write-Warning '   MinIO 버킷 초기화 일부 실패 — 첨부 기능 사용 시 setup-minio-buckets.ps1 수동 재실행'
            }
        } catch {
            Write-Warning "   MinIO 버킷 초기화 예외 — $($_.Exception.Message). 첨부 기능 미사용 시 무시 가능."
        }
    } else {
        Write-Warning "   setup-minio-buckets.ps1 미발견 — 버킷 수동 생성 필요 ($bucketScript)"
    }
} else {
    Write-Host ''
    Write-Host '[1/6] 인프라 기동 단계 생략 (-SkipDocker)' -ForegroundColor DarkGray
}

# W10-6 회고 — PostgreSQL max_connections 사전 검증.
# default 100 → 14 service × Hikari default 10 = 140 → "FATAL: sorry, too many clients already".
# docker-compose.yml 의 postgres.command 가 300 으로 override 되어 있어야 함.
# 본 검증은 인프라 startup 직후 / 14 service startup 전에 수행하여 cascade fail 사전 차단.
Write-Host ''
Write-Host '[1a/6] PostgreSQL max_connections 사전 검증' -ForegroundColor Yellow
$maxConnRaw = $null
# PS 5.1 native exe 가드 — docker exec stderr (psql 미접속 등) 가 ErrorRecord wrap 되어
# script abort 되지 않도록 ErrorActionPreference scope 로 풀고 stderr 만 무시 ($null redirect).
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    $maxConnRaw = docker exec samhan-postgres psql -U samhan -d postgres -tA -c "SHOW max_connections;" 2>$null
} catch {
    # docker exec 실패 — 미기동 가능성. 하단에서 안내.
} finally {
    $ErrorActionPreference = $prevEAP
}
if (-not $maxConnRaw) {
    Write-Warning '   PostgreSQL 미응답 — max_connections 검증 생략. 인프라 startup 진행 상황 확인 필요.'
} else {
    $maxConn = ([string]$maxConnRaw).Trim()
    $maxConnInt = 0
    if ([int]::TryParse($maxConn, [ref]$maxConnInt) -and $maxConnInt -ge 200) {
        Write-Host "   max_connections=$maxConnInt — OK (14 service × Hikari 10 여유)" -ForegroundColor Green
    } else {
        Write-Warning "   PostgreSQL max_connections=$maxConn 부족 — 14 service 동시 startup 시 'too many clients already' 위험"
        Write-Host '   해결:' -ForegroundColor Yellow
        Write-Host '     1) infrastructure/docker-compose.yml 의 postgres.command 에 -c max_connections=300 설정' -ForegroundColor DarkGray
        Write-Host '     2) docker compose -f infrastructure/docker-compose.yml up -d --force-recreate postgres' -ForegroundColor DarkGray
        Write-Host '     (volume 보존 — 시드 데이터 유지)' -ForegroundColor DarkGray
    }
}

# -----------------------------------------------------------------------------
# 2. .env.dev-seed 환경변수 일괄 로드
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '[2/6] 시드 toggle 환경변수 로드' -ForegroundColor Yellow

if (-not (Test-Path $EnvSeedFile)) {
    throw ".env.dev-seed 파일을 찾을 수 없습니다: $EnvSeedFile"
}

$loaded = 0
Get-Content $EnvSeedFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line)        { return }
    if ($line.StartsWith('#')) { return }

    $parts = $line -split '=', 2
    if ($parts.Count -ne 2) { return }

    $name  = $parts[0].Trim()
    $value = $parts[1].Trim()
    if (-not $name) { return }

    Set-Item "env:$name" $value
    $loaded++
}
Write-Host "   $loaded 개 환경변수 로드 완료" -ForegroundColor Green

if ($RunSeed) {
    $env:SAMHAN_SEED_TEST_DATA = 'true'
    Write-Host '   -RunSeed 지정 — product/inventory seed를 실행합니다.' -ForegroundColor Yellow
}

# DB 연결 자격증명 (env 파일에 없는 표준 default)
if (-not $env:DB_HOST)     { $env:DB_HOST     = 'localhost' }
if (-not $env:DB_PORT)     { $env:DB_PORT     = '5432' }
if (-not $env:DB_USER)     { $env:DB_USER     = 'samhan' }
if (-not $env:DB_PASSWORD) {
    if ($env:POSTGRES_PASSWORD) { $env:DB_PASSWORD = $env:POSTGRES_PASSWORD }
    # docker-compose.yml 기본값 fallback — 외부 env 미설정 시 dev 환경 default 사용
    else { $env:DB_PASSWORD = 'samhan_dev_pw' }
}

# W10-5 회고 — LEGACY_DB_* chained-default 호환.
# application.yml 의 datasource 가 SAMHAN_<X>_DB_USER → LEGACY_DB_USER → DB_USER → samhan 순으로
# resolve. partner-service 등 일부 service 가 LEGACY_DB_* 명시 의존 → 자동 export 보완.
if (-not $env:LEGACY_DB_HOST)     { $env:LEGACY_DB_HOST     = $env:DB_HOST }
if (-not $env:LEGACY_DB_PORT)     { $env:LEGACY_DB_PORT     = $env:DB_PORT }
if (-not $env:LEGACY_DB_USER)     { $env:LEGACY_DB_USER     = $env:DB_USER }
if (-not $env:LEGACY_DB_PASSWORD) { $env:LEGACY_DB_PASSWORD = $env:DB_PASSWORD }

# Phase 8 chained-default 패턴 — service 별 *_DB_USER / *_DB_PASSWORD 자동 매핑
$dbAlias = @(
    'SAMHAN_PARTNER', 'SAMHAN_PRODUCT', 'SAMHAN_INVENTORY', 'SAMHAN_SLIP',
    'SAMHAN_ACCOUNTING', 'SAMHAN_PARTNER_ORDER', 'SAMHAN_AROLOGIS',
    'SAMHAN_GROUPWARE', 'SAMHAN_NOTIFICATION', 'SAMHAN_DASHBOARD',
    'SAMHAN_DC_CONFIG', 'SAMHAN_PARTNER_AUTH', 'SAMHAN_AUTH', 'SAMHAN_USER',
    'SAMHAN_LOGGING'
)
foreach ($p in $dbAlias) {
    if (-not (Get-Item "env:${p}_DB_USER"     -ErrorAction SilentlyContinue)) { Set-Item "env:${p}_DB_USER"     $env:DB_USER }
    if (-not (Get-Item "env:${p}_DB_PASSWORD" -ErrorAction SilentlyContinue)) { Set-Item "env:${p}_DB_PASSWORD" $env:DB_PASSWORD }
    if (-not (Get-Item "env:${p}_DB_HOST"     -ErrorAction SilentlyContinue)) { Set-Item "env:${p}_DB_HOST"     $env:DB_HOST }
    if (-not (Get-Item "env:${p}_DB_PORT"     -ErrorAction SilentlyContinue)) { Set-Item "env:${p}_DB_PORT"     $env:DB_PORT }
}

# -----------------------------------------------------------------------------
# 3. 14 service 의존순 startup (Gradle bootRun, background job)
# -----------------------------------------------------------------------------
# 의존 그래프:
#   tier 0: eureka-server                          (service discovery)
#   tier 1: auth-service                            (JWT issuer — user-service.OrgChartSeeder 의 사전 의존)
#   tier 2: user-service, product-service, partner-service
#   tier 3: inventory-service, accounting-service
#   tier 4: slip-service, partner-order-service, arologis-service
#   tier 5: groupware-service, notification-service
#   tier 6: dashboard-service                       (집계, 4 client 의존)
#   tier 7: api-gateway                             (모든 service registry 후 라우팅)
#
# 의존순 sequential 기동 — 각 service 가 health check 통과 후 다음 service 시작.
# W10-5 회고 — health-gated startup 의무. 특히 auth-service UP 확인 후 user-service 시작
# (미준수 시 OrgChartSeeder 16명 모두 createAccount RPC fail).

$services = @(
    @{ name = 'eureka-server'; required = $true  },  # tier 0 — discovery 필수
    @{ name = 'auth-service'; required = $true  },   # tier 1 — user OrgChartSeeder 의 사전 의존
    @{ name = 'user-service'; required = $false },
    @{ name = 'product-service'; required = $false },
    @{ name = 'partner-service'; required = $false },
    @{ name = 'inventory-service'; required = $false },
    @{ name = 'accounting-service'; required = $false },
    @{ name = 'slip-service'; required = $false },
    @{ name = 'partner-order-service'; required = $false },
    @{ name = 'arologis-service'; required = $false },
    @{ name = 'groupware-service'; required = $false },
    @{ name = 'notification-service'; required = $false },
    @{ name = 'dashboard-service'; required = $false },
    @{ name = 'dc-config-service'; required = $false },
    @{ name = 'api-gateway'; required = $false }
)
foreach ($svc in $services) {
    $svc.envVar = (Get-LocalStackPortDefinitions)[$svc.name].Environment
    $svc.port = Get-LocalStackPort -Service $svc.name
}

$startupResults = @()
$abortRemaining = $false
$eurekaPort = ($services | Where-Object { $_.name -eq 'eureka-server' }).port
$gatewayPort = ($services | Where-Object { $_.name -eq 'api-gateway' }).port

if (-not $SkipServices) {
    Write-Host ''
    Write-Host "[3/6] 14 service 의존순 기동 (timeout = ${ServiceTimeoutSec}s/service)" -ForegroundColor Yellow

    foreach ($svc in $services) {
        $name     = $svc.name
        $port     = $svc.port
        $required = $svc.required
        $logFile  = Join-Path $LogsDir "$name.log"

        if ($abortRemaining) {
            Write-Host "   ▶ $name (port $port) — SKIP (선행 필수 service 미 healthy)" -ForegroundColor DarkYellow
            $startupResults += [pscustomobject]@{
                Service = $name; Port = $port; Status = 'SKIPPED'; Required = $required; Log = $logFile
            }
            continue
        }

        Write-Host "   ▶ $name (port $port) 기동 ..." -ForegroundColor Cyan

        # bootRun 백그라운드 job
        $job = Start-Job -Name $name -ScriptBlock {
            param($root, $module, $log)
            Set-Location $root
            $env:JAVA_TOOL_OPTIONS = '-Xmx256m -Xms64m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC'
            & "$root\gradlew.bat" ":services:${module}:bootRun" --console=plain *>&1 |
                Out-File -FilePath $log -Encoding utf8
        } -ArgumentList $ProjectRoot, $name, $logFile

        # health check polling — 다음 service 시작 전 본 service 의 healthy 통과 의무.
        $healthUrl = "http://localhost:${port}/actuator/health"
        $deadline  = (Get-Date).AddSeconds($ServiceTimeoutSec)
        $up = $false
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Seconds 3
            # job 실패 사전 감지
            $jobState = (Get-Job -Id $job.Id -ErrorAction SilentlyContinue).State
            if ($jobState -eq 'Failed' -or $jobState -eq 'Stopped') {
                break
            }
            try {
                $r = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
                if ($r.StatusCode -eq 200) { $up = $true; break }
            } catch {
                # 미기동 — 계속 폴링
            }
        }

        if ($up) {
            Write-Host "     OK ($name healthy)" -ForegroundColor Green
            $startupResults += [pscustomobject]@{
                Service = $name; Port = $port; Status = 'UP'; Required = $required; Log = $logFile
            }
        } else {
            $msg = "WARN — $name 가 ${ServiceTimeoutSec}s 안에 healthy 미달성. log: $logFile"
            Write-Host "     $msg" -ForegroundColor Yellow
            $startupResults += [pscustomobject]@{
                Service = $name; Port = $port; Status = 'TIMEOUT'; Required = $required; Log = $logFile
            }
            if ($required) {
                Write-Host ''
                Write-Host "   [중단] 필수 service '$name' health check 실패 — 후속 service 기동 중단." -ForegroundColor Red
                Write-Host "          (이후 service 는 본 service 에 의존 — 기동 시 cascade fail)" -ForegroundColor Red
                Write-Host "          log 확인: $logFile" -ForegroundColor DarkGray
                Write-Host ''
                $abortRemaining = $true
            }
        }
    }
} else {
    Write-Host ''
    Write-Host '[3/6] backend service 기동 단계 생략 (-SkipServices)' -ForegroundColor DarkGray
}

# -----------------------------------------------------------------------------
# 4. service health 종합 요약
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '[4/6] service health 종합 요약' -ForegroundColor Yellow
$healthSummary = @()
foreach ($svc in $services) {
    $url = "http://localhost:$($svc.port)/actuator/health"
    $status = 'DOWN'
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $status = 'UP' }
    } catch { }
    $healthSummary += [pscustomobject]@{
        Service = $svc.name
        Port    = $svc.port
        Status  = $status
    }
}
$healthSummary | Format-Table -AutoSize
$failedHealth = @($healthSummary | Where-Object { $_.Status -ne 'UP' })

# -----------------------------------------------------------------------------
# 5. 시드 row count psql 검증
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '[5/6] 시드 데이터 row count 검증 (psql)' -ForegroundColor Yellow

$seedQueries = @(
    @{ db = 'user_db';            table = 'employees';                 expected = 16  },
    @{ db = 'partner_db';         table = 'partners';                  expected = 50  },
    @{ db = 'product_db';         table = 'products';                  expected = 100 },
    @{ db = 'inventory_db';       table = 'stock_balances';            expected = 200 },
    @{ db = 'slip_db';            table = 'slips';                     expected = 100 },
    @{ db = 'partner_order_db';   table = 'partner_orders';            expected = 30  },
    @{ db = 'arologis_db';        table = 'dispatches';                expected = 20  },
    @{ db = 'accounting_db';      table = 'chart_of_accounts';         expected = 65  },
    @{ db = 'groupware_db';       table = 'approval_lines';            expected = 5   },
    @{ db = 'notification_db';    table = 'notification_logs';         expected = 0   },
    @{ db = 'dashboard_db';       table = 'kpi_snapshots';             expected = 1   }
)

$rowSummary = @()
# PS 5.1 native exe 가드 — docker exec psql 호출이 stderr 로 ErrorRecord 를 throw 하지 않도록
# 반복 외곽에서 ErrorActionPreference scope 풀고 finally 로 복원.
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    foreach ($q in $seedQueries) {
        $sql = "SELECT count(*)::text FROM $($q.table);"
        $count = '?'
        try {
            $raw = docker exec samhan-postgres psql -U samhan -d $q.db -tAc $sql 2>$null
            if ($LASTEXITCODE -eq 0 -and $raw) { $count = ($raw | Out-String).Trim() }
        } catch { }
        $verdict = if ($count -eq '?') { 'SKIP (table 미생성)' }
                   elseif ([int]::TryParse($count, [ref]$null) -and ([int]$count -ge $q.expected)) { 'OK' }
                   else { 'LOW' }
        $rowSummary += [pscustomobject]@{
            DB       = $q.db
            Table    = $q.table
            Expected = $q.expected
            Actual   = $count
            Verdict  = $verdict
        }
    }
} finally {
    $ErrorActionPreference = $prevEAP
}
$rowSummary | Format-Table -AutoSize

# -----------------------------------------------------------------------------
# 6. 사용 가이드 출력
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '[6/6] 사용 가이드' -ForegroundColor Yellow
Write-Host ''
Write-Host ' 마스터 로그인 (CEO 김미선):' -ForegroundColor Cyan
Write-Host "   POST http://localhost:$gatewayPort/api/auth/login"
Write-Host '   body: {"loginId":"kimmiseon","password":"<see services/user-service/.../OrgChartSeeder.java>"}'
Write-Host ''
Write-Host ' 모니터링:' -ForegroundColor Cyan
Write-Host "   Eureka       → http://localhost:$eurekaPort"
Write-Host "   API Gateway  → http://localhost:$gatewayPort"
Write-Host '   Prometheus   → http://localhost:9090'
Write-Host '   Grafana      → http://localhost:3100  (admin / samhan_dev_pw)'
Write-Host '   RabbitMQ UI  → http://localhost:15672 (samhan / samhan_dev_pw)'
Write-Host '   MinIO UI     → http://localhost:9001  (samhan / samhan_dev_pw)'
Write-Host ''
Write-Host ' service log:' -ForegroundColor Cyan
Write-Host "   $LogsDir\<service-name>.log"
Write-Host ''
Write-Host ' 종료:' -ForegroundColor Cyan
Write-Host '   .\infrastructure\scripts\stop-local-full.ps1'
Write-Host ''

# 필수 service fail 시 종합 안내
$failedRequired = @($startupResults | Where-Object { $_.Required -and $_.Status -ne 'UP' })
if ($failedRequired -or $failedHealth.Count -gt 0) {
    Write-Host '==============================================================' -ForegroundColor Red
    Write-Host ' 경고 — 필수 service 기동 실패' -ForegroundColor Red
    Write-Host '==============================================================' -ForegroundColor Red
    foreach ($f in $failedRequired) {
        Write-Host "   $($f.Service) (port $($f.Port)): $($f.Status) — log: $($f.Log)" -ForegroundColor Red
    }
    foreach ($f in $failedHealth) {
        Write-Host "   health DOWN: $($f.Service) (port $($f.Port))" -ForegroundColor Red
    }
    Write-Host ''
    exit 1
} else {
    Write-Host '==============================================================' -ForegroundColor Cyan
    Write-Host ' 완료' -ForegroundColor Green
    Write-Host '==============================================================' -ForegroundColor Cyan
}

} finally {
    if ($seedEnvWasDefined) {
        Set-Item 'env:SAMHAN_SEED_TEST_DATA' $seedEnvOriginalValue
    } else {
        Remove-Item 'env:SAMHAN_SEED_TEST_DATA' -ErrorAction SilentlyContinue
    }
}
