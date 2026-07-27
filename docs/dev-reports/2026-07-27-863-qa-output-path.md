# #863 QA 출력 경로 분리·덮어쓰기 가드

## 2026-07-28 Codex R2 — 물리 경로 동등성·증거 명령 정정

### R2-1 RED 원문

`path.resolve`와 `path.relative`만으로는 저장소 밖에 표기된 junction과 `\\?\\` extended
경로가 물리적으로 `docs/qa` 아래라는 사실을 알 수 없었다. 실제 junction을 임시로 만들고
커밋 증거 디렉터리를 가리킨 현재 HEAD에서 세 resolver를 실행한 원문은 다음과 같다.

```text
cjs:JUNCTION:ALLOWED=C:\Users\user\AppData\Local\Temp\samhan-863-r2-red-all-2bc240086a1c4bfd879279b0114eeebc\junction-to-committed
ts:JUNCTION:ALLOWED=C:\Users\user\AppData\Local\Temp\samhan-863-r2-red-all-2bc240086a1c4bfd879279b0114eeebc\junction-to-committed
mjs:JUNCTION:ALLOWED=C:\Users\user\AppData\Local\Temp\samhan-863-r2-red-all-2bc240086a1c4bfd879279b0114eeebc\junction-to-committed
cjs:EXTENDED:ALLOWED=\\?\C:\dev\Samhan-Public\.claude\worktrees\863-outbox\docs\qa\809-partner-product-price-memory
ts:EXTENDED:ALLOWED=\\?\C:\dev\Samhan-Public\.claude\worktrees\863-outbox\docs\qa\809-partner-product-price-memory
mjs:EXTENDED:ALLOWED=\\?\C:\dev\Samhan-Public\.claude\worktrees\863-outbox\docs\qa\809-partner-product-price-memory
JUNCTION_PHYSICAL_SAME=true
JUNCTION_WRITE_VISIBLE=true
EXTENDED_PHYSICAL_SAME=true
```

실패 테스트도 동일한 결함을 확인했다.

```text
✖ 물리적으로 docs/qa 아래인 junction·extended 표기는 존재하지 않는 하위 경로도 세 resolver가 차단한다
Error: Missing expected exception: cjs:junction-root 물리 경로가 차단되지 않음
```

### R2-1 fix

세 resolver에 같은 물리 경로 판정을 넣었다.

- 후보 경로가 없으면 존재하는 가장 가까운 부모까지 올라가 `fs.realpathSync.native`로
  junction/symlink를 해석한 뒤, 없는 하위 경로 조각을 다시 붙인다.
- `\\?\\` 및 `\\?\\UNC\\` prefix를 제거하고, 구분자·드라이브 대소문자를 정규화한
  물리 경로끼리 `path.relative` 경계를 검사한다.
- 기본 `<committedDir>/_local` 경로와 `QA_ALLOW_OVERWRITE=1` 명시 승격 분기는 변경하지
  않았다. 따라서 첫 캡처 디렉터리가 없어도 판정하고, 정상 승격 캡처도 계속 허용한다.

### R2-1 GREEN 원문

기존 R1 A~D, `_local` 기본값, 승격 opt-in과 함께 junction·extended의 존재/미존재 경로,
후행 구분자·상대/절대·대소문자·드라이브 문자 변형을 세 resolver에 대해 실행했다.

```text
✔ 물리적으로 docs/qa 아래인 junction·extended·표기 변형은 세 resolver가 차단한다
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

### R2-2 증거 명령 정정

과거 커밋의 44를 인용하는 명령은 `HEAD`가 아니라 SHA를 고정하도록 정정했다.

```text
$ git grep -l "docs/qa" 9a474aca2 -- clients/desktop/playwright/ | grep -v -- "-real-qa" | wc -l
44
```

최종 HEAD(`7d72ad01b`)를 같은 범위로 조회하면 R1 fix가 추가한 파일 때문에 45이며, 실제
차이는 `clients/desktop/playwright/support/qa-screenshot-dir.mjs` 하나다.

```text
SHA_9a474aca2_COUNT=44
HEAD_COUNT=45
HEAD_ONLY=clients/desktop/playwright/support/qa-screenshot-dir.mjs
```

### 명시 출력 경로 실 HTTP 캡처

포트 5330·5370은 건드리지 않고 5350에 임시 HTTP 서버를 띄워 mock 모드 없이
Playwright 캡처를 수행했다. `QA_SHOTS_DIR`는 저장소 밖 임시 디렉터리로 지정했으며, 서버와
캡처 파일은 probe 종료 시 정리했다.

```text
REAL_SERVER_HTTP=200 PAGE_HTTP=200
SCREENSHOT_EXISTS=true
PROBE_EXIT=0
```

### 회귀 울타리 최종 원문

```text
$ cd clients/desktop; npm run build
Exit code: 0

$ npm run typecheck
Exit code: 0

$ npm test -- --reporter=dot
Test Files  175 passed (175)
Tests       1632 passed (1632)
EXIT_CODE=0

src/renderer/test-utils/harness-false-green-guard.test.ts (49 tests) ✓

$ CI=1 node_modules/.bin/playwright.cmd test --reporter=line
Running 641 tests using 2 workers
641 passed (6.2m)
PLAYWRIGHT_EXIT=0
```

mock 스위트 실행 전후 저장소 루트에서 확인한 `docs/qa` 4블록 중 전체 status를 제외한
`docs/qa` status, working diff, cached diff는 모두 빈 출력이었다. 전체 status에는 이번
R2의 6개 변경 파일만 남았고 `docs/qa` 변경은 없었다.

```text
--- DOCS_QA_STATUS ---
--- DOCS_QA_DIFF ---
--- DOCS_QA_CACHED_DIFF ---
--- DIFF_CHECK ---
```

> ## 🚨 2026-07-27 R1 재수렴 정정 (PR #952)
>
> 이 문서가 원래 서술한 아래 항목들은 **PM 기획서 자체의 오류**(구현자 책임 아님)로,
> R1 적대검증에서 확인돼 fix 라운드에서 정정됐다.
>
> 1. **기획 전제 자체가 거짓이었다.** "mock 스펙 41개가 `docs/qa` 에 **직접** 기록한다"는
>    전제로 이 슬라이스가 시작됐지만, 실측 결과 **전환 대상 35파일 전부가 `main` 에서 이미
>    `resolveQaShotsDir` 를 경유했고 그 기본값도 이미 `_local` 이었다.** `grep -rl "docs/qa"`
>    는 **쓰기가 아니라 문자열 참조를 센 것**이었고, 그 명령의 실제 결과도 41이 아니라
>    **44** 였다(아래 §1 참조). ⟹ **mock 측 실효 변화는 0** 이었다.
> 2. 이 PR 이 실제로 바꾼 동작은 **회귀 2건**이었다.
>    - **D-1**: mock 스펙을 `resolveQaShotsDir` → `resolveMockQaShotsDir` 로 개명하면서
>      `harness-false-green-guard.test.ts` 의 H-2 가드(`decl.body.includes('resolveQaShotsDir')`
>      부분문자열 검사)가 깨져 전환 대상 34~35파일이 전부 위반으로 뒤집혔다 — Frontend
>      Desktop CI RED 의 원인.
>    - **D-2**: `qa-screenshot-dir.ts` 의 `resolveQaShotsDir`(real-QA 용) 기본값이
>      `path.join(committedDir, '_local')` 에서 `path.resolve(committedDir)` 로 바뀌었다
>      — 아래 §4 가 "유지했다"고 잘못 적은 바로 그 회귀다. 이것은 2026-07-26 PR #938
>      (H-2→D-1)이 **real-QA·mock 공통으로 확정한 `_local` 격리 계약**([[feedback_screenshot_restore_scope_destroys_edits.md]]
>      참조 — 그 fix 이전에 "mock 만 덮고 real-QA 는 뚫려 있어 커밋 증거 12장이 오염된"
>      전례가 있다)을 **되돌리는 회귀**였다.
> 3. **진짜 남은 문제는 하나(D-3)뿐이었다** — §3 의 overwrite 차단 가드가 **자기 슬러그
>    커밋 디렉터리만** 검사해서, 다른 슬러그의 커밋 디렉터리나 `docs/qa` 루트 자체를
>    `QA_SHOTS_DIR` 로 지정하면 전혀 막지 못했다(§3 재실측 참조).
> 4. §3 의 overwrite 차단 실측은 **커밋 증거가 0건인 디렉터리**(`docs/qa/897-column-hierarchy`
>    — `git ls-files` 로 확인하면 추적 파일 0개, `EXISTING_ENTRIES=1` 은 gitignore 된
>    `_local/` 1개였다)에서 이뤄졌다. §3 을 커밋 증거가 실제로 있는 디렉터리로 재실측했다.
>
> **fix 후 상태**: mock 측 이름 변경·전환(D-1 원인)은 되돌렸다(35파일이 다시 `main` 과
> byte-identical). real-QA·mock 공통 단일 `resolveQaShotsDir` 함수로 합쳐 `_local` 기본값을
> 복원하고(D-2 해소), 전역 `QA_SHOTS_DIR` 가 **자기 슬러그든 다른 슬러그든 `docs/qa` 루트
> 자체든** 커밋 증거 트리 어디를 가리켜도 `QA_ALLOW_OVERWRITE=1` 없이는 차단하도록
> 일반화했다(D-3 해소). 상세 근거는 각 절의 인라인 정정과 `clients/desktop/scripts/qa-output-path-guard.test.cjs`
> 참조.

## 범위

Issue #863의 잔여 범위인 Desktop mock QA 산출물 경로만 처리했다. 이미 PR #876에서 해소된 outbox 관측 8개 항목은 수정하지 않았다.

`clients/desktop/playwright`에서 `manual/**`(기본 Playwright `testIgnore` 대상)와 `support/qa-screenshot-dir.*`(공통 helper)를 제외한 mock 인벤토리를 측정했다. `-real-qa` 경로는 별도 측정·보존했다.

## 1. 41개 전수 수치 — 🚨 R1 정정: 실제로는 44개이고, 애초에 "쓰기" 를 센 수치가 아니었다

### 원래 서술(착수 전) — 오류였다

> ~~기획서의 실측과 같은 범위로 `docs/qa` raw 참조 파일을 세었다.~~
> ~~`COUNT=41`~~

**정정(2026-07-27 R1)**: 같은 명령을 R1 검증 대상 커밋(`9a474aca2`)에 그대로 다시 돌리면 41이
아니라 **44** 가 나온다.

```text
$ git grep -l "docs/qa" 9a474aca2 -- clients/desktop/playwright/ | grep -v -- "-real-qa" | wc -l
44
```

최종 HEAD(`7d72ad01b`)에서는 R1 fix가 추가한 `support/qa-screenshot-dir.mjs`도 포함되므로
같은 범위의 결과가 45가 된다. 위의 과거 수치 44를 인용할 때는 반드시 `9a474aca2`를
고정해 실행한다.

더 중요한 문제는 숫자가 아니라 **측정 대상**이다. 이 grep은 `docs/qa` 라는 **리터럴 부분문자열**이
소스에 등장하는 파일을 세지, 실제로 그 경로에 **쓰는(writer)** 파일을 세지 않는다. 그래서:

- **과다 계상** — resolver 정의 파일 자신(`support/qa-screenshot-dir.ts`, 문서 주석에 `docs/qa`
  언급)과, writer 가 아닌 읽기 전용/계약 스펙 5개(`863-status-badge-wrap`·`photo-audit`·
  `sp-08-3-dispatch-parity`·`sp-08-5-2-purchase-slip-edit-put`·`sp-08-8-credential-plaintext-guard`
  — 애초 계획서가 "캡처 writer 가 아니므로 커밋 증거를 생성하지 않는다"고 명시하고 전환 대상에서
  뺐던 파일들), mock 게이트 대상이 아닌 `manual/` 스펙 2개, 공용 helper 의 `QA_DIR` 를 참조만 하는
  `mig-14-admin-ui` 자매 스펙 2개가 섞여 있다(합 10개 — writer 로 전환된 게 아니다).
- **과소 계상** — `897-column-hierarchy.spec.ts` 는 `join(process.cwd(), '..', '..', 'docs', 'qa',
  '897-column-hierarchy')` 처럼 `'docs'`·`'qa'` 를 **별도 인자**로 넘겨서, 실제로는 mock writer
  전환 대상(35개 중 하나)이었는데도 이 grep 의 리터럴 부분문자열 매치에는 잡히지 않는다.

즉 "41개 전수"·"41−35=6" 이라는 산술은 **애초에 근거가 부정확한 측정을 기준으로 한 것**이었다.
실제로 mock resolver 로 전환된 파일 수는 아래 §"처리 후"의 `MOCK_FILES_USING_MOCK_RESOLVER=35`
가 유일하게 신뢰할 수 있는 수치이고(코드 자체를 정적으로 스캔해 산출), **35개 전부가 이번 R1
fix 라운드에서 `main` 과 byte-identical 하게 되돌려졌다**(전제가 거짓이었으므로 — 위 배너 참조).

### 처리 후(원래 서술 — 이제 사실상 폐기된 접근을 기록으로 남김)

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

**R1 정정**: 위 "raw docs/qa 파일=41" 은 실제로는 44(위 참조)였고, `resolveMockQaShotsDir` 라는
별도 함수 자체가 D-1 회귀(H-2 가드 부분문자열 검사 파괴)의 원인이었다 — mock 측 이름 변경·전환은
R1 fix 라운드에서 전부 되돌리고 `resolveQaShotsDir` 단일 함수로 합쳤다.
자세한 내용은 `clients/desktop/scripts/qa-output-path-guard.test.cjs` (재작성됨) 참조.

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

**R1 재확인(2026-07-27, fix 후)** — 위 D-1/D-2 되돌림 + D-3 fix 이후 동일 스위트를 다시 돌렸다.

```text
$ CI=1 node_modules/.bin/playwright.cmd test --reporter=line
...
  641 passed (6.4m)
EXIT_CODE=0
```

`git status --short --untracked-files=all -- docs/qa`·`git diff --stat -- docs/qa`·
`git diff --name-only -- docs/qa` 모두 여전히 무출력 — fix 후에도 `docs/qa` 무변경은 그대로다.
같은 세션에서 `clients/desktop` 의 `npm test`(vitest, `harness-false-green-guard.test.ts` 포함
49개 하네스 가드 테스트)도 실행해 **가드 파일 자체를 수정하지 않고** 전부 통과함을 확인했다
(1631 passed / 1632 — 유일한 실패는 `src/main/build-output-cjs-interop.test.ts`로, `npm run
build` 로 `out/main/index.js` 를 먼저 만들어야 하는 #909 계열의 **무관한 사전조건 테스트**이고
이 fix 라운드가 건드린 어떤 파일과도 관련이 없다).

## 3. overwrite 차단 실측 — 🚨 R1 정정: 커밋 증거 0건 디렉터리에서 측정했던 것을 재실측

**원래 서술의 결함(R1 적대검증 지적)**: 아래 원문이 가리키는 `docs/qa/897-column-hierarchy` 는
**`git ls-files` 로 확인하면 추적 파일이 0개다** — `EXISTING_ENTRIES=1` 이 가리킨 "기존 항목"은
gitignore 된 `_local/` 디렉터리 1개였지, 커밋된 QA 증거가 아니었다. 즉 "커밋 경로 overwrite 를
막았다"는 주장을 **커밋 증거가 실제로 있는 디렉터리로 검증한 적이 없었다**.

> ~~기존 커밋 QA 디렉터리 `docs/qa/897-column-hierarchy`를 `QA_SHOTS_DIR`로 지정하고
> `QA_ALLOW_OVERWRITE`를 설정하지 않은 상태에서 실제 mock resolver 호출을 시도했다.~~
> ```text
> ~~EXISTING_ENTRIES=1~~
> ~~[QA 출력 경로 가드] mock 캡처의 커밋 경로 overwrite 시도를 차단했습니다: …897-column-hierarchy. …~~
> ~~BLOCKED=TRUE~~
> ~~NODE_EXIT=0~~
> ```

### 재실측(2026-07-27 R1) — 추적 PNG 504장을 가진 실제 커밋 증거 디렉터리로

```text
$ git ls-files docs/qa/897-column-hierarchy | wc -l
0
$ git ls-files 'docs/qa/*.png' | sed -E 's#^docs/qa/([^/]+)/.*#\1#' | sort | uniq -c | sort -rn | head -3
    504 809-partner-product-price-memory
     78 supplier-profile-bank-stamp
     69 920-codef-scope-lock
```

`docs/qa/809-partner-product-price-memory`(git 추적 파일 515개, PNG 504장 포함)를 `QA_SHOTS_DIR`로
지정하고 `QA_ALLOW_OVERWRITE` 없이 (R1 fix 후) `resolveQaShotsDir`를 호출했다.

실행 원문:

```text
TRACKED_ENTRIES=515
EXISTING_ENTRIES=20
[QA 출력 경로 가드] 커밋된 QA 증거 경로로 overwrite 시도를 차단했습니다: C:\dev\Samhan-Public\.claude\worktrees\863-outbox\docs\qa\809-partner-product-price-memory. 명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.
BLOCKED=TRUE
NODE_EXIT=0
```

`TRACKED_ENTRIES=515`로 이번에는 실제 git 추적 커밋 증거가 있는 디렉터리임을 확인했고, resolver가
디렉터리를 반환/생성하기 전에 차단했다(실행 후 `git status --short -- docs/qa` 무출력으로
`docs/qa` 무변경 확인). `QA_ALLOW_OVERWRITE=1`일 때만 명시 경로를 허용하는 회귀 테스트도
`clients/desktop/scripts/qa-output-path-guard.test.cjs`에서 통과했다.

### D-3 — 자기 슬러그만 막고 다른 슬러그·루트는 못 막던 문제(R1 fix 로 해소)

R1 적대검증은 위 overwrite 가드가 **호출자 자신의 committedDir 하고만** 비교해서, 다음 두
케이스를 전혀 막지 못한다는 것을 지적했다: (A) 다른 슬러그의 커밋 디렉터리를 `QA_SHOTS_DIR`로
지정, (C) `docs/qa` 루트 자체를 지정. 반면 (B) 자기 슬러그 지정과 (D) 자기 슬러그를 `..` 로
우회 표기하는 것은 이미 막고 있었다. fix 전/후 4케이스 전수 재현 원문(OLD=HEAD `9a474aca2`,
NEW=R1 fix 후):

```text
=== OLD (HEAD 9a474aca2, resolveMockQaShotsDir) — fix 전 ===
  [A (다른 슬러그 커밋 디렉터리)] BLOCKED=FALSE → 반환값: …docs\qa\809-partner-product-price-memory
  [B (자기 슬러그 커밋 디렉터리)] BLOCKED=TRUE  → […]
  [C (docs/qa 루트 자체)] BLOCKED=FALSE → 반환값: …docs\qa
  [D (자기 슬러그 .. 우회)] BLOCKED=TRUE  → […]

=== NEW (fix 후, resolveQaShotsDir 단일함수) — fix 후 ===
  [A (다른 슬러그 커밋 디렉터리)] BLOCKED=TRUE  → […]
  [B (자기 슬러그 커밋 디렉터리)] BLOCKED=TRUE  → […]
  [C (docs/qa 루트 자체)] BLOCKED=TRUE  → […]
  [D (자기 슬러그 .. 우회)] BLOCKED=TRUE  → […]
```

fix는 비교 기준을 호출자의 committedDir 이 아니라, 이 resolver 모듈 자신의 위치에서 고정
도출한 레포의 커밋 QA 증거 루트(`DOCS_QA_ROOT` = `docs/qa` 전체)로 바꿨다 — 자기 슬러그든
남의 슬러그든 루트 자체든 `docs/qa` 아래 어디를 가리켜도 동일하게 차단된다. 회귀 테스트
4종(D-3 [A]~[D])을 `clients/desktop/scripts/qa-output-path-guard.test.cjs`에 추가했다.

## 4. real-QA 경로 무훼손 근거 — 🚨 R1 정정: "유지했다"가 아니라 실제로는 바꿨다(회귀 D-2)

**원래 서술의 오류**: 아래 "TypeScript helper의 real 경로 기본값은 `path.resolve(committedDir)`로
**유지**했고"는 사실과 반대다. `main`(및 이 파일의 `.mjs`/`scripts/lib/qa-shots-dir.cjs` 버전,
둘 다 이 PR 에서 손대지 않음)의 `resolveQaShotsDir` 기본값은 `path.join(committedDir, '_local')`
이었다 — 2026-07-26 PR #938(H-2→D-1)이 "mock 만 `_local` 격리했다가 real-QA 가 뚫려 커밋 증거
12장이 오염된" 사고 이후 real-QA·mock 공통으로 확정한 계약이다. 그런데 이 PR 의
`clients/desktop/playwright/support/qa-screenshot-dir.ts` 는 real-QA 용 `resolveQaShotsDir`의
기본값을 `path.resolve(committedDir)`(오버라이드 없이도 **곧바로 커밋 디렉터리**)로 **바꿨다** —
즉 "유지"가 아니라 **#938 이 막았던 문제를 real-QA 표면에 재도입한 회귀**였다(R1 적대검증
D-2). `.mjs`/`.cjs` 버전은 애초에 손대지 않아 `_local` 계약을 유지했으므로, 이 PR 의 3벌 중
`.ts` 하나만 다른 답을 내는 상태였다.

**R1 fix**: `.ts` 의 `resolveQaShotsDir` 기본값을 `path.join(committed, '_local')` 로
복원했다(3벌 parity 회복). 이제 real-QA·mock 이 공통으로 사용하는 단일 함수이며, 아래는
그 확정된 계약을 재확인한 근거다.

원래 서술(mock/real 을 별도 함수로 갈랐던 시점의 근거 — 이제 단일 함수로 합쳐졌다):

실제 `*-real-qa` 스펙은 기존 `resolveQaShotsDir`를 계속 사용한다. ~~TypeScript helper의 real 경로 기본값은 `path.resolve(committedDir)`로 유지했고~~(→ 위 정정 참조), mock 스펙만 `resolveMockQaShotsDir`로 전환했다(→ R1 에서 되돌림, `resolveQaShotsDir` 단일 함수로 통합).

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

**R1 정정**: `.github/workflows/qa-e2e.yml`의 이 step 자체(이름·실행 명령 `node --test
scripts/qa-output-path-guard.test.cjs`)는 R1 fix 로 바뀌지 않았다 — 바뀐 것은 그 테스트 파일의
**내용**(§1·§3·변경 설계 참조)이다. 로컬에서 `node --test scripts/qa-output-path-guard.test.cjs`
재실행 결과는 7 tests / 7 pass / 0 fail (EXIT=0).

## 변경 설계 — 🚨 R1 정정: mock/real 분리 설계 자체를 폐기하고 단일 함수로 되돌렸다

### 원래 서술(폐기됨 — 기록 보존)

> ~~`resolveQaShotsDir`: Playwright real-QA 기본 경로를 커밋 디렉터리로 유지한다.~~
> ~~`resolveMockQaShotsDir`: 기본 경로를 `<committedDir>/_local`로 분리한다.~~
> ~~`QA_SHOTS_DIR`가 committedDir 또는 그 하위이면 `QA_ALLOW_OVERWRITE=1` 없이는 한국어 오류로 차단한다.~~

이 설계는 (a) 애초에 존재하지 않던 문제(mock 이 이미 `_local` 을 쓰고 있었다)를 풀려고 real-QA
전용 함수를 새로 갈랐다가 real-QA 의 `_local` 계약(#938 확정)을 깼고, (b) 이름이 갈리며
H-2 가드(부분문자열 검사)를 깼다.

### R1 fix 후 설계

- `resolveQaShotsDir` **단일 함수**(`.ts`/`.mjs`/`scripts/lib/qa-shots-dir.cjs` 3벌, 동일 계약) —
  real-QA·mock 공통. mock 측 이름 변경·전환(`resolveMockQaShotsDir`)은 전부 되돌렸다.
- 기본 경로(QA_SHOTS_DIR 미지정)는 `<committedDir>/_local` — #938 이 확정한 계약을 복원.
- `QA_SHOTS_DIR` 가 지정됐고 그 경로가 레포의 커밋 QA 증거 루트(`docs/qa` 전체 — 자기
  슬러그·다른 슬러그·루트 자체 불문) 안에 들어가면 `QA_ALLOW_OVERWRITE=1` 없이는 한국어
  오류로 차단한다(D-3 — 비교 기준을 "호출자의 committedDir" 에서 "고정된 `docs/qa` 루트"로
  일반화해 다른 슬러그·루트 자체 케이스까지 덮는다).
- Windows separator·상위 경로 우회를 막기 위해 `path.resolve`와 `path.relative`로 경계를 검사한다(불변).
- `**/_local/` 기존 ignore 규칙을 사용하므로 mock 실행 결과는 Git 추적 상태에 들어오지 않는다(불변).
- `clients/desktop/scripts/qa-output-path-guard.test.cjs` 는 이 단일 함수의 기본값·D-3 4케이스
  (A~D)·`QA_ALLOW_OVERWRITE=1` 탈출구·resolver 3벌 parity(`.mjs` 실행 비교 + `.ts` 구조 마커)를
  검증하도록 재작성했다. 원래 있던 "raw docs/qa 파일=41개" 카운트 테스트는 위 §1 이 설명하는
  이유로 폐기했다(그 자리를 대신하는 더 정확한 검사는 `harness-false-green-guard.test.ts` 의
  H-2). 원래 파일의 `84-89`행("real Playwright resolver는 커밋 경로를 기본 대상으로 선언한다"
  — 이름은 "커밋 경로가 기본"이라면서 import 는 `.cjs`, 실제 단언은 `_local` 이었던 이름·단언
  불일치, R1 지적)도 이 재작성으로 해소됐다(그 테스트 자체가 더 이상 존재하지 않는다 —
  대신 위에서 서술한 parity 테스트가 그 자리를 대신한다).
