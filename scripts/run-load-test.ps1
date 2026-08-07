param(
    [ValidateSet("smoke", "baseline", "peak", "stress", "soak", "verify-relogin")]
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

# Windows PowerShell 5.1에서는 native stderr 파이프가 종료 오류가 될 수 있어 파일로 직접 캡처한다.
function Add-FileBytes {
    param(
        [string]$SourcePath,
        [string]$TargetPath
    )

    if (-not (Test-Path $SourcePath)) {
        return
    }

    $bytes = [System.IO.File]::ReadAllBytes($SourcePath)
    if ($bytes.Length -eq 0) {
        return
    }

    $stream = [System.IO.File]::Open($TargetPath, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
    try {
        $stream.Write($bytes, 0, $bytes.Length)
    } finally {
        $stream.Dispose()
    }
}

function Invoke-DockerCaptured {
    param(
        [string[]]$Arguments,
        [string]$LogPath,
        [switch]$Append,
        [int]$TailLines = 8
    )

    $logDir = Split-Path -Parent $LogPath
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

    if (-not $Append.IsPresent -and (Test-Path $LogPath)) {
        Remove-Item -Path $LogPath -Force
    }

    $suffix = [Guid]::NewGuid().ToString("N")
    $stdoutLog = Join-Path $logDir "docker-$suffix.stdout.log"
    $stderrLog = Join-Path $logDir "docker-$suffix.stderr.log"

    try {
        $process = Start-Process -FilePath "docker" -ArgumentList $Arguments -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

        Add-FileBytes -SourcePath $stdoutLog -TargetPath $LogPath
        Add-FileBytes -SourcePath $stderrLog -TargetPath $LogPath

        if ($TailLines -gt 0 -and (Test-Path $LogPath)) {
            Get-Content -Path $LogPath -Tail $TailLines | ForEach-Object { Write-Host $_ }
        }

        return $process.ExitCode
    } finally {
        if (Test-Path $stdoutLog) {
            Remove-Item -Path $stdoutLog -Force
        }
        if (Test-Path $stderrLog) {
            Remove-Item -Path $stderrLog -Force
        }
    }
}

function Ensure-K6DockerImage {
    param([string]$LogPath)

    Write-Step "k6 Docker 이미지 확인"
    $inspectExitCode = Invoke-DockerCaptured -Arguments @("image", "inspect", "grafana/k6") -LogPath $LogPath -TailLines 0
    if ($inspectExitCode -eq 0) {
        return
    }

    Write-Step "grafana/k6 이미지 없음: docker pull 실행"
    $pullExitCode = Invoke-DockerCaptured -Arguments @("pull", "grafana/k6") -LogPath $LogPath -Append -TailLines 10
    if ($pullExitCode -ne 0) {
        throw "k6 Docker 이미지 pull 실패: exitCode=$pullExitCode, rawLog=$LogPath"
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
$password = $env:QA_DEV_DEFAULT_PASSWORD
if ([string]::IsNullOrWhiteSpace($password)) {
    throw 'QA_DEV_DEFAULT_PASSWORD 환경변수를 설정해야 합니다.'
}
Assert-Login -LoginId "dev_sales" -Password $password
Assert-Login -LoginId "dev_warehouse" -Password $password
Assert-Login -LoginId "dev_accountant" -Password $password
Assert-Login -LoginId "dev_manager" -Password $password

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$summaryName = "summary-$Profile-$timestamp.json"
$rawLog = Join-Path $rawDir "k6-$Profile-$timestamp.log"
$imageLog = Join-Path $rawDir "k6-image-$timestamp.log"

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

Ensure-K6DockerImage -LogPath $imageLog

if ($Profile -eq "soak" -and $Detach.IsPresent) {
    # 같은 이름의 이전 detach 컨테이너가 남아 있으면 새 soak 가 즉시 실패하므로 선정리한다.
    Invoke-DockerCaptured -Arguments @("rm", "-f", "samhan-k6-soak") -LogPath $rawLog -TailLines 0 | Out-Null

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
    $detachExitCode = Invoke-DockerCaptured -Arguments $detachArgs -LogPath $rawLog
    if ($detachExitCode -ne 0) {
        throw "soak 백그라운드 컨테이너 실행 실패: exitCode=$detachExitCode, rawLog=$rawLog"
    }
    Write-Step "로그 확인: docker logs -f samhan-k6-soak"
    Write-Step "summary 예상 경로: perf/k6/out/$summaryName"
    Write-Step "주의: -Detach 는 docker wait 를 수행하지 않아 summary 수집/성공 판정을 즉시 보장하지 않습니다."
    exit 0
}

Write-Step "k6 실행: profile=$Profile summary=$summaryName"
$exitCode = Invoke-DockerCaptured -Arguments $dockerArgs -LogPath $rawLog
if ($exitCode -ne 0) {
    throw "k6 실행 실패: exitCode=$exitCode, rawLog=$rawLog"
}

Write-Step "Docker 이미지 준비 로그: $imageLog"
Write-Step "raw log: $rawLog"
Write-Step "summary: $(Join-Path $outDir $summaryName)"

# P3 한계: image/raw log 는 실행별 파일로 누적 보존한다. 장기 운영 시 별도 보관 정책으로 정리한다.
