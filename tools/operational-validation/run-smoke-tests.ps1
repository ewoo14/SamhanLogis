<#
.SYNOPSIS
    14 service 헬스 + 주요 endpoint smoke test 자동화 스크립트.

.DESCRIPTION
    Phase 11 AWS migration 진입 전 운영 검증 항목 #6 자동화.
    start-local-full.ps1 부팅 후 모든 service 가 healthy 한지 + 주요 endpoint 가 200 인지 검증.

    동작 순서:
        1) 14 service /actuator/health 200 검증 (+ dc-config-service 선택)
        2) kimmiseon (MASTER) 로그인 → JWT 발급 + claims 디코드 (sub/role)
        3) 8 endpoint smoke test (gateway 경유 + service port 직접 혼합):
            - GET /api/v1/auth/me                          (auth-service via gateway, controller /auth/me)
            - GET /api/v1/products?page=0&size=10          (product-service via gateway, controller /products)
            - GET /api/v1/inventory/balances?page=0&size=10 (inventory-service via gateway, controller /inventory/balances)
            - GET /api/v1/slips?page=0&size=10             (slip-service via gateway, controller /slips)
            - GET http://localhost:<resolved>/admin/partners?page=0&size=10  (partner-service direct)
            - GET http://localhost:<resolved>/admin/notifications?page=0&size=10  (notification-service direct)
            - GET http://localhost:<resolved>/admin/dashboard/kpi?from=...&to=... (dashboard-service direct)
        4) 종합 합격/불합격 판정

.PARAMETER GatewayUrl
    API Gateway base URL (default http://localhost:8080). 기본값 사용 시 health 검증에서 탐지한
    api-gateway 실제 포트로 보정한다. 일부 admin endpoint 는 service port 직접 호출
    (Authorization + X-User-Id + X-User-Role 헤더 동시 전달).

.PARAMETER LoginId
    JWT 발급용 loginId (default kimmiseon).

.PARAMETER Password
    JWT 발급용 password (QA_MASTER_PASSWORD 환경변수).

.PARAMETER SkipDcConfig
    dc-config-service (port 8089) 헬스 검증 생략. default $false (검증).

.EXAMPLE
    .\tools\operational-validation\run-smoke-tests.ps1

.EXAMPLE
    .\tools\operational-validation\run-smoke-tests.ps1 -SkipDcConfig

.NOTES
    - Windows PowerShell 5.1 / PowerShell 7+ 호환
    - UTF-8 (BOM 있음, PowerShell 5.1 한글 호환) 으로 저장 — feedback_powershell_utf8_writes 준수
    - secret hardcode 금지 — kimmiseon 비밀번호는 QA_MASTER_PASSWORD 환경변수에서 읽는다.
    - Endpoint path 는 controller @RequestMapping 실측 + gateway routing (PR #122 BE 리뷰 정합 fix).
      gateway 라우팅하지 않는 direct endpoint 는 health 검증에서 탐지한 service port 재사용.
    - 사전 의존 — start-local-full.ps1 부팅 + 14 service UP
#>

[CmdletBinding()]
param(
    [string] $GatewayUrl   = 'http://localhost:8080',
    [string] $LoginId      = 'kimmiseon',
    [string] $Password     = $env:QA_MASTER_PASSWORD,
    [switch] $SkipDcConfig
)

$ErrorActionPreference = 'Stop'
$requiredPassword = $Password
if ([string]::IsNullOrWhiteSpace($requiredPassword)) {
    throw 'QA_MASTER_PASSWORD 환경변수를 설정하거나 -Password를 지정해야 합니다.'
}
$defaultGatewayUrl = 'http://localhost:8080'

# -----------------------------------------------------------------------------
# 0. 설정
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host ' 14 service 헬스 + 주요 endpoint smoke test (운영 검증 항목 #6)' -ForegroundColor Cyan
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host " GatewayUrl : $GatewayUrl"
Write-Host " LoginId    : $LoginId"
Write-Host ''

# 14 service 정의 (start-local-full.ps1 와 일치). 일부 개발 PC 는 8086/8088 등을 로컬 도구가
# 이미 점유하여 start-local-full.ps1 가 +100 포트로 우회한다. health 검증 전 실제 포트를 탐지한다.
$services = @(
    @{ name = 'eureka-server';         port = 8761; env = 'SAMHAN_EUREKA_PORT' },
    @{ name = 'auth-service';          port = 8081; env = 'SAMHAN_AUTH_PORT' },
    @{ name = 'user-service';          port = 8083; env = 'SAMHAN_USER_PORT' },
    @{ name = 'product-service';       port = 8084; env = 'SAMHAN_PRODUCT_PORT' },
    @{ name = 'partner-service';       port = 8095; env = 'SAMHAN_PARTNER_PORT' },
    @{ name = 'inventory-service';     port = 8085; env = 'SAMHAN_INVENTORY_PORT' },
    @{ name = 'accounting-service';    port = 8087; env = 'SAMHAN_ACCOUNTING_PORT' },
    @{ name = 'slip-service';          port = 8086; env = 'SAMHAN_SLIP_PORT' },
    @{ name = 'partner-order-service'; port = 8088; env = 'SAMHAN_PARTNER_ORDER_PORT' },
    @{ name = 'arologis-service';      port = 8097; env = 'SAMHAN_AROLOGIS_PORT' },
    @{ name = 'groupware-service';     port = 8092; env = 'SAMHAN_GROUPWARE_PORT' },
    @{ name = 'notification-service';  port = 8093; env = 'SAMHAN_NOTIFICATION_PORT' },
    @{ name = 'dashboard-service';     port = 8094; env = 'SAMHAN_DASHBOARD_PORT' },
    @{ name = 'api-gateway';           port = 8080; env = 'SAMHAN_API_GATEWAY_PORT' }
)
if (-not $SkipDcConfig) {
    $services += @{ name = 'dc-config-service'; port = 8089; env = 'SAMHAN_DC_CONFIG_PORT' }
}

function Test-HealthPort {
    param([int] $Port)
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$Port/actuator/health" `
            -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Resolve-ServicePort {
    param($Service)
    $envValue = [Environment]::GetEnvironmentVariable($Service.env)
    if ($envValue -and $envValue -match '^\d+$') {
        return [int] $envValue
    }
    if (Test-HealthPort -Port $Service.port) {
        return [int] $Service.port
    }
    $fallback = [int] $Service.port + 100
    if (Test-HealthPort -Port $fallback) {
        return $fallback
    }
    return [int] $Service.port
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
# 1. 14 service /actuator/health 검증
# -----------------------------------------------------------------------------
Write-Host '[1/3] service /actuator/health 검증' -ForegroundColor Yellow

$healthResults = @()
$servicePortByName = @{}
foreach ($svc in $services) {
    $actualPort = Resolve-ServicePort -Service $svc
    $svc.port = $actualPort
    $servicePortByName[$svc.name] = $actualPort
    $url    = "http://localhost:$actualPort/actuator/health"
    $status = 'DOWN'
    $body   = ''
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($r.StatusCode -eq 200) {
            $status = 'UP'
            try {
                $json = $r.Content | ConvertFrom-Json
                if ($json.status) { $body = $json.status } else { $body = 'OK' }
            } catch {
                $body = '200 non-json'
            }
        } else {
            $status = "HTTP_$($r.StatusCode)"
        }
    } catch {
        # connection refused / timeout — DOWN 유지
        $body = $_.Exception.Message
        if ($body.Length -gt 60) { $body = $body.Substring(0, 60) + '...' }
    }
    $healthResults += [pscustomobject]@{
        Service = $svc.name
        Port    = $actualPort
        Status  = $status
        Body    = $body
    }
}
$healthResults | Format-Table -AutoSize

$downCount = ($healthResults | Where-Object { $_.Status -ne 'UP' }).Count
if ($downCount -gt 0) {
    Write-Host "   $downCount service DOWN — smoke test 진행하지만 endpoint fail 가능" -ForegroundColor Yellow
} else {
    Write-Host '   모든 service UP' -ForegroundColor Green
}

if ($GatewayUrl -eq $defaultGatewayUrl -and $servicePortByName.ContainsKey('api-gateway')) {
    $GatewayUrl = "http://localhost:$($servicePortByName['api-gateway'])"
    Write-Host "   GatewayUrl 보정 — $GatewayUrl" -ForegroundColor DarkGray
}

# -----------------------------------------------------------------------------
# 2. JWT 발급 (kimmiseon)
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '[2/3] JWT 발급 (kimmiseon = MASTER)' -ForegroundColor Yellow

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
        throw "응답에 accessToken/token 부재"
    }
    $claims   = Get-JwtClaims -Token $token
    $userId   = $claims.sub
    $roleName = $claims.role
    if (-not $userId -or -not $roleName) {
        throw "JWT claims 부재 (sub / role)"
    }
    Write-Host "   OK — JWT 발급 (length=$($token.Length), sub=$userId, role=$roleName)" -ForegroundColor Green
} catch {
    Write-Host "   FAIL — 로그인 실패: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '   smoke test step 3 생략 (token 부재).' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '==============================================================' -ForegroundColor Red
    Write-Host ' 불합격 — JWT 발급 실패' -ForegroundColor Red
    Write-Host '==============================================================' -ForegroundColor Red
    exit 1
}

# -----------------------------------------------------------------------------
# 3. 주요 endpoint smoke test
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '[3/3] 주요 endpoint smoke test (gateway 경유 + service port 직접 혼합)' -ForegroundColor Yellow

# dashboard /admin/dashboard/kpi 는 from / to 필수 query param — 오늘 날짜 사용
$today    = (Get-Date).ToString('yyyy-MM-dd')
$kpiQuery = "from=$today&to=$today"

# transport = 'gateway' (Authorization 만) | 'direct' (Authorization + X-User-Id + X-User-Role)
# direct 는 gateway 대신 health 검증에서 탐지한 service port 로 호출한다.
$smokeEndpoints = @(
    @{ name = 'auth-service /auth/me';                transport = 'direct';  url = "http://localhost:$($servicePortByName['auth-service'])/auth/me" },
    @{ name = 'product-service /products';            transport = 'gateway'; url = "$GatewayUrl/api/v1/products?page=0&size=10" },
    @{ name = 'inventory-service /warehouses';        transport = 'gateway'; url = "$GatewayUrl/api/v1/inventory/warehouses?page=0&size=10" },
    # 전체 재고 현황 계약: productId 없이도 inventory.stock-balance VIEW 권한으로 조회되어야 한다.
    @{ name = 'inventory-service /balances (전체)';   transport = 'gateway'; url = "$GatewayUrl/api/v1/inventory/balances?page=0&size=10" },
    @{ name = 'slip-service /slips';                  transport = 'gateway'; url = "$GatewayUrl/api/v1/slips?page=0&size=10" },
    @{ name = 'partner-service /admin/partners';      transport = 'direct';  url = "http://localhost:$($servicePortByName['partner-service'])/admin/partners?page=0&size=10" },
    @{ name = 'notification-service /admin/notifications'; transport = 'direct'; url = "http://localhost:$($servicePortByName['notification-service'])/admin/notifications?page=0&size=10" },
    @{ name = 'dashboard-service /admin/dashboard/kpi';    transport = 'direct'; url = "http://localhost:$($servicePortByName['dashboard-service'])/admin/dashboard/kpi?$kpiQuery" }
)

$smokeResults = @()
foreach ($ep in $smokeEndpoints) {
    $url = $ep.url
    $headers = @{ Authorization = "Bearer $token" }
    if ($ep.transport -eq 'direct') {
        $headers['X-User-Id']   = $userId
        $headers['X-User-Role'] = $roleName
    }

    $status   = 'EXCEPTION'
    $note     = ''
    $verdict  = 'FAIL'
    try {
        $r = Invoke-WebRequest -Uri $url -Method GET -Headers $headers `
            -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        $status = "$($r.StatusCode)"
        if ($r.StatusCode -eq 200) {
            $verdict = 'OK'
            $note    = "$([math]::Round($r.RawContentLength/1KB, 1)) KB"
        } else {
            $verdict = 'NON_200'
        }
    } catch {
        $msg = $_.Exception.Message
        if ($_.Exception.Response) {
            try { $status = "$([int]$_.Exception.Response.StatusCode)" } catch { }
        }
        # 일부 endpoint 가 path 구조 차이로 404 — service alive 인지 확인 필요
        if ($status -eq '404') { $verdict = 'PATH_404' }
        if ($msg.Length -gt 50) { $note = $msg.Substring(0, 50) + '...' } else { $note = $msg }
    }
    $smokeResults += [pscustomobject]@{
        Service   = $ep.name
        Transport = $ep.transport
        Status    = $status
        Verdict   = $verdict
        Note      = $note
    }
}
$smokeResults | Format-Table -AutoSize

# -----------------------------------------------------------------------------
# 4. 종합
# -----------------------------------------------------------------------------
$smokeFail = ($smokeResults | Where-Object { $_.Verdict -ne 'OK' }).Count

Write-Host ''
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host ' 종합 결과' -ForegroundColor Cyan
Write-Host '==============================================================' -ForegroundColor Cyan
$healthColor = 'Yellow'
if ($downCount -eq 0) { $healthColor = 'Green' }
$smokeColor = 'Yellow'
if ($smokeFail -eq 0) { $smokeColor = 'Green' }
Write-Host " service health  — UP $($services.Count - $downCount) / $($services.Count)" -ForegroundColor $healthColor
Write-Host " endpoint smoke  — OK $($smokeEndpoints.Count - $smokeFail) / $($smokeEndpoints.Count)" -ForegroundColor $smokeColor
Write-Host ''

if ($downCount -eq 0 -and $smokeFail -eq 0) {
    Write-Host '==============================================================' -ForegroundColor Green
    Write-Host ' 합격 — 14 service 모두 UP + 8 endpoint 모두 200' -ForegroundColor Green
    Write-Host '==============================================================' -ForegroundColor Green
    Write-Host ' docs/operational-validation/README.md 의 §2 항목 6 을 ✅ update 권장.' -ForegroundColor DarkGray
    Write-Host ''
    exit 0
} else {
    Write-Host '==============================================================' -ForegroundColor Red
    Write-Host ' 불합격 — service down 또는 endpoint fail 존재' -ForegroundColor Red
    Write-Host '==============================================================' -ForegroundColor Red
    Write-Host ' 트러블슈팅:' -ForegroundColor Yellow
    Write-Host '   - service down → .local-logs/<service>.log 추적' -ForegroundColor DarkGray
    Write-Host '   - endpoint 404 → controller path 변경 가능, 본 스크립트의 smokeEndpoints 갱신' -ForegroundColor DarkGray
    Write-Host '   - 자세한 fix 절차 — docs/operational-validation/boot-and-smoke-validation.md §4' -ForegroundColor DarkGray
    Write-Host ''
    exit 1
}
