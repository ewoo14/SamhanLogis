# Phase 2.6a 주문→출고전표 부분전환 — QA 리뷰 Cycle 2

**브랜치**: feat/phase-2-6-order-to-slip-conversion
**HEAD**: 8f9c2c5e (fix commit: 30b2c6d7)
**리뷰 일자**: 2026-05-30
**리뷰어**: QA Agent (claude-qa-cycle2)
**범위**: cycle1 결함(G-1~G-7) 해소 검증 + 신규 결함 탐색 (정적 분석, 수정 금지)

---

## 종합 판정

**QA APPROVE (cycle2)**

cycle1 P1 결함(G-1 PENDING_RETRY 이중발행)이 화이트리스트 가드로 구현 수준에서 완전 해소됨.
G-4(2회 누적 IT), G-2(CONVERTED 후 차단 IT)가 각각 케이스7, 케이스8로 신규 추가됨.
G-5(false-green 403)가 잔류하나 비차단(아래 §2 상세).
G-3(slip_line DB 단언), G-6(롤백 IT)는 cycle1 비차단 분류 유지.
신규 결함 없음.

---

## 1. cycle1 결함 G-1~G-7 해소 현황

### G-1 PENDING_RETRY 이중발행 [P1 → RESOLVED]

**요구**: `requireConvertible()` 에 CONFIRMED 상태 명시 차단 + IT 케이스9 추가.

**확인 (PartnerOrder.java 432-441행)**:

```java
public void requireConvertible() {
    if (this.slipNo != null) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, ...);
    }
    if (this.status != PartnerOrderStatus.DRAFT && this.status != PartnerOrderStatus.ON_HOLD) {
        throw new ResponseStatusException(HttpStatus.CONFLICT,
            "출고전표로 전환 가능한 상태가 아닙니다(진행중/보류만 가능). 현재: " + this.status);
    }
}
```

cycle1 분석 시점의 `if (status == CANCELED || status == CONFIRMING)` 블랙리스트 방식이
`if (status != DRAFT && status != ON_HOLD)` 화이트리스트 방식으로 교체됨.
CONFIRMED, CONVERTING, CONVERTED, CANCELED 모두 이 조건으로 409 반환. PENDING_RETRY 이중발행 원천 차단.

**IT 케이스9 (PartnerOrderConvertIT.java 595-642행)**:
- `status=CONFIRMED, slipNo=null, slipPublishStatus=PENDING_RETRY` 데이터를 JDBC INSERT
- convert-to-slip POST → `status().isConflict()` 단언
- setup 정확: `confirmed_at=NOW()`, `slip_no=NULL`, `slip_publish_status='PENDING_RETRY'`

판정: **RESOLVED** — 구현 화이트리스트 변경 + IT 케이스9 정확히 추가됨.

---

### G-2 CONVERTED 후 추가 전환 [P2 IT 갭 → RESOLVED]

**요구**: CONVERTED 상태 주문에 추가 전환 요청 → 409 IT 케이스 추가.

**확인 (IT 케이스8, 534-581행)**:
- `status=CONVERTED, converted_quantity=quantity=5` 데이터를 JDBC INSERT (라인 포함)
- convert-to-slip POST → `status().isConflict()` 단언

**차단 경로 분석**: CONVERTED 상태는 화이트리스트(`DRAFT/ON_HOLD` 만 허용)에서 제외됨.
`requireConvertible()` 두 번째 조건(`status != DRAFT && status != ON_HOLD`) 에 의해 409 발생.
cycle1 우려사항(라인 잔여 간접 차단)이 명시적 상태 가드로 해소됨.

판정: **RESOLVED** — IT 케이스8 정확히 추가됨.

---

### G-4 2회 연속 부분전환 [P2 IT 갭 → RESOLVED]

**요구**: 동일 라인 2회 부분전환 — converted_quantity 누적 + 두 번째 idempotencyKey 가 첫 번째와 다름.

**확인 (IT 케이스7, 445-521행)**:

1차 전환 (qty=3):
- `isConflict()` 아닌 `isOk()` + `fullyConverted=false` 단언
- `ArgumentCaptor<String> keyCaptor1` 으로 key1 캡처
- DB: `converted_quantity = 3` 단언

2차 전환 (qty=4):
- `Mockito.reset(slipServiceClient)` 후 새 stub 설정 (올바른 패턴)
- `ArgumentCaptor<String> keyCaptor2` 로 key2 캡처
- DB: `converted_quantity = 7 (3 + 4 누적)` 단언
- `assertThat(key1).isNotEqualTo(key2)` 단언
- 양쪽 `startsWith("PO-CONV-")` 단언

**idempotencyKey 결정론 분석**: `buildIdempotencyKey` 는
`convertedBefore (발행 직전 convertedQuantity 스냅샷)` 을 SHA-256 입력에 포함.
1차: convertedBefore=0, qty=3 → key1.
2차: convertedBefore=3(1차 누적 후), qty=4 → key2.
동일 orderId 임에도 convertedBefore 값이 달라 SHA-256 해시 다름 → key1 != key2 보장됨.

판정: **RESOLVED** — IT 케이스7 정확히 추가됨. 누적 + 키 상이 양쪽 단언 완전.

---

### G-5 권한 403 false-green [Minor → 잔류, 비차단]

**요구**: 케이스5a를 `@WithMockUser(roles = {"SALES"})` + `dynamicPermissionClient.check false` stub 으로
재작성하여 DynamicPermissionClient.check 결과에 의한 진짜 403 검증.

**현황 (케이스5a, 279-307행)**:

```java
@Test
@WithMockUser(roles = {"PARTNER"})
@DisplayName("케이스5a: 권한 deny(CREATE) → 403 FORBIDDEN")
void case5a_permissionDeny_returns403() throws Exception {
    when(dynamicPermissionClient.check(...)).thenReturn(false);
    ...
    .header("X-User-Role", "PARTNER")
    ...
    .andExpect(status().isForbidden());
}
```

PARTNER role 이 그대로 유지됨. cycle1 권고(SALES role + check false stub) 미적용.

**실제 403 원인 재확인**: `PermissionAspect.java` 138-142행에서:
```java
if ("PARTNER".equalsIgnoreCase(roleCode)) {
    if (annotation.partnerSelfService()) { ... }
    deny(page, roleCode, actionName, "PARTNER role");
}
```
`partnerSelfService=false`(convert endpoint 기본값)이므로 check 호출 없이 즉시 deny.
`dynamicPermissionClient.check(...).thenReturn(false)` stub 은 실제로 호출되지 않음.
403은 반환되나 이유가 의도(CREATE 권한 없음)와 다름(PARTNER role 자체 deny).

**비차단 판정 유지 근거**:
- 403 반환 자체는 올바름 — 최종 HTTP status 회귀 없음
- SALES role 재작성은 테스트 의미론 개선이지 기능 버그 아님
- cycle1에서도 Minor 분류

판정: **잔류 비차단** — 다음 슬라이스 또는 별도 테스트 품질 개선 PR 권고.

---

### G-3 slip_line.source_order_line_id DB 단언 [P2 IT 갭 → cycle2 비차단 분류 유지]

**현황**: slip-service `SlipPublishControllerIT` 에서 `source_order_line_id` 컬럼 단언 없음.
이번 수정 커밋(30b2c6d7) 변경 파일 목록에 slip-service IT 없음.

**propagation 경로 재확인**:
- `SlipPublishService.resolveLines()` → `PublishLineRequest.sourceOrderLineId()` → `SlipLine.create(... sourceOrderLineId)` → `this.sourceOrderLineId = sourceOrderLineId` (V29 migration 컬럼 nullable)

partner-order IT 케이스6 captor 가 payload에 `sourceOrderLineId` 포함을 단언함으로써
partner-order 서비스 경계까지는 검증됨. slip-service 내부 DB 기록은 별도 서비스 IT 범위.

판정: **비차단 유지** — cycle2 비차단. 2.6c 슬라이스 또는 slip-service 전용 IT PR 에서 처리 권고.

---

### G-6 발행 실패 시 converted_quantity 롤백 [Minor → cycle2 비차단 분류 유지]

**현황**: `@Transactional` 보장 존재하나 SlipServiceClient 5xx 시 rollback IT 없음.
수정 커밋에 해당 케이스 미추가.

**트랜잭션 설계 재확인 (PartnerOrderConvertService.java)**:
- 발행 전: 사전 잔여 검증만(converted 누적 없음)
- 발행 성공 후: `line.convert(qty)` 호출 → `order.markConvertedIfComplete()` → `saveAndFlush`
- 발행 5xx → BusinessException → `@Transactional` rollback → converted_quantity 미변경

cycle1에서 "발행 성공 후 converted 누적" 순서가 올바르게 구현됨을 이미 확인함.
IT 부재는 회귀 미탐지 위험이나 구현 자체가 올바르므로 Minor 유지.

판정: **비차단 유지** — 향후 추가 권고.

---

### G-7 requireConvertible CONVERTED 명시 가드 부재 [Minor → RESOLVED]

**요구**: `requireConvertible()` 에 `CONVERTED` 명시 차단 추가.

**현황**: 화이트리스트 방식(`status != DRAFT && status != ON_HOLD`)으로 구현되어
CONVERTED를 포함한 모든 비허용 상태가 단일 조건으로 차단됨.
cycle1 우려사항(향후 상태 추가 시 블랙리스트 누락)이 화이트리스트 전환으로 완전 해소.

판정: **RESOLVED** — 명시적 상태 열거 불필요, 화이트리스트 패턴이 더 강건함.

---

## 2. IT 커버리지 현황 (cycle2 기준)

| # | 케이스 | 상태 | 비고 |
|---|--------|------|------|
| 1 | DRAFT 일부전환 → 200 + converted_quantity DB 단언 + status DRAFT 유지 | 유지 | |
| 2 | 전량전환 → status=CONVERTED DB 단언 | 유지 | |
| 3 | 잔여 초과 전환 → 409 | 유지 | |
| 4 | slipNo 있는 주문(CONFIRMED) 전환 → 409 | 유지 | |
| 5a | CREATE 권한 deny → 403 (PARTNER role 묵시적 deny) | 유지 (G-5 잔류) | false-green 오해 소지 |
| 5b | MASTER bypass → 200 | 유지 | |
| 6 | SlipServiceClient payload captor: sourceOrderLineId + 선택 라인만 + PO-CONV- prefix | 유지 | |
| 7 | 2회 연속 부분전환 → converted_quantity 누적 + idempotencyKey 상이 | 신규 추가 (G-4 해소) | |
| 8 | CONVERTED 후 추가 전환 → 409 (requireConvertible 화이트리스트) | 신규 추가 (G-2 해소) | |
| 9 | CONFIRMED+slipNo=null(PENDING_RETRY) → 409 (G-1 해소) | 신규 추가 | |
| 10 | 2라인 중 1라인 전량전환 → 주문 status DRAFT 유지 | 신규 추가 | markConvertedIfComplete 부분완료 검증 |

총 케이스: 11개 (5a/5b 분리 포함) — cycle1 대비 4 신규 추가.

---

## 3. @MockBean 및 Testcontainers 검증

**외부 client 격리 (feedback_it_mockbean_external_clients)**: 모두 충족.

| MockBean | lenient stub | 비고 |
|----------|-------------|------|
| EstimateClient | — | convert 흐름 미호출, @MockBean 선언만으로 충분 |
| DcConfigClient | lenient().when(fetchDcConfig).thenReturn(Map.of()) | OK |
| ProductClient | lenient().when(lookup).thenReturn(List.of()) | OK |
| InventoryClient | — | convert 흐름 미호출, @MockBean 선언만으로 충분 |
| SlipServiceClient | lenient().when(publishFromPartnerOrder).thenReturn(PublishResult.published(STUB_SLIP_NO)) | OK |
| PartnerAuthClient | — | @MockBean 선언만 |
| PartnerLookupClient | — | @MockBean 선언만 |
| ProductCatalogLookupClient | — | @MockBean 선언만 |
| DynamicPermissionClient | lenient().when(canView/canEdit/check).thenReturn(true) | OK |

**AbstractPostgresIT**: 싱글턴 컨테이너 패턴 유지. `@BeforeEach` 에서
`outboxRepository.deleteAll()` → `partner_order_lines DELETE` → `orderRepository.deleteAll()` FK 순서 준수. 케이스7에서 `Mockito.reset(slipServiceClient)` 후 재 stub 패턴 올바름.

---

## 4. skipped=0 (기존 IT 회귀)

변경 파일 목록에 `PartnerOrderConfirmServiceIT`, `HoldStatusFilterIT` 등 기존 IT 미포함.
`AbstractPostgresIT` 공유 컨테이너 구조 변경 없음.
`requireConvertible()` 은 convert 흐름 전용 신규 메서드 — confirm/hold 경로 미호출.
`markConvertedIfComplete()` 도 convert 흐름에서만 호출됨.
`PartnerOrderLine.convert()` 는 기존 confirm 흐름과 무관한 신규 도메인 메서드.

결론: 기존 confirm/hold IT 회귀 발생 조건 없음. skipped=0 예상.

---

## 5. 잔류 비차단 갭 목록

| ID | 심각도 | 설명 | 처리 계획 |
|----|--------|------|-----------|
| G-3 | P2 | slip-service SlipPublishControllerIT 에 `source_order_line_id` DB 컬럼 단언 없음 | 2.6c 슬라이스 또는 별도 slip-service IT PR |
| G-5 | Minor | 케이스5a PARTNER role 묵시적 deny — SALES+check false stub 로 재작성 미완 | 다음 슬라이스 테스트 품질 개선 |
| G-6 | Minor | SlipServiceClient 5xx → converted_quantity 롤백 트랜잭션 IT 없음 | 2.6b 이후 추가 권고 |
| inventory | scope | converted_quantity 에 대한 재고 연동(inventory-service 체크) | 2.6c 범위 |

---

## 6. 도메인 정합성 SQL (런타임 미실행, 설계 검증)

아래 SQL 은 실제 DB 기동 후 수동 또는 자동화 검증용.

```sql
-- converted_quantity <= quantity 불변식
SELECT id, quantity, converted_quantity
FROM partner_order_lines
WHERE converted_quantity > quantity AND is_deleted = FALSE;
-- 기대: 0 rows

-- CONVERTED 주문의 모든 활성 라인이 전량 전환됐는지
SELECT po.id, po.status, pol.quantity, pol.converted_quantity
FROM partner_orders po
JOIN partner_order_lines pol ON pol.partner_order_id = po.id
WHERE po.status = 'CONVERTED'
  AND pol.is_deleted = FALSE
  AND pol.converted_quantity < pol.quantity;
-- 기대: 0 rows

-- DRAFT/ON_HOLD 주문 중 slipNo 있는 주문이 convert 시도 가능한지 확인
SELECT id, status, slip_no
FROM partner_orders
WHERE status IN ('DRAFT', 'ON_HOLD') AND slip_no IS NOT NULL AND is_deleted = FALSE;
-- 기대: 0 rows (DRAFT/ON_HOLD 는 slipNo null 이어야 함)

-- converted_quantity CHECK constraint 유효성 (V8 migration)
-- converted_quantity >= 0 AND converted_quantity <= quantity
-- DB 레벨 constraint 확인:
SELECT conname, consrc FROM pg_constraint
WHERE conrelid = 'partner_order_lines'::regclass AND contype = 'c';
```

---

## 7. 결함 요약 (cycle2 최종)

| ID | 심각도 | cycle1 | cycle2 | 비고 |
|----|--------|--------|--------|------|
| G-1 | P1 | 미해소 | RESOLVED | requireConvertible 화이트리스트 + IT 케이스9 |
| G-2 | P2 | 미해소 | RESOLVED | IT 케이스8 추가 |
| G-3 | P2 | 비차단 | 비차단 유지 | slip-service IT 범위 |
| G-4 | P2 | 미해소 | RESOLVED | IT 케이스7 (누적 + 2키 상이) |
| G-5 | Minor | 비차단 | 비차단 잔류 | PARTNER role 묵시적 deny, 기능은 올바름 |
| G-6 | Minor | 비차단 | 비차단 유지 | 트랜잭션 순서 설계는 올바름 |
| G-7 | Minor | 미해소 | RESOLVED | 화이트리스트 방식으로 더 강건하게 해소 |
