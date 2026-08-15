# 주문서웹 품목분류 기반 창고 결정 구현 보고

## 분류값 출처

- 정본: `docs/decisions/2026-08-15-order-web-warehouse-by-category.md`
- 실측 대조: `docs/dev-reports/2026-08-15-order-web-warehouse-category-mapping.md`
- 실제 저장 축: `products.product_category` 및 `products.cat_l_id/cat_m_id/cat_s_id -> classification.name`
- internal lookup: `POST /products/internal/lookup-classifications-by-model-codes`
- 이번 테스트에 사용한 실제 분류값: `실내기 > 1-Way 인피니트`, `판넬 > 인피니트`, `360`, `4way 냉난방 > 1등급`, `4way 냉방전용`, `1way 냉난방`, `덕트`, `비스포크 스탠드`, `냉난방 벽걸이`, `가정용 에어컨`, `실외기 > 표준형`

품명 정규식이나 품명 검색은 창고 판정에 사용하지 않았다. 분류 전용 lookup은 UUID와 품명을 반환하지 않고 모델코드·상품 출처 카테고리·L/M 분류명만 반환한다.

## RED 원문

실제 실행:

```text
./gradlew :services:partner-order-service:test --tests '*OrderWarehouseByClassificationTest'

> Task :services:partner-order-service:compileTestJava FAILED
... error: package OrderWarehouseByClassification does not exist
... error: cannot find symbol class OrderWarehouseByClassification
8 errors
FAILURE: Build failed with an exception.
```

판정기 production class가 아직 없어서 테스트가 컴파일되지 않는 RED였다.

## GREEN 원문

실제 실행:

```text
./gradlew :services:partner-order-service:test --tests '*OrderWarehouseByClassificationTest'

BUILD SUCCESSFUL in 33s
15 actionable tasks: 2 executed, 13 up-to-date
```

confirm 회귀 포함 실행:

```text
./gradlew --no-daemon :services:partner-order-service:test --tests '*PartnerOrderConfirmServiceTest' --tests '*OrderWarehouseByClassificationTest'

BUILD SUCCESSFUL in 1m 3s
15 actionable tasks: 2 executed, 13 up-to-date
```

## 구현 요지

- `OrderWarehouseByClassification`은 빈 주문/무적중을 `00003`, 하나라도 exact 분류 적중을 전체 `2`로 판정한다.
- 분류 누락·미지는 확정을 막지 않고 `Decision.unclassifiedModels` 경고로 드러낸다. 정상 분류값이지만 9조건에 비적중인 품목은 미분류로 기록하지 않는다.
- `PartnerOrderConfirmService.confirm`에서만 분류 lookup과 판정을 호출한다. 판정 결과는 확정 history payload의 `warehouseCode`와 실행 로그에 남긴다.
- 레거시와 달라질 수 있는 32개 모델은 실행 시 모델코드와 분류값을 UUID 없이 로그로 식별한다. 창고 값을 별도로 임의 변경하지 않았다.

## 레거시와 갈리는 상품 32개

개발책임자 확인 대기 목록이며, 구현에서 창고 값을 수정하지 않았다.

`AR-CH01`, `AC060CXAPBH1`, `AC072CXAPBH1`, `AC090CXAPBH1`, `AC100CXAPBH1`, `AC100CXAPHH1`, `AC110CXAPBH1`, `AC110CXAPHH1`, `AC130CXAPBH1`, `AC130CXAPHH1`, `AC145CXAPHH1`, `AC145BXADHH1`, `AR06A9170HNQ`, `AR06B9150HNQ`, `AR06D9151HNQ`, `AR60F06D1A0Q`, `AR60F06D1A1Q`, `AR70H06D1A1Q`, `AR80F06D2A1Q`, `AR80H06D2A1Q`, `ARR-NK3F`, `ARR-PK8F`, `ARR-WK8F`, `FRC-1438XAF2`, `FRH-1412NA3`, `FRH-1412XA3`, `FRH-1438NH3`, `AC060CS6PBH1SY`, `AC110BXAPBH3`, `AC110BXAPHH3`, `AC145BXAPHH5`, `AP083BXPPBH3`

분류 기준 재계산 결과도 정본 대조 보고서와 동일하게 `상일→초월 27`, `초월→상일 5`, 합계 `32`개다.

## 개발책임자 확인 필요

- 32개 상품의 실제 업무 창고 변경 여부: 구현자가 결정하지 않음.
- 분류 데이터가 없는 신규/기타 품목은 현재 초월 기본값으로 확정하며, 로그/history warning으로 보완 대상임을 드러낸다.
- 현재 주문 entity에는 warehouseCode 전용 컬럼이 없으므로 이번 라운드는 confirm history payload와 실행 로그에 결정 결과를 남긴다. 출고전표 자동 전달/영속 컬럼화는 별도 결정 대상이다.

## 2026-08-16 미분류 회귀 수정

### 원인

초기 구현은 `catL`과 `catM`을 모두 필수로 검증해 `catM IS NULL` 품목이 포함된 주문을 예외로 막았다. PM READ ONLY 실측은 전체 3,084개 중 `no_l=1,963`, `no_m=2,194`, `no_cat=1,963`이었다.

### 주문 등장 규모 실측

조회 기준은 공유 `partner_order_db`, `partner_orders`/`partner_order_lines`의 `is_deleted=false`, `created_at` 기준이다. `confirmed_at`은 현재 DRAFT 확정 흐름에서 null이므로 사용하지 않았다. 조회는 `BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK;`로 실행했다.

| 기준 | 결과 |
|---|---:|
| 비삭제 주문 라인 | 8 |
| distinct `model_name` | 6 |
| 첫 주문 생성 | 2026-06-08 |
| 마지막 주문 생성 | 2026-08-07 |
| product DB에서 모델 매칭 | 4 |
| 그중 `catM` 없음 | 2 |
| product DB 미매칭 모델 | 2 |
| `products` 비삭제 전체 / `status=ACTIVE` | 3,084 / 2,982 |

주문 모델은 `AJ060MXHNBC1`, `AR-EH05`, `AXJ-YA2512N`, `AR05TXEAAWKNEU-11`, `AR15TXEAAWKNEU-07`, `AWR-WE13N`이다. 검증자 대조 결과는 distinct 6, 매칭 4, 미매칭 2, 매칭 중 `catM` 없음 2다. `AWR-WE13` 표기는 실제 주문 모델인 `AWR-WE13N`으로 정정했다.

### 정정 정책

미분류·미지 분류·product lookup 미매칭은 창고 판정 단계에서 확정을 막지 않는다. 레거시 `some` 기준에서 known hit가 아니므로 창고 판정에는 적중시키지 않고 `00003` 기본값에 둔다. 정상 분류값이 있는 비적중 품목은 미분류 목록에 넣지 않는다. 대신 실제 미분류만 `Decision.unclassifiedModels`와 `unclassifiedCount`로 만들고 confirm 실행 로그 및 history payload에 모델코드와 건수를 기록한다.

단, 가격 계산 단계의 상품 미매칭은 별도 계약이다. `PartnerOrderPriceCalculationService.calculate()`가 분류 판정보다 먼저 `lookupByModelCodes` 결과가 없는 라인에 `BusinessException(NOT_FOUND, "제품 카탈로그 없음: <modelCode>")`을 던진다. `git blame`과 이력상 이 방어선은 `6a219fa8a7`(2026-08-12)에 도입되었고, 상품 식별·가격표·할인·서버 DC를 근거 없이 계산하거나 가격 없는 주문을 저장하지 못하게 하는 목적이다. 따라서 이번 수정에서 이 예외를 풀지 않았다. 즉 “상품 DB 미매칭도 주문 확정 허용”은 창고 판정 단계에는 성립하지만, 현재 가격 계약까지 포함한 전체 주문 확정에는 성립하지 않는다. 가격을 못 구하는 품목을 확정할지 여부는 업무 결정이 필요하다.

### 정정 RED 원문

```text
./gradlew --no-daemon :services:partner-order-service:test --tests '*OrderWarehouseByClassificationTest'

OrderWarehouseByClassificationTest > missingClassification_defaultsButReturnsVisibleWarning() FAILED
    java.lang.IllegalStateException at OrderWarehouseByClassificationTest.java:53
OrderWarehouseByClassificationTest > unknownClassification_defaultsButReturnsVisibleWarning() FAILED
    java.lang.IllegalStateException at OrderWarehouseByClassificationTest.java:62
6 tests completed, 6 failed
FAILURE: There were failing tests
```

### 정정 GREEN 원문

```text
./gradlew --no-daemon :services:partner-order-service:test --tests '*OrderWarehouseByClassificationTest'

BUILD SUCCESSFUL in 51s
15 actionable tasks: 2 executed, 13 up-to-date
```

### 정상 분류 비적중 오기록 회귀

`AJ060MXHNBC1`(HOME_MULTI/실외기/단배관)과 `AWR-WE13N`(HOME_MULTI/부자재/리모컨)은 실제 분류가 존재하지만 9조건에 적중하지 않는다. 기존 구현은 적중 목록에 없다는 이유만으로 미분류로 기록했다. `classificationAssigned`를 product-service snapshot에 포함하고, 존재·유효한 분류와 미존재/미지 분류를 분리했다. 이에 따라 두 모델은 `00003`이면서 `unclassifiedModels=[]`다.

이번 회귀의 RED 원문은 위 RED 실행에서 새 5필드 `Item` 생성자가 없어 컴파일 실패한 상태다.

```text
OrderWarehouseByClassificationTest.java:102: error: constructor Item in record Item cannot be applied to given types
  required: String,String,String,String
  found:    String,String,String,String,boolean
BUILD FAILED
```

수정 후 GREEN 원문:

```text
./gradlew --no-daemon :services:partner-order-service:test --tests '*OrderWarehouseByClassificationTest'

BUILD SUCCESSFUL in 1m 11s
15 actionable tasks: 3 executed, 12 up-to-date
```
