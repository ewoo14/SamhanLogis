# Phase 2.6a 배포 순서 — auth(V41) → slip(V29) → partner-order(V8)

> 작성일: 2026-05-30
> 대상: Phase 2.6a PR 머지 후 로컬(Docker Compose) 또는 Phase 11 AWS 환경 배포 시 준수 순서
> 원칙: 3개 서비스 Flyway 마이그레이션 의존성 순서 엄수

---

## §1 배포 원칙

Phase 2.6a 는 **3개 서비스에 걸쳐 Flyway 마이그레이션**이 분산되어 있으며, 각 서비스가 런타임에 서로를 호출하는 의존성이 있다.

| 순서 | 서비스 | 마이그레이션 | 이유 |
|---|---|---|---|
| 1 | auth-service | **V41** — `sales.partner-order.convert` CREATE 권한 시드 | convert endpoint 가 권한 체크 시 V41 row 가 없으면 403 |
| 2 | slip-service | **V29** — `slip_lines.source_order_line_id UUID` 컬럼 추가 | partner-order-service convert 호출 시 slip-service 가 해당 컬럼 없으면 500 |
| 3 | partner-order-service | **V8** — `partner_order_lines.converted_quantity INT NOT NULL DEFAULT 0` + CHECK 제약 | convert endpoint 최종 서비스 |

역순 배포 금지:

| 잘못된 순서 | 증상 |
|---|---|
| partner-order(V8) → slip(V29) → auth(V41) | convert 호출 시 slip-service source_order_line_id 컬럼 없음 → slip 500 → convert 롤백 |
| slip(V29) → partner-order(V8) → auth 없이 | 권한 row 없음 → 403 |
| partner-order(V8) → auth(V41) → slip(V29) | convert 시 slip source_order_line_id 없음 → 500 |

---

## §2 배포 전 사전 점검

```powershell
# V41 / V29 / V8 SQL 파일 존재 확인
$files = @(
    "services\auth-service\src\main\resources\db\migration\V41__seed_partner_order_convert_page.sql",
    "services\slip-service\src\main\resources\db\migration\V29__add_slip_line_source_order_line.sql",
    "services\partner-order-service\src\main\resources\db\migration\V8__add_partner_order_line_converted_quantity.sql"
)
foreach ($f in $files) {
    if (Test-Path $f) { Write-Host "[OK] $f" }
    else { Write-Host "[FAIL] $f — 파일 없음, 배포 중단"; exit 1 }
}
```

---

## §3 배포 순서 상세

### Step 1. auth-service 배포 (V41 Flyway 실행)

auth-service 기동 시 V41 migration 자동 실행. `sales.partner-order.convert` CREATE grant 가 MASTER/MANAGER/SALES 역할에 삽입된다.

```powershell
docker compose -f infrastructure/docker-compose.yml up -d auth-service
Start-Sleep -Seconds 30
```

배포 후 검증:

```powershell
# 1) auth-service health
$authHealth = Invoke-RestMethod -Uri "http://localhost:8081/actuator/health" -Method GET
if ($authHealth.status -eq "UP") {
    Write-Host "[OK] auth-service UP"
} else {
    Write-Host "[FAIL] auth-service 이상 — 배포 중단"; exit 1
}

# 2) V41 seed row 확인 — sales.partner-order.convert 권한 존재
$env:PGPASSWORD = "samhan_dev_pw"
psql -h localhost -p 5432 -U samhan -d auth_db `
    -c "SELECT COUNT(*) FROM role_page_permissions
        WHERE page_code = 'sales.partner-order.convert'
          AND action = 'CREATE'
          AND is_deleted = FALSE;"
# 기대: MASTER/MANAGER/SALES 3행 이상
```

### Step 2. slip-service 배포 (V29 Flyway 실행)

V29 migration 으로 `slip_lines.source_order_line_id UUID` nullable 컬럼 추가.

```powershell
docker compose -f infrastructure/docker-compose.yml up -d slip-service
Start-Sleep -Seconds 30
```

배포 후 검증:

```powershell
# 1) slip-service health
$slipHealth = Invoke-RestMethod -Uri "http://localhost:8086/actuator/health" -Method GET
if ($slipHealth.status -eq "UP") {
    Write-Host "[OK] slip-service UP"
} else {
    Write-Host "[FAIL] slip-service 이상 — 배포 중단"; exit 1
}

# 2) V29 컬럼 존재 확인
$env:PGPASSWORD = "samhan_dev_pw"
psql -h localhost -p 5432 -U samhan -d slip_db `
    -c "SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'slip_lines'
          AND column_name = 'source_order_line_id';"
# 기대: source_order_line_id | uuid | YES
```

### Step 3. partner-order-service 배포 (V8 Flyway 실행)

V8 migration 으로 `partner_order_lines.converted_quantity INT NOT NULL DEFAULT 0` + CHECK 제약 추가.

```powershell
docker compose -f infrastructure/docker-compose.yml up -d partner-order-service
Start-Sleep -Seconds 30
```

배포 후 검증:

```powershell
# 1) partner-order-service health
$poHealth = Invoke-RestMethod -Uri "http://localhost:8088/actuator/health" -Method GET
if ($poHealth.status -eq "UP") {
    Write-Host "[OK] partner-order-service UP"
} else {
    Write-Host "[FAIL] partner-order-service 이상 — 배포 중단"; exit 1
}

# 2) V8 컬럼 + CHECK 제약 확인
$env:PGPASSWORD = "samhan_dev_pw"
psql -h localhost -p 5432 -U samhan -d partner_order_db `
    -c "SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'partner_order_lines'
          AND column_name = 'converted_quantity';"
# 기대: converted_quantity | integer | 0 | NO

psql -h localhost -p 5432 -U samhan -d partner_order_db `
    -c "SELECT constraint_name
        FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_converted_quantity_range';"
# 기대: chk_converted_quantity_range 1행
```

---

## §4 Smoke Test — convert endpoint 동작 확인

3개 서비스 모두 UP 후 실제 convert API 동작을 확인한다.

### 4.1 DRAFT 주문 존재 확인

```powershell
# MASTER 토큰 발급 (환경에 따라 변경)
$loginResp = Invoke-RestMethod `
    -Uri "http://localhost:8080/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body '{"loginId":"master","password":"<master-password>"}'
$token = $loginResp.data.accessToken
Write-Host "Token: $($token.Substring(0,20))..."

# DRAFT 주문 목록 조회 (status=DRAFT)
$orders = Invoke-RestMethod `
    -Uri "http://localhost:8080/api/v1/partner-orders?status=DRAFT&size=1" `
    -Headers @{ "Authorization" = "Bearer $token" }
Write-Host "DRAFT 주문 수: $($orders.data.totalElements)"
```

### 4.2 convert endpoint 200 응답 확인 (실제 DRAFT 주문 사용)

```powershell
# 위에서 조회한 DRAFT 주문의 id 와 라인 UUID 를 사용
$orderId = "<조회한 주문 orderNo 또는 id>"
$lineId  = "<조회한 라인 UUID>"

$convertResp = Invoke-RestMethod `
    -Uri "http://localhost:8080/api/v1/partner-orders/$orderId/convert-to-slip" `
    -Method POST `
    -ContentType "application/json" `
    -Headers @{ "Authorization" = "Bearer $token" } `
    -Body "{
      `"items`": [{ `"orderLineId`": `"$lineId`", `"quantity`": 1 }],
      `"warehouseCode`": `"WH-001`"
    }"

Write-Host "slipNo: $($convertResp.data.slipNo)"
Write-Host "status: $($convertResp.data.status)"
Write-Host "fullyConverted: $($convertResp.data.fullyConverted)"
# 기대: slipNo 존재, status=DRAFT(부분전환) 또는 CONVERTED(전량전환), HTTP 200
```

### 4.3 CONFIRMED 주문 → 409 차단 확인

```powershell
# CONFIRMED 주문으로 convert 시도 → 409 응답 확인
$confirmedOrderId = "<CONFIRMED 주문 id>"
try {
    Invoke-RestMethod `
        -Uri "http://localhost:8080/api/v1/partner-orders/$confirmedOrderId/convert-to-slip" `
        -Method POST `
        -ContentType "application/json" `
        -Headers @{ "Authorization" = "Bearer $token" } `
        -Body "{`"items`":[{`"orderLineId`":`"<lineId>`",`"quantity`":1}],`"warehouseCode`":`"WH-001`"}"
    Write-Host "[FAIL] 409 응답이 와야 하는데 200 반환 — 화이트리스트 차단 실패"
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "[OK] CONFIRMED 주문 convert 409 차단 확인"
    } else {
        Write-Host "[WARN] 예상치 않은 응답: $($_.Exception.Response.StatusCode)"
    }
}
```

### 4.4 converted_quantity psql 직접 확인

```powershell
# convert 후 partner_order_lines 의 converted_quantity 증가 확인
$env:PGPASSWORD = "samhan_dev_pw"
psql -h localhost -p 5432 -U samhan -d partner_order_db `
    -c "SELECT id, quantity, converted_quantity, (quantity - converted_quantity) AS remaining
        FROM partner_order_lines
        WHERE partner_order_id = (
            SELECT id FROM partner_orders WHERE order_no = '<변환된 주문번호>' LIMIT 1
        );"
# 기대: converted_quantity >= 1, remaining = quantity - converted_quantity
```

---

## §5 롤백 절차

Phase 2.6a 배포 후 긴급 롤백이 필요한 경우:

| 롤백 단계 | 조치 |
|---|---|
| V8 partner-order-service | `ALTER TABLE partner_order_lines DROP CONSTRAINT chk_converted_quantity_range; ALTER TABLE partner_order_lines DROP COLUMN converted_quantity;` |
| V29 slip-service | `ALTER TABLE slip_lines DROP COLUMN source_order_line_id;` |
| V41 auth-service | `DELETE FROM role_page_permissions WHERE page_code = 'sales.partner-order.convert';` |

주의: V8 롤백 전 `converted_quantity > 0` 인 행이 있으면 이미 부분전환된 주문이 있다는 의미이다. 해당 주문의 slip 을 취소한 뒤 롤백할 것.

---

## §6 참조

- `docs/dev-reports/phase-2-6a-order-to-slip-conversion.md` — 슬라이스 전체 dev-report
- `migration/decisions/DECISIONS.md` — D-2.6a-01~08 결정 로그
- `services/partner-order-service/README.md` — Phase 2.6a 섹션
- `docs/qa/phase-2-6a-order-convert/tm-claude-cycle2.md` — TM 사이클 2 APPROVE 종합
