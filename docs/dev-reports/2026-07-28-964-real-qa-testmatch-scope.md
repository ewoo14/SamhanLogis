# #964 공유 real-QA 수집 범위와 로컬 파생물 신선도 구현 보고

작성: 2026-07-28 · 구현: CODEX LUNA 5.6 · 워크트리: `chore/964-real-qa-testmatch-scope`

## 결론

공유 `playwright.real-qa.config.ts`는 기본 실행 전에 디스크의 `*-real-qa.spec.ts` 집합과
`git ls-files --cached` 추적 집합을 이름 단위로 비교한다. 차집합이 있으면 정확한 파일명을
출력하고 공식 실행을 중단한다. `.gitignore` 규칙을 추적 판정에 사용하지 않으므로 `manual/`
및 `dispatch-collab-real-qa/` 안의 추적 스펙도 유지된다.

미추적 스펙을 의도적으로 실행하는 경로는 `REAL_QA_ALLOW_UNTRACKED=1`과 명시 파일 경로를
함께 쓰는 방식으로 문서화했고 실제 1건 실행을 확인했다. `npm run typecheck`와 `npm test`는
design-system `dist`, `electron-updater`, Electron `out/main/index.js` 신선도를 먼저 확인해
낡은 파생물 오류를 코드 오류와 구분한다.

## 변경 전 기준선

실측 결과:

```text
Total: 548 tests in 172 files
renderer: Total: 547 tests in 171 files
order-app: Total: 1 test in 1 file
disk=172, tracked=172, untracked=0, missing=0
```

F-2 앵커는 둘 다 추적·디스크 집합에 있었다.

```text
clients/desktop/playwright/manual/slip-form-3d-real-qa.spec.ts
clients/desktop/playwright/dispatch-collab-real-qa/dispatch-collab-real-qa.spec.ts
```

대조군도 기준선과 같았다.

```text
mock Playwright: Total: 652 tests in 117 files
Vitest: Test Files 179 passed (179), Tests 1648 passed (1648)
```

`.github/workflows/` 전체에서 `real-qa|real_qa|realqa` 검색 결과는 0건이다. 따라서 이
config의 대조 상대는 CI 집합이 아니라 Git 추적 집합이다.

## M-1 미추적 스펙 주입 왕복

주입 경로:

```text
clients/desktop/playwright/n1b-native-qa/zzz-diag964-real-qa.spec.ts
```

`git status --porcelain -- <주입 경로>`의 원문은 빈 출력이었다. 전체 워크트리는 이 구현의
의도된 수정 파일이 이미 있으므로 전체 `git status --porcelain`는 clean일 수 없으며, 주입
파일이 별도 상태 행을 만들지 않았다는 방식으로 확인했다.

`git check-ignore -v` 원문:

```text
.gitignore:93:clients/desktop/playwright/n1b-native-qa/	clients/desktop/playwright/n1b-native-qa/zzz-diag964-real-qa.spec.ts
```

### M-1 RED

수집 게이트 `node --test scripts/real-qa-scope.test.cjs` 원문:

```text
✖ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다 (1237.5443ms)
✔ F-2: .gitignore 등재 경로 안의 추적 스펙 2개가 공식 집합에 남는다 (898.6164ms)
ℹ tests 2
ℹ pass 1
ℹ fail 1

AssertionError [ERR_ASSERTION]: 미추적 스펙이 공식 집합에 섞였습니다.
+ [
+   'clients/desktop/playwright/n1b-native-qa/zzz-diag964-real-qa.spec.ts'
+ ]
- []
```

공유 Playwright config를 기본 모드로 목록화한 실행도 같은 파일명을 포함해 다음 오류로
중단됐다.

```text
Error: [real-QA 추적 집합 불일치] 공식 공유 하네스 실행을 중단합니다.
디스크에는 있지만 Git 추적 목록에는 없는 스펙(공식 수치에 섞이지 않음):
- clients/desktop/playwright/n1b-native-qa/zzz-diag964-real-qa.spec.ts
```

### M-1 GREEN 및 I-3

주입물을 삭제한 뒤 원문:

```text
✔ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다
✔ F-2: .gitignore 등재 경로 안의 추적 스펙 2개가 공식 집합에 남는다
ℹ tests 2
ℹ pass 2
ℹ fail 0
Total: 548 tests in 172 files
```

같은 주입물을 의도 실행 모드에서 실제 실행한 원문:

```text
Running 1 test using 1 worker
[1/1] [renderer] › playwright\n1b-native-qa\zzz-diag964-real-qa.spec.ts:3:1 › DIAG964 미추적 로컬 스펙 수집 probe
1 passed (2.3s)
[real-QA 로컬 실행 모드] 위 차집합은 의도 실행으로 허용했으며 공식 수치로 사용하지 마십시오.
```

즉, 기본 공식 경로는 혼입을 중단하고, 명시적인 로컬 경로는 살아 있다.

## M-2 `.gitignore` 기준 순진 mutation

`real-qa-scope.cjs`의 추적 목록에 `.gitignore`에 적힌 7개 디렉터리를 제외하는 임시
mutation을 적용했다. `gitignore` 대상이라는 이유만으로 추적 파일을 제거하는 경우를
재현하기 위한 실험이며, 실험 직후 원복했다.

### M-2 RED 원문

```text
✖ F-2: .gitignore 등재 경로 안의 추적 스펙 2개가 공식 집합에 남는다 (1676.4521ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1

AssertionError [ERR_ASSERTION]: clients/desktop/playwright/manual/slip-form-3d-real-qa.spec.ts가 Git 추적 집합에서 빠졌습니다.
```

### M-2 mutation 원복 후 GREEN 원문

```text
✔ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다
✔ F-2: .gitignore 등재 경로 안의 추적 스펙 2개가 공식 집합에 남는다
ℹ tests 2
ℹ pass 2
ℹ fail 0
Total: 548 tests in 172 files
```

이 결과로 판정 기준은 `.gitignore` 규칙이 아니라 Git index의 `--cached` 추적 목록으로
고정했다. 따라서 F-2의 두 파일은 배제되지 않는다.

## 로컬 파생물 신선도

새 `real-qa-scope.cjs`가 다음을 검사한다.

- `clients/web/design-system/dist/index.d.ts`가 소스보다 오래됐는지
- `clients/desktop/node_modules/electron-updater`가 lock 버전과 일치하는지
- `npm test` 전에 `clients/desktop/out/main/index.js`가 main/preload 소스보다 오래됐는지

초기 이 워크트리에는 세 파생 표면 중 `dist`, `out`, `node_modules`가 없어 원래 13일 stale
산출물 상태를 그대로 재현할 수는 없었다. design-system build, desktop `npm ci`, desktop
build를 실제 실행한 뒤 신선도 GREEN을 확인했다.

산출물 시간을 임시로 하루 전으로 되돌린 stale mutation의 RED 원문:

```text
[로컬 파생물 신선도 확인 실패] 검증 결과를 코드 결함으로 해석하지 마십시오.
- Electron main 빌드 산출물 out/main/index.js이(가) 소스보다 오래됐습니다: out\main\index.js
산출물=2026-07-27T01:09:51.825Z, 최신 소스=src\preload\samhanApi.ts (2026-07-28T00:03:34.855Z)
코드 오류로 단정하지 말고 먼저 npm run build
```

시간 원복 후 `npm test`는 다음으로 통과했다.

```text
[로컬 파생물 신선도] test 대상 산출물 확인 완료
Test Files 179 passed (179)
Tests 1648 passed (1648)
```

처음 `npm ci --ignore-scripts` 직후에는 Electron 설치 스크립트가 실행되지 않아 기존
`build-output-cjs-interop.test.ts`가 `Electron failed to install correctly`로 RED였다.
`npm rebuild electron` 후 재실행해 통과했다. 이는 코드 결함이 아니라 설치 파생물 상태임을
구분할 수 있는 원문 사례다.

## 회귀 울타리

| 울타리 | 결과 |
|---|---|
| F-1 | 전체 `548/172`, renderer `547/171`, order-app `1/1` 유지 |
| F-2 | 두 추적 앵커 이름 모두 유지 |
| F-3 | 두 프로젝트 합계 `547 + 1 = 548`, 중복·누락 없음 |
| F-4 | mock `652/117` 유지 |
| F-5 | mock config의 `**/*-real-qa.spec.ts`·`**/*-real-qa/**` testIgnore 미변경 |
| F-6 | 추적 `manual/slip-form-3d-real-qa.spec.ts` 명시 실행 목록 `1/1` |
| F-7 | 미추적 명시 실행 실제 `1 passed` |
| F-8 | `tsconfig.node.json`의 `playwright.real-qa.config.ts` include 유지, typecheck GREEN |

검증 결과:

```text
npm run typecheck  → exit 0
npm run lint       → exit 0, 0 errors / 103 existing warnings
npm test           → 179 files / 1648 tests passed
```

## 계열 전수 sweep

`testMatch` 문자열을 grep한 10개 파일은 다음과 같다.

```text
clients/desktop/playwright.real-qa.config.ts
clients/desktop/playwright/928-web-version-check-real-qa/playwright.config.ts
clients/desktop/playwright/920-codef-scope-lock-real-qa/r4-verify.config.ts
clients/desktop/playwright/920-codef-scope-lock-real-qa/rA-closing.config.ts
clients/desktop/playwright/920-codef-scope-lock-real-qa/rB-bound-revert.config.ts
clients/desktop/playwright/groupware-approval-line-config-s4b/mock.config.ts
clients/desktop/playwright/groupware-approval-line-config-s4c/mock.config.ts
clients/desktop/playwright/manual/e3-s1-cash-receipt-permission-qa.config.ts
qa/playwright/playwright.config.ts
qa/detox/e2e/jest.config.js
```

판정:

- 광범위 real-QA 수집 대상은 공유 config 1개이며 이번 변경으로 정합성 검사를 추가했다.
- `928-web-version-check-real-qa/playwright.config.ts`도 디렉터리 내부 `*-real-qa` glob을
  쓰지만 order-app 단일 하네스의 별도 config다. 범위 동결에 따라 이번 PR에서 확장하지 않았다.
- 나머지는 명시 슬라이스 파일/디렉터리 또는 qa 전용 정규식 project다. 공유 real-QA의
  디스크 집합 문제와 같은 광범위 대상은 아니다.
- mock 게이트와 Vitest는 기준 실측에서 오염 0건이라 수정하지 않았다.

## 변경 파일 및 줄 수

```text
clients/desktop/scripts/real-qa-scope.cjs       +191 / -0  새 집합·파생물 정합성 helper
clients/desktop/scripts/real-qa-scope.test.cjs   +28 / -0  별도 node:test 회귀 게이트
clients/desktop/playwright.real-qa.config.ts    +20 / -1  공식 실행 사전검사·로컬 경로 문서
clients/desktop/package.json                     +3 / -2  typecheck/pretest 연결
clients/desktop/README.md                        +21 / -0  사용법·신선도 계약 문서
docs/dev-reports/2026-07-28-964-real-qa-testmatch-scope.md +192 / -0  원문·울타리 보고
```

기존 파일 변경분은 `git diff --numstat`로 확인했고, 새 파일은 실제 파일 줄 수를 세었다.
보고서 자체도 현재 파일의 실제 192줄로 반영했다.

## 못 한 것과 범위 확대 제안

- 실제 공유 real-QA 548건을 실서버에 전부 실행하고 다수 스크린샷을 확보하지 못했다. 이
  워크트리에는 실서버와 공유 QA 계정이 없고, 사용자가 금지한 가짜 데이터·합성 캡처를 만들지
  않았다. `--list` 기준선과 주입 스펙의 실제 1건 실행만 수행했다.
- GitHub CI를 이 워크트리에서 실행하거나 PR 코멘트를 수정하지 않았다. Git 조작, PR 등록,
  다른 워크트리·메인 트리 접근도 하지 않았다.
- `928-web-version-check-real-qa/playwright.config.ts`의 별도 glob 수집은 목록에 보고만 했다.
  필요하면 범위 확대 제안으로 같은 helper를 order-app config에도 적용할 수 있지만, 이번
  PM 범위에는 포함하지 않았다.
- `.gitignore`, `.github/workflows/qa-e2e.yml`, `harness-false-green-guard.test.ts`,
  `assert-playwright-ran.mjs` 및 PR #957 소유 파일은 수정하지 않았다.

상태: **DONE_WITH_CONCERNS** — 구현·M-1·M-2·회귀 울타리·로컬 실행 경로는 검증했지만, 실서버
548건 라이브 QA와 실제 스크린샷은 환경상 수행하지 않았다.

---

## R1 적대검증 라운드 fix (2026-07-28, SONNET5)

OPUS 5-agent 라운드 + PM 라이브QA 가 도달 가능 결함 8건(BLOCKING 1·HIGH 4·MED 2·게이트 1)을
찾았다. 전부 `scripts/real-qa-scope.cjs`·`real-qa-scope.test.cjs`·`playwright.real-qa.config.ts`·
`README.md` 범위 안에서 RED-first 로 고쳤다.

### 결함별 원인·수정 요약

| # | 결함 | 원인 | 수정 |
|---|---|---|---|
| 1 [BLOCKING] | `REAL_QA_ALLOW_UNTRACKED=1` 세션 잔존이 명시 경로 없는 전체 실행까지 오염 | 코드가 env var 만 읽고 "명시 경로" 를 검사하지 않음 | `assertRealQaScope` 가 `argv` 에서 명시 경로를 판정해 narrow 실행일 때만 플래그를 인정. 전체 실행은 플래그를 아예 참조하지 않음. 예외 모드 경고를 stdout+stderr 둘 다에 기록 |
| 2 [HIGH] | 같은 플래그가 집합 축소(missingFiles, #864 계열)까지 덮음 | `mismatch = untracked\|\|missing` 을 한 플래그로 무력화 | missingFiles 는 narrow/전체 실행 무관, allowUntracked 값 무관 항상 차단 |
| 3 [HIGH] | 미추적 스펙 1개가 추적 스펙만의 격리 실행까지 차단 | 스코프 검사가 요청 파일과 무관하게 트리 전체를 비교 | 명시 경로가 가리키는 파일만 추린 뒤(`resolveRequestedFiles`) 무관한 차집합은 무시 |
| 4 [HIGH] | 신선도 게이트가 mtime 만 바뀌어도 `npm test`/`typecheck` 전량을 막고 탈출구 없음 | 판정 기준이 내용이 아니라 mtime | `REAL_QA_SKIP_FRESHNESS_CHECK=1` 탈출구 추가(사용 시 항상 표준출력에 건너뛴 사실 기록) |
| 5 [MED] | 신선도 안내의 `cd` 대상이 출력 위치에서 존재하지 않는 경로 | `cd clients/web/design-system` 하드코딩(repo-root 기준) vs 산출물 경로는 cwd 기준 | `path.relative(process.cwd(), designSystemRoot)` 로 동적 계산 — 항상 같은 기준 |
| 6 [HIGH] | 다음 슬라이스가 스펙 1개만 추가해도 CI `frontend-desktop` RED | `assert.equal(count, 172)` 로 증감 모두 차단 | `count >= 172` 최소-기준으로 완화(감소만 계속 차단) |
| 7 [MED] | 게이트의 "확인 완료" 가 `file:` 링크 무결성까지 확인한 것처럼 과잉 신뢰 유발 | 성공 메시지가 검사 범위를 명시하지 않음 | PM 지시대로 검사 확대 없이 메시지에 실제 대상(2~3종)만 명시 + "그 외는 이어지는 tsc/vitest 원본 오류로 드러남" 명문화 |
| 8 [게이트] | `core.quotepath` 8진 이스케이프로 비ASCII 추적 스펙이 tracked 집합에서 사라짐 | `git ls-files --cached`(quotepath 기본 true)가 비ASCII 이름을 따옴표+이스케이프 → `.endsWith(SUFFIX)` 실패 | `git ls-files -z`(NUL 구분, quotepath 무관하게 이스케이프 없음)로 교체 |

### 실측 중 추가로 발견해 같이 고친 것(8건 목록 밖)

- **Playwright 워커 프로세스가 config 를 별도 프로세스로 재로드하며 그 프로세스의
  `process.argv` 에는 원래 CLI 인자가 없다**(실측: `node_modules/playwright/lib/common/
  process.js`, argv 예: `["node", ".../process.js"]`). `--list` 로는 안 드러나고
  `REAL_QA_ALLOW_UNTRACKED=1` 로 **실제 실행**해야만 드러났다 — 결함1·3 의 narrow 판정이
  워커 단계에서 다시 "명시 경로 없는 전체 실행" 으로 오판돼 막혔다(메인 프로세스는 통과, 워커가
  다시 차단하는 형태로 관찰). 메인 프로세스가 argv 에서 명시 경로를 찾으면 **자기 자신의
  `process.env`** 에 마커(`REAL_QA_EXPLICIT_PATH_ARGS__INTERNAL`)를 남기고, 워커는 fork 시
  물려받은 그 값을 읽는다. 부모→자식 단방향이라 PowerShell 세션으로는 새지 않는다(U-2 유지).
  전용 회귀 테스트(워커 argv 형태를 흉내낸 2단계 호출)로 고정했다.
- **`git ls-files -z` 로 교체하며 split 구분자로 쓴 NUL 문자가 소스에 리터럴 바이트로 저장돼
  `git diff`/`grep` 이 그 파일을 바이너리로 취급**(`git diff` 가 "Binary files … differ" 로
  나와 리뷰 시 실제 코드 변경이 전혀 안 보이는 상태였다). 이스케이프 시퀀스 텍스트
  `\u0000`(6글자)로 정정해 일반 텍스트 diff 로 복구했다.

### RED-first 증거(요약, 전체 원문은 세션 로그)

수정 전 `node --test scripts/real-qa-scope.test.cjs`: **13 개 중 8 개 RED**(결함1×2·2·3·8·
4-탈출구·5·7 — 정확히 대상 결함과 1:1 대응, `checkFreshnessOrSkip is not a function` 크래시
2건 포함). 수정 후 **14/14 GREEN**(워커 전파 회귀 테스트 1건 추가). 결함 1·2·3·4-탈출구·5·7·8
및 워커 전파 fix 총 8건 각각 **뮤테이션 RED 재현**(fix 를 한 곳씩 되돌려 해당 테스트만 RED
확인 후 원복) 완료.

### 회귀 울타리 재확인(수정 후, 실제 실행 원문)

```text
공식 전체: Total: 548 tests in 172 files   (renderer 547/171, order-app 1/1)
mock 게이트: Total: 652 tests in 117 files
npm test: Test Files 179 passed (179), Tests 1648 passed (1648)
npm run typecheck: exit 0 (real-qa-scope.test.cjs 14/14 포함)
npm run lint: exit 0, 0 errors / 103 warnings(기존과 동일)
M-1 왕복: 미추적 스펙 주입 → 공식 전체 실행 차단 확인 → 제거 → 548/172 복원 확인
M-2: F-2 테스트로 .gitignore 경로 안 추적 스펙 2개 유지 확인
README 예시 명령 2종(narrow 무플래그·ALLOW_UNTRACKED+명시경로) 실제 실행으로 검증
```

### 계열 전수 sweep

- ①환경변수로 게이트를 완화하는 다른 지점: `grep process.env` 결과 `PLAYWRIGHT_SKIP_WEB_SERVER`
  (playwright.config.ts, 무관한 mock 게이트 자체 설정) · `CAPTURE_MODE`(src/main, QA 캡처 모드,
  게이트 아님) · `VIEW_ONLY`·`PLAYWRIGHT_SKIP_UI`(개별 스펙의 자체 스킵 로직, 공유 스코프/신선도
  게이트와 무관) 뿐 — real-qa-scope.cjs 밖에 같은 패턴(세션 잔존이 공식 수치를 오염)은 없음.
- ②하드코딩된 기대 수치: `clients/` 전체에서 `assert.equal(...length, 숫자)` 패턴은
  real-qa-scope.test.cjs 자신(결함6, 이미 수정)뿐.
- ③`git ls-files` 출력 파싱: 코드로는 real-qa-scope.cjs 하나뿐(다른 2개 매치는 주석 속 문구).
  `harness-false-green-guard.test.ts`(PR #957 소유, 동결 대상)에도 "git ls-files" 언급이 있으나
  실제로는 `fs.existsSync` 기반 판정이라 quotepath 문제와 무관 — 수정 불필요, 참고로만 기록.

### 변경 파일 및 줄 수(git diff --numstat)

```text
clients/desktop/scripts/real-qa-scope.cjs        +165 / -16  결함1·2·3·4·5·7·8 + 워커 전파 fix
clients/desktop/scripts/real-qa-scope.test.cjs   +402 / -6   8건 RED 테스트 + 워커 전파 회귀 테스트(node:test, 임시 git repo/fixture 기반, 실 레포 비접촉)
clients/desktop/playwright.real-qa.config.ts     +11 / -0    새 시맨틱 문서화(주석만)
clients/desktop/README.md                        +35 / -6    사용법·탈출구·계약 문구 갱신
```

### 못 한 것

- 실서버 548건 전체 실행·스크린샷은 이번 라운드 범위 밖(원 구현 보고의 DONE_WITH_CONCERNS 사유가
  그대로 이월). scope/신선도 게이트 자체의 RED-first 검증에 집중했다.
- 결함6 의 뮤테이션 RED 는 실 레포 트래킹 파일 수가 정확히 172 라 "늘어난 상태" 를 git 조작
  없이 재현할 방법이 없어, 합성 값(173 vs 172)으로 옛 방식(`assert.equal`)이 RED 였음을 고정
  테스트로 남기는 방식을 썼다(라이브 뮤테이션 아님 — 정직하게 기록).
- CI(다음 커밋 SHA)는 PM 이 commit·push 한 뒤에만 확정되므로 이 세션에서는 로컬 동등 체크
  (typecheck·test·lint) 로 갈음했다.

---

## R2 재수렴 라운드 fix (2026-07-28, SONNET5)

OPUS 재수렴 라운드가 도달 가능 결함 2건(HIGH 1·MED 1) + PM 판정 경계선 1건을 찾았다. 전부
`scripts/real-qa-scope.cjs`·`real-qa-scope.test.cjs` 범위 안에서 RED-first 로 고쳤다. 검증
중 **새 경계 오인 회귀 1건을 자체 발견**해 같은 라운드에서 함께 고쳤다(계열 sweep 산출물,
아래 "자체 발견" 절 참고).

### 결함별 원인·수정 요약

| # | 결함 | 원인 | 수정 |
|---|---|---|---|
| R2-1 [HIGH] | 위치 인자 매칭이 "repo 상대경로 접미사" 한 형태만 통과시키고, 오류 메시지가 명시 경로를 준 사용자에게 "명시 경로가 있는 실행에만 적용" 이라며 모순 안내 | `argReferencesFile` 이 문자열 접미사 비교였다 — Playwright 의 실제 위치 인자는 절대경로에 대한 정규식 부분일치 필터(`forceRegExp`)다 | `resolveRequestedFiles` 가 설치된 playwright 패키지의 `createFileMatcherFromArguments`(공식 `exports` 서브패스 `playwright/lib/util`)를 그대로 위임 — 글롭·조각·절대경로 전부 Playwright 자신과 동일하게 판정 |
| R2-2 [MED · fix 유발] | 예외 모드 경고의 stdout 쓰기(R1 결함1 fix)가 `--reporter=json`/`junit` 산출물을 파싱 불가로 오염 | 이 두 리포터는 출력 파일이 없으면 stdout 자체가 산출물이다 — 그 앞에 텍스트를 쓰면 전체가 깨진다 | `usesStdoutSensitiveReporter(argv)` 로 리포터를 감지해 json/junit 일 때만 stdout 쓰기를 건너뜀(stderr 는 항상 유지) |
| R2-3 [PM 판정 · 최소 변경 포함] | 내부 전용 마커 `REAL_QA_EXPLICIT_PATH_ARGS__INTERNAL` 을 외부에서 export 하면 명시 경로 없는 전체 실행이 narrow 로 오인돼 무관한 미추적/누락 스펙을 걸러내지 않고 통과 | 상속 분기가 값의 "출처"(진짜 워커가 물려받은 것인지, 사용자가 직접 export 한 것인지)를 구분하지 않았다 | `isPlaywrightWorkerProcess()` 가드 추가 — Playwright 가 워커 생성자에서 항상 먼저 심어 두는 `process.env.TEST_WORKER_INDEX` 가 있을 때만 상속을 허용 |

### 자체 발견: R2-1 fix 가 새로 연 경계 오인(회귀 울타리 2번 재발) — 같은 라운드에서 즉시 수정

R2-1 을 정규식 부분일치로 바꾸면서, 회귀 울타리 2번("경계 오인 0")을 재실행하다가 **`--reporter
line`·`--workers 2` 같은 흔한 공백형 플래그 값이 실제 파일 경로와 우연히 부분일치**하는 것을
발견했다(실측: repoRoot 를 실 레포에 대입 — 인자 `"line"` 이 `902-slip-line-ecount-real-qa` 등
8개 파일과, `"2"` 가 63개 파일과 절대경로 부분일치). 구 문자열-접미사 비교는 세그먼트 단위라
이런 흔한 값과 우연히 겹치지 않았지만, Playwright 실제 매칭 규칙으로 바꾸며 이 안전판이
사라졌다 — 그대로 두면 `playwright test --reporter line` 같은 일상적 실행이 그 파일들만의
narrow 실행으로 오인돼, 트리 어딘가의 무관한 실제 미추적/누락 스펙을 걸러내지 않고 지나칠
위험이 생긴다(fix 유발 재발). `parseExplicitPathArgs` 에 값(value)을 받는 CLI 플래그의
화이트리스트를 추가해, 공백형(`--flag value`)의 다음 토큰도 후보에서 제외한다(등호형
`--flag=value` 는 이미 같은 토큰에 값이 붙어 있어 영향 없음). 목록은 설치된 playwright 패키지의
실제 CLI 스키마에서 그대로 옮겼다(실측: `node_modules/playwright/lib/program.js` 188-226행
`testOptions` 배열, playwright 1.59.1).

### RED-first 증거

수정 전 `node --test scripts/real-qa-scope.test.cjs`(R2 대응 신규 테스트 15건 추가 후,
경계-오인 자체발견 2건 포함 총 17건 신규 — 기존 12건 + 신규 17건 = 29건):

```text
ℹ tests 27
ℹ pass 17
ℹ fail 10
```

10건 실패는 R2-1(글롭·조각 2종·절대경로·I-3·U-2 메시지, 6건) · R2-2(json 등호형·json 공백형·
junit, 3건) · R2-3(1건)에 정확히 1:1 대응했다(R2-1 회귀 보존 테스트·R2-2 line 리포터 회귀
보존 테스트는 처음부터 GREEN — 의도한 대로 "새 능력"만 RED였다). 경계-오인 자체발견 2건은
그 자리에서 추가로 작성해 별도로 RED 확인 후 고쳤다(첫 버전은 `os.tmpdir()` 무작위 접미사에
우연히 의존해 비결정적이었다 — 합성 scope 직접 테스트로 재작성해 결정적으로 만듦, 아래
"자체 발견" 참고).

수정 후 전체 `node --test scripts/real-qa-scope.test.cjs`:

```text
ℹ tests 29
ℹ pass 29
ℹ fail 0
```

### 뮤테이션 RED(4건 전부 원복 후 GREEN 재확인 완료)

| fix | 뮤테이션 방법 | RED 결과 | 원복 후 |
|---|---|---|---|
| R2-1 | `resolveRequestedFiles` 를 구 문자열-접미사 비교로 되돌림 | 정확히 6건(R2-1 신규 능력 테스트)만 RED, 나머지 21건 GREEN 유지 | 29/29 GREEN |
| R2-2 | `writeExceptionModeWarning` 의 `suppressStdout` 분기 제거 | 정확히 3건(R2-2 json/junit 테스트)만 RED, 나머지 26건 GREEN 유지 | 29/29 GREEN |
| R2-3 | `isPlaywrightWorkerProcess()` 를 무조건 `true` 로 고정 | 정확히 1건(R2-3 테스트)만 RED, 나머지 28건 GREEN 유지 | 29/29 GREEN |
| 경계-오인 자체발견 | `parseExplicitPathArgs` 를 값-스킵 없는 구 버전으로 되돌림 | 정확히 2건(신규 경계 테스트)만 RED, 나머지 27건 GREEN 유지 | 29/29 GREEN |

각 뮤테이션이 **정확히 대상 테스트만** RED 로 만들고 다른 24~28건은 그대로 GREEN 이었다 —
테스트 간 교차오염·과소특정 없음을 확인했다.

### 회귀 울타리 7항목 재확인(실행 원문)

| # | 항목 | 재확인 방법 | 결과 |
|---|---|---|---|
| 1 | 워커 마커 누출 0 | 실제 실행: 기본/`--workers=4`/`--repeat-each=2`/`--shard=1/2`(narrow) 전부 실 서버 미기동으로 인한 `1 failed`만 발생, 스코프 오류 0건. narrow(`--list`)→전체 같은 셸 연속 실행 시 전체는 `548/172` 로 정상 진행(차단 없음, 트리에 실제 불일치가 없는 현재 상태이므로 정상). 셸 잔존 `MARKER=`(빈 값) | 유지 |
| 2 | 경계 오인 0 | `--grep`/`--project`/`--reporter`/`--workers`/`--repeat-each`/`--shard`/`--timeout`/`--config` 공백형·등호형 14개 조합을 실 레포(172파일)에 직접 대입 — 전부 `candidates=[]`, `requested.size=0`. **이 재확인 도중 위 "자체 발견" 회귀를 실측으로 잡아 같은 라운드에서 고쳤다** | 유지(회귀 1건 발견·수정 후 재확인 완료) |
| 3 | 축소 방향 차단 | 실 레포의 `825-s5-null-semantics-real-qa.spec.ts` 를 스크래치패드에 백업 후 삭제 → 전체 실행/`ALLOW=1`/그 스펙 자신 명시 3종 전부 `[real-QA 추적 집합 불일치]`로 차단 확인 → 즉시 복원, `git status --porcelain` 무변경 확인, `548/172` 복원 확인 | 유지 |
| 4 | `-z` 파싱 6종 | `listTrackedRealQaFiles` 함수 자체가 이번 diff 에서 **한 글자도 변경되지 않음**을 `git diff` 로 확인(개인 이름 언급 1건은 export 목록의 미변경 컨텍스트 줄) — 결함8 자동 테스트(quotepath true/false, 한글 파일명) GREEN 재확인으로 갈음, 수동 6종 전부 재실행은 생략 | 유지(코드 미변경 확인) |
| 5 | 신선도 탈출구 | `assertDerivedArtifactsFresh`/`checkFreshnessOrSkip`/`describeFreshnessTargets`/`checkFreshArtifact`/`checkInstalledElectronUpdater` 전부 이번 diff 에 `+`/`-` 라인 0건(`git diff` 로 확인) — 결함4·결함4-U5·결함5·결함7 자동 테스트 GREEN + `npm test` 의 `pretest` 훅 실제 통과(신선도 정상 경로 재확인)로 갈음 | 유지(코드 미변경 확인) |
| 6 | 수치 | 공식 `Total: 548 tests in 172 files`(renderer `547/171`, order-app `1/1`) · mock `Total: 652 tests in 117 files` · `npm test` → `Test Files 179 passed (179)`, `Tests 1648 passed (1648)` · `npm run typecheck` → `EXIT=0`, tsc 오류 grep 0건 · `node --test real-qa-scope.test.cjs` → `29/29` · M-1 왕복(미추적 스펙 주입 → 차단 → 제거 → `548/172` 복원) · M-2(F-2 테스트가 실 레포 scope 로 `.gitignore` 경로 안 추적 스펙 2개 유지 확인) | 유지 |
| 7 | NUL 0건 | 이번 세션 변경 파일 3개(`real-qa-scope.cjs`·`real-qa-scope.test.cjs`·dev-report) 전부 바이트 스캔 NUL=0. `git diff --numstat` 도 3개 파일 전부 텍스트로 정상 계수(Binary 표시 없음) | 유지 |

### 계열 전수 sweep

- **① 게이트가 stdout 에 쓰는 다른 지점**: `real-qa-scope.cjs` 전체에서 `process.stdout.write`/
  `console.log` 는 2곳 — `writeExceptionModeWarning`(R2-2 로 수정한 그 지점)과
  `require.main === module` CLI 진입점(`checkFreshnessOrSkip` 출력). 후자는 `npm run
  pretest`/`typecheck` 가 `node scripts/real-qa-scope.cjs --phase=…` 를 **별도 프로세스로,
  playwright test 실행 이전에** 호출하는 구조라 실제 `playwright test --reporter=json` 의
  stdout 스트림과 절대 섞이지 않는다 — 수정 불필요. `playwright.real-qa.config.ts` 자체에는
  stdout 쓰기가 0건이다.
- **② 환경변수를 신뢰하는 다른 지점**: `real-qa-scope.cjs` 의 `process.env[...]` 읽기는
  `TEST_WORKER_INDEX`(R2-3 fix 자신의 가드) · `EXPLICIT_PATH_ARGS_ENV_VAR`(R2-3 로 수정한 그
  지점) · `REAL_QA_SKIP_FRESHNESS_CHECK` 뿐이다. 마지막 것은 이름에 `__INTERNAL` 접미사가
  없고, 애초에 사용자가 직접 설정하도록 설계된 **공개 탈출구**이며(결함4 fix), 쓸 때마다
  표준출력에 "건너뛴 사실"을 항상 남겨 침묵 우회가 안 된다 — `EXPLICIT_PATH_ARGS_ENV_VAR` 와
  같은 "프로세스 트리 내부에서만 유효해야 하는데 이름만으로는 그게 강제되지 않는" 문제와
  범주가 다르다. `playwright.real-qa.config.ts` 의 나머지 env 읽기(`REAL_QA_ALLOW_UNTRACKED`·
  `REAL_QA_RENDERER_BASE_URL`·`REAL_QA_ORDER_APP_BASE_URL`)도 전부 공개·의도된 사용자 입력이라
  같은 범주가 아니다. **R2-3 은 이 게이트에서 유일한 사례였다.**

### 정정 A — R1 fix 커밋 메시지 문구가 코드보다 넓다

R1 fix 커밋(`938c2f8ca`) 메시지의 "결함 2" 항목은 *"missingFiles 는 narrow/전체 실행 무관,
allowUntracked 값 무관 항상 차단한다"* 라고 적었다. **실측(이번 세션, 합성 scope 직접
확인)**: 추적 스펙 X 가 디스크에서 사라진 상태에서, **X 와 무관한** 다른 추적 스펙 Y 만의
narrow 실행은 **막히지 않고 통과한다**:

```text
scope.missingFiles = ['clients/desktop/playwright/x-real-qa.spec.ts']
narrow 실행 대상 = 'clients/desktop/playwright/y-real-qa.spec.ts' (X 와 무관)
→ 통과(막히지 않음)
```

코드 자체(`decideRealQaScope` 의 `relevantMissing = scope.missingFiles.filter((file) =>
requestedFiles.has(file))`)와 그 위 docblock 주석("요청이 그 파일 자신을 가리키는 경우에는
narrow 실행이라도 예외 없이 막는다")은 **정확하다** — missingFiles 차단은 narrow 실행에서
**요청이 그 누락 파일 자신을 가리킬 때만** 적용되고, 무관한 missingFiles 는 다른 파일의 narrow
실행을 막지 않는다. "narrow/전체 실행 무관 항상 차단" 은 전체(공식) 실행 branch 에서만 참이고
narrow branch 에는 해당하지 않는다 — **커밋 메시지 문구만 느슨했다.** 이 문단으로 정정한다
(코드·동작 자체는 변경 없음).

### 정정 B — `>= 172` 하한선의 한계(게이트 아닌 기록)

결함6 fix(`assert.equal(count, 172)` → `count >= 172`)는 **감소만** 차단하고 **증가 후 감소**는
못 잡는다 — 고정 상수 비교이기 때문이다. 예: 형제 트랙이 스펙을 늘려 `180/180` 이 된 뒤,
다른 변경이 6개를 지워 `174/174` 가 되어도 `174 >= 172` 는 여전히 참이라 **GREEN 이다**(6개
소실이 이 테스트 하나만으로는 안 잡힌다). 이건 **결함이 아니라 이 최소-기준 설계의 알려진
한계**다 — 추적 집합이 실제로 줄어드는지는 PR diff(`git diff --stat` 의 삭제 파일 목록)로도
드러나므로, 이 테스트를 게이트로 강화하는 수단(예: 이전 라운드 수치를 파일에 영속화해 비교)은
이번 라운드에서 도입하지 않는다 — 이 한계를 기록만 해 다음 라운드가 "고정 172 는 안전하다"고
오인하지 않게 한다.

### 정정 C — CI 는 이 게이트를 전혀 타지 않는다(피해 범위 = 로컬 개발자 실행)

`.github/workflows/` 전체에서 `real-qa`/`real_qa`/`realqa` 문자열은 **0건**이다(원 구현 보고
때부터 실측, 이번 세션에 R2-1/R2-2 수정 범위에도 재확인). 이 config 는 CI 파이프라인의 어떤
job 에서도 로드되지 않는다. 따라서 R2-1(위치 인자 매칭 오탐)·R2-2(stdout 오염)·R2-3(내부 마커
외부 신뢰) 세 결함의 **피해 범위는 전부 로컬 개발자가 자기 셸에서 `playwright test
--config=playwright.real-qa.config.ts` 를 직접 실행하는 경우에 한정**되며, CI green/red 판정에는
영향을 준 적이 없다.

### 정정 D — R1 절 self-report 표의 줄 수 오기

R1 절(위 "변경 파일 및 줄 수(git diff --numstat)") 표에서 `real-qa-scope.test.cjs` 행이
`+404 / -6` 로 적혀 있었다. `git show --numstat 938c2f8ca` 실측(2회 확인) 결과는 `+402 / -6`
이다 — **표를 `+402 / -6` 으로 정정했다**(같은 표의 나머지 4개 행은 실측과 일치해 정정하지
않음).

### 정정 E — 인용 줄번호 드리프트(dev-report 자체에는 해당 인용 없음)

R1 종합 코멘트가 인용한 `playwright.real-qa.config.ts:69-72`(부모 커밋 `5a55506e0` 기준
정확, R1 fix 가 그 파일에 `+11`줄을 넣어 `938c2f8ca` 기준으로는 `80-83`행으로 밀림)는 **이
dev-report 파일 자체에는 존재하지 않는다**(`grep -n "playwright.real-qa.config.ts:"` 및
`"69-72"`/`"80-83"`/`"assertRealQaScope("` 전부 0건, 이번 세션에 재확인) — 드리프트는 R1 PR
코멘트에만 있었고 그 코멘트는 이미 게시된 이력이라 이 파일에서 고칠 대상이 없다. 참고로
이번 세션 종료 시점 기준 실제 호출부 위치는 `playwright.real-qa.config.ts:80`(`assertRealQaScope({`)
이다 — 이번 R2 세션은 이 파일을 전혀 수정하지 않아(`git diff --stat` 공백) 그 위치가 R2 로
인해 추가로 밀리지 않았음을 확인했다.

### 변경 파일 및 줄 수(git diff --numstat, 원문)

```text
clients/desktop/scripts/real-qa-scope.cjs        +150 / -30   R2-1·R2-2·R2-3 fix + 경계-오인 자체발견 fix
clients/desktop/scripts/real-qa-scope.test.cjs   +375 / -2    R2 대응 RED 테스트 17건(R2-1 6·R2-2 3·R2-3 1·경계-오인 자체발견 2·회귀보존 4 신규 + 기존 결함1·3 실측 보강 테스트 소폭 보강 1) + import 확장
docs/dev-reports/2026-07-28-964-real-qa-testmatch-scope.md  (본 절 추가 + 정정 D 1줄, 별도 계수)
```

### 못 한 것(정직한 목록)

- 실서버 548건 전체 실행·스크린샷은 이번 라운드도 범위 밖(원 구현 보고의 DONE_WITH_CONCERNS
  사유가 그대로 이월) — scope 게이트 자체의 RED-first 검증에 집중했다.
- 회귀 울타리 항목 4(`-z` 파싱)·5(신선도 탈출구)는 코드가 이번 세션에 전혀 바뀌지 않아
  `git diff` 로 무변경을 확인하고 기존 자동 테스트 GREEN 재확인으로 갈음했다 — R1 이 했던
  수동 6종/stale-mtime 실측 재실행은 하지 않았다(위험이 낮다고 판단한 근거는 "계열 sweep"·
  회귀 울타리 표에 명시).
- `VALUE_TAKING_FLAGS` 화이트리스트는 playwright 1.59.1 의 `testOptions` 스냅샷이다 — 향후
  playwright 업그레이드가 새 값-옵션을 추가하면 이 목록이 낡을 수 있다(다음 결함의 씨앗일
  수 있음, 정직하게 기록). commander 의 실제 등록 옵션을 런타임에 조회하는 방식(`playwright/
  lib/program` 의 `program.commands.find(c => c.name()==='test').options`)도 검토했으나,
  `program.js` 전체 require 비용·매 config 로드마다 CLI 프로그램 전체를 끌어오는 무게를
  고려해 이번엔 채택하지 않았다 — 필요 시 다음 라운드가 재검토할 수 있다.
- CI(다음 커밋 SHA)는 PM 이 commit·push 한 뒤에만 확정되므로 이 세션에서는 로컬 동등 체크
  (typecheck·test·lint, 위 회귀 울타리 표)로 갈음했다.

---

## PR #969 재수렴 라운드 fix (2026-07-28, SONNET5)

1차 적대검증이 발견 각도(OPUS)와 대조 각도(SONNET5)로 분리 진행됐다. 발견 각도가 도달 가능
결함 4건(BLOCKING 1·HIGH 3) + 증거 무결성 정정 2건을, 대조 각도가 증거 무결성 정정 1건(총
E-1~E-4 4건으로 PM 이 종합)을 찾았다. 전부 `scripts/real-qa-scope.cjs`·
`real-qa-scope.test.cjs`·`playwright.real-qa.config.ts`·`README.md` 범위 안에서 RED-first 로
고쳤다. 이번 라운드는 **단위 테스트가 아니라 실 CLI(`node_modules/.bin/playwright.cmd`)를
1차 근거로 삼았다** — 직전 R3(`da2ca3ade`) 스스로 "단위 테스트 31/31 GREEN 인데 실 CLI 는
안 막혔다"는 실패 패턴을 남긴 바 있어, 이번에도 같은 함정에 빠지지 않도록 매 결함을 실
`playwright` CLI 로 먼저 재현했다.

### 결함별 원인·수정 요약

| # | 결함 | 원인 | 수정 |
|---|---|---|---|
| 1 [BLOCKING] | `.gitignore`(88-95행)가 개발책임자 요청(2026-07-05)으로 정책적으로 허용한 로컬 real-QA 스펙이 이 PC 에 4개 있으면 `real-qa-scope.test.cjs` 의 첫 단위 테스트가 실 레포 `repoRoot` 를 대상으로 `untrackedFiles === []` 를 단언해 `npm run typecheck` 가 영구 RED | 그 단위 테스트가 "untracked = 문제"로 뭉뚱그렸다 — `.gitignore` 로 허용된 로컬 세션 QA 잔존물과 "새 스펙을 만들고 `git add` 를 잊은" 진짜 회귀(#864 계열)를 구분하지 않음. 신규 체크아웃 워크트리에서만 재실행하면 이 상태 자체가 안 생겨(로컬 QA 세션 산출물이 없음) 3라운드 동안 GREEN 으로 보였다 | `listGitignoredUntrackedRealQaFiles`(`git ls-files --others --ignored --exclude-standard`) 추가 — `.gitignore` 가 이미 정책을 갖고 있으므로 이 스크립트가 7개 디렉터리 목록을 별도로 하드코딩하지 않는다. `compareRealQaScope` 가 `unexpectedUntrackedFiles`(untracked 이면서 `.gitignore` 로도 안 걸림)/`ignoredUntrackedFiles`(untracked 이면서 `.gitignore` 로 걸림) 두 필드로 분리하고, 단위 테스트는 `unexpectedUntrackedFiles === []` 만 요구한다. `decideRealQaScope`(실행 게이트 자체)는 손대지 않았다 — README 가 이미 문서화한 "전체 실행은 untracked 여부와 무관하게 항상 차단한다"는 기존 정책은 이번 fix 대상이 아니다 |
| 2 [HIGH] | 위치 인자의 모든 백슬래시를 무조건 `/` 로 치환해 정규식 이스케이프(`\.`·`\d`·`\b` 등)가 파괴됨 — playwright 는 실제로 매치하는데 게이트는 0건으로 오판해 과차단, 사유도 거짓("하나도 선택하지 않아") | `normalizeArgSeparators` 를 모든 인자에 무조건 먼저 적용 | 인자별로 **원시 정규식(백슬래시 보존)을 먼저** 컴파일해 매치를 시도한다. 매치가 1개 이상이면 그것으로 확정(정규식 이스케이프를 쓴 인자는 항상 여기서 끝나 다시는 변환을 겪지 않는다). 원시 매치가 0건일 때만 백슬래시→슬래시 변환한 두 번째 후보로 폴백(Windows 상대경로 관용 표기 지원, 기존 R2-1 회귀 테스트 보존) |
| 3 [HIGH] | `8869d18ed`(2026-07-28)가 "위치 인자 없는 실행은 무조건 차단"으로 계약을 바꿨는데, 같은 세션과 다음 SOL 세션(`da2ca3ade`) 둘 다 `playwright.real-qa.config.ts` 헤더·`README.md` 를 0줄 갱신 — 문서가 안내하는 "공식 전체 실행" 명령이 항상 `EXIT=1` | 코드 계약 변경 시 문서 동기화 의무([feedback_continuous_docs_sync.md](../../.claude/memory/feedback_continuous_docs_sync.md)) 누락이 2세션 연속 반복 | `playwright.real-qa.config.ts:6-14`(헤더)·`:57-60`(사용 예시를 `playwright/` 위치 인자 포함 형태로 교체) 및 `README.md`(공유 real-QA 수집 범위 절 + `REAL_QA_ALLOW_UNTRACKED` 절)를 실측(`playwright test --config=playwright.real-qa.config.ts --list --reporter=line playwright/` → `Total: 548 tests in 172 files`)에 맞춰 정정 |
| 4 [HIGH] | `--project`가 commander 의 가변인자(`<project-name...>`)인데 `VALUE_TAKING_FLAGS` 처리가 딱 한 토큰만 건너뛰어, `--project a b` 의 두 번째 값이 "위치 인자"로 오분류됨 — 차단은 맞지만 사유가 거짓(전달한 적 없는 경로를 찾다 실패한 것처럼 보임) | 값-옵션 화이트리스트가 전부 "값 1개"만 가정 — `--project` 하나만 예외적으로 가변인자라는 사실을 반영하지 않음 | `VARIADIC_FLAGS = new Set(['--project'])` 분리, 그 플래그를 만나면 다음 `-`로 시작하는 토큰(또는 인자 끝)까지 전부 건너뛴다(playwright 자신의 실측 동작과 1:1 일치하도록) |

### RED-first 증거

**결함1 — 실 워크트리(신규 체크아웃이 아닌, 실제 미추적 gitignore 스펙이 존재하는 트리)에서 재현**

`.gitignore:91`(`coedit-s3-3-accounting/`)·`:93`(`n1b-native-qa/`) 대상 경로에 임시 스펙
2개를 실제로 만들고(`git status --porcelain` 은 계속 빈 출력 — `.gitignore` 매치라 조용함),
`git show da2ca3ade:clients/desktop/scripts/real-qa-scope.cjs`(fix 이전 원문, 읽기전용)의
`getRealQaScope` 를 이 실 워크트리 `repoRoot` 에 대입:

```text
disk=174 tracked=172 untracked=2
untrackedFiles= [
  "clients/desktop/playwright/coedit-s3-3-accounting/969-repro-real-qa.spec.ts",
  "clients/desktop/playwright/n1b-native-qa/969-repro-real-qa.spec.ts"
]
RED (예상대로 실패): 미추적 스펙이 공식 집합에 섞였습니다.
+ actual - expected
+ [ 'clients/desktop/playwright/coedit-s3-3-accounting/969-repro-real-qa.spec.ts',
+   'clients/desktop/playwright/n1b-native-qa/969-repro-real-qa.spec.ts' ]
- []
```

fix 후 같은 상태에서 같은 `repoRoot`:

```text
disk=174 tracked=172 untracked=2 unexpectedUntracked=0 ignoredUntracked=2
GREEN — unexpectedUntrackedFiles 는 비어있습니다(.gitignore 가 허용한 2개는 ignoredUntrackedFiles 로 분류됨)
```

`node --test scripts/real-qa-scope.test.cjs` 를 **같은 오염 상태(임시 스펙 2개 존재)** 로
실행 — 43/43 GREEN(신규 결함1~4 테스트 12건 포함). 검증 후 임시 스펙 2개 삭제,
`git status --porcelain` 빈 출력 재확인, 정상 상태에서도 43/43 GREEN 재확인.

**결함2 — 실 CLI(fix 전) 재현, 정규식 형태 2종**

```text
$ playwright test --config=playwright.real-qa.config.ts --list --reporter=line "929-r5.*real-qa\.spec\.ts"
EXIT=1
Error: [real-QA 위치 인자 불일치] 전달한 위치 인자가 real-QA 스펙을 하나도 선택하지 않아 실행을 차단합니다.

$ playwright test --config=playwright.real-qa.config.ts --list --reporter=line "92[0-9]-.*-real-qa\.spec\.ts"
EXIT=1
Error: [real-QA 위치 인자 불일치] 전달한 위치 인자가 real-QA 스펙을 하나도 선택하지 않아 실행을 차단합니다.
```

**결함3 — 실 CLI(fix 전) 재현, 문서화된 명령 그대로**

```text
$ playwright test --config=playwright.real-qa.config.ts --reporter=line --timeout=60000
EXIT=1
Error: [real-QA 전체 실행 차단] 파일을 명시하지 않은 real-QA 실행은 허용하지 않습니다.
```

**결함4 — 실 CLI(fix 전, main 대조군으로 게이트 없는 playwright 원본 동작도 함께 확인)**

```text
$ (main, 게이트 없음) playwright test --config=... --list --reporter=line --project renderer order-app playwright/manual/
EXIT=1
Error: Project(s) "playwright/manual/" not found. Available projects: "order-app", "renderer"
→ playwright 자신이 세 번째 토큰까지 프로젝트명으로 흡수한다(가변인자 실측 확인)

$ (워크트리, 게이트, fix 전) playwright test --config=... --list --reporter=line --project renderer order-app
EXIT=1
Error: [real-QA 위치 인자 불일치] 전달한 위치 인자가 real-QA 스펙을 하나도 선택하지 않아 실행을 차단합니다.
전달한 위치 인자: order-app          ← 사유가 사실과 다름(사용자는 경로를 준 적이 없음)
```

### 뮤테이션 RED(3건 전부 fix 한 곳씩 되돌려 정확히 대상 테스트만 RED 확인 후 원복)

| fix | 뮤테이션 방법 | RED 결과 | 원복 후 |
|---|---|---|---|
| 결함1 | `unexpectedUntrackedFiles` 계산에서 `.gitignore` 필터를 무력화(`\|\| true`) | 정확히 2건(실 레포 첫 단위테스트 + 신규 합성 테스트 1건)만 RED, 나머지 41건 GREEN | 43/43 GREEN |
| 결함2 | `resolveRequestedFiles` 가 원시 패턴 대신 항상 `normalizeArgSeparators(pattern)` 을 먼저 컴파일하도록 되돌림(구 버그 재현) | 정확히 4건(`\.`·`\d`·`.*`·과잉폴백방지 테스트)만 RED, `[0-9]` 테스트는 백슬래시가 없어 이 뮤테이션과 무관해 GREEN 유지(의도대로) | 43/43 GREEN |
| 결함4 | `VARIADIC_FLAGS` 분기를 `VALUE_TAKING_FLAGS` 처럼 한 토큰만 건너뛰도록 되돌림 | 정확히 2건(--project 가변인자 신규 테스트)만 RED, 나머지 41건 GREEN | 43/43 GREEN |

각 뮤테이션이 **정확히 대상 테스트만** RED 로 만들고 나머지는 그대로 GREEN 이었다 — 테스트
간 교차오염·과소특정 없음을 확인했다.

### 실 CLI 격자 재확인(fix 후, 파이프 없이 종료코드 측정)

| # | 명령 형태 | fix 후 결과 | 비고 |
|---|---|---|---|
| D(결함3) | 위치 인자 없음(문서 명령) | `EXIT=1`(의도대로, 이제 문서도 일치) | — |
| C | `playwright/` 디렉터리 전체 | `EXIT=0`, `Total: 548 tests in 172 files` | 회귀 없음, 신규 공식 "전체 실행" 형태 |
| B | 명시 파일 1개 | `EXIT=0`, `1 test in 1 file` | 회귀 없음 |
| H(결함2) | `"929-r5.*real-qa\.spec\.ts"` | `EXIT=0`, `4 tests in 1 file` | fix 전 `EXIT=1` → fix 후 매치 |
| L(결함2) | `"92[0-9]-.*-real-qa\.spec\.ts"` | `EXIT=0`, `23 tests in 8 files` | fix 전 `EXIT=1` → fix 후 매치 |
| G(결함4) | `--project renderer order-app`(위치 인자 없음) | `EXIT=1`, `[real-QA 전체 실행 차단]`(사유 정정됨) | fix 전에는 `[위치 인자 불일치] order-app` 으로 사유가 거짓이었음 |
| G3(결함4) | 위치 인자 → `--project renderer order-app`(순서 바꿈) | `EXIT=0`, `1 test in 1 file`(main 대조군과 동일) | playwright 자신도 이 순서에서만 위치 인자+프로젝트를 동시에 인식(가변인자가 뒤따르는 모든 비플래그 토큰을 흡수하는 특성상, 위치 인자는 `--project` **앞**에 와야 한다 — playwright 자체의 CLI 제약이지 이 게이트의 제약이 아님) |
| I(회귀) | 백슬래시 상대경로(`playwright\manual\...`) | 게이트 통과, playwright 자신 `Total: 0 tests in 0 files`(fix 전과 동일 — playwright 자체가 미지원) | 회귀 아님 |

**semver 범위 상단(1.62.0) 재확인** — OS temp 별도 프로젝트(`node_modules` 오염 없이 격리
설치, 검증 후 원복)에서 V1(위치 인자 없음 `EXIT=1`)·V2(명시 파일 `EXIT=0`)·H(결함2 정규식
`EXIT=0`, `4 tests in 1 file`)·G(결함4 `EXIT=1` `[전체 실행 차단]`) 전부 1.59.1(lock)과 동일한
결과. `Version 1.62.0` 실측 확인.

### 📌 증거 무결성 정정 4건 (도달성 0 이어도 보고 의무)

**E-1** — 위 R1 절 "변경 전 기준선"(21-26행, `Total: 548 tests in 172 files` / `disk=172,
tracked=172, untracked=0, missing=0`)은 **신규 체크아웃 워크트리에서 측정한 값**이다. PR
코멘트가 이 값을 근거로 "이 PC 에서 증상 미재현·이슈가 지목한 4개 디렉터리가 이 PC 에 0개
존재"라고 일반화한 것은 틀렸다 — 이 PC 의 **main 워킹트리**(신규 체크아웃이 아니라 실제로
써 온 작업 트리)는 처음부터 `558/176`이었고, 이슈가 지목한 4개 디렉터리
(`coedit-s3-3-accounting`·`e2-partner-list-real-qa`·`n1b-native-qa`·`n3b-fcm-push-real-qa`)가
2026-07-05~07 부터 실존했다(`stat` mtime 실측). "워크트리에서 잰 값"과 "이 PC 의 실제 작업
트리 상태"를 같은 것으로 취급한 것이 오독의 근원이며, **이 오독이 결함1을 3라운드 동안
가렸다** — 신규 워크트리에서만 재는 한 결함1은 영원히 재현되지 않는다(정확히 이번 라운드가
RED 를 워크트리에 오염물을 직접 주입해서야 잡은 이유).

**E-2** — 위 R2 절 "회귀 울타리 7항목 재확인" 표(419행) 및 R1 절 "회귀 울타리 재확인"(304·
309행)의 *"narrow(`--list`)→전체 같은 셸 연속 실행 시 전체는 `548/172` 로 정상 진행(차단
없음)"*, *"공식 전체: Total: 548 tests in 172 files"*, *"M-1 왕복: … 제거 → 548/172 복원
확인"* 은 그 세션(R1/R2, `8869d18ed` 이전) 시점에는 정확했으나, **`8869d18ed`(2026-07-28)가
계약을 "위치 인자 없는 실행은 무조건 차단"으로 바꾼 뒤로는 거짓이다** — 현재 HEAD 에서
위치 인자 없는 전체 실행은 트리 상태와 완전히 무관하게 항상 `EXIT=1`이다(위 격자 D). 이
수치들은 **해당 세션 시점의 정확한 기록**으로 남기고(과거 기록을 소급 수정하지 않음),
이 정정 절로 "현재 HEAD 에서는 더 이상 성립하지 않는다"는 사실만 남긴다.

**E-3** — PR 코멘트의 "🟡 증거 무결성 — 구현자 보고 수치 1건 정정"(`5a55506e0` 커밋 대상)이
"실측"으로 제시한 개별 파일 값 중 2건이 실제 `git show --numstat 5a55506e0` 결과와 다르다:
`playwright.real-qa.config.ts` 는 실제 `+20/-1`인데 그 코멘트는 `+21/-1`로, `package.json` 은
실제 `+3/-2`인데 그 코멘트는 `+5/-3`으로 적었다. 총계(`549/3`)는 정확하다.

**E-4** — E-3 의 오차 패턴은 "삭제분을 추가분 칸에 더해 넣는" 것과 정확히 같은 모양이다
(`21 = 20 + 1`, `5 = 3 + 2` — 두 경우 모두 실제 삭제분이 실제 추가분에 더해져 추가분 칸에
들어갔다). 이 패턴은 이 PR 의 R1 절 "정정 D"(`+404/-6` → `+402/-6`)가 이미 한 번 지적한
바로 그 계열이며, **그 지적을 담은 정정문 자체에서 재발**했다. 위조가 아니라 반복되는 계산
습관으로 보이나, "실측"으로 제시된 수치는 실측과 반드시 일치해야 한다 — 이번 절의 numstat
표(아래)는 전부 `git diff --numstat` 원문을 그대로 옮기고 가산 계산을 하지 않았다.

### 미추적 스펙이 존재하는 상태의 실행 게이트 동작(발견 각도 "보지 않은 것" 4번 — 이번에 측정)

R1 발견 각도가 "워크트리에 미추적 스펙을 주입하지 않아 미확인으로 남긴다"고 정직하게 밝혔던
항목을 이번 라운드가 실측했다. `.gitignore:93` 대상 경로에 **실제로 실행 가능한** 임시 스펙을
주입한 상태에서:

```text
① playwright/ 전체 지정, ALLOW 없음:
   EXIT=1, "[real-QA 추적 집합 불일치] … REAL_QA_ALLOW_UNTRACKED=1 을 설정하고 명시 경로를
   전달하십시오." — 의도대로 차단(위 결함1 fix 는 이 게이트 동작을 바꾸지 않았다. 결함1은
   단위 테스트의 assert 대상만 바꿨다).

② REAL_QA_ALLOW_UNTRACKED=1 + playwright/ 전체 지정:
   EXIT=0, Total: 549 tests in 173 files (공식 548/172 가 아니라 +1)
   경고가 stdout·stderr 둘 다에 남는다("[real-QA 로컬 실행 모드] 위 차집합은 의도 실행으로
   허용했으며 공식 수치로 사용하지 마십시오.") — R2-2/R1 결함1 설계대로 정상 동작.
```

②는 **결함3 fix 가 `playwright/` 를 "공식 전체 실행"의 정본 위치 인자로 새로 문서화**하면서
처음으로 실제로 밟힐 수 있게 된 조합이다 — `playwright/` 는 코드 관점에서는 "매우 넓은 narrow
요청"이라 `REAL_QA_ALLOW_UNTRACKED` 가 적용 대상이 되고, 세션에 그 값이 남아 있으면 "공식
전체 실행" 명령이 조용히 549/173(경고 문구를 놓치면 알아채기 어려움)을 낸다. 이는 **기존
설계(README 의 ALLOW_UNTRACKED 절)가 이미 명문화한 동작**이고 새 결함은 아니다 — 경고가 두
스트림 모두에 정확히 남으므로 "완전히 흔적 없이 사라짐"은 아니다. 다만 "공식 수치"라는
문구의 실제 의미가 "숫자만 보면 553/172 도 아니고 549/173 인데 경고를 못 보면 이걸 548/172로
착각할 수 있다"는 것이므로, 참고 사항으로 정직하게 기록한다(코드 변경 없음 — 이 조합의
정책적 처리 방향은 개발책임자 결정 사항으로 남긴다).

### 🚫 이 라운드가 보지 않은 것 / 못 한 것

- **real-QA 548건 본문 실행 및 GUI 스크린샷** — 공유 실데이터 write 위험 때문에 이번 라운드도
  하지 않았다(`--list`만 사용). 실서버 대상 라이브QA 는 이 fix 의 범위(스코프 판정 로직)
  밖이며, R1 원 구현 보고 때부터 반복 이월된 항목이다.
- **Linux/CI 러너 위 실 CLI** — 전 검증을 Windows 11 에서만 실행했다. CI 는 이 config 를 전혀
  타지 않으므로(`.github/workflows/` 에 `real-qa` 문자열 0건, 정정 C 재확인) 피해 범위는
  로컬 개발자 실행에 한정된다.
- **`admin-hr-guard.spec.ts`(발견 각도 브리핑 6번 선재 관찰)** — 이 PR 표면 밖(공유 real-QA
  172개 집합에 없음)이라는 PM 판정을 그대로 수용, 손대지 않았다.
- **`--project` 외 다른 값-옵션이 향후 playwright 업데이트로 가변인자가 될 가능성** — 위 R1
  절 "못 한 것"이 이미 "`VALUE_TAKING_FLAGS` 는 스냅샷이라 낡을 수 있다"고 예견했던 바로 그
  종류의 결함이 이번에 `--project` 로 실현됐다. 이번 fix 는 `--project` 하나만 명시적으로
  가변인자로 분리했고, playwright 의 commander 스키마를 런타임에 조회하는 구조 개선은
  이전 라운드와 같은 이유(무게·비용)로 이번에도 채택하지 않았다 — 다음 라운드가 재검토할 수
  있게 정직하게 기록한다.

### 변경 파일 및 줄 수(git diff --numstat, 원문)

```text
clients/desktop/scripts/real-qa-scope.cjs        +118 / -26   결함1(gitignore 분류)·2(정규식 우선매칭)·4(--project 가변인자)
clients/desktop/scripts/real-qa-scope.test.cjs   +266 / -3    결함1·2·4 RED 테스트 12건 + 첫 단위테스트 재작성
clients/desktop/playwright.real-qa.config.ts     +14 / -3     결함3(계약 변경 반영: 헤더·사용 예시)
clients/desktop/README.md                        +28 / -6     결함3(공식 전체 실행 명령·ALLOW_UNTRACKED 절·typecheck 절 정정)
docs/dev-reports/2026-07-28-964-real-qa-testmatch-scope.md  (본 절 추가, 별도 계수 — 자기 자신을 셀 때 그 계수 자체가 이 절에 다시 반영돼야 하는 순환이라 R1/R2 관례대로 제외)
```

---

## CODEX SOL 2차 라운드 (F-1~F-5) 및 fix

2026-07-28 · SOL 보고서 `969-sol-round2.md` 원문 기준. 앞 절의 이전 라운드 기록 중
`REAL_QA_ALLOW_UNTRACKED=1` + `playwright/`를 결함이 아니라고 적은 결론은 이 절에서
정정한다. 개발책임자 판정대로 F-1은 BLOCKING이며, F-1~F-5 전건을 수정하고 실제 CLI로
재검증했다. 종료코드는 파이프 없이 Playwright 프로세스 직후의 native exit code를
기록했다.

### 1. F-1~F-5 원인과 변경

| ID | SOL이 잡은 내용 / 근본 원인 | fix와 위치 |
|---|---|---|
| F-1 BLOCKING | 세션에 남은 `REAL_QA_ALLOW_UNTRACKED=1`이 명시 경로 `playwright/`에도 적용됐다. `playwright/`가 디스크+추적의 known scope 전체를 선택해도 관련 미추적 4개만 narrow 예외로 판정하므로 `558/176`이 `EXIT=0`이 됐다. | `decideRealQaScope`가 `diskFiles ∪ trackedFiles` 전체를 선택했는지 계산하고, 그 상태에서 `untrackedFiles`가 있으면 allow와 무관하게 `formatScopeMismatch`를 throw한다: `clients/desktop/scripts/real-qa-scope.cjs:429-430`. 공식 전체 실행 문서도 좁은 명시 경로에만 allow를 적용한다고 명시했다: `clients/desktop/README.md:306-313`. |
| F-2 BLOCKING | Playwright 1.62.0은 `--` 뒤 토큰을 테스트 필터에서 제거하지만 게이트는 그 토큰을 위치 후보로 남겼다. 따라서 897의 `5/1` 요청이 실제 Playwright에서는 필터 없는 `9/2` 실행으로 확대돼도 게이트가 통과했다. | 설치된 `playwright/lib/program`의 test command 옵션과 패키지 버전을 읽고, 1.62+에서는 `--` 뒤를 후보로 수집하지 않는다: `real-qa-scope.cjs:174-193,206-214`. |
| F-3 HIGH | 게이트 후보는 repo-relative와 정방향 slash 절대경로까지 추가했지만 Playwright Windows matcher의 실제 후보는 OS 절대경로와 file URL이었다. 그래서 게이트만 `1`개를 선택해 `0/0 EXIT=0`을 만들거나, Playwright가 `1/1`을 선택하는 file URL을 게이트가 0개로 차단했다. | `matchUniverse` 후보를 OS 절대경로와 Windows `pathToFileURL(...).href`로만 정렬했다: `real-qa-scope.cjs:301-316`. 회귀 테스트는 `real-qa-scope.test.cjs:823-843`. |
| F-4 HIGH | `--exclude-standard`를 repo `.gitignore`와 동일한 정책으로 오인했다. 이 옵션은 `.git/info/exclude`와 global exclude도 포함하므로 사용자별 rogue 스펙이 `ignored` 정책 허용 목록에 들어갔다. | `git ls-files`에 `--exclude-per-directory=.gitignore`만 사용해 repo `.gitignore` 기준으로 한정했다: `real-qa-scope.cjs:67`. `.git/info/exclude` 주입 fixture는 `real-qa-scope.test.cjs:845-861`. |
| F-5 MEDIUM | 수동 값 옵션 목록이 1.59.1 스냅샷이라 1.62.0의 `-G`, `--last-failed-file` 값을 위치 경로로 오인했다. | 수동 production 목록을 없애고 설치된 Commander 옵션의 required/optional/variadic schema를 런타임에 읽는다: `real-qa-scope.cjs:156-206`. 단위 fixture의 두 신규 값 옵션은 `real-qa-scope.test.cjs:35-42,863-879`에 고정했다. |

### 2. F-1이 3라운드 동안 보이지 않은 구조적 이유

신규 체크아웃 워크트리에는 `.gitignore`가 남겨 두도록 한 로컬 스펙 4개가 애초에 없다.
따라서 그 워크트리에서만 scope를 재면 `disk=tracked=172`가 되어 `untracked=0`이고,
`REAL_QA_ALLOW_UNTRACKED=1`을 켜도 오염시킬 파일이 없어 항상 GREEN이다. 실제로 사용해 온
`C:\dev\Samhan-Public`에는 `disk=176`, `tracked=172`, `ignored=4`가 이미 있었고, 이
조건에서만 세션 잔존 allow와 공식 `playwright/`의 조합이 `558/176 EXIT=0`으로 드러났다.
즉 “새 워크트리에서 재현되지 않음”은 F-1이 없다는 근거가 아니라, 결함 입력 집합을
만들지 않은 관찰이었다. 이번 라운드는 파일을 삭제하지 않고 실 main 트리의 미추적 4개를
그대로 둔 상태에서 RED를 재현했다.

### 3. F-2·F-5 공통 뿌리와 구조 처리

두 결함의 공통 뿌리는 Playwright 옵션 schema를 손으로 열거해 유지한 것이다. 1.62.0에서
`--` parser 동작이 바뀌고 `-G`, `--last-failed-file`가 추가되자 게이트의 수동 목록과
Playwright가 갈라졌다.

이번에는 production이 설치된 Playwright의 `testCommand.options`를 직접 introspection해
값을 받는 flag와 variadic flag를 구성한다. `--project` 같은 variadic도 schema에서 읽고,
1.62의 `--` 동작은 패키지 semver에서 계산한다. node_modules가 없는 순수 단위 테스트는
`UNIT_CLI_CONTRACT` fixture를 주입하며, production에 새 옵션을 추측하는 수동 fallback은
두지 않았다.

이 구조로 이번 범위의 F-2와 F-5는 같은 schema에서 자동 반영된다. 다만 Playwright가
`lib/program` 내부 경로를 옮기거나 Commander option metadata를 바꾸거나, semver와 실제
parser 동작이 다시 어긋나면 새 probe가 필요하다. 설치 자체가 없는 환경에서는 빈 schema를
반환하므로 실제 Playwright config를 로드할 수 없는 단위 실행에서의 동작을 허위로 추측하지
않는다. 다음 업그레이드 때는 1.62 상단 CLI probe와 옵션 schema sweep을 다시 실행해야 한다.

### 4. RED 원문

#### F-1 — 실 작업 트리 조건

`C:\dev\Samhan-Public`의 실제 미추적 스펙 4개를 유지한 상태에서, allow를 켜고 공식 전체
위치 인자를 전달한 fix 전 production gate의 원문이다.

```text
disk=176 tracked=172 untracked=4 ignored=4
F1_RED_UNEXPECTED_PASS {"disk":176,"tracked":172,"untracked":4,"ignored":4}
EXIT=0
```

#### F-2 — Playwright 1.62.0

```text
1.59.1: -- <897>  => Total: 5 tests in 1 file, EXIT=0
1.62.0: -- <897>  => Total: 9 tests in 2 files, EXIT=0
```

`<897>`은 897 스펙을 좁히려던 위치 필터다. 1.62.0의 `9/2`는 요청한 `5/1`보다 넓은
실행이므로 F-2 과통과 RED다.

#### F-3 — Windows matcher 후보

```text
anchored repo-relative: gate PASS, Playwright Total: 0 tests in 0 files, EXIT=0
anchored forward absolute: gate PASS, Playwright Total: 0 tests in 0 files, EXIT=0
anchored file URL: Playwright Total: 1 test in 1 file, gate EXIT=1
```

#### F-4 — `.git/info/exclude` 실제 주입

OS temp Git fixture의 `.git/info/exclude`에 아래 항목을 실제로 추가했다. fixture는 `finally`
에서 정리했으며 대상 worktree와 main의 exclude는 건드리지 않았다.

```text
.git/info/exclude: clients/desktop/playwright/arbitrary/
{"caseName":"not-ignored","unexpectedUntrackedFiles":["clients/desktop/playwright/arbitrary/rogue-real-qa.spec.ts"],"ignoredUntrackedFiles":[]}
{"caseName":"reported-by-exclude-standard","unexpectedUntrackedFiles":[],"ignoredUntrackedFiles":["clients/desktop/playwright/arbitrary/rogue-real-qa.spec.ts"]}
```

두 번째 줄이 `--exclude-standard`를 사용하던 fix 전의 false-green이다.

#### F-5 — Playwright 1.62.0 신규 값 옵션

```text
1.62.0: -G R1 <897> => Total: 5 tests in 1 file, EXIT=0
1.62.0: --last-failed-file 863-r1-liveqa-real-qa <897>
         => Total: 5 tests in 1 file, EXIT=0
```

Playwright 자체는 두 값 옵션을 정상 소비했지만, fix 전 게이트는 `R1`과
`863-r1-liveqa-real-qa`를 위치 인자로 남겼다.

### 5. 뮤테이션 결과 — fix point별 정확한 RED

각 fix 지점을 하나씩 임시 되돌리고 해당 이름 패턴만 실행한 뒤 즉시 원복했다. 각 probe는
repo 안에 임시 파일을 만들지 않았고, 모든 결과의 `MUTATION_*_EXIT=1`은 해당 mutation
테스트 프로세스의 exit code다.

| 되돌린 fix | 실행한 테스트 | mutation 결과 |
|---|---|---|
| F-1의 `knownFiles` 전체선택 차단 제거 | `F-1 RED: playwright/ 전체 위치 인자는 남은 ALLOW_UNTRACKED 로 우회되지 않는다` (`test.cjs:168`) | `tests 1 / pass 0 / fail 1`, missing expected exception, `MUTATION_F1_EXIT=1` |
| F-2의 `postDashArgsAreIgnored` 분기 제거 | `F-2 RED: Playwright 1.62가 제거하는 -- 뒤 토큰은 위치 인자로 보지 않는다` (`test.cjs:804`) | `tests 1 / pass 0 / fail 1`, actual에 `playwright/897-column-hierarchy-real-qa` 잔류, `MUTATION_F2_EXIT=1` |
| F-3의 OS absolute + file URL 후보 정렬을 이전 후보 집합으로 복원 | 두 F-3 RED 테스트 (`test.cjs:823,833`) | `tests 2 / pass 0 / fail 2`: repo-relative가 잘못 선택되고 file URL이 누락, `MUTATION_F3_EXIT=1` |
| F-4의 `.gitignore` 전용 exclude를 `--exclude-standard`로 복원 | `F-4 RED: .git/info/exclude 로 무시한 rogue 스펙은 repo 정책 허용 목록에 들어가지 않는다` (`test.cjs:845`) | `tests 1 / pass 0 / fail 1`, rogue가 ignored 목록에 반환, `MUTATION_F4_EXIT=1` |
| F-5 schema fixture에서 `-G`, `--last-failed-file` 제거 | 두 F-5 RED 테스트 (`test.cjs:863,868`) | `tests 2 / pass 0 / fail 2`, 두 옵션 값이 위치 후보에 잔류, `MUTATION_F5_EXIT=1` |

원복 후 전체 회귀는 다음과 같다.

```text
node --test clients/desktop/scripts/real-qa-scope.test.cjs
tests 50
pass 50
fail 0
cancelled 0
skipped 0
FINAL_UNIT_EXIT=0
```

### 6. fix 후 실 CLI 격자

| 검증 축 | 결과 |
|---|---|
| 실 main `C:\dev\Samhan-Public`, `allow=true` + 공식 `playwright/` | PM probe 기준 `EXIT=1`, `BLOCK: [real-QA 추적 집합 불일치]` |
| 실 main 같은 공식 `playwright/`, `allow=false` 대조 | `EXIT=1`, 동일 BLOCK |
| OS temp mirror의 공식 전체 collection | `Total: 548 tests in 172 files`, `EXIT=0` |
| 1.59.1 `-- <897>` narrow | `Total: 5 tests in 1 file`, `EXIT=0` |
| 1.62.0 `-- <897>` narrow | gate가 확대를 차단, `EXIT=1`; ungated 대조는 RED 원문의 `9/2 EXIT=0` |
| 1.62.0 `-G R1 <897>` | `Total: 5 tests in 1 file`, `EXIT=0` |
| 1.62.0 `--last-failed-file 863-r1-liveqa-real-qa <897>` | `Total: 5 tests in 1 file`, `EXIT=0` |
| Windows repo-relative anchored regex | `[real-QA 위치 인자 불일치]`, `EXIT=1` |
| Windows file URL regex | `Total: 1 test in 1 file`, `EXIT=0` |

### 7. V1~V5 검증 결과

| 검증 | 결과 |
|---|---|
| V1 실 작업 트리 F-1 | 실제 main의 `disk=176 / tracked=172 / unexpected=0 / ignored=4`에서 allow 양·대조 양쪽 공식 전체가 차단됨. PM 독립 확증도 아래에 원문 인용. |
| V2 lower semver 1.59.1 | `--` 뒤 897 narrow `5/1 EXIT=0`; 기존 narrow와 공식 548/172 collection 유지. |
| V3 upper semver 1.62.0 | `--` 확대 차단, `-G`와 `--last-failed-file` 값 소비 통과. OS temp 설치로 worktree `node_modules` 오염 없음. |
| V4 Windows 경로·ignore 정책 | repo-relative 과통과 및 file URL 과차단이 제거됨. `.git/info/exclude` rogue는 정책 허용 목록에 들어가지 않음. |
| V5 회귀·mutation | fix point별 F-1 1건, F-2 1건, F-3 2건, F-4 1건, F-5 2건 RED 확인 후 원복; production unit `50/50`, `EXIT=0`. |

### 8. PM 확증 원문

개발책임자가 실제 `C:\dev\Samhan-Public`에서 직접 실행한 원문을 그대로 인용한다.

```text
실 트리 scope: disk=176 tracked=172 unexpected=0 ignored=4
[F-1] allowUntracked=TRUE + 공식 전체 playwright/
    BLOCK: [real-QA 추적 집합 불일치] 공식 공유 하네스 실행을 중단합니다.
[대조] allowUntracked=false + 공식 전체 playwright/
    BLOCK: (동일)
```

### 9. 직전 증거 무결성 정정 E-1~E-4 확인

기존 본 dev-report의 `📌 증거 무결성 정정 4건` 절에 E-1~E-4가 이미 들어 있다. 이번
보완에서 그 절을 삭제하거나 축약하지 않았다. 내용 확인 결과는 다음과 같다.

| 항목 | 기존 정정 내용 |
|---|---|
| E-1 | 신규 체크아웃의 `548/172`를 실제 main 작업 트리의 `558/176`과 같은 상태로 일반화한 오류와, 그 오류가 F-1을 가린 이유. |
| E-2 | 위치 인자 없는 전체 실행의 계약 변경 뒤에도 과거 `548/172 EXIT=0` 서술을 현재 사실처럼 읽게 한 오류. |
| E-3 | `5a55506e0` 관련 개별 numstat 두 건(`playwright.real-qa.config.ts +20/-1`, `package.json +3/-2`)의 오기. |
| E-4 | 삭제분을 추가분에 더한 계산 습관과, 그 결과를 반복하지 않도록 개별 파일 원문을 그대로 적어야 한다는 정정. |

이번 F-1 fix는 E-1의 구조적 경고를 실제 실행 게이트까지 반영한 것이며, E-3/E-4의
교훈에 따라 아래 numstat도 파일별 값만 기록한다.

### 10. 변경 줄 수 — PM 제공 `git diff --numstat` 원문

이 라운드의 코드 변경에 대해 PM이 제공한 개별 파일 출력은 아래 세 줄 그대로다. 합산
막대 수치나 `+N/-M` 총계를 만들지 않았다.

```text
3	2	clients/desktop/README.md
68	42	clients/desktop/scripts/real-qa-scope.cjs
114	7	clients/desktop/scripts/real-qa-scope.test.cjs
```

이 세션에서는 사용자의 git 금지 지시를 지키기 위해 `git diff --numstat` 명령을 다시
실행하지 않았다. 따라서 위 블록은 PM이 전달한 최종 원문이며, 문서 보완 파일을 임의로
추산해 네 번째 줄을 만들지 않는다.

### 11. 이 라운드가 보지 않은 것

SOL 원문에서 남긴 미확인 항목 중 이번에도 다음은 보지 않았다.

1. Linux/CI runner의 실 CLI. 모든 실제 CLI는 Windows에서 수행했고, Linux의 path/file URL,
   Git 출력, process argv 차이는 검증하지 않았다.
2. README가 안내하는 non-list 전체 548건의 본문 실행과 GUI/스크린샷. 공유 실데이터 write
   위험과 renderer/order-app 기동 범위 때문에 `--list` collection으로 한정했다.
3. 실제 repo 파일명에 `+`, `(`, `[`, `]`가 들어간 경로의 CLI 왕복. 현재 그런 파일이 없고,
   저장소 안 probe 파일을 만들지 말라는 제약을 지켰다.
4. 대형 트리, 실패하는 Git, submodule/junction/symlink, detached HEAD의 성능·경계 조합.
   현재 fixture와 실 트리에서 정상 판정 방향만 확인했다.
5. 사용자 global exclude의 별도 실 주입. F-4는 요구된 `.git/info/exclude` 실 주입을
   수행했고, global exclude는 Git의 `--exclude-standard` 의미와 코드 경로로만 확인했다.
6. Playwright가 내부 `lib/program` 위치나 Commander metadata를 바꾸는 다음 업그레이드,
   그리고 `--ui`, VS Code extension, `test-server` 표면.
7. main config를 물리적으로 덮어쓴 CLI와 동시 작업의 `.claude/memory` 변경. main은
   read-only scope probe로만 사용했고 다른 경로는 건드리지 않았다.

### 12. 저장 직후 확인

이 절을 저장한 직후 확인한 신설 절 첫 40줄은 다음과 같다.

```text
## CODEX SOL 2차 라운드 (F-1~F-5) 및 fix

2026-07-28 · SOL 보고서 `969-sol-round2.md` 원문 기준. 앞 절의 이전 라운드 기록 중
`REAL_QA_ALLOW_UNTRACKED=1` + `playwright/`를 결함이 아니라고 적은 결론은 이 절에서
정정한다. 개발책임자 판정대로 F-1은 BLOCKING이며, F-1~F-5 전건을 수정하고 실제 CLI로
재검증했다. 종료코드는 파이프 없이 Playwright 프로세스 직후의 native exit code를
기록했다.

### 1. F-1~F-5 원인과 변경

| ID | SOL이 잡은 내용 / 근본 원인 | fix와 위치 |
|---|---|---|
| F-1 BLOCKING | 세션에 남은 `REAL_QA_ALLOW_UNTRACKED=1`이 명시 경로 `playwright/`에도 적용됐다. `playwright/`가 디스크+추적의 known scope 전체를 선택해도 관련 미추적 4개만 narrow 예외로 판정하므로 `558/176`이 `EXIT=0`이 됐다. | `decideRealQaScope`가 `diskFiles ∪ trackedFiles` 전체를 선택했는지 계산하고, 그 상태에서 `untrackedFiles`가 있으면 allow와 무관하게 `formatScopeMismatch`를 throw한다: `clients/desktop/scripts/real-qa-scope.cjs:429-430`. 공식 전체 실행 문서도 좁은 명시 경로에만 allow를 적용한다고 명시했다: `clients/desktop/README.md:306-313`. |
| F-2 BLOCKING | Playwright 1.62.0은 `--` 뒤 토큰을 테스트 필터에서 제거하지만 게이트는 그 토큰을 위치 후보로 남겼다. 따라서 897의 `5/1` 요청이 실제 Playwright에서는 필터 없는 `9/2` 실행으로 확대돼도 게이트가 통과했다. | 설치된 `playwright/lib/program`의 test command 옵션과 패키지 버전을 읽고, 1.62+에서는 `--` 뒤를 후보로 수집하지 않는다: `real-qa-scope.cjs:174-193,206-214`. |
| F-3 HIGH | 게이트 후보는 repo-relative와 정방향 slash 절대경로까지 추가했지만 Playwright Windows matcher의 실제 후보는 OS 절대경로와 file URL이었다. 그래서 게이트만 `1`개를 선택해 `0/0 EXIT=0`을 만들거나, Playwright가 `1/1`을 선택하는 file URL을 게이트가 0개로 차단했다. | `matchUniverse` 후보를 OS 절대경로와 Windows `pathToFileURL(...).href`로만 정렬했다: `real-qa-scope.cjs:301-316`. 회귀 테스트는 `real-qa-scope.test.cjs:823-843`. |
| F-4 HIGH | `--exclude-standard`를 repo `.gitignore`와 동일한 정책으로 오인했다. 이 옵션은 `.git/info/exclude`와 global exclude도 포함하므로 사용자별 rogue 스펙이 `ignored` 정책 허용 목록에 들어갔다. | `git ls-files`에 `--exclude-per-directory=.gitignore`만 사용해 repo `.gitignore` 기준으로 한정했다: `real-qa-scope.cjs:67`. `.git/info/exclude` 주입 fixture는 `real-qa-scope.test.cjs:845-861`. |
| F-5 MEDIUM | 수동 값 옵션 목록이 1.59.1 스냅샷이라 1.62.0의 `-G`, `--last-failed-file` 값을 위치 경로로 오인했다. | 수동 production 목록을 없애고 설치된 Commander 옵션의 required/optional/variadic schema를 런타임에 읽는다: `real-qa-scope.cjs:156-206`. 단위 fixture의 두 신규 값 옵션은 `real-qa-scope.test.cjs:35-42,863-879`에 고정했다. |

### 2. F-1이 3라운드 동안 보이지 않은 구조적 이유

신규 체크아웃 워크트리에는 `.gitignore`가 남겨 두도록 한 로컬 스펙 4개가 애초에 없다.
따라서 그 워크트리에서만 scope를 재면 `disk=tracked=172`가 되어 `untracked=0`이고,
`REAL_QA_ALLOW_UNTRACKED=1`을 켜도 오염시킬 파일이 없어 항상 GREEN이다. 실제로 사용해 온
`C:\dev\Samhan-Public`에는 `disk=176`, `tracked=172`, `ignored=4`가 이미 있었고, 이
조건에서만 세션 잔존 allow와 공식 `playwright/`의 조합이 `558/176 EXIT=0`으로 드러났다.
즉 “새 워크트리에서 재현되지 않음”은 F-1이 없다는 근거가 아니라, 결함 입력 집합을
만들지 않은 관찰이었다. 이번 라운드는 파일을 삭제하지 않고 실 main 트리의 미추적 4개를
그대로 둔 상태에서 RED를 재현했다.

### 3. F-2·F-5 공통 뿌리와 구조 처리

두 결함의 공통 뿌리는 Playwright 옵션 schema를 손으로 열거해 유지한 것이다. 1.62.0에서
`--` parser 동작이 바뀌고 `-G`, `--last-failed-file`가 추가되자 게이트의 수동 목록과
Playwright가 갈라졌다.

이번에는 production이 설치된 Playwright의 `testCommand.options`를 직접 introspection해
값을 받는 flag와 variadic flag를 구성한다. `--project` 같은 variadic도 schema에서 읽고,
1.62의 `--` 동작은 패키지 semver에서 계산한다. node_modules가 없는 순수 단위 테스트는
`UNIT_CLI_CONTRACT` fixture를 주입하며, production에 새 옵션을 추측하는 수동 fallback은
두지 않았다.
```

PM이 전달한 최종 numstat 원문은 §10의 세 줄을 그대로 재인용한다.
