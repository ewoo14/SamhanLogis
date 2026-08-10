# 이슈 #1142 범위 B — 재고 역연산 4종 선행조건 조사

> 조사일: 2026-08-08 (Asia/Seoul)  
> 조사 방식: 코드·마이그레이션 전수 검색, 실행 중 로컬 Docker PostgreSQL에 `BEGIN READ ONLY` + `SELECT`만 실행  
> 금지사항 준수: 코드 수정·git 명령·DB 쓰기·전표 상태변경·Docker 재기동/재배포 없음

## 0. 결론

네 API 모두 `slip-service`가 `inventory-service`에 동기 REST로 요청하는 계약이다. 네 작업을 원래 상태로 정확히 되돌리는 공개 API는 현재 없다.

- `deduct`: `adjust(+수량)`으로 balance 숫자만 늘릴 수는 있으나 원래 FIFO lot별 잔량·상태와 예약분을 복원하지 않으므로 역연산이 아니다.
- `instances/ship-batch`: `release-batch`는 `RESERVED → AVAILABLE`만 받는다. 이미 `SHIPPED`인 행을 `RESERVED`로 돌리는 API/도메인 메서드는 없다.
- `lots/inbound`: 같은 `lotNo` 재호출의 중복 방지는 있으나 생성된 lot·balance·movement를 취소하는 API는 없다.
- `instances/batch`: 동일 전표·품목 목표 수량으로 수렴시키는 생성 멱등성은 있으나 생성 인스턴스를 제거/비활성화하는 API는 없다.

따라서 범위 B는 단순 전표 상태 전이만으로 착수할 수 없다. 최소한 네 역연산의 계약, 멱등 키, 동시성 잠금, 부분 실패 복구 및 성공/실패 감사 정책에 대한 개발책임자 결정이 선행되어야 한다.

기존 `CompensationAuditWriter` 계열은 **원격 보상 실패 기록·일부 재시도**에는 재사용 가능하지만, 네 역연산 자체나 계획된 사용자 되돌림의 성공 감사·오케스트레이션을 제공하지 않는다.

## 1. 조사 전제와 누락 자료

요청에서 먼저 읽으라고 지정한 다음 두 파일은 현재 작업 디렉터리의 `rg --files` 전수 검색에서 발견되지 않았다.

- `docs/dev-reports/2026-08-08-1142-scope-b-boundary.md`
- `docs/dev-reports/2026-08-08-1142-slip-revert-feasibility.md`

따라서 이 보고서는 요청문에 인용된 선행 결론을 전제로 삼고, 저장소 현재 코드와 실행 중 DB를 독립적으로 확인했다. 두 선행 보고서의 세부 근거와 본 보고서의 결론이 완전히 일치하는지는 **모른다**.

## 2. 호출 경계

`InventoryClient`는 자신을 “`inventory-service`의 mutation 엔드포인트” 클라이언트라고 명시한다.

> `services/slip-service/src/main/java/com/samhanair/logis/slip/client/InventoryClient.java:19-22`  
> `Internal-token-authenticated client to inventory-service 의 mutation 엔드포인트 ...`

베이스 URL은 `http://inventory-service`이고(`InventoryClient.java:53-62`), 공통 POST는 내부 토큰·시스템 호출자 헤더를 싣는다(`InventoryClient.java:287-306`). 4xx는 `CONFLICT`, 5xx/연결 실패는 `INTERNAL_ERROR`로 바뀐다(`InventoryClient.java:297-312`). 즉, slip DB 트랜잭션과 inventory DB 트랜잭션은 하나의 원자적 트랜잭션이 아니다.

`SlipService.complete()`는 먼저 전표를 `PROCESSING → INSPECTING`으로 바꾼 뒤(`SlipService.java:1098-1112`), 같은 메서드에서 네 재고 호출을 순차 실행한다(`SlipService.java:1112-1162`). 이 구간에는 OUTBOUND 전체나 일반 INBOUND 전체를 감싸는 보상 목록이 없다.

## 3. API 4개 × 5질문 표

| API | ① 현재 무엇을 하는가 — 입력·출력·부수 효과 | ② 소관 서비스·계약 | ③ 역연산이 정말 없는가 | ④ 역연산 신설 시 필요한 것 — 선택지와 대가 | ⑤ 기존 compensation 재사용 가능성 |
|---|---|---|---|---|---|
| `POST /inventory/deduct` | 입력은 `productId`, `warehouseId`, 양수 `quantity`, `fromReservation`, `referenceType`, `referenceId`, `note`이다. 원문: `DeductRequest.java:12-19`. 응답은 요청/차감량, 변경 후 available/reserved/total, `affectedLots(lotId, amount)`이다. 원문: `DeductionResponse.java:7-19`. 서비스는 가용 lot 합을 사전검사하고(`StockService.java:336-345`), FIFO로 각 lot를 차감·0이면 SOLD_OUT 전이하며(`StockService.java:348-360`, `StockLot.java:141-153`), balance의 available 또는 reserved 및 total을 감소시키고(`StockService.java:363-368`, `StockBalance.java:123-148`), lot마다 `DEDUCT` movement를 음수로 기록한다(`StockService.java:357-360`). 클래스 전체가 `@Transactional`이다(`StockService.java:53-55`). | `inventory-service` 소관. 공개 컨트롤러 계약은 `StockController.java:250-266`; 권한은 `inventory.list UPDATE`. `slip-service`는 `complete()`의 비시리얼 OUTBOUND 라인마다 `fromReservation=true`, `referenceType=SLIP`, `referenceId=slip.id`로 호출한다(`SlipService.java:1123-1125`; 클라이언트 직렬화는 `InventoryClient.java:97-114`). | **없음.** inventory mutation endpoint 전체는 inbound/reserve/release/deduct/adjust와 instance 상태전이뿐이다(`StockController.java:200-280`, `StockInstanceController.java:35-42`). `adjust(+delta)`는 balance만 바꾸고 affected lot은 빈 목록이며 `ADJUST` movement만 남긴다(`StockService.java:371-402`); 원래 lot별 차감·SOLD_OUT 상태 및 `fromReservation=true`의 reserved 복원은 하지 않는다. `release`는 아직 존재하는 예약을 available로 옮길 뿐 이미 total에서 차감된 재고를 복원하지 않는다(`StockService.java:273-313`). 코드 전수 검색한 `undeduct`, `reverse/restore/rollback/revert deduct`, `unship`, `cancel/reverse/rollback inbound`, lot/instance delete/remove 계열은 0건이었다. | **멱등성:** 원 `DEDUCT` movement를 식별해 “이 movement가 이미 역분개됐는가”를 유일키로 막는 선택지, 또는 별도 reversal idempotency key가 필요하다. 현재 유니크 인덱스는 `RESERVE`에만 적용된다(`V14...sql:1-9`). **부분 실패:** 원 응답의 `affectedLots`별 복원과 balance 복원이 한 inventory 트랜잭션이어야 한다. 여러 전표 라인은 (a) inventory bulk endpoint 한 트랜잭션 또는 (b) slip 쪽 지속성 있는 saga/step journal이 선택지다. (a)는 결합·요청 크기, (b)는 중간상태·재시도 복잡성이 대가다. **동시성:** `StockBalance`만 `@Version`이 있고(`StockBalance.java:53-55`), FIFO lot 조회는 잠금 없는 native SELECT다(`StockLotRepository.java:19-39`); 원 lot·balance·reversal key를 같은 순서로 잠가야 한다. 이미 다른 출고가 복원 대상 lot를 썼다면 fail-loud 또는 재배분 정책 결정이 필요하다. **감사:** 기존 `DEDUCT`를 삭제하면 안 되며 원 movement를 참조하는 양수 reversal movement와 행위자·사유·되돌림 작업 ID를 남기는 선택지가 필요하다. 단순 `ADJUST`는 원 출고와 연결되지 않는다. | 실패 기록기·알림·metrics는 확장 가능하다. 그러나 `CompensationOperation`에는 `RELEASE`, `RELEASE_INSTANCES`, `UNRECALL_INSTANCES`만 있다(`CompensationOperation.java:6-12`). 자동 재시도는 수량형에 필요한 식별자가 감사 행에 없어 지원하지 않는다고 코드가 명시한다(`CompensationRetryExecutor.java:59-68`). productId/warehouseId/quantity/affectedLots를 저장하는 payload 확장 없이는 deduct inverse 재시도에 쓸 수 없다. |
| `POST /inventory/instances/ship-batch` | 입력은 `outboundSlipNo`, `productCode`, 선택 `partnerCode`, 선택 `outboundAt`이다(`ShipBatchInstanceRequest.java:9-22`). `RESERVED` 인스턴스를 찾아 각각 `SHIPPED`로 바꾸고 거래처·출고전표·출고시각을 기록한다(`StockInstanceService.java:183-207`, `StockInstance.java:149-168`). 출력은 해당 전표·품목의 `SHIPPED` 인스턴스 목록이며, DTO는 id/product/warehouse/status와 입출고 마커를 포함한다(`StockInstanceResponse.java:15-45,53-69`). 별도 `StockMovement`는 기록하지 않고 JPA BaseEntity 수정 감사필드만 갱신될 수 있다(`BaseEntity.java:14-34`). | `inventory-service` 소관. 컨트롤러·권한은 `StockInstanceController.java:142-163`, `inventory.stock-balance UPDATE`. `slip-service`는 시리얼 OUTBOUND 품목 그룹마다 호출한다(`SlipService.java:1113-1121`, `InventoryClient.java:199-220`). | **없음.** `release-batch`는 `RESERVED`만 조회한 뒤 `release()`를 호출한다(`StockInstanceService.java:209-227`); `release()` 자체도 `RESERVED → AVAILABLE`만 허용한다(`StockInstance.java:251-260`). `unrecall`은 `RECALLED → SHIPPED`, `resell`은 `RECALLED → AVAILABLE`이라 SHIPPED 출고 취소가 아니다(`StockInstance.java:194-225`). `ship()`의 반대인 `SHIPPED → RESERVED` 메서드와 `/unship-batch` endpoint는 전수 검색 결과 없다. | **멱등성:** `(outboundSlipNo, product/productCode, inverse operation)`을 키로 이미 `SHIPPED → RESERVED`된 경우 no-op이어야 한다. Scope B가 이어서 accept도 취소한다면 마커를 유지한 `RESERVED` 복원 후 기존 `release-batch`를 호출해야 한다. 한 번에 `SHIPPED → AVAILABLE`로 갈지 두 단계로 갈지는 감사 의미와 중간 재시도 방식이 달라진다. **부분 실패:** 한 품목 그룹의 인스턴스 전이는 inventory 단일 트랜잭션으로 묶고, 여러 품목 그룹은 bulk 또는 saga 중 선택해야 한다. **동시성:** 현재 `shipBatch` 조회는 row lock이 없다(`StockInstanceService.java:192-206`); `StockInstance`에도 `@Version`이 없다. `unrecall`의 `PESSIMISTIC_WRITE` 선례(`StockInstanceRepository.java:244-260`)처럼 대상 SHIPPED 행을 잠그는 선택지가 있다. 회수/재판매가 먼저 일어났다면 상태가 SHIPPED가 아니므로 무음 no-op가 아니라 충돌 정책이 필요하다. **감사:** instance 상태 변경 전용 business movement가 없으므로 원/새 상태, slipNo, productCode, instance 수, 행위자·사유를 별도 기록할지 결정해야 한다. BaseEntity만으로는 왜 되돌렸는지 알 수 없다. | 기존 패턴의 `releaseInstances`는 accept 중 실패 보상일 뿐 출고 완료 취소가 아니다(`SlipService.java:913-939`). writer/alert/retry 골격은 재사용 가능하지만 새 operation/phase와 unship 계약이 필요하다. 현재 retry가 다루는 것은 `RELEASE_INSTANCES`, `UNRECALL_INSTANCES`뿐이다(`CompensationRetryExecutor.java:59-79`). |
| `POST /inventory/lots/inbound` | 입력은 `productId`, `warehouseId`, `lotNo`, 선택 `inboundLineId`, 양수 `quantity`, `receivedAt`, `unitCost`, `note`이다(`InboundRequest.java:11-25`). 새 `StockLot`을 만들고, balance available/total을 가산하며, `INBOUND` movement를 기록한다(`StockService.java:174-219`). 출력은 lot의 id/product/warehouse/lotNo/current·initial quantity/원가/상태 등이다(`StockLotResponse.java:9-39`). 동일 lotNo(+lineId) 기존 lot가 있으면 기존 lot를 반환한다(`StockService.java:194-204`); 저장된 전표 라인은 line UUID를 전달한다(`SlipService.java:1174-1182`). | `inventory-service` 소관. 컨트롤러·권한은 `StockController.java:200-220`, `inventory.stock-balance CREATE`. `slip-service` 일반 INBOUND와 반품/회차 batch 품목이 호출한다(`SlipService.java:1144-1161,1190-1219`; 클라이언트 계약 `InventoryClient.java:116-149`). | **없음.** 코드 스스로 “remote batch inbound는 현재 inverse API가 없음”이라고 명시한다(`SlipService.java:1212-1213`). `adjust(-delta)`는 balance만 줄이고 lot을 제거·감량하지 않는다(`StockService.java:371-402`). `StockLot`의 `adjustQuantity`는 도메인 메서드지만 공개 취소 서비스/endpoint가 아니며, 원 입고 movement 역분개도 함께 하지 않는다(`StockLot.java:171-180`). lot delete/cancel inbound endpoint는 전수 검색 결과 없다. | **멱등성:** 원 생성키 `(productId, warehouseId, lotNo, inboundLineId)` 또는 원 lot ID + reversal operation 유일키가 필요하다. 현재 V22 유니크 인덱스는 저장된 전표 라인의 **생성 중복**만 막는다(`V22...sql:1-11`). legacy `inboundLineId=null` 호출은 그 유니크키 보호 밖이다. **부분 실패:** lot 비활성화/감량, balance 차감, 음수 reversal movement를 하나의 inventory 트랜잭션으로 처리해야 한다. **동시성:** 원 lot가 이후 FIFO 출고에 사용됐다면 `quantity != initialQuantity` 또는 SOLD_OUT일 수 있다. (a) 후속 출고를 먼저 역순 취소하고 그때만 입고 취소, (b) 다른 lot로 재배분, (c) 수동 조정으로 전환 중 선택이 필요하다. (b)/(c)는 원가·FIFO 추적 손실이 대가다. lot에는 `@Version`이 없고 FIFO 조회도 lock이 없으므로 lot와 balance에 명시 잠금이 필요하다. **감사:** soft-delete만으로는 balance/movement 근거가 부족하다. 원 `INBOUND`를 참조하는 reversal movement, 취소 사유·행위자·작업 ID가 필요하다. | 기존 `completeRecallInbound`는 serial 회수 성공분만 `unrecall`로 보상하고 batch inbound 자체는 보상하지 못한다(`SlipService.java:1197-1222`). writer를 실패 기록에 재사용할 수 있으나, 현재 감사 행에는 lotId/productId/warehouseId/quantity/inboundLineId가 없어 자동 재시도 불가다(`SerialCompensationFailure.java:40-75`; `CompensationRetryExecutor.java:63-67`). |
| `POST /inventory/instances/batch` | 입력은 `productId`, `productCode`, `warehouseId`, 목표 `quantity`, `inboundType`, `inboundSlipNo`, `unitCost`, `receivedAt`이다(`BatchInboundInstanceRequest.java:16-44`). `(inboundSlipNo, productId)` 키 advisory lock 후 기존 수를 세고 목표수량 부족분만 `AVAILABLE` 인스턴스로 만든다(`StockInstanceService.java:87-137,418-445`). 출력은 기존+신규 `StockInstanceResponse` 목록이다(`StockInstanceController.java:85-114`). `stock_balance`, lot, movement는 변경하지 않는다. | `inventory-service` 소관. 컨트롤러·권한은 `StockInstanceController.java:85-114`, `inventory.stock-balance CREATE`. `slip-service`는 일반 INBOUND 시리얼 품목 그룹마다 호출한다(`SlipService.java:1147-1159`; `InventoryClient.java:151-178`). | **없음.** 생성 멱등성은 있으나 삭제/soft-delete/입고취소 endpoint가 없다. V16 인덱스는 명시적으로 UNIQUE가 아닌 조회용이다(`V16...sql:1-6`). `release-batch`는 출고 예약 인스턴스만 다루고, `resell-batch`는 회수품을 AVAILABLE로 바꾸므로 생성 취소가 아니다. instance delete/remove/cancel inbound 계열은 전수 검색 결과 없다. | **멱등성:** `(inboundSlipNo, productId, inverse operation)`을 키로 두 번째 취소를 no-op 처리해야 한다. **부분 실패:** 대상 N개 soft-delete/취소 상태 전이와 성공 감사가 한 inventory 트랜잭션이어야 한다. **동시성:** 대상이 모두 `AVAILABLE`이고 아직 같은 inbound marker를 가질 때만 취소할지 결정해야 한다. 하나라도 RESERVED/SHIPPED/RECALLED이면 (a) 전부 충돌, (b) 가능한 것만 부분취소, (c) 후속 전이를 역순 취소 후 재시도 선택지가 있다. (b)는 전표 수량과 실재고가 갈라지는 대가가 크다. 현재 생성은 advisory lock이 있으나 역연산용 row lock은 없다; `unrecall`의 `PESSIMISTIC_WRITE` 패턴을 재사용할 수 있다. **감사:** soft-delete audit 7필드는 남지만 “어느 범위 B 작업이 왜 취소했는가”와 취소 수량을 별도 operation audit에 남길지 결정해야 한다. | writer/재시도 executor의 구조는 재사용 가능하지만 새 `REMOVE/VOID_INBOUND_INSTANCES` operation과 payload가 필요하다. 현재 failure row는 productCode/slipNo까지만 저장하고 instance ID 집합이나 productId/warehouse를 저장하지 않는다(`SerialCompensationFailure.java:40-75`). |

## 4. “다른 이름의 역연산” 전수 확인

### 4.1 전수 범위

- `services/inventory-service/src/main`과 `services/slip-service/src/main`의 모든 Java mutation controller/service/domain/repository
- inventory Flyway 전체
- 저장소 전체에서 대소문자 무시 검색: `unship`, `undeduct`, `un-deduct`, `reverse|restore|rollback|revert + deduct`, `cancel|reverse|rollback + inbound`, `delete|remove + lot|instance`
- inventory controller의 모든 `Post/Put/Patch/DeleteMapping`

직접 역연산 이름 검색은 0건이었다. 발견된 유사 기능의 판정은 다음과 같다.

| 유사 기능 | 실제 동작 | 네 역연산 대체 여부 |
|---|---|---|
| `/inventory/release` | reserved → available; total 불변 (`StockBalance.java:106-121`) | deduct 이후 total·lot 복원 불가 — 아니오 |
| `/inventory/adjust` | balance만 delta 조정, ADJUST movement, affectedLots 없음 (`StockService.java:371-402`) | lot·예약·원 참조 복원 불가 — 아니오 |
| `/instances/release-batch` | RESERVED → AVAILABLE (`StockInstanceService.java:209-227`) | SHIPPED를 받지 않음 — 아니오 |
| `/instances/unrecall-batch` | RECALLED → SHIPPED (`StockInstance.java:194-206`) | 출고 취소가 아니라 회수 취소 — 아니오 |
| `/instances/resell-batch` | RECALLED → AVAILABLE, 출고/회수 마커 제거 (`StockInstance.java:208-225`) | SHIPPED 직접 취소가 아니며 FIFO 시각도 now로 바꿈 — 아니오 |
| `StockLot.adjustQuantity` | 한 lot의 절대 잔량 변경 (`StockLot.java:171-180`) | 공개 계약·balance·movement 동기화가 없음 — 아니오 |

## 5. 기존 보상 기제

### 5.1 현재 패턴

1. slip 원격 호출을 순차 수행하면서 성공한 작업의 반대 작업을 메모리 `List<Compensation>`에 쌓는다(`SlipService.java:913-936,1197-1209`).
2. 후속 호출이 실패하면 성공 목록을 역순 실행한다(`SlipService.java:1225-1242`).
3. 보상 자체가 실패하면 원 예외에 suppressed로 붙이고, `CompensationAuditWriter.record()`를 호출한다(`SlipService.java:1230-1239`).
4. writer는 `REQUIRES_NEW`로 slip 원 트랜잭션 롤백과 무관하게 failure row를 저장하고 WARN·metrics·best-effort 알림을 남긴다(`CompensationAuditWriter.java:18-23,46-77,79-90`).
5. 재시도 executor는 감사 행을 `PESSIMISTIC_WRITE`로 잠그고 건별 `REQUIRES_NEW`에서 처리한다(`CompensationRetryExecutor.java:14-24,47-57`). 현재 자동 재시도 가능 작업은 `RELEASE_INSTANCES`, `UNRECALL_INSTANCES`뿐이다(`:59-79`).

테스트는 (a) accept 두 번째 예약 실패 후 첫 serial release도 실패하면 원 예외 유지 + suppressed + 감사 1회, (b) 보상 성공이면 감사 0회, (c) 회수 serial 성공 뒤 batch inbound 실패 + unrecall 실패 시 감사 1회를 검증한다(`SlipServiceCompensationTest.java:90-173`).

### 5.2 재사용 판정

| 구성요소 | 재사용 | 한계/필요 변경 |
|---|---|---|
| 역순 compensation 실행 패턴 | 조건부 가능 | 현재 메모리 목록이라 프로세스 종료 후 재개 불가. 사용자 요청 범위 B는 장시간·다서비스 작업일 수 있어 durable step 상태가 없으면 부족하다. |
| `CompensationAuditWriter` | 실패 기록에 가능 | 이름/테이블이 serial failure 중심이고, 성공한 계획 되돌림 감사가 아니다. 새 phase/operation 및 원격 payload가 필요하다. |
| `CompensationRetryExecutor` | instance 계열 골격 가능 | deduct/lot/instance inbound 역연산 식별자를 저장하지 않아 현재 그대로는 불가. 코드도 수량형 자동 재시도 불가를 명시한다. |
| alert/metrics | 가능 | 새 operation/phase label cardinality와 운영 알림 문구 확장 필요. |

핵심은 **“계획된 되돌림의 업무 감사”**와 **“되돌림 도중 실패한 보상 감사”**를 구분하는 것이다. 기존 writer는 후자다. 전자를 같은 테이블에 확장할지 별도 revert operation journal로 둘지는 개발책임자 결정 사항이다.

## 6. 실 데이터 되돌림 대상 건수

### 6.1 집계 기준

`SlipStatus`의 정상 진행 순서는 `PROCESSING → INSPECTING → COMPLETED`이며(`SlipStatus.java:6-13`), 이후 상태는 OUTBOUND의 `SHIPPING`, `DELIVERED`, 양 유형의 `CONFIRMED`다(`SlipStatus.java:17-29`). 따라서 다음 활성 상태를 **INSPECTING 포함 이후**로 집계했다.

```sql
WHERE is_deleted = false
  AND status IN ('INSPECTING','COMPLETED','SHIPPING','DELIVERED','CONFIRMED')
```

`REJECTED`, `CANCELED`는 정상 “이후” 상태 집합에 포함하지 않았다. 실행 중 `samhan-postgres`의 `slip_db`에서 `BEGIN READ ONLY ... ROLLBACK`으로 조회했다.

### 6.2 종류별 결과

| 상태 | INBOUND | OUTBOUND | 합계 |
|---|---:|---:|---:|
| INSPECTING | 2 | 7 | 9 |
| COMPLETED | 17 | 10 | 27 |
| SHIPPING | 0 | 5 | 5 |
| DELIVERED | 0 | 10 | 10 |
| CONFIRMED | 1 | 8 | 9 |
| **합계** | **20** | **40** | **60** |

이 60건은 상태 기준 최대 후보 수다. 각 전표가 실제로 네 API 중 어느 것을 사용했는지는 당시 품목의 `serialManaged` 값, 전표 라인, 중복방지 조기반환 및 과거 호출 성공 여부를 함께 봐야 한다. 상태만으로 API별 실제 mutation 건수를 확정할 수 없으므로 그 수는 **모른다**.

## 7. 재고 정합성 검증 수단

### 7.1 이미 있는 것

- 잔량 조회: `GET /inventory/balances` (`StockController.java:80-90`)
- lot 조회: `GET /inventory/lots` (`StockController.java:122-157`)
- movement 조회: `GET /inventory/movements` (`StockController.java:159-195`)
- 시리얼 인스턴스 품목·상태 조회: `GET /inventory/instances?productId=&status=` (`StockInstanceController.java:292-309`)
- 재고 실사: 시스템 snapshot과 실수량을 비교하고 차이를 `ADJUST` + 회계분개로 반영 (`InventoryAuditController.java:108-187`, `InventoryAuditService.java:220-270`)
- DPS 비교: 출고전표와 업로드 엑셀의 수량/거래처 mismatch를 반환하는 조회성 비교 (`DpsCompareController.java:55-80`, `DpsCompareService.java:76-113`)

### 7.2 없는 것

코드 전수 검색에서 “특정 전표의 네 inventory mutation이 정확히 적용/역적용됐는지”를 한 번에 판정하는 invariant/reconciliation endpoint 또는 검증 서비스는 찾지 못했다. 따라서 전용 자동 검증 수단은 **없다고 판정**한다.

실 DB 읽기 전용 점검 결과:

- `stock_balances.available_qty + reserved_qty = total_qty` 위반: **0건**
- 활성 `stock_balances.total_qty`와 활성 `stock_lots.quantity` 그룹합 불일치: **200건**

두 번째 결과 때문에 전역 `balance = lot 합`만을 성공 조건으로 사용할 수 없다. seeded/legacy/경로별 데이터 원인을 이번 조사에서는 확정하지 않았으며 **모른다**. 되돌림 전후의 **대상 전표 단위 baseline·delta**를 비교해야 한다.

### 7.3 되돌림 후 권장 검증 항목 — 설계 확정이 아닌 측정 체크리스트

| 원 작업 | 전표별 검증 |
|---|---|
| deduct inverse | 원 `reference_type='SLIP' AND reference_id=slip.id AND movement_type='DEDUCT'`의 lotId·수량과 reversal 기록 1:1 대응; 해당 lot 잔량/상태가 정책상 목표값인지; balance total 및 reserved/available delta가 정확한지; 같은 reversal key가 1건뿐인지 |
| ship-batch inverse | `(outbound_slip_no, product)` 대상이 목표 상태(RESERVED 또는 최종 AVAILABLE)로 정확히 N개인지; partner/outboundAt 마커 유지/삭제가 선택 정책과 일치하는지; SHIPPED/RECALLED 잔존이 없는지 |
| lots/inbound inverse | `(lot_no=slipNo, inbound_line_id=line.id)` 원 lot가 취소 상태/soft-delete인지; 원 수량만큼 balance가 감소했는지; 원 INBOUND와 reversal movement가 연결되는지; 이후 소비가 있었던 lot은 충돌로 격리됐는지 |
| instances/batch inverse | `(inbound_slip_no=slipNo, product_id)` 대상 N개가 취소/soft-delete됐는지; RESERVED/SHIPPED/RECALLED 대상이 무음으로 남지 않았는지; 두 번째 inverse가 추가 변화 없이 no-op인지 |

재고 실사는 최종 물리수량 검증 수단으로 쓸 수 있지만, 차이가 있으면 `ADJUST`와 회계분개를 실제 발생시키므로 이번 읽기 전용 조사나 자동 역연산 검증 호출로 실행해서는 안 된다.

## 8. 별도 트랙과 함께 갈 때의 차이

| 판단축 | 4개 역연산을 별도 선행 트랙으로 분리 | 이슈 #1142 범위 B와 함께 진행 |
|---|---|---|
| 경계 | inventory-service 계약·잠금·감사·IT를 독립 확정한 뒤 slip revert가 소비 | slip 상태·회계·재고 saga를 한 설계에서 동시에 확정 |
| 장점 | blast radius와 리뷰 범위가 작고, 네 API를 다른 호출자도 재사용 가능. inventory 배포 선행 및 계약 안정화 가능 | 최종 사용자 흐름과 중간상태를 한 번에 검증 가능. 임시 계약/중복 오케스트레이션 감소 |
| 대가 | #1142가 선행 트랙 완료까지 막힘. 목표 상태(SHIPPED→RESERVED인가 AVAILABLE인가) 같은 slip 의미를 inventory API가 너무 일찍 고정할 위험 | PR·배포·회귀 범위가 크다. 60건 데이터, 회계 역분개, 재고 네 경로, slip 상태가 얽혀 부분 실패 분석이 어려움 |
| 테스트 | API별 멱등·잠금·원자성 IT를 집중 가능. slip은 mock 계약 테스트 후 후속 E2E | 한 E2E에서 실제 saga 검증 가능하지만 실패 위치 조합이 폭증 |
| 운영 | inventory inverse 기능을 먼저 dark launch하고 SELECT 검증 가능 | 중간 배포 호환성을 위한 feature flag/버전 계약이 필요할 가능성이 큼 |
| 권고가 아닌 판단 포인트 | 네 역연산의 상태 의미를 slip과 독립적으로 정의할 수 있을 때 유리 | “어느 단계로 되돌리느냐”가 inventory 목표상태를 결정하므로 상태·회계 정책을 동시에 정해야 할 때 유리 |

확정해서는 안 되는 핵심 선택은 다음과 같다.

1. Scope B 최종 상태를 `SAVED`로 고정할지, 임의 이전 단계별로 inventory 목표상태를 달리할지.
2. 한 전표 일부 라인 역연산 실패 시 전체를 원 상태로 재적용할지, `REVERT_PENDING` 같은 중간상태로 두고 재시도할지.
3. 후속 소비된 lot/instance가 있으면 fail-loud할지, 연쇄 역산할지, 수동 조정으로 넘길지.
4. 성공 audit와 failure compensation audit를 같은 모델로 확장할지 분리할지.

## 9. 확정하지 못한 것

1. 지정된 선행 보고서 두 파일의 실제 내용과 위치 — 현재 workspace에 없음.
2. 60개 후보 각각이 과거 실제로 네 API 중 무엇을 성공 호출했는지 — 상태만으로 확정 불가.
3. 활성 balance와 lot 합 불일치 200건의 원인 — 이번 범위에서 데이터 계보를 추적하지 않음.
4. 후속 출고·회수·실사·조정이 적용된 후보 전표/lot/instance 수 — 별도 전표별 read-only 계보 쿼리가 필요.
5. 역연산 성공 시 회계가 요구하는 정확한 분개/세금계산서 정책 — inventory 조사 범위 밖이며 설계 결정 전 미확정.
6. SHIPPED inverse의 중간 목표가 RESERVED인지 곧바로 AVAILABLE인지 — 되돌릴 목표 단계별 정책 결정 사항.
7. legacy `inboundLineId=null` lot를 어떤 키로 유일하게 식별할지 — 현재 계약만으로 같은 품목 복수 라인의 완전한 구분을 보장하지 못함.

## 10. 신규 파일

- `docs/dev-reports/2026-08-08-1142-inventory-inverse-ops.md`

