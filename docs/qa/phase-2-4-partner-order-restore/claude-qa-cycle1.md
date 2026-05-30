# Phase 2.4 Partner-Order RESTORE — QA 리뷰 Cycle 1

**브랜치**: `feat/phase-2-4-partner-order-restore` (HEAD `9d3bcfd4`)
**작성일**: 2026-05-30
**리뷰어**: Claude QA Agent
**리뷰 범위**: 코드 수정 없음, 커버리지/시나리오 정적 분석만 수행

---

## 요약 판정

**QA CONDITIONAL APPROVE** — P0 결함 없음. P1 2건, P2 3건, Minor 3건 발견.
P1 결함 2건은 차기 사이클(cycle2) 전 BE 수정 권장.

---

## 결함 목록

### [P1] IT 케이스2 — `rev1LineCount` 단언 오류 (false-green 위험)

**위치**: `PartnerOrderRevisionRestoreIT.java:284~287`

```java
int rev1LineCount = revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId)
        .stream().filter(r -> r.getRevisionNo() == 1).findFirst()
        .map(r -> r.getRevisionNo()).orElseThrow();
assertThat(rev1LineCount).isEqualTo(1); // rev1 revisionNo=1
```

`map(r -> r.getRevisionNo())` 는 `revisionNo` 값(항상 1)을 반환하므로 단언은 실제 rev1 라인 수를 검증하지 않는다. 이 단언은 "rev1 이 존재함"만 증명하는 부수적 체크이지만 주석이 "rev1 revisionNo=1" 로 혼동을 유발한다. 복원 후 라인 수 검증은 아래 `andExpect(jsonPath("$.data.order.lines.length()").value(2))` 에서 수행하므로 실제 테스트 오류는 아니나, 코드 의도를 오해하게 만든다.

**권장**: `rev1LineCount` 변수명 제거 또는 명시적으로 `assertThat(revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId)).hasSize(1)` 로 교체.

---

### [P1] IT 케이스3 — CONFIRMED 복원 후 `slipNo` DB 단언이 `slipNo` 컬럼 보존만 확인, status 보존 미검증

**위치**: `PartnerOrderRevisionRestoreIT.java:396~421`

케이스3은 `slip_no = ?` 보존(is_deleted=false 조건)만 단언하지만, 복원 후 `status=CONFIRMED` 유지 여부를 DB 레벨(raw SQL)에서 직접 검증하지 않는다. `restoreHeader()`는 status를 변경하지 않는 설계이나, 이를 보장하는 IT 단언이 없다. 서비스 단위 테스트(`PartnerOrderRevisionServiceTest.java:255~287`)에서 `result.order().getPartnerCode()` 복원만 확인하고 status 보존 단언(`assertThat(result.order().getStatus()).isEqualTo(PartnerOrderStatus.CONFIRMED)`)이 빠져 있다.

**권장**: 케이스3 IT 또는 서비스 단위테스트에 `status=CONFIRMED` 유지 단언 추가. IT에서는 `jdbcTemplate.queryForObject("SELECT status FROM partner_orders WHERE id = ?", String.class, orderId)` 로 검증 권장.

---

### [P2] `PartnerOrderRevisionServiceTest` — `restore_draftOrder_headerAndLinesRestored` 라인 수 미검증

**위치**: `PartnerOrderRevisionServiceTest.java:215~251`

DRAFT 복원 단위 테스트에서 헤더(`partnerCode`, `bizCode`, `memo`) 복원은 검증하나, 라인 전량 교체 결과(`result.order().getLines().size()`)가 1건인지 검증하지 않는다. `replaceLines()` 동작의 side-effect(기존 라인 soft-delete + 신규 라인 추가)는 IT에서 HTTP 응답으로 검증되지만 단위 테스트에서 `orderRepository.saveAndFlush` mock 이 `thenAnswer(inv -> inv.getArgument(0))`이므로 저장 후 entity 상태에서 라인을 직접 확인할 수 있다.

**권장**: `assertThat(result.order().getLines()).hasSize(1)` 추가 (snapLine 1개이므로).

---

### [P2] Playwright 시나리오 번호 불연속 — 시나리오5가 사실상 6번째

**위치**: `phase-2-4-partner-order-restore.spec.ts`

spec 파일 내 시나리오 순서: 1→2→3→4a→4b→**6**→5 (파일 기준 270~283행이 "시나리오 6", 289~307이 "시나리오 5"). 시나리오 6 "DELETE 배지"가 시나리오 5 "UUID 비노출" 보다 먼저 작성되어 있다. CI 리포트 읽기 혼란 야기.

**권장**: 시나리오 6과 5의 순서를 파일 내에서 교체하거나, 시나리오 번호를 파일 순서에 맞게 재부여.

---

### [P2] IT 케이스5b(MASTER bypass) — `DynamicPermissionClient.check()` stub이 lenient 중복

**위치**: `PartnerOrderRevisionRestoreIT.java:511~515`

`setUp()`의 `lenient().when(dynamicPermissionClient.check(...)).thenReturn(true)` 가 이미 MASTER를 포함한 전체를 커버하는데, 케이스5b에서 동일 stub을 다시 `lenient().when(...)` 으로 덮어쓴다. 이는 lenient 이므로 실행에는 문제가 없지만, "MASTER bypass"의 실제 구현 동작(SecurityConfig의 MASTER role 예외 처리 여부 vs DynamicPermissionClient skip 여부)이 실 HTTP 헤더 없이 `@WithMockUser(roles = {"MASTER"})`로만 검증되어, 게이트웨이에서 MASTER role이 올 때의 실제 bypass 경로가 검증되는지 불분명하다.

**권장**: MASTER bypass 동작 경로를 Javadoc 주석으로 명확히 기술하거나, `RequirePermission` AOP 내에서 MASTER 예외 처리가 `DynamicPermissionClient` 호출 skip으로 구현되어 있음을 verify(mock, never()) 단언으로 증명.

---

### [Minor] IT 케이스1 — `actorName` doesNotExist 단언이 null 과 field absent를 구분 못함

**위치**: `PartnerOrderRevisionRestoreIT.java:253`

```java
.andExpect(jsonPath("$.data[0].actorName").doesNotExist())
```

`doesNotExist()`는 JSON 키 자체가 없을 때 통과하며, `null` 값으로 존재하는 경우에는 실패한다. 응답 DTO가 `@JsonInclude(NON_NULL)`이면 null 필드가 직렬화에서 제외되어 `doesNotExist()`가 올바르지만, DTO에 해당 어노테이션이 없으면 null로 존재해 `.value(null)`을 써야 한다.

**권장**: `PartnerOrderRevisionResponse` DTO 선언을 확인하고, `@JsonInclude(NON_NULL)` 적용 여부에 따라 `.value(null)` 또는 `.doesNotExist()` 중 맞는 것을 명시적으로 주석으로 설명.

---

### [Minor] IT 케이스3 — 직접 DB INSERT한 `slipNo`와 `buildConfirmedOrder` 반환값 사이 일관성 취약

**위치**: `PartnerOrderRevisionRestoreIT.java:342~344`

`buildConfirmedOrder()`가 `orderRepository.saveAndFlush(order)` 후 `order` 참조를 반환하는데, 저장 이후 Hibernate 캐시 flush로 인해 `slipNo`가 실제 DB 저장값과 일치하는지는 JPA 캐시 상태에 의존한다. 특히 `confirmedOrder.getSlipNo()`가 항상 "S-CONF-IT-0001"임을 전제하는데 `markSlipPublished("S-CONF-IT-0001")`을 호출한 후 바로 `orderRepository.saveAndFlush()`한 결과이므로 문제는 없으나, 미래 메서드 변경 시 취약할 수 있다.

**권장**: `String slipNoBeforeRestore = "S-CONF-IT-0001"` 상수로 명시하거나, DB에서 직접 `SELECT slip_no FROM partner_orders WHERE id = ?`로 읽어 확인하는 방식으로 방어.

---

### [Minor] Playwright mock — `ord-delete-history` orderId에 해당하는 mock.ts 블록 존재 여부 미검증 가능성

**위치**: `phase-2-4-partner-order-restore.spec.ts:60, 271~284`

`DELETE_HISTORY_ORDER_ID = 'ord-delete-history'` 를 사용하는 시나리오 6은 `mock.ts Phase 2.4 블록 내 orderId==='ord-delete-history' 분기`가 존재한다고 가정한다. 해당 mock.ts 파일을 이번 리뷰에서 직접 확인하지 못했으나, spec 파일 주석에 "mock.ts Phase 2.4 블록이 DELETE rev 추가"라고 기술되어 있다. mock.ts에 해당 분기가 없으면 시나리오 6이 silent-pass(빈 목록을 렌더하거나 row4가 없어서 getByTestId가 timeout으로 실패)될 수 있다.

**권장**: `clients/desktop/src/mock/mock.ts`에서 `ord-delete-history` 분기 및 rev4(DELETE) fixture 존재 여부를 BE agent 또는 FE agent가 교차 확인.

---

## 점검 항목별 결과

### 1. 커버리지 갭 점검

| 케이스 | IT 존재 | 단위테스트 존재 | 결과 |
|---|---|---|---|
| 캡처 타임라인(CREATE→EDIT) | 케이스1 | CaptureRevisionNo | 충족 |
| DRAFT 복원 | 케이스2 | restore_draftOrder | 충족 |
| CONFIRMED 복원(slipResyncRequired=true) | 케이스3 | restore_confirmedOrder | 충족 |
| CONFIRMED 복원 후 slipNo 보존 | 케이스3 DB 단언 | 없음 — status 보존 미검증 | **[P1]** |
| 삭제복원(undelete) | 케이스7 | restore_softDeletedOrder_undelete | 충족 |
| CONFIRMING 409 | 케이스4b | restore_confirmingOrder_throws409 | 충족 |
| CANCELED 409 | 케이스4a | restore_canceledOrder_throws409 | 충족 |
| 권한 deny(PARTNER) 403 | 케이스5a | 없음(단위 없음) | 충족(IT 커버) |
| MASTER bypass 200 | 케이스5b | 없음(단위 없음) | 충족(IT 커버) |
| 채번 단조증가 | 케이스6 | capture_consecutiveCalls | 충족 |
| actorName UUID 비공개 | 케이스1(actorName 검증), 케이스1(UUID 입력) | displayNameOrNull 4건 | 충족 |

**누락된 케이스:**
- 라인 0개 복원 시도: 구현에서 `replaceLines()`는 `lines==null || lines.isEmpty()` 시 `IllegalArgumentException`을 던지나, 스냅샷 내 `lines`가 빈 배열일 때 동작 테스트 없음. [P2 경계 케이스 - 추가 권장]
- 동일 revision 재복원(rev1 복원 → 다시 rev1 복원): 허용되어야 하나 검증 없음. [Minor]
- 삭제→복원→재삭제: 케이스7이 삭제→복원까지 검증. 재삭제 후 상태는 미검증. [Minor]
- 최신 revision 번호 복원(자기 자신 복원): 비즈니스 로직상 허용이나 의미 없는 복원 - 미검증. [Minor, 권장 없음]
- changeSummary 첫 revision(prev=null 경로): `summarize(null, cur)` 단위 테스트 없음. IT 케이스1에서 `lineAdded=2, headerChanged=0` 으로 간접 검증됨. 충족.

### 2. 경계 케이스 점검

| 경계 | 검증 여부 |
|---|---|
| 라인 0개 복원 | 미검증 (구현에서 IAE 발생하나 테스트 없음) |
| 동일 revision 재복원 | 미검증 |
| orderId 404 | 단위테스트 충족 |
| revisionNo 404 | 단위테스트 충족 |
| changeSummary 첫 revision (prev=null) | IT 케이스1 간접 검증 충족 |
| 삭제→복원→재삭제 | 재삭제 미검증 |

### 3. 도메인 정합 cross-check

- **CONFIRMED 복원 후 slipNo 유지 IT 단언**: IT 케이스3에서 `jdbcTemplate.queryForObject("SELECT COUNT(*) FROM partner_orders WHERE id = ? AND slip_no = ? AND is_deleted = FALSE", ...)` 로 단언 실재함. 충족.
- **삭제복원 후 is_deleted=false 단언**: IT 케이스7에서 `jdbcTemplate.queryForObject("SELECT COUNT(*) FROM partner_orders WHERE id = ? AND is_deleted = FALSE", ...)` 으로 단언 실재함. 충족.
- **RESTORE revision sourceRevisionNo=1 단언**: 케이스2, 케이스3, 케이스7 모두 `assertThat(restoreRev.getSourceRevisionNo()).isEqualTo(1)` 단언 실재함. 충족.
- **status 보존 단언**: 케이스3에서 미검증. [P1 상기]

### 4. 권한 IT 점검

- `DynamicPermissionClient` @MockBean 7-action stub: `lenient().when(dynamicPermissionClient.canView(...))`, `canEdit(...)`, `check(any(UUID.class), anyString(), any(PermissionAction.class))` 3종 stub. `feedback_it_mockbean_external_clients` 기준 충족.
- X-User-Id 헤더: 모든 케이스에서 `.header("X-User-Id", ...)` 포함. 충족.
- RESTORE 권한 deny stub: 케이스5a에서 `eq(PermissionAction.RESTORE)` + `thenReturn(false)` 적용. 충족.
- false-green 위험: `setUp()`의 lenient stub이 전 케이스에서 RESTORE=true를 기본값으로 설정하므로, 케이스5a에서 non-lenient `when()`으로 덮어쓰는 패턴이 정상. Mockito 우선순위상 마지막 stub이 이기므로 안전. 충족.

### 5. skipped=0 점검

- `@Disabled` 또는 `assumeTrue()` 계열 사용 없음. `AbstractPostgresIT`의 `DockerAvailableCondition` skip은 Docker 미가용 시 전체 IT skip이나 이는 설계된 동작임 (`feedback_testcontainers_windows_docker`).
- Playwright spec에 `test.skip()` 없음. 충족.

### 6. Playwright testid 정합 + mock BE 계약 일치

- **testid 일관성**: `partner-order-version-history-panel`, `-list`, `-row-{n}`, `-restore-button-{n}`, `-restore-confirm`, `-toast`, `-locked-note` 모두 spec에서 일관되게 사용. FE 컴포넌트 `PartnerOrderVersionHistoryPanel` 구현과의 testid 매핑은 이번 리뷰 범위 외(FE 코드 미열람).
- **mock BE 계약**: Playwright는 `VITE_MOCK_MODE=1` fixture 기반. `GET /api/v1/partner-orders/{id}/revisions` 응답 구조(`revisionNo`, `revisionType`, `sourceRevisionNo`, `actorName`, `changeSummary.lineAdded`, `changeSummary.headerChanged`)가 IT의 `PartnerOrderRevisionResponse` DTO 계약과 일치하는지 mock.ts 직접 확인 필요. [Minor 상기]
- `ord-draft` orderId로 mock에서 `slipResyncRequired=false` 반환, `ord-confirmed`에서 `slipResyncRequired=true` 반환 - spec 주석 기술. 구현 측에서 `PartnerOrderRestoreResponse`가 `slipResyncRequired` 필드를 포함하는지 확인 필요 — `PartnerOrderRestoreResult` record 존재 및 `PartnerOrderRestoreResponse.from(result)` 매핑으로 충족됨.

### 7. 회귀 점검 — 기존 IT

- `PartnerOrderDeleteIT.setUp()`: `partner_order_revisions` cleanup 없음 → Phase 2.4 이전 작성된 IT이나, DELETE IT는 revision 생성 훅(`PartnerOrderDeleteService.revisionService.capture()`)이 새로 추가되었으므로 `@BeforeEach` cleanup에 `partner_order_revisions` 제외가 문제가 될 수 있다.
  - **검토 결과**: `PartnerOrderDeleteIT.setUp()`에는 `jdbcTemplate.update("DELETE FROM partner_order_lines")` 및 `orderRepository.deleteAll()`이 있으나 `partner_order_revisions` cleanup이 없다. Phase 2.4에서 delete 훅이 추가되었으므로, 테스트 간 revision 데이터가 남아 다음 테스트의 채번에 영향을 줄 수 있다. 단, 각 테스트가 `orderRepository.deleteAll()`로 order를 지우고 revision 쪽은 FK 미강제이므로 orphan revision이 남는다. 채번은 `findMaxRevisionNo(orderId)` 즉 orderId 범위 내에서만 수행되므로 orphan revision이 새 orderId의 채번에는 영향을 주지 않는다. **회귀 없음**.
- `PartnerOrderFromEstimateIT` 및 `PartnerOrderUpdateIT`: `@BeforeEach`에서 `DELETE FROM partner_order_revisions` cleanup 추가 확인됨. Phase 2.4 이후 갱신됨. **회귀 없음**.
- `PartnerOrderConfirmServiceIT`: revision 관련 확인 필요하나 capture 훅이 ConfirmService에는 없음(CREATE revision은 from-estimate 경로에서 발생). **회귀 없음** (별도 검증 불필요).
- `restoreHeader()` 시그니처 변경: `updateHeader()` 위임 구조이므로 기존 `updateHeader()` 호출부(PartnerOrderUpdateService) 영향 없음. **회귀 없음**.

---

## 결론

P0 결함 없음. P1 2건:
1. IT 케이스2 `rev1LineCount` 단언 로직 오류 (false-green 아니나 코드 혼동)
2. CONFIRMED 복원 후 `status` 보존 DB 단언 누락

P1은 기능 정확성에 직접 영향을 주지 않으나 회귀 방어 관점에서 cycle2 전 수정을 권장한다.
P2/Minor는 코드 품질 및 미래 유지보수 관점 개선 사항으로, 별도 개선 태스크로 처리 가능.
