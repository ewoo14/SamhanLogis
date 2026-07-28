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
