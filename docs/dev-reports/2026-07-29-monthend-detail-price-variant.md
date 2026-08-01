# 일마감 상세 품목 단가 variant 보정 — PR #991

## 1. 카테고리 매핑 정본 진단

결론은 `products.product_category`이다. 회계 서비스가 사용하는 기존 `POST /products/internal/lookup` 응답의 `categoryKey`가 이 값을 product-service에서 변환해 주므로, 새 API나 새 저장소를 만들지 않고 이 기존 조회를 재사용했다.

근거는 다음과 같다.

- 기존 `ProductSheetSyncService`가 시트 탭을 `ProductCategory`로 분류하고 `products.product_category`에 저장한다.
- 기존 `ProductSummaryResponse.from(Product)`가 `Product.productCategory`를 `categoryKey`로 변환한다. `estimateCategory`는 V18 이후 요약 DTO에서 deprecated 호환 필드로 null을 반환한다.
- 기존 `price_change_schedule`은 `category`, `effective_date`, `default_pre_change`를 보유하고, 기존 `GET /products/internal/price-change-default-variant`가 카테고리별 기본값을 반환한다.

실 DB(`product_db`) 읽기 전용 SELECT 결과:

```text
products.product_category                  nullable
products.estimate_category                 nullable
product_estimate_exposure.estimate_category NOT NULL
price_change_schedule.default_pre_change   NOT NULL

product_category | count
----------------+------
COMMERCIAL_MULTI | 342
HOME_MULTI       | 119
OLD              | 37
SINGLE_PART      | 345
SINGLE_SET       | 276
NULL             | 101

legacy_estimate_null | legacy_estimate_nonnull | active_products | product_category_null
---------------------+-------------------------+-----------------+---------------------
1218                  | 2                       | 1220            | 101

active_exposures | exposed_products | exposure_category_null
-----------------+------------------+------------------------
865              | 784              | 0

category        | effective_date | default_pre_change
----------------+----------------+-------------------
commercialMulti | 2026-07-01     | f
homemulti       | 2026-07-01     | t
oldProducts     | 2026-07-01     | f
singleSets      | 2026-07-01     | f
```

`product_estimate_exposure`는 정본으로 사용할 수 없다. 실제 조인 분포에도 `HOME_MULTI → COMMERCIAL_MULTI(61)`, `HOME_MULTI → SINGLE_SET(12)`, `SINGLE_PART → NULL(337)` 등 다중/불일치가 존재한다. 따라서 폐기된 `products.estimate_category`나 exposure의 추정 분류를 읽지 않고, sync가 저장한 `product_category`에서 파생된 기존 `categoryKey`를 사용한다.

## 2. RED 원문

수정 전 결함 재현 테스트 실행:

```text
> DailyClosingDetailServiceTest > 일마감 상세 — 인상 전 기본 설정 품목은 baseline price_history 단가를 표시한다 FAILED
>     org.opentest4j.AssertionFailedError at DailyClosingDetailServiceTest.java:168
> 1 test completed, 1 failed

<failure message="org.opentest4j.AssertionFailedError:
expected: 90000
 but was: 100000"

> Task :services:accounting-service:test FAILED
> FAILURE: Build failed with an exception.
> Execution failed for task ':services:accounting-service:test'.
> There were failing tests.
> BUILD FAILED
RED_EXIT_CODE=1
```

기존 코드는 `asOf=2026-05-10`으로 조회해 인상 후 `100000`을 표시했고, 테스트가 기대한 baseline `90000`을 표시하지 못했다.

## 3. 구현 및 변경 파일

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductSummary.java:14-26`
  - 기존 lookup wire DTO에 product-service의 `categoryKey`를 추가했다.
  - 기존 6-인자 생성자는 호환용으로 보존했다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductClient.java:51,140-180`
  - `/products/internal/lookup` 청크 상한을 service가 공유하도록 공개했다.
  - 기존 `GET /products/internal/price-change-default-variant`를 호출하고 `categoryKey → defaultPreChange` 맵을 파싱한다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:83,363-505`
  - 매칭된 product ID를 기존 lookup으로 조회해 categoryKey를 확보한다.
  - 카테고리별 기존 `defaultPreChange`가 true이면 `2000-01-01` baseline history를, false이면 전표 기준일 `asOf`를 조회한다.
  - 서로 다른 카테고리는 가격 조회일별로 그룹화해 기존 bulk endpoint로 청크 조회한다.
  - 합계와 stamp 값 경로는 변경하지 않았다.
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java:156-174,344-363`
  - pre-change baseline RED→GREEN 회귀 테스트와 미분류 fail-closed 테스트를 추가했다.
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/client/ProductClientTest.java:89-104`
  - 기존 설정 endpoint의 GET/토큰/맵 파싱 계약을 검증하고 lookup categoryKey fixture를 실제 응답 키(`homemulti`)로 맞췄다.
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/DailyClosingRevalidationIT.java:111-123`
  - 기존 통합 테스트의 ProductClient mock을 실제 lookup/default-variant 계약에 맞췄다.

## 4. 불변식 3 처리

다음 경우 표시 단가를 조회하지 않고 null로 둔다.

- lookup 응답이 없거나 `categoryKey`가 null/공백이다.
- categoryKey가 기존 price-change schedule 4종(`homemulti`, `singleSets`, `commercialMulti`, `oldProducts`) 밖이다.
- 해당 categoryKey의 `defaultPreChange`가 설정 맵에 없거나 null이다.

이 경우 `DiscountRevalidator`에 가격 referent가 없는 상태를 넘겨 일반 품목은 `MISSING_REFERENT`, `verified=null`, `releasePrice/deliveryPrice=null`로 응답한다. `asOf`로 조용히 대체하지 않으므로 틀린 단가를 표시하지 않는다. 실제 schedule이 4종만 허용하므로 `singleParts`/`commercialParts`처럼 매핑은 있으나 설정 축이 없는 카테고리도 같은 fail-closed 처리를 한다. 운임 등 원래부터 product price가 없는 미매칭 라인의 기존 동작은 유지했다.

근거는 사용자가 정한 “카테고리별 `price_change_schedule.default_pre_change`” 판정과 “카테고리를 판정할 수 없으면 조용히 틀린 값을 보이지 말 것” 불변식이다.

## 5. Gradle 검증 원문

실행 명령:

```text
.\gradlew :services:accounting-service:test --rerun-tasks --no-build-cache
```

최종 실행 원문:

```text
BUILD SUCCESSFUL in 7m 44s
21 actionable tasks: 21 executed
```

`--rerun-tasks` 실행 산출물 XML 집계:

```text
suites=200 tests=1686 skipped=10 failures=0 errors=0
```

`up-to-date`로 건너뛴 task는 없었다. 최초 5분 제한 실행은 Testcontainers 기반 통합 컨텍스트 초기화 중 제한에 걸렸고, 동일 명령 재실행은 위와 같이 성공했다.

## 6. 신규 파일

- `docs/dev-reports/2026-07-29-monthend-detail-price-variant.md` (본 보고서)

스키마, 화면, API를 신설하지 않았고 `clients/**` 및 product-service 파일은 수정하지 않았다.
