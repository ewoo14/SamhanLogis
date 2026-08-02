# 2026-08-01 1009 견적 계산 경로 대조 조사 — 2라운드

## 1. 종합견적서 화면의 계산 주체와 PriceCalculationService 호출자

- **확정:** `clients/web/estimate-app` 종합견적서 화면은 브라우저 자체 계산을 수행한다. EJS가 브라우저에 `google.script.run` shim을 주입하고, shim은 RPC가 필요할 때만 `POST /rpc/:fn`을 보낸다 (`clients/web/estimate-app/views/index.ejs:1253-1281`). 화면의 미리보기 진입은 `renderPreviewContent()`를 직접 호출한다 (`clients/web/estimate-app/views/index.ejs:10549-10566`). 따라서 이 화면의 표시 금액은 브라우저 계산 경로다.
- **확정:** `PriceCalculationService`의 HTTP 엔드포인트는 `POST /internal/price-calculations`이며 `InternalDcConfigController`가 요청을 서비스에 전달한다 (`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/web/InternalDcConfigController.java:125-139`). 확인된 실제 호출자는 `partner-order-service`의 `DcConfigClient`이고, `PartnerOrderConfirmService`가 이를 사용한다 (`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/DcConfigClient.java:121-164`, `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java:90-90,188-209`). 즉 호출 앱은 `partner-order-service`, 호출 화면/HTTP 경계는 확인 가능한 소스상 `PartnerOrderConfirmService`가 처리하는 주문 확정 경로이며, 종합견적서 web 화면이 이 엔드포인트를 호출한다는 근거는 확인되지 않았다.

## 2. 저장·전표 발행 시 금액의 권위값

- **견적 저장:** 브라우저의 `takeSnapshot()` 결과를 JSON/base64로 만들고, 별도 재계산 없이 `saveQuoteSnapshot({ data: strData, summary: summaryData, image: imgBase64 })` RPC를 호출한다 (`clients/web/estimate-app/views/index.ejs:17261-17283,17517-17535`). Node RPC는 이를 `POST /internal/estimates/snapshots`로 그대로 전달한다 (`clients/web/estimate-app/lib/code.js:2443-2470`). 확인한 경로에는 `PriceCalculationService` 재호출이 없다. 따라서 저장 snapshot은 브라우저 상태를 저장한다.
- **전표 발행:** 화면은 `buildSendRows()`가 만든 `items`와 `estimateConfig`를 `sendOrderFromUi`에 전달한다 (`clients/web/estimate-app/views/index.ejs:10389-10447,10464-10483`; 동일 흐름의 모바일/대체 경로도 `clients/web/estimate-app/views/index.ejs:15719-15749`). 서버측 Node 함수는 각 `it.price`를 반올림해 `USER_PRICE_VAT`로 넣고, 그 값에서 `splitVatAmount_`로 공급가/부가세만 분리한 뒤 (`clients/web/estimate-app/lib/code.js:2340-2353,2385-2393`), `slipBridge.postSlip`을 호출한다 (`clients/web/estimate-app/lib/code.js:2399-2407`). bridge는 `POST /internal/slips/from-estimate`로 `unitPriceExVat`, `unitPriceVat`, `supplyAmount`, `vatAmount`를 전달한다 (`clients/web/estimate-app/lib/slip-bridge.js:120-135,140-165`). 이 경로에도 `PriceCalculationService` 재호출은 없다. 즉 web estimate-app의 전표 발행은 브라우저가 만든 `it.price`를 입력 금액으로 신뢰하고 VAT만 다시 분리한다.
- **별도 주문 확정 경로:** `partner-order-service`의 `POST /{draftId}/confirm`은 `clientPrice`를 표시용으로 취급하고 서버에서 `DcConfigClient.calculatePrices`의 `finalPrice`를 받아 `priceVat`에 저장한다 (`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/ConfirmLineRequest.java:7-12`, `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java:181-203,215-233`). 따라서 web estimate-app의 저장/전표 경로와 partner-order confirm 경로는 금액 권위가 다르다.

## 3. 같은 입력을 손으로 대조한 4개 쟁점

### 3.1 `unitRoundTo`가 0/NULL일 때 1원 반올림

- **실제 차이가 가능한 입력:** 정가 `1,000,000.51`, 전역DC `45%`, 유효한 web 숫자 입력으로 대조했다. web의 home/comm 경로는 먼저 `Math.round(Number(r.list))`로 정가를 `1,000,001`로 만들고, 다시 `Math.round(1,000,001 × 0.55)`를 하므로 **웹 `550,001원`**이다 (`clients/web/estimate-app/views/index.ejs:4282-4284,4305-4314`; comm도 `4391-4392,4415-4424`). 서비스는 원 입력 `1,000,000.51 × 0.55 = 550,000.2805` 후 `unitRoundTo=0`/NULL에서 `setScale(0, HALF_UP)`이므로 **서비스 `550,000원`**이다 (`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java:59-67,140-143`).
- 정가가 이미 정수이면 양쪽 모두 최종 1원 반올림이어서 이 차이는 드러나지 않는다. 차이의 원인은 서비스가 소수 정가를 보존하고 web이 정가를 먼저 정수화하는 데 있다.

### 3.2 6종 정액DC: 멀티 제외 및 순차/합계

- **멀티 적용 대상:** 서비스는 `HOMEMULTI` 또는 `COMMERCIAL_MULTI`면 6종 정액DC 합계를 0으로 만든다 (`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java:120-126`). web의 멀티 본체 계산은 home/comm 전역DC 경로이고, 6종 정액DC는 single set의 `adjustSingleSetBasePrice`/`singleUnitPrice`에 적용된다 (`clients/web/estimate-app/views/index.ejs:3232-3256,4348-4379`). 따라서 같은 정가 `1,000,000원`, 6종 플래그 6개 true, 각 정액 `10,000원`, 멀티 category라면 **웹 멀티 경로는 `550,000원`(전역 45%만 적용)**, **서비스는 `550,000원`**이다. 이 입력에서는 둘 다 멀티에 6종을 적용하지 않는다.
- **싱글에서의 합계 대조:** 같은 정가 `1,000,000원`, 전역DC 0%, 6종 플래그 모두 true, 각 정액 `10,000원`이면 web은 `1,000,000 → 990,000 → 980,000 → 970,000 → 960,000 → 950,000 → 940,000`으로 순차 차감한다 (`clients/web/estimate-app/views/index.ejs:4370-4377`). 서비스는 `10,000×6=60,000`을 먼저 합산한 뒤 `1,000,000-60,000`이므로 **웹 `940,000원` / 서비스 `940,000원`**이다 (`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java:64-66,127-134`). 양쪽 정액이 음수가 아닌 정상 설정이면 순차 차감과 합계 일괄은 최종액에서 달라지지 않는다.

### 3.3 부자재(`isAcc`) 정액DC 제외

- 같은 입력을 `AC`/`AP` 계열 부자재로 놓고 정가 `100,000원`, 360 정액DC `10,000원`, 나머지 정액DC `0원`, 전역DC `0%`, 360 flag=true로 대조했다. web은 부자재 판정 즉시 원가를 반환하므로 **웹 `100,000원`**이다 (`clients/web/estimate-app/views/index.ejs:4348-4353`; set 경로도 `3232-3235`). 서비스 요청에는 `isAcc` 필드가 없고, 360 flag가 true면 정액DC를 합산하므로 **서비스 `90,000원`**이다 (`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java:120-134`; request 필드 목록 `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/dto/PriceCalculationRequest.java:19-39`). 이 조합은 실제 금액 차이가 난다.

### 3.4 VAT 분리: `Math.round(total/1.1)` 대 `100/110` 절사

- **확인불가(PriceCalculationService와의 양쪽 금액 대조):** `PriceCalculationService`에는 VAT 분리 계산이 없고, `finalPrice`와 line total만 반환한다 (`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java:68-83`). 따라서 같은 입력에 대해 서비스의 VAT 공급가액 Y원을 근거 있게 적을 수 없다.
- web 전표 경로 자체는 `vatRate`로 나누고 `Math.round`한다. 예를 들어 VAT 포함 `1,000,001원`, vatRate 10%이면 **웹 공급가 `909,092원`, VAT `90,909원`**이다 (`clients/web/estimate-app/lib/code.js:459-467,2346-2353`). 1라운드에서 확인된 `100/110` 정수 나눗셈은 `clients/desktop/src/renderer/utils/vatRounding.ts:19-22`의 별도 desktop 공통 유틸이며, `PriceCalculationService`의 계산이 아니므로 이번 “웹 계산 대 서비스 계산” 대조의 서비스 값은 **확인불가**로 남긴다.

## 4. 2순위 확인불가 항목 재확인

- **AC/AP 7·8번째 자리 및 AP230/AP290 예외:** 현행 web에는 규칙과 예외가 명시적으로 있다. `m[7]`/`m[8]`로 360·4way·1way를 판정하고, AP는 7·8번째 자리 및 11번째 자리 C/H 조건으로 stand/deluxe를 나눈 뒤 AP230/AP290은 `isStand=true`, `isDeluxe=false`로 덮어쓴다 (`clients/web/estimate-app/views/index.ejs:2328-2343`). 반면 현행 product-service detector는 모델 문자열 전체에 `360`, `4way`, `1way`, `stand`, `deluxe` 등이 포함되는지의 정규식이며, 7·8번째 위치 또는 AP230/AP290 예외가 없다 (`services/product-service/src/main/java/com/samhanair/logis/product/service/VariableDiscountDetector.java:40-46,108-119`). 따라서 web에는 있고, service의 자동 detector에는 **확인되지 않는다**.
- **1등급 `F` 접두 규칙:** 현행 web에는 AC/AP 모델의 9번째 문자(`m[8]`)가 `F`이면 `isGrade1=true`인 규칙이 있다 (`clients/web/estimate-app/views/index.ejs:2345-2347`). product-service detector의 현행 1등급 판정은 모델 전체에서 `1등급|grade.?1|G1`을 찾는 정규식이고 9번째 `F` 규칙은 없다 (`services/product-service/src/main/java/com/samhanair/logis/product/service/VariableDiscountDetector.java:40-46,108-119`). 그러므로 web 규칙은 확정, service에 동일한 `F` 규칙은 **없음**으로 확인했다.
- **거래처 `싱글 할인` 열:** web directory 변환은 모든 거래처에 `singleDiscount: 0`을 고정하여 반환하고, partner-service의 거래처 응답에서 해당 값을 읽지 않는다 (`clients/web/estimate-app/lib/directory.js:72-84`). 별도로 전역 `estimate_configs.single_discount`/`single_one_way_discount`는 `getSingleDefaults()`가 `'할인'`/`'1WAY할인'`으로 변환한다 (`clients/web/estimate-app/lib/code.js:1251-1263`; DB 필드는 `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/domain/EstimateConfig.java:104-108`). 그러나 현재 EJS 계산부에서는 `SINGLE_DEFAULTS['할인']`을 참조하는 코드를 찾지 못했고, 실제 `adjustSingleSetBasePrice`는 6종 정액DC만 적용한다 (`clients/web/estimate-app/views/index.ejs:3227-3256`). 따라서 거래처별 `싱글 할인` 열의 현행 대응은 **확인불가/실질 미연결**이며, 확인된 고정 `singleDiscount: 0`은 거래처 값의 보존이 아니다.
