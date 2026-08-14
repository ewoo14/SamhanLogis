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
Write-Host '🚩 health 가 healthy 로 바뀔 때까지 기다린 뒤 검증하십시오.' -ForegroundColor Yellow
Write-Host '🚩 Flyway 신규 마이그레이션이 있으면 적용 여부를 직접 확인하십시오:' -ForegroundColor Yellow
Write-Host '   docker exec samhan-postgres psql -U samhan -d <db> -c "select version, description from flyway_schema_history order by installed_rank desc limit 3;"'
