# D-G2 할인 상한 토폴로지 정찰 보고

> 조사일: 2026-08-11 (Asia/Seoul)  
> 범위: 레거시 `estimate-app`·`order-app`, Samhan Public 백엔드, `clients/desktop`, 공유 DB 읽기 전용 조회  
> 성격: 사실 조사 전용. 코드·스키마·Git·공유 DB 변경 없음.

## 1. 세 층 불일치표와 메인장비 판정 기준 비교

| 층/진입점 | 45% 기준 자동 경로 | 실제 가격에 걸리는 보편 상한 | 같은 거래에서 저장 가능한 최대 할인 |
|---|---|---|---|
| 레거시 프런트 — 견적앱 | 거래금액 티어 `+1/+2/+3/+4%`; 산술상 `45+4=49%`. 단, 현재 파일에서는 조정값이 가격 함수에 연결되지 않아 **49%는 가격 상한도 실제 적용 할인도 아니고 표시 메타데이터의 창발적 최대치**다. | 전역 할인 입력에는 `max` 없음. 품목 고정 DC만 `0.99`(99%) clamp. | 전역 입력 100% → 단가 0으로 저장 가능하므로 실효 최대 100%. 품목 고정 DC 경로는 99%. |
| 레거시 프런트 — 주문앱 | 기본값이 정확히 45%일 때 티어 보너스를 더하며 `Math.min(..., 0.48)` 적용. | **보편 상한 아님.** 48%는 “정확히 45% + 티어 보너스” 분기에만 걸린다. 45%가 아닌 전역 설정값은 통과하고 품목 고정 DC는 별도 99% clamp다. | 백엔드 전역 설정 경로 99.99%, 품목 고정 DC 99%. 자동 45% 티어 경로만 48%. |
| 우리 백엔드 — 설정/저장/전환 | 티어·메인장비 페널티 없음. | 거래처/공통 전역 DC 설정은 0.9999(99.99%), 품목 고정 DC 설정은 100%. 견적·전표 저장과 견적→전표 전환에는 할인율 필드·48/49 상한 검증이 없다. | 단가 0 허용으로 실효 최대 100%. 저장 시에는 할인율이 아니라 비음수 단가만 검증한다. |
| 우리 데스크톱 | 티어·메인장비 페널티 없음. | 견적/전표 거래 화면에 할인율 입력 자체가 없다. 단가 입력은 비음수이고 상한 없음. 별도 설정 화면은 전역 99.99%, 품목 고정 DC 100%, 거래처 기본 할인 UI 100%(해당 API는 99.99%). | 직접 단가 0 입력 또는 품목 고정 DC 100%로 실효 최대 100%. |

| 층/앱 | 검사 대상 | “메인장비 있음” 판정 | 제외 규칙 | 실내기만 있는 거래 | 전열교환기만 있는 거래 |
|---|---|---|---|---|---|
| 레거시 견적앱 | 선택된 홈멀티+상업멀티 전 라인 | `품목명 + 대분류(catL)`에 `실외기|outdoor`가 하나라도 있음 | 없음 | **메인장비 부재**로 판정, 45%→40% | 실외기 문자열이 없으면 **부재**로 판정, 45%→40% |
| 레거시 주문앱 | 선택된 홈멀티+상업멀티 중 전열교환기 제외 라인 | `품목명 + 중분류(catM) + 대분류(catL)`에 `실외기|outdoor|실내기|indoor|벽걸이`가 하나라도 있음 | `전열\s*교환기|erv`는 분모와 메인 수 모두에서 제외 | **메인장비 있음**으로 판정, 페널티 없음 | 검사 분모가 0이므로 **부재가 아님**, 페널티 없음 |
| 우리 백엔드 | 없음 | 판정 로직 없음 | 없음 | 판정하지 않음 | 판정하지 않음 |
| 우리 데스크톱 | 없음 | 판정 로직 없음 | 없음 | 판정하지 않음 | 판정하지 않음 |

## 2. 레거시 견적앱 전수 추적

대상 파일: `clients/web/estimate-app/views/index.ejs`

### 2.1 전역 할인 입력과 실제 가격 경로

- 할인 입력 공통 생성기는 `input type=number`와 `step`만 설정한다.
  - `:3063` — `const inp = document.createElement('input');`
  - `:3064` — `inp.type = 'number';`
  - `:3067` — `inp.step = step || 1;`
  - `:3054~3098` 전체에 `min`·`max` 설정이 없다.
- 홈/상업 할인 입력도 이 공통 생성기를 그대로 쓴다.
  - `:7808` — `box.appendChild(numInp('할인율(%)', 'home_rate', (window.DISCOUNT_RATE_HOME ? Math.round(window.DISCOUNT_RATE_HOME * 100) : 45), 1));`
  - `:6643` — `box.appendChild(numInp('할인율(%)', 'comm_rate', (window.DISCOUNT_RATE_COMM ? Math.round(window.DISCOUNT_RATE_COMM * 100) : 45), 1));`
- 실제 단가는 `window.DISCOUNT_RATE_*`가 아니라 DOM 입력값을 다시 읽는다.
  - `:4376` — `const rateVal = parseFloat(document.getElementById('home_rate')?.value || '45');`
  - `:4377` — `const globalRate = rateVal / 100;`
  - `:4384` — `const finalRate = (parsedFixed !== null) ? parsedFixed : globalRate;`
  - `:4385` — `computed = Math.round(listPrice * (1 - finalRate));`
  - `:4487` — `const rateVal = parseFloat(document.getElementById('comm_rate')?.value || '45');`
  - `:4488` — `const globalRate = rateVal / 100;`
  - `:4495` — `const finalRate = (parsedFixed !== null) ? parsedFixed : globalRate;`
  - `:4496` — `computed = Math.round(listPrice * (1 - finalRate));`
- 전송 행도 위 가격 함수를 호출한다.
  - `:9772` — `price: getRealCommPrice(r.model)`
  - `:9791` — `price: getRealHomePrice(r.model), fixedDc: fDc, spec: userSpec || '\u200B'`

따라서 전역 할인 입력에는 프런트 상한이 없다. 입력이 100%면 계산 단가는 0이고, 100% 초과면 음수가 된다. 후자는 백엔드의 비음수 단가 검증에서 거부되므로 저장 가능한 실효 최대는 100%다.

### 2.2 품목 고정 DC의 별도 99% clamp

- 숫자 입력:
  - `:3134` — `const v = dc > 1 ? dc/100 : dc;`
  - `:3135` — `return Math.min(Math.max(v,0),0.99);`
- 문자열 입력:
  - `:3140` — `let v = Number(m[0]);`
  - `:3141` — `if(/%/.test(s) || v > 1) v = v/100;`
  - `:3142` — `v = Math.min(Math.max(v,0),0.99);                 // 0~0.99 클램프`

이 99%는 49% 자동 계산과 별개이며, 고정 DC가 있으면 전역 할인보다 우선한다(`:4384`, `:4495`).

### 2.3 메인장비 부재 페널티

함수 이름은 `isIndoorOnly`이지만 실제 판정은 “실외기 문자열이 한 개도 없음”이다.

- `:13888` — `function isIndoorOnly() {`
- 홈멀티:
  - `:13896` — `qTotal += q;`
  - `:13897` — `if(/실외기|outdoor/i.test((r.name||'')+' '+(r.catL||''))) qOut += q;`
- 상업멀티:
  - `:13906` — `qTotal += q;`
  - `:13907` — `if(/실외기|outdoor/i.test((r.name||'')+' '+(r.catL||''))) qOut += q;`
- 반환:
  - `:13912` — `return (qTotal > 0 && qOut === 0);`
- 페널티는 정확히 45%인 설정에만 적용한다.
  - `:13925` — `function isStandard45(rate) {`
  - `:13926` — `return Math.abs(rate - 0.45) < 0.001;`
  - `:13939` — `if(isIndoorOnly()) {`
  - `:13940` — `if(isStandard45(calcH)) calcH = 0.40;`
  - `:13941` — `if(isStandard45(calcC)) calcC = 0.40;`

즉 품목 분류 ID나 구성품 종류를 보지 않고, 품목명과 대분류 표시 문자열만 본다. 실내기·벽걸이도 실외기가 없으면 부재다.

### 2.4 티어 보너스와 49%의 성격

상수는 다음과 같다.

- `:13917` — `if (sum >= 100000000) return 0.04;`
- `:13918` — `if (sum >= 50000000)  return 0.03;`
- `:13919` — `if (sum >= 30000000)  return 0.02;`
- `:13920` — `if (sum >= 10000000)  return 0.01;`
- `:13921` — `return 0;`

보너스 적용에는 clamp가 없다.

- `:13945` — `if(isStandard45(calcH)) {`
- `:13948` — `if(hBonus > 0) calcH += hBonus;`
- `:13952` — `if(isStandard45(calcC)) {`
- `:13955` — `if(cBonus > 0) calcC += cBonus;`

그러므로 코드 산술상 최대는 `0.45 + 0.04 = 0.49`다. 다만 티어 기준 금액도 정가 합계가 아니라 이미 할인된 실단가 합계다.

- `:4674` — `const sumHome=()=>Array.from(homeQty.entries()).reduce((s,[m,q])=>s+(getRealHomePrice(m)||0)*(q||0),0);`
- `:4676~4678` — `sumComm`도 `getRealCommPrice(m) * q`를 합산한다.

### 2.5 49% 조정값이 실제 가격에 연결되지 않는 단절

래퍼는 임시 전역 변수와 메타데이터를 바꾼다.

- `:13959` — `window.LATEST_CALC_RATES = { home: calcH, comm: calcC };`
- `:13960` — `window.DISCOUNT_RATE_HOME = calcH;`
- `:13961` — `window.DISCOUNT_RATE_COMM = calcC;`
- `:13990` — `r.rateInfo = targetNew;`
- `:13995` — `r.REMARKS = r.REMARKS.split(targetOld).join(targetNew);`

그러나 이 파일에서 `LATEST_CALC_RATES`의 출현은 `:13959` 한 곳뿐이고 소비자가 없다. 래핑된 전송은 `:14011~14014`에서 원래 `buildSendRows`를 호출하지만, 원래 전송 행은 DOM 기반 `getRealHomePrice/getRealCommPrice`를 호출한다. 카드 전송 설정도 다음처럼 DOM을 직접 읽는다.

- `:15938` — `HOME: getInputVal('home_rate') / 100,`
- `:15939` — `COMM: getInputVal('comm_rate') / 100,`

결론적으로 현재 EJS에서 45%+티어 최대 49%는 비고·표시용 계산값으로는 산출되지만 실제 전송 단가에는 적용되지 않는다. 이 파일을 근거로 “견적 거래 가격이 49%에서 막힌다”거나 “자동으로 49%가 적용된다”고 말할 수 없다.

## 3. 레거시 주문앱 전수 추적

대상 파일: `clients/web/order-app/index.html`

### 3.1 전역 설정값과 품목 고정 DC

전역 설정 정규화는 퍼센트/비율 변환만 하고 상한을 두지 않는다.

- `:1507` — `function normalizeDcRate(v, fallback){`
- `:1508` — `const n = configNumber(v, fallback);`
- `:1510` — `return n > 1 ? n / 100 : n;`

품목 고정 DC는 견적앱과 동일하게 99% clamp다.

- `:1562` — `const v = dc > 1 ? dc/100 : dc;`
- `:1564` — `return Math.min(Math.max(v,0),0.99);`
- `:1570` — `if(/%/.test(s) || v > 1) v = v/100;`
- `:1571` — `v = Math.min(Math.max(v,0),0.99);                 // 0~0.99 클램프`

가격 계산에서 고정 DC가 전역 DC보다 우선한다.

- 홈 `:2732` — `const fixedDc = parseFixedDc(r['고정DC'] ?? r.fixedDC ?? r.fixedDc ?? r.FixedDC);`
- 홈 `:2733` — `const useRate = (fixedDc ?? rate);`
- 홈 `:2734` — `computed = Math.round(currentListPrice * (1 - useRate));`
- 상업 `:2856` — `const useRate = (fixedDc ?? globalRate);`
- 상업 `:2857` — `computed = Math.round(currentListPrice * (1 - useRate));`

따라서 48% clamp는 고정 DC 99% 경로를 제한하지 않는다.

### 3.2 메인장비 부재 페널티

- `:8054` — `function isNoMainUnit() {`
- 판정 문자열:
  - 홈 `:8062` — `const txt = (r.name||'')+' '+(r.catM||'')+' '+(r.catL||'');`
  - 상업 `:8077` — `const txt = (r.name||'')+' '+(r.catM||'')+' '+(r.catL||'');`
- 전열교환기 제외:
  - 홈 `:8064` — `if(!/전열\s*교환기|erv/i.test(txt)) {`
  - 상업 `:8079` — `if(!/전열\s*교환기|erv/i.test(txt)) {`
- 메인장비 문자열:
  - 홈 `:8067` — `if(/실외기|outdoor|실내기|indoor|벽걸이/i.test(txt)) qMain += q;`
  - 상업 `:8082` — `if(/실외기|outdoor|실내기|indoor|벽걸이/i.test(txt)) qMain += q;`
- 반환 `:8089` — `return (qTotal > 0 && qMain === 0);`
- 정확히 45%일 때만 40%로 변경:
  - `:8103` — `return Math.abs(rate - 0.45) < 0.001;`
  - `:8116` — `const noMain = isNoMainUnit();`
  - `:8118` — `if(isStandard45(calcH)) calcH = 0.40;`
  - `:8119` — `if(isStandard45(calcC)) calcC = 0.40;`

견적앱과 달리 실내기·벽걸이는 메인장비다. 전열교환기만 있으면 `qTotal=0`이므로 부재 판정도 페널티도 발생하지 않는다.

### 3.3 티어 보너스와 조건부 48% clamp

티어 상수는 견적앱과 같다.

- `:8094` — `if (sum >= 100000000) return 0.04;`
- `:8095` — `if (sum >= 50000000)  return 0.03;`
- `:8096` — `if (sum >= 30000000)  return 0.02;`
- `:8097` — `if (sum >= 10000000)  return 0.01;`

48% clamp는 다음 두 줄에만 있다.

- 홈 `:8127` — `if(hBonus > 0) calcH = Math.min(calcH + hBonus, 0.48);`
- 상업 `:8134` — `if(cBonus > 0) calcC = Math.min(calcC + cBonus, 0.48);`

두 줄은 각각 `isStandard45(calcH/calcC)` 블록 안에 있다(`:8124`, `:8131`). 따라서 전역 설정이 49%이면 45%가 아니므로 clamp 분기에 들어가지 않고 49%가 그대로 가격 계산에 사용된다. 품목 고정 DC도 이 분기 밖이다. 즉 0.48은 주문앱 전체 상한이 아니라 기본 45%의 티어 보너스 상한이다.

티어 금액은 주문앱도 이미 할인된 단가의 합이다.

- `:2936` — `const sumHome=()=>Array.from(homeQty.entries()).reduce((s,[m,q])=>s+(homeUnitPrice(m)||0)*(q||0),0);`
- `:2938~2940` — `sumComm`도 `commUnitPrice(m) * q`를 합산한다.

### 3.4 주문앱에서는 조정값이 실제 가격에 연결됨

- 홈 가격은 `:2715`에서 `window.DISCOUNT_RATE_HOME`을 읽는다.
- 상업 가격은 `:2839`에서 `window.DISCOUNT_RATE_COMM`을 읽는다.
- 래퍼가 콜백 전에 다음 값을 대입한다.
  - `:8138` — `window.LATEST_CALC_RATES = { home: calcH, comm: calcC };`
  - `:8139` — `window.DISCOUNT_RATE_HOME = calcH;`
  - `:8140` — `window.DISCOUNT_RATE_COMM = calcC;`
- 전송 행은 조정된 전역을 읽는 가격 함수를 호출한다.
  - `:6575` — `price: commUnitPrice(r.model),`
  - `:6592` — `price: homeUnitPrice(r.model),`
- 미리보기 헤더도 값을 소비한다.
  - `:6725` — `homeRate: window.LATEST_CALC_RATES?.home,`
  - `:6726` — `commRate: window.LATEST_CALC_RATES?.comm,`
- 전송 래핑:
  - `:8210` — `window.buildSendRows = function() {`
  - `:8211` — `return runWithAdjustedRates(() => {`
  - `:8212` — `return originBuildSendRows.apply(this, arguments);`

따라서 주문앱의 조건부 48%는 해당 분기에서 실제 가격과 전송 행에 적용된다.

## 4. 우리 백엔드 전수 추적

### 4.1 설정 계층의 상한은 하나가 아니다

#### 거래처 전역 DC — 0.9999

- `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/domain/DcConfig.java:132~134`
  - `this.homeDiscountRate = clampRate(homeDiscountRate);`
  - `this.commercialDiscountRate = clampRate(commercialDiscountRate);`
- 같은 파일 `:179~180`
  - `BigDecimal max = new BigDecimal("0.9999");`
  - `return v.compareTo(max) > 0 ? max : v;`
- DB도 `< 1`이다.
  - `services/dc-config-service/src/main/resources/db/migration/V1__init_dc_config.sql:53` — `home_discount_rate ... CHECK (... >= 0 AND home_discount_rate < 1)`
  - 같은 파일 `:54` — `commercial_discount_rate ... CHECK (... >= 0 AND commercial_discount_rate < 1)`

#### 공통 견적 설정 — 0.9999

- `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/dto/UpdateEstimateConfigRequest.java:11` — `@DecimalMin("0.0000") @DecimalMax("0.9999") BigDecimal commonHomeDiscountRate,`
- 같은 파일 `:12` — `@DecimalMin("0.0000") @DecimalMax("0.9999") BigDecimal commonCommercialDiscountRate,`
- DB:
  - `services/dc-config-service/src/main/resources/db/migration/V4__add_estimate_config.sql:7` — `... DEFAULT 0.4500 CHECK (common_home_discount_rate >= 0 AND common_home_discount_rate < 1),`
  - 같은 파일 `:8` — `... DEFAULT 0.4500 CHECK (common_commercial_discount_rate >= 0 AND common_commercial_discount_rate < 1),`

#### 품목 고정 DC — 100%

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:1021` — `BigDecimal rate = new BigDecimal(raw.trim()).setScale(2, RoundingMode.HALF_UP);`
- 같은 파일 `:1022~1023` — `rate`가 `0` 미만 또는 `100.00` 초과이면 `고정DC율은 0 이상 100 이하이어야 합니다` 예외.
- DB:
  - `services/product-service/src/main/resources/db/migration/V20__add_product_classification.sql:77` — `CHECK (fixed_discount_rate IS NULL OR fixed_discount_rate BETWEEN 0 AND 100);`
- 계산 엔진도 고정 DC를 최대 1(100%)로 제한한다.
  - `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java:101~104`
  - `return normalized.max(BigDecimal.ZERO).min(BigDecimal.ONE);`

#### 거래처 기본 할인 — 99.99%, 거래 가격 엔진과는 별도 설정

- `services/partner-service/src/main/java/com/samhanair/logis/partner/tab/dto/PartnerPriceDiscountRequest.java:16~18`
  - `@DecimalMin(value = "0", inclusive = true)`
  - `@DecimalMax(value = "99.99", inclusive = true)`
  - `BigDecimal basicDiscountRate,`

이 필드는 거래처 4탭의 기본 할인 정책이며, 위 `dc-config-service`의 홈/상업 가격 계산 경로와 동일 필드가 아니다.

### 4.2 견적 저장 — 할인율 상한 없음

`CreateEstimateRequest`에는 할인율 필드가 없고 단가만 있다.

- `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/dto/CreateEstimateRequest.java:37~39`
  - `@NotNull @Positive Integer quantity,`
  - `@NotNull @DecimalMin("0.00") BigDecimal unitPrice,`
- 수정도 동일하다.
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/dto/UpdateEstimateRequest.java:65~67`
  - `@NotNull @DecimalMin("0.00") BigDecimal unitPrice,`

검증되는 것은 비음수 단가다. `discountRate`가 없으므로 45/48/49/99.99%를 검증할 저장 지점도 없다.

### 4.3 전표 저장 — 할인율 상한 없음

- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/CreateSlipRequest.java:101~103`
  - `@NotNull @Positive Integer quantity,`
  - `@NotNull @DecimalMin("0.00") BigDecimal unitPrice,`
- `discountInfo`는 `:70`의 최대 200자 문자열일 뿐 비율 필드가 아니다.
- 서비스는 화면 확정 단가를 정본으로 저장한다.
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:299` — `// 단가는 화면이 DC/최근단가/사용자 협의가를 반영해 확정한 값을 정본으로 사용한다.`
  - 같은 파일 `:300~301` — 서버 재계산 시 전역 DC 이중 적용이 되므로 계산하지 않는다는 주석.
  - 같은 파일 `:302~304` — 요청 라인의 `unitPrice` 목록으로 `SlipDiscountCalculator.Calculation`을 직접 생성.

`SlipDiscountCalculator.calculate/calculateDetailed` 메서드는 존재하지만 실제 직접 전표 생성 경로의 호출 검색 결과는 0건이고, `SlipService.java:302`의 직접 `new Calculation(...)`만 존재한다.

### 4.4 견적→전표 전환 — 1:1 금액 복사, 할인율 재검증 없음

- `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateToSlipConverter.java:100` — `// estimate_lines → slip_lines 1:1 copy (lineNo 순).`
- 권위 금액 경로 `:108~116`은 `unitPriceWithVat`, `supplyAmount`, `vatAmount`, `lineTotal`을 그대로 넘긴다.
- VAT 포함 경로 `:117~121`도 견적 단가를 그대로 넘긴다.
- 레거시 경로 `:122~125`도 견적 `unitPrice`를 그대로 넘긴다.
- `:130` — `slip.addLine(slipLine);`
- `:140` — `return slipRepository.save(slip);`

전환 중 DC 재계산, 48/49 상한 검사, 메인장비 판정은 없다.

### 4.5 백엔드 전체 검색 결론

`slip-service`, `product-service`, `dc-config-service`의 운영 Java 소스를 `discountRate|할인율|0.48|0.49|48%|49%`로 전수 검색했다.

- `slip-service` 거래 DTO/엔티티에는 저장용 할인율 컬럼이 없다.
- 0.48·0.49 상수와 티어·메인장비 부재 판정은 없다.
- 0.9999는 전역 설정 상한이고, 100은 품목 고정 DC 상한이다.
- 거래 저장과 전환은 비음수 단가/금액 계약만 강제한다.

따라서 “우리 백엔드의 할인 상한은 정말 0.9999뿐인가?”에 대한 답은 **아니다**. 설정 종류별로 99.99%와 100%가 공존하며, 정작 견적·전표 거래 저장에는 할인율 상한이 없다.

## 5. 우리 데스크톱 전수 추적

### 5.1 견적·전표 거래 화면

견적 화면은 할인율이 아니라 단가를 보낸다.

- `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:1829~1836`
  - `productId`, `quantity`, `unitPrice: l.unitPrice || '0'`을 payload로 구성.
- 단가 입력:
  - 같은 파일 `:2331` — ``fieldPath={`items.${i}.unitPrice`}``
  - `:2332` — `type="text"`
  - `:2343` — `inputMode="decimal"`
  - 상한 속성 없음.

전표 화면도 할인율 입력이 아니라 VAT 포함 단가 입력이다.

- `clients/desktop/src/renderer/routes/SlipFormPage.tsx:215~219`
  - `parseEditableAmountInput`은 숫자/콤마 형식만 허용하며 음수를 허용하지 않는다.
- 같은 파일 `:410~418`
  - `type="text"`, `inputMode="numeric"` 단가 입력이며 `max` 없음.

따라서 거래 화면의 제한은 “할인율 N% 이하”가 아니라 “비음수 단가 문자열”이다. 단가 0을 입력할 수 있으므로 정가 대비 실효 할인은 100%까지 가능하다.

### 5.2 데스크톱 자동 DC 계산

`clients/desktop/src/renderer/utils/slipDiscount.ts`는 다음처럼 계산한다.

- 고정 DC:
  - `:71` — `const fixed = input.fixedDiscountRate`
  - `:73` — `const unitPrice = Math.max(0, Math.round(input.listPrice * (1 - fixed / 100) - optionDiscount))`
  - `:75` — 적용 `rate`를 그대로 반환.
- 전역 DC:
  - `:77~80` — 홈멀티/상업멀티 설정값 선택.
  - `:82` — 문자열에서 `%`를 제거해 숫자로 변환.
  - `:89` — `const unitPrice = Math.round(input.listPrice * (1 - rate / 100))`

여기에 48/49 clamp, 티어 보너스, 메인장비 부재 판정은 없다. 고정 DC 결과만 단가 0 아래로 내려가지 않게 막는다.

### 5.3 데스크톱 설정 화면의 입력 상한

- 공통/전역 비율 설정:
  - `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx:385~389`
  - `type="number"`, `min="0"`, `max="0.9999"`, `step="0.0001"`
  - 퍼센트로는 최대 99.99%.
- 품목 고정 DC:
  - `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.tsx:522~526`
  - `type="number"`, `min="0"`, `max="100"`, `step="0.01"`
- 거래처 기본 할인:
  - `clients/desktop/src/renderer/routes/admin/PartnerCreatePage.tsx:115~118`
  - `discount < 0 || discount > 100`이면 오류이므로 UI는 100%까지 허용.
  - 대응 백엔드 DTO는 99.99% 상한이므로 100% 입력은 서버에서 거부된다.

## 6. 메인장비 판정 불일치의 결과

상한 숫자만 같게 만들어도 적용 대상은 같아지지 않는다.

| 거래 구성 | 견적앱 | 주문앱 | 백엔드/데스크톱 |
|---|---|---|---|
| 실내기만 있음 | 실외기 없음 → 45%를 40%로 변경 | 실내기가 메인 → 변경 없음 | 판정 없음 |
| 벽걸이만 있음 | 실외기 없음 → 45%를 40%로 변경 | 벽걸이가 메인 → 변경 없음 | 판정 없음 |
| 전열교환기만 있음 | 실외기 없음 → 45%를 40%로 변경 | 검사 대상에서 제외되어 `qTotal=0` → 변경 없음 | 판정 없음 |
| 액세서리만 있음 | 실외기 없음 → 45%를 40%로 변경 | 메인장비 없음 → 45%를 40%로 변경 | 판정 없음 |
| 품목명에는 실외기 없음, 중분류에만 실외기 표시 | 견적앱은 `catM`을 안 봄 → 부재 가능 | 주문앱은 `catM`을 봄 → 메인 있음 | 판정 없음 |

핵심 질문에 대한 사실 답변은 **같은 기준이 아니다**이다. 견적앱은 “실외기 부재”, 주문앱은 “실외기·실내기·벽걸이 모두 부재”를 판정하고, 백엔드와 데스크톱은 판정 자체가 없다.

## 7. 공유 DB 읽기 전용 실측

### 7.1 조회 안전성과 모집단 분리

- 대상: 공유 PostgreSQL의 활성(`deleted_at IS NULL`) 견적·전표 및 라인.
- 모든 SQL은 `BEGIN TRANSACTION READ ONLY; ... COMMIT;`로 실행했다.
- DB write, 스키마 변경, 컨테이너 변경은 하지 않았다.
- 활성 헤더/라인의 작성자와 작성 시각을 먼저 분리했다.

| 문서 | 분류 | 헤더 | 라인 | 생성 시각 범위 |
|---|---:|---:|---:|---|
| 견적 | 결정적 DEV-SEED 작성자 | 70 | 106 | 2026-07-16 00:33:11 ~ 2026-08-10 02:30:12 |
| 전표 | 결정적 DEV-SEED/시스템 작성자 | 482 | 930 | 2026-05-09 16:59:33 ~ 2026-08-09 22:52:05 |
| 전표 | 별도 작성자이나 명시적 S22 QA | 2 | 2 | 2026-08-08 20:40:23 ~ 20:40:48 |
| 합계 | 실거래로 인정 가능한 미분류 | **0** | **0** | 없음 |

결정적 DEV-SEED 계정은 저장소의 `V5__seed_p0_5_test_accounts.sql`에 정의된 `a000...001~009` 계정과 `system`, `system-internal`이다. 나머지 작성자의 2건도 25초 간격으로 연속 생성됐고 메모가 `S22-1123-open/closed`, 품목명이 `S22 QA product`라 명시적 QA 잔재로 분류했다. 따라서 활성 552개 헤더·1,038개 라인은 모두 QA/시드이며 실거래 모집단은 0이다.

### 7.2 할인율 산식과 구간

- 문서일 현재 가장 최근 `price_history.release_price`를 정가로 사용했다.
- 저장 실단가는 `(supply_amount + vat_amount) / quantity`로 계산했다.
- 할인율(%) = `(1 - 저장 실단가 / 정가) × 100`.
- `45~48` 구간은 다른 두 구간과 겹치지 않도록 `45% 초과, 48% 미만`으로 정의했다.
- `정확히 48`은 계산값과 48의 차이가 `0.00005%p` 미만인 라인이다.
- 1,038개 라인 중 문서일 가격 이력으로 산출 가능한 라인은 281개였고, 757개는 참조 정가가 없어 구간 집계에서 제외했다.

### 7.3 구간별 결과

| 모집단 | 문서 | 45% 초과~48% 미만 | 정확히 48% | 48% 초과 |
|---|---|---:|---:|---:|
| QA 포함 참고치 | 견적 라인 | 0 | 0 | 12 |
| QA 포함 참고치 | 전표 라인 | 0 | 0 | 85 |
| QA 포함 참고치 | 합계 | 0 | 0 | 97 |
| QA/시드 제외 실거래 | 견적 라인 | **0 — 판정 불가** | **0 — 판정 불가** | **0 — 판정 불가** |
| QA/시드 제외 실거래 | 전표 라인 | **0 — 판정 불가** | **0 — 판정 불가** | **0 — 판정 불가** |
| QA/시드 제외 실거래 | 합계 | **0 — 판정 불가** | **0 — 판정 불가** | **0 — 판정 불가** |

QA 포함 48% 초과 97라인에 두 레거시 판정을 각각 적용하면 다음처럼 달라진다.

| QA 포함 참고치 | 견적앱식 “실외기 없음” | 주문앱식 “실외기·실내기·벽걸이 없음” |
|---|---:|---:|
| 견적 12라인 중 | 3 | 3 |
| 전표 85라인 중 | 49 | 48 |
| 합계 97라인 중 | 52 | 51 |

QA/시드 제외 후에는 45% 초과 라인이 아니라 **실거래 라인 자체가 0개**다. 그러므로 “실거래에 45% 초과 결함이 없다” 또는 “메인장비 부재 건이 없다”는 결론은 낼 수 없고, 모두 **판정 불가**다.

## 8. 정찰 결론

1. 견적앱에는 49% clamp가 없다. 45%와 최대 4% 티어 보너스로 49%가 산출되지만, 현재 파일에서는 그 조정값이 실제 전송 단가로 이어지지 않는다.
2. 주문앱의 0.48 clamp는 존재하고 실제 가격에 적용되지만, 정확히 45%에 티어 보너스를 더하는 분기에만 있다. 전역 설정값이나 품목 고정 DC의 보편 상한이 아니다.
3. 백엔드는 전역 설정 99.99%, 품목 고정 DC 100%를 제한하지만, 견적 저장·전표 저장·견적→전표 전환에는 할인율 필드와 48/49 상한 검증이 없다.
4. 데스크톱 거래 화면은 할인율을 받지 않고 비음수 단가를 받으므로 단가 0, 즉 실효 100% 할인이 가능하다.
5. 메인장비 판정은 견적앱과 주문앱이 서로 다르고, 백엔드·데스크톱에는 없다. 숫자 상한만 통일해도 적용 대상 불일치는 남는다.
6. 공유 DB의 활성 데이터는 전부 DEV-SEED/QA로 분류됐다. 실거래 표본 0이므로 현재 데이터로 운영 결함 유무는 판정할 수 없다.
