param(
    [ValidateSet("smoke", "baseline", "peak", "stress", "soak")]
    [string]$Profile = "smoke",

    [string]$SoakDuration = "7h",

    [switch]$Detach
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[loadtest] $Message"
}

function Assert-HttpOk {
    param(
        [string]$Uri,
        [string]$Name
    )
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 10
        if ($response.StatusCode -ne 200) {
            throw "$Name 상태 코드가 200이 아닙니다: $($response.StatusCode)"
        }
    } catch {
        throw "$Name 사전 점검 실패: $($_.Exception.Message)"
    }
}

function Assert-Login {
    param(
        [string]$LoginId,
        [string]$Password
    )
    $body = @{
        loginId = $LoginId
        password = $Password
    } | ConvertTo-Json -Compress

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:8080/auth/login" `
            -Method Post -ContentType "application/json" -Body $body -TimeoutSec 10
        if ($response.StatusCode -ne 200) {
            throw "HTTP $($response.StatusCode)"
        }
        $json = $response.Content | ConvertFrom-Json
        if ($json.success -ne $true) {
            throw "ApiResponse success=false"
        }
        if ($null -eq $json.data.token -or $json.data.token.Length -eq 0) {
            throw "token 없음"
        }
    } catch {
        throw "로그인 사전 점검 실패($LoginId): $($_.Exception.Message)"
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$k6Dir = Join-Path $repoRoot "perf\k6"
$outDir = Join-Path $k6Dir "out"
$rawDir = Join-Path $repoRoot "docs\qa\local-load-soak-test\raw"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
New-Item -ItemType Directory -Force -Path $rawDir | Out-Null

Write-Step "게이트웨이 health 확인"
Assert-HttpOk -Uri "http://localhost:8080/actuator/health" -Name "api-gateway"

Write-Step "대표 부하 계정 로그인 확인"
$password = "dev_p05_pass!"
Assert-Login -LoginId "dev_sales" -Password $password
Assert-Login -LoginId "dev_warehouse" -Password $password
Assert-Login -LoginId "dev_accountant" -Password $password
Assert-Login -LoginId "dev_manager" -Password $password

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$summaryName = "summary-$Profile-$timestamp.json"
$rawLog = Join-Path $rawDir "k6-$Profile-$timestamp.log"

$mountPath = $k6Dir.Replace("\", "/")
if ($mountPath -match "^[A-Za-z]:") {
    $drive = $mountPath.Substring(0, 1).ToLower()
    $rest = $mountPath.Substring(2)
    $mountPath = "/" + $drive + $rest
}

$dockerArgs = @(
    "run",
    "--rm",
    "--network", "samhan-net",
    "-v", "$mountPath`:/scripts",
    "-e", "STAGE_PROFILE=$Profile",
    "-e", "SOAK_DURATION=$SoakDuration",
    "-e", "BASE_URL=http://api-gateway:8080",
    "grafana/k6",
    "run",
    "--summary-export", "/scripts/out/$summaryName",
    "/scripts/mixed-load.js"
)

if ($Profile -eq "stress") {
    $dockerArgs = @(
        "run",
        "--rm",
        "--network", "samhan-net",
        "-v", "$mountPath`:/scripts",
        "-e", "STAGE_PROFILE=$Profile",
        "-e", "THINK_MIN=0.5",
        "-e", "THINK_MAX=1",
        "-e", "BASE_URL=http://api-gateway:8080",
        "grafana/k6",
        "run",
        "--summary-export", "/scripts/out/$summaryName",
        "/scripts/mixed-load.js"
    )
}

if ($Profile -eq "soak" -and $Detach.IsPresent) {
    Write-Step "soak 백그라운드 컨테이너 실행"
    $detachArgs = @(
        "run",
        "-d",
        "--name", "samhan-k6-soak",
        "--network", "samhan-net",
        "-v", "$mountPath`:/scripts",
        "-e", "STAGE_PROFILE=$Profile",
        "-e", "SOAK_DURATION=$SoakDuration",
        "-e", "BASE_URL=http://api-gateway:8080",
        "grafana/k6",
        "run",
        "--summary-export", "/scripts/out/$summaryName",
        "/scripts/mixed-load.js"
    )
    & docker @detachArgs | Tee-Object -FilePath $rawLog
    Write-Step "로그 확인: docker logs -f samhan-k6-soak"
    Write-Step "summary 예상 경로: perf/k6/out/$summaryName"
    exit 0
}

Write-Step "k6 실행: profile=$Profile summary=$summaryName"
& docker @dockerArgs 2>&1 | Tee-Object -FilePath $rawLog
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    throw "k6 실행 실패: exitCode=$exitCode, rawLog=$rawLog"
}

Write-Step "raw log: $rawLog"
Write-Step "summary: $(Join-Path $outDir $summaryName)"
