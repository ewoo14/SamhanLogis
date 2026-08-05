# 이슈 #1055 VIRTUAL 창고 노출 수정 작업 보고서

- 작업일: 2026-08-04
- 작업 브랜치: `fix/1055-zero-stock-warehouse-visibility`
- 기준 HEAD: `b11067d63`
- 결정: VIRTUAL 창고만 재고 현황 결과에 포함
- 범위: `inventory-service` 및 데스크톱 창고 재고 현황 화면 관련 코드·테스트
- 금지 사항: git 명령, DB 쓰기, Docker 이미지 재빌드·서비스 재배포, 전체 테스트 스위트 실행 금지

## 작업 시작

지정 진단 보고서 `docs/dev-reports/2026-08-04-1055-zero-stock-warehouse-diagnosis.md`를 먼저 확인했다.

진단에서 확인된 기준 사실:

- 미삭제 창고 30곳 중 `VIRTUAL`은 코드 `VR-001`, 이름 `가상창고` 1곳이다.
- 미삭제 `stock_balances`는 206행이며, 재고 보유 행은 기존 두 창고에만 있다.
- `StockBalanceRepository`가 `StockBalance` 기준으로 조회하므로 잔액 행이 없는 VIRTUAL 창고가 응답에 도달하지 않는다.
- 프런트 `InventoryStockBalancePage.tsx`에는 `VIRTUAL` 수량을 `—`로 표시하는 분기가 이미 있다.

이 시점에는 코드 수정과 테스트 실행을 하지 않았다.

## 조사·가설 확정

진단 보고서의 소스 추적과 현재 코드 재확인으로 다음 원인을 확정했다.

- `StockBalanceRepository.findBalancePage`의 조회 루트가 미삭제 `StockBalance`다.
- `StockService.findBalancePage`는 저장소가 반환한 잔액 행만 DTO로 변환하며, 창고 목록과 누락 조합을 합성하지 않는다.
- 데스크톱 화면에는 `warehouseType === 'VIRTUAL'`일 때 가용·예약·실재고를 모두 `—`로 렌더하는 코드가 이미 있다.
- 따라서 수정 대상은 `GET /inventory/balances`의 백엔드 조회 조합이며, VIRTUAL 이외의 잔액 0 창고를 합성하면 안 된다.

구현 가설:

1. 기존 활성 `StockBalance` 행은 그대로 보존한다.
2. 활성 잔액에 등장하는 품목별로 활성 `VIRTUAL` 창고 행만 메모리에서 합성한다. 합성 수량은 모두 0이며 DB에 저장하지 않는다.
3. 기존 필터·정렬 의미를 유지한 결과 집합을 페이지화한다. 따라서 기준 데이터에서는 206 + 103 = 309행이어야 한다.
4. 프런트 수량 렌더와 범례는 이미 결정된 동작이므로 수정하지 않는다.

## 이 라운드가 보지 않은 것

- 아직 RED 회귀 테스트 파일을 추가하지 않았다.
- 아직 RED 테스트를 실행하지 않았으므로 실패 원문이 없다.
- 합성 행의 실제 구현과 페이지 경계·창고 필터 동작은 아직 검증하지 않았다.
- 기존 206행의 각 수량 값 보존과 VIRTUAL 행의 합계 제외는 아직 테스트로 고정하지 않았다.

## RED 테스트 작성

신규 회귀 테스트:

- `services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/StockServiceVirtualWarehouseVisibilityTest.java`
- `redA_virtualWarehouseIsIncludedInWholeInventoryResult`
- `redB_onlyVirtualZeroRowsAreAdded_notEveryZeroStockWarehouse`

테스트 데이터는 재고 보유 창고 `HQ-001 본사창고`와 `VH-001 1호차 차량재고`에 같은 103개 품목의 기존 206행을 두고, `VR-001 가상창고`에는 잔액 행을 두지 않았다. 기대 결과는 기존 206행 + VIRTUAL 103행 = 309행이며, 일반 재고 0 창고 조합은 포함하지 않는 것이다.

이 단계에서는 운영 코드에 수정하지 않았다. 다음 단계에서 이 두 테스트를 먼저 실행하고 실패 원문을 그대로 기록한다.

## 이 라운드가 보지 않은 것

- 아직 RED 테스트 실행 결과를 확인하지 않았다.
- 아직 운영 코드와 DTO를 수정하지 않았다.
- 아직 309행 페이지화, 품목 필터, VIRTUAL 창고 필터, 기존 수량 보존을 검증하지 않았다.

## RED 실행 원문

실행 명령:

```text
.\gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.service.StockServiceVirtualWarehouseVisibilityTest --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:realtime-abstraction:processResources
> Task :shared:notification-publisher:compileJava FROM-CACHE
> Task :shared:security:compileJava FROM-CACHE
> Task :shared:notification-publisher:processResources
> Task :shared:notification-publisher:classes
> Task :shared:security:processResources
> Task :shared:security:classes
> Task :shared:common:compileJava FROM-CACHE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :services:inventory-service:processResources
> Task :services:inventory-service:processTestResources
> Task :shared:ecount-io:compileJava FROM-CACHE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava FROM-CACHE
> Task :shared:realtime-abstraction:classes
> Task :shared:common:jar
> Task :shared:notification-publisher:jar
> Task :shared:ecount-io:jar
> Task :shared:security:jar
> Task :shared:realtime-abstraction:jar
> Task :services:inventory-service:compileJava
> Task :services:inventory-service:classes

> Task :services:inventory-service:compileTestJava

> Task :services:inventory-service:testClasses

> Task :services:inventory-service:test

StockServiceVirtualWarehouseVisibilityTest > redB_onlyVirtualZeroRowsAreAdded_notEveryZeroStockWarehouse() FAILED
    org.opentest4j.AssertionFailedError at StockServiceVirtualWarehouseVisibilityTest.java:86

StockServiceVirtualWarehouseVisibilityTest > redA_virtualWarehouseIsIncludedInWholeInventoryResult() FAILED
    java.lang.AssertionError at StockServiceVirtualWarehouseVisibilityTest.java:79

> Task :services:inventory-service:test FAILED
18 actionable tasks: 13 executed, 5 from cache
Note: Some input files use unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended

2 tests completed, 2 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:inventory-service:test'.
> There were failing tests. See the report at: file:///D:/dev/Samhan-Public/.claude/worktrees/w1055/services/inventory-service/build/reports/tests/test/index.html

* Try:
> Run with --scan to get full insights.

BUILD FAILED in 32s
```

RED 판정: 두 테스트가 모두 실패했다. 현재 구현은 기존 206개 잔액 행만 반환하므로 VIRTUAL 행이 없고, VIRTUAL 103행을 포함한 목표 행 수 309도 만들지 못한다.

## 이 라운드가 보지 않은 것

- 아직 운영 코드 수정 후 GREEN 결과를 실행하지 않았다.
- 아직 테스트 실패의 assertion 상세값 외에 실제 HTTP 응답 JSON을 확인하지 않았다.
- 아직 페이지 크기 20/100의 페이지 경계와 `productId`·`warehouseId` 필터를 검증하지 않았다.
- 아직 데스크톱 실제 렌더 캡처를 실행하지 않았다.

## 구현

수정 파일:

- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockService.java`
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/StockBalanceResponse.java`

변경 내용:

- `GET /inventory/balances`의 서비스 조회 결과를 기존 활성 `StockBalance` 행과 응답 전용 `VIRTUAL` 행으로 조합한다.
- 활성 잔액에 등장한 품목만 모집단으로 사용하고, 활성 `VIRTUAL` 창고에 대해서만 품목별 표시 행을 추가한다.
- `HEADQUARTERS`, `VEHICLE`, `CONSIGNMENT`의 재고 0 조합은 합성하지 않는다.
- 합성 행은 `availableQty`, `reservedQty`, `totalQty`를 0으로 두되 저장하지 않고, `version`은 null로 둔다. 프런트의 기존 VIRTUAL 분기가 세 수량을 `—`로 표시한다.
- 기존 행과 합성 행을 기존 정렬 키인 품목 UUID·창고 코드 순으로 합친 후, API의 원래 `Pageable`로 다시 페이지화한다.
- `POST /inventory/balances/batch`를 포함한 다른 저장소 호출 경로와 데스크톱 화면 코드는 수정하지 않았다.

## 이 라운드가 보지 않은 것

- 아직 구현 후 GREEN 테스트 결과를 실행하지 않았다.
- 아직 기존 206행의 수량·응답 필드가 모두 보존되는지 별도 assertion으로 확인하지 않았다.
- 아직 `productId` 필터와 `warehouseId=VR-001` 필터를 별도 테스트하지 않았다.
- 아직 실제 DB·HTTP 통합 테스트나 브라우저 렌더를 실행하지 않았다.

## GREEN 실행 원문

실행 명령:

```text
.\gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.service.StockServiceVirtualWarehouseVisibilityTest --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :services:inventory-service:processResources UP-TO-DATE
> Task :services:inventory-service:processTestResources UP-TO-DATE
> Task :shared:notification-publisher:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:notification-publisher:processResources UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:notification-publisher:classes UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:notification-publisher:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :services:inventory-service:compileJava
> Task :services:inventory-service:classes

> Task :services:inventory-service:compileTestJava

> Task :services:inventory-service:testClasses
> Task :services:inventory-service:test

BUILD SUCCESSFUL in 22s
18 actionable tasks: 3 executed, 15 up-to-date
Note: Some input files use unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

GREEN 판정: RED-A와 RED-B 두 테스트가 동시에 통과했다. 목표 행 수 309, VIRTUAL 103행, 일반 0재고 창고 비합성 조건을 확인했다.

## 이 라운드가 보지 않은 것

- 기존 206행의 각 수량 값이 정확히 유지되는지 별도 assertion으로 아직 확인하지 않았다.
- 합성 VIRTUAL 행의 `version=null` 및 세 수량 0이 집계 오염 없이 유지되는지 별도 assertion으로 아직 확인하지 않았다.
- 아직 `productId` 필터와 `warehouseId=VR-001` 필터를 별도 테스트하지 않았다.
- 아직 실제 DB·HTTP 통합 테스트나 브라우저 렌더를 실행하지 않았다.

## 불변식 보강

RED-A/RED-B의 GREEN 이후 동일 테스트에 다음 보강 assertion을 추가했다.

- 빈 `HEADQUARTERS`와 `CONSIGNMENT` 창고를 창고 목록에 포함해도 응답에는 합성하지 않는다.
- 기존 `HQ-001 본사창고` 103행과 `VH-001 1호차 차량재고` 103행의 가용·예약·실재고 값을 그대로 확인한다.
- VIRTUAL 103행은 세 수량이 0이고 `version`이 null이며, VIRTUAL 행의 실재고 합계가 0임을 확인한다.

다음 단계에서 보강된 테스트를 실행하고 결과를 append한다.

## 이 라운드가 보지 않은 것

- 보강 assertion을 추가한 뒤의 테스트 실행 결과는 아직 없다.
- 아직 `productId` 필터와 `warehouseId=VR-001` 필터를 별도 테스트하지 않았다.
- 아직 실제 DB·HTTP 통합 테스트나 브라우저 렌더를 실행하지 않았다.

## 불변식 보강 GREEN 원문

실행 명령:

```text
.\gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.service.StockServiceVirtualWarehouseVisibilityTest --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :services:inventory-service:processResources UP-TO-DATE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :services:inventory-service:processTestResources UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:notification-publisher:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:notification-publisher:processResources UP-TO-DATE
> Task :shared:notification-publisher:classes UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:notification-publisher:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :services:inventory-service:compileJava UP-TO-DATE
> Task :services:inventory-service:classes UP-TO-DATE

> Task :services:inventory-service:compileTestJava

> Task :services:inventory-service:testClasses
> Task :services:inventory-service:test

BUILD SUCCESSFUL in 21s
18 actionable tasks: 2 executed, 16 up-to-date
Note: D:\dev\Samhan-Public\.claude\worktrees\w1055\services\inventory-service\src\test\java\com\samhanair\logis\inventory\service\StockServiceVirtualWarehouseVisibilityTest.java uses unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

보강 GREEN 판정: 두 RED 테스트와 C 기존 206행 보존, D VIRTUAL 수량 합계 0 assertion이 함께 통과했다.

## 이 라운드가 보지 않은 것

- 아직 `productId` 필터와 `warehouseId=VR-001` 필터를 별도 테스트하지 않았다.
- 아직 실제 DB·HTTP 통합 테스트나 브라우저 렌더를 실행하지 않았다.
- 아직 변경 파일의 정적 diff 검토와 범위 밖 파일 변경 여부를 확인하지 않았다.

## 경계 조건 검토

수정 후 코드 검토에서, 향후 VIRTUAL 창고에 실제 `StockBalance` 행이 생기는 경우 기존 행과 응답 합성 행이 중복될 수 있는 경계를 확인했다. 합성 전에 `(품목, 창고 코드)` 키를 수집하고, 이미 있는 VIRTUAL 조합은 추가하지 않도록 보강한다.

## 이 라운드가 보지 않은 것

- VIRTUAL 실제 잔액 행이 이미 존재하는 경우의 중복 방지 assertion은 아직 없다.
- 아직 `productId` 필터와 `warehouseId=VR-001` 필터를 별도 테스트하지 않았다.
- 아직 실제 DB·HTTP 통합 테스트나 브라우저 렌더를 실행하지 않았다.

## 필터·중복 경계 테스트 추가

보강 테스트:

- `productId` 필터는 기존 HQ/VH 두 행과 해당 VIRTUAL 한 행만 반환한다.
- `warehouseId=VR-001` 필터는 VIRTUAL 행만 반환한다.
- 기존 VIRTUAL 잔액 행이 있는 경우에도 합성 키 dedupe를 적용하도록 서비스 코드를 보강했다.

다음 단계에서 이 테스트를 포함한 관련 서비스 테스트를 다시 실행한다.

## 이 라운드가 보지 않은 것

- 필터·중복 경계 테스트 실행 결과는 아직 없다.
- 아직 실제 DB·HTTP 통합 테스트나 브라우저 렌더를 실행하지 않았다.

## 필터·중복 경계 GREEN 원문

실행 명령:

```text
.\gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.service.StockServiceVirtualWarehouseVisibilityTest --tests com.samhanair.logis.inventory.service.StockServiceTest --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :services:inventory-service:processResources UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:notification-publisher:compileJava UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :services:inventory-service:processTestResources UP-TO-DATE
> Task :shared:notification-publisher:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:notification-publisher:classes UP-TO-DATE
> Task :shared:notification-publisher:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :services:inventory-service:compileJava
> Task :services:inventory-service:classes

> Task :services:inventory-service:compileTestJava

> Task :services:inventory-service:testClasses
> Task :services:inventory-service:test

BUILD SUCCESSFUL in 24s
18 actionable tasks: 3 executed, 15 up-to-date
Note: Some input files use unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

판정: VIRTUAL 전체 조회·일반 0창고 비노출·기존 206행 보존·VIRTUAL 합계 0·품목 필터·VIRTUAL 창고 필터·중복 방지 테스트와 기존 `StockServiceTest`가 모두 통과했다.

## 이 라운드가 보지 않은 것

- 아직 실제 DB·HTTP 통합 테스트나 브라우저 렌더를 실행하지 않았다.
- 아직 변경 범위 밖 파일이 수정되지 않았는지 최종 정적 확인 전이다.
- 아직 최종 보고서 요약과 신규 파일 목록을 정리하지 않았다.

## 최종 정적 확인 전 보정

회귀 테스트의 product lookup stub에서 불필요한 unchecked 캐스팅을 제거했다. 운영 동작 변경은 없다.

정적 확인:

- 프런트 `InventoryStockBalancePage.tsx`의 VIRTUAL 세 수량 `—` 렌더 분기와 범례 문구는 그대로다.
- 금지된 Slip/PartnerLedger/다른 서비스 경로는 수정하지 않았다.
- Docker 이미지 재빌드·서비스 재배포와 DB 쓰기는 수행하지 않았다.

## 이 라운드가 보지 않은 것

- unchecked 보정 후 관련 테스트 최종 실행 결과는 아직 없다.
- 실제 DB·HTTP 통합 테스트와 브라우저 렌더는 실행하지 않는다. 이번 작업 범위의 단위 테스트로 검증한다.

## 최종 관련 테스트 GREEN 원문

실행 명령:

```text
.\gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.service.StockServiceVirtualWarehouseVisibilityTest --tests com.samhanair.logis.inventory.service.StockServiceTest --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :services:inventory-service:processResources UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:notification-publisher:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :services:inventory-service:processTestResources UP-TO-DATE
> Task :shared:notification-publisher:processResources UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:notification-publisher:classes UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:notification-publisher:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :services:inventory-service:compileJava UP-TO-DATE
> Task :services:inventory-service:classes UP-TO-DATE
> Task :services:inventory-service:compileTestJava
> Task :services:inventory-service:testClasses
> Task :services:inventory-service:test

BUILD SUCCESSFUL in 18s
18 actionable tasks: 2 executed, 16 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

최종 판정:

- RED-A와 RED-B가 수정 전 실패했고, 수정 후 동시에 GREEN이다.
- 기준 데이터 행 수는 206행에서 309행으로 증가하며, 추가분은 VIRTUAL 103행뿐이다.
- 일반 재고 0 창고는 합성하지 않는다.
- 기존 HQ/VH 206행의 수량은 유지된다.
- VIRTUAL 수량 합계는 0이며, 화면은 기존 프런트 분기로 `—`를 표시한다.
- 품목 필터·VIRTUAL 창고 필터·기존 VIRTUAL 행 중복 방지도 GREEN이다.

## 이 라운드가 보지 않은 것

- 실제 DB·HTTP 통합 테스트와 브라우저 라이브 캡처는 실행하지 않았다.
- Docker 이미지 재빌드·서비스 재배포는 실행하지 않았다.
- git 명령과 DB 쓰기는 실행하지 않았다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-04-1055-virtual-warehouse-fix.md`
- `services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/StockServiceVirtualWarehouseVisibilityTest.java`

## 중복 방지 assertion 보강

최종 판정 문구와 실제 assertion을 일치시키기 위해, 기존 VIRTUAL 잔액 행 1개가 이미 존재하는 경우에도 합성 VIRTUAL 행이 중복되지 않는 테스트를 추가했다. 다음 단계에서 관련 테스트를 다시 실행한다.

## 이 라운드가 보지 않은 것

- 중복 방지 assertion을 추가한 최종 테스트 실행 결과는 아직 없다.
- 실제 DB·HTTP 통합 테스트와 브라우저 라이브 캡처는 실행하지 않는다.

## 중복 방지 최종 GREEN 원문

실행 명령:

```text
.\gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.service.StockServiceVirtualWarehouseVisibilityTest --tests com.samhanair.logis.inventory.service.StockServiceTest --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :services:inventory-service:processResources UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:notification-publisher:compileJava UP-TO-DATE
> Task :services:inventory-service:processTestResources UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:notification-publisher:processResources UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:notification-publisher:classes UP-TO-DATE
> Task :shared:notification-publisher:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :services:inventory-service:compileJava UP-TO-DATE
> Task :services:inventory-service:classes UP-TO-DATE
> Task :services:inventory-service:compileTestJava
> Task :services:inventory-service:testClasses
> Task :services:inventory-service:test

BUILD SUCCESSFUL in 19s
18 actionable tasks: 2 executed, 16 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

최종 GREEN 판정: RED-A/RED-B, C 기존 206행 보존, D VIRTUAL 수량 합계 0, 품목·창고 필터, 기존 VIRTUAL 행 dedupe, 기존 `StockServiceTest`가 모두 통과했다.

## 이 라운드가 보지 않은 것

- 실제 DB·HTTP 통합 테스트와 브라우저 라이브 캡처는 실행하지 않았다.
- Docker 이미지 재빌드·서비스 재배포, DB 쓰기, git 명령은 실행하지 않았다.

## 기존 StockService 단위 테스트 GREEN 원문

실행 명령:

```text
.\gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.service.StockServiceTest --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :services:inventory-service:processResources UP-TO-DATE
> Task :services:inventory-service:processTestResources UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:notification-publisher:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:notification-publisher:processResources UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:notification-publisher:classes UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:notification-publisher:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :services:inventory-service:compileJava UP-TO-DATE
> Task :services:inventory-service:classes UP-TO-DATE
> Task :services:inventory-service:compileTestJava UP-TO-DATE
> Task :services:inventory-service:testClasses UP-TO-DATE
> Task :services:inventory-service:test

BUILD SUCCESSFUL in 16s
18 actionable tasks: 1 executed, 17 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

판정: 기존 `StockServiceTest`도 통과했다. 입고·예약·해제·차감 등 기존 서비스 단위 동작에 회귀가 없었다.

## 이 라운드가 보지 않은 것

- 아직 `productId` 필터와 `warehouseId=VR-001` 필터를 별도 테스트하지 않았다.
- 아직 실제 DB·HTTP 통합 테스트나 브라우저 렌더를 실행하지 않았다.
- 아직 변경 파일의 정적 diff 검토와 범위 밖 파일 변경 여부를 확인하지 않았다.

## 이 라운드가 보지 않은 것

- RED 테스트를 아직 작성하거나 실행하지 않았다.
- 수정 후 GREEN 결과와 실제 응답 행 구성을 아직 검증하지 않았다.
- 배포 이미지·실 배포 API·브라우저 라이브 화면은 확인하지 않았다.
- DB 읽기 전용 재확인 외의 DB 작업은 하지 않았으며, DB 쓰기 계획도 없다.
- Docker 이미지 재빌드와 서비스 재배포는 하지 않았다.
