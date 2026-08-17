# PR #1241 CODEX LUNA R4 수정 보고서

- 브랜치: `feat/gas-parity-order-web`
- 작업일: 2026-08-17 KST
- 커밋·push·add: 수행하지 않음
- 공유 스택: 변경하지 않음(24개 컨테이너 유지)

## ① 단계별 실측표 — 어디서 갈라지는가

대상은 같은 거래처·`AJ060MXHNBC1`·수량 1이다.

| 단계 | desktop / dc-config | estimate-app 수정 전 | estimate-app 수정 후 |
|---|---:|---:|---:|
| 제품 DB 기준 필드 | `outboundPrice` 2,607,000원 | `releasePrice` 2,929,300원 | `outboundPrice` 2,607,000원 |
| 거래처 홈 DC | 48% | 48% | 48% |
| 할인 전 기준가 | 2,607,000원 | 2,929,300원 | 2,607,000원 |
| 할인 적용 | 2,607,000 × 52% | 2,929,300 × 52% | 2,607,000 × 52% |
| 단가 반올림 | 1,355,640원 | 1,523,236원 | 1,355,640원 |
| 운임·구제품·절삭 | 없음 | 없음 | 없음 |

갈라지는 한 줄은 `estimate-app/lib/db-catalog.js`가 HOME/COMM 변동DC용 `list`에 `releasePrice`를 넣던 지점이었다. desktop·dc-config는 `outboundPrice`를 기준으로 계산한다.

## ② RED 원문

신규 양방향 parity 테스트에 실제 응답 모형(`releasePrice=2,929,300`, `outboundPrice=2,607,000`)을 넣고 수정 전에 실행했다.

```text
FAIL test/dc-price-parity.test.js
Expected: list: 2607000
Received: list: 2929300
```

## ③ 고친 내용

- product-service 내부 estimate 카탈로그 응답에 `outboundPrice`를 추가했다.
- estimate-app HOME/COMM 카탈로그의 변동DC 기준가를 `outboundPrice || releasePrice`로 변경했다.
- `outboundPrice`가 없는 구형/미적재 응답은 기존 `releasePrice`로 호환한다.
- 404 및 bulk 누락 시 `dcConfigUnavailable`로 중단하는 기존 fail-closed 동작은 유지했다.

## ④ GREEN

- 신규 parity 테스트: **1 passed**
- estimate-app 전체: **21 suites / 359 tests passed**
- product-service `EstimateCatalogInternalControllerIT`: **10 tests passed**
- 격리 product-service 컴파일·bootJar: **성공**
- 격리 HTTP 카탈로그 실측: `AJ060MXHNBC1` 응답에 `outboundPrice=2607000` 확인
- 기존 DC 조회 실패 회귀 테스트: 전체 GREEN에 포함

## ⑤ 두 경로 금액 일치 캡처

desktop의 기존 동일조건 실측 캡처는 [04-desktop-sales-same-condition-price.png](../../1241-sol-merge-verdict/screenshots/04-desktop-sales-same-condition-price.png)에서 **1,355,640원**이다. 이번 수정 후 estimate-app 라이브 페이지 캡처는 [01-estimate-app-current.png](estimate-app-real-qa/01-estimate-app-current.png)로 저장했다.

이번 라운드에는 인증된 desktop·estimate-app 동일조건 UI 세션을 새로 확보하지 못해 두 화면의 새 나란히 캡처는 미수행이다. 대신 수정된 실제 카탈로그 HTTP 응답과 RED/GREEN 계산값으로 같은 입력의 양방향 산식을 검증했다.

## ⑥ 잃으면 안 되는 것 재확인

- 싱글중대형 판넬 128,000원·리모컨 16,000원 경로: 변경하지 않음
- 271건 세트 총액 순증감 0원: 기존 게이트 보존
- 세트-구성품 합 불일치 0건: 기존 게이트 보존
- 천원 단위 배분, V44·V45, 저장 경로 fix, `SlipDiscountCalculator` Bean: 변경하지 않음
- desktop typecheck·lint·build 대상 코드: 변경하지 않음
- 조회 실패 시 임의 기본 할인율 금액 생성 금지: 기존 테스트와 구현 보존

## ⑦ 프로세스 회수

- 이번 라운드 기동: 격리 product-service 1개, estimate-app 1개
- 회수 후 `18084`, `5183` LISTEN: **0개**
- 생성 JAR: 검증 후 삭제, 잔여 **0개**
- 공유 `samhan-*` 컨테이너: 시작 24개 → 종료 24개, 변경 **0개**
- 공유 DB 쓰기: **0건**

