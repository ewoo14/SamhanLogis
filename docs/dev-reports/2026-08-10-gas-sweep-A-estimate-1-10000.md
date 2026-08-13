# GAS 전수조사 — 배정 범위 A: `index.ejs` 1~10000행

> 조사 대상: `clients/web/estimate-app/views/index.ejs` 1~10000행  
> 고정 분모: `docs/dev-reports/2026-08-10-gas-function-inventory.md`  
> 조사 원칙: 코드·테스트·스키마·마이그레이션·git 변경 없이 레거시 법칙만 조사한다.

## 1. 완결성 집계

```text
배정 범위 함수 수      358        (인벤토리의 index.ejs 1~10000행 항목)
분류한 함수 수         358        ← 배정 범위 함수 수와 일치
  ├ 업무규칙 (이식 대상)  167
  ├ UI·표시 전용          121
  ├ 인프라·유틸             31
  └ 데드코드(호출부 없음)   39      167+121+31+39 = 358
미분류 함수 수            0
```

> 분류 합계는 인벤토리 항목과 기계 대조했다. 업무규칙 상세 판정은 아래에 이어진다.

## 2. 전수 분류표 — 인벤토리 358개 전부

> 분류 기준: 실제 업무 결과·가격·분류·구성·수량·검증을 정하는 항목은 업무규칙, DOM 렌더·입력 표현·모달·필터는 UI, 파싱·보안·폴리필·상태보호는 인프라·유틸, 정의명 텍스트 출현이 1회뿐이고 HTML 인라인 참조도 없는 이름 있는 함수는 데드코드로 판정했다. 기계 인벤토리가 실제 함수가 아닌 지역 변수 선언까지 잡은 경우에도 고정 분모를 보존해 `익명/인라인 항목`으로 1건 처리했다.

| 줄 | 함수/인벤토리 항목 | 분류 |
|---:|---|---|
| 1262 | `makeRunner` | 인프라·유틸 |
| 1264 | `target` | 인프라·유틸 |
| 1289 | `익명 getter` | 인프라·유틸 |
| 1290 | `익명/인라인 항목` | 인프라·유틸 |
| 1291 | `익명/인라인 항목` | 인프라·유틸 |
| 1311 | `isSlipPublishSuccess` | 업무규칙 |
| 2267 | `getBaseListPrice` | 업무규칙 |
| 2282 | `J` | 인프라·유틸 |
| 2291 | `catalogSpecialMetadata` | 업무규칙 |
| 2300 | `catalogSpecialSource` | 데드코드(호출부 없음) |
| 2368 | `getModelFlags` | 업무규칙 |
| 2398 | `getRealHomePrice` | 업무규칙 |
| 2403 | `getRealCommPrice` | 업무규칙 |
| 2408 | `getRealSinglePrice` | 업무규칙 |
| 2414 | `getRealOldPrice` | 업무규칙 |
| 2440 | `applyConfigFromServer` | 데드코드(호출부 없음) |
| 2463 | `estimateConfigNumber` | 업무규칙 |
| 2468 | `getOldDiscountPercent` | 업무규칙 |
| 2472 | `getCardFeeRate` | 업무규칙 |
| 2476 | `getVatDivisor` | 업무규칙 |
| 2480 | `escapeEstimateHtml` | 인프라·유틸 |
| 2488 | `escapeEstimateAttr` | 인프라·유틸 |
| 2491 | `safeEstimateImageSrc` | 인프라·유틸 |
| 2508 | `safeEstimateImageSrcAttr` | 인프라·유틸 |
| 2512 | `escapeEstimateJsString` | 인프라·유틸 |
| 2520 | `estimateOptionHtml` | UI·표시 전용 |
| 2524 | `estimateSpecValueHtml` | UI·표시 전용 |
| 2527 | `sanitizeLegacyTableHtml` | 인프라·유틸 |
| 2558 | `getFooterNoticeHtml` | 업무규칙 |
| 2567 | `applyEstimateTotalAdjustments` | 업무규칙 |
| 2585 | `applyCustomerDiscounts` | 업무규칙 |
| 2587 | `numOr` | 인프라·유틸 |
| 2600 | `useIHose` | 업무규칙 |
| 2613 | `setField` | UI·표시 전용 |
| 2619 | `setCheck` | UI·표시 전용 |
| 2646 | `getRealListPrice` | 업무규칙 |
| 2675 | `getRealSpec` | 데드코드(호출부 없음) |
| 2683 | `handleSpecInput` | UI·표시 전용 |
| 2723 | `makeSpecInput` | UI·표시 전용 |
| 2743 | `handleListPriceInput` | UI·표시 전용 |
| 2834 | `makeListPriceInput` | UI·표시 전용 |
| 2860 | `handlePriceInput` | UI·표시 전용 |
| 2964 | `makePriceInput` | UI·표시 전용 |
| 2991 | `handleFreightInput` | 업무규칙 |
| 3049 | `numInp` | UI·표시 전용 |
| 3096 | `roundSel` | UI·표시 전용 |
| 3126 | `parseFixedDc` | 업무규칙 |
| 3142 | `isWallMountName` | 데드코드(호출부 없음) |
| 3148 | `getStockState_` | 업무규칙 |
| 3174 | `modelExists` | 데드코드(호출부 없음) |
| 3176 | `isPanelRow` | 업무규칙 |
| 3177 | `s` | 업무규칙 |
| 3181 | `inferOneWaySize` | 업무규칙 |
| 3189 | `isRemoteRow` | 업무규칙 |
| 3190 | `s` | 업무규칙 |
| 3193 | `clearAllPanels` | 데드코드(호출부 없음) |
| 3196 | `clearAllRemotes` | 데드코드(호출부 없음) |
| 3201 | `pickPanelBy` | 업무규칙 |
| 3202 | `has` | 업무규칙 |
| 3204 | `text` | 업무규칙 |
| 3212 | `wantAir` | 업무규칙 |
| 3213 | `wantAI` | 업무규칙 |
| 3215 | `t` | 업무규칙 |
| 3242 | `cleanDisplayName` | UI·표시 전용 |
| 3250 | `stripCommKeywords` | UI·표시 전용 |
| 3272 | `displayOverrides` | UI·표시 전용 |
| 3284 | `adjustSingleSetBasePrice` | 업무규칙 |
| 3290 | `isAcc` | 업무규칙 |
| 3317 | `roundK` | 업무규칙 |
| 3323 | `roundByConfig` | 업무규칙 |
| 3346 | `isIndoorUnitPart` | 업무규칙 |
| 3359 | `isOutdoorUnitPart` | 업무규칙 |
| 3370 | `splitIndoorOutdoorToK` | 업무규칙 |
| 3384 | `mod` | 업무규칙 |
| 3398 | `analyzeSingleSetDiscountFlags` | 업무규칙 |
| 3403 | `isAcc` | 업무규칙 |
| 3428 | `closeSpecModal` | UI·표시 전용 |
| 3432 | `getSpecModelName` | UI·표시 전용 |
| 3438 | `getSpecModalCanvas` | UI·표시 전용 |
| 3463 | `copySpecImage` | UI·표시 전용 |
| 3477 | `saveSpecImage` | UI·표시 전용 |
| 3486 | `openSpecModalByItem` | UI·표시 전용 |
| 3495 | `isErv` | UI·표시 전용 |
| 3532 | `formatSpecialPriceForDisplay` | UI·표시 전용 |
| 3537 | `renderHomeSpec_` | UI·표시 전용 |
| 3579 | `renderSingleSpec_` | UI·표시 전용 |
| 3675 | `renderCommSpec_` | UI·표시 전용 |
| 3684 | `isSetOutdoor` | UI·표시 전용 |
| 3687 | `compParts` | UI·표시 전용 |
| 3782 | `renderErvSpec_` | UI·표시 전용 |
| 3792 | `join_` | UI·표시 전용 |
| 3826 | `renderPanelSpecCommon_` | UI·표시 전용 |
| 3838 | `buildTripleSpecRows_` | UI·표시 전용 |
| 3853 | `specTableWithTriple_` | UI·표시 전용 |
| 3865 | `val` | UI·표시 전용 |
| 3894 | `tVal` | UI·표시 전용 |
| 3904 | `renderComponentSpecs_` | UI·표시 전용 |
| 3906 | `s` | UI·표시 전용 |
| 4003 | `head` | UI·표시 전용 |
| 4018 | `specTable_` | UI·표시 전용 |
| 4027 | `val` | UI·표시 전용 |
| 4039 | `rawNameOf` | 인프라·유틸 |
| 4044 | `isCommIndoorRow` | 업무규칙 |
| 4050 | `isCommOutdoorRow` | 업무규칙 |
| 4056 | `commIndoorKind` | 업무규칙 |
| 4066 | `isCommPanelRow` | 업무규칙 |
| 4067 | `s` | 업무규칙 |
| 4072 | `isCommHoseRow` | 업무규칙 |
| 4073 | `s` | 업무규칙 |
| 4078 | `isCommRemoteRow` | 업무규칙 |
| 4079 | `s` | 업무규칙 |
| 4084 | `isCommPumpRow` | 업무규칙 |
| 4085 | `s` | 업무규칙 |
| 4090 | `computeCommRemoteModelForIndoor_` | 업무규칙 |
| 4092 | `opt` | 업무규칙 |
| 4122 | `pickHoseModel` | 업무규칙 |
| 4130 | `pickCommPanelModel` | 데드코드(호출부 없음) |
| 4137 | `hasExactHP` | 업무규칙 |
| 4143 | `parseSetHPs` | 업무규칙 |
| 4150 | `chooseBaseModel` | 업무규칙 |
| 4195 | `basesForSetPiecesByExistingRule_` | 데드코드(호출부 없음) |
| 4207 | `modelByNameLike` | 업무규칙 |
| 4212 | `row` | 업무규칙 |
| 4213 | `s` | 업무규칙 |
| 4220 | `countBranchForSet` | 업무규칙 |
| 4224 | `plus` | 업무규칙 |
| 4237 | `rgbForMid` | UI·표시 전용 |
| 4250 | `applyHomeMultiPriceVat` | 데드코드(호출부 없음) |
| 4257 | `normalizeHomeCategory` | 업무규칙 |
| 4272 | `isExpansionModel` | 업무규칙 |
| 4285 | `classifySingleSetFixed` | 업무규칙 |
| 4286 | `hay` | 업무규칙 |
| 4287 | `mdl` | 업무규칙 |
| 4326 | `priceFrom` | 업무규칙 |
| 4328 | `first` | 인프라·유틸 |
| 4344 | `homeUnitPrice` | 업무규칙 |
| 4379 | `finalRate` | 업무규칙 |
| 4390 | `partUnitPrice` | 업무규칙 |
| 4405 | `singleUnitPrice` | 데드코드(호출부 없음) |
| 4421 | `isAcc` | 데드코드(호출부 없음) |
| 4442 | `calc` | 데드코드(호출부 없음) |
| 4455 | `commUnitPrice` | 업무규칙 |
| 4456 | `r` | 업무규칙 |
| 4490 | `finalRate` | 업무규칙 |
| 4501 | `singleDispNameTrimmed` | UI·표시 전용 |
| 4508 | `size` | UI·표시 전용 |
| 4520 | `_HOSE_I_ANY` | 업무규칙 |
| 4522 | `FOOT_ROUND` | 업무규칙 |
| 4523 | `FOOT_FLAT` | 업무규칙 |
| 4524 | `REMOTE_WIRED` | 업무규칙 |
| 4525 | `REMOTE_WIRED_COLOR` | 업무규칙 |
| 4526 | `REMOTE_WIRED_KIT` | 업무규칙 |
| 4527 | `REMOTE_WIRELESS` | 업무규칙 |
| 4529 | `REMOTE_INF_DEFAULT` | 업무규칙 |
| 4530 | `REMOTE_COLOR_AIRCOMBO` | 업무규칙 |
| 4538 | `SS_WIRED_BOARD_ID` | 업무규칙 |
| 4539 | `SS_CEILING_PUMP_ID` | 업무규칙 |
| 4540 | `SS_FOOT_ROUND_ID` | 업무규칙 |
| 4541 | `SS_FOOT_FLAT_ID` | 업무규칙 |
| 4546 | `markAutoHome` | 인프라·유틸 |
| 4547 | `markAutoSingle` | 인프라·유틸 |
| 4560 | `trackInteraction` | UI·표시 전용 |
| 4605 | `applyAbsoluteLock` | 인프라·유틸 |
| 4630 | `익명 setter` | 인프라·유틸 |
| 4648 | `익명 setter` | 인프라·유틸 |
| 4666 | `sumHome` | 업무규칙 |
| 4667 | `sumSingles` | 업무규칙 |
| 4668 | `sumComm` | 업무규칙 |
| 4673 | `syncCommTotals` | 업무규칙 |
| 4689 | `setFootSum` | UI·표시 전용 |
| 4710 | `bindQty` | 데드코드(호출부 없음) |
| 4732 | `bindCommQtyEvents` | 데드코드(호출부 없음) |
| 4748 | `s` | 데드코드(호출부 없음) |
| 4758 | `s` | 데드코드(호출부 없음) |
| 4814 | `s` | 데드코드(호출부 없음) |
| 4859 | `bindCommQtyArrowNav` | UI·표시 전용 |
| 4880 | `getCapacity` | 인프라·유틸 |
| 4887 | `updateHomeRatio` | 업무규칙 |
| 4961 | `ratio` | 업무규칙 |
| 4974 | `updateCommRatio` | 업무규칙 |
| 5016 | `missingBranch` | 업무규칙 |
| 5041 | `ratio` | 업무규칙 |
| 5064 | `setPreviewFoot` | 데드코드(호출부 없음) |
| 5080 | `materialsSumForSet` | 업무규칙 |
| 5081 | `includeMat` | 업무규칙 |
| 5085 | `isDefaultComponent_` | 업무규칙 |
| 5089 | `getDefaultRemoteRows` | 업무규칙 |
| 5090 | `getOptionRemoteRow` | 업무규칙 |
| 5097 | `allowRemoteChange_` | 업무규칙 |
| 5101 | `is1WaySet_` | 업무규칙 |
| 5102 | `t` | 업무규칙 |
| 5106 | `getBasePanelRow` | 업무규칙 |
| 5107 | `pickPanelRow` | 업무규칙 |
| 5124 | `setBasePriceRightFirst` | 업무규칙 |
| 5134 | `calcSetUnitPrice` | 업무규칙 |
| 5149 | `panelExcluded` | 업무규칙 |
| 5192 | `partsForSetStrict_` | 업무규칙 |
| 5199 | `explodeSetParts` | 업무규칙 |
| 5203 | `includeMat` | 업무규칙 |
| 5335 | `partsForCommSet_` | 업무규칙 |
| 5337 | `rows` | 업무규칙 |
| 5346 | `inferStandCountForOutdoor_` | 업무규칙 |
| 5353 | `recalcCommAccessories` | 업무규칙 |
| 5355 | `outdoorModels` | 업무규칙 |
| 5382 | `escapeFilterRe_` | 인프라·유틸 |
| 5386 | `applyHomeFilter` | UI·표시 전용 |
| 5388 | `text` | UI·표시 전용 |
| 5407 | `applySingleFilter` | UI·표시 전용 |
| 5409 | `text` | UI·표시 전용 |
| 5427 | `applyCommFilter` | UI·표시 전용 |
| 5429 | `text` | UI·표시 전용 |
| 5449 | `updateHomeFilterOptions` | UI·표시 전용 |
| 5454 | `text` | UI·표시 전용 |
| 5511 | `updateSingleFilterOptions` | UI·표시 전용 |
| 5515 | `text` | UI·표시 전용 |
| 5522 | `size` | UI·표시 전용 |
| 5565 | `updateCommFilterOptions` | UI·표시 전용 |
| 5575 | `text` | UI·표시 전용 |
| 5675 | `initFilters` | UI·표시 전용 |
| 5689 | `syncIcon` | UI·표시 전용 |
| 5703 | `syncIcon` | UI·표시 전용 |
| 5719 | `syncIcon` | UI·표시 전용 |
| 5728 | `renderHome` | UI·표시 전용 |
| 5812 | `groupTop` | UI·표시 전용 |
| 5971 | `updateHomeRowPrice` | UI·표시 전용 |
| 6047 | `renderSingleSetParts` | UI·표시 전용 |
| 6087 | `pKey` | UI·표시 전용 |
| 6103 | `getRank` | UI·표시 전용 |
| 6104 | `k` | UI·표시 전용 |
| 6135 | `pKey` | UI·표시 전용 |
| 6171 | `baseP` | UI·표시 전용 |
| 6234 | `renderSingle` | UI·표시 전용 |
| 6244 | `size` | UI·표시 전용 |
| 6299 | `currentPrice` | UI·표시 전용 |
| 6304 | `groupTop` | UI·표시 전용 |
| 6306 | `szVal` | UI·표시 전용 |
| 6312 | `idx` | UI·표시 전용 |
| 6377 | `isManual` | UI·표시 전용 |
| 6454 | `realId` | UI·표시 전용 |
| 6522 | `buildSingleSetCompositionHtml_` | 데드코드(호출부 없음) |
| 6590 | `normalizeCommCategory` | 업무규칙 |
| 6598 | `fixCommMidCategory` | 업무규칙 |
| 6607 | `onCommOptionChange` | UI·표시 전용 |
| 6623 | `renderCommOptions` | UI·표시 전용 |
| 6678 | `getCommFilterRows_` | UI·표시 전용 |
| 6734 | `renderComm` | UI·표시 전용 |
| 6783 | `isEcoOutdoor` | UI·표시 전용 |
| 6823 | `currentPrice` | UI·표시 전용 |
| 6828 | `groupTop` | UI·표시 전용 |
| 6906 | `sText` | UI·표시 전용 |
| 6993 | `updateCommRowPrice` | UI·표시 전용 |
| 7037 | `s` | UI·표시 전용 |
| 7055 | `s` | UI·표시 전용 |
| 7123 | `buildDisplayNameComm` | UI·표시 전용 |
| 7161 | `displayNameForRow` | 데드코드(호출부 없음) |
| 7172 | `normKey` | 인프라·유틸 |
| 7178 | `buildCommSetIndex` | 업무규칙 |
| 7181 | `src` | 업무규칙 |
| 7190 | `qty` | 업무규칙 |
| 7193 | `price` | 업무규칙 |
| 7203 | `explodeCommPreviewParts` | 업무규칙 |
| 7210 | `unitPrice` | 업무규칙 |
| 7216 | `isCommSetRow` | 데드코드(호출부 없음) |
| 7221 | `explodeCommSets_` | 업무규칙 |
| 7240 | `mainSpec` | 업무규칙 |
| 7268 | `renderCommSetParts` | UI·표시 전용 |
| 7293 | `effQ` | 업무규칙 |
| 7380 | `renderOldOptions` | UI·표시 전용 |
| 7423 | `renderOld` | UI·표시 전용 |
| 7472 | `isManual` | UI·표시 전용 |
| 7563 | `sumOld` | 업무규칙 |
| 7587 | `syncOldTotals` | UI·표시 전용 |
| 7604 | `isMobileNow` | 인프라·유틸 |
| 7605 | `vv` | 인프라·유틸 |
| 7612 | `initMobileUI` | 데드코드(호출부 없음) |
| 7613 | `apply` | 데드코드(호출부 없음) |
| 7630 | `onViewportChange` | UI·표시 전용 |
| 7656 | `enterMobile` | UI·표시 전용 |
| 7677 | `updateTopControls` | UI·표시 전용 |
| 7712 | `onHomeQtyInput` | 데드코드(호출부 없음) |
| 7761 | `onSingleQtyInput` | 데드코드(호출부 없음) |
| 7763 | `key` | 데드코드(호출부 없음) |
| 7784 | `chk` | UI·표시 전용 |
| 7785 | `sel` | UI·표시 전용 |
| 7788 | `renderHomeOptions` | UI·표시 전용 |
| 7831 | `renderSingleOptions` | UI·표시 전용 |
| 7958 | `recomputeFootAll` | 업무규칙 |
| 7971 | `recomputeSingleBaseFoot` | 업무규칙 |
| 8012 | `recomputeSingleExtras` | 업무규칙 |
| 8037 | `isHomeCalcTriggerModel` | 업무규칙 |
| 8048 | `isSingleCalcTriggerId` | 업무규칙 |
| 8073 | `findHomePanelModel` | 데드코드(호출부 없음) |
| 8074 | `has` | 데드코드(호출부 없음) |
| 8088 | `pickInfinitePanelModel` | 데드코드(호출부 없음) |
| 8103 | `inferInfiniteSize` | 데드코드(호출부 없음) |
| 8112 | `recomputeHomePanels` | 업무규칙 |
| 8159 | `setP` | 업무규칙 |
| 8174 | `useAir` | 업무규칙 |
| 8225 | `recomputeHomeRemotes` | 업무규칙 |
| 8248 | `setR` | 업무규칙 |
| 8255 | `R_WE` | 업무규칙 |
| 8256 | `R_WG` | 업무규칙 |
| 8257 | `R_CH` | 업무규칙 |
| 8265 | `main` | 업무규칙 |
| 8272 | `recomputeHomeBranches` | 업무규칙 |
| 8274 | `setB` | 업무규칙 |
| 8333 | `recomputeHomeDerived` | 업무규칙 |
| 8354 | `setH` | 업무규칙 |
| 8390 | `recomputeCommDerived` | 업무규칙 |
| 8392 | `requireCommCatalogRow_` | 업무규칙 |
| 8393 | `row` | 업무규칙 |
| 8409 | `s` | 업무규칙 |
| 8536 | `s` | 업무규칙 |
| 8556 | `isSpecialRemote` | 업무규칙 |
| 8607 | `has_` | 데드코드(호출부 없음) |
| 8608 | `computeCommPanelModelForIndoor_` | 업무규칙 |
| 8610 | `panelOpt` | 업무규칙 |
| 8630 | `swap` | 업무규칙 |
| 8694 | `syncHomeUIFromState` | UI·표시 전용 |
| 8770 | `syncSingleUIFromState` | UI·표시 전용 |
| 8834 | `syncHomeTotals` | UI·표시 전용 |
| 8849 | `syncSingleTotals` | UI·표시 전용 |
| 8865 | `refreshSelectedBadge` | UI·표시 전용 |
| 8952 | `getSetUnitNowById` | 데드코드(호출부 없음) |
| 8966 | `explodeSendSets_` | 업무규칙 |
| 8971 | `isAccessory` | 업무규칙 |
| 8998 | `openPreview` | UI·표시 전용 |
| 9009 | `closePreview` | UI·표시 전용 |
| 9018 | `openFinal` | 데드코드(호출부 없음) |
| 9031 | `closeFinal` | UI·표시 전용 |
| 9040 | `ensureKakaoPostcode` | 데드코드(호출부 없음) |
| 9049 | `mountAddrSheet` | 데드코드(호출부 없음) |
| 9096 | `fit` | 데드코드(호출부 없음) |
| 9115 | `isValidTel` | 업무규칙 |
| 9119 | `syncAuditFromShip_` | UI·표시 전용 |
| 9126 | `toggleSameAddr_` | UI·표시 전용 |
| 9154 | `syncBizAddr` | UI·표시 전용 |
| 9171 | `checkOrderReady` | 업무규칙 |
| 9188 | `aggregateSendRows` | 업무규칙 |
| 9229 | `showSector` | 데드코드(호출부 없음) |
| 9233 | `el` | 데드코드(호출부 없음) |
| 9249 | `startAuth` | 인프라·유틸 |
| 9278 | `showAuthFail` | UI·표시 전용 |
| 9286 | `initGate` | 인프라·유틸 |
| 9340 | `showResetProgress` | 인프라·유틸 |
| 9357 | `bindResetButtons` | 인프라·유틸 |
| 9378 | `buildSendRows` | 업무규칙 |
| 9391 | `fullAddr` | 업무규칙 |
| 9396 | `addP` | 업무규칙 |
| 9419 | `getActiveFixedDc` | 업무규칙 |
| 9439 | `getLiveSpec` | 업무규칙 |
| 9684 | `extractSpecs` | UI·표시 전용 |
| 9687 | `add` | 인프라·유틸 |
| 9713 | `join_` | 인프라·유틸 |
| 9840 | `openSelectedSpec` | UI·표시 전용 |
| 9842 | `addIfTarget` | UI·표시 전용 |
| 9962 | `getSpecCanvas` | UI·표시 전용 |
| 9990 | `copySelectedSpec` | UI·표시 전용 |
