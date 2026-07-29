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

`SINGLE` 판정에 쓰는 보조 입력은 GAS가 연결한 Google Sheet의 `싱글 구성품` 탭이다. `loadSingleSetCatalog`는 `모델명`, `세트`, `구분` 컬럼을 읽고 `구분`의 `실내기/실외기/판넬/리모컨/자재`를 분류한다(`Code.js:218-250`). 실제 Google Sheet의 해당 탭도 읽었고, 실제 header/data 행 수와 모델 토큰 중복은 §6.3에 기록했다. 단, 이 탭은 매출 raw의 행 순서를 제공하지 않는다.

### 2.3 네 카테고리와의 대응

홈멀티·상업멀티·싱글중대형은 위 `currentZone` 범위로 대응한다. 싱글은 가격표상 `싱글 세트`와 `싱글 구성품`을 모두 `SINGLE` zone으로 적재한다(`Code.js:302-308`).

구형은 이 범위 상태와 다르다. `loadPriceMap_`가 이름에 `구형`이 들어간 모든 시트에서 `모델명`, `출고가`, `납품가`를 읽어 `priceMap.OLD`에 넣는다(`Code.js:275-299`). 실제 행 처리에서는 먼저 `priceMap['OLD'][t]`를 조회하고(`Code.js:519-520`), 구형이 아니면 `currentZone`을 가격 map 선택에 사용한다(`Code.js:522-524`). 따라서 구형은 “구형 범위의 시작 행”이 아니라 **모델 토큰이 구형 가격표에 존재하는지에 따른 우선 조회**다.

`AXJ`는 별도 예외로 `COMM_MULTI` 가격 map을 사용한다(`Code.js:522`). 이 또한 범위 경계를 새로 만드는 것이 아니라 가격 조회 zone을 덮어쓰는 규칙이다.

### 2.4 같은 품목이 두 범위에 나타날 수 있는가

코드상 가능하다. 각 원본 행에 `item._zone`을 따로 기록할 뿐, 같은 토큰이 이미 다른 zone에 등장했는지 검사하거나 합치지 않는다(`Code.js:486-500`). 예를 들어 한 전표 그룹에서 `AJ...` 행 뒤 `AM...` 행이 나오고 같은 `t`가 다시 나오면, 두 번째 행은 현재 상태에 따라 `COMM_MULTI`로 기록될 수 있다. 그 뒤 가격도 구형 우선 조회가 아니면 `searchZone`을 따라 달라질 수 있다(`Code.js:519-524`).

실제 가격·카탈로그 탭은 이번 추가 정찰에서 읽었다. 그 탭들 사이에 같은 토큰이 여러 zone으로 반복되는 것은 확인했지만, 이것은 `currentZone`이 직접 순회하는 매출 원본 행이 아니다. `currentZone`의 입력은 `Index.html:858-874`에서 브라우저가 업로드한 XLSX 첫 시트를 읽어 만든 `ecountData`이고, Google Sheet는 `Code.js:217-219`, `:272-312`에서 가격표·싱글 구성품 catalog로만 읽힌다. 따라서 **카탈로그 탭 간 중복은 확인했지만, 한 매출 raw 전표의 연속 행에서 동일 품목이 두 `currentZone` 범위에 실제로 반복된 사례는 raw XLSX가 없어 확인하지 못함**이다.

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

### 4.1 `processDailyData` zone 전환 의사코드

`extractModelToken_`·`isTargetModelCode_`·`classifyComp`·`processDailyData`(`Code.js:167-211`, `:420-523`)를 그대로 옮기면 다음과 같다. `clean_item_name_`은 대괄호·소괄호·중괄호 안을 제거하고 trim한다.

```text
extractModelToken(name):
  if name is empty: return ""
  u = uppercase(clean_item_name(name))
  if u matches word-boundary (AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)
                 + [A-Z0-9-]{4,}:
      return matched token
  if u starts with "AR-" or "ARR-":
      return first whitespace-delimited token
  return u

isTargetModelCode(t):
  return t matches ^A[CP][0-9]{3}
      or ^AF[0-9]{2}
      or ^AR[0-9]{2}

classifyComp(t):
  ^PC                  -> PANEL
  ^AWR- or ^AR-        -> REMOTE
  ^A[CP][0-9]{3}, t[6]=N -> INDOOR
  ^A[CP][0-9]{3}, t[6]=X -> OUTDOOR
  ^AR[0-9]{2}, no '-', t[11]=N -> INDOOR
  ^AR[0-9]{2}, no '-', t[11]=X -> OUTDOOR
  ^AR[0-9]{2}, no '-', t[11]=Q -> SUB_INDOOR
  ^AF[0-9]{2}, t[11]=N -> INDOOR
  ^AF[0-9]{2}, t[11]=X -> OUTDOOR
  otherwise             -> MATERIAL

for each invoice group keyed by raw 일자 + "_" + raw 번호:
  currentZone = UNKNOWN
  for each item in original row order:
    t = extractModelToken(item.품목명)
    cls = catalog.itemClassMap[t] if present, otherwise classifyComp(t)

    if t starts ^AM, length >= 7, t[6] in {N, X}:
      currentZone = COMM_MULTI
    else if t starts ^AJ, length >= 7, t[6] in {N, X}:
      currentZone = HOME_MULTI
    else if isTargetModelCode(t)
         and cls in {INDOOR, OUTDOOR, SUB_INDOOR}:
      currentZone = SINGLE
      hasSingleMain = true

    item.zone = currentZone

price lookup after zone assignment:
  OLD model-map hit takes precedence over zone
  AXJ token forces searchZone = COMM_MULTI
  otherwise searchZone = currentZone
```

이 알고리즘에는 zone을 닫는 별도 token이나 구분 행이 없다. `AM...N/X`는 상업멀티를 열고, `AJ...N/X`는 홈멀티를 열고, catalog 분류까지 통과한 `AC/AP/AF/AR` 계열 target 모델은 싱글을 연다. 다음 전환 token이 나올 때까지 아래 행에 상태를 전달한다. `OLD`와 `AXJ`는 zone 전환이 아니라 가격 map 선택 우선순위다(`Code.js:167-211`, `:486-523`).

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

### 6.3 실 Google Spreadsheet 탭과 카탈로그 행 확인

SA 키는 `C:\dev\samhan-homepage-260f8ae469cc.json` 경로에서 읽었고, 키 내용은 출력·저장하지 않았다. Sheets API는 `spreadsheets.get` 및 `values.get`만 호출했다. 시트 쓰기 API(`values.update`, `batchUpdate`)는 호출하지 않았다.

#### 탭 전수 목록

실제 spreadsheet title은 `종합 견적서`였고, 현재 탭은 27개였다. `(hidden)`은 Sheets metadata의 hidden 값이 true인 탭이다.

```text
0  전표생성폼
1  종합견적서
2  전표업로드목록
3  홈멀티
4  홈멀티_단가인상
5  싱글 세트
6  싱글 세트_단가인상
7  싱글 구성품
8  싱글 구성품_단가인상
9  상업멀티
10 상업멀티_단가인상
11 싱글 자재가격 (hidden)
12 상업멀티 구성
13 상업멀티 구성_단가인상
14 분기계산
15 구형
16 장비스펙
17 부속품스펙
18 홈멀티_템플릿
19 거래처
20 전표생성폼_템플릿 (hidden)
21 싱글 세트_템플릿 (hidden)
22 상업멀티_템플릿
23 분기계산_템플릿 (hidden)
24 구형_템플릿 (hidden)
25 담당자 (hidden)
26 추천실외기 (hidden)
```

`매출전표X - ` 접두사로 시작하는 탭은 **0개**였다. `일자`, `번호`, `품목명` 세 컬럼을 동시에 가진 탭도 **0개**였다. 따라서 이 spreadsheet 전수 목록에는 개발책임자가 가정한 매출 raw 탭이 존재하지 않는다.

#### `suf`가 짝지우는 대상

실제 코드에서 `suf`는 매출 raw 탭 선택값이 아니다.

```javascript
// Code.js:423-439
var suffix = '';
// ecountData 첫 최대 5행의 '일자'를 읽음
if (dateNum >= 20260701) suffix = '_단가인상';

// Code.js:453-455, 302-312
var priceMap = loadPriceMap_(suffix);
var catalog = loadSingleSetCatalog(suffix);
var sh = ss.getSheetByName(info.n)
      || ss.getSheetByName(info.n.replace(suf, ''));
```

즉 `suf`의 의미는 다음과 같다.

- `''`: `홈멀티`, `싱글 세트`, `싱글 구성품`, `상업멀티`, `상업멀티 구성`의 기본 가격 탭을 선택한다.
- `'_단가인상'`: 같은 이름의 `_단가인상` 가격 탭을 먼저 선택하고, 없으면 `suf`를 뺀 기본 탭을 fallback으로 선택한다.
- `구형`: `getSheets()`로 모든 탭을 훑되 이름에 `구형`이 포함된 탭에서 `모델명`·`출고가`·`납품가`를 읽는 별도 `OLD` map이다(`Code.js:275-299`).
- `매출전표X - `: 탭 선택과 무관하며 `Code.js:465-466`에서 `회계반영일자` 셀에 기록하는 문자열 값이다.

또한 브라우저의 실제 raw 입력은 `Index.html:858-874`다.

```javascript
const workbook = XLSX.read(data, {type: 'binary'});
let raw = XLSX.utils.sheet_to_json(
  workbook.Sheets[workbook.SheetNames[0]], {range: 1});
ecountData = raw.filter(r => r['번호'] && ...);
```

따라서 “GAS가 spreadsheet의 `매출전표X - ` 탭을 읽는다”는 전제는 현재 저장소의 코드와 실 시트 전수 목록으로 확인되지 않는다. 현재 구현은 업로드 XLSX를 raw로 받고, spreadsheet는 가격·catalog source로 사용한다.

#### 가격·catalog 탭 실제 행과 zone 재현

GAS의 실제 tab별 header/data 시작 행을 그대로 적용해 `values.get` 결과를 읽었다.

| 탭 | 실제 행 수 | GAS header index | header 행 | 모델명 컬럼 | GAS 해석 |
|---|---:|---:|---:|---:|---|
| `홈멀티` | 122 | 2 | 3 | B | `HOME_MULTI` |
| `싱글 세트` | 291 | 2 | 3 | C | `SINGLE` |
| `싱글 구성품` | 1,737 | 1 | 2 | C | `SINGLE` catalog |
| `상업멀티` | 421 | 2 | 3 | B | `COMM_MULTI` |
| `상업멀티 구성` | 517 | 0 | 1 | B | `COMM_MULTI` |
| `구형` | 43 | 2 | 3 | B | `OLD` lookup |

실제 행 예시는 다음과 같다. 같은 모델 토큰이 서로 다른 가격/catalog 탭의 실제 행에 존재한다.

```text
AM023TNVDBH1  홈멀티#65             HOME_MULTI
AM023TNVDBH1  상업멀티#189/구성#229   COMM_MULTI

AR-KH05       홈멀티#100            HOME_MULTI
AR-KH05       싱글 세트#73/구성품#644 SINGLE
AR-KH05       상업멀티#329/구성#370  COMM_MULTI

AM120MXVRHC1  상업멀티#108/구성#148  COMM_MULTI
AM120MXVRHC1  구형#18              OLD lookup
```

여기서 `홈멀티#65`의 `#65`는 실제 spreadsheet 행 번호다. `_단가인상` 짝 탭은 동일한 의미의 별도 가격 snapshot이므로 아래 distinct-zone 계산에는 base 탭만 사용했다. GAS가 raw 매출 행에 부여하는 `currentZone`을 카탈로그 행에 억지로 실행한 것이 아니라, GAS가 각 탭을 어떤 zone 가격 source로 해석하는지에 따라 중복을 집계했다.

#### 서로 다른 zone에 나타난 동일 토큰

기본 가격/catalog 탭 6개에서 모델명 컬럼의 실제 행을 `extractModelToken_`와 같은 정제 규칙으로 정규화했다. 결과는 **서로 다른 zone에 나타난 distinct token 76개**다. `싱글 구성품` 내부 반복 행은 한 token으로 deduplicate했으며, occurrence가 아니라 token 사례 수다.

| zone 집합 | distinct token 수 |
|---|---:|
| `COMM_MULTI` + `HOME_MULTI` | 42 |
| `COMM_MULTI` + `SINGLE` | 12 |
| `HOME_MULTI` + `SINGLE` | 1 |
| `COMM_MULTI` + `HOME_MULTI` + `SINGLE` | 18 |
| `COMM_MULTI` + `HOME_MULTI` + `OLD` + `SINGLE` | 2 |
| `COMM_MULTI` + `OLD` | 1 |
| **합계** | **76** |

전체 token 목록:

```text
ACR-SKE, ACR-SMA, ADP-F075SP, AIM-A01N, AIM-H04N, AIM-N01,
AM023TNVDBH1, AM032TNVDBH1, AM040TNVDBH1, AM052BN4DBH1,
AM052BN6PBH1, AM052KN4PBH1, AM052NN4DBH1, AM052TNVDBH1,
AM060BN4DBH1, AM060BN6PBH1, AM060KN4PBH1, AM060NN4DBH1,
AM060TNVDBH1, AM072BN4DBH1, AM072BN6PBH1, AM072KN4PBH1,
AM072NN4DBH1, AM083BN4DBH1, AM083BN6PBH1, AM083KN4PBH1,
AM083NN4DBH1, AM083TNVDBH1, AM120MXVRHC1, AR-CH01, AR-EC05,
AR-EH05, AR-KH05, AWR-WE13N, AWR-WG00N, AXJ-YA1509N,
AXJ-YA2512N, FH-LFHIF, FH-LFHLF, FH-LFHLN, PC1BWCK3N,
PC1BWCK3NW, PC1BWSK3N, PC1BWSK3NW, PC1MWCK3N, PC1MWCK3NW,
PC1MWSK3N, PC1MWSK3NW, PC1NWCK3N, PC1NWCK3NW, PC1NWSK3N,
PC1NWSK3NW, PC1YNRK1NW, PC1YNWK1NW, PC1ZNRK1NW, PC1ZNWK1NW,
PC4NBFK1NW, PC4NUCK1N, PC4NUCK4NW, PC4NUFK1N, PC4NUFK1NW,
PC4NUXK1NW, PC6EUCK1NW, PC6EUXK1NW, PC6NBDK1NW, PC6NBNK1NW,
PC6NUCK1N, PC6NUCK1NW, PC6NUDK1NW, PC6NUNK1NW, PC6NUXK1NW,
SI-AL600A, SI-AL700A, 발통세트, 운임, 절삭
```

마지막 세 개(`발통세트`, `운임`, `절삭`)는 모델이라기보다 공통 특수행이지만 GAS의 `extractModelToken_`이 매칭 가능한 문자열을 그대로 token으로 반환하므로 목록에 포함했다. 모델·부속품 계열만 보면 73개다.

이 결과는 앞서 제안한 슬라이스 3에 대한 근거를 강화한다. 상품 master/catalog의 동일 모델이 여러 가격 zone에 실제로 존재하므로 모델 단일 key 집계는 서로 다른 가격 참조를 합칠 수 있다. 따라서 슬라이스 3은 `(모델, 판매 라인에서 확정된 categoryKey)` 축을 보존해야 하며, catalog 중복을 근거로 판매 라인의 zone을 역추정해서는 안 된다. 반대로 슬라이스 4는 raw 입력이 spreadsheet가 아니라 업로드 XLSX라는 실제 경로를 보존하고, 그 입력에 범위 marker가 없을 때만 미상으로 남겨야 한다.

### 6.4 spreadsheet raw와 현대 tax invoice 대조 가능성

요청한 `일자_번호` 대조는 현재 실 시트에서는 수행할 수 없다.

- 실 시트 27개 탭 중 `매출전표X - ` 탭 0개.
- `일자`, `번호`, `품목명`을 모두 가진 탭 0개.
- 따라서 spreadsheet raw에서 현대 `tax_invoice_lines`로 연결할 `일자_번호` 표본이 0개다.
- `tax_invoices`에는 `supply_date`, `tax_invoice_no`가 있고 `tax_invoice_lines`에는 `line_no`, `item_name`, `spec`, quantity, unit price, supply/vat가 있지만 GAS raw의 `번호`와 `tax_invoice_no`가 같은 키라는 근거는 없다.

실 DB의 현재 tax invoice line은 22건, tax invoice header entity는 14건이다. 표시 가능한 `(supply_date, tax_invoice_no)` 조합은 tax number NULL 충돌 때문에 12개뿐이다. 이 경로에서 schema상 확정되는 유실 정보는 `GAS currentZone/categoryKey`, 원본 raw의 `일자_번호` 관계, `창고명`, `거래처코드`, `출고가`, `할인율`, `확인`, 원본 행의 가격 source 구분이다. 다만 raw row 자체가 없으므로 “특정 raw 그룹의 어느 행이 현대 tax line에서 빠졌다”는 행 단위 대조 결과는 **확인하지 못함**이다.

### 6.5 현대 tax invoice 라인에 알고리즘을 적용한 결과

현대 tax 라인에는 `line_no`가 있으므로 각 tax invoice header 내부의 저장 순서는 `line_no` 오름차순으로 읽었다. 이것은 실제 저장된 line order이며, GAS raw의 `일자_번호`와 동일하다고 가정하지 않았다. `tax_invoice_no`가 NULL인 2026-07-20 데이터는 표시 키가 같지만 서로 다른 header entity 3건이고 모두 `line_no=1`이므로, 표시 키만으로는 원본 그룹·순서를 복원할 수 없다.

그 조건에서 `item_name`을 GAS의 raw `품목명`으로 사용해 의사코드를 그대로 적용했다. `spec`을 품목명 대용으로 넣지 않았다. GAS 원본 알고리즘은 `item['품목명']`만 읽기 때문이다.

```text
입력: active tax_invoice_lines 22행
보존된 tax invoice header: 14개
표시 가능한 supply_date_tax_invoice_no 그룹: 12개
sales_accounting_slip_lines: 0행
purchase_accounting_slip_lines: 0행

COMM_MULTI 전환: 0행
HOME_MULTI 전환: 0행
SINGLE 전환: 0행
UNKNOWN: 22행
```

22개 `item_name`에는 `AM...N/X`, `AJ...N/X`, 또는 `AC/AP/AF/AR` target model code와 catalog class가 함께 나타나는 행이 없었다. 그러므로 상태는 모든 그룹에서 최초값 `UNKNOWN`에 머물렀다. 이것은 임의 zone을 넣은 결과가 아니라 실제 현대 라인에 규칙을 적용한 결과다.

현대 tax 라인에서 동일 품목명이 반복된 것은 다음 두 가지였지만, 둘 다 모두 `UNKNOWN`이어서 서로 다른 zone 사례는 **0건**이다.

| 품목명 | 실제 반복 | 계산 zone |
|---|---:|---|
| `B2 QA 검증 품목` | 3행 | 모두 `UNKNOWN` |
| `절연재 T20` | 2행 | 모두 `UNKNOWN` |

따라서 “현대 실 데이터에서 동일 품목이 서로 다른 zone으로 판정된 사례”는 0건이지만, 이것을 “실제로 복수 카테고리 판매가 없다”는 뜻으로 해석할 수 없다. 원본 raw의 marker와 `일자_번호`가 tax line에 없어서 22행 모두 판정 불가인 것이다.

이 결과가 슬라이스에 미치는 영향은 다음과 같다. 슬라이스 3은 catalog에서 이미 76개 distinct token이 다중 zone에 걸쳐 있으므로 그대로 필요하며, 현대 tax 적용 결과 0건은 축을 제거할 근거가 아니다. 슬라이스 4는 현재 tax 원천 22행 전부가 exact GAS 규칙으로 `UNKNOWN`이 되는 규모를 추가로 보여준다. 원본 업로드 XLSX 또는 categoryKey가 전달되지 않는 한 이 22행을 상품 master/exposure로 채우면 레거시 범위 재현이 아니라 추측이다.

## 7. 슬라이스 제안

정확한 GAS 범위 재현과 현대 일마감의 단가 불변식을 한 번에 섞지 않도록 다음 순서를 제안한다.

1. **분류 계약 슬라이스**: GAS의 `currentZone`과 네 schedule 키의 대응을 명시하고, `UNKNOWN`·비정식 키(`AIR_CONDITIONER` 등)를 정상/미상으로 구분하는 테스트 계약을 먼저 고정한다.
2. **라인 원천 보존 슬라이스**: 주문 경로에서 이미 존재하는 `categoryKey`를 전표 라인과 회계 라인 조회 모델까지 전달한다. `sourceOrderLineId` 역조회만으로 모든 직접 입력·기존 라인을 복구할 수 있다고 가정하지 않는다.
3. **집계 축 슬라이스**: `byModel`을 모델명 단일 key로 합치지 않고 최소 `(라인 식별자/원천, 모델, category)` 축으로 보존한다. 같은 모델이 여러 카테고리로 존재하면 별도 상세 라인으로 남긴다.
4. **레거시·미상 입력 슬라이스**: raw Ecount/GAS의 행 순서와 marker가 현대 DB로 들어오지 않는 경로는 별도 원천으로 취급한다. 정확한 GAS 결과가 필요하면 ingest 시점에 범위 판정 결과를 저장해야 하며, 그렇지 않으면 `UNKNOWN`/확인 불가로 표시하고 상품 master나 다중 exposure를 추측값으로 사용하지 않는다.

## 8. 이번 정찰이 보지 않은 것

- Google Spreadsheet는 이번 정찰에서 실제 읽었다. 탭 27개를 전수 열거했고 `매출전표X - ` 탭은 0개, `일자`·`번호`·`품목명`을 함께 가진 매출 raw 탭도 0개였다. 가격표·구성품 탭의 실제 행은 읽었으며 모델 토큰 76개가 여러 가격 zone에 반복되는 것을 확인했다. 다만 GAS가 실제로 순회하는 업로드 Ecount XLSX 원본은 이 PC/워크스페이스에 없으므로, **동일 품목이 한 업로드 전표의 원본 행에서 서로 다른 `currentZone`에 실제 반복됐는지는 확인하지 못함**이다.
- 현대 tax invoice 22행에는 레거시 알고리즘을 실제 적용했다. 저장된 `line_no` 순서는 header 내부에서만 사용했고, `일자_번호`와 동등하다고 가정하지 않았다. 22행 모두 `UNKNOWN`이었고 서로 다른 zone으로 판정된 동일 품목은 0건이지만, 이것은 복수 카테고리 판매가 없다는 증거가 아니다.
- 현대 직접 입력/기존 slip 라인에 대해 원본 Ecount `번호`와 `일자`를 완전하게 역대조하지 않았다. 현대 tax invoice의 invoice 번호가 GAS 원본 `번호`와 동일하다는 근거도 확인하지 못했다.
- `product_estimate_exposure`의 68개 다중 노출 품목을 판매 라인과 연결해 카테고리를 추정하지 않았다. 그것은 이번 정찰의 결론과도 맞지 않는 접근이다.
- 구현, migration, API/화면 변경, fixture 작성, 테스트 실행 및 데이터 backfill은 하지 않았다.
- `categoryKey`를 어느 서비스 경계까지 nullable로 허용할지, 직접 입력·구형 데이터의 최종 사용자 표시 문구는 설계 슬라이스에서 결정할 사항으로 남겼다.

## 10. 2026-07-30 검증 절차·DC액·모델 집계 키 보강

### 10.1 현대 일마감은 DC 입력값 자체가 아니라 유효단가를 검증한다

`DiscountRevalidator`는 read-time 재검증 엔진이다(`DiscountRevalidator.java:9-22`). 입력은 영업자가 입력한 별도 `dcRate`·`dcAmount` 필드가 아니라 `effectiveUnitPrice=(supplyAmount+vatAmount)/quantity`, 적용 출고가, 납품가, Product 기준 `fixedDc`다(`DiscountRevalidator.java:56-74`). 실제 할인율은 유효단가에서 역산한다(`DiscountRevalidator.java:155-165`).

- 운임·절삭은 납품가 일치 또는 legacy 분기로 판정한다(`DiscountRevalidator.java:75-113`).
- 멀티는 `fixedDc` 또는 45% fallback과 역산 할인율을 비교한다(`DiscountRevalidator.java:114-121`).
- 싱글 본체·부속 prefix(`AC|AP|AR|AF|PC|AWR|ARR`)는 `OUT_OF_SCOPE`를 반환한다(`DiscountRevalidator.java:123-126`). 즉 영업자가 입력한 싱글중대형 DC액을 현대 코드가 검증하는 분기는 없다.

결과는 화면에 표시된다. `DailyClosingPage.tsx:676-688`은 `verified=true`를 `확인`, `false`를 `불일치`, `null`을 `판정불가`로 표시하고 `:706-716`은 `revalidationStatus` 사유를 보여준다. 따라서 현대 일마감은 일부 멀티·구형·부속의 단가 정합성은 화면에 보이지만, 싱글중대형 DC액 검증은 `대상외`로 보일 뿐 “DC액이 틀렸다”는 검증으로 보이지 않는다.

### 10.2 GAS의 싱글중대형은 DC율이 아닌 금액을 검증한다

GAS `notion_extract_dc_`는 `360`, `4way`, `1way`, `스탠드`, `디럭스`, `1등급`을 금액 필드로 읽고(`tools/legacy-gas/일마감 프로그램/Code.js:357-399`), `extractDiscountNumbers`도 `dc360`, `dc4way`, `dc1way`, `stand`, `deluxe`, `grade1`을 별도 숫자로 반환한다(`Code.js:403-416`). `processDailyData`의 싱글 zone은 세트 코드별 해당 금액을 선택해 구성품 정가 합계에서 차감한 `finalExpectedPrice`를 만들고, 판매전표의 VAT 포함 단가 합계와 비교한다(`Code.js:568-659`).

현대 `DailyClosingDetailResponse`의 제품 라인에는 `expectedRate`, `actualRate`, `verified`, `revalidationStatus`는 있지만 DC액 필드는 없다(`DailyClosingDetailResponse.java:48-80`). 따라서 “싱글중대형 DC액”은 현대에 **별도 검증·표시되지 않는 결함**이다. 이것은 #991의 단순 price-history variant와 구분되는 범위 확장 후보이며, 이번 라운드에서는 구현하지 않았다.

### 10.3 모델 토큰 추출과 현대 실데이터 적용

GAS의 `extractModelToken_`은 다음 순서다(`Code.js:160-173`).

```javascript
clean = String(name)
  .replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, '')
  .trim();
upper = clean.toUpperCase();
match = /\b(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9\-]{4,}\b/.exec(upper);
token = match ? match[0] : upper;
if (token.startsWith('AR-') || token.startsWith('ARR-')) {
    token = upper.split(/\s+/)[0];
}
```

즉 함수의 반환값만 보면 임의 품목명도 uppercase fallback으로 비어 있지 않을 수 있다. “토큰 반환 성공”과 “GAS 모델 regex에 실제 매칭되어 zone 판정 가능한 모델”을 분리해야 한다.

읽기 전용 SELECT로 얻은 현대 데이터에 위 규칙을 그대로 적용한 결과는 다음과 같다.

| 입력 | 전체 행 | GAS 함수 반환 non-empty | 모델 regex 매칭 | AM/AJ zone marker | 판정 가능한 target code |
|---|---:|---:|---:|---:|---:|
| active `tax_invoice_lines.item_name` | 22 | 22 (100%) | 0 | 0 | 0 |
| active OUTBOUND `slip_lines.product_name` | 2,659 | 2,659 (100%) | 8 | 0 | 8 |

앞서 22개 TAX 라인이 모두 `UNKNOWN`이었던 원인은 **빈 반환값이 아니라, AM/AJ 또는 GAS target model code로 인식되는 토큰이 0개였기 때문**이다. TAX 라인에는 물류·QA·자재 설명형 이름만 있고, `spec`을 품목명 대용으로 쓰지 않았다. GAS도 원본 `품목명`을 기준으로 하기 때문이다.

판매전표에는 별도 `slip_lines.model_name` 컬럼이 있다(`SlipLine.java:62-66`). 활성 OUTBOUND 2,659건 모두 이 컬럼이 채워져 있어(`model_name_present=2,659`, missing=0), 판매전표 경로에서는 품목명에서 다시 토큰을 추출하는 것보다 이 저장값을 모델 key로 사용하는 것이 우선이다. 다만 현재 accounting 일마감 원천 DTO/집계에는 이 필드가 전달되지 않는 것이 별도 유실 지점이다.

### 10.4 품목명 key가 만드는 양방향 실데이터 결함

활성 OUTBOUND 판매전표 2,659건을 `model_name`과 `product_name`으로 각각 묶어 비교했다.

**같은 모델인데 품목명이 여러 개인 경우**: 3개 model group, 289개 line, 10개 model-item pair다. 현재 품목명 key는 같은 모델을 여러 행으로 쪼갠다.

| model_name | 서로 다른 product_name 수 | line 수 | 실제 product_name |
|---|---:|---:|---|
| `AC200CNCDEH-77` | 2 | 57 | `교체된 단품`, `삼성 천장형 4톤` |
| `AR07TXEAAWKNEU-03` | 3 | 117 | `Product A`, `Samsung Product A`, `삼성 윈드프리 7평형` |
| `AR09TXEAAWKNEU-04` | 5 | 115 | `AR09TXEAAWKNEU-04`, `LiveQA product`, `P`, `WindFree-9`, `삼성 윈드프리 9평형` |

**서로 다른 모델인데 품목명이 같은 경우**: 11개 product group, 1,941개 line, 23개 item-model pair다. 현재 품목명 key는 서로 다른 모델을 한 행으로 합친다.

| product_name | model_name 목록 | line 수 |
|---|---|---:|
| `삼성 DVM-S 4HP` | `AM040BNNDEH-52`, `AM040BNNDEH-65` | 2 |
| `삼성 윈드프리 5평형` | `AR05TXEAAWKNEU-01`, `AR05TXEAAWKNEU-11`, `AR05TXEAAWKNEU-21` | 195 |
| `삼성 윈드프리 6평형` | `AR06TXEAAWKNEU-02`, `AR06TXEAAWKNEU-12` | 189 |
| `삼성 윈드프리 7평형` | `AR07TXEAAWKNEU-03`, `AR07TXEAAWKNEU-13` | 217 |
| `삼성 윈드프리 9평형` | `AR09TXEAAWKNEU-04`, `AR09TXEAAWKNEU-14` | 197 |
| `삼성 윈드프리 11평형` | `AR11TXEAAWKNEU-05`, `AR11TXEAAWKNEU-15` | 183 |
| `삼성 윈드프리 13평형` | `AR13TXEAAWKNEU-06`, `AR13TXEAAWKNEU-16` | 185 |
| `삼성 윈드프리 15평형` | `AR15TXEAAWKNEU-07`, `AR15TXEAAWKNEU-17` | 180 |
| `삼성 윈드프리 16평형` | `AR16TXEAAWKNEU-08`, `AR16TXEAAWKNEU-18` | 224 |
| `삼성 윈드프리 18평형` | `AR18TXEAAWKNEU-09`, `AR18TXEAAWKNEU-19` | 181 |
| `삼성 윈드프리 20평형` | `AR20TXEAAWKNEU-10`, `AR20TXEAAWKNEU-20` | 188 |

따라서 #991의 집계 key는 `itemName`/`productName`이 아니라 판매 라인의 `model_name`으로 보존된 모델 key여야 한다. `model_code`는 현재 1,120건에서 같은 값인 alias이므로 사용하더라도 `model_name`과의 identity 검증이 필요하다. 가격 선택까지 포함하면 최소 `(modelKey, 판매 시점에 확정된 categoryKey)`가 필요하다. 제품 master의 `product_code`를 모델 key로 사용하면 숫자형 Ecount 코드와 GAS 모델 토큰을 혼동하게 된다.

## 11. 2026-07-30 컬럼 계약 재판정 — `product_code`와 모델 토큰은 다르다

이번 라운드의 결론은 개발책임자의 구두 표현인 “품목코드 = 모델명”과 **현재 저장소·실 DB의 컬럼 계약은 일치하지 않는다**는 것이다. 현재 코드에서 inventory가 요구하는 `productCode`는 `products.product_code`이고, 이 값은 이카운트 품목코드다. GAS의 `AM`·`AJ` zone 판정에 쓰는 값은 `model_name`/`model_code` 계열이다.

### 11.1 세 컬럼의 정의와 쓰기 경로

| 컬럼 | 현재 코드의 계약 | 실제 쓰기 경로·근거 |
|---|---|---|
| `name` | 설명형 품목명 | `Product.name`; Sheet sync가 시트의 name column을 사용한다(`ProductSheetSyncService.java:1212`). |
| `model_name` | legacy Product의 모델 식별자. V1에서 NOT NULL·활성 unique key | V1은 `model_name VARCHAR(100) NOT NULL` 및 unique index를 만든다(`V1__init_product_service.sql:32-36, 54-56`). Sheet sync의 `modelCode`를 `Product.seedFromSheet`에 넣으면 constructor에서 `modelName`으로 저장된다(`ProductSheetSyncService.java:1212-1213, 1249-1262`, `Product.java:399-407`). |
| `model_code` | V3에서 추가된 시트 B열 모델명 기반의 사용자 노출 식별자 | V3 주석이 “시트 B열 모델명”이라고 명시한다(`V3__migration_extension.sql:18`). Product 도메인도 `modelCode`를 사용자 노출 식별자로 설명한다(`Product.java:42, 63-68`). Sheet sync는 같은 `modelCode`를 조회·키로 사용한다(`ProductSheetSyncService.java:1218-1223, 1246`). |
| `product_code` | 이카운트 품목코드. inventory의 시리얼 인스턴스 그룹 키 | V5 주석이 이카운트 품목코드로 추가한다(`V5__add_ecount_product_fields.sql:10-13`). Ecount importer의 입력 헤더는 `품목코드`이고(`EcountProductImporter.java:35-38`), `UPSERT_PRODUCT_SQL`은 `:code`를 `product_code`에 적재한다(`EcountProductImporter.java:288-302`). |

두 경로가 혼재한다. Ecount importer는 같은 이카운트 `:code`를 `model_name`, `model_code`, `product_code`에 함께 넣도록 작성되어 있다(`EcountProductImporter.java:296-301`). 반면 Sheet sync는 모델명 열을 `model_name`·`model_code`에 쓰는 `seedFromSheet` 경로를 사용하고, `ProductSheetSyncService.java`에는 `product_code`를 적재하는 코드가 없다. 따라서 “PR #984의 UPSERT가 model_name·model_code에 이카운트 품목코드를 넣는다”는 설명은 importer SQL에는 맞지만, 그것이 `product_code`와 같은 의미라는 뜻은 아니다. `product_code`는 별도로 존재하는 이카운트 품목코드 컬럼이다.

### 11.2 실 DB 분포

읽기 전용 SELECT 결과는 다음과 같다.

```text
active_products | model_name_present | model_code_present | product_code_present
1220            | 1220               | 1120               | 100
```

`product_code`가 있는 활성 100건은 `model_code`가 100건 모두 공란이고, `model_name`은 100건 모두 존재한다.

```text
product_code_rows | model_code_blank | model_name_blank | gas_model_prefix
100               | 100              | 0                | 85
```

표본은 `product_code=010001`에 대해 `model_name=AR05TXEAAWKNEU-01`, `name=삼성 윈드프리 5평형`이었다. 즉 실제 row에서도 두 값은 별개다. 활성 전체에서 `product_code`는 모두 숫자형 6자리였고, `AJ`·`AM` 모델 토큰과 같은 형태인 값은 0건이었다.

### 11.3 inventory가 기대하는 값

inventory 스키마와 코드의 계약은 명확하다.

```sql
SELECT product_code, count(*)
FROM stock_instances
WHERE is_deleted = false
GROUP BY product_code;
```

실 DB 원문 결과:

```text
active_stock | blank_product_code | aj_am_prefix | numeric_prefix | distinct_product_codes
3            | 0                  | 0            | 3              | 1

product_code | n
010001       | 3
```

`stock_instances.product_code`는 migration에서 NOT NULL이고 inventory FIFO index의 키다(`inventory-service/.../V15__create_stock_instances.sql:3-7, 24-28`). reserve 요청 DTO도 `productCode`에 `@NotBlank`를 둔다(`ReserveBatchInstanceRequest.java:14-18`). inventory는 이 값을 product-service의 `lookup-by-code`로 다시 확인한다(`ProductService.java:209-225`, `ProductClient.java:136-162`). 따라서 inventory가 기대하는 값은 모델명 `AJ...`·`AM...`이 아니라 이카운트 품목코드다.

또한 `stock_instances`의 세 row가 가리키는 실제 제품은 별도 product DB 조회에서 `product_code=010001`, `model_name=AR05TXEAAWKNEU-01`로 확인됐다. 이 한 사례도 “재고의 product_code = 모델명” 가설과 반대다.

### 11.4 전표 수락 400의 판정

현재 코드의 수락 경로는 다음과 같다.

```java
// SlipService.java:874-881
ProductSummary product = productsById.get(line.getProductId());
if (product.serialManaged()) {
    String productCode = product.productCode();
    inventoryClient.reserveInstances(productCode, ...);
}
```

`ProductSummary.productCode`는 `ProductSummaryResponse.from(Product)`에서 `p.getProductCode()`를 그대로 받는다(`ProductSummaryResponse.java:106-124`). `InventoryClient`는 그 값을 그대로 `productCode`로 전송한다(`InventoryClient.java:181-186`). 따라서 `product_code`가 NULL인 제품은 `model_name`으로 fallback하지 않는다.

실 DB에서 serial-managed category에 속한 활성 제품은 1,214건이며, 그중 `product_code` 보유는 95건, 미보유는 **1,119건(92.18%)**이다. 활성 제품 전체 기준으로는 1,220건 중 1,120건이 미보유다.

| 상황 | 코드상 결과 |
|---|---|
| serial 제품의 `ProductSummary.productCode`가 NULL/blank | reserve 요청의 `@NotBlank productCode` 검증에서 400 가능. product-service code lookup까지 도달하면 blank 입력도 INVALID_INPUT이다. |
| product code는 있으나 해당 창고에 가용 인스턴스 부족 | `StockInstanceService.reserveBatch`가 409 `재고 부족`을 반환한다(`:173-178`). |
| product code가 모델명이라고 가정해 `AJ...`·`AM...`을 보냄 | 현재 inventory의 `product_code`/product-service exact lookup 계약과 어긋나므로 해결책이 아니다. |

따라서 보고된 전표 수락 400이 **이 1,119개 serial 제품 중 product_code가 없는 제품에서 발생한 것이라면 결론은 데이터 미적재**다. `SlipService:879`가 잘못된 컬럼을 선택한 증거는 없다. 반대로 실제 400 HTTP 요청의 원문·대상 제품은 이번 정찰에서 확보하지 못했으므로, 특정 라이브 QA 행의 400을 독립 재현했다고 주장하지 않는다. 활성 `products`에서 이름·모델에 `QA`가 포함된 제품도 0건이었다. 현재 데이터로 가능한 serial inventory 실 QA도 `010001` 한 품목의 인스턴스 3개 범위에 한정된다. 범용 모델 테스트는 `product_code` 적재 및 재고 인스턴스 준비가 선행돼야 한다.

### 11.5 #991 집계·분류 키의 확정

`product_code`는 숫자형 이카운트 코드이므로 GAS의 `AM`·`AJ` 모델 zone을 가르는 집계 키가 될 수 없다. 현재 실 DB와 GAS 의미를 함께 보존하는 안전한 정규화 규칙은 다음이다.

```text
modelKey = model_name
if (model_code is nonBlank and model_code == model_name) {
    // 동일 identity alias로 검증 가능
}
```

`ProductRepository`가 `model_code` exact 조회 실패 시 `model_name` exact fallback을 사용한다는 점은 API 식별자 호환 근거다(`ProductRepository.java:43-56`). 그러나 Ecount importer SQL은 importer 경로에서 `model_code`에도 이카운트 `:code`를 쓸 수 있으므로, `model_code`가 비어 있지 않다는 이유만으로 GAS 모델 키로 채택하면 안 된다. 실 DB에서 `model_name`은 활성 1,220건 전부 있고 `model_code`는 100건이 없으며, 존재하는 1,120건은 `model_name`과 동일하다. 따라서 현재 데이터의 보존축은 `model_name`이고, `model_code`는 동일성 확인된 alias로만 취급한다. 의미상 집계 키는 **정규화된 GAS 모델 토큰**이어야 하며, `product_code`로 대체하면 안 된다.

따라서 `MonthEndCloseService`의 `getItemName()`·`getProductName()` 기반 key는 여전히 잘못된 축이다. #991에서 사용할 집계 key는 `product_code`가 아니라 판매 라인에서 해소한 `modelKey`이고, 카테고리까지 포함해야 가격 schedule 선택이 결정된다. 회계 라인에 이 값이 없다면 제품명으로 임의 추정하지 말고, 판매전표/주문 원천에서 `modelKey`를 보존하는 별도 경로가 필요하다.

### 11.6 이번 판정의 범위

- 코드 수정·migration·데이터 backfill은 하지 않았다.
- Docker compose, 서비스 재기동, 이미지 빌드, Gradle 실행은 하지 않았다.
- DB는 위 SELECT를 포함한 읽기 전용 조회만 수행했다.
- #991 라이브 QA의 특정 400 로그/HTTP 원문은 확인하지 못했다. 이번 결과는 컬럼 계약·실 DB 분포·정적 호출 사슬에 근거한 원인 판정이다.

## 9. 2026-07-30 원천 재판정 — GAS 판매전표와 현대 일마감

### 9.1 현재 `TAX_INVOICE` 기본 원천을 채택한 이유

코드가 기록한 이유는 “현재 일마감이 레거시 GAS의 세금계산서 집계를 호환한다”는 제품/구현 전제다.

```java
// MonthEndCloseService.java:178-185
public DailyClosingDetailResponse getDailyDetail(LocalDate date) {
    return getDailyDetail(date, DailyClosingKind.SALES,
            DailyClosingSourceKind.TAX_INVOICE);
}

// DailyClosingService.java:42-52
 * legacy GAS 12번 "일마감 프로그램" — 특정 날짜의 세금계산서(ISSUED) 집계 snapshot 생성.
 * ...
 * <li>TaxInvoiceRepository 에서 해당 날짜 ISSUED 세금계산서 집계</li>
```

`DailyClosingService.resolveSourceKind(null)`도 `TAX_INVOICE`로 귀결된다(`DailyClosingService.java:367-373`). `DailyClosingSourceKind`의 주석은 `TAX_INVOICE`를 “기존 세금계산서”, `SALES_SLIP`·`PURCHASE_SLIP`을 “신규 매출/매입전표”로 구분한다(`DailyClosingSourceKind.java:3-7`). 따라서 기본값은 기술적으로 판매전표를 읽을 수 없어서가 아니라, **기존 기본 경로를 보존한 선택**이다.

판매전표를 쓰지 않는 별도 불가 사유는 코드 주석이나 기존 dev-report에서 확인하지 못했다. 오히려 `sourceKind=SALES_SLIP` 분기는 이미 있으며, `SalesAccountingSlipRepository.findBySlipDateAndStatusWithLines(date, POSTED)`를 사용한다(`MonthEndCloseService.java:258-289`). 다만 이 분기의 “판매전표”는 `slip_db.slip_lines`가 아니라 `accounting_db.sales_accounting_slips`다.

두 원천은 같은 문서의 중복이 아니다. SAS 설계 문서는 `SalesAccountingSlip POSTED → 일마감 → TaxInvoice 발행` 순서를 적고 있다(`docs/superpowers/specs/2026-05-19-sales-purchase-accounting-slip-design.md:170-198`). 즉 매출전표는 내부 회계 확정 시점의 upstream 원천이고, 세금계산서는 그 뒤 거래처·월 단위로 묶일 수 있는 법정 downstream 문서다. 현재 DB에서도 `daily_closings`는 `TAX_INVOICE/SALES` 2건만 있고, `sales_accounting_slip_lines` 활성 행은 0건이다. 이것은 기본값의 역사적 배경은 뒷받침하지만, 판매전표 원천이 부적합하다는 증거는 아니다.

### 9.2 `slip_db.slip_lines`를 일마감 원천으로 쓸 수 있는지

개발책임자가 말한 “판매전표”를 GAS 입력과 같은 출고 판매전표로 해석해 `slip_db.slips` + `slip_lines`를 대조했다. 필드는 다음처럼 **금액·품목·일자 일부는 갖지만, 현재 `SALES_SLIP` 코드 경로와 동일하지 않으며 거래처·순서·카테고리에는 결손이 있다.**

| 일마감 필요 정보 | 실제 테이블/컬럼 | 스키마·실 데이터 확인 |
|---|---|---|
| 품목명 | `slip_lines.product_name` | `NOT NULL`; 활성 OUTBOUND 2,659행 중 공란 0행 |
| 수량 | `slip_lines.quantity` | `NOT NULL`; 공란 0행 |
| 공급가액 | `slip_lines.supply_amount` | 스키마 nullable이나 활성 OUTBOUND 2,659행 중 공란 0행 |
| 세액 | `slip_lines.vat_amount` | 스키마 nullable이나 활성 OUTBOUND 2,659행 중 공란 0행 |
| 일자 | `slips.slip_date` | `NOT NULL`; 라인 header에서 가져와야 함 |
| 거래처명 | `slips.partner_name` | nullable; 활성 OUTBOUND 중 40행이 공란 |
| 거래처 ID/코드 | `slips.partner_id`, `slips.partner_code` | nullable; 각각 1,934행·2,143행이 공란 |
| 전표 묶음 | `slips.slip_no` | header에 존재; `slip_date + slip_no`로 문서 묶음 가능 |
| 원본 행 순서 | `slip_lines.line_no` | **컬럼 없음**. `created_at`과 UUID만 있어 Ecount 원본 행 순서의 정본으로 볼 근거 없음 |
| 카테고리/범위 | `category_key` 또는 `currentZone` | `slip_lines`와 `slips` 모두 **없음** |

따라서 `slip_lines`는 품목·수량·공급가액·세액·일자·전표명에 필요한 물리 필드는 대부분 갖지만, 현재 일마감에 바로 대체할 수 있는 완전한 원천은 아니다. 특히 `partner_id`와 원본 행 순서가 빠져 있고, GAS가 요구하는 카테고리도 없다.

참고로 현재 코드의 `SALES_SLIP` 원천인 `accounting_db.sales_accounting_slips`는 header에 `slip_date`, `partner_id`, `partner_code`, `partner_name`, `status`가 모두 `NOT NULL`이고, line에 `product_name`, `qty`, `supply_amount`, `vat_amount`, `line_no`가 있다(`information_schema.columns` 실측). 그러나 현재 활성 line은 0건이며, 이 경로도 `category_key`는 없다. 그러므로 “판매전표 원천”을 바꾸는 것은 `sourceKind=SALES_SLIP` 한 줄을 선택하는 문제가 아니다. `slip_db` 출고전표와 `accounting_db` 매출전표 중 어느 단계가 일마감의 정본인지 먼저 계약해야 한다.

### 9.3 `source_order_line_id` 보유율

읽기 전용 SELECT 기준은 `is_deleted=false`인 라인과 header를 대상으로 했다. 주 분모는 판매전표 의미가 명확한 활성 `OUTBOUND` + 활성 `slips` parent다.

| 범위 | 전체 라인 | `source_order_line_id` 있음 | 비율 |
|---|---:|---:|---:|
| 활성 OUTBOUND, 활성 parent | 2,659 | 22 | **0.83%** |
| 그중 `source_type=PARTNER_ORDER` | 23 | 22 | **95.65%** |
| 그중 `source_type=MANUAL` | 2,636 | 0 | **0.00%** |
| `slip_lines` 전체 활성 행(고아 parent 포함) | 2,791 | 22 | **0.79%** |

연결된 22행은 `source_order_line_id` 기준 17개 주문 라인에 해당한다. 현재 활성 데이터의 `source_type`은 `MANUAL`과 `PARTNER_ORDER`뿐이며, migration 주석에 정의된 `MIGRATED_ECOUNT` 행은 실 DB에서 확인되지 않았다. 따라서 22행/17개 주문 라인은 카테고리 복원의 **후보 범위**이지, 전체 판매전표의 대표 비율이 아니다.

### 9.4 `source_order_line_id`가 없는 라인과 GAS zone 재현 가능성

활성 OUTBOUND 2,659행 중 없는 라인은 2,637행이다. 이는 `MANUAL` 2,636행과 `PARTNER_ORDER`인데 link가 없는 1행으로 나뉜다. 별도로 active parent와 조인되지 않는 고아 `slip_lines` 22행이 있어, 전체 활성 라인 기준으로는 2,769행이 link 없이 남는다.

이 2,637행에는 GAS의 `일자_번호`와 동등하다고 확인된 키가 없다. `slips.slip_date`와 `slip_no`로 현대 전표 문서는 묶을 수 있지만, 그것이 업로드된 Ecount raw의 `일자`·`번호`와 같은 값이라는 근거는 확인하지 못했다. 더 결정적으로 `slip_lines`에는 `line_no`가 없고, `created_at`은 DB 저장 시각일 뿐 원본 XLSX 행 위치라는 보장이 없다. `slips.seq_no`도 header의 전표 순번이지 line 순서가 아니다.

그러므로 없는 라인에 GAS 알고리즘을 적용해 zone을 정하는 것은 정확한 재현이 아니다. 모델명 token만으로 추정할 수는 있어도, 앞 행에서 열린 `currentZone`을 재현할 원본 순서가 없으므로 제품 가격 선택의 근거로 사용해서는 안 된다. 이 라인은 `UNKNOWN`/확인 불가로 남기는 것이 정직한 결론이다. link가 있는 22행은 주문 라인을 역조회해 `PartnerOrderLine.categoryKey`를 얻을 가능성이 있지만, 이것도 GAS 원본 행 순서를 복구하는 것과는 별개의 복원 경로다.

### 9.5 슬라이스 2·3·4 재절단

이번 정찰 결과 판매전표 원천 전환은 슬라이스 2에 **포함해야 하지만, 단순 원천 교체로 끝나지 않는다.**

2. **원천 계약 슬라이스 — 판매전표 단계 확정**: `slip_db.slips/slip_lines`(GAS와 가까운 출고 원천)와 `accounting_db.sales_accounting_slips`(현재 `SALES_SLIP` 코드가 읽는 POSTED 회계 원천)를 분리해 계약한다. 일자·거래처·금액 필드, 문서 묶음, line 순서, `source_order_line_id` 역조회 가능 범위를 정하고, 기존 `TAX_INVOICE` 경로는 downstream 법정 문서 조회로 보존한다. 이 슬라이스에서 `slip_lines`를 직접 읽을지, 매출전표 확정 시점의 snapshot을 사용할지 결정해야 한다.
3. **라인·카테고리 축 슬라이스 — `byModel` 제거/세분화**: 모델명 하나로 합치지 않고 최소한 전표·라인 식별자와 확정된 `categoryKey`를 보존한다. 주문 link 22행은 주문 카테고리를 후보로 쓸 수 있지만, 2,637행은 카테고리 없이 별도 `UNKNOWN` 축으로 남겨야 한다. `product_estimate_exposure`나 상품 master로 빈 카테고리를 채우지 않는다.
4. **레거시 미상 입력 슬라이스 — 행 순서 결손 처리**: `slip_lines`에는 GAS raw 행 순서가 없으므로 2,637행에 `currentZone`을 소급 계산하지 않는다. 원본 순서/범위 marker가 보존되지 않은 입력은 `UNKNOWN`/확인 불가를 상세에 표시하고, 정확한 레거시 재현이 필요하면 source ingest 또는 전표 확정 시점에 이미 확정된 category/zone을 보존하는 계약을 별도로 정한다. 이 결정 전에는 `slip_lines`를 tax invoice 대신 바로 연결하는 구현을 시작하지 않는다.
