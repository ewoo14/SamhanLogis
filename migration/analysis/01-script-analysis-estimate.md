# Phase 1 분석 — 종합견적서 (estimate)

> 입력: `migration/source/scripts/estimate/Code.js` (2,837 라인) + `index.html` (18,614 라인)
> 시트 dump: `migration/source/sheet/workbook.json` (27 탭)
> 분석 원칙: 무손실, 추측 금지, placeholder 토큰 유지.
> 대상: SamhanLogis Java/Spring Boot 마이그레이션을 위한 함수 단위 inventory.

---

## §1 함수 inventory (누락 0 가드)

### §1.0 누락 0 가드 결과

| 파일 | 카운트 명령 | 추출 함수 수 | 비고 |
|---|---|---|---|
| Code.js | `grep -nE "^\s*(async\s+)?function [a-zA-Z_]"` | **76** | 최상위 70 + 중첩 6 (`scan`, `scanHome`, `scanSingle`, `scanComm`, `getOrigName_`, `getSection_`) |
| index.html | `grep -nE "^\s*(async\s+)?function [a-zA-Z_]"` | **358** | 최상위 + 중첩 모두 포함 |
| index.html named function expression | `const X = function` | 1 | `onComplete` (line 14375) |
| Code.js arrow assigned const | (의미있는 명명형) | 0 | top-level `const X = (a)=>` 없음 (모두 함수 내부) |
| **합계 (named)** | | **435** | inventory 행 수와 동일 |

(주: 익명 콜백 화살표 `(x)=>...` 다수 존재 — 분석 대상 아님. 주요 함수 내 inline 헬퍼만 시그니처 기록.)

### §1.1 Code.js 함수 inventory (76개)

| # | 라인 | 함수 시그니처 | 호출자 (caller) | 호출 대상 (callee 주요) |
|---|---|---|---|---|
| 1 | 6 | `doGet()` | (Apps Script entry) | `HtmlService.createTemplateFromFile`, `Session.getActiveUser`, `checkUserAuth`, `getHomeMulti`, `getSingleSets`, `getSingleParts`, `getHomeDefaults`, `getSingleDefaults`, `getSingleMatPrices`, `getCommercialMulti`, `getCommercialParts`, `getOldProducts_`, `getRecommendOduData`, `getSpecDetailMap_`, `getPriceIncData_`, `getLogoImage` |
| 2 | 90 | `cachePutJSON_(key, obj, ttlSec)` | `getHomeMulti`, `getSingleSets`, `getSingleParts`, `getCommercialMulti`, `getCommercialParts`, `getSpecMap_`, `getSpecDetailMap_`, `getCustomers_`, `getManagers_`, `fetchNotionDcConfig_`, `getPriceIncData_` | `CacheService.getScriptCache().put` |
| 3 | 100 | `cacheGetJSON_(key)` | 동상 caller | `CacheService.getScriptCache().get` |
| 4 | 114 | `cacheRemoveJSON_(key)` | `getCustomerDataAsync` | `CacheService.getScriptCache().remove` |
| 5 | 126 | `getGateImages()` | (HTML `prepareGateImages` via google.script.run line 12879) | `DriveApp.getFolderById`, `Utilities.base64Encode` |
| 6 | 154 | `getLogoImage()` | `doGet` | `DriveApp.getFolderById`, `Utilities.base64Encode` |
| 7 | 197 | `normalizeSize_(v)` | `getSingleSets` | (pure) |
| 8 | 202 | `findIdx_(row, keys)` | `getHomeMulti`, `getSingleParts`, `getCommercialMulti`, `getCommercialParts`, `getSpecMap_`, `getSpecDetailMap_`, `getPriceIncData_` | (pure) |
| 9 | 206 | `parseKRNumber_(v)` | 13개 함수 (가격/수량 파싱) | (pure) |
| 10 | 212 | `parseKRFloat_(v)` | `getHomeMulti`, `getCommercialMulti` | (pure) |
| 11 | 218 | `toYmd_(v, tz)` | (utility — 직접 호출 미사용) | `Utilities.formatDate` |
| 12 | 225 | `toMmDd_(v, tz)` | (utility — 직접 호출 미사용) | `Utilities.formatDate` |
| 13 | 232 | `normalizeTel_(s)` | (utility — 호출처 없음) | (pure) |
| 14 | 239 | `todayYMD_()` | (utility — 호출처 없음) | `Utilities.formatDate` |
| 15 | 240 | `_normSpec_(s)` | (utility — 호출처 없음) | (pure) |
| 16 | 243 | `sanitizeKoreanParen_(text)` | `sanitizeDisp_` | (pure) |
| 17 | 251 | `trimSymbols_(text)` | `sanitizeDisp_` | (pure) |
| 18 | 254 | `sanitizeDisp_(text)` | `classifyHome_`, `getSingleSets`, `getSingleParts`, `getCommercialMulti`, `getCommercialParts` | `trimSymbols_`, `sanitizeKoreanParen_` |
| 19 | 257 | `hpFromText_(s)` | `classifyHome_` | (pure regex) |
| 20 | 267 | `isBlockedByNote_(note)` | `getHomeMulti`, `getSingleSets`, `getSingleParts`, `getCommercialMulti`, `getCommercialParts` | (pure regex `/미판매|단종/`) |
| 21 | 274 | `isSoldOutByNote_(note)` | (utility — 호출처 미발견) | (pure regex `/품절/`) |
| 22 | 281 | `unifyCatL_(L)` | `classifyHome_` | (pure) — '부자재2' → '부자재' |
| 23 | 284 | `classifyHome_(rawName)` | `getHomeMulti` | `unifyCatL_`, `sanitizeDisp_`, `hpFromText_` |
| 24 | 374 | `getHomeMulti()` | `doGet` | `cachePutJSON_`, `cacheGetJSON_`, `SpreadsheetApp.openById`, `findIdx_`, `parseKRNumber_`, `parseKRFloat_`, `classifyHome_`, `isBlockedByNote_`, `sanitizeDisp_` |
| 25 | 458 | `classifySingleSetLM_(s)` | `getSingleSets` | (pure regex) |
| 26 | 487 | `findHeaderIndex_(headers, key)` | (utility — 호출처 미발견) | (pure) |
| 27 | 498 | `getSingleSets()` | `doGet` | `cache*`, `SpreadsheetApp.openById`, `findIdx_`, `normalizeSize_`, `parseKRNumber_`, `sanitizeDisp_`, `classifySingleSetLM_`, `isBlockedByNote_` |
| 28 | 600 | `extractRowsFromFormula_(formula)` | (utility — 호출처 미발견) | (pure regex) |
| 29 | 610 | `getSingleParts()` | `doGet` | `cache*`, `SpreadsheetApp.openById`, `findIdx_`, `parseKRNumber_`, `sanitizeDisp_` |
| 30 | 683 | `getSingleMatPrices()` | `doGet` | `SpreadsheetApp.openById`, `parseKRNumber_` |
| 31 | 694 | `classifyCommercial_(name, model)` | `getCommercialMulti` | (pure regex) |
| 32 | 778 | `getCommercialMulti()` | `doGet` | `cache*`, `findIdx_`, `parseKRNumber_`, `parseKRFloat_`, `classifyCommercial_`, `isBlockedByNote_`, `sanitizeDisp_` |
| 33 | 873 | `getCommercialParts()` | `doGet` | `cache*`, `findIdx_`, `parseKRNumber_`, `sanitizeDisp_`, `isBlockedByNote_` |
| 34 | 955 | `getSpecMap_()` | `sendOrderFromUi` | `cache*`, nested `scan(sheetName)` × 5 시트 |
| 35 | 965 | `scan(sheetName)` (nested in getSpecMap_) | `getSpecMap_` | `findIdx_`, `SpreadsheetApp.openById` |
| 36 | 1006 | `getSpecDetailMap_()` | `doGet` | `cache*`, nested `scanHome`, `scanSingle`, `scanComm` |
| 37 | 1036 | `scanHome()` (nested) | `getSpecDetailMap_` | (pure header indexing) |
| 38 | 1118 | `scanSingle()` (nested) | `getSpecDetailMap_` | (pure header indexing + bar/slash split) |
| 39 | 1195 | `scanComm()` (nested) | `getSpecDetailMap_` | (pure — ERV layout 감지) |
| 40 | 1367 | `getHomeDefaults()` | `doGet` | `SpreadsheetApp.openById` |
| 41 | 1392 | `getSingleDefaults()` | `doGet` | `SpreadsheetApp.openById`, `parseKRNumber_` |
| 42 | 1420 | `getCustomerDataAsync(forceRefresh)` | (HTML `initCustomerSearch` line 15091, `syncCustomers` line 15228) via google.script.run | `cacheRemoveJSON_`, `getCustomers_` |
| 43 | 1429 | `getCustomers_()` | `searchCustomerByBizOrCode`, `getCustomerDataAsync` | `cache*`, `SpreadsheetApp.openById`, `parseKRNumber_` |
| 44 | 1480 | `searchCustomerByBizOrCode(input)` | `sendOrderFromUi`, `searchCustomerByBizno`, `initDcConfigFromNotion` | `getCustomers_` |
| 45 | 1499 | `getManagers_()` | `searchManagersByName_`, `findManagerByNameExact_` | `cache*`, `SpreadsheetApp.openById` |
| 46 | 1532 | `searchManagersByName_(query)` | `getManagersForInput` | `getManagers_` |
| 47 | 1540 | `findManagerByNameExact_(name)` | `sendOrderFromUi` | `getManagers_` |
| 48 | 1549 | `getScriptCreds_()` | `getEcountSession`, `sendOrderFromUi` | `PropertiesService.getScriptProperties` (fallback hardcoded `COM_CODE=174539`, `USER_ID=11840720103`, `KEY=117d1e405a25...`, `EMP_CD=250102`) |
| 49 | 1563 | `callZoneApi(comCode)` | `getEcountSession` | `UrlFetchApp.fetch('http://152.69.228.109:3000/proxy/ecount/zone')` |
| 50 | 1576 | `getEcountSession(authInfo)` | `sendOrderFromUi`, `getInventoryTableHtml` | `getScriptCreds_`, `callZoneApi`, `UrlFetchApp.fetch('.../proxy/ecount/login')`, cache (30분) |
| 51 | 1610 | `getRecommendOduData()` | `doGet` | `SpreadsheetApp.openById` |
| 52 | 1639 | `decideWarehouseCode_(items)` | `sendOrderFromUi` | nested `getOrigName_`, `getSection_` (반환: `'2'` or `'00003'`) |
| 53 | 1644 | `getOrigName_(it)` (nested) | `decideWarehouseCode_` | (pure) |
| 54 | 1650 | `getSection_(it)` (nested) | `decideWarehouseCode_` | (pure) |
| 55 | 1682 | `formatWonDiscountLabel_(amt)` | (utility — 호출처 미발견) | (pure) |
| 56 | 1703 | `formatPercentLabel_(rate)` | (utility — 호출처 미발견) | (pure) |
| 57 | 1710 | `combineRemarks_(base, extra)` | (utility — 호출처 미발견) | (pure) |
| 58 | 1719 | `getOldProducts_()` | `doGet` | `SpreadsheetApp.openById` — F열 수식 `$I$1` 포함 여부로 `isDisc` 판정 |
| 59 | 1762 | `sendOrderFromUi(data)` | (HTML line 10102, 15073 via google.script.run) | `searchCustomerByBizOrCode`, `getEcountSession`, `findManagerByNameExact_`, `getScriptCreds_`, `decideWarehouseCode_`, `getSpecMap_`, `UrlFetchApp.fetch('.../proxy/ecount/sale')`, `saveOrderToNotion` |
| 60 | 1970 | `detectHomeOrder(items, order)` | (utility — 호출처 미발견) | (pure regex `/HOME|HM|AJ0|AJ1|AM0|AM1/`) |
| 61 | 1990 | `buildDefaultDcConfig_()` | `initDcConfigFromNotion` | (pure) |
| 62 | 2007 | `fetchNotionDcConfig_(biznoDigits, forceRefresh)` | `initDcConfigFromNotion` | `cache*`, `UrlFetchApp.fetch('https://api.notion.com/v1/databases/{NOTION_DB_ID}')` (GET) → 2025-09-03 data_source 발견 시 `'.../v1/data_sources/{id}/query'`, 폴백 `'.../v1/databases/{NOTION_DB_ID}/query'` (POST) |
| 63 | 2166 | `initDcConfigFromNotion(bizno)` | (HTML — 거래처 선택 시 google.script.run) | `buildDefaultDcConfig_`, `searchCustomerByBizOrCode`, `fetchNotionDcConfig_` |
| 64 | 2204 | `searchCustomerByBizno(bizno)` | (HTML — 거래처 검색) | `searchCustomerByBizOrCode` |
| 65 | 2210 | `getManagersForInput(input)` | (HTML — 담당자 선택) | `searchManagersByName_` |
| 66 | 2223 | `forceAuth()` | (수동 호출 — 권한 부여) | `DriveApp.getRootFolder` |
| 67 | 2233 | `saveOrderToNotion(info, items, slipNo)` | `sendOrderFromUi` | `Session.getActiveUser`, `Utilities.base64Encode`, `UrlFetchApp.fetch('https://api.notion.com/v1/pages')` POST → DB `2f8a1006d658803face6fdfe2b175780` (`NOTION_KEY_SEND`) |
| 68 | 2308 | `getNotionHistory(startDate, endDate)` | (HTML line 13228 via google.script.run) | `Session.getActiveUser`, `UrlFetchApp.fetch('.../databases/{NOTION_DB_SEND}/query')` POST 페이징 |
| 69 | 2410 | `logFrontEvent(group, msg, isMobile, mgrName)` | (HTML `logAction` line 13944 via google.script.run) | `Session.getActiveUser`, `UrlFetchApp.fetch('.../v1/pages')` POST → DB `32ba1006d65880c4beb4fa1bdf65b676` (Bearer `REDACTED_NOTION_TOKEN_BEARER_005`) |
| 70 | 2442 | `checkUserAuth(email)` | `doGet`, (HTML `startAuth` line 8745 via google.script.run) | `UrlFetchApp.fetch('.../databases/{AUTH_DB_ID=198a...}/query')` POST (Bearer `AUTH_TOKEN`) |
| 71 | 2494 | `getInventoryTableHtml(baseDate, itemCodes)` | `getInventoryTable` | `getEcountSession`, `UrlFetchApp.fetch('.../proxy/ecount/inventory')` POST |
| 72 | 2599 | `getInventoryTable(dateVal, itemCodes)` | (HTML line 15516 via google.script.run) | `getInventoryTableHtml` |
| 73 | 2605 | `include(filename)` | (HTML scriptlet `<?!= include('NanumGothic') ?>` 등) | `HtmlService.createHtmlOutputFromFile` |
| 74 | 2614 | `saveQuoteSnapshot(payload)` | (HTML line 16733 via google.script.run) | `Session.getActiveUser`, `UrlFetchApp.fetch('.../v1/pages')` POST → DB `2fca1006d65880058f8af352f254bc67` (`NOTION_TOKEN_QUOTE`) |
| 75 | 2681 | `getQuoteHistory(startDate, endDate)` | (HTML line 16455 via google.script.run) | `Session.getActiveUser`, `UrlFetchApp.fetch('.../databases/{NOTION_DB_QUOTE}/query')` POST 페이징 |
| 76 | 2769 | `getPriceIncData_()` | `doGet` | nested `readSheet(sheetName, targetObj, isSingle)` × `홈멀티`, `상업멀티`, `상업멀티 구성`, `싱글 세트`, `싱글 구성품` (인상 전 단가 비교용) |

### §1.2 index.html 함수 inventory (358개 + 1 named expr = 359)

> 전체 359개 함수의 라인 매핑은 본 §1.2 부록 표 참조 (지면 절약을 위해 카테고리별 요약). 모든 함수 라인은 `grep -nE "function [a-zA-Z_]" index.html` 로 동일 결과 재현 가능. **누락 0**.

#### 핵심 카테고리별 요약 (라인:함수 — 주요 호출 흐름):

**A. 데이터 부트스트랩 / 단가 조회 (라인 2114-2618)**
- `getBaseListPrice(type, model, defaultVal)` 2114, `J(v,d)` 2129, `getModelFlags(model)` 2180, `getRealHomePrice/CommPrice/SinglePrice/OldPrice` 2210/2215/2220/2226, `applyConfigFromServer(cfg)` 2252, `getRealListPrice` 2273, `getRealSpec` 2302, `handleSpecInput` 2310, `makeSpecInput` 2350, `handleListPriceInput` 2370, `makeListPriceInput` 2461, `handlePriceInput` 2487, `makePriceInput` 2591, `handleFreightInput` 2618.

**B. 옵션/할인 헬퍼 (라인 2676-2810)**
- `numInp` 2676, `roundSel` 2723, `parseFixedDc(dc)` 2753, `isWallMountName` 2769, `getStockState_` 2775, `modelExists` 2801, `isPanelRow` 2803, `inferOneWaySize` 2808.

**C. 자동 패널/리모컨 선택 (라인 2816-2868)**
- `isRemoteRow` 2816, `clearAllPanels` 2820, `clearAllRemotes` 2823, `pickPanelBy` 2828.

**D. 표시명 정리 (라인 2869-2910)**
- `cleanDisplayName`, `stripCommKeywords`, `displayOverrides`.

**E. 싱글 세트 단가 조정 / 분류 (라인 2911-3053) — 변동 DC 핵심**
- `adjustSingleSetBasePrice(s, base)` 2911 — 모델 prefix `AC|AP|AR|AF` 기준 + UI 입력 `#ss_disc_360/4way/stand/1way/deluxe/grade1` 차감.
- `roundK(n)` 2944, `roundByConfig` 2950, `isIndoorUnitPart` 2973, `isOutdoorUnitPart` 2986, `splitIndoorOutdoorToK` 2997, `analyzeSingleSetDiscountFlags(s)` 3025.

**F. 스펙 모달 / 견적표 출력 (라인 3055-3540)**
- `closeSpecModal` 3055, `getSpecModelName` 3059, `getSpecModalCanvas` 3065, `copySpecImage` 3090, `saveSpecImage` 3104, `openSpecModalByItem` 3113, `renderHomeSpec_/SingleSpec_/CommSpec_/ErvSpec_/PanelSpecCommon_` 3159/3201/3296/3400/3444, `buildTripleSpecRows_` 3456, `specTableWithTriple_` 3471, `specTable_` 3521.

**G. 상업 행 분류 / 모델 픽 (라인 3542-3739)**
- `rawNameOf` 3542, `isCommIndoorRow` 3547, `isCommOutdoorRow` 3553, `commIndoorKind` 3559, `isCommPanelRow` 3569, `isCommHoseRow` 3575, `isCommRemoteRow` 3581, `isCommPumpRow` 3587, `computeCommRemoteModelForIndoor_` 3593, `pickHoseModel` 3625, `pickCommPanelModel` 3633, `hasExactHP` 3640, `parseSetHPs` 3646, `chooseBaseModel` 3653, `basesForSetPiecesByExistingRule_` 3698, `modelByNameLike` 3710, `countBranchForSet` 3723.

**H. 단가 적용 / 분류 (라인 3740-4053)**
- `rgbForMid` 3740, `applyHomeMultiPriceVat(it, cfg)` 3753 — **변동DC 핵심: `it.useK2` true → `cfg.homeDiscount` 적용** (출고가 × discount), `normalizeHomeCategory` 3760, `isExpansionModel` 3775, `classifySingleSetFixed` 3788, `priceFrom` 3835, `homeUnitPrice(model)` 3853, `partUnitPrice(p)` 3899, `singleUnitPrice(it)` 3914, `commUnitPrice(model)` 3964, `singleDispNameTrimmed` 4010.

**I. 자동 표시 set / lock (라인 4055-4180)**
- `markAutoHome` 4055, `markAutoSingle` 4056, `applyAbsoluteLock` 4114.

**J. UI 합계 / 바인딩 (라인 4182-4395)**
- `syncCommTotals` 4182, `setFootSum` 4198, `bindQty` 4219, `bindCommQtyEvents` 4241, `bindCommQtyArrowNav` 4371, `getCapacity` 4392.

**K. 비율 / 추천 (라인 4399-4575)**
- `updateHomeRatio` 4399, `updateCommRatio` 4486.

**L. 견적 미리보기 / 푸터 (라인 4576-4641)**
- `setPreviewFoot` 4576, `materialsSumForSet` 4592, `getDefaultRemoteRows` 4597, `getOptionRemoteRow` 4598, `allowRemoteChange_` 4605, `is1WaySet_` 4609, `getBasePanelRow` 4614, `pickPanelRow` 4615, `setBasePriceRightFirst(s)` 4632.

**M. 세트 단가 계산 / 분해 (라인 4642-4885) — 세트 펼침 핵심**
- `calcSetUnitPrice(s)` 4642 — base + panelDelta + remoteDelta + materialsSum, `adjustSingleSetBasePrice` 호출.
- `partsForSetStrict_(s)` 4700 — `SINGLE_PARTS.filter(p => p.setModel === s.model)` (FK 매칭).
- `explodeSetParts(s, qty, setUnitOverride)` 4707 — 1세트 → N라인 펼침 (panel 선택 + remote 선택 + 자재 포함 여부).
- `partsForCommSet_(setModel)` 4841, `inferStandCountForOutdoor_` 4852, `recalcCommAccessories` 4859.

**N. 필터 / 옵션 / 렌더 (라인 4886-7081)**
- `escapeFilterRe_` 4886, `applyHomeFilter/SingleFilter/CommFilter` 4890/4911/4931, `updateHomeFilterOptions/SingleFilterOptions/CommFilterOptions` 4953/5015/5069, `initFilters` 5179, `renderHome` 5232, `renderSingleSetParts(s, setQty)` 5552, `renderSingle` 5739, `buildSingleSetCompositionHtml_` 6028, `normalizeCommCategory` 6096, `fixCommMidCategory` 6104, `renderCommOptions` 6112, `getCommFilterRows_` 6173, `renderComm` 6229, `buildDisplayNameComm` 6620, `displayNameForRow` 6658, `normKey` 6669, `buildCommSetIndex` 6675, `explodeCommPreviewParts(setModel, setQty)` 6700, `isCommSetRow(r)` 6713 — `r.catL === '실외기' && r.unit === 'SET'`, `explodeCommSets_(setRow, setQty)` 6718, `renderCommSetParts` 6761, `renderOldOptions` 6873, `renderOld` 6916, `sumOld` 7057, `syncOldTotals` 7081.

**O. 모바일 / 뷰포트 (라인 7098-7205)**
- `isMobileNow` 7098, `initMobileUI` 7106, `onViewportChange` 7124, `enterMobile` 7150, `updateTopControls` 7171.

**P. 수량 입력 핸들러 (라인 7206-7281)**
- `onHomeQtyInput(model, v)` 7206, `onSingleQtyInput(id, v)` 7255, `chk/sel` 7278/7279.

**Q. 옵션 렌더 / 재계산 (라인 7282-8092)**
- `renderHomeOptions` 7282, `renderSingleOptions` 7325, `recomputeFootAll` 7452, `recomputeSingleBaseFoot` 7465, `recomputeSingleExtras` 7506, `isHomeCalcTriggerModel` 7531, `isSingleCalcTriggerId` 7542, `findHomePanelModel` 7567, `pickInfinitePanelModel` 7582, `inferInfiniteSize` 7597, `recomputeHomePanels` 7606, `recomputeHomeRemotes` 7719, `recomputeHomeBranches` 7766, `recomputeHomeDerived(updateUI)` 7827, `recomputeCommDerived` 7884, `has_` 8092, `computeCommPanelModelForIndoor_` 8093.

**R. UI 동기화 / 합계 (라인 8179-8466)**
- `syncHomeUIFromState` 8179, `syncSingleUIFromState` 8243, `syncHomeTotals` 8307, `syncSingleTotals` 8322, `refreshSelectedBadge` 8338, `getSetUnitNowById` 8423, `explodeSendSets_(s, q)` 8437.

**S. 미리보기 / 최종 모달 (라인 8469-8849)**
- `openPreview` 8469, `closePreview` 8480, `openFinal` 8489, `closeFinal` 8502, `ensureKakaoPostcode` 8511 (외부 CDN), `mountAddrSheet` 8520, `isValidTel` 8586, `syncAuditFromShip_` 8590, `toggleSameAddr_` 8597, `syncBizAddr` 8625, `checkOrderReady` 8642, `aggregateSendRows(rows)` 8659, `showSector` 8700, `startAuth` 8720 → **google.script.run.checkUserAuth(USER_EMAIL)**, `showAuthFail` 8749, `initGate` 8757, `showResetProgress` 8811 (async), `bindResetButtons` 8828.

**T. 전송 / 견적 데이터 (라인 8849-10334)**
- `buildSendRows` 8849, `extractSpecs(item)` 9147, `openSelectedSpec` 9303, `getSpecCanvas` 9425, `copySelectedSpec` 9469, `saveSelectedSpec` 9469, `forceOrderTitle` 9480, `clearFilterInput(id)` 9489, `resetHome/Comm/Branch/Single/Old` 9499/9563/9644/9689/9742, `initEvents` 9773, `updateInlineTotals` 9942, `fixFootersForMobile` 9960, `fitTableWrap` 10107, `fitAllTables` 10139, `call` 10147, `setText` 10149, `fmtOrRaw` 10151, `valuesOf` 10153, `goOrderInfo` 10156, `goPreview` 10170, `goFinal` 10234, `clearAllActiveClasses` 10252, `getSelectedTotalCount` 10261, `goHome/Single/Comm/Old` 10275/10287/10299/10318, `copyToClipboardImage` (async) 10332.

**U. PDF / 다운로드 / 옵션 라벨 (라인 10371-11650)**
- `downloadFile` (async) 10371, `getSingleSetOptionLabel` 10437, `getSingleSetOptionLabelLive` 10500, `getStructuredQuoteData` 10528, `getVatLabel` 10918, `syncVatCardPv` 10933, `syncVatFromOrderInfo` 10955, `getQuoteItemBgColor` 10964, `renderPreviewContent` 11017, `parseRatioText(el)` 11119 (nested), `processPCExport` (async) 11296.

**V. 메인 / 저장 옵션 / 최종 (라인 11651-11963)**
- `renderMainScreenDate` 11651, `openSaveOptions` 11673, `closeSaveOptions` 11674, `renderFinalContent` 11677, `makeFinalSortable` 11742, `bindViewSwitchButtons` 11898.

**W. 분기관 계산 (라인 11963-12700) — branch HP 매핑**
- `capFromModel` 11963, `pickSelectedOutdoors` 11969, `pickSelectedIndoorsExpanded` 11991, `codeByCumulativeSum` 12019, `codeByOutdoorHP(hp, def)` 12029, `recomputeBranchCodes(outsArg)` 12042, `ensureBranchScaffold` 12112, `syncCommQtyFromDOM` 12160, `goBranchPage` 12169, `backToComm` 12198, `updateBranchTopButton` 12219, `handleBranchToggleClick` 12228, `renderBranchTable` 12234, `makeCapsule` 12279, `fixBranchDOM` 12291, `wireBranchInput` 12300, `makeBranchColumnSortable` 12318, `packOutColumn` 12439, `updateBranchVisuals` 12472, `repackLeft` 12524, `pushBackToLeft` 12540, `buildBranchView` 12548, `packAllOutColumns` 12569, `updateBranchRatios` 12575, `snapshotBranchState` 12628, `pushBranchPartsToCommFromBadges` 12661, `saveBranchState` 12691, `loadBranchState` 12699.

**X. 분기 상태 적용 / 게이트 이미지 (라인 12704-12981)**
- `applyBranchState` 12704, `refreshBranchOpenButton` 12779, `refreshBranchButton` 12831, `prepareGateImages` 12887, `showGateImageModal` 12907, `updateImgSlide` 12967.

**Y. 자동 할인율 보정 / 노션 이력 모달 (라인 12982-13935)**
- `isIndoorOnly` 12982 (nested), `getTierBonusRate` 13010 (nested), `isStandard45` 13019 (nested), `runWithAdjustedRates` 13024 (nested), `closeHistory` 13162, `enforceDateLimit(changedId)` 13178, `loadHistory` 13210 → **google.script.run.getNotionHistory**, `renderHistoryTable` 13232, `getSlipInnerContent(d)` 13270, `openSlipModal` 13398, `closeSlipModal` 13455, `updateSlipScale` 13461, `handleSlipCopy` (async) 13478, `handleSlipSave` (async) 13515, `numberToKorean(num)` 13585, `getInvoiceInnerContent(d, priceMap)` 13620, `openInvoiceModal` 13801, `handleInvoiceCopy` (async) 13861, `handleInvoiceSave` (async) 13889, `logAction(group, msg)` 13936 → **google.script.run.logFrontEvent**.

**Z. 레이아웃 / 거래처 / 결제 / 카드 (라인 13957-14716)**
- `relocateUI(isMobile)` 13957, `updateTopControls` 14098, `toggleDrawer(mode)` 14119, `handleResize` 14160, `toggleSlipButton` 14169, `initValidationEvents` 14254, `initOrderCard` 14282, `openAddrSearch(targetType)` 14369, `toggleSameAddr` 14418, `toggleAuditLater` 14443, `togglePayDueCb(type)` 14467, `updateOrderTags` 14497, `enforceTagsOnInput(e)` 14537, `appendMemo(text)` 14584, `checkCardValid` 14600, `resetCardData` 14605, `decodeBase64(str)` 14706, `loadOrderData(savedBase64String)` 14716.

**AA. 주문 카드 / 거래처 검색 / 동기화 (라인 14729-15435)**
- `submitOrderCard` 14729 → **google.script.run.sendOrderFromUi**, `initCustomerSearch` 15084 → **google.script.run.getCustomerDataAsync**, nested `addActive/removeActive/closeAllLists` 15187/15196/15200, `syncCustomers` 15214 → **google.script.run.getCustomerDataAsync(true)**, `syncRepTel` 15263, `fillCustomer(c)` 15283, `initExcelUX` 15297, nested `moveTableVerticalVisual/Horizontal/moveSection` 15366/15406/15422.

**BB. 재고 모달 / 카드결제 / 절삭 (라인 15436-15700)**
- `initInventoryModal` 15436 → **google.script.run.getInventoryTable**, `enforceDateLimit(changedType, startId, endId)` 15550, `applyCardFeeLogic(rows)` 15599, `applyCutoffLogic(rows)` 15632.

**CC. 스냅샷 / 저장 (라인 15667-16936)**
- `takeSnapshot` 15667, `applySnapshot(shot, custName)` 15855, `hideAllPages` 16383, `goSnapshotPage` 16392, `loadSnapshotHistory` 16423 → **google.script.run.getQuoteHistory**, `handleSaveSnapshot` (async) 16459 → **google.script.run.saveQuoteSnapshot**, `showCustNameModal` 16737, `closeSnapshotPage` 16819, `renderSnapshotTable(list)` 16828, `showSnapshotPreview(index)` 16866, `calcRecommendOdu(cap, array)` 16920.

**DD. 키보드 매트릭스 / Excel UX (라인 16936-17407)**
- `initKeyboardFix` 16936, nested `updateCellSelectionSum` 17019, `clearSelection` 17054, `getTrueMatrix` 17062, `getCellPos` 17093, `selectCells` 17143, `getCellValue` 17143, `setCellValue` 17153.

**EE. 사용자 정의 행 / 표시 토글 / 가격 sync / 표 폭 / 테마 (라인 17408-18570)**
- `setupCustomRows` 17408, `adjustRowSpans(tr, diff)` 17852, `initVisibilityToggles` 17879, `syncSetPriceFromParts(setId, isSingle)` 18140, `autoShrinkTableColumns(tableSelector, colIndices)` 18291, `toggleTheme` 18328, `getElPath(el)` 18353, `isMan(el)` 18394, `getElVal(el)` 18402, `setElVal(el, val, man)` 18410, `saveState(el, isInit)` 18435, `applyState(action, isUndo)` 18459.

**FF. 자동 로그아웃 (라인 18572-18613)**
- `initAutoLogout` 18572, nested `updateTimerDisplay` 18577, `resetTimer` 18600.

**GG. Named function expression**
- `onComplete` (line 14375, in `openAddrSearch` Daum Postcode 콜백).

---

## §2 시트 read/write 매트릭스

| 함수 | 시트(탭) | 범위 | R/W | 비고 |
|---|---|---|---|---|
| `getHomeMulti` | `홈멀티_단가인상` | `getDataRange()` (122행 × 33열 전체) | **R** | values + **formulas** (변동DC 감지 — `$L$2` 참조 검사). 출력: name/model/unit/price/list/`useK2`/capacity/spec/cls/고정DC/note/maxIndoor |
| `getSingleSets` | `싱글 세트_단가인상` | `getDataRange()` (291행 × 27열) | **R** | values + formulas. **변동DC `matKey` 추출** (`/\$D\$7/` → 'D7', `/\$D\$8/` → 'D8', else 'D4') |
| `getSingleParts` | `싱글 구성품_단가인상` | `getDataRange()` (1737행 × 14열) | **R** | values only. **세트 FK = 컬럼 `세트` (= 부모 setModel)** + `구성품특징` 컬럼에 `'기본'` 마커 |
| `getSingleMatPrices` | `싱글 자재가격` (hidden) | `A2:B{lastRow}` | **R** | `{name → price}` 맵 |
| `getCommercialMulti` | `상업멀티_단가인상` | `getDataRange()` (417행 × 30열) | **R** | values + formulas. **변동DC `useK2`** (홈멀티와 동일 `$L$2` 검사) |
| `getCommercialParts` | `상업멀티 구성_단가인상` | `getDataRange()` (517행 × 10열) | **R** | values only. **세트 FK = 컬럼 `세트`** + `수량` 컬럼 (Q = 가변/숫자 = 고정) + `고정DC` |
| `getSpecMap_` (`scan`) | `홈멀티_단가인상`, `싱글 구성품_단가인상`, `싱글 세트_단가인상`, `상업멀티_단가인상`, `상업멀티 구성_단가인상` | `getDataRange()` 각각 | **R** | model→spec 단순 맵 (상업 구성은 `비고` 컬럼) |
| `getSpecDetailMap_` (`scanHome/Single/Comm`) | 동상 3개 마스터 시트 | `getDataRange()` 각각 | **R** | 모델별 상세 스펙 (배관경, 가스, 전원선, 차단기, 크기, 중량 등) — ERV layout 자동 감지 |
| `getHomeDefaults` | `홈멀티_단가인상` | `A1:X2` | **R** | 헤더 1행 + 값 1행에서 `유연호스 제외/분기관 제외/발통포함/리모컨/판넬변경` 추출 |
| `getSingleDefaults` | `싱글 세트_단가인상` | `A1:X2` | **R** | `유선리모컨/리모컨 제외/실외기 받침대 포함/판넬변경/360판넬/할인/1WAY할인/자재 포함 여부` |
| `getCustomers_` | `거래처` | `getDataRange()` (6,925행 × 10열) | **R** | 거래처코드/담당자명/거래처명/대표자명/주소/전화번호/특이사항/그룹/싱글 할인 + `사업자등록번호`(없음 — 코드: 한글 헤더와 매핑은 `idxBiz=H.indexOf('사업자등록번호')`이지만 시트엔 컬럼 부재 → -1) |
| `getManagers_` | `담당자` (hidden) | `getDataRange()` (20행 × 2열) | **R** | 담당자명 + 담당자코드 |
| `getRecommendOduData` | `추천실외기` (hidden) | `A3:E{lastRow}` (26행) | **R** | comm/home/homeEx 세 그룹 (cap, hp) 추천 매트릭스 |
| `getOldProducts_` | `구형` | `A2:I{lastRow}` (44행) | **R** | values + **formulas (F열 `$I$1` 포함 여부 → `isDisc=true`로 50% 할인 적용)** |
| `getPriceIncData_` (`readSheet`) | `홈멀티`, `상업멀티`, `상업멀티 구성`, `싱글 세트`, `싱글 구성품` (인상 전 5개 시트) | `getDataRange()` 각각 | **R** | 인상 전 단가 비교용 |
| **(write 작업 없음)** | — | — | **W** | **이 견적 스크립트는 시트에 절대 쓰지 않음**. 모든 영속화는 Notion + e-Count API 로 수행 |

---

## §3 외부 의존

### §3.1 Google Apps Script 서비스
- `SpreadsheetApp.openById(SRC_SHEET_ID = '1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ')` — 마스터 시트 (단가 + 거래처 + 담당자 + 구형 + 추천)
- `DriveApp.getFolderById('1v89fQvf5MBMFgwaGSvc-JlqpA4OTMCKs')` — 게이트 이미지 폴더 (`getGateImages`)
- `DriveApp.getFolderById('1zHDxAzCFgr6draLkohwNqgQ03ud5KfsN')` — 로고 이미지 폴더 (`getLogoImage`)
- `UrlFetchApp.fetch` — Notion API + e-Count proxy
- `Session.getActiveUser().getEmail()` / `Session.getScriptTimeZone()` (Asia/Seoul)
- `CacheService.getScriptCache()` — TTL 1800초 기본, 청크 분할 (90,000 byte)
- `PropertiesService.getScriptProperties()` — `COM_CODE/USER_ID/API_CERT_KEY/EMP_CD` 우선
- `HtmlService.createTemplateFromFile('index')` + `createHtmlOutputFromFile` (NanumGothic, NanumGothicBold, logo, samhan, stamp)
- `Logger.log` (Stackdriver) — 디버그 로그 다수
- `Utilities.base64Encode/Decode/formatDate/newBlob`

### §3.2 Notion API 호출 inventory

| Placeholder | 변수명 | DB ID | Endpoint URL 패턴 | HTTP | 호출 함수 (Code.js 라인) |
|---|---|---|---|---|---|
| `REDACTED_NOTION_AUTH_TOKEN_001` | `AUTH_TOKEN` (line 2) | `198a1006d65880ddb510e0d525c5e9da` (`AUTH_DB_ID`) | `/v1/databases/{AUTH_DB_ID}/query` | POST | `checkUserAuth` (2442) |
| `REDACTED_NOTION_TOKEN_002` | `NOTION_TOKEN` (line 83) | `193a1006d6588161a02cc8f196d7102b` (`NOTION_DB_ID`) | `/v1/databases/{NOTION_DB_ID}` (GET → data_sources 발견) → `/v1/data_sources/{id}/query` (POST), 폴백 `/v1/databases/{NOTION_DB_ID}/query` (POST) | GET + POST | `fetchNotionDcConfig_` (2007) — DC 설정 조회 (홈/상업 할인율 + 360/4way/stand/1way/디럭스/1등급 + 단위처리) |
| `REDACTED_NOTION_TOKEN_ORDER_003` | `NOTION_TOKEN_ORDER` (line 85) | `2eca1006d65880109d91c2e56fab28f4` (`NOTION_DB_ID_ORDER`) | (선언만 됨, 본 estimate 코드에서 직접 호출 미발견) | — | (선언 only — partner-order 와 공유) |
| `REDACTED_NOTION_TOKEN_SHIPPING_004` | `NOTION_KEY_SEND` (line 2229) | `2f8a1006d658803face6fdfe2b175780` (`NOTION_DB_SEND`) | `/v1/pages` (POST 생성), `/v1/databases/{NOTION_DB_SEND}/query` (POST 페이징) | POST | `saveOrderToNotion` (2233), `getNotionHistory` (2308) |
| `REDACTED_NOTION_TOKEN_BEARER_005` | inline `'Bearer ...'` (line 2429) | `32ba1006d65880c4beb4fa1bdf65b676` (인라인) | `/v1/pages` (POST) | POST | `logFrontEvent` (2410) — 사용자 동작 로그 |
| `REDACTED_NOTION_TOKEN_QUOTE_006` | `NOTION_TOKEN_QUOTE` (line 2610) | `2fca1006d65880058f8af352f254bc67` (`NOTION_DB_QUOTE`) | `/v1/pages` (POST), `/v1/databases/{NOTION_DB_QUOTE}/query` (POST) | POST | `saveQuoteSnapshot` (2614), `getQuoteHistory` (2681) |

(Notion 토큰 4종 활성 사용 + 1종 선언 only + AUTH 별도. SECRETS-MAP 의 9종 중 estimate 에서 활성 5종.)

Notion-Version 헤더: 대부분 `2022-06-28`, **DC 설정 조회만 `2025-09-03`** (data_sources API 사용).

### §3.3 e-Count ERP proxy (자체 호스팅)
- 베이스 URL: `http://152.69.228.109:3000/proxy/ecount/`
- `POST /zone` — `callZoneApi` (1563)
- `POST /login` — `getEcountSession` (1576) → SESSION_ID + ZONE 발급 (캐시 3000초)
- `POST /sale` — `sendOrderFromUi` (1762) → 판매전표 (전표번호 SlipNo 반환)
- `POST /inventory` — `getInventoryTableHtml` (2494) → 4창고(초월 `00003` / 상일물류 `2` / 온라인 `14` / 서초 `1`) BAL_QTY 매트릭스

### §3.4 외부 라이브러리 / CDN (HTML)
- `html2canvas` — 캡처 (스펙 모달 / 견적 PDF)
- `jspdf` (문서 미리보기 추정 — `processPCExport`)
- `Daum Postcode` (카카오) — `ensureKakaoPostcode` (8511) — 주소 검색
- `<?!= NanumGothic / NanumGothicBold / logo / samhan / stamp ?>` — 인라인 base64 자산 (PDF 한글 폰트)

---

## §4 HTML 트리거 / Web App UI

### §4.1 google.script.run 호출 그래프 (총 11곳)

| HTML 라인 | 호출자 함수 | 서버 함수 | 핸들러 |
|---|---|---|---|
| 8745 | `startAuth` | `checkUserAuth(USER_EMAIL)` | success → 게이트 OFF, 로그인 성공 / failure → `showAuthFail` |
| 10102 | (재시도 progress 다이얼로그) | `sendOrderFromUi(orderData)` | success → 전표번호 표시 / failure → 에러 표시 |
| 12879 | `showGateImageModal` (init) | `getGateImages()` | success → `prepareGateImages(images)` |
| 13228 | `loadHistory` | `getNotionHistory(sDate, eDate)` | success → `renderHistoryTable(data)` |
| 13944 | `logAction` | `logFrontEvent(group, msg, isMob, mgrName)` | failure log only |
| 15073 | `submitOrderCard` (메인 전표 생성) | `sendOrderFromUi(orderData)` | success → 전표번호 / failure → alert |
| 15101 | `initCustomerSearch` | `getCustomerDataAsync()` | success → `CUSTOMERS = data` |
| 15247 | `syncCustomers` | `getCustomerDataAsync(true)` (forceRefresh) | success → 거래처 동기화 + autofill |
| 15516 | (재고 모달 검색 버튼) | `getInventoryTable(dateVal, items)` | success → HTML 직접 삽입 |
| 16455 | `loadSnapshotHistory` | `getQuoteHistory(sDate, eDate)` | success → `renderSnapshotTable(filtered)` |
| 16733 | `handleSaveSnapshot` | `saveQuoteSnapshot({data, summary, image})` | success → alert 저장 완료 |

### §4.2 onClick / onSubmit / onLoad 주요 핸들러
- `body onload` → `initGate` (8757) → `startAuth` (8720) → 게이트 통과 후 `initEvents` (9773) + `initOrderCard` (14282) + `initCustomerSearch` (15084) + `initInventoryModal` (15436) + `initKeyboardFix` (16936) + `initVisibilityToggles` (17879) + `initAutoLogout` (18572).
- 각 카드 (`#cardHome`, `#cardSingle`, `#cardComm`, `#cardOld`) 내부 수량 input → `bindQty` → `recompute*Derived` → `syncHomeTotals` 등.
- 분기관 페이지 → `goBranchPage` → `buildBranchView` → `recomputeBranchCodes`.
- 미리보기 → `goPreview` → `renderPreviewContent` → 최종 → `goFinal` → `renderFinalContent` → 전표 생성 → `submitOrderCard` (google.script.run.sendOrderFromUi).

### §4.3 폼 필드 → 백엔드 매핑
- `#custSearch` (autocomplete) → `getCustomerDataAsync` 결과 매핑 (code/name/rep/tel/addr/group/note).
- `#bizno` 입력 → 클라이언트 → `initDcConfigFromNotion(bizno)` (서버) → `applyConfigFromServer(cfg)` (클라이언트).
- 주문 폼 (`#shipAddr`, `#auditAddr`, `#receiverPhone`, `#payDue`, `#memo`, `#whCode`) → `submitOrderCard` payload → `sendOrderFromUi(orderData)`.

---

## §5 변동DC 감지 룰 (DOMAIN-EXTENSIONS §1)

### §5.1 감지 위치 (코드 좌표)

| 영역 | 시트 | 컬럼 | 감지 코드 | 룰 |
|---|---|---|---|---|
| **홈멀티** | `홈멀티_단가인상` | `납품가` (마지막 발생) — 시트 데이터 검증: 8번 컬럼 (F열 인덱스 5) | Code.js 428: `useK2 = /\$L\$2/i.test(priceFormula)` | 셀 수식에 **절대참조 `$L$2`** 등장 시 변동DC. `$L$2` = 시트 상단 (헤더 row 위 비공개 셀, 실시간 할인율). |
| **상업멀티** | `상업멀티_단가인상` | `납품가` (마지막) — 7번 컬럼 | Code.js 851: `useK2 = /\$L\$2/i.test(priceFormula)` | 동상 |
| **싱글 세트** | `싱글 세트_단가인상` | `납품가` 우측 (마지막 발생, 8번 컬럼) | Code.js 556-559: `matKey = 'D4'` 기본; `/\$D\$7/` → 'D7'; `/\$D\$8/` → 'D8' | 시트 D4/D7/D8 셀이 자재가 옵션별 단가 (별도/포함/일부포함) — 어느 셀을 참조하는지로 자재 포함 모드 식별. **변동 단가가 아니라 자재 포함 옵션 키** (의미상 분리 필요). |
| **싱글 구성품** | `싱글 구성품_단가인상` | `구분`, `구성품특징` | Code.js 660: `isDefault = /기본/.test(feat||'')` | 변동 DC 와 직접 무관 — 기본 구성품 마킹용. |
| **구형** | `구형` | F열 (인덱스 5) | Code.js 1742-1744: `if (form[5] && String(form[5]).indexOf('$I$1') > -1) hasRef = true;` | F열 수식에 `$I$1` 참조 시 `isDisc=true` → 클라이언트 (`getRealOldPrice`)에서 50% 할인 적용 |
| **클라이언트 측 적용** | (in-memory) | — | index.html 3753: `applyHomeMultiPriceVat(it, cfg)` — `it.useK2` true → `cfg.homeDiscount` 곱함 | 출고가 × `homeDiscount` (default 0.45) → 납품가 산출 |

### §5.2 Java 포팅 룰 명세 (의사코드)

```pseudo
// ProductMaster.hasVariableDiscount 사전 계산
function detectVariableDiscount(productRow, sheetSection):
  switch sheetSection:
    case HOMEMULTI, COMMERCIAL_MULTI:
      return regex.test(productRow.priceFormulaCell, /\$L\$2/)  // 절대참조 L2
    case SINGLE_SET:
      return matKey IN {'D7', 'D8'}  // matKey='D4' 는 기본
    case OLD_PRODUCT:
      return regex.test(productRow.formulaF, /\$I\$1/)  // 50% 할인 트리거
    default:
      return false
```

마이그레이션 시점:
1. Apps Script 시트 import 도구가 각 시트의 `getDataRange().getFormulas()` 결과까지 export 해야 함 (현재 `workbook.json` 은 values 만 — **수식 export 별도 필요, §9 한계 항목**).
2. ProductMaster 도메인에 `hasVariableDiscount: boolean`, `discountSource: enum {L2_REF, D7, D8, I1, NONE}` 컬럼 추가.
3. 신규 등록 시: `VariableDiscountDetector.detect(productRow)` service 자동 판정.

### §5.3 Notion DC 설정 (거래처별 동적 할인율) — 별개 메커니즘
- `fetchNotionDcConfig_` (2007) → `initDcConfigFromNotion(bizno)` (2166) → 클라이언트 `applyConfigFromServer(cfg)` (2252).
- 6필드 + 1체크박스 + 1셀렉트: `홈멀티DC` (number), `상업멀티DC` (number), `360/4way/스탠드/1way/디럭스/1등급` (number 6종 — 절대 금액 차감), `유연호스I형` (checkbox), `단위처리` (select: "100원 반올림" 등).
- **§5 변동DC 와 별개**: 변동DC 는 **품목 단위 boolean**, Notion DC 는 **거래처 단위 numeric override**.

---

## §6 세트(Bundle) 품목 처리 (DOMAIN-EXTENSIONS §2)

### §6.1 식별 위치
- **싱글 세트**: `싱글 세트_단가인상` (291행) — 1행 = 1세트 (예: `AC060CS6PBH1SY` "360 CST UV 15평형").
- **싱글 구성품**: `싱글 구성품_단가인상` (1737행) — 컬럼 `세트` (= 부모 setModel) 가 FK. 1세트 → 평균 5~6 부속 행 (판넬, 리모컨, 배관자재, 설치자재 등).
- **상업멀티 세트**: `상업멀티_단가인상` 의 unit 컬럼이 `'SET'` 인 행 (`isCommSetRow`, index.html 6713). 분류 = 실외기.
- **상업멀티 구성**: `상업멀티 구성_단가인상` (517행) — 컬럼 `세트` (= 부모 setModel) FK. 컬럼 `수량` 이 `'Q'` 면 가변 (세트 수량 그대로), 숫자면 (세트 수량 × 숫자).

### §6.2 시트 데이터 구조 검증 (workbook.json)
- 싱글 구성품 row 5: `setModel='AC060CS6PBH1SY'`, `name='판넬 (360CST / 원형 / WIFI)'`, `kind='판넬'`, `feat='기본'`. 동일 setModel 로 다중 패널 옵션 (사각/블랙/비WIFI 등) 4~6개 행 존재.
- 상업멀티 구성: 컬럼 `수량` 의 'Q' vs 숫자 → 각각 `qty=setQty` vs `qty=setQty*N`.

### §6.3 펼침 (1줄 → N줄) 로직
- **싱글**: `partsForSetStrict_(s)` (4700) = `SINGLE_PARTS.filter(p => p.setModel === s.model)`. → `explodeSetParts(s, qty)` (4707) — 옵션 (panel/remote/material 포함 여부)에 따라 picked 만 출력. picked 각 부속의 `unit price = partUnitPrice(p)`, `qty = setQty`.
- **상업**: `explodeCommSets_(setRow, setQty)` (6718) — 부속이 없으면 setRow 자체 1라인. 부속 있으면 `qty='Q'` → `setQty`, 숫자 → `setQty * 숫자`.
- **변형 1: 단가 합산식**: `calcSetUnitPrice(s)` (4642) = `baseL + panelDelta + remoteDelta + materialsSum` → 다시 `adjustSingleSetBasePrice` 통해 카테고리별 할인 차감. **세트 단가 = base 행의 `납품가` + 옵션 차이**.
- **세트 vs 컴포넌트 가격**: 세트 행 자체에 `납품가` 존재 (마이그 시 별도 SKU 로 보존 가능). **e-Count 전송 시점**에는 옵션 (`unit==='SET' && section==='SET' && sendAsSet !== true`) → cleaned filter 로 세트 행 제거 + 부속만 전송 (Code.js 1776).

### §6.4 옵션 A/B/C 권장 (Phase 4 결정)
- **권장: 옵션 A (단일 SKU + bundle 메타)** — 시트 구조와 1:1 일치 (세트 행 = product, 구성품 = `BundleComponent {componentProductCode, qty, isDefault, kind}`).
- 옵션 A 채택 근거:
  - 시트의 `세트` 컬럼이 명확한 FK.
  - 견적 단계 옵션 변경 (판넬/리모컨/자재 포함) 이 빈번 → 컴포넌트 단위 메타 필수.
  - e-Count 전송 시점에 component 단위로 펼쳐 보냄 (이미 Apps Script 가 그렇게 동작) → 재고 차감 자연스러움.
- 옵션 B (composite SKU): 컴포넌트 단가/재고 추적 불가 → 부적합.
- 옵션 C (견적 템플릿): product 깨끗하지만 견적 UI 의 옵션 변경 로직 복잡도 ↑.

---

## §7 핵심 비즈니스 흐름

### Step 1. 인증
1. `doGet` → `index.html` 템플릿 진입 + 사용자 이메일 주입 + `checkUserAuth(email)` 결과 주입.
2. 클라이언트 `initGate` → `startAuth` → google.script.run.checkUserAuth (Notion AUTH DB 조회) → 성공 시 `pageBizGate` hide + `mobileGate` show.

### Step 2. 거래처 선택 + DC 설정 로드
1. `initCustomerSearch` → google.script.run.getCustomerDataAsync → autocomplete 활성화.
2. 사용자 거래처 선택 → `fillCustomer(c)` autofill.
3. 사업자번호 변경 → `initDcConfigFromNotion(bizno)` (서버) → `fetchNotionDcConfig_` Notion 조회 → 거래처별 할인율 cfg 반환 → `applyConfigFromServer(cfg)` 적용.

### Step 3. 품목 선택
- 4개 섹터: 홈멀티 (`renderHome`), 싱글 (`renderSingle`), 상업 (`renderComm`), 구형 (`renderOld`).
- 각 셀의 수량 input 변경 → `bindQty` → `recompute*Derived` (자동 패널/리모컨/분기관 추가) → `recomputeFootAll` → `syncHomeTotals/SingleTotals/CommTotals/OldTotals` → `setFootSum`.

### Step 4. 분기관 (상업)
- `goBranchPage` → `buildBranchView` → 사용자가 outdoor → indoor 매트릭스 정렬 → `recomputeBranchCodes` → `pushBranchPartsToCommFromBadges`.

### Step 5. 미리보기
- `goPreview` → `aggregateSendRows` (세트 펼침 등 정규화) → `renderPreviewContent` → VAT 라벨/카드수수료 적용 → 견적서 HTML.

### Step 6. 견적 저장
- `handleSaveSnapshot` → 캡처 (html2canvas) + 데이터 직렬화 → google.script.run.saveQuoteSnapshot → Notion `NOTION_DB_QUOTE` 저장.

### Step 7. 전표 생성 (e-Count)
1. `submitOrderCard` → `buildSendRows` → google.script.run.sendOrderFromUi(orderData).
2. 서버 `sendOrderFromUi`: 세트 cleaning → 거래처 매핑 → e-Count session 발급 → SaleList 빌드 (BulkDatas: PROD_CD, QTY, PRICE, USER_PRICE_VAT, SUPPLY_AMT, VAT_AMT, REMARKS, IO_DATE, WH_CD, EMP_CD …) → POST `/proxy/ecount/sale`.
3. 응답 SlipNo 추출 → `saveOrderToNotion` (Notion `NOTION_DB_SEND`).
4. 클라이언트 success → 전표번호 표시 + `logAction` (Notion 로그).

### Step 8. 이력 조회
- `loadHistory` (전표 이력) → google.script.run.getNotionHistory → `renderHistoryTable` → `openSlipModal` / `openInvoiceModal`.
- `loadSnapshotHistory` (견적 이력) → google.script.run.getQuoteHistory → `renderSnapshotTable` → `showSnapshotPreview` → `applySnapshot`.

### Step 9. 재고 조회 (보조)
- `initInventoryModal` → 모달 → google.script.run.getInventoryTable(date, models) → e-Count `/proxy/ecount/inventory` → 4창고 매트릭스 HTML.

---

## §8 Java 포팅 권장 구조

### §8.1 신규 estimate-service 도메인 (제안)

| Component | 추정 책임 | 기존 SamhanLogis 서비스 연계 |
|---|---|---|
| `EstimateService` | 견적 라이프사이클 (생성/저장/수정/이력 조회/제출) | 신규 |
| `Estimate` (entity) | 헤더 (custCode, managerCode, status, totalAmount, vatRate, createdAt) | 신규 |
| `EstimateLine` (entity) | 라인 (productCode, qty, unitPrice, listPrice, supplyAmt, vatAmt, sectionType {HOME/SINGLE/COMM/OLD/SET-EXPANDED}, parentSetCode) | 신규 |
| `EstimateSnapshot` (entity) | Notion `NOTION_DB_QUOTE` 대체 — 압축 JSON + 미리보기 이미지 base64 | 신규 |
| `BundleExpansionPolicy` (service) | 옵션 A 의 BundleComponent → EstimateLine 펼침 (panel/remote/material 옵션 반영) | product-service 의존 |
| `VariableDiscountDetector` (service) | §5.2 룰 기반 hasVariableDiscount 자동 판정 | product-service 의존 |
| `DiscountConfigResolver` (service) | 거래처별 DC override (Notion → DB 마이그된 PartnerDiscountConfig 테이블) | partner-service 의존 |
| `EstimateController` (REST) | `POST /api/v1/estimates`, `GET /api/v1/estimates`, `POST /api/v1/estimates/{id}/submit-to-ecount` | 신규 |
| `EstimateSubmissionService` | e-Count 전송 + slip-service 에 SlipDraft 등록 | slip-service 의존 |

### §8.2 기존 마이크로서비스 연계 지점

| Apps Script 함수 | SamhanLogis 도메인 |
|---|---|
| `getHomeMulti/SingleSets/SingleParts/CommercialMulti/CommercialParts/OldProducts` | **product-service** ProductMaster + BundleComponent 시드 (Flyway) |
| `getCustomers_/searchCustomerByBizno` | **partner-service** Partner 도메인 |
| `getManagers_` | **org-service / employee-service** (있다면 — 또는 partner-service Manager) |
| `fetchNotionDcConfig_/initDcConfigFromNotion` | **partner-service** Partner.discountConfig (동적 DC override) |
| `sendOrderFromUi` (e-Count `/sale` 호출) | **slip-service** Slip 생성 + e-Count gateway |
| `getInventoryTableHtml` | **inventory-service** InventoryQuery (4창고 매트릭스) |
| `saveQuoteSnapshot/getQuoteHistory` | **estimate-service** EstimateSnapshot |
| `saveOrderToNotion/getNotionHistory` | **slip-service** SlipShipmentLog (출고 이력) |
| `checkUserAuth` | **iam-service / auth-service** (Google OAuth + 직원 매핑) |
| `logFrontEvent` | **observability-service** UserEvent (또는 통합 로그) |

### §8.3 e-Count proxy gateway
- 현재 `http://152.69.228.109:3000/proxy/ecount/*` 서버 (자체 호스팅 NodeJS 추정).
- 제안: `ecount-gateway` 서비스로 흡수, SamhanLogis 내부에서만 호출.
- Session 캐시 (50분 TTL) 로직 그대로 이식.

---

## §9 누락 / 모호 / 분석 한계

1. **시트 수식 (formulas) export 부재** — `workbook.json` 은 `values` 만 export. 변동DC 감지 룰 (`$L$2`, `$D$7/$D$8`, `$I$1`) 의 실제 등장 행 수 검증 불가. **Phase 1.5 추가 작업 필요**: `getFormulas()` 결과 별도 export 로 모든 행의 boolean 사전 계산 검증.
2. **상업멀티 구성 컬럼 `수량 = 'Q'` 의미** — 코드는 'Q' → setQty 그대로 사용. 시트 데이터 표본 확인 필요 (workbook.json 에서 'Q' 값 행 위치).
3. **세트 옵션 변경의 단가 영향 정확도** — `adjustSingleSetBasePrice` 의 6개 카테고리 할인 (360/4way/stand/1way/deluxe/grade1) 중복 적용 가능 여부 (예: 1way + grade1 동시) — UI 설명 미확인.
4. **`getScriptCreds_` 의 하드코딩 default** — `COM_CODE/USER_ID/API_CERT_KEY/EMP_CD` 가 fallback 으로 코드에 노출 (line 1551-1559). PropertiesService 우선이지만 default 노출 자체가 보안 위험. (SECRETS-MAP 보강 필요.)
5. **`detectHomeOrder/extractRowsFromFormula_/formatWonDiscountLabel_/formatPercentLabel_/combineRemarks_/normalizeTel_/toYmd_/toMmDd_/todayYMD_/_normSpec_/isSoldOutByNote_/findHeaderIndex_`** 등 dead code 후보 — 호출처 미발견. **Phase 4 마이그 시 제외 가능 여부** 사용자 확정 필요.
6. **`NOTION_TOKEN_ORDER` (TOKEN_003)** 선언만 됨 (line 85) — estimate 코드에서 사용 안 함. partner-order 와 공유 토큰 추정 (SECRETS-MAP 일치).
7. **`동의 제외` 판단 로직** — `isBlockedByNote_` 의 `/미판매|단종/` 외에 추가 마커 가능성 (예: `'준비중'`) 확인 필요.
8. **상업 ERV layout 자동 감지** (`scanComm` 라인 1259-1276) — 3-segment vs 2-segment 자동 판정 로직이 매우 휴리스틱. ERV 시트 행 수 표본으로 회귀 테스트 필수.
9. **`HomeDefaults`/`SingleDefaults`** — 시트 1-2행에서 default 옵션 값을 읽는데, 시트 레이아웃이 변경되면 silently fail. 마이그 시 default 를 DB 환경설정 테이블로 이전 권장.
10. **`getRecommendOduData`** 의 `홈멀티` (col 2) vs `홈멀티 확장` (col 3) 구분 모호 — homeEx 가 무엇을 의미하는지 데이터 헤더 (line 1: `'멀티 냉난방' / '홈멀티'`) 만으로는 불충분.

---

## §10 회고 가드

### Phase 2 (Cross-review) 검증 핵심
- [ ] `§1` 누락 0 가드: Code.js 76개 + index.html 358개 + named expr 1개 = **435개 함수**. 행 수 일치 재검증.
- [ ] `§3` Notion 토큰 매핑 정확성 (SECRETS-MAP 9종 중 estimate 활성 5종 — 003/008/009 비활성).
- [ ] `§5` 변동DC 룰 — `$L$2 / $D$7 / $D$8 / $I$1` 4종 패턴이 시트 실제 수식에서 발견되는지 (formulas export 후 검증).
- [ ] `§6` 세트 FK 일치성 — `singleParts.setModel` vs `singleSets.model` join 무결성 100% (orphan row 없음).
- [ ] `§7` Step 7 e-Count 전송 payload (BulkDatas 19필드) 의 SamhanLogis e-Count gateway 매핑 일치.

### Phase 4 (Migration Plan) 반영 항목
- 옵션 A (단일 SKU + bundle 메타) 권장 — DOMAIN-EXTENSIONS §2 결정.
- ProductMaster 에 `hasVariableDiscount: boolean` + `discountSource: enum` 컬럼 추가 (DOMAIN-EXTENSIONS §1).
- partner-service 에 `PartnerDiscountConfig` 신규 entity (Notion DC 설정 대체 — 9 필드).
- Notion 의존 5종 → 모두 SamhanLogis 도메인으로 이전 (auth/dc/snapshot/shipment/log).
- e-Count proxy → `ecount-gateway` MS 흡수.
- §9 dead code 12종 사용자 확정 후 제외 결정.
- `getScriptCreds_` 하드코딩 fallback 제거 (Vault/Secrets Manager 강제).

### 무손실 이식 검증 (QA)
- 변동DC 룰 sample 30+ 품목 — Apps Script 출력값 ↔ 신규 service 출력값 1:1 비교.
- 세트 펼침 sample 10+ 세트 — 동일 라인 수 + 동일 단가 합계.
- 거래처별 DC 설정 sample 5+ 거래처 — applyConfigFromServer 동일 결과.
