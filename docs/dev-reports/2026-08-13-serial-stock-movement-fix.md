# 시리얼 재고 수불 이력 단절 수정 — 2026-08-13

## 범위와 전제

이번 라운드는 앞으로 실행되는 시리얼 관리 품목의 전표 입고·출고 경로만 대상으로 한다.
이미 `SHIPPED`인 15건의 소급 movement 생성, `stock_transfers`, QR 스캔 mutation은 수행하지 않는다.

정찰 보고서의 좌표를 실제 소스와 대조했고, `StockInstanceService.inboundBatch()`와
`shipBatch()`가 `stock_instances`만 생성·전이하며 `StockMovementRepository`를 호출하지 않는다는
전제가 일치했다.

## RED-first 원문

### ① 시리얼 입고 — 실패

명령:

```text
.\gradlew :services:inventory-service:test --tests "com.samhanair.logis.inventory.it.StockInstanceBatchInboundIT.inboundBatch_serialProduct_createsInstances" --no-daemon
```

핵심 원문:

```text
StockInstanceBatchInboundIT > POST /inventory/instances/batch: serial 품목 qty=3 → 201 + 3행 AVAILABLE FAILED
    org.opentest4j.AssertionFailedError at StockInstanceBatchInboundIT.java:146

1 test completed, 1 failed

BUILD FAILED
```

실패 의미: 인스턴스 3행은 생성됐지만 `stock_movements`의 `INBOUND` 물리 변동 행은 0행이었다.

### ① 시리얼 출고 — 실패

명령:

```text
.\gradlew :services:inventory-service:test --tests "com.samhanair.logis.inventory.it.StockInstanceOutboundIT.shipBatch_shipsReservedInstances" --no-daemon
```

핵심 원문:

```text
StockInstanceOutboundIT > ship-batch: RESERVED → SHIPPED + 출고처/전표/일시 기록 FAILED
    org.opentest4j.AssertionFailedError at StockInstanceOutboundIT.java:183

1 test completed, 1 failed

BUILD FAILED
```

실패 의미: `SHIPPED` 2행은 생성됐지만 `stock_movements`의 `DEDUCT` 물리 변동 행은 0행이었다.

### ③ 기존 수량 관리 품목 — 현재 정상 통과

명령:

```text
.\gradlew :services:inventory-service:test --tests "com.samhanair.logis.inventory.service.StockServiceTest.inbound_createsLotAndAddsBalance_andLogsMovement" --tests "com.samhanair.logis.inventory.service.StockServiceTest.deduct_FIFO_drainsOldestLotFirst" --no-daemon
```

원문:

```text
BUILD SUCCESSFUL in 12s
```

이 테스트들은 수정 전 수량 관리 품목의 lot/balance와 `INBOUND`/`DEDUCT` movement 동작을 고정한다.

## 고른 수단과 이유

기존 정본인 `stock_movements`에 시리얼 인스턴스의 물리 변동을 직접 기록한다. 입고 시 새로
생성된 인스턴스마다 `INBOUND, +1`, 출고 시 이번 호출에서 실제로 `RESERVED → SHIPPED` 된
인스턴스마다 `DEDUCT, -1`을 저장한다. 수량 관리 경로가 이미 사용하는 물리 유형과 부호를
그대로 사용하므로 수불부의 기존 필터·누적 계산을 바꾸지 않는다.

기록은 인스턴스 상태 변경과 같은 `@Transactional` 서비스 메서드 안에서 수행한다. 입고의
멱등 재호출은 새로 생성된 인스턴스가 없으므로 movement도 추가하지 않고, 출고 재호출은
새로 `SHIPPED`가 된 인스턴스가 없으므로 movement도 추가하지 않는다. 따라서 상태 전이와
movement 생성 사이의 성공/실패 창을 만들지 않는다.

`stock_movements.lot_id`는 NULL 불가이므로 해당 물리 변동의 단위인 인스턴스 ID를 사용한다.
전표 source context가 있으면 입고는 `INBOUND`, 출고는 `SLIP` reference와 `slipId`를 기록하고, 직접 호출처럼
context가 없는 경우에도 물리 변동 자체는 `system` 행으로 남긴다.

## GREEN 원문

명령:

```text
.\gradlew :services:inventory-service:test --tests "com.samhanair.logis.inventory.it.StockInstanceBatchInboundIT.inboundBatch_serialProduct_createsInstances" --tests "com.samhanair.logis.inventory.it.StockInstanceOutboundIT.shipBatch_shipsReservedInstances" --tests "com.samhanair.logis.inventory.service.StockServiceTest.inbound_createsLotAndAddsBalance_andLogsMovement" --tests "com.samhanair.logis.inventory.service.StockServiceTest.deduct_FIFO_drainsOldestLotFirst" --no-daemon
```

원문:

```text
> Task :services:inventory-service:test

BUILD SUCCESSFUL in 42s
18 actionable tasks: 3 executed, 15 up-to-date
```

시리얼 입고 3행과 `INBOUND` 3행, 시리얼 출고 2행과 `DEDUCT` 2행이 모두 통과했고,
기존 수량 관리 inbound/deduct movement 테스트도 함께 통과했다.

## 변경 모듈 전량 테스트 결과

명령:

```text
.\gradlew :services:inventory-service:test --no-daemon
```

최종 원문:

```text
> Task :services:inventory-service:test

BUILD SUCCESSFUL in 1m 57s
18 actionable tasks: 2 executed, 16 up-to-date
```

전량 테스트 라운드에서 `642 tests completed, 3 failed, 1 skipped`가 먼저 발생했다.
실패 3건은 새 `StockMovementRepository` 의존성을 Mockito 단위 테스트 fixture가 주입하지
않아 발생한 NPE였고, 해당 두 단위 테스트에 repository mock을 추가한 뒤 같은 명령을
필터 없이 재실행해 최종 `BUILD SUCCESSFUL`을 확인했다. Testcontainers 라운드는 다른
테스트와 병렬로 실행하지 않았다.

## 불변식별 보증

1. 시리얼 입고·출고: 배치 통합 테스트가 인스턴스 수와 동일한 `INBOUND +1`/`DEDUCT -1` 행을 검증한다.
2. 수불부 누적 잔량: 시리얼 1개당 입고 +1, 출고 -1을 기존 `StockLedgerService` 물리 유형에 태워 활성 인스턴스 수와 일치시킨다.
3. 기존 수량 품목: 기존 `StockServiceTest`의 lot/balance/movement 테스트와 변경 모듈 전량 테스트로 기존 호출·행 수를 회귀 검증했다.
4. 원자성·멱등성: 동일 `@Transactional` 경계에서 상태 전이와 movement를 저장하고, 신규/전이된 인스턴스에만 기록하는 구현과 기존 멱등 테스트로 재호출 중복을 막는다.

## 판단이 필요해 남긴 것

- 기존 `SHIPPED` 15건에 대한 소급 movement 생성 여부는 결정 대기이며 이번 라운드에서 하지 않았다.
- `stock_transfers`의 실제 재고·movement 반영 시점은 별도 라운드다.
- QR 스캔 입출고 mutation은 미착수다.

## 못 한 것

- 소급 보정 및 운영 DB 쓰기/검증을 하지 않았다.
- 재고이동 축과 QR 스캔 축을 수정하거나 테스트하지 않았다.
- 변경 모듈 전량 테스트는 필터 없이 실행해 통과했다.

## 라운드 2

### RED 원문 (양방향)

시리얼 도달성 회귀 테스트:

```text
.\gradlew :services:inventory-service:test --tests "com.samhanair.logis.inventory.service.StockServiceTest.findBalancePage_serialInstancesAreReachableAndExistingQuantityRowsRemainUnchanged" --no-daemon

StockServiceTest > findBalancePage_serialInstancesAreReachableAndExistingQuantityRowsRemainUnchanged() FAILED
1 test completed, 1 failed
BUILD FAILED
```

`stock_balances`가 비어 있고 활성 시리얼 인스턴스만 있는 경우 `findBalancePage()`가 행을 반환하지 않아 수불부 버튼에 도달할 수 없음을 재현했다. 동시에 기존 수량 관리 품목의 `availableQty=4`, `reservedQty=1`, `totalQty=5` 보존 테스트를 추가해 반대 방향 회귀 기준도 고정했다.

### 고른 수단과 이유

`stock_instances`의 `AVAILABLE`/`RESERVED`를 품목·창고·상태별로 집계하는 `StockInstanceRepository.findActiveBalanceGroups()`를 추가하고, `StockService.findBalancePage()`에서 재고 현황 행으로 합성했다. 시리얼 품목의 수량은 활성 인스턴스 수이며, `SHIPPED`/`RECALLED`는 제외한다. 이미 `stock_balances` 행이 남은 시리얼 품목은 중복 표시하지 않고 인스턴스 집계를 정본으로 사용하며, 기존 수량 관리 품목은 기존 경로를 그대로 사용한다. VIRTUAL 창고에는 시리얼 수량 행을 합성하지 않는다.

새 마이그레이션은 추가하지 않았다. 따라서 이번 라운드에는 migration 번호 충돌 조사 대상이 없다.

### GREEN 원문

```text
.\gradlew :services:inventory-service:test --tests "com.samhanair.logis.inventory.service.StockServiceTest.findBalancePage_*" --no-daemon

BUILD SUCCESSFUL in 21s
```

시리얼 행 검증: `ACL-KORGHP07 / availableQty=2 / reservedQty=1 / totalQty=3`.
기존 수량 관리 행 검증: `BATCH-001 / availableQty=4 / reservedQty=1 / totalQty=5`.

### 불변식 ①~④ 보증 방법

1. **① 도달성** — `stock_balances`가 없는 활성 시리얼 품목도 재고 현황 행을 반환한다. 기존 행별 `수불부` 버튼으로 사용자가 수불부 화면을 연다.
2. **② 실제 수량 일치** — `AVAILABLE`=가용, `RESERVED`=예약, 두 상태의 합=실재고로 매핑한다.
3. **③ 기존 품목 불변** — `findBalancePage_batchBalanceStillUsesStockBalanceQuantities`가 기존 수량을 그대로 검증하고, serial-managed 행만 인스턴스 집계로 대체한다.
4. **④ 라운드 1 유지** — 이번 변경은 조회 합성만 수행하며 입고·출고 mutation, movement 기록, 누적 잔량 계산, 트랜잭션 경계를 변경하지 않았다. 라운드 1의 movement·누적 잔량·원자성 테스트와 전량 테스트가 통과했다.

### reference 값 정정

기존 보고서의 설명을 다음과 같이 정정한다.

```text
입고 movement reference_type = INBOUND
출고 movement reference_type = SLIP
```

라이브 QA 실측에서 입고 2건은 모두 `INBOUND`, 출고 1건만 `SLIP`이었다. 입고 reference를 `SLIP`이라고 설명한 기존 원문은 사실과 맞지 않아 이 라운드에 정정했다.

### 전량 테스트 원문

```text
.\gradlew :services:inventory-service:test --no-daemon

644 tests completed, 0 failed, 1 skipped
BUILD SUCCESSFUL in 2m 14s
18 actionable tasks: 2 executed, 16 up-to-date
```

새 테스트는 단위 테스트라 Linux 스킵 가드가 필요한 Testcontainers/운영환경 의존 테스트가 아니다. Testcontainers 라운드와 병렬 실행하지 않았다. 첫 전량 실행에서 새 repository mock이 없던 기존 가상창고 fixture 5건이 NPE로 실패했으나, fixture에 mock과 빈 집계를 추가한 뒤 필터 없이 재실행해 위 결과를 확인했다.

### 판단 필요해 남긴 것

- 이미 `SHIPPED`인 15건의 소급 movement 생성 여부는 개발책임자 결정 대기다.
- `confirm()`이 실제 재고를 변경하지 않는 재고이동 축은 별도 라운드다.

### 못 한 것

- QR 스캔 mutation은 경로 자체가 없어 수정하지 않았다.
- 소급 movement 생성, 운영 DB 쓰기/검증, 재고이동 축 수정은 수행하지 않았다.
- 라이브 Docker/Playwright 재수렴 QA는 이 코드 라운드에서 수행하지 않았다.
