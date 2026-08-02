# PR #1046 / 이슈 #1000 R6 — postfix 재수렴 리뷰

## 0. 결론

**판정: BLOCKER. 머지 불가.**

HEAD `d70f667a3`의 `StockInstanceService`에서 `stock_instances.product_code`를 조건으로 쓰는 repository 직접 호출은 직전 보고와 같이 **15곳**이다. 그러나 15곳 모두가 `productId` 우선 후 빈 결과에만 fallback하도록 전환된 것은 아니다.

- ID 조회가 빈 경우에만 실행되는 정상 fallback: **8곳**
- ID 선조회 없는 코드 문자열 전용 호출: **7곳**
  - `requireExistsByCode()`가 null을 반환해야만 도달하는 호환 분기: **5곳**
  - production API에서 항상 도달 가능한 코드 전용 조회: **2곳** — FIFO 후보, 역-FIFO 회수 후보

실 DB에서 현재 노출·호출키 `AR05TXEAAWKNEU-01`과 legacy 저장키 `010001`을 대조했다. production 도달 가능한 두 지점은 모두 현재 호출키로 **0행**을 반환한다. FIFO는 legacy AVAILABLE **1행**, 회수 후보는 legacy SHIPPED **2행**을 놓친다. 직전 fix는 보상 2곳을 고쳤지만 계열 전체를 전환하지 않았다.

코드 수정, commit, push, checkout, 브랜치 조작, Docker 이미지 재빌드, DB write/DDL은 수행하지 않았다. DB 명령은 모두 `psql -c "SQL"` 및 `BEGIN TRANSACTION READ ONLY`로 실행했다.

## 1. 15개 호출 지점 전수 분류

파일: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java`

| # | 파일:줄 | 호출 용도 | ID 선조회 | 분류 |
|---:|---|---|---|---|
| 1 | `StockInstanceService.java:197` | ship 전 RESERVED, `product == null` 분기 | 없음 | **코드 전용** |
| 2 | `StockInstanceService.java:204` | ship 후 SHIPPED, `product == null` 분기 | 없음 | **코드 전용** |
| 3 | `StockInstanceService.java:220` | release RESERVED, `product == null` 분기 | 없음 | **코드 전용** |
| 4 | `StockInstanceService.java:275` | RESERVED count | `:272`의 ID count가 0일 때만 | fallback |
| 5 | `StockInstanceService.java:288` | 전표+상태 목록 | `:285`의 ID 목록이 empty일 때만 | fallback |
| 6 | `StockInstanceService.java:297` | AVAILABLE FIFO row lock | `:294`의 ID 목록이 empty일 때만 | fallback |
| 7 | `StockInstanceService.java:306` | RECALLED count | `:303`의 ID count가 0일 때만 | fallback |
| 8 | `StockInstanceService.java:314` | RECALLED 목록 | `:311`의 ID 목록이 empty일 때만 | fallback |
| 9 | `StockInstanceService.java:325` | SHIPPED 역-FIFO row lock | `:322`의 ID 목록이 empty일 때만 | fallback |
| 10 | `StockInstanceService.java:393` | unrecall helper, `product == null` 분기 | 없음 | **코드 전용** |
| 11 | `StockInstanceService.java:399` | unrecall helper fallback | `:396`의 ID 목록이 empty일 때만 | fallback |
| 12 | `StockInstanceService.java:407` | resell helper, `product == null` 분기 | 없음 | **코드 전용** |
| 13 | `StockInstanceService.java:413` | resell helper fallback | `:410`의 ID 목록이 empty일 때만 | fallback |
| 14 | `StockInstanceService.java:456` | FIFO 후보 read API | 없음 | **코드 전용, production 도달 가능** |
| 15 | `StockInstanceService.java:469` | 역-FIFO 회수 후보 read API | 없음 | **코드 전용, production 도달 가능** |

전수 검색 실행 원문:

```text
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:197:                ? repo.findByOutboundSlipNoAndProductCodeAndStatus(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:204:                ? repo.findByOutboundSlipNoAndProductCodeAndStatus(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:220:                ? repo.findByOutboundSlipNoAndProductCodeAndStatus(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:275:                : repo.countByOutboundSlipNoAndProductCodeAndStatus(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:288:                ? repo.findByOutboundSlipNoAndProductCodeAndStatus(outboundSlipNo, productCode, status)
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:297:                ? repo.findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAscForUpdate(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:306:                : repo.countByRecallSlipNoAndProductCodeAndStatus(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:314:                ? repo.findByRecallSlipNoAndProductCodeAndStatus(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:325:                ? repo.findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAscForUpdate(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:393:            return repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:399:                ? repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:407:            return repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:413:                ? repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:456:        return repo.findByProductCodeAndStatusOrderByReceivedAtAsc(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:469:        return repo.findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAsc(
```

`ProductClient.requireExistsByCode()`는 정상 응답을 `ProductSummary`로 변환해 반환하고 null을 반환하는 분기가 없다.

```text
147:    public ProductSummary requireExistsByCode(String productCode) {
181:        return objectMapper.convertValue(raw, ProductSummary.class);
```

따라서 `:197`, `:204`, `:220`, `:393`, `:407`의 코드 전용 분기는 production 정상 호출에서는 도달하지 않는다. 단위 테스트 mock 호환용으로 남은 분기다. 반면 `:456`, `:469`는 controller GET API에서 직접 호출되며 ProductClient 해소 단계가 전혀 없다.

## 2. 코드 전용 7곳 실측

측정 기준:

- productId: `01949ab7-e922-35c6-b289-5337d867a0ee`
- 현재 노출·호출키: `AR05TXEAAWKNEU-01`
- inventory legacy 저장키: `010001`
- 활성 `stock_instances`: 3행 — AVAILABLE 1, SHIPPED 2, RESERVED 0, RECALLED 0

| 파일:줄 | 현재키 결과 | legacy키 결과 | ID 결과 | 판정 |
|---|---:|---:|---:|---|
| `:197` ship 전 RESERVED null 분기 | 0 | 0 | 0 | 현재 RESERVED 표본 없음; production null 분기 도달 불가 |
| `:204` ship 후 SHIPPED null 분기 | 0 | 1 | 1 | 실제 SHIPPED 표본에서는 문자열 false-negative이나 production null 분기 도달 불가 |
| `:220` release RESERVED null 분기 | 0 | 0 | 0 | 현재 RESERVED 표본 없음; production null 분기 도달 불가 |
| `:393` unrecall null 분기 | 0 | 0 | 0 | 현재 RECALLED 표본 없음; production null 분기 도달 불가 |
| `:407` resell null 분기 | 0 | 0 | 0 | 현재 RECALLED 표본 없음; production null 분기 도달 불가 |
| `:456` FIFO 후보 | **0** | **1** | **1** | **실 legacy AVAILABLE 1행 누락 — BLOCKER** |
| `:469` 역-FIFO 회수 후보 | **0** | **2** | **2** | **실 legacy SHIPPED 2행 누락 — BLOCKER** |

즉 “legacy 행에서 0행을 찾는가”에 대한 답은 다음과 같다.

- production 도달 가능한 잔존 2곳: **둘 다 0행**. 각각 실제 대상 1행과 2행을 놓친다.
- production 도달 불가능한 null 분기 5곳: 현재키 결과는 전부 0행이다. 다만 `:204`만 현재 실 SHIPPED 표본 1행으로 false-negative가 확인됐고, 나머지 네 곳은 RESERVED/RECALLED 실표본이 0이라 false-negative를 실증할 대상 자체가 없다.

실행 원문:

```text
BEGIN
                      point                      | current_code_rows | legacy_code_rows | product_id_rows
-------------------------------------------------+-------------------+------------------+-----------------
 L194 ship pre / product==null / RESERVED        |                 0 |                0 |               0
 L201 ship post / product==null / SHIPPED        |                 0 |                1 |               1
 L217 release / product==null / RESERVED         |                 0 |                0 |               0
 L386 unrecall helper / product==null / RECALLED |                 0 |                0 |               0
 L400 resell helper / product==null / RECALLED   |                 0 |                0 |               0
 L449 fifo candidates / AVAILABLE                |                 0 |                1 |               1
 L462 recall candidates / SHIPPED                |                 0 |                2 |               2
(7 rows)

COMMIT
```

위 출력의 `L194` 등은 PowerShell `Get-Content`의 물리 줄 계수로 붙인 측정 label이고, 파일:줄 목록의 기준은 git/rg가 보고한 `:197`, `:204`, `:220`, `:393`, `:407`, `:456`, `:469`이다.

## 3. 두 순차 PESSIMISTIC_WRITE 조회의 잠금·경합

### 3.1 데드락

**새 순환 잠금 순서는 확인되지 않았다.** helper의 제어 흐름은 다음 두 경우로 상호 배타적이다.

1. ID 조회 결과가 있음: ID 행만 잠그고 즉시 반환한다. 코드 조회를 실행하지 않는다.
2. ID 조회 결과가 없음: 잠긴 tuple이 없는 상태에서 코드 조회를 실행한다.

따라서 한 helper 호출이 ID 집합과 code 집합을 모두 잠근 뒤 다른 호출과 반대 순서로 기다리는 구조가 아니다. 현재 DB 통계의 deadlock도 0이다. 단, 이 값은 PostgreSQL 통계 reset 이후 누계일 뿐 미래 안전성을 증명하지는 않는다.

```text
   datname    | deadlocks
--------------+-----------
 inventory_db |         0
(1 row)
```

### 3.2 timeout·지연

**timeout/지연 가능성은 0이 아니다.**

- 같은 `recallSlipNo + productCode`는 기존 `pg_advisory_xact_lock`이 먼저 직렬화한다.
- 하지만 같은 productId를 서로 다른 별칭 문자열로 호출하면 advisory key가 달라진다. 두 트랜잭션이 같은 ID 행을 `PESSIMISTIC_WRITE`로 잡으려 하면 후행 호출은 repository hint의 3초 timeout에 걸릴 수 있다.
- 실제 스키마에는 `(recall_slip_no, product_id, status)` 복합 인덱스가 없다. code축에는 `ix_stock_instances_recall_slip(recall_slip_no, product_code, status)`가 있지만 ID축은 단일 `ix_stock_instances_product(product_id)`뿐이다. 데이터가 커지면 선행 ID 조회의 탐색 시간이 늘 수 있다.
- ID 결과가 0일 때는 SELECT가 한 번 더 실행되므로 DB round trip과 relation-level lock 보유 시간은 증가한다. 다만 빈 ID 조회가 tuple lock을 남기지는 않는다.

현재 테이블이 3행이라 planner는 두 쿼리 모두 seq scan을 선택했다. 이 결과는 운영 규모 성능을 대신하지 않는다.

```text
                indexname                 | indexdef
------------------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 idx_stock_instances_inbound_slip_product | CREATE INDEX idx_stock_instances_inbound_slip_product ON public.stock_instances USING btree (inbound_slip_no, product_id) WHERE (is_deleted = false)
 ix_stock_instances_fifo                  | CREATE INDEX ix_stock_instances_fifo ON public.stock_instances USING btree (product_code, status, received_at)
 ix_stock_instances_fifo_wh               | CREATE INDEX ix_stock_instances_fifo_wh ON public.stock_instances USING btree (product_code, warehouse_id, status, received_at) WHERE (is_deleted = false)
 ix_stock_instances_outbound_slip         | CREATE INDEX ix_stock_instances_outbound_slip ON public.stock_instances USING btree (outbound_slip_no, product_code, status) WHERE ((outbound_slip_no IS NOT NULL) AND (is_deleted = false))
 ix_stock_instances_product               | CREATE INDEX ix_stock_instances_product ON public.stock_instances USING btree (product_id)
 ix_stock_instances_recall                | CREATE INDEX ix_stock_instances_recall ON public.stock_instances USING btree (outbound_partner_code, product_code, status, outbound_at)
 ix_stock_instances_recall_slip           | CREATE INDEX ix_stock_instances_recall_slip ON public.stock_instances USING btree (recall_slip_no, product_code, status) WHERE ((recall_slip_no IS NOT NULL) AND (is_deleted = false))
(7 rows)
```

판정: **helper가 새 데드락 사이클을 만들었다는 증거는 없음. 별칭 동시호출 row-lock timeout과 ID축 인덱스 부족에 따른 지연 가능성은 있음.** 이번 BLOCKER의 직접 원인은 잠금이 아니라 남은 production 코드 전용 조회 2곳이다.

## 4. ID와 code가 모두 결과를 내지만 서로 다른 행인 실데이터

**현재 실데이터: 0건.**

- 활성 RECALLED 행: 0행 / recall slip 0개
- 해당 품목 전체 활성 재고: ID축 3행, 현재 노출 code축 0행
- helper 조건에서 양축이 동시에 결과를 내면서 다른 행을 가리키는 scope: 0개

```text
 active_recalled_rows | active_recall_slips
----------------------+---------------------
                    0 |                   0
(1 row)

 both_axis_different_row_scopes
--------------------------------
                              0
(1 row)
```

현재 helper는 ID 결과가 있으면 code 결과를 조회하지 않으므로 양쪽 결과의 합집합이나 일치 여부를 검사하지 않는다. 따라서 미래에 그런 오염 데이터가 생기면 ID 결과만 선택한다. 이번 DB에는 이를 실증할 RECALLED 표본이 없으며 합성 데이터를 만들지 않았다.

## 5. 닫힌 축 회귀

### 5.1 3축 CONFLICT

fresh read-only 재측정 결과는 **0/1,320**이다.

```text
 conflict_values | conflict_candidate_rows | same_uuid_multi_axis_values | total_lookup_values
-----------------+-------------------------+-----------------------------+---------------------
               0 |                       0 |                           0 |                1320
(1 row)
```

### 5.2 오선택

활성 inventory 3행은 모두 기대 productId이며 잘못되거나 null인 productId는 0행이다. 현재 노출 문자열 저장행은 0, legacy 저장행은 3이다.

```text
 active_rows | expected_product_id_rows | wrong_or_null_product_id_rows | current_code_rows | legacy_code_rows
-------------+--------------------------+-------------------------------+-------------------+------------------
           3 |                        3 |                             0 |                 0 |                3
(1 row)
```

창고·상태 predicate도 유지된다.

```text
 reserve_id_exact | reserve_id_excluded_by_scope | recall_id_candidates | recall_wrong_partner_marker_rows
------------------+------------------------------+----------------------+----------------------------------
                1 |                            2 |                    2 |                                0
(1 row)
```

판정: **CONFLICT 0/1,320 유지, 현재 실데이터 오선택 0행 유지.**

## 6. 최종 판정

| 항목 | 판정 |
|---|---|
| 15개 호출 계열 전환 완료 여부 | **FAIL — fallback 8, 코드 전용 7** |
| production 도달 가능한 코드 전용 조회 | **FAIL — 2곳** |
| FIFO legacy AVAILABLE | **FAIL — 현재키 0 / 실제 대상 1** |
| 회수후보 legacy SHIPPED | **FAIL — 현재키 0 / 실제 대상 2** |
| helper 새 데드락 사이클 | 확인되지 않음 |
| helper timeout/지연 | 가능성 있음 — 별칭별 advisory key, 3초 row lock timeout, ID 복합 인덱스 없음 |
| 양축 모두 결과·서로 다른 행 | 현재 실데이터 0건; RECALLED 표본 0 |
| 3축 CONFLICT | PASS — 0/1,320 |
| 오선택 | PASS — 0행 |

**종합 BLOCKER.** 직전 fix는 `unrecallBatch`·`resellBatch`를 수렴시켰지만, `fifoCandidates`와 `recallCandidates`가 여전히 현재 노출 문자열을 legacy `stock_instances.product_code`에 직접 대입한다. 실제 3행 중 각각 1행과 2행을 0행으로 반환하므로 PR #1046은 아직 머지할 수 없다.

## 7. 이 라운드가 보지 않은 것

- 코드 수정 및 수정안 설계는 수행하지 않았다.
- inventory 544 tests / product 626 tests는 재실행하지 않았다. 직전 GREEN 주장을 이번 라운드의 새 성공 증거로 재인용하지 않는다.
- DB write와 합성 데이터가 금지되어 RESERVED 또는 RECALLED 상태를 만들지 않았다. 따라서 표본이 0인 null 호환 분기 네 곳의 legacy false-negative는 실 상태 전이로 재현하지 않았다.
- 동시 트랜잭션을 발생시키는 부하·lock-timeout 재현은 수행하지 않았다. 현재 lock 구조, 인덱스, DB 누계 통계만 조사했다.
- Docker 이미지 재빌드와 공유 스택 재기동은 수행하지 않았다.
- PR #1058·#1024의 `ProductService.java` 변경은 보지 않았고 이 워크트리 HEAD만 판단했다.
- 전체 서비스의 모든 `productCode` 사용처가 아니라 요청된 `StockInstanceService`의 `stock_instances` 코드 조회 계열 15곳을 조사했다.

## 8. 새 파일 경로

```text
docs/dev-reports/2026-08-02-1000-r6-postfix-reconvergence.md
```
