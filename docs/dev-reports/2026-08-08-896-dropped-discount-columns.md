# #896 할인 열 누락 경로 확인 — 2026-08-08

## 0. 판정

읽기 전용으로 저장소 코드와 이미 받아 둔 CSV만 확인했다. 코드·DB·Docker·Google Sheets에는 손대지 않았다.

세 열을 같은 결함 경로로 묶으면 안 된다.

- `싱글 할인`은 종합견적서의 거래처 원시 객체에는 `singleDiscount`로 담기지만, 프런트에 반환하는 `getCustomerDataAsync()`의 재구성 `map`에서 빠진다. 이것은 코드로 확정되는 반환 누락이다.
- `할인`·`1WAY할인`은 레거시 GAS의 `getSingleDefaults()` 반환 객체와 바깥 `getInitialData()`에 모두 포함된다. 따라서 제시된 레거시 줄에서 "반환 객체 누락"은 발생하지 않는다. 다만 레거시 프런트가 두 키를 소비하지 않으며, 현행 주문 앱의 저장소 정의 경로는 `singleDefaults`의 시트 매핑 없이 빈 seed로 fallback하는 별도 포팅 누락이 있다.
- 세 열 모두 현재 연결된 금액식 또는 표시 소비처는 없다. 따라서 확인한 코드 범위에서 현재 금액/표시 결과가 달라진다고 단정할 수 없다. 개발책임자 판정대로 값 보존 누락 자체는 결함이지만, 현재 동작 영향은 확인되지 않았다.

## 1. 열별 사슬

### 1.1 요약표

| 열 이름 | 읽는 곳 `파일:줄` | 담기는 키 | 반환 포함 여부 | 프런트 소비처 |
|---|---|---|---|---|
| `할인` | `tools/legacy-gas/종합견적서/Code.js:1383-1405`, 헤더명 `할인`; 받아 둔 CSV에서는 zero-based 17 / 시트 R열 | `singleDefaults['할인']` | 레거시 종합견적서: 포함 (`Code.js:22-23`, `:1397-1406`). 레거시 주문서: 포함 (`거래처 발송 주문서/Code.js:50-51`, `:1646-1655`). 현행 견적 앱: 포함 (`clients/web/estimate-app/lib/code.js:1265`, `:1907-1908`). 현행 주문 앱 저장소 기본 경로: `singleDefaults`가 `{}` seed로 fallback하여 실질 미포함 (`application.yml:98`, `V2__seed_bootstrap_cache.sql:15`) | 없음. 네 프런트에서 `SINGLE_DEFAULTS['할인']` 검색 결과 0건. 실제 싱글 정액 DC 입력은 별도 `window.DISCOUNT_*` 값으로 만든다 (`종합견적서/index.html:7407-7412`, `estimate-app/views/index.ejs:7840-7845`). |
| `1WAY할인` | `tools/legacy-gas/종합견적서/Code.js:1383-1405`, 헤더명 `1WAY할인`; 받아 둔 CSV에서는 zero-based 18 / 시트 S열 | `singleDefaults['1WAY할인']` | 레거시 종합견적서·주문서와 현행 견적 앱에는 포함(위와 같음; 주문서는 `Code.js:1653`). 현행 주문 앱 저장소 기본 경로에서는 `singleDefaults`가 `{}` seed로 fallback하여 실질 미포함 | 없음. 네 프런트에서 `SINGLE_DEFAULTS['1WAY할인']` 검색 결과 0건. 실제 1way 정액 DC는 `window.ONEWAY_DISCOUNT_AMT`/`CONFIG.oneWayDiscount`를 읽는다 (`종합견적서/index.html:3007-3018`, `order-app/index.html:1728-1739`). |
| `싱글 할인` | `tools/legacy-gas/종합견적서/Code.js:1439-1451`, 동적 헤더 `idx('싱글 할인')`; 고정 열 번호는 코드에 없음 | 원시 거래처 객체의 `singleDiscount` (`Code.js:1460-1472`) | **종합견적서 공개 반환에서 누락**: `getCustomerDataAsync()`가 새 객체를 만들 때 `singleDiscount`를 넣지 않음 (`Code.js:1425`). 현행 견적 앱도 같은 공개 반환 누락 (`clients/web/estimate-app/lib/code.js:2050-2053`)이며, 그 전에 directory 변환부터 값을 `0`으로 고정 (`lib/directory.js:73-85`). 레거시 주문서의 단건 검색은 원시 객체 자체를 반환하므로 이 경계에서는 포함 (`거래처 발송 주문서/Code.js:1710-1725`) | 없음. 레거시/현행 종합견적서의 거래처 선택은 `c.dc`만 할인 적용 함수에 넘긴다 (`종합견적서/index.html:15725-15737`, `estimate-app/views/index.ejs:16082-16094`). `c.singleDiscount` 소비는 0건. |

### 1.2 `할인`·`1WAY할인`: 읽기와 반환은 끊기지 않는다

레거시 종합견적서의 읽기 원문:

> `tools/legacy-gas/종합견적서/Code.js:1383-1386`
>
> `const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(SINGLE_NAME);`
>
> `const H = sh.getRange(1, 1, 2, 24).getDisplayValues();`
>
> `const nameRow = H[0].map(v => String(v || '').trim());`
>
> `const valRow  = H[1].map(v => String(v || '').trim());`

헤더로 값을 고르는 원문:

> `tools/legacy-gas/종합견적서/Code.js:1388-1390`
>
> `const pick = (label, def) => {`
>
> `  const i = nameRow.indexOf(label); if (i < 0) return def;`
>
> `  const v = valRow[i];`

반환 객체 원문:

> `tools/legacy-gas/종합견적서/Code.js:1397-1406`
>
> `return {`
>
> `  ...`
>
> `  '할인': parseKRNumber_(pick('할인', 0)),`
>
> `  '1WAY할인': parseKRNumber_(pick('1WAY할인', 0)),`
>
> `  '자재 포함 여부': String(pick('자재 포함 여부', '별도'))`
>
> `};`

바깥 초기 응답도 이 객체를 포함한다.

> `tools/legacy-gas/종합견적서/Code.js:17-24`
>
> `function getInitialData() {`
>
> `  return {`
>
> `    ...`
>
> `    singleDefaults: getSingleDefaults(),`

레거시 주문서도 동일하다.

> `tools/legacy-gas/거래처 발송 주문서/Code.js:46-52`
>
> `const out = {`
>
> `  ...`
>
> `  singleDefaults:  getSingleDefaults(),`

그리고 프런트까지 병합된다.

> `tools/legacy-gas/종합견적서/index.html:8911-8914`
>
> `// 객체 데이터 병합`
>
> `if (data.homeDefaults)   Object.assign(HOME_DEFAULTS, data.homeDefaults);`
>
> `if (data.singleDefaults) Object.assign(SINGLE_DEFAULTS, data.singleDefaults);`

여기까지 값은 끊기지 않는다. 끊기는 곳은 "프런트 소비"다. `renderSingleOptions()`는 `SINGLE_DEFAULTS`에서 `유선리모컨`·`리모컨 제외`·`실외기 받침대 포함`·`판넬변경`·`자재 포함 여부`를 읽지만 `할인`·`1WAY할인`은 읽지 않는다.

> `tools/legacy-gas/종합견적서/index.html:7407-7418`
>
> `box.appendChild(numInp('360 할인', 'ss_disc_360', (window.DISCOUNT_360_AMT||0), 1000));`
>
> `...`
>
> `box.appendChild(numInp('1way 할인', 'ss_disc_1way', (window.ONEWAY_DISCOUNT_AMT||0), 1000));`
>
> `...`
>
> `box.appendChild(sel('유선리모컨', ..., SINGLE_DEFAULTS['유선리모컨']||'', 'ss_remote'));`

즉 `1WAY할인` 열과 `window.ONEWAY_DISCOUNT_AMT`는 이름이 비슷할 뿐 연결 대입이 없다.

### 1.3 `싱글 할인`: 공개 거래처 반환에서 끊긴다

원시 시트 파싱과 객체 저장:

> `tools/legacy-gas/종합견적서/Code.js:1439-1450`
>
> `const H = vr[0].map(v => String(v||'').trim());`
>
> `const idx = n => H.indexOf(n);`
>
> `...`
>
> `const idxDisc   = idx('싱글 할인');`

> `tools/legacy-gas/종합견적서/Code.js:1460-1472`
>
> `out.push({`
>
> `  ...`
>
> `  group: String(row[idxGroup]||'').trim(),`
>
> `  singleDiscount: parseKRNumber_(row[idxDisc])`
>
> `});`

그 다음 공개 응답이 원시 객체를 그대로 반환하지 않고 새 객체를 만들며 누락한다.

> `tools/legacy-gas/종합견적서/Code.js:1414-1425`
>
> `const raw = getCustomers_();`
>
> `...`
>
> `return raw.map(c => ({ code: c.code, name: c.name, bizno: c.bizno, rep: c.rep, tel: c.tel, addr: c.addr, group: c.group, note: c.note, dc: pickDc(c) }));`

따라서 정확한 단절점은 `getCustomerDataAsync()`의 `return raw.map(...)`이다. 프런트에 도착하는 객체에는 `singleDiscount`가 없다.

현행 견적 포팅도 같은 투영 누락을 보존한다.

> `clients/web/estimate-app/lib/code.js:2050-2053`
>
> `return raw.map((c) => ({`
>
> `  code: c.code, name: c.name, bizno: c.bizno, rep: c.rep, tel: c.tel,`
>
> `  addr: c.addr, group: c.group, note: c.note, dc: pickDc(c),`
>
> `}));`

그보다 앞의 현행 directory 변환은 원본 값을 받을 필드 자체가 없고 `0`을 넣는다.

> `clients/web/estimate-app/lib/directory.js:73-85`
>
> `return rows.map((r) => ({`
>
> `  ...`
>
> `  singleDiscount: 0,`
>
> `}));`

## 2. 레거시 원본과 현행 포팅 비교

| 항목 | 레거시 GAS | 현행 견적 앱 | 현행 주문 앱 | 판정 |
|---|---|---|---|---|
| `할인` | 서버 읽기 → `singleDefaults['할인']` → 초기 응답 → 프런트 객체까지 도착. 소비 0건 | `estimate_configs.single_discount` → `singleDiscount` → `singleDefaults['할인']` → EJS까지 도착 (`lib/code.js:435`, `:1265`, `:1908`, `views/index.ejs:2250`). 소비 0건 | 부트스트랩의 `singleDefaults` 키는 있으나 range-map에 소스가 없고 V2 seed가 `{}`라 값 미도착 | 원본부터 미사용. 주문 포팅에는 추가 데이터 누락도 있음 |
| `1WAY할인` | 위와 동일. 소비 0건 | `estimate_configs.single_one_way_discount` → `singleOneWayDiscount` → `singleDefaults['1WAY할인']`까지 도착. 소비 0건 | 위와 동일하게 `{}` | 원본부터 미사용. 주문 포팅에는 추가 데이터 누락도 있음 |
| `싱글 할인` | 원시 거래처 객체까지 저장되지만 종합견적서 공개 응답에서 탈락. 주문서 단건 검색은 원시 객체 반환. 양 프런트 소비 0건 | directory 변환에서 `singleDiscount: 0`, 공개 응답에서 다시 탈락 | 주문 앱 프런트에서 해당 키 소비 0건 | 원본부터 금액/표시 미사용. 포팅도 원값을 보존하지 않음 |

현행 주문 앱의 `singleDefaults` 전체 누락 근거:

> `services/partner-order-service/src/main/resources/application.yml:93-98`
>
> `# cacheKey → A1 range 매핑...`
>
> `range-map: "{homemulti:'홈멀티!A1:Z',singleSets:'싱글 세트!A1:Z',...}"`

이 목록에는 `homeDefaults`와 `singleDefaults`가 없다. fallback도 비어 있다.

> `services/partner-order-service/src/main/resources/db/migration/V2__seed_bootstrap_cache.sql:14-15`
>
> `... 'homeDefaults',    '{}', ...`
>
> `... 'singleDefaults',  '{}', ...`

서비스는 소스가 없으면 이 fallback을 그대로 payload에 넣는다.

> `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/BootstrapService.java:199-220`
>
> `for (String key : CACHE_KEYS) {`
>
> `  ...`
>
> `  BootstrapCacheConfig row = rowsByKey.get(key);`
>
> `  ...`
>
> `  Object parsed = parsePayload(row.getPayloadJson());`
>
> `  payloads.put(key, applyConfigGuard(key, parsed));`
>
> `}`

프런트는 그 빈 객체를 그대로 받는다.

> `clients/web/order-app/index.html:1356-1362`
>
> `const __BS = (window.__SAMHAN_BOOTSTRAP__ = window.__SAMHAN_BOOTSTRAP__ || {});`
>
> `...`
>
> `const SD_RAW = __BS.singleDefaults || {};`

## 3. 현재 할인 축과의 대응

확정되는 대응은 다음뿐이다.

| 레거시 열 | 고정DC (`products.fixed_discount_rate`, 품목별) | 전역DC (`dc_configs`, 거래처별) | 기본 할인율 (`partners`) | 판정 |
|---|---|---|---|---|
| `할인` | 대응 아님. 품목 행의 비율이 아니라 싱글 시트 상단 단일 금액이다 | 대응 아님. `dc_configs`의 거래처별 필드로 읽는 코드가 없다 | 대응 아님 | 셋 중 어느 축도 아님. 현행에서는 별도 `estimate_configs.single_discount`로 보존 (`EstimateConfig.java:104-105`)하지만 계산 소비는 없음 |
| `1WAY할인` | 대응 아님 | 대응 아님. `dc_configs.discount_1way_amount`와 이름/단위가 유사하나 시트 열에서 그 필드로 이관하는 코드 근거가 없음 | 대응 아님 | 셋 중 어느 축도 아님. 현행 별도 `estimate_configs.single_one_way_discount` (`EstimateConfig.java:107-108`); `dc_configs` 전역DC와 동일 의미인지는 **모름** |
| `싱글 할인` | 대응 아님 | 대응 근거 없음. 실제 거래처 선택 시 적용하는 것은 `c.dc`다 | 이름상 후보이나 시트 `싱글 할인` → `partners`의 `basic_discount_rate` 이관/적용 코드가 없음 | **모름**. 기본 할인율이라고 확정할 수 없음 |

세 축의 코드상 정의:

- 고정DC: `services/product-service/src/main/java/com/samhanair/logis/product/domain/Product.java:113-119` — 원문: `@Column(name = "fixed_discount_rate"...) private BigDecimal fixedDiscountRate;`
- 전역DC: `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/domain/DcConfig.java:23-37` — 원문: `거래처별 DC 설정 (Partner 1:1)` 및 `discount{360 / 4Way / 1Way / Stand / Deluxe / FirstGrade}Amount`.
- 기본 할인율: `services/partner-service/src/main/java/com/samhanair/logis/partner/domain/PartnerPriceDiscount.java:44-48` — 원문: `기본 할인율 (%)` / `@Column(name = "basic_discount_rate"...)`.

## 4. 영향 범위

### 4.1 금액/표시

세 열만 놓고 보면 현재 확인되는 금액·표시 영향은 없다.

- `할인`·`1WAY할인`: `SINGLE_DEFAULTS` 안에 들어와도 프런트가 읽지 않는다. 실제 싱글 정액 DC 계산은 `ss_disc_360`, `ss_disc_4way`, `ss_disc_stand`, `ss_disc_1way`, `ss_disc_deluxe`, `ss_disc_grade1` 여섯 입력을 읽는다 (`tools/legacy-gas/종합견적서/index.html:3006-3019`; 현행 견적 앱 `views/index.ejs:3298-3311`; 현행 주문 앱 `index.html:1728-1740`). 두 시트 키는 이 입력들의 초기값에 연결되지 않는다.
- `싱글 할인`: 거래처 선택 프런트는 `c.dc`를 `applyCustomerDiscounts()`에 전달할 뿐 `c.singleDiscount`는 읽지 않는다 (`tools/legacy-gas/종합견적서/index.html:15725-15737`; 현행 `clients/web/estimate-app/views/index.ejs:16082-16094`).

따라서 "값 누락 결함"은 확정하지만, "현재 금액이 얼마만큼 틀린다" 또는 "어떤 표시가 틀린다"는 코드로 확정되지 않는다. 향후 소비처를 연결하면 영향이 생길 수 있으나 이는 이번 판정 범위 밖이다.

단, 같은 저장소 기본 부트스트랩 경로에서는 현행 주문 앱의 `singleDefaults` 나머지 여섯 기본값과 `homeDefaults` 다섯 기본값도 빈 seed로 향한다. 이 값들은 프런트 소비처가 있으므로 운영 DB payload도 seed와 같다면 옵션 초기 표시/초기 동작에 영향이 있다. 이는 아래 전수 대조에 별도 기록한다.

### 4.2 받아 둔 CSV 건수

사용한 로컬 표본:

- `.../scratchpad/live_sheet/싱글 세트.csv`
- `.../scratchpad/live_sheet_inc/싱글 세트_단가인상.csv`
- `.../scratchpad/live_sheet_h0/싱글 세트.csv`

세 파일 모두 1행 헤더에서 `할인`=zero-based 17(R열), `1WAY할인`=zero-based 18(S열)이었고, 대응하는 2행 기본값은 빈 문자열이었다.

| 열 | 값이 있는 행 | 표본 판정 |
|---|---:|---|
| `할인` | 0건 / 기본값 행 3건 | **표본 0 = 판정 불가** |
| `1WAY할인` | 0건 / 기본값 행 3건 | **표본 0 = 판정 불가** |
| `싱글 할인` | 집계 불가 | 세 디렉터리에 `거래처.csv`가 없음. 표본 자체가 없어 판정 불가 |

빈 값 0건을 결함 없음의 근거로 사용하지 않는다.

## 5. 헤더 파싱 ↔ 반환 키 전수 대조

### 5.1 싱글 기본값 함수

`getSingleDefaults()`가 `pick()`으로 읽는 헤더와 반환 키는 레거시 두 GAS에서 8/8 일치한다.

| 읽는 헤더 | 반환 키 | 레거시 반환 | 레거시 프런트 소비 | 현행 견적 프런트 소비 | 현행 주문 bootstrap |
|---|---|---|---|---|---|
| `유선리모컨` | `유선리모컨` | 포함 | 있음 | 있음 (`views/index.ejs:7846`) | 저장소 기본 fallback에 값 없음 (`singleDefaults={}`) |
| `리모컨 제외` | `리모컨 제외` | 포함 | 있음 | 있음 (`:7847`) | 기본 fallback 값 없음 |
| `실외기 받침대 포함` | `실외기 받침대 포함` | 포함 | 있음 | 있음 (`:7848`) | 기본 fallback 값 없음 |
| `판넬변경` | `판넬변경` | 포함 | 있음 | 있음 (`:7849`) | 기본 fallback 값 없음 |
| `360판넬` | `360판넬` | 포함 | 종합견적서의 일부 경로에서 있음 | 있음 (`:7850`) | 기본 fallback 값 없음 |
| `할인` | `할인` | 포함 | **없음** | **없음** | 기본 fallback 값 없음 |
| `1WAY할인` | `1WAY할인` | 포함 | **없음** | **없음** | 기본 fallback 값 없음 |
| `자재 포함 여부` | `자재 포함 여부` | 포함 | 있음 | 있음 (`:7851`) | 기본 fallback 값 없음 |

차집합:

- 레거시 `읽는 헤더 - getSingleDefaults 반환 키` = `{}`.
- 레거시 `getSingleDefaults 반환 키 - 프런트 소비 키` = `{할인, 1WAY할인}`.
- 현행 주문 앱 `레거시 반환 키 - 저장소 기본 singleDefaults seed 키` = `{유선리모컨, 리모컨 제외, 실외기 받침대 포함, 판넬변경, 360판넬, 할인, 1WAY할인, 자재 포함 여부}`.

### 5.2 거래처 함수

`getCustomers_()`의 헤더 11개는 원시 객체 11키에 전부 담긴다. 그 다음 종합견적서의 공개 반환이 3키를 제거한다.

| 읽는 헤더 (`Code.js:1441-1451`) | 원시 키 (`:1460-1472`) | `getCustomerDataAsync()` 공개 반환 (`:1425`) |
|---|---|---|
| `거래처코드` | `code` | 포함 |
| `담당자명` | `manager` | **누락** |
| `거래처명` | `name` | 포함 |
| `대표자명` | `rep` | 포함 |
| `주소` | `addr` | 포함 |
| `전화번호` | `tel` | 포함 |
| `특이사항` | `note` | 포함 |
| `그룹` | `group` | 포함 |
| `싱글 할인` | `singleDiscount` | **누락** |
| `사업자등록번호` | `bizno` | 포함 |
| `담당자연락처` | `managerTel` | **누락** |

공개 반환은 추가로 시트 헤더에 없는 `dc`를 붙인다.

차집합:

- `getCustomers_ 읽는 헤더의 원시 키 - getCustomers_ 원시 반환 키` = `{}`.
- `getCustomers_ 원시 키 - getCustomerDataAsync 공개 반환 키` = `{manager, managerTel, singleDiscount}`.

따라서 이 셋 말고 같은 **read → 공개 projection 탈락** 계열은 `담당자명(manager)`, `담당자연락처(managerTel)` 두 개가 더 있다.

레거시 주문서의 `searchCustomerByBizOrCode()`는 `getCustomers_()`의 객체를 그대로 `return f1/f2/f3` 하므로 이 공개 projection 차집합은 없다 (`tools/legacy-gas/거래처 발송 주문서/Code.js:1710-1725`).

### 5.3 같은 현행 주문 bootstrap 누락 계열

`application.yml:98`의 range-map에 `homeDefaults`·`singleDefaults`가 없고 V2 seed가 둘 다 `{}`이므로, 세 할인 열만 고치면 끝나는 구조가 아니다.

| payload | 레거시 기대 키 | 현행 저장소 기본 fallback | 차집합 |
|---|---|---|---|
| `homeDefaults` | `유연호스 제외`, `분기관 제외`, `발통포함`, `리모컨`, `판넬변경` (`거래처 발송 주문서/Code.js:1621-1627`) | `{}` | 5키 전부 |
| `singleDefaults` | 위 8키 (`거래처 발송 주문서/Code.js:1646-1655`) | `{}` | 8키 전부 |

이 13키는 "시트에서 읽고 projection에서 제거"된 것은 아니고, 현행 주문 포팅이 애초에 기본값 payload 소스를 구성하지 않은 별도 upstream 누락이다.

## 6. 확정하지 못한 것

- `싱글 할인` 열을 `partners`의 기본 할인율로 이관해야 하는지 확정하지 못했다. 이름 유사성 외에 매핑/계산 코드가 없다.
- `1WAY할인` 열과 `dc_configs`의 거래처별 1way 정액 전역DC가 같은 업무 의미인지 확정하지 못했다. 연결 코드가 없다.
- 세 열이 앞으로 어떤 공식/화면에 연결되어야 하는지 확정하지 못했다. 레거시 프런트부터 소비처가 없다.
- `싱글 할인`의 실제 값 보유 행 수는 받아 둔 표본에 거래처 CSV가 없어 확정하지 못했다.
- `할인`·`1WAY할인`은 세 CSV 표본 모두 빈 값이므로 운영 전체에서 값이 없다고 확정하지 못했다. **표본 0 = 판정 불가**다.
- 현행 주문 앱의 빈 `homeDefaults`·`singleDefaults`를 어느 정본(DB 설정, 시트, 별도 API)에서 채워야 하는지는 이번 읽기 전용 라운드에서 결정하지 않았다.
- 운영 `bootstrap_cache_config.payload_json`이 마이그레이션 seed 이후 별도로 갱신되었는지는 DB를 조회하지 않아 확정하지 못했다. 따라서 주문 앱의 `{}` 판정은 저장소에 정의된 기본/fallback 경로에 한정한다.

## 7. 신규 파일

- `docs/dev-reports/2026-08-08-896-dropped-discount-columns.md`
