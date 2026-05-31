# 슬라이스 D1 — confirm 자동발행 폐지 QA 리뷰 (claude-qa-cycle1)

- **작성일**: 2026-05-31
- **리뷰어**: Claude QA
- **대상 브랜치**: feat/slice-d1-confirm-no-autopublish
- **diff 커밋 수**: 4 (spec → plan → feat → docs)
- **리뷰 유형**: 커버리지 + 회귀 + 도메인 정합 + Docker 실 QA 절차 설계

---

## 1. 테스트 커버리지 평가

### 1.1 IT 2케이스 vs. spec §6 의도 매핑

| spec §6 항목 | 대응 IT 케이스 | 커버 여부 |
|---|---|---|
| status=DRAFT | `confirm_creates_draft_order_without_slip_publish` — `response.status() == "DRAFT"` | 커버 |
| slipNo IS NULL | 동 케이스 — `response.slipNo() == null` | 커버 |
| slipPublishStatus=NOT_REQUIRED | 동 케이스 — `.isEqualTo(SlipPublishStatus.NOT_REQUIRED.name())` | 커버 |
| slipServiceClient.publishFromPartnerOrder never() | 동 케이스 — `verify(slipServiceClient, never())` | 커버 |
| outbox row 0 | `confirm_does_not_enqueue_outbox` — `outboxRepository.count() == before` | 커버 |
| 멱등 재confirm → 동일 주문, 라인 중복 0 | **없음** | **미커버 (P1)** |
| revision CREATE 캡처 (revision_no=1) | **없음** | **미커버 (P2)** |

### 1.2 누락 엣지

**P1 — 멱등 재confirm IT 없음**

spec §6에 "멱등 재confirm → 동일 주문 반환, 라인 중복 0" 이 명시되어 있으나 IT 가 없다.
`PartnerOrderConfirmService.confirm` 의 멱등 경로(`findByIdempotencyKey` hit 시 기존 주문 반환)는 서비스 코드에 구현되어 있지만 IT 에서 검증되지 않았다.
재confirm 시 `orderNo` 가 동일하고 `partner_order_lines` row 가 중복 INSERT 되지 않는다는 DB 레벨 단언이 없다.

**P2 — revision_no=1 (CREATE 캡처) DB 단언 없음**

`PartnerOrderRevisionService.capture(order, CREATE, ...)` 호출은 서비스 코드에 있으나, IT 는 `revisionService` 를 `@MockBean` 으로 격리하지 않았다 (Spring 실 빈 주입). 즉 revision INSERT 가 실제로 발생하나, IT 가 `partner_order_revisions` 테이블에서 `revision_no=1` 인 행의 존재를 DB 레벨로 단언하지 않는다.

**P2 — dc-config 404 / product 404 에러 경로 커버 없음**

spec §5 에 "dc-config/product 조회 실패 → 기존 예외 처리" 가 언급되어 있으나 해당 에러 케이스 IT 가 없다. (기존 동작 유지이므로 P2 분류.)

---

## 2. 회귀 위험 평가

### 2.1 from-estimate 경로 무변경 증명

`PartnerOrderFromEstimateService` 가 이번 diff 에 포함되지 않았다. `PartnerOrderFromEstimateIT` 는 기존 그대로 존재하며 `status=DRAFT + NOT_REQUIRED` 를 검증한다. 회귀 위험 없음.

### 2.2 convert 흐름 무변경 증명

`PartnerOrderConvertService` 가 이번 diff 에 포함되지 않았다. `requireConvertible()` 화이트리스트는 `DRAFT + ON_HOLD` 이며 변경 없다. `PartnerOrderConvertIT` 도 무변경. 회귀 위험 없음.

### 2.3 레거시 CONFIRMED+slip 주문 불변

`markSlipPublished`, `markSlipPendingRetry`, `create()` (CONFIRMING 팩토리) 는 모두 deprecated 주석을 달고 코드에 잔존한다. `SlipPublishOutboxScheduler` 는 이번 diff 에서 미변경이며 `PENDING` 상태 row drain 을 계속 수행한다. 레거시 PENDING_RETRY 주문에 대한 불변성은 코드 수준에서 유지된다.

**단, 다음 P1 위험이 존재한다:**

**P1 — outbox 스케줄러 IT 없음 (레거시 drain 회귀 미검증)**

spec §6 "레거시 outbox 스케줄러 IT(있으면) 유지" 조건은 기존에 스케줄러 IT 가 없었으므로 신규 추가 의무는 아니다. 그러나 `SlipPublishOutboxScheduler` 가 이번 diff 이후 `PENDING` row 를 drain 할 수 있다는 것을 IT 로 보장하는 테스트가 repo 전체에 존재하지 않는다. `SlipPublishOutboxSchedulerTest` 같은 단위 테스트도 확인되지 않는다. 레거시 PENDING_RETRY 운영 주문이 있는 상황에서 scheduler 가 silent-fail 할 경우 감지 수단이 없다. (신규 도입 결함은 아니나 D1 머지 시점 위험으로 기록.)

### 2.4 createFromConfirm 팩토리 — 이중 상태 오염 위험

`PartnerOrder.createFromConfirm` 은 내부적으로 `new PartnerOrder(...)` 를 통해 생성자를 호출한다. 이 private 생성자는 `status = CONFIRMING`, `slipPublishStatus = PENDING_RETRY`, `confirmedAt = LocalDateTime.now()` 로 초기화한 뒤, `createFromConfirm` 에서 `order.status = DRAFT`, `order.slipPublishStatus = NOT_REQUIRED`, `order.confirmedAt = null` 로 덮어쓴다.

**구조적 위험**: 생성자에서 의도하지 않은 상태(CONFIRMING/PENDING_RETRY)가 잠깐 생성되고 즉시 덮어 쓰인다. 현재는 단일 트랜잭션 내에서 영속화 전 오버라이드이므로 동작상 문제는 없다. 그러나 이 패턴은 이후 리팩터 시 실수를 유발할 수 있는 취약한 구조다.

**권고 (P2)**: 전용 생성자(`PartnerOrder(String partnerCode, String bizCode, String orderNo, String idempotencyKey, BigDecimal totalAmount, PartnerOrderStatus status, SlipPublishStatus slipPublishStatus)`) 를 추가하거나, `createFromConfirm` 이 기존 레거시 생성자를 거치지 않도록 분리하는 것이 장기적으로 안전하다.

---

## 3. 도메인 정합 평가

### 3.1 confirm → DRAFT → requireConvertible 화이트리스트 정합

`requireConvertible()` 은 `this.status != DRAFT && this.status != ON_HOLD` 일 때 409를 던진다. confirm 후 status=DRAFT 이므로 convert 화이트리스트에 포함된다. 정합 확인.

`slipNo` 가드: `requireConvertible()` 은 `slipNo != null` 이면 409를 던진다. confirm 후 `slipNo=null` 이므로 convert 진행 가능. 정합 확인.

### 3.2 컨트롤러 Javadoc 스테일

`PartnerOrderConfirmController.confirm` 의 Javadoc (52~56행)과 `@ApiResponses` 설명이 구 자동발행 흐름(CONFIRMED/PENDING_RETRY)을 기술하고 있다:

> "slip 발행 200/409 → CONFIRMED, 5xx → PENDING_RETRY"

이는 D1 이후 현실과 다르다. 응답은 항상 `status=DRAFT`이다. **P1 — 컨트롤러 Javadoc/OpenAPI 설명 스테일**, 클라이언트 통합 개발 시 오독 위험.

### 3.3 ConfirmResponse.confirmedAt 항상 null

`createFromConfirm` 에서 `order.confirmedAt = null` 로 설정하므로 `ConfirmResponse.confirmedAt` 이 항상 null 로 반환된다. spec §8 에 "접수시각 별도 표시 필요 시 후속" 으로 정리되어 있어 의도된 설계다. IT 에서 `confirmedAt == null` 단언이 없어 추후 서비스 변경 시 회귀 감지가 약하다. (P2)

---

## 4. Docker 실 QA 시나리오 (머지 전 실 절차)

> [[feedback_no_fake_data_ever]]: 모든 검증은 실 서버/실 DB/실 화면 기준. 스크린샷은 실 캡처만.

### 사전 조건

- `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml ps` 로 `samhan-partner-order-service`, `samhan-slip-service`, `samhan-api-gateway` 모두 `Up` 상태 확인.
- 실 거래처 계정(JWT)으로 로그인된 거래처 포털 세션 확보.

### 시나리오 A: confirm → DRAFT 생성 + slip 0건

**단계 1 — 임시저장 생성**

거래처 포털에서 주문 임시저장(`POST /api/v1/partner-orders/drafts`)을 실행해 `draftId` 확보. (기존 동작 무변경)

**단계 2 — confirm 호출**

```
POST /api/v1/partner-orders/{draftId}/confirm
Headers: X-Partner-Code: {실거래처코드}, X-Biz-Code: {실사업자번호}
         Authorization: Bearer {JWT}
Body: { "lines": [ { "productId": "...", "categoryKey": "homemulti", "quantity": 1 } ] }
```

응답 단언:
- HTTP 200
- `data.status == "DRAFT"`
- `data.slipNo == null`
- `data.slipPublishStatus == "NOT_REQUIRED"`

**단계 3 — partner_order_db psql 검증**

```sql
-- samhan-postgres 컨테이너 접속
docker exec -it samhan-postgres psql -U samhan -d partner_order_db

-- confirm 직후 최신 주문 확인 (today 기준)
SELECT order_no, status, slip_publish_status, slip_no, confirmed_at, created_at
  FROM partner_orders
 WHERE is_deleted = false
   AND order_no LIKE CONCAT(to_char(NOW(), 'YYYY/MM/DD'), '%')
 ORDER BY created_at DESC
 LIMIT 5;
```

기대값:
- `status = 'DRAFT'`
- `slip_publish_status = 'NOT_REQUIRED'`
- `slip_no IS NULL`
- `confirmed_at IS NULL` (createFromConfirm 에서 명시적 null)

**단계 4 — slip_db 신규 PARTNER_ORDER slip 0건 검증**

```sql
-- 별도 psql 세션: slip_db 접속
docker exec -it samhan-postgres psql -U samhan -d slip_db

-- slip-service 가 partner-order-service 로부터 신규 발행을 수신하지 않았는지 확인
-- (슬립 번호 채번은 slip-service 내부 로직에 의존하므로 order_no 또는 reference 로 확인)
SELECT slip_no, slip_type, source_type, source_id, created_at
  FROM slips
 WHERE source_type = 'PARTNER_ORDER'
   AND created_at >= NOW() - INTERVAL '5 minutes'
   AND is_deleted = false
 ORDER BY created_at DESC;
```

기대값: **0 rows** (D1 이후 confirm 으로 인한 slip INSERT 없음)

> 실제 slip 테이블 컬럼명은 `\d slips` 로 확인 후 쿼리 조정 필요.

**단계 5 — outbox 0건 검증 (partner_order_db)**

```sql
-- partner_order_db 세션 복귀
SELECT COUNT(*) FROM slip_publish_outbox
 WHERE is_deleted = false
   AND status = 'PENDING'
   AND created_at >= NOW() - INTERVAL '5 minutes';
```

기대값: `count = 0`

**단계 6 — 본사 데스크톱 진행중 표시 확인**

본사 데스크톱의 "거래처 주문" 목록에서 방금 confirm 한 주문이 `진행중(DRAFT)` 상태로 표시되는지 실 화면 캡처 (`docs/qa/slice-d1-confirm-no-autopublish/qa-draft-list.png`).

---

### 시나리오 B: slip-service 중지 상태에서 confirm 200 확인

**단계 1 — slip-service 컨테이너 중지**

```
docker stop samhan-slip-service
```

**단계 2 — confirm 재호출 (새 draftId)**

새 임시저장 생성 후 동일 confirm API 호출.

기대값:
- HTTP 200 (slip-service 다운에도 무관)
- `data.status == "DRAFT"`, `data.slipNo == null`

**단계 3 — slip-service 재기동**

```
docker start samhan-slip-service
```

**단계 4 — psql 재검증**

slip-service 재기동 후에도 slip_db 에 신규 PARTNER_ORDER slip 이 생성되지 않았는지 재확인 (D1 이후 자동 retry 없음).

---

### 시나리오 C: confirm 후 convert → slip 발행 전체 흐름 (end-to-end)

**단계 1 — 시나리오 A 완료 주문 선택**

A에서 생성한 DRAFT 주문의 UUID(`partner_orders.id`)를 psql 로 확인.

**단계 2 — convert 호출**

본사 데스크톱 "출고전표 전환" 버튼 클릭 (또는 직접 API):

```
POST /api/v1/partner-orders/{orderId}/convert-to-slip
Headers: Authorization: Bearer {본사 JWT}
Body: { "warehouseCode": "WH-01", "lines": [ { "lineId": "...", "quantity": 1 } ] }
```

기대값: HTTP 200, `slipNo` 비null

**단계 3 — slip_db 1건 검증**

```sql
SELECT slip_no, slip_type, source_type, created_at
  FROM slips
 WHERE source_type = 'PARTNER_ORDER'
   AND created_at >= NOW() - INTERVAL '10 minutes'
   AND is_deleted = false
 ORDER BY created_at DESC
 LIMIT 3;
```

기대값: 방금 convert 한 slip 1건.

**단계 4 — partner_order_db 상태 검증**

```sql
SELECT order_no, status, slip_publish_status, slip_no
  FROM partner_orders
 WHERE id = '{orderId}'
   AND is_deleted = false;
```

기대값: `status = 'CONVERTED'` (전량 전환 시) 또는 `'DRAFT'` (부분 전환), `slip_no IS NULL` (partner_orders 는 D1 이후 slip_no 를 기록하지 않음 — convert 는 라인별 converted_quantity 만 갱신).

---

### 시나리오 D: 멱등 재confirm 검증

**단계 1 — 동일 draftId 로 confirm 2회 호출**

```
POST /api/v1/partner-orders/{draftId}/confirm  (1회)
POST /api/v1/partner-orders/{draftId}/confirm  (2회 — 동일 요청 반복)
```

기대값: 두 응답 모두 HTTP 200, 동일 `orderNo` 반환.

**단계 2 — partner_order_db 중복 검증**

```sql
SELECT order_no, COUNT(*) AS cnt
  FROM partner_orders
 WHERE idempotency_key = 'PO-CONF-{partnerCode}-{draftSeq}'
   AND is_deleted = false
 GROUP BY order_no;
```

기대값: `cnt = 1` (중복 row 없음).

```sql
SELECT COUNT(*) FROM partner_order_lines pol
  JOIN partner_orders po ON pol.partner_order_id = po.id
 WHERE po.idempotency_key = 'PO-CONF-{partnerCode}-{draftSeq}'
   AND pol.is_deleted = false;
```

기대값: 라인 수가 최초 confirm 요청의 라인 수와 동일 (중복 INSERT 없음).

---

## 5. CI skipped 확인 지침

머지 전 GitHub Actions CI 에서 다음을 확인:

- `PartnerOrderConfirmServiceIT` 의 2 케이스가 `skipped=0 + passed=2` 인지 확인 (Docker 가용 환경 기준).
- Docker 미가용 CI runner 에서 `skipped=2` 인 경우: `feedback_testcontainers_windows_docker` 정책에 따라 허용. 단, Docker 가용 환경(Linux runner)에서 반드시 1회 green 확인 필요.
- `PartnerOrderConvertIT`, `PartnerOrderFromEstimateIT`, `HoldStatusFilterIT` 모두 regression skipped=0 확인.

---

## 6. 결론

**전체 판정: 조건부 통과 (P1 2건 해결 권장, P2 3건 후속 수용 가능)**

### Finding 목록

| 등급 | ID | 내용 |
|---|---|---|
| P1 | D1-QA-01 | IT 멱등 재confirm 케이스 없음 — spec §6 명시 항목 미커버. outboxRepository 2회 count 비교 또는 orderNo 1건 단언으로 추가 필요. |
| P1 | D1-QA-02 | 컨트롤러 Javadoc/OpenAPI 설명 스테일 — "slip 발행 200/409 → CONFIRMED, 5xx → PENDING_RETRY" 가 D1 이후 현실과 다름. 클라이언트 통합 개발자 오독 위험. |
| P1 | D1-QA-03 | outbox 스케줄러 단위 IT 전무 — 레거시 PENDING_RETRY drain 무결성 보장 수단 없음. 신규 결함은 아니나 D1 머지 시 가시성 위험. |
| P2 | D1-QA-04 | revision_no=1 DB 단언 없음 — IT 가 revisionService @MockBean 미격리(실 빈 사용)하므로 실제 revision INSERT 발생하나 결과 단언 없음. |
| P2 | D1-QA-05 | createFromConfirm 이중 상태 패턴 — private 생성자 CONFIRMING 초기화 후 즉시 덮어쓰기. 동작 무결하나 리팩터 시 실수 유발 구조. |
| P2 | D1-QA-06 | confirmedAt=null 단언 없음 — spec §8 의도된 설계이나 IT 단언 미확보로 회귀 감지 약함. |

**P1: 3건 / P2: 3건 / P0: 0건**

P0 결함 없음. P1 D1-QA-01(멱등 IT)과 D1-QA-02(Javadoc 수정)는 머지 전 수정 권장. D1-QA-03(스케줄러 IT)은 후속 정리 슬라이스 대상으로 수용 가능.
