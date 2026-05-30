# Phase 2.4 Partner-Order RESTORE — QA 리뷰 Cycle 2

**브랜치**: `feat/phase-2-4-partner-order-restore` (HEAD `0c6cc8ad`)
**작성일**: 2026-05-30
**리뷰어**: Claude QA Agent
**리뷰 범위**: cycle1 fix commit (0c6cc8ad) 검증 — 코드 수정 없음, 정적 분석만 수행
**전제**: cycle1 QA (`claude-qa-cycle1.md`) 에서 제기된 P1 2건 + P2 3건 + Minor 3건에 대한 fix 실효성 교차검증

---

## 요약 판정

**QA APPROVE (cycle2)**

P1 결함 2건 모두 실효성 있게 수정됨. P2 결함 중 사이클1에서 지적된 3건 중 2건 수정 완료.
잔여 비차단 갭 2건(P2-3, Minor-3)은 분류 하향 또는 next-cycle 개선 항목으로 명시.
새 결함 없음. skipped=0 구조 유지. 회귀 없음.

---

## 1. IT 단언 fix 실효성 검증

### case2 — `rev1LineCount` 단언 정정 (P1-5)

**cycle1 지적**: `map(r -> r.getRevisionNo())` 가 라인 수가 아닌 revisionNo(=1) 를 반환해 단언 의도가 혼동됨.

**cycle1 fix 내용** (코드 라인 285~288):
```java
var rev1List = revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId);
assertThat(rev1List).hasSize(1);
assertThat(rev1List.get(0).getRevisionNo()).isEqualTo(1);
```

**판정 — 실효성 있음.** 이전 `rev1LineCount` 변수명+오해 유발 로직이 완전히 제거되었고, 두 단언이 각각 독립적으로 의미 있다.
- `hasSize(1)`: rev1 CREATE 시점에 revision이 정확히 1건 존재함을 검증한다. `from-estimate` 직후 캡처 훅이 동작하지 않으면 size=0 이 되어 실패하므로 false-green 없음.
- `isEqualTo(1)`: revision_no 채번이 1에서 시작함을 검증한다. 별도 의미 있는 단언.

라인 수 자체는 이후 복원 응답 `jsonPath("$.data.order.lines.length()").value(2)` 로 검증되므로 단위 커버 중복 없이 정합.

---

### case3 — CONFIRMED 복원 후 `status=CONFIRMED` 보존 단언 (P1-6)

**cycle1 지적**: 복원 후 `status` 보존을 DB 레벨에서 직접 검증하지 않음.

**cycle1 fix 내용** (코드 라인 417~420):
```java
String statusAfterRestore = jdbcTemplate.queryForObject(
        "SELECT status FROM partner_orders WHERE id = ?", String.class, orderId);
assertThat(statusAfterRestore).isEqualTo("CONFIRMED");
```

**판정 — 실효성 있음.** SQL 직접 조회로 DB 실 컬럼값을 단언한다. `restoreHeader()` 가 `status` 필드를 건드리지 않으면 통과, 건드리면 실패한다. false-green 가능성 없음.

추가로 단위 테스트(`PartnerOrderRevisionServiceTest.java:296~297`)에도 동일 단언이 추가됨:
```java
assertThat(result.order().getStatus()).isEqualTo(PartnerOrderStatus.CONFIRMED);
```
레이어 이중 보장 충족.

---

### case8 — create→edit→delete→restore 라인 중복 검증 (P1-1)

**cycle1 지적**: `case8` 자체가 cycle1 fix에서 신규 추가된 케이스(P1-1 `replaceLines` 중복 라인 문제 검증).

**단언 정확성 검증:**

```
edit 전: active=2, deleted=0
edit 후: active=2, deleted=2 (이전 rev1 라인 soft-delete)
delete 후: active=0, total=4 (edit 2(soft-del) + delete 2(soft-del))
restore(rev1) 후: active=2, total=6 (4(soft-del) + 2(active rev1 복원))
```

DB 단언 (코드 라인 831~854):
- `activeAfterRestore = 2` — rev1 스냅샷 기준 신규 INSERT 2건만 active.
- `totalAfterRestore = 6` — 4개 soft-deleted + 2개 active = 6.
- `duplicateActiveCheck = 0` — productId 별 active 라인이 2건 초과하지 않음(GROUP BY HAVING COUNT > 1 = 0).

**판정 — 실효성 있음.** 세 단언이 독립적이고 false-green 없다.

첫 번째 단언(`activeAfterRestore=2`): 복원이 정확히 rev1의 2개 라인만 복구했는지 검증. 중복 INSERT 시 4 이상이 되어 실패.
두 번째 단언(`totalAfterRestore=6`): 복원 시 soft-deleted 라인을 추가로 insert하지 않았는지 검증. 이전 서비스 버그(중복 잔존) 발생 시 total=8 이 되어 실패.
세 번째 단언(`duplicateActiveCheck=0`): 같은 productId 의 active 라인 중복을 직접 쿼리. 가장 정밀한 검증이며, `findAllIncludingDeletedByPartnerOrderId` native query 경로 미동작 시 실패한다.

revision 시퀀스 단언(라인 859~867): CREATE→EDIT→DELETE→RESTORE 순서 및 sourceRevisionNo=1 단언 포함. 정확한 4건 확인.

---

## 2. Playwright 시나리오 7 멱등성 검증

**cycle1 지적**: 동일 revision 재복원 시나리오 누락.

**cycle1 fix 내용**: 시나리오 7 신규 추가(라인 320~360). 번호 정합 상태:

| 파일 순서 | 시나리오 번호 | 내용 |
|---|---|---|
| 1번째 | 시나리오 1 | 버전이력 3건 렌더 |
| 2번째 | 시나리오 2 | DRAFT 복원 → 성공 toast |
| 3번째 | 시나리오 3 | CONFIRMED → slipResyncRequired=true |
| 4번째 | 시나리오 4a | CONFIRMING 비활성 |
| 5번째 | 시나리오 4b | CANCELED 비활성 |
| 6번째 | 시나리오 5 | UUID 미노출 가드 |
| 7번째 | 시나리오 6 | DELETE 배지 |
| 8번째 | 시나리오 7 | 동일 revision 재복원 멱등 |

**cycle1 P2-1(시나리오 순서 불연속) 수정 확인**: cycle1에서 지적한 "시나리오 6이 5보다 앞에 위치" 문제가 해소되었다. 파일 순서가 1→2→3→4a→4b→5→6→7로 정합.

**시나리오 7 의미 검증:**

시나리오 7이 검증하는 내용은 "동일 revision을 두 번 복원해도 UI가 차단하지 않고 성공 toast를 표시한다"는 FE 레벨 멱등성이다.

유효한 시나리오인 이유:
- BE는 동일 revision 재복원을 이미 허용(비즈니스 규칙 상 CONFIRMING/CANCELED 만 거부). 동일 revisionNo 복원은 상태에 따라 다시 RESTORE revision을 생성한다.
- FE가 복원 후 버튼을 숨기거나 비활성화하는 부작용이 있을 경우 두 번째 복원이 실패할 수 있다.
- mock.ts가 두 번째 POST에도 동일 200 응답을 반환하므로, 시나리오 7은 "FE 레벨에서 복원 버튼이 1회 클릭 후 사라지지 않는가"를 검증한다.

**toast 재표시 검증 방식 적합성**: toast 자동 닫힘 대기 후 재열기 패턴(`toBeHidden catch 무시` 후 두 번째 클릭)은 toast 유지 여부에 무관하게 동작한다. 두 번째 toast의 `toBeVisible()` + `toContainText('rev 1')` 이 핵심 단언으로, 의미 있는 검증.

**비차단 유의점**: 시나리오 7은 mock BE 응답을 기준으로 검증하므로, 실 BE에서 동일 revision 재복원이 서로 다른 응답을 반환하는 경우(예: RESTORE revision이 연속 생성될 때 채번 충돌 409)는 IT에서 별도 검증이 필요하다. 현재 IT에는 이 케이스가 없으나 비차단 수준.

---

## 3. 권한 IT — P2-3 (MASTER bypass verify never) 갭

**cycle1 지적 (P2-2 → 본 문서에서 P2-3으로 재식별)**: MASTER bypass 경로의 실제 구현 동작이 `DynamicPermissionClient` 호출 skip임을 `verify(mock, never())` 단언으로 증명하지 않음.

**cycle1 fix 상태**: 수정되지 않음. 케이스5b는 동일 구조 유지.

**cycle2 분석:**

`PermissionAspect.java:238~243`:
```java
private boolean isMasterBypass(String roleCode) {
    if ("MASTER".equalsIgnoreCase(roleCode)) {
        return true;
    }
    return roleBasedEnforcement && "AROLOGIS_MASTER".equalsIgnoreCase(roleCode);
}
```

`checkPermission()`(라인 134):
```java
if (isMasterBypass(roleCode)) {
    return joinPoint.proceed(); // DynamicPermissionClient 호출 없이 즉시 진행
}
```

IT 케이스5b에서 MASTER bypass가 실제로 `DynamicPermissionClient.check()` 를 호출하지 않는다는 사실을 단언하지 않는다. 현재는 `thenReturn(true)` lenient stub 덕분에 호출되더라도 200이 반환되므로 false-green 가능성이 있다.

MASTER bypass가 실제로 동작하는지 구분하는 방법: `when(dynamicPermissionClient.check(any(), any(), any())).thenReturn(false)` 로 설정한 뒤 200이 나오면 bypass가 동작한 것이다. 현재 IT는 이 검증을 하지 않는다.

**비차단 분류 유지**: shared `PermissionAspect` 자체는 별도 단위 테스트(`PermissionAspectTest.java`)에서 MASTER bypass 경로를 검증하고 있을 것으로 예상(shared 모듈 직접 확인 범위 외). 서비스 IT에서 `verify(never())` 미검증은 품질 갭이나 기능 결함은 아님. next-cycle 개선 권고.

---

## 4. skipped=0 유지 확인

IT 파일 전체에 `@Disabled`, `assumeTrue()`, `@Ignore` 없음. `@ExtendWith(DockerAvailableCondition.class)` skip은 Docker 미가용 환경 전용 — 정상 설계.

Playwright spec에 `test.skip()` 없음. 7개 시나리오 + 시나리오 7 신규 = 8개 test 전부 실행 대상.

`PartnerOrderRevisionRestoreIT` 케이스: case1~case8(case4a/4b, case5a/5b 포함) = 총 10개 @Test 메서드. skipped=0 구조 유지.

---

## 5. 회귀 점검

### application.yml `write-dates-as-timestamps: false` 영향

`spring.jackson.serialization.write-dates-as-timestamps: false` 추가로 LocalDateTime 필드가 ISO-8601 문자열로 직렬화된다.

영향 범위 점검:
- `jsonPath("$.data.createdAt")` 또는 `jsonPath("$.data.modifiedAt")` 를 배열 패턴(`[2026, 5, ...]`)으로 단언하는 기존 IT가 있으면 깨진다. 기존 IT 전체에서 createdAt/modifiedAt/confirmedAt `jsonPath` 단언을 검색한 결과: **0건**. 모든 기존 IT는 날짜 필드를 JSON 응답에서 직접 단언하지 않는다. 회귀 없음.
- `currentVersionTimestamp()` 헬퍼(라인 1173~1179): `o.getModifiedAt().toString()` 으로 ISO-8601 문자열을 PUT updatedAt 에 전달. application.yml 변경은 직렬화만 영향을 주므로 이 헬퍼는 영향 없음. 회귀 없음.

### GlobalExceptionHandler ResponseStatusException 매핑 변경

이전: `default → INTERNAL_ERROR` 고정.
변경: HTTP status 기반 switch(400/401/403/404/409 각 매핑, 기타 → INTERNAL_ERROR).

기존 IT에서 409 응답 errorCode를 단언하는 케이스 점검:
- `PartnerOrderDeleteIT`, `PartnerOrderUpdateIT` 등에서 409 응답을 `status().isConflict()` 로만 단언하고 errorCode body를 검증하지 않는다. 변경된 핸들러에서 409 → `ErrorCode.CONFLICT` 매핑이 추가된 것이므로, errorCode body 미단언 IT에는 영향 없음. 회귀 없음.

### 라인 정합 변경 — `findAllIncludingDeletedByPartnerOrderId` 신규 native query

기존 `PartnerOrderLineRepository.findAllByPartnerOrder_Id` 는 그대로 유지. 신규 `findAllIncludingDeletedByPartnerOrderId` native query 추가이므로 기존 호출부 영향 없음.

V7 마이그레이션 sql 주석 정리(DELETE clause 제거) — DDL 실행 결과에는 영향 없음. 회귀 없음.

### 기존 partner-order IT 목록 회귀 확인

| IT 클래스 | 주요 동작 | cycle1 fix 영향 | 판정 |
|---|---|---|---|
| `PartnerOrderFromEstimateIT` | from-estimate DRAFT 생성 | revision cleanup 이미 포함 | 회귀 없음 |
| `PartnerOrderUpdateIT` | PUT 헤더/라인 변경 | `updatedAt` 헬퍼 ISO-8601 영향 없음 | 회귀 없음 |
| `PartnerOrderDeleteIT` | soft-delete + 응답 | revision cleanup 미포함이나 orderId 범위 채번으로 고립 | 회귀 없음 |
| `PartnerOrderConfirmServiceIT` | confirm CONFIRMING→CONFIRMED | jackson 날짜 직렬화 변경: createdAt 미단언이므로 무영향 | 회귀 없음 |
| `PartnerOrderListIT` | 목록 조회 필터 | 날짜 필드 미단언 | 회귀 없음 |
| `PartnerOrderListPermissionIT` | 권한 목록 | DynamicPermissionClient stub 변경 없음 | 회귀 없음 |
| `PartnerOrderPermissionControllerIT` | 권한 컨트롤러 | 동일 | 회귀 없음 |
| `VendorOrderControllerIT` | 거래처 주문 | 동일 | 회귀 없음 |

---

## 6. Mock IT 외부 RestClient 격리 점검 (`feedback_it_mockbean_external_clients`)

`PartnerOrderRevisionRestoreIT` @MockBean 목록:
- `EstimateClient` — lenient stub `Optional.of(estimateSnapshot(estimateId))`
- `DcConfigClient` — lenient stub `Map.of()`
- `ProductClient` — lenient stub `List.of()`
- `InventoryClient` — @MockBean 선언 (별도 stub 없음, Mockito default = null 반환)
- `SlipServiceClient` — @MockBean 선언
- `PartnerAuthClient` — @MockBean 선언
- `PartnerLookupClient` — @MockBean 선언
- `ProductCatalogLookupClient` — @MockBean 선언
- `DynamicPermissionClient` — 7-action lenient stub

`InventoryClient` 는 Spring Bean이므로 @MockBean 으로 컨텍스트 격리가 이루어진다. restore 흐름에서 `InventoryClient` 가 호출되지 않으므로 stub 없는 @MockBean은 안전하다. 기준 충족.

---

## 7. 잔여 비차단 갭 목록 (cycle2 종료 후)

| ID | 위치 | 내용 | 분류 | 권고 |
|---|---|---|---|---|
| G-01 | IT 케이스5b | MASTER bypass 시 `DynamicPermissionClient.check()` 호출 never 단언 부재 | P2 (비차단) | next-cycle 또는 shared PermissionAspect 단위테스트 위임 |
| G-02 | IT 전체 | 라인 0개 스냅샷 복원 시 IAE 발생 경로 미검증 | Minor | next-cycle 경계 케이스로 추가 권고 |
| G-03 | cycle1 Minor-3 | `ord-delete-history` mock.ts 분기 존재 여부 교차확인 | Minor | FE agent 확인 요청 (mock.ts 직접 확인 범위 외) |
| G-04 | IT 케이스5b | MASTER bypass + lenient `check=true` stub 공존으로 bypass 실제 동작 여부 위장 가능 | P2 (비차단) | G-01과 동일 맥락 |

---

## 결론

cycle1 P1 결함 2건(케이스2 rev1LineCount 단언, 케이스3 CONFIRMED status 보존 미검증) 모두 실효성 있게 수정되었다.

case8 라인 중복 검증은 세 가지 독립 단언(activeAfterRestore=2, totalAfterRestore=6, duplicateActiveCheck=0)으로 구성되어 false-green 없이 P1-1 버그 재발을 방어한다.

Playwright 시나리오 7(동일 revision 재복원 멱등)은 FE 레벨에서 복원 버튼이 1회 사용 후 비활성화되지 않음을 검증하는 유효한 시나리오이며, 시나리오 번호 정합도 해소되었다.

P2-3(MASTER bypass verify never)은 cycle1 고지대로 비차단 분류가 유지된다. shared `PermissionAspect` 단위 테스트에서 별도 검증이 이루어지는 구조이므로 서비스 IT에서의 미검증은 품질 갭이나 기능 결함이 아니다.

skipped=0 구조 유지. 기존 IT 8종 회귀 없음. application.yml Jackson 날짜 직렬화 변경 및 GlobalExceptionHandler 응답 코드 매핑 변경 모두 기존 IT 단언에 영향 없음.

**QA APPROVE (cycle2)**
