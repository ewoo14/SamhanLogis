param(
    [int]$IntervalSec = 300,
    [string]$OutDir = "",
    [switch]$Once
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot 'lib\qa-shots-dir.ps1')
# contrast-1 fix (2026-07-28 R1 adversarial review): the param default used to be an
# unguarded inline ternary ($env:QA_SHOTS_DIR assigned directly), invisible to
# discoverQaResolverSources()'s function-declaration-only detection regex.
#
# 2026-07-28 재수렴 D-C: 위 대조-1 fix 는 "-OutDir 명시 시 이전 동작 그대로" 로 물리 가드를
# 건너뛰게 남겨뒀는데, 이게 그 자체로 새 결함이었다(신규 clone 실측 — repoRoot-relative
# "docs/qa/local-load-soak-test/timeseries" 를 -OutDir 로 주면 커밋된 timeseries CSV 를
# 가드 없이 덮어씀). 이제 무조건 Resolve-QaShotsDir 를 부르고 원문을 -RequestedDir 로 넘겨
# 같은 물리 판정을 받게 하되, "-OutDir 는 repoRoot 기준 상대경로" 라는 기존 계약은
# -BaseDir $repoRoot 로 그대로 유지한다(T-3, cwd 기준이 아님 — 이 스크립트는 장시간 백그라운드
# 실행이라 호출 당시 cwd 에 의존하면 안 된다).
$resolvedOutDir = Resolve-QaShotsDir -CommittedDir (Join-Path $repoRoot "docs/qa/local-load-soak-test/timeseries") -RequestedDir $OutDir -BaseDir $repoRoot
New-Item -ItemType Directory -Force -Path $resolvedOutDir | Out-Null
$csvPath = Join-Path $resolvedOutDir ("metrics-" + (Get-Date -Format "yyyyMMdd") + ".csv")

function Invoke-PromQuery {
    param([string]$Query)
    try {
        $encoded = [System.Uri]::EscapeDataString($Query)
        $uri = "http://localhost:9090/api/v1/query?query=$encoded"
        $response = Invoke-RestMethod -UseBasicParsing -Uri $uri -TimeoutSec 10
        if ($response.status -ne "success") {
            return "NA"
        }
        if ($response.data.result.Count -eq 0) {
            return "NA"
        }
        return ($response.data.result | ConvertTo-Json -Compress -Depth 8).Replace('"', '""')
    } catch {
        return "NA"
    }
}

function Invoke-DockerText {
    param([string[]]$Arguments)
    try {
        $output = & docker @Arguments 2>&1
        if ($LASTEXITCODE -ne 0) {
            return "DOCKER_ERROR"
        }
        return (($output | Out-String).Trim()).Replace('"', '""')
    } catch {
        return "DOCKER_ERROR"
    }
}

function Get-AbnormalContainerCount {
    $text = Invoke-DockerText -Arguments @("ps", "-a", "--format", "{{.Names}}|{{.Status}}")
    if ($text -eq "DOCKER_ERROR" -or $text.Length -eq 0) {
        return $text
    }
    $count = 0
    $lines = $text -split "`r?`n"
    foreach ($line in $lines) {
        $parts = $line -split "\|", 2
        $name = $parts[0]
        if ($name -notlike "samhan-*") {
            continue
        }
        # status 토큰({{.Status}})은 "Up 25 hours (healthy)" 형식이라 줄 전체가 아닌 status 토큰을 직접 본다.
        # 정상 = "Up" 으로 시작 + "(unhealthy)" 미포함. "(health: starting)" 은 기동 중이라 정상 취급(soak 재배포 직후 오탐 방지).
        $status = if ($parts.Count -gt 1) { $parts[1].Trim() } else { "" }
        if ($status -notmatch "^Up" -or $status -match "unhealthy") {
            $count += 1
        }
    }
    return $count
}

function Get-TopMemoryStats {
    $text = Invoke-DockerText -Arguments @("stats", "--no-stream", "--format", "{{.Name}}|{{.MemUsage}}")
    if ($text -eq "DOCKER_ERROR" -or $text.Length -eq 0) {
        return $text
    }
    $rows = $text -split "`r?`n"
    $top = $rows | Select-Object -First 5
    return (($top -join "; ").Replace('"', '""'))
}

function Write-Snapshot {
    $timestamp = (Get-Date).ToString("o")
    $heap = Invoke-PromQuery -Query 'sum by (application) (jvm_memory_used_bytes{area="heap"})'
    $hikariActive = Invoke-PromQuery -Query 'sum by (application,pool) (hikaricp_connections_active)'
    $hikariPending = Invoke-PromQuery -Query 'sum by (application,pool) (hikaricp_connections_pending)'
    $hikariTimeout = Invoke-PromQuery -Query 'sum by (application,pool) (increase(hikaricp_connections_timeout_total[5m]))'
    $http5xx = Invoke-PromQuery -Query 'sum by (application) (rate(http_server_requests_seconds_count{status=~"5.."}[5m]))'
    if ($http5xx -eq "NA") {
        $http5xx = Invoke-PromQuery -Query 'sum by (application) (rate(spring_cloud_gateway_requests_seconds_count{httpStatusCode=~"5.."}[5m]))'
    }
    $abnormal = Get-AbnormalContainerCount
    $topMem = Get-TopMemoryStats

    if (-not (Test-Path $csvPath)) {
        "timestamp,heap_used_by_service,hikari_active,hikari_pending,hikari_timeout_5m,http_5xx_rate_5m,abnormal_container_count,docker_top_mem" |
            Out-File -FilePath $csvPath -Encoding utf8
    }
    '"' + $timestamp + '","' + $heap + '","' + $hikariActive + '","' + $hikariPending + '","' + $hikariTimeout + '","' + $http5xx + '","' + $abnormal + '","' + $topMem + '"' |
        Out-File -FilePath $csvPath -Encoding utf8 -Append
    Write-Host "[metrics] snapshot appended: $csvPath"
}

do {
    Write-Snapshot
    if ($Once.IsPresent) {
        break
    }
    Start-Sleep -Seconds $IntervalSec
} while ($true)
