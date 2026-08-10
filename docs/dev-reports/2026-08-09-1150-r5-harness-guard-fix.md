# PR #1150 R5 하네스 거짓 green 가드 수정

## 범위

`fix/1141-autoconfirm-suffix-selection` / `ba848d1b6`에서 CI red 두 잡만 수정했다. 커밋·push는 하지 않았다.

## RED-A — 하네스 가드

### 수정 전 원문

명령:

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
```

실측 결과는 CI의 2 failed와 달리 로컬 Windows에서 4 failed였다.

```text
Test Files  1 failed (1)
Tests 4 failed | 58 passed (62)

FAIL H-2: ...
1150-a2-sol-review-real-qa/1150-r4-sol-reconv-real-qa.spec.ts → const OUT
1150-a2-sol-review-real-qa/1150-r4-sol-reconv-real-qa.spec.ts → const SHOTS

FAIL G3a: ...
clients/desktop/playwright/1150-a2-sol-review-real-qa/1150-r4-sol-reconv-real-qa.spec.ts → const OUT
clients/desktop/playwright/1150-a2-sol-review-real-qa/1150-r4-sol-reconv-real-qa.spec.ts → const SHOTS

FAIL S10 RED-A: 호출자 무효화 없이 파일 추가·삭제를 다음 discovery에 반영한다
Error: Test timed out in 5000ms.

FAIL S10 RED-A: junction 별칭으로 발견한 파일은 원본 삭제 후 canonical cache에서 제거된다
Error: Test timed out in 5000ms.
```

S10 두 건은 코드 변경 없이 재실행 시 통과하여 Windows 로컬 실행 타이밍 차이로 분리했다.

### GREEN 원문

```text
Test Files  1 passed (1)
Tests  62 passed (62)
Duration  51.58s
```

## RED-B — 실 QA 스펙 실행

명령:

```text
REAL_QA_ALLOW_UNTRACKED=1
node_modules\\.bin\\playwright.cmd test --config=playwright.real-qa.config.ts --project=renderer --reporter=line --timeout=90000 playwright/1150-a2-sol-review-real-qa/1150-r4-sol-reconv-real-qa.spec.ts
```

첫 실행은 마지막 결과 저장 지점의 `OUT` 잔여 참조로 실패했다.

```text
ReferenceError: OUT is not defined
at ...1150-r4-sol-reconv-real-qa.spec.ts:308:30
```

잔여 참조를 `SHOTS` 기반 `_local` 저장으로 고친 뒤 재실행했다.

```text
R4_ENVIRONMENT ... warehouseCount:7
R4_TRIGGERS ... unique 본 / ambiguous 창
1 passed (5.8s)
```

실제 산출물:

```text
docs/qa/2026-08-09-1150-r4-sol-reconv/_local/
  00-angle1-modal-before-ime.png ~ 11-angle4-after-escape.png (12장)
  live-qa-result.json
```

## RED-C — 기존 증거 보호

실행 직후 측정:

```text
git status --porcelain -- docs/qa/2026-08-09-1150-r4-sol-reconv
<출력 없음>

커밋 증거 screenshots: 12장
커밋 live-qa-result.json: M 없음
커밋 playwright-run.txt: M 없음
```

기존 `docs/qa/2026-08-09-1150-r4-sol-reconv/` 증거는 덮어쓰거나 삭제하지 않았다.

## RED-D — Frontend Desktop

CI 원문에서 별도 typecheck/lint/build 오류가 아니라 동일한 Vitest 가드 실패였다.

```text
Frontend Desktop (typecheck + lint + build) > 단위 테스트(vitest)
FAIL harness-false-green-guard.test.ts > H-2
FAIL harness-false-green-guard.test.ts > G3a
Tests 2 failed | 2033 passed (2035)
```

수정 후 로컬 `npm run typecheck`:

```text
Exit code: 0
node --test ...cleanup-scope.test.cjs: 2 pass, 0 fail
node --test ...scope.test.cjs: 50 pass, 0 fail
```

따라서 Frontend Desktop red도 동일 스펙 수정으로 해소되는 범위이며, 전체 Frontend Desktop 재실행은 범위 밖이라 하지 않았다.

## 변경 파일

- `clients/desktop/playwright/1150-a2-sol-review-real-qa/1150-r4-sol-reconv-real-qa.spec.ts`
  - `resolveQaShotsDir()` 경유로 `_local` 격리
  - QA credential 해석을 테스트 본문으로 이동하고 미설정 시 `test.skip`
  - 결과 JSON도 `_local`에 기록

## 신규 생성 파일

- `docs/dev-reports/2026-08-09-1150-r5-harness-guard-fix.md` (이 보고서)

실행 중 생성된 `_local` PNG/JSON은 `.gitignore` 대상 로컬 산출물이며 신규 커밋 파일로 추가하지 않았다.

## 못 한 것

- git commit / push / merge: 하지 않음
- 전체 Vitest 및 전체 Frontend Desktop 재실행: 하지 않음
- `1150-a2-sol-review-real-qa/`의 다른 스펙·config: 건드리지 않음
