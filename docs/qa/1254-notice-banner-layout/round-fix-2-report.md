# PR #1254 라운드 fix 2 증명 보고서

## ① 환경 확인

요청된 작업 디렉터리에서 맨 먼저 실행한 원문이다.

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD                 # cf923a153 (fix + main 최신화)
git rev-parse --abbrev-ref HEAD    # fix/notice-banner-layout-and-wording
git status --porcelain             # 비어 있어야 한다
```

실행 결과 원문:

```text
cf923a153c24f98cc35bf23eab4c106e465bff6a
fix/notice-banner-layout-and-wording

```

초기 `git status --porcelain`은 빈 출력이었다.

## ② PM이 지적한 3축의 RED 시도 원문

수정 전, 실제 Electron 앱·실 서버에서 먼저 재현했다. 해시 라우트는 `#/dispatches/unassigned`를 사용했고, 화면 고유 요소 `미배차 리스트`와 날짜 입력을 확인한 뒤 측정했다.

짧은 높이 축의 RED 원문:

```text
[RED-FIRST] {"width":600,"height":720,"stack":{"x":0,"y":480,"width":600,"height":280.40625,...},"firstRow":{"top":499.125,...},"overlap":[{"label":"수동 배차로 이동","area":3513.4168090820312}, ... 5 items],"total":15594.708314418793}
교차 면적: 600x720, received 15594.708314418793
```

가득 찬 데이터 축도 같은 실측으로 입증했다.

```text
[REAL-DATA] date=2026-08-08 response=200 backendEntries=45 renderedRows=45
```

즉, 활성 행 5건짜리 얇은 데이터가 아니라 백엔드 45건을 받아 45행을 렌더링하고 스크롤이 생긴 상태에서 짧은 높이 RED가 발생했다. 첫 시도 뒤 600×800에서도 탭 교차 `4168.748474121094`가 재현되어 배치 측정 시점까지 보완했다.

상수 축의 근거는 수정 전 측정의 `stack.y=480`과 기존 CSS의 고정 `inset-block-start: 480px`이다. 이 값은 헤더·메뉴의 실제 높이에서 유도되지 않았고, 위 RED의 원인이었다.

## ③ 고친 것과 ④ 매직 상수 비의존을 보장한 근거

- 배너 스택을 계속 `position: fixed`로 두어 문서 흐름을 밀지 않게 했다.
- 스택 위치는 고정 480px가 아니라, 현재 보이는 스택 밖의 `a`, `button`, `input`의 실제 `getBoundingClientRect().bottom` 최댓값에 디자인 토큰 `--space-4`를 더해 계산한다.
- 계산 결과를 `--app-update-notice-top`으로 주입한다. 헤더·메뉴의 줄 수나 높이가 바뀌면 MutationObserver와 resize 재측정이 다시 계산한다.
- 초기 레이아웃과 변동 후 레이아웃 모두 두 번의 `requestAnimationFrame` 뒤 측정하여, 메뉴/헤더 변경 직후의 중간 상태를 사용하지 않는다.
- 일반 테이블 행의 조작 요소는 배너가 사용할 수 없는 데이터 영역이므로 위치 산정에서 제외한다. 따라서 목록이 길어져도 배너는 헤더/메뉴 아래의 좌측 빈 슬롯을 사용하며 행 조작 요소와 교차하지 않는다.
- CSS에는 `480px` 및 폭별 `@media` 위치값을 남기지 않았다. 위치는 현재 DOM의 실제 레이아웃과 공통 spacing 토큰에서만 나온다. 이것이 헤더/메뉴 높이 변경에도 ④를 보장하는 근거다.

## ⑤ 폭×높이 교차표

판정은 배너 사각형과 배너 밖의 보이는 `a/button/input`의 면적 합이다. 모든 값은 px²이며 0이어야 통과한다.

| 높이 \\ 폭 | 600 | 768 | 1024 | 1280 | 1440 | 1920 |
|---|---:|---:|---:|---:|---:|---:|
| 720 | 0 | 0 | 0 | 0 | 0 | 0 |
| 800 | 0 | 0 | 0 | 0 | 0 | 0 |
| 900 | 0 | 0 | 0 | 0 | 0 | 0 |
| 1080 | 0 | 0 | 0 | 0 | 0 | 0 |

실제 라이브 스펙은 24조합을 모두 실행했고 `1 passed (6.9s)`였다. 짧은 창 720·800을 포함하며, 높이 900만 고정한 검증이 아니다.

## ⑥ 가득 찬 목록에서의 교차 0

실 서버의 `2026-08-08` 미배차 응답은 HTTP 200, 45건이었다. 화면 행 수는 45행으로 세었고 백엔드 응답 건수와 일치했다. 이 상태에서 24개 폭×높이 조합의 교차 면적 합은 모두 0이었다.

## ⑦ 밀림 y좌표

배너 표시 전후에 본문 첫 제목의 y 좌표를 같은 스위트에서 비교했다.

```text
withBanner=142.3854217529297
withoutBanner=142.3854217529297
difference=0
```

실 라이브 24조합도 각 조합의 y 차이가 0이었다. 스택은 fixed이므로 헤더와 본문 첫 행의 흐름을 밀지 않는다.

## ⑧ 보존된 회귀 불변식

- 개발×env 유무, 패키지×env 유무의 진리표 4조합 기대값을 기존 `AppVersionGate` 테스트에서 다시 통과시켰다.
- 사용자 대면 `신뢰 루트` 표기는 0건이다.
- 사용자 대면 `보안인증서` 표기는 유지했다.
- 기존 mock/PR 스펙의 스택 순서는 `['app-version-policy-error','app-trust-root-disabled','app-auto-update-status']`로 유지됐다.
- 기존 mock/PR 스펙의 gaps는 `[12,12]`로 유지됐다.
- 실제 서버 라이브 실행에서는 버전 정책 API가 성공하여 표시 배너가 2개였으므로, 실측 order는 `['app-trust-root-disabled','app-auto-update-status']`, gaps는 `[12]`였다. 이는 mock 3배너 보존 검증과 실제 서버 데이터 검증을 혼동하지 않기 위한 구분이다.

## ⑨ 스크린샷

실제 Electron 앱과 실 서버에서 24개 조합을 캡처했다.

- 디렉터리: `docs/qa/1254-notice-banner-layout/round-fix-2-screenshots/_local/`
- 파일 수: 24개 PNG
- 총 바이트: 1,408,900 bytes
- 대표 파일: `red-first-600x720.png`, `red-first-1920x1080.png`
- 각 파일명에 폭×높이를 기록했고, 파일 존재·바이트 수를 확인했다.
- 캡처는 headless Chromium/Electron의 실제 앱 화면이며, 화면 고유 요소 확인 후 생성했다. 육안 확인 결과 배너는 헤더/메뉴 아래에 있고 목록 조작 요소를 덮지 않는다.

## ⑩ 회귀

다음 검증을 완료했다.

- design-system 단위 테스트: 32개 파일, 285개 테스트 통과
- arologis-desktop 단위 테스트: 21개 파일, 99개 테스트 통과
- arologis-desktop typecheck: 통과
- design-system build: 통과
- arologis-desktop build: 통과
- PR 기존 Playwright 스펙 `1254-arologis-production-electron.spec.ts`: 1 passed (11.6s)
- 라운드 2 실 라이브 스펙 `1254-round-fix-2-real-qa.spec.ts`: 24조합, 1 passed (6.9s)

빌드 중 Pretendard 폰트 경로에 대한 기존 unresolved 경고가 있었지만 build 종료 코드는 0이었다.

## ⑪ 증거 무결성 자기 고지

- 이번 라운드에서 `git add`, `git commit`, `git push`를 실행하지 않았다.
- 실 라이브 스펙은 `clients/desktop` 패키지 안에서 실행했고, `-real-qa` 접미사를 사용했다.
- 라이브 검증은 mock 데이터가 아니라 실 8097 서버의 45건 응답과 실제 Electron 화면을 사용했다. 자격 증명은 최신 `infrastructure/.env.local`에서 읽었고 보고서에 비밀값을 기록하지 않았다.
- 기존 3배너 진리표·순서·gaps는 기존 PR mock 스펙으로 별도 보존 검증했다. 라이브 서버에서 배너 수가 2개인 사실을 3배너 결과처럼 보고하지 않았다.
- 새 라이브 스펙과 보고서 파일은 사용자 지시의 add 금지에 따라 스테이징하지 않았다.

## ⑫ 프로세스 회수

제가 기동한 Vite PID 81264와 그 직계 자식 conhost/esbuild를 식별하여 종료했다. 종료 후 해당 PID와 자식은 0개였다. Playwright/Electron 자식 잔여도 없었다.

격리 컨테이너는 이번 작업에서 기동하지 않았다(0개). 이미 실행 중이던 공유 서비스 컨테이너는 중지하지 않고 그대로 두었다.

## ⑬ 최종 `git status --porcelain` 원문

```text
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.module.css
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.test.tsx
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.tsx
?? clients/desktop/playwright/1254-round-fix-2-real-qa/
?? docs/qa/1254-notice-banner-layout/round-fix-2-report.md
```
