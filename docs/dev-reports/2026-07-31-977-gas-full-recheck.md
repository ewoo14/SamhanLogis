# Issue #977 — 나머지 GAS 원본 전문 전수 재대조

- 조사일: 2026-07-31
- 조사 범위: #997 판정표의 26개 원본 단위 중 `거래처 발송 주문서`(이미 별도 상세 대조)와 `종합견적서-live`(tracked `종합견적서`의 라이브 원본 변형)를 제외한 24개
- OCR: 사용자 지시에 따라 `에어디자이너 전용 주문서 인식`, `제이시스템 전용 주문서 인식`은 제외
- 조사 방식: 요약본을 근거로 삼지 않고 `tools/legacy-gas/` 원본 파일 전문을 직접 읽어 함수·화면·manifest 범위를 확인한 뒤, #997의 동일한 프로젝트 단위 판정 기준으로 현재 `clients/*`·`services/*` 대응물을 파일:행으로 대조했다.
- 변경 제한: 애플리케이션 소스 변경 0건, Docker·백엔드 재기동 0건, 공유 DB write 0건

## 1. 결론

24개 대상의 원본 코드는 모두 저장소에 실제 존재했고, `종합견적서` 라이브 원본도 `clasp` 인증으로 별도 확보했다. 24개 판정은 다음과 같다.

| 판정 | 건수 |
|---|---:|
| 계승 | **16** |
| 미계승 | **4** |
| 판정불가 | **4** |
| 합계 | **24** |

이번 재대조에서 가장 중요한 신규 사실은 `종합견적서-live/Code.js`가 tracked `종합견적서/Code.js`와 단순 자격 문자열 차이가 아니라는 점이다. live 원본에는 앞부분의 별도 구형 helper 블록과 `doGet` 중복 정의가 들어 있으며, 전문 기준 `3,577행`이다. 기존 tracked 사본은 `3,204행`이다. 따라서 기존 재다운로드 요약과 #997의 “라이브와 tracked 사본은 자격 문자열만 다르다”는 설명을 이번 판정의 근거로 재사용하지 않았다.

## 2. 판정 기준과 범위 산정

#997의 기준을 그대로 적용했다.

- **계승**: 원본의 운영 목적을 수행하는 현재 화면·route·controller·service가 있고, 양쪽 근거를 파일:행으로 확인한 경우
- **미계승**: 원본 핵심 동작에 대응하는 현재 구현을 확인하지 못한 경우
- **판정불가**: 유사 구현은 있으나 원본의 핵심 알고리즘·일괄 처리·실운영 활성 여부가 같다고 확정할 수 없는 경우
- **금액·회계축**: 금액·단가·할인·세금·전표·원장·회계 마감에 직접 닿으면 `예`

이번 이슈의 “24개”는 #997 판정표의 26개 행에서 이미 상세 대조한 `거래처 발송 주문서`와 별도 라이브 원본 단위인 `종합견적서-live`를 제외한 24개다. `종합견적서`는 논리 프로젝트로 24개 표에 포함하며, live 전문 확보 내용은 §5에서 별도로 다룬다. OCR 두 프로젝트는 애초 #997 총계에서 제외했고 이번에도 제외했다.

## 3. 원본 전문 확보 실측

아래 행 수는 요약 보고서에서 복사하지 않고 각 파일을 직접 읽어 계산했다. `Code.js`/`code.js`, HTML, `appsscript.json`이 실제 있는 경우를 모두 표시했다. `SHA-256 앞 16자리`는 원본 파일 식별용이며 자격 문자열 자체를 기록하지 않는다.

| # | 프로젝트 | 확보 여부·원본 위치 | 전문 파일 범위(행) | Code.js SHA-256 앞 16자리 |
|---:|---|---|---|---|
| 1 | DPS 입고기록 비교 | 확보 — `tools/legacy-gas/DPS 입고기록 비교/` | `appsscript.json:1-10` · `Code.js:1-209` · `Index.html:1-947` | `C2FE3D28E0670A79` |
| 2 | 가배차분류리스트 | 확보 — `tools/legacy-gas/가배차분류리스트/` | `appsscript.json:1-10` · `Code.js:1-631` · `Index.html:1-1285` | `D894960F10421DBF` |
| 3 | 가입고처리 | 확보 — `tools/legacy-gas/가입고처리/` | `appsscript.json:1-10` · `Code.js:1-177` · `Index.html:1-1020` | `0220A8B5B703A7C4` |
| 4 | 기간별 비밀번호 재설정 | 확보 — `tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/` | `appsscript.json:1-7` · `Code.js:1-102` | `11DBC30C849FA0AB` |
| 5 | 장기미발주 거래처 선별 | 확보 — `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/` | `appsscript.json:1-7` · `Code.js:1-232` | `CE1D4C490705F857` |
| 6 | 거래처 업데이트 프로그램 | 확보 — `tools/legacy-gas/거래처 업데이트 프로그램/` | `appsscript.json:1-18` · `Code.js:1-964` · `UploadModal.html:1-447` | `B1963C4859D53890` |
| 7 | 거래처별 원장생성 프로그램 | 확보 — `tools/legacy-gas/거래처별 원장생성 프로그램/` | `appsscript.json:1-10` · `Code.js:1-374` · `Index.html:1-1608` | `1E2DC3E4B1E6642B` |
| 8 | 거래처별 일괄 거래명세서 생성 | 확보 — `tools/legacy-gas/거래처별 일괄 거래명세서 생성/` | `appsscript.json:1-10` · `Code.js:1-379` · `Index.html:1-1764` · `logo.html:1-3` · `stamp.html:1-3` | `BC04A13A116BD619` |
| 9 | 계산서일괄등록양식 생성 | 확보 — `tools/legacy-gas/계산서일괄등록양식 생성/` | `appsscript.json:1-10` · `Code.js:1-250` · `Index.html:1-1150` | `2572DBFA79DDF5D3` |
| 10 | 교육안내 자동상태변경 | 확보 — `tools/legacy-gas/교육안내 자동상태변경/` | `appsscript.json:1-7` · `Code.js:1-100` | `297D0961605F34A1` |
| 11 | 내일자 전표 이미지 생성 | 확보 — `tools/legacy-gas/내일자 전표 이미지 생성/` | `appsscript.json:1-10` · `Code.js:1-358` · `Index.html:1-1768` · `Logo.html:1-3` | `450A0EFF7C1DE521` |
| 12 | 미배차리스트 | 확보 — `tools/legacy-gas/미배차리스트/` | `appsscript.json:1-10` · `Code.js:1-334` · `Index.html:1-1300` | `1B8EB5B033802B6F` |
| 13 | 배차안내문자 | 확보 — `tools/legacy-gas/배차안내문자/` | `appsscript.json:1-10` · `Code.js:1-689` · `Index.html:1-1560` | `B6D44D4A46437E01` |
| 14 | 비밀번호 일괄 암호화 | 확보 — `tools/legacy-gas/비밀번호 일괄 암호화/` | `appsscript.json:1-7` · `Code.js:1-100` | `17BC1B12F0F2A362` |
| 15 | 알리고 자동 업로드 | 확보 — `tools/legacy-gas/알리고 자동 업로드/` | `appsscript.json:1-10` · `Code.js:1-511` · `Index.html:1-1005` | `005EB0CF6539ED15` |
| 16 | 영업수수료 계산 | 확보 — `tools/legacy-gas/영업수수료 계산/` | `appsscript.json:1-10` · `Code.js:1-179` · `Index.html:1-558` | `149CC302ACC93AA5` |
| 17 | 운송사-실배차내역 비교 | 확보 — `tools/legacy-gas/운송사-실배차내역 비교/` | `appsscript.json:1-10` · `Code.js:1-309` · `Index.html:1-962` | `716D2D4D84B45B67` |
| 18 | 일마감 프로그램 | 확보 — `tools/legacy-gas/일마감 프로그램/` | `appsscript.json:1-10` · `Code.js:1-1034` · `Index.html:1-1948` | `248880A901D3A6D3` |
| 19 | 입출고 내역 | 확보 — `tools/legacy-gas/입출고 내역/` | `appsscript.json:1-18` · `code.js:1-86` · `index.html:1-481` | `17B42B8630F8C9A8` |
| 20 | 입출고 분석 | 확보 — `tools/legacy-gas/입출고 분석/` | `appsscript.json:1-23` · `Code.js:1-232` · `Index.html:1-507` | `2A9DB1582D25324B` |
| 21 | 전표정리리스트 | 확보 — `tools/legacy-gas/전표정리리스트/` | `appsscript.json:1-10` · `Code.js:1-285` · `Index.html:1-1375` | `98C7A3A5EC649FD7` |
| 22 | 종합견적서 | 확보 — tracked `tools/legacy-gas/종합견적서/` 및 live `tools/legacy-gas/종합견적서-live/` | tracked `Code.js:1-3204`, `index.html:1-19183`, 폰트 HTML 전문; live `appsscript.json:1-18`, `Code.js:1-3577`, `index.html:1-19237`, 나머지 HTML 전문 | live `B0F6D2F934C222E6` |
| 23 | 지방가배차분류리스트 | 확보 — `tools/legacy-gas/지방가배차분류리스트/` | `appsscript.json:1-10` · `Code.js:1-354` · `Index.html:1-1400` | `69517925D1229C31` |
| 24 | 품목별 DPS 입고내역 비교 | 확보 — `tools/legacy-gas/품목별 DPS 입고내역 비교/` | `appsscript.json:1-10` · `Code.js:1-187` · `Index.html:1-1001` | `ACC65DC1DA323976` |

## 4. 24개 프로젝트별 전수 대조·판정표

| # | 레거시 GAS 항목 / 전문에서 확인한 핵심 | 원본 전문 근거(파일:행) | 현재 대응물 근거(파일:행) | 대조 결과·계승 판정 | 금액·회계축 |
|---:|---|---|---|---|---|
| 1 | DPS 입고기록 비교 — `doGet`, Notion 자동 저장, history 조회 | `tools/legacy-gas/DPS 입고기록 비교/Code.js:8,77,117,178` | `clients/desktop/src/renderer/routes/InventoryDpsComparePage.tsx:2-5,139-194`<br>`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsCompareController.java:27-39,72-79` | DPS 비교 화면과 비교/history API가 현재 존재한다. **계승** | 아니오 |
| 2 | 가배차분류리스트 — `doGet`, 권역 조회, `runClassification` | `tools/legacy-gas/가배차분류리스트/Code.js:10,210,583` | `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:2-9,84-85,188-207`<br>`services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisAdminController.java:320-345` | 권역 가배차 탭과 대응 endpoint가 확인된다. **계승** | 아니오 |
| 3 | 가입고처리 — 자동 저장·history·`sendToEcountAPI` | `tools/legacy-gas/가입고처리/Code.js:8,72,99,152` | `clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipPage.tsx:28-30`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/PurchaseAccountingSlipController.java:18-52`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/EcountPurchaseSlipImportController.java:23-47` | 가입고의 정본을 우리 입고전표(구매전표)로 보는 #997 결정 기준을 적용했다. 이카운트 전송이 아니라 구매전표 경로가 대응물이다. **계승** | 예 |
| 4 | 기간별 비밀번호 재설정 — 월별 `rotatePasswordsMonthly`, 안전 문자열·5개 이력 갱신 | `tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:2,89,97` | `clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:56-90`<br>`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerApprovalService.java:78-82` | 현재 확인된 것은 관리자 단건 reset뿐이다. 월별 일괄 순환 scheduler/job은 확인하지 못했다. **미계승** | 아니오 |
| 5 | 장기미발주 거래처 선별 — 주문·배송 활동 기반 `processLongTermUnusedClientsFast` | `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:12,65,110,161,214` | `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:45-52,102-120,202-218`<br>`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:227-230`<br>`clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:2-15,56-90` | `LONG_UNUSED` 상태와 현재 승인 화면은 있으나, GAS의 주문·배송 활동 기준과 현재 로그인·비밀번호 변경 기준이 다르다. 같은 상태명만으로 확정하지 않았다. **판정불가** | 아니오 |
| 6 | 거래처 업데이트 프로그램 — Excel upload, upload session, Notion 병합, 할인 파싱 | `tools/legacy-gas/거래처 업데이트 프로그램/Code.js:11,21,132,274,600,936`<br>`tools/legacy-gas/거래처 업데이트 프로그램/UploadModal.html:60,162,203-334` | `services/partner-service/src/main/java/com/samhanair/logis/partner/web/EcountPartnerImportController.java:23-61`<br>`services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:38-72,113-224,406-465`<br>`clients/desktop/src/renderer/routes/admin/PartnerDetailDialog.tsx:411-491` | 입력 방식은 Ecount CSV로 바뀌었지만 거래처 master·여신한도·할인 업데이트 목적의 대응 구현이 있다. **계승** | 예 |
| 7 | 거래처별 원장생성 프로그램 — 거래처별 채팅 맵·원장 저장·history | `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:10,73,241,281` | `clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx:4,208-209`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/LedgerController.java:22-35,65-75`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:53-72,121-145` | 거래처별 원장 화면과 회계 ledger endpoint가 확인된다. **계승** | 예 |
| 8 | 거래처별 일괄 거래명세서 생성 — 거래명세서 batch·저장·history | `tools/legacy-gas/거래처별 일괄 거래명세서 생성/Code.js:10,74,246,286` | `clients/desktop/src/renderer/routes/StatementBatchPage.tsx:4,84-85`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:121-145` | 거래명세서 일괄 화면과 회계 보고 endpoint가 확인된다. **계승** | 예 |
| 9 | 계산서일괄등록양식 생성 — 예외 코드·일괄 양식·저장·history | `tools/legacy-gas/계산서일괄등록양식 생성/Code.js:8,58,133,168` | `clients/desktop/src/renderer/routes/HometaxExportPage.tsx:4-9,192-204,1072-1073`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:150-185,198-368` | 홈택스 일괄 양식 download/preview/exclude/history가 대응된다. **계승** | 예 |
| 10 | 교육안내 자동상태변경 — `checkAndUpdateNotion`, 등록마감일·문자발송내역 상태 변경 | `tools/legacy-gas/교육안내 자동상태변경/Code.js:1,19-79` | 부재 확인 범위: `clients/desktop/src/renderer/components/AppLayout.tsx:1157-1194` 및 전체 route tree, `services/*`의 실제 controller/service 목록 | 원본의 자동 상태 변경을 수행하는 현재 메뉴·route·service를 확인하지 못했다. **미계승** | 아니오 |
| 11 | 내일자 전표 이미지 생성 — mapping·금지 데이터·history | `tools/legacy-gas/내일자 전표 이미지 생성/Code.js:11,80,122,182` | `clients/desktop/src/renderer/routes/NextDaySlipPage.tsx:4,66-67`<br>`services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java:605-625` | 다음날 전표 이미지용 조회 endpoint와 화면이 확인된다. **계승** | 아니오 |
| 12 | 미배차리스트 — history·수동 데이터 저장 | `tools/legacy-gas/미배차리스트/Code.js:10,157,292` | `clients/desktop/src/renderer/routes/ArologisUnassignedPage.tsx:2-11,75-76,190-252`<br>`services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisAdminController.java:349-365` | 미배차 조회·CSV·수동 배차 이동 화면과 endpoint가 확인된다. **계승** | 아니오 |
| 13 | 배차안내문자 — 배차 데이터 처리·history·금지 데이터·chat map | `tools/legacy-gas/배차안내문자/Code.js:11,150,468,610,652` | `clients/desktop/src/renderer/routes/DispatchSmsPage.tsx:140-141,208-230,280-290,619-647`<br>`services/notification-service/src/main/java/com/samhanair/logis/notification/controller/DispatchBatchAdminController.java:25-75` | 문자 preview·발송·결과 통계·audit 경로가 확인된다. **계승** | 아니오 |
| 14 | 비밀번호 일괄 암호화 — 전체 계정 순회·hash 변환 | `tools/legacy-gas/비밀번호 일괄 암호화/Code.js:6,39,46,82` | `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/config/SecurityConfig.java:24-27,62-66`<br>`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:45-52,186-187,235-237` | BCrypt 신규 저장과 legacy SHA-256 prefix 호환은 있으나, GAS처럼 모든 계정을 일괄 변환하는 실행 함수는 확인하지 못했다. **판정불가** | 아니오 |
| 15 | 알리고 자동 업로드 — 외부 조회·Drive upload·Ecount chunk sync | `tools/legacy-gas/알리고 자동 업로드/Code.js:10,181,266,426` | `clients/desktop/src/renderer/routes/admin/AligoAddressBookPage.tsx:2-19,55-78,154`<br>`services/notification-service/src/main/java/com/samhanair/logis/notification/controller/AligoAddressBookController.java:16-49` | 메뉴·sync API는 있으나 FE가 `mock dryRun`으로 표시하고 실제 Aligo 호출이 없다. **판정불가** | 아니오 |
| 16 | 영업수수료 계산 — 제경비·카드수수료·원천징수·도급비 계산과 저장 | `tools/legacy-gas/영업수수료 계산/Code.js:9,57`<br>`tools/legacy-gas/영업수수료 계산/Index.html:102,117-158,330-352,405-413` | 부재 확인 범위: `clients/desktop/src/renderer/components/AppLayout.tsx:1157-1194` 회계 메뉴, `clients/desktop/src/renderer/routes/CompensationFailuresPage.tsx:116-117`, `services/*` 회계·비용 controller 및 FE route | 일반 지출품의서 금액 입력은 있으나 원본 수수료 공식과 결과 저장을 수행하는 대응 기능은 확인하지 못했다. `CompensationFailuresPage`는 무관한 보상 실패 복구 화면이다. **미계승** | 예 |
| 17 | 운송사-실배차내역 비교 — 수동 배차·history 비교 | `tools/legacy-gas/운송사-실배차내역 비교/Code.js:8,77,117,190` | `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx:141-165`<br>`services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/DispatchReconcileController.java:22-30,39-74`<br>`clients/arologis-desktop/src/renderer/routes/dispatches/DispatchesLayout.tsx:4-7` | 운송사 실배차 비교 화면·저장 endpoint가 아로로지스 앱으로 이전됐다. **계승** | 아니오 |
| 18 | 일마감 프로그램 — 일마감 처리·history·자동 저장 | `tools/legacy-gas/일마감 프로그램/Code.js:17,420,752,989` | `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:333-341`<br>`clients/desktop/src/renderer/routes/MonthEndClosingPage.tsx:157-173,230`<br>`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/DailyClosingController.java:36-42,48-84` | 일마감·월마감·역마감 경로가 확인된다. 단가 재계산/표시 기준의 상세 차이는 #773·#991 별도 범위이며, 이 표의 계승 판정과 합치지 않았다. **계승** | 예 |
| 19 | 입출고 내역 — `doGet`, 월별 `getChartData` | `tools/legacy-gas/입출고 내역/code.js:2,10` | 부분 대응: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/StockController.java:170-193`<br>`clients/desktop/src/renderer/components/AppLayout.tsx:1593-1616`<br>`clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:208-271` | movement backend는 있으나 GAS 월별 입고·출고 차트와 같은 전용 FE 메뉴는 확인하지 못했다. **판정불가** | 아니오 |
| 20 | 입출고 분석 — dashboard·`getDashboardData`·수요/출고 예측 | `tools/legacy-gas/입출고 분석/Code.js:5,13,161`<br>`tools/legacy-gas/입출고 분석/Index.html:138,202,399,437-453` | 확인 범위: `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:208-271`<br>`clients/desktop/src/renderer/components/AppLayout.tsx:1593-1625` | 안전재고·재고잔량은 있으나 CSV 기반 수요예측·출고예측·재고추천 dashboard 대응 route/service는 확인하지 못했다. **미계승** | 아니오 |
| 21 | 전표정리리스트 — history 저장·복구·최신 history | `tools/legacy-gas/전표정리리스트/Code.js:8,151,192,252` | `clients/desktop/src/renderer/routes/SlipCleanupPage.tsx:4,189-190`<br>`services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipCleanupSaveHistoryController.java:36-39,55-145`<br>`services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java:635-659` | 전표 정리 조회와 history 저장·복구 API가 native 화면으로 확인된다. **계승** | 아니오 |
| 22 | 종합견적서 — live의 구형 helper + 견적·가격·주문·snapshot/history 전문 | `tools/legacy-gas/종합견적서-live/Code.js:10,18,73,115,143,171,199,227,233,241,281,320,343,379,390,737,861,1046,1141,1236,1318,1369,1783,2012,2135,2713,3097,3164,3252,3317,3401,3555`<br>tracked 대조본: `tools/legacy-gas/종합견적서/Code.js:6,17,364,488,600,673,768,863,996,1410,1639,1762,2340,2724,2791,2879` | `clients/web/estimate-app/lib/code.js:2-12,504,741-1094,1375-1376,1742-1743,2032,2239-2292,2468-2507,2801-2837`<br>`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/web/QuoteSnapshotController.java:41-95`<br>`clients/web/order-app/src/legacyShim.ts:2-18,133-145` | 핵심 견적·가격·주문·snapshot/history 목적은 현재 포팅·REST로 대응된다. 다만 live 전문 앞부분의 `getFilterWordsFromNotion`, `getClientCodesFromNotion` 등 12개 구형 helper는 현재 대응물에서 같은 이름·동작을 확인하지 못했고, live `doGet`도 `:10`과 `:379`에 중복 정의된다. 이 잔여는 별도 parity gap으로 기록하되, #997의 프로젝트 목적 기준 판정은 **계승(핵심 기능)** 으로 유지한다. | 예 |
| 23 | 지방가배차분류리스트 — 지방 분류·history | `tools/legacy-gas/지방가배차분류리스트/Code.js:8,70,271` | `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:2-9,188-207,452`<br>`services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisAdminController.java:370-384` | `지방가배차 (시도)` 탭과 시도별 분류 endpoint가 가배차 화면에 통합됐다. **계승** | 아니오 |
| 24 | 품목별 DPS 입고내역 비교 — 품목×입고 단계 pivot·history | `tools/legacy-gas/품목별 DPS 입고내역 비교/Code.js:8,77,117,156` | `clients/desktop/src/renderer/routes/warehouse/DpsByProductPage.tsx:2-4,220-251,346-468`<br>`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsCompareController.java:106-134` | 품목×입고단계 pivot과 저장 history가 현재 화면·endpoint로 확인된다. **계승** | 아니오 |

## 5. 종합견적서 원본 확보 및 별도 대조

### 5.1 확보 결과

- 저장소 tracked 사본 `tools/legacy-gas/종합견적서/`는 이미 존재하지만 `appsscript.json`이 없고, `Code.js`는 3,204행의 자격 마스킹 사본이다.
- 사용자 인증이 실제로 가능해 `clasp list`로 GAS 프로젝트 목록을 확인했고, `clasp clone`으로 `종합견적서` live 원본 8개 파일을 임시 경로에 받은 뒤 저장소 관례인 `tools/legacy-gas/종합견적서-live/`에 로컬 보관했다.
- live 원본 파일: `appsscript.json`, `Code.js`, `index.html`, `logo.html`, `NanumGothic.html`, `NanumGothicBold.html`, `samhan.html`, `stamp.html`.
- live 원본은 `Code.js:1-3577`, `index.html:1-19237`이며, 폰트 두 파일은 각각 약 6.2MB다. 기존 `File too large for export`는 `script+json` 단일 export 경로의 제약이었고, `clasp clone` 경로에서는 확보됐다.

### 5.2 전문에서 새로 확인한 내용

live `Code.js`는 다음 구조다.

1. `:10`의 첫 `doGet`과 `:18-372`의 구형 helper 블록
   - `getUserAuth:18`
   - `getChatMapData:73`
   - `saveFilterWordsToNotion:115`, `getFilterWordsFromNotion:143`
   - `saveClientCodesToNotion:171`, `getClientCodesFromNotion:199`
   - `compressString:227`, `decompressString:233`
   - `autoSaveResultToNotion:241`, `getHistoryFromNotion:281`, `getSpecificHistory:320`, `getLatestHistoryFromNotion:343`
2. `:379`의 두 번째 `doGet`부터 현재 견적·가격·주문·주소검색 블록
   - `getInitialData:390`, 카탈로그·규격·가격 함수 `:737-1369`
   - 거래처·창고·주문 `:1783-2135`
   - snapshot/history `saveQuoteSnapshot:3097`, `getQuoteHistory:3164`, `getQuoteHistoryByCustomer:3252`
   - 주소 검색 `searchNaverAddress:3401`, `parseNaverGeocodeResponse_:3555`

HTML 전문에서 위 구형 helper를 직접 호출하는 문자열은 확인하지 못했고, 현재 estimate-app에는 핵심 견적 로직과 REST snapshot/history가 있다. 다만 실행 환경을 올리지 않았으므로 첫 번째 `doGet`이 실제 배포 경로에서 도달 불가능하다고 단정하지 않는다. 이 부분은 **구형 helper 12개와 중복 entrypoint에 대한 후속 parity 조사 항목**이다.

### 5.3 보안 보관

`tools/legacy-gas/종합견적서-live/`는 기존 `.gitignore` 규칙(`.gitignore:195-197`)에 따라 로컬에만 보관한다. live 파일에는 평문 외부 자격이 포함될 수 있으므로 공개 저장소에 force-add하지 않는다. 보고서에는 자격값·스크립트 ID를 기록하지 않았다.

## 6. 블로커 목록

| 항목 | 상태 | 영향 |
|---|---|---|
| 24개 코드 원본 확보 | **블로커 없음** | 24개 모두 로컬 전문이 실제 존재한다. |
| `종합견적서` live 원본 확보 | **해소** | `clasp` 인증과 clone으로 8개 파일을 확보했다. |
| live 원본의 공개·추적 보관 | **보안 블로커** | 평문 자격 때문에 `종합견적서-live`는 ignored 로컬 보관만 가능하다. force-add 금지다. |
| Notion·Sheet·외부 API의 실행 데이터까지 재현 | **이번 정적 대조의 범위 밖** | 원본 코드 판정은 완료했지만, 실제 외부 데이터와 실행 도달성은 별도 라이브 QA/격리 데이터가 필요하다. |
| OCR 두 프로젝트 | **사용자 지시로 제외** | `에어디자이너 전용 주문서 인식`, `제이시스템 전용 주문서 인식`은 이번 판정에 포함하지 않았다. |

## 7. 산출물과 신규 파일 목록

### 추적 대상 보고서

- `docs/dev-reports/2026-07-31-977-gas-full-recheck.md` — 본 보고서

### 로컬 ignored 원본 보관

다음 8개는 `clasp`로 확보한 `종합견적서` live 원본이며, `tools/legacy-gas/종합견적서-live/` 관례 경로에 보관했다. 평문 자격 포함 가능성 때문에 기본 `git status --porcelain`에는 나타나지 않는다.

- `tools/legacy-gas/종합견적서-live/appsscript.json`
- `tools/legacy-gas/종합견적서-live/Code.js`
- `tools/legacy-gas/종합견적서-live/index.html`
- `tools/legacy-gas/종합견적서-live/logo.html`
- `tools/legacy-gas/종합견적서-live/NanumGothic.html`
- `tools/legacy-gas/종합견적서-live/NanumGothicBold.html`
- `tools/legacy-gas/종합견적서-live/samhan.html`
- `tools/legacy-gas/종합견적서-live/stamp.html`

## 8. `git status --porcelain` 원문

```text
?? docs/dev-reports/2026-07-31-977-gas-full-recheck.md
```
