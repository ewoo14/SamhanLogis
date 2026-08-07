# 시나리오 2 — End-to-End 슬립 라이프사이클

> **목적**: 출고 슬립의 11 단계 status 전이를 role 별 권한 매트릭스 + 재고 reserve/deduct + 자동 분개 trigger 까지 일괄 검증
> **선행 조건**: 시나리오 1 통과 + slip / partner / product / inventory 시드 완료
> **소요 시간**: 약 15분
> **검증 대상**: slip-service / inventory-service / accounting-service / partner-service

---

## 0. 사전 가정 — Role 매트릭스 (`SlipController` Javadoc 인용)

| Role | 가능 action |
|---|---|
| **SALES** (영업) | create / save / send / cancel / editHeader / addLine / removeLine |
| **WAREHOUSE / INVENTORY** (창고/물류) | accept / process / inspect / complete / ship / deliver |
| **ACCOUNTANT** | confirm |
| **MANAGER / MASTER** | 전 권한 + reject |

> 본 시나리오에서는 시드된 16명 중 다음 4명을 사용:
> - SALES: `kimgicheol` (영업2팀 부장)
> - WAREHOUSE: `parkeunwoo` (영업3팀 주임 — DEVELOPER role 이지만 본 시나리오 한정 WAREHOUSE 권한 grant 가정 또는 MANAGER `janyeonggu` 사용)
> - ACCOUNTANT: `leeseongmi` (회계팀 사원)
> - MASTER: `kimmiseon` (CEO — 전 권한)
>
> > **현실 가정** — 실제 시드는 WAREHOUSE role 이 없으므로 본 시나리오는 `kimmiseon` (MASTER) 으로 모든 단계 진행.
> > 권한 분리 검증은 **별도 Negative test** (§3) 로 수행.

---

## 1. STEP 0 — 사전 데이터 준비

### 1.1 SALES 로그인 → JWT

```sh
SALES_TOKEN=$(curl -sS -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"kimgicheol","password":"${QA_MASTER_PASSWORD}"}' | jq -r '.data.accessToken')
SALES_USER_ID=$(curl -sS http://localhost:8080/api/auth/me -H "Authorization: Bearer $SALES_TOKEN" | jq -r '.data.userId')
```

### 1.2 partner / product / warehouse UUID 사전 fetch

```sh
# 50건 partner 중 1건 ("(주)에스엠하나공조" 가정 — partner_code 'P0001')
PARTNER_ID=$(docker exec -t samhan-postgres psql -U samhan -d partner_db -At \
  -c "SELECT id FROM partners WHERE partner_code = 'P0001' AND NOT is_deleted;")

# 100건 product 중 1건 (modelName 'AC-12000-A')
PRODUCT_ID=$(docker exec -t samhan-postgres psql -U samhan -d product_db -At \
  -c "SELECT id FROM products WHERE model_name = 'AC-12000-A' AND NOT is_deleted;")

# 자체창고
SOURCE_WH=$(docker exec -t samhan-postgres psql -U samhan -d inventory_db -At \
  -c "SELECT id FROM warehouses WHERE code = 'WH-MAIN' AND NOT is_deleted;")
```

> partner_code / model_name / warehouse_code 는 BE 팀 seeder 가 부여하는 사용자 노출 식별자.
> 위 SQL 은 시나리오 진입 시점 BE 팀이 발행한 seeder spec 에 맞춰 조정.

### 1.3 재고 사전 충전

```sh
# 100건 product × 2 warehouse 시드된 상태 (200 row).
# AC-12000-A 의 WH-MAIN 재고 가정: 100개
docker exec -it samhan-postgres psql -U samhan -d inventory_db \
  -c "SELECT product_id, warehouse_id, SUM(quantity) AS qty FROM stock_lots WHERE product_id='$PRODUCT_ID' AND warehouse_id='$SOURCE_WH' AND NOT is_deleted GROUP BY 1,2;"
```

**기대값**: `qty ≥ 10` (본 시나리오에서 요청 수량 10 사용).

---

## 2. 11 단계 status 전이 검증

### 2.1 STEP 1 — DRAFT 생성 (SALES)

```sh
curl -X POST http://localhost:8080/api/slips \
  -H "Authorization: Bearer $SALES_TOKEN" \
  -H "X-User-Id: $SALES_USER_ID" \
  -H "X-User-Role: SALES" \
  -H "Content-Type: application/json" \
  -d "{
    \"slipType\": \"OUTBOUND\",
    \"slipDate\": \"2026-05-09\",
    \"sourceWarehouseId\": \"$SOURCE_WH\",
    \"partnerId\": \"$PARTNER_ID\",
    \"partnerName\": \"(주)에스엠하나공조\",
    \"deliveryTag\": \"DIRECT\",
    \"memo\": \"풀-수준 시나리오 2 검증\",
    \"driverName\": \"기사 박철수\",
    \"driverPhone\": \"010-1234-5678\",
    \"lines\": [
      {
        \"productId\": \"$PRODUCT_ID\",
        \"productName\": \"천장 카세트형 에어컨 12000BTU\",
        \"modelName\": \"AC-12000-A\",
        \"quantity\": 10,
        \"unitPrice\": 850000,
        \"note\": \"5월 정기납품\"
      }
    ]
  }"
```

**기대 status**: `201 Created`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "id": "<UUID>",
    "slipNo": "2026/05/09-1",
    "status": "DRAFT",
    "slipType": "OUTBOUND",
    "lines": [{ "productName": "천장 카세트형 에어컨 12000BTU", "lineTotal": 8500000.00 }]
  }
}
```

**검증 포인트**:
- [ ] `data.status` == `DRAFT`
- [ ] `data.slipNo` matches `^\d{8}-\d+$`
- [ ] `data.lines[0].lineTotal` == 850000 × 10 == 8,500,000
- [ ] 응답에 partner UUID 노출되지만 — FE 화면에서는 `partnerName` 만 표시

```powershell
$SLIP_ID = "<위 응답의 data.id>"
$SLIP_NO = "<위 응답의 data.slipNo>"
```

### 2.2 STEP 2 — DRAFT → SAVED (SALES)

```sh
curl -X POST http://localhost:8080/api/slips/$SLIP_ID/save \
  -H "Authorization: Bearer $SALES_TOKEN" \
  -H "X-User-Id: $SALES_USER_ID"
```

**기대 status**: `200 OK`
**기대 본문**: `data.status == "SAVED"`

### 2.3 STEP 3 — SAVED → SENT (SALES)

```sh
curl -X POST http://localhost:8080/api/slips/$SLIP_ID/send \
  -H "Authorization: Bearer $SALES_TOKEN" \
  -H "X-User-Id: $SALES_USER_ID"
```

**기대 status**: `200 OK`
**기대 본문**: `data.status == "SENT"`

### 2.4 STEP 4 — SENT → ACCEPTED (WAREHOUSE) — 재고 reserve

```sh
# 본 시나리오에서는 MASTER 토큰 사용 (시드에 WAREHOUSE role 미존재)
MASTER_TOKEN=$(curl -sS -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"kimmiseon","password":"${QA_MASTER_PASSWORD}"}' | jq -r '.data.accessToken')
MASTER_USER_ID=$(curl -sS http://localhost:8080/api/auth/me -H "Authorization: Bearer $MASTER_TOKEN" | jq -r '.data.userId')

curl -X POST http://localhost:8080/api/slips/$SLIP_ID/accept \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $MASTER_USER_ID" \
  -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**: `data.status == "ACCEPTED"` + `data.acceptedBy` != null + `data.acceptedAt` != null

**재고 검증**:

```sh
docker exec -it samhan-postgres psql -U samhan -d inventory_db \
  -c "SELECT product_id, warehouse_id, SUM(reserved_quantity) AS reserved
      FROM stock_lots
      WHERE product_id='$PRODUCT_ID' AND warehouse_id='$SOURCE_WH' AND NOT is_deleted
      GROUP BY 1,2;"
```

**기대값**: `reserved` += 10 (이전 대비).

> 재고 부족 시 → `409 CONFLICT` + `error.code: INSUFFICIENT_STOCK` (Slip 도메인 메서드 가드).

### 2.5 STEP 5 — ACCEPTED → PROCESSING (WAREHOUSE)

```sh
curl -X POST http://localhost:8080/api/slips/$SLIP_ID/process \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $MASTER_USER_ID" \
  -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**: `data.status == "PROCESSING"`

### 2.6 STEP 6 — PROCESSING → INSPECTING (검수자 — Slice A 신규)

```sh
curl -X POST http://localhost:8080/api/slips/$SLIP_ID/inspect \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $MASTER_USER_ID" \
  -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**:
- `data.status == "INSPECTING"`
- `data.inspectorUserId` != null (caller UUID 자동 기입)
- `data.inspectorSignedAt` != null

> Slice A (sales-polish-2-slice) 신규 단계 — 사용자 피드백 #9 (검수인 자동 서명).

### 2.7 STEP 7 — INSPECTING → COMPLETED (WAREHOUSE) — 재고 deduct

```sh
curl -X POST http://localhost:8080/api/slips/$SLIP_ID/complete \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $MASTER_USER_ID" \
  -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**: `data.status == "COMPLETED"` + `data.completedAt` != null

**재고 검증**:

```sh
docker exec -it samhan-postgres psql -U samhan -d inventory_db \
  -c "SELECT product_id, warehouse_id, SUM(quantity) AS qty, SUM(reserved_quantity) AS reserved
      FROM stock_lots
      WHERE product_id='$PRODUCT_ID' AND warehouse_id='$SOURCE_WH' AND NOT is_deleted
      GROUP BY 1,2;"
```

**기대값**:
- `qty` -= 10 (실재고 차감 — FIFO 로트 deduct)
- `reserved` -= 10 (예약 해제)

### 2.8 STEP 8 — COMPLETED → SHIPPING (출고전표 한정)

```sh
curl -X POST http://localhost:8080/api/slips/$SLIP_ID/ship \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $MASTER_USER_ID" \
  -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**:
- `data.status == "SHIPPING"`
- `data.driverName == "기사 박철수"` (STEP 1 에서 입력된 값 보존)
- `data.driverPhone == "010-1234-5678"`

> driverName / driverPhone 은 createSlip / editHeader 에서 입력 (Slice B 신규).

### 2.9 STEP 9 — SHIPPING → DELIVERED (모바일 서명 — 시나리오 3 와 분리)

본 시나리오 2 에서는 **Internal endpoint** 로 직접 서명을 등록하여 DELIVERED 전이를 검증.
공개 모바일 endpoint 는 시나리오 3 에서 검증.

```sh
# Internal 서명 endpoint — X-Internal-Token 인증 (slip-service.SecurityConfig)
curl -X POST http://localhost:8080/api/internal/slips/$SLIP_ID/signatures \
  -H "X-Internal-Token: dev-internal-token-change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "signatureSource": "APP",
    "signerName": "(주)에스엠하나공조 박부장",
    "imageRef": "s3://samhan-prod/signatures/scenario-2-sample.png",
    "imageHash": "<SHA-256 hex>",
    "capturedAt": "2026-05-09T14:30:00Z",
    "driverCode": "DRV-001"
  }'
```

**기대 status**: `200 OK`
**기대 본문**:
- `data.status == "DELIVERED"`
- `data.signatureSource == "APP"`
- `data.deliveredAt` != null

또는 — 공개 모바일 endpoint 사용 시 (시나리오 3 참조):
`POST /public/batches/{token}/slips/{slipNo}/signature`

**검증 SQL**:

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT slip_no, status, signature_source, signer_name FROM slips WHERE id='$SLIP_ID';"
```

**기대값**: `status='DELIVERED'`, `signature_source='APP'`, `signer_name` not null.

### 2.10 STEP 10 — DELIVERED → CONFIRMED (ACCOUNTANT)

```sh
ACC_TOKEN=$(curl -sS -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"leeseongmi","password":"${QA_MASTER_PASSWORD}"}' | jq -r '.data.accessToken')
ACC_USER_ID=$(curl -sS http://localhost:8080/api/auth/me -H "Authorization: Bearer $ACC_TOKEN" | jq -r '.data.userId')

curl -X POST http://localhost:8080/api/slips/$SLIP_ID/confirm \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Id: $ACC_USER_ID" \
  -H "X-User-Role: ACCOUNTANT"
```

**기대 status**: `200 OK`
**기대 본문**:
- `data.status == "CONFIRMED"`
- `data.confirmedAt` != null

### 2.11 STEP 11 — 자동 분개 발행 (회계 마감 trigger)

> **현황** (accounting-slice-A Plan §7 Q1) — 자동 분개 (slip → journal) 는 A3 deferred.
> 본 시나리오는 ACCOUNTANT 가 **수동 분개** 입력하는 검증.

```sh
curl -X POST http://localhost:8080/api/accounting/journals \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Id: $ACC_USER_ID" \
  -H "X-User-Role: ACCOUNTANT" \
  -H "Content-Type: application/json" \
  -d "{
    \"journalDate\": \"2026-05-09\",
    \"description\": \"슬립 $SLIP_NO 출고 매출 인식 (자동 분개 mock)\",
    \"sourceType\": \"SLIP\",
    \"sourceRefId\": \"$SLIP_ID\",
    \"lines\": [
      {
        \"lineNo\": 1,
        \"accountCode\": \"110\",
        \"debitAmount\": 9350000,
        \"creditAmount\": 0,
        \"partnerId\": \"$PARTNER_ID\",
        \"memo\": \"외상매출금 — (주)에스엠하나공조\"
      },
      {
        \"lineNo\": 2,
        \"accountCode\": \"401\",
        \"debitAmount\": 0,
        \"creditAmount\": 8500000,
        \"memo\": \"상품매출 — AC-12000-A 10ea\"
      },
      {
        \"lineNo\": 3,
        \"accountCode\": \"220\",
        \"debitAmount\": 0,
        \"creditAmount\": 850000,
        \"memo\": \"부가세예수금 (10%)\"
      }
    ]
  }"
```

**기대 status**: `201 Created`
**기대 본문**:
- `data.status == "DRAFT"`
- `data.journalNo` matches `^\d{8}-\d+$`
- `data.lines.length == 3`

**복식부기 검증** — 차변 합계 == 대변 합계:
- 차변: 9,350,000
- 대변: 8,500,000 + 850,000 = 9,350,000 ✓

**POST 단계** — DRAFT → POSTED:

```sh
JOURNAL_ID="<위 응답의 data.id>"
curl -X POST http://localhost:8080/api/accounting/journals/$JOURNAL_ID/post \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Id: $ACC_USER_ID" \
  -H "X-User-Role: ACCOUNTANT"
```

**기대 status**: `200 OK`
**기대 본문**: `data.status == "POSTED"` + `data.postedAt` != null

> A3 자동 분개 활성화 시 — STEP 10 의 confirm 호출 시점에 본 분개 자동 생성 (사람 입력 불필요).

---

## 3. Negative tests — 권한 + 상태 가드

### 3.1 SALES 가 accept 호출 → 403

```sh
curl -X POST http://localhost:8080/api/slips/$SLIP_ID/accept \
  -H "Authorization: Bearer $SALES_TOKEN" \
  -H "X-User-Role: SALES"
```

**기대 status**: `403 Forbidden`
**기대 본문**: `error.code: FORBIDDEN`

### 3.2 ACCOUNTANT 가 create 호출 → 403

```sh
curl -X POST http://localhost:8080/api/slips \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Role: ACCOUNTANT" \
  -d '{"slipType":"OUTBOUND","lines":[{"productId":"...","quantity":1,"unitPrice":1000}]}'
```

**기대 status**: `403 Forbidden`

### 3.3 DRAFT 단계에서 confirm 호출 → 409

신규 DRAFT 슬립 생성 후 즉시 confirm 호출:

```sh
curl -X POST http://localhost:8080/api/slips/<DRAFT_ID>/confirm \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Role: ACCOUNTANT"
```

**기대 status**: `409 Conflict`
**기대 본문**: `error.code: CONFLICT`, `message contains "DELIVERED" or "COMPLETED"`

### 3.4 분개 차/대 합계 mismatch → 400

```sh
curl -X POST http://localhost:8080/api/accounting/journals \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Role: ACCOUNTANT" \
  -d '{
    "journalDate":"2026-05-09",
    "description":"mismatch test",
    "sourceType":"MANUAL",
    "lines":[
      {"lineNo":1,"accountCode":"101","debitAmount":1000,"creditAmount":0},
      {"lineNo":2,"accountCode":"110","debitAmount":0,"creditAmount":900}
    ]
  }'
```

**기대 status**: `400 Bad Request`
**기대 본문**: `error.code: INVALID_INPUT`, `message contains "차/대 합계"`

### 3.5 비표준 accountCode → 400 또는 NOT_FOUND

```sh
curl -X POST http://localhost:8080/api/accounting/journals \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Role: ACCOUNTANT" \
  -d '{
    "journalDate":"2026-05-09",
    "lines":[{"lineNo":1,"accountCode":"999","debitAmount":1000,"creditAmount":0}]
  }'
```

**기대 status**: `400` 또는 `404`
**기대 본문**: `error.code: NOT_FOUND` 또는 `INVALID_INPUT`, `message contains "999"` 또는 `"계정과목"`

### 3.6 통제 계정 (parent) 사용 → 400

```sh
curl -X POST http://localhost:8080/api/accounting/journals \
  -H "Authorization: Bearer $ACC_TOKEN" \
  -H "X-User-Role: ACCOUNTANT" \
  -d '{
    "lines":[{"accountCode":"100","debitAmount":1000,"creditAmount":0}]
  }'
```

**기대 status**: `400 Bad Request`
**기대 본문**: `message contains "통제 계정"` (is_leaf=false 가드)

---

## 4. 정합성 검증 (시나리오 2 한정)

| Check | psql query | 기대값 |
|---|---|---|
| Slip status 전이 11 단계 모두 기록 | `SELECT count(DISTINCT status) FROM slips WHERE id='$SLIP_ID' OR slip_no='$SLIP_NO';` (slip_db) | (단일 row 의 최종 status = CONFIRMED) |
| accepted_by / completed_at / confirmed_at 모두 not null | `SELECT accepted_by, completed_at, confirmed_at FROM slips WHERE id='$SLIP_ID';` | 모두 not null |
| stock 차감 정확 | STEP 7 의 SQL 결과 비교 | qty -= 10 |
| 분개 복식부기 일치 | `SELECT SUM(debit_amount), SUM(credit_amount) FROM journal_lines WHERE journal_id='$JOURNAL_ID';` | 양쪽 모두 9,350,000 |
| 분개 line account_code 모두 표준 65 코드 | `SELECT line_no, account_code FROM journal_lines WHERE journal_id='$JOURNAL_ID' AND account_code NOT IN (SELECT code FROM chart_of_accounts WHERE NOT is_deleted);` | 0 row |

---

## 5. 종료 기준

- [ ] STEP 1~11 happy path 모두 기대값 일치 (status 전이 11회)
- [ ] STEP 4 / STEP 7 의 inventory reserve / deduct 정확
- [ ] STEP 11 의 분개 POST 성공 + 차/대 합계 일치
- [ ] §3 Negative test 6건 모두 기대 status 일치
- [ ] §4 정합성 5건 모두 만족
- [ ] QA 스크린샷 1장 — Edge 의 슬립 상세 화면 (CONFIRMED 표시 + 11 단계 timeline)
  - 저장: `docs/qa/local-test-seed-data/screenshots/02-slip-confirmed.png`

---

## 6. 회귀 가드 / 알려진 이슈

| 이슈 | 회피책 |
|---|---|
| WAREHOUSE / INVENTORY role 미시드 | 본 시나리오는 MASTER 로 진행, 권한 검증은 §3 Negative |
| 자동 분개 deferred (Plan A3) | STEP 11 은 수동 분개로 대체. 향후 자동 분개 활성 시 재작성 |
| Slip 도메인 메서드 의미 정렬 (`feedback_pm_integration_build_check.md`) | Slip.recordSignature / Slip.acceptedBy 의 도메인 메서드와 service 호출 일치 검증 |
| Korean Path JDK Trap | runtime 검증이므로 영향 없음 |

---

## 7. 11 status 전이 매트릭스 (도메인 메서드 ↔ controller endpoint ↔ DB 컬럼)

본 시나리오의 핵심 — Slip 의 11 단계 + 2 분기 status 의 전이 규칙.

| 단계 | from | to | endpoint | 권한 | DB 컬럼 갱신 | inventory effect |
|---|---|---|---|---|---|---|
| 1 | (없음) | DRAFT | `POST /slips` | SALES/MANAGER/MASTER | `slips` row INSERT | (없음) |
| 2 | DRAFT | SAVED | `POST /slips/{id}/save` | SALES/MANAGER/MASTER | `status`, `modified_*` | (없음) |
| 3 | SAVED | SENT | `POST /slips/{id}/send` | SALES/MANAGER/MASTER | `status`, `modified_*` | (없음) |
| 4 | SENT | ACCEPTED | `POST /slips/{id}/accept` | WAREHOUSE/INVENTORY/MANAGER/MASTER | `status`, `accepted_by`, `accepted_at` | OUTBOUND: stock reserve |
| 5 | ACCEPTED | PROCESSING | `POST /slips/{id}/process` | WAREHOUSE/INVENTORY/MANAGER/MASTER | `status` | (없음) |
| 6 | PROCESSING | INSPECTING | `POST /slips/{id}/inspect` | WAREHOUSE/INVENTORY/MANAGER/MASTER | `status`, `inspector_user_id`, `inspector_signed_at` | (없음) |
| 7 | INSPECTING | COMPLETED | `POST /slips/{id}/complete` | WAREHOUSE/INVENTORY/MANAGER/MASTER | `status`, `completed_at` | OUTBOUND: stock deduct (FIFO) / INBOUND: stock inbound |
| 8 | COMPLETED | SHIPPING | `POST /slips/{id}/ship` | WAREHOUSE/INVENTORY/MANAGER/MASTER | `status` | (없음) — OUTBOUND only |
| 9 | SHIPPING | DELIVERED | `POST /slips/{id}/deliver` 또는 모바일 서명 | WAREHOUSE 또는 (anonymous via /public token) | `status`, `delivered_at`, `signature_*` | (없음) |
| 10 | DELIVERED | CONFIRMED | `POST /slips/{id}/confirm` | ACCOUNTANT/MANAGER/MASTER | `status`, `confirmed_at` | (없음) — INBOUND 는 COMPLETED → CONFIRMED 직행 |
| 분기 1 | SENT/ACCEPTED | REJECTED | `POST /slips/{id}/reject` | MANAGER/MASTER | `status`, `reject_reason` | ACCEPTED 였으면 reserve release |
| 분기 2 | DRAFT/SAVED/SENT | CANCELED | `POST /slips/{id}/cancel` | SALES/MANAGER/MASTER | `status` | (없음) |

### 7.1 INBOUND 슬립의 차이

INBOUND (입고전표) 는 다음 단계 생략:
- STEP 8 SHIPPING — 입고는 발송 X
- STEP 9 DELIVERED — 입고는 배송 X

INBOUND 의 라이프사이클:
`DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING → COMPLETED → CONFIRMED`

INBOUND 의 STEP 7 (COMPLETED) 시 — `inventory.inbound()` 호출 (신규 stock_lot INSERT).

### 7.2 도메인 메서드 ↔ controller 호출 매핑

| controller method | service 호출 | Slip 도메인 메서드 |
|---|---|---|
| `create` | `slipService.create` | `Slip.create()` (constructor) |
| `save` | `slipService.save` | `Slip.markSaved()` |
| `send` | `slipService.send` | `Slip.markSent()` |
| `accept` | `slipService.accept` | `Slip.accept(by)` + InventoryClient.reserve |
| `process` | `slipService.process` | `Slip.startProcess()` |
| `inspect` | `slipService.inspect` | `Slip.startInspect(by)` |
| `complete` | `slipService.complete` | `Slip.complete()` + InventoryClient.deduct/inbound |
| `ship` | `slipService.ship` | `Slip.markShipping()` |
| `deliver` | `slipService.deliver` | `Slip.markDelivered()` |
| `confirm` | `slipService.confirm` | `Slip.confirm(by)` |
| `reject` | `slipService.reject` | `Slip.reject(by, reason)` + (조건부) InventoryClient.release |
| `cancel` | `slipService.cancel` | `Slip.cancel(by)` |
| (모바일) | `signatureService.recordSignature` | `Slip.recordSignature(...)` + transitionToDelivered |

> 본 매핑은 PR review 시 service 와 controller 의 도메인 메서드 의미 정렬 검증 (`feedback_pm_integration_build_check.md`).

---

## 8. Error code 매트릭스 (slip + accounting)

| HTTP | error.code | 의미 | 발생 trigger |
|---|---|---|---|
| 400 | INVALID_INPUT | line 0 row / quantity ≤ 0 / unitPrice < 0 | CreateSlipRequest validation |
| 400 | INVALID_INPUT | partnerId UUID 형식 오류 | jakarta validation |
| 400 | INVALID_INPUT | 차/대 합계 mismatch | JournalService domain |
| 400 | INVALID_INPUT | 통제 계정 (is_leaf=false) 사용 | JournalService domain |
| 400 | INVALID_INPUT | reject reason blank | RejectRequest @NotBlank |
| 401 | UNAUTHORIZED | JWT 만료 또는 누락 | gateway JwtFilter |
| 403 | FORBIDDEN | role 권한 부족 | @PreAuthorize |
| 404 | NOT_FOUND | slipId 미존재 | SlipRepository |
| 404 | NOT_FOUND | productId 미존재 (cross-DB ProductClient.exists) | ProductClient lookup |
| 404 | NOT_FOUND | partnerId 미존재 (cross-DB PartnerClient.exists) | PartnerClient lookup |
| 404 | NOT_FOUND | accountCode 미존재 | ChartOfAccountRepository |
| 409 | CONFLICT | 상태 전이 위반 (예: DRAFT → CONFIRMED) | Slip 도메인 가드 |
| 409 | CONFLICT | INSUFFICIENT_STOCK | InventoryClient.reserve 시 |
| 409 | CONFLICT | 동시 수정 race (OptimisticLock) | @Version |
| 409 | CONFLICT | 이미 POSTED 인 분개 재 post | Journal 도메인 |
| 500 | INTERNAL | DB 연결 끊김 | DataAccessException |

### 8.1 GlobalExceptionHandler 매핑

각 service 의 `GlobalExceptionHandler` 가 BusinessException → ApiResponse.fail 변환:

```java
@ExceptionHandler(BusinessException.class)
public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException ex) {
    return ResponseEntity.status(httpStatusOf(ex.getErrorCode()))
            .body(ApiResponse.fail(ex.getErrorCode(), ex.getMessage()));
}
```

| ErrorCode | HTTP status |
|---|---|
| INVALID_INPUT | 400 |
| UNAUTHORIZED | 401 |
| FORBIDDEN | 403 |
| NOT_FOUND | 404 |
| CONFLICT | 409 |
| INTERNAL | 500 |

---

## 9. Performance baseline

| Endpoint | 평균 (ms) | p99 (ms) | 비고 |
|---|---|---|---|
| `POST /slips` (1 line) | 80 | 200 | partner/product validate cross-DB |
| `POST /slips` (10 line) | 150 | 350 | 라인별 ProductClient 호출 |
| `POST /slips/{id}/save` | 30 | 80 | DB update only |
| `POST /slips/{id}/accept` | 200 | 500 | InventoryClient.reserve cross-service |
| `POST /slips/{id}/complete` | 250 | 600 | InventoryClient.deduct + FIFO 로트 |
| `POST /slips/{id}/confirm` | 30 | 80 | DB update only |
| `POST /accounting/journals` (3 line) | 100 | 250 | accountCode validate × 3 |
| `POST /accounting/journals/{id}/post` | 50 | 120 | 차/대 검증 + status 갱신 |

### 9.1 측정 헬퍼

```sh
for stage in save send accept process inspect complete ship deliver confirm; do
  start=$(date +%s%N)
  curl -sS -X POST http://localhost:8080/api/slips/$SLIP_ID/$stage \
    -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER" > /dev/null
  end=$(date +%s%N)
  echo "$stage: $((($end - $start) / 1000000)) ms"
done
```

---

## 10. FE 화면 표시 contract (UUID 비공개 가드)

| 응답 필드 | type | FE 화면 노출? | 대체 식별자 |
|---|---|---|---|
| `slip.id` | UUID | **NO** | `slipNo` (2026/05/09-1) |
| `slip.partnerId` | UUID | **NO** | `partnerName` |
| `slip.sourceWarehouseId` | UUID | **NO** | `warehouseCode` (WH-MAIN) |
| `slip.requesterId` | UUID 또는 'system' | **NO** | (FE 가 employee lookup 후 displayName) |
| `slip.acceptedBy` | UUID 또는 'system' | **NO** | (FE 가 employee lookup 후 displayName) |
| `slip.inspectorUserId` | UUID | **NO** | (FE 가 employee lookup 후 displayName) |
| `slipLine.productId` | UUID | **NO** | `modelName` (AC-12000-A) + `productName` |
| `journal.id` | UUID | **NO** | `journalNo` |
| `journalLine.partnerId` | UUID | **NO** | partner-service lookup |
| `slip.slipNo`, `slip.slipDate`, `slip.status`, `slip.deliveryTag` | string | YES | (그대로 표시) |
| `slip.driverName`, `slip.driverPhone` | string | YES | (그대로 표시) |
| `slipLine.productName`, `modelName`, `quantity`, `unitPrice`, `lineTotal` | string/number | YES | (그대로 표시) |

---

## 11. Audit trail 검증

### 11.1 status 전이 audit log

향후 슬라이스 — `slip_status_audit` 테이블 추가 시 11 row 기록 검증.
현 슬라이스는 `BaseEntity.modified_at / modified_by` 만 마지막 수정자 보존.

### 11.2 BaseEntity 7 audit field 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT slip_no, status, created_by, created_at, modified_by, modified_at FROM slips WHERE id='$SLIP_ID';"
```

**기대값**:
- `created_by` = SALES caller (또는 'system')
- `created_at` = STEP 1 실행 시각
- `modified_by` = 마지막 수정자 (CONFIRMED 시 ACCOUNTANT)
- `modified_at` = STEP 11 실행 시각

### 11.3 inspector / accepted / completed / confirmed timestamp 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT slip_no, accepted_at, completed_at, confirmed_at, inspector_signed_at, delivered_at FROM slips WHERE id='$SLIP_ID';"
```

**기대값**: 모든 timestamp not null + 시간 순서 정렬:
`accepted_at < inspector_signed_at < completed_at < delivered_at < confirmed_at`

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT slip_no FROM slips WHERE id='$SLIP_ID'
      AND accepted_at < inspector_signed_at
      AND inspector_signed_at < completed_at
      AND completed_at < delivered_at
      AND delivered_at < confirmed_at;"
```

**기대값**: 1 row (시간 순서 정합).

---

## 12. Inventory cross-DB 정합성

### 12.1 stock_lot 변화 추적

```sh
# STEP 1 직전
docker exec -it samhan-postgres psql -U samhan -d inventory_db \
  -c "SELECT product_id, warehouse_id, lot_no, quantity, reserved_quantity FROM stock_lots
      WHERE product_id='$PRODUCT_ID' AND warehouse_id='$SOURCE_WH' AND NOT is_deleted ORDER BY received_at;"
```

기대값 — 시드 row (예: `qty=100, reserved=0`).

### 12.2 STEP 4 (accept) 직후

`reserved_quantity += 10`

### 12.3 STEP 7 (complete) 직후

FIFO 로트 deduct — 가장 오래된 로트부터 quantity 차감 + reserved_quantity 차감 동시.

```sh
docker exec -it samhan-postgres psql -U samhan -d inventory_db \
  -c "SELECT lot_no, received_at, initial_quantity, quantity, reserved_quantity FROM stock_lots
      WHERE product_id='$PRODUCT_ID' AND warehouse_id='$SOURCE_WH' AND NOT is_deleted ORDER BY received_at;"
```

**기대값**: 최초 lot 의 `quantity` -= 10 (또는 lot 1 소진 시 lot 2 일부 차감).

### 12.4 stock_movements 기록 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d inventory_db \
  -c "SELECT movement_type, quantity, reference_no, occurred_at FROM stock_movements
      WHERE reference_no='$SLIP_NO' ORDER BY occurred_at;"
```

**기대값**:
- 1 row `RESERVE qty=10` (STEP 4 시점)
- 1 row `DEDUCT qty=10` (STEP 7 시점)
- (조건부) `RELEASE qty=10` 시 STEP 4 후 reject 한 경우

---

## 13. Observability — log 검증

### 13.1 status 전이 로그 패턴

각 STEP 마다 slip-service 콘솔에 다음 로그 기록.

```
INFO  c.s.l.slip.service.SlipService : Slip 2026/05/09-1 transition: DRAFT → SAVED by sales-user-id
INFO  c.s.l.slip.service.SlipService : Slip 2026/05/09-1 transition: SAVED → SENT by sales-user-id
INFO  c.s.l.slip.service.SlipService : Slip 2026/05/09-1 transition: SENT → ACCEPTED by master-user-id, reserved 10 units (productId=...)
...
```

**검증**:

```sh
docker logs samhan-slip-service 2>&1 | grep "$SLIP_NO" | tail -20
```

### 13.2 Inventory call traceId 검증

(향후 — Sleuth 통합 시) — `slip-service` 의 traceId 가 `inventory-service` 콘솔에 동일하게 기록되어야 함.

---

## 14. 한국어 인코딩 가드

본 시나리오의 한국어 입력 검증.

| 입력 필드 | 예시 값 | byte (UTF-8) |
|---|---|---|
| `partnerName` | (주)에스엠하나공조 | 28 byte |
| `memo` | 풀-수준 시나리오 2 검증 | 32 byte |
| `driverName` | 기사 박철수 | 17 byte |
| `productName` | 천장 카세트형 에어컨 12000BTU | 36 byte |
| `note` | 5월 정기납품 | 19 byte |

### 14.1 DB 측 한국어 보존 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT partner_name, memo, driver_name FROM slips WHERE id='$SLIP_ID';"
```

**기대값**: 한국어 깨짐 X. mojibake (예: `(二)에스엠하나공조`) 발견 시 PowerShell UTF-16 BOM 트랩 의심.

---

## 15. 시드 데이터 풀 라이프사이클 100건 검증

SLIP_SEED_TEST_DATA=true 시 시드된 100건 슬립의 status 분포 검증.

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT status, count(*) FROM slips WHERE NOT is_deleted GROUP BY status ORDER BY status;"
```

**기대값** (11 status 균등 분포 — seeder spec):

| status | count |
|---|---|
| DRAFT | 9 |
| SAVED | 9 |
| SENT | 9 |
| ACCEPTED | 9 |
| PROCESSING | 9 |
| INSPECTING | 9 |
| COMPLETED | 9 |
| SHIPPING | 9 |
| DELIVERED | 9 |
| CONFIRMED | 9 |
| REJECTED | 5 |
| CANCELED | 5 |
| **total** | **100** |

> 분포는 seeder spec 에 따라 ±2 변동 허용.

### 15.1 OUTBOUND vs INBOUND 분포

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT slip_type, count(*) FROM slips WHERE NOT is_deleted GROUP BY slip_type;"
```

**기대값**: OUTBOUND 80 / INBOUND 20 (4:1 비율 — 일반 영업 패턴 가정).

---

## 16. Production-readiness gap 분석

| 항목 | dev (현 상태) | production 요구사항 | gap 해결 슬라이스 |
|---|---|---|---|
| 자동 분개 | 수동 입력 (Plan A3 deferred) | 자동 trigger | accounting-slice-A3 |
| 인쇄 양식 | (별도 슬라이스 — slip-output-format) | 거래명세서 PDF 출력 | slip-output-format-slice |
| 재고 alert | 없음 | 재고 < safety_stock 시 notification | (Phase 11) |
| Idempotency-Key (mutation) | accept/complete 미적용 | 모든 mutation idempotent | (Phase 11 hardening) |
| Outbox pattern | partner-order-service 만 | 모든 cross-service mutation | (Phase 11) |
| Audit history (status 전이 이력) | BaseEntity 1 row 만 | slip_status_audit 11 row | (향후 슬라이스) |

---

## 17. 종료 기준 (full)

- [ ] STEP 1~11 happy path
- [ ] STEP 4 / STEP 7 inventory reserve / deduct
- [ ] STEP 11 분개 POST + 차/대 일치
- [ ] §3 Negative 6건
- [ ] §4 정합성 5건
- [ ] §7 11 status 전이 매트릭스 검증
- [ ] §8 error matrix 15+ 케이스
- [ ] §9 performance baseline 8 endpoint
- [ ] §10 UUID 비공개 가드 13 필드
- [ ] §11 audit trail 시간 순서
- [ ] §12 stock_movement 기록
- [ ] §13 observability log 패턴
- [ ] §14 한국어 인코딩
- [ ] §15 시드 100건 status 분포
- [ ] §16 prod-readiness gap 6건 인지
- [ ] QA 스크린샷 — Edge 슬립 상세 (CONFIRMED + 11 단계 timeline)

---

## 18. 다음 시나리오 진입 가드

본 시나리오 통과 후 → `03-mobile-signature.md` 진입.
실패 시 → BE 팀에 status 전이 단계별 console log 첨부하여 alert.

### 18.1 alert 템플릿

```
[QA Alert] 시나리오 2 실패 — STEP <N> (status: <from> → <to>)

기대값: <expected>
실제값: <actual>

slipNo: <SLIP_NO>
slipId: <SLIP_ID>

console log (slip-service):
<log snippet — Slip transition>

console log (inventory-service):
<log snippet — reserve/deduct>

stock_lot 상태 (직전):
<SELECT 결과>

stock_lot 상태 (직후):
<SELECT 결과>
```

---

## 19. 참고 자료

- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java` — 11 status 전이 endpoint
- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java` — 도메인 메서드
- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipStatus.java` — 11 + 2 enum
- `services/inventory-service/src/main/java/.../StockController.java` — reserve / deduct / inbound
- `services/accounting-service/src/main/java/.../JournalController.java` — 분개 라이프사이클
- `services/slip-service/src/main/resources/db/migration/V1__init_slip_service.sql` — 스키마
- `services/slip-service/src/main/resources/db/migration/V2__add_slip_signature_and_inspecting.sql` — INSPECTING 단계 추가
- `feedback_pm_integration_build_check.md` — Layer 4 도메인 메서드 의미 정렬 가드
- `docs/qa/sales-polish-2-slice/qa-report.md` — INSPECTING 단계 추가 슬라이스 reference
