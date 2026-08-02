# PR #1046 재수렴 적대검증 — fix가 정상 경로를 막는가

## 1. 결론

**판정: 도달 가능한 BLOCKER가 있다.**

`ProductSummaryResponse.productCode`를 `model_name`으로 바꾼 100품목 중 100품목 모두가 `lookup-by-code`의 현재 계약인 `products.product_code` exact 또는 `product_aliases.alias_code`로 다시 조회되지 않는다. 이 중 시리얼 관리 품목은 95개다.

실 DB의 현재 도달 가능한 정상 경로에서는 `SENT` 출고전표 **19건 / 29라인 / 수량 58**이 수락 시 새 모델명을 inventory-service에 넘기고, inventory-service가 그 값을 다시 코드 조회하면서 404 계열로 차단된다. 기존 `stock_instances`도 **3행(AVAILABLE 1, SHIPPED 2)** 모두 옛 순번코드 `010001`을 키로 보유하여 새 모델명 `AR05TXEAAWKNEU-01`과 불일치한다.

반대로 재고 현황·Excel·안전재고처럼 UUID로 ProductSummary를 조회한 뒤 표시만 하는 경로와 데스크톱 행 키는 이번 실 DB에서 차단 0건이었다.

## 2. 조사 원칙과 기준

- HEAD: `9a96262fdfd4adece9b790c402bdfed437aaa56a`
- DB 접근은 모두 `docker exec samhan-postgres psql ... -c "SQL"` 읽기 전용으로 수행했다.
- Docker 이미지 재빌드, DB write/DDL, 합성 데이터, 목업을 수행하지 않았다.
- **fix가 새로 만든 회귀만 차단 건수로 센다.** fix 전 노출값도 이미 재조회 불가였던 1,120품목은 별도 표기하고 이번 회귀 건수에 더하지 않았다.
- “현재 행 수”와 “다음 합법 상태 전이에서 실제 차단되는 수”를 구분했다.

## 3. 조사한 표면과 차단 건수

| 표면 | 실 DB 기존 행 분포 | fix 때문에 막히는 건수 | 근거 |
|---|---:|---:|---|
| product-service `productCode` 재조회 | 활성 1,220품목 | **100품목** | 변경된 100품목은 fix 전 순번코드 exact 조회 성공, fix 후 모델명 exact/alias 조회 0건. 시리얼 95, batch 5. |
| slip-service → inventory-service 시리얼 출고 수락 | 회귀대상 `SENT` 출고 19전표 / 29라인 / 수량 58 | **19전표 / 29라인 / 수량 58** | `SlipService.accept`가 ProductSummary의 새 값을 `reserveInstances`로 전달하고 `StockInstanceService.reserveBatch`가 그 값을 `requireExistsByCode`로 재조회한다. 전표별 첫 회귀대상 시리얼 라인에서 차단된다. |
| slip-service 반품/회차 complete | 현재 회귀대상 `INBOUND PROCESSING + RETURN/RETURN_TRIP` 0전표 | **0전표 / 0라인** | 같은 재조회 결함은 존재하지만 현재 해당 상태의 실 행은 0이다. 미래 행을 현재 결함 0으로 일반화하지 않는다. |
| 기존 `stock_instances.product_code` 키 | 활성 3행(AVAILABLE 1, SHIPPED 2) | **3행** | 3행 모두 저장키 `010001`, 새 노출값 `AR05TXEAAWKNEU-01`; 새 값과 일치 0, 옛 값과 일치 3. 예약·회수 경로는 새 값 재조회에서 먼저 막힌다. |
| 재고 현황 화면/API | `stock_balances` 활성 201행 / 101품목 | **0행** | ProductClient UUID lookup으로 표시값만 enrich. Product 매핑 누락 0, 창고 매핑 누락 0. |
| 재고 Excel 내보내기 | 원천 `stock_balances` 201행 | **0행** | UUID로 조회한 ProductSummary의 `productCode`를 셀에 기록할 뿐 코드 재조회·키 매칭 없음. 값은 모델명으로 바뀌지만 행은 막히지 않는다. |
| 안전재고 알림 | `safety_stock_configs` 활성 5행 / 3품목 | **0행** | config의 `product_id`로 batch lookup 후 label 표시. 코드로 재조회하지 않는다. |
| DPS 비교·집계 | `dps_save_history` 활성 0행 | **0행(현재 저장 행 기준)** | 비교 키는 업로드 DPS의 코드와 slip-service의 전표 라인 코드이며 ProductSummary 새 값을 재조회하지 않는다. 저장 이력이 0이므로 기존 저장 payload 회귀는 실측 불가다. |
| stock lots / movements / audit lines | lots 3행, movements 40행, audit lines 45행 | **0행** | 해당 행의 연계축은 product UUID이며 ProductSummary 노출 코드로 다시 조회하지 않는다. |
| partner-order-service ProductClient | 활성 주문 2,021건 / 2,052라인 | **0행(이번 fix 원인)** | client `ProductSummary`에는 `productCode` 필드 자체가 없고 UUID/modelName 축을 쓴다. 실 DB product UUID 미해결 2라인은 있었으나 fix 전부터 존재한 별도 데이터 문제라 회귀 수에 넣지 않았다. |
| 데스크톱 `InventoryStockBalancePage` 행 키 | 렌더 대상 기존 201행 | **중복 0그룹 / 사라지는 행 0행** | 새 `modelName-warehouseCode` 계산 결과 중복 그룹 0, 영향 행 0. product/warehouse 매핑 누락도 각각 0. |
| 옛 순번코드 조회 | 활성 `product_code` 100개, 활성 alias 0행 | **0건 차단** | 옛 순번코드 exact는 100/100 해결, 실패 0. 실제 alias 행은 0이라 alias fallback의 실 행 검증은 불가하며 정적 경로만 확인했다. |

## 4. 차단 경로의 코드 도달성

### 4.1 새 노출값이 다시 코드 조회로 들어간다

1. `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductSummaryResponse.java:118-151` — 응답 `productCode`에 `modelName`을 넣는다.
2. `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:862-880` — `SENT → ACCEPTED`에서 `product.productCode()`를 `reserveInstances`에 전달한다.
3. `services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/ProductClient.java:147-168` — `/products/internal/lookup-by-code`를 호출한다.
4. `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:153-178` — 재고 후보 조회 전 `requireExistsByCode(productCode)`를 반드시 통과시킨다.
5. `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:219-229` — 허용 조회축은 `product_code` exact, 실패 시 `product_aliases.alias_code`뿐이다. `model_name` 조회는 없다.

따라서 모델명 노출 자체는 맞더라도 동일 필드를 표시값과 재고 그룹키로 겸용하는 현재 wire 계약에서는 정상 출고 수락이 차단된다.

### 4.2 fix 전후의 순증 회귀

실행 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; WITH active AS (SELECT p.*,c.serial_managed,CASE WHEN p.model_code IS NOT NULL AND btrim(p.model_code)<>'' THEN p.model_code ELSE p.product_code END AS old_exposed,p.model_name AS new_exposed FROM products p JOIN categories c ON c.id=p.category_id AND NOT c.is_deleted WHERE NOT p.is_deleted), flags AS (SELECT a.*, (EXISTS(SELECT 1 FROM products q WHERE NOT q.is_deleted AND q.product_code=btrim(a.old_exposed)) OR EXISTS(SELECT 1 FROM product_aliases pa WHERE NOT pa.is_deleted AND pa.alias_code=btrim(a.old_exposed))) AS old_resolves, (EXISTS(SELECT 1 FROM products q WHERE NOT q.is_deleted AND q.product_code=btrim(a.new_exposed)) OR EXISTS(SELECT 1 FROM product_aliases pa WHERE NOT pa.is_deleted AND pa.alias_code=btrim(a.new_exposed))) AS new_resolves FROM active a) SELECT count(*) FILTER(WHERE old_exposed IS DISTINCT FROM new_exposed) AS changed_products,count(*) FILTER(WHERE old_resolves AND NOT new_resolves) AS newly_blocked_lookup_products,count(*) FILTER(WHERE serial_managed AND old_resolves AND NOT new_resolves) AS newly_blocked_serial_products,count(*) FILTER(WHERE NOT serial_managed AND old_resolves AND NOT new_resolves) AS newly_blocked_batch_products,count(*) FILTER(WHERE NOT old_resolves AND NOT new_resolves) AS preexisting_unresolvable_unchanged FROM flags; COMMIT;"
```

실제 출력:

```text
 changed_products | newly_blocked_lookup_products | newly_blocked_serial_products | newly_blocked_batch_products | preexisting_unresolvable_unchanged
------------------+-------------------------------+-------------------------------+------------------------------+------------------------------------
              100 |                           100 |                            95 |                            5 |                               1120
```

`preexisting_unresolvable_unchanged=1120`은 이번 fix가 새로 만든 차단으로 세지 않았다. 그 품목들은 fix 전 `model_code`, fix 후 `model_name`이 같은 계보다.

## 5. 실제 값 재현

### 5.1 기존 정상 출고전표가 새 모델명 재조회에서 막힌다

실제 전표 `2026/06/23-1`은 `SENT` 출고전표이며 품목 UUID `d7f488a5-6259-379c-8035-ed551e75a102`, 수량 2다. 이 품목의 fix 전 노출값은 옛 순번코드 `010004`, fix 후 값은 모델명 `AR09TXEAAWKNEU-04`다.

실행 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; WITH inputs(code) AS (VALUES ('AR09TXEAAWKNEU-04'),('010004')) SELECT i.code,count(p.id) AS product_code_exact,count(a.id) AS active_alias FROM inputs i LEFT JOIN products p ON p.product_code=i.code AND NOT p.is_deleted LEFT JOIN product_aliases a ON a.alias_code=i.code AND NOT a.is_deleted GROUP BY i.code ORDER BY i.code; SELECT id,model_name,model_code,product_code FROM products WHERE NOT is_deleted AND (model_name='AR09TXEAAWKNEU-04' OR product_code='010004'); COMMIT;"
```

실제 출력:

```text
       code        | product_code_exact | active_alias
-------------------+--------------------+--------------
 010004            |                  1 |            0
 AR09TXEAAWKNEU-04 |                  0 |            0

                  id                  |    model_name     | model_code | product_code
--------------------------------------+-------------------+------------+--------------
 d7f488a5-6259-379c-8035-ed551e75a102 | AR09TXEAAWKNEU-04 |            | 010004
```

전표 실행 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; SELECT s.slip_no,s.slip_type,s.status,s.source_warehouse_id,sl.product_id,sl.model_name,sl.quantity FROM slips s JOIN slip_lines sl ON sl.slip_id=s.id AND NOT sl.is_deleted WHERE NOT s.is_deleted AND s.slip_no='2026/06/23-1'; COMMIT;"
```

실제 출력:

```text
   slip_no    | slip_type | status |         source_warehouse_id          |              product_id              |    model_name     | quantity
--------------+-----------+--------+--------------------------------------+--------------------------------------+-------------------+----------
 2026/06/23-1 | OUTBOUND  | SENT   | 11111111-1111-1111-1111-111111111111 | d7f488a5-6259-379c-8035-ed551e75a102 | AR09TXEAAWKNEU-04 |        2
```

코드상 이 전표를 수락하면 `SlipService.java:879-880`이 `AR09TXEAAWKNEU-04`를 보내고, `ProductService.java:224-227`의 두 조회가 모두 0건이므로 NOT_FOUND가 발생한다. 옛 `010004`는 exact 1건이므로 fix 전에는 이 조회 관문을 통과했다.

전체 현재 도달 건수 계산 결과:

```text
OUTBOUND_SENT_ACCEPT|slips=19|lines=29|qty=58|products=11
INBOUND_PROCESSING_RECALL_COMPLETE|slips=0|lines=0|qty=|products=0
```

빈 `qty`는 PowerShell `Measure-Object -Sum`의 빈 집합 표시이며 건수는 명시적으로 0이다.

### 5.2 기존 코드 키 3행

`StockInstanceService.java:173-178`, `257-262`, `318-323`은 문자열 `productCode`로 기존 행을 찾는다. 실 DB 3행은 모두 옛 키다.

실행 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d inventory_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; SELECT id,product_id,product_code,status,outbound_partner_code,outbound_slip_no FROM stock_instances WHERE NOT is_deleted AND product_id='01949ab7-e922-35c6-b289-5337d867a0ee' ORDER BY status,id; COMMIT;"
```

실제 출력:

```text
                  id                  |              product_id              | product_code |  status   | outbound_partner_code | outbound_slip_no
--------------------------------------+--------------------------------------+--------------+-----------+-----------------------+------------------
 dbbe11d3-fe3d-4ec7-92f5-17cd4e77fd2d | 01949ab7-e922-35c6-b289-5337d867a0ee | 010001       | AVAILABLE |                       |
 943c19e3-5f3f-4e15-9848-541a7caf2718 | 01949ab7-e922-35c6-b289-5337d867a0ee | 010001       | SHIPPED   | CUST-S4Q              | S4Q-OUT-1
 aa2c7a3f-c4dc-445c-aa77-e42e376e8d27 | 01949ab7-e922-35c6-b289-5337d867a0ee | 010001       | SHIPPED   | CUST-S3               | S3-QA-1
```

해당 품목의 실제 매핑은 `model_name=AR05TXEAAWKNEU-01`, `product_code=010001`이다. 집계 원문 결과는 다음과 같다.

```text
STOCK_INSTANCE_KEY_DRIFT|rows=3|fixChangedProductRows=3|newCodeMatchesStored=0|oldCodeMatchesStored=3
```

따라서 AVAILABLE 1행은 새 모델명으로 예약할 수 없고, SHIPPED 2행은 새 모델명으로 회수할 수 없다.

## 6. 차단 0건 표면의 근거

### 6.1 데스크톱 행 키

변경 지점은 `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:322`이다. 실 `stock_balances` 201행을 product DB의 활성 `model_name` 및 inventory DB의 `warehouse.code`와 결합해 이전/새 키를 계산했다.

실제 출력:

```text
ROW_KEY_CHECK|rows=201|missingProduct=0|missingWarehouse=0|oldDuplicateGroups=0|oldAffectedRows=|newDuplicateGroups=0|newAffectedRows=
```

빈 affectedRows는 중복 그룹이 없는 PowerShell 합계 표시이며 둘 다 0행이다. 새 키로 사라지거나 중복되는 현재 행은 0이다.

### 6.2 표시·내보내기·알림

- `StockExcelExportService.java:143-150`: `StockBalanceResponse.productId`로 ProductSummary를 조회한 뒤 셀에 기록한다. 코드 재조회가 없어 201행 중 차단 0.
- `SafetyStockService.java:148-158,325-340`: config `productId`로 조회하고 label만 만든다. 활성 5행 중 차단 0.
- 재고 현황 API/화면: 201행 모두 product/warehouse 매핑 성공, 차단 0.
- DPS: `DpsCompareService.java:171-211,262-271`의 비교 코드는 업로드 및 slip 라인에서 온다. ProductSummary 노출값을 재조회하지 않는다. 단, `dps_save_history`가 0행이라 기존 저장 payload에 대한 실측 표본은 없다.

실행 출력:

```text
 dps_saved_rows
----------------
              0

 safety_config_rows
--------------------
                  5

 stock_excel_source_rows
-------------------------
                     201
```

### 6.3 partner-order-service

`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductSummary.java:17-27`은 `productCode`를 받지 않는다. 전표 발행 payload도 `PartnerOrderConvertService.java:148`과 `PartnerOrderMergeConvertService.java:165`에서 기존 저장 `modelName`을 명시적으로 사용한다. 따라서 ProductSummary의 변경된 `productCode` 때문에 막히는 행은 0이다.

실측 출력:

```text
PARTNER_ORDER_UUID_LOOKUP|orders=2021|lines=2052|missingProductIds=2|storedModelMismatch=0
```

`missingProductIds=2`는 UUID lookup 자체의 기존 데이터 불일치이며 이번 fix가 바꾼 필드에 도달하지 않으므로 차단 0에 포함하거나 새 결함으로 판정하지 않았다.

## 7. 옛 순번코드 조회 보존

활성 `product_code` 100개는 현재 모두 exact 조회된다.

```text
 legacy_exact_codes | exact_lookup_failures | also_alias
--------------------+-----------------------+------------
                100 |                     0 |          0
```

- `products.product_code` exact: 100/100 성공, 차단 0.
- 활성 `product_aliases`: 0행. 따라서 alias fallback 코드는 `ProductService.java:225-227`에서 확인했지만 실제 기존 alias 행을 통한 실행 성공 건수는 측정할 수 없다.
- V30 적용이나 alias 행 생성은 DB write가 되므로 수행하지 않았다.

## 8. 이 라운드가 보지 않은 것

- 공유 Docker 이미지는 fix commit으로 재빌드하지 않았으므로 **post-fix 컨테이너의 실제 HTTP 응답**은 실행하지 않았다. 보고서의 재현은 HEAD 코드 경로와 실 DB 값의 결합이다.
- 활성 alias 행이 0이므로 **기존 alias 행을 통한 lookup 성공**은 실 데이터로 실행하지 못했다.
- `dps_save_history`가 0행이므로 **기존 저장 DPS payload** 회귀는 실측하지 못했다.
- 저장소 밖 외부 연동 사용자의 호출 로그와 클라이언트 캐시는 조사하지 않았다.
- partner-order의 기존 미해결 product UUID 2라인은 이번 fix의 값 소비 경로가 아니므로 원인 분석하지 않았다.
- fix 전부터 재조회 불가였고 값도 바뀌지 않은 1,120품목의 기존 설계 결함은 이번 라운드의 순증 회귀 판정에서 제외했다.

## 9. 새로 만든 파일

- `docs/dev-reports/2026-08-02-1000-r2-reachability-blocked-paths.md`

코드 수정, 기존 보고서 수정, commit, push, checkout, 브랜치 조작, Docker 이미지 재빌드는 수행하지 않았다.
