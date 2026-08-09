# PR #1120 / 이슈 #825 — S19 fix 라운드 surface closure

## 판정

S18에서 도달한 3건을 공용 `WarehouseAutocomplete`의 기존 상태 수명 안에서 닫았다. 새 timer, marker, ref는 추가하지 않았다.

- S18-1 backdrop 취소 후 draft 소실: `lastTypedDraftRef`가 아직 사용자 draft를 보유한 미확정 상태의 후속 blur가 빈 `selectedLabel`로 덮어쓰지 않게 했다.
- S18-2 자동확정 라벨 뒤 suffix: 확정 라벨로 시작하는 stale `change`를 새 검색으로 처리하지 않고 확정 라벨을 유지하게 했다.
- S18-3 dropdown Escape 전파: dropdown이 처리한 Escape에서 `stopPropagation()`하여 바깥 Modal의 document Escape handler에 도달하지 않게 했다.

현재 작업 디렉터리의 기존 미추적 `clients/desktop/playwright/825-s15-final-reconvergence/`는 읽기·실행만 했고 수정·신규 파일 목록·커밋 대상에 포함하지 않았다.

## RED-A — 수정 전 원문

S18 실 브라우저 원문(`docs/dev-reports/2026-08-08-825-s18-reconvergence.md`)은 다음과 같다.

### S18-1

```text
{"tag":"backdrop-immediate","value":"창","focused":false,"expanded":"false"}
{"tag":"backdrop-300ms","value":"","focused":false,"expanded":"false"}
```

### S18-2

```text
{"tag":"HQ-after-H","value":"HQ-001 · 본사창고"}
{"tag":"HQ-after-Q","value":"HQ-001 · 본사창고Q"}
{"tag":"HQ-after-blur","value":"HQ-001 · 본사창고"}
```

### S18-3

```text
{"tag":"dropdown-escape-outer-visible","outerVisible":false}
```

수정 전 TDD 단위 RED도 확보했다.

```text
Test Files  1 failed (1)
Tests       2 failed | 13 passed (15)
FAIL 자동확정 직후 이어진 키 입력이 확정 라벨에 붙지 않는다
  expected 'HQ-001 · 본사 창고Q' to be 'HQ-001 · 본사 창고'
FAIL dropdown Escape가 상위 keydown 핸들러로 전파되지 않는다
  expected 'true' to be 'false'
```

S18-1은 Modal의 rAF focus 복원 차이로 jsdom 단위에서는 재현되지 않았고, 위 실 브라우저 원문을 RED 근거로 사용했다.

## 결함 2 — 선재 vs S17 회귀 판정

**선재 결함**으로 판정한다. `git show 276e5d77d`에서 S17이 변경한 것은 `handleFocus`의 `setOpen(!preserveDraft)`와 명시확정 callback의 두 ref 대입뿐이다. 자동확정에 필요한 `autoSelectSingleResult` 분기와 `handleChange`의 `pick(nextCandidates[0])`은 S17 부모 커밋에도 이미 존재했다. 따라서 S17이 만든 새 현상이라는 증거는 없으며, S17은 기존 자동확정 경로의 후속 입력 표면을 드러낸 것으로 기록한다.

## 상태 수명 분석

- `preserveDraftOnNextFocusRef`는 Modal close cleanup의 복원 focus 한 번에서 소비되어야 한다. S18-1은 marker가 남은 것이 아니라 그 소비 뒤 같은 pointer 동작이 새 blur timer를 만들면서 발생했다.
- `lastTypedDraftRef`는 마지막 사용자 입력과 확정 label을 함께 운반하는 기존 ref다. 이 수명을 늘리는 새 ref를 만들지 않고, 미확정·무선택 후속 blur에서 기존 값이 있으면 그것을 유지하도록 했다.
- 자동확정은 `pick()`이 controlled 선택과 label을 갱신한 직후 브라우저의 이어진 input change가 도착하는 경계다. 확정 label 접두 suffix만 차단하고 `Ctrl+A` 뒤 새 입력처럼 label 접두가 아닌 입력은 기존 검색 경로로 보냈다.
- dropdown Escape는 내부 dropdown 상태를 닫은 뒤 native document handler까지 남아 있던 전파 문제다. dropdown branch에서만 전파를 끊어 검색 결과 Modal의 중첩 Escape 계약은 유지했다.

## RED-B — 회귀 울타리 원문

S18에서 통과한 원문은 S18 보고서의 다음 수치와 같다.

```text
WarehouseAutocomplete: Test Files 1 passed, Tests 12 passed, PROCESS_EXIT_CODE=0
S15 Playwright: 4 passed (7.9s), PROCESS_EXIT_CODE=0
Desktop typecheck: 50 passed, PROCESS_EXIT_CODE=0
```

S19에서 같은 회귀 경계를 재실행했다.

```text
S15 Playwright
Running 4 tests using 1 worker
4 passed (8.1s)
Exit code: 0

WarehouseAutocomplete
Test Files 1 passed (1)
Tests 15 passed (15)
Exit code: 0

Desktop related specs
MergeConvertDialog.test.tsx  9 tests passed
SalesPartnerOrderDetailPage.coedit.test.tsx  20 tests passed
SlipFormPage.test.tsx  99 tests passed
Test Files 3 passed (3)
Tests 128 passed (128)
Exit code: 0

Desktop typecheck
real-QA cleanup scope: 2 passed, 0 failed
real-QA scope: 50 passed, 0 failed
Exit code: 0
```

## 동시 GREEN 원문

동일 수정 상태에서 위 네 검증을 좁은 범위로 연속 실행했고 모두 exit 0이었다. S15 원 결함도 재발하지 않았다: 확정 후 표시값 유지, dropdown 닫힘, 즉시 Enter 안정은 `4 passed`에 포함된다. 새 단위 테스트도 3건 포함하여 `15 passed`다.

## 필수 3절

### ① 이 fix로 새로 가능해진 상태·화면 조합과 결과

| 조합 | 결과 |
|---|---|
| 미확정 `창` → 검색 결과 Modal backdrop → focus 복원 → 후속 blur | `창` 보존, 빈 문자열로 소실되지 않음 |
| `Ctrl+A` → `H` 단건 자동확정 → 이어진 `Q` change | `HQ-001 · 본사 창고` 유지, 내부 선택과 표시값 일치 |
| 확정 창고 input 재focus → dropdown → Escape | dropdown만 닫힘, 바깥 병합전환 Modal 유지 |
| 확정 후 blur→focus | marker 소비 후 일반 focus 동작 유지 |
| 검색 결과 Modal Escape/backdrop/취소 | 기존 안쪽 Modal 닫힘 및 draft 보존 계약 유지 |

### ② 제거·이동·개명 식별자 grep 전수 확인

이번 fix는 식별자를 제거·이동·개명하지 않았다. 기존 식별자 전수 확인 결과:

```text
preserveDraftOnNextFocusRef  6 references
lastTypedDraftRef            7 references
handleBlur                   2 references
handleChange                 1 definition + existing event wiring
stopPropagation              1 new reference (dropdown Escape branch)
```

S17의 기존 marker/ref는 동일 파일에서 모든 참조가 남아 있고, 삭제된 식별자·미참조 rename은 0건이다. `git diff --stat`에도 두 소스/테스트 파일 외 삭제가 없다.

### ③ 바꾼 파일을 참조하는 테스트 전부 실행

변경 파일은 다음 2개다.

- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx`
- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx`

직접 테스트와 소비 화면 테스트를 모두 실행했다.

```text
npm test -- --run src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx
15 passed / 15, exit 0

npm test -- --run src/renderer/routes/components/MergeConvertDialog.test.tsx src/renderer/routes/SalesPartnerOrderDetailPage.coedit.test.tsx src/renderer/routes/SlipFormPage.test.tsx
128 passed / 128, exit 0

npx playwright test playwright/825-s15-final-reconvergence/825-s15-final-reconvergence.spec.ts --reporter=line
4 passed, exit 0

npm run typecheck
real-QA 2 + 50 passed, exit 0
```

## 신규 파일 목록

- `docs/dev-reports/2026-08-08-825-s19-surface-closure.md`

신규 드라이버·스크린샷 파일은 만들지 않았다. 기존 미추적 S15 드라이버는 커밋 대상이 아니다.
