# GAS 전수조사 v2 — 원본 GAS 나머지 전부

> 조사일: 2026-08-11  
> 역할: CODEX SOL 5.6 · 레거시 GAS 법칙 조사자  
> 범위: 고정 분모에서 배정 ①(종합견적서·거래처 발송 주문서)과 배정 ②(금액 계열 7개)를 제외한 `tools/legacy-gas/` 전부  
> 변경 제한 준수: 이 보고서 외 코드·스키마·마이그레이션 무변경, git 명령·컨테이너·DB write 없음

## 1. 완결성 선언

**배정 717 / 분류 717 / 4분류 합계 717**

```text
업무규칙(이식 대상)  209
UI·표시 전용         305
인프라·유틸          192
dead_code             11
합계                 717
```

| 프로젝트 | 배정 | 업무규칙 | UI | 인프라 | dead_code | 분류 합계 |
|---|---:|---:|---:|---:|---:|---:|
| DPS 입고기록 비교 | 36 | 3 | 19 | 14 | 0 | 36 |
| scripts/extract-notion-dc-csv.js | 10 | 6 | 0 | 4 | 0 | 10 |
| 가배차분류리스트 | 63 | 26 | 28 | 9 | 0 | 63 |
| 가입고처리 | 48 | 7 | 32 | 9 | 0 | 48 |
| 거래처 업데이트 프로그램 | 40 | 12 | 11 | 17 | 0 | 40 |
| 교육안내 자동상태변경 | 1 | 1 | 0 | 0 | 0 | 1 |
| 미배차리스트 | 47 | 8 | 24 | 8 | 7 | 47 |
| 배차안내문자 | 64 | 13 | 36 | 13 | 2 | 64 |
| 비밀번호 일괄 암호화 | 4 | 2 | 0 | 2 | 0 | 4 |
| 알리고 자동 업로드 | 47 | 16 | 15 | 16 | 0 | 47 |
| 에어디자이너 전용 주문서 인식 | 99 | 46 | 22 | 31 | 0 | 99 |
| 운송사-실배차내역 비교 | 34 | 2 | 20 | 12 | 0 | 34 |
| 입출고 내역 | 14 | 2 | 10 | 2 | 0 | 14 |
| 입출고 분석 | 17 | 3 | 12 | 2 | 0 | 17 |
| 제이시스템 전용 주문서 인식 | 111 | 55 | 23 | 31 | 2 | 111 |
| 지방가배차분류리스트 | 48 | 5 | 33 | 10 | 0 | 48 |
| 품목별 DPS 입고내역 비교 | 34 | 2 | 20 | 12 | 0 | 34 |
| **합계** | **717** | **209** | **305** | **192** | **11** | **717** |

고정 분모 `docs/dev-reports/2026-08-11-gas-function-inventory-v2.md`의 `LEGACY-GAS 2,096`을 재추출하지 않고 그대로 썼다. 배정 ①은 주문서 `116+302+3+5`와 종합견적서 `109+458`, 합계 993이다. 배정 ②는 7개 프로젝트 합계 386이다. 따라서 `2,096 - 993 - 386 = 717`이다. 분모의 프로젝트·파일 제목을 전부 대조했으며 위 17개 외의 비제외 항목은 없다.

## 2. 진입점·dead_code 감사

실행한 읽기 전용 확인:

```powershell
rg -n "doGet\s*\(|doPost\s*\(|onOpen\s*\(|onEdit\s*\(|ScriptApp|newTrigger|createMenu|addItem|google\.script\.run|onclick=|onchange=|oninput=|onsubmit=" <배정③ 17개 경로> -g '*.js' -g '*.html' -g '*.json'
Get-ChildItem tools/legacy-gas -Recurse -Filter appsscript.json | <배정①② 경로 제외> | Get-Content -Raw -Encoding UTF8
rg -n "<각 함수명>" <동일 프로젝트의 Code.js·HTML·appsscript.json>
```

- 웹앱 manifest가 있는 14개 프로젝트는 모두 `webapp` 진입이다. 9개는 `executeAs=USER_ACCESSING/access=ANYONE`, 거래처 업데이트·두 주문서 인식·입출고 분석은 `USER_DEPLOYING/ANYONE`, 입출고 내역은 `USER_DEPLOYING/ANYONE_ANONYMOUS`다.
- `DPS 입고기록 비교`, 가배차, 가입고, 거래처 업데이트, 미배차, 배차문자, 알리고, 두 주문서 인식, 운송사 비교, 입출고 2개, 지방가배차, 품목별 DPS에서 `doGet`을 확인했다. HTML의 인라인 이벤트, 최상위 listener, `window.onload`, `google.script.run` RPC를 모두 루트로 포함했다.
- `교육안내 자동상태변경/checkAndUpdateNotion`은 manifest에 웹앱이 없고 본문이 현재시각 기준 상태 전환인 수동·시간 기반 트리거 진입점이다. 설치형 시간 트리거는 manifest에 함수명이 남지 않으므로 생존으로 판정했다.
- `비밀번호 일괄 암호화/migratePasswordsToHash`는 주석에 “수동으로 1회만 실행”이라고 명시된 관리 진입점이다. 호출부가 없다는 이유로 dead 처리하지 않았다.
- `scripts/extract-notion-dc-csv.js/main`은 파일 끝 `main().catch(...)`에서 직접 실행된다.
- `doPost`, `onOpen`, `onEdit`, 코드 내 `ScriptApp.newTrigger`, 커스텀 메뉴는 배정③에서 검출되지 않았다. 에어디자이너의 `ScriptApp.getOAuthToken()`은 트리거가 아니라 Drive OCR 인증이다.

전 경로 재검증 결과는 `doGet=14(14파일)`, `doPost=0`, `onOpen=0`, `onEdit=0`, `ScriptApp.newTrigger=0`, `createMenu/addItem=0`, `google.script.run=70(14파일)`, `appsscript.json=16`, 그중 `webapp=14`였다. 함수 파일 외 CSV까지 포함한 비제외 디렉터리는 19개이며, 이 중 2개는 함수 없는 `_notion-export*` 보조자료다(§9).

### 2.1 확정 dead_code 11개

| 함수 | 판정 근거 |
|---|---|
| `미배차리스트/Code.js:79 getIdFromUrl`, `:88 openSheetByUrl`, `:95 normalizeStr`, `:106 normalizeForMatch`, `:119 cleanValue`, `:128 isAccountingRoom_`, `:139 sheetToObjects` | 정의 묶음 내부의 `openSheetByUrl→getIdFromUrl`, `normalizeForMatch→normalizeStr` 외에는 웹앱·HTML·RPC·manifest·트리거 루트에서 참조가 0이다. 실제 미배차 처리는 브라우저 XLSX를 `Index.html:450-1019`에서 직접 읽는다. |
| `배차안내문자/Code.js:77 getIdFromUrl`, `:133 sheetToObjects` | 각각 선언 1회뿐이다. 배차문자는 브라우저 업로드 데이터를 payload로 넘기며 `processDispatchData`는 전달된 배열을 사용한다. 나머지 정규화 헬퍼는 실제 호출됨을 별도 확인했다. |
| `제이시스템 전용 주문서 인식/Code.js:1703 extractItemsVerticalList_`, 그 내부 `:1721 firstCodeToken_` | 같은 전역 이름이 `:1783`에서 다시 선언되어 이후 호출은 두 번째 정의로 해석된다. 첫 정의는 호출 전에 덮어써지고, 그 안의 중첩 함수도 인스턴스화될 수 없는 확정 비도달 코드다. |

이 11개 이외에는 호출이 불분명해도 업무규칙/UI/인프라 중 본문 성격으로 보수 분류했다.

## 3. 우리 스키마·서비스 대응 요약

| 레거시 축 | 대응 판정 |
|---|---|
| 가배차·지방가배차 | **[있음]** `arologis-service` `PreClassifyService`, `RegionalService`, `/dispatches/pre-classify`, `/dispatches/regional`. 지역 우선순위·주소 키워드 정책은 DB `region_dispatch_classifications` 축으로 표현 가능. |
| 미배차 | **[부분]** `UnassignedService`, `/dispatches/unassigned`. 야적/지방/보류/해당없음 세분류, 폐기·중복 배차 표현, 포맷 문자열과 시간대 highlight는 공백. |
| 배차안내문자 | **[부분]** `DispatchBatchPreviewService`, `/notifications/dispatch-batch`, notification-service. 멀티날짜, 날짜+전표번호 복합키, 중복 모호성, 하차일 직접 파싱, 단톡방/인수자별 멘트 병합이 공백이고 알리고 자격은 대기 상태. |
| 운송사 비교 | **[있음/부분]** `arologis-service` `VendorExcelParser`, `DispatchReconcileService`, `POST /api/v1/arologis/dispatch/reconcile`. TRUE/FALSE_LEFT/FALSE_RIGHT는 있음. 레거시 노션 HTML history를 날짜+번호로 대조하는 특정 포맷과 추가 vendor 표본은 차이. |
| DPS 두 비교 | **[부분]** inventory-service `DpsCompareController/Service`, `analyzeByProduct`, `DpsSaveHistory`. DPS는 레거시 `납품번호+정제모델` 키와 수량+합계 우선매칭, 우리 쪽은 `productCode+거래처+입고일`; 품목별 DPS는 레거시 양측 대조와 우리 단측 집계의 의미가 다르다. |
| 가입고처리 | **[부분]** inventory-service `warehouses`, `stock_balances`, `stock_instances`, slip-service INBOUND 80건. 레거시의 DPS 두 시트 상쇄, 창고 라우팅, 이카운트 구매전표 payload, 가상 입고 상태·검수 흐름은 명시된 대응이 없다. |
| 입출고 내역·분석 | **[부분]** stock balances/instances와 INBOUND/OUTBOUND slips/lines로 월별 수량 집계 가능. 레거시의 모델코드 위치 기반 분류와 `2025↔2026` 비율 예측·발주권장 모델은 없다. |
| 거래처 업데이트 | **[부분]** partner-service에 이카운트 정본 7,253건이 있으나 담당자별 Google Sheet 전체 덮어쓰기, Notion DC 문자열 병합·배포 progress 기능은 없다. 정본은 partner-service로 일원화하는 것이 맞다. |
| 알리고 자동 업로드 | **[있음/부분]** `PartnerAligoExportService`, `AligoAddressBookSyncService`, `AligoSmsAdapter`, `/admin/aligo-address-book`. CSV·주소록 dry-run은 있으나 실 RestClient/자격, 요일×지역 캠페인 cohort, 골프회, 고정 제외번호 3개는 없다. |
| 에어디자이너·제이시스템 OCR | **[부분]** partner-order-service `AirDesignerOrderParser`, `JSystemOrderParser`, vendor upload/confirm API와 desktop 3-step UI가 있다. 레거시의 Google OCR 방식, 복수 파일 슬라이드, 세트 구성·정액 할인·창고/이카운트 직접 push 전체는 동일하지 않다. |
| DC CSV 추출 script | **[있음/부분]** products/classification/bundle/quantity_sync와 별도 DC config import 축은 존재하나, partner별 홈/상업/정액DC·단위처리의 유효기간·우선순위는 계속 정책 데이터로 관리해야 한다. |
| 비밀번호 일괄 암호화 | **[불가/미이식]** 제시된 우리 대응에 partner 인증 비밀번호 저장·해시 마이그레이션 축이 없다. |
| 교육안내 상태 | **[불가/미이식]** 교육 신청·마감·문자발송 증거를 담는 도메인이 없다. |

## 4. 717개 함수 분류 레지스터

표기는 `함수명@정의줄`이다. 중첩 함수·같은 이름의 별도 정의도 고정 분모의 한 건으로 각각 센다.

### 4.1 DPS 입고기록 비교 — 36

- **업무규칙 3**: `handleFile@Index:328`, `cleanModelName@Index:381`, `runMatching@Index:389`.
- **UI 19**: `onload@Index:250`, `checkAutoRestore@280`, `switchTab@301`, `initDragAndDrop@313`, `checkReady@375`, `renderTable@492`, `openFilterPopup@574`, `applyBoolFilter@599`, `applyFilterRealtime@606`, `applyEmptyFilter@614`, `clearFilter@620`, `updateFilterUI@626`, `closePopup@637`, `initHistoryDates@644`, `triggerManualSave@661`, `loadHistory@676`, `restoreHistory@699`, `showLoading@734`, `hideLoading@738`.
- **인프라 14**: `doGet@Code:8`, `getUserAuth@16`, `getTitle@46`, `getSelect@47`, `compressString@66`, `decompressString@70`, `autoSaveToNotion@77`, `getHistoryFromNotion@117`, `getSpecificHistory@156`, `getLatestHistoryFromNotion@178`, `cleanStr@Index:380`, `parseNum@385`, `fmtNum@386`, `f@655`.
- **dead 0**.

### 4.2 scripts/extract-notion-dc-csv.js — 10

- **업무규칙 6**: `main@57`, `num@83`, `chk@84`, `sel@85`, `pct@107`, `won@112`.
- **UI 0**.
- **인프라 4**: `notionApi@23`, `resolveToken@40`, `plain@51`, `csvCell@52`.
- **dead 0**.

### 4.3 가배차분류리스트 — 63

- **업무규칙 26**: `getRegionFromNotion@Code:210`, `get_region_index@260`, `resetCounters@266`, `skip_warehouse_filter@271`, `parse_address@276`, `process_address_for_search@315`, `process_address_for_search_local@328`, `build_classification_item@340`, `clean_special_spec@345`, `cleanCustomerName@358`, `extract_yajek_item@367`, `extract_item@386`, `sangil_chowol_except_region@400`, `chowol_except_region@413`, `sangil_except_region@426`, `yajeok_only@439`, `region_only@452`, `sangil_chowol_with_region@468`, `chowol_with_region@482`, `sangil_with_region@495`, `process_pd_to_final@508`, `addOrder@509`, `pushGrouped@525`, `runClassification@583`, `handleFile@Index:537`, `runProcess@588`.
- **UI 28**: `startAutoSave@Index:253`, `saveUndoState@263`, `performUndo@275`, `performRedo@286`, `updateVoucherMode@297`, `toggleExpand@309`, `onload@315`, `checkAutoRestore@343`, `renderTabs@361`, `switchTab@426`, `openRenameModal@432`, `closeRenameModal@440`, `executeRename@444`, `saveStateToNotion@454`, `addCustomPage@493`, `onEnd@516`, `openDeleteModal@525`, `closeDeleteModal@526`, `executeDelete@527`, `copyCurrentTable@906`, `saveCurrentTable@918`, `getSelectedText@1098`, `copyTextToClipboard@1117`, `initHistoryDates@1209`, `f@1211`, `loadHistory@1216`, `restoreState@1235`, `onEnd@1261`.
- **인프라 9**: `doGet@Code:10`, `getUserAuth@18`, `getTitle@56`, `getSelect@57`, `saveHistoryToNotion@75`, `getHistoryFromNotion@116`, `getLatestHistoryFromNotion@159`, `cleanValue@195`, `formatComma@203`.
- **dead 0**.

### 4.4 가입고처리 — 48

- **업무규칙 7**: `sendToEcountAPI@Code:152`, `handleFile@Index:343`, `processData@364`, `openEcountModal@562`, `proceedToDateModal@573`, `confirmEcount@580`, `driverPhone@671`.
- **UI 32**: `toggleCustomUnit@Index:301`, `initDragAndDrop@306`, `switchTab@331`, `initItemTable@337`, `renderResult@490`, `copyCurrentTable@531`, `saveCurrentTable@546`, `saveManual@644`, `flipMove@652`, `makeSortable@660`, `renderDrivers@677`, `initDrivers@688`, `saveDrivers@695`, `saveItems@713`, `checkAutoRestore@726`, `autoRestore@744`, `loadHistory@755`, `restore@764`, `initSelection@780`, `hideCtx@890`, `getRows@915`, `cellVal@916`, `escapeHtml@917`, `distinctValues@918`, `initFilterHeaders@919`, `renderFltList@933`, `onCbChange@953`, `openFilterPopup@969`, `toggleFltAll@982`, `updateFltIcons@988`, `applyFilters@992`, `clearAllFilters@1001`.
- **인프라 9**: `doGet@Code:8`, `getUserAuth@16`, `getRichText@42`, `compressString@61`, `decompressString@66`, `autoSaveToNotion@72`, `getHistoryFromNotion@99`, `getSpecificHistory@124`, `getLatestHistoryFromNotion@136`.
- **dead 0**.

### 4.5 거래처 업데이트 프로그램 — 40

- **업무규칙 12**: `startUpdateFromExcel_@Code:21`, `startUpdateCore_@274`, `buildTargetLinks_@384`, `processOne_@421`, `mergeNotionIntoMatrix_@600`, `stripNotionSegmentsAll_@662`, `normalizeSep_@705`, `cleanupSeps_@713`, `stripNotionSegments_@722`, `removeSegment_@739`, `buildNotionDict_@753`, `parseShortDiscount_@936`.
- **UI 11**: `log@UploadModal:91`, `setBars@99`, `showPickedFileUI@128`, `clearPickedFile@145`, `readExcel@154`, `pickFile@280`, `initUploadSession@303`, `uploadChunk@319`, `finalizeAndStart@329`, `uploadInChunksAndStart@339`, `startPolling@420`.
- **인프라 17**: `doGet@Code:11`, `initUploadSession_@132`, `appendUploadChunk_@175`, `finalizeUploadAndStart_@208`, `getProgress@377`, `applyFormats_@467`, `bump_@538`, `getProgress_@551`, `setProgress_@558`, `setProgressOrder_@563`, `getProgressOrder_@568`, `chunkArray_@575`, `initUploadSession@582`, `appendUploadChunk@588`, `finalizeUploadAndStart@594`, `fetchNotionDbAll_@846`, `notionRequest_@909`.
- **dead 0**.

### 4.6 교육안내 자동상태변경 — 1

- **업무규칙 1**: `checkAndUpdateNotion@Code:1`.
- **UI 0 / 인프라 0 / dead 0**.

### 4.7 미배차리스트 — 47

- **업무규칙 8**: `handleFile@Index:450`, `extractNum@735`, `checkDuplicates@747`, `getDeliveryInitialState@761`, `generateFormatStr@778`, `runProcess@791`, `sortData@894`, `renderTable@905`.
- **UI 24**: `saveUndoState@Index:335`, `performUndo@346`, `performRedo@360`, `onload@373`, `checkAutoRestore@402`, `switchTab@418`, `toggleFormat@425`, `clearData@431`, `clearData1@436`, `clearData2@443`, `applyPasteToCell@676`, `parseClipboardTable@707`, `renderOtherTable@1022`, `copyTableImage@1037`, `saveTableImage@1055`, `initHistoryDates@1073`, `loadHistory@1093`, `restoreState@1134`, `getSelectedText@1161`, `copyTextToClipboard@1186`, `saveManualToNotion@1252`, `f@1261`, `closeDateModal@1267`, `confirmManualSave@1271`.
- **인프라 8**: `doGet@Code:10`, `getUserAuth@18`, `getTitle@56`, `getSelect@57`, `saveHistoryToNotion@157`, `getHistoryFromNotion@197`, `getLatestHistoryFromNotion@256`, `saveManualDataToNotion@292`.
- **dead 7**: `getIdFromUrl@Code:79`, `openSheetByUrl@88`, `normalizeStr@95`, `normalizeForMatch@106`, `cleanValue@119`, `isAccountingRoom_@128`, `sheetToObjects@139`.

### 4.8 배차안내문자 — 64

- **업무규칙 13**: `processDispatchData@Code:150`, `lookupEcount@184`, `cmp@413`, `boolKey@414`, `rowTargetDay@434`, `getChatMapData@610`, `getForbiddenData@652`, `extractNum@Index:603`, `checkDuplicatesFor@617`, `checkDuplicates@633`, `handleFile@649`, `assembleMents@1145`, `runProcess@1327`.
- **UI 36**: `todayKST@Index:384`, `chipLabel@389`, `fillEmptyRows@396`, `addDatePage@405`, `onDateChange@445`, `switchDatePage@452`, `deleteDatePage@460`, `activeSourceBody@474`, `activeDriverBody@477`, `collectPagesState@480`, `saveUndoState@493`, `performUndo@503`, `performRedo@518`, `onload@533`, `checkAutoRestore@570`, `initApp@585`, `switchTab@595`, `clearData@636`, `findAdjacentCell@770`, `openPopup@969`, `closePopup@1038`, `toggleSort@1044`, `executeSort@1056`, `restoreOriginalSort@1073`, `applyFilterRealtime@1077`, `toggleKeyword@1090`, `applyEmptyFilter@1114`, `clearFilter@1120`, `updateFilterUI@1130`, `renderResultTable@1193`, `checkKw@1221`, `initHistoryDates@1387`, `loadHistory@1407`, `restoreState@1448`, `getSelectedText@1490`, `copyTextToClipboard@1515`.
- **인프라 13**: `doGet@Code:11`, `getUserAuth@18`, `getText@52`, `getTitle@53`, `getSelect@54`, `normalizeStr@85`, `normalizeForMatch@95`, `cleanValue@107`, `isAccountingRoom_@115`, `toDateKey_@125`, `saveHistoryToNotion@468`, `getHistoryFromNotion@515`, `getLatestHistoryFromNotion@574`.
- **dead 2**: `getIdFromUrl@Code:77`, `sheetToObjects@133`.

### 4.9 비밀번호 일괄 암호화 — 4

- **업무규칙 2**: `migratePasswordsToHash@Code:6`, `hashPassword_@39`.
- **UI 0**.
- **인프라 2**: `getAllAuthPages_@46`, `updatePasswordInNotion_@82`.
- **dead 0**.

### 4.10 알리고 자동 업로드 — 47

- **업무규칙 16**: `fetchExternalData@Code:181`, `processManagerJS@286`, `normalizePhoneJS@299`, `formatPrefix@305`, `extractNumbers@323`, `syncEcountChunk@426`, `handleFile@Index:314`, `syncServerData@369`, `processNextBatch@393`, `getCombinedLocalPhones@451`, `getRegionCode@458`, `initDayMappingUI@472`, `downloadData@578`, `executePromo@616`, `executeAllClients@656`, `executeGolf@681`.
- **UI 15**: `onload@Index:261`, `initDragAndDrop@288`, `switchTab@303`, `openFilterPopup@497`, `applyFilterRealtime@510`, `clearFilter@520`, `renderTableRows@535`, `renderTable@568`, `downloadLocal@726`, `showLoading@736`, `hideLoading@741`, `initHistoryDates@745`, `f@753`, `loadHistory@759`, `viewHistoryDetail@782`.
- **인프라 16**: `doGet@Code:10`, `getUserAuth@18`, `getTitle@48`, `getSelect@49`, `compressString@68`, `decompressString@73`, `autoSaveToNotion@80`, `getHistoryFromNotion@120`, `getSpecificHistory@159`, `getPlain@205`, `getTitle@206`, `uploadCsvToDrive@266`, `safeNotionRequest@387`, `getPlain@442`, `getTitle@443`, `getSelect@444`.
- **dead 0**.

### 4.11 에어디자이너 전용 주문서 인식 — 99

- **업무규칙 46**: `fetchNotionPricingForCustomer_@Code:48`, `getPricingConfig_@212`, `roundToStep_@336`, `applyPricing_@354`, `applyPricingWithDC_@365`, `decideWarehouseFromItems_@471`, `normModel@482`, `isHomeMultiCode_@532`, `isSingleCode_@535`, `getManagers_@624`, `getCustomerList_@682`, `lookupCustomerMemos_@690`, `getMasterModelOrder_@715`, `getHomeModelOrder_@735`, `getMasterSpecMap_@761`, `parseDcRate_@789`, `getHomeModelPriceMap_@802`, `findRightmostHeaderIndex_@860`, `distributeSetPrice_@874`, `getModelFlags@891`, `getSingleSetDiscountTotal_@926`, `detectOptionsFromRawName_@952`, `buildSingleSetMap_@974`, `expandSingleSetItems_@1044`, `parseOrderFromText_@1331`, `buildOrderQtyMap_@1479`, `capQtyToOrder_@1490`, `mergeKeepLastScoped_@1510`, `keyHome@1514`, `keyG@1519`, `squashConsecutiveSpecs_@1555`, `squashPreviewSets_@1580`, `processMemoAndCustomer_@1594`, `buildItemsInPreviewOrder_@1812`, `norm@1816`, `takeOne@1818`, `formatPct_@2049`, `formatShortKrwMinus_@2055`, `sendOrderToEcount_@2064`, `sendFromPreview@2229`, `loadModelNameMaps_@2285`, `findIdx@2290`, `fillMap@2304`, `makeOrderedFinalItems@Index:544`, `take@547`, `sendNow@588`.
- **UI 22**: `qs@Index:94`, `appendLog@95`, `showDeterministicProgress@98`, `showIndeterminateProgress@108`, `hideProgress@118`, `populateDropdowns@121`, `readManyFilesToBase64@140`, `renderFileLine@180`, `removeFileAt@200`, `setFiles@208`, `clearFiles@233`, `bindDnD@245`, `handleExtract@269`, `openPreviewModal@328`, `closeModal@336`, `renderPreviewSlide@339`, `syncNavButtons@512`, `prevSlide@530`, `nextSlide@536`, `openSendModal@564`, `updateSendCounter@581`, `closeSendModal@585`.
- **인프라 31**: `doGet@Code:1`, `num@137`, `bool@143`, `sel@148`, `getScriptCreds_@378`, `callZoneApi@391`, `getEcountSession@404`, `normalizeTel_@433`, `toYmd_@440`, `formatCurrency_@448`, `normalizeModel_@451`, `idxByNames_@461`, `getHeaderRowIndex_@540`, `readSheetWithHeader_@562`, `normalizeHeaderText_@586`, `getHeaderIndexMapAllCols_@589`, `findByLabels_@600`, `specCol@772`, `getColVals@819`, `getColFrms@820`, `extractPdfText_@1242`, `extractViaAdvancedDrive_@1250`, `extractViaHttpUpload_@1281`, `waitAndReadDocText_@1318`, `parsePdfForPreview@1626`, `log@1628`, `homeIdx_@1680`, `parsePdfForPreviewBatch@1865`, `log@1880`, `homeIdx_@1899`, `include_@2340`.
- **dead 0**.

### 4.12 운송사-실배차내역 비교 — 34

- **업무규칙 2**: `handleFile@Index:319`, `runMatching@383`.
- **UI 20**: `onload@Index:244`, `checkAutoRestore@274`, `switchTab@293`, `initDragAndDrop@305`, `checkReady@378`, `renderTable@530`, `openFilterPopup@593`, `applyBoolFilter@618`, `applyFilterRealtime@625`, `applyEmptyFilter@633`, `clearFilter@639`, `updateFilterUI@645`, `closePopup@656`, `initHistoryDates@663`, `f@674`, `triggerManualSave@682`, `loadHistory@696`, `restoreHistory@719`, `showLoading@749`, `hideLoading@753`.
- **인프라 12**: `doGet@Code:8`, `getUserAuth@16`, `getTitle@46`, `getSelect@47`, `compressString@66`, `decompressString@70`, `autoSaveToNotion@77`, `getManualDataFromNotion@117`, `getHistoryFromNotion@190`, `getSpecificHistory@255`, `getLatestHistoryFromNotion@278`, `cleanStr@Index:527`.
- **dead 0**.

### 4.13 입출고 내역 — 14

- **업무규칙 2**: `getChartData@code:10`, `updateChart@index:390`.
- **UI 10**: `onload@index:234`, `initDateHandlers@252`, `checkRange@256`, `initApp@292`, `setupListeners@299`, `addActive@363`, `removeActive@372`, `checkBtn@378`, `renderCanvas@432`, `formatter@471`.
- **인프라 2**: `doGet@code:2`, `toMonthStr@index:286`.
- **dead 0**.

### 4.14 입출고 분석 — 17

- **업무규칙 3**: `fetchCsvData@Code:86`, `processModelData@161`, `analyzeFiltered@Index:344`.
- **UI 12**: `onload@Index:228`, `loadData@234`, `forceRefresh@256`, `handleError@260`, `initApp@266`, `setTimeout@280`, `setupControls@294`, `applyFilters@320`, `showCardsSequentially@410`, `setTimeout@416`, `drawChart@425`, `renderLists@475`.
- **인프라 2**: `doGet@Code:5`, `getDashboardData@13`.
- **dead 0**. 고정 분모가 `method-short`로 센 두 `setTimeout`은 실제로는 함수 정의가 아닌 호출이지만 분모를 바꾸지 않고 UI 2건으로 보존했다.

### 4.15 제이시스템 전용 주문서 인식 — 111

- **업무규칙 55**: `fetchNotionPricingForCustomer_@Code:54`, `getPricingConfig_@224`, `roundToStep_@316`, `applyPricing_@327`, `applyPricingWithDC_@336`, `_coerceQtyToken_@404`, `getZeroOKeyCandidates_@441`, `aliasModelIfNeeded_@463`, `overrideSpecialUnitPrice_@490`, `getManagers_@572`, `getCustomerList_@631`, `lookupCustomerMemos_@638`, `getMasterModelOrder_@663`, `getHomeModelOrder_@681`, `getMasterSpecMap_@704`, `parseDcRate_@736`, `getHomeModelPriceMap_@749`, `distributeSetPrice_@807`, `getModelFlags@824`, `getSingleSetDiscountTotal_@857`, `applySingleSetDiscount_@875`, `detectOptionsFromRawName_@915`, `buildSingleSetMap_@941`, `expandSingleSetItems_@1067`, `squashConsecutiveSpecs_@1272`, `squashPreviewSets_@1298`, `extractItemsFromTable_@1542`, `fixLargeQty_@1549`, `tryMatch@1582`, `isLikelyCode_@1678`, `pickQtyToken_@1688`, `extractItemsVerticalList_@1783`, `firstCodeToken_@1798`, `extractItemsLooseRow_@1842`, `parseKoreanTimeWindow_@1870`, `parseOrderFromText_@1887`, `sortItemsForSend_@2020`, `isBolt@2024`, `classify@2030`, `mergeSrcItemsByModel_@2054`, `orderIndex_@2174`, `groupRank_@2182`, `formatPct_@2405`, `formatShortKrwMinus_@2410`, `loadModelNameMaps_@2419`, `findIdx@2425`, `fillMap@2437`, `detectWarehouseFromItems_@2490`, `normModel@2501`, `sendOrderToEcount_@2552`, `fmtMoney@2728`, `sendFromPreview@2811`, `sortFinalItemsForSend_@Index:133`, `handleExtract@374`, `sendNow@679`.
- **UI 23**: `qs@Index:91`, `appendLog@92`, `logPreviewDebug@94`, `showDeterministicProgress@166`, `showIndeterminateProgress@176`, `hideProgress@186`, `populateDropdowns@189`, `readManyFilesToBase64@222`, `renderFileLine@262`, `removeFileAt@282`, `setFiles@290`, `clearFiles@336`, `bindDnD@348`, `openPreviewModal@431`, `closeModal@439`, `renderPreviewSlide@442`, `formatDue@455`, `syncNavButtons@623`, `prevSlide@641`, `nextSlide@647`, `openSendModal@655`, `updateSendCounter@672`, `closeSendModal@676`.
- **인프라 31**: `doGet@Code:1`, `getVisionApiKey_@48`, `num@143`, `bool@150`, `sel@157`, `getScriptCreds_@349`, `callZoneApi@362`, `getEcountSession@375`, `normalizeTel_@411`, `toYmd_@418`, `formatCurrency_@426`, `normalizeModel_@429`, `idxByNames_@496`, `getHeaderRowIndex_@504`, `readSheetWithHeader_@510`, `normalizeHeaderText_@528`, `getHeaderIndexMapAllCols_@535`, `findByLabels_@546`, `specCol@715`, `getColVals@766`, `getColFrms@767`, `preprocessForOcr_@1312`, `extractDocText_@1396`, `extractViaDriveOcr_@1422`, `_stripBars_@1525`, `_cleanOcrLine_@1530`, `parseImageForPreview@2116`, `log@2118`, `normModel_@2598`, `formatPct_@2611`, `include_@2877`.
- **dead 2**: 첫 번째 `extractItemsVerticalList_@1703`와 그 내부 `firstCodeToken_@1721`.

### 4.16 지방가배차분류리스트 — 48

- **업무규칙 5**: `get_region_index@Code:229`, `parse_address@235`, `runClassification@271`, `handleFile@Index:511`, `runProcess@552`.
- **UI 33**: `saveUndoState@Index:258`, `performUndo@270`, `performRedo@281`, `onload@291`, `checkAutoRestore@318`, `renderTabs@336`, `switchTab@392`, `openRenameModal@398`, `closeRenameModal@406`, `executeRename@410`, `saveStateToNotion@420`, `createTableFrame@453`, `addCustomPage@478`, `openDeleteModal@499`, `closeDeleteModal@500`, `executeDelete@501`, `openPopup@760`, `closePopup@826`, `sortData@832`, `applyFilterRealtime@864`, `toggleKeyword@887`, `applyEmptyFilter@914`, `clearFilter@923`, `executeDOMFilter@931`, `updateFilterUI@975`, `copyCurrentTable@987`, `saveCurrentTable@999`, `initHistoryDates@1233`, `f@1235`, `loadHistory@1240`, `restoreState@1259`, `getSelectedText@1330`, `copyTextToClipboard@1355`.
- **인프라 10**: `doGet@Code:8`, `getUserAuth@16`, `getTitle@51`, `getSelect@52`, `saveHistoryToNotion@70`, `getHistoryFromNotion@114`, `getLatestHistoryFromNotion@157`, `cleanValue@193`, `formatComma@200`, `sheetToObjectsByHeaderRow@207`.
- **dead 0**.

### 4.17 품목별 DPS 입고내역 비교 — 34

- **업무규칙 2**: `handleFile@Index:327`, `runMatching@409`.
- **UI 20**: `onload@Index:249`, `checkAutoRestore@279`, `switchTab@300`, `initDragAndDrop@312`, `checkReady@399`, `renderTable@553`, `openFilterPopup@628`, `applyBoolFilter@653`, `applyFilterRealtime@660`, `applyEmptyFilter@668`, `clearFilter@674`, `updateFilterUI@680`, `closePopup@691`, `initHistoryDates@698`, `f@709`, `triggerManualSave@715`, `loadHistory@730`, `restoreHistory@753`, `showLoading@788`, `hideLoading@792`.
- **인프라 12**: `doGet@Code:8`, `getUserAuth@16`, `getTitle@46`, `getSelect@47`, `compressString@66`, `decompressString@70`, `autoSaveToNotion@77`, `getHistoryFromNotion@117`, `getLatestHistoryFromNotion@156`, `cleanStr@Index:404`, `parseNum@405`, `fmtNum@406`.
- **dead 0**.

## 5. 업무규칙 상세 — 209개 함수를 묶은 18개 규칙군

### R01. 가배차 지역 분류·창고·제외 정책

① 함수: `getRegionFromNotion`, `get_region_index`, `resetCounters`, `skip_warehouse_filter`, `parse_address`, `process_address_for_search`, `process_address_for_search_local`, `build_classification_item`, `clean_special_spec`, `cleanCustomerName`, `extract_yajek_item`, `extract_item`, 8개 mode 함수, `process_pd_to_final`, `addOrder`, `pushGrouped`, `runClassification`, `handleFile`, `runProcess` — `가배차분류리스트/Code.js:210-631`, `가배차분류리스트/Index.html:537-902`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| mode `1/2/3` | 상일+초월/초월/상일, 지방 제외 |
| mode `4` | `야적`과 `/`가 함께 있는 건만 야적배차 |
| mode `5` | 주소가 `지방`으로 시작하는 건만 지방배차 |
| mode `6/7/8` | 상일+초월/초월/상일, 지방 포함 |
| 주소 앞 10자에 `회수|회차`, `차용|대여|반납`, `자가` | 각각 반품·차용·자가 통계로 빼고 분류 제외 |
| 주소가 `경동.*[/:]`, `로젠.*[/:]` | 택배 건으로 제외 |
| 지방 제외 mode에서 `지방.*[/:]` | 제외; 지방 포함 mode에서는 표지만 제거하고 분류 |
| 출고창고에 `상일`/`초월`이 없음 | 기타 창고로 제외 |
| 주소 앞 3토큰이 지역 검색어와 일치 | Notion 생성 순서의 시도/시군으로 분류; 불일치면 `<미분류>` |
| 기존 주소가 `야적.../` | 일반 지역보다 먼저 `<기존 야적>` 묶음 |
| 기존 페이지에 같은 전표가 있었으나 재실행 결과에서 사라짐 | 삭제하지 않고 빨간 취소선 행으로 유지 |
| 야적·지방인데 상/하차일 둘 다 없음, 또는 일반인데 둘 다 있음 | highlight |
| 상차일≠전표일, 야적·지방 상차일=하차일 | 날짜 오류 |
| 지방 상차 토요일+하차 일요일 | 주말 경고 |

③ 상수·임계값·리터럴: mode `1..8`; 주소 탐색 `substring(0,10)`, 표시 주소 첫 `3`토큰; 거래처명 최대 `7`자; Notion region `page_size=100`, 생성일 오름차순; 지역 suffix `광역시/특별시/특별자치시/특별자치도`; 창고 `상일/초월`; 제목 `상일상차/초월상차/<미분류>/<기존 야적>`; 전표 범위 양끝 inclusive; 날짜 월넘김 `상차일 < 전표일-10`, `하차일 < 상차일 && <10`; 요일 `6/0`; 날짜·특이사항 제거 정규식은 `n상...n하`, `M/D상차 M/D`, `M/D상차`, `M/D`, `n일 상차`, `n일`, `하차`, `/`, 괄호다. Notion DB 식별자는 region `34ea...56c38`, auth `198a...e9da`, save `328a...d0e8c`이며 토큰 값은 원본에서 redacted다.

④ 읽는 축: 브라우저 XLSX 첫 시트, 두 번째 행을 헤더로 읽어 `일자-No.|판매번호|판매 번호`, `날짜|일자`, `배송주소|주소`, `출고창고`, `거래처`, `특이사항`, `금액|금 액`, `인수자번호|인수자 번호`, `품목명|품목|품 목`, `담당자명`; Notion region의 title=`분류 그룹`, rich_text=`검색어`.

⑤ 대응: **[있음]** arologis `PreClassifyService`와 `region_dispatch_classifications`; **[부분]** 취소선 보존·통계·highlight는 UI/이력 모델 공백.

⑥ 기본값: **[자동]** 지역 미매칭=`<미분류>`, mode 미지정은 오류, 범위 미입력 시 전체, 날짜를 못 읽으면 KST가 아닌 브라우저 현재일 fallback. 이식 기본은 지역 우선순위를 DB 순서로, 미매칭은 명시 상태로 둔다. 🚩 브라우저 현재일 fallback과 취소선 행 보존 기간은 결정 필요.

⑦ 🔑 미이식 후보: 주소 prefix 기반 택배/회수/차용/자가 제외 사유, 기존 분류행 취소선 이력, 야적·지방 날짜 경고와 통계 snapshot.

### R02. 지방 가배차 단순 추출

① 함수: `get_region_index`, `parse_address`, `runClassification`, `handleFile`, `runProcess` — `지방가배차분류리스트/Code.js:229-354`, `지방가배차분류리스트/Index.html:511-759`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 주소가 `지방`으로 시작하거나 중간에 `지방/` 포함 | 출력 대상 |
| 그 외 | 제외 |
| 판매번호에 `-` | 앞=날짜, 둘째 조각=전표번호 |
| 창고가 정확히 `삼성창고 (초월 무갑)` | `초월창고`로 표시 |
| 거래처명 | 괄호 3종·법인어·별표 제거, 대시 앞만 유지 |
| 출력 정렬 | 날짜 내림차순, 같은 날짜는 전표번호 내림차순 |

③ 리터럴: XLSX `range:1`; 지방 prefix 정규식 `^지방\s*[/\:]\s*`; 창고 치환 1개; 법인어 `주식회사/유한회사/사단법인/재단법인/합자회사/합명회사/협동조합/농업회사법인/㈜/주)/구)`; 날짜 fallback 브라우저 현재일; history chunk `2,000자×최대 200개`.

④ 읽는 축: `일자-No.`, `배송주소`, `거래처`, `판매번호|판매 번호`, `특이사항`, `출고창고`, `품목명|품목|품 목`, `금액|금 액`.

⑤ **[있음]** `RegionalService`, `/dispatches/regional`; ⑥ **[자동]** 지방 표지는 결과 주소에서 제거하되 원본 주소 보존; ⑦ 미이식 핵심 없음. 다만 exact 창고명 치환은 warehouse code 기반으로 정규화해야 한다.

### R03. 미배차 상태·중복·폐기 판정

① 함수: `handleFile`, `extractNum`, `checkDuplicates`, `getDeliveryInitialState`, `generateFormatStr`, `runProcess`, `sortData`, `renderTable` — `미배차리스트/Index.html:450-1019`.

② 조건→결과:

| 조건 | 초기/최종 상태 |
|---|---|
| 특이사항 `입금` | `보류` |
| 주소/특이사항 `배차 x` | `해당없음` |
| 주소/특이사항 `반품`, 단 `배차` 없음 | `해당없음` |
| 주소 `야적...[/|:]` / `지방...[/|:]` | `야적미배차` / `지방미배차` |
| 창고에 상일·초월 없음; 앞 10자 `자가|회차|차용|반납|대여|회수`; 경동·로젠 표지 | `해당없음` |
| 그 외 | `미배차` |
| 수동 배차표에서 전표번호 1회 발견 | 각각 `배차완료/야적배차완료/지방배차완료` |
| 2회 이상 발견 | `중복배차`; 행 강조 |
| 수동표 번호가 최신 이카운트에 없음 | `폐기전표`, 세 분류표 모두에 출력 |

③ 리터럴: 전표번호는 첫 괄호 안 끝의 `1~3자리`; 판매번호는 `날짜-번호` 두 조각; 금액 `parseInt` 후 표시; 포맷주소 첫 3토큰, 거래처 최대 10자; 오전 키워드 `오전,7시,8시,9시,10시,11시,바로,일찍,최대,첫차,긴급,아침`, 오후 `오후,저녁,밤`; 날짜 월넘김 `-10`, 주말 `6/0`.

④ 읽는 축: `판매번호`, `배송주소`, `금액`, `품목`, `특이사항`, `출고창고`, `담당자명`과 사용자가 붙여넣은 배차 문자열.

⑤ **[부분]** `UnassignedService`; ⑥ **[자동]** 상태 우선순위는 `보류→배차X/반품→야적→지방→창고/특수운송 제외→미배차`. 🚩 배차표 중복 2건 이상을 오류로 볼지 복수차량로 볼지 결정 필요. ⑦ 미이식: 폐기표·중복표, 야적/지방/보류/해당없음 세분화, 복사용 포맷 문자열, 오전/오후 운영 highlight.

### R04. 배차안내 문자 대상·하차일·그룹 멘트

① 함수: `processDispatchData`, `lookupEcount`, `cmp`, `boolKey`, `rowTargetDay`, `getChatMapData`, `getForbiddenData`, `extractNum`, `checkDuplicatesFor`, `checkDuplicates`, `handleFile`, `assembleMents`, `runProcess` — `배차안내문자/Code.js:150-460,610-688`, `배차안내문자/Index.html:603-668,1145-1383`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 괄호 안 끝 1~3자리 번호가 없음 | 배차 요청행 제외 |
| 같은 번호가 날짜가 다른 이카운트 행에 존재하고 요청 날짜 없음/불일치 | `전표번호 중복 날짜확인요망!` |
| 이카운트 미존재 | `이카운트 데이터 없음 최신화요망!` |
| 거래처 정규화명이 금지 DB와 일치 | `발송금지 업체입니다.` |
| 단톡방명에 `회계` | 단톡방 제거 |
| 인수자 텍스트에서 010 11자리 추출 성공 | `010-####-####`; 실패면 빈값 |
| 기사 업체명 `/` 조각의 대시 뒤/순수숫자/끝숫자가 전표번호와 일치 | 기사 연락처 매핑 |
| 지방·야적/야상 | 특이사항의 명시 하차일 우선; 상차일이 없으면 기준일 -2..+5 범위에서 첫 숫자 탐색 |
| 동일 날짜+전표번호 중복 결과 | 기사번호가 있는 행을 우선해 1건 유지 |
| 동일 단톡방, 없으면 동일 인수자번호 | 하차일별 행을 한 문자로 병합 |

③ 리터럴: type `당일배송/지방배송/야적배송`; 기본 하차일=판매일 day; 탐색 offset `-2..+5`; 주소 표시 첫 `3`토큰; 오류 멘트 4종; 머리말 `AI 삼성무풍 시스템에어컨 배차실입니다.`; 하차 문구 `N일 하차 건 배송기사님 연락처를 안내드립니다.`; 개인번호 발송 끝문구 `※출하창고 상황에 따라 지연될 수 있음을 양해 부탁드립니다.`; Notion page pagination은 `has_more` 전체; chat 속성 `이카운트 사업자명/카톡방`, block 속성 `이카운트 사업자명`.

④ 읽는 축: XLSX `판매번호, 거래처, 배송주소, 인수자 번호, 특이사항`; 수동표 `배차요청내역, 날짜`; 기사표 `업체명, 배송기사 연락처, 날짜`; Notion chat/block DB.

⑤ **[부분]** `DispatchBatchPreviewService`, notification-service; ⑥ **[자동]** 식별키=`날짜+전표번호`, remote는 명시 하차일 우선, 발송금지는 fail-closed. 🚩 단톡방과 SMS 번호가 모두 있을 때 우선채널, 번호 중복의 허용 조건, 판매일을 하차일로 쓰는 당일 기본은 결정 필요. ⑦ 미이식: 멀티날짜, 복합키·모호성 행, 하차일 parser, 단톡방/번호별 멘트 병합, 회계방 제외.

### R05. DPS 입고기록 대조

① 함수: `handleFile`, `cleanModelName`, `runMatching` — `DPS 입고기록 비교/Index.html:328-489`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 좌측 헤더에 `품명 및 규격`+`적요`, 우측에 `납품일자`+`모델`+`납품번호` | 유효 파일 |
| 좌 품명이 `L-` 시작, 적요 비숫자/빈값 | 제외 |
| 우 날짜가 빈값/헤더/사업장/합계/`0000`, 모델이 `adjustment`, 번호·모델 무효 | 제외 |
| `납품번호_정제모델` 동일 후보 | 수량+합계 → 수량 → 합계 → 남은 첫 행 순으로 1:1 매칭 |
| 수량과 합계 모두 동일 | `TRUE`; 후보는 있으나 값 다름=`FALSE_MISMATCH`; 한쪽만=`FALSE_LEFT/RIGHT` |

③ 리터럴: 모델명은 `[`, `(`, `.` 중 첫 구분 앞만 취하고 공백 제거; 숫자는 쉼표 제거 `Number`; Excel serial date epoch `25569`, 초 `86400`, ms `1000`; 실행 지연 `100ms`.

④ 좌: `일자, 품명 및 규격, 수량_1|수량, 단가, 공급가액, 부가세_1|부가세, 합 계|합계, 구매처명, 적요`; 우: `납품일자, 납품번호, 모델, 수량_2|수량, 매입단가, 공급가, 인도처명, 부가세_2|부가세, 합계`.

⑤ **[부분]** inventory DpsCompare. 키와 대조축이 다름. ⑥ **[자동]** exact 수량+합계를 정합으로 하고 fallback 후보는 불일치 상태로만 연결. 🚩 모델명 괄호·점 절단을 identity 규칙으로 유지할지 product code mapping으로 대체할지 결정 필요. ⑦ 미이식: 금액 포함 1:1 우선매칭과 양측 누락 분류.

### R06. 품목별 DPS/실배차 저장내역 대조

① 함수: `handleFile`, `runMatching` — `품목별 DPS 입고내역 비교/Index.html:327-549`.

② 조건→결과: 우 파일의 두 번째 이후 시트를 돌며 5행 이후, 유형=`정상입고` 행을 `전기일자/전표생성일/발생번호/고객명/구매처명/창고/입고수량/출고수량/재고수량`으로 읽는다. 비교 단계는 선택 기간의 Notion HTML 첫 셀에서 `(거래처-끝 1~3자리)`를 추출하고, 업로드된 `접수시간/업체명`을 `/`로 나눠 **MM-DD+전표번호**가 1:1 동일하면 TRUE, 한쪽만 남으면 FALSE_LEFT/RIGHT다.

③ 리터럴: 우 원시 column index `0,5,10,14,18,26,32,33,36,39`; 데이터 시작 index `4`; 날짜 MM-DD zero pad; 대상 type radio; 저장일 `YYYY-MM-DD`.

④ 읽는 축은 위 10개 고정 위치와 Notion 저장 HTML, 업로드 `접수시간/업체명`. ⑤ **[부분]** `analyzeByProduct`는 자체 집계라 양측 대조 의미가 다름. ⑥ **[자동]** 키=`날짜+전표번호`; 🚩 프로젝트 이름과 실제 비교축(정상입고 원시값을 읽지만 runMatching은 Notion 배차 HTML+접수업체)을 정리해 어떤 데이터가 정본인지 결정 필요. ⑦ 미이식: 양측 1:1 소비와 LEFT/RIGHT 누락.

### R07. 운송사 실배차 대조

① 함수: `handleFile`, `runMatching` — `운송사-실배차내역 비교/Index.html:319-523`.

② 조건→결과: 다중 파일의 2행을 헤더로 `접수시간/업체명`을 모으고, 기간 내 Notion 저장 배차 HTML의 첫 셀에서 전표번호를 추출한다. 업체명은 `/` 분할하며 **MM-DD+전표번호** 1:1 일치=TRUE, 우리만=FALSE_LEFT, 운송사만=FALSE_RIGHT.

③ 리터럴: header row index `1`, data index `2`, 번호 끝 `1~3자리`, 날짜 `MM-DD`, 파일 수 무제한, 실행 시작·종료일 필수. ④ Notion manual history HTML + vendor XLSX `접수시간/업체명`. ⑤ **[있음/부분]** `DispatchReconcileService`의 3상태는 있음; vendor parser 포맷 차이. ⑥ **[자동]** 복합키 및 1:1 소비. ⑦ 추가 vendor 원본 header 표본과 레거시 history adapter가 미이식.

### R08. DPS 가입고 생성·이카운트 구매전표

① 함수: `sendToEcountAPI`, `handleFile`, `processData`, `openEcountModal`, `proceedToDateModal`, `confirmEcount`, `driverPhone` — `가입고처리/Code.js:152-176`, `가입고처리/Index.html:343-641,671-675`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 파일명에 6자리 | `20`+6자리 입출고일 후보; 없으면 오늘 |
| 시트 두 개에서 7개 비교필드가 같은 행이 앞 시트에 남음 | 가입고 후보; 뒤 시트와 같은 key는 수량만큼 상쇄 |
| 고객명에 품목 필터 키워드 없음 | 제외 |
| 창고 삼성/초월 | `WH_CD=00003`, `초월입고(가입고)`; 이화/상일=`2`, `상일입고(가입고)` |
| 모델에 `1WAY` | 창고를 무조건 `2` |
| 품목명 exact/코드 exact | `품목일치` 또는 `코드불일치`; 부분포함/첫 token 일치도 코드불일치; 실패=`검색실패` |
| 물류출고수량 숫자 아님/빈값 | 주문수량 사용, 둘 다 없으면 0; 최종 `Math.round` |
| 검색실패 | preview 경고, 이카운트 전송 payload에서는 제외 |

③ 리터럴: 데이터 시작 6행 뒤, 2단 header; 필수 11헤더 `NO,고객명,모델,주문,배달예정,물류출고,진행상태,차량번호,기사명,주문일자,주문번호`; 상쇄 index `1,2,3,7,8,9,10`; custom chunk 기본 `100`, 최소 `1`, ALL=`Infinity`; 공급처 `CUST=1248100998`; 회사 `COM_CODE=174539`; `LAN_TYPE=ko-KR`; Ecount Status=`200`, FailCnt=`0`; 전송일 UI 기본 KST(+9h) 오늘. `가입고처리/Index.html:649`에는 기사 이름+전화번호 **27쌍**이 seed literal로 하드코딩되어 있다(개인정보를 보고서에 재복제하지 않고 원문 위치·건수로 전수 식별).

④ XLSX 위 11헤더, 품목표 `code/name`, 기사표 `name/phone`; Ecount purchase payload `UPLOAD_SER_NO,IO_DATE,CUST,EMP_CD,WH_CD,U_TXT1,PROD_CD,PROD_DES,QTY`.

⑤ **[부분]** INBOUND slips와 inventory 재고는 결과 표현 가능, 외부 구매전표/가입고 workflow는 없음. ⑥ **[자동]** 미매칭 품목은 저장 차단, warehouse는 business code mapping. 🚩 상쇄 key, `1WAY→상일`, 공급처 코드, chunk별 serial을 정책으로 확정해야 한다. ⑦ 미이식: DPS 양시트 상쇄·가입고 상태, 품목 매칭 검수, Ecount purchase 결과 snapshot.

### R09. 월별 입출고 내역

① 함수: `getChartData`, `updateChart` — `입출고 내역/code.js:10-85`, `입출고 내역/index.html:390-431`.

② 조건→결과: Drive의 정확한 파일명 `이카운트입출고내역.xlsx`을 임시 Sheet로 변환한다. 날짜가 `YYYY/MM`이고, 괄호 3종을 제거한 품목명이 비어 있지 않으며 `사용` 미포함, 한글·공백만 아님, `L-`로 시작하지 않을 때 모델+`YYYYMM`별 입고·출고수량을 합산한다.

③ 리터럴: header row `2`, data row `3`; 임시명 `Temp_<epoch>`; 누락 수량=0; 제외 `사용`, Korean-only, `L-`; 임시 Sheet는 trash. ④ `품목명,일자,입고수량,출고수량`. ⑤ **[부분]** stock/slip에서 재구성 가능. ⑥ **[자동]** 제품 identity는 product code를 쓰고 표시명 필터는 이식하지 않는다. ⑦ 미이식: 월별 IN/OUT 분석 API·chart dataset.

### R10. 입출고 수요예측

① 함수: `fetchCsvData`, `processModelData`, `analyzeFiltered` — `입출고 분석/Code.js:86-232`, `입출고 분석/Index.html:344-407`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| CSV UTF-8에 `품목명/수량` 없음 | EUC-KR로 재해석 |
| 품목 prefix `AJ/AM/AC/AP/AR/AF` 아님, 수량≤0 | 제외 |
| `AR` | 길이 14 우선, 아니면 12 이상만; 실내기 판정 위치 11 |
| 그 외 | 12자 이상으로 절단; 실내기 판정 위치 6 |
| `AC/AP/AR/AF`인데 실내기 아님 | 제외; AJ=홈멀티, AM=상업멀티, 나머지=싱글중대형 |
| 2026 누적/동기간 2025 누적 | 비율 `rate`; 미래월 예측=`round(2025월×rate)` |
| 최고출고 모델의 `입고합-출고합≤0` | `발주 권장`; 아니면 `주력 상품` |
| rate>1.1 | `전반적 수요 상승` |

③ 리터럴: OUT folder `1wOg...DBPXA`, IN folder `1BKz...XKAN`; cache key `dash_csv_v1`, chunk `90,000`, TTL `3,600초`; year 고정 `2025/2026`; 월 12; top/bottom 각 3; 상승 threshold `1.1`; AR 길이 `14/12`, 기타 `12`.

④ CSV 동적 헤더 `품목명,수량,일자`; 폴더 내 모든 csv. ⑤ **[부분]** 데이터는 있으나 예측 service 없음. ⑥ 🚩 **결정 필요**: 고정 연도와 단순 비율 예측은 자동 이식 불가. 권고는 rolling 동기간+안전재고 정책으로 대체. ⑦ 미이식: demand forecast, 발주추천, 모델 ranking.

### R11. Notion 거래처 DC CSV 추출 스크립트

① 함수: `main`, `num`, `chk`, `sel`, `pct`, `won` — `scripts/extract-notion-dc-csv.js:57-116`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| Notion DB를 조회 | 반환된 첫 data source만 끝까지 pagination |
| 거래처코드가 숫자 | `Math.trunc`; 10자리가 아니어도 경고만 하고 출력 |
| DC가 숫자 | `round(value×10000)/100 + '%'` |
| 금액이 숫자 | `Math.trunc(value)`; 아니면 빈값 |
| checkbox | `Yes`/`No`; select 없음은 빈값 |
| CSV 값에 쉼표·따옴표·개행 | 큰따옴표 감싸고 내부 따옴표 두 번 표기 |

③ 리터럴: DB `193a…7102b`, API version `2025-09-03`, `page_size=100`, `data_sources[0]`; 출력 13열 `거래처코드,업체명,홈멀티DC,상업멀티DC,유연호스I형,360,4way,1way,스탠드,디럭스,1등급,단위처리,특이사항`; UTF-8 BOM `\uFEFF`; 코드 기대 길이 `10`; DC 배율 `10000/100`.

④ 읽는 속성은 위 13개 Notion property. ⑤ **[부분]** partner-service가 거래처 정본이지만 이 할인정책 속성은 완전 대응하지 않는다. ⑥ **[자동]** boolean=false, 나머지 결측=null로 보존; 잘못된 10자리 코드는 저장 차단 권고. 🚩 첫 data source만 선택하는 규칙과 할인 속성의 정본을 결정해야 한다. ⑦ 미이식: 거래처별 품목군 DC·정액 할인·단위처리 정책 모델.

### R12. 거래처 업데이트·담당자별 Google Sheet 배포

① 함수: `startUpdateFromExcel_`, `startUpdateCore_`, `buildTargetLinks_`, `processOne_`, `mergeNotionIntoMatrix_`, `stripNotionSegmentsAll_`, `normalizeSep_`, `cleanupSeps_`, `stripNotionSegments_`, `removeSegment_`, `buildNotionDict_`, `parseShortDiscount_` — `거래처 업데이트 프로그램/Code.js:21-958`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 사용자리스트 `업데이트`가 TRUE/마스터/MASTER이고 공유 시트 링크 존재 | 배포 대상; `담당자명`과 함께 최대 6 worker로 처리 |
| 대상 문서에 `거래처` 시트 없음 | 생성; 있으면 전체 contents를 지운 뒤 병합 matrix로 전면 교체 |
| Excel에 `싱글 할인` 열 없음 | 새 열 추가 |
| 거래처코드 매칭 | 쉼표·공백과 선행 0을 제거한 값으로 Notion dictionary 조회 |
| 동일 코드 Notion page가 여럿 | DC·할인·단위·특이사항 데이터가 있는 page 우선 |
| DC 존재 | `홈N%&상업N%` 문자열로 `싱글 할인`에 기록 |
| 정액 할인 존재 | `-N`, `-N천`, `-N만…` 축약 segment로 병합 |
| 특이사항 존재 | 기존 Excel 특이사항에서 옛 Notion segment를 제거한 뒤 `Notion 일반 / Excel 고유 / Notion 특이사항` 순으로 `/` 결합 |

③ 리터럴: master Google Sheet URL 상수, 탭 `사용자리스트`, 대상 탭 `거래처`, flag `TRUE/마스터/MASTER`, link/header `공유 시트 링크/담당자명`, worker `6`, progress TTL `600초`, 임시 Sheet 기본 `metaRows+100` 또는 `3000행`, `20열`, separator `/`, DC separator `&`; Notion 속성 `거래처코드,홈멀티DC,상업멀티DC,유연호스I형,360,4way,1way,스탠드,디럭스,1등급,단위처리,특이사항`; 금액 축약 경계 `1000/10000`, 숫자는 `Math.trunc`.

④ Google 입력은 `사용자리스트`와 업로드 Excel `거래처코드,특이사항,싱글 할인`; 출력은 담당자별 `거래처` 시트 전체. ⑤ **[부분]** partner-service의 7,253 거래처가 정본이지만 담당자별 Sheet 복제와 할인 문자열은 없다. ⑥ **[자동]** 정규형에서는 코드 선행 0 제거가 아니라 원문 business code를 보존하고 할인/단위/메모를 별도 필드로 저장. 🚩 담당자 Sheet 배포를 유지할지 partner API/export로 폐기할지 결정 필요. ⑦ 미이식: 거래처 pricing policy와 담당자별 export, 중복 Notion page 충돌 로그.

### R13. 교육안내 자동 상태변경

① 함수: `checkAndUpdateNotion` — `교육안내 자동상태변경/Code.js:1-100`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 현재시각 > `등록마감일.date.start`이고 `가능여부`≠`신청불가` | `가능여부=신청불가` PATCH |
| `문자발송내역.files.length>0`이고 `안내문자발송`≠`발송완료` | `안내문자발송=발송완료` PATCH |

③ 리터럴: DB `1b5a…5490`, Notion version `2022-06-28`, 속성/값 `등록마감일,가능여부,신청불가,문자발송내역,안내문자발송,발송완료`; query는 pagination/page_size 지정 없음. ④ 위 5개 Notion 속성. ⑤ **[불가]** 교육 신청 도메인 없음. ⑥ 🚩 자동 기본값 설정 불가: 마감 상태와 발송완료는 사실 event여야 하며 files 존재로 발송을 추론하면 안 된다. ⑦ 전부 미이식.

### R14. 거래처 비밀번호 SHA-256 일괄 전환

① 함수: `migratePasswordsToHash`, `hashPassword_` — `비밀번호 일괄 암호화/Code.js:6-44`.

② 조건→결과: Notion을 100개씩 전 페이지 조회해 `현재PW`가 정확히 4자리 숫자(`^\d{4}$`)인 page만 UTF-8 SHA-256 lowercase 64 hex로 덮어쓴다. 이미 hash거나 빈 값은 건너뛴다.

③ 리터럴: DB `2dda…203c0`, Notion version `2022-06-28`, `page_size=100`, 속성 `거래처코드/현재PW`, regex `^\d{4}$`, digest `SHA_256`, radix hex `16`, byte mask `0xFF`, zero pad `0`, 출력 길이 `64`; 주석상 `수동으로 1회만 실행`.

④ Notion `거래처코드.title`, `현재PW.rich_text`. ⑤ **[불가]** 제시 스키마에 partner credential/auth 축 없음. ⑥ 🚩 **결정 필요**: 비밀번호를 이관할지 계정 재설정할지. SHA-256 무salt는 신규 기본값으로 채택 불가. ⑦ credential store, reset flow, password audit 모두 미이식.

### R15. 알리고 주소록·요일별 홍보 CSV

① 함수: `fetchExternalData`, `processManagerJS`, `normalizePhoneJS`, `formatPrefix`, `extractNumbers`, `syncEcountChunk`, `handleFile`, `syncServerData`, `processNextBatch`, `getCombinedLocalPhones`, `getRegionCode`, `initDayMappingUI`, `downloadData`, `executePromo`, `executeAllClients`, `executeGolf` — `알리고 자동 업로드/Code.js:181-465`, `Index.html:314-725`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| Ecount 업로드 row의 그룹≠`SF(밴더)` | 제외; type이 `kt…`이면 `/SF벤더` suffix |
| 담당자 없음/폐업/신용정보·전자소송·보류 | 각각 `미지정/폐업/해당 상태`; 폐업·신용정보·전자소송·보류 대상은 외부 주소록에서 제외 |
| 전화·주소 둘 중 하나 없음 | Notion 외부 주소록에서 제외 |
| 주소 | 서울/전라/경기/충청/경상/강원/제주/기타 regex cohort |
| 요일 | 월=전라, 화=경상, 수=서울+경기, 목=강원+제주, 금·토·일=없음 |
| promo 생성 | Notion 번호를 먼저 넣고 local 번호로 덮어쓰는 전화번호 dedup; 금지번호 3개 제외 |
| 전체/골프회 | 각 cohort를 BOM CSV `전화번호,이름,그룹`으로 생성하고 Drive에서 당일 파일을 overwrite/create |
| Notion sync | UI batch 기본 50건, 거래처코드 기준 patch/create; 새 담당자가 신용정보/전자소송이면 title strikethrough |

③ 리터럴: source Google Sheet `1YV…7cI`, gid `114On=1005069153, 네이버=1985957420, 자재상=785590967`, prefix `(114On)/(네이버)/(자재상)`; CSV folders promo `1YdAL…fKcr`, all `11XY…qCmU`, golf `1OKl…futKIt7`; 금지번호 `010-5114-9955,010-4731-3294,010-5646-1545`; UI batch `50`; Notion retries `5`, 429 sleep=`Retry-After×1000+500ms`, 5xx exponential 최대 `20000ms`; 전화 규칙 `8→4-4`, `010/011`, `016/017/018/019`, `070/080`, `02`, 일반 `10/11자리`; 지역 regex에는 광주광역시·광산구 및 광주 4개 구, 수도권 시 목록, 대전·세종·부산·울산·대구가 포함된다.

④ Notion `거래처명,전화번호,주소,담당자명` 및 sync `거래처코드,거래처명,대표자명,주소,전화번호,비고,담당자명`; Ecount Excel `그룹` 등; 보조 Sheet `회사명,연락처,주소`. ⑤ **[부분]** 알리고 export/sync service는 있으나 실 자격, 캠페인 cohort·Drive 산출은 없음. ⑥ **[자동]** 전화는 E.164/국내 표시형을 분리하고 region은 주소 정규화 결과로 산출. 🚩 요일 cohort·금지번호·담당자 상태를 데이터 정책으로 만들지 결정 필요. ⑦ 미이식: 실제 Aligo 연동, schedule cohort, suppression registry, 골프회 source.

### R16. 두 전용 주문서 공통 가격·세트·이카운트 법칙

① 함수: 두 프로젝트의 §4.11/§4.15 업무규칙 중 `fetchNotionPricingForCustomer_`부터 `expandSingleSetItems_`, `sendOrderToEcount_`, `sendFromPreview`, 모델 map 계열 전부 — `에어디자이너 전용 주문서 인식/Code.js:48-1238,2049-2347`, `제이시스템 전용 주문서 인식/Code.js:54-1108,2405-2884`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 고객 pricing | 홈/상업 DC를 출고가에 적용하고 round mode/step으로 반올림; 구성품·옵션 정액 할인 합산 |
| 단위처리 문자열 | `N원`과 `반올림/올림/내림`을 파싱; Script Properties 뒤 Notion 값이 덮어씀 |
| COMM DC 없음 | HOME DC fallback; legacy discount fallback은 `.47` |
| 싱글 세트 구성 | 세트코드·모델·수량·납품가가 유효한 행만 확장; 누락 수량=1, 누락 가격=0 |
| 세트 목표가-고정 구성품가 | 나머지를 실내/실외 `6:4`, 그 외 `4:6`으로 분배; 실내기 먼저 1,000원 단위, 실외기로 잔차 조정 |
| 주문 전송 | qty를 양수 정수화; 총액÷1.1을 절대값 floor해 공급가, 잔액을 VAT로 하고 음수 부호 복원; HTTP 200이면서 `Data.SuccessCnt>0`만 성공 |

③ 공통 리터럴: `CURRENCY=KRW`, `HOME_DISCOUNT_RATE=.45`, legacy `.47`, `SURCHARGE_RATE=0`, `ROUND_TO=0`, `ROUND_MODE=ROUND`, `PRICE_DECIMALS=0`, 옵션 정액 할인 기본 `0`, hose code `FH-LFHIF`, cache `5분`; catalog Sheet `<SHEET_ID>`, 탭 `종합 견적서,홈멀티,싱글 세트,싱글 구성품,담당자`와 각 `_단가인상`; 인상판 cutoff `shipDate >= 20260401`; option token `Black,air,lift,circle,square,color,wired,wireless,제외,L,I`; warehouse 초월 `00003`, 상일 `2`; VAT divisor `1.1`, set 배분 `0.6/0.4`, 단위 `1000`, Ecount language `ko-KR`, size 빈값용 zero-width character.

④ Sheet 축: 고객코드·담당자·모델명·출고가·납품가·고정DC·규격·세트코드·구성품 모델·수량·그룹·기능·상품명·옵션별 할인. Notion 축: 홈/상업 DC, 유연호스 I/L, 단위처리, 옵션별 금액. Ecount payload는 날짜·거래처·창고·품목·수량·단가·공급가·VAT·배송지·메모. ⑤ **[부분]** partner-order parser/confirm은 있지만 pricing/세트 구성/외부 전송 전부는 동일하지 않다. ⑥ **[자동]** 통화 KRW, 세금 inclusive 분해는 계약으로 명시할 수 있음. 🚩 DC fallback, 6:4 배분, VAT 절사, 세트 결측 기본을 결정해야 한다. ⑦ 미이식: versioned customer pricing, bundle price allocation, Ecount idempotency/result snapshot.

### R17. 에어디자이너 주문서 고유 OCR·고객·창고 법칙

① 함수: §4.11의 `decideWarehouseFromItems_`, parser/quantity/merge/memo/preview-order 계열, `sendNow` — `에어디자이너 전용 주문서 인식/Code.js:471-2047`, `Index.html:544-604`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 품목이 홈멀티 | 기본 초월; non-set AJ이고 품명/규격/모델에 `인피니트`면 상일 |
| 홈멀티 없음, 싱글 token 또는 model flag | 상일; 그 외 초월 |
| 메모에 `공기` | 고객 `6508103591/공기를디자인하는사람들 주식회사`; 아니면 `6568702893/에어디자이너 주식회사` |
| 시간 메모 | 기본 `오전 일찍`; 바로/지금=`바로착`, 7~11시=오전, 1~5시=오후 |
| 주문 본문 | 배송일자 `YYYYMMDD`, 인수자/인도자 근처 전화 최대 2개, 현장주소, 특이사항, 번호·품명·수량 단위를 파싱; 같은 모델 수량 합산 |
| OCR | Drive Advanced OCR Korean을 최대 7회, 1,200ms 간격으로 읽고 text gate 미달 시 HTTP upload fallback |

③ 리터럴: 상일 single token `360,냉방전용,1way/1-way/1 way,냉전,비스포크,1등급,벽걸이,가정용 에어컨`; phone 표기 `번호(부재시:번호)`; 수량 단위 `EA/개/세트/SET`, quantity `>0`; OCR retry `7`, delay `1200ms`, text gate `20/10`; customers와 warehouse code는 위 값. ④ 입력 PDF text의 배송일자·인수자·인도자·현장주소·특이사항·품목구간, catalog/Notion 가격축. ⑤ **[부분]** Air parser는 있으나 legacy OCR fallback과 동적 고객/창고 결정 동등성은 미확인. ⑥ **[자동]** customer는 vendor account에 고정하지 말고 명시적 alias mapping; 🚩 `메모에 공기` 분기와 창고 keyword를 유지할지 결정 필요. ⑦ 미이식: 복수파일별 OCR provenance, confidence/manual correction, warehouse reason code.

### R18. 제이시스템 주문서 고유 OCR·납기·품목 보정 법칙

① 함수: §4.15의 `_coerceQtyToken_`부터 parser·보정·정렬·창고·전송 계열 35개 및 UI `handleExtract/sendNow` — `제이시스템 전용 주문서 인식/Code.js:404-2210,2490-2876`, `Index.html:133-695`.

② 조건→결과:

| 조건 | 결과 |
|---|---|
| 납기일자 발견 | 주문 출고일=`납기일-1일`; memo에 전일 `상`과 원일 `하` 표기 |
| 주소 | `야적/` prefix |
| 품목 | table → vertical → loose 순 fallback; table/loose 수량 미검출=1, vertical은 수량 발견 시만 채택 |
| OCR 수량≥100 | 주변 후보 중 50 이하 값을 택해 보정 |
| 모델 OCR의 0/O 혼동 | 후보 alias로 catalog 모델 매칭 |
| 모델 `AXJ-YA1509N` | 단가를 정확히 `45,000원`으로 강제 |
| 전송 정렬 | 홈 AJ → 싱글 AC/AP/AR/AF → 기타; `발통세트`는 마지막 |
| 창고 | 홈멀티면 초월, 홈 없음+싱글 token이면 상일, 그 외 초월 |

③ 리터럴: 고정 partner `8428102605`; special model/price `AXJ-YA1509N/45000`; date offset `-1일`; quantity fallback `1`, large threshold `100`, replacement max `50`, vertical lookahead `+6`; group prefix `AJ`, `AC/AP/AR/AF`; time default `오전 일찍`, `1~5→오후`, `>=12→오후`이며 12 초과는 `-12`; warehouse codes `00003/2`; 주소 prefix `야적/`.

④ OCR `납기일자,인도처,현장주소,참조` 및 품목 table/vertical/loose token, 공통 catalog/Notion/Ecount 축. ⑤ **[부분]** J parser는 있으나 모든 OCR 보정·특가·정렬·창고 이유가 도메인 정책으로 보존되지는 않는다. ⑥ 🚩 special price, 전일 출고, 수량=1 fallback은 자동 기본값 불가. 권고는 vendor 계약 버전과 confidence별 확인 단계. ⑦ 미이식: OCR provenance/confidence, alias review queue, 특가 유효기간, 납기-출고 calendar 정책.

## 6. 대응 기능이 아예 없거나 의미가 달라 미이식인 후보

단순 UI 재현이 아니라 우리 서비스에 저장·판정·감사 축이 없는 것만 모았다.

| 미이식 후보 | 레거시 증거 | 필요한 최소 도메인 |
|---|---|---|
| 교육 신청 마감·안내문자 발송 상태 | R13 전체 | `education_event/application`, deadline transition, notification delivery event |
| 거래처 로그인 credential | R14 전체 | credential store, salted password hash, reset/revocation/audit |
| 거래처별 가격정책 | R11/R12/R16 | partner×product-group DC, fixed discount, rounding, effective period, provenance |
| 담당자별 거래처 export | R12 | export job/snapshot/access policy; Google Sheet를 정본으로 쓰지 않는 구조 |
| 가배차 판정 설명·정책 버전 | R01/R02 | rule version, matched condition, override, region/warehouse reason |
| 미배차 세부상태와 원문 포맷 | R03 | `보류/해당없음/야적미배차/지방미배차`, 중복·폐기 사유 |
| 배차 문자 조립·억제 | R04/R15 | recipient/chat-room resolution, template version, suppression registry, send result |
| DPS 금액 포함 1:1 reconciliation | R05 | 양측 원본 snapshot, composite match key, consumed row, mismatch reason |
| 품목별 DPS라는 이름의 배차-history 대조 | R06 | 먼저 정본과 목적 확정 필요; 현재 우리 `analyzeByProduct`와 의미 불일치 |
| 가입고 후보·상쇄·Ecount 구매전표 | R08 | provisional receipt, source-pair cancellation, item-review, external result/idempotency |
| 월별 입출고 분석·수요예측·발주추천 | R09/R10 | aggregate snapshot, forecast model/version, confidence, safety-stock/order policy |
| 요일×지역 홍보 cohort·골프회 | R15 | campaign/audience/schedule/consent/suppression source |
| OCR provenance·confidence·수동보정 | R17/R18 | source file/page/text, field confidence, correction audit |
| bundle 금액 배분·특가 유효기간 | R16/R18 | bundle allocation policy, vendor special price contract/effective dates |
| 출고일 산정 calendar | R18 | 납기일→출고일 rule, 영업일·휴일 calendar, override reason |

## 7. 기본값 정규화 결과

### 7.1 자동 설정 가능

| 축 | 자동 기본값 | 근거 |
|---|---|---|
| reconciliation 상태 | `MATCHED/LEFT_ONLY/RIGHT_ONLY`; 애매한 후보는 mismatch | 레거시가 양측 행을 1회 소비하고 불일치를 따로 표시 |
| 숫자 결측 | DB에는 `null`, 화면 계산에서만 명시적으로 0 | 레거시의 광범위한 `||0`가 “실제 0”과 “미입력”을 섞으므로 원자료 보존 우선 |
| boolean 결측 | false가 아니라 `null/UNKNOWN`, UI 선택 시만 false | 유연호스 등 계약 속성에서 미확인과 false 구별 필요 |
| 통화/표시 | KRW; 금액은 정수 minor unit, 표시에서만 쉼표 | 두 주문서의 `CURRENCY=KRW`, 원 단위 외부계약 |
| 거래처·품목 식별 | UUID는 내부, business code 원문과 normalized lookup key 병존 | 사용자 UUID 비공개 및 선행 0 손실 방지 |
| 전화번호 | raw + canonical + 국내표시형 분리 | 알리고 정규화가 source별 손실·오판 가능 |
| 주소 지역 | normalized address에서 계산하되 `UNKNOWN` 허용 | `<미분류>/기타`가 실제 업무 상태 |
| 외부 전송 | idempotency key·request/response snapshot 필수 | GAS는 성공 여부만 남겨 재시도 중복 위험 |

### 7.2 자동 설정 불가

아래는 기본값이 아니라 계약·운영 결정이다: 지역/창고 예외, 미배차 상태 우선순위, 문자 recipient와 금지번호, DPS 대조 정본·키, 가입고 공급처·창고, 예측 기간·모델, 교육 발송완료 근거, credential 이관 방식, partner DC/fallback/rounding, bundle 배분, vendor별 고객코드·특가, 납기-출고일, OCR 저신뢰 수량 fallback. 세부 선택지는 다음 절에 둔다.

## 8. 🚩 개발책임자 결정 필요 목록

### D1. 가배차 지역·창고 판정의 정본

1. **정할 것:** 주소 문자열/품목 keyword를 그대로 운영 규칙으로 이식할지, DB 정책과 수동 override를 정본으로 할지.
2. **현재 레거시:** `가배차분류리스트/Code.js:277-311` — `"slice(0,3)"`, `"return ['<미분류>','']"`; Air `Code.js:504-506` — `"hasInfinite"`이면 `whCode='2'`, `상일창고`.
3. **후보:** (a) regex 그대로—빠르지만 변경 이력·설명 불가; (b) versioned DB rule+reason+override—구축비가 들지만 감사 가능; (c) 모델 master warehouse만—단순하지만 주소 예외 손실.
4. **권고:** (b). 미분류를 숨기지 말고 review queue로 보낸다.

### D2. 미배차 상태 우선순위

1. **정할 것:** `보류/해당없음/야적미배차/지방미배차/미배차`를 도메인 상태로 유지할지.
2. **현재 레거시:** `미배차리스트/Index.html:765-775` — `"입금"→"보류"`, `"배차 x"→"해당없음"`, `"야적…"→"야적미배차"`, 마지막은 `"미배차"`.
3. **후보:** (a) 5상태 그대로—호환성 높고 상태 폭증; (b) `UNASSIGNED/HOLD/EXCLUDED`+reason code—정규화되나 UI mapping 필요; (c) 메모만 보존—구현은 싸지만 조회·자동화 불가.
4. **권고:** (b), 기존 5값은 reason code로 보존.

### D3. 배차안내문자 수신자·날짜·억제 정책

1. **정할 것:** 인수자/단톡방 선택, 지방·야적 하차일, 중복·금지번호의 기준.
2. **현재 레거시:** `배차안내문자/Code.js:434-455` — 지방·야적이면 `explicit_unload_day`, 아니면 `delivery_day`; 알리고 `Index.html:662` — 금지번호 3개가 코드에 고정.
3. **후보:** (a) GAS 규칙/번호 그대로—즉시 호환, 유지보수·개인정보 위험; (b) template+recipient+suppression registry—관리비가 들지만 동의/감사 가능; (c) 매회 수동 preview—안전하지만 처리량 감소.
4. **권고:** (b)이며 실제 알리고 자격 확보 전 send는 차단하고 dry-run만 허용.

### D4. DPS/품목별 DPS 대조 정본과 복합키

1. **정할 것:** 대조 목적을 금액 입고검증과 배차 저장검증 중 무엇으로 나누며 어떤 key를 쓸지.
2. **현재 레거시:** 품목별 `Index.html:421-449`는 Notion 저장 HTML 첫 셀을 읽어 `MM-DD`와 번호를 추출한다. 반면 파일 parser는 정상입고 10개 column을 읽는다. DPS는 `납품번호+정제모델`과 수량·합계를 우선한다(R05).
3. **후보:** (a) 두 기능 분리—정확하나 API/화면 2개; (b) 통합 reconciliation engine+adapter—초기 설계비, 장기 재사용; (c) 우리 `productCode+거래처+입고일`만—간단하지만 레거시 누락 검출 손실.
4. **권고:** (b). source adapter별 key/version을 저장하고 품목별 프로젝트는 이름만 믿고 이식하지 않는다.

### D5. 가입고 생성·Ecount 구매전표 정책

1. **정할 것:** `1WAY→상일`, 고정 공급처와 두 Sheet 상쇄를 승인된 입고 workflow로 만들지.
2. **현재 레거시:** `가입고처리/Index.html:436` — `"1WAY"`이면 `wh='2'`; `:480` — `CUST:"1248100998"`, 검색실패 품목은 payload에서 빠진다.
3. **후보:** (a) 그대로 자동전송—빠르나 오입고·중복 위험; (b) 가입고 draft+검수 후 idempotent Ecount send—한 단계 늘지만 안전; (c) Ecount 연동 제외, INBOUND만—외부 이중입력 발생.
4. **권고:** (b); 공급처·warehouse rule은 effective-date policy로 관리.

### D6. 입출고 예측 기준

1. **정할 것:** 고정 연도 비율 예측을 폐기하고 어떤 rolling horizon·안전재고를 쓸지.
2. **현재 레거시:** `입출고 분석/Index.html:352-353,376-381` — `2025`와 `2026` 동기간 합계비 `rate`로 미래월을 `Math.round(monthlyLast[m] * rate)`.
3. **후보:** (a) 전년동기 단순비율—설명 쉽지만 연도 고정·이상치 취약; (b) rolling 12개월+계절성+안전재고—데이터/검증 필요; (c) 집계만 제공하고 예측 보류—안전하지만 발주추천 없음.
4. **권고:** 우선 (c), 충분한 backtest 뒤 (b).

### D7. 거래처 가격정책 정본과 결측 fallback

1. **정할 것:** partner별 홈/상업 DC·정액 할인·단위처리의 정본, 유효기간, 결측 처리.
2. **현재 레거시:** Air `Code.js:320-328` — 상업 DC가 없으면 홈 DC, 마지막 fallback `0.47`; 거래처 갱신 `Code.js:617-624` — `싱글 할인` 열을 자동 추가; script `extract-notion-dc-csv.js:66-69` — 여러 data source 중 첫 번째만 사용.
3. **후보:** (a) Notion/Sheet 정본 유지—이관비는 낮지만 중복·무결성 약함; (b) partner-service versioned pricing 정본—마이그레이션 필요, 일관성 최고; (c) product 가격에만 포함—partner 계약 차이를 잃음.
4. **권고:** (b); 결측은 다른 DC나 47%로 자동 대체하지 말고 `UNCONFIGURED`로 주문 확정을 막는다.

### D8. bundle 금액 배분·VAT 절사

1. **정할 것:** 세트 잔액 6:4/4:6과 1,000원 보정을 회계 계약으로 유지할지.
2. **현재 레거시:** Air `Code.js:874-885` — AF는 `6:4`, 그 외 `4:6`, 실내기를 `Math.floor(.../1000)*1000` 후 실외기로 잔차 조정; 전송은 총액÷`1.1` floor.
3. **후보:** (a) 그대로—외부 결과 호환, 임의 배분 지속; (b) 구성품별 계약가 우선+잔차 규칙 명문화—자료 필요; (c) 세트 한 줄 전송—간단하지만 재고 구성품 불일치.
4. **권고:** (b), 계약가 없는 기간에만 (a)를 versioned fallback으로 제한.

### D9. 에어디자이너 고객·시간·창고 keyword

1. **정할 것:** 메모 텍스트로 법인·시간·창고를 자동 확정해도 되는지.
2. **현재 레거시:** Air `Code.js:1598-1618` — 기본 `6568702893`, 메모에 `공기`면 `6508103591`, 기본 `오전 일찍`, `바로|지금→바로착`; `:509-523`의 single regex면 상일.
3. **후보:** (a) 그대로—빠르지만 오분류 가능; (b) vendor/account alias+structured delivery window+warehouse reason—초기 mapping 필요; (c) 매건 확인—정확하지만 운영비 증가.
4. **권고:** (b), 모호한 메모만 (c)로 보낸다.

### D10. 제이시스템 납기·수량 fallback·특가

1. **정할 것:** 전일 출고, 수량 1 보정, 특가 45,000원을 영구 기본값으로 둘지.
2. **현재 레거시:** J `Code.js:1917-1924` — 납기일에서 `-1`일을 출고일로 설정; `:492` — `AXJ-YA1509N`은 `45000`; parser table/loose는 수량 미검출 시 1(R18).
3. **후보:** (a) 하드코딩 유지—호환성, 만료·휴일 오류; (b) vendor contract+business calendar+OCR confidence—구축비, 통제 가능; (c) 세 값 모두 사용자 확인—안전하지만 대량 처리 저하.
4. **권고:** (b), low-confidence qty만 (c).

### D11. 교육 상태 도메인 생성 여부

1. **정할 것:** 이 기능을 신규 도메인으로 이식할지 폐기할지.
2. **현재 레거시:** `교육안내 자동상태변경/Code.js:37-45` — 마감 후 `신청불가`; `:67-76` — “파일이 단순히 존재”하면 `발송완료`.
3. **후보:** (a) 폐기/Notion 유지—개발비 없음, 통합 감사 불가; (b) education-service/모듈 생성—비용 큼; (c) partner-service의 작은 event/application 모듈—경계가 다소 섞이나 최소 이식.
4. **권고:** 실제 계속 쓰는 업무인지 먼저 확인; 사용 중이면 (c), 단 발송완료는 notification delivery receipt로만 전이.

### D12. 거래처 인증 이관 방식

1. **정할 것:** 기존 4자리 password hash를 이관할지 전 계정 reset할지.
2. **현재 레거시:** `비밀번호 일괄 암호화/Code.js:5,21-28` — `"수동으로 1회만 실행"`, 정확한 `^\d{4}$`만 `평문 -> 해시 변환`; 구현은 salt 없는 SHA-256.
3. **후보:** (a) SHA-256 hash 수용 후 로그인 때 강한 hash로 승격—편리하나 약한 hash 임시 보관; (b) 전원 reset/일회용 link—안전하지만 고객 지원비; (c) 해당 인증 폐기/SSO—최선이나 사용자·인프라 변화 큼.
4. **권고:** 가능하면 (c), 아니면 (b). 신규 시스템의 기본 password는 만들지 않는다.

### D13. 알리고 캠페인 cohort·수신억제 정본

1. **정할 것:** 요일×지역 홍보, 골프회, 제외번호를 우리 서비스에서 운영할지.
2. **현재 레거시:** 알리고 `Index.html:482-485` — 월 전라/화 경상/수 서울·경기/목 강원·제주가 기본 checked; `:662` — 번호 3개 hard-code.
3. **후보:** (a) 그대로—운영 연속성, 동의·변경이력 취약; (b) consent+campaign+suppression registry—구축/정비비, 법적·운영 통제; (c) 주소록 export만 이식하고 홍보 자동화 폐기—안전하지만 수작업.
4. **권고:** 알리고 자격·수신동의 출처가 확정되기 전 (c); 이후 (b).

### D14. 담당자별 Google Sheet 배포 유지 여부

1. **정할 것:** 거래처 정보를 담당자별 Sheet로 계속 전체 덮어쓸지 API/export로 전환할지.
2. **현재 레거시:** 거래처 갱신 `Code.js:614-625` — `거래처코드/특이사항/싱글 할인` 열을 만들고 전체 matrix를 재작성; 대상은 `업데이트=TRUE/마스터/MASTER`이다(R12).
3. **후보:** (a) Sheet export 호환 유지—현장 변화 최소, 복제·권한 누수; (b) partner UI/API 정본—개발/교육비, 일관성; (c) read-only snapshot export—현장 호환과 정본 분리, export 관리 필요.
4. **권고:** (c)를 과도기로 쓰고 (b)로 종료.

### D15. 기사 연락처 정본

1. **정할 것:** 가입고 화면의 기사 이름·전화번호 27쌍을 어디로 이관하고 누가 갱신할지.
2. **현재 레거시:** `가입고처리/Index.html:649` — `DRIVER_SEED` 배열에 27명의 이름과 휴대전화가 코드 literal로 들어 있고 화면 local 저장으로 수정된다.
3. **후보:** (a) 코드 seed 유지—가장 싸지만 개인정보·갱신·권한 감사 불가; (b) arologis driver/contact master—스키마·권한 작업 필요, 배차와 일관; (c) partner/HR directory 연동—중복 감소, 외부 의존·경계 협의 필요.
4. **권고:** (b), 전화번호 암호화/마스킹과 변경 audit를 포함하고 source literal은 이관 후 폐기.

## 9. 함수 분모 밖 `_notion-export*` 보조자료 전수 확인

고정 함수 분모에는 정의가 없어 717개에 더하지 않되, “그 밖에 모든 파일” 지시에 따라 두 디렉터리의 **CSV 12개 전부**를 확인했다. 현재본 4개와 2026-05-09 old의 base/`_all` 8개다.

| 파일군 | 현재본 | old base + `_all` | header/법칙 |
|---|---:|---:|---|
| 가배차용 지역별 분류표 | 20행 | 20+20행 | `분류 그룹,검색어`; old 두 파일 SHA-256 동일 |
| 거래처 DC정보 | 312행 | 222+222행 | 현재 13열; old `_all`은 같은 13열의 순서가 달라 byte hash 다름 |
| 단톡방리스트 | 114행 | 112+112행 | `이카운트 사업자명,카톡방,생성 일시`; old `_all`은 2·3열 순서가 달라 hash 다름 |
| 발송금지리스트 | 6행 | 6+6행 | `이카운트 사업자명,생성 일시`; old 두 파일 SHA-256 동일 |

- 지역표 20개 그룹은 `전라남도,대구광역시,경기남부,충청남도,서울특별시,경기북부,울산광역시,세종특별자치시,강원도,경상북도,전라북도,대전광역시,광주광역시,제주특별자치도,경기서부,충청북도,부산광역시,경기동부,경상남도,인천광역시`다. 각 행의 `검색어`는 R01/R02의 주소 keyword 정본 후보이나, 동명 구·시 때문에 group 문맥 없이 단독 매칭하면 안 된다.
- 현재 DC header는 `거래처코드,업체명,홈멀티DC,상업멀티DC,유연호스I형,360,4way,1way,스탠드,디럭스,1등급,단위처리,특이사항`으로 R11/R12/R16의 13개 축과 일치한다.
- 단톡방표는 거래처→카톡방 mapping의 실제 데이터 source다. 우리 notification 축에는 이 mapping의 version/snapshot이 없다.
- 발송금지 CSV는 **전화번호가 아니라 사업자명 6건**이다. R15의 코드 고정 전화번호 3개와 별개이므로, suppression을 이식할 때 `partner 기준`과 `phone 기준` 두 종류를 합치되 원출처를 보존해야 한다.
- old의 깨진 파일명은 export filename encoding 문제이며 CSV header/content는 UTF-8로 읽힌다. 같은 행수만으로 현재본과 동일하다고 간주하지 않았고, 최신본이 old 대비 DC `+90`, 단톡방 `+2` 행임을 확인했다.

## 10. 외부 식별자·저장소 literal 색인

API token 값은 원본부터 `REDACTED_NOTION_TOKEN`이거나 Script Properties 조회라 비밀값을 복원하지 않았다. 비밀이 아닌 식별자는 축약 없이 다음과 같다.

| 용도 | literal | 위치 |
|---|---|---|
| 공통 사용자/담당자 | `198a1006d65880ddb510e0d525c5e9da` | 가배차·가입고·미배차·배차문자·알리고·두 대조·두 OCR |
| 공통 가배차/미배차 history | `328a1006d65880159a82d02ba10d0e8c` | 가배차/지방가배차/미배차/배차문자 |
| 수동배차·DPS reconciliation history | `337a1006d65880a8b633fe6ca44573b2` | 가입고/미배차/DPS/운송사/품목별 DPS |
| 지역 분류 | `34ea1006d658808ba38ed69d60a56c38` | 가배차 `Code.js:3` |
| 단톡방 / 발송금지 | `34da1006d65880d0bb02e6ac7a2635f6` / `34da1006d658809294c5d2c59942525e` | 배차문자 `Code.js:3-4` |
| 알리고 history / 거래처 data | `34aa1006d65880cea4a5cdf55cccb1b4` / `1a0a1006d65880e69e97e0a00c8d998c` | 알리고 `Code.js:5-7` |
| 거래처 DC | `193a1006d6588161a02cc8f196d7102b` | DC script·두 OCR |
| 거래처 auth password | `2dda1006d6588047b1bbc7c2660203c0` | 비밀번호 `Code.js:3` |
| 교육 안내 | `1b5a1006d658804b9d6fc48f7b735490` | 교육 `Code.js:3` |
| 제품 catalog Sheet | `<SHEET_ID>` | 두 OCR `Code.js:23` |
| 거래처 갱신 master Sheet | `1-jsEDyyLkYkwYEDYkTymDJ2cUUdLuZbsdNgJEtBSXvE` | 거래처 갱신 `Code.js:1` |
| 알리고 source Sheet | `1YVJZxMRLEDBfa_BdzetXdFJXE_WR_v2V09nbkqIX7cI` | 알리고 `Code.js:229` |
| 알리고 promo/all/golf folders | `1YdALcpyYBFrO6U_X4lJpO3RBESilfKcr` / `11XY6jVo8E1ROt2U4eJW8mvpfvzvzqCmU` / `1OKlP1kOzRBEaXGh5F00x_iB9_futKIt7` | 알리고 `Index.html:652,677,722` |
| 입출고 OUT / IN folders | `1wOgLkp-CHTF3aMsP_KvLj8MK7waDBPXA` / `1BKz2j5cFafNJyW2B5rjyKQoeQqgrXKAN` | 입출고 분석 `Code.js:2-3` |
