# GAS 전수조사 v2 — 포팅 견적 `index.ejs` 전체

## 1. 완결성 집계

> **배정 489 / 분류 489 / 미분류 0**
>
> **업무규칙 217 + UI·표시 174 + 인프라·유틸 54 + dead_code 44 = 489**

- 고정 분모와 함수명·줄번호는 `docs/dev-reports/2026-08-11-gas-function-inventory-v2.md`의 `ESTIMATE-EJS` 489개를 그대로 사용했다. 현재 작업 파일의 물리 줄 수를 다시 분모로 삼지 않았다.
- 대상: `clients/web/estimate-app/views/index.ejs` 전체. 비교 기준: 원본 GAS 견적·주문 993함수 보고서, 원본 금액/나머지 보고서, 포팅 주문 lib 615함수 보고서.
- `dead_code`는 함수명 호출만 세지 않고 HTML 인라인 이벤트, 문자열 리터럴, `window[...]` 접근, EJS 스크립틀릿, 중첩 함수의 부모 도달성을 함께 확인했다. 정의 1회뿐인 함수와 도달 불가능한 중첩 함수만 확정했다. 애매한 계산·검증·payload 함수는 업무규칙으로 남겼다.
- 아래 R01~R08은 업무규칙 217개를 빠짐없이 배정한 규칙군이다. 각 규칙군의 ① 함수 목록에 포함된 모든 함수는 같은 절의 ② 조건→결과, ③ 리터럴, ④ 입력, ⑤ 스키마, ⑥ 기본값, ⑦ 원본 대조를 적용받는다.

## 2. 489개 전수 분류 원장

### 2.1 업무규칙 217

```text
isSlipPublishSuccess:1311, getBaseListPrice:2267, catalogSpecialMetadata:2291, getModelFlags:2368,
getRealHomePrice:2398, getRealCommPrice:2403, getRealSinglePrice:2408, getRealOldPrice:2414,
estimateConfigNumber:2463, getOldDiscountPercent:2468, getCardFeeRate:2472, getVatDivisor:2476,
getFooterNoticeHtml:2558, applyEstimateTotalAdjustments:2567, applyCustomerDiscounts:2585, numOr:2587,
getRealListPrice:2646, handleListPriceInput:2743, makeListPriceInput:2834, handlePriceInput:2860,
makePriceInput:2964, handleFreightInput:2991, parseFixedDc:3126, getStockState_:3148,
isPanelRow:3176, inferOneWaySize:3181, isRemoteRow:3189, pickPanelBy:3201,
stripCommKeywords:3250, displayOverrides:3272, adjustSingleSetBasePrice:3284, roundK:3317,
roundByConfig:3323, isIndoorUnitPart:3346, isOutdoorUnitPart:3359, splitIndoorOutdoorToK:3370,
analyzeSingleSetDiscountFlags:3398, getSpecModelName:3432, isCommIndoorRow:4044, isCommOutdoorRow:4050,
commIndoorKind:4056, isCommPanelRow:4066, isCommHoseRow:4072, isCommRemoteRow:4078,
isCommPumpRow:4084, computeCommRemoteModelForIndoor_:4090, pickHoseModel:4122, hasExactHP:4137,
parseSetHPs:4143, chooseBaseModel:4150, modelByNameLike:4207, countBranchForSet:4220,
normalizeHomeCategory:4257, isExpansionModel:4272, classifySingleSetFixed:4285, priceFrom:4326,
homeUnitPrice:4344, partUnitPrice:4390, commUnitPrice:4455, singleDispNameTrimmed:4501,
markAutoHome:4546, markAutoSingle:4547, trackInteraction:4560, applyAbsoluteLock:4605,
set:4630, set:4648, sumHome:4666, sumSingles:4667, sumComm:4668, syncCommTotals:4673,
setFootSum:4689, getCapacity:4880, updateHomeRatio:4887, updateCommRatio:4974,
materialsSumForSet:5080, isDefaultComponent_:5085, getDefaultRemoteRows:5089, getOptionRemoteRow:5090,
allowRemoteChange_:5097, is1WaySet_:5101, getBasePanelRow:5106, pickPanelRow:5107,
setBasePriceRightFirst:5124, calcSetUnitPrice:5134, partsForSetStrict_:5192, explodeSetParts:5199,
partsForCommSet_:5335, inferStandCountForOutdoor_:5346, recalcCommAccessories:5353,
applyHomeFilter:5386, applySingleFilter:5407, applyCommFilter:5427, updateHomeFilterOptions:5449,
updateSingleFilterOptions:5511, updateCommFilterOptions:5565, updateHomeRowPrice:5971,
normalizeCommCategory:6590, fixCommMidCategory:6598, onCommOptionChange:6607, renderCommOptions:6623,
getCommFilterRows_:6678, renderComm:6734, updateCommRowPrice:6993, buildDisplayNameComm:7123,
buildCommSetIndex:7178, explodeCommPreviewParts:7203, explodeCommSets_:7221, syncOldTotals:7587,
renderHomeOptions:7788, renderSingleOptions:7831, recomputeFootAll:7958, recomputeSingleBaseFoot:7971,
recomputeSingleExtras:8012, isHomeCalcTriggerModel:8037, isSingleCalcTriggerId:8048,
recomputeHomePanels:8112, setP:8159, recomputeHomeRemotes:8225, setR:8248,
recomputeHomeBranches:8272, setB:8274, recomputeHomeDerived:8333, setH:8354,
recomputeCommDerived:8390, requireCommCatalogRow_:8392, computeCommPanelModelForIndoor_:8608,
syncHomeUIFromState:8694, syncSingleUIFromState:8770, syncHomeTotals:8834, syncSingleTotals:8849,
explodeSendSets_:8966, isValidTel:9115, checkOrderReady:9171, aggregateSendRows:9188,
buildSendRows:9378, addP:9396, getActiveFixedDc:9419, getLiveSpec:9439,
resetHome:10036, resetComm:10100, resetBranch:10181, resetSingle:10226, resetOld:10279,
updateInlineTotals:10479, fixFootersForMobile:10497, getSelectedTotalCount:10813,
getSingleSetOptionLabel:10989, getSingleSetOptionLabelLive:11053, getStructuredQuoteData:11081,
getCustoms:11431, getVatLabel:11478, syncVatCardPv:11495, syncVatFromOrderInfo:11517,
parseRatioText:11681, processPCExport:11854, processBOCSVExport:12219,
pickSelectedOutdoors:12619, pickSelectedIndoorsExpanded:12641, codeByCumulativeSum:12669,
codeByOutdoorHP:12679, recomputeBranchCodes:12692, ensureBranchScaffold:12762,
syncCommQtyFromDOM:12810, backToComm:12848, updateBranchTopButton:12869,
handleBranchToggleClick:12878, fixBranchDOM:12941, makeBranchColumnSortable:12968,
updateBranchVisuals:13122, updateBranchRatios:13225, snapshotBranchState:13278,
pushBranchPartsToCommFromBadges:13311, saveBranchState:13341, loadBranchState:13349,
applyBranchState:13354, isIndoorOnly:13633, getTierBonusRate:13661, isStandard45:13670,
runWithAdjustedRates:13675, openPreview:13750, buildSendRows:13756, getSlipInnerContent:13922,
updateSlipScale:14115, handleSlipCopy:14132, handleSlipSave:14169,
getInvoiceInnerContent:14274, handleInvoiceCopy:14515, handleInvoiceSave:14543,
getCurrentSlipSnapshot:14823, initOrderCard:14989, syncAudit:15070,
onKakaoAddrComplete:15148, toggleSameAddr:15316, toggleAuditLater:15341,
togglePayDueCb:15365, updateOrderTags:15395, enforceTagsOnInput:15435,
appendMemo:15482, checkCardValid:15498, resetCardData:15503, submitOrderCard:15633,
getCanonicalSection:15715, syncRepTel:16319, openInventoryCheck:16504,
applyCardFeeLogic:16651, applyCutoffLogic:16684, takeSnapshot:16724, applySnapshot:16916,
res:16939, resSet:16940, res:17052, handleSaveSnapshot:17550, restoreSnapshot:17963,
calcRecommendOdu:18030, addCustomRow:18544, updateCustomSubtotal:18666,
syncSetPriceFromParts:19230
```

### 2.2 UI·표시 174

```text
toggleTheme:1318, estimateOptionHtml:2520, estimateSpecValueHtml:2524, setField:2613, setCheck:2619,
handleSpecInput:2683, makeSpecInput:2723, numInp:3049, roundSel:3096, cleanDisplayName:3242,
closeSpecModal:3428, getSpecModalCanvas:3438, copySpecImage:3463, saveSpecImage:3477,
openSpecModalByItem:3486, formatSpecialPriceForDisplay:3532, renderHomeSpec_:3537,
renderSingleSpec_:3579, renderCommSpec_:3675, renderErvSpec_:3782, renderPanelSpecCommon_:3826,
buildTripleSpecRows_:3838, specTableWithTriple_:3853, renderComponentSpecs_:3904,
specTable_:4018, bindCommQtyArrowNav:4859, escapeFilterRe_:5382, initFilters:5675,
renderHome:5728, renderSingleSetParts:6047, getRank:6103, renderSingle:6234,
renderCommSetParts:7268, renderOldOptions:7380, renderOld:7423, sumOld:7563,
onViewportChange:7630, enterMobile:7656, refreshSelectedBadge:8865, openPreview:8998,
closePreview:9009, closeFinal:9031, syncAuditFromShip_:9119, toggleSameAddr_:9126,
syncBizAddr:9154, startAuth:9249, showAuthFail:9278, initGate:9286, showResetProgress:9340,
bindResetButtons:9357, extractSpecs:9684, add:9687, openSelectedSpec:9840, addIfTarget:9842,
getSpecCanvas:9962, copySelectedSpec:9990, saveSelectedSpec:10006, forceOrderTitle:10017,
clearFilterInput:10026, initEvents:10310, bindTap:10361, bindOrderHotkeys:10426,
setTimeout:10642, fitTableWrap:10659, fitAllTables:10691, goOrderInfo:10708,
goPreview:10722, goFinal:10786, clearAllActiveClasses:10804, goHome:10827,
goSingle:10839, goComm:10851, goOld:10870, hasPart:11064, getQuoteItemBgColor:11526,
renderPreviewContent:11579, callback:12158, escapeBOCsvField:12209, renderMainScreenDate:12301,
openSaveOptions:12323, closeSaveOptions:12324, renderFinalContent:12327,
makeFinalSortable:12392, onStart:12399, onMove:12434, onEnd:12471, moveAt:12495,
bindNav:12522, bindViewSwitchButtons:12548, goBranchPage:12819, renderBranchTable:12884,
makeCapsule:12929, wireBranchInput:12950, applyFlip:13037, packOutColumn:13089,
repackLeft:13174, pushBackToLeft:13190, buildBranchView:13198, refreshBranchOpenButton:13429,
refreshBranchButton:13481, prepareGateImages:13537, showGateImageModal:13557,
updateImgSlide:13618, closeHistory:13813, loadHistory:13861, renderHistoryTable:13884,
openSlipModal:14052, closeSlipModal:14109, openInvoiceModal:14455, updateScale:14500,
logAction:14590, relocateUI:14611, updateTopControls:14752, toggleDrawer:14773,
handleResize:14814, toggleSlipButton:14867, openAddrSearch:15093, openAddrDock_:15110,
applyAddrToTarget:15157, runNaverLocalSearch:15174, scheduleNaverAutoSearch:15206,
escapeHtmlAddr:15220, onNaverSearchSuccess:15227, makeAddrRow_:15267,
composeAddrWithBuilding_:15285, dedupeAddrWords_:15295, onNaverSearchFail:15308,
fmtPct:15695, fmtMoney:15696, initCustomerSearch:16013, addActive:16118,
removeActive:16127, closeAllLists:16131, initManagerSearch:16152, addActive:16240,
removeActive:16249, closeAllLists:16253, syncCustomers:16267, initExcelUX:16353,
moveTableVerticalVisual:16422, moveTableHorizontal:16462, moveSection:16478,
initInventoryModal:16492, doSearch:16530, closeModal:16580, enforceDateLimit:16602,
goSnapshotPage:17458, loadSnapshotHistory:17489, loadSnapshotByCustomer:17525,
showCustNameModal:17841, closeSnapshotPage:17923, renderSnapshotTable:17932,
showSnapshotPreview:17971, initKeyboardFix:18046, forceOrderTitle:18102,
updateCellSelectionSum:18129, clearSelection:18164, selectCells:18223,
setupCustomRows:18518, ensureCustomBlankRow:18646, adjustRowSpans:18942,
initVisibilityToggles:18969, makeToggle:19121, autoShrinkTableColumns:19381,
toggleTheme:19418, getElPath:19443, isMan:19484, getElVal:19492, setElVal:19500,
saveState:19525, applyState:19549, initAutoLogout:19663, updateTimerDisplay:19668,
resetTimer:19691
```

### 2.3 인프라·유틸 54

```text
makeRunner:1262, target:1264, get:1266, J:2282, escapeEstimateHtml:2480,
escapeEstimateAttr:2488, safeEstimateImageSrc:2491, safeEstimateImageSrcAttr:2508,
escapeEstimateJsString:2512, sanitizeLegacyTableHtml:2527, has:3202, join_:3792,
rawNameOf:4039, rgbForMid:4237, first:4328, syncIcon:5689, syncIcon:5703,
syncIcon:5719, normKey:7172, isMobileNow:7604, apply:7613, chk:7784, sel:7785,
swap:8630, el:9233, join_:9713, el:10050, setVal:10129, setChk:10133,
el:10152, el:10311, getKstToday:10316, call:10699, setText:10701,
fmtOrRaw:10703, fmt:11661, toYMD:13788, getMMDD:13933, numberToKorean:14239,
setVal:15511, setChk:15545, decodeSnapshotState:15607, getEl:15638, getVal:15639,
getInputVal:15673, getManagerName_:16144, getManagerCode_:16148, toYMD:16594,
getTrueMatrix:18172, getCellPos:18203, getCellValue:18253, setCellValue:18263,
updateSpan:18722, installCspEventListeners:19707
```

### 2.4 dead_code 44

```text
catalogSpecialSource:2300, applyConfigFromServer:2440, getRealSpec:2675,
isWallMountName:3142, modelExists:3174, clearAllPanels:3193, clearAllRemotes:3196,
pickCommPanelModel:4130, basesForSetPiecesByExistingRule_:4195, applyHomeMultiPriceVat:4250,
singleUnitPrice:4405, calc:4442, bindQty:4710, bindCommQtyEvents:4732,
setPreviewFoot:5064, buildSingleSetCompositionHtml_:6522, displayNameForRow:7161,
isCommSetRow:7216, initMobileUI:7612, updateTopControls:7677, onHomeQtyInput:7712,
onSingleQtyInput:7761, findHomePanelModel:8073, has:8074, pickInfinitePanelModel:8088,
inferInfiniteSize:8103, has_:8607, getSetUnitNowById:8952, openFinal:9018,
ensureKakaoPostcode:9040, mountAddrSheet:9049, fit:9096, showSector:9229,
valuesOf:10705, copyToClipboardImage:10884, downloadFile:10923, capFromModel:12613,
packAllOutColumns:13219, enforceDateLimit:13829, initValidationEvents:14961,
loadOrderData:15620, fillCustomer:16339, hideAllPages:17449, removeCustomRow:18657
```

판정 근거: `initMobileUI`, `openFinal`, `showSector`, `removeCustomRow`는 대상 파일 전역에서 정의 토큰 1회뿐이다. 나머지는 정의만 있고 호출·HTML 이벤트·문자열/동적 접근이 없거나, 호출되는 바깥 함수 자체가 도달 불가한 중첩 정의다. 같은 이름의 다른 스코프 함수는 줄번호로 분리했다.

## 3. 업무규칙 상세 — R01 가격 원천·설정·수동값·재고표시 (27)

① 함수: `isSlipPublishSuccess:1311`, `getBaseListPrice:2267`, `catalogSpecialMetadata:2291`, `getModelFlags:2368`, `getRealHomePrice:2398`, `getRealCommPrice:2403`, `getRealSinglePrice:2408`, `getRealOldPrice:2414`, `estimateConfigNumber:2463`, `getOldDiscountPercent:2468`, `getCardFeeRate:2472`, `getVatDivisor:2476`, `getFooterNoticeHtml:2558`, `applyEstimateTotalAdjustments:2567`, `applyCustomerDiscounts:2585`, `numOr:2587`, `getRealListPrice:2646`, `handleListPriceInput:2743`, `makeListPriceInput:2834`, `handlePriceInput:2860`, `makePriceInput:2964`, `handleFreightInput:2991`, `parseFixedDc:3126`, `getStockState_:3148`, `isPanelRow:3176`, `inferOneWaySize:3181`, `isRemoteRow:3189`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 전표 발행 응답 `ok===true`이고 `slipNo` 존재 | 발행 성공. 둘 중 하나라도 없으면 실패 |
| 가격인상 토글이 켜지고 해당 HOME/COMM/SINGLE 인상가 존재 | `PRICE_INC` 출고가를 사용; 아니면 카탈로그 기본 출고가 |
| 수동 납품가/출고가 Map에 key 존재 | **0을 포함한 수동값이 항상 자동계산보다 우선**; 입력을 비우면 Map에서 삭제하고 자동가 재계산 |
| 구형 `isDisc=true` | 출고가×`(1-oldRate)` 후 구형 반올림; false이고 출고가 수동수정도 아니면 `sheetPrice` 유지 |
| `CONFIG[key]`가 유한수 | 그 값; 아니면 함수별 fallback |
| 선금 체크 + `advanceDiscountRate>0` + 기존 선금할인행 없음 | 현재 합계×율을 `Math.round`, 음수 `선금할인` 1식 행으로 한 번만 추가 |
| 거래처 DC 값 존재 | 거래처 HOME/COMM율, 6종 정액, 반올림, I형 호스 옵션 적용; 없으면 전역 설정 |
| 고정DC 숫자/문자에 `%` 또는 값>1 | 100으로 나눠 비율화; 결과를 `[0,0.99]`로 제한. 빈값/숫자 없음은 `null` |
| 재고 note에 `품절` | `SOLD`; 아니고 `YYMMDD` 6자리 날짜가 오늘 이후 | `FUTURE(date)`; 그 외 정상 |
| kind/name/spec에 판넬·패널 또는 리모컨·리모콘 | 해당 구성품 판정. 1Way 크기는 대/중/소 키워드, 미검출은 `중형` |

③ 상수·임계값·모델코드: 가격인상 type `HOME/COMM/SINGLE/OLD`; 기본 HOME/COMM DC `0.45`, 구형 `0.50`, 카드 `0.03`, VAT `0.10`과 나눗셈 `1.10`, 선금 기본 `0`, 6종 정액 기본 모두 `0`, 반올림 단위 `0`, 모드 `ROUND`, 고정DC 하한/상한 `0/0.99`; 재고 문자열 `품절`, 날짜 정규식 `\d{2}\d{2}\d{2}`, 연도 기준 `2000`; 특수행 `/운임|절삭/`, kind `FREIGHT/CUT`, source `CATALOG_SPECIAL`; 플래그 접두 `AC/AP`, 위치문자 `6P/4P/4D/1P/1D`, `AP230/AP290`, 1등급 문자 `F`; footer 기본 4문장과 유효기간 **30일**; 패널 `판넬/패널/panel`, 리모컨 `리모컨/리모콘`, 크기 `대형/중형/소형`.

④ 읽는 시트 컬럼·품목 속성: `model`, `name/nameRaw`, `spec`, `kind`, `price`, `list`, `sheetPrice`, `isDisc`, `fixedDC/고정DC`, `useK2`, `note`, 가격인상 표; 거래처 `homeDiscount`, `commDiscount`, `discount360`, `discount4way`, `discountStand`, `oneWayDiscount`, `deluxeDiscount`, `firstGradeDiscount`, `unitRoundTo`, `unitRoundMode`, `showIHose`; DOM의 수동 출고가·납품가 및 HOME/COMM/OLD 반올림 설정.

⑤ 우리 스키마 대응:

- [있음] `products.release_price`, `products.delivery_price`, `products.fixed_discount_rate`, `products.fixed_discount_manual`, `products.discount_flags`, `products.goods_type`, 분류 FK/수동권위 플래그, 가격변경 schedule/variant.
- [있음] `dc_config_db.estimate_configs.common_home_discount_rate/common_commercial_discount_rate/old_product_discount_rate/vat_rate/card_fee_rate/advance_discount_rate/footer_notice` 및 V5의 옵션·반올림 설정; 데스크톱 `EstimatePricingConfigPage` 편집 경로.
- [부분] 재고 note 파싱은 현행 재고수량·가용성 조회로 대체 가능하나 `YYMMDD 입고예정`을 정형 필드로 보존하는 축은 이 함수만으로 확인되지 않는다.
- [부분] 견적별 수동 출고가/납품가·인상토글은 현재 스냅샷 상태에는 있으나 정규 견적 헤더/행 영속화 컬럼과 1:1 대응 여부는 별도 이식 시 확인해야 한다.

⑥ 기본값: [자동] `45%/45%/50%/10%/3%/선금 0/정액 0/반올림 없음+ROUND`, 근거는 `estimate_configs` V4/V5의 실제 DEFAULT·seed와 대상 fallback이 일치한다. [자동] 가격 0과 DC 0은 유효값이며 `Map.has`/nullable fixed DC로 미설정과 구분한다. [자동] 수동 분류·고정DC는 `*_manual=true`가 시트보다 우선한다. 재고 예정일은 기존 note를 손실 없이 이관할 때까지 [자동] 레거시 표시를 보존한다.

⑦ 원본 GAS 대조: 같은 이름의 가격 선택·구형 할인·고정DC 파싱·재고 note·패널/리모컨 판정은 원본 견적과 동작이 같다. 차이는 (a) `catalogSpecialMetadata`가 원본의 같은 표시명 `절삭`을 카탈로그 특수행과 자동 절삭행으로 분리한 **포팅 전용 출고품목 identity**라는 점, (b) `estimateConfigNumber/get*Rate`가 원본 하드코딩을 DB 설정으로 뽑았으나 기본 숫자는 같다는 점, (c) `applyEstimateTotalAdjustments`의 **선금할인 금액행은 원본 견적에 없는 포팅 전용 규칙**이라는 점이다. 금액 차이는 선금 체크 시에만 발생한다. `isSlipPublishSuccess`는 GAS RPC 성공 shape를 HTTP 포팅 응답에 맞춘 포팅 전용 검증이다.

## 4. 업무규칙 상세 — R02 품목 판별·단가·자동수량 잠금 (44)

① 함수: `pickPanelBy:3201`, `stripCommKeywords:3250`, `displayOverrides:3272`, `adjustSingleSetBasePrice:3284`, `roundK:3317`, `roundByConfig:3323`, `isIndoorUnitPart:3346`, `isOutdoorUnitPart:3359`, `splitIndoorOutdoorToK:3370`, `analyzeSingleSetDiscountFlags:3398`, `getSpecModelName:3432`, `isCommIndoorRow:4044`, `isCommOutdoorRow:4050`, `commIndoorKind:4056`, `isCommPanelRow:4066`, `isCommHoseRow:4072`, `isCommRemoteRow:4078`, `isCommPumpRow:4084`, `computeCommRemoteModelForIndoor_:4090`, `pickHoseModel:4122`, `hasExactHP:4137`, `parseSetHPs:4143`, `chooseBaseModel:4150`, `modelByNameLike:4207`, `countBranchForSet:4220`, `normalizeHomeCategory:4257`, `isExpansionModel:4272`, `classifySingleSetFixed:4285`, `priceFrom:4326`, `homeUnitPrice:4344`, `partUnitPrice:4390`, `commUnitPrice:4455`, `singleDispNameTrimmed:4501`, `markAutoHome:4546`, `markAutoSingle:4547`, `trackInteraction:4560`, `applyAbsoluteLock:4605`, `set:4630`, `set:4648`, `sumHome:4666`, `sumSingles:4667`, `sumComm:4668`, `syncCommTotals:4673`, `setFootSum:4689`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 판넬 옵션·형태·Wi-Fi·공청/AI 일치 | 후보 점수로 기본 판넬 선택; AI `-6`, 공청 `-4`, 블랙/승강 `+2` 보정 |
| 싱글 본체가 부자재이거나 모델 접두가 `AC/AP/AR/AF` 아님 | 6종 정액 차감 없음 |
| 360/4Way/스탠드/1Way/디럭스/1등급 플래그와 해당 정액>0 | 각 정액을 순차 차감, 매 단계 하한 0 |
| 반올림 단위>0 | `CEIL/FLOOR/ROUND`로 단위 배수화; 단위 0은 원값. `roundK`는 1,000원 반올림 |
| 구성품이 패널·리모컨·자재·받침이 아닌 실내/실외기 | 세트 금액을 실내/실외 합계에 배분; 최종 천원 단위 보정 |
| 상업 실내기 | 모델 `AM…` 7번째 문자가 `N`; 실외기는 `X`, 판넬/호스/리모컨/펌프는 이름 정규식 |
| 상업 리모컨 옵션 `제외` | 없음; 전열 `AWR-VH12N`; 덕트/유선 `AWR-WE13N`; 컬러유선 `AWR-WG00N`; UV-C·인피니트 `AR-CH01`; 그 외 `AR-EH05` |
| I형 호스 설정 | 1Way/4Way·360에 I형 우선, 없으면 L형 fallback; 설정 꺼짐은 반대 |
| 실외기명 계열+정확한 HP 토큰 | `chooseBaseModel`의 방진가대/받침 모델 목록 생성 |
| 세트명 괄호 안 `+` N개 | 분기관 수량 N |
| 변동DC 체크+출고가>0 | `출고가×(1-(고정DC ?? 전역DC))`, 정수 반올림 후 단위처리 |
| 변동DC 아님 | 시트 납품가, 단 수동 출고가가 있으면 그 출고가; 가격이 없으면 0 진행 |
| 사용자가 qty/price/list 입력 중 | 해당 key를 수동잠금에 등록; 잠긴 key에 대한 자동 `Map.set`·자동 스타일 변경 차단 |
| 사용자가 값을 지움 | 수동 Map/잠금 해제 후 자동계산 재개 |

③ 상수·임계값·모델코드:

- 금액: I형 유연호스 고정 `8,000`, 천원 반올림 `1,000`, DC 기본 `45`, 플래그별 정액 기본 `0`, 가격 하한 `0`.
- 리모컨: `AWR-VH12N`, `AWR-WE13N`, `AWR-WG00N`, `AR-CH01`, `AR-EH05`, `AR-EC05`; 옵션 `제외/무선/유선/컬러유선`.
- 분기관/받침: `AXJ-YA1509N`, `AXJ-YA2512N`, `SI-AL600A`, `SI-AL700a`, `GHP방진가대`, `ACL-KORGHP07`, `방진가대S2소/중/대`; 계열 `프라임/한랭지/표준형/냉방전용 상부토출/ECO/가스히트펌프/프레스티지/동시냉난방/공장전원`; HP `3.5,4,5,6,7.5,8,10,12,14,16,18,20,22,24,26,28,30,32,34`.
- 판넬: `PC1MWSK3NW`, `PC1NWSK3NW`, `PC1BWSK3NW`, `PC4NUFK1NW`, `PC6NUDK1NW`, `PC1MWCK3NW`, `PC1NWCK3NW`, `PC1BWCK3NW`, `PC4NUCK4NW`, `PC6NUCK1NW`, Wi-Fi 없는 N형 10종, 인피니트 `PC1YNSK1NW/PC1ZNSK1NW/PC1YNWK1NW/PC1ZNWK1NW/PC1YNRK1NW/PC1ZNRK1NW`.
- 특수 분류: `AWR-WV00N`, `ADP-F075SP`, `AY047BA1SBA`, `PC1DWSK1`; expansion 접두/위치 `AC…CS`, `AP…CA`, `AF70…24/25`, `AF80`, `AF90`; 표시명 치환 문자열은 `stripCommKeywords/displayOverrides`가 보유한다.
- 수동/자동 대상: 호스 1/4Way L/I, `FOOT_ROUND`, `SI-AL600A/SI-AL700a`, 유·무선/컬러 리모컨, 모든 `PANEL_MODELS`, 싱글 유선보드 `AIM-A01N`, 실링용 드레인펌프, 받침 2종.

④ 읽는 시트 컬럼·품목 속성: `model`, `name/nameRaw/disp`, `spec`, `catL/catM/catS`, `kind`, `feat`, `capacity`, `maxIndoor`, `price/list/sheetPrice/fixedDC/useK2`, 세트 `id/parts/qty/defaultQty`; 옵션 `home_hose_i`, `comm_remote`, `comm_panel`, 싱글 6종 정액·판넬·리모컨·형태.

⑤ 우리 스키마 대응:

- [있음] `products` 가격·고정DC·분류·용량, `bundle_component.component_kind/component_variant/is_default/quantity`, `quantity_sync_rule/source/target`, 수동 분류·고정DC 권위 플래그. `products.discount_flags` 컬럼도 있으나 #1090의 2026-08-07 개발책임자 결정으로 **6종 정액의 정본에서 제외**됐다.
- [부분] `branch_pipe_lookup`에는 코드·설명·수량만 있고 계열/HP→받침 모델의 조건표는 없다. 이름 추론을 제거하려면 수량동기화/구성품 매핑 데이터로 옮겨야 한다.
- [부분] 자동수량 잠금은 스냅샷에 존재하지만 장기 영속 견적행의 `manual_quantity`/lock provenance로 정규화된 대응은 이 파일 조사만으로 확정할 수 없다.

⑥ 기본값: [자동] 개발책임자 확정에 따라 판넬·리모컨·호스·받침·형태만 수량 조건으로 이식하며, 이름/HP 추론 결과는 **초기 데이터 도출 근거일 뿐 런타임 권위가 아니다**. 실제 수량은 `quantity_sync_*` 설정값만 결정한다. [자동] 수동 수량은 무조건 우선하고 빈값에서만 잠금 해제한다. [자동] 6종 정액은 #1090에 기록된 별도 확정대로 **레거시 `getModelFlags` 모델코드 파싱이 정본**, `products.discount_flags`는 폐기 축이다. 이 결정은 현재 정액 148건 유지·`AM360AXV*` 7건 미적용으로 금액 변동 0을 택한 것이다. [자동] 일반 품목 분류의 수동 수정은 시트가 덮지 못한다. [자동] 가격 0은 허용한다.

⑦ 원본 GAS 대조: 가격 공식·반올림·상업 리모컨·받침/분기관·자동수량·잠금 기본 흐름은 원본 견적과 같다. 다만 이 포팅본 `isCommIndoorRow`는 `AM` 모델 7번째 `N`만 권위로 삼아 원본 주문의 이름/대분류 판별과 대상 집합이 다르고, 저장소의 라이브 정본 후속 기록에서는 `catL==='실내기'` 보완이 확인된다. **출고품목 수량 차이 최우선 위험**이다. `getModelFlags`의 모델문자 위치 파싱은 원본과 같고 #1090 결정으로 계속 금액 정본이다. `applyAbsoluteLock`·Map setter guard는 포팅에서 과거 스냅샷까지 복원하도록 확장됐으며, 최종 정책은 개발책임자 확정(수동 우선·삭제 시 해제)과 같다.

## 5. 업무규칙 상세 — R03 조합비·세트 옵션·구성품 전개·필터 (24)

① 함수: `getCapacity:4880`, `updateHomeRatio:4887`, `updateCommRatio:4974`, `materialsSumForSet:5080`, `isDefaultComponent_:5085`, `getDefaultRemoteRows:5089`, `getOptionRemoteRow:5090`, `allowRemoteChange_:5097`, `is1WaySet_:5101`, `getBasePanelRow:5106`, `pickPanelRow:5107`, `setBasePriceRightFirst:5124`, `calcSetUnitPrice:5134`, `partsForSetStrict_:5192`, `explodeSetParts:5199`, `partsForCommSet_:5335`, `inferStandCountForOutdoor_:5346`, `recalcCommAccessories:5353`, `applyHomeFilter:5386`, `applySingleFilter:5407`, `applyCommFilter:5427`, `updateHomeFilterOptions:5449`, `updateSingleFilterOptions:5511`, `updateCommFilterOptions:5565`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| HOME 선택 실내/실외 `capacity×qty` | 조합비=`inCap/outCap×100`; 실외기 0이면 `---%`; `>130%` 경고 |
| `AJ025`만 실외기로 선택 + `AJ072/AM072/AM083` 실내기 | `조합 불가`; `ΣmaxIndoor < 실내기수`면 허용대수 초과 |
| HOME 실내기수>2 | 추천표 `homeEx`, 아니면 `home`; 누적용량 이하 마지막 구간 HP 표시 |
| COMM 선택 실내/실외 | 조합비와 `부족 분기관=(실내기수-실외기수)-분기관수`; 허용대수 초과 표시 |
| COMM 실외기 계열이 strict 정규식에 맞음 | 한도 `103.0%`, 아니면 `120.0%`; 포맷한 소수 1자리 값이 `>=` 한도면 경고 |
| 싱글 자재 옵션 `포함` | `feat`에 자재인 구성품 단가 합산; 아니면 0 |
| `isDefault` boolean 존재 | 그 값이 정본; 없을 때만 `feat`의 `기본` 텍스트 fallback |
| 리모컨 옵션 | 기본 리모컨 중 `AR-EH05/AR-EC05/AR-KH05`가 있을 때만 유선/컬러유선으로 교체 |
| 판넬 제외/블랙/승강/공청/360 원형·사각 | 기본 구성품을 빼거나 선택 variant와의 차액을 세트 단가에 가감 |
| 세트 전개 | 세트 범위 구성품만 조회; 받침·숨김 I형호스·운임·절삭 제외, 판넬/리모컨/자재 옵션 반영 |
| 실내·실외 구성품 모두 존재 | 가정용은 실내:실외 `6:4`, 그 외 `4:6`; 고정구성품 금액을 먼저 빼고 천원 단위 배분, 마지막 행에 잔차 |
| 상업 세트 구성품에 `GHP방진가대` | 선택 실외기 수량만큼 추천, 단 수동받침은 덮지 않음 |
| 필터/옵션 후보 갱신 | 선택 카테고리·크기·옵션에 맞지 않는 품목을 출고 후보에서 제외; 싱글 `13평 프레스티지` 예외 포함 |

③ 상수·임계값·모델코드: 조합비 `100`, 소수 `1`, HOME `130` 초과, COMM `103.0/120.0` 이상; `AJ025`, `AJ072`, `AM072`, `AM083`; 부족 분기관 최소 `1`; 기본 리모컨 허용 `AR-EH05/AR-EC05/AR-KH05`; 옵션 `포함/판넬제외/블랙판넬/승강판넬/공청판넬/유선리모컨/컬러유선리모컨`, 형태 `원형/사각/360CST`; I형 호스 `8,000`; 배분비 `6:4/4:6`, 배분 단위 `1,000`, 가격 하한 `0`; 제외 문자열 `발통/유연호스 I형/운임/절삭`; GHP 받침 문자열 `GHP방진가대`; 싱글 필터 예외 `13평`, `프레스티지`.

④ 읽는 속성: `capacity`, `maxIndoor`, `model`, `name/disp`, `catL`, `qty`, 세트 `setModel/id`, 구성품 `kind/feat/spec/isDefault/quantity/price`, HOME/COMM/SINGLE 옵션, 추천표 `RECOMMEND_DATA.home/homeEx/comm`.

⑤ 스키마 대응: [있음] `products.capacity`, `bundle_component`의 세트 범위·수량·default·variant, `odu_recommendation_lookup(recommendation_type, indoor_capacity, indoor_count, outdoor_hp)`. [부분] `products.maxIndoor`는 API payload에는 있으나 상품 정본 컬럼/스펙 키 일관성이 취약하다. [불가] 한 테이블로 표현되는 계열별 `103/120/130`, AJ025 금지조합, 최대연결 경고 정책은 없다. `estimate_configs.combo_warn_rate` 단일값만으로 세 정책을 동시에 표현할 수 없다.

⑥ 기본값: [자동] 세트 구성·기본·variant는 `bundle_component`를 권위로 삼고 텍스트 fallback은 데이터 이행기만 허용. [자동] 세트 배분은 #1093/#1143 결정대로 자동 품목 비율합 10과 잔차보정으로 이식. [자동] 추천실외기는 V3 lookup의 구간값을 보존. 조합비 정책 저장형태는 §13 D2 결정 필요.

⑦ 원본 대조: 세트 옵션·가격가감·구성품 전개·4:6/6:4 배분은 원본 견적과 같다. 포팅은 `isDefault`와 세트 스코프 조회를 우선하여 원본의 `feat`/전역 모델조회보다 **출고품목 선택이 더 엄격**하다. 이는 세트 간 같은 모델 혼입을 막는 의도적 개선이다. 조합비 숫자와 AJ025 금지조합은 원본 견적과 동일하며, 원본 주문은 HOME 금지조합/최대연결 표시가 더 단순하다. `inferStandCountForOutdoor_`는 GHP만 다루어 `chooseBaseModel` 전체 조건과 달리 부분 규칙이다.

## 6. 업무규칙 상세 — R04 카탈로그 노출·자동 파생수량·상태수렴 (35)

① 함수: `updateHomeRowPrice:5971`, `normalizeCommCategory:6590`, `fixCommMidCategory:6598`, `onCommOptionChange:6607`, `renderCommOptions:6623`, `getCommFilterRows_:6678`, `renderComm:6734`, `updateCommRowPrice:6993`, `buildDisplayNameComm:7123`, `buildCommSetIndex:7178`, `explodeCommPreviewParts:7203`, `explodeCommSets_:7221`, `syncOldTotals:7587`, `renderHomeOptions:7788`, `renderSingleOptions:7831`, `recomputeFootAll:7958`, `recomputeSingleBaseFoot:7971`, `recomputeSingleExtras:8012`, `isHomeCalcTriggerModel:8037`, `isSingleCalcTriggerId:8048`, `recomputeHomePanels:8112`, `setP:8159`, `recomputeHomeRemotes:8225`, `setR:8248`, `recomputeHomeBranches:8272`, `setB:8274`, `recomputeHomeDerived:8333`, `setH:8354`, `recomputeCommDerived:8390`, `requireCommCatalogRow_:8392`, `computeCommPanelModelForIndoor_:8608`, `syncHomeUIFromState:8694`, `syncSingleUIFromState:8770`, `syncHomeTotals:8834`, `syncSingleTotals:8849`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| HOME 실외기 선택 + 받침 옵션 | 원시 실외기 수량 합을 원형받침에 반영; 규칙 target/자동품목은 다시 source로 세지 않아 재귀증식 방지 |
| SINGLE `unit∈{SET,식}` + 받침 옵션 | 보통 원형, `AP230DAPDHH1S/AP290DAPDHH1S`는 일자발; 부자재·운임·절삭 제외 |
| 유선/컬러유선 리모컨 + 1Way + 교체허용 | 세트수만큼 유선보드; 실링 세트수만큼 실링 드레인펌프 |
| HOME 패널 옵션 | 360/4Way/1Way/인피니트와 Wi-Fi·크기·형태별 수량을 대응 판넬 target에 반영; 수동 판넬 제외 |
| HOME 리모컨 옵션 | 360/인피니트/1·4Way/벽걸이/에어콤보 집계를 대응 리모컨 target에 반영; 수동 리모컨 제외 |
| HOME 분기관/호스/받침/판넬/리모컨 | 레거시 계산 후 서버 `quantity_sync`가 소유한 target만 서버값으로 덮어쓰고 옵션 치환과 수동값을 재수렴 |
| COMM 실내기 | 판넬·리모컨·호스 수량 파생; 벽걸이/덕트/실링/스탠드는 호스 제외; 옵션 제외/치환 반영 |
| COMM 파생 target이 `AR-EH05` 또는 `방진가대S2중`인데 카탈로그에 없음 | 조용히 0 처리하지 않고 오류; 다른 미등록 파생 target은 null |
| 수동 Map에 target 존재 | 모든 자동 파생 결과보다 수동값 우선 |
| 옵션 변경/행 가격 변경/렌더 | 파생수량→행 단가→소계→섹션합계→조합비 순으로 수렴 |

③ 상수·임계값·모델코드: SINGLE 받침 예외 `AP230DAPDHH1S/AP290DAPDHH1S`; 패널 swap `PC4NUFK1NW→PC4NUCK4NW`, `PC6NUDK1NW→PC6NUCK1NW`, `PC4NUFK1N→PC4NUCK1N`, `PC6NUDK1N→PC6NUCK1N`; 인피니트 중/대 기본·25년·공청·AI `PC1YNWK1NW/PC1YNCK1NW/PC1YNRK1NW/PC1ZNSK1NW/PC1ZNWK1NW/PC1ZNCK1NW/PC1ZNRK1NW`; 카탈로그 hard error `AR-EH05`, `방진가대S2중`; 옵션 `판넬제외/공청판넬/인피니트 공청+동작감지 AI/인피니트 25년형/기본/제외`; 자동계열 문자열 `판넬/패널/리모컨/리모콘/유연호스/분기관/발통/일자발/방진가대/SI-AL`.

④ 읽는 속성: HOME/COMM/SINGLE 카탈로그 전 필드, `quantity_sync_rule.sources/targets/factor/multiplier/conflictPolicy`, `bundle_component`, 옵션 DOM, 수동 `HOME_MANUAL_*`, `COMM_MANUAL_*`, `singleCustomPartQtys/commCustomPartQtys`, 행 `data-*`.

⑤ 스키마 대응: [있음] V24 `quantity_sync_rule/source/target`의 source factor·target multiplier·ADD/REPLACE·NONE/FLOOR, `bundle_component`, products 분류·수동권위. [부분] `quantity_sync_rule.condition_json`은 현재 자유 JSON이라 허용 축을 DB 제약으로 강제하지 않는다. [부분] snapshot의 `absoluteLock`은 존재하나 정규 견적행 영속 필드 확인 필요.

⑥ 기본값: [자동] source factor=1, target multiplier=1, aggregation=SUM, inactive=ZERO, conflict=ADD, rounding=NONE은 V24 default. [자동] 개발책임자 확정대로 조건 축은 판넬·리모컨·호스·받침·형태 5개뿐이며, 모델 이름/HP 추론을 신규 rule 조건으로 만들지 않는다. [자동] 수동값은 잠금, 지우면 자동복귀. [자동] 미등록 가격과 0원은 계속 진행. [자동] #896/#1126 진행축에 편입하며 새 결정 질문을 만들지 않는다.

⑦ 원본 대조: HOME/COMM 파생 공식의 레거시 fallback은 원본 견적과 대체로 같다. 포팅본은 서버 규칙을 **레거시 계산 뒤 target 단위로 재수렴**시키는 포팅 전용 경계가 추가됐다. 따라서 설정된 target은 원본 하드코딩과 달라질 수 있으며, 그것이 개발책임자 확정 방향이다. `requireCommCatalogRow_`는 원본의 조용한 누락 대신 두 핵심 target 누락을 오류로 바꾸므로 표시/출고품목 차이가 있다. `onCommOptionChange`도 서버 옵션·카탈로그 guard를 반영한 포팅 전용 흐름이다.

## 7. 업무규칙 상세 — R05 전송행·견적 구조·VAT·초기화 (23)

① 함수: `explodeSendSets_:8966`, `isValidTel:9115`, `checkOrderReady:9171`, `aggregateSendRows:9188`, `buildSendRows:9378`, `addP:9396`, `getActiveFixedDc:9419`, `getLiveSpec:9439`, `resetHome:10036`, `resetComm:10100`, `resetBranch:10181`, `resetSingle:10226`, `resetOld:10279`, `updateInlineTotals:10479`, `fixFootersForMobile:10497`, `getSelectedTotalCount:10813`, `getSingleSetOptionLabel:10989`, `getSingleSetOptionLabelLive:11053`, `getStructuredQuoteData:11081`, `getCustoms:11431`, `getVatLabel:11478`, `syncVatCardPv:11495`, `syncVatFromOrderInfo:11517`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 싱글이 `SEND_AS_SET_IDS` 또는 부자재/실외기받침 | 구성품으로 쪼개지 않고 세트 1행 전송; 그 외 옵션 반영 구성품 행으로 전개 |
| 전화번호 숫자만 9~11자리 + 메모 + 배송주소 + 감사주소(동일주소면 면제) | 주문 전송 버튼 활성 |
| 모델+단가가 동일 | 전송행 수량 합산, 마지막 등장 순서 유지, 6종 플래그 OR, 고정DC는 큰 값 |
| 경동 거래처 | 규격/비고에 출고가를 덧붙임 |
| 세트 DOM 구성품이 존재 | 현재 화면의 수량·수동단가·규격을 payload 권위로 사용; 없으면 catalog 전개 fallback |
| 카탈로그 특수행 | 세트 분해·세트DC 없이 `CATALOG_SPECIAL` 1행 유지 |
| VAT 포함 | 표시 합계/라벨을 포함으로 동기화; 별도면 공급가/세액 축 유지. 카드 체크는 같은 미리보기 상태에 반영 |
| reset HOME/COMM/SINGLE/OLD/BRANCH | 해당 수량·수동가격·수동구성품·잠금·옵션·분기세션을 초기값으로 되돌린 뒤 합계 재계산 |
| 사용자정의 행 qty≠0 | HOME/SINGLE/COMM/OLD 해당 섹션의 기타 품목으로 포함 |

③ 상수·임계값·모델코드: 전화 `9~11`; key 구분자 `||`; 세트 단위 `SET/식`, 구성품 `EA`; 빈 규격 zero-width `\u200B`; 특수 source `CATALOG_SPECIAL`; 섹션 `HOME/SINGLE/COMM/OLD/ETC/SET`; VAT `포함/별도`, 카드수수료 표시, 구형 `(50% DC)`는 설정값으로 변동; 세트 옵션 라벨 `판넬제외/블랙/승강/공청/원형/사각/유선/컬러유선/자재포함`; reset 반올림 `0/ROUND`, 절삭 `0`.

④ 읽는 속성: 네 카탈로그와 세트 구성품, DOM 수량/가격/출고가/규격/비고/고정DC, 거래처명·사업자번호·전화·주소·메모, VAT/카드/선금/절삭/미리보기 모드, custom row.

⑤ 스키마 대응: [있음] products·bundle_component·estimate_configs와 slip/order payload 구조. [부분] 견적 저장은 snapshot JSON이 모든 화면상태를 보존하지만 `estimate/estimate_item` 정규 테이블의 동일 필드 보장은 이 파일에서 확인되지 않는다. [있음] 특수행 source/identity는 #875에서 구현돼 카탈로그 절삭과 자동 절삭이 구별된다.

⑥ 기본값: [자동] 가격 0·미등록 가격 0 허용. [자동] 수동 수량/단가/규격을 payload 권위로 유지. [자동] VAT 10%, 카드 3%, 구형 50%는 V4 설정값을 사용. [자동] 리셋은 잠금도 해제한다. 창고는 이 함수군이 정하지 않으며 개발책임자 확정대로 견적 사용자가 선택한 값을 주문 payload에 보존한다.

⑦ 원본 대조: 세트 분해·모델+단가 병합·경동 출고가 표시·사용자정의품목·VAT 출력은 원본 견적과 같다. 포팅은 DOM 현재값과 DB catalog를 GAS 시트행 대신 읽는다. `CATALOG_SPECIAL` identity와 서버 source는 포팅 전용이다. 카드/선금/절삭의 실제 금액 차이는 R08에서 별도로 대조한다. reset은 원본과 같은 화면 결과이나 서버 quantity rule 상태를 재수렴하는 단계가 추가됐다.

## 8. 업무규칙 상세 — R06 내보내기·분기관·티어 할인 (26)

① 함수: `parseRatioText:11681`, `processPCExport:11854`, `processBOCSVExport:12219`, `pickSelectedOutdoors:12619`, `pickSelectedIndoorsExpanded:12641`, `codeByCumulativeSum:12669`, `codeByOutdoorHP:12679`, `recomputeBranchCodes:12692`, `ensureBranchScaffold:12762`, `syncCommQtyFromDOM:12810`, `backToComm:12848`, `updateBranchTopButton:12869`, `handleBranchToggleClick:12878`, `fixBranchDOM:12941`, `makeBranchColumnSortable:12968`, `updateBranchVisuals:13122`, `updateBranchRatios:13225`, `snapshotBranchState:13278`, `pushBranchPartsToCommFromBadges:13311`, `saveBranchState:13341`, `loadBranchState:13349`, `applyBranchState:13354`, `isIndoorOnly:13633`, `getTierBonusRate:13661`, `isStandard45:13670`, `runWithAdjustedRates:13675`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| PC export | 현재 구조화 견적, 조합비·한도·견적일·출고가 표시 옵션을 인쇄 데이터로 고정 |
| BO CSV export | 현재 선택행을 모델·수량·단가·규격 등 발주용 열로 직렬화; 표시순서와 0원 유지 |
| 분기 슬롯 누적값 `csum` | `<150→1509`, `<406→2512`, `<464→2812`, `<696→2815`, `<986→3419`, 그 이상 `4119` |
| 마지막 슬롯의 실외기 HP | `≤50/100/160/220/340/초과`를 `1509/2512/2812/2815/3419/4119`로 강제 |
| 슬롯 1개뿐 | 코드 `-`; 2개 이상부터 누적코드, 마지막은 실외기 HP 코드 우선 |
| 코드 badge+수동 extra | `AXJ-YA{code}N` 수량으로 COMM에 밀어 넣고 분기 state 저장 |
| 각 실외기 배정 실내기 | `Σ(cap×0.1)/outdoorCap×100`; strict 계열 103, 나머지 120; `maxIndoor` 초과는 수량초과 |
| HOME+COMM 선택품이 있으나 실외기 0 | indoor-only true; 현재율이 `45%±0.001`이면 HOME/COMM 모두 40%로 임시 하향 |
| 섹션 합계 `≥10m/30m/50m/100m`이고 현재율 정확히 45% | 해당 섹션율 `+1/+2/+3/+4%p`; 이 포팅 견적은 상한 clamp 없음 |
| 미리보기/전송 계산 종료 | 임시율을 원복하고 payload `rateInfo`·REMARKS의 비율문구만 계산율로 치환 |

③ 상수·임계값·모델코드: 분기코드 `1509/2512/2812/2815/3419/4119`, target `AXJ-YA1509N/AXJ-YA2512N/AXJ-YA2812M/AXJ-YA2815M/AXJ-YA3419M/AXJ-YA4119M`; 누적 경계 `150/406/464/696/986`; HP 경계 `50/100/160/220/340`; 용량환산 `0.1`; 비율 `100`, `103.0/120.0`; 티어 `10,000,000/30,000,000/50,000,000/100,000,000`, bonus `0.01/0.02/0.03/0.04`, 표준 `0.45±0.001`, indoor-only `0.40`; 분기 state key `branch_state_v2`.

④ 읽는 속성: COMM 선택 실외기/실내기 `model/catL/name/capacity/maxIndoor/qty`, 분기 슬롯·extra, HOME/COMM 합계·DC, 현재 견적 구조와 출력 옵션.

⑤ 스키마 대응: [있음] `branch_pipe_lookup(branch_code,description,summary_qty)`, `products.capacity`, `odu_recommendation_lookup`, 견적 설정. [부분] 누적/HP 경계와 103/120 policy는 lookup 컬럼이 없고, `branch_pipe_lookup`의 현재 code/summary만으로 계산식을 표현하지 못한다. [불가] 티어 구간·indoor-only·48% 상한을 담는 견적 가격정책 테이블은 확인되지 않았다.

⑥ 기본값: [자동] 분기관 **수량**은 #896 설정값 권위로 이식하고, 위 누적/HP 식은 초기 매핑 검증자료로만 사용한다. [자동] 창고 선택은 CSV/주문에 사용자 선택값 보존. 티어·indoor-only는 §13 D1, 비율/경계는 D2 결정 필요.

⑦ 원본 대조: 저장소 원본 견적의 분기코드·비율·티어 공식과 이 포팅본은 같다. 원본 주문과는 두 금액 차이가 있다: 주문 포팅은 bonus 후 `0.48` 상한이 있으나 이 견적본은 100m 구간에서 `0.49`까지 간다; indoor-only 판별대상도 원본 견적(실외기 없는 모든 선택품)과 원본 주문(전열 등 예외)이 다르다. 또한 #896의 라이브 GAS 정본 대조에는 분기 경계 `<→≤` 및 누적방향 변경이 기록되어 있어, **현재 라이브 GAS를 최종 정본으로 삼으면 이 파일의 출고 분기관이 다를 수 있다**.

## 9. 업무규칙 상세 — R07 전표·거래명세서·주문카드 (25)

① 함수: `openPreview:13750`, `buildSendRows:13756`, `getSlipInnerContent:13922`, `updateSlipScale:14115`, `handleSlipCopy:14132`, `handleSlipSave:14169`, `getInvoiceInnerContent:14274`, `handleInvoiceCopy:14515`, `handleInvoiceSave:14543`, `getCurrentSlipSnapshot:14823`, `initOrderCard:14989`, `syncAudit:15070`, `onKakaoAddrComplete:15148`, `toggleSameAddr:15316`, `toggleAuditLater:15341`, `togglePayDueCb:15365`, `updateOrderTags:15395`, `enforceTagsOnInput:15435`, `appendMemo:15482`, `checkCardValid:15498`, `resetCardData:15503`, `submitOrderCard:15633`, `getCanonicalSection:15715`, `syncRepTel:16319`, `openInventoryCheck:16504`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| preview/send 호출 | R06 임시 할인율 wrapper 안에서 행 생성 |
| 전표/거래명세서 | 현재 견적 snapshot의 거래처·품목·공급가·세액·합계·날짜를 고정 양식 HTML로 생성, 복사/이미지 저장 |
| 배송지=감사지 체크 | 배송 주소/상세를 감사 주소로 복제하고 감사주소 입력 잠금 |
| 감사 나중 체크 | 감사주소 필수 게이트 유예 및 tag/memo 반영 |
| 선금결제 체크 | 선금 tag와 선금할인 옵션 활성; 해제 시 제거 |
| 주소·결제·감사 필드 변경 | 정해진 태그를 memo에 유지하고 사용자가 지워도 필요조건이 살아 있으면 재삽입 |
| 대표전화 존재 | 주문 전화에 동기화 |
| submit | 거래처/담당자/주소/전화/메모/품목·가격·수량·DC·VAT·카드·선금·창고·전표 snapshot을 canonical section으로 서버 전송 |
| 재고조회 | 현재 선택 모델/수량으로 읽기조회 modal을 열어 가용성 표시; 데이터 write 없음 |

③ 상수·임계값·모델코드: 전화 `9~11자리`; canonical section `HOME/SINGLE/COMM/OLD/ETC`; 배송/감사 `sameAddr`, `auditLater`; 결제 `payDuePre`; 태그 문자열(배송지·감사·선금)과 전표/거래명세서 고정 제목·회사정보·날짜형식; 안전 이미지 logo/stamp; 수량 0 행 제외, 가격 0 행 허용.

④ 읽는 속성: 현재 견적행 전 필드, 거래처 business no/name/address/tel, 담당자, 배송·감사주소, 메모, 결제/VAT/카드/선금, 사용자가 고른 창고, 전표번호와 서버 응답.

⑤ 스키마 대응: [있음] partner/slip/order 및 inventory read API, 주소·연락처·전표 snapshot payload. [부분] 전표/거래명세서의 인쇄 HTML은 DB 스키마가 아니라 template/version 자산으로 관리해야 한다. [있음] 창고는 주문 payload에서 사용자 선택값으로 전달하는 축이 이미 존재한다.

⑥ 기본값: [자동] 창고는 개발책임자 확정대로 사용자가 견적에서 선택. [자동] 주소 동일·감사 유예·선금은 사용자가 체크하지 않으면 false. [자동] 전화 9~11자리, 0원 행 허용. 인쇄 양식은 기존 규율대로 원본 100% 표현 데이터 일치 대상이다.

⑦ 원본 대조: 원본 견적의 주문카드·주소·태그·전표/거래명세서 동작을 대부분 그대로 포팅했으며 GAS 호출만 REST/RPC adapter로 바뀌었다. 포팅의 `getCurrentSlipSnapshot`과 publish success 검증은 서버 응답·재시도 경계를 명시한다. 금액은 R06의 티어율과 R08의 카드/절삭/선금 차이에 종속된다. 인쇄 표시 데이터는 원본과 같아야 하며 UI 배치는 달라도 된다.

## 10. 업무규칙 상세 — R08 카드·절삭·스냅샷·사용자정의·역산 (13)

① 함수: `applyCardFeeLogic:16651`, `applyCutoffLogic:16684`, `takeSnapshot:16724`, `applySnapshot:16916`, `res:16939`, `resSet:16940`, `res:17052`, `handleSaveSnapshot:17550`, `restoreSnapshot:17963`, `calcRecommendOdu:18030`, `addCustomRow:18544`, `updateCustomSubtotal:18666`, `syncSetPriceFromParts:19230`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 카드 체크 | `fee=floor(Σsub×cardFeeRate)`; 수량 1인 가장 윗 일반품목 단가·소계에 더함. 없으면 `카드수수료` 1식 행 |
| 절삭단위 `0` | 없음; `10/100/1000`이고 총액 나머지>0 | 수량1·비세트·비카탈로그특수인 마지막 후보에서 나머지 차감; 없으면 음수 `AUTO_CUTOFF` 1식 행 |
| snapshot 저장 | 수량·수동가격·수동규격·옵션·주소·VAT·카드·선금·절삭·branch·`absoluteLock` 전부 저장 |
| 구 snapshot에 absoluteLock 없음 | 과거 manual set과 이름판별로 잠금을 복원하는 호환 fallback |
| 추천용량 | 정렬된 lookup에서 `cap>=row.cap`인 마지막 `hp`, 없으면 `0` |
| 사용자정의 qty/price | 소계=`qty×price`, 네 섹션 합계에 반영; 마지막 행에 값이 생기면 새 빈행 추가 |
| 구성품 단가/수량 수정 + 세트수량≠0 | `floor(Σ(partPrice×partQty)/setQty)`를 세트 수동단가로 역산 |
| 구성품 수량 입력을 지움 | 수동 override 삭제, `setQty×data-def(기본1)` 자동수량 복귀 |

③ 상수·임계값·모델코드: 카드 기본 `0.03`, `Math.floor`, qty `1`; 절삭 option `0/10/100/1000`, 특수 source `CATALOG_SPECIAL/AUTO_CUTOFF`, 이름 `카드수수료/절삭`, 단위 `식`; snapshot key `branch_state_v2`, 과거 잠금 판별 문자열 `판넬/패널/panel/리모컨/리모콘/유연호스/분기관/발통/일자발/방진가대/받침대/SI-AL`; 구성품 default 배수 `1`, 역산 `Math.floor`, 추천 실패 `0`.

④ 읽는 속성: 모든 견적 UI 상태, `estimate_configs.card_fee_rate`, 구조화 rows `qty/price/sub/type/source`, 세트·구성품 `data-def`, 추천 lookup `cap/hp`.

⑤ 스키마 대응: [있음] 카드율 설정, `odu_recommendation_lookup`, snapshot 저장 API, bundle_component quantity. [부분] 절삭단위와 카드/절삭을 어느 원행에 녹였는지의 provenance는 snapshot에는 있으나 정규 견적행 필드로 확인되지 않는다. [부분] custom item은 자유행 payload로는 가능하나 catalog product FK가 없는 비상품 행 모델이 필요하다.

⑥ 기본값: [자동] 카드수수료는 개발책임자 확정대로 수량1 최상단 품목 단가에 포함, 없으면 별도행. [자동] 절삭 default 0, 선택값은 견적상태로 보존. [자동] 가격 0 허용. [자동] 수동 구성품 수량은 지우기 전까지 잠금. 추천 lookup은 현재 24행을 그대로 이식.

⑦ 원본 대조: 카드·절삭·snapshot·custom·세트역산은 원본 견적과 같은 계산이다. 포팅 차이는 카탈로그 특수 `절삭`을 `source`로 보호하여 자동 절삭 대상에서 제외한 점(#875)과 absoluteLock을 명시 저장한 점이다. 카드/절삭 수치·반올림은 원본과 같다. `calcRecommendOdu`도 동일한 마지막 이하 구간 규칙이다.

## 11. 원본 GAS와의 차이 — 축별 결론

| 축 | 같은 것 | 다른 것·우선순위 |
|---|---|---|
| 금액 | HOME/COMM 고정·변동DC, 6종 정액, 세트 옵션 차액, 4:6/6:4 배분, 카드 3%, 절삭, 구형 할인 | **선금할인 행은 포팅본만 있음**. 티어는 견적 최대 49% 가능 vs 포팅 주문 48% clamp. 설정값화로 기본 수치는 같지만 운영 중 변경 가능 |
| 수량 | 원본 레거시 fallback 계산과 수동잠금 | 서버 `quantity_sync`가 소유 target을 덮어씀. `isCommIndoorRow` 대상집합과 라이브 GAS 분기코드 개정은 출고수량 차이 위험 |
| 출고품목 | 세트 전개·옵션 판넬/리모컨/호스·분기관·펌프 | `CATALOG_SPECIAL` identity, 세트 스코프 구성품 조회, 필수 target 누락 오류가 포팅 전용. 사용자가 선택한 창고가 원본 이름추론을 대체 |
| 기준일 | 견적 가격인상은 화면 토글 | 주문은 `price_change_schedule.effective_date`; 견적 EJS에는 자동 기준일 전환 없음. 이 차이는 개발책임자 확인사항으로 이미 확정 |
| 반올림 | 단위 0/CEIL/FLOOR/ROUND, 천원 배분, 카드 floor, 절삭 remainder | 포팅 설정화 외 공식 동일. 선금만 `Math.round` 신규 |
| 표시 | 전표·거래명세서 표현 데이터, 조합비·DC·옵션 라벨 | XSS sanitizer/안전 이미지, 서버 실패표시, 특수행 source 등 포팅 안전표시 추가. 디자인 차이는 허용되나 인쇄 표현 데이터는 동일해야 함 |

업무규칙 함수별 대조 판정은 R01~R08의 ⑦에 모두 귀속된다. 별도 차이를 적지 않은 함수는 동명 원본 견적 함수와 조건·상수·결과가 같고, 데이터 원천만 GAS 시트/Notion에서 DB/API로 바뀌었다.

## 12. 원본-only / 포팅-only

### 12.1 원본에는 있는데 이 EJS에는 없는 것

원본 견적 HTML과의 함수명 전수 차집합은 4개이며 모두 bootstrap 계층이다.

```text
decodeBase64, initDataLayer, loadInitialData, runHeavyInit
```

이들은 포팅의 EJS 서버 주입, `db-catalog.js`/API bootstrap, 로딩 orchestration으로 대체되어 업무규칙 유실이 아니다.

원본 견적 `Code.js`의 시트/Notion/주소/인증/저장 함수는 브라우저 EJS에 직접 존재하지 않는 것이 정상이다. `getHomeMulti/getCommercialMulti/getSingleSets/get*Parts/getOldProducts_/getPriceIncData_/getRecommendOduData`는 catalog API, `getCustomers_/getManagers_`는 partner API, `getInventoryTable*`는 inventory read API, `saveOrderToNotion/saveQuoteSnapshot/getQuoteHistory*`는 주문·snapshot API, `fetchNotionDcConfig_`는 dc-config-service로 대체됐다. `classifyHome_/classifyCommercial_/classifySingleSetLM_`은 products 분류 projection, `isSoldOutByNote_/isBlockedByNote_`는 `getStockState_`와 재고조회로 대체됐다.

원본 993함수 보고서가 업무규칙 원본-only로 확정한 14개는 다음과 같다.

| 원본-only 함수 | 이 EJS 판정 |
|---|---|
| `saveOrderSnapshot`, `getOrderSnapshotHistory`, `getOrderHistory` | 이 EJS에 이름은 없으나 포팅 snapshot/history API로 대체. 유실 아님 |
| `getHomeIncreasePrices_`, `getCommIncreasePrices_`, `extractSingleIncreasePrices_`, `getSingleIncreasePrices_`, `getSinglePartsIncreasePrices_`, `extractIncreasePrices_` | 포팅 catalog `priceIncData`와 견적 토글/주문 기준일 schedule로 통합. 유실 아님 |
| `processLongTermUnusedClientsFast`, `getActiveBizNosFromLog_`, `getActiveBizNosFromShipping_`, `getTargetClients_`, `updateClientStatus_` | 이 EJS 및 포팅 견적 경계에 없음. #1015 메뉴는 존재하지만 주문·출고 활동 기준 자동 상태변경은 보류되어 **의미 유실 상태** |

추가로 원본 `decideWarehouseCode_`의 모델명/품명 기반 창고 `2/00003` 추론은 이 EJS에 없다. 이는 유실이 아니라 개발책임자 확정대로 **견적 사용자가 창고를 직접 고르는 규칙으로 의도적 교체**다.

### 12.2 이 EJS에만 있는 것

원본 견적 HTML 대비 target-only 함수명 32개 전수:

```text
applyEstimateTotalAdjustments, catalogSpecialMetadata, catalogSpecialSource,
decodeSnapshotState, ensureCustomBlankRow, escapeEstimateAttr, escapeEstimateHtml,
escapeEstimateJsString, estimateConfigNumber, estimateOptionHtml, estimateSpecValueHtml,
formatSpecialPriceForDisplay, get, getCardFeeRate, getFooterNoticeHtml, getManagerCode_,
getManagerName_, getOldDiscountPercent, getVatDivisor, initManagerSearch,
installCspEventListeners, isDefaultComponent_, isSlipPublishSuccess, makeRunner,
onCommOptionChange, renderComponentSpecs_, requireCommCatalogRow_, safeEstimateImageSrc,
safeEstimateImageSrcAttr, sanitizeLegacyTableHtml, target
```

그중 업무규칙은 11개다.

| 포팅-only 업무함수 | 동작 차이 |
|---|---|
| `isSlipPublishSuccess` | GAS 성공 콜백 대신 서버 `ok+slipNo` 계약 검증 |
| `catalogSpecialMetadata` | 카탈로그 운임/절삭에 `CATALOG_SPECIAL` source·kind 부여; 자동 절삭과 identity 분리 |
| `estimateConfigNumber`, `getOldDiscountPercent`, `getCardFeeRate`, `getVatDivisor`, `getFooterNoticeHtml` | 하드코딩을 DB 설정화. 기본 동작은 원본과 같음 |
| `applyEstimateTotalAdjustments` | **원본에 없는 선금할인 금액행** |
| `isDefaultComponent_` | `bundle_component.is_default`를 텍스트 `기본`보다 우선 |
| `onCommOptionChange` | 서버 quantity rule·옵션 재수렴 진입점 |
| `requireCommCatalogRow_` | 핵심 파생 target 누락을 조용한 0 대신 오류로 드러냄 |

`catalogSpecialSource` 자체는 target-only지만 §2.4 판정대로 dead_code이며 살아 있는 규칙은 `catalogSpecialMetadata`다. 나머지 21개는 sanitizer·adapter·표시·주소/담당자·CSP·snapshot 호환 유틸이다.

## 13. 🚩 개발책임자 결정 필요 — 기존 기능·이슈 대조 후 남은 4건

### D1. 견적/주문 티어 보너스와 메인장비 부재 페널티를 서로 다르게 유지할지

1. **무엇을 정해야 하는가:** 문서 종류별로 현재 다른 `45→40`, +1~4%p, 최대율 정책을 그대로 둘지 하나로 합칠지.
2. **레거시 현재 동작:** `index.ejs:13633` `return (qTotal > 0 && qOut === 0)`, `:13661` `10m/30m/50m/100m→.01/.02/.03/.04`, `:13675` `if(isIndoorOnly()) ... calcH=0.40`; 견적은 100m에서 49% 가능. 포팅 주문은 메인장비 정의가 더 좁고 `0.48` clamp. 원본 보고서 D-02/D-23에 미결로 남았다.
3. **기존 기능·이슈 확인:** #1008은 거래처 전역DC/일마감 계승으로 닫혔지만 이 견적 티어 divergence를 결정하지 않았다. 전용 공개 이슈 검색 결과 없음. 가격정책 테이블도 없음.
4. **후보와 대가:** (A) ESTIMATE/ORDER별 현행 유지 — 금액 회귀 0, 문서 간 같은 품목 금액이 다를 수 있음. (B) 주문식+48%로 통일 — 상한 안전, 견적 기존 49% 고객 금액 변경. (C) 견적식으로 통일 — 원본 견적 일치, 주문 금액·페널티 대상 변경.
5. **권고:** **A**. 먼저 `document_type`별 정책으로 명시해 현재 금액을 보존하고, 실 주문 대조 후 통합 여부를 별도 결정한다.

### D2. HOME 130%·COMM 103/120%·AJ025 금지조합·최대연결을 한 정책 모델로 저장할지

1. **무엇을 정해야 하는가:** 단일 `combo_warn_rate`를 쓸지, 카테고리·계열·금지조합·비교연산까지 가진 정책표를 둘지.
2. **레거시 현재 동작:** `index.ejs:4887` HOME `ratio>130`, `AJ025` 단독+`AJ072/AM072/AM083`은 `조합 불가`, `ΣmaxIndoor<inCount` 경고. `:4974` COMM strict 계열이면 `ratioTxt>=103.0`, 아니면 `>=120.0`.
3. **기존 기능·이슈 확인:** `estimate_configs.combo_warn_rate`는 단일값이고 현재 seed 0; `odu_recommendation_lookup`은 추천구간만, `branch_pipe_lookup`은 코드/수량만 담는다. 공개 이슈 `조합비` 검색 0건.
4. **후보와 대가:** (A) `capacity_combination_rule` 별도 테이블 — 규칙·버전·검증 가능, schema/UI 추가. (B) 단일 `combo_warn_rate` — 단순하지만 103/120/130과 AJ 예외를 잃음. (C) 코드 유지 — 즉시비용 0, 포팅 간 드리프트 지속.
5. **권고:** **A**, 초기 seed는 레거시 숫자와 비교연산을 그대로 넣는다.

### D3. 분기관 누적용량/실외기 HP → 6코드 선택표의 저장 위치

1. **무엇을 정해야 하는가:** `1509/2512/2812/2815/3419/4119` 선택 경계와 마지막 슬롯 강제 규칙을 어느 정본에 둘지.
2. **레거시 현재 동작:** `index.ejs:12669` `csum<150/406/464/696/986`, `:12679` `hp<=50/100/160/220/340`, `:12692` 마지막 슬롯은 HP 코드로 덮어쓴다. 코드별 target은 `AXJ-YA1509N/2512N/2812M/2815M/3419M/4119M`. #896 라이브 정본 대조에서는 `<→≤`와 누적방향 변경이 확인됐다.
3. **기존 기능·이슈 확인:** V3 `branch_pipe_lookup`은 `branch_code/description/summary_qty`만 있어 경계·차원·우선순위를 못 담는다. #896의 `quantity_sync_*`는 선택된 target의 **수량**을 담지만 어떤 분기관 코드를 선택할지는 표현하지 않는다.
4. **후보와 대가:** (A) `branch_pipe_lookup`에 별도 rule child(`dimension,min,max,inclusive,priority,is_last_override,target_product`) — 기존 도메인 확장, 의미 명확. (B) `quantity_sync_rule.condition_json` 재사용 — 새 테이블 적지만 코드선택과 수량동기화 의미가 섞임. (C) 프론트 상수 — 구현 간 드리프트 계속.
5. **권고:** **A**. seed 정본은 저장소 사본이 아니라 #896에서 확인한 라이브 GAS 버전으로 고정한다.

### D4. 장기미발주 판정 기준을 주문·출고 활동으로 전환할지

1. **무엇을 정해야 하는가:** 현행 로그인/비밀번호 변경일 기준을 원본의 주문 성공·출고 활동 기준으로 바꿀지.
2. **레거시 현재 동작:** `장기미발주 거래처 선별/Code.js:12-61` — 최근 **30일** 주문 성공 로그/출고일 활동은 승인 유지·복구; **월요일(`getDay()===1`)** 승인 inactive를 장기미발주로 변경. `:65/:110/:161/:214`가 활동수집·대상조회·상태변경.
3. **기존 기능·이슈 확인:** #1015와 PR #1028/#1060으로 `주문서 앱 접근권한 설정` 메뉴, 기간 1~365일, 미리보기/복구가 구현됐다. 그러나 #1015 코멘트에 “로컬 인증 2건이라 영향 측정 불가, 판정 기준 전환 보류”가 명시돼 있다. 즉 기능은 있으나 원본 의미는 아직 미계승이다.
4. **후보와 대가:** (A) 원본 주문·출고 활동 기준을 dry-run/영향 미리보기 후 활성 — 완전계승, 서비스 간 집계·scheduler 필요. (B) 현행 로그인 기준 유지 — 구현비용 없음, 주문은 활발하지만 로그인 없는 거래처를 잘못 막을 수 있음. (C) 두 날짜 중 최신값 — 차단 오탐 최소화, 원본에도 현행에도 없는 새 정책.
5. **권고:** **A**, 먼저 상태 write 없이 영향건수를 제시하고 개발책임자 승인 뒤 활성화한다.

### 13.1 결정 목록에서 제외한 기존 확정·기능

| 항목 | 제외 근거 |
|---|---|
| 수량 source/target·배수·수동잠금 | #896/#963/#967 및 V24, 개발책임자 확정 |
| 수량 조건 5축 | 판넬·리모컨·호스·받침·형태로 확정 |
| 수동 분류 권위 | `classification_manual`, 시트 sync guard 존재 |
| 6종 정액 판별 | #1090 최종 결정: 레거시 `getModelFlags` 정본, `discount_flags` 폐기 축 |
| 카드수수료 | 최상단 qty=1 품목에 포함, 없으면 별도행으로 확정 |
| 가격 0·미등록 가격 | 전부 0원 진행 확정 |
| 창고 | 견적 사용자가 선택 확정; `decideWarehouseCode_` 미이식은 의도적 |
| DC | 거래처 설정, 미설정 45%; V4/V5와 UI 존재 |
| 세트 배분 | #1093/#1143 자동품목 비율합 10 확정 |
| 특수행 운임/절삭 | #875 source/identity 구현 완료 |
| 옵션·카드·VAT·footer·선금 설정 | `estimate_configs` V4/V5 및 관리 UI 존재 |

## 14. 최종 산술 검산

```text
고정 분모                 489
업무규칙                  217 = R01 27 + R02 44 + R03 24 + R04 35 + R05 23 + R06 26 + R07 25 + R08 13
UI·표시                   174
인프라·유틸                54
dead_code                  44
합계                      489
미분류                      0
결정 필요                   4
```
