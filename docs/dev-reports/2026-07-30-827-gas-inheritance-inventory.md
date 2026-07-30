# PR #997 / Issue #827 레거시 GAS 기능 계승 인벤토리

- 조사일: 2026-07-30
- 조사 각도: 레거시 GAS에 실제 존재하는 메뉴·기능이 현재 `services/*`·`clients/*`에 계승되었는가
- 조사 방식: 읽기 전용. `tools/legacy-gas/`의 실제 `Code.js`/`code.js`, `index.html` 및 `appsscript.json`을 열고, 현재 대응 route·page·controller·service를 파일:행으로 대조했다. `.gitignore` 대상인 `종합견적서-live`는 공유 메인 작업 디렉터리의 원본도 직접 열어 대조했다.
- OCR 기능은 이번 총계와 판정에서 제외했다.

## 총계

**조사 대상 전체 26개 = 계승 18개 · 미계승 4개 · 판정불가 4개**

> 📌 **2026-07-30 개발책임자 확정 반영** — `가입고처리`(항목 3)를 `판정불가` → **`계승`** 으로 정정했다. *"가입고는 이카운트가 아니라 우리 프로그램 입고전표(구매전표)로 처리"* 이므로 GAS 의 이카운트 실시간 전송은 계승 대상이 아니다. 정정 전 총계는 `계승 17 · 미계승 4 · 판정불가 5` 였다.

검산: **18 + 4 + 4 = 26** (일치)

`미계승` 4개 중 금액·회계축은 **1개**(`영업수수료 계산`), 나머지 3개는 금액·회계에 직접 닿지 않는다. `판정불가`에는 대응물의 일부만 확인되거나 원본과 실행 방식이 달라 동일 기능이라고 확정할 수 없는 항목을 넣었다.
이번에 추가한 `종합견적서-live`는 라이브 GAS 가격 정합의 원천이므로 **금액·회계축 예**로 판정했다.

## 판정 기준

- `계승`: 현재 코드에 원본 기능의 운영 목적을 수행하는 대응 구현이 있고, 그 구현을 파일:행으로 확인했다. 저장소 교체, REST 전환, 화면 통합 등 구현 방식의 변경은 계승으로 보되 비고에 남겼다.
- `미계승`: 대응 화면·route·controller·service를 실제로 확인한 범위에서 해당 기능의 구현을 찾지 못했다.
- `판정불가`: 유사한 일부 구현은 있으나 원본의 핵심 동작과 동일하다고 확정할 자료가 부족하다. 빈칸을 추측으로 채우지 않았다.
- 금액·회계축은 금액, 단가, 할인, 세금계산서, 전표, 원장, 회계 마감에 닿으면 `예`로 표시했다.

## 항목별 판정표

| # | 레거시 GAS 항목 / 실재 함수 인벤토리 | 원본 위치 | 현재 대응물 근거 (파일:행) | 판정 | 금액·회계축 | 판정 메모 |
|---:|---|---|---|---|---|---|
| 1 | DPS 입고기록 비교<br>`doGet`, `autoSaveToNotion`, `getHistoryFromNotion`, `getLatestHistoryFromNotion` | `tools/legacy-gas/DPS 입고기록 비교/Code.js:8,77,117,178` | `clients/desktop/src/renderer/routes/InventoryDpsComparePage.tsx:2-5,139-194`<br>`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsCompareController.java:27-39,72-79` | **계승** | 아니오 | 현재 native DPS 비교 화면과 compare/history API가 실재한다. |
| 2 | 가배차분류리스트<br>`doGet`, `getRegionFromNotion`, `runClassification` | `tools/legacy-gas/가배차분류리스트/Code.js:10,210,583` | `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:2-9,84-85,188-207`<br>`services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisAdminController.java:320-345` | **계승** | 아니오 | 권역 가배차 탭과 `/dispatches/pre-classify` 대응 endpoint가 모두 확인된다. |
| 3 | 가입고처리<br>`doGet`, `autoSaveToNotion`, `getHistoryFromNotion`, `sendToEcountAPI` | `tools/legacy-gas/가입고처리/Code.js:8,72,99,152` | 유사 대응: `clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipPage.tsx:28-30`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/PurchaseAccountingSlipController.java:18-52`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/EcountPurchaseSlipImportController.java:23-47` | **계승** | 예 | 📌 **개발책임자 확정 (2026-07-30)** — *"가입고는 이카운트가 아니라 우리 프로그램 **입고전표(구매전표)** 로 처리하는거"*. GAS 의 `sendToEcountAPI`(이카운트 실시간 전송)는 **계승 대상이 아니다** — 우리 시스템이 이카운트를 대체하므로 입고전표=구매전표 경로가 정본이다([[project_replaces_ecount_gas_was_exporter]]). 따라서 `PurchaseAccountingSlipPage`·`PurchaseAccountingSlipController` 가 그 계승 구현이며, 이전 판정(`판정불가`)은 *"이카운트 전송과 같은 경로인가"* 를 물은 것이어서 질문 자체가 잘못됐다. |
| 4 | 거래처 발송 주문서<br>`doGet`, `saveOrderSnapshot`, `sendOrderFromUi`, `saveOrderToNotion` | `tools/legacy-gas/거래처 발송 주문서/Code.js:2,105,1954,3222` | `clients/web/order-app/src/legacyShim.ts:2-18,133-145`<br>`clients/web/order-app/src/samhanApi.ts:41-63,355-364`<br>`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderConfirmController.java:24-30,45-89` | **계승** | 예 | `google.script.run` RPC를 REST로 바꾼 shim과 주문 draft/confirm 경로가 실재한다. 주문 단가·금액을 포함하므로 금액축도 표시했다. |
| 5 | 기간별 비밀번호 재설정<br>`rotatePasswordsMonthly`, `getSafeText_`, `makeRichText_` | `tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:2,89,97` | 확인된 현재 기능: `clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:56-90` (관리자 단건 재설정)<br>`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerApprovalService.java:78-82` (단건 reset) | **미계승** | 아니오 | `rotatePasswordsMonthly`와 동일한 월별 일괄 순환/5개 이력 갱신 scheduler·job은 현재 `services/*`와 route에서 확인하지 못했다. 단건 reset은 대체 근거가 되지 않는다. |
| 6 | 장기미발주 거래처 선별<br>`processLongTermUnusedClientsFast`, `getActiveBizNosFromLog_`, `getActiveBizNosFromShipping_`, `getTargetClients_` | `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:12,65,110,161,214` | `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:45-52,102-120,202-218`<br>`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:227-230`<br>`clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:2-15,56-90` | **판정불가** | 아니오 | 현재 `LONG_UNUSED` 상태와 승인 화면은 있으나, GAS는 주문/배송 활동을 기준으로 선별하고 현재 코드는 마지막 로그인·비밀번호 변경 시각을 기준으로 30일 만료를 계산한다. 같은 상태명만으로 알고리즘 계승을 확정하지 않았다. |
| 7 | 거래처 업데이트 프로그램<br>`doGet`, `startUpdateFromExcel_`, `initUploadSession_`, `startUpdateCore_`, `mergeNotionIntoMatrix_`, `parseShortDiscount_` | `tools/legacy-gas/거래처 업데이트 프로그램/Code.js:11,21,132,274,600,936`<br>`UploadModal.html:60,162,203-334` | `services/partner-service/src/main/java/com/samhanair/logis/partner/web/EcountPartnerImportController.java:23-61`<br>`services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:38-72,113-224,406-465`<br>`clients/desktop/src/renderer/routes/admin/PartnerDetailDialog.tsx:411-491` | **계승** | 예 | 원본의 Notion/Google Sheet 병합 방식은 Ecount CSV staging·partner upsert와 거래처 단가/할인 편집으로 바뀌었지만, 거래처 마스터·여신한도·할인 업데이트 대응 구현은 확인된다. |
| 8 | 거래처별 원장생성 프로그램<br>`doGet`, `getChatMapData`, `autoSaveResultToNotion`, `getHistoryFromNotion` | `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:10,73,241,281` | `clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx:4,208-209`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/LedgerController.java:22-35,65-75`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:53-72,121-145` | **계승** | 예 | 거래처별 원장 화면과 회계 ledger endpoint가 실재한다. |
| 9 | 거래처별 일괄 거래명세서 생성<br>`doGet`, `getChatMapData`, `autoSaveResultToNotion`, `getHistoryFromNotion` | `tools/legacy-gas/거래처별 일괄 거래명세서 생성/Code.js:10,74,246,286` | `clients/desktop/src/renderer/routes/StatementBatchPage.tsx:4,84-85`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:121-145` | **계승** | 예 | 현재 거래명세서 일괄 화면과 회계 보고 endpoint가 확인된다. |
| 10 | 계산서일괄등록양식 생성<br>`doGet`, `saveExceptionCodesToNotion`, `autoSaveResultToNotion`, `getHistoryFromNotion` | `tools/legacy-gas/계산서일괄등록양식 생성/Code.js:8,58,133,168` | `clients/desktop/src/renderer/routes/HometaxExportPage.tsx:4-9,192-204,1072-1073`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:150-185,198-368` | **계승** | 예 | 홈택스 일괄 양식 다운로드·preview·제외·history가 현재 페이지와 API로 계승됐다. |
| 11 | 교육안내 자동상태변경<br>`checkAndUpdateNotion` | `tools/legacy-gas/교육안내 자동상태변경/Code.js:1,19-79` | 실제 확인 범위: `clients/desktop/src/renderer/components/AppLayout.tsx:1157-1194`의 회계 메뉴 및 전체 route tree, `services/*`의 실제 controller/service 목록 | **미계승** | 아니오 | `등록마감일→신청불가`, `문자발송내역→안내문자발송 완료`를 수행하는 현재 메뉴·route·service를 확인하지 못했다. 유사한 교육/안내 설정 파일만으로 계승 처리하지 않았다. |
| 12 | 내일자 전표 이미지 생성<br>`doGet`, `getMappingData`, `getForbiddenData`, `saveHistoryToNotion` | `tools/legacy-gas/내일자 전표 이미지 생성/Code.js:11,80,122,182` | `clients/desktop/src/renderer/routes/NextDaySlipPage.tsx:4,66-67`<br>`services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java:605-625` | **계승** | 아니오 | 다음날 전표 이미지용 자체 조회 endpoint와 데스크톱 화면이 확인된다. |
| 13 | 미배차리스트<br>`doGet`, `saveHistoryToNotion`, `saveManualDataToNotion` | `tools/legacy-gas/미배차리스트/Code.js:10,157,292` | `clients/desktop/src/renderer/routes/ArologisUnassignedPage.tsx:2-11,75-76,190-252`<br>`services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisAdminController.java:349-365` | **계승** | 아니오 | 미배차 조회·CSV·수동 배차 이동 화면과 endpoint가 실재한다. |
| 14 | 배차안내문자<br>`doGet`, `processDispatchData`, `saveHistoryToNotion`, `getChatMapData`, `getForbiddenData` | `tools/legacy-gas/배차안내문자/Code.js:11,150,468,610,652` | `clients/desktop/src/renderer/routes/DispatchSmsPage.tsx:140-141,208-230,280-290,619-647`<br>`services/notification-service/src/main/java/com/samhanair/logis/notification/controller/DispatchBatchAdminController.java:25-75` | **계승** | 아니오 | 배차 문자 preview·발송·결과 통계 및 발송 audit 경로가 현재 구현돼 있다. |
| 15 | 비밀번호 일괄 암호화<br>`migratePasswordsToHash`, `hashPassword_`, `getAllAuthPages_`, `updatePasswordInNotion_` | `tools/legacy-gas/비밀번호 일괄 암호화/Code.js:6,39,46,82` | `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/config/SecurityConfig.java:24-27,62-66`<br>`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:45-52,186-187,235-237` | **판정불가** | 아니오 | 현재 BCrypt 신규 저장과 legacy SHA-256 prefix 매칭은 실재하지만, 원본의 모든 계정을 일괄 순회해 변환하는 실행 함수는 확인하지 못했다. 보안 호환을 일괄 마이그레이션 완료로 간주하지 않았다. |
| 16 | 알리고 자동 업로드<br>`doGet`, `fetchExternalData`, `uploadCsvToDrive`, `syncEcountChunk` | `tools/legacy-gas/알리고 자동 업로드/Code.js:10,181,266,426` | `clients/desktop/src/renderer/routes/admin/AligoAddressBookPage.tsx:2-19,55-78,154`<br>`services/notification-service/src/main/java/com/samhanair/logis/notification/controller/AligoAddressBookController.java:16-49` | **판정불가** | 아니오 | 메뉴·sync API·client interface는 있으나 현재 FE가 직접 `mock dryRun`이라고 표시하고, 실제 Aligo 호출이 없다고 명시한다. 운영 기능의 완전 계승으로 확정하지 않았다. |
| 17 | 영업수수료 계산<br>`doGet`, `saveHistoryToNotion`, 화면의 제경비·카드수수료·원천징수·도급비 계산 | `tools/legacy-gas/영업수수료 계산/Code.js:9,57`<br>`Index.html:102,117-158,330-352,405-413` | 부재 확인 범위: `clients/desktop/src/renderer/components/AppLayout.tsx:1157-1194` 회계 메뉴, `clients/desktop/src/renderer/routes/CompensationFailuresPage.tsx:116-117` (무관한 보상 실패 복구 화면), `services/*` 회계/비용 controller 및 FE route | **미계승** | **예** | `지출품의서 작성`의 수수료 공식과 결과 저장을 수행하는 현재 화면·service를 확인하지 못했다. `CompensationFailuresPage`는 수수료 계산 기능이 아니다. |
| 18 | 운송사-실배차내역 비교<br>`doGet`, `autoSaveToNotion`, `getManualDataFromNotion`, `getHistoryFromNotion` | `tools/legacy-gas/운송사-실배차내역 비교/Code.js:8,77,117,190` | `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx:141-165`<br>`services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/DispatchReconcileController.java:22-30,39-74`<br>`clients/arologis-desktop/src/renderer/routes/dispatches/DispatchesLayout.tsx:4-7` | **계승** | 아니오 | 운송사 실배차 비교 메뉴·화면·저장 endpoint가 아로로지스 앱으로 이전돼 있다. |
| 19 | 일마감 프로그램<br>`doGet`, `processDailyData`, `saveHistoryToNotion`, `autoSaveToNotion` | `tools/legacy-gas/일마감 프로그램/Code.js:17,420,752,989` | `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:333-341`<br>`clients/desktop/src/renderer/routes/MonthEndClosingPage.tsx:157-173,230`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/DailyClosingController.java:36-42,48-84` | **계승** | 예 | 현재 화면 주석이 legacy GAS 12번을 직접 가리키며 일마감·월마감·역마감 endpoint가 실재한다. |
| 20 | 입출고 내역<br>`doGet`, `getChartData` | `tools/legacy-gas/입출고 내역/code.js:2,10` | 부분 대응: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/StockController.java:170-193` (movement API)<br>확인한 FE 메뉴: `clients/desktop/src/renderer/components/AppLayout.tsx:1593-1616` 및 `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:208-271` | **판정불가** | 아니오 | 입출고 movement backend는 있으나, GAS의 월별 입고/출고 차트와 동일한 전용 화면·메뉴는 확인하지 못했다. backend API만으로 end-to-end 메뉴 계승을 확정하지 않았다. |
| 21 | 입출고 분석<br>`doGet`, `getDashboardData`, `processModelData` 및 수요·출고 예측 화면 | `tools/legacy-gas/입출고 분석/Code.js:5,13,161`<br>`Index.html:138,202,399,437-453` | 확인한 현재 재고 화면: `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:208-271`<br>확인한 현재 재고 메뉴: `clients/desktop/src/renderer/components/AppLayout.tsx:1593-1625` (안전재고 포함) | **미계승** | 아니오 | 현재 안전재고/재고잔량 화면은 있으나 GAS의 CSV 기반 수요예측·출고예측·재고추천 dashboard 대응 route/service는 확인하지 못했다. |
| 22 | 전표정리리스트<br>`doGet`, `saveHistoryToNotion`, `getHistoryFromNotion`, `getLatestHistoryFromNotion` | `tools/legacy-gas/전표정리리스트/Code.js:8,151,192,252` | `clients/desktop/src/renderer/routes/SlipCleanupPage.tsx:4,189-190`<br>`services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipCleanupSaveHistoryController.java:36-39,55-145`<br>`services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java:635-659` | **계승** | 아니오 | 전표 정리 조회와 history 저장·복구 API가 native 화면으로 확인된다. |
| 23 | 종합견적서<br>`doGet`, `sendOrderFromUi`, `saveOrderToNotion`, `saveQuoteSnapshot`, `getQuoteHistory`, `getQuoteHistoryByCustomer` | `tools/legacy-gas/종합견적서/Code.js:6,1762,2340,2724,2791,2879` | `clients/web/estimate-app/lib/code.js:2-12` (legacy Code.js 1:1 포팅)<br>`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/web/QuoteSnapshotController.java:22-25,41-95`<br>`clients/desktop/src/renderer/routes/EstimateListPage.tsx:75-80,279-297` | **계승** | 예 | 웹 estimate-app의 converted legacy port와 snapshot 저장/이력 API, 데스크톱 견적 관리가 모두 실재한다. |
| 24 | 지방가배차분류리스트<br>`doGet`, `saveHistoryToNotion`, `runClassification` | `tools/legacy-gas/지방가배차분류리스트/Code.js:8,70,271` | `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:2-9,188-207,452`<br>`services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisAdminController.java:370-384` | **계승** | 아니오 | `지방가배차 (시도)` 탭과 시도별 분류 endpoint가 현재 가배차 화면에 통합돼 있다. |
| 25 | 품목별 DPS 입고내역 비교<br>`doGet`, `autoSaveToNotion`, `getHistoryFromNotion`, `getLatestHistoryFromNotion` | `tools/legacy-gas/품목별 DPS 입고내역 비교/Code.js:8,77,117,156` | `clients/desktop/src/renderer/routes/warehouse/DpsByProductPage.tsx:2-4,220-251,346-468`<br>`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsCompareController.java:106-134` | **계승** | 아니오 | 품목×입고단계 pivot과 저장 history가 현재 화면·endpoint로 확인된다. |
| 26 | 종합견적서-live<br>가격·견적 원본 함수: `doGet`, `getInitialData`, 카탈로그/규격/가격 함수, `getCustomerDataAsync`, `decideWarehouseCode_`, `sendOrderFromUi`, `saveOrderToNotion`, `saveQuoteSnapshot`, `getQuoteHistory`, `getQuoteHistoryByCustomer`, 주소 검색 함수 | `tools/legacy-gas/종합견적서-live/Code.js:6,17,364,488,600,673,768,863,996,1410,1639,1762,2340,2724,2791,2879,2944,3028-3182` | `clients/web/estimate-app/lib/code.js:2,504,741-1094,1375-1376,1742-1743,2032,2239-2292,2468-2507,2801-2837`<br>`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/web/QuoteSnapshotController.java:41-95`<br>주문 전송 shim: `clients/web/order-app/src/legacyShim.ts:2-18,133-145` | **계승** | **예** | 별도 라이브 GAS 원본이지만 `종합견적서/Code.js`와 실행 로직은 동일하다. 현재 estimate-app이 라이브 함수·가격/규격 로직을 포팅했고, 주문 전송과 견적 snapshot/history는 현재 REST 서비스로 계승됐다. 라이브 자격 문자열 자체가 아니라 금액·견적 기능의 계승을 판정했다. |

### 26번 `종합견적서-live/Code.js` 함수 인벤토리

실제 원본은 **3,204행**이다. 행 시작이 `function name(`인 상위 함수 선언 **81개**를 직접 세었고, 아래에 파일:행과 함께 기능군별로 적었다. (중첩 함수·`function` 표현식은 상위 81개 수에서 제외했다.)

| 기능군 | 함수 인벤토리 (`tools/legacy-gas/종합견적서-live/Code.js:행`) |
|---|---|
| 진입·초기화·캐시·표시 유틸 | `doGet:6`, `getInitialData:17`, `cachePutJSON_:80`, `cacheGetJSON_:90`, `cacheRemoveJSON_:104`, `getGateImages:116`, `getLogoImage:144`, `normalizeSize_:187`, `findIdx_:192`, `parseKRNumber_:196`, `parseKRFloat_:202`, `toYmd_:208`, `toMmDd_:215`, `normalizeTel_:222`, `todayYMD_:229`, `_normSpec_:230`, `sanitizeKoreanParen_:233`, `trimSymbols_:241`, `sanitizeDisp_:244`, `hpFromText_:247`, `isBlockedByNote_:257`, `isSoldOutByNote_:264`, `unifyCatL_:271` |
| 홈·싱글·상업 카탈로그 및 분류 | `classifyHome_:274`, `getHomeMulti:364`, `classifySingleSetLM_:448`, `findHeaderIndex_:477`, `getSingleSets:488`, `extractRowsFromFormula_:590`, `getSingleParts:600`, `getSingleMatPrices:673`, `classifyCommercial_:684`, `getCommercialMulti:768`, `getCommercialParts:863` |
| 규격·기본값·거래처·담당자 | `getSpecMap_:945`, `getSpecDetailMap_:996`, `getHomeDefaults:1357`, `getSingleDefaults:1382`, `getCustomerDataAsync:1410`, `getCustomers_:1429`, `searchCustomerByBizOrCode:1480`, `getManagers_:1499`, `searchManagersByName_:1532`, `findManagerByNameExact_:1540` |
| Ecount·추천·창고·주문 | `getScriptCreds_:1549`, `callZoneApi:1563`, `getEcountSession:1576`, `getRecommendOduData:1610`, `decideWarehouseCode_:1639`, `formatWonDiscountLabel_:1682`, `formatPercentLabel_:1703`, `combineRemarks_:1710`, `getOldProducts_:1719`, `sendOrderFromUi:1762`, `detectHomeOrder:1970` |
| DC·인증·주문 이력·견적 이력 | `buildDefaultDcConfig_:1990`, `fetchNotionDcConfig_:2007`, `initDcConfigFromNotion:2166`, `getAllNotionDcConfigs_:2204`, `searchCustomerByBizno:2311`, `getManagersForInput:2317`, `forceAuth:2330`, `saveOrderToNotion:2340`, `getNotionHistory:2415`, `logFrontEvent:2520`, `checkUserAuth:2552`, `getInventoryTableHtml:2604`, `getInventoryTable:2709`, `include:2715`, `saveQuoteSnapshot:2724`, `getQuoteHistory:2791`, `getQuoteHistoryByCustomer:2879`, `getPriceIncData_:2944` |
| 주소 검색·응답 파싱 | `searchNaverAddress:3028`, `buildAddressRequests_:3061`, `parseJusoResponse_:3117`, `cleanBdNm_:3138`, `escapeRegex_:3150`, `stripTrailingName_:3155`, `parseNaverLocalResponse_:3164`, `parseNaverGeocodeResponse_:3182` |

상위 선언 외 이름 있는 중첩·표현식 helper도 직접 확인했다: `scan:955`, `scanHome:1026`, `scanSingle:1108`, `scanComm:1185`, `getOrigName_:1644`, `getSection_:1650`, `num:2106,2257`, `chk:2111,2260`, `sel:2116,2263`, `pushUnique:3042`, `strip:3168`, `pickBuilding:3187`.

판정 근거는 현재 포팅물의 명시적 주석과 대응 함수다. `clients/web/estimate-app/lib/code.js:504`는 라이브 `classifyHome_`를 verbatim 포팅했다고 적고, `:1375-1376`은 라이브 `getSpecDetailMap_`를, `:1742-1743`은 `getPriceIncData_`를, `:2032`는 라이브 거래처/DC 매칭을, `:2240`은 `decideWarehouseCode_`를 직접 가리킨다. `:2286-2292`, `:2471`, `:2489`, `:2507`은 주문 전송·snapshot·견적 이력 대응 함수이며, snapshot 저장/조회 REST는 `QuoteSnapshotController.java:41-95`에서 확인된다.

## 원본 대조: `종합견적서` vs `종합견적서-live`

두 `Code.js`를 `git diff --no-index`로 직접 비교했다.

| 대조 항목 | 실측 결과 |
|---|---|
| 파일 크기·행 수 | 두 파일 모두 **3,204행**. 기존 `종합견적서/Code.js` 108,616 bytes, `종합견적서-live/Code.js` 108,787 bytes. |
| diff 통계 | **13 insertions / 13 deletions** (`--numstat`). |
| diff 위치 | `Code.js:2,73,75,1553,2336,2539,2720,3016-3025`의 Notion·Ecount·Naver/Juso 자격 문자열 redaction 차이뿐이다. 실제 값은 보고서에 재기록하지 않았다. |
| 함수·가격 로직 | 함수 본문, 가격 상수, 시트명, 카탈로그/분류, 주문, 견적 snapshot/history, 주소검색 로직의 diff는 **0건**이다. |
| 프로젝트 단위 | 디렉터리는 별개 GAS 원본이다. `종합견적서-live`에는 `appsscript.json`과 `Code.js` 및 6개 HTML이 함께 있고, 기존 `종합견적서`에는 `appsscript.json`이 없다. |

결론은 “같은 기능 본문의 단순 사본”이라는 코드 diff와 “라이브 배포·자격을 가진 별도 원본 단위”라는 인벤토리 판정이 동시에 참이다. 따라서 항목 23과 실행 로직은 중복 판정하지 않되, 라이브 가격 정합의 원천인 별도 `종합견적서-live`를 원본 단위로 별도 계수하고 금액축에 포함했다.

## 직접 센 원본 범위

요약 문서의 수치를 복사하지 않고 `tools/legacy-gas/`를 재귀적으로 열어 센 결과다.

| 직접 센 대상 | 수량 | 확인 내용 |
|---|---:|---|
| `Code.js` 또는 `code.js` | **28개** | 26개 조사 대상 + OCR 2개. 중첩 폴더의 두 GAS(`기간별 비빌번호 재설정`, `장기미발주 거래처 선별`)와 `종합견적서-live`를 각각 별도 source unit으로 세었다. |
| `appsscript.json` | **27개** | `종합견적서`는 `Code.js`와 HTML은 실재하지만 manifest가 없고, `종합견적서-live`에는 manifest가 있다. 따라서 Code.js보다 1개 적다. |
| `index.html`/`Index.html` | **23개** | `종합견적서-live/index.html`까지 포함해 raw GAS 화면 파일을 직접 확인했다. |
| 행 시작 `function` 선언 | **618개** | 28개 `Code.js` 전체에서 기존과 동일한 기준으로 직접 센 수. OCR 2개가 121개, 기존 25개가 416개, `종합견적서-live`가 81개다. **121 + 416 + 81 = 618**. |
| `tools/legacy-gas/scripts/` | 별도 GAS 프로젝트 아님 | `extract-notion-dc-csv.js` Node 유틸리티이며 GAS `Code.js`/manifest가 없어 프로젝트 항목으로 세지 않았다. |

원본 후보를 저장소 전체에서도 확인했다. `clients/web/estimate-app/lib/code.js`는 파일 첫 부분이 “legacy estimate Code.js 1:1 포팅”이라고 명시한 **현재 포팅물**이고, `clients/web/order-app/src/legacyShim.ts`는 legacy RPC를 현재 REST로 바꾸는 **현재 shim**이다. 이 둘은 raw GAS 프로젝트가 아니므로 중복 집계하지 않고 현재 대응물 근거로 사용했다. 반면 `종합견적서-live`는 별도 디렉터리와 manifest를 가진 raw GAS 원본이므로 이번에 별도 집계했다.

## OCR 제외 확인

다음 2개는 실제 원본과 함수가 존재하지만 사용자 지시에 따라 총계에서 제외했다.

| 제외 원본 | 직접 확인한 함수 | 제외 근거 |
|---|---|---|
| `tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:1,1626,1865,2064,2229` | `doGet`, `parsePdfForPreview`, `parsePdfForPreviewBatch`, `sendOrderToEcount_`, `sendFromPreview` | PDF 주문서 OCR/주문 인식 기능 |
| `tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:1,2116,2552,2811` | `doGet`, `parseImageForPreview`, `sendOrderToEcount_`, `sendFromPreview` | 이미지 주문서 OCR/주문 인식 기능 |

따라서 raw source unit 28개에서 OCR 2개를 제외한 **26개를 판정표 총계에 포함**했다.

## 정정 이력

| 항목 | 이전 보고서 | 이번 실측 정정 | 정정 사유 |
|---|---:|---:|---|
| `Code.js`/`code.js` | 27개 | **28개** (+1) | `tools/legacy-gas/종합견적서-live/Code.js`를 통째로 누락했다. |
| `appsscript.json` | 26개 | **27개** (+1) | 누락된 live 원본에는 별도 `appsscript.json`이 있다. |
| 조사 대상 | 25개 | **26개** (+1) | 직접 센 원본 단위 **28개 − OCR 2개 = 26개**. |
| 판정 합계 | 16/4/5 = 25 | **17/4/5 = 26** | 추가된 live 항목을 `계승`으로 판정했다. 기존 25개 판정은 재작성하지 않았다. |
| 누락 원인 | 확인되지 않음 | **`.gitignore:196`의 ignored 디렉터리** | PR 워크트리에는 ignored 원본이 복제되지 않아 디렉터리 열거에서 빠졌고, 공유 메인 작업 디렉터리에서 직접 재확인했다. |

이번 정정은 수치 오보를 추정치로 보정한 것이 아니라, 메인 작업 디렉터리에서 `Code.js`/`code.js`와 manifest를 재귀적으로 직접 센 결과다.

## 조사 한계와 후속 우선순위

이번 산출물은 코드·메뉴·함수 존재 여부의 정찰 결과이며, 실행 환경을 올리지 않았다. Docker, Gradle, npm, 전체 테스트는 실행하지 않았다. 특히 다음은 후속 기능 검증 시 우선 확인할 항목이다.

1. **금액·회계 미계승:** `영업수수료 계산`의 제경비 8%, 카드수수료 3%, 원천징수 3.3%, 도급비 설치비 8% 계산과 지출품의서 저장.
2. **운영 자동화 미계승:** 월별 비밀번호 일괄 순환 및 교육안내 상태 자동 변경.
3. **분석 메뉴 공백:** `입출고 분석`의 수요·출고 예측 dashboard.
4. **판정불가 확정 필요:** (가입고는 개발책임자 확정으로 해소 — 입고전표=구매전표가 정본) 장기미발주의 활동일 기준 차이, legacy password batch migration 실제 실행 여부, Aligo 실 API 활성화 여부, 입출고 movement API의 전용 FE 메뉴 제공 여부.

## 변경한 파일

- `docs/dev-reports/2026-07-30-827-gas-inheritance-inventory.md` (본 정정에서 갱신)
