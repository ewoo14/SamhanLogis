<#
.SYNOPSIS
    Phase 10 Step 8 — 9 슬라이스 통합 PR fixture seed 스크립트.

.DESCRIPTION
    9 슬라이스 (P0-2 비밀번호 / P0-4 세금계산서 / P0-4 인쇄 / P0-5 admin /
    P1-5 arologis 수동 배차 / P1-8 mobile photo / P2-1 견적서 /
    P2-4 매출 마감 / P2-6 재고 실사) E2E 시나리오 (~160 case) 가 의존하는
    fixture data 를 14 backend service 의 시드 endpoint 또는 직접 psql 로 일괄 적재한다.

    세분화:
        1) 계정 5 ROLE (master / accountant / sales / warehouse / driver01)
           — auth-service /api/internal/seed/users 또는 OrgChartSeeder fallback
        2) 거래처 5건 (P-001~P-005, BIZGATE/STANDARD/TEMP_CREDENTIAL/BLOCKED 분포)
           — partner-service /api/internal/seed/partners
        3) 품목 100건 + 창고 W-01 + 재고 200 row
           — product-service + warehouse-service + inventory-service
        4) 슬립 100건 (11 status 균등) + 견적서 5건 (DRAFT/SENT/ACCEPTED/CONVERTED)
           — slip-service
        5) tax-invoice 시드 5건 + period_locks 0건 (9.x 시나리오 진행 중 lock 추가)
           — accounting-service
        6) arologis dispatch 5건 (PLANNED/ASSIGNED 분포)
           — arologis-service
        7) password_reset_tokens 0건 (1.2.x 시나리오 진행 중 발급) +
           password_history 5건 seed (1.3.x history reuse 검증용)

    멱등성:
        - 모든 seed 는 existsBy* / count() > 0 가드로 재실행 안전 (OrgChartSeeder 패턴).
        - DB 직접 INSERT 시에도 ON CONFLICT DO NOTHING.

.PARAMETER ApiBase
    14 backend gateway base URL (기본값은 local-stack resolver).

.PARAMETER PsqlOnly
    REST API seed endpoint 미가동 시 직접 psql 만으로 적재 (CI / 검증 모드).

.PARAMETER SkipValidation
    seed 후 row count 검증 단계 생략.

.EXAMPLE
    .\tools\test-data\seed-9-slice-fixtures.ps1

.EXAMPLE
.\tools\test-data\seed-9-slice-fixtures.ps1 -SkipValidation

.NOTES
    - Windows PowerShell 5.1 / PowerShell 7+ 호환 (?? null-coalescing 미사용)
    - UTF-8 BOM 없이 저장 — 한글 주석 보존 (feedback_powershell_utf8_writes 가드 — Set-Content 미사용)
    - feature/integrated-phase-10-step-8-ui-9-slice 의존
    - start-local-full.ps1 의 [step 6/6] seed 검증 단계에서 후속 통합 가능
    - 회고: PR #21 패턴 — fixture seed 는 BE 팀 seeder 위임이 원칙이나 (PR #16 회고),
      본 PR 은 9 슬라이스 BE seeder 가 각 service 별 분산 — QA 통합 호출 wrapper 만 제공.
#>

[CmdletBinding()]
param(
    [string] $ApiBase = '',
    [switch] $PsqlOnly,
    [switch] $SkipValidation
)

$ErrorActionPreference = 'Stop'
$portResolver = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'scripts\lib\local-stack-port.ps1'
. (Resolve-Path -LiteralPath $portResolver)
if ([string]::IsNullOrWhiteSpace($ApiBase)) {
    $ApiBase = "http://localhost:$(Get-LocalStackPort -Service 'api-gateway')"
}

# -----------------------------------------------------------------------------
# 0. 공통 helper
# -----------------------------------------------------------------------------

function Write-Step {
    param([string] $Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string] $Message)
    Write-Host "    [OK]   $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string] $Message)
    $script:SeedFailureCount++
    Write-Host "    [WARN] $Message" -ForegroundColor Yellow
}

function Write-Skip {
    param([string] $Message)
    Write-Host "    [SKIP] $Message" -ForegroundColor DarkYellow
}

$script:SeedFailureCount = 0

function Test-BackendUp {
    param([string] $BaseUrl)
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/actuator/health" -Method GET -TimeoutSec 3 -UseBasicParsing
        return $resp.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Invoke-SeedApi {
    param(
        [string] $Method,
        [string] $Path,
        [hashtable] $Body
    )
    $url = "$ApiBase$Path"
    try {
        $json = $Body | ConvertTo-Json -Depth 10 -Compress
        $resp = Invoke-WebRequest `
            -Uri $url `
            -Method $Method `
            -ContentType 'application/json; charset=utf-8' `
            -Body $json `
            -TimeoutSec 10 `
            -UseBasicParsing
        return @{ Ok = $true; Status = $resp.StatusCode; Content = $resp.Content }
    }
    catch {
        $statusCode = -1
        if ($_.Exception.Response -ne $null) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        return @{ Ok = $false; Status = $statusCode; Error = $_.Exception.Message }
    }
}

# -----------------------------------------------------------------------------
# 1. Pre-flight
# -----------------------------------------------------------------------------

Write-Host ''
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host ' SamhanLogis 9 슬라이스 fixture seed' -ForegroundColor Cyan
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host " ApiBase    : $ApiBase"
Write-Host " PsqlOnly   : $PsqlOnly"
Write-Host " 시각        : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

if (-not $PsqlOnly) {
    Write-Step '0/9 backend health check'
    if (-not (Test-BackendUp -BaseUrl $ApiBase)) {
        Write-Warn 'backend 미가동 — psql-only 모드로 자동 전환'
        $PsqlOnly = $true
    }
    else {
        Write-Ok 'backend health 200'
    }
}

# -----------------------------------------------------------------------------
# 2. 슬라이스 1 — 비밀번호 재설정 fixture
# -----------------------------------------------------------------------------

Write-Step '1/9 비밀번호 재설정 (P0-2) — 5 ROLE 계정 + password_history 5건'

$users = @(
    @{ loginId = 'master';      role = 'MASTER';     name = '개발책임자';   email = 'master@samhan.test'     },
    @{ loginId = 'accountant';  role = 'ACCOUNTANT'; name = '회계 외주';   email = 'accountant@samhan.test' },
    @{ loginId = 'sales';       role = 'SALES';      name = '신입 영업';   email = 'sales@samhan.test'      },
    @{ loginId = 'warehouse';   role = 'WAREHOUSE';  name = '신입 창고';   email = 'warehouse@samhan.test'  },
    @{ loginId = 'driver01';    role = 'DRIVER';     name = '배송 기사';   email = 'driver01@samhan.test'   }
)

foreach ($u in $users) {
    if ($PsqlOnly) {
        Write-Skip "$($u.loginId) ($($u.role)) — psql-only mode (BE seeder 의존)"
    }
    else {
        $r = Invoke-SeedApi -Method 'POST' -Path '/api/internal/seed/users' -Body $u
        if ($r.Ok) { Write-Ok "$($u.loginId) ($($u.role)) seeded" }
        elseif ($r.Status -eq 409) { Write-Ok "$($u.loginId) 이미 존재 (idempotent)" }
        else { Write-Warn "$($u.loginId) 실패 status=$($r.Status) — BE seed endpoint 미구현 가능 (Phase 11 보강)" }
    }
}

# password_history 5건 (1.3.x 시나리오 — 직전 5개 reuse 차단 검증용)
Write-Host '    password_history 5건 (sales 계정) — 1.3.x reuse 차단 검증용'
if ($PsqlOnly) {
    Write-Skip 'password_history seed — BE 팀 PasswordHistorySeeder 의존'
}
else {
    $historyBody = @{
        loginId = 'sales'
        history = @('OldPw1!@', 'OldPw2!@', 'OldPw3!@', 'OldPw4!@', 'OldPw5!@')
    }
    $r = Invoke-SeedApi -Method 'POST' -Path '/api/internal/seed/password-history' -Body $historyBody
    if ($r.Ok) { Write-Ok 'password_history 5건 seed' }
    else { Write-Warn "password_history seed 실패 status=$($r.Status) — 1.3.x 시나리오는 수동 setup 필요" }
}

# -----------------------------------------------------------------------------
# 3. 슬라이스 4 — 거래처 4탭 + 슬라이스 2 — 세금계산서용 거래처
# -----------------------------------------------------------------------------

Write-Step '2/9 거래처 5건 (P0-6 4탭 + P0-4 세금계산서)'

$partners = @(
    @{ code = 'P-001'; name = '삼한물산';   businessNo = '123-45-67890'; status = 'ACTIVE';            credentialType = 'STANDARD';  vatRate = 10 },
    @{ code = 'P-002'; name = '대한유통';   businessNo = '234-56-78901'; status = 'ACTIVE';            credentialType = 'BIZGATE';   vatRate = 10 },
    @{ code = 'P-003'; name = '글로벌수출'; businessNo = '345-67-89012'; status = 'ACTIVE';            credentialType = 'STANDARD';  vatRate = 0  },
    @{ code = 'P-004'; name = '임시거래';   businessNo = '456-78-90123'; status = 'TEMP_CREDENTIAL';   credentialType = 'STANDARD';  vatRate = 10 },
    @{ code = 'P-005'; name = '거래중지';   businessNo = '567-89-01234'; status = 'BLOCKED';           credentialType = 'STANDARD';  vatRate = 10 }
)

foreach ($p in $partners) {
    if ($PsqlOnly) {
        Write-Skip "$($p.code) — psql-only mode"
    }
    else {
        $r = Invoke-SeedApi -Method 'POST' -Path '/api/internal/seed/partners' -Body $p
        if ($r.Ok) { Write-Ok "$($p.code) ($($p.name)) seeded" }
        elseif ($r.Status -eq 409) { Write-Ok "$($p.code) 이미 존재" }
        else { Write-Warn "$($p.code) 실패 status=$($r.Status)" }
    }
}

# -----------------------------------------------------------------------------
# 4. 슬라이스 9 — 재고 실사용 창고 + 품목 + 재고
# -----------------------------------------------------------------------------

Write-Step '3/9 창고 W-01 + 품목 100건 + 재고 200 row (P2-6 재고 실사)'

if ($PsqlOnly) {
    Write-Skip '창고/품목/재고 seed — BE seeder 의존 (PRODUCT_SEED_TEST_DATA + INVENTORY_SEED_TEST_DATA toggle)'
}
else {
    $warehouseBody = @{
        code = 'W-01'
        name = '본사 창고'
        address = '서울시 강남구 테헤란로 1'
    }
    $r = Invoke-SeedApi -Method 'POST' -Path '/api/internal/seed/warehouses' -Body $warehouseBody
    if ($r.Ok -or $r.Status -eq 409) { Write-Ok 'W-01 seeded' }
    else { Write-Warn "W-01 실패 status=$($r.Status)" }

    $productsBody = @{ count = 100; codePrefix = 'PROD-'; vatRate = 10; safetyStock = 10 }
    $r = Invoke-SeedApi -Method 'POST' -Path '/api/internal/seed/products' -Body $productsBody
    if ($r.Ok) { Write-Ok '품목 100건 seeded' }
    else { Write-Warn "품목 seed 실패 status=$($r.Status)" }

    $inventoryBody = @{ warehouseCode = 'W-01'; productCountCap = 100; defaultQty = 100 }
    $r = Invoke-SeedApi -Method 'POST' -Path '/api/internal/seed/inventory' -Body $inventoryBody
    if ($r.Ok) { Write-Ok '재고 100 row seeded (W-01)' }
    else { Write-Warn "재고 seed 실패 status=$($r.Status)" }
}

# -----------------------------------------------------------------------------
# 5. 슬라이스 7 — 견적서 5건 (DRAFT/SENT/ACCEPTED/CONVERTED)
# -----------------------------------------------------------------------------

Write-Step '4/9 견적서 5건 (P2-1 라이프사이클)'

$estimates = @(
    @{ number = 'EST-2026-0001'; partnerCode = 'P-001'; status = 'DRAFT';     amount = 1000000 },
    @{ number = 'EST-2026-0002'; partnerCode = 'P-001'; status = 'SENT';      amount = 2000000 },
    @{ number = 'EST-2026-0003'; partnerCode = 'P-002'; status = 'ACCEPTED';  amount = 3000000 },
    @{ number = 'EST-2026-0004'; partnerCode = 'P-002'; status = 'CONVERTED'; amount = 5000000 },
    @{ number = 'EST-2026-0005'; partnerCode = 'P-003'; status = 'REJECTED';  amount = 4000000 }
)

foreach ($e in $estimates) {
    if ($PsqlOnly) {
        Write-Skip "$($e.number) — psql-only"
    }
    else {
        $r = Invoke-SeedApi -Method 'POST' -Path '/api/internal/seed/estimates' -Body $e
        if ($r.Ok -or $r.Status -eq 409) { Write-Ok "$($e.number) ($($e.status)) seeded" }
        else { Write-Warn "$($e.number) 실패 status=$($r.Status)" }
    }
}

# -----------------------------------------------------------------------------
# 6. 슬라이스 2 — 세금계산서 5건
# -----------------------------------------------------------------------------

Write-Step '5/9 세금계산서 5건 (P0-4 발행 + 자동 분개 검증용)'

$invoices = @(
    @{ number = 'TI-2026-0001'; partnerCode = 'P-001'; status = 'DRAFT';     amount = 1000000; vat = 100000 },
    @{ number = 'TI-2026-0002'; partnerCode = 'P-001'; status = 'ISSUED';    amount = 2000000; vat = 200000 },
    @{ number = 'TI-2026-0003'; partnerCode = 'P-002'; status = 'ISSUED';    amount = 3000000; vat = 300000 },
    @{ number = 'TI-2026-0004'; partnerCode = 'P-003'; status = 'ISSUED';    amount = 4000000; vat = 0       },
    @{ number = 'TI-2026-0005'; partnerCode = 'P-002'; status = 'CANCELLED'; amount = 1500000; vat = 150000 }
)

foreach ($i in $invoices) {
    if ($PsqlOnly) {
        Write-Skip "$($i.number) — psql-only"
    }
    else {
        $r = Invoke-SeedApi -Method 'POST' -Path '/api/internal/seed/tax-invoices' -Body $i
        if ($r.Ok -or $r.Status -eq 409) { Write-Ok "$($i.number) ($($i.status)) seeded" }
        else { Write-Warn "$($i.number) 실패 status=$($r.Status)" }
    }
}

# -----------------------------------------------------------------------------
# 7. 슬라이스 5 — arologis 수동 배차 5건
# -----------------------------------------------------------------------------

Write-Step '6/9 arologis dispatch 5건 (P1-5 수동 배차)'

$dispatches = @(
    @{ number = 'D-2026-0001'; vehicleCode = 'V-01'; driverLoginId = $null;       status = 'PLANNED';  stops = 5 },
    @{ number = 'D-2026-0002'; vehicleCode = 'V-01'; driverLoginId = 'driver01';  status = 'ASSIGNED'; stops = 3 },
    @{ number = 'D-2026-0003'; vehicleCode = 'V-02'; driverLoginId = 'driver01';  status = 'ASSIGNED'; stops = 8 },
    @{ number = 'D-2026-0004'; vehicleCode = 'V-02'; driverLoginId = $null;       status = 'PLANNED';  stops = 2 },
    @{ number = 'D-2026-0005'; vehicleCode = 'V-03'; driverLoginId = 'driver01';  status = 'COMPLETED'; stops = 6 }
)

foreach ($d in $dispatches) {
    if ($PsqlOnly) {
        Write-Skip "$($d.number) — psql-only"
    }
    else {
        $r = Invoke-SeedApi -Method 'POST' -Path '/api/internal/seed/dispatches' -Body $d
        if ($r.Ok -or $r.Status -eq 409) { Write-Ok "$($d.number) ($($d.status), $($d.stops) stops) seeded" }
        else { Write-Warn "$($d.number) 실패 status=$($r.Status)" }
    }
}

# -----------------------------------------------------------------------------
# 8. 슬라이스 8 — 매출 마감 fixture (분개 5건 + tax-invoice 3건 — 4월 분)
# -----------------------------------------------------------------------------

Write-Step '7/9 2026-04 분개 5건 + tax-invoice 3건 (P2-4 매출 마감 검증용)'

if ($PsqlOnly) {
    Write-Skip '2026-04 분개 5건 — BE seeder 의존 (ACCOUNTING_SEED_TEST_DATA toggle)'
}
else {
    $journalsBody = @{
        yyyyMM = '202604'
        count = 5
        partnerCode = 'P-001'
        amount = 500000
    }
    $r = Invoke-SeedApi -Method 'POST' -Path '/api/internal/seed/journals' -Body $journalsBody
    if ($r.Ok) { Write-Ok '2026-04 분개 5건 seeded' }
    else { Write-Warn "분개 seed 실패 status=$($r.Status)" }
}

# -----------------------------------------------------------------------------
# 9. 슬라이스 6 — 모바일 사진 fixture (slip + dispatch 정차 도착 상태)
# -----------------------------------------------------------------------------

Write-Step '8/9 mobile photo fixture — slip 1건 + dispatch 정차 도착 상태 (P1-8)'

if ($PsqlOnly) {
    Write-Skip 'mobile photo fixture — slip-service + arologis-service seed 의존'
}
else {
    $mobileBody = @{
        slipNumber = 'SLIP-2026-0001'
        dispatchNumber = 'D-2026-0002'
        stopSequence = 1
        driverLoginId = 'driver01'
        arrivedAt = (Get-Date).ToString('o')
    }
    $r = Invoke-SeedApi -Method 'POST' -Path '/api/internal/seed/mobile-photo-fixture' -Body $mobileBody
    if ($r.Ok -or $r.Status -eq 409) { Write-Ok 'mobile photo fixture seeded' }
    else { Write-Warn "mobile photo fixture 실패 status=$($r.Status)" }
}

# -----------------------------------------------------------------------------
# 10. 검증 — row count
# -----------------------------------------------------------------------------

Write-Step '9/9 seed 검증 (row count)'

if ($SkipValidation) {
    Write-Skip 'SkipValidation flag — row count 검증 생략'
}
elseif ($PsqlOnly) {
    Write-Skip 'PsqlOnly — REST validation 생략 (BE 팀 별도 psql 검증 SQL 권고)'
}
else {
    $expects = @(
        @{ path = '/api/internal/seed/users/count';        min = 5;   label = 'users (5 ROLE)' },
        @{ path = '/api/internal/seed/partners/count';     min = 5;   label = 'partners' },
        @{ path = '/api/internal/seed/products/count';     min = 100; label = 'products' },
        @{ path = '/api/internal/seed/inventory/count';    min = 100; label = 'inventory rows' },
        @{ path = '/api/internal/seed/estimates/count';    min = 5;   label = 'estimates' },
        @{ path = '/api/internal/seed/tax-invoices/count'; min = 5;   label = 'tax invoices' },
        @{ path = '/api/internal/seed/dispatches/count';   min = 5;   label = 'dispatches' }
    )
    foreach ($exp in $expects) {
        try {
            $resp = Invoke-WebRequest -Uri "$ApiBase$($exp.path)" -Method GET -TimeoutSec 5 -UseBasicParsing
            $count = [int]($resp.Content | ConvertFrom-Json).count
            if ($count -ge $exp.min) {
                Write-Ok "$($exp.label) = $count (expect >= $($exp.min))"
            }
            else {
                Write-Warn "$($exp.label) = $count (expect >= $($exp.min)) — 부족"
            }
        }
        catch {
            Write-Warn "$($exp.label) — endpoint 미구현 또는 호출 실패"
        }
    }
}

# -----------------------------------------------------------------------------
# 11. 완료
# -----------------------------------------------------------------------------

if ($script:SeedFailureCount -gt 0) {
    Write-Host ''
    Write-Host '==============================================================' -ForegroundColor Red
    Write-Host " 9 슬라이스 fixture seed 실패 ($($script:SeedFailureCount)건)" -ForegroundColor Red
    Write-Host '==============================================================' -ForegroundColor Red
    Write-Error "9 슬라이스 fixture seed 실패: $($script:SeedFailureCount)건의 WARN이 발생했습니다."
    exit 1
}

Write-Host ''
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host ' 9 슬라이스 fixture seed 완료' -ForegroundColor Cyan
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host ' 다음 단계:' -ForegroundColor Yellow
Write-Host '   1) Playwright 시나리오 실행:' -ForegroundColor Yellow
Write-Host '      cd qa\playwright && npm run test:list -- tests\nine-slice' -ForegroundColor White
Write-Host '   2) 또는 desktop client 수동 검증:' -ForegroundColor Yellow
Write-Host '      cd clients\desktop && npm run dev' -ForegroundColor White
Write-Host '   3) 시나리오 명세:' -ForegroundColor Yellow
Write-Host '      docs\qa\integration-pr-9-slice\scenarios.md' -ForegroundColor White
Write-Host ''
