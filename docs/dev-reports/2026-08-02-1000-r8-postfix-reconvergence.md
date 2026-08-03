# PR #1046 / 이슈 #1000 R8 — 머지 전 postfix 재수렴 리뷰

## 0. 결론

**판정: PASS — 이번 R8에서 새 merge BLOCKER를 발견하지 않았다.**

R7 판정표의 `불필요(그 경로는 legacy 행에 도달하지 않음)` 5곳은 모두 맞다. 다만 정확한 뜻은 “legacy 데이터이므로 `product == null`이 된다”가 아니다. `product == null` 여부는 DB의 `stock_instances.product_code` 값과 무관하며, 오직 선행 `ProductClient.requireExistsByCode()`의 반환값으로 결정된다.

- HEAD의 production `ProductClient.requireExistsByCode()`는 정상 응답이면 non-null `ProductSummary`를 반환한다.
- blank, product-service 4xx/5xx, 응답 envelope 이상은 모두 예외다. null 반환 경로는 없다.
- 따라서 `:197`, `:204`, `:220`, `:393`, `:407`의 null 분기는 정상 production bean으로는 실행되지 않는다.
- legacy 저장키 `010001` 행은 null 분기가 아니라, 선행 3축 lookup으로 해소한 product UUID를 쓰는 non-null 경로가 잡는다.

실 DB에는 대상 UUID의 활성 재고가 AVAILABLE 1행, SHIPPED 2행 있다. R7이 전환한 FIFO read는 AVAILABLE 1행을 잡는다. 회수 read는 SHIPPED 총 2행을 잡을 수 있으나 두 행의 거래처가 서로 달라, 필수 `partnerCode`를 포함한 실제 한 번의 요청은 각각 1행만 반환한다. 이는 오선택이 아니라 거래처 격리의 결과다.

CONFLICT는 fresh read-only 재측정에서 **0/1,320**, 오선택은 **0행**이다. 코드 수정, commit, push, checkout, 브랜치 조작, Docker 이미지 재빌드, 공유 DB write/DDL, 합성 데이터 생성은 수행하지 않았다.

## 1. 검증 기준

```text
feat/1000-model-code-rest
3e4df4dde
```

대상 식별값과 실데이터:

| 구분 | 값 |
|---|---|
| 현재 사용자 노출·호출값 | `AR05TXEAAWKNEU-01` |
| product DB legacy `product_code` | `010001` |
| product DB 현재 `model_name` | `AR05TXEAAWKNEU-01` |
| inventory 저장 `product_code` | `010001` |
| 활성 inventory | AVAILABLE 1행, SHIPPED 2행 |

product DB 실행 원문:

```text
BEGIN
                  id                  | product_code |    model_name     | status | is_deleted
--------------------------------------+--------------+-------------------+--------+------------
 01949ab7-e922-35c6-b289-5337d867a0ee | 010001       | AR05TXEAAWKNEU-01 | ACTIVE | f
(1 row)

COMMIT
```

inventory DB 실행 원문:

```text
BEGIN
                  id                  |              product_id              | product_code |             warehouse_id             |  status   | outbound_slip_no | outbound_partner_code | recall_slip_no |        received_at         |        outbound_at         | is_deleted
--------------------------------------+--------------------------------------+--------------+--------------------------------------+-----------+------------------+-----------------------+----------------+----------------------------+----------------------------+------------
 dbbe11d3-fe3d-4ec7-92f5-17cd4e77fd2d | 01949ab7-e922-35c6-b289-5337d867a0ee | 010001       | 11111111-1111-1111-1111-000000000001 | AVAILABLE |                  |                       |                | 2026-06-03 05:58:06.559323 |                            | f
 aa2c7a3f-c4dc-445c-aa77-e42e376e8d27 | 01949ab7-e922-35c6-b289-5337d867a0ee | 010001       | 11111111-1111-1111-1111-000000000001 | SHIPPED   | S3-QA-1          | CUST-S3               |                | 2026-04-15 08:00:00        | 2026-06-02 17:53:26.49902  | f
 943c19e3-5f3f-4e15-9848-541a7caf2718 | 01949ab7-e922-35c6-b289-5337d867a0ee | 010001       | 11111111-1111-1111-1111-000000000001 | SHIPPED   | S4Q-OUT-1        | CUST-S4Q              |                | 2026-05-10 14:00:00        | 2026-06-02 19:11:38.076038 | f
(3 rows)

COMMIT
```

## 2. 1순위 — “불필요” 5곳 재검증

### 2.1 `product == null`이 되는 실제 조건

다섯 지점의 호출 순서는 모두 선행 lookup 후 null 검사다.

```text
196:        List<StockInstance> reserved = product == null
197:                ? repo.findByOutboundSlipNoAndProductCodeAndStatus(
203:        return product == null
204:                ? repo.findByOutboundSlipNoAndProductCodeAndStatus(
219:        List<StockInstance> reserved = product == null
220:                ? repo.findByOutboundSlipNoAndProductCodeAndStatus(
392:        if (product == null) {
393:            return repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
406:        if (product == null) {
407:            return repo.findByRecallSlipNoAndProductCodeAndStatusForUpdate(
```

각 public method의 바로 앞에서 실행되는 코드는 다음과 같다.

```text
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:195:        ProductSummary product = productClient.requireExistsByCode(productCode);
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:218:        ProductSummary product = productClient.requireExistsByCode(productCode);
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:342:        ProductSummary product = productClient.requireExistsByCode(productCode);
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:370:        ProductSummary product = productClient.requireExistsByCode(productCode);
```

`requireExistsByCode()`의 실제 계약은 다음과 같다.

```text
142:    public ProductSummary requireExistsByCode(String productCode) {
143:        if (productCode == null || productCode.isBlank()) {
144:            throw new BusinessException(ErrorCode.INVALID_INPUT, "productCode 는 필수입니다");
155:                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
156:                        throw new BusinessException(ErrorCode.INVALID_INPUT,
159:                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
160:                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
171:        Object data = envelope == null ? null : envelope.get("data");
172:        if (!(data instanceof Map<?, ?> raw)) {
173:            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
176:        return objectMapper.convertValue(raw, ProductSummary.class);
```

즉 정상 Spring production bean에서 `product == null`이 되려면 `objectMapper.convertValue(non-null Map, ProductSummary.class)`가 계약을 깨고 null을 반환해야 한다. 코드에 그런 분기는 없고, 입력·HTTP·envelope 실패는 null 대신 예외다. 저장행이 legacy 코드 `010001`인지 여부는 이 null 조건에 관여하지 않는다.

HEAD의 product-service는 현재 호출값을 세 축에서 찾고 같은 UUID로 수렴시킨다.

```text
226:        productRepository.findByProductCodeAndIsDeletedFalse(normalizedCode).ifPresent(candidates::add);
227:        productAliasRepository.findByAliasCodeAndIsDeletedFalse(normalizedCode)
230:        productRepository.findByModelNameAndIsDeletedFalse(normalizedCode).ifPresent(candidates::add);
232:        Set<UUID> productIds = candidates.stream()
235:        if (candidates.isEmpty()) {
236:            throw new BusinessException(ErrorCode.NOT_FOUND, "품목 식별자에 해당하는 제품이 없습니다");
238:        if (productIds.size() > 1) {
239:            throw new BusinessException(ErrorCode.CONFLICT, "품목 식별자가 서로 다른 제품에 매칭됩니다: " + normalizedCode);
241:        Product product = candidates.get(0);
242:        return ProductSummaryResponse.from(product);
```

DB에서 `AR05TXEAAWKNEU-01`은 활성 품목의 `model_name`으로 정확히 1 UUID에 매칭된다. 따라서 HEAD 조합에서는 non-null 경로로 들어간다.

### 2.2 다섯 지점별 실데이터 결과

| R7 지점 | production 진입 | 실데이터 | 재판정 |
|---|---|---|---|
| `:197` ship 전 RESERVED | null 분기 도달 불가 | `S3-QA-1`: current 0 / legacy 0 / UUID 0 | R7 판정 맞음. 현재 RESERVED 표본 없음 |
| `:204` ship 후 SHIPPED | null 분기 도달 불가 | `S3-QA-1`: current 0 / legacy 1 / UUID 1 | R7 판정 맞음. legacy 1행은 non-null UUID 경로가 잡음 |
| `:220` release RESERVED | null 분기 도달 불가 | `S3-QA-1`: current 0 / legacy 0 / UUID 0 | R7 판정 맞음. 현재 RESERVED 표본 없음 |
| `:393` unrecall RECALLED | null 분기 도달 불가 | 전체 current 0 / legacy 0 / UUID 0 | R7 판정 맞음. 현재 RECALLED 표본 없음 |
| `:407` resell RECALLED | null 분기 도달 불가 | 전체 current 0 / legacy 0 / UUID 0 | R7 판정 맞음. 현재 RECALLED 표본 없음 |

실행 원문:

```text
BEGIN
               point                | current_code_rows | legacy_code_rows | product_id_rows
------------------------------------+-------------------+------------------+-----------------
 L197 ship pre RESERVED (S3-QA-1)   |                 0 |                0 |               0
 L204 ship post SHIPPED (S3-QA-1)   |                 0 |                1 |               1
 L220 release RESERVED (S3-QA-1)    |                 0 |                0 |               0
 L393 unrecall RECALLED (all slips) |                 0 |                0 |               0
 L407 resell RECALLED (all slips)   |                 0 |                0 |               0
(5 rows)
```

따라서 “불필요” 5곳 중 틀린 판정은 **0곳**이다. 특히 `:204`는 코드 분기 자체가 legacy 행을 잡지 못하지만, 그 분기는 실행되지 않고 같은 method의 UUID 우선 non-null 경로가 실제 legacy 행 1개를 잡는다.

### 2.3 공유 스택 실제 호출의 한계

Docker 이미지 재빌드 금지 상태에서 현재 공유 `samhan-product-service`에 같은 internal endpoint를 실제 호출했다. 공유 이미지는 HEAD의 3축 lookup 이전 빌드라 현재 모델명은 404, legacy 코드는 200을 반환했다.

```text
code=AR05TXEAAWKNEU-01 status=404 body={"success":false,"code":"NOT_FOUND","message":"품목코드에 해당하는 제품이 없습니다","data":null,"timestamp":"2026-08-02T13:10:29.820212267Z"}
```

legacy 코드 호출 원문 중 식별 계약:

```text
"success": true,
"code": "OK",
"data": {
  "id": "01949ab7-e922-35c6-b289-5337d867a0ee",
  "modelName": "AR05TXEAAWKNEU-01",
  "productCode": "010001",
  "status": "ACTIVE",
  "serialManaged": true
}
```

이 404도 null 분기로 들어가지 않는다. `ProductClient`의 4xx handler가 `BusinessException`을 던져 method가 repository 조회 전에 끝난다. 공유 이미지가 HEAD가 아니므로 이 결과를 HEAD 결함으로 판정하지 않았고, 금지된 이미지 재빌드도 하지 않았다.

## 3. 전환한 두 read API가 legacy 행을 잡는가

### 3.1 FIFO `:460` 계열

HEAD 실제 줄은 UUID 조회 `:457`, code fallback `:460`이다. `productId + AVAILABLE` 결과가 1행이므로 fallback은 실행하지 않고 legacy 저장키 `010001`의 1행을 반환한다.

### 3.2 회수 `:479` 계열

HEAD 실제 줄은 UUID 조회 `:476`, code fallback `:479`다. `partnerCode + productId + SHIPPED`를 유지한다.

- 전체 legacy SHIPPED 포착 가능 행: **2행**
- 실제 거래처 scope: **2개**
- `CUST-S3` 요청: 1행
- `CUST-S4Q` 요청: 1행

따라서 R7의 “2행”은 모든 거래처를 합친 실데이터 총량으로는 맞다. 단일 API 호출 결과가 2행이라는 뜻으로 읽으면 틀리다. 실제 한 호출은 요청 거래처의 1행만 잡으며 이것이 올바른 계약이다.

실행 원문:

```text
 fifo_current_code | fifo_legacy_code | fifo_product_id | recall_current_code_all_partners | recall_legacy_code_all_partners | recall_product_id_all_partners
-------------------+------------------+-----------------+----------------------------------+---------------------------------+--------------------------------
                 0 |                1 |               1 |                                0 |                               2 |                              2
(1 row)

 outbound_partner_code | id_query_rows | current_code_rows | legacy_code_rows | slip_scopes
-----------------------+---------------+-------------------+------------------+-------------
 CUST-S3               |             1 |                 0 |                1 |           1
 CUST-S4Q              |             1 |                 0 |                1 |           1
(2 rows)
```

판정: **PASS. FIFO 1행, 회수 총 2행을 잡는다. 회수는 거래처별 1행씩 격리된다.**

## 4. 잡히면 안 되는 행 오선택

### 4.1 FIFO read

FIFO read 계약은 창고·전표·거래처 범위가 아니라 `productId + AVAILABLE` 전 창고 후보 조회다. 따라서 창고 predicate가 없는 것을 “다른 창고 오선택”으로 셀 수 없다. 현재 실데이터에는 대상 AVAILABLE이 한 창고 1행뿐이다.

```text
 fifo_selected | fifo_excluded_wrong_status | fifo_wrong_product_candidates | fifo_selected_warehouses
---------------+----------------------------+-------------------------------+--------------------------
             1 |                          2 |                             0 |                        1
(1 row)
```

- 선택: 기대 UUID + AVAILABLE 1행
- 다른 상태 제외: 2행
- 다른 품목 UUID가 잘못 선택될 후보: 0행
- 선택 결과 창고: 1개

### 4.2 회수 read

```text
 outbound_partner_code | selected | excluded_other_partner | excluded_wrong_status | wrong_product_selected
-----------------------+----------+------------------------+-----------------------+------------------------
 CUST-S3               |        1 |                      1 |                     1 |                      0
 CUST-S4Q              |        1 |                      1 |                     1 |                      0
(2 rows)
```

각 거래처 호출은 자기 SHIPPED 1행을 선택하고 상대 거래처 SHIPPED 1행과 AVAILABLE 1행을 제외한다. 다른 품목 선택은 0행이다. 회수 후보 read는 회수 가능한 거래처 전체 출고를 보여주는 API이므로 outbound slip을 필터하지 않는 것이 계약이다.

### 4.3 ship/release 전표 범위

```text
 outbound_slip_no | ship_post_selected | excluded_other_slip | wrong_status_selected | wrong_product_selected
------------------+--------------------+---------------------+-----------------------+------------------------
 S3-QA-1          |                  1 |                   1 |                     0 |                      0
 S4Q-OUT-1        |                  1 |                   1 |                     0 |                      0
(2 rows)
```

ship의 non-null UUID 경로는 `outboundSlipNo + productId + status`를 유지해 다른 전표 1행을 제외한다. 현재 RESERVED가 없어 release의 실제 대상·오대상은 모두 0행이다. unrecall/resell은 RECALLED가 없어 실 slip scope를 측정할 표본이 없다.

종합 오선택: **0행**.

## 5. CONFLICT 0/1,320 회귀

fresh read-only SQL은 활성 `product_code`, 활성 alias→활성 본품, 활성 `model_name`을 trim 후 합치고 값별 distinct UUID를 셌다.

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

판정: **PASS — CONFLICT 0/1,320 유지.**

## 6. read API 응답 내용 변화와 소비처

응답 집합은 실제로 넓어진다.

| API | R7 이전 현재 노출값 기준 | R7 HEAD UUID 기준 | 변화 |
|---|---:|---:|---|
| `GET /inventory/instances/fifo?productCode=AR05TXEAAWKNEU-01` | 0행 | 1행 | +1 |
| `GET /inventory/instances/recall?...&productCode=AR05TXEAAWKNEU-01` | 거래처별 0행 | 거래처별 1행 | 각 +1, 전체 +2 |

production source 전체 검색에서 이 두 GET endpoint의 in-repo 소비자는 발견되지 않았다. 검색 결과는 controller/service와 테스트뿐이다.

```text
services\inventory-service\src\test\java\com\samhanair\logis\inventory\service\StockInstanceServiceOutboundTest.java:390:        List<StockInstance> result = service.fifoCandidates("AR05TXEAAWKNEU-01");
services\inventory-service\src\test\java\com\samhanair\logis\inventory\service\StockInstanceServiceOutboundTest.java:411:        List<StockInstance> result = service.recallCandidates("PARTNER-1000", "AR05TXEAAWKNEU-01");
services\inventory-service\src\main\java\com\samhanair\logis\inventory\web\StockInstanceController.java:267:        List<StockInstanceResponse> result = stockInstanceService.fifoCandidates(productCode)
services\inventory-service\src\main\java\com\samhanair\logis\inventory\web\StockInstanceController.java:287:        List<StockInstanceResponse> result = stockInstanceService.recallCandidates(partnerCode, productCode)
services\inventory-service\src\main\java\com\samhanair\logis\inventory\service\StockInstanceService.java:455:    public List<StockInstance> fifoCandidates(String productCode) {
services\inventory-service\src\main\java\com\samhanair\logis\inventory\service\StockInstanceService.java:473:    public List<StockInstance> recallCandidates(String partnerCode, String productCode) {
```

따라서 저장소 안의 화면·집계가 이 변경으로 달라지는 소비처는 **0곳**이다. API를 직접 쓰는 저장소 밖 소비자는 검색으로 확인할 수 없으며, 존재한다면 빈 결과가 실제 후보 결과로 바뀌는 것이 이번 fix의 의도된 동작 변화다.

## 7. 최종 판정표

| 각도 | 판정 |
|---|---|
| “불필요” 5곳 각각 | **PASS — 5/5 production null 도달 불가** |
| legacy 행 실포착 | **PASS — FIFO 1, 회수 총 2(거래처별 1+1)** |
| 다른 창고·상태·전표·거래처 오선택 | **PASS — 실측 0행** |
| CONFLICT | **PASS — 0/1,320** |
| read API 소비처 영향 | **in-repo 소비처 0; API 응답 집합 자체는 의도대로 확대** |

**종합 PASS.** R7의 핵심 판정은 맞다. 다섯 코드 전용 null 분기는 legacy 행의 모양 때문에 선택되는 fallback이 아니라 현재 production client 계약상 dead compatibility branch다. 실제 legacy 행은 non-null UUID 경로로 수렴한다.

## 8. 이 라운드가 보지 않은 것

- 코드 수정과 수정안 설계는 수행하지 않았다.
- Docker 이미지 재빌드·재기동을 하지 않았다. 따라서 HEAD product-service + HEAD inventory-service를 함께 띄운 end-to-end HTTP 응답은 실행하지 않았다.
- 공유 스택의 현재 이미지는 HEAD 이전 코드여서 현재 모델명 lookup이 404였다. 이 환경에서 R7 두 GET endpoint의 live 응답을 HEAD 증거로 사용하지 않았다.
- DB write/DDL과 합성 데이터 생성이 금지되어 RESERVED·RECALLED 표본을 만들지 않았다. `:197`, `:220`, `:393`, `:407`의 실제 상태 전이는 실행하지 않았다.
- 전체 Gradle 테스트는 재실행하지 않았다. R7 보고서의 546/626 GREEN을 이번 라운드의 새 실행 증거로 재인용하지 않았다.
- 동시성, lock timeout, 실행계획·인덱스 성능은 재측정하지 않았다.
- 저장소 밖 API 소비자와 운영 트래픽·화면은 확인하지 않았다.
- 요청된 `StockInstanceService` 15곳 및 두 read API 소비처 이외의 전체 시스템 `productCode` sweep은 수행하지 않았다.

## 9. 새 파일 경로 목록

```text
docs/dev-reports/2026-08-02-1000-r8-postfix-reconvergence.md
```
