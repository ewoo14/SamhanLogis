# PR #1272 CI fix — Desktop Playwright mock 회귀 hard gate 보고서

검증일: 2026-08-18 KST  
워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wcat`  
브랜치: `feat/category-settings-migration`

## ① 실패 스펙·단정 원문

시작 전 `git merge origin/main --no-edit`는 충돌 없이 수행됐다. 이 명령으로 merge commit이 자동 생성되었으며, 별도 `git add`·commit·push는 하지 않았다.

수정 전 mock gate 수집 원문:

```text
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5184/
Call log:
  - navigating to "http://127.0.0.1:5184/", waiting until "domcontentloaded"
at playwright/1272-sol-reverdict-3/1272-order-app-bootstrap-live.spec.mjs:32
```

동일 계열 파일을 기본 mock 설정으로 직접 지정한 원문:

```text
Error: No tests found.
TARGET_DEFAULT_EXIT_CODE=1
```

두 파일은 `test()`/ `test.describe()`가 없는 top-level 실서버 Playwright 하네스이며, `http://127.0.0.1:5184/`와 실제 API `:8080`을 요구한다.

## ② (a)/(b) 판정과 근거

판정: **(a) 화면 기능이 깨진 것이 아니라 실서버 QA 하네스가 mock 게이트 자동 수집 규칙에 들어온 분류 오류**다.

- 실패 지점은 화면 단정 이전의 실서버 `:5184` 이동이다.
- 견적품목 설정 모달과 기초품목 경계를 직접 캡처로 확인했고 Vitest 전체 실행도 성공했다.
- mock 스펙의 단정·skip·testIgnore는 변경하지 않았다.
- 실서버 하네스 두 파일의 접미사를 `.spec.mjs` → `.live.mjs`로 바꿔 자동 수집에서 분리하고 직접 `node <파일>` 실행 경로는 보존했다. `testIgnore`는 추가하지 않았다.

## ③ 사라지면 안 될 것 확인

- [견적품목 설정 모달](../1272-sol-reverdict-3/screenshots/01-commercial-fixed-saved-real-qa.png): 설정 2행(AM100AXVHHH1, AM160AXVHHH1), 수량 동기화·품목구분·옵션 입력 유지.
- [기초품목 경계](../1272-sol-reverdict-3/screenshots/05-basic-product-boundary-real-qa.png): 구성품 2행, 고정금액 편집 2개, 판매가·매입가·출고가·배송가 모두 존재. 배송가 값 `13,299,110` 유지.

두 PNG를 원본 해상도로 직접 열어 확인했다.

## ④ 바꾼 기대값과 이유

mock 기대값은 **0건 변경**이다. assertion 삭제·완화·skip·allowlist·`testIgnore` 추가가 없다.

변경한 것은 실서버 하네스 파일 분류뿐이다.

```text
1272-live-3axes-order-app.spec.mjs     → 1272-live-3axes-order-app.live.mjs
1272-order-app-bootstrap-live.spec.mjs → 1272-order-app-bootstrap-live.live.mjs
```

## ⑤ 테스트 결과(종료코드)

```text
npx playwright test --reporter=line
Running 669 tests using 2 workers
668 passed (6.7m)
1 failed
WCAT_MOCK_PLAYWRIGHT_EXIT_CODE=1
```

잔여 1건은 main 기존 실패이며 ⑥에서 대조했다.

```text
npx vitest run --pool=forks --maxWorkers=1 --minWorkers=1 --reporter=json
WCAT_VITEST_JSON_EXIT_CODE=0
JSON summary: 764 suites, 2478 tests, 2476 passed, 2 pending, 0 failed
```

Vitest JSON summary 원문:

```text
"numTotalTestSuites":764,"numPassedTestSuites":764,"numFailedTestSuites":0,
"numTotalTests":2478,"numPassedTests":2476,"numFailedTests":0,
"numPendingTests":2,"success":true
```

## ⑥ 다른 실패 귀속(main 대조)

```text
[chromium] › playwright\slip-version-history\slip-version-history.spec.ts:68:3
› S2b 전표 버전이력 필드 변경 로그 + 복원
668 passed (6.7m)
```

main 대조:

```text
git diff --exit-code origin/main...HEAD -- clients/desktop/playwright/slip-version-history/slip-version-history.spec.ts
DIFF_EXIT_CODE=0

git rev-parse origin/main:clients/desktop/playwright/slip-version-history/slip-version-history.spec.ts
4312ba03855e8834da35c8627de0afb12a866484

git hash-object clients/desktop/playwright/slip-version-history/slip-version-history.spec.ts
4312ba03855e8834da35c8627de0afb12a866484
```

잔여 실패는 main과 내용이 동일한 기존 실패다. 이번 실행에서 `Set up job` 실패는 없었다.

## ⑦ 스크린샷

| 캡처 | 직접 확인 결과 |
|---|---:|
| `01-commercial-fixed-saved-real-qa.png` | 견적품목 설정 2행 |
| `05-basic-product-boundary-real-qa.png` | 기초품목 구성품 2행; 가격 영역 배송가 존재 |

두 캡처는 `resolveQaShotsDir()` 경유 산출물이며 라이브 하네스는 `clients/desktop/playwright` 하위에 유지했다.

## ⑧ `git status --porcelain` 원문

```text
 D clients/desktop/playwright/1272-live-3axes/1272-live-3axes-order-app.spec.mjs
?? clients/desktop/playwright/1272-live-3axes/1272-live-3axes-order-app.live.mjs
?? clients/desktop/playwright/1272-sol-reverdict-3/
?? docs/qa/1272-ci-fix/
?? docs/qa/1272-sol-reverdict-3/
```

커밋·push·add는 하지 않았다. `.pid`·`.log`·0행 debug 캡처는 생성하지 않았다.

## ⑨ 프로세스 회수

- 이번 실행의 Playwright/Vitest 및 Vite webServer 프로세스는 종료 확인했다.
- 전용 포트에 LISTEN 잔여 없음. `5173`에는 `TIME_WAIT`만 남았고 LISTEN은 없었다.
- 공유 `samhan-*` 컨테이너는 stop/restart/recreate하지 않았다.
- 다른 워크트리를 건드리지 않았다.

최종 결론: **PR #1272의 mock hard gate 원인은 실서버 하네스 자동 수집 분류 오류다. 두 하네스를 `.live.mjs`로 보존 분류했고, 전체 Vitest는 2478건 중 2476 통과·2 pending·0 실패다. mock gate의 잔여 1건은 main 기존 실패다.**
