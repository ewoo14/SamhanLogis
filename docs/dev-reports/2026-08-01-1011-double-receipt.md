# 1011 중복 입고 실데이터 조사

## 조사 제약

- 작업 위치는 `C:/dev/Samhan-Public/.claude/worktrees/t1011`로 고정한다.
- git 명령, DB 쓰기, Docker 재빌드·재기동은 수행하지 않는다.
- UUID는 보고서에 기록하지 않고 입고전표번호와 모델코드만 사용한다.
- 선행 정찰은 두 재고 반영 후보를 `InboundInspectionService.completeInspection`과 `SlipService.complete`로 지목했다. 아래에서는 코드와 실데이터를 다시 독립 확인한다.

## 확인 1 — 입고검수 완료 경로의 가산량과 원천 표기

- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/InboundInspectionService.java:225-234`: `completeInspection(slipId, actorUserId)`는 같은 `inbound_inspections` 행을 읽고 `stockApplied=true`이면 즉시 반환하며, 아니면 검수 상태를 완료로 바꾼다.
- 같은 파일 `:250-280`: 각 검수 라인의 `normalQty = inspectedQty - defectQty`가 양수이고 등록 상품이며 재고 제외 상품이 아닐 때, 그 **정상수량만큼** `StockLot`을 만들고 `StockBalance.addInbound(normalQty)`로 가산한다.
- 같은 파일 `:282-288`: movement는 `movement_type=INBOUND`, `reference_type='INBOUND_INSPECTION'`, `reference_id=inbound_inspections.id`로 정상수량만큼 기록하며 설명에 사용자 식별 가능한 `slipNo`를 남긴다.
- 같은 파일 `:291-292`: 모든 라인 처리 뒤 `stockApplied=true`를 표시한다. 이 가드는 **같은 검수 행의 재호출**만 막는다.

## 확인 2 — 입고전표 라이프사이클 완료 경로의 가산량과 원천 표기

- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:1017-1019`: `/complete` 서비스는 먼저 전표 도메인의 `complete()` 상태 전이를 수행한다.
- 같은 파일 `:1035-1061`: 일반 입고전표이면서 회수입고가 아니고 비시리얼 상품이면 각 전표 라인의 **예정수량 `line.quantity` 전량**을 `inventoryClient.inbound(...)`에 넘긴다. 불량·실검수수량은 읽지 않는다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/InventoryClient.java:127-139`: 이 호출은 `productId`, `warehouseId`, `quantity`, `lotNo=slipNo`, `unitCost`만 `/inventory/lots/inbound`에 보낸다.
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockService.java:69-88`: 재고 서비스는 요청수량 전량으로 `StockLot`을 만들고 `StockBalance.addInbound(req.quantity())`로 가산하며, movement는 `movement_type=INBOUND`, `reference_type='INBOUND'`, `reference_id=NULL`로 기록한다. 따라서 이 경로의 원천 전표는 movement의 `reference_id`가 아니라 연결된 lot의 `lot_no=전표번호`로 식별해야 한다.
- 시리얼 상품은 `SlipService.java:1041-1067`에서 별도 `inboundInstances` 경로를 타며, `StockInstanceService.java:88-136`이 `inbound_slip_no + product_id` 기존 수량과 목표수량의 차이만 생성한다. 이 경로는 `stock_movements`가 아니라 `stock_instances`로 별도 측정해야 한다.

## 확인 3 — 두 경로가 모두 실행되는 조건

- 전표 경로: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:1053-1075`에 따라 입고전표가 `ACCEPTED → PROCESSING`을 거친 뒤 `/complete`가 호출되면 `PROCESSING → INSPECTING`으로 바뀌고, 직후 `SlipService.complete`가 예정수량을 입고한다.
- 검수 경로 생성 조건: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/InboundInspectionService.java:77-80,314-325`는 `INBOUND` 전표이며 상태가 `SAVED`, `CONFIRMED`, `COMPLETED`, `PROCESSING`, `INSPECTING` 중 하나이면 검수 행을 만든다. 즉 전표 `/complete` 전의 `PROCESSING`과 후의 `INSPECTING`을 **모두 허용**한다.
- 검수 완료 조건: 같은 파일 `:173-190,225-292`와 `InboundInspection.java:152-161`에 따라 검수 행이 `PENDING`, 모든 라인의 `inspectedQty`가 입력됨, 입고창고 존재, `stockApplied=false`이면 정상수량을 입고한다.
- 따라서 실무상 가능한 두 순서는 `(검수 완료 at SAVED/PROCESSING) → 전표 라이프사이클 /complete`와 `전표 /complete → 검수 완료 at INSPECTING`이다. 두 서비스 사이에 상대 경로 실행 여부를 확인하는 교차 가드는 없다.
- 데스크톱도 `clients/desktop/src/renderer/routes/components/InboundInspectionDialog.tsx:10-11,213-219`에서 검수 저장과 검수 완료 버튼을 실제 제공한다. 그러므로 조건은 이론상 도달 가능할 뿐 아니라 UI 업무 흐름으로도 도달 가능하다.

## 확인 4 — 조회 대상 운영 로컬 DB

읽기 전용으로 `samhan-postgres`의 DB 목록을 조회했고, 이번 측정 대상은 `inventory_db`와 `slip_db`다.

```sql
SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;
```

```text
           datname
-----------------------------
 accounting_db
 arologis_db
 auth_db
 dashboard_db
 dc_config_db
 groupware_db
 inventory_db
 logging_db
 migration_db
 notification_db
 partner_auth_db
 partner_db
 partner_order_db
 postgres
 product_db
 slip_db
 slip_db_qa_e2estimate
 sol951_2ra_20260727_1420utc
 sol951_r2_6897d36597
 user_db
(20 rows)
```

## 확인 5 — 실측 조인 키

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('stock_movements','stock_lots','stock_balances',
                     'inbound_inspections','inbound_inspection_lines','stock_instances')
ORDER BY table_name, ordinal_position;
```

출력에서 이번 판정에 쓰는 핵심 열은 다음과 같이 실제 존재한다.

```text
inbound_inspections      | id, slip_id, slip_no, status, stock_applied, is_deleted
inbound_inspection_lines | inspection_id, slip_line_id, model_code, expected_qty,
                         | inspected_qty, defect_qty, is_deleted
stock_movements          | lot_id, product_id, warehouse_id, movement_type,
                         | quantity_delta, reference_type, reference_id, note,
                         | occurred_at, is_deleted
stock_lots               | id, product_id, warehouse_id, lot_no, initial_quantity,
                         | received_at, is_deleted
stock_instances          | product_id, product_code, warehouse_id, inbound_slip_no,
                         | status, is_deleted
```

따라서 비시리얼 중복은 검수 movement의 `reference_id = inbound_inspections.id`와 전표 경로 lot의 `lot_no = inbound_inspections.slip_no`를 같은 모델/창고로 대조한다. 시리얼은 `stock_instances.inbound_slip_no`를 별도로 센다.

## 확인 6 — 실데이터 모수: 검수 0건, INBOUND movement 0건

```sql
SELECT 'inbound_inspections' AS metric, COUNT(*)::bigint AS value
FROM inbound_inspections WHERE is_deleted=false
UNION ALL
SELECT 'completed_stock_applied', COUNT(*)
FROM inbound_inspections
WHERE is_deleted=false AND status='COMPLETED' AND stock_applied=true
UNION ALL
SELECT 'stock_movements_total', COUNT(*)
FROM stock_movements WHERE is_deleted=false
UNION ALL
SELECT 'inbound_movements', COUNT(*)
FROM stock_movements WHERE is_deleted=false AND movement_type='INBOUND'
UNION ALL
SELECT 'stock_instances_total', COUNT(*)
FROM stock_instances WHERE is_deleted=false;

SELECT movement_type, COALESCE(reference_type,'<NULL>') AS reference_type,
       COUNT(*) AS movement_rows, SUM(quantity_delta) AS quantity_sum
FROM stock_movements
WHERE is_deleted=false
GROUP BY movement_type, COALESCE(reference_type,'<NULL>')
ORDER BY movement_type, reference_type;
```

```text
         metric          | value
-------------------------+-------
 inbound_inspections     |     0
 completed_stock_applied |     0
 stock_movements_total   |    37
 inbound_movements       |     0
 stock_instances_total   |     3
(5 rows)

 movement_type |       reference_type        | movement_rows | quantity_sum
---------------+-----------------------------+---------------+--------------
 RELEASE       | CODEX_QA_25                 |             1 |            1
 RELEASE       | CODEX_QA_25_VERIFY          |             1 |            1
 RELEASE       | PARTNER_ORDER_CONVERT       |             2 |            3
 RELEASE       | PARTNER_ORDER_MERGE_CONVERT |             2 |            2
 RELEASE       | SLIP                        |             3 |            9
 RESERVE       | CODEX_QA_25                 |             1 |            1
 RESERVE       | CODEX_QA_25_VERIFY          |             1 |            1
 RESERVE       | PARTNER_ORDER_CONVERT       |            14 |           24
 RESERVE       | PARTNER_ORDER_MERGE_CONVERT |             9 |           12
 RESERVE       | SLIP                        |             3 |            9
(10 rows)
```

판정: 현재 `inventory_db`에는 검수 행 자체가 0건이고 `INBOUND` movement도 0건이다. 따라서 이 DB에서 비시리얼 두 경로가 중복 실행된 실적은 이 시점에 **0건**이다. 이는 교차 가드가 막은 결과가 아니라, 측정 대상 조건(검수 완료 및 INBOUND movement)이 한 번도 성립하지 않은 결과다.

## 확인 7 — 입고전표는 42건 있으나 inventory 입고 흔적과 불일치

```sql
SELECT slip_type, status, COUNT(*) AS slip_count,
       COALESCE(SUM(line_count),0) AS line_count,
       COALESCE(SUM(total_qty),0) AS total_qty
FROM (
  SELECT s.id, s.slip_type, s.status, COUNT(sl.id) AS line_count,
         COALESCE(SUM(sl.quantity),0) AS total_qty
  FROM slips s
  LEFT JOIN slip_lines sl ON sl.slip_id=s.id AND sl.is_deleted=false
  WHERE s.is_deleted=false
  GROUP BY s.id,s.slip_type,s.status
) x
GROUP BY slip_type,status
ORDER BY slip_type,status;
```

```text
 slip_type |   status   | slip_count | line_count | total_qty
-----------+------------+------------+------------+----------
 INBOUND   | ACCEPTED   |          6 |         21 |       123
 INBOUND   | CANCELED   |          4 |          4 |         8
 INBOUND   | COMPLETED  |          6 |         17 |        95
 INBOUND   | CONFIRMED  |          1 |          3 |        27
 INBOUND   | DRAFT      |         11 |         22 |        38
 INBOUND   | INSPECTING |          2 |          6 |        21
 INBOUND   | PROCESSING |          5 |         12 |        85
 INBOUND   | REJECTED   |          2 |          9 |        42
 INBOUND   | SAVED      |          3 |         10 |        63
 INBOUND   | SENT       |          2 |          6 |        21
(입고 42건; 전체 출력은 OUTBOUND 포함 22 rows)
```

전표번호별 원문:

```text
   slip_no    |   status   | slip_date  | line_count | total_qty
--------------+------------+------------+------------+----------
 2026/03/12-1 | DRAFT      | 2026-03-12 |          1 |         1
 2026/03/13-1 | DRAFT      | 2026-03-13 |          2 |         5
 2026/03/14-1 | DRAFT      | 2026-03-14 |          3 |        12
 2026/03/15-1 | SAVED      | 2026-03-15 |          4 |        22
 2026/03/16-1 | SAVED      | 2026-03-16 |          5 |        35
 2026/03/17-1 | SAVED      | 2026-03-17 |          1 |         6
 2026/03/18-1 | PROCESSING | 2026-03-18 |          2 |        15
 2026/03/19-1 | ACCEPTED   | 2026-03-19 |          3 |        27
 2026/03/20-1 | ACCEPTED   | 2026-03-20 |          4 |        22
 2026/03/21-1 | SENT       | 2026-03-21 |          5 |        20
 2026/03/22-1 | SENT       | 2026-03-22 |          1 |         1
 2026/03/23-1 | ACCEPTED   | 2026-03-23 |          2 |         5
 2026/03/24-1 | ACCEPTED   | 2026-03-24 |          3 |        12
 2026/03/25-1 | ACCEPTED   | 2026-03-25 |          4 |        22
 2026/03/26-1 | ACCEPTED   | 2026-03-26 |          5 |        35
 2026/03/27-1 | PROCESSING | 2026-03-27 |          1 |         6
 2026/03/28-1 | PROCESSING | 2026-03-28 |          2 |        15
 2026/03/29-1 | PROCESSING | 2026-03-29 |          3 |        27
 2026/03/30-1 | PROCESSING | 2026-03-30 |          4 |        22
 2026/03/31-1 | INSPECTING | 2026-03-31 |          5 |        20
 2026/04/01-1 | INSPECTING | 2026-04-01 |          1 |         1
 2026/04/02-1 | COMPLETED  | 2026-04-02 |          2 |         5
 2026/04/03-1 | COMPLETED  | 2026-04-03 |          3 |        12
 2026/04/04-1 | COMPLETED  | 2026-04-04 |          4 |        22
 2026/04/05-1 | COMPLETED  | 2026-04-05 |          5 |        35
 2026/04/06-1 | COMPLETED  | 2026-04-06 |          1 |         6
 2026/04/07-1 | COMPLETED  | 2026-04-07 |          2 |        15
 2026/04/08-1 | CONFIRMED  | 2026-04-08 |          3 |        27
 2026/04/09-1 | REJECTED   | 2026-04-09 |          4 |        22
 2026/04/10-1 | REJECTED   | 2026-04-10 |          5 |        20
 2026/07/17-1 | DRAFT      | 2026-07-17 |          3 |         4
 2026/07/17-2 | DRAFT      | 2026-07-17 |          1 |         1
 2026/07/17-3 | DRAFT      | 2026-07-17 |          3 |         4
 2026/07/17-4 | DRAFT      | 2026-07-17 |          1 |         1
 2026/07/17-5 | DRAFT      | 2026-07-17 |          3 |         4
 2026/07/17-6 | DRAFT      | 2026-07-17 |          1 |         1
 2026/07/17-7 | DRAFT      | 2026-07-17 |          3 |         4
 2026/07/17-8 | DRAFT      | 2026-07-17 |          1 |         1
 2026/07/27-5 | CANCELED   | 2026-07-27 |          1 |         2
 2026/07/27-6 | CANCELED   | 2026-07-27 |          1 |         2
 2026/07/27-7 | CANCELED   | 2026-07-27 |          1 |         2
 2026/07/27-8 | CANCELED   | 2026-07-27 |          1 |         2
(42 rows)
```

`INSPECTING` 이상 입고전표가 9건인데도 inventory의 INBOUND movement가 0건이다. 상태 데이터만으로 `/complete`가 실제 호출됐다고 볼 수 없으며, seed/직접 적재 가능성을 추가 확인해야 한다.

## 확인 8 — `INSPECTING` 이상 9건은 실제 재고 경로 실행 증거가 아니라 seed 상태

```sql
SELECT status,
       CASE WHEN created_by='system' THEN 'system'
            WHEN created_by IS NULL THEN '<NULL>' ELSE '<사용자>' END AS creator_kind,
       COUNT(*) AS slips, MIN(created_at) AS first_created, MAX(created_at) AS last_created
FROM slips
WHERE is_deleted=false AND slip_type='INBOUND'
GROUP BY status,
         CASE WHEN created_by='system' THEN 'system'
              WHEN created_by IS NULL THEN '<NULL>' ELSE '<사용자>' END
ORDER BY status, creator_kind;

SELECT DATE_TRUNC('second',created_at) AS created_second, COUNT(*) AS slips,
       STRING_AGG(slip_no, ', ' ORDER BY slip_no) AS slip_nos
FROM slips
WHERE is_deleted=false AND slip_type='INBOUND'
GROUP BY DATE_TRUNC('second',created_at)
HAVING COUNT(*)>1
ORDER BY created_second;
```

```text
   status   | creator_kind | slips |       first_created        |        last_created
------------+--------------+-------+----------------------------+----------------------------
 ACCEPTED   | system       |     6 | 2026-05-09 16:59:33.748074 | 2026-05-09 16:59:33.790114
 COMPLETED  | system       |     6 | 2026-05-09 16:59:33.833526 | 2026-05-09 16:59:33.873094
 CONFIRMED  | system       |     1 | 2026-05-09 16:59:33.881534 | 2026-05-09 16:59:33.881534
 DRAFT      | system       |     3 | 2026-05-09 16:59:33.711025 | 2026-05-09 16:59:33.720109
 INSPECTING | system       |     2 | 2026-05-09 16:59:33.820583 | 2026-05-09 16:59:33.828012
 PROCESSING | system       |     5 | 2026-05-09 16:59:33.742866 | 2026-05-09 16:59:33.814042
 REJECTED   | system       |     2 | 2026-05-09 16:59:33.892029 | 2026-05-09 16:59:33.901047
 SAVED      | system       |     3 | 2026-05-09 16:59:33.725435 | 2026-05-09 16:59:33.738669
 SENT       | system       |     2 | 2026-05-09 16:59:33.761281 | 2026-05-09 16:59:33.768337
 CANCELED   | <사용자>     |     4 | 2026-07-27 03:35:35.382554 | 2026-07-27 03:40:06.910711
 DRAFT      | <사용자>     |     8 | 2026-07-17 01:05:58.833210 | 2026-07-17 02:00:35.674897
(11 rows)

   created_second    | slips | slip_nos
---------------------+-------+-----------------------------------------------------------
 2026-05-09 16:59:33 |    30 | 2026/03/12-1, 2026/03/13-1, 2026/03/14-1, 2026/03/15-1, 2026/03/16-1, 2026/03/17-1, 2026/03/18-1, 2026/03/19-1, 2026/03/20-1, 2026/03/21-1, 2026/03/22-1, 2026/03/23-1, 2026/03/24-1, 2026/03/25-1, 2026/03/26-1, 2026/03/27-1, 2026/03/28-1, 2026/03/29-1, 2026/03/30-1, 2026/03/31-1, 2026/04/01-1, 2026/04/02-1, 2026/04/03-1, 2026/04/04-1, 2026/04/05-1, 2026/04/06-1, 2026/04/07-1, 2026/04/08-1, 2026/04/09-1, 2026/04/10-1
(1 row)
```

코드도 이 패턴을 설명한다. `services/slip-service/src/main/java/com/samhanair/logis/slip/seed/SlipSeeder.java:210-237`은 100개 전표를 한 번에 만들고, `:302-312`는 입고 30개를 상태별로 직접 구성한다. 특히 `:411-418`은 서비스 `SlipService.complete()`가 아니라 엔티티의 `slip.complete()`와 `slip.inspect()`만 호출해 상태를 만들고 곧바로 repository에 저장한다. inventory API는 호출하지 않는다. 따라서 system 생성 30건 중 `INSPECTING` 이상 9건은 **재고 반영 없는 상태 seed**이며, 실제 전표 라이프사이클 재고 반영 실적으로 세면 안 된다.

## 확인 9 — 두 경로 교집합을 직접 센 결과: 0건

```sql
WITH inspection_route AS (
  SELECT i.slip_no, sm.product_id, sm.warehouse_id,
         COUNT(*) AS movement_rows, SUM(sm.quantity_delta) AS quantity_sum
  FROM stock_movements sm
  JOIN inbound_inspections i
    ON i.id=sm.reference_id AND i.is_deleted=false
  WHERE sm.is_deleted=false AND sm.movement_type='INBOUND'
    AND sm.reference_type='INBOUND_INSPECTION'
  GROUP BY i.slip_no,sm.product_id,sm.warehouse_id
), lifecycle_route AS (
  SELECT l.lot_no AS slip_no, sm.product_id, sm.warehouse_id,
         COUNT(*) AS movement_rows, SUM(sm.quantity_delta) AS quantity_sum
  FROM stock_movements sm
  JOIN stock_lots l ON l.id=sm.lot_id AND l.is_deleted=false
  WHERE sm.is_deleted=false AND sm.movement_type='INBOUND'
    AND sm.reference_type='INBOUND'
  GROUP BY l.lot_no,sm.product_id,sm.warehouse_id
), route_overlap AS (
  SELECT i.slip_no, i.product_id, i.warehouse_id,
         i.movement_rows AS inspection_rows,
         l.movement_rows AS lifecycle_rows,
         i.quantity_sum AS inspection_qty,
         l.quantity_sum AS lifecycle_qty
  FROM inspection_route i
  JOIN lifecycle_route l
    ON l.slip_no=i.slip_no
   AND l.product_id=i.product_id
   AND l.warehouse_id=i.warehouse_id
)
SELECT COUNT(DISTINCT slip_no) AS duplicated_slips,
       COUNT(*) AS duplicated_slip_product_warehouse_groups,
       COALESCE(SUM(inspection_rows),0) AS inspection_movement_rows,
       COALESCE(SUM(lifecycle_rows),0) AS lifecycle_movement_rows,
       COALESCE(SUM(inspection_qty),0) AS inspection_qty,
       COALESCE(SUM(lifecycle_qty),0) AS lifecycle_qty
FROM route_overlap;
```

```text
 duplicated_slips | duplicated_slip_product_warehouse_groups | inspection_movement_rows | lifecycle_movement_rows | inspection_qty | lifecycle_qty
------------------+------------------------------------------+--------------------------+-------------------------+----------------+--------------
                0 |                                        0 |                        0 |                       0 |              0 |             0
(1 row)
```

**실데이터 중복 입고 = 입고전표 0건, 전표-모델-창고 그룹 0건, 양 경로 수량 모두 0.**

보조 확인:

```sql
SELECT 'stock_lots' AS metric,COUNT(*)::bigint AS rows
FROM stock_lots WHERE is_deleted=false
UNION ALL
SELECT 'lots_with_slip_like_no',COUNT(*)
FROM stock_lots
WHERE is_deleted=false AND lot_no ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}-[0-9]+$'
UNION ALL
SELECT 'inbound_movements_with_lot',COUNT(*)
FROM stock_movements sm
JOIN stock_lots l ON l.id=sm.lot_id AND l.is_deleted=false
WHERE sm.is_deleted=false AND sm.movement_type='INBOUND';
```

```text
           metric           | rows
----------------------------+-----
 stock_lots                 |    0
 lots_with_slip_like_no     |    0
 inbound_movements_with_lot |    0
(3 rows)
```

lot 자체도 0건이므로 movement 누락 때문에 중복을 놓친 상황도 아니다.

시리얼 경로는 별도 조회했다.

```sql
SELECT COALESCE(inbound_slip_no,'<NULL>') AS inbound_slip_no,
       product_code AS model_code, status, COUNT(*) AS instance_count
FROM stock_instances
WHERE is_deleted=false
GROUP BY COALESCE(inbound_slip_no,'<NULL>'),product_code,status
ORDER BY inbound_slip_no,model_code,status;
```

```text
 inbound_slip_no  | model_code |  status   | instance_count
------------------+------------+-----------+---------------
 IN-2026-0415-001 | 010001     | SHIPPED   |              1
 IN-2026-0501-001 | 010001     | AVAILABLE |              1
 IN-2026-0510-001 | 010001     | SHIPPED   |              1
(3 rows)
```

세 인스턴스는 각각 다른 입고번호이며 같은 원천의 중복 생성 흔적은 0건이다. 다만 이 번호들이 `slip_db`의 현행 입고전표와 연결되는지는 별도 확인한다.

## 확인 10 — 시리얼 3건은 현행 입고전표와 연결되지 않음

```sql
SELECT COUNT(*) AS matching_current_slips
FROM slips
WHERE is_deleted=false AND slip_type='INBOUND'
  AND slip_no IN ('IN-2026-0415-001','IN-2026-0501-001','IN-2026-0510-001');
```

```text
 matching_current_slips
------------------------
                      0
(1 row)
```

따라서 `stock_instances` 3건은 현재 `slip_db`의 전표 라이프사이클과 결합된 실적이 아니다. 현행 입고전표의 시리얼 중복 입고도 측정 결과 0건이다.

## 확인 11 — 중복 방지 가드의 범위와 견고성

```sql
SELECT tablename,indexname,indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN ('inbound_inspections','stock_movements','stock_instances')
ORDER BY tablename,indexname;
```

```text
inbound_inspections | inbound_inspections_pkey                 | CREATE UNIQUE INDEX inbound_inspections_pkey ON public.inbound_inspections USING btree (id)
inbound_inspections | ix_inbound_inspections_slip              | CREATE INDEX ix_inbound_inspections_slip ON public.inbound_inspections USING btree (slip_id) WHERE (is_deleted = false)
inbound_inspections | ix_inbound_inspections_status_created    | CREATE INDEX ix_inbound_inspections_status_created ON public.inbound_inspections USING btree (status, created_at DESC) WHERE (is_deleted = false)
stock_instances     | idx_stock_instances_inbound_slip_product | CREATE INDEX idx_stock_instances_inbound_slip_product ON public.stock_instances USING btree (inbound_slip_no, product_id) WHERE (is_deleted = false)
stock_movements     | ix_stock_movements_reference             | CREATE INDEX ix_stock_movements_reference ON public.stock_movements USING btree (reference_type, reference_id)
stock_movements     | ux_stock_movement_reserve_idempotency    | CREATE UNIQUE INDEX ux_stock_movement_reserve_idempotency ON public.stock_movements USING btree (reference_type, reference_id, product_id, movement_type) WHERE ((reference_type IS NOT NULL) AND (reference_id IS NOT NULL) AND ((movement_type)::text = 'RESERVE'::text))
```

- 같은 검수 행 재호출: `InboundInspectionService.java:225-230`의 `stockApplied` 조기 반환과 `InboundInspection.java:93-95`의 `@Version`이 막는다. 한 트랜잭션 안에서 movement·lot·balance·flag가 함께 처리되므로 단일 검수 행에 대해서는 비교적 견고하다.
- 그러나 `V5__add_inbound_inspections.sql:49-52`의 `slip_id` 인덱스는 **UNIQUE가 아니다**. 주석도 “PENDING 중복 방지는 application level”이라고 명시한다. 동시 `getOrCreate`가 서로 다른 검수 헤더를 만들면 각 행의 `stockApplied`와 `@Version`은 서로를 막지 못한다.
- `stock_movements`의 유일한 업무 멱등 unique 인덱스는 `RESERVE` 전용이다 (`V14__add_stock_movement_reserve_idempotency_index.sql:1-9`). `INBOUND_INSPECTION`과 `INBOUND` movement에는 DB unique 가드가 없다.
- 전표 라이프사이클의 비시리얼 입고는 `reference_id=NULL`이고 lot 번호 중복 가드도 없다. 다만 정상 상태 머신은 첫 `/complete` 후 `PROCESSING → INSPECTING`이 되어 같은 전표 `/complete` 재호출을 거부한다. 이 가드는 **전표 경로 내부 재호출**만 막고 검수 경로와의 중복은 막지 않는다.
- 시리얼 전표 경로는 `StockInstanceService.java:118-135`에서 key lock 뒤 기존 개수를 세고 부족분만 만든다. 그러나 DB 인덱스는 UNIQUE가 아니며 수량 목표에 수렴시키는 애플리케이션 가드다. 검수 경로는 시리얼 여부를 별도 분기하지 않고 lot/balance/movement를 만들기 때문에 두 경로 교차 중복을 막지 못한다.

결론: 0건인 이유는 가드가 두 경로를 상호 배제해서가 아니다. 현재 DB에 검수/INBOUND 실행 실적이 없기 때문이다. 존재하는 가드는 각 경로 내부의 일부 재호출만 방어한다.

## 확인 12 — 실무 흐름상 조건이 실제 발생했는가

```sql
SELECT status,COUNT(*) AS user_created_slips,
       COALESCE(SUM(line_count),0) AS line_count,
       COALESCE(SUM(total_qty),0) AS total_qty
FROM (
  SELECT s.id,s.status,COUNT(sl.id) AS line_count,
         COALESCE(SUM(sl.quantity),0) AS total_qty
  FROM slips s
  LEFT JOIN slip_lines sl ON sl.slip_id=s.id AND sl.is_deleted=false
  WHERE s.is_deleted=false AND s.slip_type='INBOUND'
    AND COALESCE(s.created_by,'')<>'system'
  GROUP BY s.id,s.status
) x
GROUP BY status
ORDER BY status;
```

```text
  status  | user_created_slips | line_count | total_qty
----------+--------------------+------------+----------
 CANCELED |                  4 |          4 |         8
 DRAFT    |                  8 |         16 |        20
(2 rows)
```

코드/UI상 두 경로 조건은 실제 업무에서 도달 가능하지만, **현재 로컬 실데이터에서는 사용자 생성 입고전표 12건이 DRAFT 8건·CANCELED 4건뿐**이다. `PROCESSING` 이상 사용자 생성 입고전표 0건, 검수 0건이므로 두 경로가 함께 실행된 실무 사례도 0건이다. system seed의 고단계 상태는 앞서 확인한 이유로 실행 사례가 아니다.

## 확인 13 — 한쪽만 실행될 때와 반대 결함

- 전표 라이프사이클 서비스만 실행: `SlipService.java:1055-1069`가 비시리얼은 예정수량 전량을 lot/balance에 넣고, 시리얼은 목표 개수까지 instance를 만든다. 검수 차이를 반영하지 않으므로 재고 미증가가 아니라, 실입고가 예정보다 적을 때 **과다 입고**가 된다.
- 검수 완료 서비스만 실행: `InboundInspectionService.java:250-288`이 정상수량만 재고에 넣는다. 재고는 증가하지만 slip-service 상태를 바꾸는 호출이 전혀 없어 전표가 `SAVED` 또는 `PROCESSING` 등에 남을 수 있다. 이후 전표 `/complete`가 실행되면 중복 위험이 다시 열린다.
- 검수 결과 저장(`/inspect`)만 하고 검수 완료(`/complete`)를 누르지 않으면 재고는 늘지 않는다 (`InboundInspectionService.java:161-200`). 이것은 저장/확정을 분리한 현재 계약상 의도된 동작이다.
- **반대 결함의 도달 가능한 코드 경로가 있다.** `InboundInspectionService.java:257-260`은 slip line을 찾지 못하거나 `productId`가 없으면 그 라인을 조용히 `continue`한다. 그런데 모든 라인 순회 뒤 `:291-292`에서 검수 전체를 `stockApplied=true`로 마킹한다. 그러면 누락 라인은 재고가 0 증가한 채 재호출도 막힌다. 현재 검수 행이 0건이므로 실발생 건수는 **0건**, 운영 발생 여부는 이 DB 기준 확인불가다.
- `normalQty<=0`이면 `:252-255`에서 0 증가하는 것은 정상수량 0이라는 의도된 결과다. 비상품/세트 제외(`:263-267`)도 정책상 no-op이다.
- DB에서 상태만 진행됐지만 재고가 없는 입고전표는 `INSPECTING` 이상 9건이나, 이는 서비스 우회 seed임을 확인했다. 실제 사용자 흐름의 “전표 complete 성공인데 재고 0” 사례로 세지 않는다.

## 확인 14 — 가입고(3) → DPS 비교(24)를 얹을 때 세 번째 반영 지점

- 레거시 가입고(3)는 `tools/legacy-gas/가입고처리/Index.html:641`에서 `PurchasesList`를 이카운트 구매전표 API로 보내며, 자체 inventory DB를 직접 가산하지 않는다.
- 레거시 품목별 DPS 비교(24)는 `tools/legacy-gas/품목별 DPS 입고내역 비교/Index.html:509-544`에서 매칭 결과를 만들고 렌더·노션 저장만 한다. 수동 저장도 `:715-727`의 노션 저장뿐이다. 현재 보관본에는 재고 반영 호출이 없다.
- 현행 DPS 비교도 아직 실입고 확정 경로가 아니다. `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsCompareController.java:72-80`은 VIEW 권한의 비교 응답만 반환하고, `DpsCompareService.java:76-113`은 출고전표 조회·엑셀 파싱·불일치 계산 후 DTO만 반환한다. StockBalance/StockLot/StockMovement 저장 의존성이 없다.
- 따라서 **현재 코드에서 DPS로 인한 세 번째 반영은 0건이며, 아직 그런 mutation 지점 자체가 없다.**
- 향후 개발책임자가 정한 `가입고 입고전표 → DPS 정상입고 비교 → 실입고 확정`을 구현할 때, 세 번째 반영이 생기는 정확한 위험 지점은 **DPS 비교 결과의 “실입고 확정” command handler**다. 여기서 DPS `actualQty`를 새 `StockService.inbound`/balance 가산으로 직접 기록하면 기존 (1) 전표 `/complete` 예정수량 가산, (2) `InboundInspectionService.completeInspection` 정상수량 가산에 이어 (3) DPS 확정수량 가산이 된다.
- DPS 확정 handler가 새 재고 쓰기를 만들지 않고 기존 검수 `/complete`만 호출하면 “세 번째 구현 경로”는 생기지 않는다. 그러나 전표 `/complete` 경로와의 교차 중복은 그대로 남는다. 이번 측정의 결론은 설계 제안이 아니라, **세 번째 반영 가능 위치가 DPS 비교 자체가 아니라 비교 후 확정 mutation 경계**라는 식별이다.

## 확인 15 — 같은 원천 키 반복 보조 집계

```sql
SELECT 'duplicate_inspection_headers_same_slip' AS metric, COUNT(*)::bigint AS groups
FROM (
  SELECT slip_no FROM inbound_inspections
  WHERE is_deleted=false GROUP BY slip_no HAVING COUNT(*)>1
) q
UNION ALL
SELECT 'repeated_inspection_movement_source',COUNT(*)
FROM (
  SELECT sm.reference_id,sm.product_id,sm.warehouse_id
  FROM stock_movements sm
  WHERE sm.is_deleted=false AND sm.movement_type='INBOUND'
    AND sm.reference_type='INBOUND_INSPECTION'
  GROUP BY sm.reference_id,sm.product_id,sm.warehouse_id HAVING COUNT(*)>1
) q
UNION ALL
SELECT 'repeated_lifecycle_lot_source',COUNT(*)
FROM (
  SELECT l.lot_no,l.product_id,l.warehouse_id
  FROM stock_lots l
  WHERE l.is_deleted=false
  GROUP BY l.lot_no,l.product_id,l.warehouse_id HAVING COUNT(*)>1
) q
UNION ALL
SELECT 'repeated_serial_source_groups',COUNT(*)
FROM (
  SELECT inbound_slip_no,product_code,warehouse_id
  FROM stock_instances
  WHERE is_deleted=false AND inbound_slip_no IS NOT NULL
  GROUP BY inbound_slip_no,product_code,warehouse_id HAVING COUNT(*)>1
) q;
```

```text
                 metric                 | groups
----------------------------------------+-------
 duplicate_inspection_headers_same_slip |      0
 repeated_inspection_movement_source    |      0
 repeated_lifecycle_lot_source          |      0
 repeated_serial_source_groups          |      0
(4 rows)
```

이 집계는 반복 키 선별용이며, 수량 2 이상 시리얼이나 같은 모델의 복수 정상 라인은 그 자체만으로 중복 확정이 아니다. 이번 DB에서는 그런 반복 후보조차 0그룹이다.

## 최종 판정

1. 두 재고 반영 경로는 실제로 존재하며 서로 다른 수량을 더한다. 전표 라이프사이클은 예정수량 전량, 검수 완료는 `검수수량-불량수량`을 더한다.
2. 현재 로컬 실데이터에서 같은 입고전표가 두 경로로 반영된 흔적은 **0건**이다. 중복 전표 0건, 중복 전표-모델-창고 그룹 0건, 교차 경로 수량 0이다.
3. 0건인 이유는 교차 가드가 막아서가 아니라 `inbound_inspections=0`, `INBOUND stock_movements=0`, `stock_lots=0`으로 실제 실행 조건이 아직 없기 때문이다. 사용자 생성 입고전표도 DRAFT 8건·CANCELED 4건뿐이다.
4. 두 경로는 UI/상태 조건상 선후 어느 방향으로도 함께 실행 가능하다. 각 경로 내부 재호출 가드는 있으나 서로를 확인하는 가드는 없다.
5. 한쪽만 실행되면 전표 경로는 예정수량 과다 가능성, 검수 경로는 전표 상태 정체가 생긴다. 검수의 product 매핑 누락 라인은 재고 0인 채 `stockApplied=true`가 될 수 있는 반대 결함도 코드상 존재하지만 실발생은 0건이다.
6. 현재 DPS 비교는 읽기/비교 전용이라 세 번째 반영은 없다. 가입고→DPS 실입고 확정을 새로 붙일 때 비교 뒤 확정 command가 직접 재고를 가산하는 순간 세 번째 경로가 된다.

## 완료 직전 재검증

보고서 필수 절과 UUID 값 노출 여부를 검사한 결과:

```text
ReportExists     : True
Bytes            : 33182
RequiredSections : 7
MissingSections  : 0
UuidValueMatches : 0
```

핵심 판정 SQL을 새로 다시 실행했다.

```sql
WITH inspection_route AS (
  SELECT i.slip_no,sm.product_id,sm.warehouse_id
  FROM stock_movements sm
  JOIN inbound_inspections i ON i.id=sm.reference_id AND i.is_deleted=false
  WHERE sm.is_deleted=false AND sm.movement_type='INBOUND'
    AND sm.reference_type='INBOUND_INSPECTION'
  GROUP BY i.slip_no,sm.product_id,sm.warehouse_id
), lifecycle_route AS (
  SELECT l.lot_no AS slip_no,sm.product_id,sm.warehouse_id
  FROM stock_movements sm
  JOIN stock_lots l ON l.id=sm.lot_id AND l.is_deleted=false
  WHERE sm.is_deleted=false AND sm.movement_type='INBOUND'
    AND sm.reference_type='INBOUND'
  GROUP BY l.lot_no,sm.product_id,sm.warehouse_id
)
SELECT
  (SELECT COUNT(*) FROM inbound_inspections WHERE is_deleted=false) AS inspections,
  (SELECT COUNT(*) FROM stock_movements
    WHERE is_deleted=false AND movement_type='INBOUND') AS inbound_movements,
  (SELECT COUNT(*) FROM stock_lots WHERE is_deleted=false) AS stock_lots,
  (SELECT COUNT(DISTINCT i.slip_no)
   FROM inspection_route i
   JOIN lifecycle_route l
     ON l.slip_no=i.slip_no AND l.product_id=i.product_id
    AND l.warehouse_id=i.warehouse_id) AS duplicated_slips;
```

```text
 inspections | inbound_movements | stock_lots | duplicated_slips
-------------+-------------------+------------+-----------------
           0 |                 0 |          0 |                0
(1 row)
```
