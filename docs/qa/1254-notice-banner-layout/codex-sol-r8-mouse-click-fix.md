# PR #1254 CODEX LUNA 구현 — 마지막 마우스 클릭 결함 수정 보고

## ① 환경 확인

요청된 원문 명령:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD                 # ab88776db
git rev-parse --abbrev-ref HEAD    # fix/notice-banner-layout-and-wording
git status --porcelain             # 비어 있어야 한다
```

실행 원문:

```text
ab88776db025ff997bcafc03bfa838e66888997f
fix/notice-banner-layout-and-wording
?? docs/qa/1254-notice-banner-layout/codex-sol-r7-merge-verdict.md
```

HEAD와 브랜치는 일치했다. 시작 시 기존 미추적 보고서 1개가 있어 보존했다.

## ② RED 원문

수정 전 실패 테스트:

```text
FAIL src/components/AppUpdateNotice/AppUpdateNotice.test.tsx
AppUpdateNotice > 확대된 좁은 화면에서 우측 스크롤바 띠와 겹친 배너 버튼도 마우스 클릭을 받는다
AssertionError: expected "spy" to be called once, but got 0 times
Test Files 1 failed (1)
Tests 1 failed | 9 skipped (10)
```

재현 조건은 스택 우측 12px 스크롤바 레인과 버튼 좌표가 겹치는 상태였다.

## ③ 근원

`AppUpdateNoticeStack`의 `window` 캡처 단계 `click` 리스너가 좌표만 보고 우측 12px을 스크롤바로 판정했다. 따라서 `elementFromPoint`의 결과는 버튼이어도 `preventDefault()`와 `stopImmediatePropagation()`이 버튼보다 먼저 실행되어 마우스 이벤트가 끊겼다. 포인터 이벤트 CSS나 좌표 반올림이 아니라, 겹친 레이어의 캡처 리스너가 조작 이벤트를 삼킨 문제였다.

## ④ 고친 것

스크롤바 클릭 처리 시작부에서 이벤트 대상이 `button, a, input, select` 내부이면 반환하도록 수정했다. 빈 스크롤바 레인의 페이지 이동·스크롤바 동작은 유지하고, 실제 조작 요소의 마우스 이벤트만 통과시킨다. 같은 조건의 회귀 테스트를 추가했다.

변경 파일:

```text
clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.tsx
clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.test.tsx
```

## ⑤ 화면 조작 요소 전수 마우스 결과

최신 SOL R6 Electron 라이브 QA에서 배너와 겹친 외부 조작 요소를 실제 `page.mouse.click`으로 전수 탐침했다.

```text
320x480/100%: 날짜 INPUT 1, CSV 다운로드 BUTTON 1
320x600/125%: 날짜 INPUT 1, CSV 다운로드 BUTTON 1
480x480/100%: 이력 탭 BUTTON 2개 각각 1
320x600/100%: 이력 탭 BUTTON 2개 각각 1
320x480/150%: 권한 다시 확인 BUTTON 1
```

배너 자신의 `보안인증서 설치`, `다시 확인`, `닫기`도 실제 mouse probe 수신 1회씩 확인했다. `320x600 · 125%` CSV는 `hitTag=BUTTON`, `hitMatches=true`, `received=1`이었다.

## ⑥ 배율×뷰포트 매트릭스

뷰포트 `320x480, 480x480, 320x600, 600x720` × 배율 `100%, 125%, 150%` × 배너 `1, 2, 3장` 총 36개를 실행했다.

```text
[MATRIX-SUMMARY] viewportBannerCases=36
[DEFECTS] count=0 []
320x600/125% CSV hitTag=BUTTON, hitMatches=true, received=1
```

배너 순서와 간격도 전 케이스에서 `['app-version-policy-error','app-trust-root-disabled','app-auto-update-status']`, `[12,12]`이었다.

## ⑦ 잃으면 안 되는 것 재현

```text
본문 y 차이: 0
배너 밖 조작요소 실제 클릭 수신: 통과
배너 자신의 버튼 실제 클릭 수신: 통과
진리표 4조합: 통과
신뢰 루트: 사용자 표기 0건
보안인증서: 사용자 표기 2건
행 클릭: 45행 중 실제 클릭 후 #/dispatches/manual 이동
모달: 미배차 결과 저장 visible=true
드롭다운: active=true, options=3
인쇄: data-print-exclude 전부 display=none
Tab: 배너 내부 진입 후 외부 메뉴로 이동
공유 실데이터 write: 3건 모두 route 차단
```

## ⑧ 캡처

모든 캡처는 `resolveQaShotsDir()` 경유 목적지에 생성했다.

```text
docs/qa/1254-notice-banner-layout/sol-r6-final/_local/320x480-three-banners-sol-r6-final-real-qa.png
docs/qa/1254-notice-banner-layout/sol-r6-final/_local/480x480-three-banners-sol-r6-final-real-qa.png
docs/qa/1254-notice-banner-layout/sol-r6-final/_local/320x600-three-banners-sol-r6-final-real-qa.png
docs/qa/1254-notice-banner-layout/sol-r6-final/_local/600x720-three-banners-sol-r6-final-real-qa.png
```

## ⑨ 회귀

stale dist 방지를 위해 순차 실행했다.

```text
design-system build: exit 0
arologis-desktop build: exit 0
design-system: 32 files, 290 tests passed (기존 289 + 신규 회귀 1)
arologis-desktop: 21 files, 99 tests passed
SOL R6 Playwright: 1 passed, 11.5s, exit 0
```

보조 production 스펙은 첫 600x720 기하학적 overlap 단언에서 기존 스펙 자체의 `내역으로 저장` 3021.375px² 조건으로 실패했다. 이번 판정은 요청된 최신 SOL R6의 실제 클릭 수신 기준으로 삼았고, 그 스펙은 exit 0이다.

## ⑩ 증거 무결성 자기 고지

`git add`, `git add -A`, `git commit`, `git push`는 실행하지 않았다. Blob/anchor 동작은 공유 데이터에 쓰지 않도록 API POST를 route 차단했다. Playwright와 Electron은 `finally`에서 종료했다. 보고서는 UTF-8로 저장했다.

## ⑪ 프로세스 회수

```text
기동한 QA 프로세스 잔여: 0
격리 컨테이너 잔여: 0
```

## ⑫ 최종 git status 원문

```text
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.test.tsx
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.tsx
?? docs/qa/1254-notice-banner-layout/codex-sol-r7-merge-verdict.md
?? docs/qa/1254-notice-banner-layout/codex-sol-r8-mouse-click-fix.md
```

PM 대행을 위해 커밋·푸시하지 않은 상태다.
