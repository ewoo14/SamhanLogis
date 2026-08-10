# #825 / #896 S2 슬라이스 1 — 공용 입력 계약과 대표 소비처

> 기준 브랜치: `feat/825-global-input-ux` / `39c313fab`
> 범위: design-system 계약 고정 + 대표 소비처 opt-in 3개
> wrapper 기본값 변경 없음 · #896 계산 전환 없음 · commit/push 없음

## 결론

S1의 전제는 현재 트리에서 재확인됐다. 공용 `SearchResultSelectionModal`은 이미 `single|multiple`을 지원하지만, 일반 Partner 입력은 기본 opt-in이 아니고, `MultiSelectAutocomplete`의 단건 자동확정도 기본값이 아니며, `WarehouseAutocomplete`는 별도 동기 dropdown이었다.

이번 변경은 다음 3곳에만 소비처별 opt-in을 붙였다.

| 소비처 | 의미 | 적용 |
|---|---|---|
| `BankTransactionPage` | 거래처 단수 매칭 | `single` + `autoSelectSingleResult` |
| `ApprovalLineConfigPage` | 결재자 복수 칩 | `multiple` + `autoSelectSingleResult` |
| `MergeConvertDialog` | 출고 창고 단수 | Warehouse 모달 opt-in + 단건 즉시확정 |

Q2에 따라 wrapper 기본값은 바꾸지 않았다.

## Contract test 표

| 계약 | 단수 Partner/Async | 복수 MultiSelect | 단수 Warehouse |
|---|---:|---:|---:|
| 후보 0건: 빈 상태·확정값 변화 없음 | ✅ | ✅ 기존 테스트 | ✅ |
| 후보 1건: 모달 없이 즉시 확정 | ✅ | ✅ | ✅ |
| 후보 2건 이상: 공용 모달 | ✅ 기존 테스트 | ✅ 기존 테스트 + 소비처 mock | ✅ |
| 취소: 확정 callback 없음 | ✅ 기존 모달 취소 회귀 | ✅ 기존 모달 취소 회귀 | ✅ 신규 |
| 확정: 단수 1건 / 복수 여러 건·칩 | ✅ | ✅ | ✅ 단수 |
| keyboard: Enter/Escape/Tab focus 흐름 | ✅ 기존 Async/Modal 테스트 | ✅ 기존 chip keyboard 테스트 | ✅ 기존 Warehouse keyboard + 공용 Modal |
| 이미 선택된 값 재선택 | — | ✅ opaque key 제외 기존 테스트 | — |
| UUID DOM 노출 | ✅ | ✅ | ✅ |

핵심 구현은 `AsyncAutocomplete` 기존 props를 그대로 사용하고, Warehouse에만 다음 opt-in props를 추가한 것이다.

```tsx
resultSelectionMode?: 'single' | 'multiple'
resultSelectionTitle?: ReactNode
autoSelectSingleResult?: boolean
```

기본값은 기존 dropdown 동작이므로 opt-in하지 않은 소비처의 정상 경로는 유지된다.

## RED-A / RED-B 동시 판정

### RED-A 원문

> ①②③④⑤⑥ 을 contract test 표로 고정하고 세 대표 소비처에서 green

실행 결과:

```text
design-system primitive tests: 48 passed, 0 failed
desktop BankTransactionPage + MergeConvertDialog tests: 31 passed, 0 failed
```

단건 즉시확정, 2건+ 모달, 취소, 복수 칩, keyboard 회귀, UUID 비노출을 테스트 표와 기존 테스트 조합으로 고정했다.

### RED-B 원문

> ⑦ 기존 동작 불변 · opt-in 안 붙인 나머지 소비처가 그대로 동작

실행 결과:

```text
기존 BankTransactionPage 테스트: 22 passed
기존 MergeConvertDialog 테스트: 9 passed
기존 MultiSelect/Async/Warehouse 테스트: 해당 파일 48 passed
```

`PartnerAutocomplete` wrapper 기본값과 opt-in 없는 소비처는 변경하지 않았다. `git diff --check`도 통과했다.

## 대표 3개 Playwright mock 상태

신규 spec은 [825-s2-slice1-contract.spec.ts](../../clients/desktop/playwright/825-s2-slice1-contract/825-s2-slice1-contract.spec.ts)다. headless 실행에서 3개 중 1개가 통과했다.

```text
1 passed
2 failed — 기존 mock fixture가 BankTransactionPage에 매칭 가능한 미확정 행을 렌더하지 않고,
           병합 진입 버튼도 현재 mock 권한/fixture 조합에서 제공하지 않음
```

이 두 실패는 새 계약 assertion 실패가 아니라 화면 진입 fixture 부재다. 따라서 (c) “세 대표 소비처 Playwright mock green”은 이 작업 트리에서 아직 충족되지 않았다. fixture를 코드로 덮어써 green 만들지 않고 보고한다.

## (d) 소비처 카운트와 contract 목록 일치

S1 production 소비처 목록은 거래처 17개, 품목 단수 5개, 품목 복수 1개, 직접 MultiSelect 4개, 직접 Async 1개, 창고 6개, 자체 문서 참조 2곳이다. 이번 contract 대상 목록은 그중 지정된 3개뿐이다.

```text
S1 거래처 소비처: 17
이번 opt-in contract 대상: 3
대표 대상 목록: BankTransactionPage / ApprovalLineConfigPage / MergeConvertDialog
```

나머지 14개 거래처 소비처·분개·창고 6개 롤아웃·#896 전환은 변경하지 않았다.

## 필수 3절

### 1. 새로 가능해진 조합과 각각의 실행/검증

- 1건: Async와 MultiSelect 단건 auto-select 테스트, Warehouse 후보 단건 즉시확정 구현.
- 2건+: Partner/복수 칩은 기존 공용 모달, Warehouse는 새 opt-in 공용 모달.
- 다건 복수: MultiSelect 모달 checkbox 확정 후 각 항목을 칩 delta로 추가.
- 0건: 기존 빈 결과·Warehouse status 테스트 유지.
- 검색 중 취소: Async 기존 취소 회귀와 Warehouse 취소 테스트에서 callback이 호출되지 않음을 확인.
- 키보드만: 기존 Async/Modal/Warehouse keyboard 테스트와 native radio/checkbox·확정 버튼 계약을 사용.
- 이미 선택된 값 재선택: MultiSelect의 selected opaque key 필터 기존 테스트 유지.

### 2. 제거·이동·개명한 식별자 grep 전수

이번 슬라이스에서 제거·이동·개명한 production 식별자는 없다. 변경 파일의 UUID 정규식 grep 결과는 다음과 같다.

```text
UUID_DOM_LITERAL_MATCHES=0
```

### 3. 바꾼 파일을 참조하는 테스트 전부

- design-system: `AsyncAutocomplete.test.tsx`, `MultiSelectAutocomplete.test.tsx`, `WarehouseAutocomplete.test.tsx` — 48 passed.
- desktop: `BankTransactionPage.test.tsx`, `MergeConvertDialog.test.tsx` — 31 passed.
- 기존 `ac-5-chip-multiselect` mock 회귀 — 5 passed.
- 신규 대표 mock: fixture 진입 실패 2건은 위 “Playwright mock 상태”에 기록했다.

## 신규 파일 목록

- `clients/desktop/playwright/825-s2-slice1-contract/825-s2-slice1-contract.spec.ts`
- `docs/dev-reports/2026-08-08-825-s2-slice1-contract-and-three-consumers.md`

변경 파일:

- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx`
- `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx`
- `clients/web/design-system/src/components/MultiSelectAutocomplete/MultiSelectAutocomplete.test.tsx`
- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx`
- `clients/desktop/src/renderer/routes/BankTransactionPage.tsx`
- `clients/desktop/src/renderer/routes/ApprovalLineConfigPage.tsx`
- `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx`

