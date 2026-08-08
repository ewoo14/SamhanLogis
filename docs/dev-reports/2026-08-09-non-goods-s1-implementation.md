# 비상품(NON_GOODS) 품목 지원 S1 구현 보고

- 브랜치: `feat/896-non-goods-estimate`
- 원칙: 실 DB에는 PATCH/INSERT/UPDATE를 실행하지 않았고, 데이터 변경은 Flyway 파일로만 작성했다.
- 범위: 견적품목 메뉴의 goodsType 지정, 비상품 납품가 입력 시 수량 1, 확정 후보 34건 전환.

## 1. 1단 — 견적품목 메뉴에서 상품/비상품 지정

| 계층 | 파일:줄 | 결과 |
|---|---|---|
| BE 응답 | `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductCatalogResponse.java:56,91` | 기존 ProductGoodsType을 카탈로그 응답에 포함 |
| BE 저장 | `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductCatalogController.java:292-300` | `PATCH /api/v1/products/{modelCode}/goods-type` 추가 |
| 도메인 | `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:641-647` | 선언값을 저장하고 수량관리 플래그를 함께 반영 |
| FE 메뉴 | `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:286-304,1137-1149` | 기존 `goodsType` 축으로 상품/비상품 셀렉트 제공 |
| 목록 게이트 | `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:764` | `usageScope !== 'NONE'`만 목록에 남김. usage_scope를 migration으로 변경하지 않음 |

견적 노출→비상품 지정 경로는 `addProductMutation`이 기존 usage PATCH로 노출을 먼저 올리고(`EstimateItemsCatalogPage.tsx:862-888`), 같은 목록의 goodsType 셀렉트가 새 goods-type PATCH를 호출하는 순서다. 이 세션에서는 실 운영 PATCH를 실행하지 않았다(실 DB 직접 쓰기 금지). mock 경로는 아래 handler와 API typecheck/Vitest로 확인했다.

## 2. 2단 — 비상품 라인 납품가 입력

| 계층 | 파일:줄 | 결과 |
|---|---|---|
| 선언 전달 | `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx:21-55` | ProductOption에 `goodsType` 추가 |
| 검색 매핑 | `clients/desktop/src/renderer/api/productApi.ts:36-43,78-100` | BE 선언값을 그대로 ProductOption으로 전달 |
| 레거시 lookup 호환 | `clients/desktop/src/renderer/api/slip.ts:466-493,825-844` | lookup 응답의 goodsType도 그대로 전달 |
| 수량 규칙 | `clients/desktop/src/renderer/routes/estimateLineModel.ts:8-15` | NON_GOODS이고 납품가가 비어 있지 않으면 수량 `1`; GOODS는 기존값 보존 |
| 견적 폼 | `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:1226-1237,1455,1546` | 납품가(단가) 입력 시 규칙 적용, 견적 라인에 포함되는 기존 저장 경로 유지 |

양방향 RED 원문과 동시 GREEN:

```text
RED-A   비상품 라인에 납품가를 입력하면 수량이 1이 된다
RED-B   상품(GOODS) 라인의 기존 수량 동작은 하나도 바뀌지 않는다
```

`clients/desktop/src/renderer/routes/estimateLineModel.test.ts:6,10`이 각각 위 원문을 고정한다. 최종 Vitest 결과는 2 tests passed이며, GOODS 수량 3은 그대로 3이고 NON_GOODS 수량 3은 1이 됐다. 기존 테스트를 새 동작에 맞춰 수정한 사례는 없다.

재고 미생성 경로는 기존 inventory 게이트(`!product.goods()` 또는 BUNDLE 제외)를 변경하지 않고 유지했다. `ProductSummaryResponse.goods`는 `goodsType == GOODS` 선언에서 파생되고, inventory-service의 inbound/instance/stock 경로가 그 게이트를 통과하지 못하면 재고 row/movement를 만들지 않는다. 실 운영 라인을 새로 만들거나 차감하는 작업은 금지되어 있어, 아래 후보 모집단의 현재 재고 0 실측과 기존 게이트 코드 확인으로 검증했다.

## 3. 3단 — 데이터 전환

| 파일:줄 | 결과 |
|---|---|
| `services/product-service/src/main/resources/db/migration/V33__mark_non_goods_estimate_candidates.sql:3-22` | 명시적 model_code 34개만 `goods_type=NON_GOODS`, `inventory_qty_mgmt=FALSE`로 전환 |
| `services/inventory-service/src/main/resources/db/migration/V24__assert_non_goods_candidate_stock_absence.sql:3-18` | 명시적 UUID 목록으로 네 재고 테이블을 migration 안에서 세고 하나라도 0이 아니면 실패 |

적용 SQL에는 `LIKE`, 정규식, 품목명 조건이 없다. 후보를 만들 때만 설계서의 이름 정규식을 사용했고, 실제 적용은 확정된 코드 목록이다. `금액조정` 2건도 PM 확정 후보 34건 목록에 포함했으며 업무 의미를 확정한 것은 아니다.

## 후보 34건 재고 0건 재확인 원문

설계서 SQL의 후보 추출을 직접 실행했다.

```text
SELECT string_agg(quote_literal(id::text), ',') FROM products
WHERE is_deleted = false AND name ~ '운임|절삭|수수료|설치비|금액조정';
→ UUID 34개

SELECT count(*) FROM products
WHERE is_deleted = false AND name ~ '운임|절삭|수수료|설치비|금액조정';
→ 34

SELECT count(DISTINCT product_id) FROM stock_balances;
→ 102
```

위 UUID 34개를 그대로 `:ids`에 넣어 inventory_db에서 다음을 각각 실행했다.

```text
SELECT count(*) FROM stock_balances  WHERE product_id::text IN (:ids);  → 0
SELECT count(*) FROM stock_lots      WHERE product_id::text IN (:ids);  → 0
SELECT count(*) FROM stock_instances WHERE product_id::text IN (:ids);  → 0
SELECT count(*) FROM stock_movements WHERE product_id::text IN (:ids);  → 0
SELECT count(DISTINCT product_id) FROM stock_balances WHERE product_id::text IN (:ids); → 0
```

추가 대조 실측:

```text
goods_type | is_deleted | count
GOODS      | f          | 3083
GOODS      | t          | 135
NON_GOODS  | t          | 3
```

활성 NON_GOODS는 0건이라는 전제도 일치했다. 실측 시각은 이 세션 실행 시각이며, 공유 DB 값은 변할 수 있다. migration V24는 이 검사를 재현하며 0이 아니면 `RAISE EXCEPTION`한다. product migration은 신규/테스트 빈 카탈로그 0건은 no-op으로 허용하고, 운영 후보가 일부만 존재하는 드리프트는 실패시킨다.

## 변경 API 전수 × mock handler

| API | 실제 FE 호출 | `clients/desktop/src/renderer/api/mock.ts` handler | 상태 |
|---|---|---|---|
| `PATCH /api/v1/products/{modelCode}/goods-type` | `productCatalogApi.ts:539-546` | `mock.ts:3182-3203` | 있음 / 권한·enum·404 반영 |
| `GET /api/v1/products` | 기존 목록 호출 | `mock.ts:3327-3380` | 기존 handler가 goodsType row를 보존 |
| `GET /api/products` | 견적 라인 검색 | `mock.ts:3474-3510` | goodsType 선언값 전달 |
| `POST /api/products/lookup` | fallback/bulk lookup | `mock.ts:3451-3473` | goodsType 선언값 전달 |

새 endpoint를 추가했으며 mock handler를 함께 추가했다. 실 API 누출 경로는 없다.

## 검증

- `./gradlew.bat :services:product-service:test --tests '*Product*' --rerun-tasks` — PASS
- `clients/desktop`: `npm run typecheck` — PASS (정본 `tsconfig.node.json` + `tsconfig.web.json` 및 real-QA typecheck 포함)
- `npx vitest run src/renderer/routes/estimateLineModel.test.ts src/renderer/routes/EstimateItemsCatalogPage.test.ts` — 2 files, 6 tests PASS
- `git diff --check` — PASS
- migration SQL은 파일로만 추가했으며 공유 product/inventory DB에 migration 실행·쓰기하지 않았다.

## 미결정 — 보고만 함

1. `금액조정`, `무형상품 금액조정` 2건이 업무상 비상품인지 개발자가 결정하지 않았다. 이번 migration 후보 목록에는 PM 설계서의 34건으로 포함했다.
2. 비상품 라인의 일마감·할인 재검증 취급은 범위 밖이다. `DiscountRevalidator`의 이름 기반 운임/절삭 분기는 다음 슬라이스로 남겼다.

## 신규 파일 경로 목록

```text
clients/desktop/src/renderer/routes/estimateLineModel.ts
clients/desktop/src/renderer/routes/estimateLineModel.test.ts
services/product-service/src/main/java/com/samhanair/logis/product/web/dto/UpdateProductGoodsTypeRequest.java
services/product-service/src/main/resources/db/migration/V33__mark_non_goods_estimate_candidates.sql
services/inventory-service/src/main/resources/db/migration/V24__assert_non_goods_candidate_stock_absence.sql
docs/dev-reports/2026-08-09-non-goods-s1-implementation.md
```
