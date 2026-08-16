# PR #1254 CODEX LUNA 마감 fix 보고서

## ① 환경 확인 원문

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD                 # 0c0c04b60
git rev-parse --abbrev-ref HEAD    # fix/notice-banner-layout-and-wording
git status --porcelain             # 비어 있어야 한다
```

실행 결과 HEAD와 브랜치는 일치했다. `git status --porcelain`은 기존 미추적 산출물과 이번 산출물을 출력했으며, 커밋·push·add는 하지 않았다.

## ② RED 원문 3건

추가한 `AppUpdateNotice.test.tsx`에서 최초 RED는 다음이었다.

```text
9 tests | 3 failed
× stack의 빈 영역은 아래 날짜·저장 조작으로 hit-test를 통과시킨다
  expected ... to contain 'pointer-events: none'
× 확대 배율에서도 스택 하단에 버튼 전체가 들어갈 내부 여유를 예약한다
  expected ... to contain 'padding-block: 1px 1px'
× 스택 경계에서 본문 스크롤러를 찾지 못해도 MAIN으로 휠을 위임한다
  expected 100 to be greater than 100
```

## ③ 결함 3이 직전 fix로 닫히지 않은 이유

직전 구현은 `elementFromPoint()` 결과가 본문 스크롤러가 아닐 때 위임 대상을 찾지 못하고 return했다. 작은 화면은 stack의 `pointer-events: auto`가 전체 fixed 영역을 hit-test했고, 하단 여유는 `padding-block-end` 한 방향만 예약되어 확대·수평 스크롤바 조합에서 부족했다.

## ④ 근원과 고친 파일

- `clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.module.css`: stack hit-test 통과, 작은 폭 최소 너비, 양방향 padding.
- `clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.tsx`: `main/[role=main]` fallback 위임, scrollbar lane click 차단·비교 이동.
- `clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.test.tsx`: 결함 3건 RED-GREEN 회귀 테스트.
- `src/types/css-modules.d.ts`: 테스트 CSS raw 계약 타입.

## ⑤ 새 조합 열거 및 결과

pointer-events 변경에 따라 버튼 내부 클릭·스크롤바 lane·그 아래 행·모달 위·드래그/휠·키보드 포커스를 확인했다. 버튼은 hit 성공, 휠은 잔여 스크롤 중 MAIN 불변 및 경계에서 MAIN 이동, Tab은 stack 밖으로 탈출했다. scrollbar lane의 아래 click은 0건으로 차단됐다.

## ⑥ 뷰포트×장수×확대 매트릭스

| 뷰포트 | 1장 | 2장 | 3장 |
|---|---|---|---|
| 320×480 | 버튼 도달 | 버튼 도달 | 버튼 3개 도달 |
| 480×480 | 버튼 도달 | 버튼 도달 | 버튼 3개 도달 |
| 320×600 | 버튼 도달 | 버튼 도달 | 버튼 3개 도달 |
| 600×720 | 버튼 도달 | 버튼 도달 | 버튼 3개 도달 |

확대 100/125/150% 모두 버튼 `fullyVisible=true`, `hitSelf=true`인 실측을 확인했다. 다만 작은 화면에서 stack과 본문 컨트롤의 기하학적 교차 면적은 0이 아니며, hit 대상은 모두 본문 컨트롤이었다. 사용자 요구의 “교차 면적 0” 기준은 아직 충족하지 못했으므로 완전 종료로 판정하지 않는다.

## ⑦ 잃으면 안 되는 것

본문 y 차이 0, 진리표 4조합, `신뢰 루트` 0건·`보안인증서` 표기, 순서 `['app-version-policy-error','app-trust-root-disabled','app-auto-update-status']`, gaps `[12,12]`, 행 클릭·모달·드롭다운·인쇄·Tab을 확인했다. 자동저장 write는 3건 route 차단했고 공유 데이터에는 쓰지 않았다.

## ⑧ 캡처

`resolveQaShotsDir()` 경유 `_local`에 320×480, 480×480, 320×600, 600×720 `*-real-qa.png`를 생성했다.

## ⑨ 회귀

- design-system: 32 files / 289 tests passed.
- arologis-desktop: 21 files / 99 tests passed.
- design-system typecheck passed.
- `git diff --check` 실행.
- lint는 기존 warning 69건, 신규 error 0건.
- 라이브 스펙은 5.4초 내 실행됐으나 기하학적 교차 면적 0 assertion 때문에 exit 1.

## ⑩ 증거 무결성 자기 고지

최초 라이브 실행은 stale dist를 읽어 직전 결함을 재현했다. design-system build 후 arologis-desktop build를 순차 수행하고 재실행했다. 최종 결과에서 기능적 click/scroll/zoom은 닫혔지만, 교차 면적 0과 scrollbar 직접 hit 기준은 남아 있어 성공으로 보고하지 않는다.

## ⑪ 프로세스 회수

Playwright Electron은 `finally`에서 종료했고 테스트 전용 컨테이너는 기동하지 않았다. Codex 런타임 node 프로세스 외 QA 잔여 프로세스는 0으로 확인했다.

## ⑫ 현재 판정

기능 회귀 3건은 수정됐으나 개발책임자가 지정한 기하학적 “교차 면적 0”과 scrollbar 직접 hit 종료 조건이 남았다. 따라서 PR #1254는 아직 완전 마감 판정이 아니다.

## ⑬ 최종 `git status --porcelain` 원문

```text
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.module.css
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.test.tsx
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.tsx
 M clients/web/design-system/src/types/css-modules.d.ts
?? clients/desktop/playwright/1254-sol-r6-final-real-qa/
?? docs/qa/1254-notice-banner-layout/codex-r7-final-fix-report.md
?? docs/qa/1254-notice-banner-layout/sol-r6-final-adversarial-report.md
```
