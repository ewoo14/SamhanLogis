# PR #1260 회귀 수정 보고서

## ① RED 원문

2026-08-17 현재 워크트리에서 수정 전 지정 테스트를 실행했다.

```text
legacy-quantity-golden.test.ts
  3 failed | 70 passed (73)
  C-01-BLACK-PANEL: expected PC4NBFK1NW, received PC4NUFK1NW
  C-01-LIFT-PANEL:  expected PC4NUXK1NW, received PC4NUFK1NW
  C-01-AIR-PANEL:   expected 6개, received 8개 (PC1MWSK3NW, PC4NUFK1NW 추가)

legacyPreexistingFix.test.ts
  1 failed | 1 passed (2)
  ReferenceError: d03PanelOption is not defined
  at renderCommOptions
```

golden 파일은 수정하지 않았다.

## ② 원인 — 값 해석 분기 정합성

PR #1260의 구성품 `component_variant` 기반 목록은 `기본·공청·블랙·승강` 값을 제공하지만, 상업멀티 파생 계산은 `기본판넬·공청판넬·블랙판넬·승강판넬` 비교와 새 값을 혼용했다. 그 결과 4WAY 패널 swap이 기본 모델로 남았다.

또한 order-app과 estimate-app에 `d03PanelOption`이 중복 정의되어 마지막 정의가 `인피니트 공청`을 `공청판넬`로 반환하고 블랙·승강 매핑을 누락했다. 함수 단위 VM harness는 사용하는 함수만 추출하므로 `renderCommOptions`, `recomputeCommDerived`, `computeCommPanelModelForIndoor_`의 helper 의존성이 각 실행 스코프에 들어오지 않았다.

## ③ 고친 내용

- order-app/estimate-app의 도출값을 공통 canonical 값으로 정렬: `인피니트 공청 → 공청`, 블랙·승강 legacy 값 매핑 보존.
- 상업멀티 패널 계산과 판넬 제외 유지 분기에서 `d03PanelOption`을 먼저 적용.
- legacy quantity, catalog-missing, SOL2, 상업 수동잠금, 옵션 재렌더 VM harness에 `d03PanelOption`과 필요한 옵션 도우미를 함께 주입.
- 옵션 재렌더 harness에 빈 구성품 snapshot을 주입해 사용자가 선택한 5개 값의 보존 경로를 검증.
- lint의 정규식 오류 3건을 의미 변경 없이 정리했다. 테스트 기대 동작/golden 값은 변경하지 않았다.

## ④ GREEN

```text
order-app: 24 test files, 253 passed
legacy 회귀 지정 범위: 2 files, 75 passed
estimate-app: 20 suites, 356 passed
D-03 option naming node test: 11 passed
order-app typecheck: exit 0
order-app build: exit 0 (Vite 66 modules)
order-app lint: 0 errors, 8 pre-existing warnings
```

## ⑤ 인피니트 4종·250건 불변 재확인

- D-03 도출 테스트에서 인피니트 기본·25년형·공청·공청+동작감지 AI 4종 구분이 11/11 GREEN이다.
- 이번 변경은 인피니트 판정/품목 도출 테이블 및 `component_shape`(원형·사각) 로직을 수정하지 않았다.
- PANEL 250건 판정의 기존 68/68/57/57 기준을 변경하는 코드·golden은 건드리지 않았다.

## ⑥ 라이브 캡처와 옵션 개수

Playwright 실 라이브 스펙은 다음 위치에 작성하고 실행했다.

```text
clients/desktop/playwright/d03-s4-regression-fix-real-qa/
```

실행 결과는 캡처 전 부트스트랩 실패다.

```text
http://127.0.0.1:5180/?email=dev_master%40samhan-air.com
[v4 bootstrap] sync prefetch failed: HTTP 503
order-app bootstrap failed: HTTP 503
page.waitForSelector('#btnEnterHome'): Timeout 60000ms exceeded
```

따라서 실제 화면의 홈멀티·상업멀티·싱글 셀렉트와 옵션 개수는 확인·캡처하지 못했다(허위 캡처를 만들지 않음). 공유 API가 HTTP 503인 상태에서 공유 컨테이너를 재기동하지 않고 중단했다.

## ⑦ 프로세스 회수

- 이 작업에서 기동한 로컬 `web-order-app` dev server 프로세스 트리 5개를 회수했다.
- 포트 5180 잔여 listener: 0개.
- 공유 포트 8080/5942와 공유 컨테이너는 건드리지 않았다.
- 커밋·push·git add는 수행하지 않았다.
