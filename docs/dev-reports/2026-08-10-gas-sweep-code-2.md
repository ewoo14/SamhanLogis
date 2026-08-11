# GAS 전수조사 — code-2 (`clients/web/estimate-app/lib/code.js` 1401~2858)

> 배정: code-2. 분모 고정 소스: `docs/dev-reports/2026-08-10-gas-function-inventory.md`
> 대상 파일: `clients/web/estimate-app/lib/code.js` (Google Apps Script `Code.js` 를 Node.js 로 1:1 포팅한 백엔드) — 배정 줄 구간 1401~2858
> 조사자: code-2 (읽기 전용 — 코드/스키마/마이그레이션 변경 없음, git 조작 없음)

## 0. 완결성 집계 (1절)

| 항목 | 값 |
|---|---|
| **assigned_count** (분모 — 인벤토리 파일에서 줄번호 1401~2858 사이 항목 수) | **76** |
| **classified_count** | **76** |
| 4분류 합계 검산 | 10 + 66 + 0 + 0 = 76 ✅ |

| 분류 | 건수 |
|---|---|
| business_rule | 10 |
| ui_only | 0 |
| infra_util | 66 |
| dead_code | 0 |

**분모 산출 방법**: 인벤토리 파일의 `clients/web/estimate-app/lib/code.js` 섹션(원본 657~829줄)에서, 줄번호가 1401 이상 2858 이하인 항목만 기계적으로 추출했다(파일 총 2858줄이 배정 상한과 정확히 일치 = 파일 끝까지). 인벤토리는 최상위 함수 선언뿐 아니라 함수 내부의 이름 있는 `const fn = (...) => {}` 표현식도 별도 줄로 뽑아 두었으므로, 그 항목들도 분모에 포함해 전수 처리했다(예: `getSpecDetailMap_` 내부의 `scanHome`/`scanSingle`/`scanComm`, `sendOrderFromUi` 내부의 `safeNum`/`toYmd` 등). 이 중첩 항목은 자신이 속한 최상위 함수와 같은 판정을 받되(그 규칙의 일부이므로), 그 자체가 범용 유틸이면 infra_util 로 별도 판정했다(§2 표의 "소속" 열 참조).

`getSpecDetailMap_()` 자체의 함수 선언(1381)과 헤더 인덱스 헬퍼(`normH`/`findHeaderRow`/`idx`, 1389~1403)는 1401 미만이라 **code-2 분모에서 제외**(다른 담당 구간)이며, 그 함수 몸통 안에서 1401 이후에 등장하는 `findContains`/`scanHome`/`scanSingle`/`scanComm` 및 그 내부 상수만 code-2 가 처리한다. 이 부분 함수(`getSpecDetailMap_`)의 전체 업무 의미는 아래 §3-A 에서 함께 서술한다(경계에 걸쳐 있어 인접 담당자와 겹칠 수 있음을 명시).

## 1. 전수 분류표 (줄번호 · 식별자 · 소속 최상위 함수 · 분류)

| # | 줄 | 식별자 | 소속(최상위 함수) | 분류 |
|---|---|---|---|---|
| 1 | 1404 | `findContains` (const fn) | getSpecDetailMap_ | infra_util |
| 2 | 1411 | `scanHome()` | getSpecDetailMap_ | infra_util |
| 3 | 1419 | `Hraw` (const) | scanHome | infra_util |
| 4 | 1493 | `scanSingle()` | getSpecDetailMap_ | infra_util |
| 5 | 1501 | `H` (const) | scanSingle | infra_util |
| 6 | 1521 | `splitBar` (const fn) | scanSingle | infra_util |
| 7 | 1526 | `splitSlash` (const fn) | scanSingle | infra_util |
| 8 | 1570 | `scanComm()` | getSpecDetailMap_ | infra_util |
| 9 | 1597 | `iDuct` (const, IIFE) | scanComm | infra_util |
| 10 | 1630 | `joinCols` (const fn) | scanComm | infra_util |
| 11 | 1664 | `iCoolKw` (const) | scanComm | infra_util |
| 12 | 1666 | `iHeatKw` (const) | scanComm | infra_util |
| 13 | 1669 | `iPowHeat` (const) | scanComm | infra_util |
| 14 | 1745 | `getPriceIncData_()` | getPriceIncData_ | infra_util |
| 15 | 1753 | `readSheetTab` (const fn) | getPriceIncData_ | infra_util |
| 16 | 1761 | `row` (const) | getPriceIncData_ | infra_util |
| 17 | 1768 | `H` (const) | getPriceIncData_ | infra_util |
| 18 | 1812 | `getLogoImage()` | getLogoImage | infra_util |
| 19 | 1820 | `getGateImages()` | getGateImages | infra_util |
| 20 | 1842 | `bootstrap(userEmail)` | bootstrap | infra_util |
| 21 | 1946 | `preloadDirectoryCache_(forceRefresh)` | preloadDirectoryCache_ | infra_util |
| 22 | 1970 | `clearSheetCache()` | clearSheetCache | infra_util |
| 23 | 1987 | `getAllNotionDcConfigs_(forceRefresh)` | getAllNotionDcConfigs_ | **business_rule** |
| 24 | 2005 | `list` (const) | getAllNotionDcConfigs_ | infra_util |
| 25 | 2006 | `num` (const fn) | getAllNotionDcConfigs_ | infra_util |
| 26 | 2037 | `getCustomerDataAsync(forceRefresh)` | getCustomerDataAsync | **business_rule** |
| 27 | 2043 | `pickDc` (const fn) | getCustomerDataAsync | **business_rule** |
| 28 | 2059 | `getCustomers_()` | getCustomers_ | infra_util |
| 29 | 2067 | `searchCustomerByBizOrCode(input)` | searchCustomerByBizOrCode | **business_rule** |
| 30 | 2085 | `searchCustomerByBizno(bizno)` | searchCustomerByBizno | infra_util (단순 위임) |
| 31 | 2092 | `getManagers_()` | getManagers_ | infra_util |
| 32 | 2096 | `getAllManagers(forceRefresh)` | getAllManagers | infra_util |
| 33 | 2101 | `searchManagersByName_(query)` | searchManagersByName_ | infra_util |
| 34 | 2108 | `findManagerByNameExact_(name)` | findManagerByNameExact_ | infra_util |
| 35 | 2116 | `getManagersForInput(input)` | getManagersForInput | infra_util |
| 36 | 2127 | `initDcConfigFromNotion(bizno)` | initDcConfigFromNotion | **business_rule** |
| 37 | 2148 | `payload` (const) | initDcConfigFromNotion | infra_util |
| 38 | 2152 | `num` (const fn) | initDcConfigFromNotion | infra_util |
| 39 | 2195 | `fetchNotionDcConfig_(biznoDigits)` | fetchNotionDcConfig_ | infra_util (단순 위임) |
| 40 | 2204 | `getScriptCreds_()` | getScriptCreds_ | infra_util *(주1 참조)* |
| 41 | 2214 | `callZoneApi(_comCode)` | callZoneApi | infra_util *(폐기 stub — §4 참조)* |
| 42 | 2219 | `getEcountSession(_authInfo)` | getEcountSession | infra_util *(폐기 stub)* |
| 43 | 2224 | `getInventoryTableHtml(_baseDate,_itemCodes)` | getInventoryTableHtml | infra_util *(미구현 stub)* |
| 44 | 2229 | `getInventoryTable(dateVal,itemCodes)` | getInventoryTable | infra_util (위임) |
| 45 | 2244 | `decideWarehouseCode_(items)` | decideWarehouseCode_ | **business_rule** |
| 46 | 2248 | `getOrigName_(it)` | decideWarehouseCode_ | **business_rule** |
| 47 | 2254 | `getSection_(it)` | decideWarehouseCode_ | **business_rule** |
| 48 | 2292 | `sendOrderFromUi(data)` | sendOrderFromUi | **business_rule** |
| 49 | 2300 | `safeNum` (const fn) | sendOrderFromUi | infra_util |
| 50 | 2302 | `toYmd` (const fn) | sendOrderFromUi | infra_util |
| 51 | 2345 | `whCd` (const) | sendOrderFromUi | **business_rule** |
| 52 | 2429 | `saveOrderToNotion(_info,_items,_slipNo)` | saveOrderToNotion | infra_util *(폐기 stub)* |
| 53 | 2442 | `getNotionHistory(startDate,endDate)` | getNotionHistory | infra_util |
| 54 | 2460 | `unwrapList(data)` | unwrapList | infra_util |
| 55 | 2471 | `saveQuoteSnapshot(payload,email)` | saveQuoteSnapshot | infra_util |
| 56 | 2495 | `getQuoteHistory(startDate,endDate)` | getQuoteHistory | infra_util |
| 57 | 2512 | `getQuoteHistoryByCustomer(custName)` | getQuoteHistoryByCustomer | infra_util |
| 58 | 2530 | `searchNaverAddress(query)` | searchNaverAddress | infra_util |
| 59 | 2547 | `pushUnique` (const fn) | searchNaverAddress | infra_util |
| 60 | 2548 | `key` (const) | searchNaverAddress | infra_util |
| 61 | 2566 | `buildAddressRequests_(q)` | buildAddressRequests_ | infra_util |
| 62 | 2622 | `parseJusoResponse_(res)` | parseJusoResponse_ | infra_util |
| 63 | 2643 | `cleanBdNm_(raw)` | cleanBdNm_ | infra_util |
| 64 | 2655 | `escapeRegex_(s)` | escapeRegex_ | infra_util |
| 65 | 2660 | `stripTrailingName_(addr,name)` | stripTrailingName_ | infra_util |
| 66 | 2669 | `parseNaverLocalResponse_(res)` | parseNaverLocalResponse_ | infra_util |
| 67 | 2673 | `strip` (const fn) | parseNaverLocalResponse_ | infra_util |
| 68 | 2687 | `parseNaverGeocodeResponse_(res)` | parseNaverGeocodeResponse_ | infra_util |
| 69 | 2692 | `pickBuilding` (const fn) | parseNaverGeocodeResponse_ | infra_util |
| 70 | 2693 | `f` (const) | parseNaverGeocodeResponse_ | infra_util |
| 71 | 2724 | `checkUserAuth(email)` | checkUserAuth | infra_util |
| 72 | 2733 | `u` (const) | checkUserAuth | infra_util |
| 73 | 2752 | `forceAuth()` | forceAuth | infra_util *(폐기 stub)* |
| 74 | 2761 | `logFrontEvent(group,msg,isMobile,mgrName)` | logFrontEvent | infra_util |
| 75 | 2788 | `include(filename)` | include | infra_util |
| 76 | 2796 | `doGet()` | doGet | infra_util |

*주1*: `getScriptCreds_()` 는 순수 config 조회처럼 보이지만 `EMP_CD` 기본값(`'250102'`)이 `sendOrderFromUi` 에서 담당자 미선택 시 실제 폴백으로 살아있다(§5 notable 참조). 품목 스키마와 무관해 business_rule 로 승격하지 않았다.

## 2. 이 구간의 전체적 성격

이 구간(1401~2858)은 **품목 카탈로그의 가격/수량/할인 결정 로직이 거의 없다.** 그 로직(HP 파싱, 세트 구성 전개, 패널/리모컨 자동선택, 수량동기화, 반값률 판정 등)은 전부 `views/index.ejs` (프런트) 또는 `code.js` 앞부분(1401 미만, `classifyHome_`/`classifySingleSetLM_`/`classifyCommercial_`/`buildDefaultDcConfig_` 등)에 있고, 다른 조사자 배정 범위다. 본 구간은 다음 4가지 성격의 코드로 구성된다:

1. **스펙 표시 데이터 적재** (`getSpecDetailMap_`, `getPriceIncData_`) — 구글시트 컬럼을 읽어 스펙 모달/가격인상 비교표에 뿌릴 구조체를 만든다. 가격·수량·할인 결정에 관여하지 않는다.
2. **부트스트랩/캐시 오케스트레이션** (`bootstrap`, `preloadDirectoryCache_`, `clearSheetCache`) — 여러 getter 를 호출해 페이지 초기 데이터를 조립한다.
3. **거래처(파트너) 단위 DC 설정 + 거래처/담당자 검색** (`getAllNotionDcConfigs_`, `getCustomerDataAsync`, `initDcConfigFromNotion`, `searchCustomerByBizOrCode` 등) — **품목이 아니라 거래처 단위** 할인율/옵션 오버라이드다. 실제 업무규칙을 담고 있으나 우리가 받은 스키마(products/classification/bundle_component/quantity_sync_*/product_estimate_exposure)에는 거래처 테이블이 없다 — 코드 주석상 이미 별도 `dc-config-service` 로 이관되어 있어(본 조사 스키마 밖) 상세는 §3 에 기록하되 decisions_needed 에는 올리지 않았다.
4. **출고전표(주문) 제출 로직** (`decideWarehouseCode_`, `sendOrderFromUi`) — **이 구간의 유일한 "품목 속성에서 값을 추론하는" 규칙**이다. 창고코드를 품명 키워드로 추론한다 — 개발책임자가 명시한 "수량은 이름에서 추론하지 않는다" 원칙과 같은 종류의 문제라 §5 decisions_needed 에 올렸다.
5. 나머지(주소검색 8종, 인증/로그, 템플릿 include, e-Count/Notion 폐기 stub 8종)는 순수 인프라 유틸이거나 폐기된 기능의 호환 스텁이다.

## 3. business_rule 상세 (10건 → 7개 규칙으로 묶어 서술)

### BR-1. `getAllNotionDcConfigs_(forceRefresh)` — 거래처코드별 DC 설정 벌크 맵
**① 위치**: `clients/web/estimate-app/lib/code.js:1987-2029`

**② 조건 → 결과**

| 조건 | 결과 |
|---|---|
| 캐시(`NOTION_DC_MAP_V1`, TTL 10분) 히트 & `forceRefresh!==true` | 캐시 그대로 반환 |
| `dc-config-service GET /internal/partner-dc-configs` 200 아님 | 빈 맵 반환(로그만) |
| 200 & 목록 존재 | `partnerCode`(숫자만 추출)를 key 로 하는 flat 맵으로 변환 후 10분 캐싱 |

**③ 상수/리터럴**: 캐시키 `NOTION_DC_MAP_V1`, TTL `60*10`(초), 필드명 11종 — `homeDiscount, commDiscount, discount360, discount4way, discountStand, oneWayDiscount, deluxeDiscount, firstGradeDiscount, showIHose, unitRoundTo, unitRoundMode`

**④ 읽는 속성**: dc-config-service 응답의 `partnerCode, homeDiscountRate, commercialDiscountRate, discount360Amount, discount4WayAmount, discountStandAmount, discount1WayAmount, discountDeluxeAmount, discountFirstGradeAmount, showIHose, unitRoundTo, unitRoundMode` (구글시트 직접 컬럼이 아니라 이미 DB화된 내부 서비스 응답)

**⑤ 스키마 대응**: [불가: 스키마 밖] — 이 값은 **거래처(파트너) 단위** 설정이다. PM 이 준 스키마(products/classification/bundle_component/quantity_sync_*/product_estimate_exposure)는 품목 단위이고 거래처 테이블이 없다. 코드 주석(`#29`, `DC_CONFIG_BASE`)상 별도 `dc-config-service` 가 이미 이 도메인을 소유하고 있어, 본 조사 스키마의 이관 대상이 아닌 것으로 판단된다.

**⑥ 견적품목 기본값**: 해당없음(품목 기본값이 아님). **단 교차참조 가치**: `discount360/discount4way/discountStand/oneWayDiscount/deluxeDiscount/firstGradeDiscount` 6개 필드명은 products.`discount_flags` 가 표현해야 할 카테고리 후보(360도/4-way/스탠드/1-way/디럭스/1등급)와 정확히 대응한다. 각 카테고리에 어떤 품목이 해당하는지 판정하는 로직(`analyzeSingleSetDiscountFlags`, `classifySingleSetFixed` 등)은 `views/index.ejs` 쪽 배정이라 본 보고서 범위 밖이지만, 그 담당자가 `discount_flags` enum 값을 정할 때 이 6개 이름을 참고하도록 알림.

### BR-2. `getCustomerDataAsync(forceRefresh)` + `pickDc` — 거래처 ↔ DC 매칭
**① 위치**: `code.js:2037-2054` (`pickDc` 는 2043-2048)

**② 조건 → 결과**

| 조건 | 결과 |
|---|---|
| 거래처.bizno 가 있고 `dcMap[bizno]` 존재 | 그 DC 설정 부착 |
| bizno 매칭 실패, 거래처.code(숫자만) 로 `dcMap[code]` 존재 | 그 DC 설정 부착 |
| 둘 다 실패 | `dc: null` |

**③ 상수**: 없음(매칭 우선순위 자체가 규칙) — bizno 우선, code 는 fallback.

**④ 읽는 속성**: `customer.bizno`, `customer.code` (거래처 directory 캐시 필드 — 시트 컬럼 아님, `directory.fetchPartners()` 결과)

**⑤ 스키마 대응**: [불가: 스키마 밖] — BR-1 과 동일 사유(거래처 도메인).

**⑥ 견적품목 기본값**: 해당없음.

### BR-3. `searchCustomerByBizOrCode(input)` — 거래처 검색 매칭 우선순위
**① 위치**: `code.js:2067-2083`

**② 조건 → 결과**

| 입력 | 결과 |
|---|---|
| 입력에서 숫자만 뽑은 값(`n`)이 있고 어떤 거래처의 `bizno===n` | 그 거래처(최우선) |
| `n` 이 있고 `code`(숫자만 추출)`===n` 인 거래처 | 그 거래처(2순위) |
| 위 실패, 원문 입력(`c`, trim)과 `code===c` 인 거래처 | 그 거래처(3순위) |
| 전부 실패 | `null` (→ `sendOrderFromUi` 에서 `'미등록거래처'` 오류) |

**③ 상수**: 없음(정규식 `[^\d]` 로 숫자 추출만).

**④ 읽는 속성**: `customer.bizno`, `customer.code`

**⑤ 스키마 대응**: [불가: 스키마 밖] — 거래처 도메인.

**⑥ 견적품목 기본값**: 해당없음.

### BR-4. `initDcConfigFromNotion(bizno)` (+ `fetchNotionDcConfig_` 위임) — 거래처별 DC 병합 규칙
**① 위치**: `code.js:2127-2197`

**② 조건 → 결과**

| 조건 | 결과 |
|---|---|
| `bizno` 숫자추출 결과가 정확히 10자리가 아님 | 외부조회 생략, `buildDefaultDcConfig_()` 기본값 그대로 반환 |
| dc-config-service `GET /internal/partners/by-bizno/{bizno}` → 200 & `dcConfig` 존재 | 아래 override 규칙 적용 |
| → 404 | 기본값 유지(미등록 거래처, 로그만) |
| → 그 외 상태/예외 | 기본값 유지(로그만) |
| `notion.homeDiscount` 가 number **이고 0이 아님** | `cfg.homeDiscount` override (0은 무시 — 실수로 0을 심어도 기본율을 깨지 않기 위한 방어) |
| `notion.commDiscount` 가 number **이고 0이 아님** | `cfg.commDiscount` override (동일 방어) |
| `notion.discount360/discount4way/discountStand/oneWayDiscount/deluxeDiscount/firstGradeDiscount` 가 number(0 포함) | 그대로 override |
| `notion.showIHose` 가 boolean | override |
| `notion.unitRoundTo` 가 number | override |
| `notion.unitRoundMode` 가 truthy | override |

**③ 상수/임계값**: 사업자번호 자릿수 **10** (하드코딩 검증 규칙). `homeDiscount`/`commDiscount` 만 "0이면 무시"라는 비대칭 가드가 핵심 임계값.

**④ 읽는 속성**: dc-config-service 응답의 `dcConfig.{homeDiscountRate, commercialDiscountRate, showIHose, discount360Amount, discount4WayAmount, discountStandAmount, discount1WayAmount, discountDeluxeAmount, discountFirstGradeAmount, unitRoundTo, unitRoundMode}`

**⑤ 스키마 대응**: [불가: 스키마 밖] — 거래처 도메인(BR-1 과 동일 서비스).

**⑥ 견적품목 기본값**: 해당없음. 단 "0 값을 명시적으로 지정해도 기존 값을 깨지 않는다"는 **null/0 오염 방지 패턴**은, 향후 products 테이블의 `fixed_discount_rate`/`variable_discount_manual` 등 nullable override 필드에 벌크 upsert 를 짤 때 참고할 방어 패턴으로 다른 담당자에게 공유할 가치가 있음(노트에 기록).

### BR-5. `decideWarehouseCode_(items)` (+ `getOrigName_`, `getSection_`, `sendOrderFromUi` 의 `whCd`) — 출고 창고코드 결정
**① 위치**: `code.js:2244-2283`(본체), `2248`(`getOrigName_`), `2254`(`getSection_`), 사용처 `2345`(`sendOrderFromUi` 의 `whCd`)

**② 조건 → 결과**

| 조건 | 결과(창고코드) |
|---|---|
| `items` 가 빈 배열/배열 아님 | `'00003'` |
| `order.whCode` 가 명시적으로 전달됨(사용자가 프론트에서 직접 지정) | 규칙 자체를 건너뛰고 그 값 그대로 사용 |
| HOME 섹션 품목 중 원본 품명에 `"인피니트"` 포함하는 것이 하나라도 있음 | `'2'` |
| (위 아니고) SINGLE 섹션 품목 중 원본 품명이 아래 키워드 중 하나라도 포함 | `'2'` |
| 위 두 경우 모두 아님 | `'00003'` |

SINGLE 히트 키워드(모두 OR, 대소문자/공백 관용 정규식): `"360"`, `"1등급"`, `"냉방전용"`, `"1way"`(공백 허용, 대소문자 무관), `"덕트"`, `"냉전"`, `"비스포크"`, `"벽걸이"`, `"가정용 에어컨"`(공백 관용)

**③ 상수/리터럴 전부**: 기본 창고코드 `'00003'`, 대체 창고코드 `'2'`, HOME 키워드 정규식 `/인피니트/`, SINGLE 키워드 정규식 9종 `/360/i`, `/1등급/`, `/냉방전용/`, `/1\s*way/i`, `/덕트/`, `/냉전/`, `/비스포크/`, `/벽걸이/`, `/가정용\s*에어컨/`. 품명 후보 우선순위: `it.nameRaw ?? it.rawName ?? it.nameOrig ?? it.name ?? it.pname ?? ''`. 섹션 값은 `String(it.section||'').toUpperCase()` 로 `'HOME'`/`'SINGLE'` 리터럴과 비교.

**④ 읽는 속성**: `item.section`, `item.nameRaw`/`rawName`/`nameOrig`/`name`/`pname` (구글시트 컬럼이 아니라 프런트가 조립해 보낸 주문 항목 JSON 필드 — 원 출처는 index.ejs 의 품명 조립 로직, 본 배정 밖)

**⑤ 스키마 대응**: **[불가: 스키마에 없음]** — products/classification/bundle_component/quantity_sync_*/product_estimate_exposure 어디에도 "출고 창고코드"/"창고 라우팅" 개념이 없다. section(HOME/SINGLE)은 `estimate_category` 로 어느 정도 대응 가능해 보이나, 창고코드 필드 자체가 부재.

**⑥ 견적품목 기본값**: 🚩**[결정 필요]** — 개발책임자가 명시한 원칙("수량은 이름에서 추론하지 않는다 — 설정값이 결정")과 동일한 유형의 문제다: 지금은 "품명에 특정 키워드가 있으면"으로 창고를 추론하고 있다. 이 로직을 이식하려면 이름 추론을 버리고 "(model_code → 창고코드)" 명시적 설정으로 환원해야 한다. §5 decisions_needed 참조.

### BR-6. `sendOrderFromUi` 내 SET 헤더 라인 제외 규칙
**① 위치**: `code.js:2292-2311`(필터링 부분)

**② 조건 → 결과**

| 조건 | 결과 |
|---|---|
| `item.unit==='SET'` (대소문자 무관 대문자 비교) **AND** `item.section==='SET'` **AND** `item.sendAsSet !== true` | 해당 항목을 전표(SaleList) 생성 대상에서 **제외** |
| 그 외 | 포함 |

**③ 상수**: 리터럴 `'SET'`(unit/section 양쪽), 불리언 플래그 `sendAsSet`.

**④ 읽는 속성**: `item.unit`, `item.section`, `item.sendAsSet`

**⑤ 스키마 대응**: [부분] — `products.product_type='BUNDLE'` / `bundle_mode` 가 "세트를 부품별로 전개해서 보낼지, 세트 자체를 한 줄로 보낼지"를 이미 구분하는 목적이라면 대응 가능해 보인다. 다만 `bundle_mode` 의 실제 값 종류(재조사 금지 대상)를 이 보고서에서 확정할 수 없어 [부분]으로만 표시.

**⑥ 견적품목 기본값**: 해당없음 — 이는 품목 자체의 기본값이 아니라 "주문 제출 시점 필터링" 규칙이다. `bundle_mode` 가 이 구분을 이미 포함하는지는 스키마 담당(또는 order-app 담당)이 교차검증할 것을 권고(결정 필요 항목으로 올리지는 않음 — 이미 스키마에 유사 개념이 있어 보이므로).

### BR-7. `sendOrderFromUi` 내 "경동" 특정 거래처 하드코딩 예외
**① 위치**: `code.js:2366-2371`

**② 조건 → 결과**

| 조건 | 결과 |
|---|---|
| `order.addr` 문자열이 정규식 `/경동.*[\/:]/` 에 매치(즉 "경동"이라는 단어 뒤 어딘가에 `/` 또는 `:` 문자가 나오는 주소) | 전표에 넣을 규격설명(`SIZE_DES`)을 원래 `it.spec` 대신 `it.list`(문자열화된 출고가 추정치, 없으면 `0`) 값으로 대체 + `Logger.log` 로 `모델/list/전체항목` 디버그 로그 남김 |
| 그 외 | `rawSpec = it.spec` 그대로 사용(빈 문자열이면 zero-width space `​` 로 치환) |

**③ 상수/리터럴**: 정규식 `/경동.*[\/:]/` — **특정 거래처로 추정되는 고유명사 "경동"이 코드에 직접 하드코딩**되어 있음.

**④ 읽는 속성**: `order.addr`, `it.spec`, `it.model`, `it.list`

**⑤ 스키마 대응**: [불가: 스키마 밖] — 특정 거래처 이름을 정규식으로 하드코딩한 1회성 예외이며 어떤 테이블 개념에도 대응하지 않는다.

**⑥ 견적품목 기본값**: 해당없음. 🚩**[결정 필요, 낮은 우선순위]** — 신규 시스템에도 "경동" 거래처(주소에 `/` 또는 `:` 포함 시) 만 규격란에 출고가 추정치를 노출하는 특례를 유지할지, 혹은 legacy 잔재로 보고 폐기할지 결정이 필요하다. 왜 이 특례가 생겼는지 코드에 근거가 없어 자동 판단 불가.

## 4. dead_code 판정 근거 (0건)

배정 구간에서 dead_code 로 판정한 항목은 **없다**. 특히 "폐기(deprecated)" 주석이 붙은 8개 stub — `getScriptCreds_`, `callZoneApi`, `getEcountSession`, `getInventoryTableHtml`, `getInventoryTable`, `saveOrderToNotion`, `forceAuth`, `getLogoImage`, `getGateImages` — 는 dead_code 로 오판하기 가장 쉬운 후보라 grep 으로 개별 검증했다.

**검증 방법**: (1) `clients/` 전체에서 함수명 문자열 참조 검색(호출부·동적 호출·문자열 참조 포함), (2) `code.js` 내부 상호호출 확인, (3) RPC 디스패치 메커니즘 확인.

```
grep -rn "getScriptCreds_\|callZoneApi\|getEcountSession\|getInventoryTableHtml\|saveOrderToNotion\|forceAuth\|getLogoImage\|getGateImages" clients/
```
→ `clients/web/estimate-app/lib/code.js` (정의/모듈export) 와 `clients/web/estimate-app/test/code.test.js` (인벤토리 export 검증 테스트) 외에는 어떤 파일에도 나타나지 않는다.

`views/index.ejs` 한정 검색 결과:
- `getGateImages` → **호출됨** (`index.ejs:13529` `google.script.run...getGateImages()`, 게이트 이미지 슬라이드쇼)
- `getInventoryTable` → **호출됨** (`index.ejs:16568`, 재고조회 모달) — 내부적으로 `getInventoryTableHtml` 를 그대로 위임 호출하므로 그것도 간접 도달.
- `getLogoImage` → **`code.js` 내부에서 호출됨** (`bootstrap()` 1914줄 `t.logoData = getLogoImage()`)
- `getScriptCreds_` → **`code.js` 내부에서 호출됨** (`sendOrderFromUi()` 2349줄 `getScriptCreds_().EMP_CD`, 담당자 미선택 시 기본 사원코드 폴백 — 실제로 살아있는 기본값)
- `callZoneApi`, `getEcountSession`, `saveOrderToNotion`, `forceAuth` → **정적 호출부 없음**

그러나 이 4개(`callZoneApi`/`getEcountSession`/`saveOrderToNotion`/`forceAuth`)도 dead_code 로 표시하지 않았다. 근거:

1. **동적 디스패치로 여전히 도달 가능**: `routes/rpc.js` 가 `POST /rpc/:fnName` 에서 `code[fnName]` 을 문자열로 조회해 호출하는 범용 라우터다(`const fn = code[fnName]; ... fn.apply(null, args)`). `module.exports` 에 등록된 함수는 전부 이 경로로 원리상 호출 가능하며, 프런트가 현재 그 이름으로 요청하지 않을 뿐 라우터 차원에서 막혀 있지 않다.
2. **코드 주석이 "삭제 대상"이 아니라 "의도적 보존"임을 명시**: 파일 앞부분 주석(§6, 2199-2202줄)에 `"§6 e-Count session — DEPRECATED (slip-bridge 가 흡수) / 호환성을 위해 stub 유지"` 라고 적혀 있다. 즉 죽은 코드가 아니라 **RPC 인벤토리 호환성을 위해 의도적으로 남긴 스텁**이다.
3. **잃을 업무규칙이 없다**: 4개 함수 본문은 전부 `Logger.log(...); return <고정값>;` 1~2줄로, 원래의 e-Count/Notion 연동 업무규칙은 이미 `slip-bridge.postSlip`/dc-config-service 로 이관 완료됐고 이 stub 안에는 이관 대상 로직이 전혀 남아있지 않다.

이런 이유로 이 4개와 `getInventoryTableHtml`(도달은 되지만 내용은 "미구현" placeholder)은 모두 **infra_util**(호환 스텁)로 분류했다.

## 5. decisions_needed (자동 기본값 결정 불가 — 개발책임자 확인 필요)

(StructuredOutput 의 decisions_needed 필드에도 동일 내용 반영)

1. **출고 창고코드 라우팅 규칙 이식 방식** (`decideWarehouseCode_`, code.js:2244)
   - 레거시 동작: HOME 품목 중 품명에 "인피니트" 포함 또는 SINGLE 품목 중 품명에 360/1등급/냉방전용/1way/덕트/냉전/비스포크/벽걸이/가정용 에어컨 중 하나라도 포함되면 창고 `'2'`, 아니면 기본 `'00003'`.
   - 후보안: (a) products 테이블에 `warehouse_code` 또는 `ships_alt_warehouse`(boolean) 신규 컬럼을 추가해 품목마다 명시적으로 설정(개발책임자의 "이름에서 추론 금지" 원칙과 일치). (b) 이미 있는 `product_category`/`goods_type`/`panel_type` 등이 이 구분을 함의한다면 그것으로 파생(검증 필요, 이 보고서에서는 확정 불가 — 재조사 금지 대상 스키마라 값 자체를 열어보지 못함). (c) 품목 스키마를 건드리지 않고 주문/전표(order-service) 쪽에 키워드 매칭을 그대로 유지(레거시 동작 존속, "이름 추론" 리스크는 남음).
   - 권장: (a). 다만 실제로 창고 `'2'` 로 가는 품목이 몇 종인지(현재 활성 품목 3,084건 중 몇 개가 이 키워드에 걸리는지) 먼저 세어보고 결정하는 편이 안전 — 본 보고서는 읽기 전용 조사라 집계하지 않았다.

2. **"경동" 거래처 하드코딩 특례 유지 여부** (`sendOrderFromUi`, code.js:2366)
   - 레거시 동작: 주문 주소에 "경동"+`/`또는`:` 패턴이 있으면 전표 규격란에 spec 대신 출고가 추정치(`it.list`)를 노출.
   - 후보안: (a) 유지(레거시 거래처 요구사항일 가능성 — 이유 불명이라 폐기 리스크 있음). (b) 폐기(설명 안 되는 특례, 신규 시스템에서는 일관 규칙 적용).
   - 권장: 낮은 우선순위. 근거 문서/이유가 없어 자동 판단 불가 — 실 운영 담당자(영업)에게 "경동" 거래처에 왜 이 예외가 필요했는지 확인 후 결정 권고.

## 6. notable (참고 사항 — 결정 불필요, 유실 방지용 기록)

- `getScriptCreds_().EMP_CD` 기본값 `'250102'` 는 담당자 미선택 시 실제로 살아있는 폴백이다(`sendOrderFromUi:2349`). 품목 스키마와 무관해 결정 항목에는 올리지 않았지만, 주문/사용자 도메인 이관 시 이 기본 사원코드가 조용히 사라지지 않도록 담당자에게 전달 필요.
- `initDcConfigFromNotion` 의 "homeDiscount/commDiscount 는 0이면 override 하지 않는다"는 비대칭 null/0 방지 가드는, products 의 nullable override 필드(`fixed_discount_rate`, `variable_discount_manual` 등)에 대량 upsert 로직을 짤 때 참고할 만한 방어 패턴이다.
- `getAllNotionDcConfigs_`/`initDcConfigFromNotion` 의 6개 금액 필드명(`discount360/discount4way/discountStand/oneWayDiscount/deluxeDiscount/firstGradeDiscount`)은 products.`discount_flags` 의 enum 후보(360/4WAY/STAND/1WAY/DELUXE/FIRSTGRADE)와 대응 관계가 강하다 — 실제 판정 로직(`views/index.ejs`)을 조사하는 담당자와 교차확인 권고.
- `getPriceIncData_()`(1745) 는 `bootstrap()` 안에서 `CATALOG_SOURCE=sheet` 로 명시 오버라이드했을 때만 쓰이는 legacy 폴백 경로다. 기본(`CATALOG_SOURCE=db`, 즉 useDb=true) 경로에서는 `db-catalog.js` 의 `priceIncData()` 가 대신 쓰인다(다른 파일 — 본 배정 밖). 두 경로가 동일한 `out.home/out.comm/out.single` shape 을 유지하는지는 db-catalog.js 담당자가 함께 확인해야 한다.
- `getInventoryTable`/`getInventoryTableHtml` 은 프런트에서 실제로 호출되는 살아있는 기능(재고조회 모달)이지만, 현재 백엔드는 `"재고 조회 endpoint 미구현 (M1a 후속)"` 이라는 고정 placeholder HTML만 반환한다. business_rule 은 없지만(진짜 재고 데이터가 없으므로) 기능이 조용히 비어있다는 사실 자체를 스키마 담당/PM 에게 공유.
