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
