# PR #1254 라운드 fix 보고서

## ① 환경 확인

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD
git rev-parse --abbrev-ref HEAD
git status --porcelain
```

원문:

```text
61ca713bc784d00d3790e60ac0ec669dadb05da9
fix/notice-banner-layout-and-wording
```

`git status --porcelain`는 빈 출력이었다.

## ② RED 원문

수정 전 `1254-notice-banner-layout-red.spec.ts` 실행:

```text
[RED-④] stack={"x":0,"y":16,"width":1280,"height":154,"top":16,"right":1280,"bottom":170,"left":0} overlap=[{"label":"기사 관리","area":2019.125},{"label":"인사","area":928},{"label":"미배차","area":1624}] total=4571.125
Error: 배너가 상단 조작 요소를 덮으면 안 됨
Expected: 0
Received: 4571.125
[RED-⑤] body-first={"withBanner":336,"withoutBanner":336,"difference":0}
4 passed, 1 failed
```

## ③ 근원

`clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.module.css:28`의 `.stack`이 `top:16px` 고정이었고, 기존 1100px 이하 보정도 `top:400px`로 본문 조작 행의 하단과 교차했다. production 실측에서 1024px의 「내역으로 저장」과 `179.84594535827637px²`가 교차했고, 600px에서는 `3021.375px²`가 교차했다.

## ④ 고친 것

- 공통 notice stack을 `top:480px` 고정 슬롯으로 이동해 헤더 및 좁은 폭에서 줄바꿈된 본문 조작 행 아래에 배치했다.
- 1100px 전용 `top:400px` 보정을 제거했다.
- 적대 스위트에 교차 면적 단정과 본문 y 좌표 단정을 함께 추가했다.
- production Electron 스펙이 `a/button/input` 전수의 실제 교차 면적을 폭별로 검사하도록 했다.

## ⑤ 폭별 교차 면적 표

| 폭 | stack top | stack bottom | 교차 요소 수 | 총 교차 면적 |
|---:|---:|---:|---:|---:|
| 600 | 480 | 793.40625 | 0 | 0 |
| 768 | 480 | 793.40625 | 0 | 0 |
| 1024 | 480 | 793.40625 | 0 | 0 |
| 1280 | 480 | 793.40625 | 0 | 0 |
| 1440 | 480 | 793.40625 | 0 | 0 |
| 1920 | 480 | 793.40625 | 0 | 0 |

## ⑥ 밀림 y 좌표 표

production Electron에서 배너 표시/비표시 비교:

| 폭 | 표시 시 첫 본문 y | 비표시 시 첫 본문 y | 차이 |
|---:|---:|---:|---:|
| 1024 기준 | 142.3854217529297 | 142.3854217529297 | 0 |

적대 fixture도 `withBanner=336`, `withoutBanner=336`, `difference=0`이었다.

## ⑦ 진리표 4조합 유지

`certificate-trust-policy.test.ts` 4/4 통과:

| 실행 환경 | env 유무 | 기대값 |
|---|---|---|
| 개발 | 미설정 | 실행 |
| 개발 | `env=1` | 생략 |
| 패키지 | 미설정 | 실행 |
| 패키지 | `env=1` | 실행 |

사용자 대면 문구 「보안인증서」와 신뢰 루트 0건 노출 계약은 유지했다.

## ⑧ CI 타임아웃 근원과 조치

60초 타임아웃은 로컬에서 동일하게 재현되지는 않았고, 수정 전 production 스펙은 로컬 8.8초에 통과했다. 스펙의 근원 문제는 로그인·reload·viewport 변경 뒤 고정 `waitForTimeout(1000/500)`에 의존해 느린 CI Electron의 비동기 상태와 실행 시점을 시간으로 추정한 점이었다. 로그인 URL, renderer 표시 요소, 기존 readiness assertion을 기다리도록 바꾸고 고정 sleep을 제거했다. timeout 값은 늘리지 않았다.

## ⑨ 회귀

```text
arologis-desktop npm test
Test Files 21 passed (21)
Tests 99 passed (99)

npm run typecheck
Exit code 0

npm run build
Exit code 0

1254-arologis-production-electron.spec.ts
6 폭 통과 · 1 passed (6.1s)

1254-notice-banner-layout-red.spec.ts
5 passed (4.4s)
```

production 결과는 모든 폭에서 `interactiveOverlapTotal=0`, modal z-index `1000 > 999`, print `display=none`, body-first y difference `0`이었다.

## ⑩ 증거 무결성 자기 고지

실제 production Electron을 재빌드한 뒤 스펙을 실행했다. `--list`는 사용하지 않았다. 수정 전 RED 원문과 수정 후 GREEN 원문을 구분해 기록했으며, 테스트 timeout을 늘려 단정을 회피하지 않았다. 보고서·QA 캡처 경로는 이 워크트리 범위이며 커밋·푸시·스테이징하지 않았다.

## ⑪ 프로세스 회수

이번 라운드가 기동한 Electron, Playwright, chrome-headless-shell, Vite 및 격리 컨테이너는 최종 확인 시 0개 잔류했다. 다른 라운드가 공유 중인 Vite/Playwright 프로세스와 기존 Docker 서비스는 소유권이 없어 종료하지 않았다.

## ⑫ 최종 상태

```text
git status --porcelain
```

최종 원문:

```text
 M clients/desktop/playwright/1254-arologis-production-electron.spec.ts
 M clients/desktop/playwright/1254-notice-banner-layout-red.spec.ts
 M clients/web/design-system/src/components/AppUpdateNotice/AppUpdateNotice.module.css
?? docs/qa/1254-notice-banner-layout/round-fix-report.md
```

PM이 위 변경을 직접 커밋한다. 이 라운드에서는 `git add`, `git commit`, `git push`를 실행하지 않았다.
