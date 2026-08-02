# PR #1046 / 이슈 #1000 BLOCKER fix 보고서

## 1. 원인

`ProductSummaryResponse.from(Product)`의 `exposedProductCode`가 `model_name`을 읽지 않고 `model_code` 우선, 없으면 `product_code`를 반환했다. 따라서 시트 계보 1,120건은 `model_code = model_name`이라 정상처럼 보였지만, 이카운트 계보 100건은 모델명이 아닌 옛 순번코드가 응답 `productCode`로 노출됐다.

순번코드 조회는 별도 경로다. `ProductService.lookupSummaryByProductCode`가 `product_code` exact 조회 후 `product_aliases.alias_code` 조회를 수행하므로, 표시값 변경과 조회 alias를 분리할 수 있다.

## 2. RED 원문

fixture는 기존 IT의 `Product.create(...)` 정상 생성 경로와 단위 테스트의 도메인 객체를 사용했다. raw SQL로 가짜 Product 행을 만들지 않았다.

테스트를 먼저 수정한 뒤 production code를 수정하지 않고 실행한 결과:

```text
ProductServiceTest > summary_exposes_modelName_as_productCode_even_when_modelCode_and_legacy_code_exist() FAILED
    org.opentest4j.AssertionFailedError at ProductServiceTest.java:136

1 test completed, 1 failed

expected: "SHA-W15K"
 but was: "MODEL-004"

FAILURE: Build failed with an exception.
> Task :services:product-service:test FAILED
```

재현 fixture 값은 `modelName=SHA-W15K`, `modelCode=MODEL-004`, `productCode=010004`였다. 즉 실패 원인은 빈 값 fallback이 아니라 잘못된 우선순위였다.

## 3. fix

- `ProductSummaryResponse.exposedProductCode(Product)`를 `return p.getModelName();`으로 변경했다.
- 순번코드 alias 조회 로직과 V30 migration은 변경하지 않았다.
- 기존 IT fixture는 생성 시 모델명을 필드에 보관하고, 응답 `productCode`가 이 모델명과 같은지 검증하도록 갱신했다.
- `InventoryStockBalancePage`의 실제 행 키는 기존 코드에서 `productId-warehouseCode`였다. 요구 계약과 #1042 소비 계약에 맞춰 `productCode-warehouseCode`로 정렬했다.

## 4. GREEN 원문

RED 테스트 fix 직후 타깃 테스트:

```text
> .\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.service.ProductServiceTest.summary_exposes_modelName_as_productCode_even_when_modelCode_and_legacy_code_exist --no-daemon

BUILD SUCCESSFUL in 23s
13 actionable tasks: 2 executed, 11 up-to-date
```

변경 모듈 전체 테스트(수정된 IT 기대값 반영 후):

```text
> .\gradlew.bat :services:product-service:test --no-daemon

BUILD SUCCESSFUL in 2m 48s
13 actionable tasks: 2 executed, 11 up-to-date
```

Gradle 출력에는 Testcontainers skip이 없었고 product-service 전체 테스트가 통과했다.

Desktop 전체 검증은 로컬 파생물 부재로 실행할 수 없었다. 실제 출력:

```text
@samhan/desktop pretest
[로컬 파생물 신선도 확인 실패]
- electron-updater가 설치된 node_modules에 없습니다.
- file: 의존 design-system dist이(가) 없습니다.
- Electron main 빌드 산출물 out/main/index.js이(가) 없습니다.
```

우회 `npx vitest run`도 `Could not resolve 'vitest/config'`로 시작 전에 중단됐다. `npm ci`, design-system build, desktop build 및 Docker 이미지 재빌드는 수행하지 않았다.

## 5. 불변식 실측

모든 DB 조회는 `BEGIN TRANSACTION READ ONLY` 안에서 `docker exec samhan-postgres psql -U samhan -d product_db`로 실행했다. DB write/DDL은 없었다.

| 불변식 | 실측 결과 |
|---|---:|
| 1. 노출 품목 코드는 model_name | 활성 `products` 1,220건 중 `model_name` 비공백 1,220건, distinct 1,220건. 매핑 코드는 전건 `p.getModelName()` 반환. |
| 2. 이카운트 계보가 모델명으로 보임 | `model_code IS NULL`이고 `product_code`가 있는 이카운트 계보 100건. 그 100건 모두 `model_name` 비공백. 따라서 새 응답 노출값은 100/100 모델명, 0건 누락. |
| 3. 옛 순번코드 alias 조회 보존 | V30 대상 100건, 기존 활성 alias 0건, V30 교차 품목 충돌 0건, 활성 `product_code` 중복 그룹 0개/영향 0행, 옛 코드 미해결 0건. V30은 아직 DB에 적용되지 않아 설치 history의 27~30 행은 0건이며, 실제 적용은 수행하지 않았다. |
| 4. 소비처 전수 확인 | 정적 sweep은 productCode 관련 74파일/420 hit를 분류했다. 직접 wire/표시/조회/집계 소비처는 아래 목록으로 확인했고, 재고 행 키도 `productCode-warehouseCode`로 정렬했다. |

DB 원문:

```text
 active_products | model_name_present | model_name_distinct | model_code_present | product_code_present | ecount_lineage | model_name_missing
-----------------+--------------------+---------------------+--------------------+----------------------+----------------+--------------------
            1220 |               1220 |               1220  |               1120 |                  100 |            100 |                  0

 v30_rows_to_insert
--------------------
                100

 old_codes_unresolved
----------------------
                    0

 v30_cross_product_alias_conflicts
-----------------------------------
                                 0

 active_product_code_duplicate_groups | affected_rows
--------------------------------------+---------------
                                    0 |             0

 active_alias_rows
-------------------
                 0
```

## 6. 노출 코드 소비처 전수 목록

### product-service 응답 생성/조회 경계

- `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductSummaryResponse.java:118-139` — `Product` → 응답 매핑, 노출 코드 단일 원천 1곳.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:127,181,206,229,258,393,426` — 목록/모델명/제품명/코드/라벨/UUID/모델코드 조회의 응답 생성 7곳.
- `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductController.java:76,122` — 외부 목록·UUID lookup 2 endpoint.
- `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductInternalController.java:71,89,125,144,162,259` — 내부 lookup 6 endpoint.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:219-229` — `product_code` exact → `product_aliases.alias_code` fallback 조회. 옛 순번코드 정상 경로 보존.

### downstream API/client 및 표시·집계

- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/ProductClient.java:68-181` — UUID/코드 lookup 및 `ProductSummary` wire 변환.
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/SafetyStockService.java:153,329-340` — 안전재고 알림 표시 label.
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockExcelExportService.java:146` — 재고 현황 Excel 품목코드 열.
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java:155,242,311,336,340` — 코드 조회·예약/회수 batch key.
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsCompareService.java:149,174-211,239-271,251` — DPS/전표 비교 match key·집계.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/InventoryClient.java:159,183,204,225,242,259` — inventory service로 보내는 코드 계약.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:879,891,1027,1065,1102,1133,1287,1327` — serial/batch 보상·입출고·감사 기록 소비.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/ProductClient.java:61,103,121,144,188` — product-service 응답 변환/조회.
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductClient.java:52,86,156,189,199-213` — product-service 응답 변환. 주문 확정은 UUID/product snapshot 축을 사용하며 노출 코드 자체를 행 key로 쓰지 않는다.
- `clients/desktop/src/renderer/api/inventory.ts:291-305` — 재고 목록의 `productCode` wire/type 계약.
- `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:92,322` — 품목코드 열 및 `productCode-warehouseCode` 행 key.
- `clients/desktop/src/renderer/routes/warehouse/DpsByProductPage.tsx:118,435` — 품목코드 열 및 productCode 행 key.
- `clients/desktop/src/renderer/routes/components/InventoryLookupModal.tsx:464-465` — 별도 재고 pivot은 이미 `modelName-warehouseCode` test id/aria 축을 사용하며 ProductSummary의 `productCode`를 직접 사용하지 않는다.

정적 sweep 420 hit에는 request DTO, mock seed, 과거 DPS/전표 snapshot, 테스트 fixture도 포함된다. 이들은 ProductSummary의 새 노출값을 재계산하는 소비처가 아니며, 실제 downstream 표시·조회·집계 경로는 위 목록으로 분류했다.

## 7. 변경 파일별 증감

`git diff --numstat` 기준으로 추가/삭제를 분리해 기록한다.

| 파일 | 추가 +N | 삭제 -M |
|---|---:|---:|
| `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductSummaryResponse.java` | +4 | -7 |
| `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductServiceTest.java` | +2 | -7 |
| `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductInternalControllerIT.java` | +5 | -3 |
| `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx` | +1 | -1 |
| `docs/dev-reports/2026-08-02-1000-r-blocker-model-name-exposure.md` | +154 | -0 |

## 8. 새로 만든 파일

- `docs/dev-reports/2026-08-02-1000-r-blocker-model-name-exposure.md`

커밋·push·checkout·브랜치 조작은 수행하지 않았다.
