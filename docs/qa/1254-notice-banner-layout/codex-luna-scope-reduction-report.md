# PR #1254 범위 축소 보고서 — CODEX LUNA

## ① 환경 확인

요청된 원문 명령 실행 결과:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD
39ff6bbdf9b0cff1d9ba299849d4de65450d11a6
git rev-parse --abbrev-ref HEAD
fix/notice-banner-layout-and-wording
git status --porcelain
?? clients/desktop/playwright/1254-sol-r6-final-real-qa/1254-sol-r9-event-surface-real-qa.spec.ts
?? docs/qa/1254-notice-banner-layout/codex-sol-r9-merge-verdict.md
```

초기 상태의 미추적 파일 2개는 보존했다. `git commit`, `git push`, `git add`는 실행하지 않았다.

## ② 되돌림 기준 커밋과 근거

`8c73c6558` (`[FIX] CI 2건 — Electron 실행 경로 · 캡처 _local 격리 (#1253)`)를 기준으로 확정했다.

`0f33524b2` (`[FIX] 배너 위치를 매직 상수에서 떼고 폭×높이 24조합으로 잠근다`)부터 `AppUpdateNotice`의 위치/크기/스크롤 레이아웃 변경이 시작됐다. 이후 `28d0f4e6d`, `4fd475669`, `64dab9097`, `ab88776db`, `39ff6bbdf`가 스택 스크롤·좌표 판정·전역 이벤트를 추가했다. 따라서 기준 이전의 인증서·CI 변경은 보존하고 배너 트랙만 `8c73c6558` 상태로 되돌렸다.

## ③ 걷어낸 것 목록

- `AppUpdateNotice.module.css`: 스택 위치 계산, 최대 높이, overflow/scroll-padding/scrollbar-gutter, 폭 분기, min-size/padding 변경 제거.
- `AppUpdateNotice.tsx`: 위치 계산 `useLayoutEffect`, MutationObserver/resize 처리, 전역 capture wheel/click 리스너, region/scrollable 속성 제거.
- `AppUpdateNotice` 관련 레이아웃 전용 Playwright 스펙과 라운드별 QA 보고서 21개 삭제.
- `1254-arologis-production-electron.spec.ts`는 레이아웃 단정 전부 제거하고, Linux에서만 `--no-sandbox`를 적용하는 범위 축소 라이브 QA로 교체했다.

## ④ 삭제한 테스트와 이유

삭제한 Playwright 파일:

```text
clients/desktop/playwright/1254-luna-final-real-qa/1254-luna-final-real-qa.spec.ts
clients/desktop/playwright/1254-luna-final-real-qa/playwright.config.ts
clients/desktop/playwright/1254-notice-banner-layout-red.spec.ts
clients/desktop/playwright/1254-round-fix-2-real-qa/1254-round-fix-2-real-qa.spec.ts
clients/desktop/playwright/1254-sol-r3-real-qa/1254-sol-r3-real-qa.spec.ts
clients/desktop/playwright/1254-sol-r5-final-real-qa/1254-sol-r5-capture-real-qa.spec.ts
clients/desktop/playwright/1254-sol-r5-final-real-qa/1254-sol-r5-final-real-qa.spec.ts
clients/desktop/playwright/1254-sol-r5-final-real-qa/1254-sol-r5-race-real-qa.spec.ts
clients/desktop/playwright/1254-sol-r6-final-real-qa/1254-sol-r6-final-real-qa.spec.ts
clients/desktop/playwright/1254-sol-r6-final-real-qa/playwright.config.ts
```

삭제 이유는 모두 스택 위치/크기/겹침/스크롤바 capture/wheel/click 등 이번 PR에서 의도적으로 제거한 레이아웃·이벤트 동작을 단정하기 때문이다. 해당 단정을 남기면 알려진 기존 결함으로의 되돌림을 새 결함으로 오판하게 된다.

단위 테스트는 레이아웃 전용 5개를 삭제하고, 네이티브 스크롤/전역 이벤트 가로채기가 없는지 확인하는 회귀 1개를 남겼다. 삭제한 단위 테스트의 성격은 stack 위치 계산, 독립 scroll region, 빈 영역 hit-test, 확대 padding, wheel 위임, 스크롤바 겹침 클릭 검증이다.

## ⑤ 남긴 것 3가지 실측

1. `신뢰 루트` 사용자 대면 문구 0건: `rg --glob '!*.test.*'` 결과 `USER_FACING_TRUST_ROOT_HITS=0`.
2. 인증서 정책 진리표: `certificate-trust.test.ts` 4/4, `certificate-trust-policy.test.ts` 4/4, 총 8/8 통과.
3. Linux Electron sandbox 회귀: 라이브 QA 스펙에 `process.platform === 'linux' ? ['--no-sandbox'] : []`를 보존했다. 라이브 QA 최종 소요시간은 4초로 60초 제한 이내다.

## ⑥ 걷어낸 뒤 클릭·스크롤 동작

Playwright headless Electron 라이브 QA 최종 결과:

```text
[SCOPE-REDUCTION-QA] {"dateFocused":true,"retryCount":1,"stackState":{"role":null,"scrollable":null,"overflowY":"visible"}}
1 passed (4.0s)
```

- 배너 밖 날짜 입력: `dateFocused=true`.
- 배너 내부 재시도 버튼: `retryCount=1`.
- 커스텀 스크롤 동작: `role=null`, `data-scrollable=null`, `overflowY=visible`; 네이티브 동작만 남겼다.
- 공유 API write: write 요청은 QA 라우트에서 차단했다.

## ⑦ 회귀

```text
design-system typecheck       PASS
design-system build           PASS
design-system 단위 테스트     32 files / 285 tests PASS
arologis-desktop typecheck    PASS
arologis-desktop build        PASS
arologis-desktop 단위 테스트  21 files / 99 tests PASS
```

stale dist 방지를 위해 design-system build 후 arologis-desktop build를 순차 실행했다. 인증서 진리표 8/8도 별도 재실행해 통과했다.

## ⑧ 캡처

`resolveQaShotsDir()`를 경유해 생성했다:

```text
docs/qa/1254-notice-banner-layout/scope-reduction-real-qa/_local/scope-reduction-real-qa.png
```

실패한 초기 로그인 시도의 캡처는 테스트 산출물이며 성공 증거로 사용하지 않았다.

## ⑨ 증거 무결성 자기 고지

- Playwright는 `clients/desktop` 안에서 실행했고 chromium/headless 기본 설정을 사용했다.
- 해시 라우터는 `page.goto(`${baseUrl}#/dispatches/unassigned`)`로 접근했다.
- 로컬 빌드 산출물을 사용했고, 공유 실데이터에 write를 남기지 않도록 API write를 차단했다.
- 최종 QA 성공 전 두 번의 로그인 실패는 계정 식별자 오류였으며, 최종 성공 결과와 분리했다.
- 이 보고서는 실행 결과를 과장하지 않으며, 레이아웃을 되살리는 증거는 포함하지 않는다.

## ⑩ 프로세스 회수

이번 세션이 기동한 Electron/Playwright 프로세스는 최종 QA 종료 후 0개다. 격리 컨테이너는 기동하지 않았으므로 회수 대상 0개다. 현재 남은 node 프로세스는 다른 워크트리 또는 기존 Codex 세션 소유로 확인되어 건드리지 않았다.

## ⑪ 최종 `git status --porcelain` 원문

```text
 M clients/desktop/playwright/1254-arologis-production-electron.spec.ts
 D clients/desktop/playwright/1254-luna-final-real-qa/1254-luna-final-real-qa.spec.ts
 D clients/desktop/playwright/1254-luna-final-real-qa/playwright.config.ts
 D clients/desktop/playwright/1254-notice-banner-layout-red.spec.ts
 D clients/desktop/playwright/1254-round-fix-2-real-qa/1254-round-fix-2-real-qa.spec.ts
 D clients/desktop/playwright/1254-sol-r3-real-qa/1254-sol-r3-real-qa.spec.ts
 D clients/desktop/playwright/1254-sol-r5-final-real-qa/1254-sol-r5-capture-real-qa.spec.ts
 D clients/desktop/playwright/1254-sol-r5-final-real-qa/1254-sol-r5-final-real-qa.spec.ts
 D clients/desktop/playwright/1254-sol-r5-final-real-qa/1254-sol-r5-race-real-qa.spec.ts
 D clients/desktop/playwright/1254-sol-r6-final-real-qa/1254-sol-r6-final-real-qa.spec.ts
 D clients/desktop/playwright/1254-sol-r6-final-real-qa/playwright.config.ts
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.module.css
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.test.tsx
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.tsx
 D docs/qa/1254-notice-banner-layout/codex-luna-r7-spec-replacement-report.md
 D docs/qa/1254-notice-banner-layout/codex-r7-final-fix-report.md
 D docs/qa/1254-notice-banner-layout/codex-sol-r7-merge-verdict.md
 D docs/qa/1254-notice-banner-layout/codex-sol-r8-mouse-click-fix.md
 D docs/qa/1254-notice-banner-layout/luna-final-fix-report.md
 D docs/qa/1254-notice-banner-layout/round-fix-2-report.md
 D docs/qa/1254-notice-banner-layout/round-fix-report.md
 D docs/qa/1254-notice-banner-layout/sol-r3-adversarial-report.md
 D docs/qa/1254-notice-banner-layout/sol-r5-final-adversarial-report.md
 D docs/qa/1254-notice-banner-layout/sol-r6-final-adversarial-report.md
?? clients/desktop/playwright/1254-sol-r6-final-real-qa/1254-sol-r9-event-surface-real-qa.spec.ts
?? docs/qa/1254-notice-banner-layout/codex-sol-r9-merge-verdict.md
?? docs/qa/1254-notice-banner-layout/codex-luna-scope-reduction-report.md
```
