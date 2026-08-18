# 웹 → 전표 생성 경로 정찰 보고서

- 정찰일: 2026-08-17
- 범위: 웹 견적·거래처 주문에서 출고전표가 생성되는 세 발행 경로
- 원칙: 코드 수정, 공유 DB 쓰기, 전표 생성, 컨테이너 조작, 이슈·PR 게시 없이 정적 추적과 읽기 전용 SQL만 수행
- 출발 자료: `docs/dev-reports/2026-08-17-web-to-slip-fidelity/report.md`

## 요약

세 API는 같은 `PublishLineRequest`와 같은 `resolveLines()`를 사용한다. 현재 공통 계약에는 품목명과 카테고리는 있지만 옵션은 없고, 요청 금액 중 `supplyAmount`와 `vatAmount`는 전표 라인 저장값으로 사용되지 않는다. 서버는 품목 조회, 규격 정규화, 수량 정수화, 단가 선택, 공급가·부가세·합계 재계산을 수행한다. 따라서 “웹이 전개·계산한 행을 그대로 저장”하는 계약과 현재 구현 사이에는 구조적 차이가 있다.

0.81원 차이 행은 `부가세 포함 단가 3,000,000 ÷ 1.1 → 공급가 단가 2,727,272.73 → 수량 3 → 공급가 8,181,818.19 → 부가세 818,181` 순서에서 생겼다. 저장 합계는 8,999,999.19원으로 9,000,000원보다 0.81원 작다. 이 행은 `unit_price_domain=SUPPLY`인 과거 주문 전표 행이다. 현재 VAT 포함 분기는 수량을 먼저 곱해 정수 분할하므로 이 과거 행과 동일한 산식은 아니지만, 현 API도 `unitPriceVat`이 없고 `unitPriceExVat`만 있으면 공급가 분기로 들어갈 수 있다.

실제 웹 네트워크 요청 캡처는 수행하지 못했다. 지정된 인앱 브라우저 런타임을 초기화한 뒤 브라우저 목록을 확인했으나 사용 가능한 브라우저가 0개였고, 별도 브라우저나 앱·인증 서비스를 기동하지 않았다. 그러므로 아래에서 “웹이 보낸다”는 표현은 전송 직전 빌더의 정적 코드 근거이며, 실제 wire payload로 확인된 사실과 구분한다.

## ① 경로별 계약

### 1. 공통 진입점

API Gateway는 세 경로를 하나의 slip-service 라우트로 보낸다.

- 근거: `services/api-gateway/src/main/resources/application.yml:443-450`
- 공개 컨트롤러: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipPublishController.java:89-98,124-133,165-175`
- estimate-app의 직원용 내부 진입점은 같은 견적 DTO와 같은 서비스 메서드를 사용한다: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/InternalSlipPublishController.java:53-74`

### 2. 공통 라인 계약

요청 DTO 근거: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishLineRequest.java:30-42`. 세 경로 모두 `SlipPublishService.resolveLines()`를 공유한다: `SlipPublishService.java:774-810`.

| 요청 필드 | 전표 라인 저장 여부 | 실제 처리 |
|---|---:|---|
| `lineNo` | 아니요 | `slip_lines`에 대응 컬럼이 없고 resolver에서도 읽지 않는다. 라인 순서는 `created_at, id` 정렬이다(`Slip.java:654-657`). |
| `productCode` | 원문 아니요 | 서버가 product-service를 모델 코드로 조회하고, 조회된 `productId`와 카탈로그 `modelName`을 저장한다(`SlipPublishService.java:780,792-795`). |
| `productName` | 예 | `null`이면 카탈로그 이름으로 대체한다. 빈 문자열은 `null`이 아니므로 빈 문자열 그대로 저장된다(`SlipPublishService.java:794`). |
| `spec` | 변형 후 예 | zero-width 문자를 제거하고 trim한 뒤 저장한다(`SlipPublishService.java:766-772,796`). |
| `qty` | 변형 후 예 | 문자열을 양의 정수로 파싱해 저장한다(`SlipPublishService.java:788,813-820`). 소수 수량은 계약상 수용하지 않는다. |
| `unitPriceExVat` | 조건부 | `unitPriceVat`이 없을 때만 절댓값을 공급가 단가로 사용한다. 원문 scale은 엔티티에서 scale 2로 정규화된다. |
| `unitPriceVat` | 조건부 우선 | 값이 있으면 `unitPriceExVat`보다 우선하며 절댓값을 VAT 포함 단가로 사용한다(`SlipPublishService.java:789-800`). |
| `supplyAmount` | 라인에는 아니요 | 요청 합계를 publish audit에 누적할 뿐, `slip_lines.supply_amount`에는 쓰지 않는다(`SlipPublishService.java:803-807,191-196`). |
| `vatAmount` | 라인에는 아니요 | 요청 합계를 publish audit에 누적할 뿐, `slip_lines.vat_amount`에는 쓰지 않는다. |
| `remarks` | 예 | `slip_lines.note`로 저장한다(`SlipPublishService.java:800`). |
| `sourceOrderLineId` | 예 | `slip_lines.source_order_line_id`로 저장한다. 주문 부분 전환 추적용으로 추가된 필드다(`services/slip-service/src/main/resources/db/migration/V29__add_slip_line_source_order_line.sql:3-4`). |
| `categoryKey` | 예 | `slip_lines.category_key`로 저장한다(`SlipPublishService.java:802,1103-1108`). |

공통 DTO에 없는 값은 다음과 같다.

- 라인 총액의 요청 필드가 없다.
- `bundleSetOptions`, `panelOption`, `remoteOption`, `panelShape360`, `remoteExcluded`, `materialIncluded`가 없다.
- 원천 견적 라인 ID가 없다. `sourceOrderLineId`라는 이름과 migration 목적은 주문 라인용이다.

서버가 공통으로 만들어 넣는 값은 다음과 같다.

- product-service 조회 결과인 `product_id`, `model_name`; 세트 부모이면 저장 전에 거부한다(`SlipPublishService.java:780-786`).
- `unitPriceVat` 존재 여부에 따른 금액 도메인 선택과 공급가·부가세·라인 합계 재계산(`SlipPublishService.java:789-800,1091-1115`, `SlipLine.java:284-303,586-603`).
- `unitPriceVat` 분기는 VAT 포함 단가×수량을 먼저 계산한 뒤 정수 원 단위로 공급가/부가세를 분할한다. 공급가 분기는 공급가 단가×수량을 scale 2로 계산하고 VAT를 별도 계산한다.
- 전표번호와 순번, 감사 필드, 생성시각, 삭제 상태, 발행 fingerprint 및 audit 행.

### 3. `/api/v1/slips/from-estimate`

요청 DTO 전체 필드: `estimateNumber`, `ioDate`, `timeDate`, `partnerCode`, `partnerName`, `employeeCode`, `warehouseCode`, `ioType`, `shippingAddress`, `inspectionAddress`, `receiverPhone`, `memo`, `paymentDueLabel`, `discountInfo`, `customerTel`, `customerAddr`, `customerRep`, `lines` (`PublishFromEstimateRequest.java:35-53`).

| 요청 필드군 | 저장/처리 |
|---|---|
| `estimateNumber` | `slips.source_id`와 publish audit의 `source_id`; `source_type=ESTIMATE` (`SlipPublishService.java:162,193-195`) |
| `ioDate` | `slip_date`; 비어 있으면 파서의 서버 날짜 기본값 |
| `timeDate` | e-Count `time_date`; 비어 있으면 발행 시 서버 시각(`SlipPublishService.java:759-764`) |
| `partnerCode` | 거래처 검증 및 사업자번호 조회 후 `partner_code` snapshot. `partner_id`에는 넣지 않고 `null`로 생성한다(`SlipPublishService.java:134-153,171-177`). |
| `partnerName` | 전표 거래처명 snapshot |
| `employeeCode` | requester 선택에 사용. 없으면 인증 requester를 사용(`SlipPublishService.java:142`). |
| `warehouseCode` | 서버 매핑으로 창고 내부 ID를 만든 뒤 저장하고, 원 코드도 snapshot으로 저장(`SlipPublishService.java:138,150-154`). |
| `ioType` | trim 후 최대 2자; 없으면 서버가 출고 코드 `10` 생성(`SlipPublishService.java:740-750`). |
| 주소·연락처·결제·할인·customer 필드 | 각 e-Count/header snapshot 필드에 저장(`SlipPublishService.java:164-170`). |
| `memo` | 자유입력만 보존하도록 정규화 후 전표 memo에 저장(`SlipPublishService.java:137-153`). |
| `lines` | 위 공통 라인 resolver로 처리 |

요청에 있으나 그대로 저장되지 않는 필드는 `timeDate`·`ioType`(빈 값이면 서버 생성, trim/절단), `partnerCode`(검증·trim), `employeeCode`(requester 선택), `warehouseCode`(내부 ID 매핑), 그리고 공통 라인의 `lineNo`, `productCode`, `spec`, `qty`, 두 단가, `supplyAmount`, `vatAmount`다. 특히 요청 `supplyAmount`와 `vatAmount`는 라인 값으로 저장되지 않는다.

서버가 요청 없이 만드는 값은 전표번호·순번, `source_type=ESTIMATE`, 창고/상품 내부 ID, 카탈로그 모델명, 기본 `ioType/timeDate`, 금액 3종, idempotency fingerprint/audit, 생성·감사 필드다.

estimate-app 전송 직전 빌더는 추가로 `manager`를 보내지만 DTO에는 이 필드가 없어 저장되지 않는다. 빌더는 실제 견적번호가 없으면 `WEB-{날짜}-{Date.now()}` 형태의 합성 번호를 만든다(`clients/web/estimate-app/lib/slip-bridge.js:93-140`).

### 4. `/api/v1/slips/from-partner-order`

요청 DTO 전체 필드: `partnerOrderId`, `ioDate`, `partnerCode`, `bizCode`, `partnerName`, `employeeCode`, `warehouseCode`, `warehouseId`, `shippingAddress`, `deliveryAddress`, `receiverPhone`, `memo`, `paymentDueLabel`, `discountInfo`, `orderApprovedAt`, `lines` (`PublishFromPartnerOrderRequest.java:27-43`).

| 요청 필드군 | 저장/처리 |
|---|---|
| `partnerOrderId` | `slips.source_id`와 audit source ID; 별도 `slip_source_orders` 행은 단건 경로에서 만들지 않는다(`SlipPublishService.java:248,287-289`). |
| `partnerCode` | 서버가 committed partner ID를 해석하고 code snapshot도 저장(`SlipPublishService.java:222-260`). |
| `bizCode` | `withProjectInfo()`의 사업자번호 위치에 저장(`SlipPublishService.java:258`). |
| `warehouseId/warehouseCode` | ID가 있으면 우선, 없으면 code mapping; 원 code snapshot 저장(`SlipPublishService.java:225,240`). |
| `orderApprovedAt` | 전용 컬럼이 없고 `memo`와 합쳐 저장한다(`SlipPublishService.java:228-230`). |
| `shippingAddress`, `deliveryAddress`, 연락처·결제·할인 | 각 header/e-Count snapshot으로 저장(`SlipPublishService.java:250-258`). |
| `ioDate`, `partnerName`, `employeeCode`, `memo`, `lines` | 각각 날짜, 거래처명, requester, memo, 공통 라인으로 처리 |

DTO에 `ioType`, `timeDate`, customer 3필드, inspection 주소가 없으므로 서버가 `ioType=10`, 발행 시각을 만들고 나머지는 `null`로 저장한다(`SlipPublishService.java:250-257`). 저장 직후 상태를 `DRAFT → SAVED → SENT`로 바꾸어 수정 불변 상태로 만든다(`SlipPublishService.java:275-284`).

현재 partner-order 변환 빌더는 DTO에 없는 `orderNo`도 보내므로 단건 전표에는 주문번호 snapshot으로 저장되지 않는다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:198-207`). 라인 빌더는 `productCode`, `productName`, `qty`, `unitPriceVat`, `remarks`, `sourceOrderLineId`, `categoryKey`를 보내고 `spec`, 요청 공급가·부가세, 옵션은 보내지 않는다(`PartnerOrderConvertService.java:154-162`).

### 5. `/api/v1/slips/from-orders-merge`

요청 DTO 전체 필드: `sourceOrders`, `ioDate`, `partnerId`, `partnerCode`, `bizCode`, `partnerName`, `employeeCode`, `warehouseCode`, `warehouseId`, `shippingAddress`, `deliveryAddress`, `receiverPhone`, `memo`, `paymentDueLabel`, `discountInfo`, `lines` (`PublishFromOrdersMergeRequest.java:41-57`). `sourceOrders` 각 원소는 `partnerOrderId`, `orderNo`다(`SourceOrderRef.java:15-17`).

단건 경로와 다른 저장은 다음과 같다.

- 첫 주문 ID를 `slips.source_id`와 audit source ID로 저장한다(`SlipPublishService.java:349-351,390-393`).
- 모든 `sourceOrders`를 `slip_source_orders`에 주문 ID와 표시용 주문번호로 저장한다(`SlipPublishService.java:376-380`).
- 요청 `partnerId`를 전표 거래처 ID로 직접 사용한다(`SlipPublishService.java:327,339-340`).
- 단건과 마찬가지로 `ioType=10`, 서버 발행 시각, customer/inspection `null`을 서버가 만들고, 저장 직후 `SENT`로 전이한다(`SlipPublishService.java:353-359,382-387`).

병합 라인 빌더도 단건과 같은 7개 필드만 보내며 `spec`, 공급가·부가세, 옵션은 보내지 않는다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertService.java:170-178`).

### 6. 웹 → 주문 → 전표 사이의 실제 계약 단절

주문서 웹은 세트와 단품 세트를 구성품 행으로 전개하고, 전송 직전 `items`에 표시 품목명·모델·수량·가격과 옵션 선택 flag를 보유한다(`clients/web/order-app/index.html:6639-6719,6818-6863`). 그러나 주문 확정 요청을 만들 때 각 행을 `modelCode`, `categoryKey`, `quantity`, `remark`만으로 축소한다(`clients/web/order-app/src/samhanApi.ts:212-239`). `ConfirmLineRequest`도 `productId/modelCode/categoryKey/quantity/remark`만 받는다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/ConfirmLineRequest.java:16-21`).

확정 서비스는 웹 표시 가격을 사용하지 않고 서버 가격 계산 서비스를 다시 호출하여 주문 라인의 가격·품목명을 만든다(`PartnerOrderConfirmService.java:150-194`). 초안에는 전체 `{items, order}`가 JSON으로 들어가지만, 확정 처리에서 그 품목 payload는 가격·옵션 원천으로 읽지 않고 draft sequence 확인에만 사용한다(`samhanApi.ts:380-406`, `PartnerOrderConfirmService.java:132-136,292-301`). 그 뒤 주문→전표 변환이 주문 라인 값을 받아 위 공통 resolver로 보내므로, 웹의 전개 결과 중 행 구성과 수량은 이어지지만 웹 표시 가격·옵션은 같은 값의 전달 사슬로 이어지지 않는다.

## ② 0.81원의 정체와 실 건수

### 1. 해당 행

읽기 전용 SQL로 확인한 과거 주문 전표 행의 금액은 다음과 같다. 사용자 비공개 식별자는 보고서에 기록하지 않았다.

| 항목 | 값 |
|---|---:|
| 수량 | 3 |
| 저장 공급가 단가 `unit_price` | 2,727,272.73 |
| 저장 VAT 포함 단가 `unit_price_with_vat` | 3,000,000.00 |
| 저장 공급가/라인 합계 | 8,181,818.19 |
| 저장 VAT | 818,181.00 |
| 공급가+VAT | 8,999,999.19 |
| 기대 VAT 포함 합계 | 9,000,000.00 |
| 차이 | -0.81 |

산식은 다음과 정확히 일치한다.

```text
3,000,000 ÷ 1.1 = 2,727,272.7272...
공급가 단가를 scale 2, HALF_UP → 2,727,272.73
2,727,272.73 × 3 → 8,181,818.19
8,181,818.19 × 0.1, 원 단위 DOWN → 818,181
8,181,818.19 + 818,181 = 8,999,999.19
```

즉 소수의 직접 원인은 **VAT 포함 총액을 수량 전체로 먼저 분할하지 않고, 1개당 공급가를 2자리 소수로 만든 뒤 수량을 곱한 순서**다. 해당 행의 `unit_price_domain`은 `SUPPLY`다. 과거 분석 문서도 이 행을 legacy supply-unit-price 사례로 분류한다(`docs/qa/1017-vat-correction-live/README.md:199-218`, `docs/dev-reports/2026-08-01-1017-sol-review-r2.md:325-374`).

현재 `createFromVatInclusive()`는 VAT 포함 단가×수량을 먼저 계산해 정수 원으로 만든 뒤 공급가·VAT를 `HALF_UP` 분할한다(`SlipLine.java:284-303`). 반면 공급가 분기는 `unitPrice×quantity`를 scale 2로 만들고 VAT를 공급가에서 계산한다(`SlipLine.java:586-603`, `shared/common/src/main/java/com/samhanair/logis/common/financial/VatAmountCalculator.java:26-48`). 현재 publish resolver는 `unitPriceVat`이 없고 `unitPriceExVat`만 있으면 이 공급가 분기를 선택한다(`SlipPublishService.java:789-800,1100-1108`). 따라서 과거 행의 발생 경로와 현재 VAT 포함 분기를 혼동하면 안 되며, 공급가 fallback 계약은 현재도 열려 있다.

### 2. 실 DB 건수

조사는 트랜잭션을 `READ ONLY`로 시작하고 마지막에 `ROLLBACK`했다.

| 범위 | 전체 행 | 금액 5열 중 하나라도 소수인 고유 행 |
|---|---:|---:|
| soft-delete 포함 | 4,044 | 118 |
| 활성 행만 | 343 | 20 |

금액 열별 소수 행 수(soft-delete 포함)는 `unit_price` 31, `line_total` 1, `unit_price_with_vat` 89, `supply_amount` 1, `vat_amount` 16이다. 한 행이 여러 열에 중복될 수 있다. source type별 고유 소수 행은 `ESTIMATE` 5, `MANUAL` 107, `PARTNER_ORDER` 6이다. `line_total`과 `supply_amount`가 소수인 행은 위 0.81원 사례 1건뿐이며 현재 soft-delete 상태다.

## ③ 품목명·카테고리 미전달 원인

### 1. 저장 컬럼과 채움률

현재 실 DB의 `slip_lines`는 28개 컬럼이다. 기존 26개에 일마감용 `daily_closing_release_price`, `daily_closing_discount_rate` 2개가 뒤에 추가된 상태다. 관련 컬럼은 이미 `product_name`, `model_name`, `category_key`, `bundle_set_options`로 존재하므로 컬럼 부재가 원인은 아니다.

| source type | 행 수 | `product_name` 비공백 | `model_name` 비공백 | `category_key` 비공백 | `bundle_set_options` non-null |
|---|---:|---:|---:|---:|---:|
| 전체 | 4,044 | 4,043 | 4,044 | 0 | 364 |
| ESTIMATE | 7 | 6 | 7 | 0 | 0 |
| PARTNER_ORDER | 30 | 30 | 30 | 0 | 0 |
| MANUAL | 4,005 | 4,005 | 4,005 | 0 | 364 |
| INBOUND_XLSX | 2 | 2 | 2 | 0 | 0 |

### 2. 견적 웹

estimate-app는 `PROD_DES: ''`를 만든 뒤(`clients/web/estimate-app/lib/code.js:2308-2318,2351-2360`) bridge에서 `productName: b.PROD_DES || ''`로 보내고 category는 전혀 만들지 않는다(`clients/web/estimate-app/lib/slip-bridge.js:124-138`). 서버 DTO는 `productName`과 `categoryKey`를 받을 수 있지만, 이름 fallback은 `null`에만 적용되므로 빈 문자열은 그대로 저장된다(`SlipPublishService.java:794`). 실 DB의 유일한 빈 품목명도 웹 합성 견적 source ID를 가진 ESTIMATE 행이다.

따라서 견적 웹의 품목명은 **웹이 빈 문자열을 명시적으로 전송하고 서버가 빈 문자열을 유효값으로 취급**하는 결합이고, 카테고리는 **웹 요청에 아예 없는 값**이다.

### 3. 주문 웹

주문 화면의 전송 직전 `items`에는 이름과 가격이 있으나 confirm payload가 이를 버리고, 주문 서비스가 product 조회와 서버 가격 계산으로 다시 만든다. 이후 주문→전표 변환의 현재 코드는 주문 라인의 `productName`과 `categoryKey`를 보내며 slip-service도 둘을 저장할 수 있다(`PartnerOrderConvertService.java:154-162`, `SlipPublishService.java:792-802`).

기존 실데이터 7행에서 원천 주문의 한국어 이름은 정상인데 전표 6행이 실제 `?` 바이트로 저장된 사실은 확인했다. 현재 코드에서 품목명을 누락하는 지점은 보이지 않으므로, 이 과거 인코딩 손상의 정확한 wire 단계는 이번 정적 추적만으로 특정하지 않았다. 카테고리 7행은 주문 원천에 값이 있으나 전표에는 모두 null이다. `categoryKey` 전달·저장 배선이 추가된 시각보다 해당 과거 전표 생성 시각이 앞서므로 기존 7행은 현 코드의 사후 증거가 아니다. 변경 후 생성된 실표본이 없어 현재 wire 전달 성공 여부도 아직 실증되지 않았다.

## ④ 옵션 미저장 원인

실 DB의 `bundle_set_options` non-null 364행을 조사한 결과 `panelOption`, `remoteOption`, `panelShape360` non-null은 각각 0건이다. 웹 발행 계열인 ESTIMATE와 PARTNER_ORDER 행에서는 `bundle_set_options` 자체가 모두 null이다.

옵션 단절은 다음 순서로 나타난다.

1. 주문서 웹은 구성품 행과 함께 `has360`, `has4way`, `hasStand`, `hasOneWayDc`, `hasDeluxeDc`, `hasGrade1Dc` 같은 선택 결과를 전송 직전 객체에 보유한다(`order-app/index.html:6699-6717`).
2. `confirmLines`가 이를 `modelCode/categoryKey/quantity/remark`로 축소하면서 옵션을 버린다(`samhanApi.ts:212-239`).
3. `ConfirmLineRequest`, partner order line, `PublishLineRequest`에 `bundleSetOptions` 계약이 없다.
4. 단건·병합 변환 빌더도 옵션을 넣지 않는다.
5. `SlipLine`에는 `bundle_set_options` 저장 구조가 있지만 세 웹 발행 resolver가 값을 전달할 방법이 없어 null이 된다.

별도의 정규화된 견적→전표 변환기는 옵션을 복사하는 코드가 있다(`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateToSlipConverter.java:100-130`, `SlipLine.java:410-414`). 이는 저장 컬럼과 엔티티 기능이 없어서가 아니라, 이번 세 `/from-*` 요청 계약과 웹→주문 전달 사슬에 옵션이 없어서 발생하는 차이임을 보여준다.

요구된 “실제 웹 요청 페이로드 캡처”는 브라우저 부재로 완료하지 못했다. 요청을 보내지 않았으므로 공유 DB에 전표는 생성되지 않았고, `resolveQaShotsDir()`로 저장할 캡처 산출물도 만들지 않았다. 재실증 시에는 `<이름>-real-qa` 디렉터리의 라이브 스펙에서 해당 resolver를 사용하고, 전표 생성 POST를 route interception으로 중단한 상태에서 body만 보존해야 한다.

## ⑤ 견적 → 전표 연결 부재

헤더에는 `source_type=ESTIMATE`, `source_id=estimateNumber`가 남는다(`Slip.java:1679-1717`, `SlipPublishService.java:162`). 그러나 estimate-app bridge는 안정적인 원천 견적번호가 없으면 매 호출 시각 기반 `WEB-...` 합성 번호를 만든다(`slip-bridge.js:99-105`). 이 번호를 원천 견적 테이블/스냅샷과 조인하는 계약은 없다.

실 DB에서 ESTIMATE 전표는 7건이며 웹 합성 source ID 전표는 1건이다. ESTIMATE 전표 라인의 `source_order_line_id` 채움은 0건이다. publish audit은 source ID, 요청 금액 합계, fingerprint를 가지지만 원본 payload 자체를 보존하지 않는다(`SlipPublishService.java:191-196`). 따라서 fingerprint만으로 어느 원천 행과 같았는지 복원할 수 없다.

`slip_lines.source_order_line_id`는 migration 주석과 이름상 주문 부분 전환용이다. 견적을 행 단위로 검증하려면 다음 중 무엇을 남길지 결정이 필요하다. 이 보고서는 선택하지 않는다.

- 헤더에 안정적인 원천 견적/견적 snapshot 식별자를 남기는 방식
- 각 전표 행에 원천 견적 라인 식별자를 별도로 남기는 방식
- 발행 당시의 불변 payload snapshot을 보존하고 header/line과 연결하는 방식
- fingerprint와 함께 복원 가능한 원문 또는 정규화 payload를 감사 저장하는 방식

## ⑥ “그대로 저장” 변경 시 영향받을 수 있는 것

### 기존 데이터

- 생성 경로만 변경하면 이미 저장된 전표 행은 자동으로 바뀌지 않는다.
- 기존 데이터 backfill·재계산을 함께 선택하면 전표 불변성, 감사 이력, 이미 생성된 회계/세금계산서와의 불일치가 생길 수 있다.
- PARTNER_ORDER 전표는 발행 직후 `SENT`가 되어 수정 불변 상태이므로 미래 행의 정확성은 생성 시점 계약에 의존한다.

### 회계전표

- 회계 source snapshot은 전표의 `productName`, `modelName`, `categoryKey`, 수량·단가·합계를 읽는다(`services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java:588-609`, `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/SlipLineSnapshot.java:24-39`).
- 현재 slip-service snapshot은 VAT 포함 단가×수량으로 `lineTotalWithVat`를 다시 계산한다. 따라서 위 과거 0.81원 행도 회계 source에는 9,000,000원으로 보일 수 있어, 저장 공급가+VAT와 회계 입력 합계가 서로 다른 축이다.
- 회계 생성은 전달받은 금액을 다시 VAT 분할하고, 모델·카테고리를 회계 라인과 배부 정보에 복사한다(`SalesAccountingSlipCreateAttemptService.java:84-111,167-174`). 금액 원천을 웹 값으로 바꾸면 배부 한도와 분개 합계 검증이 영향을 받을 수 있다.

### 홈택스·세금계산서

- 매출전표→세금계산서는 회계전표 라인의 품목·금액을 복사한다(`TaxInvoiceBatchFromSalesSlipsService.java:91-105`, `TaxInvoice.java:313-333`, `TaxInvoiceLine.java:172-218`).
- 홈택스 내보내기는 발행된 세금계산서 라인의 공급가, VAT, 품목명, 규격, 단가를 사용한다(`HometaxExportService.java:187-228,550-580`). 품목명·금액 축 변경은 미래 세금계산서와 내보내기 값에 전파될 수 있다.

### 일마감·월마감·원장

- 마감 집계는 품목명·모델명·카테고리와 공급가·VAT를 읽고 `(공급가+VAT)/수량`으로 실제 단가를 파생한다(`MonthEndCloseService.java:359-422`). 금액과 카테고리 보존 방식이 바뀌면 집계·재검증·할인 계산 축이 달라질 수 있다.
- 거래처 원장은 매출 행의 품목명·모델명·수량·금액을 표시/합산한다(`PartnerLedgerReadModelService.java:270-276`, `PartnerLedgerReadService.java:162-183,720-722`).
- 옵션은 현재 회계 snapshot 계약에 포함되지 않는다. `bundle_set_options` 저장만 추가하는 변경은 당장 회계에 전달되지 않지만, 후속 소비 계약을 추가하면 마감/원장 표시와 집계 기준 검토가 필요하다.

### 그 밖의 계약

- 요청 원문을 그대로 쓰도록 바꾸면 현재 idempotency fingerprint의 정규화 기준과 replay 호환성을 함께 확인해야 한다.
- product lookup을 식별 검증에만 쓸지, 카탈로그 이름·모델명 대체에도 계속 쓸지에 따라 품목 snapshot의 의미가 달라진다.
- `supplyAmount/vatAmount`를 저장 원천으로 바꾸면 단가×수량과 합계 불일치 시 검증/거절/보존 중 어떤 계약인지 정해야 한다.

## ⑦ 착수 계획 제안

아래는 구현 순서 제안이며 계약 선택은 포함하지 않는다.

1. **금액 계약을 먼저 고정**: 세 API에서 line 단위로 어떤 금액 필드를 필수 원천으로 삼을지, 소수/원 단위/불일치 처리 기준을 문서와 계약 테스트로 먼저 고정한다. 0.81원이 회계·세금계산서·마감까지 이어질 수 있는 금액 축이므로 우선한다.
2. **세 경로 공통 fidelity 계약 테스트 작성**: 요청의 행 수·순서·품목 snapshot·수량·단가·공급가·VAT·합계가 저장값과 일치하는지, 서버 생성값은 무엇만 허용하는지 공통 표로 검증한다. 단건·병합·견적을 각각 포함한다.
3. **실제 wire payload 재캡처**: 브라우저가 제공되는 세션에서 견적 웹과 주문서 웹의 생성 직전 POST를 interception하여 전송을 중단하고 body만 증거화한다. 주문 confirm과 내부 `/from-estimate`를 분리 캡처한다.
4. **품목명·카테고리 전달 사슬 보강 범위 확정**: 견적 웹의 빈 이름/누락 category, 주문 confirm의 이름·가격 축소, 과거 `?` 인코딩 재현을 각각 독립 검증한다.
5. **옵션 계약 확장 범위 확정**: 웹 선택 flag → confirm DTO → 주문 라인 snapshot → publish DTO → `bundle_set_options`의 명시적 mapping과 round-trip 테스트를 설계한다.
6. **견적 추적성 추가**: header와 line 중 어디에 안정 식별자 또는 불변 snapshot을 남길지 결정한 뒤 행 단위 원천 대조 테스트를 추가한다.
7. **하류 회귀 검증**: 회계전표, 세금계산서/홈택스, 일·월마감, 원장을 미래 생성 데이터로 검증하고, 기존 데이터 backfill은 별도 의사결정과 별도 검증으로 분리한다.

## ⑧ 판단이 필요한 지점

다음 항목은 이번 정찰에서 고르지 않았다.

1. 금액의 단일 원천: 웹 `unitPriceVat/supplyAmount/vatAmount`를 모두 보존할지, 합계 필드를 새로 받을지, 불일치 요청을 거절할지.
2. 원 단위 정책: 전표가 소수 원을 허용할지, 웹에서 이미 원 단위가 확정되어야 하는지, 서버가 검증만 할지.
3. 서버 product lookup 역할: 존재 여부 검증만 할지, `productId` 연결은 하되 웹 snapshot 이름·모델·카테고리를 우선할지.
4. 빈 품목명 처리: 빈 문자열도 그대로 보존할지, 계약 오류로 거절할지, 카탈로그 fallback을 허용할지.
5. 옵션 표현: 현재 JSON 객체를 그대로 line snapshot으로 받을지, 정규화 필드/별도 테이블로 받을지, 웹의 `has*` flag를 어떤 키로 매핑할지.
6. 견적 추적 키: 원 견적 header ID, 원 견적 line ID, 불변 payload snapshot 중 어떤 조합을 의무화할지.
7. 단건 주문의 표시용 `orderNo`: `slip_source_orders`에 1행을 남길지, 별도 header snapshot을 둘지.
8. 기존 0.81원 및 과거 품목명·카테고리 누락 행: 그대로 보존할지, 별도 보정 이력을 가진 backfill을 할지.
9. 하류 금액 기준: 회계 snapshot이 `unitPriceWithVat×qty`를 재계산할지, 저장된 `supplyAmount+vatAmount`를 사용할지.

## ⑨ 프로세스 회수와 작업 흔적

- 코드 수정: 0건
- git add/commit/push: 0건
- 이슈/PR 게시: 0건
- 공유 DB write 및 신규 전표·주문·견적 생성: 0건
- SQL: 읽기 전용 트랜잭션 후 rollback
- 기동·재시작·중지한 컨테이너: 0개
- 기동한 지속 로컬 프로세스: 0개
- 회수할 자체 프로세스/컨테이너 잔여: 0개
- 종료 시 실행 컨테이너: 총 28개(`samhan-*` 공유 스택 24개, 다른 라운드 `d02-*` 4개). 공유 스택 24개는 모두 healthy였고 조작하지 않음
- 실제 네트워크 캡처: 인앱 브라우저 0개로 미수행; POST 요청도 보내지 않음
- 파일 산출물: 이 보고서 1개만 작성. 네트워크 캡처 증거 파일은 생성하지 않음.

이 보고서는 관찰 근거, 미확인 지점, 착수 순서만 기록하며 구현 방식이나 데이터 보정 여부를 판정하지 않는다.
