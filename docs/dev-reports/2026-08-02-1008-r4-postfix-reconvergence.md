# PR #1058 / Issue #1008 R4 — postfix 재수렴 리뷰

## 결론

**BLOCK — 머지 불가.** `setName` 결함을 고친 방향 자체는 맞지만, fix가 부모 세트를 주문/전표의 완성 조합으로 해소하지 않고 “그 구성품을 참조한 부모 중 생성시각이 가장 이른 1개”로 해소한다. 더 근본적으로 레거시는 완성 세트 합계에서 옵션 정액을 한 번만 차감하는데, 현행은 집계된 구성품 행마다 `DiscountRevalidator`를 호출한다. 부모 세트 토큰을 구성품마다 공급한 결과 실외기·패널·리모컨·자재에도 정액이 반복 적용되는 새 과차감 표면이 생겼다.

실 데이터에서 서로 다른 세 가지 모수를 분리했다.

- 현재 `accounting_db`에 실제 저장된 금액 이동 행: **0행**. `sales_accounting_slip_lines`가 0행이고, 남은 `tax_invoice_lines` 22행은 모델명이 전부 없어 이 fix에 도달하지 않는다.
- 실 `product_db` 카탈로그에서 fix 전후 selector가 바뀌는 구성품 링크: **552행**(활성 구성품 모델 54개). 이 중 실제 부모 세트가 옵션 미보유인데 fix가 옵션을 붙이는 확정 과차감 링크는 **22행**이다.
- 위 552개 실 카탈로그 링크를 현재 활성 `dc_config_db` 설정과 결합한 1회 발생 시나리오: 금액이 움직이는 **25,039 partner×catalog 행**, 합계 **1,064,080,000원**. 이 가운데 “실제 부모가 옵션 미보유인데 차감”하는 확정 과차감은 **994행, 42,200,000원**이다. 이는 과거 발생액이 아니라 현재 실 카탈로그 링크가 거래처별로 한 번씩 발생한다고 놓은 조합 실측이다.

이번 라운드에서 새로 만든 파일은 다음 1개다.

- `docs/dev-reports/2026-08-02-1008-r4-postfix-reconvergence.md`

## 1. fix가 만든 새 표면 목록

1. 부모 링크를 구성품 단건만으로 고르면서, 여러 세트가 공유하는 구성품에 잘못된 부모 옵션을 붙일 수 있다.
2. 레거시의 세트 합계 1회 차감을 구성품별 재검증으로 바꾸어 실외기·패널·리모컨·자재에 정액을 중복 차감할 수 있다.
3. `ProductSummaryResponse`의 record component가 늘어 모든 요약 endpoint의 JSON shape가 확장됐다.
4. `lookupSummaryByModelName` 한 번이 기존 제품 1쿼리에서 부모 링크를 포함한 2~3쿼리로 늘었다.
5. `MonthEndCloseService`가 같은 모델을 `resolveProductModels`와 `resolveParentSetNames`에서 각각 조회해 HTTP·DB 조회를 중복한다.
6. 부모 없음은 fallback하지만, 다중 부모 모호성은 fallback하지 않고 첫 링크를 확정값처럼 사용한다.

## 2. 차감되면 안 되는 것이 차감되는가

### 2.1 레거시 금액 단위와 현행 단위가 다르다

레거시 `tools/legacy-gas/일마감 프로그램/Code.js:590-652`는 실내기와 실외기를 먼저 완성 세트로 매칭하고 옵션 구성품까지 `expectedPriceSum`에 더한 다음, 선택된 `setName`의 옵션 정액을 **세트 합계에서 한 번** 뺀다.

```javascript
var setName = cands[c];
var reqComps = catalog.setToComps[setName];
var expectedPriceSum = indoor.price + reqOut.price;
// 패널·리모컨 등 옵션 구성품 가격도 expectedPriceSum에 합산
...
var discount = 0;
// setName으로 옵션 정액 1개 선택
...
var finalExpectedPrice = expectedPriceSum - discount;
```

현행은 `MonthEndCloseService.revalidateProductLines`가 `AxisKey`별로 재검증기를 호출한다. fix는 각 구성품의 `modelToken`을 부모 세트 토큰으로 바꾸므로 같은 완성 세트의 여러 구성품에 같은 정액이 반복 적용될 수 있다.

```java
String optionToken = parentSetNames.getOrDefault(modelToken, modelToken);
DiscountRevalidator.Revalidation revalidation = discountRevalidator.revalidate(
        axisKey.label(), optionToken, ...);
```

R3의 “실내기 100행 불일치 0 유지”는 이미 실내기에서 세트 옵션 정액을 선택하고 있었다는 뜻이다. 실외기 selector 불일치 65행을 부모 세트 selector로 바꿔 0으로 만든 것은 세트 합계 패리티가 아니라, 이미 실내기에서 한 번 차감된 세트 정액을 실외기에도 추가하는 결과다.

### 2.2 실 카탈로그 전수 실측

`product_db`의 활성 `products`와 활성 `bundle_component`를 읽기 전용으로 결합했다. Java와 같은 selector 규칙을 SQL `CASE`로 적용하고, `findParentComponentLink`와 같은 `created_at, id` 순 첫 부모를 fix selector로 재현했다.

원문 요약:

```text
 resolved_component_products | selector_changed_products | newly_option_attached_products | newly_option_removed_products | multi_parent_products | legacy_link_selector_mismatch_rows | should_not_deduct_link_rows | missed_deduction_link_rows
-----------------------------+---------------------------+--------------------------------+-------------------------------+-----------------------+------------------------------------+-----------------------------+----------------------------
                         400 |                        54 |                             54 |                             0 |                   202 |                                243 |                          22 |                          1
(1 row)
```

fix 전후 selector가 달라지는 실 링크 552행의 구성은 다음과 같다. `actual_set_selector`는 해당 링크의 실제 부모 세트 selector이고, `fix_selector`는 구성품 단건 lookup이 고른 첫 부모 selector다.

```text
 component_kind | actual_set_selector | old_selector | fix_selector | rows
----------------+---------------------+--------------+--------------+------
 MATERIAL       | deluxe              | none         | stand        |    3
 MATERIAL       | grade1              | none         | stand        |    4
 MATERIAL       | stand               | none         | stand        |   35
 OUTDOOR        | 360                 | none         | 360          |   10
 OUTDOOR        | 4way                | none         | 360          |   10
 OUTDOOR        | 4way                | none         | 4way         |   17
 OUTDOOR        | stand               | none         | 360          |    7
 OUTDOOR        | stand               | none         | 4way         |   18
 OUTDOOR        | stand               | none         | stand        |    2
 OUTDOOR        | none                | none         | 4way         |    4
 PANEL          | 1way                | none         | 1way         |   22
 PANEL          | 360                 | none         | 360          |   80
 PANEL          | 4way                | none         | 4way         |  108
 PANEL          | grade1              | none         | 4way         |   40
 REMOTE         | 1way                | none         | 360          |   27
 REMOTE         | 1way                | none         | 4way         |    6
 REMOTE         | 360                 | none         | 360          |   30
 REMOTE         | 4way                | none         | 360          |   75
 REMOTE         | 4way                | none         | 4way         |    6
 REMOTE         | grade1              | none         | 360          |   30
 REMOTE         | none                | none         | 360          |   18
(21 rows)
```

합계는 **552행**이다. 세부 판정은 다음과 같다.

- 실제 부모도 옵션 세트지만 첫 부모가 다른 옵션 종류를 고름: **220행**.
- 실제 부모와 같은 옵션 종류를 고르지만 세트 정액을 구성품 행에 또 붙임: **310행**.
- 실제 부모 세트는 옵션 미보유인데 첫 부모가 옵션을 붙임: **22행**. 이 22행은 다른 해석 없이 “차감되면 안 되는 것이 차감”되는 확정 행이다.

확정 22행의 원문은 `360` 18행, `4way` 4행이다.

```text
 chosen_selector | should_not_deduct_link_rows
-----------------+-----------------------------
 360             |                          18
 4way            |                           4
(2 rows)
```

대표 실제 값:

```text
AR-EH05      -> actual AC072BSCPBH2SY / chosen AC060CS6PBH1SY
AWR-WE13N    -> actual AC110CAMDBH1SY / chosen AC060CS6PBH1SY
AC072BXAPBH5 -> actual AC072BSCPBH2SY / chosen AC072BS4PBH7SY
```

### 2.3 실 거래처 설정과 결합한 금액 이동 행

실 `dc_config_db` 읽기 전용 집계 원문:

```text
 active_configs | c360 |    s360    | c4way |   s4way    | c1way |   s1way    | cstand |   sstand
----------------+------+------------+-------+------------+-------+------------+--------+------------
            210 |   45 | 1900000.00 |    46 | 2000000.00 |    45 | 1750000.00 |     45 | 1870000.00
(1 row)
```

552행의 fix selector 분포는 `360=287`, `4way=199`, `stand=44`, `1way=22`다. 각 selector의 nonzero 설정 건수와 금액 합계를 결합한 산술 원문은 다음과 같다.

```text
catalog_changed_link_rows         : 552
partner_catalog_moving_rows       : 25039
partner_catalog_amount_won        : 1064080000
no_option_parent_wrong_rows       : 994
no_option_parent_wrong_amount_won : 42200000
```

계산식:

```text
금액 이동 행 = 287×45 + 199×46 + 44×45 + 22×45 = 25,039행
금액 이동 합계 = 287×1,900,000 + 199×2,000,000 + 44×1,870,000 + 22×1,750,000
               = 1,064,080,000원

실제 부모 옵션 미보유 확정 과차감 = 18×45 + 4×46 = 994행
확정 과차감 합계 = 18×1,900,000 + 4×2,000,000 = 42,200,000원
```

이는 실 카탈로그 링크와 실 거래처 설정의 1회 조합 실측이다. 현재 로컬 DB에서 과거에 실제로 발행된 전표 금액이라고 주장하지 않는다.

### 2.4 현재 영속 전표의 실제 이동 행

읽기 전용 원문:

```text
 sales_rows | sales_rows_with_model
------------+-----------------------
          0 |                     0
(1 row)

 tax_rows | tax_rows_with_model |  tax_total
----------+---------------------+-------------
       22 |                   0 | 17690999.00
(1 row)
```

따라서 현재 영속 전표에서 이 fix로 금액이 움직이는 행은 **0행 / 0원**이다. tax invoice 22행의 VAT 포함 합계 **17,690,999원**은 모델명이 없어 그대로다. 이 0은 fix의 안전성을 뜻하지 않고, 로컬 DB에 도달 가능한 과거 전표가 없다는 뜻이다.

## 3. `ProductSummaryResponse` 계약 표면

### 3.1 직렬화

`parentSetModelCode`는 record component이므로 `lookup-by-model`뿐 아니라 `search`, UUID lookup, model-code lookup, name/label lookup 등 `ProductSummaryResponse`를 반환하는 모든 endpoint JSON shape에 추가된다. `from(Product)` 경로는 값을 null로 채우므로 product-service에 `NON_NULL` 제외 설정이 없는 현재 구성에서는 null 필드도 직렬화 대상이다.

소비자 전수:

- accounting-service: 자체 `ProductSummary`에도 필드를 추가해 소비한다.
- slip-service: 자체 축약 `ProductSummary`로 `ObjectMapper.convertValue`한다. Spring Boot 주입 mapper의 기본 unknown-property 무시 계약이라 additive field를 받아들인다.
- inventory-service: UUID/code lookup 응답을 자체 축약 record로 변환한다. 같은 additive-field 허용 경로다.
- partner-order-service: 응답 Map에서 필요한 키만 수동 추출하므로 새 키를 무시한다.
- desktop의 `productCatalogApi.ts`, `productApi.ts`: TypeScript 구조 타입 소비이며 런타임에서 추가 키를 거부하는 strict decoder가 없다.

현재 저장소에는 `ProductSummaryResponse`를 다른 서비스가 Java 타입으로 직접 import하는 경로가 없다. 따라서 저장소 내부 소비자의 직렬화·역직렬화 파괴는 발견하지 못했다. 다만 외부의 엄격 JSON schema/snapshot 소비자는 조사 대상에 없으며, record canonical component 변경은 외부 바이너리 호환을 보장하지 않는다.

### 3.2 하위호환 생성자

`git grep "new ProductSummaryResponse("` 결과 production factory 2곳과 기존 테스트 호출 5곳, 총 7개 호출 위치가 확인됐다. 추가 전 canonical signature를 보존한 생성자와 더 오래된 단계별 호환 생성자가 이 호출들을 덮는다.

컴파일 원문:

```text
> Task :services:product-service:compileJava UP-TO-DATE
> Task :services:accounting-service:compileJava UP-TO-DATE
> Task :services:product-service:compileTestJava UP-TO-DATE
> Task :services:accounting-service:compileTestJava UP-TO-DATE

BUILD SUCCESSFUL in 17s
12 actionable tasks: 12 up-to-date
```

판정: **저장소 내 소스 호출자 호환 PASS**, 외부 binary/엄격 schema 호환은 **미검증**.

## 4. 조회 비용과 N+1

### 4.1 product-service 쿼리 증폭

fix 전 `lookupSummaryByModelName`은 `findByModelNameAndIsDeletedFalse` 1쿼리였다. fix 후에는 다음 순서다.

1. 제품 exact lookup 1쿼리.
2. `findByComponentProductCode` 부모 링크 1쿼리.
3. 링크가 있으면 `findAllByIdIn(parentIds)` 부모 제품 1쿼리.

실 DB 활성 제품 1,220개 중 부모 해소 제품은 400개, fallback 제품은 820개다. 따라서 단건 lookup은 부모 없음 2쿼리, 부모 있음 3쿼리다. 이 증가가 `/products/internal/lookup-by-model`의 모든 소비자에 적용된다.

### 4.2 accounting-service는 같은 모델을 두 번 호출한다

`MonthEndCloseService.revalidateProductLines`는 먼저 `resolveProductModels`에서 distinct 모델마다 `productClient.lookupByModel(model)`을 호출하고, 바로 이어 `resolveParentSetNames`에서 같은 distinct 모델마다 동일 호출을 반복한다.

따라서 distinct 모델 수를 N이라 하면:

- fix 전: N HTTP, 대략 N DB 쿼리.
- fix 후: **2N HTTP**, 부모 없는 모델은 4N DB 쿼리, 부모 있는 모델은 6N DB 쿼리.

기존 label lookup은 bulk였지만 새 부모 해소는 bulk가 아니다. 명백한 HTTP N+1이며, 같은 응답에 이미 `parentSetModelCode`가 포함됐는데도 첫 번째 결과를 재사용하지 않는다. 두 번째 호출만 실패해도 일마감 전체가 실패하는 가용성 표면도 추가됐다.

현재 `accounting_db`는 모델 보유 원천 행이 0이므로 라이브 N 값을 실측할 데이터가 없었다. 코드 경로의 호출 배수와 `product_db`의 부모 유무 분포까지만 실측했다.

### 4.3 다른 경로

동일 endpoint의 다른 실제 소비자는 slip-service다.

- `GET /slips/lookup-product`의 modelName onBlur lookup: 사용자 조회 1회당 DB 1쿼리에서 2~3쿼리로 증가.
- `SlipPublishService.resolveLines`: 요청 라인 루프 안에서 `productClient.lookupByModel`을 호출하는 기존 HTTP N+1이 있다. fix가 각 라인의 product-service DB 비용을 1쿼리에서 2~3쿼리로 증폭한다.

inventory-service와 partner-order-service가 쓰는 UUID/model-code bulk endpoint는 `lookupSummaryByModelName`을 호출하지 않으므로 이 메서드의 부모 조회 비용 증폭 대상은 아니다. 단, DTO의 additive JSON 필드는 받는다.

판정: **성능 BLOCKING**. 특히 일마감은 동일 모델 중복 HTTP를 제거하거나 부모 링크를 벌크로 해소하기 전 머지하면 안 된다.

## 5. 부모 해소 실패와 fallback

코드의 null/blank fallback 자체는 보존됐다.

```java
if (summary != null && summary.parentSetModelCode() != null
        && !summary.parentSetModelCode().isBlank()) {
    result.put(model, summary.parentSetModelCode());
}
...
String optionToken = parentSetNames.getOrDefault(modelToken, modelToken);
```

실 DB 원문:

```text
 active_products | no_model_code_fallback | no_bundle_parent_fallback | unique_parent_resolution | ambiguous_multi_parent_no_fallback | missing_parent_link_rows | nonbundle_parent_link_rows | deleted_parent_link_rows
-----------------+------------------------+---------------------------+--------------------------+------------------------------------+--------------------------+----------------------------+--------------------------
            1220 |                    100 |                       820 |                      198 |                                202 |                        0 |                          0 |                        0
(1 row)
```

- 모델코드가 없거나 활성 BUNDLE 부모가 없는 **820개 활성 제품**은 기존 `modelToken` fallback을 탄다.
- 링크가 정확히 한 부모로 해소되는 제품은 198개다.
- **202개 활성 제품은 부모가 2개 이상으로 모호하지만 fallback하지 않는다.** `findByComponentProductCode`의 `createdAt, id` 순으로 첫 BUNDLE 부모를 반환한다.
- 현재 실 DB에는 missing/non-BUNDLE/deleted 부모 링크가 0행이어서 그 예외 경로의 실제 발생 행은 없다.

판정: “부모가 없는 경우 fallback 보존”은 PASS지만, 질문에 포함된 “모호한 경우 fallback”은 **FAIL**이다. 202개가 모호함을 숨긴 채 임의 부모를 사용하며, 이것이 220개 링크의 옵션 종류 오선택과 22개 링크의 옵션 신규 과차감으로 현실화됐다.

## 6. 종합 판정

| 항목 | 판정 | 실측 핵심 |
|---|---|---|
| 차감되면 안 되는 행 | **FAIL / BLOCK** | 실제 부모 옵션 미보유 22 catalog행, 994 partner×catalog행, 42,200,000원 |
| fix 전체 금액 이동 표면 | **FAIL / BLOCK** | 552 catalog행, 25,039 partner×catalog행, 1,064,080,000원 |
| DTO 저장소 내부 계약 | PASS | 기존 7개 생성 호출 위치 compile, additive 소비 경로 확인 |
| 다른 서비스 strict/binary 계약 | 미검증 | 외부 엄격 schema·바이너리 소비자 범위 밖 |
| 조회 비용/N+1 | **FAIL / BLOCK** | accounting 2N HTTP, 모델당 4~6 DB 쿼리 |
| 부모 없음 fallback | PASS | 820개 활성 제품 fallback |
| 부모 모호성 fallback | **FAIL / BLOCK** | 다중 부모 202개가 첫 링크를 임의 채택 |

머지 전에는 최소한 (1) 전표/주문 단위의 완성 세트 조합을 해소하고, (2) 옵션 정액을 세트 전체에서 정확히 한 번만 적용하며, (3) 부모 해소를 기존 모델 lookup 결과 재사용 또는 bulk 조회로 바꾸고, (4) 다중 부모를 임의 선택하지 않는 계약이 필요하다.

## 7. 재현 명령 원문

모든 DB 명령은 읽기 전용 트랜잭션으로 실행했다. 핵심 명령 형태는 다음과 같다. 긴 `CASE`는 `DiscountRevalidator.optionDiscountFor`의 문자 위치 규칙을 그대로 옮겼다.

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; WITH links AS (...), chosen AS (...), components AS (...), per_component AS (...) SELECT ...; COMMIT;"
docker exec samhan-postgres psql -U samhan -d dc_config_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT count(*), count(*) FILTER (...), sum(...) FROM dc_configs WHERE NOT is_deleted; COMMIT;"
docker exec samhan-postgres psql -U samhan -d accounting_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT count(*) ... FROM sales_accounting_slip_lines; SELECT count(*) ... FROM tax_invoice_lines; COMMIT;"
```

브랜치·HEAD 확인 원문:

```text
## feat/1008-daily-closing...origin/feat/1008-daily-closing
ca7b5755dbe49f02eb7f131d996603ad1cce3991
```

## 8. 이 라운드가 보지 않은 것

- fix 이전에 이미 존재하던 PR #1058의 다른 기능 결함은 재검토하지 않았다.
- 공유 Docker 이미지를 재빌드하거나 HEAD 코드를 라이브 컨테이너에 배포하지 않았다.
- 현재 DB에 모델 보유 회계 전표가 0행이므로 과거 실발생 거래·과거 손익을 산출하지 않았다.
- Google Sheets 원본을 다시 호출하지 않았다. 이번 라운드의 552행은 실 `product_db`의 활성 카탈로그 링크이며, R2/R3의 시트 200행 검증을 새로 인용해 가장하지 않았다.
- 전체 accounting/product 테스트 suite, 라이브 HTTP latency benchmark, 부하 테스트는 실행하지 않았다.
- 외부 저장소·외부 앱의 엄격 JSON schema, binary consumer, record reflection 의존은 조사하지 않았다.
- 화면 렌더링과 UI 회귀는 조사하지 않았다.

