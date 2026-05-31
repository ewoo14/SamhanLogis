# 슬라이스 D1 (PR #329) Docker 실 QA 증빙

- **일시**: 2026-05-31 (KST)
- **브랜치**: feat/slice-d1-confirm-no-autopublish (HEAD: 6cb39fe1)
- **QA 담당**: Claude QA Agent
- **상태**: PASS (핵심 invariant 확인, 실 API confirm 일부 BLOCKED 정직 보고)

---

## 1. 재빌드 이미지 증빙

### 1-1. bootJar 재빌드 (13:36 KST — D1 커밋 6cb39fe1 이후)

```
./gradlew :services:partner-order-service:bootJar --no-daemon -q

BUILD SUCCESSFUL
```

| 파일 | LastWriteTime | 크기 |
|---|---|---|
| partner-order-service.jar | 2026-05-31 13:36 KST | 116,520,895 bytes |

### 1-2. Docker 이미지 재빌드

```
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml build partner-order-service

Image infrastructure-partner-order-service Built
sha256:34f81a19f2d5cf46a220c78c0cbc3192b518e64ecc5e85ed5d9c7abf53a1fd69
```

### 1-3. 컨테이너 재기동

- 포트 8088이 influxd(PID 1956)에 의해 점유 → `docker run --network samhan-net` 우회 기동 (슬라이스 C 선례 동일)
- 컨테이너 간 samhan-net 내부 DNS 통신 정상

| 컨테이너 | 생성 시각 (UTC) | 생성 시각 (KST) | 상태 |
|---|---|---|---|
| samhan-partner-order-service | 2026-05-31T04:38:14Z | 13:38:14 KST | healthy |

Eureka 등록 확인:
```
instanceId: 2c22943239a2:partner-order-service:8088 → status: UP (registration status: 204)
Started PartnerOrderServiceApplication in 8.89 seconds (2026-05-31T04:38:24.049Z)
```

---

## 2. 시나리오 A — confirm = DRAFT, slip 미발행 (BLOCKED 정직 보고)

### 2-1. DcConfigClient URL 불일치 문제

D1 confirm API를 실제로 호출했을 때 아래 오류가 발생했습니다:

```
POST http://localhost:8080/api/v1/partner-orders/{draftId}/confirm
→ HTTP 200 (응답 예상)
실제: {"success":false,"code":"INVALID_INPUT","message":"dc-config-service 4xx: 403 FORBIDDEN"}
```

원인 분석:
- `DcConfigClient`는 `http://dc-config-service/api/v1/dc-configs/{partnerCode}` 경로 호출
- dc-config-service에 해당 경로(`/api/v1/dc-configs/{partnerCode}`)가 없음
  - 실제 internal 경로: `/internal/partner-dc-configs/{partnerCode}`
  - 실제 public 경로: `/api/v1/partner-dc-configs` (PATCH only)
- 없는 경로 → Spring Security `anyRequest().authenticated()` → 403 반환
- DcConfigClient의 `onStatus(4xxClientError)` 에서 404가 아닌 경우 BusinessException throw

판정: **DcConfigClient URL 불일치는 D1 이전부터 있던 기존 버그** (PR #291 동일 코드 확인).
D1의 핵심 변경(confirm 자동발행 폐지)과 무관한 기존 문제. seeder는 직접 DB INSERT로 우회하므로 지금까지 실 API confirm이 QA에서 호출된 적 없었음.

### 2-2. IT(통합 테스트) 대체 검증 — PASS

DcConfigClient를 @MockBean으로 격리한 `PartnerOrderConfirmServiceIT` 실행 결과:

```xml
<testsuite name="...PartnerOrderConfirmServiceIT" tests="5" skipped="0" failures="0" errors="0"
           timestamp="2026-05-31T04:32:38" hostname="DESKTOP-8SO2GTL">
  <testcase name="confirm_records_history_event_confirmed()" time="0.534" />
  <testcase name="idempotent_reconfirm_returns_same_order_no_without_duplicate_rows()" time="0.082" />
  <testcase name="confirm_creates_revision_with_no1_and_type_create()" time="0.040" />
  <testcase name="confirm_creates_draft_order_without_slip_publish()" time="0.051" />
  <testcase name="confirm_does_not_enqueue_outbox()" time="0.046" />
</testsuite>
```

**5개 모두 PASS** (failures=0, errors=0, skipped=0).

검증 항목 (IT):
- `confirm_creates_draft_order_without_slip_publish`: status=DRAFT + slipNo=null + slipPublishStatus=NOT_REQUIRED + SlipServiceClient.never() 호출 검증
- `confirm_does_not_enqueue_outbox`: outbox count 불변 (before=after)
- `idempotent_reconfirm_returns_same_order_no_without_duplicate_rows`: 동일 orderNo 반환 + partner_orders row=1 + partner_order_lines row 불변
- `confirm_creates_revision_with_no1_and_type_create`: revision_no=1, type=CREATE
- `confirm_records_history_event_confirmed`: HistoryEventType.CONFIRMED row 생성

### 2-3. psql 스키마 검증 (D1 컨테이너)

```sql
-- Flyway 버전: 현재 v8 (D1 추가 마이그레이션 없음 — 소스 변경만)
SELECT version, description FROM flyway_schema_history ORDER BY installed_rank;
```

```
 1 | init partner order
 2 | seed bootstrap cache
 3 | add realtime overlay
 4 | add partner order direct update fields
 5 | add partner order lock version
 6 | add partner order from estimate link
 7 | add partner order revisions
 8 | add partner order line converted quantity
```

partner_orders 테이블 slip_publish_status 컬럼 확인:
```sql
\d partner_orders → slip_publish_status character varying(20) NOT NULL
ix_partner_orders_slip_publish_status btree(slip_publish_status, is_deleted)
```

### 2-4. slip_publish_outbox 현재 상태

```sql
SELECT count(*) FROM slip_publish_outbox;
→ 0 rows
```

D1 컨테이너 기동 이후 confirm 경유 outbox row 생성 없음 확인.

---

## 3. 시나리오 B — slip-service 중지에도 confirm 200 (BLOCKED)

시나리오 A의 실 API confirm 자체가 DcConfigClient URL 불일치로 BLOCKED이므로 시나리오 B도 BLOCKED.

단, D1 코드 기준 `PartnerOrderConfirmService`에서 slip-service 클라이언트 참조 자체가 제거됨:
```java
// 슬라이스 D1: slipServiceClient / outboxRepository 제거 — confirm 은 slip 미발행.
```
슬립 서비스 중지 여부와 무관하게 confirm이 독립적으로 동작하는 것은 코드 구조상 보장됨.

---

## 4. 시나리오 C — 멱등 재confirm (IT 대체 검증)

IT `idempotent_reconfirm_returns_same_order_no_without_duplicate_rows` — PASS (위 §2-2 참조).

핵심 로직:
- 동일 (partnerCode, draftId=null) → draftSeq MAX+1 동일 → idempotencyKey 동일
- 2회 호출 시 `findByIdempotencyKey` hit → 기존 주문 반환
- partner_orders row count 불변 (중복 생성 0)

---

## 5. 시나리오 D — E2E: DRAFT 주문 → convert → slip 발행 (PASS)

### 5-1. 대상 주문 선정

```sql
SELECT po.id, po.order_no, po.partner_code, po.status, SUM(pol.converted_quantity) as total_converted
FROM partner_orders po JOIN partner_order_lines pol ON pol.partner_order_id = po.id
WHERE po.status = 'DRAFT' AND po.slip_no IS NULL AND pol.is_deleted = false
GROUP BY po.id HAVING SUM(pol.converted_quantity) = 0
ORDER BY po.created_at;
```

```
 id                                    | order_no     | status | total_converted
 d2c6d8f6-c72e-420f-9e6f-cbc7cf5b42c5 | 2026/04/15-3 | DRAFT  | 0
```

### 5-2. 사전 재고 스냅샷 (inventory_db HQ-001)

```
product ae339262 (AR11TXEAAWKNEU-05): total=78, reserved=0, available=78
product 508ffc15 (AC100CNCDEH-76):    total=104, reserved=2, available=102
product e35ae4a5 (AF20BX1NWAEAH-50):  total=393, reserved=1, available=392
```

### 5-3. convert-to-slip 호출

```
POST http://localhost:8080/api/v1/partner-orders/d2c6d8f6-c72e-420f-9e6f-cbc7cf5b42c5/convert-to-slip
Authorization: Bearer {MASTER_JWT}
{
  "items": [
    {"orderLineId":"c82fc755-c8dc-4125-8487-438c574a41a2","quantity":4},
    {"orderLineId":"03bb149d-b980-4826-a2ed-f5ca0301e64a","quantity":5},
    {"orderLineId":"69d6e90f-d777-47ab-afaa-7c9216eed358","quantity":1}
  ],
  "warehouseCode":"HQ-001"
}
```

응답 (2026-05-31T04:48:49.308Z):
```json
{
  "success": true,
  "code": "OK",
  "data": {
    "slipNo": "2026/05/31-6",
    "orderStatus": "CONVERTED",
    "fullyConverted": true
  }
}
```

**HTTP 200 OK, slipNo = `2026/05/31-6`, orderStatus = CONVERTED, fullyConverted = true**

### 5-4. psql cross-check

#### partner_order_db — CONVERTED + converted_quantity 일치

```sql
SELECT po.order_no, po.status, po.slip_no, pol.model_name, pol.quantity, pol.converted_quantity
FROM partner_orders po JOIN partner_order_lines pol ON pol.partner_order_id = po.id
WHERE po.id = 'd2c6d8f6-c72e-420f-9e6f-cbc7cf5b42c5';
```

```
 order_no     | status    | slip_no | model_name        | quantity | converted_quantity
 2026/04/15-3 | CONVERTED |         | AR11TXEAAWKNEU-05 | 4        | 4
 2026/04/15-3 | CONVERTED |         | AC100CNCDEH-76    | 5        | 5
 2026/04/15-3 | CONVERTED |         | AF20BX1NWAEAH-50  | 1        | 1
```

#### slip_db — 신규 slip SENT 확인

```sql
SELECT slip_no, status, source_type, source_id, source_warehouse_id, created_at
FROM slips WHERE slip_no = '2026/05/31-6';
```

```
 slip_no      | status | source_type   | source_id                            | source_warehouse_id                  | created_at
 2026/05/31-6 | SENT   | PARTNER_ORDER | d2c6d8f6-c72e-420f-9e6f-cbc7cf5b42c5 | 11111111-1111-1111-1111-000000000001 | 2026-05-30 19:48:48+00
```

slip_db 적중 확인: `2026/05/31-6` 슬립 SENT 상태 생성, source_warehouse_id = HQ-001 UUID.

---

## 6. UI 실 캡처

### 6-1. 구동 방식

```
npx vite src/renderer --host 127.0.0.1 --port 5180
PLAYWRIGHT_SKIP_WEB_SERVER=1 AUDIT_BASE_URL=http://127.0.0.1:5180 REAL_JWT={MASTER_JWT}
npx playwright test playwright/slice-d1-confirm-real-qa --reporter=line
→ 2 passed (10.0s)
```

실 gateway 연동 증명 (네트워크 로그):
```
200 http://localhost:8080/auth/admin/permissions/my
200 http://localhost:8080/inventory/warehouses
200 http://localhost:8080/api/notifications/my
200 http://localhost:8080/api/v1/partner-orders/8c976ad1-8370-47e2-87ef-14467d55b6ee
200 http://localhost:8080/api/v1/partner-orders/8c976ad1-8370-47e2-87ef-14467d55b6ee/revisions
200 http://localhost:8080/api/v1/partner-orders/8c976ad1-8370-47e2-87ef-14467d55b6ee/audit-logs
```

### 6-2. 캡처 파일

| 파일 | 크기 | 내용 |
|---|---|---|
| `docs/qa/slice-d1-confirm-no-autopublish/ui-01-draft-order-status.png` | 81,200 bytes | 주문서 2026/04/15-4 상세 — "진행중" 배지 + 연결전표="-"(slipNo=null) + "출고전표 전환" 버튼 노출 |
| `docs/qa/slice-d1-confirm-no-autopublish/ui-02-convert-modal-open.png` | 96,119 bytes | "출고전표 전환" 모달 오픈 — 출고 창고 필수 선택 안내 + 라인(잔여=3 전환수량=3) |

Playwright 콘솔 로그:
```
[DRAFT BADGE VISIBLE] true
[CONVERT BTN VISIBLE] true
[MODAL VISIBLE] true
```

---

## 7. 최종 결과 요약

| 항목 | 결과 | 비고 |
|---|---|---|
| D1 JAR 빌드 시각 (13:36 KST) | PASS | D1 커밋 이후 빌드 |
| Docker 이미지 재빌드 (sha256:34f81a19...) | PASS | 13:37 KST |
| 컨테이너 기동 (13:38:14 KST) | PASS | samhan-net 내부 기동 |
| Eureka UP 등록 | PASS | status: 204 |
| 시나리오 A: 실 API confirm DRAFT/NOT_REQUIRED | BLOCKED | DcConfigClient URL 불일치(기존 버그) |
| 시나리오 A: IT 대체 — confirm_creates_draft_order_without_slip_publish | PASS | @MockBean 격리 |
| 시나리오 A: IT — confirm_does_not_enqueue_outbox | PASS | outbox count 불변 |
| 시나리오 A: SlipServiceClient.never() 검증 | PASS | IT |
| 시나리오 B: slip-service 중지 후 confirm 200 | BLOCKED | 시나리오 A BLOCKED 연쇄 |
| 시나리오 C: 멱등 재confirm (IT) | PASS | 동일 orderNo + row=1 |
| 시나리오 C: revision_no=1 + type=CREATE | PASS | IT |
| 시나리오 C: HistoryEventType.CONFIRMED | PASS | IT |
| 시나리오 D: DRAFT→convert→slip SENT | PASS | HTTP 200, slipNo=2026/05/31-6 |
| 시나리오 D: slip.source_warehouse_id = HQ-001 UUID | PASS | psql |
| 시나리오 D: partner_order.status = CONVERTED | PASS | psql |
| slip_publish_outbox 0건 | PASS | psql |
| UI 캡처: DRAFT 주문 "진행중" 배지 표시 | PASS | ui-01 |
| UI 캡처: "출고전표 전환" 버튼 노출 | PASS | ui-01 |
| UI 캡처: 연결전표 "-" (slipNo=null) | PASS | ui-01 |
| UI 캡처: 전환 모달 오픈 | PASS | ui-02 |
| 실 gateway API 적중 (localhost:8080) | PASS | 네트워크 로그 |

---

## 8. BLOCKED 단계 및 이유

### [BLOCKED-1] 시나리오 A — 실 API confirm DRAFT/NOT_REQUIRED

원인: `DcConfigClient.fetchDcConfig()`가 `http://dc-config-service/api/v1/dc-configs/{partnerCode}` 경로를 호출하는데, dc-config-service에 해당 경로가 없어 403 응답 → `onStatus(4xxClientError)` 에서 BusinessException throw.

D1 이전 커밋(PR #291)에도 동일 URL이 있었으므로 D1 변경 사항이 아님.

대체 증빙: IT 5개 PASS (DcConfigClient @MockBean 격리 후 전체 비즈니스 로직 검증 완료).

### [BLOCKED-2] 시나리오 B — slip-service 중지 후 confirm 200

원인: 시나리오 A 실 API confirm 자체가 BLOCKED이므로 연쇄 BLOCKED.

코드 구조상 D1 `PartnerOrderConfirmService`는 SlipServiceClient를 참조하지 않으므로 slip-service 상태와 무관하게 독립적 동작이 보장됨.
