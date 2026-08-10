# #1141 A2 구현 보고서 — 자동확정 직후 suffix 선택

## 구현 결과

A2는 이 컴포넌트 구조에서 성립했다. 자동확정 시 부모 `onChange`와 저장용 선택값은 기존처럼 그대로 확정하고, 표시 input에만 “사용자 draft가 라벨에서 끝나는 위치부터 라벨 끝” selection을 예약한다. React가 controlled value를 반영한 뒤 `useLayoutEffect`에서 실제 input에 selection을 적용하므로 다음 일반 입력은 생성된 suffix를 덮어쓴다. 시간창, `readOnly`, 입력 삼킴 로직은 추가하지 않았다.

- 공통 경계 계산: `clients/web/design-system/src/components/autocompleteSelection.ts:5`
  - 대소문자와 공백을 무시해 draft가 라벨의 code/name 어느 위치에 대응하는지 찾는다.
  - 대응하지 않으면 전체 라벨을 선택하는 안전한 fallback(`0`)을 사용한다.
- 창고 자동확정: `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx:299-314`
  - auto single-result `pick`에만 suffix selection을 요청한다.
  - 수동 click/Enter 확정에는 selection 변경을 적용하지 않는다.
- 공통 Async 자동확정: `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx:246-264,376-381`
  - PartnerAutocomplete/ProductAutocomplete가 공유하는 단일 선택 경로에도 같은 계약을 적용했다.
- 실제 input ref 및 controlled 반영 후 selection: `WarehouseAutocomplete.tsx:186-193,346-366`, `AsyncAutocomplete.tsx:174-196,666-689`
  - 반복 자동확정도 별도 `selectionRequest`로 재적용된다.

## RED-A / RED-B 동시 GREEN

기존 동작을 먼저 확인하기 위해 A2 기대값으로 바꾼 테스트를 구현 전에 실행했다. 기존 코드는 두 시간대 모두 라벨 끝 `[14,14]`에 caret를 두었으므로 RED가 정확히 발생했다.

### RED 원문

```text
RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t1141b/clients/web/design-system

WarehouseAutocomplete (22 tests | 2 failed)
× A2 자동확정 후 33ms 뒤 입력은 suffix를 덮어쓰고 정상 입력을 보존한다
  → expected 14 to be 1
× A2 자동확정 후 140ms 뒤 입력은 suffix를 덮어쓰고 정상 입력을 보존한다
  → expected 14 to be 1
Tests 2 failed | 20 passed
AssertionError: expected 14 to be 1
```

### GREEN 원문 — 33ms / 140ms 양쪽

```text
RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t1141b/clients/web/design-system

✓ src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx (22 tests)
✓ src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx (36 tests)
Test Files 2 passed (2)
Tests 58 passed (58)
```

통합 소비처까지 포함한 최종 실행 원문:

```text
✓ ProductAutocomplete.test.tsx (7 tests)
✓ WarehouseAutocomplete.test.tsx (22 tests)
✓ AsyncAutocomplete.test.tsx (36 tests)
✓ PartnerAutocomplete.cost.test.tsx (2 tests)
Test Files 4 passed (4)
Tests 67 passed (67)
```

테스트 위치:

- `WarehouseAutocomplete.test.tsx:207-248` — 33ms·140ms RED-A/RED-B, selection 범위와 `onChange` 2회를 함께 검증
- `AsyncAutocomplete.test.tsx:969-1014` — 공통 Partner/Product 경로의 33ms·140ms 검증
- `autocompleteSelection.test.ts:4-16` — 대소문자·공백·code/name 위치 및 fallback 검증

## IME 확인 결과

`WarehouseAutocomplete.test.tsx:90-115`에서 `compositionStart` 중 단건 자동확정을 발생시키고 suffix selection을 설정하지 않는 것을 확인했다. 조합 중에는 `isComposingRef`가 true여서 selection을 건드리지 않고, 조합 종료 후 입력 이벤트도 정상적으로 반영된다. Arrow/Enter 조합 보호 기존 테스트도 함께 통과했다.

## (a) 같은 패턴의 계열 판단

이번에 함께 닫았다. 결정 시트의 동일 위험 5개 화면은 `AsyncAutocomplete`의 single-value wrapper인 Partner/Product 경로로 공통 구현을 공유하므로, base를 수정하면 별도 화면별 복제가 필요 없다. Product 기본 `autoSelectSingleResult=true` 경로와 Partner 비용 테스트를 포함해 회귀를 확인했다.

`MultiSelectAutocomplete`는 단건 자동확정 시 선택 칩을 추가하고 input을 비우는 경로라 라벨 뒤 suffix를 공유하지 않는다. 따라서 이번 수정 대상에서 제외하는 것이 맞다.

별도 데스크톱 앱 소비처 테스트 파일은 이 워크트리에서 직접 발견되지 않았다. 확인 가능한 소비처 검증은 design-system의 Product/Partner 테스트이며 모두 통과했다.

## (b) 기존 테스트 처리

기존 `WarehouseAutocomplete.test.tsx:206-229`의 “알려진 동작: 자동확정 직후 이어진 키가 라벨 뒤에 붙는다” 테스트는 삭제하지 않고 A2 계약으로 방향을 바꿨다. 이 테스트가 지키던 것은 내부 선택값이나 저장값이 아니라, 자동확정 후 실제 표시 input이 후속 키를 받는 회귀 경로였다. 새 테스트는 그 경로를 유지하면서 잘못된 라벨 suffix 결합을 막고, `onChange`가 두 번 호출되어 `H`와 이어진 `Q`가 모두 정상 입력되는 것도 고정한다.

## 검증

- `npx vitest run src/components/autocompleteSelection.test.ts src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx src/components/ProductAutocomplete/ProductAutocomplete.test.tsx src/components/PartnerAutocomplete/PartnerAutocomplete.cost.test.tsx` — 4 files / 67 tests passed
- `npm run typecheck` — exit 0
- `npm run lint` — exit 0, 기존 경고 69개·오류 0개
- `git diff --check` — exit 0

## 신규 파일

- `clients/web/design-system/src/components/autocompleteSelection.ts`
- `clients/web/design-system/src/components/autocompleteSelection.test.ts`
- `docs/dev-reports/2026-08-09-1141-a2-implementation.md`

커밋·푸시는 하지 않았다.
