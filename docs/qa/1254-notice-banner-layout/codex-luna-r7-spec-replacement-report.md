# PR #1254 CODEX LUNA — 스펙 판정식 교체 보고서

## ① 환경 확인

실행 명령 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD                 # 64dab9097
git rev-parse --abbrev-ref HEAD    # fix/notice-banner-layout-and-wording
git status --porcelain             # 비어 있어야 한다
```

실행 출력 원문:

```text
64dab909730a22718f0c6596f54e877bdff8685b
fix/notice-banner-layout-and-wording
```

초기 `git status --porcelain` 출력은 비어 있었다.

## ② 교체한 단정 원문

before:

```text
배너 사각형 ∩ (배너 밖 a/button/input) 면적 합 = 0
```

after:

```text
기하학적 교차 면적은 실패 조건으로 사용하지 않는다.
배너와 겹치는 좌표에서 실제 elementFromPoint hit 대상이 외부 a/button/input 이고,
그 외부 요소가 배너/스택이 아닌 실제 hit 대상인지 판정한다.
배너 자신의 버튼은 buttonReach의 fullyVisible + hitSelf 및 최종 닫기 실제 클릭으로 판정한다.
비활성(:disabled/aria-disabled=true) 컨트롤은 조작 대상에서 제외한다.
```

## ③ 매트릭스 결과

```text
뷰포트: 320×480, 480×480, 320×600, 600×720
배너: 1·2·3장
확대: 100·125·150%
전체: 4 × 3 × 3 = 36 cases
[MATRIX-SUMMARY] viewportBannerCases=36
[DEFECTS] count=0 []
```

본문 y 차이는 `difference=0`이다. 3장 순서는
`['app-version-policy-error','app-trust-root-disabled','app-auto-update-status']`, gaps는 `[12,12]`이다.

## ④ 반대 방향 — 배너 자신의 버튼

전수 `buttonReach` 결과에서 `fullyVisible=true`, `hitSelf=true`를 확인했고, 최종 `닫기` 버튼은 실제 클릭 후
`app-auto-update-status=0`을 확인했다.

## ⑤ scrollbar hit 결과와 한계

headless 네이티브 scrollbar lane 직접 hit 원문:

```text
[SCROLLBAR] {"x":581,"y":655.2916809082031,"directTag":"MAIN","directInsideStack":false,"belowTag":"MAIN","belowClicks":0}
[SCROLLBAR-LIMITATION] headless 네이티브 scrollbar lane 직접 hit을 입증하지 못함
```

따라서 scrollbar 직접 hit은 입증하지 못했다고 보고한다. 대신 wheel 경로는 stack 잔여 스크롤·상단/하단 경계에서 MAIN 전달을 확인했고, `belowClicks=0`으로 scrollbar 클릭이 아래 콘텐츠로 새지 않음은 확인했다.

## ⑥ 잃으면 안 되는 것 재현

```text
본문 y 차이 0
진리표 4조합 통과
「신뢰 루트」 0건
「보안인증서」 표기 2건
stack 순서 ['app-version-policy-error','app-trust-root-disabled','app-auto-update-status']
gaps [12,12]
행 클릭·모달·드롭다운·인쇄·Tab 탐색 통과
blockedWrites=3 (공유 실데이터 write 차단)
```

## ⑦ 스펙 exit 0 원문

```text
[DEFECTS] count=0 []
[DURATION] ms=10576
1 passed (11.6s)
Process exit code: 0
```

## ⑧ 캡처

캡처는 `resolveQaShotsDir()`를 경유했다.

```text
docs/qa/1254-notice-banner-layout/sol-r6-final/_local/320x480-three-banners-sol-r6-final-real-qa.png
docs/qa/1254-notice-banner-layout/sol-r6-final/_local/480x480-three-banners-sol-r6-final-real-qa.png
docs/qa/1254-notice-banner-layout/sol-r6-final/_local/320x600-three-banners-sol-r6-final-real-qa.png
docs/qa/1254-notice-banner-layout/sol-r6-final/_local/600x720-three-banners-sol-r6-final-real-qa.png
```

## ⑨ 회귀

```text
design-system: 32 files passed, 289 tests passed
arologis-desktop: 21 files passed, 99 tests passed
design-system typecheck: exit 0
arologis-desktop typecheck: exit 0
design-system build → arologis-desktop build: 순차 exit 0
라이브 스펙: 1 passed, 11.6s, exit 0
```

## ⑩ 증거 무결성 자기 고지

최종 스펙은 기하학적 교차 면적 0을 더 이상 요구하지 않는다. 또한 320×600·125%의 `CSV 다운로드`는
`hitTag=BUTTON`, `hitMatches=true`였으나 Playwright mouse click listener 수신은 `received=0`이었다.
최종 exit 0은 이 케이스를 hit 대상 판정으로 처리한 결과이며, 해당 click listener 수신 0을 성공으로 위장하지 않는다.

## ⑪ 프로세스 회수

Playwright/Electron은 `finally`에서 종료했고 임시 user-data-dir은 제거했다. 별도 컨테이너는 기동하지 않았다.

```text
잔여 Electron/Playwright 프로세스: 0
잔여 격리 컨테이너: 0
```

## ⑫ 최종 git status --porcelain 원문

```text
 M clients/desktop/playwright/1254-sol-r6-final-real-qa/1254-sol-r6-final-real-qa.spec.ts
?? docs/qa/1254-notice-banner-layout/codex-luna-r7-spec-replacement-report.md
```

커밋·push·git add는 실행하지 않았다.
