# QA 리뷰 — Phase 2.5 주문 보류(ON_HOLD) + 상태 필터 (Cycle 2 재검토)

- **브랜치**: feat/phase-2-5-partner-order-hold-status-filter
- **HEAD**: 0f5c8728
- **검토일**: 2026-05-30
- **담당**: QA agent (claude-qa-cycle2)
- **대상**: cycle1 fix 커밋 (0f5c8728) cross-check
- **판정**: **QA APPROVE (cycle2)**

---

## cycle1 P1/P2 결함 해소 확인

### QA-2.5-01 — outbox cleanup 순서 누락 (P1, 비차단)

**cycle1 fix 내용**: `HoldStatusFilterIT.setUp()`에 `outboxRepository.deleteAll()`을 `partner_order_lines` DELETE 전에 선행 추가. `SlipPublishOutboxRepository`를 `@Autowired` 필드로 선언.

**cycle2 검증**:
- `setUp()` 순서: `outboxRepository.deleteAll()` → `DELETE FROM partner_order_lines` → `orderRepository.deleteAll()` 순서 확인. FK 제약(slip_publish_outbox.partner_order_id_fkey)을 정확히 역순으로 해소.
- `PartnerOrderListIT.setUp()`도 동일 패턴(`outboxRepository.deleteAll()` 선행)으로 일관됨.

**판정: 해소 완료.**

---

### QA-2.5-02 — CONFIRMING 상태 hold 409 케이스 누락 (P1, 비차단)

**cycle1 fix 내용**: `PartnerOrderHoldTest.markOnHold_fromConfirming_throws409()` 추가. `ReflectionTestUtils.setField(o, "status", PartnerOrderStatus.CONFIRMING)` 후 `o.markOnHold()` 호출 → `ResponseStatusException` + "409" 단언.

**cycle2 검증**:
- 단위 테스트 5케이스로 완성: DRAFT→ON_HOLD, CONFIRMED→409, CONFIRMING→409, ON_HOLD→DRAFT, DRAFT-release→409.
- 도메인 메서드 `markOnHold()` 조건: `this.status != DRAFT`이면 409이므로 CONFIRMING도 정확히 포함됨. false-green 없음.
- IT 레벨 케이스(buildOrderWithStatusViaDb(..., "CONFIRMING") + POST /{id}/hold → 409)는 추가되지 않았으나, 단위 테스트에서 도메인 메서드 직접 검증이 완료되어 IT 중복 추가 불필요.

**판정: 단위 테스트 레벨에서 해소 완료. IT 추가는 중복이므로 비요구.**

---

### QA-2.5-03 — dateFrom/dateTo + status=DRAFT 기간필터 IT 미커버 (P2)

**cycle1 fix 내용**: `HoldStatusFilterIT` 케이스9(`case9_draftDateFilter_createdAtCoalesceReturnsOneRow`) 추가. `buildOrderWithStatusViaDbAt()` 헬퍼 신규 작성.

**cycle2 검증 — COALESCE IT 실효성 분석**:

1. **케이스9 데이터 설계**: 2건 삽입 — `"2026-05-01 00:00:00"` (기간 밖), `"2026-05-30 00:00:00"` (기간 내). 쿼리 `dateFrom=2026-05-30&dateTo=2026-05-30` + `status=DRAFT`. 단언 `totalElements=1` + `content[0].status=DRAFT`.
2. **COALESCE 경로 통과 여부**: 두 DRAFT 주문의 `confirmedAt=NULL`이므로 `COALESCE(confirmedAt, createdAt) = createdAt`. `createdAt`이 `CAST(? AS TIMESTAMP)`로 정확히 주입되어 두 row의 날짜 차이가 의미 있음. 1건 필터는 COALESCE fallback 경로가 실제로 동작해야만 통과 가능 — **false-green 없음**.
3. **CAST(? AS TIMESTAMP) 신뢰성**: PostgreSQL `CAST('2026-05-01 00:00:00' AS TIMESTAMP)`는 `LocalDateTime`과 1:1 대응. `JdbcTemplate.update(sql, ..., createdAtSql)`에서 String 파라미터가 JDBC에 의해 자동 `CAST(? AS TIMESTAMP)` 컬럼 타입으로 변환된다. Testcontainers postgres:16-alpine에서 동일하게 동작.
4. **케이스9 단점**: `dateTo=2026-05-30`에서 exclusiveTo는 `2026-05-31 00:00:00`. `createdAt=2026-05-30 00:00:00`인 row는 `>= 2026-05-30 00:00:00` AND `< 2026-05-31 00:00:00` 조건을 만족 → 정확히 1건. 날짜 경계 논리 정합.

**판정: 해소 완료. 실효성 있는 케이스.**

---

### QA-2.5-04 — ON_HOLD 주문 복원 교차 검증 없음 (P2)

**cycle1 fix 내용**: 이 갭은 cycle1 fix에서 수정되지 않았음. Phase 2.4 `PartnerOrderRevisionRestoreIT`에 ON_HOLD 복원 케이스가 추가되지 않음.

**cycle2 재분류 검증**:
- `requireRestorable()` 메서드: `if (this.status == CONFIRMING || this.status == CANCELED)` 제외목록 방식. ON_HOLD는 명시적으로 포함되지 않으므로 복원 허용됨.
- Javadoc 명시: "추후 ON_HOLD 추가 시 이 가드 수정 불필요 (허용 기본)"
- 이 동작이 IT에서 교차 검증되지 않은 것은 사실이나, 도메인 메서드의 제외목록 방식이 명시적으로 ON_HOLD 허용임을 보장.

**잔여 비차단 갭으로 유지. 차기 슬라이스(or Phase 2.4 후속 PR)에서 보완 권고.**

---

### QA-2.5-05 — MASTER bypass never-called 단언 없음 (Minor)

**cycle1 fix 내용**: 수정되지 않음.

**cycle2 재분류**: Minor 수준 유지. 케이스8b는 `@WithMockUser(roles={"MASTER"})` + 헤더 `X-User-Role: MASTER` 조합으로 실제 bypass를 검증하고 있으며, 응답 200 + `status=ON_HOLD` 단언이 기능적으로 충분함. `verify(never())` 단언 부재는 내부 구현 결합도를 높이므로 반드시 추가할 필요 없음.

**판정: 비차단 Minor 유지. 차기 슬라이스 반영 불필요.**

---

### QA-2.5-06 — mock.ts hold/release 응답 PartnerOrderDetail 계약 불일치 (Minor)

**cycle1 fix 내용**: 수정되지 않음. 단, cycle1 fix에서 `PartnerOrderDetail` 타입 확인 완료.

**cycle2 검증**:
- `PartnerOrderDetail`은 `PartnerOrderSummary`를 extends. 필드: `bizCode, updatedAt, deliveryAddress, siteAddress, contactPhone, dueDate, memo, lines[]`.
- `revisionCount` 필드는 `PartnerOrderDetail` 인터페이스에 없음. mock.ts hold/release 응답에도 없음 → 계약 일치.
- `PartnerOrderDetailResponse.from(order)`가 revisionCount를 반환하더라도 FE 타입에 없으면 무시됨. 실제 FE `PartnerOrderDetail` 타입에 revisionCount 없으므로 불일치 없음.

**판정: 해소 확인. Minor 결함 QA-2.5-06 소멸.**

---

## 1. COALESCE IT 실효성 심층 검토

### 케이스9 (createdAt 기간필터)

위 QA-2.5-03 항목에서 상세 분석. 핵심 포인트:
- DRAFT의 `confirmedAt=NULL` → COALESCE fallback → createdAt 기준 필터
- JDBC 직접 INSERT에서 `CAST(? AS TIMESTAMP)` 방식으로 createdAt 정확 제어
- 2건 삽입 후 1건 단언 → 범위 외 row가 실제로 제외됨을 검증

### 케이스10 (DRAFT + CONFIRMED 혼재 전체조회)

- DRAFT row: `buildOrderWithStatusViaDb`(confirmedAt=NULL 주입) → COALESCE → createdAt
- CONFIRMED row: `buildOrderWithStatusViaDb`(confirmedAt=NULL 주입됨) — **분석 필요**

**중요 발견**: `buildOrderWithStatusViaDb`의 INSERT SQL에서 `confirmed_at=NULL`로 모든 row를 삽입한다. CONFIRMED 상태의 row도 `confirmedAt=NULL`이므로 COALESCE → createdAt이 적용된다.

실제 운영에서는 CONFIRMED row의 `confirmedAt`이 채워져 있어야 한다. 그러나 케이스10의 목적은 "전체조회 시 DRAFT row가 결과에 포함되는가"를 검증하는 것이므로, CONFIRMED row의 confirmedAt 실제값 여부는 totalElements=2 단언에 영향을 주지 않는다.

따라서 케이스10은 "preConfirm=false 시 DRAFT 제외" 기존 버그의 해소를 검증하는 용도로 적합하며, CONFIRMED의 confirmedAt 실제값 사용 경로는 기존 `PartnerOrderListIT.list_filters_by_date_range()`에서 검증됨.

**판정: 케이스10 실효성 있음. COALESCE 정렬 구현(`query.orderBy(cb.desc(cb.coalesce(...)))`)도 count 쿼리 가드(`resultType != Long.class`) 포함하여 올바름.**

---

## 2. skipped=0 / Testcontainers 실행 가능성

### AbstractPostgresIT 상속 확인

- `HoldStatusFilterIT extends AbstractPostgresIT` — `@ExtendWith(DockerAvailableCondition.class)` 적용
- Docker 가용 시: 싱글턴 Postgres 16-alpine 컨테이너 기동, Flyway 마이그레이션 실행, 10 케이스 모두 실행
- Docker 미가용(Windows + Docker Desktop npipe 한계): 자동 skip. DOCKER_HOST=tcp://localhost:2375 우회 권장

### 케이스 수 확인

| # | 메서드 | 상태 |
|---|---|---|
| 1 | case1_holdDraftOrder_returns200AndStatusOnHold | 존재 |
| 2 | case2_releaseOnHoldOrder_returns200AndStatusDraft | 존재 |
| 3 | case3_holdConfirmedOrder_returns409 | 존재 |
| 4 | case4_releaseDraftOrder_returns409 | 존재 |
| 5 | case5_listStatusDraftFilter_returnsDraftOnly | 존재 |
| 6 | case6_listStatusOnHoldFilter_returnsOnHoldOnly | 존재 |
| 7 | case7_listStatusConfirmedFilter_returnsConfirmedOnly | 존재 |
| 8a | case8a_partnerRoleHold_returns403 | 존재 |
| 8b | case8b_masterRoleHold_returns200 | 존재 |
| 9 | case9_draftDateFilter_createdAtCoalesceReturnsOneRow | 존재 (cycle1 신규) |
| 10 | case10_allStatusQuery_includesDraftAndConfirmed | 존재 (cycle1 신규) |

총 11 메서드 (@Test 기준). Javadoc에 "10 PASS skipped=0" 명시 (케이스8이 8a/8b 2개이므로 실제 11). skipped=0 의도 확인.

**판정: Docker 가용 시 11 케이스 skipped=0 보장.**

---

## 3. 비차단 갭 — cycle2 최종 분류

| ID | 심각도 | 위치 | 설명 | 상태 |
|---|---|---|---|---|
| QA-2.5-01 | P1 | HoldStatusFilterIT.setUp() | outbox cleanup 선행 누락 | **해소 (cycle1 fix)** |
| QA-2.5-02 | P1 | PartnerOrderHoldTest | CONFIRMING hold 409 단위 테스트 누락 | **해소 (cycle1 fix)** |
| QA-2.5-03 | P2 | HoldStatusFilterIT 케이스9 | DRAFT 기간필터 createdAt COALESCE 경로 IT 미커버 | **해소 (cycle1 fix)** |
| QA-2.5-04 | P2 | PartnerOrderRevisionRestoreIT | ON_HOLD 복원 교차 검증 없음 | **잔여 비차단 — 차기 슬라이스** |
| QA-2.5-05 | Minor | 케이스8b | MASTER bypass verify(never()) 단언 없음 | **잔여 Minor — 반영 불필요** |
| QA-2.5-06 | Minor | mock.ts | PartnerOrderDetail revisionCount 불일치 우려 | **소멸 (revisionCount FE 타입 없음 확인)** |

---

## 4. Playwright 라벨 단언 보강 확인

**cycle1 QA 지적**: cycle1 spec에서 라벨 단언이 "Minor" 수준으로 분류.

**cycle2 검증**:
- 시나리오 1: `toContainText('진행중')` + `not.toContainText('보류')` — 양방향 단언
- 시나리오 2: `toContainText('완료')` + `not.toContainText('진행중')` — 양방향 단언
- 시나리오 3: `toContainText('보류')` + `not.toContainText('진행중')` — 양방향 단언
- 시나리오 6: 세 필터를 순차 전환하며 3종 라벨 단언(각각 양방향)

**cycle1 대비 spec 변경 없음**: cycle1 fix에서 Playwright spec을 수정하지 않았으나, cycle1 원본 spec이 이미 양방향 단언(positive + negative)을 포함하고 있어 라벨 결함 검증에 충분.

`PARTNER_ORDER_STATUS_LABEL` 매핑: `CONFIRMING: '확인중'`으로 cycle1 fix에서 "확정 처리중" → "확인중" 변경. `PRE_CONFIRM_STATUSES` tooltip 힌트("진행중·보류·확인중")와 일치.

**판정: 라벨 단언 적정 수준. 추가 보강 불필요.**

---

## 5. 회귀 검증 — COALESCE 변경 + 기존 IT

### PartnerOrderListIT 회귀

`list_filters_by_date_range()`:
- 3개 주문 생성: CONFIRMED(2026/05/01), CONFIRMING(2026/05/03), CANCELED(2026/05/05)
- `PartnerOrder.create()`의 private 생성자: `this.confirmedAt = LocalDateTime.now()` — 생성 즉시 채워짐
- `saveOrder()` 헬퍼에서 `setConfirmedAt(order, LocalDate.parse(orderNo.substring(0,10)).atTime(10,0))`로 reflection 세팅
- COALESCE(confirmedAt=2026-05-03, createdAt) → confirmedAt 우선. 기존 테스트의 `confirmedAt` 기준이 COALESCE에서도 유지됨
- `dateFrom=2026-05-02&dateTo=2026-05-04` → 2026/05/03-1 1건 단언 통과
- CANCELED(2026/05/05)는 범위 밖. CONFIRMED(2026/05/01)도 범위 밖.

**판정: 기존 PartnerOrderListIT 회귀 없음. COALESCE 변경이 confirmedAt이 채워진 row에서는 동일 결과.**

### PartnerOrderConfirmServiceIT, PartnerOrderUpdateIT, PartnerOrderDeleteIT, PartnerOrderFromEstimateIT

- 이들 IT는 날짜 기간 필터를 사용하지 않거나 list endpoint를 호출하지 않음. COALESCE 변경 영향 없음.
- ON_HOLD enum 추가: switch 문 없이 제외목록(`CONFIRMING`, `CANCELED`) 방식 가드만 사용 → 기존 IT 컴파일/런타임 영향 없음.

**판정: 기존 IT 회귀 없음.**

### PartnerOrderListIT.saveOrder() — CONFIRMING 상태 해석 주의사항

`saveOrder()`에서 "CONFIRMED" 입력 시 `markSlipPendingRetry()`를 호출하는데, 이는 `status=CONFIRMED`로 전이하지만 `slipPublishStatus=PENDING_RETRY`를 유지한다. 또한 `confirmedAt`은 생성자에서 `LocalDateTime.now()`로 이미 채워진 후 reflection으로 override한다. 이 패턴은 Phase 2.5 COALESCE fix와 무관하게 기존과 동일하게 동작.

---

## 6. cycle1 FE fix 추가 검증

### isPending disabled 가드

`holdMutation.isPending` 조건 `disabled` 추가(L328), `releaseMutation.isPending` 조건 `disabled` 추가(L342). 중복 클릭 방지. Playwright spec에 중복 클릭 시나리오는 없으나, 기능 결함이 아닌 UX 보호이므로 spec 부재는 비차단.

### onError 403 처리

hold/release 양쪽에 `error.response?.status === 403` 분기 추가 → `holdErrorMessage` 세팅. Playwright spec에 403 시나리오는 없으나, mock.ts에 403 분기가 없어 E2E 검증 불가(모든 mock 요청은 200 또는 409 반환). 기능 구현은 완료, spec 커버 부재는 Minor.

### 버튼 순서 재배치 (수정 버튼 위치)

cycle1 fix에서 "수정" 버튼이 액션 영역 상단으로 이동(`partner-order-edit-open`). Playwright spec 내 `partner-order-edit-open` testid를 사용하는 시나리오가 없으므로 spec 영향 없음.

---

## 최종 판정

**QA APPROVE (cycle2)**

cycle1 P1 결함 2건(QA-2.5-01 outbox cleanup, QA-2.5-02 CONFIRMING 409)과 P2 결함 1건(QA-2.5-03 COALESCE IT 미커버) 모두 해소 확인. P2 결함 1건(QA-2.5-04 ON_HOLD 복원 교차 검증)은 잔여 비차단으로 차기 슬라이스 보완.

신규 결함 없음. COALESCE IT(케이스9/10) 실효성 확인, JDBC createdAt 조작 신뢰성 확인, 기존 IT 회귀 없음.

---

## 잔여 비차단 (차기 슬라이스)

| ID | 내용 | 권고 슬라이스 |
|---|---|---|
| QA-2.5-04 | ON_HOLD 주문 복원 — PartnerOrderRevisionRestoreIT 교차 케이스 | Phase 2.6 또는 ON_HOLD 관련 다음 기능 PR |
| - | Playwright 403 시나리오 — mock.ts에 mockHold403 분기 + spec 케이스 추가 | 권한 체계 정리 PR |
