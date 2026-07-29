# PR #991 카테고리 축 정찰 보고서

- 정찰일: 2026-07-30
- 범위: `MonthEndCloseService` 원천 사슬, `tools/legacy-gas/일마감 프로그램`, 실제 DB 스키마·분포
- 변경: 구현 코드·스키마·화면·DB를 변경하지 않음. DB는 모두 읽기 전용 `SELECT`만 실행함.

## 결론 요약

1. 현대 일마감 상세는 기본적으로 `tax_invoice_lines`에서 시작하고, 선택적으로 `sales_accounting_slip_lines` 또는 `purchase_accounting_slip_lines`에서 시작한다. 어느 경로도 상세 집계 시 카테고리를 전달하지 않는다.
2. 주문 라인에는 `category_key`가 있지만 주문→전표 발행 payload에서 복사되지 않는다. `source_order_line_id`는 일부 전표에 남지만, 전표·회계전표 스냅샷에는 카테고리가 없고 현재 일마감도 그 역참조를 사용하지 않는다.
3. 레거시 GAS는 `일자_번호`별 원본 행 순서를 보존한 채 `품목명`의 모델 토큰을 위에서부터 읽어 `currentZone`을 바꾼다. 고정 행 번호나 명시적인 구분 행이 아니다. 구형은 zone 전환이 아니라 구형 가격표 모델 조회가 우선하는 별도 규칙이다.
4. `byModel`은 품목명 하나를 키로 수량·공급가액·세액을 합산한다. 따라서 같은 모델/품목명이 여러 카테고리 범위에서 팔려도 원래 행 순서, 범위, 라인 ID, 전표 라인, `categoryKey`를 `revalidateProductLines`까지 보낼 수 없다.
5. 실 DB의 `product_estimate_exposure`에는 2개 이상 노출 카테고리를 가진 품목이 68개(57+9+2) 있다. 이는 도메인 표현이며 배제 사유가 아니다. 반면 현재 주문 데이터에서 실제 전환(`converted_quantity > 0`)된 모델의 복수 카테고리 판매 사례는 0건이었다. 직접 입력·기존 전표는 카테고리가 없어 그 경로의 복수 판매 여부는 확인하지 못했다.

## 1. 원천 사슬

### 1.1 공개 진입점과 source 분기

`MonthEndCloseService.java:178-202`의 기본 진입점은 다음과 같다.

```java
public DailyClosingDetailResponse getDailyDetail(LocalDate date) {
    return getDailyDetail(date, DailyClosingKind.SALES,
            DailyClosingSourceKind.TAX_INVOICE);
}

return switch (source) {
    case TAX_INVOICE -> getTaxInvoiceDailyDetail(date, kind);
    case SALES_SLIP -> getSalesSlipDailyDetail(date);
    case PURCHASE_SLIP -> getPurchaseSlipDailyDetail(date);
};
```

따라서 상세의 실제 원천은 source 선택에 따라 세 갈래다.

| 상세 source | 코드상 원천 조회 | 라인에서 `byModel`로 가져오는 값 | 다음 단계 |
|---|---|---|---|
| 기본 `TAX_INVOICE` | `TaxInvoiceRepository.findIssuedInRange` (`MonthEndCloseService.java:205-210`) | `TaxInvoiceLine.itemName`, quantity, supply/vat (`:236-242`) | `revalidateProductLines(byModel, date)` (`:245`) |
| `SALES_SLIP` | `SalesAccountingSlipRepository.findBySlipDateAndStatusWithLines` (`:258-260`) | `SalesAccountingSlipLine.productName`, qty, supply/vat (`:283-285`) | 동일 revalidation (`:288-289`) |
| `PURCHASE_SLIP` | `PurchaseAccountingSlipRepository.findBySlipDateAndStatusWithLines` (`:292-294`) | `PurchaseAccountingSlipLine.productName`, qty, supply/vat (`:317-319`) | 동일 revalidation (`:322-323`) |

공통 누적 함수는 `MonthEndCloseService.java:352-362`이다.

```java
String key = productName == null || productName.isBlank() ? "-" : productName;
ModelAccumulator acc = byModel.computeIfAbsent(key, k -> new ModelAccumulator());
acc.quantity = acc.quantity.add(nullToZero(quantity));
acc.supplyAmount = acc.supplyAmount.add(nullToZero(supplyAmount));
acc.vatAmount = acc.vatAmount.add(nullToZero(vatAmount));
```

`revalidateProductLines`의 입력은 `Map<String, ModelAccumulator>`와 날짜뿐이다(`MonthEndCloseService.java:364-370`). 즉 호출 사슬의 마지막 입력에 카테고리, 원래 라인 순번, source order line ID, GAS의 범위 상태가 없다.

### 1.2 주문에서 현대 전표까지의 사슬

주문 라인 자체는 카테고리를 보유한다.

```java
// PartnerOrderLine.java:74-76
@Column(name = "category_key", nullable = false, length = 30)
private String categoryKey;
```

그러나 주문 전환 payload에는 카테고리 항목이 없다.

```java
// PartnerOrderConvertService.java:147-154
linePayload.put("productCode", line.getModelName());
linePayload.put("productName", line.getProductName());
linePayload.put("qty", String.valueOf(item.quantity()));
linePayload.put("unitPriceVat", line.getPriceVat());
linePayload.put("remarks", line.getRemark());
linePayload.put("sourceOrderLineId", line.getId().toString());
```

병합 전환 경로도 동일하게 `productCode`, `productName`, 수량, 단가, 비고, `sourceOrderLineId`만 보낸다(`PartnerOrderMergeConvertService.java:164-171`).

slip-service의 수신 계약 `PublishLineRequest`에는 `categoryKey`가 없고 `sourceOrderLineId`만 있다(`slip-service/.../PublishLineRequest.java:30-41`). `SlipPublishService.resolveLines`도 이 필드들을 `SlipLine`으로 옮기지만 카테고리는 읽지 않는다(`SlipPublishService.java:734-753`, `:876-885`). 실제 `slip_lines` migration에도 `category_key`는 없고, 나중에 추가된 것은 nullable `source_order_line_id`뿐이다(`V1__init_slip_service.sql:69-87`, `V29__add_slip_line_source_order_line.sql:1-4`).

그 다음 accounting-service가 받는 `SlipLineSnapshot`도 `productName`, 수량, 단가, 전표 상태·유형까지만 가진다(`accounting-service/.../SlipLineSnapshot.java:24-37`). 매출 회계전표 생성은 그 snapshot을 검증에 쓰고, 회계 라인에는 productCode/productName/금액과 allocation의 `sourceLineId`만 기록한다(`SalesAccountingSlipCreateAttemptService.java:91-105`).

기본 `TAX_INVOICE` 경로에서는 더 끊긴다. `TaxInvoiceLine`에는 `itemName`, `spec`, 수량, 단가, 금액만 있고(`TaxInvoiceLine.java:55-80`), 매출·매입 회계전표 라인에서 세금계산서 라인을 만들 때도 품목명·상품코드(spec)·금액만 복사한다(`TaxInvoiceLine.java:163-199`).

## 2. ②′ 레거시 GAS의 범위 판별

대상 소스는 `tools/legacy-gas/일마감 프로그램/Code.js`와 `Index.html`이다.

### 2.1 입력과 그룹 범위

브라우저는 업로드된 XLSX의 **첫 번째 시트**를 `range: 1`로 읽고(`Index.html:852-862`), 다음 행만 남긴다.

```javascript
ecountData = raw.filter(r => r['번호']
  && !String(r['품목명']).includes('합계')
  && !String(r['품목명']).includes('총계'));
```

입력 헤더는 `Code.js:11-14`의 `FINAL_HEADERS`에 정의되어 있으며, 분류에 직접 쓰이는 원본 컬럼은 다음과 같다.

| 입력 | 사용처 |
|---|---|
| `일자` | 단가 인상 전/후 suffix 결정(`Code.js:424-439`) 및 전표 그룹 키 |
| `번호` | `일자_번호` 전표 그룹 키(`Code.js:473-478`) |
| `품목명` | 모델 토큰 추출, 카테고리 전환 패턴, 부자재 패턴 |
| `수량`, `단가(VAT포함)` | 가격·수량 계산 및 검증 |

각 전표 그룹은 `일자_번호`로 묶이고 원본 배열 순서대로 `items`를 순회한다(`Code.js:473-486`). 따라서 GAS의 “범위”는 전표 그룹 내부의 연속된 원본 행 구간이다.

### 2.2 범위 경계

범위 상태는 매 전표 그룹마다 `UNKNOWN`으로 시작한다(`Code.js:480-484`). 명시적 separator 행이나 고정 행 번호를 읽는 코드는 확인되지 않았다. 대신 현재 품목의 `품목명`에서 모델 토큰을 뽑은 뒤 다음 패턴이 맞으면 `currentZone`을 바꾼다(`Code.js:486-497`).

```javascript
if (/^AM/.test(t) && t.length >= 7 && (t[6] === 'X' || t[6] === 'N')) {
  currentZone = 'COMM_MULTI';
} else if (/^AJ/.test(t) && t.length >= 7 && (t[6] === 'X' || t[6] === 'N')) {
  currentZone = 'HOME_MULTI';
} else if (isTargetModelCode_(t)
    && (cls === 'INDOOR' || cls === 'OUTDOOR' || cls === 'SUB_INDOOR')) {
  currentZone = 'SINGLE';
  hasSingleMain = true;
}
item._zone = currentZone;
```

모델 토큰은 `품목명`에서 괄호 등을 제거한 뒤 `AC/AP/AR/AF/AM/AJ/AXJ/...` 패턴을 추출한다(`Code.js:160-173`). 그러므로 경계는 다음과 같다.

- `AM...`의 특정 모델 코드 행부터 `COMM_MULTI`.
- `AJ...`의 특정 모델 코드 행부터 `HOME_MULTI`.
- 싱글 대상 모델 코드이면서 catalog 분류가 실내기·실외기·서브실내기인 행부터 `SINGLE`.
- 다음 경계 패턴이 나올 때까지 그 상태가 아래 행에 전달된다.
- 시작 경계를 만나기 전의 행은 `UNKNOWN`이다.

`SINGLE` 판정에 쓰는 보조 입력은 GAS가 연결한 Google Sheet의 `싱글 구성품` 탭이다. `loadSingleSetCatalog`는 `모델명`, `세트`, `구분` 컬럼을 읽고 `구분`의 `실내기/실외기/판넬/리모컨/자재`를 분류한다(`Code.js:218-250`). 실제 Google Sheet의 현재 행 내용은 이번 정찰에서 외부로 조회하지 않았으므로 확인하지 못했다.

### 2.3 네 카테고리와의 대응

홈멀티·상업멀티·싱글중대형은 위 `currentZone` 범위로 대응한다. 싱글은 가격표상 `싱글 세트`와 `싱글 구성품`을 모두 `SINGLE` zone으로 적재한다(`Code.js:302-308`).

구형은 이 범위 상태와 다르다. `loadPriceMap_`가 이름에 `구형`이 들어간 모든 시트에서 `모델명`, `출고가`, `납품가`를 읽어 `priceMap.OLD`에 넣는다(`Code.js:275-299`). 실제 행 처리에서는 먼저 `priceMap['OLD'][t]`를 조회하고(`Code.js:519-520`), 구형이 아니면 `currentZone`을 가격 map 선택에 사용한다(`Code.js:522-524`). 따라서 구형은 “구형 범위의 시작 행”이 아니라 **모델 토큰이 구형 가격표에 존재하는지에 따른 우선 조회**다.

`AXJ`는 별도 예외로 `COMM_MULTI` 가격 map을 사용한다(`Code.js:522`). 이 또한 범위 경계를 새로 만드는 것이 아니라 가격 조회 zone을 덮어쓰는 규칙이다.

### 2.4 같은 품목이 두 범위에 나타날 수 있는가

코드상 가능하다. 각 원본 행에 `item._zone`을 따로 기록할 뿐, 같은 토큰이 이미 다른 zone에 등장했는지 검사하거나 합치지 않는다(`Code.js:486-500`). 예를 들어 한 전표 그룹에서 `AJ...` 행 뒤 `AM...` 행이 나오고 같은 `t`가 다시 나오면, 두 번째 행은 현재 상태에 따라 `COMM_MULTI`로 기록될 수 있다. 그 뒤 가격도 구형 우선 조회가 아니면 `searchZone`을 따라 달라질 수 있다(`Code.js:519-524`).

다만 실제 레거시 Google Sheet/XLSX 원본에서 동일 품목이 두 범위에 실제로 등장했는지는 원본 파일이 저장소에 없고 외부 Sheet를 이번 정찰에서 조회하지 않았으므로 **확인하지 못함**이다. GAS 코드에는 이를 금지하는 방어 로직이 없다는 것만 확인했다.

## 3. ②″ 현대 시스템이 필요한 입력을 갖는가

### 3.1 실제 스키마 확인

읽기 전용 `information_schema.columns` 조회 결과는 다음과 같다.

| DB / 테이블 | 확인된 카테고리 관련 상태 |
|---|---|
| `partner_order_db.partner_order_lines` | `category_key VARCHAR`, `NOT NULL` 존재 |
| `slip_db.slip_lines` | `product_name`, `model_name`, `source_order_line_id`는 있으나 `category_key` 없음 |
| `accounting_db.sales_accounting_slip_lines` | `product_code`, `product_name`, `qty`, 금액만 있고 `category_key` 없음 |
| `accounting_db.purchase_accounting_slip_lines` | 위와 동일, `category_key` 없음 |
| `accounting_db.tax_invoice_lines` | `item_name`, `spec`, quantity, 금액만 있고 `category_key` 없음 |

이 결과는 migration의 정의와도 일치한다. 주문 라인은 `V1__init_partner_order.sql:62-69`에 `category_key`가 있고, slip 라인은 `V1__init_slip_service.sql:69-87`에 없으며, 회계전표 라인은 `V18__add_sales_accounting_slips.sql:39-60` 및 `V19__add_purchase_accounting_slips.sql:39-60`에 없다. 세금계산서 라인도 `V2__add_tax_invoice.sql:68-87`에 카테고리가 없다.

### 3.2 무엇이 남고 무엇이 유실되는가

- 남아 있는 것: 일부 현대 라인은 모델명/품목명과 라인 순번 또는 `sourceOrderLineId`를 가진다. 주문 라인 원본에는 `category_key`가 있다.
- 유실된 것: GAS의 `일자_번호` 원본 행 범위 상태(`currentZone`), AM/AJ/싱글 시작 행이라는 의미, 전환 시점의 카테고리, 주문 라인의 `category_key`가 slip/accounting/tax line payload와 schema에 없다.
- 부분 역추적: `slip_lines.source_order_line_id`는 nullable이고 일부 라인에만 있다. 현재 accounting의 `SlipLineSnapshot`에는 이 값조차 포함되지 않는다. 따라서 링크가 있는 전표에 한해 별도 주문 조회를 하면 복구 가능성이 있지만, 현재 일마감 원천만으로는 직접 사용할 수 없다.
- 기본 세금계산서 경로: 회계전표에서 세금계산서로 만들 때 `itemName`, `spec`, 금액만 복사하므로 카테고리와 주문 역참조가 더 이상 라인에 없다.

결론적으로 현대 시스템은 레거시 분류에 필요한 **모델 텍스트 일부**는 갖지만, 정확한 GAS 범위 의미를 나타내는 카테고리 입력은 일마감 원천까지 보존하지 않는다. `product_estimate_exposure`를 그 빈자리에 대입하는 것도 정확한 재현이 아니다. 이 테이블은 한 품목이 여러 `EstimateCategory`에 동시에 노출될 수 있는 상품 카탈로그 M:N 데이터(`ProductEstimateExposure.java:18-24`)이지, 해당 전표 라인이 어느 범위에서 팔렸는지를 기록한 이력 데이터가 아니다.

## 4. `byModel` 집계에서 유실되는 것

| 원래 라인에 있을 수 있는 정보 | 현재 코드에서의 결과 |
|---|---|
| 카테고리/범위 (`categoryKey`, GAS `currentZone`) | 저장·전달되지 않음 |
| 원본 라인 ID, 주문 라인 ID, slip line ID | `byModel` key/value에 없음 |
| `일자_번호` 및 원본 행 순서 | tax/slip 모드 모두 모델별 Map에 들어가며 사라짐 |
| 같은 모델의 카테고리별 수량·금액 | 동일 문자열 key면 하나의 `ModelAccumulator`로 합산 |
| 서로 다른 product ID지만 같은 표시 품목명 | 표시명 key 충돌 시 합산될 수 있음 |

세금계산서 경로는 `line.getItemName()`을 key로 삼고(`MonthEndCloseService.java:236-242`), 매출·매입전표 경로는 `line.getProductName()`을 `accumulateProduct`에 넣는다(`:283-285`, `:317-319`). 그 결과 같은 모델이 서로 다른 레거시 범위로 팔렸어도 `revalidateProductLines`에는 모델명 하나와 합산 금액만 도착한다. 현재 구조로는 카테고리별 단가를 두 행으로 표시하거나, 어느 범위의 단가를 선택했는지 설명할 근거가 없다.

## 5. 네 표기 변환표

`PriceChangeSchedule.CATEGORY_KEYS`의 정식 키는 `homemulti`, `singleSets`, `commercialMulti`, `oldProducts` 네 개다(`PriceChangeSchedule.java:37-42`). 실제 `price_change_schedule`도 이 네 행만 확인됐다.

| 레거시 GAS 판별 결과 | 라인 `categoryKey` 정식 대응 | `product_estimate_exposure.estimate_category` | `price_change_schedule` 키 | 근거/주의 |
|---|---|---|---|---|
| `HOME_MULTI` zone; `홈멀티` 가격표 | `homemulti` | `HOME_MULTI` | `homemulti` | `ProductSheetSyncService.java:108-111` |
| `SINGLE` zone; `싱글 세트`·`싱글 구성품` | `singleSets` | `SINGLE_SET` | `singleSets` | GAS 두 탭은 하나의 `SINGLE` zone; product sync의 구성품은 상품 master 노출과 별도임 (`:112-117`, `:1621-1623`) |
| `COMM_MULTI` zone; `상업멀티`·`상업멀티 구성` | `commercialMulti` | `COMMERCIAL_MULTI` | `commercialMulti` | `ProductSheetSyncService.java:118-123` |
| 구형 가격표 `priceMap.OLD[t]` 적중 | `oldProducts` | `LEGACY` | `oldProducts` | GAS에서 별도 zone이 아니라 구형 모델 가격 우선 조회; sync mapping `:124-126` |
| GAS `UNKNOWN`, 자재/부자재 예외 또는 임의 `categoryKey` | 정식 네 키로 추측 불가 | `OTHER` 또는 해당 exposure 없음 | 대응 키 없음 | `OTHER`는 `EstimateCategory`에만 있고 schedule 네 키에는 없음. DB에는 `AIR_CONDITIONER` 같은 비정식 주문 키도 존재하므로 조용히 네 키로 변환하면 안 됨 |

이 표는 의미 대응표이지 상품 master의 단일 카테고리로 판매 라인을 추정하라는 뜻이 아니다. `ProductEstimateExposure`의 다중 매핑은 확인된 도메인이고 배제 사유로 사용하지 않는다.

실 DB의 현재 schedule 값도 읽기 전용 SELECT로 확인했다.

```text
 category        | effective_date | default_pre_change
-----------------+----------------+--------------------
 commercialMulti | 2026-07-01     | false
 homemulti       | 2026-07-01     | true
 oldProducts     | 2026-07-01     | false
 singleSets      | 2026-07-01     | false
```

따라서 카테고리 축을 확보할 수 있다면 GAS의 네 범위와 schedule의 `default_pre_change` 선택은 위 키로 직접 연결할 수 있다. 반대로 `UNKNOWN` 또는 schedule에 없는 주문 키는 이 표에서 임의로 네 키에 끼워 넣을 수 없다.

## 6. 실 데이터 복수 카테고리 판매 사례

### 6.1 상품 노출 M:N 분포

읽기 전용 SELECT:

```sql
WITH per_product AS (
  SELECT product_id, count(DISTINCT estimate_category) AS category_count
  FROM product_estimate_exposure
  WHERE is_deleted = false
  GROUP BY product_id
)
SELECT category_count, count(*) AS product_count
FROM per_product
GROUP BY category_count
ORDER BY category_count;
```

결과:

```text
 category_count | product_count
----------------+--------------
              1 |          716
              2 |           57
              3 |            9
              4 |            2
```

따라서 2개 이상 노출 품목은 68개다. 이것은 품목이 여러 카탈로그에 등록될 수 있다는 실측이며, 판매 라인의 카테고리를 배제하는 근거가 아니다.

### 6.2 주문 전환·전표 연결 기준

현재 DB에서 “팔린”을 `partner_order_lines.converted_quantity > 0`으로 operational하게 정의해 읽었다.

```sql
WITH per_model AS (
  SELECT model_name,
         count(DISTINCT category_key) AS category_count
  FROM partner_order_lines
  WHERE is_deleted = false AND converted_quantity > 0
  GROUP BY model_name
)
SELECT category_count, count(*) AS model_count
FROM per_model
GROUP BY category_count
ORDER BY category_count;
```

결과:

```text
 category_count | model_count
----------------+-------------
              1 |          10
```

전환 수량이 양수인 15개 주문 라인, 10개 모델에서는 **동일 모델의 복수 카테고리 판매 0건**이다. `CONFIRMED`·`CONVERTED` 주문만 포함한 별도 조회도 category_count 1인 모델 10개, 2개 이상 0건이었다.

참고로 삭제되지 않은 주문 라인 전체에는 category_count 2인 모델이 4개 있었지만 모두 실제 전환 기준에 포함되지 않는 주문도 섞인 전체 주문 데이터다. 따라서 이를 판매 사례로 세지 않았다.

slip DB에는 활성 라인 2,791건, `source_order_line_id` 연결 라인 22건(고유 주문 라인 17건)이 있다. 연결 가능한 주문 라인을 별도 SELECT로 대조한 결과도 동일 모델 복수 category_key는 0건이었다. 나머지 slip 라인은 카테고리 컬럼이 없어 판매 카테고리의 복수 여부를 확인하지 못했다. accounting DB의 현재 활성 라인은 `tax_invoice_lines` 22건, `sales_accounting_slip_lines` 0건, `purchase_accounting_slip_lines` 0건이며, 이 라인들에도 카테고리 컬럼이 없다.

그러므로 실 데이터에 대한 정직한 결론은 다음과 같다.

- 주문 전환 및 주문 라인 역추적이 가능한 현재 판매 표본: 복수 카테고리 모델 **0건**.
- 상품 노출 M:N: 복수 노출 품목 **68건**.
- 직접 입력/기존 slip/accounting/tax 라인의 과거 판매 카테고리: 컬럼 부재로 **확인하지 못함**.

## 7. 슬라이스 제안

정확한 GAS 범위 재현과 현대 일마감의 단가 불변식을 한 번에 섞지 않도록 다음 순서를 제안한다.

1. **분류 계약 슬라이스**: GAS의 `currentZone`과 네 schedule 키의 대응을 명시하고, `UNKNOWN`·비정식 키(`AIR_CONDITIONER` 등)를 정상/미상으로 구분하는 테스트 계약을 먼저 고정한다.
2. **라인 원천 보존 슬라이스**: 주문 경로에서 이미 존재하는 `categoryKey`를 전표 라인과 회계 라인 조회 모델까지 전달한다. `sourceOrderLineId` 역조회만으로 모든 직접 입력·기존 라인을 복구할 수 있다고 가정하지 않는다.
3. **집계 축 슬라이스**: `byModel`을 모델명 단일 key로 합치지 않고 최소 `(라인 식별자/원천, 모델, category)` 축으로 보존한다. 같은 모델이 여러 카테고리로 존재하면 별도 상세 라인으로 남긴다.
4. **레거시·미상 입력 슬라이스**: raw Ecount/GAS의 행 순서와 marker가 현대 DB로 들어오지 않는 경로는 별도 원천으로 취급한다. 정확한 GAS 결과가 필요하면 ingest 시점에 범위 판정 결과를 저장해야 하며, 그렇지 않으면 `UNKNOWN`/확인 불가로 표시하고 상품 master나 다중 exposure를 추측값으로 사용하지 않는다.

## 8. 이번 정찰이 보지 않은 것

- 실제 Google Spreadsheet의 현재 탭 행과 실제 Ecount XLSX 원본 파일은 조회하지 않았다. 따라서 같은 품목이 GAS 원본에서 두 범위에 실제로 반복되었는지는 **확인하지 못함**이다.
- 현대 직접 입력/기존 slip 라인에 대해 원본 Ecount `번호`와 `일자`를 완전하게 역대조하지 않았다. 현대 tax invoice의 invoice 번호가 GAS 원본 `번호`와 동일하다는 근거도 확인하지 못했다.
- `product_estimate_exposure`의 68개 다중 노출 품목을 판매 라인과 연결해 카테고리를 추정하지 않았다. 그것은 이번 정찰의 결론과도 맞지 않는 접근이다.
- 구현, migration, API/화면 변경, fixture 작성, 테스트 실행 및 데이터 backfill은 하지 않았다.
- `categoryKey`를 어느 서비스 경계까지 nullable로 허용할지, 직접 입력·구형 데이터의 최종 사용자 표시 문구는 설계 슬라이스에서 결정할 사항으로 남겼다.
