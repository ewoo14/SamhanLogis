# #863 QA 출력 경로 분리·덮어쓰기 가드

## 범위

Issue #863의 잔여 범위인 Desktop mock QA 산출물 경로만 처리했다. 이미 PR #876에서 해소된 outbox 관측 8개 항목은 수정하지 않았다.

`clients/desktop/playwright`에서 `manual/**`(기본 Playwright `testIgnore` 대상)와 `support/qa-screenshot-dir.*`(공통 helper)를 제외한 mock 인벤토리를 측정했다. `-real-qa` 경로는 별도 측정·보존했다.

## 1. 41개 전수 수치

### 착수 전

기획서의 실측과 같은 범위로 `docs/qa` raw 참조 파일을 세었다.

```text
COUNT=41
```

착수 전 mock resolver 사용 파일 수는 35개였고, 이 중 일부가 기존 `resolveQaShotsDir`를 사용했다. 실제 캡처 공통 경로인 `mig-14-admin-ui/mig-14-helpers.ts`도 전환 대상에 포함했다.

### 처리 후

mock writer는 `resolveMockQaShotsDir`로 전환했다. raw 경로 문자열 자체는 커밋 기준 디렉터리를 계산하거나 읽기 전용 계약을 확인하는 데 필요하므로 남을 수 있지만, 보호되지 않은 writer 수를 별도로 판정한다.

```text
[QA 출력 경로 인벤토리] raw docs/qa 파일=41, 미보호 mock writer=0
✔ mock QA 출력 인벤토리는 41개이고 직접 writer는 0개다 (131.1338ms)
✔ mock resolver 기본 출력은 _local이다 (2.6145ms)
✔ mock resolver가 커밋 경로 overwrite 시도를 차단한다 (0.5691ms)
✔ QA_ALLOW_OVERWRITE=1이면 명시한 커밋 경로를 사용한다 (1.5207ms)
✔ real Playwright resolver는 커밋 경로를 기본 대상으로 선언한다 (2.3515ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

정적 전환 결과:

```text
REAL_RESOLVER_FILES=193
REAL_FILES_USING_MOCK_RESOLVER=0
MOCK_FILES_USING_REAL_RESOLVER=0
MOCK_FILES_USING_MOCK_RESOLVER=35
```

따라서 41개 raw 인벤토리의 최종 미보호 mock writer는 **0개**다.

## 2. 전체 mock 스위트 실행 및 `docs/qa/**` 무변경

의존성 설치 후 `@samhan/design-system`을 CI와 같은 순서로 빌드했다. Desktop 실행은 전역 Playwright가 아니라 로컬 설치본을 직접 사용했다.

실행 명령:

```powershell
cd clients/desktop
$env:CI = '1'
node_modules\.bin\playwright.cmd test --reporter=line
```

실행 원문:

```text
Running 641 tests using 2 workers
...
[1A[2K  641 passed (6.6m)
EXIT=0
```

실행 직전 원문:

```text
--- BEFORE git status --short -- docs/qa ---
--- BEFORE git diff -- docs/qa ---
```

실행 직후 원문:

```text
--- AFTER git status --short --untracked-files=all -- docs/qa ---
--- AFTER git diff --name-only -- docs/qa ---
--- AFTER git diff --stat -- docs/qa ---
```

`git status`, `git diff --name-only`, `git diff --stat` 모두 `docs/qa/**` 행을 출력하지 않았다. mock 전체 실행으로 커밋된 QA 증거 변경은 **0건**이다.

## 3. overwrite 차단 실측

기존 커밋 QA 디렉터리 `docs/qa/897-column-hierarchy`를 `QA_SHOTS_DIR`로 지정하고 `QA_ALLOW_OVERWRITE`를 설정하지 않은 상태에서 실제 mock resolver 호출을 시도했다.

실행 원문:

```text
EXISTING_ENTRIES=1
[QA 출력 경로 가드] mock 캡처의 커밋 경로 overwrite 시도를 차단했습니다: C:\dev\Samhan-Public\.claude\worktrees\863-outbox\docs\qa\897-column-hierarchy. 명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.
BLOCKED=TRUE
NODE_EXIT=0
```

기존 파일이 있는 경로임을 `EXISTING_ENTRIES=1`로 확인했고, resolver가 쓰기 디렉터리를 반환하기 전에 차단했다. `QA_ALLOW_OVERWRITE=1`일 때만 명시 경로를 허용하는 회귀 테스트도 통과했다. 확인용 임시 경로는 테스트의 after hook에서 제거했으며 `docs/qa/**`에는 쓰지 않았다.

## 4. real-QA 경로 무훼손 근거

실제 `*-real-qa` 스펙은 기존 `resolveQaShotsDir`를 계속 사용한다. TypeScript helper의 real 경로 기본값은 `path.resolve(committedDir)`로 유지했고, mock 스펙만 `resolveMockQaShotsDir`로 전환했다.

```text
REAL_RESOLVER_FILES=193
REAL_FILES_USING_MOCK_RESOLVER=0
MOCK_FILES_USING_REAL_RESOLVER=0
MOCK_FILES_USING_MOCK_RESOLVER=35
REAL_SAMPLE=
clients/desktop/playwright\31-history-unify-opus-round-real-qa\31-history-unify-opus-round-real-qa.spec.ts
clients/desktop/playwright\17-s4b-price-variant-real-qa\price-variant-live-real-qa.spec.ts
clients/desktop/playwright\720-month-end-close-real-qa\month-end-close-real-qa.spec.ts
```

따라서 real-QA 캡처는 `_local`로 임의 이동하지 않으며, 기존 `docs/qa/<slug>/` 커밋 증거 경로를 계속 대상으로 한다. 범위 밖 ESM/CommonJS legacy 호출은 기존 `_local` 계약을 변경하지 않았다.

## 5. CI 등재 근거

`.github/workflows/qa-e2e.yml`의 `desktop-playwright` 잡에 전용 guard를 추가했고, 기존 mock hard gate 다음에 전체 Playwright 실행이 유지된다.

```text
5:    paths:
7:      - 'clients/**'
14:      - '.github/workflows/qa-e2e.yml'
81:  desktop-playwright:
82:    name: Desktop Playwright (mock 회귀 hard gate)
100:      - name: QA 출력 경로·덮어쓰기 가드
106:      - name: Playwright 실행 (mock 회귀 hard gate — 실패 시 CI fail)
```

실제 실행 순서는 `desktop-playwright` 잡에서 `clients/desktop` `npm ci` → `QA 출력 경로·덮어쓰기 가드` → Chromium 설치 → `Playwright 실행 (mock 회귀 hard gate — 실패 시 CI fail)`이다. workflow `paths`의 `clients/**`와 workflow 파일 조건으로 mock 변경 및 guard 변경 모두 이 잡을 발동시킨다.

## 변경 설계

- `resolveQaShotsDir`: Playwright real-QA 기본 경로를 커밋 디렉터리로 유지한다.
- `resolveMockQaShotsDir`: 기본 경로를 `<committedDir>/_local`로 분리한다.
- `QA_SHOTS_DIR`가 committedDir 또는 그 하위이면 `QA_ALLOW_OVERWRITE=1` 없이는 한국어 오류로 차단한다.
- Windows separator·상위 경로 우회를 막기 위해 `path.resolve`와 `path.relative`로 경계를 검사한다.
- `**/_local/` 기존 ignore 규칙을 사용하므로 mock 실행 결과는 Git 추적 상태에 들어오지 않는다.

