<#
.SYNOPSIS
    Notion 4 CSV (REGION / DC / CHAT / BLOCK) 자동 import 스크립트.

.DESCRIPTION
    Phase 11 AWS migration 진입 전 운영 검증 항목 #4 자동화.
    tools/legacy-gas/_notion-export/ 의 4 CSV 를 admin endpoint 4 회 POST 호출.

    동작 순서:
        1) kimmiseon (MASTER) 로그인 → JWT 발급 + claims 디코드 (userId / role)
        2) 4 CSV 를 multipart/form-data 로 admin endpoint 호출
            - REGION : POST http://localhost:8097/admin/arologis/regions/import         (arologis-service)
            - DC     : POST http://localhost:8089/api/v1/dc-config/admin/import         (dc-config-service)
            - CHAT   : POST http://localhost:8093/api/v1/notification/admin/chat-rooms/import  (notification-service)
            - BLOCK  : POST http://localhost:8095/api/v1/partners/admin/blocks/import   (partner-service)
        3) 각 응답 (inserted/updated/rejected/skipped) 표 출력
        4) 종합 합격/불합격 판정

.PARAMETER GatewayUrl
    API Gateway base URL (default http://localhost:8080). 본 script 는 admin endpoint
    의 controller @RequestMapping 이 gateway StripPrefix=2 와 정합되지 않아 service
    port 직접 호출 (Authorization + X-User-Id + X-User-Role 헤더 동시 전달). 로그인은
    gateway 경유.

.PARAMETER LoginId
    JWT 발급용 loginId (default kimmiseon).

.PARAMETER Password
    JWT 발급용 password (default samhan!2026 — OrgChartSeeder seed).

.PARAMETER NotionExportRoot
    Notion CSV export 디렉토리 (default ProjectRoot\tools\legacy-gas\_notion-export).

.PARAMETER ContinueOnError
    1 endpoint fail 시에도 나머지 endpoint 호출 계속 (default false — 첫 fail 에서 중단).

.EXAMPLE
    .\tools\operational-validation\import-notion-csv.ps1

.EXAMPLE
    .\tools\operational-validation\import-notion-csv.ps1 -ContinueOnError

.NOTES
    - Windows PowerShell 5.1 / PowerShell 7+ 호환
    - UTF-8 (BOM 있음, PowerShell 5.1 한글 호환) 으로 저장 — feedback_powershell_utf8_writes 준수
    - secret hardcode 금지 — kimmiseon 비밀번호는 OrgChartSeeder seed (dev only)
    - Endpoint path 는 controller @RequestMapping 실측 + gateway routing (PR #122 BE 리뷰 정합 fix).
      gateway StripPrefix=2 와 mismatch 인 경우 service port 직접 호출 + JWT 헤더 위임.
    - 사전 의존 — start-local-full.ps1 부팅 + 4 service UP
        - arologis-service     (8097)
        - dc-config-service    (8089) — 14 service 외 별도 부팅 필요
        - notification-service (8093)
        - partner-service      (8095)
#>

[CmdletBinding()]
param(
    [string] $GatewayUrl       = 'http://localhost:8080',
    [string] $LoginId          = 'kimmiseon',
    [string] $Password         = 'samhan!2026',
    [string] $NotionExportRoot = '',
    [switch] $ContinueOnError
)

$ErrorActionPreference = 'Stop'

# -----------------------------------------------------------------------------
# 0. 경로 + 설정
# -----------------------------------------------------------------------------
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
if (-not $NotionExportRoot) {
    $NotionExportRoot = Join-Path $ProjectRoot 'tools\legacy-gas\_notion-export'
}

Write-Host ''
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host ' Notion 4 CSV import (운영 검증 항목 #4)' -ForegroundColor Cyan
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host " ProjectRoot      : $ProjectRoot"
Write-Host " GatewayUrl       : $GatewayUrl"
Write-Host " NotionExportRoot : $NotionExportRoot"
Write-Host " LoginId          : $LoginId"
Write-Host ''

if (-not (Test-Path $NotionExportRoot)) {
    throw "NotionExportRoot 가 존재하지 않습니다: $NotionExportRoot"
}

# 4 CSV import 정의
# 디렉토리 이름은 한글 + Notion 의 base CSV 만 사용 (_all.csv 제외).
# url 은 service port 직접 — controller @RequestMapping 과 gateway StripPrefix=2 정합 (PR #122 BE 리뷰 fix).
# expectedRows 는 과거 PR 의 고정 숫자가 아니라 선택된 CSV 의 실제 non-empty row 수로 계산한다.
# Notion 표는 운영 중 행이 늘거나 줄 수 있으므로, stale count 로 정상 import 를 실패 처리하지 않는다.
$imports = @(
    @{
        name           = 'REGION'
        dirName        = '가배차용 지역별 분류표'
        url            = 'http://localhost:8097/admin/arologis/regions/import'
        formField      = 'file'
        omitAuthorization = $true
    },
    @{
        name           = 'DC'
        dirName        = '거래처 DC정보'
        url            = 'http://localhost:8089/api/v1/dc-config/admin/import'
        formField      = 'file'
    },
    @{
        name           = 'CHAT'
        dirName        = '단톡방리스트'
        url            = 'http://localhost:8093/api/v1/notification/admin/chat-rooms/import'
        formField      = 'file'
    },
    @{
        name           = 'BLOCK'
        dirName        = '발송금지리스트'
        url            = 'http://localhost:8095/api/v1/partners/admin/blocks/import'
        formField      = 'file'
    }
)

function Get-CsvDataRowCount {
    param([string] $Path)

    $rows = @(Import-Csv -LiteralPath $Path)
    if ($rows.Count -eq 0) {
        return 0
    }

    $firstHeader = $rows[0].PSObject.Properties.Name | Select-Object -First 1
    if (-not $firstHeader) {
        return $rows.Count
    }

    return @($rows | Where-Object {
        $value = $_.PSObject.Properties[$firstHeader].Value
        -not [string]::IsNullOrWhiteSpace([string] $value)
    }).Count
}

# -----------------------------------------------------------------------------
# 0-1. JWT base64url payload 디코드 (X-User-Id / X-User-Role 추출 헬퍼)
# -----------------------------------------------------------------------------
function Get-JwtClaims {
    param([string] $Token)
    $parts = $Token -split '\.'
    if ($parts.Length -lt 2) {
        throw "JWT 형식 오류 (segment 부족): $Token"
    }
    $payload = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($payload.Length % 4) {
        2 { $payload += '==' }
        3 { $payload += '=' }
    }
    $bytes = [System.Convert]::FromBase64String($payload)
    $json  = [System.Text.Encoding]::UTF8.GetString($bytes)
    return ($json | ConvertFrom-Json)
}

# -----------------------------------------------------------------------------
# 1. JWT 발급 (kimmiseon)
# -----------------------------------------------------------------------------
Write-Host '[1/3] JWT 발급 (kimmiseon = MASTER)' -ForegroundColor Yellow

$loginUrl  = "$GatewayUrl/api/auth/login"
$loginBody = @{ loginId = $LoginId; password = $Password } | ConvertTo-Json -Compress
$token     = $null
$userId    = $null
$roleName  = $null
try {
    $loginResp = Invoke-RestMethod -Uri $loginUrl -Method POST `
        -ContentType 'application/json' -Body $loginBody -TimeoutSec 10
    $token = $loginResp.data.accessToken
    if (-not $token) {
        # auth-service 최신 응답은 accessToken 대신 token 필드를 사용한다.
        $token = $loginResp.data.token
    }
    if (-not $token) {
        throw "응답에 accessToken/token 부재 — body=$($loginResp | ConvertTo-Json -Compress)"
    }
    $claims   = Get-JwtClaims -Token $token
    $userId   = $claims.sub
    $roleName = $claims.role
    if (-not $userId -or -not $roleName) {
        throw "JWT claims 부재 (sub / role) — claims=$($claims | ConvertTo-Json -Compress)"
    }
    Write-Host "   OK — JWT 발급 (length=$($token.Length), sub=$userId, role=$roleName)" -ForegroundColor Green
} catch {
    Write-Host "   FAIL — 로그인 실패: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   확인 사항:" -ForegroundColor Yellow
    Write-Host "     1) start-local-full.ps1 가 부팅 완료되었는지" -ForegroundColor DarkGray
    Write-Host "     2) auth-service (8081) + api-gateway (8080) UP 인지" -ForegroundColor DarkGray
    Write-Host "     3) kimmiseon 비밀번호 = samhan!2026 인지 (OrgChartSeeder)" -ForegroundColor DarkGray
    throw
}

# -----------------------------------------------------------------------------
# 2. 4 CSV import 호출
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '[2/3] 4 CSV import 호출 (service port 직접 — gateway StripPrefix=2 mismatch 우회)' -ForegroundColor Yellow

$results = @()
foreach ($imp in $imports) {
    Write-Host ''
    Write-Host "   ▶ $($imp.name) — $($imp.url)" -ForegroundColor Cyan

    # CSV 파일 탐색 — _all.csv 제외, 첫 .csv 1 개 사용
    $dirPath = Join-Path $NotionExportRoot $imp.dirName
    if (-not (Test-Path $dirPath)) {
        Write-Host "     SKIP — 디렉토리 부재: $dirPath" -ForegroundColor Yellow
        $results += [pscustomobject]@{
            DB        = $imp.name
            Url       = $imp.url
            Expected  = '?'
            Inserted  = '?'
            Updated   = '?'
            Rejected  = '?'
            Status    = 'NO_FILE'
            Verdict   = 'SKIP'
        }
        continue
    }
    $csvFile = Get-ChildItem -Path $dirPath -Filter '*.csv' |
        Where-Object { $_.Name -notmatch '_all\.csv$' } |
        Select-Object -First 1
    if (-not $csvFile) {
        Write-Host "     SKIP — .csv 파일 부재: $dirPath" -ForegroundColor Yellow
        $results += [pscustomobject]@{
            DB        = $imp.name
            Url       = $imp.url
            Expected  = '?'
            Inserted  = '?'
            Updated   = '?'
            Rejected  = '?'
            Status    = 'NO_CSV'
            Verdict   = 'SKIP'
        }
        continue
    }
    $expectedRows = Get-CsvDataRowCount -Path $csvFile.FullName
    Write-Host "     CSV : $($csvFile.Name) ($($csvFile.Length) bytes, expectedRows=$expectedRows)" -ForegroundColor DarkGray

    # multipart/form-data 호출
    # PowerShell 5.1 호환 — Invoke-WebRequest -Form 미지원 → 수동 multipart body 구성
    # gateway 미경유 → JWT (Authorization) + X-User-Id + X-User-Role 동시 전달.
    # downstream HeaderAuthenticationFilter 가 X-User-* 신뢰 → @PreAuthorize 통과.
    $url = $imp.url
    $headers = @{
        'X-User-Id'     = $userId
        'X-User-Role'   = $roleName
    }
    if (-not $imp.omitAuthorization) {
        $headers['Authorization'] = "Bearer $token"
    }

    $boundary = [System.Guid]::NewGuid().ToString()
    $LF       = "`r`n"
    $fileBytes = [System.IO.File]::ReadAllBytes($csvFile.FullName)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $memory = New-Object System.IO.MemoryStream
    $writeText = {
        param([string] $Text)
        $bytes = $utf8NoBom.GetBytes($Text)
        $memory.Write($bytes, 0, $bytes.Length)
    }
    & $writeText "--$boundary$LF"
    & $writeText "Content-Disposition: form-data; name=`"$($imp.formField)`"; filename=`"$($csvFile.Name)`"$LF"
    & $writeText "Content-Type: text/csv; charset=utf-8$LF$LF"
    $memory.Write($fileBytes, 0, $fileBytes.Length)
    & $writeText "$LF--$boundary--$LF"
    $bodyBytes = $memory.ToArray()
    $memory.Dispose()

    $contentType = "multipart/form-data; boundary=$boundary"

    $status   = 'UNKNOWN'
    $inserted = 0
    $updated  = 0
    $rejected = 0
    $verdict  = 'FAIL'
    try {
        $resp = Invoke-WebRequest -Uri $url -Method POST `
            -Headers $headers -ContentType $contentType -Body $bodyBytes `
            -TimeoutSec 60 -UseBasicParsing

        $status = "$($resp.StatusCode)"
        if ($resp.StatusCode -eq 200) {
            try {
                $json = $resp.Content | ConvertFrom-Json
                $payload = if ($json.data) { $json.data } else { $json }

                # 공통 필드 시도 (서비스 별 DTO 차이 흡수)
                if ($payload.PSObject.Properties.Name -contains 'inserted')        { $inserted = [int]$payload.inserted }
                if ($payload.PSObject.Properties.Name -contains 'updated')         { $updated  = [int]$payload.updated }
                if ($payload.PSObject.Properties.Name -contains 'imported')        { $inserted = [int]$payload.imported }
                if ($payload.PSObject.Properties.Name -contains 'totalRows')       { } # info only
                if ($payload.PSObject.Properties.Name -contains 'rejected') {
                    if ($payload.rejected -is [array]) { $rejected = $payload.rejected.Count }
                    else { $rejected = [int]$payload.rejected }
                }
                if ($payload.PSObject.Properties.Name -contains 'alreadyBlocked') {
                    $updated += [int]$payload.alreadyBlocked
                }

                $total = $inserted + $updated
                if ($total -ge $expectedRows -and $rejected -eq 0) {
                    $verdict = 'OK'
                } elseif ($total -ge $expectedRows) {
                    $verdict = 'OK_WITH_REJECTS'
                } elseif ($total -gt 0) {
                    $verdict = 'PARTIAL'
                } else {
                    $verdict = 'EMPTY'
                }
            } catch {
                $verdict = 'PARSE_FAIL'
            }
        } else {
            $verdict = 'NON_200'
        }
        $verdictColor = 'Yellow'
        if ($verdict -eq 'OK') { $verdictColor = 'Green' }
        Write-Host "     $status — inserted=$inserted updated=$updated rejected=$rejected verdict=$verdict" `
            -ForegroundColor $verdictColor
    } catch {
        $msg = $_.Exception.Message
        # WebException 응답 status 추출 시도
        if ($_.Exception.Response) {
            try { $status = "$([int]$_.Exception.Response.StatusCode)" } catch { }
        }
        Write-Host "     FAIL — $status — $msg" -ForegroundColor Red
        $verdict = 'EXCEPTION'
        if (-not $ContinueOnError) {
            $results += [pscustomobject]@{
                DB        = $imp.name
                Url       = $imp.url
                Expected  = $expectedRows
                Inserted  = $inserted
                Updated   = $updated
                Rejected  = $rejected
                Status    = $status
                Verdict   = $verdict
            }
            Write-Host ''
            Write-Host '   [중단] -ContinueOnError 옵션 미지정 — 첫 fail 에서 종료.' -ForegroundColor Red
            break
        }
    }

    $results += [pscustomobject]@{
        DB        = $imp.name
        Url       = $imp.url
        Expected  = $expectedRows
        Inserted  = $inserted
        Updated   = $updated
        Rejected  = $rejected
        Status    = $status
        Verdict   = $verdict
    }
}

# -----------------------------------------------------------------------------
# 3. 종합 합격/불합격 판정
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '[3/3] 종합 결과' -ForegroundColor Yellow
$results | Format-Table -AutoSize

$okCount   = ($results | Where-Object { $_.Verdict -eq 'OK' }).Count
$failCount = ($results | Where-Object { $_.Verdict -ne 'OK' }).Count

Write-Host ''
if ($failCount -eq 0) {
    Write-Host '==============================================================' -ForegroundColor Green
    Write-Host " 합격 — 4 CSV import 모두 OK" -ForegroundColor Green
    Write-Host '==============================================================' -ForegroundColor Green
    Write-Host " docs/operational-validation/README.md 의 §2 항목 4 를 ✅ update 권장." -ForegroundColor DarkGray
    Write-Host ''
    exit 0
} else {
    Write-Host '==============================================================' -ForegroundColor Red
    Write-Host " 불합격 — $failCount 항목 fail / 합격 $okCount 항목" -ForegroundColor Red
    Write-Host '==============================================================' -ForegroundColor Red
    Write-Host " 트러블슈팅 — docs/operational-validation/notion-csv-import-validation.md §5" -ForegroundColor DarkGray
    Write-Host ''
    exit 1
}
