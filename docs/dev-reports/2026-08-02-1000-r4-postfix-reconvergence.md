# PR #1046 / 이슈 #1000 R4 — postfix 재수렴 리뷰

## 0. 결론

**판정: BLOCKER 1건. 머지 불가.**

`lookupSummaryByProductCode`의 3축 후보 수집 자체는 실 데이터에서 정상 조회를 막지 않는다. 활성 조회값 1,320개 중 서로 다른 UUID로 수렴하는 CONFLICT 값은 **0개**다. reserve/ship/release/recall의 새 ID 우선 쿼리도 창고·상태·전표·거래처 조건을 유지하므로 현재 재고 3행에서 다른 창고·상태·전표·거래처 행을 잘못 선택하는 경우는 **0행**이다.

그러나 fix가 `recallBatch`만 ID 우선으로 넓히고 그 직후의 역연산인 `unrecallBatch`, 후속 운영 경로인 `resellBatch`는 `recallSlipNo + productCode + RECALLED` 문자열 조회로 남겼다. 실 legacy SHIPPED 2행은 저장키가 `010001`, 노출·호출키가 `AR05TXEAAWKNEU-01`이다. 따라서 새 recall은 이 **2행을 UUID로 회수할 수 있지만**, 그 행의 `product_code`를 바꾸지 않으므로 보상 unrecall과 재판매는 같은 호출키로 **0행**을 찾는다. 현재 RECALLED 행과 실제 회수 전표는 0건이라 이미 발생한 잔류는 없지만, 실제 존재하는 2행 모두에서 결정적으로 재현 가능한 비대칭이다.

검토 기준은 요청대로 워크트리 HEAD `dd80863f694424ca51b68784b65919df74716558`뿐이다. 코드 수정, commit, push, checkout, 브랜치 조작, Docker 이미지 재빌드, DB write/DDL은 수행하지 않았다. 모든 DB 조회는 `BEGIN TRANSACTION READ ONLY`로 실행했다.

## 1. fix가 만든 새 표면 목록

| 번호 | 새 표면 | 실측 | 판정 |
|---|---|---:|---|
| S1 | `product_code / alias_code / model_name` 3축 후보 간 서로 다른 품목 충돌 | CONFLICT 값 0/1,320 | PASS |
| S2 | reserve의 `productId + warehouse + AVAILABLE` 우선 조회와 code fallback | 의도된 UUID 신규 포착 1행, 오선택 0행 | PASS |
| S3 | recall의 `productId + partner + SHIPPED` 우선 조회와 code fallback | 의도된 UUID 신규 포착 2행, 다른 거래처 오선택 0행 | PASS |
| S4 | ship/release의 `outboundSlipNo + productId + status` 우선 조회 | 현재 RESERVED 0행; 현재 데이터의 다른 전표·상태 오선택 0행 | PASS(현재 실데이터 범위) |
| S5 | ID 결과가 일부만 있고 code-only 행이 추가로 있는 혼합 집합에서 fallback이 생략되는 경우 | 활성 3행 모두 productId 존재, 혼합 키 0건 | PASS(현재 실데이터 범위) |
| S6 | recall 이후 compensation `unrecallBatch`의 축 대칭성 | 회수 가능 legacy SHIPPED 2행, 같은 노출키로 unrecall 가능 0행 | **BLOCKER** |
| S7 | recall 이후 `resellBatch`의 축 대칭성 | 회수 가능 legacy SHIPPED 2행, 같은 노출키로 resell 가능 0행 | **BLOCKER와 동일 원인/표면** |
| S8 | slip / partner-order / accounting의 product 조회 의미 | 새 `/lookup-by-code` production 소비자는 inventory 1곳뿐; 세 서비스 직접 소비 0곳 | 직접 영향 없음 |

## 2. S1 — 3축 CONFLICT가 정상 조회를 막는가

### 2.1 실측 방법

활성 `products.product_code`, 활성 alias가 가리키는 활성 품목의 `product_aliases.alias_code`, 활성 `products.model_name`을 하나의 후보 집합으로 합쳤다. 서비스 코드와 동일하게 값을 trim하고, lookup 값별 `count(DISTINCT product_id)`가 2 이상인 값을 CONFLICT로 셌다.

### 2.2 실행 원문

```text
BEGIN
 conflict_values | conflict_candidate_rows | same_uuid_multi_axis_values | total_lookup_values 
-----------------+-------------------------+-----------------------------+---------------------
               0 |                       0 |                           0 |                1320
(1 row)

 lookup_value | axis | product_id 
--------------+------+------------
(0 rows)

COMMIT
```

### 2.3 판정

- 서로 다른 UUID로 수렴하는 값: **0개**
- 그 충돌에 포함되는 후보 행: **0행**
- 같은 UUID가 둘 이상의 축에 중복 매칭되는 값: **0개**
- 전체 활성 lookup 값: **1,320개**

따라서 현재 실 데이터에서는 3축 확장 때문에 이전 정상 조회가 CONFLICT로 막히는 건수는 **0건**이다. 코드상 향후 충돌 값이 생기면 임의 우선순위 반환이 아니라 CONFLICT로 차단하는 동작은 요구한 무결성 정책과 일치한다.

## 3. S2/S3 — ID 우선 조회가 엉뚱한 재고를 잡는가

### 3.1 재고 실데이터 모양

```text
BEGIN
 active_rows | product_ids | stored_codes | warehouses 
-------------+-------------+--------------+------------
           3 |           1 |            1 |          1
(1 row)

 product_code |  status   | rows | warehouses | partners | outbound_slips | recall_slips 
--------------+-----------+------+------------+----------+----------------+--------------
 010001       | AVAILABLE |    1 |          1 |        0 |              0 |            0
 010001       | SHIPPED   |    2 |          1 |        2 |              2 |            0
(2 rows)

COMMIT
```

해당 productId는 product DB의 활성 품목 1건과 정확히 연결되고, 저장 `product_code=010001`도 그 같은 품목의 legacy 코드다. 다른 품목 UUID를 가리키는 오염 행은 **0행**이다.

```text
BEGIN
 product_id_match | id_code_match | id_model_match 
------------------+---------------+----------------
                1 |             1 |              0
(1 row)

 product_code |    model_name     | status | inventory_qty_mgmt 
--------------+-------------------+--------+--------------------
 010001       | AR05TXEAAWKNEU-01 | ACTIVE | t
(1 row)

 candidate_rows | distinct_products |     axes     
----------------+-------------------+--------------
              1 |                 1 | product_code
(1 row)

COMMIT
```

### 3.2 reserve 범위

새 쿼리는 productId만 보는 것이 아니라 `productId + warehouseId + AVAILABLE`을 모두 건다. 현재 productId 전체 3행 중 정확한 창고·상태 후보는 1행이고, 다른 상태 2행은 쿼리 조건에서 제외된다. 노출 모델명 code fallback은 0행이다.

```text
BEGIN
 reserve_id_exact | reserve_code_fallback | reserve_id_rows_excluded_by_scope 
------------------+-----------------------+-----------------------------------
                1 |                     0 |                                 2
(1 row)
```

실측 판정:

- UUID로 새로 정상 포착되는 AVAILABLE 행: **1행**
- 다른 창고 포착: **0행** (활성 창고 자체가 1개이며 warehouse 조건 유지)
- 다른 상태 포착: **0행** (SHIPPED 2행은 상태 조건으로 제외)
- 다른 품목 포착: **0행** (productId와 legacy code가 같은 활성 품목으로 수렴)

### 3.3 recall 범위

새 쿼리는 `outboundPartnerCode + productId + SHIPPED`를 모두 건다. SHIPPED 2행은 서로 다른 거래처 범위 2개다. 각 호출은 자기 거래처 행만 찾으며 상대 거래처 행을 잡지 않는다.

```text
 recall_id_candidates | recall_code_candidates | recall_rows_unrecall_would_miss | recall_partner_scopes 
----------------------+------------------------+---------------------------------+-----------------------
                    2 |                      0 |                               2 |                     2
(1 row)

 reserved_rows | recalled_rows | null_product_id_rows 
---------------+---------------+----------------------
             0 |             0 |                    0
(1 row)

COMMIT
```

실측 판정:

- UUID로 새로 정상 포착 가능한 SHIPPED 행: **2행**
- 서로 다른 거래처 scope: **2개**
- 다른 거래처 오선택: **0행** (`outboundPartnerCode` 조건 유지)
- `productId IS NULL` legacy fallback 대상: **0행**
- ID 결과 일부 + code-only 추가 행의 혼합 집합: **0건** (활성 3행 모두 동일한 유효 productId 보유)

현재 데이터에서는 ID 우선으로 인해 지금까지 잡히던 행이 안 잡히거나, 다른 창고·상태·거래처의 행이 잡히는 경우는 **0행**이다.

## 4. S4 — ship/release complete·보상 대칭성

### 4.1 outbound ship/release

`findBySlipAndStatus`는 `outboundSlipNo + productId + status`로 조회하고 ID 결과가 비었을 때만 기존 `outboundSlipNo + productCode + status`로 fallback한다. 따라서 reserve가 기록한 같은 전표 마커와 같은 productId의 RESERVED 행만 ship/release가 찾는다. 현재 RESERVED 행은 **0행**이라 진행 중 예약의 실표본은 없지만, 현재 SHIPPED 2행은 서로 다른 outbound slip 2개이고 slip 조건이 쿼리에 남아 있어 다른 전표 행을 선택하는 경우는 **0행**이다.

현재 실데이터에서:

- RESERVED: **0행**
- SHIPPED: **2행 / outbound slip 2개**
- ship/release가 다른 상태를 선택: **0행** (`status=RESERVED` 고정)
- ship이 다른 전표를 선택: **0행** (`outboundSlipNo` 고정)
- ID 일부 결과 때문에 code fallback 추가 행이 누락되는 혼합 전표: **0건**

현재 RESERVED 실표본이 없으므로 “실제 진행 중 reserve → complete/reject”의 상태 전이는 이번 라운드에서 실행하지 않았다. DB write 금지 때문에 상태를 만들어 검증하지도 않았다.

### 4.2 BLOCKER — recall의 보상 unrecall은 같은 축이 아니다

slip-service는 recall 성공 직후 동일한 `product.productCode()`를 보상 클로저에 캡처한다.

```text
services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:1102: String productCode = product.productCode();
services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:1103: inventoryClient.recallInstances(..., productCode, ...);
services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:1106: () -> inventoryClient.unrecallInstances(..., productCode)
```

HEAD의 응답 매핑에서 이 값은 모델명이다.

```text
services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductSummaryResponse.java:150: private static String exposedProductCode(Product p) {
services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductSummaryResponse.java:151:     return p.getModelName();
```

하지만 inventory의 두 방향은 비대칭이다.

```text
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:322: .findByOutboundPartnerCodeAndProductIdAndStatusOrderByOutboundAtDescIdAscForUpdate(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:344: List<StockInstance> recalled = repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:377: List<StockInstance> candidates = repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
```

`StockInstance.recall(recallSlipNo)`는 `status`와 `recallSlipNo`만 바꾸며 `product_code`는 바꾸지 않는다. 따라서 실제 legacy SHIPPED 2행은 다음과 같이 수렴한다.

1. recall 입력 `AR05TXEAAWKNEU-01` → 3축 lookup으로 해당 productId 해소.
2. ID+거래처+SHIPPED 쿼리 → legacy 저장키 `010001` 행을 정상 포착.
3. recall 전이 후에도 저장키는 `010001` 유지.
4. 이후 compensation unrecall 또는 resell 입력은 같은 노출값 `AR05TXEAAWKNEU-01`.
5. code-only 쿼리 `product_code='AR05TXEAAWKNEU-01'` → **0행**.

실측:

- 새 recall이 포착할 수 있는 실제 legacy SHIPPED: **2행**
- 같은 노출키의 code 조회: **0행**
- recall 뒤 unrecall이 놓칠 실제 후보: **2행**
- recall 뒤 resell이 놓칠 실제 후보: **2행**
- 현재 RECALLED: **0행**
- 현재 해당 품목의 INBOUND RETURN/RETURN_TRIP 전표: **0전표 / 0라인 / 0수량**
- 현재 미해소 compensation audit: **0건**

현재 잔류 사고는 0건이지만, fix가 실제 2행에 대해 정방향 recall만 새로 열고 역방향을 닫아 둔 결정적 회귀다. 회수 완료 중 후속 라인이 실패하면 보상 호출은 성공 HTTP/no-op로 끝날 수 있고, 앞서 회수된 행은 RECALLED에 남는다. `resellBatch`도 같은 이유로 해당 회수품을 AVAILABLE로 복귀시키지 못한다. **머지 차단 결함**으로 판정한다.

## 5. S8 — slip / partner-order / accounting 코드 조회 의미

`lookupSummaryByProductCode`가 연결된 `/products/internal/lookup-by-code`의 production 참조를 전체 서비스에서 검색한 결과는 producer와 inventory consumer 두 파일뿐이다.

```text
services\inventory-service\src\main\java\com\samhanair\logis\inventory\client\ProductClient.java
services\product-service\src\main\java\com\samhanair\logis\product\web\ProductInternalController.java
```

- slip-service: 직접 `/lookup-by-code` 호출 **0곳**. 기존 UUID bulk lookup 및 `/lookup-by-model`을 사용한다.
- partner-order-service: 직접 `/lookup-by-code` 호출 **0곳**. `/lookup-by-model-codes`를 사용한다.
- accounting-service: 직접 `/lookup-by-code` 호출 **0곳**. `/lookup-by-model`, `/lookup-by-label`, `/lookup-by-label-bulk`를 사용한다.
- HEAD fix diff에서 slip / partner-order / accounting 수정 파일: **0개**.

따라서 3축 lookup 확장이 이 세 서비스의 직접 코드 조회 의미를 바꾸는 곳은 **0곳**이다. 다만 slip-service는 inventory의 reserve/ship/release/recall/unrecall API를 호출하므로, §4의 inventory 비대칭에 **간접 영향**을 받는다.

## 6. 최종 판정

| 항목 | 판정 |
|---|---|
| 3축 CONFLICT 실데이터 | PASS — 0/1,320 |
| ID 우선 reserve 오선택/누락 | PASS — 현재 오선택 0행, 의도된 legacy 1행 포착 |
| ID 우선 recall 오선택/누락 | PASS — 현재 오선택 0행, 의도된 legacy 2행 포착 |
| ship/release 다른 전표·상태 오선택 | PASS — 현재 0행; RESERVED 실표본 없음 |
| recall → unrecall/resell 축 대칭성 | **BLOCKER — 실제 legacy 후보 2행 모두 역방향 0행 조회** |
| 다른 서비스 직접 조회 의미 | PASS — 직접 소비 0곳 |

**종합: BLOCKER.** CONFLICT와 ID 우선 본체는 실데이터에서 정상이나, fix가 새로 가능하게 만든 legacy recall의 보상·재판매 역경로가 같은 식별축으로 전환되지 않았다. 이 비대칭이 해소되고 실제 legacy 행 기준 정방향/역방향 재수렴이 다시 확인되기 전에는 PR #1046을 머지하면 안 된다.

## 7. 이 라운드가 보지 않은 것

- 직전 R3가 보고한 product-service 626 tests / inventory-service 542 tests 전체 GREEN은 재실행하지 않았다. 이번 라운드는 합성 데이터·목업 금지 조건에 따라 실 DB와 HEAD 코드의 새 표면만 검토했다.
- DB write 금지 때문에 실제 행을 RESERVED/RECALLED로 전이하거나 API mutation을 호출하지 않았다.
- 현재 RESERVED 0행이므로 진행 중 reserve → ship/release의 실제 상태 전이 표본은 조사하지 못했다. 코드 predicate와 현재 행 분포만 검증했다.
- 현재 INBOUND RETURN/RETURN_TRIP 0전표이므로 이미 발생한 recall compensation 사건의 재연은 하지 않았다. 대신 실제 SHIPPED 2행과 불변인 저장키를 이용해 양 방향 predicate 결과를 읽기 전용으로 계산했다.
- 동시성, advisory lock 충돌, row-lock timeout, 격리 수준별 race는 조사하지 않았다.
- soft-deleted product/alias/stock 행, 다른 환경·운영 DB, PR #1058·#1024의 변경은 보지 않았다.
- UI 표시, QA 스크린샷, CI 상태, GitHub PR 본문/코멘트는 보지 않았다.
- 성능 계획(`EXPLAIN ANALYZE`)과 인덱스 효율은 조사하지 않았다.

## 8. 새로 만든 파일

- `docs/dev-reports/2026-08-02-1000-r4-postfix-reconvergence.md`

기존 보고서의 덮어쓰기·축약은 없고, 신규 파일은 위 1개뿐이다.
