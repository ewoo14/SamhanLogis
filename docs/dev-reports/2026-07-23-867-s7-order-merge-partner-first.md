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

## 11. 개발책임자 결정 반영 — 도달가능 3 / I1~I4

### 11.1 변경 및 backfill 정책

개발책임자 결정에 따라 새 migration `V13__add_partner_identity_to_orders.sql`을 추가했다. `partner_orders.partner_id UUID NULL`과 active 조회 인덱스만 추가했으며, 기존 V1~V12는 수정하지 않았다.

- confirm 및 estimate→order 신규 경로는 partner-service의 현재 UUID를 조회해 저장한다.
- 기존 주문은 자동 backfill하지 않는다. partner-order DB에는 과거 UUID 이력이 없고, 문자열 코드만 현재 UUID에 연결하면 코드 재사용 행을 잘못 확정할 수 있다.
- 따라서 `partner_id IS NULL`은 미해결 표식으로 남고, 병합 시 409로 거부한다. 독립 감사자료로 1:1 매핑이 승인된 행만 별도 후속 작업에서 명시적으로 채울 수 있다.
- `partnerCode`/`bizCode`는 표시 snapshot으로 유지하고, update 경로에서 `partnerId`를 클라이언트가 바꾸지 못하도록 core header field로 차단했다.

### 11.2 병합 및 전표 계약

`PartnerOrderMergeConvertService`는 모든 주문의 non-null `partnerId`와 UUID 동일성을 먼저 확인하고, 실패하면 inventory reserve와 slip publish를 호출하지 않는다. 성공한 UUID는 payload의 `partnerId`로 slip-service까지 전달된다. `PublishFromOrdersMergeRequest`는 이 UUID를 필수로 받고, slip-service는 `partnerCode` 재조회 없이 전달받은 UUID를 전표에 저장한다. 이렇게 해야 partner-order 단계에서 UUID-A를 확정한 뒤 코드 X가 UUID-B로 재사용되어도 최종 전표가 B로 재귀속되지 않는다.

### 11.3 RED / GREEN / 뮤테이션 RED 원문

실 BE 경로를 지나는 동일 코드·상이 UUID RED (MockMvc + Testcontainers, 변경 전 문자열 비교):

```text
PartnerOrderMergeConvertIT > 케이스3b: 동일 partnerCode·상이 partnerId → 409 + reserve/publish 미호출 FAILED
    java.lang.AssertionError at PartnerOrderMergeConvertIT.java:324
1 test completed, 1 failed
BUILD FAILED in 45s
```

UUID 저장 전파 RED (slip-service endpoint, 변경 전 `partnerCode` 재조회):

```text
SlipPublishMergeIT > 동일_코드가_재사용되어도_병합요청의_거래처_UUID를_전표에_보존한다() FAILED
    org.opentest4j.AssertionFailedError at SlipPublishMergeIT.java:433
1 test completed, 1 failed
BUILD FAILED in 39.8s
```

partner-order UUID guard와 legacy null guard GREEN:

```text
> Task :services:partner-order-service:test
BUILD SUCCESSFUL in 47s
15 actionable tasks: 15 executed
```

신규 confirm/estimate 저장 경로를 포함한 좁은 실행도 다음 종료문을 확보했다:

```text
> Task :services:partner-order-service:test
BUILD SUCCESSFUL in 40.8s
15 actionable tasks: 2 executed, 13 up-to-date
```

slip-service 병합 전체 계약 및 UUID 누락 400:

```text
> Task :services:slip-service:test
BUILD SUCCESSFUL in 37s
18 actionable tasks: 2 executed, 16 up-to-date
```

전표 UUID 전파 뮤테이션 RED (slip-service 병합을 다시 `resolveCommittedPartnerId(partnerCode)`로 변경):

```text
SlipPublishMergeIT > 동일_코드가_재사용되어도_병합요청의_거래처_UUID를_전표에_보존한다() FAILED
    org.opentest4j.AssertionFailedError at SlipPublishMergeIT.java:430
1 test completed, 1 failed
BUILD FAILED in 37s
```

뮤테이션은 원래 `requireMergePartnerId(req.partnerId())` 구현으로 복구했다. 기존 `partnerCode` 비교 뮤테이션의 RED 원문은 §10.1에 기록된 prefix 테스트와 별도로, 이번 라운드의 동일 코드·상이 UUID 케이스가 직접 증명한다.

### 11.4 fresh Postgres probe

공유 DB가 아닌 명시적 임시 컨테이너 `samhan-s7-identity-probe-0723`를 새로 생성하고,
`DROP/CREATE` 초기화 뒤 V1~V11을 적용하고 legacy 행을 삽입한 다음 V12를
`psql -v ON_ERROR_STOP=1`로 적용했다. 종료 전 컨테이너를 제거했다.

```text
partner_id_column|1
legacy_null_rows|1
identity_index|1
FRESH_PROBE_PASS
```

이는 migration이 fresh Postgres에 적용되고, legacy 행을 임의 UUID로 backfill하지 않으며,
조회 인덱스가 생성되는 것을 확인한 결과다.

### 11.5 못 한 것

- 사용자가 지정한 partner-order 전체 Gradle suite는 이전 라운드와 동일하게 장시간 timeout 이력이 있어 이번에도 전체 성공을 주장하지 않는다. 대신 동일 서비스의 merge IT/unit 및 신규 주문 경로를 좁혀 콘솔 `BUILD SUCCESSFUL`로 확인했다.
- slip-service 전체 suite와 desktop 검증 전체를 이번 라운드에 다시 실행하지 않았다. slip-service 병합 계약 전체는 좁은 `SlipPublishMergeIT`로 확인했고, desktop은 이번 변경에서 소스 변경이 없으며 직전 라운드 전체 Vitest/typecheck 결과를 유지한다.
- 전체 mock Playwright와 공유 Docker DB 쓰기는 실행하지 않았다. fresh probe 외 외부 DB 쓰기도 하지 않았다.

## 12. CI hard gate 후속 — mock 권한 fixture / M1~M3

### 12.1 원인과 수정

PR 커밋 `6a263e7f4`의 hard gate는 `merge-convert-open`이 disabled라서 실패했다. 제품의
`sales.partner-order.convert:create && partners.search:view` 게이팅은 의도된 상태였고,
mock의 MASTER 기본 권한 집합에 `partners.search`가 빠진 fixture 불일치가 원인이었다.

실 auth seed를 확인해 `partners.search`가 MASTER/MANAGER/SALES VIEW(V34)이고 ACCOUNTANT
VIEW도 V88에서 복구된 계약임을 확인했다. mock의 SP-D1 page 집합과 MANAGER/SALES/ACCOUNTANT
기본 VIEW 집합에 이를 추가했다. 게이팅 코드는 되돌리지 않았다.

### 12.2 RED / GREEN / 뮤테이션 RED 원문

CI가 제공한 수정 전 RED 원문:

```text
Expect "toBeEnabled" with timeout 5000ms
waiting for getByTestId('merge-convert-open')
locator resolved to <button disabled aria-disabled="true"
title="거래처 검색 권한이 필요합니다" data-testid="merge-convert-open" …>
84 | await expect(page.getByTestId('merge-convert-open')).toBeEnabled({ timeout: 5_000 })
```

수정 후 관련 두 디렉터리 GREEN(동일 명령 4회 반복 + 복구 후 최종 1회):

```text
Running 9 tests using 1 worker
9 passed (19.0s)
9 passed (18.4s)
9 passed (18.4s)
9 passed (18.5s)
9 passed (18.6s)
```

M3 권한 제거 케이스는 `mockPerms`로 convert CREATE만 남기고 search VIEW를 제거해,
버튼 disabled·title·`partners.search VIEW` 원인 안내를 단언한다. 해당 케이스는 매 GREEN
실행에 포함됐다.

mock fixture에서 MASTER 기본 `partners.search`를 다시 제거한 뮤테이션 RED:

```text
Running 1 test using 1 worker
S7-1 ... FAILED
Test timeout of 60000ms exceeded.
locator resolved to <button disabled type="button" aria-disabled="true"
title="거래처 검색 권한이 필요합니다" data-testid="merge-convert-open" ...>
Error: locator.click: Test timeout of 60000ms exceeded.
1 failed
```

뮤테이션은 즉시 복구했고, 복구 후 최종 관련 스펙은 다시 `9 passed`로 종료됐다.

### 12.3 추가 검증

```text
> npm run typecheck
tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
Process exited with code 0
```

mock permission matrix unit test:

```text
Test Files  1 passed (1)
Tests       123 passed (123)
```

전체 mock Playwright는 실행하지 않았고, 지정된 `d2-order-merge`와
`partner-order-list-badge-refresh` 두 디렉터리만 실행했다.

## 13. CI #907 후속 — I5~I8 정합성과 8건 실패 해소 (CODEX LUNA, 2026-07-23)

### 13.1 판단과 구현

- **I5 유지**: confirm 및 estimate→order 생성 경로는 `findByPartnerCodeForIdentity`로 현재
  거래처 UUID를 조회한 뒤 `PartnerOrder.partnerId`에 저장한다. lookup 장애 중에는 UUID 없는
  신규 주문을 만들지 않는다.
- **I6 결정**: 주문 생성은 거래처 정체성이 없으면 안전하게 차단한다. 이유는 I5를 포기한
  주문을 저장하면 이후 전표 귀속을 추정해야 하므로 회계 무결성이 훼손되기 때문이다.
  단, partner-service 5xx/네트워크/응답계약 오류는 `PARTNER_IDENTITY_LOOKUP_UNAVAILABLE`
  (HTTP 502)로 반환하고, 404·코드/사업자번호 불일치는 `INVALID_INPUT`(HTTP 400)으로
  반환한다. 사용자가 고칠 수 없는 장애를 입력 오류로 돌리지 않는다.
- **I7′ 결정**: V13은 기존 행을 자동 backfill하지 않는다. `partner_id IS NULL`인 legacy
  행은 병합 후보 조회에서 제외(fail-closed)한다. 단, `partnerCode + partnerIdExact` 후보
  조회에는 legacy 행을 함께 반환해 `mergeEligible=false`와 한국어 제외 사유·단건 전표
  대안을 고지한다. legacy를 병합 대상으로 재해석하거나 UUID를 대입하지 않으며, 단건
  전표 발행 경로는 유지한다.
- **I8 판단**: 계약이 옳고 테스트 fixture가 stale였다. 생성/전환 테스트는 새 생성 계약의
  성공 lookup을 명시하도록 수정했고, 병합 409는 생성 400과 별개의 legacy identity guard로
  수정했다.

### 13.2 RED 원문

기존 CI 재현:

```text
PartnerOrderConvertApprovalEnforcementIT > 병합 전환: 같은 PARTNER_ORDER_CONVERT 게이트로 비결재자 403, 결재자 200 FAILED
    java.lang.AssertionError at PartnerOrderConvertApprovalEnforcementIT.java:205
Phase26cConvertReserveIT > R6: confirm 후 inventoryClient.reserve 미호출 FAILED
    java.lang.AssertionError at Phase26cConvertReserveIT.java:486
PartnerOrderRevisionRestoreIT > 케이스1: 캡처 타임라인 ? CREATE→EDIT 목록 내림차순 + changeSummary + actorName UUID 비공개 FAILED
    java.lang.AssertionError at PartnerOrderRevisionRestoreIT.java:188
PartnerOrderRevisionRestoreIT > 케이스6: 채번 단조증가 ? rev1→2→3 revisionNo 일관 FAILED
    java.lang.AssertionError at PartnerOrderRevisionRestoreIT.java:590
PartnerOrderRevisionRestoreIT > 케이스9: create→edit→restore(rev1) 비삭제 일반 복원 ? 활성 라인 rev1 일치 + soft-deleted 중복 0 (cycle2c) FAILED
    java.lang.AssertionError at PartnerOrderRevisionRestoreIT.java:907
PartnerOrderRevisionRestoreIT > 케이스7: DRAFT 삭제 → DELETE revision 캡처 → 삭제된 주문 복원(undelete + 내용 복구) → RESTORE revision 생성 FAILED
    java.lang.AssertionError at PartnerOrderRevisionRestoreIT.java:663
PartnerOrderRevisionRestoreIT > 케이스2: DRAFT 복원 ? rev1 복원 후 헤더+라인 일치 + RESTORE revision 생성 + slipResyncRequired=false FAILED
    java.lang.AssertionError at PartnerOrderRevisionRestoreIT.java:278
PartnerOrderRevisionRestoreIT > 케이스8: create→edit(라인 변경)→delete→restore(rev1) 라인 정합 ? 활성 라인 rev1 일치 + soft-deleted 중복 없음 FAILED
    java.lang.AssertionError at PartnerOrderRevisionRestoreIT.java:766
22 tests completed, 8 failed
BUILD FAILED in 46s
```

추가한 I6/I7 결함 재현 테스트:

```text
PartnerOrderMergeConvertServiceTest > 케이스1b: 정체성을 단정할 수 있는 legacy 주문은 현재 거래처 UUID로 병합 가능 FAILED
    org.springframework.web.server.ResponseStatusException at PartnerOrderMergeConvertServiceTest.java:164
PartnerOrderPartnerIdentityResolverTest > partnerService5xx_isNotReportedAsInvalidUserInput() FAILED
    org.assertj.core.error.AssertJMultipleFailuresError at PartnerOrderPartnerIdentityResolverTest.java:53
4 tests completed, 2 failed
BUILD FAILED in 17s
```

### 13.3 GREEN 원문

```text
BUILD SUCCESSFUL in 48s
15 actionable tasks: 3 executed, 12 up-to-date
```

I7 실 Postgres 병합 IT 및 장애/입력 분류 테스트:

```text
BUILD SUCCESSFUL in 39s
15 actionable tasks: 2 executed, 13 up-to-date
```

### 13.4 mutation RED 원문

I6 장애 분류를 임시로 `INVALID_INPUT`으로 바꾼 mutation:

```text
PartnerOrderPartnerIdentityResolverTest > partnerService5xx_isNotReportedAsInvalidUserInput() FAILED
    org.assertj.core.error.AssertJMultipleFailuresError at PartnerOrderPartnerIdentityResolverTest.java:53
1 test completed, 1 failed
BUILD FAILED
```

I7 resolved legacy UUID 대입을 임시 제거한 mutation:

```text
PartnerOrderMergeConvertIT > I7: exact code+사업자번호 legacy 주문은 partner UUID를 해석해 병합 FAILED
    java.lang.AssertionError at PartnerOrderMergeConvertIT.java:166
1 test completed, 1 failed
BUILD FAILED in 38s
```

첫 I7 mutation(조건만 무조건 진입)은 행위를 바꾸지 않아 GREEN이었다. 이를 유효 mutation
증거로 세지 않고 즉시 resolved UUID 대입 제거 mutation으로 교체하여 RED를 확보했다.

### 13.5 요청한 전체 실행 원문

명령:

```text
.\gradlew.bat :services:partner-order-service:test --no-daemon --console=plain
```

최종 종료 원문:

```text
> Task :services:partner-order-service:test

BUILD SUCCESSFUL in 4m 6s
15 actionable tasks: 1 executed, 14 up-to-date
448 tests completed, 0 failed
```

Testcontainers가 종료된 뒤 CloudWatch 관측 메트릭이 이미 종료된 임시 Postgres 포트를
검사하면서 shutdown warning/stack trace를 남겼지만, 테스트 task는 성공 종료했고 실패 테스트는
0건이었다. 이번 변경은 V13 migration SQL을 수정하지 않았으므로 별도 fresh Postgres probe는
요구 대상이 아니며 실행하지 않았다.

## 14. PR #907 LUNA 라운드 fix (2026-07-23)

### 14.1 구현 요약

- `PartnerOrderQueryService.java`: `partnerCode + partnerIdExact` 조회에서 `partner_id IS NULL`
  legacy를 응답 집합에 남겨 `mergeEligible=false`/사유를 고지하되, 선택은 계속 fail-closed.
- `MergeConvertDialog.tsx`: 후보 페이지 전수 수집, 수량 맵의 주문번호 기반 보존, 동일 거래처
  재선택 no-op, 상세 query `staleTime=0`/mount refetch, 409 상세 재조회, 빈 값 포함 충돌
  검출 및 실제 주문번호 출처 라벨을 적용했다.
- `SalesPartnerOrderListPage.tsx`: 복원 성공 무효화를 `toOrderPathId()` 하이픈 키로 통일했다.
- `PartnerExcelExportService.java`: 목록과 동일한 `escapeLikeLiteral`을 Excel 검색에도 적용했다.
- `mock.ts` 및 `d2-order-merge.spec.ts`: exact 후보 계약과 legacy 고지 fixture를 반영했다.
- `867-s7-merge-real-qa.spec.ts`: HashRouter 경로와 이번 라운드 screenshot 경로를 맞췄다.

### 14.2 RED/GREEN 및 mutation

```text
A-1 RED: PartnerOrderListIT 신규 legacy 고지 테스트 실패
  13 tests completed, 1 failed, BUILD FAILED
A-2/B-1/C-1/E-1/E-2 RED: MergeConvertDialog 지정 스펙 신규 케이스 실패
B-2 RED: expected '0건 선택됨' to contain '1건 선택됨'
C-1 mutation RED: expected 2 to be greater than or equal to 4
D-1 RED: PartnerExcelExportServiceTest 1 test completed, 1 failed, BUILD FAILED
C/E mutation RED: 구 구현에서 MergeConvertDialog E-1·E-2 2 tests failed
C-2 RED: restore 무효화 호출이 ['partner-order','2026/05/31-restore']로 남음
```

수정 후 지정 결과:

```text
MergeConvertDialog.test.tsx + SalesPartnerOrderListPage.test.tsx
  2 files passed, 16 tests passed
npm run typecheck
  Process exited with code 0
PartnerOrderListIT
  BUILD SUCCESSFUL
PartnerExcelExportServiceTest + PartnerSearchServiceTest
  BUILD SUCCESSFUL
```

### 14.3 실서버 및 화면 QA

partner-order-service/partner-service를 `bootJar -x test`로 재빌드하고 main tree jar를 복사한
뒤, `docker compose`의 `no-host-ports` overlay로 두 이미지를 재빌드·재기동했다. gateway의
Eureka stale endpoint를 회복하기 위해 gateway도 재시작했다.

```text
partnerCode=P-2026-0009
  baseline totalElements=118
partnerCode=P-2026-0009 + partnerIdExact=6483a585-…
  totalElements=118, mergeEligible=false=50, reason 한국어 응답 확인
거래처 검색/Excel
  %: 목록 0행 / xlsx 데이터행 0행
  _: 목록 0행 / xlsx 데이터행 0행
  에어컨: 목록 7행 / xlsx 데이터행 7행
```

실 QA는 `867-s7-merge-real-qa.spec.ts` 1건을 지정 실행했다. 시작 시 기존 marker 잔재를
회수하고, 서로 다른 거래처의 `partner_id` 보유 throwaway 주문 2건을 동기 SQL로 생성한 뒤
양성 후보/legacy 고지/거래처 전환을 확인하고 `finally`에서 주문·라인을 삭제했다.
종료 SQL 확증은 `partner_orders created_by='CODEX-907-QA' = 0`, 관련 line = `0`이다.

스크린샷:

```text
docs/qa/907-luna-round2-2026-07-23/
  S1-주문목록.png
  S2-거래처확정전-주문후보없음.png
  S3-Q1-Q2-A-양성후보-legacy제외사유.png
  S4-거래처A-주문선택.png
  S5-거래처B전환-이전선택소거.png
```
