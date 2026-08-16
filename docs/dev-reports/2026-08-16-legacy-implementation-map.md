```text
cwd   C:/dev/Samhan-Public   (main, 읽기 전용)
HEAD  8c35967af1b459290689cf19a11155eec9b186f0
```

# 레거시 GAS 프로그램 현행 구현 실측 지도 (2026-08-16)

## 조사 기준

- 프로그램 모집단은 기존 보고서가 아니라 `tools/legacy-gas/` 아래 실제 `Code.js`/`code.js`가 있는 디렉터리로 다시 셌다. 결과는 **27개**다.
- 조사 시작 시 HEAD는 `f6e9e132458f54e09d65cd53b688bd959b88a48b`였고, 외부 작업이 같은 공유 `main`에 반영되어 최종 검증 시 위의 `8c35967...`로 이동했다. 이 세션은 Git 상태를 바꾸지 않았다. 중간 변경 파일을 직접 대조했으며 이 지도에 쓰인 route/API/entity 계약 변경은 없었다.
- 도달성은 파일 존재가 아니라 **메뉴 또는 앱 진입점 → route → 권한 guard → 화면 → API**가 이어지는지로 판정했다. 공통 동적 메뉴는 `clients/desktop/src/renderer/components/AppLayout.tsx:379-389,816-827`, 메뉴별 권한은 `services/auth-service/src/main/java/com/samhanair/logis/auth/menu/MenuCatalog.java:8-115`, route 권한은 `clients/desktop/src/renderer/routes/index.tsx`의 각 행에 근거한다.
- 실데이터는 실행 중인 `samhan-postgres`의 서비스별 DB를 매 조회마다 `BEGIN; SET TRANSACTION READ ONLY; ...; ROLLBACK;`으로 조회했다. 제품 코드 수정·재배포·DB write는 하지 않았다.
- **데이터 흔적 0**은 “입력 원천도 0”이라는 뜻이 아니다. 기능 전용 저장/이력 행이 0이거나, 조회·파일 생성 기능이라 전용 저장 테이블 자체가 없는 경우다. 뒤의 `원천` 수를 함께 읽어야 한다.
- 외부 웹 도달성은 2026-08-16 KST에 `order.samhan-air.com`, `quote.samhan-air.com`, `estimate.samhan-air.com`을 직접 HTTPS probe했다. 세 주소 모두 인증서 이름 불일치로 응답을 받지 못했다. 동일 현상은 OPEN #1240에도 기록돼 있다.

## 요약

| 항목 | 실측 |
|---|---:|
| 실제 GAS 프로그램 | **27** |
| 도달 | **18** |
| 부분 도달 | **5** |
| 코드만 있음 | **1** |
| 없음 | **3** |
| 기능 전용 데이터 흔적 0 | **14** |
| 2026-08-15 조사와 프로그램 단위로 어긋남 | **5** |

`도달`은 현재 사용자 경로와 API가 이어진다는 뜻이지 레거시 표시·계산 규칙의 완전 파리티를 뜻하지 않는다. CLOSED 이슈도 현재 코드를 대체하지 않는다. 실제 예로 #1016은 CLOSED지만 현행 알리고 client는 여전히 외부 미전달 mock이고, 실연결 후속 #1098은 OPEN이다.

## 프로그램별 구현 지도

### 1–7

| # | 프로그램 · 레거시 위치 | 현행 화면과 사용자가 도달하는 길 | API · 서비스 · DB | 도달성 | 실제 데이터 흔적 | 레거시 원천 생존 여부 · 결정/이슈 · 기존 조사 차이 |
|---:|---|---|---|---|---|---|
| 1 | DPS 입고기록 비교 — `tools/legacy-gas/DPS 입고기록 비교/Code.js:8` | 구매 → DPS 입고 비교 → `/warehouse/dps-compare`; 메뉴 `MenuCatalog.java:28`, route/guard `routes/index.tsx:1809-1815` | `POST /warehouse/audit/dps-compare`, `GET /warehouse/audit/dps-compare/template` (`dpsCompareApi.ts:8-11`), 저장 이력 `/warehouse/audit/dps-history` (`dpsSaveHistoryApi.ts:57-62`); inventory-service, `inventory_db.dps_save_history` (`DpsSaveHistory.java:30`) | **도달** | 이력 **0**. 비교 입력인 DPS XLSX는 사용자 업로드이고 내부 출고전표와 대조한다. | Notion 저장은 DB로 종료됐고 DPS XLSX만 의도된 외부 입력으로 생존. #1011 CLOSED, #1237 OPEN. 기존 조사 판정과 같음. |
| 2 | 가배차분류리스트 — `tools/legacy-gas/가배차분류리스트/Code.js:10` | 배차 → 가배차리스트 → `/arologis/pre-classify`; 메뉴 `MenuCatalog.java:95`, route `routes/index.tsx:1112-1120` | `GET /admin/dispatches/pre-classify`, `GET /admin/arologis/dispatches/regional` (`arologisDispatchApi.ts:14-17`); arlogis-service, `arologis_db.dispatches` (`Dispatch.java:29`), `region_dispatch_classifications` (`RegionDispatchClassification.java:31`), `dispatch_save_history` (`DispatchSaveHistory.java:29`) | **도달** | dispatch **26**, 권역분류 **20**, PRE_CLASSIFY 활성 이력 **1** | 배차 원천은 외부 파일이 아니라 자체 출고전표/배차 DB. `DECISIONS.md:1001`, #1039 CLOSED. 기존 조사 판정과 같음. |
| 3 | 가입고처리 — `tools/legacy-gas/가입고처리/Code.js:8` | 구매 → 구매관리 `/purchases` → 신규 구매전표 `/purchases/new` → “가입고 엑셀” 버튼 → `/purchases/new/inbound-xlsx`; 메뉴 `MenuCatalog.java:24`, routes `routes/index.tsx:598-631`, 버튼 `SlipFormPage.tsx:2147-2148` | `POST /warehouse/inbound-xlsx/preview` (`inboundXlsxApi.ts:33`, `InboundXlsxPreviewController.java:17-31`) 후 slip 생성 (`InboundXlsxPreviewPage.tsx:34,89`); inventory-service + slip-service, `slip_db.slips/slip_lines` (`Slip.java:61`) | **도달** | `source_type=INBOUND_XLSX` 활성/전체 **1/1**, inbound inspection 활성/전체 **1/2** | XLSX 업로드만 입력으로 생존하고 결과는 자체 구매전표 DB. #1011 CLOSED. **Δ1:** 기존 조사 `부분대체·XLSX 미구현`(`2026-08-15...:41-47,133-142`)은 현재 코드/DB와 다름. |
| 4 | 거래처 발송 주문서 — `tools/legacy-gas/거래처 발송 주문서/Code.js:2` | 데스크톱 판매 → 주문서 관리 `/sales/partner-orders` (`MenuCatalog.java:11`, `routes/index.tsx:511-531`); 모바일 주문 WebView는 `legacyOrderSource.ts:20-31`. 데스크톱 외부 주문서 버튼도 있으나 URL env 의존 (`AppLayout.tsx:830-838`, `SalesExternalLink.tsx:24-41`) | partner-order-service 주문/초안 API와 `partner_order_db.partner_orders`, `partner_order_drafts`, `partner_order_history` (`PartnerOrder.java:38`, `PartnerOrderDraft.java:28`, `PartnerOrderHistory.java:31`). bootstrap은 product DB 우선, Google Sheet cache/seed fallback (`BootstrapService.java:185-221`), Google Sheets 직접 client (`GoogleSheetsClient.java:31-45`) | **부분 도달** | 활성/전체 주문 **4/2025**, 초안 **11/2005**, 이력 **5988**, revision **2163** | 주문 데이터 정본은 DB지만 카탈로그 Google Sheet fallback은 살아 있음. 공개 WebView URL은 현 probe에서 TLS 실패(#1240 OPEN). #1015 CLOSED. **Δ2:** 기존 27개 표에서 아예 제외(`2026-08-15...:8`). |
| 5 | 기간별 비밀번호 재설정 — `tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:2` | 판매 → 주문서 승인 `/sales/order-approvals`; 메뉴 `MenuCatalog.java:12`, route `routes/index.tsx:533-541`. 화면에서 대상 미리보기·개별 초기화 (`SalesOrderApprovalsPage.tsx:85,271-294`) | `GET /admin/partner-approvals/access-preview[/report]`, `POST /{partnerCode}/reset-password` (`PartnerApprovalsController.java:72-100`); partner-auth-service, `partner_auth_db.partner_auth` (`PartnerAuth.java:44`) | **부분 도달** | 월별 일괄 실행 이력 테이블/스케줄러 **없음**. 현재 auth **2**, login attempt **170** | DB만 사용. 레거시 월별 batch 대신 화면의 수동 초기화이며, 30일 만료는 로그인/상태 조회 시 평가 (`PartnerAuthService.java:103-125,207-223`). #1015 CLOSED. **Δ3:** 기존 27개 표에서 누락. |
| 6 | 장기미발주 거래처 선별 — `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:12` | 판매 → 주문서 승인 `/sales/order-approvals`; 30일 기준과 현재 후보를 화면 표시 (`SalesOrderApprovalsPage.tsx:248,271-294`) | 같은 access-preview API (`PartnerApprovalsController.java:72-85`), 주문·출고 활동 계산 (`PartnerApprovalService.java:68-111`); partner-auth-service + partner-order/slip read, `partner_auth_db.partner_auth` | **부분 도달** | 현재 LONG_UNUSED **1**, NEED_PW_INPUT **1**. 별도 주기 선별 job은 없음. | 외부 시트 없이 DB 주문·출고·인증 시각 사용. #1015 CLOSED. **Δ4:** 기존 27개 표에서 누락. |
| 7 | 거래처 업데이트 프로그램 — `tools/legacy-gas/거래처 업데이트 프로그램/Code.js:11` | 판매 → 거래처 관리 `/admin/partners` → 이카운트 XLSX/CSV 가져오기; 메뉴 `MenuCatalog.java:13`, route `routes/index.tsx:1488-1492`, 화면 `PartnersPage.tsx:122-139,401-414,498-506` | `POST /admin/partners/imports/ecount[-xlsx]` (`partnerImportApi.ts:58-64`, `EcountPartnerImportController.java:55-83`); partner-service, `partner_db.partners`, `partner_revisions` (`Partner.java:38`, `PartnerRevision.java:39`) | **도달** | partner 활성/전체 **7309/8323**, revision **16** | 이카운트 파일은 사용자가 가져오는 import 원천으로 생존; 런타임 시트/Notion 정본은 아님. #827/#977 CLOSED. 기존 조사 판정과 같음. |

### 8–14

| # | 프로그램 · 레거시 위치 | 현행 화면과 사용자가 도달하는 길 | API · 서비스 · DB | 도달성 | 실제 데이터 흔적 | 레거시 원천 생존 여부 · 결정/이슈 · 기존 조사 차이 |
|---:|---|---|---|---|---|---|
| 8 | 거래처별 원장생성 프로그램 — `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:10` | 회계 → 거래처 원장 `/accounting/partner-ledger`; 메뉴 `MenuCatalog.java:61`, route/인쇄 `routes/index.tsx:1073-1095` | `GET /accounting/journals/partner-ledger`, 매출 집계 (`partnerLedgerApi.ts:8-11`), snapshot/history (`partnerLedgerApi.ts:333-423`); accounting/slip-service, `accounting_db.tax_invoice_batches`, journals, `slip_db.slips` | **도달** | PARTNER_LEDGER batch **14**, journals **165**, journal lines **373** | 자체 전표·분개 DB. `DECISIONS.md:1028`; #1014 CLOSED. 기존 조사 판정과 같음. |
| 9 | 거래처별 일괄 거래명세서 생성 — `tools/legacy-gas/거래처별 일괄 거래명세서 생성/Code.js:10` | 회계 → 거래명세서 일괄 `/accounting/statement-batch`; 메뉴 `MenuCatalog.java:60`, route `routes/index.tsx:1047-1071` | `GET /accounting/statements/batch-data` (`statementBatchApi.ts:8-9`, `AccountingReportController.java:235`); accounting-service, source `accounting_db.tax_invoice_batches`/`slip_db.slips` | **도달** | 기능 전용 저장행 **0**; 조회 원천 PARTNER_LEDGER batch **14**, 활성 slip **237** | 자체 DB 조회/인쇄. #1014 CLOSED. 기존 조사 판정과 같음. |
| 10 | 계산서일괄등록양식 생성 — `tools/legacy-gas/계산서일괄등록양식 생성/Code.js:8` | 회계 → 홈택스 일괄 양식 `/accounting/hometax-export`; 메뉴 `MenuCatalog.java:62`, route `routes/index.tsx:1038-1044` | 단순 export/preview/split/exclusion/history (`hometaxExportApi.ts:8-15`, `AccountingReportController.java:257,311-460`); accounting-service, `accounting_db.tax_invoice_batches`, exclusions | **도달** | HOMETAX 문서형 batch **0**; 현재 batch 14건은 전부 PARTNER_LEDGER, exclusion 활성/전체 **0/2** | 외부 파일은 결과물을 홈택스에 수동 업로드하는 용도이며 입력 정본은 자체 DB. #977 CLOSED. 기존 조사 판정과 같음. |
| 11 | 교육안내 자동상태변경 — `tools/legacy-gas/교육안내 자동상태변경/Code.js:1` | 대응 메뉴·route·화면 없음 | 대응 API/service/table 없음 | **없음** | **0** | 과거 Notion automation은 현행에서 제거. 개발책임자 불필요 확정(`2026-08-15...:121-129`). 기존 조사와 같음. |
| 12 | 내일자 전표 이미지 생성 — `tools/legacy-gas/내일자 전표 이미지 생성/Code.js:11` | 판매 → 내일자 전표 이미지 `/sales/next-day-slip`; 메뉴 `MenuCatalog.java:17`, route/인쇄 `routes/index.tsx:480-496` | `GET /slips/next-day-image-data` (`nextDaySlipApi.ts:5-13`, `SlipController.java:696`); slip-service가 slips와 DB 이관된 chat/block/region을 조회 | **도달** | 기능 전용 저장행 **0**; 활성 outbound slip **174**, chat mapping **112**, region **20**, block 운영행 **0** | Drive/Notion 원천은 제거, 자체 DB. block 0은 #1234 OPEN 데이터 적재 문제. #1013 CLOSED. 기존 조사 판정과 같음. |
| 13 | 미배차리스트 — `tools/legacy-gas/미배차리스트/Code.js:10` | 배차 → 미배차리스트 `/arologis/unassigned`; 메뉴 `MenuCatalog.java:96`, route `routes/index.tsx:1139-1145` | `GET /admin/arologis/dispatches/unassigned` (`arologisDispatchApi.ts:18-19`), save history; arlogis-service, `arologis_db.dispatches`, `dispatch_save_history` | **도달** | UNASSIGNED 활성 이력 **1**, dispatch **26** | 자체 출고전표/배차 DB. #1039 CLOSED. 기존 조사 판정과 같음. |
| 14 | 배차안내문자 — `tools/legacy-gas/배차안내문자/Code.js:11` | 배차 → 배차안내 SMS `/arologis/dispatch-sms`; 메뉴 `MenuCatalog.java:97`, route/guard `routes/index.tsx:1150-1154` | `POST /admin/notifications/dispatch-batch/preview` (`dispatchSmsApi.ts:9-19`), history `/admin/notifications/dispatch-sms/history` (`dispatchSmsSaveHistoryApi.ts:58-63`); notification-service, `notification_db.dispatch_sms_save_history` (`DispatchSmsSaveHistory.java:29`) | **도달** | 활성/전체 SMS 이력 **4/61** | 자체 출고전표 + DB chat/block 매핑. 화면은 문구 조립·복사이고 직접 문자 전송 프로그램은 아님. #1013 CLOSED. 기존 조사 판정과 같음. |

### 15–21

| # | 프로그램 · 레거시 위치 | 현행 화면과 사용자가 도달하는 길 | API · 서비스 · DB | 도달성 | 실제 데이터 흔적 | 레거시 원천 생존 여부 · 결정/이슈 · 기존 조사 차이 |
|---:|---|---|---|---|---|---|
| 15 | 비밀번호 일괄 암호화 — `tools/legacy-gas/비밀번호 일괄 암호화/Code.js:6` | 사용자용 일괄 이관 route/menu 없음 | 현재 로그인·reset 경로가 hash를 사용; auth-service/partner-auth-service, `auth_db.accounts`, `partner_auth_db.partner_auth` | **코드만 있음** | 활성 account hash **32/32**, partner auth hash **2/2**. 미완료 평문 행은 실측되지 않음. | 일회성 migration 성격이며 DB로 종료. 기존 조사도 `이관도구`로 분리해 사실상 같음. |
| 16 | 알리고 자동 업로드 — `tools/legacy-gas/알리고 자동 업로드/Code.js:10` | 메신저 → 알리고 주소록 `/admin/aligo-address-book`; hard-coded 사이드바 권한·링크 `AppLayout.tsx:745,1463-1504`, route `routes/index.tsx:1567-1571` | `GET /admin/partners/export/aligo-csv`, `POST /admin/notification/aligo/address-book/sync` (`aligoAddressBookApi.ts:67-92`, `AligoAddressBookController.java:26,47-48`); partner/notification-service | **부분 도달** | 외부 전달 성공 저장행 **0**; source partner 활성 **7309** | 원천은 자체 partner DB이나 외부 Aligo client는 `NOT_DELIVERED` mock (`MockAligoAddressBookClient.java:48-62`). #1016 CLOSED와 달리 #1098 OPEN이 현행 코드와 일치. 기존 조사의 `부분대체` 판정은 맞음. |
| 17 | 에어디자이너 전용 주문서 인식 — `tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:1` | 대응 메뉴·route·화면 없음 | 대응 API/service/table 없음 | **없음** | **0** | 개발책임자 불필요 확정. #827 CLOSED. 기존 조사와 같음. |
| 18 | 영업수수료 계산 — `tools/legacy-gas/영업수수료 계산/Code.js:9` | 회계 → 영업수수료 정산 `/accounting/sales-commission-settlements`; 메뉴 `MenuCatalog.java:59`, route/guard `routes/index.tsx:768-780` | `GET/POST /accounting/sales-commission-settlements`, confirm (`accounting.ts:62-90`, `SalesCommissionSettlementController.java:29-69`); accounting-service, `accounting_db.sales_commission_settlements` (`SalesCommissionSettlement.java:35`) | **도달** | settlement **0**, snapshot history **0** | 자체 회계/출고 DB가 원천. #977 CLOSED, #1237 OPEN. 기존 조사 판정과 같음. |
| 19 | 운송사-실배차내역 비교 — `tools/legacy-gas/운송사-실배차내역 비교/Code.js:8` | 배차 → 실배차 비교 `/arologis/dispatch-reconcile`; 메뉴 `MenuCatalog.java:98`, route `routes/index.tsx:1187-1195` | `POST /admin/arologis/dispatch/reconcile` multipart (`dispatchReconcileApi.ts:6-10`); arlogis-service, source `arologis_db.dispatches` | **도달** | 기능 전용 실행 이력 **0**; 비교 대상 dispatch **26** | 운송사 XLSX는 의도된 외부 입력으로 생존, 반대편은 자체 배차 DB. #1039 CLOSED. 기존 조사 판정과 같음. |
| 20 | 일마감 프로그램 — `tools/legacy-gas/일마감 프로그램/Code.js:17` | 회계 → 일마감 `/accounting/daily-closing`(alias `/daily-closings`); 메뉴 `MenuCatalog.java:68`, routes `routes/index.tsx:1323-1337` | `GET/POST /accounting/daily-closings`, lock (`accounting.ts:1304-1365`, `DailyClosingController.java:48,77-101`); accounting-service, `accounting_db.daily_closings` (`DailyClosing.java:54`) | **도달** | 활성/전체 closing **3/8** | 자체 slips/journals/설정 DB. #1008 CLOSED, 상세 0 문제 #1233 OPEN. 기존 조사 판정과 같음. |
| 21 | 입출고 내역 — `tools/legacy-gas/입출고 내역/code.js:2` | 창고 운영 → 입출고 내역·분석 `/inventory/inout-analysis`; 메뉴 `MenuCatalog.java:106`, route `routes/index.tsx:670-676` | `GET /slips/query/inout-analysis` (`inventory.ts:430`, `SlipQueryController.java:70`); slip-service, `slip_db.slips/slip_lines` | **도달** | 전용 저장행 **0**; 원천 활성 slip **237**(입고 63, 출고 174) | Drive CSV/Excel 정본은 폐기되고 자체 확정 전표 DB. #1012 CLOSED. 기존 조사 판정과 같음. |

### 22–27

| # | 프로그램 · 레거시 위치 | 현행 화면과 사용자가 도달하는 길 | API · 서비스 · DB | 도달성 | 실제 데이터 흔적 | 레거시 원천 생존 여부 · 결정/이슈 · 기존 조사 차이 |
|---:|---|---|---|---|---|---|
| 22 | 입출고 분석 — `tools/legacy-gas/입출고 분석/Code.js:5` | 입출고 내역과 같은 메뉴/route의 분석 탭; `MenuCatalog.java:106`, `routes/index.tsx:670-676` | 같은 `GET /slips/query/inout-analysis`; slip-service, `slip_db.slips/slip_lines` | **도달** | 전용 저장행 **0**; 분석 원천 활성 slip **237**, line **344** | 자체 전표 DB. #1012 CLOSED, 계산규칙 drift #1238 OPEN. 기존 조사 판정과 같음. |
| 23 | 전표정리리스트 — `tools/legacy-gas/전표정리리스트/Code.js:8` | 판매 → 전표 정리 `/sales/slip-cleanup`; 메뉴 `MenuCatalog.java:16`, route/guard `routes/index.tsx:564-572` | `GET /slips/cleanup` (`slipCleanupApi.ts:4-8`, `SlipController.java:727`), history `/slips/cleanup/history` (`slipCleanupSaveHistoryApi.ts:58-63`); slip-service, `slip_db.slip_cleanup_save_history` (`SlipCleanupSaveHistory.java:29`) | **도달** | 활성 history **3** | 자체 전표 DB. #1014 CLOSED. 기존 조사 판정과 같음. |
| 24 | 제이시스템 전용 주문서 인식 — `tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:1` | 대응 메뉴·route·화면 없음 | 대응 API/service/table 없음 | **없음** | **0** | 개발책임자 불필요 확정. #827 CLOSED. 기존 조사와 같음. |
| 25 | 종합견적서 — `tools/legacy-gas/종합견적서/Code.js:6` | 데스크톱 판매 → 견적서 관리 `/sales/estimates`는 native 화면 (`MenuCatalog.java:10`, `routes/index.tsx:498-508`). 모바일 직원 앱은 외부 견적 WebView (`EstimateWebViewScreen.tsx:7-17`, `legacyEstimateSource.ts:30`). 데스크톱 외부 버튼은 env 의존. | native `slip-service /slips/estimates` (`estimateApi.ts:5-14`), `slip_db.estimates/estimate_lines`, `quote_snapshots` (`Estimate.java:60`, `QuoteSnapshot.java:25`). 별도 estimate-app도 존재. | **부분 도달** | 활성/전체 estimate **45/2063**, quote snapshot **5**, ESTIMATE source slip **7** | native는 DB이나 배포 설정은 `CATALOG_SOURCE=sheet` (`infrastructure/render/render.yaml:55-58`)이고 앱 잔여 탭은 Google Sheets 직접 read (`clients/web/estimate-app/lib/code.js:57-60,727-749`). 외부 URL은 TLS 실패(#1240 OPEN). #1009 CLOSED. **Δ5:** 기존 27개 표에서 제외(`2026-08-15...:8`). |
| 26 | 지방가배차분류리스트 — `tools/legacy-gas/지방가배차분류리스트/Code.js:8` | 배차 → 가배차리스트 `/arologis/pre-classify`의 지방/시도 분류; 메뉴 `MenuCatalog.java:95`, route `routes/index.tsx:1112-1120` | `GET /admin/arologis/dispatches/regional` (`arologisDispatchApi.ts:16-17`); arlogis-service, `region_dispatch_classifications`, `dispatches`, shared save history | **도달** | 권역분류 **20**, dispatch **26**, PRE_CLASSIFY 활성 이력 **1**(가배차와 공유) | Notion 지역표는 DB로 이관 완료(`DECISIONS.md:1759-1770`), 운영 원천과 경합하지 않음. #1039 CLOSED. 기존 조사 판정과 같음. |
| 27 | 품목별 DPS 입고내역 비교 — `tools/legacy-gas/품목별 DPS 입고내역 비교/Code.js:8` | 구매 → 품목별 DPS 분석 `/warehouse/dps-compare/by-product`; 메뉴 `MenuCatalog.java:29`, route/guard `routes/index.tsx:1820-1827` | `GET /warehouse/audit/dps-compare/by-product` (`dpsByProductApi.ts:8-9`), history `/warehouse/audit/dps-history`; inventory-service, `inventory_db.stock_movements`, `dps_save_history` (`StockMovement.java:24`, `DpsSaveHistory.java:30`) | **도달** | DPS 이력 **0**; 활성 stock movement **142** | DPS XLSX만 외부 입력, 내부 측은 자체 입고/재고 DB. #1011 CLOSED, #1237/#1238 OPEN. 기존 조사 판정과 같음. |

## 데이터 흔적 0인 프로그램 14개

기능 전용 output/history 기준으로 다음 14개다.

1. DPS 입고기록 비교
2. 기간별 비밀번호 재설정
3. 거래처별 일괄 거래명세서 생성
4. 계산서일괄등록양식 생성
5. 교육안내 자동상태변경
6. 내일자 전표 이미지 생성
7. 알리고 자동 업로드의 **외부 전달 성공**
8. 에어디자이너 전용 주문서 인식
9. 영업수수료 계산
10. 운송사-실배차내역 비교의 실행 이력
11. 입출고 내역
12. 입출고 분석
13. 제이시스템 전용 주문서 인식
14. 품목별 DPS 입고내역 비교

이 중 거래명세서·홈택스·내일자 이미지·실배차 비교·입출고 2종은 조회/렌더링형이라 전용 저장행 0만으로 미사용을 확정할 수 없다. 반대로 DPS 2종·영업수수료는 전용 이력/정산 테이블이 있으나 실제 행이 0이다. 알리고는 호출 화면은 있으나 외부 client가 명시적으로 미전달 상태를 반환한다.

## 기존 2026-08-15 조사와 어긋난 5개

| 차이 | 프로그램 | 직접 확인 결과 |
|---|---|---|
| Δ1 | 가입고처리 | 기존 보고서는 XLSX batch 변환 미구현으로 `부분대체`라 했지만, route·preview API·slip 생성이 연결돼 있고 `INBOUND_XLSX` slip 1건이 있다. |
| Δ2 | 거래처 발송 주문서 | 실제 GAS 프로그램인데 기존 27개 표에서 제외됐다. 현행 native 주문 화면/DB와 외부 WebView가 함께 있으며 Google Sheet fallback도 남아 있다. |
| Δ3 | 기간별 비밀번호 재설정 | 실제 별도 `Code.js` 프로그램인데 기존 표에서 누락됐다. 현행 승인 화면의 수동 reset까지는 도달하고 월별 batch는 없다. |
| Δ4 | 장기미발주 거래처 선별 | 실제 별도 `Code.js` 프로그램인데 기존 표에서 누락됐다. 30일 DB 판정/미리보기/상태 행은 있고 별도 주기 job은 없다. |
| Δ5 | 종합견적서 | 실제 GAS 프로그램인데 기존 27개 표에서 제외됐다. native DB 화면과 별도 web app이 공존하며 web 쪽 Google Sheet read가 남아 있다. |

기존 보고서의 합계가 우연히 똑같이 27이 된 이유는, 위 실제 GAS 4개(Δ2–Δ5)를 빼고 `Code.js`가 없는 데이터 디렉터리 4개(지역별 분류표·거래처 DC정보·단톡방리스트·발송금지리스트)를 “판단불가 프로그램”으로 넣었기 때문이다 (`docs/dev-reports/2026-08-15-gas-programs-coverage-survey.md:65-73`). 그 4개는 프로그램이 아니라 현행 DB 원천 검증 대상이다. 현재 활성/전체 실측은 지역분류 **20/20**, DC config **210/210**, chat mapping **112/114**, blocked partner **0/0**이며, migration 결정은 Notion runtime 참조 종료를 명시한다 (`migration/decisions/DECISIONS.md:1759-1770`). blocked 데이터 적재 누락은 #1234 OPEN 상태다.

## 결정·이슈와 현재 코드가 충돌하는 지점

- **CLOSED가 구현 증명은 아니다.** #1016 CLOSED 제목/본문과 달리 알리고 실구현체는 없고 `MockAligoAddressBookClient`가 활성화된다. 실연결은 #1098 OPEN이다.
- #1015 CLOSED 범위의 주문서 접근 관리는 30일 판정·미리보기·수동 초기화까지 구현됐지만, 두 레거시 보조 GAS와 같은 주기 batch는 검색되지 않았다.
- #1009 CLOSED의 native 견적 저장은 DB에 실제 행이 있으나, 별도 web estimate 배포 설정은 Google Sheet 모드다. “DB 이관 완료”를 전체 견적 진입점에 일괄 적용할 수 없다.
- #1011/#1012/#1013/#1014의 데이터 정본 결정은 현행 코드와 일치한다. DPS·운송사 XLSX처럼 사용자가 올리는 비교 입력/교환 파일은 남았지만, 반대편 운영 정본은 자체 출고·입고·배차·회계 DB다.

## 읽기 전용 실측 원시 집계

| DB | 표/구분 | 활성/전체 또는 건수 |
|---|---|---:|
| `slip_db` | slips | 237/2830 |
| `slip_db` | slip lines | 344/4045 |
| `slip_db` | source: ESTIMATE / INBOUND_XLSX / MANUAL (활성) | 7 / 1 / 229 |
| `slip_db` | estimates / quote snapshots | 45/2063 / 5 |
| `slip_db` | cleanup history | 3 |
| `arologis_db` | dispatches / region classifications | 26 / 20 |
| `arologis_db` | save history 활성/전체 | 2/17 |
| `notification_db` | dispatch SMS history 활성/전체 | 4/61 |
| `notification_db` | chat mapping 활성/전체 | 112/114 |
| `inventory_db` | DPS history / stock movements 활성 | 0 / 142 |
| `accounting_db` | daily closings 활성/전체 | 3/8 |
| `accounting_db` | sales commission settlement/history | 0/0 |
| `accounting_db` | tax invoice batches | 14 (전부 PARTNER_LEDGER) |
| `accounting_db` | journals / journal lines | 165 / 373 |
| `partner_db` | partners 활성/전체 / revisions | 7309/8323 / 16 |
| `dc_config_db` | DC configs 활성/전체 | 210/210 |
| `partner_order_db` | orders 활성/전체 | 4/2025 |
| `partner_order_db` | drafts 활성/전체 / history | 11/2005 / 5988 |
| `partner_auth_db` | auth / login attempts | 2 / 170 |
| `auth_db` | 활성 account hash 보유 | 32/32 |
