# QA 리뷰 — Phase 2.5 주문 보류(ON_HOLD) + 상태 필터

- **브랜치**: feat/phase-2-5-partner-order-hold-status-filter
- **HEAD**: f8a3c211
- **검토일**: 2026-05-30
- **담당**: QA agent (claude-qa-cycle1)
- **판정**: **조건부 APPROVE — P1 결함 1건, P2 결함 2건 (차단 없음)**

---

## 검토 대상

| 파일 | 역할 |
|---|---|
| `HoldStatusFilterIT.java` | BE 통합 테스트 (Testcontainers Postgres 16-alpine) |
| `PartnerOrderHoldTest.java` | 도메인 단위 테스트 |
| `phase-2-5-partner-order-hold.spec.ts` | Playwright E2E (mock.ts Phase 2.5 블록) |
| `PartnerOrder.java` | 도메인 메서드 `markOnHold` / `releaseHold` |
| `PartnerOrderStatus.java` | ON_HOLD enum 추가 |
| `PartnerOrderHoldService.java` | hold / release 트랜잭션 서비스 |
| `PartnerOrderHoldController.java` | POST /{id}/hold + POST /{id}/release |
| `PartnerOrderQueryService.java` | list spec — DRAFT/ON_HOLD createdAt 기간필터 보정 |
| `mock.ts` | Phase 2.5 status 분기 + hold/release mock |
| `SalesPartnerOrderDetailPage.tsx` | 보류/해제 버튼 + holdErrorMessage 배너 |
| `SalesPartnerOrderListPage.tsx` | 상태 필터 드롭다운 기본값 DRAFT |

---

## 1. 점검 — 커버리지

### 1-1. IT 케이스 목록 vs 요구사항

| 케이스 | IT 파일 검증 여부 | 단위 테스트 | 판정 |
|---|---|---|---|
| DRAFT → hold → ON_HOLD (200 + DB) | 케이스1 O | O | OK |
| ON_HOLD → release → DRAFT (200 + DB) | 케이스2 O | O | OK |
| CONFIRMED → hold → 409 | 케이스3 O | O | OK |
| DRAFT → release → 409 | 케이스4 O | O | OK |
| list status=DRAFT 필터 | 케이스5 O | - | OK |
| list status=ON_HOLD 필터 | 케이스6 O | - | OK |
| list status=CONFIRMED 필터 | 케이스7 O | - | OK |
| PARTNER 권한 deny → 403 | 케이스8a O | - | OK |
| MASTER bypass → 200 | 케이스8b O | - | OK |

### 1-2. 누락 케이스 (비차단)

**[P1] CONFIRMING 상태 → hold 409 케이스 누락**

`markOnHold()` 도메인 메서드는 `this.status != DRAFT` 이면 무조건 409를 던진다.
CONFIRMED 는 IT 케이스3에서 검증되지만, CONFIRMING (출고전표 전환 중 transient 상태) 에 대한
hold 시도가 IT와 단위 테스트 모두에 없다.

CONFIRMING 중 보류 시도는 실제 운영에서 발생 가능한 race condition 시나리오로,
409를 반환해야 한다는 요건이 도메인 Javadoc ("DRAFT 가 아니면 409") 에 명시되어 있다.

단위 테스트에서는 CONFIRMED 만 검증하고 CONFIRMING 케이스가 없다. IT에서도 동일 누락.

권고: `PartnerOrderHoldTest.java` 에 `markOnHold_fromConfirming_throws409()` 추가.
IT는 `buildOrderWithStatusViaDb(..., "CONFIRMING")` 헬퍼가 이미 가능하므로
케이스3 변형으로 추가 가능.

**[P2] ON_HOLD 주문 → confirm 시도 (409 또는 정책 정의) 케이스 없음**

`PartnerOrderConfirmController` 가 ON_HOLD 주문에 confirm POST를 받을 때 어떻게
처리하는지 이번 IT/단위 테스트에 포함되지 않았다.
confirm 흐름은 CONFIRMING 전이이므로 ON_HOLD 시 409 또는 명시적 정책이 필요하다.
현재 confirm 서비스가 ON_HOLD 상태를 별도 차단하는지 미확인 — 이번 슬라이스 범위 외이나
Phase 2.4 연계 회귀 위험.

권고: 다음 슬라이스에서 `PartnerOrderConfirmServiceIT` 에 ON_HOLD 입력 → 결과 검증 추가.

**[P2] ON_HOLD 주문 복원 (Phase 2.4 연계) — `requireRestorable()` ON_HOLD 통과 확인**

`requireRestorable()` Javadoc에 "추후 ON_HOLD 추가 시 이 가드 수정 불필요 (허용 기본)" 라고
명시되어 있고, CONFIRMING/CANCELED 만 제외목록에 있다. 따라서 ON_HOLD 주문 복원은
현재 코드 기준으로는 허용된다.

그러나 이 동작이 HoldStatusFilterIT 또는 PartnerOrderRevisionRestoreIT 에서 교차 검증되지 않았다.
복원 후 status가 유지(ON_HOLD → 복원 후에도 ON_HOLD 유지)되는지,
아니면 다른 상태로 변경되는지 단언이 없다.

권고: `PartnerOrderRevisionRestoreIT`에 `ON_HOLD` 주문 복원 케이스 추가 (비차단).

---

## 2. 점검 — list 필터 IT 정확도

### 2-1. status별 정확 반환 검증

케이스 5/6/7은 각각 DRAFT 1건, ON_HOLD 1건, CONFIRMED 1건을 `buildOrderWithStatusViaDb`로
직접 INSERT하고 `?status=DRAFT/ON_HOLD/CONFIRMED` 쿼리로 `totalElements=1` + `content[0].status`를
단언한다. 정확한 단항목 격리 검증으로 status 필터 정합 확인됨.

### 2-2. createdAt 정렬 — IT 보정 여부

`PartnerOrderListController`는 `Sort.by(Sort.Direction.DESC, "createdAt")` 고정.
HoldStatusFilterIT의 단일 row 케이스에서는 정렬 순서가 유의미하지 않아
다중 row 정렬 검증은 없다. 그러나 DRAFT/ON_HOLD 필터 시 `createdAt` 기준 정렬은
`buildOrderWithStatusViaDb`가 `NOW()`로 삽입하므로 단일 row 케이스에서 통과.

정렬 검증 누락은 기존 `PartnerOrderListIT`도 동일 한계이며, 본 슬라이스 범위 내에서
단위 IT 커버로 수용 가능.

### 2-3. 기간 필터 DRAFT/ON_HOLD createdAt 분기 검증

`PartnerOrderQueryService.toSpec()`의 `preConfirm` 분기는 구현상 올바르다.
DRAFT/ON_HOLD → `createdAt` 기준, 나머지 → `confirmedAt` 기준.

그러나 HoldStatusFilterIT에는 `dateFrom/dateTo` + `status=DRAFT` 또는 `status=ON_HOLD` 조합
쿼리가 없다. 기존 `PartnerOrderListIT.list_filters_by_date_range()`는 `confirmedAt` 기준(CONFIRMED)만
검증하며 DRAFT/ON_HOLD createdAt 분기는 이번 슬라이스 신규 코드임에도 IT 커버 부재.

**[P1] 비차단이지만 신규 코드 경로 IT 미커버**

권고: HoldStatusFilterIT에 `dateFrom/dateTo + status=DRAFT` 조합 케이스 1건 추가.
```
buildDraftOrderViaDb("P-DATE-DRAFT", "9111111111", "2026/05/31-DATE");
GET /api/v1/partner-orders?status=DRAFT&dateFrom=2026-05-31&dateTo=2026-05-31
→ totalElements=1
```

---

## 3. 점검 — 권한 IT

### 3-1. DynamicPermissionClient 7-action stub 완전성

`setUp()`에서 3개 메서드를 lenient stub한다:
- `canView(anyString, anyString)` → true
- `canEdit(anyString, anyString)` → true
- `check(any(UUID), anyString, any(PermissionAction))` → true

`DynamicPermissionClient` 인터페이스는 3개 메서드(`check`, `bulkLoad`, `canView`, `canEdit`)를 선언한다.
`bulkLoad`는 default 구현(빈 Map 반환)이 있으므로 lenient stub 없이도 NPE 없이 동작.
실제 PermissionAspect는 account 모드에서 `check()` 만 호출하며,
케이스8a/8b는 이를 정확히 stub/override한다.

**판정: false-green 위험 없음.** `check()`에 대한 lenient default(true) + 케이스8a에서
`when(...).thenReturn(false)` 명시 override 패턴이 정확하다.

### 3-2. MASTER bypass 로직 검증

케이스8b에서 `@WithMockUser(roles={"MASTER"})` + `X-User-Role: MASTER` 헤더 전달.
`PermissionAspect.isMasterBypass()`는 `"MASTER".equalsIgnoreCase(roleCode)` 시 즉시 통과.
따라서 `DynamicPermissionClient.check()`가 실제로 호출되지 않으며,
lenient stub의 반환값 자체는 결과에 무관하다.

케이스8b의 lenient stub 설정은 불필요하지만 해롭지 않다. MASTER bypass가 실제로
check()를 건너뜀을 검증하려면 `verify(dynamicPermissionClient, never()).check(...)` 단언이
필요하나 현재 없다.

**판정: [Minor] 기능적으로는 정상. MASTER가 check()를 우회한다는 명시 단언 없음.**

### 3-3. X-User-Id UUID 파싱

IT 헬퍼 상수값 `MASTER_ACCOUNT_ID`, `SALES_ACCOUNT_ID`, `PARTNER_ACCOUNT_ID`가 모두
유효한 UUID 형식이다. `PermissionAspect.parseAccountId()`는 UUID.fromString()을 사용하므로
파싱 실패 위험 없음.

---

## 4. 점검 — skipped=0 / Testcontainers 실행

### 4-1. AbstractPostgresIT 상속 및 skip 조건

`HoldStatusFilterIT`는 `AbstractPostgresIT`를 상속하고 `DockerAvailableCondition`을
`@ExtendWith`로 적용한다. Docker 미가용 시 `ConditionEvaluationResult.disabled()`를 반환하여
테스트가 skip (not fail) 처리된다.

`POSTGRES` 싱글턴 컨테이너는 static 블록에서 기동하며, 동일 JVM 내 다른 IT
(`PartnerOrderListIT` 등)와 컨테이너를 공유한다. Flyway는 `spring.flyway.enabled=true`로
활성화되어 있다.

**판정: Docker 가용 시 skipped=0 보장. Windows + Docker Desktop 환경에서는 DOCKER_HOST=tcp://localhost:2375 우회 권장 (기존 메모리 가드 동일).**

### 4-2. BeforeEach cleanup 순서

```java
jdbcTemplate.update("DELETE FROM partner_order_lines");
orderRepository.deleteAll();
```

`PartnerOrderRevisionRestoreIT`와 달리 `SlipPublishOutboxRepository.deleteAll()`이 없다.
FK: `slip_publish_outbox.partner_order_id_fkey` — `HoldStatusFilterIT`에서 outbox row가
삽입되지 않으므로 현재는 안전하다. 다만 다른 IT가 같은 컨테이너에서 outbox row를
남긴 경우, `orderRepository.deleteAll()`이 FK 위반으로 실패할 수 있다.

**판정: [P1 수준 위험] 다른 IT와 순서 의존성 존재. PartnerOrderListIT처럼
`outboxRepository.deleteAll()` 선행 추가 권고.**

단, 싱글턴 컨테이너는 각 `@SpringBootTest` 클래스가 별도 Spring 컨텍스트를 가지지 않고
공유 가능성이 있으나, partner-order-service는 클래스별 분리 컨텍스트를 사용한다.
Testcontainers 싱글턴 패턴상 같은 컨테이너 DB를 공유하므로 이전 IT가 outbox row를
남기면 `partner_orders` DELETE가 FK 위반으로 실패한다.

---

## 5. 점검 — Playwright testid 정합 + mock 계약

### 5-1. testid 매핑

| testid | 구현 (`SalesPartnerOrderDetailPage.tsx`) | spec 단언 | 판정 |
|---|---|---|---|
| `partner-order-list-status-filter` | `data-testid="partner-order-list-status-filter"` (ListPage L127) | O | 정합 |
| `partner-order-hold` | `data-testid="partner-order-hold"` (DetailPage L302) | O | 정합 |
| `partner-order-release` | `data-testid="partner-order-release"` (DetailPage L316) | O | 정합 |
| `partner-order-hold-error` | `data-testid="partner-order-hold-error"` (DetailPage L363) | O | 정합 |

### 5-2. mock.ts Phase 2.5 분기 BE 계약 일치 여부

| mock 항목 | BE 계약 | 일치 |
|---|---|---|
| `GET /api/v1/partner-orders?status=DRAFT` → DRAFT row 1건 | `PartnerOrderListController` 동일 경로 | O |
| `GET /api/v1/partner-orders?status=ON_HOLD` → ON_HOLD row 1건 | 동일 | O |
| `POST /{id}/hold` → status=ON_HOLD 응답 | `PartnerOrderHoldController` POST /{id}/hold → `PartnerOrderDetailResponse` | O |
| `POST /{id}/release` → status=DRAFT 응답 | 동일 | O |
| 409 응답 형식 `mockError(409, code, message)` | `ResponseStatusException(HttpStatus.CONFLICT, ...)` 변환 결과 | O (구조 일치) |
| `mockHold409` 쿼리 파라미터 분기 | spec 시나리오7에서 URL에 `&mockHold409=1` 사용 | O |
| `mockRelease409` 쿼리 파라미터 분기 | spec 시나리오8에서 URL에 `&mockRelease409=1` 사용 | O |

### 5-3. 라벨 한글 단언 정합

| 상태 | `PARTNER_ORDER_STATUS_LABEL` 값 | spec 단언 | 판정 |
|---|---|---|---|
| DRAFT | `'진행중'` | `toContainText('진행중')` | 정합 |
| ON_HOLD | `'보류'` | `toContainText('보류')` | 정합 |
| CONFIRMED | `'완료'` | `toContainText('완료')` | 정합 |

### 5-4. 보류 버튼 조건부 렌더 검증

- `query.data.status === 'DRAFT'` → `partner-order-hold` 렌더 (L298)
- `query.data.status === 'ON_HOLD'` → `partner-order-release` 렌더 (L312)
- 성공 후 `queryClient.setQueryData`로 로컬 캐시 즉시 갱신 → 버튼 전환 (refetch 불필요)

spec 시나리오 4/5가 이 전환을 단언한다. mock.ts hold 응답이 `status: 'ON_HOLD'`를 반환하므로
setQueryData → 리렌더 → `partner-order-release` 표시 경로가 올바르다.

**[Minor] mock.ts의 hold/release 응답에 `revisionCount` 필드가 없다.**
`PartnerOrderDetailResponse.from(order)`가 revisionCount를 포함하는지 확인 필요.
FE `PartnerOrderDetail` 타입에 revisionCount가 없으면 무관하나, 있다면 mock 계약 불일치.
현재 FE sales.ts `PartnerOrderDetail`에 `revisionCount` 필드가 없음을 확인하지 못했으므로
확인 권고.

---

## 6. 점검 — 회귀

### 6-1. ON_HOLD enum 추가로 인한 기존 IT 영향

`PartnerOrderStatus` enum에 ON_HOLD가 추가되었다. 기존 IT들이 switch 또는 exhaustive enum 패턴을
사용한다면 컴파일 에러 또는 런타임 경고 가능. 검토 결과:

- `PartnerOrderListIT.saveOrder()`: CANCELED/CONFIRMED/CONFIRMING만 처리, switch 미사용 → 안전
- `PartnerOrderDeleteIT`: `PartnerOrderStatus.CANCELED.name()` 직접 참조 → 안전
- `PartnerOrderRevisionRestoreIT`: `requireRestorable()` 가드가 CONFIRMING/CANCELED 제외목록 방식 → ON_HOLD 추가 시 자동 허용 → 설계서 명시 동작, 안전

**판정: 기존 IT 회귀 위험 없음.**

### 6-2. list 기간 필터 보정 회귀

기존 `PartnerOrderListIT.list_filters_by_date_range()`는 CONFIRMED 상태 주문의
`confirmedAt`을 reflection으로 세팅하여 기간 필터를 검증한다.
Phase 2.5에서 `preConfirm` 분기가 추가되었으나 CONFIRMED → `confirmedAt` 분기는 유지.
기존 테스트는 status 파라미터 없이 호출하므로 `preConfirm=false`(confirmedAt 기준) 경로를
탄다. 변경 없이 통과.

**판정: list 기간 필터 회귀 없음.**

### 6-3. PartnerOrderHoldController URL 충돌 검증

`PartnerOrderHoldController`는 `/api/v1/partner-orders` base 경로 하에 `/{id}/hold`, `/{id}/release`
POST를 선언한다. 기존 controller들(`PartnerOrderListController`, `PartnerOrderConfirmController` 등)과
경로 충돌 여부를 확인한다.

`PartnerOrderListController`의 GET `/` 및 GET `/{id}`와 HTTP method가 다르므로 충돌 없음.
`POST /{id}` 경로는 다른 controller에 없음.

**판정: URL 충돌 없음.**

---

## 결함 요약

| ID | 심각도 | 위치 | 설명 | 차단 여부 |
|---|---|---|---|---|
| QA-2.5-01 | P1 | `HoldStatusFilterIT.java` | `DELETE FROM partner_order_lines` 전에 `outboxRepository.deleteAll()` 누락 — 다른 IT가 outbox row를 남긴 경우 FK 위반 가능 | 비차단 (단독 실행 시 안전, 순서 의존성) |
| QA-2.5-02 | P1 | `HoldStatusFilterIT.java` + `PartnerOrderHoldTest.java` | CONFIRMING 상태 → markOnHold() 409 케이스 IT/단위 테스트 누락 | 비차단 |
| QA-2.5-03 | P2 | `HoldStatusFilterIT.java` | `dateFrom/dateTo + status=DRAFT` createdAt 분기 신규 코드 경로 IT 미커버 | 비차단 |
| QA-2.5-04 | P2 | `HoldStatusFilterIT.java` | ON_HOLD 주문 복원 (Phase 2.4 연계) IT 교차 검증 없음 | 비차단 |
| QA-2.5-05 | Minor | `HoldStatusFilterIT.java` 케이스8b | MASTER bypass 시 `check()` never-called 단언 없음 | 비차단 |
| QA-2.5-06 | Minor | `mock.ts` hold/release 응답 | BE `PartnerOrderDetailResponse` 필드와의 완전 계약 일치 여부 미확인 (revisionCount 등) | 비차단 |

---

## 강점 (승인 근거)

1. **@MockBean 완전 격리**: EstimateClient, DcConfigClient, ProductClient, InventoryClient, SlipServiceClient, PartnerAuthClient, PartnerLookupClient, ProductCatalogLookupClient, DynamicPermissionClient 9종 전부 @MockBean + lenient stub. `feedback_it_mockbean_external_clients` 가드 완전 준수.

2. **DB 단언 포함**: 케이스1/2에서 HTTP 응답 단언 외에 `jdbcTemplate.queryForObject`로 DB 상태를 직접 확인. 도메인 전이 후 영속화까지 검증.

3. **도메인 메서드 분리**: `markOnHold()`/`releaseHold()`가 도메인 계층에 캡슐화되어 있고, 단위 테스트가 `ReflectionTestUtils.setField`로 status 세팅 후 409 경로까지 검증.

4. **MASTER bypass 실제 동작 검증**: PermissionAspect의 `isMasterBypass()` 로직이 `"MASTER".equalsIgnoreCase(roleCode)` 시 즉시 통과하므로, 케이스8b는 실제 bypass를 검증.

5. **Playwright 8개 시나리오**: 목록 필터 3종 + 상세 hold/release + 오류 배너 2종 + 한국어 라벨 — 사용자 가시 경로 완전 커버.

6. **createdAt 기간 필터 분기**: `PartnerOrderQueryService.toSpec()`의 DRAFT/ON_HOLD → createdAt 보정이 신규 코드로 올바르게 구현됨. ON_HOLD 추가로 인한 누락 없음.

7. **회귀 안전**: ON_HOLD enum 추가가 기존 switch 패턴 없이 제외목록 방식 가드와 결합되어 기존 IT 컴파일/런타임 영향 없음.

---

## 판정

**조건부 APPROVE**

P0 결함 없음. P1 결함 2건(outbox cleanup 누락, CONFIRMING hold 케이스 누락)과 P2 결함 2건은 모두 비차단이며 차기 사이클 또는 별도 PR에서 보완 가능. 현재 구현은 Phase 2.5 요구사항(hold/release + status 필터)의 핵심 경로를 IT + 단위 + Playwright 3계층으로 검증하고 있으며, @MockBean 격리와 DB 단언이 완비되어 있다.
