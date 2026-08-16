# PR #1254 CODEX LUNA 마지막 fix 보고서

## ① 환경 확인

요청된 원문 명령을 실행했다.

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD                 # 93dccd8ea (main 최신화 직후)
git rev-parse --abbrev-ref HEAD    # fix/notice-banner-layout-and-wording
git status --porcelain             # 비어 있어야 한다
```

실행 원문:

```text
93dccd8ea31581960dc6e74a004cc1556f595043
fix/notice-banner-layout-and-wording
?? clients/desktop/playwright/1254-sol-r3-real-qa/
?? docs/qa/1254-notice-banner-layout/sol-r3-adversarial-report.md
```

HEAD/브랜치는 일치했다. status는 선행 라운드 미추적 산출물 2개 때문에 비어 있지 않았고, 삭제·스테이징하지 않았다.

## ② RED 원문

새 RED 테스트를 먼저 추가하고 실행했다.

```text
FAIL src/components/AppUpdateNotice/AppUpdateNotice.test.tsx > AppUpdateNotice > stack 자체를 키보드로 스크롤할 수 있는 독립 영역으로 노출한다
AssertionError: expected null to be 'region' // Object.is equality
Tests 1 failed | 5 passed (6)
```

이 실패는 새 스크롤 영역 계약이 구현되지 않은 현재 상태에서 의도한 실패였다.

## ③ 근원

기존 구현은 실제 헤더 조작 요소의 하단을 계산해 `position: fixed`의 시작 좌표만 정하고, 자식 배너의 전체 높이를 뷰포트 높이와 연결하지 않았다. 그래서 3장 스택의 문서 좌표는 존재해도 600×720에서는 세 번째 카드가 뷰포트 밖에 남아 접근할 수 없었다.

CI 원문에서도 해당 스펙은 첫 화면 단정 로그 전에 반복해서 정확히 60초에 종료됐다.

```text
Test timeout of 60000ms exceeded.
Retry #1 ... Test timeout of 60000ms exceeded.
```

Ubuntu Electron의 setuid sandbox가 준비되지 않아 `electron.launch` 이후 첫 BrowserWindow 경계가 응답하지 않은 것이 CI 타임아웃 근원이다. 배너 판정 로직이나 sleep이 원인이 아니었다.

## ④ 고친 것과 상수 유도 근거

- 스택에 `max-block-size: calc(100dvh - 동적 top - var(--space-4))`를 적용했다. top은 기존처럼 실제 헤더/메뉴 조작 요소의 bottom에서 계산한다.
- `overflow-y: auto`, `overscroll-behavior: contain`, `scrollbar-gutter: stable`을 적용했다.
- 스택 자체를 `role="region"`, `aria-label="업데이트 알림"`, `tabIndex=0`, `data-scrollable="true"`인 포커스 가능 영역으로 노출했다.
- 스택 위에서 포인터 이벤트가 배너 밖 조작 요소로 통과하는 기존 계약을 유지하면서, window capture 휠 이벤트로 스택 자체를 스크롤한다.
- 새 좌표 상수는 추가하지 않았다. 여백은 기존 `--space-4`, 카드 간격은 기존 `--space-3` 토큰이다. 최대 높이는 viewport `100dvh`와 런타임 계산 top에서 유도한다.
- CI Linux에서만 Electron args에 `--no-sandbox`를 추가했다. Windows/macOS 기본 sandbox는 변경하지 않았다.

## ⑤ 새 조합 열거와 결과

- 스크롤바: `overflowY=auto` 및 실제 `scrollHeight > clientHeight` 확인.
- 포커스 이동: stack focus와 세 번째 배너 버튼 focus/click 확인.
- 키보드 탐색: 포커스 가능한 독립 region과 기존 Tab 경로 확인.
- 배너 내부 버튼 잘림: `scrollTop=max` 후 세 번째 카드가 `top>=0 && bottom<=innerHeight`인지 확인.
- 인쇄: 모든 `[data-print-exclude]`가 `display:none`인지 확인.
- 모달 겹침: modal z-index 1000 > stack z-index 999 및 실제 hit 확인.
- 스크롤 휠: 600×720에서 `wheelScrollTop=352` 확인.

## ⑥ 폭×높이×장수 전수표

폭 `[600, 768, 1024, 1280, 1440, 1920]` × 높이 `[720, 800, 900, 1080]` = 24개 뷰포트 조합을 실행했다. 각 조합에서 1·2·3장 장수 매트릭스를 실행했다.

```text
[BANNER-COUNT-MATRIX] cases=24 counts=1,2,3 reachable=true
```

각 조합의 공통 단정은 `interactiveOverlapTotal=0`, 순서 `['app-version-policy-error','app-trust-root-disabled','app-auto-update-status']`, gaps `[12,12]`(3장), 1장 `[]`, 2장 `[12]`, 인쇄 제외 통과다.

## ⑦ 600×720 · 3장 세 번째 버튼 원문

```text
[STACK-WHEEL] {"wheelScrollTop":352,"overflowY":"auto"}
[STACK-SCROLL] {"viewport":{"width":600,"height":720},"thirdBeforeScroll":{"x":16,"y":866.3229370117188,"width":183.33334350585938,"height":189.25006103515625},"scrollTop":352,"scrollHeight":532,"clientHeight":180,"third":{"top":514.32293701171875,"bottom":703.5729370117188,"fullyInViewport":true}}
[THIRD-BUTTON-CLICK] {"thirdButtonClicks":1,"visible":false}
```

`visible=false`는 클릭으로 상태 확인 요청이 처리되어 status 배너가 사라진 결과이며, 클릭 이벤트 자체는 `thirdButtonClicks=1`로 단정됐다.

## ⑧ CI 타임아웃 근원과 조치

근원은 Ubuntu runner의 Electron setuid sandbox 미준비로 첫 BrowserWindow가 열리지 않은 것이다. 테스트 숫자나 전역 timeout을 늘리지 않고, 스펙의 Linux 실행 인자에만 `--no-sandbox`를 넣었다. 수정 후 동일 스펙은 60초 제한에서 14.7초에 단정까지 도달했다.

## ⑨ 잃으면 안 되는 것 유지 확인

4조합 진리표, 사용자 대면 「신뢰 루트」 0건, 「보안인증서」 표기, 본문 y 좌표 차이 0, 순서/gap 계약, 스크롤 행·모달·드롭다운·인쇄·Tab 기존 확인을 유지했다. 단위 테스트에서 기존 AppUpdateNotice 계약 5개와 신규 스크롤 계약 1개가 모두 통과했다.

## ⑩ 캡처

캡처 목적지는 스펙에서 `resolveQaShotsDir()`를 경유했다.

```text
clients/desktop/playwright/1254-arologis-production-electron.spec.ts
SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../docs/qa/1254-notice-banner-layout/screenshots'))
```

폭×높이별 캡처 파일을 생성했다. 실행은 `clients/desktop` 안에서 headless Electron/Playwright로 했다.

## ⑪ 회귀

```text
DS AppUpdateNotice 단위: 1 file, 6 passed
arologis-desktop 단위: 21 files, 99 passed
arologis-desktop typecheck: exit 0
arologis-desktop build: exit 0
PR #1254 Playwright: 1 passed (14.7s)
git diff --check: exit 0
```

실행 명령:

```text
cd clients/web/design-system; npm exec vitest run src/components/AppUpdateNotice/AppUpdateNotice.test.tsx -- --reporter=dot
cd clients/arologis-desktop; npm test
cd clients/arologis-desktop; npm run typecheck
cd clients/arologis-desktop; npm run build
cd clients/desktop; npx playwright test playwright/1254-arologis-production-electron.spec.ts --reporter=line
```

## ⑫ 증거 무결성 자기 고지

CI 타임아웃 원문은 GitHub Actions 실패 run `31942097761`의 `gh run view --log-failed`에서 확인했다. 로컬 PR 스펙은 mock route를 사용한 production Electron 회귀이며, 실제 백엔드 실서버 QA와 혼동하지 않았다. 캡처 경로 resolver와 실행 위치를 확인했다. 타임아웃 숫자를 늘리지 않았다.

## ⑬ 프로세스 회수

이번 라운드가 기동한 Electron 4개와 Playwright node 1개를 명시 PID로 회수했다. 회수 후 `w1253` 경로의 Electron/chrome-headless-shell과 desktop Playwright node 잔여는 0개다. 기존 공유 인프라 Docker 컨테이너는 이번 라운드가 기동하지 않았으므로 다른 라운드 자원을 중단하지 않았다.

## ⑭ 최종 git status --porcelain 원문

```text
 M clients/desktop/playwright/1254-arologis-production-electron.spec.ts
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.module.css
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.test.tsx
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.tsx
?? clients/desktop/playwright/1254-sol-r3-real-qa/
?? docs/qa/1254-notice-banner-layout/luna-final-fix-report.md
?? docs/qa/1254-notice-banner-layout/sol-r3-adversarial-report.md
```

커밋·푸시·`git add`는 수행하지 않았다. 선행 라운드 미추적 산출물 2개와 본 보고서 파일은 PM이 후속 통합한다.
