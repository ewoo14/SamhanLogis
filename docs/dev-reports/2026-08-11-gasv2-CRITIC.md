# GAS 전수조사 v2 — 완결성 비판

> 작성일: 2026-08-11  
> 역할: CODEX SOL 5.6 — 완결성 비판자  
> 범위: 읽기 전용 조사. 코드·스키마·git·공유 DB는 변경하지 않았다.

검사 입력은 `2026-08-11-gas-function-inventory-v2.md`와 `2026-08-11-gasv2-origin-estimate-order.md`, `2026-08-11-gasv2-origin-money.md`, `2026-08-11-gasv2-origin-rest.md`, `2026-08-11-gasv2-ported-order-lib.md`, `2026-08-11-gasv2-ported-estimate-ejs.md` 전부다.

## 0. 판정

v2의 `3,200 전건`은 전수 분모가 아니다.

| 구멍 | 확인된 수치 | 판정 |
|---|---:|---|
| 고정 inventory 이후 추가됐으나 빠진 함수 | 7 | 현재 소스와 분모가 불일치 |
| 71파일의 의미 있는 이름을 가진 함수형 AST 노드 | 최소 3,595 | 3,200보다 최소 395 많음. 파서 진단 20건이 있어 하한임 |
| 71파일의 전체 함수형 AST 노드 | 최소 8,255 | 익명 callback까지 포함하면 정규식 분모와 범주 자체가 다름 |
| 실제 메서드 중 9패턴이 놓친 것 | 10 | `async`, 타입 반환식, 한 줄 메서드 등을 놓침 |
| IIFE | 19 | 9패턴에 대응 패턴이 없음 |
| 조건부 함수/화살표 대입 | 10 | 9패턴에 대응 패턴이 없음 |
| HTML/EJS 인라인 handler 속성 | 760 | 80건은 복합 실행문이며 함수 inventory 밖 |
| 71파일 밖 golden/oracle 규칙 모듈 | 5파일·함수/화살표 토큰 93 | 업무규칙 검증 정본이 분모 밖 |
| 원본 업무규칙 이름 중 포팅본에 없는 고유 이름 | 257 | 이름 기준 유실 검토 큐. v2 보고서가 전량 대조하지 않음 |
| ⑤ 데드 44건의 호출 오판 | 0 | 단, ①에서 같은 기준을 적용하지 않아 최소 8건을 반대로 살려 둠 |

따라서 다음 라운드는 `3,200`을 보정하는 방식으로 끝내면 안 된다. **소스 commit을 고정하고 AST 기반으로 실행 가능한 코드 단위를 재추출한 뒤, production·oracle·manifest/handler·DB policy를 서로 다른 분모로 공개해야 한다.**

## 1. 분모 v2가 놓친 것

### 1.1 문서의 9개 패턴만으로는 3,200을 재현할 수 없다

추출 문서에 실린 9개 정규식을 그대로 적용하면 제어문까지 잡혀 7,041건이 된다. `if/for/while/switch/catch/with`를 별도로 제외해야 3,207건이 된다. 이 숨은 제외조건은 분모 문서에 없다.

```text
명령: 71개 section의 파일에 inventory 문서의 9개 패턴을 그대로 적용
출력: EXPECTED_TOTAL=3200
      ACTUAL_9PATTERN_TOTAL=7041

명령: method-short 결과에서 if|for|while|switch|catch|with 제외
출력: ACTUAL_EXCL_CONTROL_TOTAL=3207
      mismatch files=2
```

다음 라운드: 추출기 전체 소스·제외어·대상 commit SHA를 문서에 넣고, 재실행 결과를 artifact로 남겨야 한다. 사람이 다시 작성한 “패턴 9종” 설명은 재현 명세가 아니다.

### 1.2 고정 분모가 현재 소스보다 7건 뒤처졌다

inventory commit은 `5731ef955`, 이후 `2c62202c6`에서 수량 동기화가 들어왔다.

```text
$ git log --oneline -8 -- <inventory> <db-catalog.js> <index.ejs>
2c62202c6 [FEAT] #896 품목 수량 동기화를 칩 기반 설정으로 ...
5731ef955 docs(gas): 분모 v2 — 3,200 함수 ...
```

9패턴을 현재 소스에 다시 적용한 차이는 다음 7건이다.

| 파일 | inventory | 현재 | 빠진 함수 |
|---|---:|---:|---|
| `clients/web/estimate-app/lib/db-catalog.js` | 16 | 17 | `quantitySyncRules` |
| `clients/web/estimate-app/views/index.ejs` | 489 | 495 | `isHomeRemoteContractRow` 2개, `recomputeHomeHoses_`, `applyServerHomeQuantitySync_`, `legacyHomeQuantitiesWithoutRuleSources`, `reconcileHomeFamily` |

7건 모두 #896 수량 규칙·계약과 관련되어 단순 UI 보조가 아니다. ④ 보고서도 `db-catalog.js:52 quantitySyncRules`가 고정 inventory 이후 추가돼 제외됐다고 스스로 적었다.

다음 라운드: 조사 시작 commit을 고정하거나 조사 중 source drift를 막고, 보고서 머리말에 `git rev-parse HEAD`를 넣어야 한다. 현재 HEAD를 조사하려면 분모는 우선 3,207로 갱신해야 하지만, 아래 구문 누락 때문에 3,207도 전수가 아니다.

### 1.3 구문 형태별 실측

71파일의 JS/TS/HTML/EJS script block을 TypeScript parser로 읽고, 정규식 실측을 별도로 대조했다.

| 검사 형태 | 실측 | 9패턴 포착 | 구멍 |
|---|---:|---:|---:|
| class/object 메서드 + constructor | 44 | 34 | 10 |
| getter | 0 | 0 | 0 |
| setter | 0 | 0 | 0 |
| `(function ... )(...)` IIFE | 19 | 0 | 19 |
| 화살표 IIFE | 0 | 0 | 0 |
| `Object.assign(...)` 호출 | 28 | 직접 부착 callable 0 | 0건이지만 패턴 지원은 없음 |
| 조건부 `.prop = function/arrow` | 10 | 0 | 10 |
| 문자열 `eval(...)` | 0 | 0 | 0 |
| `new Function(...)` | 1 | 0 | 1 |
| `.gs` tracked file | 0 | 해당 없음 | 0 |
| `appsscript.json` | 26 | 분모 밖 | 26개 별도 조사 필요 |
| manifest의 trigger 선언 | 0 | 해당 없음 | 0 |
| HTML/EJS 인라인 handler 속성 | 760 | 분모 밖 | 760 |
| EJS scriptlet | 22 | 분모 밖 | 함수 정의 0, 모두 출력 주입 |

메서드 44건은 AST `MethodDeclaration 40 + Constructor 4`다. inventory의 `method-short` 40행 중 5행은 함수가 아닌 `setTimeout(...)` 호출이고, 1행은 화살표 함수가 잘못 라벨링된 것이다. 실제 메서드 포착은 34건뿐이다. 대표 누락은 다음과 같다.

- `clients/web/order-app/src/main.ts:62`의 `async getQuantitySyncRules`
- `clients/web/order-app/src/samhanApi.ts:442`의 typed `call`, `fetchBootstrap`, `fetchQuantitySyncRules`
- `clients/web/estimate-app/lib/apps-script-shim.js`의 한 줄 class 메서드들

```text
AST 출력: FunctionDeclaration=2728, FunctionExpression=589,
          ArrowFunction=4894, MethodDeclaration=40, Constructor=4
          total=8255, semanticNamed=3595, anonymous=4660
파서 진단: 5개 파일/script block에서 20건
```

`semanticNamed 3,595 - inventory 3,200 = 395`이므로 이름을 붙일 수 있는 실행 단위만 보아도 최소 395건이 빠졌다. 다만 파서 진단과 inventory의 false positive가 함께 있으므로 395는 정확한 새 분모가 아니라 **누락 하한**이다.

인라인 handler는 760건 중 단순 이름 호출 680건, 복합 실행문 80건이다. `estimate-app/views/index.ejs:19974`의 `new Function('event', source)`가 handler 문자열을 실제 함수로 컴파일한다. “HTML 속성일 뿐 함수가 아니다”라고 제외할 수 없다.

EJS scriptlet 22건은 모두 `<%=`, `<%-` 출력 주입이며 서버측 함수·제어문은 없었다. `.gs`와 manifest trigger도 0건이었다. 이 세 항목은 **이번 저장소에서 구멍이 없음을 파일 확장자 전수와 JSON key 전수로 확인**했다.

다음 라운드:

1. Babel/TypeScript AST로 declaration, expression, arrow, method, accessor, constructor, IIFE, property assignment를 동일 visitor에서 뽑는다.
2. HTML handler는 속성별 별도 registry로 만들고 `new Function` 소비 경로와 연결한다.
3. `appsscript.json`은 함수 분모가 아니라 deploy/trigger entrypoint 분모로 별도 공개한다.
4. 이름 하나가 아니라 `파일 + lexical scope + 시작 offset + body hash`를 식별자로 쓴다.

## 2. 71파일 밖 업무규칙 파일

### 2.1 legacy-gas에서 제외된 35개는 업무규칙 함수 누락이 아니었다

```text
git ls-files tools/legacy-gas/** = 86
inventory 포함 = 51
제외 = 35 = appsscript.json 26 + HTML asset include 8 + samsung.png 1
```

8개 HTML asset include는 로고·도장·폰트 조각이며 함수/화살표 토큰이 0이었다. 26개 manifest는 trigger 0, webapp 선언 22였다. 이 35개에서 새 업무규칙 함수는 확인되지 않았다.

### 2.2 그러나 저장소 전체의 규칙 정본은 71파일에 한정되지 않는다

`git ls-files` 전체에서 다음의 고신뢰 규칙 파일이 분모 밖에 있었다.

| 바깥 범주 | 최소 파일 수 | 확인 내용 |
|---|---:|---|
| golden/oracle | 5 | 수량·가격·세트 경계와 기대값. 함수/화살표 토큰 93 |
| 데스크톱 인쇄 계산 | 5 | 금액/VAT, 날짜, 사업자번호, 잔액·합계, 내일자 수량 |
| 서비스 업무규칙 엔진 | 6 | DC/가격, 지역, bundle 전개, DPS 대조 |
| 규칙성 migration | 11 | DC·단위처리·옵션 기본, 지역 배차, 가격 일정, 수량 sync, 추천/분기관 |

golden/oracle 5파일:

```text
clients/web/legacy-quantity-golden/fixtures.js
clients/web/legacy-quantity-golden/goldens.js
clients/web/legacy-quantity-golden/legacyQuantityBoundary.js
clients/web/legacy-quantity-golden/priceParityS3Cases.js
clients/web/legacy-quantity-golden/r23HomeMultiCatalog.js
```

인쇄 5파일:

```text
clients/desktop/src/renderer/print/printAmounts.ts
clients/desktop/src/renderer/print/TaxInvoiceView.tsx
clients/desktop/src/renderer/print/StatementBatchView.tsx
clients/desktop/src/renderer/print/NextDaySlipView.tsx
clients/desktop/src/renderer/print/PartnerLedgerView.tsx
```

서비스 6파일:

```text
services/dc-config-service/.../PriceCalculationService.java
services/dc-config-service/.../DcConfigService.java
services/arologis-service/.../RegionClassifier.java
services/arologis-service/.../RegionalService.java
services/product-service/.../BundleExpander.java
services/inventory-service/.../DpsCompareService.java
```

고신뢰 migration 11개는 `dc-config-service` V1/V2/V4/V5, `product-service` V3/V10/V22/V23/V24/V26, `arologis-service` V3이다. 이 파일들은 단순 schema가 아니라 fallback, option default, effective-date, 수량 규칙, 지역 분류의 허용 상태를 고정한다.

반대 사례도 확인했다. `clients/desktop/src/preload/legacyShim.ts`와 `clients/desktop/src/main/legacy-asset.ts`는 경로·IPC shim뿐이고 업무규칙은 없었다. mobile webview 4파일은 모두 71파일에 포함됐고, tracked `.ejs`는 조사 대상 1개뿐이다.

다음 라운드: “GAS 함수 전수”와 “현 저장소 업무규칙 전수”를 분리한다. 후자를 주장하려면 production, migration/seed, oracle/fixture, UI print/export, external adapter policy를 각각 분모로 세고 상호 traceability를 만들어야 한다.

## 3. 데드코드 판정 편차

### 3.1 ⑤의 데드 44건은 호출 오판을 찾지 못했다

44개 이름을 현재 EJS 전체에서 token boundary로 다시 셌다.

```text
정확히 1회 등장 = 39
2회 이상 등장 = 5: calc, updateTopControls, has, fit, enforceDateLimit
```

5건도 live 호출은 아니었다.

- `calc`는 미호출 부모 `singleUnitPrice` 안의 지역 함수다.
- `has`는 미호출 부모 `findHomePanelModel` 안의 지역 함수다.
- `fit`은 미호출 부모 `mountAddrSheet` 안의 지역 함수다.
- 앞쪽 `updateTopControls`는 뒤쪽 동명 선언에 hoist/overwrite된다.
- 앞쪽 `enforceDateLimit`도 뒤쪽 동명 선언에 overwrite되고 listener는 뒤쪽 선언을 쓴다.

따라서 ⑤의 44건에서 1차와 같은 “호출부가 있는데 dead”인 오판은 0건이었다. 단, 이것이 dead 판정이 일관되다는 뜻은 아니다.

### 3.2 ①은 같은 계보의 dead를 최소 8건 살려 두었다

①의 6개 원본 파일을 같은 token 기준으로 합산하면 정의 외 참조가 0인 이름이 22개다.

```text
textProp, _triggerAuth, forceAuthCheck, setBasePriceLeft, onresize,
debugIndoorsScan, setBranchTopButtonForBranch, limitByOutdoor, sumCapsIn,
firstBranchByOutdoorCap, setCommBranchQtyByLike, isGateVisible,
rotatePasswordsMonthly, processLongTermUnusedClientsFast, getRealSpec,
openFinal, copyToClipboardImage, downloadFile, initValidationEvents,
loadOrderData, fillCustomer, hideAllPages
```

이 중 아래 8개는 ⑤에서 같은 이름·같은 계보가 dead로 판정됐는데 ①은 dead 0건으로 처리했다.

```text
getRealSpec, openFinal, copyToClipboardImage, downloadFile,
initValidationEvents, loadOrderData, fillCustomer, hideAllPages
```

브라우저 HTML 함수라 Apps Script 설치형 trigger 예외도 아니다. **⑤의 false-dead는 0이지만 ①의 false-live는 최소 8건**이다. 나머지 14개에는 `onresize`, 시간 trigger 후보, 외부 entrypoint 후보가 섞여 있어 root allowlist 없이 dead로 단정하지 않았다.

다음 라운드: 전 파티션에 동일한 call graph를 적용하고 root를 `manifest trigger`, HTML handler, `google.script.run`, external public entrypoint, timer 문자열 참조로 명시해야 한다. 지역 함수는 부모 reachability를 상속하고, 동명 선언은 JavaScript hoisting/overwrite를 반영해야 한다.

## 4. 파티션 집계 대조

임의 3개로 ②, ③, ⑤를 다시 합산했다.

| 파티션 | 보고 총계 | 하위 합 | 원장 합 | 구멍 |
|---|---:|---:|---:|---|
| ② 원본 money | 386 | 86+212+79+9=386 | project 합 386 | `setTimeout` 호출 2건을 함수로 유지 |
| ③ 원본 rest | 717 | 209+305+192+11=717 | 2,096-993-386=717 | `setTimeout` 호출 2건을 함수로 유지 |
| ⑤ 포팅 estimate EJS | 489 | 217+174+54+44=489 | R01~R08 업무규칙 합 217 | 현재 소스는 같은 9패턴으로 495, 6건 stale |

숫자 덧셈은 맞지만 분모 품질을 검증하지 않는다. ②·③은 정규식 false positive를 알고도 분모 보존을 위해 UI 함수로 분류했고, ⑤는 작성 시점 직후 source drift를 흡수하지 못했다.

다음 라운드: 파티션 합계 검사와 별개로 `false-positive count`, `unparsed count`, `source-drift count`, `out-of-scope executable count`를 각 파티션 필수 열로 둬야 한다.

## 5. `[불가]`인데 결정 목록에서 빠진 것

| 빠진 결정 | 확인 근거 | 건수/영향 | 처리 |
|---|---|---|---|
| 영업수수료 도메인 자체를 이식·대체·폐기할지 | ② C1~C4 전부 `[불가]`; 결정 4는 수기율·음수 검증만 질문 | 1개 대형 결정. 계산·정산·세금계산서 연결 전체 | 최종 결정 목록에 추가 |
| 원장 계정 `9199/9549/1089` 특례를 회계 정본에 넣을지 | ② L계열에서 현재 fold와 금액이 다름; 10개 결정에 없음 | 3계정, 잔액 영향 | 최종 결정 목록에 추가 |
| 견적/주문 snapshot·history 저장 도메인 | ① R08, ④ snapshot/manual state가 `[불가]`; 별도 결정 없음 | 저장·복원 의미 | 새 질문 금지, 이미 #1092에 귀속 |
| 수동행·파생수량 provenance/lock 저장계약 | ①·④에서 product 기본값으로 승격 불가, snapshot 밖 저장 위치 없음 | 재계산 수량 영향 | #896과 #1092의 acceptance criterion으로 이동 |
| 세금계산서 header/line/발급 snapshot | ② T3 `[불가]`, 보고서는 신규 도메인처럼 취급 | 금액·발급 상태 | 새 질문 금지, 이미 #1144 및 기존 tax invoice 코드에 귀속 |

다음 라운드: 각 `[불가]` 행은 반드시 `결정 ID`, `기존 issue`, `의도적 폐기`, `조사 범위 밖 기존 구현` 중 하나와 연결해야 한다. 지금은 `[불가]`와 결정 목록이 양방향으로 추적되지 않는다.

## 6. 원본에만 있고 포팅본에 없는 업무규칙 이름

5개 보고서의 업무규칙 원장을 파싱해 이름을 집합으로 비교했다.

```text
원본 업무규칙 행: 395 + 86 + 209 = 690
포팅 업무규칙 행: 230 + 217 = 447
원본 고유 이름 union = 461
포팅 고유 이름 union = 336
원본-only 고유 이름 = 257
```

257은 **이름 기준 유실 후보**다. rename, adapter 통합, 익명화가 있으므로 257개 모두 유실 확정은 아니다. 그러나 기존 v2가 ① 일부 14개만 뽑고 ②·③ 전체와 ④·⑤를 set 비교하지 않은 것은 조사 구멍이다.

중복 이름을 최초 원본 파티션에만 귀속한 전체 목록은 다음과 같다.

### 6.1 ①에서만 남은 35개

```text
buildSingleSetCompositionHtml_, canOpenBranch, canOpenBranchFromComm, comma,
debugIndoorsScan, extractIncreasePrices_, extractSingleIncreasePrices_,
fetchNotionDcConfig_, fetchOrderHistory, getActiveBizNosFromLog_,
getActiveBizNosFromShipping_, getCommIncreasePrices_, getHomeIncreasePrices_,
getOrderHistory, getOrderSnapshotHistory, getPriceIncData_, getQuoteHistory,
getQuoteHistoryByCustomer, getRealSpec, getSingleIncreasePrices_,
getSinglePartsIncreasePrices_, getSpecMap_, getTargetClients_, isSoldOutByNote_,
loadOrderData, processLongTermUnusedClientsFast, removeCustomRow,
saveOrderSnapshot, saveQuoteSnapshot, scanComm, scanHome, scanSingle,
setBranchTopButtonForBranch, setPreviewFoot, updateClientStatus_
```

### 6.2 ②에서 새로 남은 70개

```text
applyExceptionRealtime, checkDuplicates, classifyComp, clean_item_name_,
cleanCustomerName, drawImage, drawInvoiceCanvas, exportToExcel,
extractAndRenderDates, extractDiscountNumbers, extractModelToken_, extractNum,
extractReceiptData, extractSheetData, findCol, fmt, fmtAmt, fmtMinusUnit,
formatDf, formatInput, formatNum, formatReceipt, getExpenseRate, getValues,
handleFile, isExcludedByName, isExcludedByWord, isTargetModelCode_,
loadPriceMap_, loadSingleSetCatalog, markCompleted, money_to_int_, names,
normCode, normPhone, notion_extract_dc_, numToKorean, parseAccountLedger,
parseAnyDate, parseDateCol, parseDateColReceipt, parseNoToDate, parseNum,
processDailyData, processExcelData, processLocalData, recalc, recalcRow,
reclassifyTabs, remarkCompleted, renderDoc, renderTable, renderTableData,
resetForm, restoreState, runProcess, setExp, setFilterToggle, setMultiToggle,
setPay, setWht, sStr, toggleBeforeHike, toNum, unmarkCompleted,
updateFooterSums, updateMergedTextVal, updateVal, validateExcelFormat, xround
```

### 6.3 ③에서 새로 남은 152개

```text
_coerceQtyToken_, addOrder, aliasModelIfNeeded_, analyzeFiltered, applyPricing_,
applyPricingWithDC_, applySingleSetDiscount_, assembleMents, boolKey,
build_classification_item, buildItemsInPreviewOrder_, buildNotionDict_,
buildOrderQtyMap_, buildSingleSetMap_, buildTargetLinks_, capQtyToOrder_,
checkAndUpdateNotion, checkDuplicatesFor, chk, chowol_except_region,
chowol_with_region, classify, clean_special_spec, cleanModelName, cleanupSeps_,
cmp, confirmEcount, decideWarehouseFromItems_, detectOptionsFromRawName_,
detectWarehouseFromItems_, distributeSetPrice_, downloadData, driverPhone,
executeAllClients, executeGolf, executePromo, expandSingleSetItems_, extract_item,
extract_yajek_item, extractItemsFromTable_, extractItemsLooseRow_,
extractItemsVerticalList_, extractNumbers, fetchCsvData, fetchExternalData,
fetchNotionPricingForCustomer_, fillMap, findIdx, findRightmostHeaderIndex_,
firstCodeToken_, fixLargeQty_, fmtMoney, formatPct_, formatPrefix,
formatShortKrwMinus_, generateFormatStr, get_region_index, getChartData,
getChatMapData, getCombinedLocalPhones, getCustomerList_,
getDeliveryInitialState, getForbiddenData, getHomeModelOrder_,
getHomeModelPriceMap_, getManagers_, getMasterModelOrder_, getMasterSpecMap_,
getPricingConfig_, getRegionCode, getRegionFromNotion,
getSingleSetDiscountTotal_, getZeroOKeyCandidates_, groupRank_, handleExtract,
hashPassword_, initDayMappingUI, isBolt, isHomeMultiCode_, isLikelyCode_,
isSingleCode_, keyG, keyHome, loadModelNameMaps_, lookupCustomerMemos_,
lookupEcount, main, makeOrderedFinalItems, mergeKeepLastScoped_,
mergeNotionIntoMatrix_, mergeSrcItemsByModel_, migratePasswordsToHash, norm,
normalizePhoneJS, normalizeSep_, normModel, openEcountModal, orderIndex_,
overrideSpecialUnitPrice_, parse_address, parseDcRate_, parseKoreanTimeWindow_,
parseOrderFromText_, parseShortDiscount_, pct, pickQtyToken_,
proceedToDateModal, process_address_for_search,
process_address_for_search_local, process_pd_to_final, processData,
processDispatchData, processManagerJS, processMemoAndCustomer_,
processModelData, processNextBatch, processOne_, pushGrouped, region_only,
removeSegment_, resetCounters, roundToStep_, rowTargetDay, runClassification,
runMatching, sangil_chowol_except_region, sangil_chowol_with_region,
sangil_except_region, sangil_with_region, sel, sendFromPreview, sendNow,
sendOrderToEcount_, sendToEcountAPI, skip_warehouse_filter, sortData,
sortFinalItemsForSend_, sortItemsForSend_, squashConsecutiveSpecs_,
squashPreviewSets_, startUpdateCore_, startUpdateFromExcel_,
stripNotionSegments_, stripNotionSegmentsAll_, syncEcountChunk, syncServerData,
take, takeOne, tryMatch, updateChart, won, yajeok_only
```

다음 라운드: 257개마다 `동일 body`, `rename`, `service 대체`, `의도적 폐기`, `유실`, `미확인` 중 하나를 부여한다. 이름만 비슷한지 보는 대신 규칙의 입력·상수·분기·출력 side effect signature를 비교해야 한다. 특히 ②의 수수료·원장, ③의 dispatch/DPS/vendor/parser/auth 계열을 우선한다.

## 7. “결정 필요”인데 저장소에 이미 있는 것

5개 보고서의 결정 항목은 원문 기준 50개(8+10+14+14+4)다. 중복을 합치고 `git ls-files`, `rg`, `gh issue view`로 대조하니 다음은 개발책임자께 새 결정으로 다시 올리면 안 된다.

| 항목 | 이미 있는 근거 | 조치 |
|---|---|---|
| 거래처 DC 설정 | `SalesPartnerDcConfigPage.tsx`, `dc-config-service`, V1/V2/V4/V5 | 구현 여부 질문 삭제. 의미 차이만 기존 기능의 결함으로 기록 |
| 배차 지역 설정 | `routes/admin/RegionsPage.tsx`, `RegionAdminController`, `RegionClassifier`, arologis V3 | 신규 도메인 질문 삭제 |
| 세트 비율·반올림 | #1093 CLOSED, #1143 OPEN, `BundleExpander.java` | #1143으로 귀속 |
| 단가변동·가격 기준일 | #1140 OPEN, product V22/V23/V26, pricing 화면/API | `*_INC` 의미를 다시 묻지 말고 #1140 acceptance criterion으로 귀속 |
| 수량 규칙 권위·조건·수동잠금 | #896 OPEN, V24, 현재 EJS의 #896 후속 | 별도 D-03~D-06 질문 삭제, #896으로 귀속 |
| 고정 DC/정액 분류·품목 상태 | #1090 OPEN, #1095 CLOSED | 분류 정본을 다시 묻지 말고 해당 issue의 회귀로 처리 |
| 견적/주문 snapshot·history | #1092 OPEN | `[불가]` 누락은 #1092로 이동 |
| 장기미발주 관리 화면 | #1015 CLOSED, `SalesOrderApprovalsPage`, `PartnerApprovalService` | 기능 유무 질문 삭제. 활동 기준 전환만 남김 |
| DPS 대조 | #1011 CLOSED, `DpsCompareService` 및 화면 | 신규 기능 결정이 아니라 계승 결과의 semantic defect 재검증 |
| 알리고 실호출·CSV 계승 | #1016 CLOSED, #1098 OPEN | #1098로 귀속 |
| 세금계산서·회계전표 | #1144 OPEN, #824 CLOSED, tax invoice/print 코드 | schema 부재 주장 철회, #1144로 귀속 |
| 원장/명세서/내일자 문서 이력 | #1001, #1014 CLOSED, print route들 | 신규 구현 질문 삭제. 정책 차이만 회귀 issue 후보 |

실제 Issue 조회 출력의 핵심은 다음과 같다.

```text
#896  [OPEN] 품목 수량 동기화를 ... 칩 기반 설정으로 전환
#1011 [CLOSED] ... DPS 비교 ... 완전계승
#1015 [CLOSED] 주문서 앱 접근권한 설정 ... 장기미발주 ... 통합
#1090 [OPEN] 정액 할인 판별 ... 분류 단독 정본 (개발책임자 결정 A안)
#1092 [OPEN] 견적서 메뉴 정본 재정의 ... 웹 저장분 통합 표시
#1093 [CLOSED] 세트 구성품 가격 모델 ...
#1098 [OPEN] 알리고 ... 실호출 전환 ...
#1140 [OPEN] '인상 전 단가' 옵션을 '단가변동'으로 통일 ...
#1143 [OPEN] 세트 구성품 비중·반올림 단위를 데이터로 ...
#1144 [OPEN] 회계전표(매출·매입) 생성·연결 체계 ...
```

다음 라운드: 결정 후보를 만들기 전에 `existing_file`, `existing_issue`, `prior_decision`, `semantic_delta` 네 열을 의무화한다. 기존 구현이 있으면 질문은 “만들까요?”가 아니라 재현 fixture로 드러난 의미 차이와 수정 acceptance criterion이어야 한다.

## 8. 개발책임자께 올릴 최종 결정 목록

아래 13건만 남긴다. 50개 원문 결정을 문장 유사도가 아니라 업무 영향과 기존 소유 issue로 정규화했고, 위 기존 구현·Issue 항목은 제거하거나 해당 issue로 돌렸다. 순서는 금액·출고·보안·운영 영향 순이다.

### 1. 영업수수료 정산 기능의 존폐와 정본 계약

- 결정: 레거시 카드 3%, 제경비 8%/수기율, 원천 3.3%, 설치 8%, 항목별 대칭 반올림, 선지급을 지급액에만 반영하는 전체 정산을 이식할지.
- 후보: A. versioned 수수료 계약+정산 엔티티로 이식 / B. 계산 report만 제공 / C. 폐기.
- 권고: **A**. 현재 대응 구현이 없어 금액 기능 전체가 유실 후보이며, 단순 입력 검증 결정으로 축소하면 안 된다.

### 2. 견적/주문의 티어 보너스·메인장비 부재 페널티를 문서별로 유지할지

- 결정: 견적의 실외기 부재·최대 49%와 주문의 메인장비 부재·48% clamp 차이.
- 후보: A. `document_type`별 현행 보존 / B. 주문식 통일 / C. 견적식 통일.
- 권고: **A**. 실거래 비교 전 통일은 기존 금액을 바꾼다.

### 3. 상업 받침대 고정가와 `fixedDC=0`의 의미

- 결정: 받침대 납품가 고정 예외와 0%가 명시 override인지 미설정인지.
- 후보: A. 원본 예외 복원 / B. 현 포팅 일반 DC / C. 명시 `price_policy`와 manual override.
- 권고: **C**, 계약 신설 전에는 A.

### 4. 용량·조합률·금지조합·최대연결·추천·분기관 선택을 하나의 versioned 정책군으로 둘지

- 결정: HOME 130%, COMM 103/120%, AJ025 예외, `homeEx`, null capacity, 6개 분기관 경계의 정본.
- 후보: A. 전용 정책/lookup child / B. 단일 `combo_warn_rate`와 JSON / C. 프론트 상수 유지.
- 권고: **A**. #896은 선택된 target의 수량을 다룰 뿐 target 선택 정책 전체를 표현하지 못한다.

### 5. 기본구성품 0건 BUNDLE 72개의 판매 가능 상태

- 결정: 구성품이 없는 세트를 노출·출고할지. #1143의 비율 저장과 별개의 완결성 문제다.
- 후보: A. 노출 / B. 전부 차단 / C. 검수 완료 상태가 있는 세트만 순차 활성.
- 권고: **C**, 검수 전 차단.

### 6. 원장 특례 계정 `9199/9549/1089`의 회계 효과

- 결정: 레거시 차변/대변 특례를 현 chart/effect에 versioned mapping할지 폐기할지.
- 후보: A. 실제 데이터 건수·잔액 차이를 산출해 명시 mapping / B. 일반 chart 효과로 통일 / C. 과거 문서에만 적용.
- 권고: **A**. 결정 전에는 read-only 데이터 대조로 영향액을 먼저 제시한다.

### 7. 거래처 기존 4자리 비밀번호 hash의 이관 방식

- 결정: 기존 hash 수용, 전 계정 reset, 기존 인증 폐기/SSO 전환.
- 후보: A. 제한기간 검증 후 강제 재설정 / B. 즉시 전원 reset / C. 인증방식 폐기.
- 권고: **A**. 평문 복원이나 영구 legacy hash 수용은 제외한다.

### 8. 장기미발주 판정의 활동 기준 전환

- 결정: 이미 있는 #1015 화면의 로그인/비밀번호 기준을 원본의 최근 30일 주문 성공·출고 활동으로 바꿀지.
- 후보: A. write 없는 dry-run 후 전환 / B. 현행 유지 / C. 두 날짜 중 최신.
- 권고: **A**. 새 기능 질문이 아니라 기존 기능의 판정축 변경이다.

### 9. 미배차 상태와 배차안내 문자 정책

- 결정: `보류/해당없음/야적미배차/지방미배차/미배차` 우선순위, 수신자(인수자/단톡방/기사), 날짜, 중복·금지 억제의 정본.
- 후보: A. 상태 enum+reason 및 versioned recipient/suppression policy / B. 현 문자열·keyword 유지 / C. 전부 수동.
- 권고: **A**. 지역 설정 화면의 존재는 메시지·상태 정책을 해결하지 않는다.

### 10. 내일자 전표의 허용창고·금지거래처·배송 캘린더

- 결정: hard-coded 예외를 정책으로 유지할지.
- 후보: A. effective-date 정책 테이블 / B. 환경설정 / C. 수동 검수만.
- 권고: **A**. 인쇄 화면 존재와 출고 허용정책은 별개다.

### 11. 에어디자이너·제이시스템 전용 fallback의 영구성

- 결정: 메모로 고객/시간/창고를 정하는 규칙, 전일 출고, 수량 1 보정, 45,000원 특가를 영구 기본으로 둘지.
- 후보: A. vendor별 versioned 계약 / B. 미확정 필드에서 차단 / C. 현재 keyword 유지.
- 권고: **A**, 계약 확정 전에는 B.

### 12. 입출고 예측 기능의 존폐

- 결정: 고정 연도 비율 예측을 폐기하고 rolling horizon·안전재고로 대체할지.
- 후보: A. 실제 이력 기반 재설계 / B. read-only 참고치 / C. 폐기.
- 권고: **B**로 격리한 뒤 정확도 근거가 확보될 때 A.

### 13. 교육 상태와 담당자별 Google Sheet 배포의 존폐

- 결정: 원본의 교육 상태 도메인과 담당자별 전체 덮어쓰기 Sheet를 유지할지.
- 후보: A. partner-service 상태+권한 API/export / B. read-only export만 / C. 두 기능 폐기.
- 권고: 교육 상태가 실제 운영 gate인지 확인 후 **A 또는 C**. Sheet 전체 덮어쓰기는 유지하지 않는다.

## 9. 다음 라운드의 완료 조건

다음 조건을 모두 만족하기 전에는 다시 “전수”라고 부르면 안 된다.

1. 대상 commit SHA와 재실행 가능한 extractor 소스가 있다.
2. AST 분모, HTML handler 분모, manifest entrypoint 분모, oracle/fixture 분모, migration/seed 분모가 분리돼 있다.
3. parse diagnostic, false positive, source drift가 0이거나 예외 전량이 식별돼 있다.
4. 257개 원본-only 이름 전부가 대체/폐기/유실/미확인 중 하나로 닫혀 있다.
5. dead 판정은 전 파티션에 동일 root allowlist와 call graph를 쓴다.
6. 모든 `[불가]`가 결정·기존 issue·의도적 폐기 중 하나로 양방향 연결돼 있다.
7. 결정 목록은 `git ls-files`와 `gh issue`를 먼저 대조해 기존 구현을 다시 묻지 않는다.
