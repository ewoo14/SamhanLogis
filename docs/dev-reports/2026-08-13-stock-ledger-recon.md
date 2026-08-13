# 재고 수불 이력 단절 정찰 보고서

- 조사일: 2026-08-13 (Asia/Seoul)
- 조사 대상: 현재 working tree와 실행 중인 `samhan-postgres`의 `inventory_db`
- 조사 방식: 소스의 재고 수량 mutation sink 역추적 + `information_schema`/`pg_catalog` + 읽기 전용 SQL 실측
- 제한: 코드 수정 없음, DB 쓰기 없음, git 쓰기 명령 없음

## 결론

재고수불부의 정본은 별도 ledger 테이블이 아니라 `public.stock_movements`이다. 화면/API의 수불부는 이 테이블에서 물리 변동 유형만 골라 누적 잔량을 계산한다. 테이블 전체는 47행이고, 수불부에 실제 포함되는 물리 변동은 `INBOUND` 8행뿐이다.

단절은 두 축이다.

1. **시리얼 재고 축이 수불 정본과 분리돼 있다.** 구매·판매전표가 serial-managed 품목을 처리하면 `stock_instances`를 생성하거나 `AVAILABLE/RESERVED/SHIPPED/RECALLED`로 전이하지만 `stock_movements`는 만들지 않는다. 실데이터에는 활성 인스턴스 21개(입고전표 연결 21개, 출고전표 연결·`SHIPPED` 15개)가 있으나, 이 인스턴스 품목 10종의 물리 movement는 0행이다. 즉 이 경로는 **재고 상태/수량은 바뀌고 수불 이력만 없다.**
2. **재고이동 축은 이력만 빠진 것이 아니라 실제 재고도 바꾸지 않는다.** 일반 `confirm()`은 상태를 `CONFIRMED`로만 바꾸며 lot/balance/instance/movement를 전혀 호출하지 않는다. 이카운트 이동 import도 전표·라인을 곧바로 `CONFIRMED` 및 출하/입고수량으로 적재할 뿐 실제 재고나 movement를 만들지 않는다. 따라서 현 소스에서 출고행·입고행은 둘 다 0개 생성된다. 다만 현재 DB에는 `REQUESTED` 3건뿐이고 확정 표본은 0건이므로, **실데이터로 확정 이동의 결과를 판정하는 것은 불가**하다.

QR 스캔 입출고는 아직 mutation 경로 자체가 없다. 현재 QR은 시리얼키 표시만 구현됐고, #999 코멘트도 스캔 입출고 미착수를 명시한다. 따라서 현재는 **수량도 바뀌지 않고 이력도 생기지 않는다.**

## 1. 표본

### 1.1 실행 안전성과 읽기 전용 확인

- 조사 시작 시 Windows 여유 물리 RAM: `23.008GB` — 중단 기준 1.0GB 이상.
- 모든 DB 조사 세션은 `BEGIN TRANSACTION READ ONLY`로 실행했다.
- DB 확인 원문: `inventory_db | samhan | transaction_read_only=on`.

### 1.2 요청 쿼리의 실제 테이블명 정정

요청문에 제시된 `stock_transfer`는 실제 DB에 없다. 실제 테이블은 복수형 `public.stock_transfers`다. `information_schema` 결과는 다음 세 개다.

```text
 table_schema |        table_name
--------------+---------------------------
 public       | stock_transfer_lines
 public       | stock_transfers
 staging      | ecount_stock_transfer_raw
(3 rows)
```

따라서 상태별 표본 쿼리는 실제 이름으로 정정해 실행했다.

```sql
begin transaction read only;
select status, count(*) from stock_transfers group by 1 order by 1;
commit;
```

출력 원문:

```text
  status   | count
-----------+-------
 REQUESTED |     3
(1 row)
```

확정 계열(`APPROVED`, `SHIPPED`, `IN_TRANSIT`, `RECEIVED`, `CONFIRMED`) 표본은 모두 0건이다. 이 때문에 이동 확정 후 결과는 실데이터 판정 불가다.

이동 라인 보조 표본:

```text
 transfer_lines | requested_qty | shipped_qty | received_qty
----------------+---------------+-------------+--------------
              4 |             4 |           0 |            0
(1 row)
```

### 1.3 이력 후보 테이블 탐색

실행 쿼리:

```sql
select table_schema, table_name
from information_schema.tables
where table_name ilike '%ledger%' or table_name ilike '%movement%'
   or table_name ilike '%transaction%' or table_name ilike '%history%'
order by 1,2;
```

출력 원문:

```text
 table_schema |      table_name
--------------+-----------------------
 public       | dps_save_history
 public       | flyway_schema_history
 public       | stock_movements
(3 rows)
```

업무상 재고수불 이력 후보는 `stock_movements` 하나다. `dps_save_history`는 DPS 비교 저장 이력이고, `flyway_schema_history`는 마이그레이션 메타데이터다.

### 1.4 `stock_movements` 행 수와 분포

```sql
select count(*) as stock_movements_rows from stock_movements;
select movement_type, reference_type, count(*)
from stock_movements group by 1,2 order by 1,2 nulls first;
```

출력 원문:

```text
 stock_movements_rows
----------------------
                   47
(1 row)

 movement_type |       reference_type        | count
---------------+-----------------------------+-------
 INBOUND       | INBOUND                     |     8
 RELEASE       | CODEX_QA_25                 |     1
 RELEASE       | CODEX_QA_25_VERIFY          |     1
 RELEASE       | PARTNER_ORDER_CONVERT       |     2
 RELEASE       | PARTNER_ORDER_MERGE_CONVERT |     2
 RELEASE       | SLIP                        |     3
 RESERVE       | CODEX_QA_25                 |     1
 RESERVE       | CODEX_QA_25_VERIFY          |     1
 RESERVE       | PARTNER_ORDER_CONVERT       |    14
 RESERVE       | PARTNER_ORDER_MERGE_CONVERT |     9
 RESERVE       | SLIP                        |     5
(11 rows)
```

유형 합계는 `INBOUND 8행(+17)`, `RESERVE 30행`, `RELEASE 9행`이다. `DEDUCT`, `ADJUST`, `TRANSFER_OUT`, `TRANSFER_IN`은 0행이다. `StockLedgerService.isPhysicalMovement()`가 `RESERVE/RELEASE`를 제외하므로 현재 수불부에 보이는 행은 `INBOUND` 8행뿐이다.

## 2. 수불 이력 정본 테이블

### 2.1 정본과 조회 구조

- 엔티티: `StockMovement`, `@Table(name = "stock_movements")` — `services/inventory-service/src/main/java/com/samhanair/logis/inventory/domain/StockMovement.java:18-100`
- 저장소: `StockMovementRepository` — `services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/StockMovementRepository.java:12-36`
- 수불부 계산: `StockLedgerService`가 product별 movement를 읽고 물리 유형만 필터링한 뒤 누적 잔량을 계산 — `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockLedgerService.java:35-83`
- 물리 수불 포함 유형: `INBOUND`, `DEDUCT`, `TRANSFER_IN`, `TRANSFER_OUT`, `ADJUST`.
- 제외 유형: `RESERVE`, `RELEASE`.

즉 `stock_movements`는 감사 이벤트 정본이고, “재고수불부”는 이 테이블을 읽는 계산 뷰 성격의 서비스 응답이다. 별도 DB view/materialized view/table은 없다.

### 2.2 스키마·컬럼

스키마: `public`, 테이블: `stock_movements`, 현재 행 수: `47`.

| 순서 | 컬럼 | 타입 | NULL |
|---:|---|---|---|
| 1 | `id` | uuid | NO |
| 2 | `lot_id` | uuid | NO |
| 3 | `product_id` | uuid | NO |
| 4 | `warehouse_id` | uuid | NO |
| 5 | `movement_type` | varchar | NO |
| 6 | `quantity_delta` | integer | NO |
| 7 | `reference_type` | varchar | YES |
| 8 | `reference_id` | uuid | YES |
| 9 | `note` | varchar | YES |
| 10 | `occurred_at` | timestamp without time zone | NO |
| 11 | `actor_user_id` | varchar | NO |
| 12 | `created_at` | timestamp without time zone | NO |
| 13 | `created_by` | varchar | NO |
| 14 | `modified_at` | timestamp without time zone | YES |
| 15 | `modified_by` | varchar | YES |
| 16 | `deleted_at` | timestamp without time zone | YES |
| 17 | `deleted_by` | varchar | YES |
| 18 | `is_deleted` | boolean | NO |

### 2.3 DB 객체 우회 경로 조사

`pg_catalog.pg_class`에서 관련 객체를 relkind까지 확인한 결과 `stock_movements`, `stock_transfers`, `stock_transfer_lines`는 모두 일반 테이블(`relkind='r'`)이다.

- 사용자 정의 trigger: 0개.
- `stock_movements`, `stock_balances`, `stock_lots`, `stock_transfers`를 본문에서 참조하는 사용자 정의 function/procedure: 0개.
- 관련 view/materialized view: 0개.

따라서 애플리케이션 코드가 movement를 명시적으로 저장하지 않는 경로를 DB trigger/function이 보완하지 않는다.

## 3. 재고 수량을 바꾸는 코드 경로 전수

전수 기준은 화면명이 아니라 다음 mutation sink다.

- 배치 수량: `StockBalance.addInbound/reserve/release/deduct/adjust`, `StockLot.deduct`.
- 시리얼 수량/상태: `StockInstance.inbound/reserve/release/ship/recall/unrecall/resell`.
- 이동 표시 수량: `StockTransferLine.requested/shipped/receivedQuantity`.
- DB 우회: inventory DB의 trigger/function과 직접 SQL.

서비스 소스 전체에서 위 sink 호출자를 역추적했다. dev seeder는 운영 mutation이 아니므로 표 아래 별도로 분리했다.

| 수량 변경 경로 | 실제 수량 저장 변화 | `stock_movements` 생성 | 수불부 노출 | 소스 근거 | 실데이터 |
|---|---|---|---|---|---|
| 배치 품목 입고: `POST /inventory/lots/inbound` | `stock_lots` 생성 + `stock_balances` 가산 | `INBOUND +qty` | 예 | `StockService.inbound()` `StockService.java:203-241` | `INBOUND/INBOUND` 8행, delta 합 +17. 활성 lot 8개 잔량 합 17로 일치 |
| 배치 판매전표 출고 완료 | FIFO lot 차감 + balance 차감 | lot마다 `DEDUCT -qty` | 예 | `SlipService.complete()` `SlipService.java:1136-1150` → `StockService.deduct()` `StockService.java:361-403` | `DEDUCT` 0행 — 표본 0으로 실데이터 판정 불가 |
| 배치 입고전표/가입고 완료 | 내부 입고전표가 위 batch inbound 호출 | `INBOUND +qty` | 예 | `SlipService.complete()`/`inboundBatchLine()` `SlipService.java:1151-1208` | `INBOUND` 8행은 존재하나 “가입고” 별도 reference는 없어 가입고만 분리 판정 불가 |
| 입고 검수 완료 | 정상수량 lot 생성 + balance 가산 | `INBOUND +qty`, reference=`INBOUND_INSPECTION` | 예 | `InboundInspectionService.completeInspection()` `InboundInspectionService.java:223-301` | 검수 1건은 `PENDING/stock_applied=false`, 해당 movement 0행 — 완료 표본 0 |
| 직접 재고 조정 `POST /inventory/adjust` | balance delta 반영 | `ADJUST delta` | 예 | `StockService.adjust()` `StockService.java:424-441` | `ADJUST` 0행 — 표본 0 |
| 재고실사 완료 | nonzero diff line별 balance 조정 | `ADJUST delta`, reference=`AUDIT` | 예 | `InventoryAuditService.complete()`/`adjustStockForLine()` `InventoryAuditService.java:241-262,365-393` | 운영 경로 표본 판정 불가. 아래 시드 오염 주의 참조 |
| 배치 예약/예약해제 | total은 불변, available↔reserved만 변화 | `RESERVE`/`RELEASE` 생성 | **아니오** — 수불부 필터에서 의도적으로 제외 | `StockService.java:257-297,309-344`; `StockLedgerService.java:79-83` | RESERVE 30행, RELEASE 9행 |
| 시리얼 수동 생성 | `stock_instances` AVAILABLE 1행 생성 | 없음 | 아니오 | `StockInstanceService.create()` `StockInstanceService.java:80-95` | 수동/전표별 생성 원인은 현재 집계만으로 분리 불가 |
| serial-managed 입고전표 완료 | 목표 수량만큼 AVAILABLE instance 생성 | 없음 | 아니오 | `SlipService.java:1151-1184` → `StockInstanceService.inboundBatch()` `StockInstanceService.java:124-159` | 활성 instance 21개 전부 `inbound_slip_no` 있음 |
| serial-managed 판매전표 수락 | AVAILABLE→RESERVED | 없음 | 아니오 | `SlipService.java:917-950` → `StockInstanceService.reserveBatch()` `StockInstanceService.java:176-206` | 현재 RESERVED 0 — 현 상태 표본 없음 |
| serial-managed 판매전표 완료 | RESERVED→SHIPPED | 없음 | 아니오 | `SlipService.java:1136-1146` → `StockInstanceService.shipBatch()` `StockInstanceService.java:225-245` | SHIPPED 15개, 모두 outbound slip 연결 |
| serial-managed 판매전표 반려/보상 | RESERVED→AVAILABLE | 없음 | 아니오 | `SlipService.java:1420-1440` → `StockInstanceService.releaseBatch()` `StockInstanceService.java:262-274` | 현재 상태만으로 실행 이력 판정 불가 |
| serial-managed 반품/회차 입고 | SHIPPED→RECALLED | 없음 | 아니오 | `SlipService.java:1221-1253` → `StockInstanceService.recallBatch()` `StockInstanceService.java:292-318` | 현재 RECALLED 0 — 표본 0 |
| serial 회수 취소/재판매 | RECALLED→SHIPPED 또는 AVAILABLE | 없음 | 아니오 | `StockInstanceService.java:392-442` | 해당 상태 표본 0 |
| 일반 재고이동 `confirm` | **실제 재고 변화 없음**; 전표 상태만 CONFIRMED | 없음 | 아니오 | `StockTransferService.confirm()` `StockTransferService.java:138-150`; 클래스 의존성에도 lot/balance/instance/movement 저장소가 없음 `:36-39` | 확정 표본 0 |
| 이카운트 재고이동 import | 전표/라인의 상태·표시수량만 CONFIRMED/출하/입고로 적재; 실제 재고 변화 없음 | 없음 | 아니오 | `EcountStockTransferImporter.java:167-255` | 현재 CONFIRMED 표본 0 |
| QR 스캔 입출고 | **경로 미구현, 변화 없음** | 없음 | 아니오 | #999 2026-08-12 코멘트가 “QR 표시까지, 스캔 입출고 미착수” 명시. 현재 QR 코드는 `StockInstanceListModal.tsx:3-27`의 표시용 | 스캔 이벤트/전용 reference 표본 없음 |

`StockInstanceService`의 주입 저장소 목록은 `StockInstanceRepository`, source journal, audit log, warehouse뿐이며 `StockMovementRepository`, `StockBalanceRepository`, `StockLotRepository`가 없다(`StockInstanceService.java:52-62`). 이는 개별 메서드의 누락이 아니라 시리얼 축 전체가 수불 축과 연결되지 않은 구조임을 뒷받침한다.

### 시드·초기화 경로

`StockBalanceSeeder`, `StockInstanceSeeder`, `InventoryAuditSeeder`는 dev + `app.seed-test-data=true`에서 DB 상태를 직접 만든다. movement를 함께 만들지 않는다. 현재 컨테이너 설정은 `SAMHAN_SEED_TEST_DATA=false`지만 과거 시드 행이 DB에 남아 있다.

특히 실사 데이터는 `COMPLETED 3건`, nonzero diff line 12개가 있으나 `InventoryAuditSeeder.java:176-186`이 서비스가 아닌 도메인 `audit.complete()`를 직접 호출해 만든 시드다. `AUDIT/ADJUST` movement 0행을 운영 실사 완료 결함의 실데이터 증거로 사용하면 안 된다.

## 4. 재고이동 확정의 출고행/입고행

### 소스 판정

**둘 다 만들지 않는다.**

`StockTransferService.confirm()`은 다음 두 동작만 한다.

1. 전표 조회.
2. `t.confirm(approverId)`로 `RECEIVED → CONFIRMED` 상태 전이.

출발 창고 lot/balance 차감, 도착 창고 lot/balance 가산, instance 창고 변경, `TRANSFER_OUT`, `TRANSFER_IN` 저장 호출은 없다. `MovementType` enum에는 두 유형이 정의돼 있고 수불부 필터도 두 유형을 포함하지만, production 소스에서 이를 생성하는 호출자는 0개다. `StockTransferLine.recordShipment()`과 `recordReceipt()`도 선언만 있고 호출자가 없다.

이카운트 import는 더 직접적이다. `stock_transfers.status='CONFIRMED'`, 라인의 `shipped_quantity=received_quantity=quantity`를 SQL로 적재하지만 `stock_lots`, `stock_balances`, `stock_instances`, `stock_movements`는 건드리지 않는다.

### 실데이터 판정

```sql
select count(*) as transfer_movement_rows,
       count(*) filter (where movement_type='TRANSFER_OUT') as transfer_out_rows,
       count(*) filter (where movement_type='TRANSFER_IN') as transfer_in_rows
from stock_movements
where movement_type in ('TRANSFER_OUT','TRANSFER_IN')
   or reference_type ilike '%TRANSFER%';
```

```text
 transfer_movement_rows | transfer_out_rows | transfer_in_rows
------------------------+-------------------+------------------
                      0 |                 0 |                0
(1 row)
```

그러나 `stock_transfers` 자체가 `REQUESTED` 3건뿐이다. 따라서 위 0행은 “확정 이동을 실행했는데 행이 안 생겼다”는 실데이터 증명이 아니다. **표본 0이라 실데이터 판정 불가**이며, 소스 판정만 확정적이다.

## 5. 끊긴 경로와 심각도 구분

### A. 수량/재고상태는 바뀌는데 이력만 없음

**시리얼 재고 전 경로**가 여기에 해당한다.

실측:

```text
  status   | count
-----------+-------
 AVAILABLE |     6
 SHIPPED   |    15
(2 rows)

 active_instances | with_inbound_slip | with_outbound_slip | shipped
------------------+-------------------+--------------------+---------
               21 |                21 |                 15 |      15
(1 row)

 serial_instance_products | movement_rows_for_instance_products | physical_movement_rows_for_instance_products
--------------------------+-------------------------------------+----------------------------------------------
                       10 |                                   3 |                                            0
(1 row)
```

인스턴스 품목에 걸린 movement 3행도 모두 예약 계열이라 물리 수불 행은 0이다. 구매 입고로 instance가 생기고 판매 출고로 15개가 SHIPPED 됐지만 수불부는 이를 표현하지 못한다. 이는 현재 실데이터로 확인된 핵심 단절이다.

### B. 수량도 안 바뀌고 이력도 없음

- 일반 재고이동 승인/출하/입고/확정 워크플로우.
- 이카운트 재고이동 import.
- QR 스캔 입출고(아직 미구현).

재고이동은 전표 상태와 라인 표시수량만 바뀌며 실재고는 그대로다. QR 스캔은 호출 경로 자체가 없다. 따라서 이 둘을 “이력 누락”만으로 분류하면 실제 심각도를 낮게 잡게 된다.

### C. 수량과 이력이 함께 바뀌는 연결 경로

- batch lot 입고.
- batch lot FIFO 출고.
- 직접 조정.
- 재고실사 완료.
- 입고검수 완료.

이들은 소스상 balance/lot mutation과 movement 저장을 같은 트랜잭션에서 수행한다. 단, 현재 DB에서 실제 유효 표본이 있는 것은 batch 입고뿐이다.

## 6. 판정 불가로 남긴 것

1. **확정 재고이동의 실데이터 결과** — CONFIRMED 포함 후속 상태 표본 0. 소스는 양쪽 행을 모두 만들지 않지만 실데이터 재현 판정은 불가.
2. **batch 판매전표 출고의 실데이터 수불 생성** — `DEDUCT` 표본 0. 소스상 생성은 명확하나 현재 DB 실데이터 확인 불가.
3. **입고검수 완료의 실데이터 수불 생성** — 검수 표본은 PENDING 1건뿐이고 `stock_applied=false`.
4. **직접 조정과 운영 실사 완료의 실데이터 수불 생성** — `ADJUST` 0행. 완료 실사 3건은 seeder가 서비스 경로를 우회해 만든 데이터라 운영 표본으로 사용할 수 없음.
5. **가입고만의 독립 판정** — 현재 별도 DPS 가입고 mutation 경로가 없고 내부 INBOUND 구매전표 경로로 귀결된다. `INBOUND` 8행 중 가입고 기원을 식별할 reference가 없음.
6. **전사 총재고와 수불부 기말의 전체 일치 여부** — `stock_balances`에는 과거 dev seed 202행(총수량 46,705)이 직접 적재돼 있고 movement가 동반되지 않았다. 이 오염 데이터 때문에 전체 합계 비교는 유효하지 않음.
7. **예약/예약해제를 재고수불부에 노출해야 하는지** — 현재는 movement 감사행은 만들되 수불부에서 제외한다. 이것이 올바른 업무 규칙인지는 소스에서 추론하지 않음.

## 7. 개발책임자 판단이 필요한 질문

1. **시리얼 재고를 수불부에 어떻게 합칠 것인가?** 현재 수불부 정본은 lot 기반 `stock_movements`이고, serial 입고·출고·회수는 `stock_instances`만 바꾼다. (a) instance 전이 때 동일 `stock_movements`를 생성할지, (b) 별도 instance movement 정본을 만들고 수불부에서 합칠지 결정이 필요하다.
2. **재고이동의 실제 반영 시점은 언제인가?** (a) `ship`에서 출발 창고 출고, `receive`에서 도착 창고 입고를 각각 반영할지, (b) `confirm`에서 출고·입고를 원자적으로 함께 반영할지 결정이 필요하다. 현재는 어느 단계에서도 실제 재고가 변하지 않는다.
3. **QR 스캔은 어떤 업무 명령인가?** (a) 시리얼 instance를 직접 입고/출고 전이시키는 명령인지, (b) 기존 입고·판매·이동전표의 라인을 식별하고 해당 lifecycle을 진행하는 입력수단인지 결정이 필요하다. 이 선택에 따라 수불 reference와 멱등키가 달라진다.
4. **예약/예약해제 감사행을 물리 재고수불부에 계속 제외할지** 확인이 필요하다. 현재 총수량은 불변이라 제외하지만, 이것이 확정된 업무 규칙이라는 기록은 이번 정찰에서 확인하지 못했다.

## 조사 무결성 메모

- 소스 sweep만으로 결론내지 않았다. `information_schema`로 실제 테이블명·컬럼을 찾고, `pg_catalog`로 relkind·trigger·function 본문을 확인했다.
- DB는 읽기 전용 transaction으로만 조회했다.
- 이 보고서 외 코드·설정·DB·git 상태를 변경하지 않았다.
