param(
    [switch]$SkipBuild,
    [switch]$SkipClients,
    [switch]$SerialBuild,
    [switch]$Rebuild,
    [switch]$TunnelExpo
)

$ErrorActionPreference = "Stop"

# PowerShell 5.1 (cp949) 환경에서 한글 console 출력 보존 — [feedback_powershell_utf8_writes]
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Assert-Command {
    param([string]$Name, [string]$Hint)
    $exists = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $exists) {
        throw "[local-stack] '$Name' 미설치. $Hint"
    }
}

function Assert-DockerDaemon {
    try {
        docker info 2>$null | Out-Null
    } catch {
        # Get-Command 으로 잡혔어도 daemon 미가동 시 docker info 가 비정상 종료
    }
    if ($LASTEXITCODE -ne 0) {
        throw "[local-stack] Docker daemon 미가동. Docker Desktop 실행 후 다시 시도하세요."
    }
}

Assert-Command "docker" "Docker Desktop 설치 (https://www.docker.com/products/docker-desktop)"
Assert-Command "java"   "JDK 17 설치 후 JAVA_HOME 설정"
Assert-Command "npm.cmd" "Node.js 20+ 설치"
Assert-DockerDaemon

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$localEnvHelper = Join-Path $RepoRoot "infrastructure\scripts\ensure-local-env.ps1"
. (Resolve-Path -LiteralPath $localEnvHelper)
$localEnvFile = Initialize-SamhanLocalEnv -ProjectRoot $RepoRoot
$portResolver = Join-Path $RepoRoot "scripts\lib\local-stack-port.ps1"
. (Resolve-Path -LiteralPath $portResolver)
$eurekaPort = Get-LocalStackPort -Service 'eureka-server'
$gatewayPort = Get-LocalStackPort -Service 'api-gateway'
$authPort = Get-LocalStackPort -Service 'auth-service'
$dashboardPort = Get-LocalStackPort -Service 'dashboard-service'
$ComposeFiles = @(
    "-f", "infrastructure/docker-compose.yml",
    "-f", "infrastructure/docker-compose.local-all.yml"
)
$LogDir = Join-Path $RepoRoot "logs/local-stack/clients"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Invoke-AtRoot {
    param([scriptblock]$Block)
    Push-Location $RepoRoot
    try { & $Block } finally { Pop-Location }
}

function Wait-Http {
    param(
        [string]$Name,
        [string]$Url,
        [int]$TimeoutSeconds = 180
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                Write-Host "[local-stack] OK $Name $Url"
                return
            }
        } catch {
            Start-Sleep -Seconds 3
        }
    } while ((Get-Date) -lt $deadline)
    throw "[local-stack] TIMEOUT $Name $Url"
}

function Wait-Postgres {
    $deadline = (Get-Date).AddSeconds(120)
    do {
        Invoke-AtRoot {
            docker exec samhan-postgres pg_isready -U samhan | Out-Null
        }
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[local-stack] OK postgres pg_isready"
            return
        }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    throw "[local-stack] TIMEOUT postgres pg_isready"
}

function Start-Client {
    param(
        [string]$Name,
        [string]$Path
    )
    $clientDir = Join-Path $RepoRoot $Path
    $logPath = Join-Path $LogDir "$Name.log"
    $pidPath = Join-Path $LogDir "$Name.pid"
    $command = "cd /d `"$clientDir`" && npm.cmd run local-dev *> `"$logPath`""
    $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $command -PassThru -WindowStyle Hidden
    # MIG-23 사이클 1e fix (Codex Maintainability/Test MAJOR) — stop-local-stack.ps1 *.pid 종료 호환
    $process.Id | Out-File -FilePath $pidPath -Encoding UTF8 -Force
    Write-Host ("[local-stack] client {0,-18} pid={1} log={2}" -f $Name, $process.Id, $logPath)
}

Invoke-AtRoot {
    if (-not $SkipBuild) {
        Write-Host "[local-stack] bootJar build 시작"
        $gradleOpts = if ($SerialBuild) {
            @('--no-daemon', '--no-parallel')
        } else {
            @('--parallel', '--max-workers=2')
        }
        ./gradlew.bat `
            :services:eureka-server:bootJar `
            :services:api-gateway:bootJar `
            :services:auth-service:bootJar `
            :services:user-service:bootJar `
            :services:product-service:bootJar `
            :services:inventory-service:bootJar `
            :services:slip-service:bootJar `
            :services:accounting-service:bootJar `
            :services:partner-order-service:bootJar `
            :services:dc-config-service:bootJar `
            :services:partner-auth-service:bootJar `
            :services:groupware-service:bootJar `
            :services:notification-service:bootJar `
            :services:dashboard-service:bootJar `
            :services:partner-service:bootJar `
            :services:arologis-service:bootJar `
            @gradleOpts
        $buildExitCode = $LASTEXITCODE
        if ($buildExitCode -ne 0) {
            throw "[local-stack] bootJar build 실패 (exit $buildExitCode)"
        }
    }

    Write-Host "[local-stack] docker compose up -d"
    $composeArgs = if ($Rebuild) { @('up', '-d', '--build') } else { @('up', '-d') }
    docker compose --env-file $localEnvFile @ComposeFiles @composeArgs
    $composeExitCode = $LASTEXITCODE
    if ($composeExitCode -ne 0) {
        throw "[local-stack] docker compose up 실패 (exit $composeExitCode)"
    }
}

Wait-Postgres
Wait-Http "eureka" "http://localhost:$eurekaPort/actuator/health" 180
Wait-Http "gateway" "http://localhost:$gatewayPort/actuator/health" 180
Wait-Http "auth" "http://localhost:$authPort/actuator/health" 180
Wait-Http "dashboard" "http://localhost:$dashboardPort/actuator/health" 180

if (-not $SkipClients) {
    if ($TunnelExpo) {
        Write-Host "[local-stack] TunnelExpo 요청은 Expo CLI에서 수동 전환합니다. 기본 실행은 --localhost 입니다."
    }
    Start-Client "desktop" "clients/desktop"
    Start-Client "mobile" "clients/mobile"
    Start-Client "mobile-staff" "clients/mobile-staff"
    Start-Client "estimate-app" "clients/web/estimate-app"
    Start-Client "order-app" "clients/web/order-app"
    Start-Client "design-system" "clients/web/design-system"
    Start-Client "arologis-desktop" "clients/arologis-desktop"
    Start-Client "arologis-mobile" "clients/arologis-mobile"
}

Write-Host ""
Write-Host "SamhanLogis local stack URLs"
Write-Host "  API Gateway       http://localhost:$gatewayPort"
Write-Host "  Eureka            http://localhost:$eurekaPort"
Write-Host "  Grafana           http://localhost:3000  (자격: infrastructure/.env)"
Write-Host "  Prometheus        http://localhost:9090"
Write-Host "  MinIO Console     http://localhost:9001  (자격: infrastructure/.env)"
Write-Host "  Desktop           Electron 자동 실행, Vite renderer http://localhost:5173"
Write-Host "  Estimate Web      http://localhost:5183"
Write-Host "  Order Web         http://localhost:5180"
Write-Host "  Design System     http://localhost:5176"
Write-Host "  Arologis Desktop  Electron 자동 실행, API http://localhost:$(Get-LocalStackPort -Service 'arologis-service')"
Write-Host "  Mobile QR         Expo 터미널 로그: $LogDir"
Write-Host ""
Write-Host "Seed 실행: .\scripts\seed-local-stack.ps1"
