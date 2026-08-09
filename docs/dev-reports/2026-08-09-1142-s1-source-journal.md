# #1142 1단 — 정방향 재고 source journal

## 결론

`inventory-service`의 정방향 재고 API 4개에 호출 단위 source journal을 추가했다. 역연산 API는 추가하지 않았다. 기존 응답·재고 상태 전이·기존 movement 부작용은 유지하고 journal 행만 추가한다.

## 스키마와 서비스 근거

재고 lot, balance, movement, serial instance가 모두 `inventory-service` DB에 있고 네 API의 서비스 메서드가 이미 `@Transactional`이다. 따라서 journal도 같은 서비스의 `source_operation_journals` 테이블과 JPA repository로 두었다. `SourceOperationJournalWriter`는 별도 트랜잭션을 열지 않으며 호출 서비스의 현재 트랜잭션을 그대로 사용한다.

컬럼은 다음과 같다.

| 컬럼 | 의미 |
|---|---|
| `source_operation_id` | 호출별 UUID. 입력이 없으면 inventory가 생성하며 DB unique |
| `slip_id`, `slip_revision` | 호출을 일으킨 전표와 판. 기존 호출 호환을 위해 nullable |
| `product_snapshot` | `goods`, `productType`, `serialManaged`, `productCode` JSONB |
| `outcome` | `APPLIED`, `NO_OP_EXISTING`, `NO_OP_EXCLUDED` |
| `created_lot_ids` | 해당 호출이 새로 만든 lot UUID 문자열 JSON 배열 |
| `created_instance_ids` | 해당 호출이 새로 만든 instance UUID 문자열 JSON 배열 |

라인마다 journal을 쓰지 않고 호출당 한 행에 생성 집합을 벌크 JSON 배열로 저장한다.

## 적용 지점

| API | 적용 파일:줄 | 기록 결과 |
|---|---|---|
| `POST /inventory/lots/inbound` | `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockService.java:188-224` | 신규 lot `APPLIED` + 새 lot ID; 기존 lot `NO_OP_EXISTING`; 제외 품목 `NO_OP_EXCLUDED` |
| `POST /inventory/deduct` | `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockService.java:336-374` | 차감 성공 `APPLIED`; 재고 제외 품목 `NO_OP_EXCLUDED`; 생성 집합은 빈 배열 |
| `POST /inventory/instances/batch` | `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:109-151` | `saveAll` 반환값 중 신규 행 ID만 `APPLIED`; 목표 수량 충족 `NO_OP_EXISTING`; 제외 품목 `NO_OP_EXCLUDED` |
| `POST /inventory/instances/ship-batch` | `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:209-231` | RESERVED 전이 있음 `APPLIED`; 대상 없음 `NO_OP_EXISTING`; 생성 집합은 빈 배열 |

HTTP 요청에는 선택적 `sourceContext(sourceOperationId, slipId, slipRevision)`를 추가했다. 기존 호출 payload도 유효하며, context가 없으면 호출별 UUID를 생성한다.

## 불변식 검증 원문

### RED-A / RED-B 동시 GREEN

`SourceOperationJournalRollbackIT.journal_commit_and_rollback_share_the_same_transaction` 실행 원문:

```text
./gradlew :services:inventory-service:test --tests '*SourceOperationJournalRollbackIT' --rerun-tasks
BUILD SUCCESSFUL in 37s
```

이 테스트는 동일 `TransactionTemplate` 안에서 writer가 저장한 행이 commit 후 1건임을 확인하고, writer 저장 뒤 예외를 던진 transaction은 rollback 후 해당 `sourceOperationId`가 0건임을 확인한다. 따라서 RED-A의 commit 기록과 RED-B의 rollback 미생성이 동시에 GREEN이다.

정방향 서비스 단위 테스트에서 입고/차감/serial batch 경로의 writer 호출도 검증했다. 기존 API 응답과 상태 전이 테스트는 변경 없이 통과했다.

### 생성 집합 구분 근거

- lot 입고는 `stockLotRepository.save(...)`가 반환한 **새 lot 하나**만 기록한다. 중복 기존 lot 반환 분기에서는 빈 배열이다.
- serial batch 입고는 `repo.saveAll(toCreate)`의 반환 목록만 ID로 변환한다. 기존 `existing` 목록은 결과 응답에는 합쳐도 journal 생성 집합에는 넣지 않는다.
- deduct는 기존 lot을 갱신할 뿐 새 lot을 만들지 않으므로 빈 배열이다.
- ship-batch는 기존 instance 상태만 `RESERVED → SHIPPED`로 바꾸므로 빈 배열이다.

### 정방향 동작 보존

`sourceJournalWriter.record(...)`는 각 기존 성공 반환 직전에만 추가되었다. 응답 DTO 생성, 기존 `StockLot`/`StockBalance`/`StockMovement` 변경, instance 상태 전이는 그대로다. 오류가 mutation 중간 또는 직전에 발생하면 기존처럼 예외가 전파되고 journal도 저장되지 않는다.

## 성능 / 쓰기 증폭

호출당 journal 쓰기 수는 정확히 1회다. 생성 집합을 line별 행으로 저장하지 않는다.

| API | 기존 핵심 쓰기 | 추가 journal | line 수 N일 때 journal 행 증폭 |
|---|---:|---:|---:|
| deduct | balance 1 + movement N | 1 | 기존 movement N에 비해 1행 |
| lots/inbound | lot 1 + balance 1 + movement 1 | 1 | 1행 |
| instances/batch | instance `saveAll` N행 | 1 | 1행 |
| ship-batch | instance 상태 update N행 | 1 | 1행 |

즉 source 기록 자체는 모든 정상/NO_OP 호출에 1행이고, 생성 ID는 JSONB 배열 1개로 묶인다. API 네 개를 한 번씩 호출하면 journal 추가 쓰기는 4행이며, N개 생성 때문에 N개의 journal 행이 생기지 않는다.

## migration 충돌 확인 원문

원격 branch 전수(`origin/*`)에 대해 다음 명령을 실행했다.

```powershell
$branches = git for-each-ref refs/remotes/origin --format='%(refname:short)'
foreach ($b in $branches) {
  git ls-tree -r --name-only $b |
    Select-String 'services/inventory-service/src/main/resources/db/migration/V[0-9]+.*\.sql$'
}
```

inventory migration 최대 버전은 다음과 같이 모든 최신 원격 branch에서 V23이었다.

```text
origin/main       V23__stock_balances_warehouse_active_index.sql
origin/fix/978-sync-cache-rollback       V23__stock_balances_warehouse_active_index.sql
origin/fix/1141-autoconfirm-suffix-selection       V23__stock_balances_warehouse_active_index.sql
origin/feat/1123-closed-date-guard       V23__stock_balances_warehouse_active_index.sql
```

따라서 신규 migration은 `services/inventory-service/src/main/resources/db/migration/V24__create_source_operation_journals.sql`로 정했다. 실 DB에는 적용하지 않았다.

## 신규 파일 경로

- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/domain/SourceOperationJournal.java`
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/domain/SourceOperationOutcome.java`
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/SourceOperationJournalRepository.java`
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/SourceOperationJournalWriter.java`
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/SourceOperationContext.java`
- `services/inventory-service/src/main/resources/db/migration/V24__create_source_operation_journals.sql`
- `services/inventory-service/src/test/java/com/samhanair/logis/inventory/domain/SourceOperationJournalContractTest.java`
- `services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/SourceOperationJournalRollbackIT.java`

## 검증

```text
./gradlew :services:inventory-service:test --rerun-tasks
BUILD SUCCESSFUL in 1m 54s
```

추가로 rollback 통합 테스트도 별도 실행해 `BUILD SUCCESSFUL`을 확인했다. 커밋·푸시·Docker 재배포·실 DB 변경은 수행하지 않았다.
