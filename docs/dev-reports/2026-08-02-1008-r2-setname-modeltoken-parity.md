# PR #1058 2차 적대검증 — `setName` / `modelToken` 옵션 정액 선택 패리티

## 결론

**어긋난 거래처: 46건 / 46곳.**

원문 문자열이 단순히 다른 정도가 아니다. 실 레거시 원본 시트의 옵션 세트 실내기 100행은 `setName`과 실내기 `modelToken`의 옵션 종류가 모두 같았지만, 같은 완성 세트의 실외기 100행 중 **65행**은 `setName`이 고른 옵션과 집계 행 `modelToken`이 고른 옵션이 달랐다. 대표 실값은 다음과 같다.

- 레거시 세트명: `AC060CS4PBH2SY` → `4way`
- 현행 집계 행 modelToken: `AC060CXAPBH1` → 선택 옵션 없음
- 옵션 정액 보유 46곳은 모두 `discount_4way_amount`가 0원이 아니므로, 위 실 카탈로그 행에 도달하면 46곳 전부 현행 0원 대 레거시 20,000~80,000원의 차이가 난다.

따라서 이 항목은 **도달 가능한 결함**이다. 다만 이 수치는 로컬 `accounting_db`의 과거 발생 건수 집계가 아니라, 실 원본 상품 시트와 실 `dc_config_db` 설정을 결합한 **도달 가능한 거래처 수**다. 로컬 `accounting_db.sales_accounting_slip_lines`는 검증 시점에 0행이어서 과거 실제 전표 발생 횟수를 가장하지 않았다.

## 1. 레거시 `setName` 결정 원문

파일: `tools/legacy-gas/일마감 프로그램/Code.js:242,256-262,585-592,621-646`

원본 카탈로그의 `세트` 열을 `setName`으로 읽고 실내기 토큰에서 후보 세트를 찾은 뒤, 구성 실외기까지 일치한 후보의 세트명을 채택한다.

```javascript
242:     var setName = String(data[i][sIdx] || '').trim();
256:     if (setName) {
257:       if (!setToComps[setName]) setToComps[setName] = [];
258:       setToComps[setName].push({ token: token, class: cls, price: price, raw: rawName });
260:       if (cls === 'INDOOR') {
261:         if (!indoorToSets[token]) indoorToSets[token] = [];
262:         if (indoorToSets[token].indexOf(setName) === -1) indoorToSets[token].push(setName);

585:       var indoors = pool.filter(function(p) { return !p.used && p.class === 'INDOOR'; });
586:       indoors.forEach(function(ind) {
587:         var cands = catalog.indoorToSets[ind.token] || [];
588:         cands.sort(function(a, b) { return catalog.setToComps[b].length - catalog.setToComps[a].length; });
590:         for (var c = 0; c < cands.length; c++) {
591:           var setName = cands[c];
592:           var reqComps = catalog.setToComps[setName];
```

선택된 `setName` 자체로 옵션 종류를 판별한다.

```javascript
621:             var setU = setName.toUpperCase();
634:               if (setU.indexOf('AC') === 0 && setU.length >= 9 && setU[7] === '6' && setU[8] === 'P') {
635:                 discount = discInfo.dc360 ? Math.abs(discInfo.dc360) : 0;
636:               } else if (setU.indexOf('AC') === 0 && setU.length >= 9 && setU[7] === '4' && (setU[8] === 'P' || setU[8] === 'D')) {
637:                 discount = discInfo.dc4way ? Math.abs(discInfo.dc4way) : 0;
638:               } else if (setU.indexOf('AC') === 0 && setU.length >= 9 && setU[7] === '1' && (setU[8] === 'P' || setU[8] === 'D')) {
639:                 discount = discInfo.dc1way ? Math.abs(discInfo.dc1way) : 0;
640:               } else if (isStand) {
641:                 discount = discInfo.stand ? Math.abs(discInfo.stand) : 0;
642:               } else if (setU.indexOf('AP') === 0 && setU.length >= 11 && setU[8] === 'D' && setU[10] === 'H') {
643:                 discount = discInfo.deluxe ? Math.abs(discInfo.deluxe) : 0;
644:               } else if ((setU.indexOf('AC') === 0 || setU.indexOf('AP') === 0) && setU.length >= 9 && setU[8] === 'F') {
645:                 discount = discInfo.grade1 ? Math.abs(discInfo.grade1) : 0;
```

## 2. 현행 `modelToken` 결정 원문

파일: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:393-400,461-469`

현행은 원천 집계 행의 `modelName`에서 `modelToken`을 추출해 축에 저장하고, 그 토큰을 재검증기에 전달한다.

```java
393:     private static AxisKey axisKey(String partnerCode, String productName, String modelName, String categoryKey,
394:                                    BigDecimal actualUnitPrice) {
395:         String label = productName == null || productName.isBlank() ? "-" : productName;
396:         String modelToken = ModelTokenExtractor.extractModelTokenOrNull(modelName);
397:         GasCategoryAxis axis = modelToken == null
398:                 ? GasCategoryAxis.UNKNOWN
399:                 : GasCategoryAxis.fromScheduleKey(categoryKey);
400:         return new AxisKey(partnerCode, label, modelToken, axis, actualUnitPrice);

461:             // 재검증 분기용 토큰(미매치 시 정규화 품명 fallback 포함).
462:             String modelToken = axisKey.modelToken() == null
463:                     ? ModelTokenExtractor.extractModelToken(axisKey.label()) : axisKey.modelToken();
467:             DiscountRevalidator.Revalidation revalidation = discountRevalidator.revalidate(
468:                     axisKey.label(),
469:                     modelToken,
```

파일: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:151-155,307-334`

그 토큰으로 옵션 종류를 골라 기대 납품가에서 차감한다.

```java
151:             BigDecimal optionDiscount = globalDiscount == null
152:                     ? null : globalDiscount.optionDiscountFor(safeModelToken);
153:             if (optionDiscount != null) {
154:                 effectiveDeliveryPrice = effectiveDeliveryPrice.subtract(optionDiscount.abs());
155:             }

307:         /** 레거시 세트코드 규칙으로 싱글 세트에 적용할 옵션 정액을 고른다. */
308:         private BigDecimal optionDiscountFor(String modelToken) {
309:             String code = modelToken == null ? "" : modelToken.toUpperCase(java.util.Locale.ROOT);
313:             if (code.startsWith("AC") && code.length() >= 9) {
314:                 if (code.charAt(7) == '6' && code.charAt(8) == 'P') return discount360Amount;
315:                 if (code.charAt(7) == '4' && (code.charAt(8) == 'P' || code.charAt(8) == 'D')) {
316:                     return discount4WayAmount;
318:                 if (code.charAt(7) == '1' && (code.charAt(8) == 'P' || code.charAt(8) == 'D')) {
319:                     return discount1WayAmount;
321:                 if (code.charAt(8) == 'F') return discountFirstGradeAmount;
323:             if (code.startsWith("AP")) {
324:                 if (code.startsWith("AP230") || code.startsWith("AP290")
327:                     return discountStandAmount;
329:                 if (code.length() >= 11 && code.charAt(8) == 'D' && code.charAt(10) == 'H') {
330:                     return discountDeluxeAmount;
332:                 if (code.length() >= 9 && code.charAt(8) == 'F') return discountFirstGradeAmount;
334:             return null;
```

## 3. 대조 방법

1. GAS 상수 `SOURCE_SHEET_URL`이 가리키는 실 Google Spreadsheet `1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ`의 `싱글 구성품!A1:N1737`을 읽기 전용으로 읽었다.
2. 원본 열 `C=모델명`, `D=구분`, `M=세트`를 사용했다. 합성 행이나 테스트 fixture는 넣지 않았다.
3. GAS `Code.js:621-646`과 현행 `optionDiscountFor`의 선택 규칙을 각각 그대로 적용했다.
4. 세트 완성에 쓰이는 실내기·실외기 행 가운데 레거시 `setName`이 옵션 6종 중 하나를 선택하는 200행을 비교했다.
5. 실내기 100행은 선택 종류 불일치 0행, 실외기 100행은 불일치 65행이었다. 원문 문자열 자체는 실내기 271행에서도 동일값이 0행이었지만, 본 판정은 문자열 동일성이 아니라 실제 차감 옵션 종류의 동일성으로 셌다.
6. 실외기 불일치 대표값 `AC060CS4PBH2SY` / `AC060CXAPBH1`을 실 `dc_config_db` 옵션 보유 46곳에 결합했다. 46곳 모두 4way 정액이 nonzero이므로 거래처 단위 불일치는 46건이다.

실 원본 시트 셀 읽기 결과 원문:

```text
{"range":"'싱글 구성품'!A143:N146","values":[
["무풍 4way 냉난방 프레스티지",15,"AC060CS4PBH2SY","세트","SET",3105300,null,1510000,1510000],
["무풍 4way 냉난방 프레스티지 실내기",15,"AC060CN4PBH1","실내기","대",638000,null,null,546000,0,null,"냉난방 4w 프레스티지","AC060CS4PBH2SY","기본"],
["무풍 4way 냉난방 프레스티지 실외기",15,"AC060CXAPBH1","실외기","대",1331000,null,null,820000,0,null,"냉난방 4w 프레스티지","AC060CS4PBH2SY","기본"],
["판넬 무풍4Way(WIFI)",null,"PC4NUFK1NW","판넬","EA",189200,0,128000,128000,0,null,null,"AC060CS4PBH2SY","기본"]]}
```

전수 선택기 비교 출력 원문:

```text
{
  "sourceRange": "'싱글 구성품'!A1:N1737",
  "totalRows": 1737,
  "componentRows": 1451,
  "indoorRows": 271,
  "optionSetIndoorRows": 100,
  "exactSetNameModelToken": 0,
  "selectorMismatches": 0,
  "mismatches": []
}
{
  "relevantIndoorOutdoorRows": 200,
  "byClass": {
    "실내기": { "rows": 100, "mismatches": 0 },
    "실외기": { "rows": 100, "mismatches": 65 }
  },
  "selectorMismatches": 65
}
```

실 DB 모수 확인 명령 및 출력 원문:

```text
docker exec samhan-postgres psql -U samhan -d dc_config_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT count(*) AS option_partner_count, count(*) FILTER (WHERE COALESCE(discount_4way_amount,0)<>0) AS fourway_partner_count FROM dc_configs WHERE NOT is_deleted AND (COALESCE(discount_360_amount,0)<>0 OR COALESCE(discount_4way_amount,0)<>0 OR COALESCE(discount_1way_amount,0)<>0 OR COALESCE(discount_stand_amount,0)<>0 OR COALESCE(discount_deluxe_amount,0)<>0 OR COALESCE(discount_first_grade_amount,0)<>0); COMMIT;"

BEGIN
 option_partner_count | fourway_partner_count
----------------------+-----------------------
                   46 |                    46
(1 row)

COMMIT
```

## 4. 어긋난 건수

**46건.** 집계 단위는 요청의 모수와 동일하게 “옵션 정액을 보유한 거래처 중 실 원본 카탈로그 불일치 경로가 존재하는 거래처 수”다.

보조 수치로, 실 시트의 옵션 세트 실내기·실외기 모델쌍 기준 선택 불일치는 65행이다.

## 5. 어긋난 실제 사례 목록

아래는 동일한 실 원본 시트 행을 각 거래처의 실 4way 설정과 결합한 읽기 전용 SQL 출력 원문이다. `modelToken=AC060CXAPBH1`은 현행 선택기에서 어떤 옵션도 고르지 않지만, 매칭 세트명 `AC060CS4PBH2SY`는 레거시에서 4way를 고른다.

```text
BEGIN
                   거래처                    |    set_name    | model_token  | 현행_차감 |   레거시_차감   | 금액_차이
---------------------------------------------+----------------+--------------+-----------+-----------------+-----------
 랜드유통(최경호)                            | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (30,000원) | 30,000원
 주식회사 중앙유통                           | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (70,000원) | 70,000원
 준공조-김준성대표님(구,와이케이공조)        | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (40,000원) | 40,000원
 환경시스템공조-김진혁대표님                 | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (50,000원) | 50,000원
 한마음컨테이너/삼성에어컨 119닥터           | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (30,000원) | 30,000원
 모범공조-정영화님                           | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (30,000원) | 30,000원
 (주)영에어시스템(권혜영)-법인사업자         | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (60,000원) | 60,000원
 리버시스템(김진원)                          | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (30,000원) | 30,000원
 (주)이지공조시스템-조현우                   | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (20,000원) | 20,000원
 현주시스템(전현주)                          | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (20,000원) | 20,000원
 (주)삼한공조시스템-테스트용                 | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (80,000원) | 80,000원
 (주)삼성에스에이씨비투비(더블유케이)        | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (20,000원) | 20,000원
 이앤공조-정종출                             | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (70,000원) | 70,000원
 주식회사 제이앤피공조                       | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (70,000원) | 70,000원
 에스엠하나공조(주)-하나비투비               | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (70,000원) | 70,000원
 디지털프라자 (주) 두정점 (김은경)           | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (50,000원) | 50,000원
 (주)태성공조-임헌배(태성코퍼레이션)         | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (50,000원) | 50,000원
 제일냉온상사                                | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (20,000원) | 20,000원
 효 시스템-임효예                            | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (40,000원) | 40,000원
 * 시스템에어컨솔루션                        | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (50,000원) | 50,000원
 우주공조시스템-조석현                       | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (30,000원) | 30,000원
 명성유통(조희선)                            | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (30,000원) | 30,000원
 세원종합ENG                                 | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (40,000원) | 40,000원
 설아에어컨(이근우)                          | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (40,000원) | 40,000원
 숲속바람에어컨-김진원(리버시스템)           | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (30,000원) | 30,000원
 대한공조-박동수                             | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (70,000원) | 70,000원
 씨유씨원공조-(와이케이공조다른)             | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (40,000원) | 40,000원
 * 태호종합건설-(N.Y)시스템에어컨            | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (20,000원) | 20,000원
 공기를디자인하는사람들 주식회사             | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (40,000원) | 40,000원
 (주)사계절솔루션(염은희)                    | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (30,000원) | 30,000원
 에어디자이너 주식회사                       | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (40,000원) | 40,000원
 구)주식회사 그레이프시스템(휴먼넷)          | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (50,000원) | 50,000원
 주식회사 도원시스템                         | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (20,000원) | 20,000원
 주식회사 예전(안기전)-캐리어에어컨 군포총판 | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (30,000원) | 30,000원
 이루다유통-이석주                           | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (70,000원) | 70,000원
 와이케이(YK)시스템 (윤권섭)                 | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (40,000원) | 40,000원
 (주)사온공조시스템                          | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (50,000원) | 50,000원
 주식회사오성공조                            | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (50,000원) | 50,000원
 편한공조시스템                              | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (50,000원) | 50,000원
 유현공조시스템-진용수                       | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (30,000원) | 30,000원
 다드림에어컨공조-이상훈                     | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (70,000원) | 70,000원
 주식회사 경인공조(강지원)                   | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (50,000원) | 50,000원
 *엘지휘센파란공조-김태훈님                  | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (50,000원) | 50,000원
 주식회사 제이시스템                         | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (60,000원) | 60,000원
 주식회사 더라인(최종진)                     | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (30,000원) | 30,000원
 후시스템(이유석)                            | AC060CS4PBH2SY | AC060CXAPBH1 | 없음(0원) | 4way (40,000원) | 40,000원
(46 rows)

COMMIT
```

## 6. 판정

**도달 가능한 결함이다.** 실 원본 시트에 `setName`과 집계 행 `modelToken`의 옵션 선택이 달라지는 완성 세트 구성품이 존재하고, 실 DB의 옵션 정액 보유 46곳 모두 그 대표 4way 경로에서 0원이 아닌 금액 차이를 가진다. 코드 수정은 하지 않았다.

## 7. 새로 만든 파일

- `docs/dev-reports/2026-08-02-1008-r2-setname-modeltoken-parity.md`
