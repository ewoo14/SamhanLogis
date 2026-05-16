# 시나리오 3 — 모바일 서명 (delivery batch)

> **목적**: 같은 driverPhone 로 5건 슬립을 자동 묶음 → driver 모바일 단일 token 으로 5건 표시 → slip 별 인수자 서명 → DELIVERED + APP source 저장
> **선행 조건**: 시나리오 1 통과 + slip-service / notification-service ready
> **소요 시간**: 약 10분
> **검증 대상**: slip-service (DeliveryBatch + PublicSlipController + SlipInternalController) / notification-service (Solapi mock)
> **인용**: `services/slip-service/src/main/java/com/samhanair/logis/slip/delivery/web/{DeliveryBatchController,PublicSlipController}.java` + `V4__create_delivery_batches.sql`

---

## 0. 사전 가정 — DeliveryBatch 도메인

| 개념 | 설명 |
|---|---|
| **DeliveryBatch** | 같은 (driver_phone, batch_date) 슬립을 단일 토큰으로 묶는 그룹 |
| **batch_token** | URL-safe 64자 token (`UNIQUE`), driver 모바일이 base URL 로 사용 |
| **Partial unique** | `(driver_phone, batch_date) WHERE NOT is_deleted` — 활성 row 1건만 |
| **Token TTL** | 자동 그룹 시 `tokenExpiresAt = batchDate + 30일` (기본) |
| **Auto-group trigger** | 관리자 `POST /delivery-batches/auto-group?date=YYYY-MM-DD` 또는 SLIP_SEED 가 자동 호출 |
| **SMS 발송** | `POST /delivery-batches/{id}/send-sms` — Solapi 호출, smsSentAt 기록 |
| **공개 모바일 endpoint** | `/public/batches/{token}` (no auth, gateway 무필터) |

---

## 1. STEP 1 — 5건 슬립 생성 (같은 driverPhone)

### 1.1 SALES 토큰 + 사전 데이터

시나리오 2 의 §1 동일 패턴.

```sh
SALES_TOKEN=...
SALES_USER_ID=...
PARTNER_ID=...   # P0001 ~ P0005 5건 사용
PRODUCT_ID=...
SOURCE_WH=...
DRIVER_NAME="배송기사 박철수"
DRIVER_PHONE="010-9876-5432"   # 5건 슬립 모두 동일 phone
SLIP_DATE="2026-05-09"
```

### 1.2 5건 OUTBOUND 슬립 일괄 생성 → SHIPPING 진입

```sh
for i in 1 2 3 4 5; do
  PARTNER_ID=$(docker exec -t samhan-postgres psql -U samhan -d partner_db -At \
    -c "SELECT id FROM partners WHERE partner_code = 'P000${i}' AND NOT is_deleted;")
  RESP=$(curl -sS -X POST http://localhost:8080/api/slips \
    -H "Authorization: Bearer $SALES_TOKEN" \
    -H "X-User-Id: $SALES_USER_ID" \
    -H "X-User-Role: SALES" \
    -H "Content-Type: application/json" \
    -d "{
      \"slipType\": \"OUTBOUND\",
      \"slipDate\": \"$SLIP_DATE\",
      \"sourceWarehouseId\": \"$SOURCE_WH\",
      \"partnerId\": \"$PARTNER_ID\",
      \"deliveryTag\": \"DIRECT\",
      \"driverName\": \"$DRIVER_NAME\",
      \"driverPhone\": \"$DRIVER_PHONE\",
      \"lines\": [{\"productId\":\"$PRODUCT_ID\",\"quantity\":5,\"unitPrice\":850000}]
    }")
  SLIP_ID=$(echo $RESP | jq -r '.data.id')
  # SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING → COMPLETED → SHIPPING (시나리오 2 6 단계 자동화)
  for action in save send; do
    curl -sS -X POST http://localhost:8080/api/slips/$SLIP_ID/$action \
      -H "Authorization: Bearer $SALES_TOKEN" -H "X-User-Id: $SALES_USER_ID" > /dev/null
  done
  for action in accept process inspect complete ship; do
    curl -sS -X POST http://localhost:8080/api/slips/$SLIP_ID/$action \
      -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Id: $MASTER_USER_ID" \
      -H "X-User-Role: MASTER" > /dev/null
  done
  echo "Slip $i: id=$SLIP_ID status=SHIPPING"
done
```

**기대값**: 5건 슬립 모두 `status=SHIPPING` + `driver_phone='010-9876-5432'`.

### 1.3 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT slip_no, status, driver_phone FROM slips
      WHERE driver_phone='010-9876-5432' AND slip_date='2026-05-09' AND NOT is_deleted
      ORDER BY slip_no;"
```

**기대값**: 5 row, 모두 `status='SHIPPING'`.

---

## 2. STEP 2 — Auto-group → DeliveryBatch 자동 생성

```sh
curl -X POST "http://localhost:8080/api/delivery-batches/auto-group?date=2026-05-09" \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "X-User-Id: $MASTER_USER_ID" \
  -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": [
    {
      "id": "<UUID>",
      "batchToken": "<64-char URL-safe>",
      "driverName": "배송기사 박철수",
      "driverPhone": "010-9876-5432",
      "batchDate": "2026-05-09",
      "tokenExpiresAt": "2026-06-08T23:59:59",
      "smsSentAt": null,
      "slipCount": 5,
      "slipNos": ["2026/05/09-1", "2026/05/09-2", "2026/05/09-3", "2026/05/09-4", "2026/05/09-5"]
    }
  ]
}
```

**검증 포인트**:
- [ ] `data.length == 1` (1 driver_phone == 1 batch)
- [ ] `data[0].slipCount == 5`
- [ ] `data[0].batchToken.length == 64`
- [ ] `data[0].slipNos` 5건 모두 포함
- [ ] 응답에 partner UUID 노출 X — 슬립번호 + driverName 만 표시

```powershell
$BATCH_TOKEN = "<위 응답의 data[0].batchToken>"
$BATCH_ID = "<위 응답의 data[0].id>"
```

### 2.1 Partial unique 가드 검증 — 같은 (phone, date) 재호출 시 신규 생성 X

```sh
curl -X POST "http://localhost:8080/api/delivery-batches/auto-group?date=2026-05-09" \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대값**: 같은 batch 가 반환 (신규 row X). DB row count 변화 없음.

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT count(*) FROM delivery_batches WHERE driver_phone='010-9876-5432' AND batch_date='2026-05-09' AND NOT is_deleted;"
```

**기대값**: `1` (재호출해도 1건 유지 — partial unique index 가드).

---

## 3. STEP 3 — 공개 모바일 endpoint (no auth)

driver 의 모바일이 SMS link 로 받은 token URL 호출.

```sh
curl http://localhost:8080/api/public/batches/$BATCH_TOKEN
```

> **주의** — `/public/**` 은 Gateway 의 JwtAuthentication 필터 미적용 + slip-service SecurityConfig permitAll.

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "driverName": "배송기사 박철수",
    "batchDate": "2026-05-09",
    "slips": [
      {"slipNo":"2026/05/09-1","partnerName":"(주)에스엠하나공조","lineCount":1,"status":"SHIPPING"},
      {"slipNo":"2026/05/09-2","partnerName":"(주)글로벌HVAC","lineCount":1,"status":"SHIPPING"},
      {"slipNo":"2026/05/09-3","partnerName":"(주)대성냉동","lineCount":1,"status":"SHIPPING"},
      {"slipNo":"2026/05/09-4","partnerName":"...","lineCount":1,"status":"SHIPPING"},
      {"slipNo":"2026/05/09-5","partnerName":"...","lineCount":1,"status":"SHIPPING"}
    ]
  }
}
```

**검증 포인트**:
- [ ] `data.slips.length == 5`
- [ ] **응답에 slip.id / batch.id UUID 미노출** (UUID 비공개 가드 — `PublicSlipController` Javadoc)
- [ ] `partnerName` / `slipNo` / `status` 만 노출

### 3.1 만료 token 검증 → 410 GONE

token_expires_at 을 강제로 과거로 update 후:

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "UPDATE delivery_batches SET token_expires_at = '2025-01-01T00:00:00' WHERE id='$BATCH_ID';"
curl -i http://localhost:8080/api/public/batches/$BATCH_TOKEN
```

**기대 status**: `410 Gone`
**기대 본문**: `{"ok":false,"error":{"code":"CONFLICT","message":"... 만료 ..."}}`

**원복**:

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "UPDATE delivery_batches SET token_expires_at = '2026-06-08T23:59:59' WHERE id='$BATCH_ID';"
```

### 3.2 잘못된 token 검증 → 404

```sh
curl -i http://localhost:8080/api/public/batches/totally-invalid-token-string
```

**기대 status**: `404 Not Found`

---

## 4. STEP 4 — slip 별 인수자 서명 (5건)

각 slip 에 대해 PNG canvas 서명 + SHA-256 hash 동봉.

```sh
SLIP_NO_PATH="2026-05-09-1"  # URL path 용 slug. 응답/화면 표시는 "2026/05/09-1".
# 50KB 이하 PNG (test fixture). base64 encode.
PNG_BYTES=$(base64 -w 0 < /tmp/test-signature.png)   # ≤ ~70KB base64 (50KB raw PNG 한도)
PNG_HASH=$(sha256sum /tmp/test-signature.png | cut -d' ' -f1)

curl -X POST http://localhost:8080/api/public/batches/$BATCH_TOKEN/slips/$SLIP_NO_PATH/signature \
  -H "Content-Type: application/json" \
  -d "{
    \"signerName\": \"(주)에스엠하나공조 박부장\",
    \"imageBase64\": \"$PNG_BYTES\",
    \"imageHash\": \"$PNG_HASH\",
    \"capturedAt\": \"2026-05-09T15:30:00Z\"
  }"
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "slipNo": "2026/05/09-1",
    "shareToken": "<32-char URL-safe>",
    "signerName": "(주)에스엠하나공조 박부장",
    "deliveredAt": "2026-05-09T15:30:00Z",
    "signatureSource": "APP"
  }
}
```

**검증 포인트**:
- [ ] `data.shareToken.length >= 32` (인수자 view 공유 token, +30일 만료)
- [ ] `data.signatureSource == "APP"`
- [ ] 슬립 status 자동 전이: `SHIPPING → DELIVERED`

**나머지 4건도 동일 패턴 반복** — 시나리오 진행 시 5건 모두 서명 완료.

### 4.1 50KB 초과 PNG → 400

```sh
LARGE_PNG=$(base64 -w 0 < /tmp/large-100kb-signature.png)   # 100KB raw
curl -i -X POST http://localhost:8080/api/public/batches/$BATCH_TOKEN/slips/2026-05-09-1/signature \
  -d "{\"signerName\":\"x\",\"imageBase64\":\"$LARGE_PNG\",\"imageHash\":\"...\",\"capturedAt\":\"2026-05-09T15:30:00Z\"}"
```

**기대 status**: `400 Bad Request`
**기대 본문**: `error.code: INVALID_INPUT`, `message contains "50KB"`

### 4.2 SHA-256 hash mismatch → 400

```sh
curl -i -X POST http://localhost:8080/api/public/batches/$BATCH_TOKEN/slips/2026-05-09-2/signature \
  -d "{\"signerName\":\"x\",\"imageBase64\":\"$PNG_BYTES\",\"imageHash\":\"WRONG_HASH\",\"capturedAt\":\"2026-05-09T15:30:00Z\"}"
```

**기대 status**: `400 Bad Request`
**기대 본문**: `error.code: INVALID_INPUT`, `message contains "hash"`

### 4.3 PROCESSING 미만 단계 서명 시도 → 409

DRAFT 단계 슬립으로 시도 (PublicSlipController Javadoc — `INSPECTING/COMPLETED/SHIPPING` 만 허용):

```sh
# 사전: DRAFT 슬립 1건 생성하여 batch 에 강제 추가
curl -i -X POST http://localhost:8080/api/public/batches/$BATCH_TOKEN/slips/<DRAFT_SLIP_NO>/signature \
  -d "{\"signerName\":\"x\",\"imageBase64\":\"$PNG_BYTES\",\"imageHash\":\"$PNG_HASH\",\"capturedAt\":\"...\"}"
```

**기대 status**: `409 Conflict`

---

## 5. STEP 5 — DELIVERED + signature_source=APP 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT slip_no, status, signature_source, signer_name, delivered_at
      FROM slips
      WHERE driver_phone='010-9876-5432' AND slip_date='2026-05-09' AND NOT is_deleted
      ORDER BY slip_no;"
```

**기대값**: 5 row, 모두:
- `status='DELIVERED'`
- `signature_source='APP'`
- `signer_name` not null
- `delivered_at` not null

### 5.1 SlipSignatureAudit 기록 검증

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT slip_id, source, captured_at FROM slip_signature_audit
      WHERE slip_id IN (SELECT id FROM slips WHERE driver_phone='010-9876-5432')
      ORDER BY captured_at;"
```

**기대값**: 5 row, 모두 `source='APP'`.

---

## 6. STEP 6 — Internal endpoint 검증 (X-Internal-Token)

driver-app (arologis) 가 호출하는 internal endpoint 도 동일 슬립에 서명을 발행할 수 있어야 함 (PR #99 W10-4).

> 본 시나리오에서는 별도 슬립 1건 (`2026/05/09-6` 가정 — SHIPPING 단계) 으로 검증.

```sh
NEW_SLIP_ID="<별도 SHIPPING 슬립 UUID>"
curl -X POST http://localhost:8080/api/internal/slips/$NEW_SLIP_ID/signatures \
  -H "X-Internal-Token: dev-internal-token-change-me" \
  -H "Content-Type: application/json" \
  -d "{
    \"signatureSource\": \"APP\",
    \"signerName\": \"인수자 서명 from driver-app\",
    \"imageRef\": \"s3://samhan-prod/signatures/internal-test.png\",
    \"capturedAt\": \"2026-05-09T16:00:00Z\",
    \"driverCode\": \"DRV-001\"
  }"
```

**기대 status**: `200 OK`
**기대 본문**: `data.slipNo` not null + `data.signatureSource == "APP"` + `data.deliveredAt` not null.

### 6.1 X-Internal-Token 누락 → 401

```sh
curl -i -X POST http://localhost:8080/api/internal/slips/$NEW_SLIP_ID/signatures \
  -H "Content-Type: application/json" -d '{}'
```

**기대 status**: `401 Unauthorized`

### 6.2 X-Internal-Token 불일치 → 401

```sh
curl -i -X POST http://localhost:8080/api/internal/slips/$NEW_SLIP_ID/signatures \
  -H "X-Internal-Token: WRONG_TOKEN" -d '{}'
```

**기대 status**: `401 Unauthorized`

### 6.3 source != APP → 400 (Internal endpoint 가드)

```sh
curl -i -X POST http://localhost:8080/api/internal/slips/$NEW_SLIP_ID/signatures \
  -H "X-Internal-Token: dev-internal-token-change-me" \
  -d '{"signatureSource":"LINK","signerName":"x","imageRef":"...","capturedAt":"..."}'
```

**기대 status**: `400 Bad Request`
**기대 본문**: `error.code: INVALID_INPUT`, `message contains "APP source 만"` 또는 `"LINK 는 공개 모바일"`

---

## 7. STEP 7 — 인수자 view 조회 (shareToken)

STEP 4 의 응답 `shareToken` 으로 인수자가 영구 view 접근.

```sh
SHARE_TOKEN="<STEP 4 응답>"
curl http://localhost:8080/api/public/signatures/$SHARE_TOKEN
```

**기대 status**: `200 OK`
**기대 본문**:

```json
{
  "ok": true,
  "data": {
    "slipNo": "2026/05/09-1",
    "partnerName": "(주)에스엠하나공조",
    "deliveredAt": "2026-05-09T15:30:00Z",
    "signerName": "(주)에스엠하나공조 박부장",
    "signaturePngBase64": "<base64 PNG>",
    "lines": [...]
  }
}
```

### 7.1 +30일 후 만료 → 410

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "UPDATE slips SET signature_share_expires_at = '2025-01-01T00:00:00' WHERE id='$NEW_SLIP_ID';"
curl -i http://localhost:8080/api/public/signatures/$SHARE_TOKEN
```

**기대 status**: `410 Gone`

---

## 8. STEP 8 — SMS 발송 (Solapi mock)

```sh
curl -X POST http://localhost:8080/api/delivery-batches/$BATCH_ID/send-sms \
  -H "Authorization: Bearer $MASTER_TOKEN" -H "X-User-Role: MASTER"
```

**기대 status**: `200 OK`
**기대 본문**:
- `data.smsSentAt` != null
- `data.smsLastError == null`

> notification-service / Solapi 가 dev-mock 모드면 실제 SMS 미발송, smsSentAt 만 기록.

**재발송 시도** → 409 (이미 발송):

```sh
curl -i -X POST http://localhost:8080/api/delivery-batches/$BATCH_ID/send-sms \
  -H "Authorization: Bearer $MASTER_TOKEN"
```

**기대 status**: `409 Conflict`

---

## 9. 정합성 검증 (시나리오 3 한정)

| Check | psql query | 기대값 |
|---|---|---|
| Partial unique 가드 | `SELECT driver_phone, batch_date, count(*) FROM delivery_batches WHERE NOT is_deleted GROUP BY 1,2 HAVING count(*) > 1;` | 0 row |
| 5 슬립 모두 batch 에 attach | `SELECT count(*) FROM slips WHERE delivery_batch_id='$BATCH_ID' AND NOT is_deleted;` | 5 |
| 5 슬립 모두 DELIVERED + APP source | `SELECT count(*) FROM slips WHERE delivery_batch_id='$BATCH_ID' AND status='DELIVERED' AND signature_source='APP';` | 5 |
| audit 5 row | `SELECT count(*) FROM slip_signature_audit WHERE slip_id IN (SELECT id FROM slips WHERE delivery_batch_id='$BATCH_ID');` | 5 |
| FK 정합 | `SELECT count(*) FROM slips s WHERE s.delivery_batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM delivery_batches db WHERE db.id = s.delivery_batch_id);` | 0 row |

---

## 10. 종료 기준

- [ ] STEP 1 5건 슬립 SHIPPING 진입
- [ ] STEP 2 auto-group 1 batch 생성 (재호출 시에도 1건 유지)
- [ ] STEP 3 공개 모바일 endpoint UUID 미노출 검증
- [ ] STEP 4 5건 모두 서명 + 50KB / hash mismatch / 단계 가드 negative 통과
- [ ] STEP 5 DB 기록 검증 (DELIVERED + APP)
- [ ] STEP 6 Internal endpoint 인증 + source=APP 가드 검증
- [ ] STEP 7 인수자 view + 만료 검증
- [ ] STEP 8 SMS 발송 + 재발송 가드
- [ ] §9 정합성 5건 모두 만족
- [ ] QA 스크린샷 1장 — 모바일 Edge (또는 Chrome devtool 모바일 모드) 의 5건 batch 화면
  - 저장: `docs/qa/local-test-seed-data/screenshots/03-mobile-batch.png`

---

## 11. 회귀 가드 / 알려진 이슈

| 이슈 | 회피책 |
|---|---|
| UUID 비노출 가드 (PR #18 회고) | 응답 본문 grep 으로 UUID 패턴 검출 시 alert |
| Solapi mock 미설정 시 SMS 발송 500 | notification-service `solapi.mock-mode=true` 확인 |
| W10-4 양쪽 저장 (PR #99) | arologis 호출 시 slipBridged 플래그 검증 (시나리오 6 에서 추가 검증) |
| Korean Path JDK Trap | 영향 없음 (runtime 검증) |

---

## 12. DeliveryBatch 도메인 매트릭스

본 시나리오의 핵심 — DeliveryBatch 의 라이프사이클 + token 정책.

| 단계 | trigger | 효과 |
|---|---|---|
| 1. 생성 | `POST /delivery-batches/auto-group?date=Y` | 같은 (driver_phone, batch_date) 그룹화 — partial unique 가드 |
| 2. SMS 발송 | `POST /delivery-batches/{id}/send-sms` | Solapi 호출 + smsSentAt 기록 |
| 3. driver 접근 | `GET /public/batches/{token}` | no auth, gateway 무필터, slip-service permitAll |
| 4. slip 별 서명 | `POST /public/batches/{token}/slips/{slipNo}/signature` | shareToken 발급 + status DELIVERED + audit row |
| 5. driver 서명 | `POST /public/batches/{token}/slips/{slipNo}/driver-signature` | (선택) 기사 본인 서명 — Slip.driverName 재사용 |
| 6. 인수자 view | `GET /public/signatures/{shareToken}` | +30일 만료 read-only |
| 7. 토큰 재발급 | `POST /delivery-batches/{id}/regenerate-token` | smsSentAt 도 reset (재발송 가능) |
| 만료 | tokenExpiresAt 경과 시 자동 410 GONE | DeliveryBatchService.findByToken 가드 |

### 12.1 partial unique 가드 — 같은 phone+date 활성 1건

```sql
CREATE UNIQUE INDEX uk_delivery_batches_driver_date
    ON delivery_batches (driver_phone, batch_date)
    WHERE is_deleted = FALSE;
```

> Soft-delete 후 재사용 가능 — 본 가드는 활성 row 한정.

---

## 13. Error code 매트릭스 (delivery + signature)

| HTTP | error.code | 의미 | 발생 trigger |
|---|---|---|---|
| 400 | INVALID_INPUT | imageBase64 50KB 초과 | PublicSignatureRequest size 가드 |
| 400 | INVALID_INPUT | imageHash mismatch | SignatureService SHA-256 재계산 |
| 400 | INVALID_INPUT | signerName blank | @NotBlank |
| 401 | UNAUTHORIZED | X-Internal-Token 누락/불일치 (Internal endpoint) | InternalTokenFilter |
| 403 | FORBIDDEN | role 권한 부족 (admin endpoint) | @PreAuthorize |
| 404 | NOT_FOUND | batch token 미존재 | DeliveryBatchRepository |
| 404 | NOT_FOUND | slip 미존재 in batch | SignatureService.recordSignature |
| 404 | NOT_FOUND | shareToken 미존재 | SignatureService.findByShareToken |
| 409 | CONFLICT | slip status 가드 (INSPECTING/COMPLETED/SHIPPING 만 허용) | Slip.recordSignature 도메인 |
| 409 | CONFLICT | source != APP (Internal endpoint) | SignatureService.registerFromInternal |
| 409 | CONFLICT | 이미 SMS 발송 (`smsSentAt != null`) | DeliveryBatchService.sendSms |
| 410 | GONE | batch token 만료 | DeliveryBatchService 가드 → PublicSlipController 매핑 |
| 410 | GONE | shareToken 만료 (+30일) | SignatureService.findByShareToken |
| 500 | INTERNAL | Solapi 호출 실패 | SmsClient — smsLastError 기록 |

---

## 14. Performance baseline

| Endpoint | 평균 (ms) | p99 (ms) | 비고 |
|---|---|---|---|
| `POST /delivery-batches/auto-group` | 200 | 500 | 5 슬립 grouping + token 생성 |
| `GET /public/batches/{token}` | 30 | 100 | DB 1회 + JPA join |
| `POST /public/batches/{token}/slips/{slipNo}/signature` | 150 | 400 | SHA-256 재계산 + audit insert |
| `POST /delivery-batches/{id}/send-sms` | 800 | 2000 | Solapi 외부 호출 (mock=true 시 50ms) |
| `GET /public/signatures/{shareToken}` | 40 | 120 | DB 1회 fetch |
| `POST /internal/slips/{id}/signatures` | 120 | 350 | InternalTokenFilter + audit insert |

---

## 15. FE 화면 표시 contract (모바일)

| 응답 필드 | type | 모바일 노출? | 비고 |
|---|---|---|---|
| `batch.driverName`, `driverPhone`, `batchDate` | string | YES | 상단 헤더 |
| `batch.slips[].slipNo` | string | YES | 슬립번호 (예: 2026/05/09-1) |
| `batch.slips[].partnerName` | string | YES | 거래처명 |
| `batch.slips[].lineCount`, `status` | number/string | YES | 라인 수 + 상태 뱃지 |
| `batch.id`, `batch.batchToken` | UUID/string | **NO** | URL 만 사용 |
| `slip.id`, `slip.partnerId` | UUID | **NO** | UUID 비공개 가드 |
| `signature.signerName` | string | YES (인수자 view) | (그대로 표시) |
| `signature.signaturePngBase64` | string | YES (인수자 view) | `<img src="data:image/png;base64,...">` |

---

## 16. Audit trail 검증

### 16.1 SlipSignatureAudit 테이블 검증

```sql
-- slip_db
SELECT slip_id, source, signer_name, image_hash, captured_at, captured_lat, captured_lng, ip_address, user_agent
FROM slip_signature_audit
WHERE slip_id IN (SELECT id FROM slips WHERE delivery_batch_id='$BATCH_ID')
ORDER BY captured_at;
```

**기대값**: 5 row (1 row per slip), 모두:
- `source IN ('APP', 'LINK')`
- `signer_name` not null
- `image_hash` length == 64 (SHA-256 hex)
- `captured_at` not null

### 16.2 BaseEntity audit field 검증

```sql
SELECT slip_no, status, modified_by, modified_at FROM slips
WHERE delivery_batch_id='$BATCH_ID' ORDER BY slip_no;
```

**기대값**: `modified_at` ≈ STEP 4 실행 시각 + `modified_by` not null.

---

## 17. Observability — log + metric

### 17.1 서명 등록 log 패턴

```
INFO  c.s.l.slip.delivery.web.PublicSlipController : POST /public/batches/<token>/slips/2026-05-09-1/signature - signerName=...
INFO  c.s.l.slip.service.SlipSignatureService : Signature recorded: slipId=... source=APP signerName=... shareToken=...
INFO  c.s.l.slip.service.SlipService : Slip 2026/05/09-1 transition: SHIPPING → DELIVERED via signature
```

### 17.2 50KB 가드 위반 시 log

```
WARN  c.s.l.slip.service.SlipSignatureService : PNG size exceeded: 102400 bytes > 51200 limit (slipNo=2026/05/09-1)
```

### 17.3 hash mismatch 시 log

```
WARN  c.s.l.slip.service.SlipSignatureService : SHA-256 hash mismatch (claimed=<a>, actual=<b>) — possible tampering, slipNo=2026/05/09-1
```

> 본 log 는 보안 audit 대상 — Elasticsearch 알림 룰 권장.

---

## 18. 한국어 인코딩 가드

본 시나리오의 한국어 입력 — `signerName` 필드.

| 입력 예시 | byte (UTF-8) | base64 길이 |
|---|---|---|
| `(주)에스엠하나공조 박부장` | 39 | 52 |
| `홍길동` | 9 | 12 |

```sh
# DB 측 검증
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT slip_no, signer_name, length(signer_name) AS char_len, octet_length(signer_name) AS byte_len
      FROM slips WHERE delivery_batch_id='$BATCH_ID';"
```

**기대값**: char_len == 한국어 글자 수, byte_len == UTF-8 byte 수 (한글 1자 = 3 byte).

---

## 19. 시드 데이터 검증 — 100건 슬립 중 5건 driver 묶음

`SLIP_SEED_TEST_DATA=true` 시 — seeder 가 100건 슬립 중 5건을 같은 driver_phone 으로 시드하여 본 시나리오의 batch 자동 생성 검증을 가능하게 함.

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT driver_phone, count(*) FROM slips WHERE NOT is_deleted AND driver_phone IS NOT NULL GROUP BY driver_phone ORDER BY count(*) DESC;"
```

**기대값**: 적어도 1개 driver_phone 의 count >= 5.

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db \
  -c "SELECT count(*) FROM delivery_batches WHERE NOT is_deleted;"
```

**기대값**: 시드 또는 STEP 2 의 batch 수 (시드 1+ STEP 2 1 = 2+).

---

## 20. Production-readiness gap 분석

| 항목 | dev (현 상태) | production 요구사항 | gap 해결 슬라이스 |
|---|---|---|---|
| Solapi 발송 | mock-mode | 실 SMS + 비용 모니터링 | (Phase 11 cutover) |
| token TTL 30일 | hardcoded | 거래처 별 동적 설정 | (Phase 11 hardening) |
| 50KB PNG 한도 | hardcoded | 거래처 별 동적 설정 | (Phase 11) |
| shareToken 보존 +30일 | hardcoded | 회계 보존 5년 (audit) | (Phase 11 — S3 archive) |
| ratelimit on /public/* | 없음 | 10/min IP 기반 | (Phase 11 — Bucket4j) |
| signaturePngBase64 응답 | 매 호출 시 DB fetch | CDN cache + presigned S3 URL | (Phase 11 — MinIO/S3) |
| W10-4 slipBridged 양방 동기화 | best-effort | 영구 저장 보장 (outbox) | (Phase 11 — outbox 패턴) |

---

## 21. 종료 기준 (full)

- [ ] STEP 1 5건 SHIPPING
- [ ] STEP 2 1 batch 생성 + 재호출 시 1건 유지
- [ ] STEP 3 공개 endpoint UUID 미노출
- [ ] STEP 4 5건 서명 + 50KB / hash / 단계 negative
- [ ] STEP 5 DB 기록 (DELIVERED + APP)
- [ ] STEP 6 Internal endpoint 인증 + source=APP 가드
- [ ] STEP 7 인수자 view + 만료
- [ ] STEP 8 SMS 발송 + 재발송 가드
- [ ] §9 정합성 5건
- [ ] §12 DeliveryBatch 라이프사이클 7 단계
- [ ] §13 error matrix 14 케이스
- [ ] §14 performance baseline 6 endpoint
- [ ] §15 FE display contract 8 필드
- [ ] §16 audit trail 2 검증
- [ ] §17 observability 3 log 패턴
- [ ] §18 한국어 인코딩
- [ ] §19 시드 100건 driver 묶음
- [ ] §20 prod-readiness gap 7건
- [ ] QA 스크린샷 — 모바일 batch 화면 (5건 + 한국어)

---

## 22. 다음 시나리오 진입 가드

본 시나리오 통과 후 → `04-partner-order-publish.md` 진입.

### 22.1 alert 템플릿

```
[QA Alert] 시나리오 3 실패 — STEP <N>

기대값: <expected>
실제값: <actual>

batchToken: <token>
slipNo: <slipNo>

console log (slip-service):
<log snippet>

slip_signature_audit row:
<SELECT 결과>
```

---

## 23. 참고 자료

- `services/slip-service/src/main/java/com/samhanair/logis/slip/delivery/web/PublicSlipController.java` — 공개 모바일 endpoint
- `services/slip-service/src/main/java/com/samhanair/logis/slip/delivery/web/DeliveryBatchController.java` — admin endpoint
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java` — Internal endpoint (W10-4)
- `services/slip-service/src/main/resources/db/migration/V4__create_delivery_batches.sql` — 스키마 + partial unique
- `services/slip-service/src/main/resources/db/migration/V8__create_slip_publish_audit.sql` — audit 스키마
- `feedback_uuid_no_user_visibility.md` — UUID 비공개 가드
- `docs/qa/notification-slice-B/qa-report.md` — Slice B (DeliveryBatch) reference
- `docs/qa/signature-slice-C/qa-report.md` — Slice C (서명 등록 + shareToken) reference
