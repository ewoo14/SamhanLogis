# #999 / PR #1128 — 재고 현황 부분 응답 측정 보고서

> 담당: 구현 담당
> 측정일: 2026-08-12 (KST)
> 작업 브랜치: `feat/999-stock-instance-serial-qr`

## 1. 착수 및 rebase

개발책임자 지시에 따라 작업 전 `origin/main`으로 rebase했다.

실행 원문:

```text
git rebase origin/main
Rebasing (1/2)
Rebasing (2/2)
Successfully rebased and updated refs/heads/feat/999-stock-instance-serial-qr.
```

충돌은 발생하지 않았다.

## 2. 현재 코드 선행 확인 — #1171 방식

현재 코드에는 #1171 계열 수정이 이미 들어와 있다.

- `StockService.findBalancePage`가 `ProductClient.lookupAllowMissing`을 사용한다.
- 누락 품목을 예외로 승격하지 않고 경고 로그만 남긴 뒤 모든 재고 행을 응답한다.
- `StockBalanceResponse`가 누락 행을 `productCode=참조 끊김`, `productName=제품 마스터 없음`으로 표시한다.
- 응답 DTO에는 product/warehouse UUID 필드를 포함하지 않는다.
- 입고 등 strict 경로는 `ProductClient.requireExists`를 유지한다.

따라서 이번 요청의 정상 행 계약과 strict mutation 계약을 바꾸지 않는 선례가 이미 존재한다.

## 3. RED 재현 시도 / 현재 상태

수정 전 원래 결함을 보이는 현재 `origin/main` 코드를 대상으로 기존 회귀 테스트를 실행했다.
이 테스트는 끊긴 참조 1건 또는 전부가 있어도 전체 행을 반환해야 한다는 계약을 검증한다.

처음 사용한 task 경로는 잘못된 프로젝트명으로 실패했다.

```text
./gradlew.bat :inventory-service:test --tests "com.samhanair.logis.inventory.it.StockBalanceBrokenReferenceIT" --no-daemon

FAILURE: Build failed with an exception.

* What went wrong:
Cannot locate tasks that match ':inventory-service:test' as project 'inventory-service' not found in root project 'samhan-public'.
```

올바른 프로젝트 경로로 재실행한 원문:

```text
./gradlew.bat :services:inventory-service:test --tests "com.samhanair.logis.inventory.it.StockBalanceBrokenReferenceIT" --no-daemon
...
> Task :services:inventory-service:test

BUILD SUCCESSFUL in 36s
18 actionable tasks: 11 executed, 7 from cache
```

결과: 현재 `origin/main`에서는 결함이 재현되지 않았다. 따라서 이 라운드에서는 RED 테스트를 새로 작성하거나 production code를 수정하지 않는다. 이미 머지된 #1171 수정이 이번 결함의 동일 계열을 해소하고 있어, 없는 결함을 다시 고치지 않는다.

## 4. inventory-service 전량 테스트

실행 원문:

```text
./gradlew.bat :services:inventory-service:test --no-daemon
...
> Task :services:inventory-service:test FROM-CACHE

BUILD SUCCESSFUL in 13s
18 actionable tasks: 1 from cache, 17 up-to-date
```

결과: `inventory-service` 전체 테스트 task는 성공했다. 좁힌 `StockBalanceBrokenReferenceIT`만의 성공을 전체 성공으로 오인하지 않도록 전량 task도 별도로 실행했다.

## 5. desktop 재고 화면 테스트 환경 측정

실행 원문:

```text
npm test -- --run

MUTATION_RED clients\\desktop\\src\\renderer\\.actor-display-mutation\\NewActorExit.tsx: unable to parse source: Cannot find module '...\\clients\\desktop\\node_modules\\@typescript-eslint\\parser\\dist\\index.js'
...
✖ all actor display reads are resolver-bound
✖ a newly added raw display exit is rejected (mutation RED)
✖ a resolver-backed renderer is accepted
ℹ tests 5
ℹ pass 2
ℹ fail 3
```

`clients/desktop/node_modules` 자체가 없는 상태여서 재고 화면 Vitest와 typecheck를 아직 실행할 수 없다. 이 실패는 재고 현황 코드의 실패가 아니라 desktop 의존성 미설치로 인한 선행 검사/파서 로딩 실패다. 의존성 설치 후 직접 재고 관련 테스트와 typecheck를 재측정한다.

의존성 설치 및 로컬 파생물 생성 후 재측정했다.

```text
npm ci --ignore-scripts
added 1017 packages, and audited 1019 packages in 22s

clients/web/design-system> npm ci --ignore-scripts
added 470 packages, and audited 471 packages in 15s

clients/web/design-system> npm run build
✓ built in 5.84s

clients/desktop> npm run build
✓ built in 6.36s
```

typecheck 원문:

```text
npm run typecheck
...
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

결과: desktop typecheck 및 typecheck 보조 검증은 exit 0이다.

desktop 전체 unit test 원문 중 실패:

```text
> @samhan/desktop@0.1.0 test
> vitest run --run

❯ src/main/build-output-cjs-interop.test.ts (1 test | 1 failed)
Error: 외부 패키지 import 가 실제 Node ESM 로더에서 실패했다:
- electron-store (import Store from 'electron-store'):
Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
```

전역 actor-display boundary 선행 검사는 의존성 설치 후 `tests 5 / pass 5 / fail 0`이었다. Vitest 본체는 Electron 설치 산출물 문제로 1건 실패했으며, 재고 현황 관련 소스에 대한 실패는 없었다. `rg`로 `clients/desktop/src` 아래 재고 현황 전용 `*test*`/`*.spec.*` 파일을 확인했으나 별도 재고 현황 페이지 테스트 파일은 발견되지 않았다.

## 6. 공유 DB 실 데이터 조회

DB/API write 없이 기존 배포 API에 GET만 보냈다.

```text
GET http://127.0.0.1:8085/inventory/balances?page=0&size=20
X-User-Id: 00000000-0000-0000-0000-000000000001
X-User-Role: MASTER

HTTP 403
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=inventory.stock-balance action=VIEW role=MASTER reason=account permission missing","data":null,...}
```

현재 공유 배포는 권한 부족으로 실제 행 수를 반환하지 않아, 이 세션의 공유 DB live API에서 보이는 행 수를 새로 세지 못했다. 직전 읽기 전용 정찰 원문 수치는 활성 `stock_balances` 202행, 정상 product 연결 2행, 삭제 product 참조 100개였고, 이번 로컬 회귀 IT는 격리 데이터 3행 중 정상 2행과 끊긴 1행을 모두 반환함을 확인했다. 공유 DB에는 쓰지 않았다.

## 7. 라운드 종료 확인

git 명령 금지 지시에 따라 VCS 상태 명령은 실행하지 않았다. 파일시스템 기준으로 이번 라운드의 의도된 소스 변경은 본 보고서 추가뿐이며, 삭제된 추적 파일은 관찰되지 않았다. `node_modules`, `dist`, `out`은 테스트를 위해 생성된 로컬 파생물이다.

## 최종 판정

현재 `origin/main` 코드에서 결함은 이미 #1171 방식으로 해소되어 있다. 수정 production code와 신규 RED/GREEN commit은 만들지 않는다. 정상 행·누락 행 모두 응답하고, 누락 행은 UUID 없이 `참조 끊김`/`제품 마스터 없음`으로 식별되며, strict mutation 경로와 기존 소비처 계약은 유지된다.
