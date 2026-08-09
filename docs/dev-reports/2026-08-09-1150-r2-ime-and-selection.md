# PR #1150 R2 — IME 조합 중 자동확정·선택영역 보호

## 판정

두 SOL 진단 모두 코드에서 재현됐다. 공통 자동완성의 `pick()` 진입 자체가 조합 중 열려 있었고, 비동기 단일 후보 확정 뒤 `useLayoutEffect`가 현재 사용자 selection을 확인하지 않고 suffix selection을 적용했다.

## 수정 위치

① 조합 가드

- [AsyncAutocomplete.tsx:258](../../clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx:258): `pick()` 진입 시 `isComposingRef.current`면 즉시 반환한다.
- [WarehouseAutocomplete.tsx:312](../../clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx:312): 창고 전용 자동완성도 같은 진입 가드를 적용했다.
- compositionend 뒤 한 tick에서 후보를 다시 판정한다. 네이티브 IME가 compositionend 뒤 일반 input을 별도로 내지 않는 Chromium CDP 흐름까지 처리한다.
- Escape는 `keydown.isComposing=true`일 때 조기 반환해 draft를 확정 라벨로 되돌리지 않는다.

② selection 보호

- [AsyncAutocomplete.tsx:196](../../clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx:196): pending suffix를 적용하기 전에 사용자 selection snapshot을 먼저 복원하고, 현재 selection이 range이면 pending suffix를 폐기한다.
- [WarehouseAutocomplete.tsx:193](../../clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx:193): 창고 경로도 동일한 보호를 적용했다.
- 사용자가 직접 잡은 range는 [AsyncAutocomplete.tsx:702](../../clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx:702)의 `onSelect`와 `pick()` 시점의 현재 range를 함께 기록한다.

## 양방향 RED 4종 + 동시 GREEN

원문 불변식:

```text
RED-A  IME 조합 중에는 자동확정이 안 일어난다 · 조합 후 잔여 키가 라벨 뒤에 안 붙는다
RED-B  원 결함(자동확정 직후 키가 라벨 뒤에 붙음)은 여전히 안 난다  ← A2 가 고친 것
RED-C  비동기 응답이 사용자 selection 을 안 덮는다
RED-D  기존 자동완성 동작 불변 (붙여넣기 · 0ms 연속입력 · 지우고 재입력)
```

동시 GREEN 증거:

- design-system 전체: 26 test files, 222 tests passed.
- 강화된 IME/selection 두 스펙: 61 tests passed.
- live real QA: 창고 7건 reachable, 3 tests passed. 로그에서 `compositionstart`와 `insertCompositionText(isComposing=true)`를 확인했고, 조합 중 값은 `본사`, 종료 후 `HQ-001 · 본사창고`, selection 보호는 `0..1`로 확인했다.
- 기존 원 결함 재검증: `HQ` 입력 후 잔여 `Q`가 라벨 뒤에 붙지 않았다. 붙여넣기·0ms 연속입력·지우고 재입력도 모두 통과했다.

## 강화한 IME 테스트와 mutation RED

기존 테스트는 `compositionStart` 합성 이벤트 뒤 자동확정 결과만 기다려 실제 조합 갱신을 검증하지 않았다. 다음 흐름으로 교체했다.

- [WarehouseAutocomplete.test.tsx:106](../../clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx:106): `compositionStart` → `input(inputType=insertCompositionText,isComposing=true)` → `compositionUpdate` → `compositionEnd` → 일반 `input`을 밟고, 조합 중 `H` 유지와 종료 후 라벨 확정을 단언한다.
- [AsyncAutocomplete.test.tsx:938](../../clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx:938): 동일한 native-style composition flow와 종료 후 확정을 검증한다.
- [AsyncAutocomplete.test.tsx:986](../../clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx:986): 서버 응답 전 selection `0..1`을 잡고 단일 후보 응답 후에도 `0..1` 유지.
- [AsyncAutocomplete.test.tsx:1029](../../clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx:1029): 조합 중 Escape가 draft를 확정 라벨로 복원하지 않음.

mutation proof:

```text
mutation: WarehouseAutocomplete.pick()의 `if (isComposingRef.current) return` 한 줄 제거
command: npm test -- --run src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx -t "allows IME composition"
RED: expected input.value to be 'H', received 'HQ-001 · 본사 창고'
restore: guard 복원 후 해당 테스트 GREEN
```

## 공통 컴포넌트 영향 전수

grep 기준 `AsyncAutocomplete`, 그 wrapper인 `ProductAutocomplete`·`PartnerAutocomplete`·`MultiSelectAutocomplete`, 별도 `WarehouseAutocomplete` 사용 화면을 전수 확인했다.

| 화면 파일 | 컴포넌트 사용 | 이번 변경 영향 | 확인 방법 |
|---|---|---|---|
| EstimateFormPage.tsx | Partner + Product | 거래처·품목 IME/selection 보호 | design-system 단위 + live 품목 QA |
| EstimateItemsCatalogPage.tsx | ProductMultiSelect | 다중 품목 검색의 Async 경로 보호 | MultiSelect/Product 단위 |
| SlipFormPage.tsx | Warehouse + Partner + Product | 창고·거래처·품목 공통 보호 | Warehouse/Async 단위 |
| SlipDetailPage.tsx | Partner | 거래처 비동기 응답 selection 보호 | Async 단위 |
| SalesPartnerOrderDetailPage.tsx | Warehouse | 창고 조합 가드·selection 보호 | Warehouse 단위 |
| TransferFormPage.tsx | Warehouse | 출발·도착 창고 양쪽 보호 | Warehouse 단위 |
| MergeConvertDialog.tsx | MultiSelect + Partner + Warehouse | 이번 SOL 재현 화면 포함 | live real QA |
| SafetyStockAlertsPage.tsx | Product | 품목 자동확정 보호 | Product 단위 |
| BankTransactionPage.tsx | Partner | 거래처 selection 보호 | Async 경로 |
| TaxInvoiceFormPage.tsx | Partner | 거래처 selection 보호 | Partner 계약 + Async 경로 |
| CollectionPlanPage.tsx | Partner | 거래처 selection 보호 | Async 경로 |
| CashReceiptFormPage.tsx | Partner | 거래처 selection 보호 | Async 경로 |
| DailyClosingPage.tsx | Partner | 거래처 selection 보호 | Async 경로 |
| DepositorMappingPage.tsx | Partner | 거래처 selection 보호 | Async 경로 |
| JournalStatusReportPage.tsx | Partner | 거래처 selection 보호 | Async 경로 |
| NotesReceivablePage.tsx | Partner | 거래처 selection 보호 | Async 경로 |
| BlockedPartnersPage.tsx | Partner | 거래처 selection 보호 | Async 경로 |
| JournalFormPage.tsx | AsyncAutocomplete | 단일 Async 확정·selection 보호 | Async 단위 |
| EstimateDetailPage.tsx | AsyncAutocomplete | 단일 Async 확정·selection 보호 | Async 단위 |
| ApprovalLineConfigPage.tsx | MultiSelect | 다중 선택 공통 경로 보호 | MultiSelect 단위 |
| GroupwareApprovalCreatePage.tsx | MultiSelect | 다중 선택 공통 경로 보호 | MultiSelect 단위 |
| MessengerPage.tsx | MultiSelect | 다중 선택 공통 경로 보호 | MultiSelect 단위 |

## 라이브 QA

- 스펙 디렉터리/파일: `clients/desktop/playwright/1150-a2-sol-review-real-qa/1150-a2-sol-review-real-qa.spec.ts`
- hash router 이동은 `${BASE_URL}/#/경로`를 사용했다.
- `clients/desktop`, headless Chromium, `VITE_MOCK_MODE=0`, 실제 `:8080` API로 실행했다. 실 창고 발화 조건은 7건이었다.
- 캡처 전 화면 고유 요소를 확인했다: merge-convert warehouse input, line 1 model-name combobox.
- 캡처: [02-warehouse-ime-during.png](../qa/2026-08-09-1150-a2-sol-review-real-qa/screenshots/_local/02-warehouse-ime-during.png)
- 프로세스: 실 QA 종료 후 `:5175` Vite 프로세스 회수 확인.

## 신규·변경 산출물 경로

- `docs/dev-reports/2026-08-09-1150-r2-ime-and-selection.md`
- `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx`
- `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx`
- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx`
- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx`
- `clients/desktop/playwright/1150-a2-sol-review-real-qa/1150-a2-sol-review-real-qa.spec.ts`
- `docs/qa/2026-08-09-1150-a2-sol-review-real-qa/screenshots/_local/02-warehouse-ime-during.png`

커밋·푸시·실 DB 쓰기는 수행하지 않았다.
