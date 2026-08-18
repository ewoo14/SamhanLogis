# #896 일마감 프로그램 시트 소비 계약·영향 범위

- 분석일: 2026-08-08 (KST)
- 분석 범위: 저장소 `tools/legacy-gas/**`, `product_db`·`slip_db` 스키마 소스
- 수행 제한: Google Sheets·Apps Script 원격 접근 없음, DB 접근/쓰기 없음, Docker·git 명령 없음, 코드 수정 없음
- 인덱스 표기: 별도 언급이 없으면 JavaScript 배열 기준 **0-based 열 인덱스**다.

## 0. 결론

1. `일마감 프로그램`이 여는 시트 파일은 하나다. `SOURCE_SHEET_URL`은 ID `<SHEET_ID>`를 가리키며 두 로더가 모두 `openByUrl`로 연다.
2. 접근 탭은 정적 다섯 계열(`홈멀티`, `상업멀티`, `상업멀티 구성`, `싱글 세트`, `싱글 구성품`)과 각 `_단가인상` 후보, 그리고 **이름에 `구형`이 들어가는 모든 탭**이다.
3. 중복 `납품가` 계약은 하나가 아니다.
   - `loadSingleSetCatalog`: `싱글 구성품`의 **두 번째 `납품가`**를 세트 구성품 예상금액에 쓴다.
   - `loadPriceMap_`: 다섯 정적 계열과 모든 `구형` 탭의 **첫 번째 `납품가`**를 개별 품목 납품가에 쓴다.
   - 같은 `싱글 구성품` 탭이 두 로더에서 동시에 읽히므로 두 가격이 모두 일마감 결과에 영향을 준다.
4. 검증 대상은 재고가 아니다. 업로드한 엑셀의 전표 행을 `일자 + 번호`로 묶고, `단가(VAT포함)`을 시트 출고가·납품가 및 세트 구성품 가격 합계와 대조해 행별 `확인` 불리언을 만든다.
5. 불일치는 저장·처리를 차단하지 않는다. 결과표의 `확인=FALSE`로 표시되며 사용자가 TRUE/FALSE를 직접 바꾸고 필터·엑셀 저장할 수 있다.
6. 같은 스프레드시트 ID를 직접 여는 저장소 GAS 프로그램은 일마감 포함 5개다: `일마감 프로그램`, `거래처 발송 주문서`, `종합견적서`, `에어디자이너 전용 주문서 인식`, `제이시스템 전용 주문서 인식`.
7. `product_db`에는 모델, 출고가, 단일 납품가, 고정 할인율, 세트 구성 관계·구분·특징이 있으나, 일마감이 요구하는 **같은 싱글 구성품 행의 첫 번째 납품가와 두 번째 납품가를 동시에 표현하는 필드**, 특히 `(세트, 구성품)` 문맥의 두 번째 납품가는 현재 `bundle_component`에 없다.

## 1. 읽는 스프레드시트와 탭 전수

### 1.1 스프레드시트

`tools/legacy-gas/일마감 프로그램/Code.js:8`

> `const SOURCE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit';`
두 시트 로더가 동일 URL을 직접 연다.

`tools/legacy-gas/일마감 프로그램/Code.js:215-219`

> `function loadSingleSetCatalog(suffix) {`  
> `  Logger.log('🔗 구성품');`  
> `  var ss = SpreadsheetApp.openByUrl(SOURCE_SHEET_URL);`  
> `  var targetName = '싱글 구성품' + (suffix || '');`  
> `  var sh = ss.getSheetByName(targetName) || ss.getSheetByName('싱글 구성품');`

`tools/legacy-gas/일마감 프로그램/Code.js:270-275`

> `function loadPriceMap_(suffix) {`  
> `  Logger.log('📊 단가');`  
> `  var ss = SpreadsheetApp.openByUrl(SOURCE_SHEET_URL);`  
> `  var map = { 'OLD': {}, 'HOME_MULTI': {}, 'COMM_MULTI': {}, 'SINGLE': {}, 'UNKNOWN': {} };`  
> `  var allSheets = ss.getSheets();`

다른 `openById`, `openByUrl`, `getActiveSpreadsheet` 호출은 일마감 디렉터리에 없다. 따라서 저장소 코드로 확정되는 대상 스프레드시트는 위 한 개뿐이다.

### 1.2 탭 전수

| 탭/패턴 | 선택 방식 | 헤더 행 | 데이터 시작 | 근거 |
|---|---|---:|---:|---|
| `싱글 구성품{suffix}` | 우선 선택, 없으면 무접미사 `싱글 구성품` | 2행 | 3행 | `Code.js:218-222,237` |
| 이름에 `구형` 포함인 **모든 탭** | `getSheets()` 전수 후 `sn.indexOf('구형') > -1` | 3행 | 4행 | `Code.js:275-281,290` |
| `홈멀티{suffix}` | 없으면 무접미사 | 3행 | 4행 | `Code.js:304,312,316,326` |
| `상업멀티{suffix}` | 없으면 무접미사 | 3행 | 4행 | `Code.js:305,312,316,326` |
| `상업멀티 구성{suffix}` | 없으면 무접미사 | 1행 | 2행 | `Code.js:306,312,316,326` |
| `싱글 세트{suffix}` | 없으면 무접미사 | 3행 | 4행 | `Code.js:307,312,316,326` |
| `싱글 구성품{suffix}` | 없으면 무접미사 | 2행 | 3행 | `Code.js:308,312,316,326` |

정적 다섯 탭 선언과 fallback 원문은 다음과 같다.

`tools/legacy-gas/일마감 프로그램/Code.js:302-316`

> `var suf = suffix || '';`  
> `var sInfo = [`  
> `  { n: '홈멀티' + suf, r: 3, z: 'HOME_MULTI' },`  
> `  { n: '상업멀티' + suf, r: 3, z: 'COMM_MULTI' },`  
> `  { n: '상업멀티 구성' + suf, r: 1, z: 'COMM_MULTI' },`  
> `  { n: '싱글 세트' + suf, r: 3, z: 'SINGLE' },`  
> `  { n: '싱글 구성품' + suf, r: 2, z: 'SINGLE' }`  
> `];`  
> `...`  
> `var sh = ss.getSheetByName(info.n) || ss.getSheetByName(info.n.replace(suf, ''));`  
> `if (!sh) continue;`  
> `var data = sh.getDataRange().getValues();`  
> `if (data.length < info.r) continue;`  
> `var heads = data[info.r - 1].map(function(h) { return String(h || '').replace(/\s+/g, '').toLowerCase(); });`

`구형`은 탭명이 코드에 열거되지 않는다.

`tools/legacy-gas/일마감 프로그램/Code.js:275-281`

> `var allSheets = ss.getSheets();`  
> `allSheets.forEach(function(sh) {`  
> `  var sn = sh.getName();`  
> `  if (sn.indexOf('구형') > -1) {`  
> `    var data = sh.getDataRange().getValues();`  
> `    if (data.length < 4) return;`  
> `    var heads = data[2].map(function(h) { return String(h || '').replace(/\s+/g, '').toLowerCase(); });`

따라서 실제 파일에 `구형`, `구형_단가인상`, `신규구형목록` 같은 이름이 있으면 모두 대상이다. 저장소 코드만으로 실제 탭 목록과 순서는 **모른다**. 원격 시트 메타데이터가 있어야 확정할 수 있다.

### 1.3 `suffix`의 출처·값·결정자

`suffix`는 사용자가 문자열을 입력하는 값이 아니다. 브라우저가 업로드한 엑셀을 `ecountData`로 만들고, 사용자가 `인상 전 적용` 토글을 조작한 상태와 함께 서버 `processDailyData`에 넘긴다.

`tools/legacy-gas/일마감 프로그램/Index.html:852-875`

> `let raw = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {range: 1});`  
> `...`  
> `ecountData = raw.filter(r => r['번호'] && !String(r['품목명']).includes('합계') && !String(r['품목명']).includes('총계'));`

`tools/legacy-gas/일마감 프로그램/Index.html:232-258`

> `let isMultiApplied = false;`  
> `let isBeforeHike = false;`  
> `...`  
> `isBeforeHike = !isBeforeHike;`  
> `...`  
> `btn.innerText = '인상 전 적용(ON)';`  
> `...`  
> `runProcess(true);`

`tools/legacy-gas/일마감 프로그램/Index.html:901-968`

> `google.script.run`  
> `...`  
> `}).processDailyData(ecountData, isMultiApplied, isBeforeHike);`

서버 결정 규칙은 다음과 같다.

`tools/legacy-gas/일마감 프로그램/Code.js:420-442`

> `function processDailyData(ecountData, isMultiApplied, isBeforeHike) {`  
> `...`  
> `var suffix = '';`  
> `if (ecountData && ecountData.length > 0 && !isBeforeHike) {`  
> `  for (var i = 0; i < Math.min(ecountData.length, 5); i++) {`  
> `    var rawDate = String(ecountData[i]['일자'] || '').trim();`  
> `...`  
> `    if (dateNum > 0) {`  
> `      if (dateNum >= 20260701) suffix = '_단가인상';`  
> `      break;`  
> `    }`  
> `  }`  
> `}`

확정되는 값은 두 개뿐이다.

| 조건 | `suffix` |
|---|---|
| `isBeforeHike === true` | `''` |
| 토글 OFF이고 업로드 선두 최대 5행 중 첫 파싱 가능 일자가 `2026-07-01` 이상 | `'_단가인상'` |
| 토글 OFF이고 첫 파싱 가능 일자가 그 이전이거나 5행 모두 파싱 불가 | `''` |

누가 정하는가: 사용자는 `인상 전 적용` 토글로 날짜 자동판정을 무효화할 수 있고, 그 외에는 코드가 업로드 엑셀의 선두 최대 5행 중 첫 파싱 가능 `일자`로 정한다.

### 1.4 실제 운영에서 접미사 탭과 무접미사 탭 중 무엇이 쓰이는가

**모른다.** 코드상 선택 규칙은 확정되지만, 실제 운영 업로드 일자·토글 상태·원격 탭 존재 여부가 저장소에 없다. 또한 접미사 탭이 없으면 무접미사로 자동 fallback한다(`Code.js:219,312`). 운영 실행 로그, 업로드 표본, 원격 탭 목록이 있어야 실제 선택 빈도를 확정할 수 있다.

## 2. 탭·열 계약표

### 2.1 헤더 정규화 공통 규칙

- `loadSingleSetCatalog`: 2행 헤더를 문자열화하고 trim한 뒤 **모든 공백을 제거**한다(`Code.js:221-222`). 대소문자는 보존한다.
- `loadPriceMap_`: 지정 헤더 행을 문자열화하고 **모든 공백 제거 + 소문자화**한다(`Code.js:281,316`).
- `indexOf`는 첫 일치만 반환한다. 따라서 별도 중복 처리 코드가 없는 헤더는 모두 첫 번째 일치다.

### 2.2 전수 계약

| 탭 | 헤더 | 선택 인덱스 | 읽는 곳 | 쓰임 |
|---|---|---|---|---|
| `싱글 구성품{suffix}` — `loadSingleSetCatalog` | `모델명` | 첫 정확 일치 `header.indexOf` | `Code.js:222-224,237-240` | 모델 토큰, 구성품 키 |
| 같음 | `세트` 또는 `/^Set/i` | `findIndex` 첫 일치 | `Code.js:225,242,256-263` | 세트→구성품, 실내기→세트 관계 |
| 같음 | `구분` | 첫 정확 일치 | `Code.js:226,245-252` | `INDOOR/OUTDOOR/PANEL/REMOTE/MATERIAL` 분류; 없으면 모델 토큰 분류 |
| 같음 | 헤더에 `납품가` 포함 | **두 번째 일치**; 1개면 첫 일치; 0개면 인덱스 8 | `Code.js:227-231,243,258` | 구성품 행 `price`; 싱글 세트 예상 구성 합계 |
| 이름에 `구형` 포함인 모든 탭 | `모델명` | 첫 정확 일치 | `Code.js:281-282,289-295` | `OLD` 가격맵 키 |
| 같음 | `품명` | 첫 정확 일치 | `Code.js:283,295` | 이름 보조값 `nm` |
| 같음 | `출고가` | 첫 정확 일치; 없으면 첫 `납품가` | `Code.js:284-287,292,295` | 할인 기준 `price` |
| 같음 | `납품가` | **첫 정확 일치** | `Code.js:285,293,295` | 개별 비교용 `deliveryPrice` |
| `홈멀티{suffix}` | `모델명` | 첫 정확 일치 | `Code.js:304,317,325-339` | `HOME_MULTI`·`UNKNOWN` 키 |
| 같음 | `품명` | 첫 정확 일치 | `Code.js:318,328,337,345-347` | `UNKNOWN` 이름 키와 `nm` |
| 같음 | `출고가` | 첫 정확 일치; 없으면 첫 `납품가` | `Code.js:319,323,329,336-337` | 할인 기준 `price` |
| 같음 | `납품가` | **첫 정확 일치** | `Code.js:320,330,337-343` | 개별 비교용 `deliveryPrice` |
| 같음 | `고정dc` | 첫 정확 일치 | `Code.js:321,331-337` | 멀티 기대 할인율 우선값 |
| `상업멀티{suffix}` | `모델명`, `품명`, `출고가`, `납품가`, `고정dc` | 각각 첫 정확 일치; 출고가만 없으면 첫 납품가 fallback | `Code.js:305,317-337` | `COMM_MULTI` 가격·납품가·고정DC·이름 키 |
| `상업멀티 구성{suffix}` | 위와 동일 | 위와 동일 | `Code.js:306,317-337` | 같은 `COMM_MULTI`/`UNKNOWN` 맵에 합류 |
| `싱글 세트{suffix}` | 위와 동일 | 위와 동일 | `Code.js:307,317-337` | `SINGLE` 가격·납품가·고정DC·이름 키 |
| `싱글 구성품{suffix}` — `loadPriceMap_` | 위와 동일 | 위와 동일, 즉 `납품가`는 **첫 번째** | `Code.js:308,317-337` | `SINGLE`/`UNKNOWN` 개별 가격맵 |

`loadSingleSetCatalog`의 중복 `납품가` 원문:

`tools/legacy-gas/일마감 프로그램/Code.js:224-243`

> `var mIdx = header.indexOf('모델명');`  
> `var sIdx = header.findIndex(function(h) { return /^세트$|^Set/i.test(h); });`  
> `var cIdx = header.indexOf('구분');`  
> `var pCols = [];`  
> `for (var i = 0; i < header.length; i++) {`  
> `  if (header[i].indexOf('납품가') > -1) pCols.push(i);`  
> `}`  
> `var pIdx = pCols.length > 1 ? pCols[1] : (pCols[0] || 8);`  
> `...`  
> `var setName = String(data[i][sIdx] || '').trim();`  
> `var price = money_to_int_(data[i][pIdx]);`

주의: `(pCols[0] || 8)`이므로 `납품가`가 유일하면서 0번 열이면 0이 falsy라 8번 열을 택한다. 현재 원격 헤더 위치가 0인지 여부는 저장소 코드만으로 모른다.

`loadPriceMap_`의 첫 `납품가` 원문:

`tools/legacy-gas/일마감 프로그램/Code.js:317-337`

> `var mIdx = heads.indexOf('모델명');`  
> `var nmIdx = heads.indexOf('품명');`  
> `var pIdx = heads.indexOf('출고가');`  
> `var dIdx = heads.indexOf('납품가');`  
> `var fIdx = heads.indexOf('고정dc');`  
> `if (pIdx === -1 && dIdx > -1) pIdx = dIdx;`  
> `...`  
> `var price = money_to_int_(data[j][pIdx]);`  
> `var delivery = dIdx > -1 ? money_to_int_(data[j][dIdx]) : 0;`  
> `...`  
> `var obj = { price: price, deliveryPrice: delivery, fixedDc: fixedDc, nm: nmStr };`

### 2.3 `납품가`가 여러 개일 때 경로별 전수 판정

`일마감 프로그램/Code.js`의 `납품가` 검색은 `:229`, `:285`, `:320` 세 곳뿐이다.

| 경로 | 대상 | 선택 |
|---|---|---|
| `loadSingleSetCatalog` | `싱글 구성품{suffix}` | 헤더에 `납품가`가 포함된 열 중 **두 번째** (`:227-231`) |
| `loadPriceMap_` 구형 루프 | 이름에 `구형` 포함인 모든 탭 | `heads.indexOf('납품가')`, 즉 **첫 번째 정확 일치** (`:281-285`) |
| `loadPriceMap_` 정적 다섯 탭 | 홈/상업/상업 구성/싱글 세트/싱글 구성품 | `heads.indexOf('납품가')`, 즉 **첫 번째 정확 일치** (`:316-320`) |

위 세 경로 외에는 시트 `납품가`를 읽는 코드가 없다. `Index.html`의 `출고가`는 서버가 만든 결과 열을 표시·편집하는 것이며 시트 접근이 아니다.

### 2.4 같은 모델 중복 시 맵 병합 계약

정적 다섯 탭은 같은 zone/model의 첫 객체를 유지하고, 뒤 행에서는 양수 `deliveryPrice`만 기존 객체에 덮는다.

`tools/legacy-gas/일마감 프로그램/Code.js:336-347`

> `if (price > 0) {`  
> `  var obj = { price: price, deliveryPrice: delivery, fixedDc: fixedDc, nm: nmStr };`  
> `  if (mStr) {`  
> `    if (!map[info.z][mStr]) map[info.z][mStr] = obj;`  
> `    else if (delivery > 0) map[info.z][mStr].deliveryPrice = delivery;`  
> `...`  
> `  if (nmStr) {`  
> `    if (!map['UNKNOWN'][nmStr]) map['UNKNOWN'][nmStr] = obj;`  
> `    else if (delivery > 0) map['UNKNOWN'][nmStr].deliveryPrice = delivery;`

따라서 앞 탭의 출고가·고정DC는 유지되면서 뒤 탭의 납품가만 섞일 수 있다. `상업멀티` 뒤에 `상업멀티 구성`, `싱글 세트` 뒤에 `싱글 구성품` 순서라는 점이 중요하다(`Code.js:303-308`). 실제 동일 모델 중복과 값 차이는 원격 데이터를 보지 않았으므로 모른다.

`구형`은 `map['OLD'][mStr] = ...`로 매번 대입한다(`Code.js:295`). 여러 `구형` 탭·행에 같은 모델이 있으면 `getSheets()` 순서상 뒤 값이 이기지만 실제 탭 순서는 저장소에서 모른다.

## 3. 무엇을 검증하는가

### 3.1 입력과 대조 축

업로드 데이터의 서버 계약은 다음 17개 열이다.

`tools/legacy-gas/일마감 프로그램/Code.js:10-14`

> `const FINAL_HEADERS = [`  
> `  'DC','일자','번호','창고명','품목명','수량','단가(VAT포함)','공급가액','부가세','합계',`  
> `  '거래처명','거래처코드','출고가','할인율','총계','확인','회계반영일자'`  
> `];`

행은 `일자 + '_' + 번호`로 전표 그룹화된다.

`tools/legacy-gas/일마감 프로그램/Code.js:473-477`

> `var invoiceGroups = {};`  
> `ecountDataMapped.forEach(function(row) {`  
> `  var key = row['일자'] + '_' + row['번호'];`  
> `  if (!invoiceGroups[key]) invoiceGroups[key] = [];`  
> `  invoiceGroups[key].push(row);`  
> `});`

시트 출고가와 업로드 VAT 포함 단가로 할인율을 계산하고, 첫 `납품가`를 별도 보관한다.

`tools/legacy-gas/일마감 프로그램/Code.js:543-561`

> `if (!pData) pData = priceMap[searchZone] && priceMap[searchZone][t];`  
> `if (!pData) pData = priceMap['UNKNOWN'][t];`  
> `if (!pData) pData = { price: 0, deliveryPrice: 0, fixedDc: null };`  
> `...`  
> `var price = pData.price;`  
> `var delivery = pData.deliveryPrice || price;`  
> `var unit = money_to_int_(item['단가(VAT포함)']);`  
> `var qty = money_to_int_(item['수량']);`  
> `item['출고가'] = price;`  
> `item._deliveryPrice = delivery;`  
> `...`  
> `var rate = price ? (1 - (unit / price)) : 0;`  
> `item['할인율'] = rate;`  
> `item['총계'] = unit * qty;`

### 3.2 싱글 세트 검증

싱글 품목은 `수량`만큼 pool에 복제되고(`Code.js:568-583`), `싱글 구성품`의 세트 관계로 실내기·실외기와 선택 부품을 맞춘다. 예상금액은 **두 번째 `납품가`**인 `rc.price` 합계에서 Notion 거래처 할인액을 뺀 값이고, 실제금액은 업로드 `단가(VAT포함)` 합계다.

`tools/legacy-gas/일마감 프로그램/Code.js:585-615`

> `var indoors = pool.filter(function(p) { return !p.used && p.class === 'INDOOR'; });`  
> `...`  
> `var reqComps = catalog.setToComps[setName];`  
> `var reqOut = reqComps.find(function(rc) { return rc.class === 'OUTDOOR'; });`  
> `...`  
> `var expectedPriceSum = reqComps.find(function(rc) { return rc.class === 'INDOOR' && rc.token === ind.token; }).price + reqOut.price;`  
> `...`  
> `expectedPriceSum += rc.price;`

`tools/legacy-gas/일마감 프로그램/Code.js:650-657`

> `var finalExpectedPrice = expectedPriceSum - discount;`  
> `var invoicePriceSum = 0;`  
> `matchedPoolIdxs.forEach(function(idx) { invoicePriceSum += pool[idx].unitPrice; });`  
> `if (Math.abs(invoicePriceSum) === Math.abs(finalExpectedPrice)) {`  
> `  matchedPoolIdxs.forEach(function(idx) { pool[idx].used = true; });`  
> `  break;`  
> `}`

따라서 단순히 전표 총액과 하나의 시트 단가를 비교하는 것이 아니다. 세트 구성 조합을 찾은 뒤 구성품별 VAT 포함 단가 합계와 시트 구성품 가격 합계(거래처별 정액 할인 반영)를 정확 일치 비교한다. 수량은 재고 대조가 아니라 전표 행 복제·금액 합계용이다.

### 3.3 구형·부자재·멀티 검증

| 분기 | 검증 | 근거 |
|---|---|---|
| `운임`, `절삭` | 무조건 TRUE | `Code.js:668-670` |
| 구형, 멀티 할인율 미적용 | TRUE | `Code.js:671-674` |
| 구형 `AM/NJ/NS/AVX` | 업로드 단가/시트 출고가 할인율이 정확히 50% | `Code.js:675-680` |
| 그 외 구형 | 업로드 `단가(VAT포함)` = 첫 `납품가`(없으면 출고가) | `Code.js:679-681` |
| 유연호스·발통세트·일자발·방진가대·`AXJ` | 할인 적용 시 업로드 단가 = 첫 `납품가`(없으면 출고가) | `Code.js:683-689` |
| 싱글 주기기 | 위 세트 매칭에 사용된 수량 전체가 성공했는지 | `Code.js:690-710` |
| 싱글 옵션 | 세트에 소비됐으면 TRUE; 주기기 실패면 FALSE; 그 외 업로드 단가 = 첫 납품가 | `Code.js:691-708` |
| 홈/상업 멀티 | 실제 할인율 = `고정dc`, 없으면 Notion 거래처별 홈/상업 DC, 없으면 45% | `Code.js:714-731` |
| 그 외 | 무조건 TRUE | `Code.js:733-735` |

멀티 할인율 원문:

`tools/legacy-gas/일마감 프로그램/Code.js:718-731`

> `var actualRate = Math.round((item['할인율'] || 0) * 100);`  
> `var expectRate = null;`  
> `if (item._fixedDc != null) {`  
> `  expectRate = Math.round(item._fixedDc * 100);`  
> `} else if (item._zone === 'COMM_MULTI') {`  
> `  expectRate = Math.round((discInfo.commRate || 0.45) * 100);`  
> `} else if (item._zone === 'HOME_MULTI') {`  
> `  expectRate = Math.round((discInfo.homeRate || 0.45) * 100);`  
> `...`  
> `item['확인'] = (actualRate === expectRate);`

### 3.4 불일치 결과: 경고·차단·리포트 중 무엇인가

불일치는 `item['확인'] = false`일 뿐 서버 처리를 중단하지 않는다. 성공 응답에는 전체 행이 그대로 포함된다.

`tools/legacy-gas/일마감 프로그램/Code.js:737-747`

> `if (datePattern.test(String(item['회계반영일자']).trim())) pre.push(item);`  
> `else main.push(item);`  
> `...`  
> `return { status: 'success', main: main, pre: pre, sum: main.concat(pre) };`  
> `...`  
> `return { status: 'error', message: String(e) };`

화면에서는 `확인`을 선택 상자로 보여 사용자가 직접 변경할 수 있다.

`tools/legacy-gas/일마감 프로그램/Index.html:1126-1132`

> `} else if (col === '확인') {`  
> `  html += \`<td ...><select class="edit-select" onchange="updateVal(...)"\>`  
> `            <option value="TRUE" ${d[col] ? 'selected' : ''}>TRUE</option>`  
> `            <option value="FALSE" ${!d[col] ? 'selected' : ''}>FALSE</option>`

`확인` 열은 TRUE/FALSE 필터 대상이다(`Index.html:1402-1409,1479-1484`). 결과는 화면·자동저장·엑셀 내보내기의 리포트 성격이며, FALSE 자체에 대한 차단·alert 코드는 없다. alert는 서버 오류일 때만 발생한다.

`tools/legacy-gas/일마감 프로그램/Index.html:944-968`

> `renderAll();`  
> `document.getElementById('file_status').innerText = '처리 완료!';`  
> `...`  
> `google.script.run.autoSaveToNotion(...)`  
> `} else {`  
> `  alert('오류: ' + res.message);`  
> `}`

### 3.5 `product_db`와 겹치는 축

`product_db.products`에는 이름·모델, 출고가, 단일 납품가, 분류, 고정 할인율이 있다.

`services/product-service/src/main/resources/db/migration/V1__init_product_service.sql:32-38`

> `CREATE TABLE products (`  
> `  id UUID PRIMARY KEY,`  
> `  name VARCHAR(150) NOT NULL,`  
> `  model_name VARCHAR(100) NOT NULL,`  
> `...`  
> `  selling_price NUMERIC(15,2) NOT NULL,`  
> `  purchase_price NUMERIC(15,2) NOT NULL,`

`services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:17-34`

> `ADD COLUMN model_code VARCHAR(64),`  
> `ADD COLUMN product_type VARCHAR(16) NOT NULL DEFAULT 'SINGLE',`  
> `...`  
> `ADD COLUMN fixed_discount_rate NUMERIC(5,4) NULL,`  
> `...`  
> `ADD COLUMN release_price NUMERIC(12,2) NOT NULL DEFAULT 0,`  
> `ADD COLUMN delivery_price NUMERIC(12,2) NOT NULL DEFAULT 0,`  
> `...`  
> `ADD COLUMN product_category VARCHAR(20) NULL,`  
> `...`  
> `ADD COLUMN parent_bundle_set_model VARCHAR(64) NULL`

세트·구성품 축도 겹친다.

`services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:75-96`

> `CREATE TABLE bundle_component (`  
> `  bundle_product_id UUID NOT NULL REFERENCES products(id),`  
> `  component_product_code VARCHAR(64) NOT NULL,`  
> `  default_qty NUMERIC(5,2) NOT NULL DEFAULT 1,`  
> `  qty_mode VARCHAR(16) NOT NULL DEFAULT 'FIXED',`  
> `  component_kind VARCHAR(16) NOT NULL DEFAULT 'ACCESSORY',`  
> `  component_variant VARCHAR(64) NULL,`  
> `  is_default BOOLEAN NOT NULL DEFAULT FALSE,`  
> `  spec_text VARCHAR(255) NULL,`

겹치는 축은 다음과 같다.

| 일마감/시트 축 | `product_db` 축 | 판정 |
|---|---|---|
| `모델명` | `products.model_name`, `model_code` | 겹침 |
| `품명` | `products.name` | 겹침 |
| `출고가` | `products.release_price`, `price_history.release_price` | 겹침 |
| 첫 `납품가` | `products.delivery_price`, `price_history.delivery_price` | 겹침. 어느 시트 열이 DB에 적재됐는지는 이 코드만으로 모름 |
| `고정dc` | `products.fixed_discount_rate` | 겹침. DB는 V20에서 0~100 퍼센트 스케일로 변환됐고 일마감은 0~1 비율을 기대하므로 API 변환 필요 |
| `세트` 관계 | `bundle_component.bundle_product_id` + `component_product_code` | 겹침 |
| `구분` | `bundle_component.component_kind` | 겹침 |
| 구성품 수량 | `bundle_component.default_qty` | DB에는 있으나 일마감 시트 로더는 시트 `수량`을 읽지 않고 반복 행을 각각 하나로 취급 |
| 두 번째 `납품가` | 대응 열 없음 | **현재 스키마에서 직접 표현되지 않음** |

가격 이력은 일자별 단일 출고가·납품가만 가진다.

`services/product-service/src/main/resources/db/migration/V3__migration_extension.sql:52-70`

> `CREATE TABLE price_history (`  
> `  product_id UUID NOT NULL REFERENCES products(id),`  
> `  effective_date DATE NOT NULL,`  
> `  release_price NUMERIC(12,2) NOT NULL,`  
> `  delivery_price NUMERIC(12,2) NOT NULL,`  
> `...`  
> `CONSTRAINT uq_ph_product_date UNIQUE (product_id, effective_date)`

따라서 `_단가인상` 날짜 분기는 표현할 기반이 있지만, 같은 날짜·모델의 첫/두 번째 `납품가`를 동시에 보존하지는 못한다.

### 3.6 `slip_db`와 겹치는 축

업로드 엑셀은 현재 `slip_db`를 읽지 않지만 데이터 축은 겹친다.

`services/slip-service/src/main/resources/db/migration/V1__init_slip_service.sql:16-28`

> `CREATE TABLE slips (`  
> `  slip_no VARCHAR(30) NOT NULL,`  
> `  slip_date DATE NOT NULL,`  
> `  seq_no INT NOT NULL,`  
> `...`  
> `  partner_name VARCHAR(100),`  
> `  source_warehouse_id UUID,`

`services/slip-service/src/main/resources/db/migration/V1__init_slip_service.sql:69-78`

> `CREATE TABLE slip_lines (`  
> `  slip_id UUID NOT NULL REFERENCES slips(id),`  
> `  product_id UUID NOT NULL,`  
> `  product_name VARCHAR(200) NOT NULL,`  
> `  model_name VARCHAR(100),`  
> `  quantity INT NOT NULL CHECK (quantity > 0),`  
> `  unit_price NUMERIC(15,2) NOT NULL CHECK (unit_price >= 0),`  
> `  line_total NUMERIC(17,2) NOT NULL CHECK (line_total >= 0),`

`services/slip-service/src/main/resources/db/migration/V12__add_ecount_slipline_fields.sql:3-18`

> `* unit_price_with_vat — VAT 포함 단가 (unit_price * 1.1)`  
> `* supply_amount — 공급가액 (unit_price * quantity)`  
> `* vat_amount — 부가세 (supply_amount * 0.1)`  
> `...`  
> `ALTER TABLE slip_lines ADD COLUMN unit_price_with_vat NUMERIC(15,2);`  
> `ALTER TABLE slip_lines ADD COLUMN supply_amount NUMERIC(17,2);`  
> `ALTER TABLE slip_lines ADD COLUMN vat_amount NUMERIC(15,2);`

`services/slip-service/src/main/resources/db/migration/V15__add_slip_partner_code_region.sql:33-37`

> `ADD COLUMN partner_code VARCHAR(50),`  
> `...`  
> `'PR-E1 거래처코드 snapshot ...'`

| 업로드 열 | `slip_db` 후보 축 | 판정 |
|---|---|---|
| `일자`, `번호` | `slips.slip_date`, `slip_no`, `seq_no` | 개념상 겹침. 업로드 `번호`가 어느 DB 필드와 1:1인지 현재 일마감 코드에는 매핑이 없어 모름 |
| `품목명` | `slip_lines.product_name`, `model_name` | 겹침. 일마감은 품목명 문자열에서 모델 토큰을 추출함 |
| `수량` | `slip_lines.quantity` | 겹침 |
| `단가(VAT포함)` | `slip_lines.unit_price_with_vat` | 직접 겹침 |
| `공급가액`, `부가세`, `합계` | `supply_amount`, `vat_amount`, `line_total` | 겹침. `합계`와 `line_total`의 VAT 포함 여부가 같은지는 일마감 코드만으로 모름 |
| `거래처명`, `거래처코드` | `slips.partner_name`, `partner_code` | 겹침 |
| `창고명` | warehouse UUID 및 `destination_warehouse_name` 후보 | 개념상 겹치지만 업로드 창고명이 source/destination 중 어느 것인지 모름 |

`slip_lines`는 어느 단가가 권위인지 별도 필드로 구분한다.

`services/slip-service/src/main/resources/db/migration/V59__add_slip_line_unit_price_domain.sql:12-18`

> `'VAT_INCLUSIVE' — unit_price_with_vat 가 이 라인의 VAT 포함 단가다`  
> `'SUPPLY' — unit_price 가 이 라인의 VAT 제외 공급 단가다.`  
> `NULL — legacy. ... 어느 쪽이 권위인지 알 수 없다.`

따라서 DB 전표를 직접 검증 입력으로 쓸 경우 `unit_price_domain`까지 존중해야 한다. 현재 일마감은 DB를 조회하지 않고 업로드 엑셀만 권위 입력으로 쓴다.

## 4. 이관 시 위험과 DB 대체 요건

### 4.1 시트 접근을 끊을 때 죽거나 조용히 틀릴 기능

1. **전체 처리 오류**: 스프레드시트 URL 자체 접근이 실패하면 두 로더에서 예외가 발생해 `processDailyData`가 `status:error`를 반환하고 UI가 오류 alert를 띄운다(`Code.js:217,272,745-747`; `Index.html:961-968`).
2. **싱글 세트 구성 검증 오류**: `싱글 구성품` 탭이 없으면 `loadSingleSetCatalog`는 `null`을 반환한다(`Code.js:219-220`). 이후 싱글 실내기가 있으면 null guard 없이 `catalog.indoorToSets`를 읽는다.

   `tools/legacy-gas/일마감 프로그램/Code.js:585-588`

   > `var indoors = pool.filter(function(p) { return !p.used && p.class === 'INDOOR'; });`  
   > `indoors.forEach(function(ind) {`  
   > `  var cands = catalog.indoorToSets[ind.token] || [];`

   이 경우 예외로 전체 처리 실패가 가능하다. 싱글 실내기가 없는 업로드에서는 이 줄에 도달하지 않아 조용히 통과할 수 있다.
3. **개별 가격 검증의 조용한 오염**: 정적 탭이 없으면 `continue`한다(`Code.js:312-313`). 가격을 못 찾은 품목은 `{price:0, deliveryPrice:0}`으로 대체된다(`Code.js:543-545`). 이때 분기에 따라 FALSE가 늘거나, 기본 `else`·`isMultiApplied === false` 경로에서 TRUE가 되어 시트 누락이 가려질 수 있다.
4. **싱글 세트 합계 검증 소실**: 두 번째 `납품가`, 세트 관계, 구분이 없으면 실내기/실외기/옵션 조합과 예상 합계를 만들 수 없다(`Code.js:224-266,585-657`).
5. **구형·부자재 개별 납품가 검증 소실**: 첫 `납품가`가 없으면 업로드 단가와 납품가를 비교할 수 없다(`Code.js:679-689`).
6. **홈/상업 멀티 할인율 검증 소실**: 출고가가 없으면 실제 할인율 계산 분모가 0이 되고, `고정dc`가 없으면 행별 오버라이드를 잃는다(`Code.js:551-560,721-731`).
7. **가격 시점 전환 소실**: `2026-07-01`과 `인상 전 적용` 토글에 따른 접미사 선택 및 fallback을 DB 유효일 가격 조회로 동일하게 재현하지 않으면 과거/인상 가격이 바뀐다(`Code.js:423-442,302-312`).
8. **맵 충돌 순서 변경**: 현재는 탭/행 순서에 따라 첫 출고가·고정DC를 유지하면서 뒤의 양수 납품가만 덮는다. DB 단일 행로 평탄화하면 이 비대칭 병합 결과가 달라질 수 있다(`Code.js:336-347`).
9. **`구형` 범위 축소 위험**: 현재 계약은 정확히 `구형` 한 탭이 아니라 이름에 `구형`이 포함된 모든 탭이다. 한 테이블/카테고리로 옮길 때 원격 실제 목록을 모르면 일부가 빠질 수 있다(`Code.js:275-300`).

### 4.2 일마감이 DB를 대신 보게 하려면 필요한 것

1. Apps Script에서 접근 가능한 읽기 API 또는 일마감 자체의 서버 이전. GAS가 `product_db`에 직접 접속하는 코드는 없으므로, 인증·권한·네트워크·장애 계약이 있는 HTTP API가 필요하다.
2. 모델/품명 조회: 일마감의 토큰 정규화와 `OLD → 액세서리 이름 부분검색 → zone 모델 → UNKNOWN 모델` 우선순위를 재현해야 한다(`Code.js:519-545`).
3. 현재가·과거가 조회: 업로드 첫 유효일자와 `인상 전 적용` 토글을 `price_history.effective_date`에 매핑하고, 접미사 탭 부재 시 무접미사 fallback과 동일한 정책을 정해야 한다.
4. **두 납품가 모두 보존**:
   - 모델/개별 비교용 첫 `납품가`.
   - `(세트, 구성품 행)` 예상합계용 두 번째 `납품가`.
   현재 `products.delivery_price`와 `price_history.delivery_price`는 모델·일자당 하나이고 `bundle_component`에는 가격 열이 없다. 적어도 구성 관계 가격 오버라이드(및 유효기간)가 추가로 필요하거나, 두 값이 항상 같다는 전수 증거가 필요하다.
5. 세트 관계와 분류: 세트 모델, 구성품 모델, 구성품 순수 반복/수량, `component_kind`; 일마감은 시트 `수량`을 읽지 않고 행을 하나씩 pool에 넣으므로 DB `default_qty`와의 변환 규칙을 명시해야 한다.
6. `고정dc` 스케일 변환: 일마감은 `fixedDc * 100`을 기대하지만 DB V20 이후 값은 0~100이다. API에서 0~1로 내리거나 일마감 계산을 바꾸지 않으면 45가 4500%가 된다.
7. 구형 집합 식별: 이름에 `구형`이 들어가는 모든 탭이 어떤 DB `product_category`/이력 행으로 대응하는지 원격 탭 목록을 먼저 확정해야 한다.
8. 누락을 조용히 0으로 바꾸지 않는 실패 계약: 필수 카탈로그/가격이 비면 명시 오류·누락 목록을 반환해야 한다. 현재처럼 일부 탭 누락을 `continue`하면 이관 결함이 FALSE 또는 TRUE로 섞인다.
9. 회귀 테스트: 동일 업로드 표본에 대해 행별 `출고가`, `_deliveryPrice`, `할인율`, `확인`과 전표 그룹별 세트 매칭 결과를 시트판/DB판으로 대조해야 한다. 총액 하나만 비교하면 두 `납품가` 분기 차이를 잡지 못한다.

### 4.3 DB에 현재 없다고 코드로 확정되는 최소 데이터

| 필요 데이터 | 현재 상태 |
|---|---|
| 같은 모델의 첫 `납품가`와 두 번째 `납품가` 동시 보존 | `products`/`price_history`는 `delivery_price` 1개뿐 |
| `(세트, 구성품)` 문맥의 예상합계 가격 | `bundle_component`에 가격 열 없음 |
| 위 문맥 가격의 유효일 | `bundle_component`에 유효기간/가격 이력 없음 |
| 원격에서 이름에 `구형`이 포함된 실제 탭 목록·순서 | 저장소에 없음 |
| 운영에서 실제 선택된 suffix/토글 이력 | 저장소에 없음 |

## 5. 같은 스프레드시트·탭의 다른 GAS 소비자 전수

### 5.1 검색 방법과 결과 집합

`tools/legacy-gas` 아래 `.js`, `.html`, `.json`을 대상으로 다음을 전수 검색했다.

- 정확 ID: `<SHEET_ID>`
- 탭 문자열: `싱글 구성품`, `싱글 세트`, `홈멀티`, `상업멀티`, `상업멀티 구성`, `구형`, `단가인상`
- 호출: `SpreadsheetApp.openById(`, `SpreadsheetApp.openByUrl(`

정확 ID가 나온 파일은 다음 다섯 개뿐이다.

| 프로그램 | ID 근거 |
|---|---|
| 일마감 프로그램 | `일마감 프로그램/Code.js:8` |
| 거래처 발송 주문서 | `거래처 발송 주문서/Code.js:71` |
| 종합견적서 | `종합견적서/Code.js:49` |
| 에어디자이너 전용 주문서 인식 | `에어디자이너 전용 주문서 인식/Code.js:23` |
| 제이시스템 전용 주문서 인식 | `제이시스템 전용 주문서 인식/Code.js:23` |

### 5.2 소비자 표

아래 `납품가 첫/마지막`은 해당 프로그램 코드가 명시한 중복 열 선택이다. 열 목록은 같은 ID의 탭에서 실제로 값을 읽는 서버 경로 기준이다.

| 프로그램 | 읽는 탭 | 읽는 열 | 파일:줄 |
|---|---|---|---|
| 일마감 프로그램 | `홈멀티{suffix}`, `상업멀티{suffix}`, `상업멀티 구성{suffix}`, `싱글 세트{suffix}`, `싱글 구성품{suffix}` | 모델명, 품명, 출고가, **첫 납품가**, 고정dc | `일마감 프로그램/Code.js:302-337` |
| 일마감 프로그램 | `싱글 구성품{suffix}` | 모델명, 세트/Set, 구분, **두 번째 납품가** | `일마감 프로그램/Code.js:215-266` |
| 일마감 프로그램 | 이름에 `구형` 포함인 모든 탭 | 모델명, 품명, 출고가, **첫 납품가** | `일마감 프로그램/Code.js:275-300` |
| 거래처 발송 주문서 | 무접미사 `홈멀티` | 품명, 모델명, 단위, **마지막 납품가**, 용량, 규격, 출고가, 고정DC, 비고 및 수식 | `거래처 발송 주문서/Code.js:630-705` |
| 거래처 발송 주문서 | 무접미사 `싱글 세트` | 품명, 평형, 모델명, 단위, 비고, 첫·마지막 납품가 및 마지막 납품가 수식 | `거래처 발송 주문서/Code.js:752-840` |
| 거래처 발송 주문서 | 무접미사 `싱글 구성품` | 품명, 모델명, 구분, 단위, **마지막 납품가**, 세트, 구성품 특징, 규격 | `거래처 발송 주문서/Code.js:858-907` |
| 거래처 발송 주문서 | 무접미사 `상업멀티` | 품명, 모델명, 단위, **마지막 납품가**, 출고가, 고정DC, 규격, 용량, 대분류, 비고 및 수식 | `거래처 발송 주문서/Code.js:1009-1093` |
| 거래처 발송 주문서 | 무접미사 `상업멀티 구성` | 품명, 모델명, 구분, 단위, 세트, 출고가, 납품가, 규격/비고 | `거래처 발송 주문서/Code.js:1101-1169` |
| 거래처 발송 주문서 | `_단가인상` 홈/상업 | 모델명, 출고가 | `거래처 발송 주문서/Code.js:280-304,357-379` |
| 거래처 발송 주문서 | `_단가인상` 싱글 세트/구성품 | 모델명, **마지막 납품가**; 없으면 출고가 | `거래처 발송 주문서/Code.js:306-354` |
| 거래처 발송 주문서 | `구형` | A 품명, B 모델, C 단위, D 출고가, F 납품가와 수식, H 비고, I 규격 | `거래처 발송 주문서/Code.js:1910-1947` |
| 거래처 발송 주문서 | `싱글 자재가격` | A:B 고정 범위 | `거래처 발송 주문서/Code.js:914-920` |
| 거래처 발송 주문서 | `거래처`, `담당자` | 거래처코드·명·담당자·대표자·주소·전화·특이사항·그룹·싱글 할인·사업자번호·담당자연락처; 담당자명·코드 | `거래처 발송 주문서/Code.js:1658-1702,1728-1755` |
| 종합견적서 | `_단가인상` 홈/싱글 세트/싱글 구성품/상업/상업 구성 | 품명, 모델명, 단위, 마지막 납품가, 출고가, 고정DC, 분류·세트·특징·규격·비고 등 카탈로그 열 | `종합견적서/Code.js:49-56,363-914` |
| 종합견적서 | 무접미사 홈/상업/상업 구성/싱글 세트/싱글 구성품 | 모델명, 출고가, **마지막 납품가**; 모델별 가격 오버레이 | `종합견적서/Code.js:2955-3009` |
| 종합견적서 | `구형` | A 품명, B 모델, C 단위, D 출고가, F 납품가와 수식, H 비고, I 규격 | `종합견적서/Code.js:1718-1754` |
| 종합견적서 | `싱글 자재가격`, `거래처`, `담당자`, `추천실외기` | 자재 키·가격; 거래처/담당자 정보; 추천 실외기 데이터 | `종합견적서/Code.js:674,1434,1504,1612` |
| 에어디자이너 전용 주문서 인식 | `홈멀티` 또는 `홈멀티_단가인상` | 모델명, 출고가, 납품가, 고정DC, 규격 및 납품가 수식 | `에어디자이너 전용 주문서 인식/Code.js:734-758,802-827` |
| 에어디자이너 전용 주문서 인식 | `싱글 구성품` 또는 `_단가인상` | 세트, 모델명, 수량, 규격, 구분, 특징, 품명, **마지막 납품가** | `에어디자이너 전용 주문서 인식/Code.js:973-1033` |
| 에어디자이너 전용 주문서 인식 | `종합 견적서` | 모델명, 규격, 행 순서 | `에어디자이너 전용 주문서 인식/Code.js:714-785` |
| 에어디자이너 전용 주문서 인식 | `거래처` | A 거래처코드, D 대표자, E 주소, F 전화번호 | `에어디자이너 전용 주문서 인식/Code.js:689-706` |
| 제이시스템 전용 주문서 인식 | `홈멀티` 또는 `홈멀티_단가인상` | 모델명, 출고가, 납품가, 고정DC, 규격 및 납품가 수식 | `제이시스템 전용 주문서 인식/Code.js:681-702,749-774` |
| 제이시스템 전용 주문서 인식 | `싱글 구성품` 또는 `_단가인상` | 세트, 모델명, 수량, 규격, 구분, 특징, 품명, 적요/비고/메모, 출고가, 첫·두 번째 납품가; 가격은 **두 번째→첫 번째→출고가** | `제이시스템 전용 주문서 인식/Code.js:940-1057` |
| 제이시스템 전용 주문서 인식 | `종합 견적서` | 모델명, 규격, 행 순서 | `제이시스템 전용 주문서 인식/Code.js:662-732` |
| 제이시스템 전용 주문서 인식 | `거래처` | A 거래처코드, D 대표자, E 주소, F 전화번호 | `제이시스템 전용 주문서 인식/Code.js:637-654` |

다른 소비자에서도 `납품가` 선택이 서로 다르다.

- 거래처 발송 주문서 싱글 가격 인상 맵: `idxPrices[idxPrices.length - 1]` (`Code.js:315-325`).
- 에어디자이너 싱글 구성품: 뒤에서 앞으로 순회해 마지막 정확 `납품가` 선택 (`Code.js:996-1000`).
- 제이시스템 싱글 구성품: 첫·두 번째를 따로 읽고 `priceNap2 || priceNap1 || priceOut` (`Code.js:1000-1038`).
- 종합견적서 무접미사 오버레이: 마지막 `납품가` 선택 (`Code.js:2973-2977`).

#### 소비자별 원문 근거

`거래처 발송 주문서`가 같은 ID와 무접미사 다섯 카탈로그 탭을 선언한다.

`tools/legacy-gas/거래처 발송 주문서/Code.js:70-78`

> `const SRC_SHEET_ID      = '<SHEET_ID>';`
> `const HOME_NAME         = '홈멀티';`  
> `const SINGLE_NAME       = '싱글 세트';`  
> `const SINGLE_PARTS_NAME = '싱글 구성품';`  
> `const COMM_NAME         = '상업멀티';`  
> `const COMM_PARTS_NAME   = '상업멀티 구성';`  
> `const CUSTOMERS_NAME    = '거래처';`  
> `const MANAGERS_NAME     = '담당자';`

홈멀티는 마지막 `납품가`를 고른다.

`tools/legacy-gas/거래처 발송 주문서/Code.js:656-665`

> `const idxName   = findIdx_(H, ['품명', '품', '품목', '항목']);`  
> `const idxModel  = findIdx_(H, ['모델명', '모델', '품목코드', '기종']);`  
> `const idxUnit   = findIdx_(H, ['단위']);`  
> `const idxPrices = H.map((v,i)=>v==='납품가'?i:-1).filter(i=>i>=0);`  
> `const idxPrice  = idxPrices.length ? idxPrices[idxPrices.length - 1] : -1;`  
> `const idxCap    = findIdx_(H, ['용량']);`  
> `const idxSpec   = findIdx_(H, ['규격']);`  
> `const idxList   = findIdx_(H, ['출고가','LIST','리스트','정가','소비자가']);`  
> `const idxFixDc  = findIdx_(H, ['고정DC']);`  
> `const idxNote   = findIdx_(H, ['비고']);`

`종합견적서`는 반대로 `_단가인상` 다섯 탭을 기본 상수로 선언한다.

`tools/legacy-gas/종합견적서/Code.js:48-56`

> `const SRC_SHEET_ID      = '<SHEET_ID>';`
> `const HOME_NAME         = '홈멀티_단가인상';`  
> `const SINGLE_NAME       = '싱글 세트_단가인상';`  
> `const SINGLE_PARTS_NAME = '싱글 구성품_단가인상';`  
> `const COMM_NAME         = '상업멀티_단가인상';`  
> `const COMM_PARTS_NAME   = '상업멀티 구성_단가인상';`  
> `const CUSTOMERS_NAME    = '거래처';`  
> `const MANAGERS_NAME     = '담당자';`

그 프로그램의 무접미사 가격 오버레이는 마지막 `납품가`를 선택하고 다섯 탭을 읽는다.

`tools/legacy-gas/종합견적서/Code.js:2973-3009`

> `const idxModel = findIdx_(H, ['모델명','모델','품목코드','기종']);`  
> `const idxList = findIdx_(H, ['출고가','list','리스트','소비자가']);`  
> `const idxPrices = H.map((v,i) => v === '납품가' ? i : -1).filter(i => i >= 0);`  
> `const idxPrice = idxPrices.length ? idxPrices[idxPrices.length - 1] : findIdx_(H, ['납품가']);`  
> `...`  
> `readSheet('홈멀티', out.home, false);`  
> `readSheet('상업멀티', out.comm, false);`  
> `readSheet('상업멀티 구성', out.comm, false);`  
> `readSheet('싱글 세트', out.single, true);`  
> `readSheet('싱글 구성품', out.single, true);`

`에어디자이너 전용 주문서 인식`은 같은 ID에서 홈멀티·싱글 구성품을 날짜/모드에 따라 접미사 유무로 선택한다.

`tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:22-28`

> `const SRC_SHEET_ID        = '<SHEET_ID>';`
> `const MASTER_SHEET        = '종합 견적서';`  
> `const HOME_SHEET          = '홈멀티';`  
> `const SINGLE_SHEET        = '싱글 세트';`  
> `const SINGLE_PARTS_SHEET  = '싱글 구성품';`  
> `const MANAGER_SHEET       = '담당자';`

`tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:973-1000`

> `const targetSheet = isRaised ? SINGLE_PARTS_SHEET + '_단가인상' : SINGLE_PARTS_SHEET;`  
> `...`  
> `const idxSet = ... ['세트', ...];`  
> `const idxModel = ... ['모델명','모델','MODEL'];`  
> `const idxQty = ... ['수량','qty','구성수','수량(EA)'];`  
> `const idxSpec = ... ['규격','사양','spec'];`  
> `const idxGroup = ... ['구분'];`  
> `const idxFeat = ... ['구성품 특징','특징','feature'];`  
> `const idxPum = ... ['품    명','품명','품 목','품  명', '품 명'];`  
> `...`  
> `for (let i = hdr.length - 1; i >= 0; i--) {`  
> `  ...`  
> `  if (/^납품가$/i.test(t)) { idxPrice = i; break; }`

`제이시스템 전용 주문서 인식`도 같은 ID를 사용하되 두 `납품가`를 따로 읽고 우선순위를 명시한다.

`tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:22-28`

> `const SRC_SHEET_ID        = '<SHEET_ID>';`
> `const MASTER_SHEET        = '종합 견적서';`  
> `const HOME_SHEET          = '홈멀티';`  
> `const SINGLE_SHEET        = '싱글 세트';`  
> `const SINGLE_PARTS_SHEET  = '싱글 구성품';`  
> `const MANAGER_SHEET       = '담당자';`

`tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:1000-1038`

> `const napCols = [];`  
> `hdr.forEach((h,i) => {`  
> `  const t = String(h||'').replace(/\s/g,'');`  
> `  if (/납품가/.test(t)) napCols.push(i);`  
> `});`  
> `const idxNap1 = napCols.length >= 1 ? napCols[0] : -1;`  
> `const idxNap2 = napCols.length >= 2 ? napCols[1] : -1;`  
> `...`  
> `const priceNap1 = idxNap1 >= 0 ? toNum(r[idxNap1]) : 0;`  
> `const priceNap2 = idxNap2 >= 0 ? toNum(r[idxNap2]) : 0;`  
> `const prefPrice = priceNap2 || priceNap1 || priceOut;`

### 5.3 문자열 히트지만 소비자가 아닌 프로그램

- `입출고 분석`: `홈멀티`, `상업멀티`는 품목 접두 분류 라벨이다. `Code.js:202-210`은 `AJ`/`AM` 접두로 문자열을 지정하며 `SpreadsheetApp.openById/openByUrl` 호출이 없다.
- `tools/legacy-gas/scripts/extract-notion-dc-csv.js`: `홈멀티DC`, `상업멀티DC`라는 Notion 속성명만 다루며 시트 탭을 열지 않는다(`:90-91,122`).
- `거래처 업데이트 프로그램`: `홈멀티DC`, `상업멀티DC`는 Notion 필드다(`Code.js:781-782`). 이 보고서 대상 ID 문자열과 대상 탭 리터럴은 없다.

따라서 위 세 항목은 동일 스프레드시트/탭 소비자 표에서 제외했다.

## 6. 확정하지 못한 것

1. **실제 원격 탭 목록과 순서**: 특히 `구형` 포함 탭의 실제 이름·개수·`getSheets()` 순서는 모른다. 원격 접근이 금지됐고 저장소에 메타데이터가 없다.
2. **실제 운영 suffix 선택 비율**: 코드 규칙은 확정했지만 운영 업로드 날짜·`인상 전 적용` 토글 이력은 모른다. 실행 로그 또는 저장된 작업 입력이 필요하다.
3. **접미사 탭 존재 여부와 fallback 발생 여부**: 원격 탭 목록이 필요하다.
4. **두 `납품가`의 업무 명칭**: 코드가 첫/두 번째 위치로만 구분한다. “소비자용/세트용” 같은 업무 번역은 근거가 없어 하지 않는다. 확정 가능한 것은 각 경로의 계산 쓰임뿐이다.
5. **DB `delivery_price`가 어느 `납품가`를 담는지**: 스키마에는 단일 필드만 있다. 적재 스크립트·실제 값 대조가 있어야 첫/두 번째 중 무엇인지 확정할 수 있다.
6. **업로드 `번호`와 `slip_db.slip_no`/`seq_no`의 1:1 매핑**: 일마감은 엑셀만 처리하며 DB 조인 코드가 없다. ECOUNT import 계약 또는 표본 대조가 필요하다.
7. **업로드 `창고명`이 source/destination 중 어느 축인지**: 일마감 코드에는 업무 매핑이 없다.
8. **저장소 GAS 사본과 현재 배포 Apps Script의 동일성**: 이번 라운드는 저장소 코드만 읽었다. 배포본 버전·SHA가 없으므로 운영 코드와 동일하다고 확정할 수 없다.
9. **동일 모델 중복으로 실제 맵 병합이 발생하는 행과 값**: 원격 시트 값 또는 저장된 최신 스냅샷 전수 대조가 필요하다.
10. **일마감 운영 사용 빈도와 FALSE 후 실제 업무 조치**: 코드는 필터·수정·저장 UI만 제공한다. 사용자가 FALSE를 보고 어떤 절차를 수행하는지는 코드에 없다.

## 7. 신규 파일

- `docs/dev-reports/2026-08-08-896-daily-closing-sheet-consumers.md`
