# PR #1260 SOL BLOCKER 3건 수정 보고

검증일: 2026-08-17 (KST)  
대상 브랜치: `feat/option-naming-unify`  
커밋·push·`git add`: 수행하지 않음

## ① 왜 비었는지 — 단계별 실측

| 화면/단계 | 원천 행 | `componentKind/kind` REMOTE | `componentKind/kind` PANEL | 속성값 행 | 이름 판별 행 | 렌더 전 옵션 | 결론 |
|---|---:|---:|---:|---:|---:|---|---|
| 홈멀티 HOMEMULTI | 107 | 0 | 0 | 0 | 리모컨 7 / 판넬 28 | 리모컨 1 / 판넬 1 | kind-only 필터가 전부 제거 |
| 상업멀티 COMM_PARTS | 137 | 0 | 0 | 0 | 0 / 0 | 리모컨 1 / 판넬 1 / 360 0 | `COMM_PARTS`가 OUTDOOR 137건뿐 |
| 상업멀티 COMMULTI | 382 (화면 310) | 0 | 0 | 0 | 리모컨 7 / 판넬 35 | 기존 렌더러가 사용하지 않음 | 실제 후보 원천 |
| 싱글중대형 SINGLE_PARTS | 1,447 | 315 | 250 | 0 | 315 / 250 | 리모컨 3 / 판넬 5 / 360 0 | kind는 있으나 360은 하드코딩 회귀 |

즉 데이터가 없는 것이 아니라, (a) `d03ConfiguredVariants_`의 kind-only 필터, (b) 상업멀티 렌더러의 `COMM_PARTS 우선` 선택, (c) 360 옵션의 동적 shape 의존이 각각 빈 셀렉트를 만들었습니다.

## ② RED 원문

실제 Playwright 셀렉트 렌더 테스트에 옵션 하한 단정을 먼저 추가하고 수정 전 실행했습니다.

```text
Error: 홈멀티 리모컨 셀렉트는 제외 외 실제 옵션을 렌더해야 함
Expected: >= 2
Received: 1
```

RED 직전 계측 원문:

```text
[PR1260-SOL-DIAGNOSTICS]
home rows=107 kindRemote=0 kindPanel=0 nameRemote=7 namePanel=28
commercialParts rows=137 kindRemote=0 kindPanel=0
commercialCatalog rows=382 nameRemote=7 namePanel=35
configured homeRemote=[] homePanel=[] commercialRemote=[] commercialPanel=[] commercialShapes=[]
```

테스트는 세 화면의 리모컨·판넬을 `옵션 개수 >= 2`, 상업/싱글 360을 `>= 2`, 인피니트를 `>= 5(판넬제외+4종)`으로 단정합니다.

## ③ 고친 내용

- 두 웹 화면의 variant 수집을 kind뿐 아니라 기존 문자열, `feat/spec/disp`, remote/panel 속성 fallback까지 읽도록 복구했습니다.
- variant 값은 기존 `d03RemoteOption`/`d03PanelOption` 매핑을 통과시켜 기존 문자열 읽기를 보존했습니다.
- 상업멀티 옵션 후보 원천을 `COMMULTI` 우선으로 변경했습니다. `COMM_PARTS`는 137건 OUTDOOR 헤더이므로 옵션 후보로 사용하지 않습니다.
- 360판넬은 결정된 하드코딩 `['원형', '사각']`을 상업멀티·싱글중대형에 유지했습니다.
- 실제 DOM 셀렉트 옵션 개수 회귀 테스트와 단계별 계측을 `1260-sol-merge-verdict-real-qa`에 추가했습니다.

## ④ GREEN

실제 공유 스택에서 Playwright 1/1 통과:

| 화면 | 리모컨 | 판넬 | 360판넬 |
|---|---:|---:|---:|
| 홈멀티 | 6 | 5 | - |
| 상업멀티 | 6 | 7 | 2 |
| 싱글중대형 | 3 | 5 | 2 |

인피니트 판넬: 5개 — `판넬제외` + 기본 + 공청 + 인피니트 25년형 + 인피니트 공청+동작감지 AI.

## ⑤ 세 화면 캡처 및 측정값

- [홈멀티 리모컨·판넬](01-home-multi-remote-panel-options.png)
- [상업멀티 리모컨·판넬·360](03-commercial-multi-remote-panel-options.png)
- [싱글중대형 리모컨·판넬·360](04-single-remote-panel-options.png)
- [전체 측정 JSON](live-measurement.json)

## ⑥ 인피니트 4종 캡처

- [인피니트 판넬 4종](02-infinite-home-panel-options.png)

## ⑦ 보존 회귀 재확인

- legacy quantity golden + price parity: 201 tests 통과
- estimate-app 전체: 20 suites / 356 tests 통과
- order-app 전체: 24 files / 253 tests 통과
- D-03 옵션 단위: 11/11 통과
- desktop typecheck·lint·build: 종료 코드 0 (기존 lint warning 8건, error 0)
- PANEL 250건 판정 기준: 기존 68·68·57·57 분포와 golden 판정 보존
- 견적 194/194 및 주문 75/75 golden 기준 보존
- 싱글 유선 선택 + 제외 체크: 제외 우선 DOM/발행 결과 통과

## ⑧ 프로세스·컨테이너 회수

- 이번 라운드에서 기동한 estimate-app 프로세스와 5183 listener를 회수했습니다.
- 최종 5183 listener: 0개
- 이번 라운드 신규 컨테이너: 0개
- 공유 스택 컨테이너: 기존 24개를 중지·재기동·변경하지 않았습니다.
- 별도로 이미 존재하던 `samhan-qa-1241-product`, `samhan-qa-1241-postgres` 2개도 건드리지 않았습니다.
- 자격증명·시트 ID·키 값은 보고서에 기록하지 않았습니다.
