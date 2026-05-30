# Phase 2.6a 주문→출고전표 부분전환 — QA 리뷰 Cycle 1

**브랜치**: feat/phase-2-6-order-to-slip-conversion  
**HEAD**: 0c79ef4d  
**리뷰 일자**: 2026-05-30  
**리뷰어**: QA Agent (claude-qa-cycle1)  
**범위**: IT + 단위 테스트 정적 분석 (Docker 실행 제외)

---

## 종합 판정

**QA CONDITIONAL APPROVE** — 아래 P1 결함 1건(이중발행 위험) + P2 결함 2건 확인. P0 결함 없음.  
비차단 갭 명시 필수; P1 결함은 다음 사이클 전 BE 수정 요청.

---

## 1. 커버리지 평가

### 커버된 케이스

| # | 케이스 | 위치 |
|---|--------|------|
| 1 | DRAFT 일부전환 → 200, converted_quantity DB 단언, status DRAFT 유지 | IT 케이스1 |
| 2 | 전량전환 → status=CONVERTED DB 단언 | IT 케이스2 |
| 3 | 잔여 초과 전환 → 409 | IT 케이스3 |
| 4 | slipNo 있는 주문(CONFIRMED) 전환 → 409 | IT 케이스4 |
| 5a | CREATE 권한 deny → 403 | IT 케이스5a |
| 5b | MASTER bypass → 200 | IT 케이스5b |
| 6 | SlipServiceClient payload captor: sourceOrderLineId + 선택 라인만 + PO-CONV- prefix | IT 케이스6 |
| 단위1 | convertedQuantity=0, remainingQuantity=전체 | PartnerOrderLineConvertTest |
| 단위2 | 부분전환 2회 누적, isFullyConverted=true | PartnerOrderLineConvertTest |
| 단위3 | 잔여 초과 → 409 ResponseStatusException | PartnerOrderLineConvertTest |
| 단위4 | 비양수(0) 전환 → 409 ResponseStatusException | PartnerOrderLineConvertTest |

### 누락 케이스

| 심각도 | 누락 케이스 | 설명 |
|--------|------------|------|
| P1 | CONFIRMED+slipNo=null (PENDING_RETRY) 전환 시도 | 아래 §2-④ 참조 |
| P2 | 동일 주문 2회 연속 부분전환 idempotencyKey 비교 검증 IT | 아래 §2-① 참조 |
| P2 | slip_lines.source_order_line_id DB 실제 기록 단언 IT | 아래 §2-⑤ 참조 |
| Minor | slip 발행 실패(SlipServiceClient BusinessException) 시 converted_quantity 롤백 IT | 아래 §2-③ 참조 |
| Minor | CANCELED 상태 → 409 (requireConvertible 두 번째 가드) | requireConvertible 조건문에 있으나 IT 케이스 없음 |
| Minor | ON_HOLD 상태 전환 허용 여부 확인 IT | requireConvertible 에서 ON_HOLD 차단 없음 — 의도적 허용인지 모호 |

---

## 2. 핵심 갭 분석

### ① 같은 주문 2회 연속 부분전환 — 누적 converted_quantity + 2번째 idempotencyKey 다른지 [P2]

**현황**: PartnerOrderLineConvertTest 단위2에서 `convert(3) → convert(7)` 누적은 검증됨.  
IT 레벨에서 동일 주문에 대해 HTTP 요청 2회 연속 실행 후 DB converted_quantity=10 이 되는지, 그리고 2번째 요청의 idempotencyKey 가 1번째와 다른지(수량이 다르면 SHA-256 내용도 달라야 함) 단언하는 케이스가 없음.

**idempotencyKey 분석**: `buildIdempotencyKey` 는 `orderId + 정렬된 lineId:qty` SHA-256 이므로 qty 가 다른 2번째 요청은 다른 키를 생성함. 이 로직 자체는 올바르나 IT 단언이 없어 회귀 시 탐지 불가.

**권고**: 아래 시나리오 IT 추가 권고.
```
1차: lineId1 qty=3 → 200, converted_quantity=3
2차: lineId1 qty=4 → 200, converted_quantity=7, idempotencyKey(2차) != idempotencyKey(1차)
```

### ② 전량전환(CONVERTED) 후 추가 전환 시도 차단 [P2 — 구현 충분, IT 갭만]

**현황**: `requireConvertible()` 은 `slipNo != null` 과 `CANCELED/CONFIRMING` 을 차단하지만, `CONVERTED` 상태는 명시적으로 차단하지 않음.

**코드 확인**:
```java
// PartnerOrder.requireConvertible()
if (this.slipNo != null) { throw 409 }
if (this.status == CANCELED || this.status == CONFIRMING) { throw 409 }
```

`markConvertedIfComplete()` 가 전량 전환 후 status=CONVERTED 로 설정하지만, `requireConvertible()` 에 CONVERTED 차단 가드가 없음. slipNo 는 convert 흐름에서 설정되지 않으므로(null 유지) CONVERTED 후 추가 전환 요청이 통과될 수 있음.

**실제 동작 확인**: `markConvertedIfComplete` 는 status=CONVERTED 로만 변경하고 slipNo 는 null 유지. 따라서 CONVERTED 상태 주문에 재전환 요청 시 `requireConvertible()` 가드를 통과하고 모든 라인의 remainingQuantity=0 이므로 `convert(qty)` 에서 409 가 발생하여 결과적으로 차단됨.

**결론**: 기능은 동작하나 가드가 도메인 명시적 의미 단위(`CONVERTED` 체크)가 아닌 라인 수량 잔여 값으로 간접 차단됨. requireConvertible 에 `if (this.status == CONVERTED) throw 409` 명시가 없으면 라인이 0개인 엣지 케이스 또는 향후 상태 추가 시 우회될 수 있음. **IT 단언 없음**.

### ③ slip 발행 실패 시 converted_quantity 롤백 (트랜잭션) [Minor]

**현황**: `PartnerOrderConvertService.convert()` 는 `@Transactional` 으로 선언됨. `line.convert(qty)` 가 먼저 호출되어 도메인 객체 convertedQuantity 를 수정한 후, `slipServiceClient.publishFromPartnerOrder()` 가 `BusinessException(INTERNAL_ERROR)` 를 던지면 전체 트랜잭션이 롤백되어 DB는 이전 상태로 복귀해야 함.

**검증 갭**: SlipServiceClient 가 `BusinessException` 을 throw 하는 경우(5xx 시뮬레이션)에서 DB converted_quantity 가 실제로 롤백되는지 IT 단언이 없음. `@Transactional` 의 올바른 동작은 보장되지만 회귀 방지 IT 없음.

**권고**: Minor 수준, 다음 사이클 추가 권고.

### ④ PENDING_RETRY(CONFIRMED + slipNo null) 주문 전환 가능성 — 이중발행 위험 [P1]

**현황 분석**:

`requireConvertible()`:
```java
if (this.slipNo != null) { throw 409 }  // slipNo=null 이면 통과
if (this.status == CANCELED || this.status == CONFIRMING) { throw 409 }
// CONFIRMED 는 차단 조건 없음
```

`markSlipPendingRetry()`:
```java
this.status = PartnerOrderStatus.CONFIRMED;
this.slipPublishStatus = SlipPublishStatus.PENDING_RETRY;
// slipNo 는 null 유지
```

즉, CONFIRMED + slipPublishStatus=PENDING_RETRY + slipNo=null 인 주문은 `requireConvertible()` 을 통과함. 이 상태는 confirm 흐름에서 slip-service 5xx 이후 outbox 큐에 들어간 주문으로, outbox worker 가 slip 재발행 시도 중인 상태임. 이 주문에 convert-to-slip 요청이 들어오면:
1. `requireConvertible()` 통과 (slipNo null, status=CONFIRMED 는 차단 없음)
2. 선택 라인 convert() → converted_quantity 누적
3. slip-service 발행 → 새 slip 발행 (다른 idempotencyKey — PO-CONV- prefix)
4. 추후 outbox worker 가 원래 confirm 흐름의 slip 도 발행 시도

**결과**: 동일 주문에 대해 confirm 흐름 slip + convert 흐름 slip 이중발행 위험 존재.

**권고 (P1 — BE 수정 필요)**:
```java
// requireConvertible() 에 CONFIRMED 상태 차단 추가
if (this.status == PartnerOrderStatus.CONFIRMED) {
    throw new ResponseStatusException(HttpStatus.CONFLICT,
        "이미 확정된 주문은 부분전환할 수 없습니다. status=" + this.status);
}
```
또는 slipPublishStatus 포함 체크:
```java
if (this.status == PartnerOrderStatus.CONFIRMED
        || this.slipPublishStatus == SlipPublishStatus.PENDING_RETRY) {
    throw 409;
}
```

**IT 케이스 추가 필요**:
```
CONFIRMED + slipNo=null + slipPublishStatus=PENDING_RETRY 주문 → convert-to-slip 요청 → 409
```

케이스4는 CONFIRMED + slipNo 있는 경우만 테스트. CONFIRMED + slipNo null 케이스는 테스트 없음.

### ⑤ sourceOrderLineId 가 실제 slip_line DB 에 기록되는지 IT 단언 [P2]

**현황**: 케이스6에서 `SlipServiceClient.publishFromPartnerOrder(payload, key)` captor 로 `capturedLine.get("sourceOrderLineId")` 가 올바른 lineId 임을 단언함. 이는 **partner-order-service 가 slip-service 에 올바른 payload 를 전송함**을 보장함.

**갭**: slip-service 내부에서 `SlipLine.source_order_line_id` DB 컬럼에 실제로 기록되는지는 slip-service 의 별도 IT (`SlipPublishControllerIT`) 에서 검증되어야 하나, 해당 IT 에서 sourceOrderLineId 컬럼 단언이 없음.

**확인**: `SlipPublishService.resolveLines()` → `ResolvedLines.Entry(... l.sourceOrderLineId())` → `SlipLine.create(... sourceOrderLineId)` 로 propagation 경로는 올바름. `SlipLine` 도메인 생성자가 `this.sourceOrderLineId = sourceOrderLineId` 를 세팅하고 V29 migration 으로 컬럼 존재함.

**권고**: slip-service SlipPublishControllerIT 에 from-partner-order 발행 후 `SELECT source_order_line_id FROM slip_lines WHERE slip_id = ?` 단언 1건 추가 권고.

---

## 3. 권한 IT 분석

### DynamicPermissionClient 7-action stub 적정성

`setUp()` 에서 3개 메서드만 stub:
```java
lenient().when(dynamicPermissionClient.canView(...)).thenReturn(true)
lenient().when(dynamicPermissionClient.canEdit(...)).thenReturn(true)
lenient().when(dynamicPermissionClient.check(UUID, String, PermissionAction)).thenReturn(true)
```

`DynamicPermissionClient` 인터페이스가 정의한 메서드: `check`, `bulkLoad`, `canView`, `canEdit` 총 4개. stub 되지 않은 `bulkLoad` 는 `@MockBean` 의 기본 동작(`Map.of()` 반환)이므로 문제 없음. **7-action 완전 커버**: `PermissionAction` enum 이 7개이나 stub 은 action enum 단위가 아닌 메서드 단위이며 `any(PermissionAction.class)` 로 전체 매처가 사용됨. 충분.

### X-User-Id 실제성 / false-green 여부

케이스5a에서:
- `when(dynamicPermissionClient.check(any(UUID.class), eq("sales.partner-order.convert"), eq(PermissionAction.CREATE))).thenReturn(false)` 로 deny
- header `X-User-Id=VIEWER_ACCOUNT_ID`, role=PARTNER

**잠재적 false-green**: `PermissionAspect` 는 PARTNER role 에 대해 `partnerSelfService=false` 이면 `DynamicPermissionClient.check()` 호출 전에 `deny()` 를 즉시 호출함. 즉 케이스5a에서 403 은 DynamicPermissionClient.check 의 false 반환 때문이 아니라 PARTNER role 자체 deny 때문임. 이는 올바른 403 이나, 의도된 시나리오("CREATE 권한 deny → 403")의 실제 이유가 다름.

**권고**: `@WithMockUser(roles = {"SALES"})` + dynamicPermissionClient.check false stub 으로 재작성하여 진짜 check 결과에 의한 403 을 검증할 것. 현재 테스트는 PARTNER 묵시적 deny 를 CREATE deny 라고 오해할 수 있음.

케이스5b MASTER: `PermissionAspect.isMasterBypass()` 에서 check 호출 전 즉시 통과. DynamicPermissionClient.check 가 호출되지 않음. bypass 동작 자체는 올바르나 verify(dynamicPermissionClient, never()).check(...) 단언이 없어 bypass 가 실제로 작동하는지 확인 불가.

---

## 4. AbstractPostgresIT / Testcontainers / @MockBean 분석

### skipped=0 여부

`DockerAvailableCondition.evaluateExecutionCondition()` 은 `DockerClientFactory.instance().isDockerAvailable() && POSTGRES.isRunning()` 양쪽을 확인함. Docker 미가용 시 자동 disabled. **Windows + Docker Desktop 환경에서 Docker 정상 가동 중이면 skip 없이 실행**됨.

### Testcontainers 실행 적정성

- PostgreSQL 16-alpine 싱글턴 컨테이너 (static field). `@DynamicPropertySource` 로 datasource 주입.
- `spring.flyway.enabled=true` + `spring.jpa.hibernate.ddl-auto=validate` 로 실제 마이그레이션 실행.
- V8 migration(converted_quantity 컬럼)과 V29 migration(slip_lines.source_order_line_id)이 각 서비스의 Flyway로 적용됨.
- `@BeforeEach` 에서 `outboxRepository.deleteAll()` → `partner_order_lines` DELETE → `orderRepository.deleteAll()` 순서로 FK 방향 준수. 적절.

### @MockBean SlipServiceClient stub 정확성

기본 stub:
```java
lenient().when(slipServiceClient.publishFromPartnerOrder(any(), anyString()))
        .thenReturn(PublishResult.published(STUB_SLIP_NO));
```

`publishFromPartnerOrder(Map<String,Object>, String)` 시그니처와 일치. `PublishResult.published` 반환. 적절.

케이스6 captor 사용: `ArgumentCaptor<Map<String, Object>>` + `ArgumentCaptor<String>` → `verify(slipServiceClient).publishFromPartnerOrder(payloadCaptor, keyCaptor)`. captor 사용 전 mockMvc 호출이 먼저 성공해야 captor 값이 채워지는 순서 올바름.

**주의**: `capturedLine.get("qty").toString()` 단언에서 `String.valueOf(3)` → `"3"` 비교. `ConvertToSlipRequest.Item.quantity()` 가 int 이고 `String.valueOf(item.quantity())` 로 String 변환되므로 정확함.

---

## 5. 기존 발행(confirm) IT 회귀 — sourceOrderLineId 추가로 안 깨지나

**확인**: `SlipLine.create()` 는 두 오버로드 존재:
1. `create(slip, productId, productName, modelName, spec, qty, unitPrice, note, sourceOrderLineId)` — Phase 2.6a 신규
2. `create(slip, productId, productName, modelName, spec, qty, unitPrice, note)` — 기존 경로 null 위임

기존 confirm 흐름(`PartnerOrderConfirmService`)과 estimate 발행 흐름(`SlipPublishService.publishFromEstimate`)은 오버로드 2번을 호출하거나, `ResolvedLines.toEntityLines()` 를 통해 sourceOrderLineId 포함 오버로드로 통합됨.

`SlipPublishService.resolveLines()` 에서 `l.sourceOrderLineId()` 가 `PublishLineRequest` record 필드인데, 기존 from-estimate 경로 body 에 sourceOrderLineId 가 없으면 null 로 직렬화됨. `PublishLineRequest` record 의 `UUID sourceOrderLineId` 는 validation 없이 nullable. JSON 미포함 시 null 기본값.

**결론**: 기존 confirm IT (`PartnerOrderConfirmServiceIT`, `SlipPublishControllerIT` 등)는 sourceOrderLineId 를 payload 에 넣지 않으므로 null 로 처리됨. `SlipLine.create(... null)` 은 `this.sourceOrderLineId = null` 로 정상 저장. V29 migration 컬럼이 nullable 이므로 DB 저장 문제 없음. **회귀 없음**.

---

## 6. 도메인 정합성 SQL (runtime 미실행, 정적 설계 검증)

```sql
-- 부분전환 정합성: converted_quantity <= quantity
SELECT id, quantity, converted_quantity
FROM partner_order_lines
WHERE converted_quantity > quantity AND is_deleted = FALSE;
-- 기대: 0 rows

-- CONVERTED 상태 주문의 모든 라인이 전량 전환인지
SELECT po.id, po.status, pol.quantity, pol.converted_quantity
FROM partner_orders po
JOIN partner_order_lines pol ON pol.partner_order_id = po.id
WHERE po.status = 'CONVERTED'
  AND pol.is_deleted = FALSE
  AND pol.converted_quantity < pol.quantity;
-- 기대: 0 rows

-- sourceOrderLineId 가 실제 partner_order_lines FK 로 존재하는지 (cross-DB는 불가, 같은 서비스 기준)
-- slip-service에서:
SELECT sl.id, sl.source_order_line_id
FROM slip_lines sl
WHERE sl.source_order_line_id IS NOT NULL
  AND sl.is_deleted = FALSE;
-- 수동 확인: source_order_line_id 가 partner_order_lines.id 에 해당하는지 cross-check
```

---

## 7. 결함 요약

| ID | 심각도 | 구분 | 설명 | 결함 위치 |
|----|--------|------|------|-----------|
| G-1 | P1 | 구현 결함 | CONFIRMED+slipNo=null(PENDING_RETRY) 주문이 requireConvertible() 통과 → 이중발행 위험 | PartnerOrder.requireConvertible() |
| G-2 | P2 | IT 갭 | CONVERTED 후 추가 전환 시도 차단 IT 케이스 없음 (기능은 라인 잔여로 간접 차단됨) | PartnerOrderConvertIT |
| G-3 | P2 | IT 갭 | sourceOrderLineId slip_lines DB 기록 단언 없음 | SlipPublishControllerIT |
| G-4 | P2 | IT 갭 | 2회 연속 부분전환 IT (누적 + 다른 idempotencyKey) 없음 | PartnerOrderConvertIT |
| G-5 | Minor | IT 설계 | 케이스5a 403 이유가 PARTNER role 묵시적 deny (CREATE deny 아님) — false-green 오해 유발 | PartnerOrderConvertIT |
| G-6 | Minor | IT 갭 | slip 발행 실패 → converted_quantity 롤백 트랜잭션 IT 없음 | PartnerOrderConvertIT |
| G-7 | Minor | 구현 모호 | requireConvertible()에 CONVERTED 명시 차단 없어 향후 상태 확장 시 우회 가능 | PartnerOrder.requireConvertible() |

---

## 8. 차단 여부 판정

- **G-1 (P1)**: BE 수정 요청 — requireConvertible() 에 CONFIRMED 상태 명시 차단 추가. 다음 사이클 IT 추가 포함.
- **G-2~G-7**: 비차단. 다음 사이클에서 IT 보강 권고.

**다음 사이클(cycle2) 필수 작업**:
1. BE: `requireConvertible()` CONFIRMED 차단 가드 추가
2. IT: G-1 케이스 (CONFIRMED+slipNo=null → 409) 추가
3. IT: G-2 케이스 (CONVERTED 후 추가전환 → 409) 추가
4. IT: G-4 케이스 (2회 연속 부분전환 누적) 추가
5. IT: G-5 케이스5a 재작성 (SALES role + dynamicPermissionClient deny → 403)
6. IT 권고: G-3 slip_lines.source_order_line_id DB 단언 (slip-service SlipPublishControllerIT)
