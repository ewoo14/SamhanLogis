# PR #1063 R29 — SOL 지시 직접 수정 보고

작성일: 2026-08-05  
브랜치: `fix/1062-line-input-ux`  
기준 HEAD: `1749449e5f0973a78d3ecdd93387f78ae8318872`  
판정: **DONE**

## 1. 지시서 항목별 조치

### 결함 1 — 확정값을 바로 Backspace/Delete 해도 blur 후 복원됨

원인은 R27의 nullable sentinel이 `input` 이벤트가 없는 브라우저 직접 삭제 경로를 실제 해제로 식별하지 못한 것이었다.

`AsyncAutocomplete.handleKeyDown`에서 확정값이 선택된 상태이고 현재 input 값이 빈 문자열인 `Backspace` 또는 `Delete`를 받으면 `lastTypedDraftRef.current = ''`로 기록했다. 이후 기존 blur 게이트가 이를 실제 편집으로 인식하여 `onChange(null)`을 호출한다.

R27의 focus-only sentinel과 입력 중 첫 글자 보존 경로는 그대로 유지했다.

### 결함 2 — 품목 후보 1건이 즉시 확정되지 않음

`AsyncAutocomplete`의 `autoSelectSingleResult`가 켜진 경우 `resultSelectionMode="single"`에서도 후보 1건을 `pick`하도록 수정했다. 복수 후보 모달은 기존처럼 `onResultsConfirmed`를 사용한다.

`ProductAutocomplete`의 기본값은 `autoSelectSingleResult=true`로 연결했다. `ProductMultiAutocomplete`의 기존 즉시 확정 계약과 일반 품목 검색의 단일 후보 동작을 모두 유지하도록 했다. 기존 listbox 상호작용 테스트는 `false`를 명시하여 listbox 자체의 계약을 계속 검증한다.

### 결함 3 — 읽기 전용 견적의 trailing 빈행

견적 hydrate 시 `QUOTE_DRAFT`와 `QUOTE_SENT`만 기존 `ensureTrailingBlankRow`를 거치게 하고, 그 외 읽기 전용 상태는 서버에서 받은 확정 행만 사용하도록 분기했다.

R26의 일반 편집 빈행 동작은 변경하지 않았다. 편집 가능한 네 화면에서 확정 후 다음 빈행을 추가하는 경로는 기존대로 `ensureTrailingBlankRow`를 사용한다.

### 결함 4 — marker 없는 기존 Y.Doc이 복원 결과를 덮음

버전 이력 복원 성공 시 반환된 서버 version을 견적 ID별 `sessionStorage` fence에 기록하고, 첫 협업 provider 진입에서 같은 version의 fence를 1회 소비하도록 했다. fence가 일치하면 marker 없는 stale Y.Doc도 서버 복원 결과로 seed한다.

명시적인 복원 fence가 없는 일반 진입은 기존 동작을 유지한다. 따라서 같은 서버 version 세대의 provider가 앞선 경우에는 R23의 미저장 입력 보존 규칙이 계속 적용된다.

## 2. RED 원문 → GREEN 원문

### RED — 수정 전 추가 회귀 테스트

추가한 R28 테스트를 수정 전 구현에 실행했을 때의 실패 요지는 다음과 같다.

```text
AsyncAutocomplete.test.tsx
  Test Files  1 failed
  Tests       3 failed | 29 passed
  - R28 B 확정값을 바로 Backspace로 지우고 blur하면 선택을 해제한다
  - R28 B 확정값을 바로 Delete로 지우고 blur하면 선택을 해제한다
  - R28 단일 후보 자동확정은 단일 선택에서도 값을 확정한다

ProductAutocomplete.test.tsx
  Test Files  1 failed
  Tests       1 failed | 6 passed
  - 일반 품목 검색의 단일 후보는 dropdown에 남지 않고 즉시 확정한다

EstimateFormPage.coedit.test.tsx
  Test Files  1 failed
  Tests       2 failed | 31 passed
  - 읽기 전용 견적의 line-2가 null이어야 하나 trailing 빈행을 받음
  - marker 없는 stale Y.Doc 복원 테스트에서 replaceItems 호출 수가 0
```

### GREEN — 최종 구현 후 원문 실행 결과

```text
cd clients/web/design-system
npx vitest run src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx
  Test Files  1 passed
  Tests       32 passed

npx vitest run src/components/ProductAutocomplete/ProductAutocomplete.test.tsx
  Test Files  1 passed
  Tests       7 passed

cd clients/desktop
npx vitest run src/renderer/routes/EstimateFormPage.coedit.test.tsx
  Test Files  1 passed
  Tests       33 passed

npx vitest run src/renderer/utils/autoBlankRow.test.ts src/renderer/routes/EstimateFormPage.coedit.test.tsx src/renderer/routes/line-input-ux-r23.contract.test.ts
  Test Files  3 passed
  Tests       47 passed

cd clients/desktop
npx playwright test playwright/ac-2-product-autocomplete playwright/ac-3-partner-autocomplete playwright/1062-line-input-ux --workers=1
  16 passed (31.3s)
```

전체 및 타입/빌드 확인도 완료했다.

```text
clients/web/design-system: npx vitest run src/components/AsyncAutocomplete
  2 files, 39 tests passed

clients/desktop: npx vitest run
  exit 0

clients/web/design-system: npm run build
  Vite build passed, 163 modules
  Pretendard font 경로 warning만 발생

clients/web/design-system: npx tsc -p tsconfig.json --noEmit
  exit 0
clients/desktop: npx tsc -p tsconfig.node.json --noEmit
  exit 0
clients/desktop: npx tsc -p tsconfig.web.json --noEmit
  exit 0
```

Playwright는 지시서의 mock renderer 개발 서버와 Chromium 세션으로 실행했으며, 테스트 종료 후 해당 Vite 프로세스는 종료했다.

## 3. A·B·C를 같은 테스트 파일에 둔 근거

세 동선은 모두 `AsyncAutocomplete`의 동일한 `lastTypedDraftRef`/blur 게이트를 통과한다. 따라서 서로 다른 파일로 분리하면 sentinel 의미가 바뀔 때 한 동선만 통과하는 회귀를 놓치기 쉽다.

`clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx`에 다음 순서로 인접 배치했다.

```text
R27 A1  focus만 하고 blur       → 선택 유지
R27 A2  실제로 빈 문자열 입력   → 선택 해제
R28 B   Backspace/Delete 직접 삭제 → 선택 해제
R27 A3  확정값 위에 AJ 입력     → 첫 글자부터 교체
```

R28 B는 `Backspace`와 `Delete`를 parameterized test로 모두 실행한다. 이 인접 구조가 A의 nullable sentinel 보존, B의 명시적 빈 draft, C의 첫 입력 보존을 같은 구현 변경에서 동시에 검증하는 근거다.

## 4. 보존 확인

- 읽기 전용 분기는 hydrate 초기화에만 적용했고, 편집 가능 상태의 R26 `ensureTrailingBlankRow` 경로는 유지했다.
- restore fence는 복원 성공 handler에서만 생성되고 한 번 소비된다.
- fence 없는 일반 marker-less 진입은 기존 보존 경로를 유지한다.
- 기존 R23 미저장 입력 보존 테스트와 R26 빈행 테스트를 포함한 desktop Vitest가 통과했다.
- 화면 UUID 비공개 계약은 변경하지 않았다.

## 5. 안 본 것

- 후속 이슈 범위인 `/sales/:id/edit`, `SlipDetailPage`, `CollaborativeSlipInput`은 수정하지 않았고 origin/main과의 diff를 만들지 않았다.
- 다른 트랙 `#1045`, `#1057`, `#1061`, `#1066` 파일은 건드리지 않았다.
- `docs/handoff/`는 건드리지 않았다.
- 컨테이너 재배포, DB 쓰기, 실제 외부 revision restore/save 호출은 하지 않았다.
- 전체 Playwright 게이트와 전체 `npm run typecheck`는 지시서대로 실행하지 않았다. 대신 지정된 Playwright 16개, desktop 전체 Vitest, design-system build, 세 개의 scoped `tsc`를 실행했다.
- 5-team review, GitHub CI, PR merge/push는 이 세션 범위가 아니다.

## 신규 파일

- `clients/desktop/src/renderer/utils/estimateRestoreFence.ts`
- `docs/dev-reports/2026-08-05-1062-r29-sol-directive-fix.md`
