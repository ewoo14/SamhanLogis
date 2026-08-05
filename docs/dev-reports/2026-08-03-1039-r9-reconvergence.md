# PR #1045 R9 재수렴 — 발행 후 창고 code 수렴성 검증

## 조사 범위

- 단일 각도: 발행과 창고 code 조회 분리 이후 `source_warehouse_code`가 실제로 수렴하는지 확인한다.
- 제외: 8개 모드 집합, 화면 문구, 기존 행 provenance, 전체 스위트, 리팩터링.
- 작업 제한: git 조회만 사용하고, 공유 DB write/DDL 및 Docker 이미지 재빌드와 `slip-service` 전체 스위트는 실행하지 않는다.

## 확인 로그

### 1. 세션 핸드오프 확인

- `docs/handoff/CURRENT-WORK.md`의 최신 2026-08-02 절은 PR #1045를 재수렴 대기 대상으로만 기록한다. 이 문서는 R8 이후 code 저장·복구 경로에 대한 별도 판정을 제공하지 않으므로, 이번 라운드는 현재 HEAD의 코드와 표적 테스트를 권위로 삼는다.

### 2. 작업 기준점과 오염 확인

```text
> git status --short; git log -1 --oneline; git diff --stat
?? docs/dev-reports/2026-08-03-1039-r9-reconvergence.md
f42dc5619 [FIX] #1039 전표 발행을 inventory 가용성에서 분리
```

- 요청된 HEAD `f42dc5619`와 일치한다.
- 시작 시 신규 R9 보고서 외 추적/미추적 변경은 없다.

### 3. R8 주장 분리

- R8 보고서는 저장 직후 `scheduleAfterCommit(...)`을 등록하고, 커밋 뒤 별도 트랜잭션에서 code를 한 번 보강한다고 주장한다.
- 같은 보고서는 inventory 실패 시 예외를 흡수하고 자동 재시도를 도입하지 않았다고 명시한다.
- 따라서 이번 라운드의 검증 가설은 두 개다: (a) 정상 성공 시 실제 별도 저장이 일어난다. (b) 최초 사후 호출 실패 행은 복구 후 다시 채우는 경로가 없다면 영구 `UNKNOWN`이다. 이 둘은 아직 코드·표적 테스트로 재판정해야 한다.

### 4. R8 변경면 1차 추적

- `SlipService.create`와 `MobilePartnerOrderService.createOrder`는 원 전표를 `save`한 뒤 `WarehouseCodeSnapshotService.scheduleAfterCommit(saved.id, sourceWarehouseId)`를 호출한다.
- `scheduleAfterCommit`은 Spring transaction synchronization이 활성 상태면 `afterCommit()` 콜백을 등록하고, 콜백 안에서 `snapshot(...)`을 직접 호출한다. 별도 executor·queue·event publish는 이 변경에 없다.
- `snapshot(...)`은 inventory code가 있으면 `TransactionTemplate.executeWithoutResult`에서 전표를 다시 조회하고 `sourceWarehouseCode == null`인 경우에만 설정·저장한다. 정상 경로의 별도 저장 구현은 존재한다.
- inventory 예외는 `RuntimeException` catch에서 warn 후 종료한다. 이 변경 자체에는 retry 또는 실패 행 재등록이 없다.

### 5. 소비처·재시도 전수 검색

```text
> rg -n "WarehouseCodeSnapshotService|scheduleAfterCommit|sourceWarehouseCode|source_warehouse_code|findWarehouseCode|warehouse code snapshot|@Async|TaskExecutor|Retry|retry" services/slip-service/src/main services/slip-service/src/test --glob '!**/build/**'
services/slip-service/src/main/java/com/samhanair/logis/slip/service/WarehouseCodeSnapshotService.java:31:    public void scheduleAfterCommit(UUID slipId, UUID warehouseId) {
services/slip-service/src/main/java/com/samhanair/logis/slip/service/WarehouseCodeSnapshotService.java:48:                    warehouseInternalClient.findWarehouseCode(warehouseId))
services/slip-service/src/main/java/com/samhanair/logis/slip/service/WarehouseCodeSnapshotService.java:59:            log.warn("warehouse code snapshot skipped: slipId={} reason={}", slipId, ex.getMessage());
services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:326:            warehouseCodeSnapshotService.scheduleAfterCommit(
services/slip-service/src/main/java/com/samhanair/logis/slip/mobile/service/MobilePartnerOrderService.java:171:        warehouseCodeSnapshotService.scheduleAfterCommit(
```

- warehouse snapshot의 운영 진입점은 일반·모바일 신규 발행 두 곳뿐이다.
- `source_warehouse_code`가 null인 기존/실패 행을 주기적으로 검색해 `scheduleAfterCommit` 또는 `snapshot`을 다시 호출하는 경로는 검색되지 않았다.
- 검색된 `CompensationRetry*`와 price-memory executor는 별도 도메인이다. warehouse snapshot 실패를 저장하거나 재처리하지 않는다.

### 6. 파일:줄 기준 정상 저장 경로와 테스트 공백

- 일반 발행 등록: `SlipService.java:324-327`.
- 모바일 발행 등록: `MobilePartnerOrderService.java:170-172`.
- 커밋 이후 실행 등록: `WarehouseCodeSnapshotService.java:31-42`.
- inventory 조회: `WarehouseCodeSnapshotService.java:45-50` → `WarehouseInternalClient.java:80-103`.
- code 별도 저장: `WarehouseCodeSnapshotService.java:51-57`.
- 예외 흡수: `WarehouseCodeSnapshotService.java:58-60`.
- 현재 worker 테스트 `WarehouseCodeSnapshotServiceTest.java:28-50`은 다섯 실패가 전파되지 않는지만 단정한다. 정상 code를 반환했을 때 repository의 전표에 실제 값이 설정·저장되는 테스트는 없다.
- `PublicSlipControllerIT.java:141-150`도 HTTP 201과 `scheduleAfterCommit` 호출만 검증하며, `WarehouseCodeSnapshotService`를 `@MockBean`으로 대체하므로 실제 code 저장을 증명하지 않는다.

### 7. 동기 실행과 응답 지연 판정

- `WarehouseCodeSnapshotService.java:37-41`의 `afterCommit()`은 executor로 넘기지 않고 `snapshot(...)`을 같은 호출 스택에서 직접 실행한다. 이름은 `scheduleAfterCommit`이지만 구현은 비동기 작업이 아니다.
- 그러므로 원 전표 DB commit은 inventory 호출 전에 끝나 롤백 전표에 대해 실행되는 문제는 피한다. 반면 컨트롤러가 발행 응답을 반환하기 전, 커밋 후 callback이 끝날 때까지 요청 스레드는 inventory 조회와 별도 DB 저장을 수행한다.
- `WarehouseInternalClient.java:33-38`은 connect timeout 2초, read timeout 3초를 둔다. 이 대기 시간은 발행 트랜잭션 안에는 없지만 발행 요청 응답 시간에는 그대로 더해질 수 있다. R7의 지연 문제는 트랜잭션 점유에서는 해소됐으나 사용자 응답 지연 형태로 남았다.

### 8. 표적 테스트 설계

- 정상 code 실제 저장은 mock `save` 호출 검증으로 대신하지 않는다. Testcontainers PostgreSQL의 실제 `slips` 행을 사용한다.
- 외부 inventory client만 mock해 literal code `WH-R9-NORMAL`을 반환하게 하고, 실제 `TransactionTemplate`의 원 발행 트랜잭션 안에서 전표 저장과 `scheduleAfterCommit`을 실행한다.
- 원 트랜잭션 반환 뒤 repository를 다시 조회해 `sourceWarehouseCode == "WH-R9-NORMAL"`을 단정한다. 이 테스트는 `afterCommit` 내부 저장이 누락되거나 별도 commit되지 않으면 실패한다.

### 9. 표적 테스트 결과 — 정상 상황에서도 code가 저장되지 않음

```text
실행: .\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.it.WarehouseCodeSnapshotServiceIT.afterCommit_inventorySuccess_persistsSourceWarehouseCode" --no-daemon

> Task :services:slip-service:compileTestJava
> Task :services:slip-service:testClasses

> Task :services:slip-service:test

WarehouseCodeSnapshotServiceIT > afterCommit_inventorySuccess_persistsSourceWarehouseCode() FAILED
    org.opentest4j.AssertionFailedError at WarehouseCodeSnapshotServiceIT.java:55

> Task :services:slip-service:test FAILED
18 actionable tasks: 2 executed, 16 up-to-date

1 test completed, 1 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:slip-service:test'.
> There were failing tests. See the report at: file:///C:/dev/Samhan-Public/.claude/worktrees/t1039/services/slip-service/build/reports/tests/test/index.html

BUILD FAILED in 43s
```

- inventory mock은 정상 code를 반환했고 원 전표 commit도 성공했지만, 원 트랜잭션 종료 뒤 PostgreSQL에서 다시 읽은 `sourceWarehouseCode`가 기대값과 달랐다.
- 이로써 “정상 경로에는 저장 구현이 있다”와 “정상 경로에서 실제 저장된다”가 분리되며, 후자는 현재 HEAD에서 RED다.

테스트 결과 XML 원문:

```text
<testsuite name="com.samhanair.logis.slip.it.WarehouseCodeSnapshotServiceIT" tests="1" skipped="0" failures="1" errors="0" ...>
  <failure message="org.opentest4j.AssertionFailedError: ...
expected: &quot;WH-R9-NORMAL&quot;
 but was: null" ...>
```

### 10. 정상 저장 실패의 원인

```text
> rg -n "TransactionTemplate|setPropagationBehavior|PROPAGATION_REQUIRES_NEW|REQUIRES_NEW" services/slip-service/src/main/java shared --glob '*.java'
services/slip-service/src/main/java/com/samhanair/logis/slip/price/service/PartnerProductPriceMemoryService.java:94:        this.transactionTemplate = new TransactionTemplate(...)
services/slip-service/src/main/java/com/samhanair/logis/slip/price/service/PartnerProductPriceMemoryService.java:95:        this.transactionTemplate.setPropagationBehavior(
services/slip-service/src/main/java/com/samhanair/logis/slip/price/service/PartnerProductPriceMemoryService.java:96:                ...PROPAGATION_REQUIRES_NEW);
services/slip-service/src/main/java/com/samhanair/logis/slip/service/WarehouseCodeSnapshotService.java:28:    private final TransactionTemplate transactionTemplate;
services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipCleanupSaveHistoryService.java:159:        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipCleanupSaveHistoryService.java:160:        transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
```

- `WarehouseCodeSnapshotService`는 Boot 기본 `TransactionTemplate`을 그대로 주입받고 propagation을 `REQUIRES_NEW`로 바꾸지 않는다.
- 같은 서비스의 독립 사후 저장 선례인 price memory와 cleanup history는 명시적으로 `PROPAGATION_REQUIRES_NEW`를 설정한다.
- `afterCommit` 시점에는 원 트랜잭션의 자원이 아직 스레드에 결속되어 있다. 기본 `REQUIRED` template이 그 자원에 참여해 수행한 변경은 이미 끝난 원 commit에 포함될 수 없고 새 commit도 만들지 않는다. 실제 PostgreSQL RED(`expected WH-R9-NORMAL, was null`)이 이 원인을 확인한다.

### 11. 일시 장애 경로 표적 테스트

```text
실행: .\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.service.WarehouseCodeSnapshotServiceTest" --no-daemon

> Task :services:slip-service:compileTestJava UP-TO-DATE
> Task :services:slip-service:testClasses UP-TO-DATE
> Task :services:slip-service:test

BUILD SUCCESSFUL in 14s
18 actionable tasks: 1 executed, 17 up-to-date
```

- 이 5개 parameterized test는 `WarehouseCodeSnapshotServiceTest.java:28-50`에서 404/403/5xx/timeout/network 예외를 각각 1회 흡수하고 `verifyNoInteractions(slipRepository, transactionTemplate)`를 단정한다.
- 실패 사실·slipId·warehouseId를 재시도 저장소에 기록하는 상호작용이 0이므로, inventory가 뒤에 복구되어도 자동으로 다시 호출할 데이터나 trigger가 없다.

### 12. 잘못된 결과의 도달 경로

- 배차용 출고전표 조회는 `SlipInternalController.java:323-328`에서 저장된 `slip.getSourceWarehouseCode()`를 `WarehouseCodeMapper.businessType(...)`에 전달한다.
- `WarehouseCodeMapper.java:101-105`는 null/빈 code를 `UNKNOWN`으로 반환한다.
- 따라서 사용자가 inventory가 정상인 상태에서 신규 OUTBOUND 전표를 발행한 뒤 배차 계열 조회를 열어도, 현재 정상 저장 RED 때문에 창고 업무 구분은 `UNKNOWN`으로 노출된다.

### 13. 요청 스레드 blocking 표적 테스트

`CountDownLatch`로 inventory 응답을 붙잡은 동안 원 발행 `TransactionTemplate` 호출이 완료되지 않는지를 확인했다. 임의 sleep 없이 client 진입과 해제를 동기화했다.

```text
실행: .\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.it.WarehouseCodeSnapshotServiceIT.afterCommit_inventoryCall_blocksPublishingThreadUntilItReturns" --no-daemon

> Task :services:slip-service:compileTestJava
> Task :services:slip-service:testClasses
> Task :services:slip-service:test

BUILD SUCCESSFUL in 40s
18 actionable tasks: 2 executed, 16 up-to-date
```

- 테스트는 inventory client가 진입한 뒤 release되기 전 `publishing.isDone() == false`를 단정했고 GREEN이다.
- 따라서 `WarehouseInternalClient.java:34-35`의 connect 2초/read 3초 대기는 원 전표 commit 이후이지만 HTTP 발행 응답 이전에 발생한다.

### 14. 롤백·유실 판정

- 비동기 executor/queue가 아니므로 프로세스 재시작 사이에 큐 메시지가 유실되는 형태는 없다.
- `WarehouseCodeSnapshotService.java:37-41`은 `afterCommit`에서만 `snapshot`을 호출한다. 원 발행 트랜잭션이 rollback되면 `afterCommit` 자체가 호출되지 않으므로 롤백된 전표를 대상으로 inventory 보강이 도는 경로는 없다.
- 반대 방향의 유실은 있다. 정상 호출도 별도 commit 부재로 저장되지 않고, inventory 예외는 `WarehouseCodeSnapshotService.java:58-60`에서 로그 한 줄만 남긴 뒤 재시도 상태 없이 소멸한다.

### 15. 발행 응답 시점 여부

- 일반·모바일 발행은 `SlipDetailResponse.from(saved)`를 반환하며, `SlipDetailResponse.java:52-140` 계약에 `sourceWarehouseCode` 필드 자체가 없다.
- 설계 의도상 code는 발행 응답 payload에 붙는 값이 아니라 원 commit 뒤 DB snapshot으로 붙어 후속 배차 조회에서 소비되는 값이다.
- 현재는 그 사후 DB commit이 실패하므로 응답 시점에도, 이후 조회 시점에도 붙지 않는다.

## 결함

### R9-B01 BLOCKER — 정상 inventory 응답을 받아도 code가 DB에 commit되지 않는다

- 파일:줄
  - `WarehouseCodeSnapshotService.java:37-41` — 원 commit 뒤 callback에서 `snapshot` 직접 실행.
  - `WarehouseCodeSnapshotService.java:51-57` — 기본 propagation의 주입 `TransactionTemplate`으로 조회·저장.
  - 정상 독립 저장 선례: `PartnerProductPriceMemoryService.java:94-96`, `SlipCleanupSaveHistoryService.java:159-160` — `REQUIRES_NEW` 명시.
- 사용자 조작: inventory가 정상인 상태에서 신규 OUTBOUND 전표를 발행하고 배차 계열 출고전표 조회를 연다.
- 잘못된 결과: inventory가 `WH-R9-NORMAL`을 반환했는데 DB의 `source_warehouse_code`는 null이며, `SlipInternalController.java:323-328` → `WarehouseCodeMapper.java:101-105`에서 `UNKNOWN`으로 노출된다.
- 재현:

```text
> .\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.it.WarehouseCodeSnapshotServiceIT.afterCommit_inventorySuccess_persistsSourceWarehouseCode" --no-daemon

WarehouseCodeSnapshotServiceIT > afterCommit_inventorySuccess_persistsSourceWarehouseCode() FAILED
    org.opentest4j.AssertionFailedError at WarehouseCodeSnapshotServiceIT.java:58

1 test completed, 1 failed
BUILD FAILED in 43s

expected: "WH-R9-NORMAL"
 but was: null
```

### R9-B02 BLOCKER — 일시 장애 뒤 inventory가 복구돼도 실패 전표를 다시 채우는 경로가 없다

- 파일:줄
  - `WarehouseCodeSnapshotService.java:45-60` — 단 한 번 조회하고 예외는 warn 후 종료.
  - `WarehouseCodeSnapshotServiceTest.java:28-50` — 다섯 장애에서 repository/transaction 상호작용 0을 단정.
  - 운영 진입점은 `SlipService.java:326-327`, `MobilePartnerOrderService.java:171-172`의 신규 발행 시점뿐이다.
- 사용자 조작: inventory 장애 중 OUTBOUND 전표를 발행한 뒤 inventory를 복구하고 같은 전표를 배차 조회한다.
- 잘못된 결과: 최초 실패를 재시도 저장소에 남기지 않고 scheduler·queue·null-row sweep도 없어 해당 전표는 계속 `UNKNOWN`이다. B01을 별도로 고쳐도 이 복구 결함은 남는다.
- 재현:

```text
> .\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.service.WarehouseCodeSnapshotServiceTest" --no-daemon

> Task :services:slip-service:test

BUILD SUCCESSFUL in 14s
18 actionable tasks: 1 executed, 17 up-to-date
```

위 GREEN은 404/403/5xx/timeout/network 각각에서 예외가 흡수되고 `verifyNoInteractions(slipRepository, transactionTemplate)`가 성립한다는 증거다. 이어질 복구 trigger는 전수 검색 결과 0이다.

### R9-B03 — 트랜잭션만 분리됐고 inventory 지연은 발행 HTTP 응답 경로에 남는다

- 파일:줄
  - `WarehouseCodeSnapshotService.java:37-41` — `afterCommit`에서 executor 없이 직접 호출.
  - `WarehouseCodeSnapshotService.java:45-49` — 같은 스택에서 inventory 호출.
  - `WarehouseInternalClient.java:33-38` — connect 2초/read 3초 timeout.
- 사용자 조작: inventory가 느리거나 응답하지 않는 동안 OUTBOUND 전표를 발행한다.
- 잘못된 결과: 원 DB commit은 끝나지만 발행 호출은 inventory client가 반환하거나 timeout될 때까지 완료되지 않는다. 사용자는 201을 그만큼 늦게 받는다.
- 재현:

```text
> .\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.it.WarehouseCodeSnapshotServiceIT.afterCommit_inventoryCall_blocksPublishingThreadUntilItReturns" --no-daemon

> Task :services:slip-service:test

BUILD SUCCESSFUL in 40s
18 actionable tasks: 2 executed, 16 up-to-date
```

테스트는 inventory mock을 latch로 붙잡은 동안 `publishing.isDone() == false`를 단정한다. 실제 네트워크에서 connect 2초와 read 3초가 각각 얼마나 소진되는지는 이번 라운드에서 실지연 서버를 띄우지 않아 **미판정**이나, 해당 대기가 HTTP 응답 시간에 포함된다는 점은 표적 테스트로 재현됐다.

## 정상·장애·복구 결론표

| 상황 | 발행 자체 | code 조회/저장 시점 | 최종 `source_warehouse_code` | 배차 조회 | 판정 |
|---|---|---|---|---|---|
| 정상 inventory | 원 전표 commit 후 응답 | commit 뒤 같은 요청 스레드에서 1회 조회, 기본 `REQUIRED`로 저장 시도 | `null` (PostgreSQL RED) | `UNKNOWN` | **정상도 붙지 않음** |
| inventory 장애 | 원 전표 commit 유지, 예외 흡수 | commit 뒤 1회 호출 후 warn·종료 | `null` | `UNKNOWN` | 발행 독립성은 있으나 응답은 timeout 영향 |
| inventory 복구 | 새 사용자 조작 없음 | 재시도/scheduler/queue/null-row sweep 없음 | 계속 `null` | 계속 `UNKNOWN` | **영구 미수렴** |

## 최종 판정

- 이 각도에서 도달 가능한 결함: **3건** (`BLOCKER` 2, 응답 지연 1).
- 질문의 답은 **“발행과 조회를 분리한 뒤 결국 code가 붙지 않는다”**이다.
- 현재 선택은 의도적으로 기록된 정책이 아니라 (1) 별도 commit 누락과 (2) 복구 경로 부재가 결합된 영구 `UNKNOWN`이다.
- 비동기 구현이 아니며, rollback 전표에 실행되는 문제는 없다.

## 신규 파일

- `docs/dev-reports/2026-08-03-1039-r9-reconvergence.md`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/it/WarehouseCodeSnapshotServiceIT.java`

## 최종 재검증

```text
> .\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.it.WarehouseCodeSnapshotServiceIT.afterCommit_inventorySuccess_persistsSourceWarehouseCode" --no-daemon

WarehouseCodeSnapshotServiceIT > afterCommit_inventorySuccess_persistsSourceWarehouseCode() FAILED
    org.opentest4j.AssertionFailedError at WarehouseCodeSnapshotServiceIT.java:58
1 test completed, 1 failed
BUILD FAILED in 36s
```

```text
> .\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.it.WarehouseCodeSnapshotServiceIT.afterCommit_inventoryCall_blocksPublishingThreadUntilItReturns" --tests "com.samhanair.logis.slip.service.WarehouseCodeSnapshotServiceTest" --no-daemon

> Task :services:slip-service:test
BUILD SUCCESSFUL in 37s
18 actionable tasks: 1 executed, 17 up-to-date
```

- 정상 저장 RED는 재현 유지.
- 요청 스레드 blocking 1건 + 장애 흡수 5건은 GREEN.
- `slip-service` 전체 스위트는 지시대로 실행하지 않았다.

최종 작업트리:

```text
?? docs/dev-reports/2026-08-03-1039-r9-reconvergence.md
?? services/slip-service/src/test/java/com/samhanair/logis/slip/it/WarehouseCodeSnapshotServiceIT.java
f42dc5619 [FIX] #1039 전표 발행을 inventory 가용성에서 분리
```

- git commit/push/checkout/branch/stash/reset은 실행하지 않았다.
- 공유 DB write/DDL과 Docker 이미지 재빌드는 실행하지 않았다. 테스트는 격리된 Testcontainers PostgreSQL만 사용했다.
