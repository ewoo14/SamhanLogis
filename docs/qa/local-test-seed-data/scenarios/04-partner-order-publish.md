# 시나리오 4 — 거래처 주문 → 슬립 자동 발행 (idempotency)

> **목적**: PARTNER role 이 임시저장 → 확정 시 → SlipPublishService 가 출고 슬립 자동 발행 + Idempotency-Key 멱등성 검증
> **선행 조건**: 시나리오 1 통과 + partner-order-service / slip-service / partner-auth-service / inventory-service ready
> **소요 시간**: 약 10분
> **검증 대상**: partner-order-service / slip-service (SlipPublishController) / partner-auth-service / inventory-service / slip_publish_audit
> **인용**: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipPublishController.java` + `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/{PartnerOrderDraftController,PartnerOrderConfirmController}.java` + `V8__create_slip_publish_audit.sql`

---

## 0. 사전 가정 — Idempotency 매트릭스

`SlipPublishController` Javadoc 에서 인용:

| 입력 | 응답 코드 | 의미 |
|---|---|---|
| 새 키 + 새 본문 | `201 Created` | 신규 발행 + 신규 slipNo |
| 같은 키 + 같은 본문 | `200 OK` + `idempotentReplay=true` | 기존 slipNo 재반환 |
| 같은 키 + 다른 본문 | `409 Conflict` | 멱등 충돌 |
| 새 키 + 기존 본문 (다른 호출) | `201 Created` | 신규 발행 (별도 slip) |

---

## 1. STEP 1 — PARTNER 로그인 (partner-auth-service)

```sh
PARTNER_TOKEN=$(curl -sS -X POST http://localhost:8080/api/partner-auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"smhana","password":"partner!2026"}' | jq -r '.data.accessToken')
PARTNER_USER_ID=$(curl -sS http://localhost:8080/api/partner-auth/me -H "Authorization: Bearer $PARTNER_TOKEN" | jq -r '.data.userId')
PARTNER_CODE="P0001"   # (주)에스엠하나공조 가정
```

> partner-auth-service 의 시드 PARTNER 계정 (BE 팀 신규 seeder 발행 예정).
> partner_code 는 사용자 노출 식별자 (UUID 비공개 가드).

### 1.1 partner ↔ user 매핑 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d partner_db \
  -c "SELECT partner_code, name, status FROM partners WHERE partner_code='P0001';"
```

**기대값**: `name='(주)에스엠하나공조'`, `status='ACTIVE'`

---

## 2. STEP 2 — 임시저장 생성 (PartnerOrderDraftController)

```sh
DRAFT_RESP=$(curl -sS -X POST http://localhost:8080/api/v1/partner-orders/drafts \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "X-User-Id: $PARTNER_USER_ID" \
  -H "X-Partner-Code: $PARTNER_CODE" \
  -H "X-User-Role: PARTNER" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "5월 정기 주문 — 시나리오 4",
    "payload": {
      "lines": [
        {"productCode":"AC-12000-A","quantity":3,"unitPrice":850000},
        {"productCode":"AC-18000-B","quantity":2,"unitPrice":1200000}
      ],
      "deliveryAddress": "서울특별시 강남구 ...",
      "requestedDeliveryDate": "2026-05-15"
    }
  }')

DRAFT_ID=$(echo $DRAFT_RESP | jq -r '.data.draftId')
DRAFT_SEQ=$(echo $DRAFT_RESP | jq -r '.data.draftSeq')
echo "Draft created: id=$DRAFT_ID seq=$DRAFT_SEQ"
```

**기대 status**: `201 Created`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "draftId": "<UUID>",
    "draftSeq": 1,
    "label": "5월 정기 주문 — 시나리오 4",
    "createdAt": "2026-05-09T...",
    "ttlExpiresAt": "2026-06-08T..."
  }
}
```

**검증 포인트**:
- [ ] `data.draftSeq` >= 1 (거래처별 자동 채번)
- [ ] `data.ttlExpiresAt` ≈ now + 30일 (legacy saveOrderSnapshot 30일 TTL)
- [ ] **응답 화면 표시**: `draftSeq + label` 만 (draftId UUID 비노출 가드)

### 2.1 본인 거래처만 list 검증

```sh
curl http://localhost:8080/api/v1/partner-orders/drafts?page=0&size=20 \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "X-Partner-Code: $PARTNER_CODE" \
  -H "X-User-Role: PARTNER"
```

**기대값**: 본인 거래처 (`P0001`) draft 만 반환. 다른 거래처 draft 미포함.

---

## 3. STEP 3 — 주문 확정 + 신규 발행 (Idempotency-Key 첫 호출)

```sh
IDEMP_KEY="scenario-4-uuid-$(uuidgen)"   # 또는 고정 문자열

CONFIRM_RESP=$(curl -sS -X POST http://localhost:8080/api/v1/partner-orders/$DRAFT_ID/confirm \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "X-User-Id: $PARTNER_USER_ID" \
  -H "X-Partner-Code: $PARTNER_CODE" \
  -H "X-User-Role: PARTNER" \
  -H "Idempotency-Key: $IDEMP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouseCode": "WH-MAIN",
    "deliveryDate": "2026-05-15"
  }')

SLIP_NO_FIRST=$(echo $CONFIRM_RESP | jq -r '.data.slipNo')
ORDER_ID=$(echo $CONFIRM_RESP | jq -r '.data.orderId')
echo "Slip published: slipNo=$SLIP_NO_FIRST orderId=$ORDER_ID"
```

**기대 status**: `200 OK` (PartnerOrderConfirmController 는 200 반환 — 내부에서 SlipPublishService 호출 후 결과 wrap)

> SlipPublishController 직접 호출 시는 `201 Created`. PartnerOrderConfirmService 가 SlipPublishService 호출 후 결과를 자체 응답으로 wrap.

**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "orderId": "<UUID>",
    "orderNo": "2026/05/09-1",
    "slipNo": "2026/05/09-6",
    "status": "PUBLISHED",
    "idempotentReplay": false
  }
}
```

**검증 포인트**:
- [ ] `data.slipNo` not null (slip-service 발행 성공)
- [ ] `data.status == "PUBLISHED"` (PENDING_RETRY X — 정상 발행)
- [ ] `data.idempotentReplay == false` (신규 발행)

---

## 4. STEP 4 — 같은 Idempotency-Key + 같은 본문 → 200 OK (Replay)

```sh
REPLAY_RESP=$(curl -sS -X POST http://localhost:8080/api/v1/partner-orders/$DRAFT_ID/confirm \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "X-Partner-Code: $PARTNER_CODE" \
  -H "X-User-Role: PARTNER" \
  -H "Idempotency-Key: $IDEMP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouseCode": "WH-MAIN",
    "deliveryDate": "2026-05-15"
  }')

SLIP_NO_REPLAY=$(echo $REPLAY_RESP | jq -r '.data.slipNo')
```

**기대 status**: `200 OK`
**기대 본문**:
- `data.slipNo == $SLIP_NO_FIRST` (같은 slipNo 반환)
- `data.idempotentReplay == true`

**검증 포인트**:
- [ ] `$SLIP_NO_REPLAY == $SLIP_NO_FIRST` (멱등 보장)

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT count(*) FROM slips WHERE source_type='PARTNER_ORDER' AND source_id='$ORDER_ID' AND NOT is_deleted;"
```

**기대값**: `1` (재호출에도 신규 row 생성 X)

---

## 5. STEP 5 — 같은 Idempotency-Key + 다른 본문 → 409

> draft confirm 의 본문은 한 번만 가능 — 본 검증은 SlipPublishController 직접 호출로 시뮬레이션.
> partner-order-service 는 confirm 1회 후 status=CONFIRMED 로 잠금되므로 재호출 불가.

직접 SlipPublishController 호출 (서비스 인증):

```sh
curl -i -X POST http://localhost:8080/api/v1/slips/from-partner-order \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Role: MASTER" \
  -H "Idempotency-Key: $IDEMP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "partnerOrderId": "DIFFERENT_ORDER_ID",
    "warehouseCode": "WH-MAIN",
    "lines": [{"productCode":"DIFFERENT-MODEL","quantity":99,"unitPrice":1}]
  }'
```

**기대 status**: `409 Conflict`
**기대 본문**: `error.code: CONFLICT`, `message contains "Idempotency-Key"` 또는 `"본문 mismatch"`

---

## 6. STEP 6 — slip_publish_audit 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT slip_id, source_type, source_id, idempotency_key, supply_amount, vat_amount, created_by, created_at
      FROM slip_publish_audit
      WHERE source_type='PARTNER_ORDER' AND source_id='$ORDER_ID' AND NOT is_deleted
      ORDER BY created_at;"
```

**기대값**:
- 1 row (replay 호출도 audit 신규 추가 X — `idempotency_key` 단일 키 추적)
- `supply_amount == 5,250,000` (3 × 850,000 + 2 × 1,200,000)
- `vat_amount == 525,000` (10%)
- `created_by` not null (caller 식별자)

### 6.1 by-source 조회 검증

```sh
curl "http://localhost:8080/api/v1/slips/by-source?sourceType=PARTNER_ORDER&sourceId=$ORDER_ID" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": [
    {
      "slipNo": "2026/05/09-6",
      "sourceType": "PARTNER_ORDER",
      "sourceId": "<orderId>",
      "idempotencyKey": "scenario-4-uuid-...",
      "createdAt": "2026-05-09T..."
    }
  ]
}
```

**검증 포인트**:
- [ ] `data.length == 1` (idempotency 보장 — 같은 source 에 1 slip)

---

## 7. STEP 7 — 신규 발행된 slip 검증 (slip-service 측)

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT slip_no, slip_type, status, source_type, source_id, partner_id
      FROM slips
      WHERE slip_no='$SLIP_NO_FIRST';"
```

**기대값**:
- `slip_type == 'OUTBOUND'`
- `status == 'SAVED'` 또는 `'SENT'` (PartnerOrderConfirmService 가 자동 SENT 진입)
- `source_type == 'PARTNER_ORDER'`
- `source_id == $ORDER_ID`

### 7.1 slip lines 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT product_id, model_name, quantity, unit_price, line_total
      FROM slip_lines
      WHERE slip_id = (SELECT id FROM slips WHERE slip_no='$SLIP_NO_FIRST')
      ORDER BY model_name;"
```

**기대값**:
- 2 row (`AC-12000-A` × 3 / `AC-18000-B` × 2)
- 라인 합계: 2,550,000 + 2,400,000 = 4,950,000 (VAT 별도)

---

## 8. STEP 8 — Negative tests

### 8.1 inventory 부족 → PENDING_RETRY 또는 409

재고 0 인 product 로 주문:

```sh
curl -i -X POST http://localhost:8080/api/v1/partner-orders/<EMPTY_DRAFT_ID>/confirm \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "X-Partner-Code: $PARTNER_CODE" \
  -H "X-User-Role: PARTNER" \
  -H "Idempotency-Key: scenario-4-empty-stock-$(uuidgen)" \
  -d '{"warehouseCode":"WH-MAIN","deliveryDate":"2026-05-15"}'
```

**기대 status**: `409 Conflict` 또는 `200 OK` + `data.status: PENDING_RETRY`
**기대 본문**: `error.code: CONFLICT` 또는 `data.status: PENDING_RETRY`, error message contains `"재고"` 또는 `"INSUFFICIENT_STOCK"`

### 8.2 다른 거래처 draft 의 confirm 시도 → 403 또는 404

P0001 partner 가 P0002 의 draft 를 confirm 시도:

```sh
P0002_DRAFT_ID="<P0002 가 발행한 draftId>"
curl -i -X POST http://localhost:8080/api/v1/partner-orders/$P0002_DRAFT_ID/confirm \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "X-Partner-Code: P0001" \
  -H "X-User-Role: PARTNER" \
  -H "Idempotency-Key: cross-partner-test-$(uuidgen)" \
  -d '{"warehouseCode":"WH-MAIN","deliveryDate":"2026-05-15"}'
```

**기대 status**: `403 Forbidden` 또는 `404 Not Found`
**기대 본문**: `error.code: FORBIDDEN` 또는 `NOT_FOUND`

### 8.3 X-Partner-Code 누락 → 400

```sh
curl -i -X POST http://localhost:8080/api/v1/partner-orders/$DRAFT_ID/confirm \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "X-User-Role: PARTNER" \
  -H "Idempotency-Key: missing-code-$(uuidgen)" \
  -d '{"warehouseCode":"WH-MAIN","deliveryDate":"2026-05-15"}'
```

**기대 status**: `400 Bad Request` 또는 `403 Forbidden`

---

## 9. STEP 9 — 30건 시드 주문 + 발행 검증

PARTNER_ORDER_SEED_TEST_DATA=true 시 시드된 30건 주문 검증.

```sh
docker exec -it samhan-postgres psql -U samhan -d partner_order_db \
  -c "SELECT count(*) AS drafts FROM partner_order_drafts WHERE NOT is_deleted;"

docker exec -it samhan-postgres psql -U samhan -d partner_order_db \
  -c "SELECT status, count(*) FROM partner_orders WHERE NOT is_deleted GROUP BY status;"

# slip-service 측 PARTNER_ORDER 발행 슬립
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT count(*) AS slips_from_po FROM slips WHERE source_type='PARTNER_ORDER' AND NOT is_deleted;"

docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT count(*) AS audit_rows FROM slip_publish_audit WHERE source_type='PARTNER_ORDER' AND NOT is_deleted;"
```

**기대값**:
- `drafts`: 30+ (시드 + STEP 2 추가)
- `partner_orders status`: PUBLISHED 25 / PENDING_RETRY 3 / CONFIRMED 2 (시드 분포)
- `slips_from_po`: PUBLISHED 와 일치
- `audit_rows`: PUBLISHED 와 일치 (1:1)

---

## 10. 정합성 검증 (시나리오 4 한정)

| Check | psql query | 기대값 |
|---|---|---|
| Idempotency 1:1 보장 | `SELECT idempotency_key, count(*) FROM slip_publish_audit WHERE source_type='PARTNER_ORDER' AND idempotency_key IS NOT NULL GROUP BY 1 HAVING count(*) > 1;` | 0 row |
| source_id ↔ partner_orders FK 정합 | `SELECT count(*) FROM slip_publish_audit a WHERE a.source_type='PARTNER_ORDER' AND NOT EXISTS (SELECT 1 FROM partner_order_db.partner_orders po WHERE po.id::text = a.source_id);` (cross-DB) | 0 |
| supply_amount + vat_amount == 라인 합계 + 10% | `SELECT slip_id, supply_amount, vat_amount, supply_amount * 0.1 - vat_amount AS diff FROM slip_publish_audit WHERE source_type='PARTNER_ORDER';` | diff ≈ 0 (10원 이내 반올림) |
| seeder 재실행 시 row 동일 | seeder 2회 실행 후 STEP 9 SQL 재호출 | row count 동일 |

---

## 11. 종료 기준

- [ ] STEP 2 임시저장 + draftSeq 자동 채번
- [ ] STEP 3 신규 발행 (slipNo not null)
- [ ] STEP 4 멱등 replay (slipNo 동일 + idempotentReplay=true)
- [ ] STEP 5 다른 본문 + 같은 키 → 409
- [ ] STEP 6 slip_publish_audit 1 row + supply/vat 검증
- [ ] STEP 7 slip-service 측 slip + lines 검증
- [ ] STEP 8 Negative 3건
- [ ] STEP 9 시드 30 row count 일치
- [ ] §10 정합성 4건
- [ ] QA 스크린샷 1장 — partner Edge 의 confirm 결과 화면 (slipNo + idempotentReplay 표시)
  - 저장: `docs/qa/local-test-seed-data/screenshots/04-partner-order-publish.png`

---

## 12. 회귀 가드 / 알려진 이슈

| 이슈 | 회피책 |
|---|---|
| Outbox 비활성 시 PENDING_RETRY race | partner-order-service `outbox.enabled=true` 확인 |
| Circuit Breaker open → 200 + PENDING_RETRY | slip-service health 확인 후 retry |
| Cross-DB FK 검증 (`feedback_pm_integration_build_check.md`) | 본 시나리오는 logical reference 만 — slip_publish_audit 의 source_id 는 partner_orders.id 의 string repr |
| PR #80/85 회고 | 본 시나리오 PR 에 partner-order-service README + dev-report 동기 갱신 |

---

## 13. SlipPublishService Idempotency 매트릭스 (정밀)

`SlipPublishController` Javadoc + 도메인 인용:

| 호출 # | Idempotency-Key | 본문 hash | 응답 status | idempotentReplay | 신규 audit row | 신규 slip row |
|---|---|---|---|---|---|---|
| 1 | K1 | H1 | 201 Created | false | YES (1) | YES (1) |
| 2 | K1 | H1 (동일) | 200 OK | true | NO | NO |
| 3 | K1 | H2 (변경) | 409 Conflict | (none) | NO | NO |
| 4 | K2 | H1 | 201 Created | false | YES (1 추가) | YES (1 추가) |
| 5 | K2 | H1 (동일) | 200 OK | true | NO | NO |
| 6 | (none) | H1 | 201 Created (replay 보호 X) | false | YES (1 추가) | YES (1 추가) |

> 본문 hash 는 SHA-256(canonicalized JSON) — service 내부 계산.
> Idempotency-Key 누락 시 — 매 호출마다 신규 발행 (replay 보호 미작동, 권장 X).

### 13.1 본문 canonicalize 규약

서비스가 Idempotency-Key 충돌 검증 시 본문을 다음 패턴으로 정규화:
1. JSON 키 알파벳 정렬
2. whitespace 제거
3. number trailing zero 제거 (예: `850000.00` → `850000`)
4. SHA-256 hash → BASE64URL encode

검증 실패 시 (다른 본문) → 409 + `error.message contains "본문 mismatch"`.

---

## 14. partner-auth-service 인증 매트릭스

partner-auth-service 는 employees 와 별개 — 거래처 직원의 인증 + role.

| Role | endpoint 접근 |
|---|---|
| `PARTNER` | `/api/partner-auth/*` + `/api/v1/partner-orders/*` (본인 거래처 한정) |
| `PARTNER_ADMIN` | + 모든 거래처 view (multi-partner 운영 시) |
| `MASTER/MANAGER` (employee) | partner-order-service 의 admin 화면 — 모든 거래처 조회 |

### 14.1 X-Partner-Code 헤더 가드

partner-order-service 의 모든 mutation endpoint 는 `X-Partner-Code` 필수 — gateway 가 JWT 의 `partnerCode` claim 에서 자동 주입.

```sh
curl -s http://localhost:8080/api/v1/partner-orders/drafts \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "X-Partner-Code: P0001" \
  | jq '.data[].partnerCode' | sort -u
```

**기대값**: `"P0001"` 만 (본인 거래처 한정).

### 14.2 다른 X-Partner-Code 위변조 시도

```sh
curl -i -H "Authorization: Bearer $PARTNER_TOKEN_P0001" \
  -H "X-Partner-Code: P0002" \
  "http://localhost:8080/api/v1/partner-orders/drafts"
```

**기대 status**: `403 Forbidden` 또는 빈 결과 (gateway 또는 service 레벨 가드).

> Phase 11 hardening 시점 — gateway 가 JWT claim 과 헤더 mismatch 검증 의무.

---

## 15. Error code 매트릭스 (partner-order + slip-publish)

| HTTP | error.code | 의미 | 발생 trigger |
|---|---|---|---|
| 400 | INVALID_INPUT | warehouseCode 미존재 | inventory-service lookup 실패 |
| 400 | INVALID_INPUT | productCode 미존재 | product-service lookup 실패 |
| 400 | INVALID_INPUT | quantity 0 또는 음수 | DraftCreateRequest validation |
| 400 | INVALID_INPUT | unitPrice 음수 | validation |
| 400 | INVALID_INPUT | deliveryDate 과거 | confirm 시 검증 |
| 401 | UNAUTHORIZED | partner JWT 만료/위변조 | partner-auth filter |
| 403 | FORBIDDEN | 다른 거래처 draft 접근 | X-Partner-Code mismatch |
| 404 | NOT_FOUND | draftId 미존재 | DraftRepository |
| 404 | NOT_FOUND | partnerCode 미존재 | partner-service lookup |
| 409 | CONFLICT | 이미 confirm 된 draft | PartnerOrderConfirmService |
| 409 | CONFLICT | INSUFFICIENT_STOCK | inventory-service.reserve |
| 409 | CONFLICT | Idempotency-Key 충돌 (다른 본문) | SlipPublishService canonicalize 검증 |
| 409 | CONFLICT | 동시 confirm race | OptimisticLock |
| 500 | INTERNAL | slip-service 일시 down → PENDING_RETRY (200 으로 응답) | Circuit Breaker open |

---

## 16. Performance baseline

| Endpoint | 평균 (ms) | p99 (ms) | 비고 |
|---|---|---|---|
| `POST /api/v1/partner-orders/drafts` | 80 | 200 | DB insert + draftSeq 채번 |
| `GET /api/v1/partner-orders/drafts` (page) | 50 | 150 | DB index hit |
| `POST /api/v1/partner-orders/{id}/confirm` (happy) | 800 | 2000 | DC + reserve + slip 발행 cross-service |
| `POST /api/v1/partner-orders/{id}/confirm` (PENDING_RETRY) | 5000 | 10000 | Circuit Breaker timeout |
| `POST /api/v1/slips/from-partner-order` (직접) | 400 | 1000 | slip 발행 단독 |
| `POST /api/v1/slips/from-partner-order` (replay) | 80 | 200 | DB lookup only |
| `GET /api/v1/slips/by-source` | 30 | 80 | index hit |

---

## 17. FE 화면 표시 contract

| 응답 필드 | type | 거래처 화면 노출? | 비고 |
|---|---|---|---|
| `draft.draftId` | UUID | **NO** | 화면은 `draftSeq` 사용 |
| `draft.draftSeq`, `label`, `createdAt` | string/number | YES | (그대로 표시) |
| `confirm.orderId`, `slipId` | UUID | **NO** | `orderNo`, `slipNo` 사용 |
| `confirm.orderNo`, `slipNo`, `status` | string | YES | (그대로 표시) |
| `confirm.idempotentReplay` | boolean | YES (FE alert "이미 발행됨") | (devtool toast) |
| `audit.idempotency_key` | string | **NO** | 디버그 only |

---

## 18. Audit trail — slip_publish_audit 누적 검증

`slip_publish_audit` 는 **soft-delete 만 적용 + 영구 보존** (회계 reference).

```sql
-- slip_db
SELECT count(*) AS total, count(*) FILTER (WHERE source_type='ESTIMATE') AS estimates,
       count(*) FILTER (WHERE source_type='PARTNER_ORDER') AS po,
       count(*) FILTER (WHERE source_type='MANUAL') AS manual
FROM slip_publish_audit WHERE NOT is_deleted;
```

**기대값**: 시드 + 시나리오 진행 중 누적 row.

### 18.1 supply_amount + vat_amount = lineTotal × (1 + 0.1)

```sql
SELECT slip_id, supply_amount, vat_amount,
       supply_amount * 0.10 AS expected_vat,
       ABS(supply_amount * 0.10 - vat_amount) AS diff
FROM slip_publish_audit
WHERE NOT is_deleted
ORDER BY diff DESC
LIMIT 5;
```

**기대값**: `diff < 1.00` (반올림 1원 이내).

### 18.2 applied_dc_snapshot 검증

JSONB 컬럼 — legacy ADD_TXT_06_T 등 DC/할인 정보 보존.

```sql
SELECT slip_id, jsonb_typeof(applied_dc_snapshot) AS json_type,
       applied_dc_snapshot->'discountRate' AS dc_rate
FROM slip_publish_audit
WHERE applied_dc_snapshot IS NOT NULL AND NOT is_deleted
LIMIT 5;
```

**기대값**: `json_type == 'object'` + `dc_rate` numeric.

---

## 19. Outbox + Circuit Breaker 검증

partner-order-service 의 confirm 흐름 — outbox + Circuit Breaker.

### 19.1 outbox 테이블

```sql
docker exec -it samhan-postgres psql -U samhan -d partner_order_db \
  -c "SELECT count(*), status FROM outbox_events WHERE event_type='ORDER_CONFIRMED' GROUP BY status;"
```

**기대값**:
- `PUBLISHED`: 정상 발행된 이벤트 수
- `FAILED`: Circuit Breaker open / slip-service 5xx 시 누적
- `PENDING`: 처리 대기 중 (1초 미만)

### 19.2 Circuit Breaker 상태 (Resilience4j)

```sh
curl http://localhost:8086/actuator/circuitbreakers | jq .
```

**기대값**:

```json
{
  "circuitBreakers": [
    {"name":"slipPublish","state":"CLOSED","failureRate":2.5,"slowCallRate":1.2,...}
  ]
}
```

> `state == "OPEN"` 시 — slip-service 호출 차단됨, confirm 시 PENDING_RETRY 응답.
> `HALF_OPEN` 후 일부 성공 시 자동 CLOSED 복구.

### 19.3 강제 OPEN trigger 검증

```sh
docker stop samhan-slip-service
# 5건 confirm 호출 → 4건은 5xx, Circuit Breaker OPEN
for i in 1 2 3 4 5; do
  curl -X POST http://localhost:8080/api/v1/partner-orders/$DRAFT_ID/confirm \
    -H "Authorization: Bearer $PARTNER_TOKEN" -H "X-Partner-Code: $PARTNER_CODE" \
    -H "Idempotency-Key: open-test-$i" \
    -d '{"warehouseCode":"WH-MAIN","deliveryDate":"2026-05-15"}'
done
docker start samhan-slip-service
```

**기대값**: 마지막 호출은 즉시 PENDING_RETRY 응답 (Circuit Breaker OPEN).

---

## 20. Observability — log + metric

### 20.1 SlipPublishService log 패턴

```
INFO  c.s.l.slip.publish.SlipPublishService : publishFromPartnerOrder request — sourceId=<orderId> idempotencyKey=<K>
INFO  c.s.l.slip.publish.SlipPublishService : Slip published: slipNo=2026/05/09-6 sourceType=PARTNER_ORDER
INFO  c.s.l.slip.publish.SlipPublishService : Idempotent replay — same key+body, returning slipNo=2026/05/09-6
WARN  c.s.l.slip.publish.SlipPublishService : Idempotency conflict — same key=<K>, different body hash
```

### 20.2 Prometheus metric

```sh
curl http://localhost:9090/api/v1/query?query=slip_publish_total | jq .
```

**기대값**: `value` 가 STEP 3+9 호출 횟수 합계.

---

## 21. 한국어 인코딩 가드

| 입력 필드 | 예시 | 비고 |
|---|---|---|
| `draft.label` | "5월 정기 주문 — 시나리오 4" | 한국어 + ASCII 혼용 |
| `payload.deliveryAddress` | "서울특별시 강남구 ..." | 한국어 |

```sql
SELECT label, length(label), octet_length(label) FROM partner_order_drafts WHERE id='$DRAFT_ID';
```

---

## 22. 시드 30건 시나리오

`PARTNER_ORDER_SEED_TEST_DATA=true` — 30건 draft + confirm 흐름.

```sql
-- partner_order_db
SELECT
    count(*) FILTER (WHERE status='PUBLISHED') AS published,
    count(*) FILTER (WHERE status='PENDING_RETRY') AS pending_retry,
    count(*) FILTER (WHERE status='CONFIRMED') AS confirmed,
    count(*) FILTER (WHERE status='REJECTED') AS rejected
FROM partner_orders WHERE NOT is_deleted;
```

**기대값**: PUBLISHED 25 / PENDING_RETRY 3 / CONFIRMED 2 / REJECTED 0 (분포 ±2 허용).

### 22.1 slip-service 측 audit cross-check

```sh
# partner_order_db 의 PUBLISHED orderId list
docker exec -t samhan-postgres psql -U samhan -d partner_order_db -At \
  -c "SELECT id FROM partner_orders WHERE status='PUBLISHED' AND NOT is_deleted;" \
  | sort > /tmp/po-published.txt

# slip_db 의 audit source_id list
docker exec -t samhan-postgres psql -U samhan -d slip_db -At \
  -c "SELECT source_id FROM slip_publish_audit WHERE source_type='PARTNER_ORDER' AND NOT is_deleted;" \
  | sort > /tmp/slip-audit-po.txt

diff /tmp/po-published.txt /tmp/slip-audit-po.txt
```

**기대값**: `diff` 빈 출력 (1:1 매칭).

---

## 23. Production-readiness gap 분석

| 항목 | dev (현 상태) | production 요구사항 | gap 해결 슬라이스 |
|---|---|---|---|
| Outbox 발행 retry | 1회 즉시 + scheduler 1분 | exponential backoff + 24h DLQ | (Phase 11 outbox hardening) |
| Idempotency 본문 hash | service 측 계산 | hash 사전 계산하여 client 가 헤더로 동봉 권장 | (Phase 11) |
| draft TTL 30일 | hardcoded | 거래처 별 동적 | (Phase 11) |
| Circuit Breaker tuning | Resilience4j default | failureRateThreshold/slowCallRate 운영 모니터링 | (Phase 11) |
| audit S3 archive | 없음 (DB 영구 보존) | 1년 후 S3 cold storage 이전 | (Phase 11) |
| partner_orders soft-delete + 회계 | 모든 row 보존 | 회계 마감 분기는 immutable lock | (Phase 11) |

---

## 24. 종료 기준 (full)

- [ ] STEP 1~9 모두
- [ ] §10 정합성 4건
- [ ] §13 idempotency 매트릭스 6 케이스
- [ ] §14 partner-auth 가드 2 검증
- [ ] §15 error matrix 14 케이스
- [ ] §16 perf baseline 7 endpoint
- [ ] §17 FE display contract 6 필드
- [ ] §18 audit 영구 보존 + supply/vat
- [ ] §19 outbox + Circuit Breaker
- [ ] §20 observability log + metric
- [ ] §21 한국어 인코딩
- [ ] §22 시드 30건 분포 + cross-DB 매칭
- [ ] §23 prod-readiness gap 6건
- [ ] QA 스크린샷 — confirm 결과 + slipNo + idempotentReplay

---

## 25. 다음 시나리오 진입 가드

본 시나리오 통과 후 → `05-accounting-reports.md` 진입.

### 25.1 alert 템플릿

```
[QA Alert] 시나리오 4 실패 — STEP <N>

기대값: <expected>
실제값: <actual>

draftId: <id>
orderId: <id>
slipNo: <slipNo>
idempotencyKey: <K>

console log (partner-order-service):
<log>

console log (slip-service):
<log>

slip_publish_audit row:
<SELECT>

partner_orders row:
<SELECT>

Circuit Breaker state:
<actuator/circuitbreakers>
```

---

## 26. 참고 자료

- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipPublishController.java` — 발행 endpoint
- `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java` — idempotency 로직
- `services/partner-order-service/src/main/java/.../web/PartnerOrderConfirmController.java` — confirm 흐름
- `services/partner-order-service/src/main/java/.../web/PartnerOrderDraftController.java` — draft CRUD
- `services/slip-service/src/main/resources/db/migration/V8__create_slip_publish_audit.sql` — audit 스키마
- `services/slip-service/src/main/resources/db/migration/V9__add_slip_publish_audit_fingerprint.sql` — 본문 fingerprint
- `docs/migration/phase6/M5-slip-service-integration.md` — Phase 6 M5 설계
- `feedback_pm_integration_build_check.md` — Layer 4 의미 정렬 가드
