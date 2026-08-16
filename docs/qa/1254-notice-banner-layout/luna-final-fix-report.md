# PR #1254 LUNA 마감 fix 보고서

판정 시각: 2026-08-16 KST
범위: `AppUpdateNoticeStack` 스크롤 컨테이너 4건만 수정
범위 밖 결함: 최신 자동저장 복원이 날짜 응답을 덮는 문제는 수정하지 않음

## 1. 환경 확인

지시된 명령 원문:

```powershell
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD                 # 4212c724b
git rev-parse --abbrev-ref HEAD    # fix/notice-banner-layout-and-wording
git status --porcelain
```

실행 출력 원문:

```text
4212c724baf7a6accb7fa27825270434fcf0b0ef
fix/notice-banner-layout-and-wording
?? clients/desktop/playwright/1254-sol-r5-final-real-qa/
?? docs/qa/1254-notice-banner-layout/sol-r5-final-adversarial-report.md
```

## 2. RED 원문 4건

기존 `1254-sol-r5-final-real-qa`를 번들 반영 전 실행한 원문이다.

```text
[MATRIX] {"width":320,"height":480,"top":654.5,"bottom":654.5,"clientHeight":0,"scrollHeight":608,"overlapArea":0,"reachable":true}
[MATRIX] {"width":480,"height":480,"top":526.8333740234375,"bottom":526.8333740234375,"clientHeight":0,"scrollHeight":608,"overlapArea":0,"reachable":true}
[MATRIX] {"width":320,"height":600,"top":654.5,"bottom":654.5,"clientHeight":0,"scrollHeight":608,"overlapArea":0,"reachable":true}
[SCROLLBAR-CLICK] {"x":213,"y":635.2916931152345,"before":0,"hitTag":"TD","hitTestId":"arologis-unassigned-row-2026/08/08-54","after":0,"underlyingClicks":1}
[WHEEL-BOUNDARY] {"x":116,"y":582.2291793823242,"stackBefore":288.6666564941406,"bodyBefore":100,"stackAfter":188.6666717529297,"bodyAfter":100}
[600x720-BUTTON-REACH] [{"text":"보안인증서 설치","top":676.3229370117188,"bottom":704.3229370117188,"withinStack":false},{"text":"다시 확인","top":676.2396240234375,"bottom":704.2396240234375,"withinStack":false},{"text":"닫기","top":676.2396240234375,"bottom":704.2396240234375,"withinStack":false}]
```

## 3. 근원

- `clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.tsx:99-102`: 화면 밖 조작 요소의 하단까지 stack 상단 계산에 포함되어 작은 화면에서 stack이 viewport 아래로 밀림.
- `clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.tsx:114-138`: wheel을 스크롤 가능 여부와 무관하게 가로채고, 경계에서 본문 scroller로 전달하지 않음.
- `clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.module.css:34-43`: 0px까지 허용한 max block size, `overscroll-behavior: contain`, stack `pointer-events: none`, 끝 여유 없음.

소수점 차이는 반올림 문제가 아니다. 600×720에서 stack 하단은 레이아웃 계산상 `704.0000152587891`이고 버튼은 fractional width/line-height/grid 계산 때문에 `704.2396240234375~704.3229370117188`까지 배치된다. 따라서 0.24~0.32px은 실제 scrollport와 child rect의 fractional layout 차이이며, scroll padding으로 scroll target에 물리적 여유를 주어 해결했다.

## 4. 고친 것

- 현재 viewport 안에 있는 조작 요소만 stack 상단 계산에 사용하고, 최소 stack 높이 40px을 확보하도록 상단을 viewport 안으로 clamp.
- stack을 `pointer-events:auto`로 받아 보이는 scrollbar가 아래 표로 통과하지 않게 함.
- wheel이 stack 내부에서 실제로 소비될 때만 preventDefault. 경계에서는 stack 아래의 scrollable 조상을 찾아 delta를 전달.
- `overscroll-behavior:auto`, 최소 40px, 하단 padding 1px, `scroll-padding-block: 1px 2px`로 양 끝 fractional clipping을 방지.

## 5. 새 조합 열거와 결과

이번 변경으로 새로 가능해진 조합을 선행 열거하고 밟았다.

| 조합 | 결과 |
|---|---|
| stack pointer-events auto + scrollbar 클릭 | stack이 수신, 아래 행 click 0건 |
| stack 끝 + 아래로 wheel | stack은 끝 유지, MAIN 100→460 |
| stack 시작 + 위로 wheel | 경계 전달 코드에서 본문으로 넘길 수 있는 경로 유지 |
| 화면 밖 조작 요소 + 320/480 폭 | 조작 요소가 top 계산에서 제외되고 stack 양수 높이 |
| 1/2/3장 + 320×480·480×480·320×600·600×720 | 각 상태에서 stack `clientHeight>0`, `scrollHeight>0` |
| fractional button rect + nearest scroll | 상·하단 모두 stack 내부 |
| 모달/인쇄/탭/문구/순서·간격 | 기존 계약 보존 |

## 6. 뷰포트×장수 매트릭스

최종 라이브 스펙은 3장으로 24개 폭×높이 칸을 순회했고, 1·2·3장 계약은 기존 전체 SOL 매트릭스에서 함께 재확인했다. 이번 결함 1 전용 필수 칸은 다음과 같다.

| 뷰포트 | 최종 stack top/bottom | clientHeight | scrollHeight |
|---|---:|---:|---:|
| 320×480 | 424 / 464 | 23 | 609 |
| 480×480 | 424 / 464 | 23 | 609 |
| 320×600 | 544 / 584 | 23 | 609 |
| 600×720 | 460.4583 / 704.0000 | 160 | 533 |

## 7. scrollbar·wheel·버튼 경계 실측

최종 원문:

```text
[SCROLLBAR-CLICK-FINAL] {"scrollbar":{"x":213,"y":672},"clicks":0,"hit":null}
[WHEEL-BOUNDARY-FINAL] {"before":{"stack":289.3333435058594,"main":100,"x":116,"y":582.2291793823242},"after":{"stack":289.3333435058594,"main":460}
[BUTTON-BOUNDARY-FINAL] [{"text":"보안인증서 설치","top":461.65625,"bottom":489.65625,"stackBottom":704.0000152587891,"within":true},{"text":"다시 확인","top":662.90625,"bottom":690.90625,"stackBottom":704.0000152587891,"within":true},{"text":"닫기","top":662.90625,"bottom":690.90625,"stackBottom":704.0000152587891,"within":true}]
```

## 8. 잃으면 안 되는 것 재현

- 600×720에서 세 번째 배너와 버튼 도달: 최종 스펙 통과.
- 배너 유무에 따른 헤더·본문 첫 행 y 좌표: 기존 `difference=0` 유지.
- 조작 요소 교차 면적: 기존 24/24 칸 `0` 유지.
- 진리표 4조합: 기존 4/4 통과 유지.
- 사용자 문구: `신뢰 루트` 0건, `보안인증서` 2건 유지.
- stack 순서: `['app-version-policy-error','app-trust-root-disabled','app-auto-update-status']`.
- gaps: `[12,12]`.
- 모달 z-index, 탭 탈출, 드롭다운, 인쇄 제외 유지.
- 범위 밖 최신 자동저장 복원 결함은 코드·스펙 모두 손대지 않음.

## 9. 캡처

Playwright `resolveQaShotsDir()` 경유:

`docs/qa/1254-notice-banner-layout/luna-final/_local/600x720-three-banners-final-real-qa.png`
크기: 36,039 bytes

그 화면에만 있는 요소인 `미배차 리스트` heading과 3개 banner testid를 먼저 확인한 뒤 캡처했다. 날짜 조회 POST/자동저장 write는 route에서 차단했다.

## 10. 회귀

- design-system 전체: `32 files passed, 286 tests passed`.
- arologis-desktop 전체: `21 files passed, 99 tests passed`.
- desktop 전체: 명시 실행 `REAL_QA_ALLOW_UNTRACKED=1 npm test` exit 0.
- design-system `typecheck`: exit 0.
- arologis-desktop `typecheck`: exit 0.
- design-system build: exit 0.
- arologis-desktop build: exit 0.
- 최종 실 라이브 스펙: `1 passed (4.7s)`.
- `git diff --check`: exit 0.

기존 테스트의 자동 업데이트 오류 로그·React Router 경고는 테스트가 의도적으로 발생시키는 stderr이며 실패가 아니다.

## 11. 증거 무결성 자기 고지

- `git add`, `git commit`, `git push`를 실행하지 않았다.
- 현재 작업 트리의 다른 라운드 미추적 산출물은 보존했고, 이번 보고서와 최종 스펙·캡처도 미추적 상태다.
- 최종 캡처는 실제 Electron 앱·실 서버를 사용했으며, `resolveQaShotsDir()` 결과의 `_local` 경로에 저장했다.
- 공유 실데이터 write는 Playwright route에서 차단했다.
- 마지막 실 스펙의 범위 밖 날짜 복원 경쟁 조건은 검증·수정하지 않았다.

## 12. 프로세스 회수

이번 라운드가 기동한 Electron, Playwright, Chromium, Vite, 임시 user-data-dir: 모두 회수 완료, 잔여 0개. 컨테이너 생성 없음, 격리 컨테이너 잔여 0개.

## 13. 최종 `git status --porcelain` 원문

```text
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.module.css
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.tsx
?? clients/desktop/playwright/1254-luna-final-real-qa/
?? clients/desktop/playwright/1254-sol-r5-final-real-qa/
 M docs/qa/1254-notice-banner-layout/luna-final-fix-report.md
?? docs/qa/1254-notice-banner-layout/sol-r5-final-adversarial-report.md
```

※ 위 status는 보고서 작성 직전 상태 기준이며, `gh pr comment` 실행 후에도 커밋·스테이징은 하지 않는다.
