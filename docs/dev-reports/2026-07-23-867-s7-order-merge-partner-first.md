# #825 슬7 — 주문 병합 UX: 거래처 우선 선택 (2026-07-23)

> 연관 Issue: #867 · 에픽 #825
> 선행: 슬4 칩 컴포넌트(PR #844) ✅ · 슬6 수신자 칩(PR #892, 머지 `06d8d7d45`) ✅

## 1. 문제

N주문 → 1전표 병합 화면에서 사용자가 **서로 다른 거래처의 주문을 섞어 고를 수 있다**. 고르고 나서야 BE 가 409 `병합은 같은 거래처 주문만 가능합니다` 로 거절한다.

**에픽 #825 핵심결론 1** — *"기존 규칙을 UI 로 끌어올린다"*. 규칙이 BE 에만 있으면 사용자는 **실패하고 나서** 규칙을 배운다.

## 2. 불변식

| # | 불변식 |
|---|---|
| **S7-1** | **사용자가 다른 거래처 주문을 섞어 고르는 상태에 도달할 수 없다.** 거래처를 먼저 정하고, 그 거래처의 주문만 후보로 보인다 |
| **S7-2** | **BE 409 가드는 안전망으로 유지한다.** UI 로 끌어올렸다고 BE 검증을 제거하지 않는다(API 직접 호출·경합·구버전 클라이언트) |
| **S7-3** | `PartnerOrderMergeConvertService` 의 **기존 병합 로직은 변경하지 않는다** — 후보를 좁히는 것이지 병합 규칙을 바꾸는 게 아니다 |
| **S7-4** | 거래처를 바꾸면 **이전 거래처에서 고른 주문 선택이 남지 않는다**(섞임의 다른 경로) |

## 3. 범위

- 병합 화면 **2단계 UX**: 거래처 선택 → 그 거래처 주문만 칩 후보
- 후보 쿼리에 `partnerId` 필터
- 기존 칩 컴포넌트(`MultiSelectAutocomplete` 계열) 재사용 — **자체 컴포넌트 신규 작성 금지**

🚫 **범위 밖**: 병합 규칙 자체 변경 · 새 엔드포인트 · 새 마이그레이션 · 다른 화면의 칩 UX 손질

## 4. 검증 방침

- **RED-first** — 결함(다른 거래처 주문을 섞어 고를 수 있음)을 재현하는 실패 테스트를 먼저 쓴다
- **뮤테이션 RED** — `partnerId` 필터를 무력화했을 때 테스트가 RED 가 되는지로 방어선을 증명한다
- **S7-2 회귀** — UI 를 우회해 다른 거래처 주문으로 병합 요청 시 **여전히 409** 인지 단언한다. 이게 "안전망 유지" 의 증거다
- **라이브QA(PM 직접)** — 실서버에서 거래처 선택 → 후보 목록이 실제로 좁혀지는지 · 거래처 변경 시 이전 선택이 사라지는지
  🚨 **부재 단언 앞에 양성 단언**을 둔다(화면이 실제로 렌더됐고 기대한 거래처가 나왔음을 먼저 증명)

## 5. 워크플로우

캐논 준수 — OPUS 기획(본 PR) → CODEX LUNA 5.6 구현 → OPUS 적대리뷰 + PM 라이브QA → CODEX SOL 5.6 리뷰 → 도달가능 0 수렴 → CI green → PM 머지.

## 6. RED / GREEN / 뮤테이션 RED 원문

### 6.1 RED — 기존 체크박스 화면에서 거래처 우선 단계 부재

추가한 `MergeConvertDialog.test.tsx`를 구현 전 실행한 원문:

```text
Unable to find an element by: [data-testid="merge-convert-partner-a"]
```

기존 모달에는 거래처 선택 단계가 없었으므로, 거래처 A 양성 확인 및 A/B 후보 구별 단언을 시작할 수 없었다. 이 실패가 슬7 결함(거래처 확정 전 주문 선택)의 재현이다.

### 6.2 GREEN

```text
Test Files  2 passed (2)
Tests       5 passed (5)
```

후속 좁은 Playwright mock QA 원문:

```text
Running 6 tests using 1 worker
6 passed (14.6s)
```

`d2-order-merge`에서 선택 거래처 A의 `3건 후보` 양성 출력 후 B 주문 후보 `0건`, 거래처 B 전환 후 A 칩 `0건`과 B `1건 후보`를 단언했다.

### 6.3 뮤테이션 RED — `partnerId` 필터 제거

`MergeConvertDialog.tsx`의 후보 조회에서 `partnerId: selectedPartner!.partnerCode`를 일시 제거한 뒤 실행한 원문:

```text
expected <button ... data-testid="merge-convert-order-option-2026/07/23-B"> to be null
received B order button
```

필터를 복구한 뒤 GREEN을 재확인했다.

## 7. S7-2 안전망 결과

- 기존 `PartnerOrderMergeConvertServiceTest`의 서로 다른 `partnerCode` 병합 케이스를 유지했고, `409` 및 reserve/publish 미호출을 단언했다.
- 핵심 테스트 실행 원문:

```text
BUILD SUCCESSFUL in 32s
15 actionable tasks: 15 executed
```

- Playwright mock의 `mockMerge409=mixed` 시나리오도 `같은 거래처` 오류 표시와 모달 유지(6개 중 해당 테스트 포함)를 통과했다.
- `PartnerOrderMergeConvertService` 구현 파일과 기존 병합 변환 로직은 변경하지 않았다.

## 8. 변경 파일 및 재사용 컴포넌트

- `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx` — 거래처 → 주문 칩 2단계 상태, `partnerId` 후보 쿼리, 거래처 변경 동기 선택 초기화 및 `key={partnerCode}` remount.
- `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx` — 목록 혼합 체크박스 제거, 모달 진입 안내로 전환.
- `clients/desktop/src/renderer/api/mock.ts` — mock 주문 목록의 `partnerId` 필터 보존.
- `clients/desktop/src/renderer/routes/components/MergeConvertDialog.test.tsx` — S7-1/S7-4 단위 회귀.
- `clients/desktop/playwright/d2-order-merge/d2-order-merge.spec.ts` — S7-1, S7-2, S7-4 및 기존 병합/409 회귀.
- `clients/desktop/playwright/partner-order-list-badge-refresh/partner-order-list-badge-refresh.spec.ts` — 기존 배지 갱신 스펙의 새 병합 진입 경로 반영.
- `docs/superpowers/plans/2026-07-23-867-s7-order-merge-partner-first.md` — 구현 계획.
- 본 문서 — 검증 결과 누적.

재사용한 저장소 컴포넌트는 `@samhan/design-system`의 `PartnerAutocomplete`, `MultiSelectAutocomplete`, `TagChip`이다. 주문 칩 자체 컴포넌트는 새로 만들지 않았다.

## 9. 검증 결과 및 못 한 것

통과:

- `npm run typecheck`
- `npx vitest run --reporter=verbose` — `141 passed`, `1115 passed`
- `npx playwright test playwright/d2-order-merge --reporter=line` — `6 passed`
- `npx playwright test playwright/partner-order-list-badge-refresh --reporter=line` — `2 passed`
- partner-order 핵심 회귀 Gradle 테스트 — `BUILD SUCCESSFUL`

환경 제한/미완료:

- 요청한 두 서비스 통합 Gradle 명령은 300초 안에 종료 문구를 반환하지 않아 timeout 되었다.
- partner-order 전체 `test`는 exit code 0이었으나 콘솔에 `BUILD SUCCESSFUL`/`BUILD FAILED` 문구가 없어 최종 성공으로 판정하지 않았다. 대신 동일 서비스의 S7-2 핵심 테스트는 위 `BUILD SUCCESSFUL`을 확인했다.
- slip-service 전체 `test`는 컴파일 후 daemon이 `stop command received`로 중단되어 `BUILD FAILED`가 발생했고, worker 1개 재시도는 300초 timeout 되었다. slip-service 코드 변경은 없으며, XML 결과를 성공 근거로 사용하지 않았다.
- 전체 Playwright mock 스위트 및 공유 Docker DB 쓰기는 실행하지 않았다.

## 10. CODEX SOL 적대리뷰 대응 — 2026-07-23

### 10.1 도달가능 1 / E1·E2·E3

기존 `partnerId`는 다른 화면의 목록 검색 계약(`partner_code` 또는 `biz_code` 부분일치)으로 유지했다. 병합 후보에는 별도 `partnerCode` 쿼리 파라미터를 추가해 `partner_code = :partnerCode` 정확일치로 분기했다. 따라서 `P-1` 선택 시 `P-10`이 섞이지 않고, `P-%_`도 SQL wildcard가 아니라 등록된 코드 자체로만 매칭된다. FE 병합 다이얼로그는 선택된 `partnerCode`를 이 파라미터로 보내며, mock도 기존 `partnerId`에는 BE의 LIKE wildcard 의미를 재현하고 병합 `partnerCode`에는 정확일치를 적용한다.

실 BE 경로를 지나는 RED 원문(수정 전, MockMvc + Testcontainers):

```text
PartnerOrderListIT > list_merge_candidate_exact_partner_code_excludes_prefix_match() FAILED
    java.lang.AssertionError at PartnerOrderListIT.java:129

BUILD FAILED in 35s
1 test completed, 1 failed
```

수정 후 두 exact-contract 테스트 GREEN 원문:

```text
> Task :services:partner-order-service:test

BUILD SUCCESSFUL in 47s
15 actionable tasks: 15 executed
```

뮤테이션 RED 원문:

```text
PartnerOrderListIT > list_merge_candidate_exact_partner_code_excludes_prefix_match() FAILED
    java.lang.AssertionError at PartnerOrderListIT.java:129

BUILD FAILED in 33s
1 test completed, 1 failed
```

위 뮤테이션은 JPA exact predicate를 prefix `LIKE`로 바꾼 경우다. wildcard literal 방어선도 exact `LIKE`로 바꾼 뮤테이션에서 다음과 같이 RED가 됐다.

```text
PartnerOrderListIT > list_merge_candidate_exact_partner_code_treats_wildcards_as_literal() FAILED
    java.lang.AssertionError at PartnerOrderListIT.java:144

BUILD FAILED in 32s
1 test completed, 1 failed
```

FE 병합 후보 계약의 RED/GREEN/뮤테이션 RED:

```text
RED: expected <button ... data-testid="merge-convert-order-candidate-2026/07/23-B"> to be null
     received B order button

GREEN:
Test Files 4 passed (4)
Tests      131 passed (131)

뮤테이션(후보 query의 partnerCode를 기존 partnerId로 복귀):
expected <button ... B ...> to be null
```

mock exact-filter를 무력화한 뮤테이션도 `expected [P-1]` 대신 전체 목록을 반환해 RED가 됐다. 이 테스트는 `P-1`/`P-10` 접두사 쌍을 사용한다.

### 10.2 도달가능 2 / P1·P2

병합 진입 게이트를 `sales.partner-order.convert:create && partners.search:view`로 맞췄다. CREATE만 있고 검색 VIEW가 없으면 버튼은 노출하되 disabled 상태와 `거래처 검색 권한이 없습니다...` 안내를 함께 보여 준다. `partnerApi.searchPartners`의 기존 기본 동작(오류를 빈 배열로 반환)은 공유 소비처 회귀를 막기 위해 유지하고, 병합 화면만 `throwOnError: true`로 원 오류를 받아 권한 안내를 표시한다.

권한 게이트 RED 원문(검색 권한을 요구하기 전):

```text
expected false to be true
```

권한 게이트 GREEN은 위 좁은 FE 회귀 묶음의 `4 files / 131 tests passed`에 포함된다. 버튼 disabled를 강제로 해제한 뮤테이션은 다음과 같이 RED가 됐다.

```text
4 passed, 1 failed
expected false to be true
```

`searchPartners` 오류 삼킴의 런타임 소비처를 전수 확인했다. `partnerApi.ts` 검색 함수를 직접 사용하는 화면은 `BankTransactionPage`, `CashReceiptFormPage`, `BlockedPartnersPage`, `CollectionPlanPage`, `DailyClosingPage`, `DepositorMappingPage`, `JournalStatusReportPage`, `MergeConvertDialog`, `NotesReceivablePage`, `SlipFormPage`, `TaxInvoiceFormPage` 11곳이다. CRUD·`getPartnerFull` 소비처도 있으나 `searchPartners` 오류 계약에는 해당하지 않는다. `EstimateFormPage`와 `SlipDetailPage`의 검색은 별도 `api/sales.ts` 함수라 이번 catch 변경의 영향 밖이다.

### 10.3 `partnerId` 소비처 전수 확인

주문 목록 API의 `partnerId`를 실제 필터로 전달하는 FE 소비처는 `SalesPartnerOrderListPage`의 기존 목록 검색 1곳이며, BE `PartnerOrderListController`/`PartnerOrderQueryService`와 기존 IT가 그 부분일치 계약을 사용한다. 병합 다이얼로그는 더 이상 `partnerId`를 사용하지 않고 `partnerCode` exact 계약을 사용한다. 다른 화면의 UUID `partnerId`는 전표/회계/거래처 내부 식별자 payload이며 주문 목록 필터 계약과 무관하므로 변경하지 않았다.

### 10.4 testid 및 미수정 범위

`merge-convert-dialog`는 DS `ModalProps`가 전달하지 않는 가짜 testid였으므로 호출부와 개발 보고서 목록에서 제거했다. `role="dialog"` 기반 DS Modal 전체를 변경하지 않아 영향 범위를 넓히지 않았다. 실제 검증 가능한 `merge-convert-dialog-body`와 권한 오류 alert testid는 유지했다.

개발책임자 판단 사안인 동일 코드·상이 UUID 거래처의 BE 409 우회 문제는 주문 스키마 변경 범위이므로 이번 라운드에서 손대지 않았다. 전체 Gradle 지정 실행은 셀 결과가 유실되어 성공 판정하지 않았고, 요청대로 `--no-daemon`으로 재시도했으나 244초 후 Exit 124로 종료되어 성공 판정하지 않았다. 좁은 BE 계약 테스트와 전체 Desktop Vitest는 별도로 성공했다. 전체 Playwright와 공유 Docker DB 쓰기는 실행하지 않았다.
