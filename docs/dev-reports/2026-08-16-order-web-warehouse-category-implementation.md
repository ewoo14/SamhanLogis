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
- 분류 누락·미지는 확정을 막지 않고 `Decision.unclassifiedModels` 경고로 드러낸다.
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
| product DB에서 모델코드 매칭 | 3 |
| 그중 `catM` 없음 | 2 (`AR-EH05`, `AXJ-YA2512N`) |
| product DB 미매칭 모델 | 3 |

주문 모델은 `AJ060MXHNBC1`(HOME, L/M 있음), `AR-EH05`(SINGLE, M 없음), `AXJ-YA2512N`(HOME, M 없음), `AR05TXEAAWKNEU-11`, `AR15TXEAAWKNEU-07`, `AWR-WE13`(product DB 미매칭)이다.

### 정정 정책

미분류·미지 분류·product lookup 미매칭은 확정을 막지 않는다. 레거시 `some` 기준에서 known hit가 아니므로 창고 판정에는 적중시키지 않고 `00003` 기본값에 둔다. 대신 `Decision.unclassifiedModels`와 `unclassifiedCount`를 만들고, confirm 실행 로그 및 history payload에 모델코드와 건수를 기록한다. 이 정책은 업무적으로 확인이 필요한 가정으로 보고하며, 개발책임자가 다른 창고 정책을 정하면 판정기 한 곳만 변경하면 된다.

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
