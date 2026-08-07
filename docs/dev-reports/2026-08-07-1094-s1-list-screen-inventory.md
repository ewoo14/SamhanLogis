# #1094 S1 — 목록 화면 전수 조사 + 번호 링크/복귀 규칙 설계

> 조사일: 2026-08-07
> 범위: `clients/desktop` renderer, 읽기 전용 정찰
> 기준 커밋: `7fe6e09c0` (`feat/1094-docno-hyperlink-and-back`)
> 구현·테스트 실행·Docker·서비스 재기동: 없음

## 0. 조사 기준과 전수성

- 출발점 `clients/desktop/src/renderer/routes/index.tsx`는 1,811줄이며 `path:` 등록은 **175건**이다. 근거: 라우트 배열 시작 `index.tsx:337`, 마지막 catch-all `index.tsx:1795`, router 생성 `index.tsx:1802-1804`; 수치는 파일 전체에 `rg -n '\bpath:'`를 적용한 결과다.
- 목록 화면은 “라우트 본문에서 반복되는 업무 레코드(행·카드·큐)를 조회/관리하는 화면”으로 잡았다. 인증·작성 폼·단일 상세·인쇄 전용은 제외했다.
- 표가 있어도 재무제표처럼 행이 독립 문서가 아닌 **집계/분석 화면**은 ①-B에 따로 남겼다. 이들은 조사에서 빠진 것이 아니라 번호 링크 규칙의 직접 대상이 아닌 것으로 분류한 것이다.
- 동일 컴포넌트 alias는 한 행에 함께 적었다. `/sales`와 `/sales/query`, `/purchases`와 `/purchases/query`, `/accounting/daily-closing(s)`가 이에 해당한다 (`index.tsx:431,1321`, `index.tsx:583,1331`, `index.tsx:1278,1286`).

## ① 목록 화면 전수 표

### ①-A 문서/전표/업무 엔티티 목록 — 번호 링크 규칙 직접 검토군

| 화면 | 라우트 | 번호 컬럼(필드) | 현재 상세 진입 수단 | 같은 자리의 다른 동작 | 상세에 뒤로가기 |
|---|---|---|---|---|---|
| 그룹웨어 결재 | `/groupware/approvals` (`index.tsx:355`) | 결재문서번호 `approvalNo` (`GroupwareApprovalListPage.tsx:78-84`) | 행 클릭 → `/groupware/approvals/:approvalId` (`GroupwareApprovalListPage.tsx:180`) | 상단 새 결재; 행 액션 열 없음 | 있음. 고정 `/groupware/approvals` 이동 (`GroupwareApprovalDetailPage.tsx:415-418,468-470`) |
| 판매관리 | `/sales`, `/sales/query` (`index.tsx:431,1321`) | 판매번호 `slipNo` (`sales-query/SalesQueryPage.tsx:297`) | 우측 `[상세]` 버튼, desktop/grid 양쪽 (`sales-query/SalesQueryPage.tsx:319-335,794-808`) | 같은 선택 액션 영역에 삭제·거래명세서·세금계산서 인쇄 (`sales-query/SalesQueryPage.tsx:489-556`); 반드시 보존 | 있음. 고정 `/sales`인 `listPath` (`SlipDetailPage.tsx:3761-3762`) |
| 판매전표 legacy 목록 | `/sales/slips` (`index.tsx:442`) | 전표번호 `slipNo` (`SlipListPage.tsx:205-208`) | 행 클릭 (`SlipListPage.tsx:460-462`) | 삭제행 복원 버튼 (`SlipListPage.tsx:290-320`) | 있음. 고정 `/sales` (`SlipDetailPage.tsx:3761-3762`), 원래 `/sales/slips`로는 안 돌아감 |
| 전표정리 | `/sales/slip-cleanup` (`index.tsx:557`) | 전표번호 `slipNo` (`SlipCleanupPage.tsx:480,500`) | 우측 `[원본 전표 보기]` 버튼 (`SlipCleanupPage.tsx:522-530`) | 정합성 chip·CSV·결과 저장은 별도 (`SlipCleanupPage.tsx:365-373,513-520`) | 원본 전표 상세에는 고정 `/sales`; 정리 화면 복귀 없음 |
| 견적 | `/sales/estimates` (`index.tsx:493`) | 견적번호 `estimateNo` (`EstimateListPage.tsx:122-125`) | 행 클릭 → `/sales/estimates/:id` (`EstimateListPage.tsx:408-410`) | 삭제행 복원 액션 (`EstimateListPage.tsx:247` 이후); 신규 작성 | **없음**. 상세에서 edit/전표 이동만 확인 (`EstimateDetailPage.tsx:374,541`) |
| 거래처 주문서 | `/sales/partner-orders` (`index.tsx:502`) | 주문 번호 `orderNumber` (`SalesPartnerOrderListPage.tsx:223-226`) | 행 클릭 (`SalesPartnerOrderListPage.tsx:379,593`) | 삭제행 복원·병합/전표전환 액션 (`SalesPartnerOrderListPage.tsx:319-340` 및 화면 toolbar) | 있음. 고정 `/sales/partner-orders` (`SalesPartnerOrderDetailPage.tsx:810,1000-1003`) |
| 내일자 전표 | `/sales/next-day-slip` (`index.tsx:472`) | 전표번호 `slipNo` (`NextDaySlipPage.tsx:284,312-315`) | 인쇄용 선택/미리보기; 별도 전표 상세 링크 없음 | 선택·인쇄 동작 | 해당 상세 route 없음 |
| 링크발송 목록 | `/sales/link-dispatch` (`index.tsx:461`) | 없음. `전표수` 집계만 표시 (`LinkDispatchListPage.tsx:83-105`) | 배송묶음 행/링크 처리, 전표 상세 route 진입 없음 | 링크 생성/복사·발송 (`LinkDispatchListPage.tsx:113-126`) | 해당 상세 route 없음 |
| 구매관리 | `/purchases`, `/purchases/query` (`index.tsx:583,1331`) | 구매번호 `slipNo` (`purchase-query/PurchaseQueryPage.tsx:192`) | 우측 `[상세]` 버튼 (`purchase-query/PurchaseQueryPage.tsx:210-226,572-577`) | 같은 행에 입고검수 CTA, 상단 인쇄 (`purchase-query/PurchaseQueryPage.tsx:232,364-372`); 반드시 보존 | 있음. 고정 `/purchases` (`SlipDetailPage.tsx:3761-3762`) |
| 구매전표 legacy 목록 | `/purchases/slips` (`index.tsx:594`) | 전표번호 `slipNo` (`SlipListPage.tsx:205-208`) | 행 클릭 (`SlipListPage.tsx:460-462`) | 입고검수 CTA (`SlipListPage.tsx:320` 이후) | 있음. 고정 `/purchases`; 원래 `/purchases/slips` 복귀 안 함 |
| 입고 검수 | `/warehouse/inbound-inspections` (`index.tsx:1710`) | 전표번호 `slipNo` (`InboundInspectionListPage.tsx:68-78`) | 행 클릭 또는 `[검수]` → **같은 화면 dialog** (`InboundInspectionListPage.tsx:123-138,186`) | `[검수]`는 업무 실행 CTA이므로 삭제 금지 | 별도 상세가 아님. dialog 닫기 계약 대상 |
| 재고이동 | `/transfers` (`index.tsx:646`) | 이동번호 `transferNo` (`TransferListPage.tsx:63-64`) | 행 클릭 (`TransferListPage.tsx:144`) | 신규 작성; `상세`라는 열은 `reasonDetail` 데이터 열 (`TransferListPage.tsx:97`)이므로 삭제 대상 아님 | 있음. 고정 `/transfers` (`TransferDetailPage.tsx:293-296,356-357`) |
| 재고실사 | `/warehouse/audit` (`index.tsx:1721`) | 실사번호 `auditNo` (`InventoryAuditListPage.tsx:99-100`) | 행 클릭 (`InventoryAuditListPage.tsx:224`) | 신규 실사 | 있음. 고정 `/warehouse/audit` (`InventoryAuditDetailPage.tsx:178-179`) |
| 분개장 | `/accounting/journals` (`index.tsx:683`) | 분개번호 `journalNo` (`JournalListPage.tsx:79-82`) | 행 클릭 (`JournalListPage.tsx:207`) | 신규 분개 | **없음**. 상세에는 편집/연결 입금 이동만 있고 목록 CTA를 찾지 못함 (`JournalDetailPage.tsx:350-363,459-486`) |
| 세금계산서 | `/accounting/tax-invoices` (`index.tsx:1372`) | 세금계산서번호 `taxInvoiceNo` (`TaxInvoiceListPage.tsx:88-91`) | 행 클릭 (`TaxInvoiceListPage.tsx:272`) | 홈택스 내보내기·신규 작성 (`TaxInvoiceListPage.tsx:187-195`) | **없음**. 상세에는 편집/인쇄/연결 분개만 확인 (`TaxInvoiceDetailPage.tsx:407-443,603,711-722`) |
| 입금보고서 | `/accounting/admin/cash-receipts` (`index.tsx:1250`) | 전표번호 `slipNo` (`CashReceiptListPage.tsx:145-146`) | **번호 자체 `<Link>`** (`CashReceiptListPage.tsx:149-156`) | 없음; 연결 분개번호는 현재 plain text (`CashReceiptListPage.tsx:200-205`) | 있음. 고정 목록 이동 (`CashReceiptDetailPage.tsx:144-145`) |
| 회계 주문 조회 | `/accounting/admin/orders` (`index.tsx:1210`) | 주문번호 `orderNo` (`accounting/admin/OrderListPage.tsx:53-55`) | 행 클릭 (`accounting/admin/OrderListPage.tsx:224`) | 연결 전표번호는 별도 plain-text 열 (`accounting/admin/OrderListPage.tsx:84-85`) | 있음. 고정 목록 이동 (`accounting/admin/OrderDetailPage.tsx:111-112`) |
| 회계 매출전표 | `/accounting/sales-slips` (`index.tsx:1178`) | 전표번호 `slipNo` (`accounting/SalesAccountingSlipPage.tsx:57`) | 상세 진입 없음 | 행 우측 확정(post) (`accounting/SalesAccountingSlipPage.tsx:89-98`), 신규 작성 (`accounting/SalesAccountingSlipPage.tsx:113`) | 상세 route 자체 없음 |
| 회계 매입전표 | `/accounting/purchase-slips` (`index.tsx:1194`) | 전표번호 `slipNo` (`accounting/PurchaseAccountingSlipPage.tsx:57`) | 상세 진입 없음 | 행 우측 확정(post) (`accounting/PurchaseAccountingSlipPage.tsx:89-98`), 신규 작성 (`accounting/PurchaseAccountingSlipPage.tsx:113`) | 상세 route 자체 없음 |
| 홈택스 일괄등록 | `/accounting/hometax-export` (`index.tsx:977`) | 결과 표 전표번호 `slipNo` (`HometaxExportPage.tsx:477-483`) | 원본 상세 진입 없음; 저장이력 행은 결과 tab 복원 (`HometaxExportPage.tsx:978-1033`) | 다운로드·제외 거래처 삭제·결과 복원 | 원본 상세 route 진입 없음 |
| 세금계산서 일괄발행 | `/accounting/tax-invoices/batch` (`index.tsx:1382`) | 매출전표 `slipNo`, 발행 결과 `taxInvoiceNo` (`accounting/TaxInvoiceBatchIssuePage.tsx:61,156`) | batch preview/result, 직접 원본 상세 링크 없음 | 선택·발행·Excel·제외관리 | 별도 원본 상세 진입 없음 |
| 매입 세금계산서 | `/accounting/tax-invoices/inbound` (`index.tsx:1390`) | 매입전표 `slipNo`, 세금계산서 `taxInvoiceNo` (`accounting/TaxInvoiceInboundPage.tsx:69,113`) | 화면 내부 조회/처리, 별도 상세 route 진입 없음 | 수집/매칭 등 처리 CTA | 상세 route 진입 없음 |
| 일반원장 | `/accounting/ledgers` (`index.tsx:1298`) | 분개번호 `journalNo` (`GeneralLedgerPage.tsx:182-190`) | plain text, 상세 진입 없음 | CSV·인쇄 (`GeneralLedgerPage.tsx:480-489`) | 상세 route 진입 없음 |
| 분개현황 | `/accounting/reports/journal-status` (`index.tsx:934`) | 전표번호 `journalNo` (`JournalStatusReportPage.tsx:130-136`) | plain text, 상세 진입 없음 | 필터/그룹화 | 상세 route 진입 없음 |
| 거래처별 원장 | `/accounting/partner-ledger` (`index.tsx:1012`) | 원장 행 분개번호 `journalNo`, 저장 배치번호 `batchNo` (`PartnerLedgerPage.tsx:711-715,831-838`) | plain text; 거래처 행은 화면 내부 원장 선택 (`PartnerLedgerPage.tsx:551-588`) | 일괄선택·인쇄·snapshot 복원 | 원본 분개/세금계산서 상세 링크 없음 |
| 일/월 마감(창고) | `/warehouse/closing` (`index.tsx:1168`) | 상세 표 세금계산서번호 `taxInvoiceNo` (`MonthEndClosingPage.tsx:378-418`) | `[이력]`이 같은 화면 상세 panel을 엶 (`MonthEndClosingPage.tsx:339-347`) | 역마감·마감 실행; 삭제 금지 | 별도 상세 route 없음 |
| 매출 마감 | `/sales/closing` (`index.tsx:1349`) | 상세 표 세금계산서번호 `taxInvoiceNo` (`SalesClosingPage.tsx:346-355`) | `[이력]`이 같은 화면 상세 panel (`SalesClosingPage.tsx:324-332`) | 역마감·마감 실행 | 별도 상세 route 없음 |
| 일마감 | `/accounting/daily-closing`, `/accounting/daily-closings` (`index.tsx:1278,1286`) | 내부 일마감/전표 번호 | `[상세 보기]` disclosure/dialog; 계약 테스트 존재 (`DailyClosingPage.test.tsx:1002,1073,1185`) | 마감/역마감 등 업무 CTA | 별도 route가 아니라 같은 화면 disclosure |
| 받을어음 | `/accounting/reports/notes-receivable` (`index.tsx:827`) | 어음번호 `noteNo` (`NotesReceivablePage.tsx:153`) | 상세 route 없음 | 상태전이 버튼 (`NotesReceivablePage.tsx:200-211`) | 해당 없음 |
| 수금계획 | `/accounting/reports/collection-plans` (`index.tsx:835`) | 계획번호 `planNo` (`CollectionPlanPage.tsx:189`) | 상세 route 없음 | 상태전이/제안 반영 (`CollectionPlanPage.tsx:235-246,357-382`) | 해당 없음 |
| 배차 그룹 | `/admin/dispatch-groups` (`index.tsx:1067`) | 그룹 번호 `groupNo` (`DispatchGroupPage.tsx:38`) | 선택 그룹 상세를 같은 화면에 표시 (`DispatchGroupPage.tsx:19,49`) | 운송사 지정/해제·수정·삭제·전송 (`DispatchGroupPage.tsx:40-43`) | 별도 상세 route 없음 |
| 배차현황 이력 | `/dispatch-board/history` (`index.tsx:1109`) | 배차 작업번호 `taskKey` (`dispatch-board/DispatchHistoryPage.tsx:72`) | 행 클릭 → 같은 화면 상세 modal (`dispatch-board/DispatchHistoryPage.tsx:47,258,313`) | modal 안 수정/취소 요청·재배차 | 별도 상세 route 없음 |
| 배차 보드 | `/dispatch-board` (`index.tsx:1101`) | 카드/미배차 풀의 `slipNo` | slip detail modal/보드 조작; URL query 사용 (`dispatch-board/DispatchBoardPage.tsx:66`) | 차량그룹 배정·체크·전송 등 핵심 동작 | 별도 목록↔상세 route가 아님 |
| 아로로지스 가배차/지방가배차 | `/arologis/pre-classify` (`index.tsx:1051`) | 전표번호 `slipNo` (`ArologisPreClassifyPage.tsx:406,464,597,648`) | 상세 진입 없음 | CSV·지역/배차그룹 링크 (`ArologisPreClassifyPage.tsx:203,330-338,453`) | 해당 없음 |
| 아로로지스 미배차 | `/arologis/unassigned` (`index.tsx:1078`) | 전표번호 `slipNo` (`ArologisUnassignedPage.tsx:213,241`) | 상세 대신 우측 `[수동 배차로 이동]` (`ArologisUnassignedPage.tsx:246-250`) | 이 CTA는 제거 금지; 대상 화면에 query 전달 (`ArologisUnassignedPage.tsx:92-100`) | 전표 상세 진입 없음 |
| 아로로지스 수동배차 | `/arologis/manual` (`index.tsx:1040`) | query의 `slipNo` 및 후보 전표 | 전표 상세가 아니라 배차 실행 화면; `useSearchParams` (`ArologisManualDispatchPage.tsx:42,182`) | 운송사/기사/배차 실행 | 해당 없음 |
| 아로로지스 실배차 비교 | `/arologis/dispatch-reconcile` (`index.tsx:1128`) | 비교 row `slipNo` (`ArologisDispatchReconcilePage.tsx:654,683-698`) | 상세 route 없음 | 업로드·비교·CSV/history 복원 | 해당 없음 |
| 배차문자 | `/arologis/dispatch-sms` (`index.tsx:1089`) | preview row `slipNo` (`DispatchSmsPage.tsx:239-246,487,525`) | 상세 route 없음 | 선택·편집·복사·발송/history | 해당 없음 |
| 시리얼 보상 실패 | `/inventory/compensation-failures` (`index.tsx:1784`) | 전표번호 `slipNo` (`CompensationFailuresPage.tsx:316`) | 상세 대신 해결 dialog (`CompensationFailuresPage.tsx:130,421,491-500`) | 해결 처리·필터·페이지 | 별도 상세 route 없음 |
| DPS 입고 비교 | `/warehouse/dps-compare` (`index.tsx:1749`) | 불일치 표 전표번호 `slipNo` (`InventoryDpsComparePage.tsx:504-512`) | 원본 상세 진입 없음 | CSV·결과 저장/history 복원 | 해당 없음 |
| 전표 수정/삭제 요청 | `/admin/slip-edit-requests` (`index.tsx:1654`) | 전표번호 `slipNo` (`admin/SlipEditRequestsPage.tsx:228,242-244`) | 원본 상세 진입 없음 | 우측 수락·거절 (`admin/SlipEditRequestsPage.tsx:269-288`) 반드시 보존 | 해당 없음 |
| 사진 감사 | `/admin/photo-audit` (`index.tsx:1675`) | 전표번호 `slipNo` (`admin/PhotoAuditPage.tsx:336,356-358`) | 썸네일/파일 확인만, 전표 상세 진입 없음 | 사진 미리보기·페이지 | 해당 없음 |
| 거래명세서 일괄 | `/accounting/statement-batch` (`index.tsx:989`) | 공개 식별자는 `bizNo/partnerName/slipNo(taxInvoiceNo)`라고 명시 (`StatementBatchPage.tsx:29`), 표의 primary는 거래처 | 인쇄 route 이동 (`StatementBatchPage.tsx:159-165`) | 전체/선택 인쇄 | 원본 상세 진입 없음 |

### ①-B 목록형이지만 문서 상세 링크 직접 대상이 아닌 화면

아래도 라우트 등록부에서 확인한 목록 화면이다. 번호가 없거나, 행이 설정/집계/로그라서 “번호→문서 상세” 목적지가 현재 없다. 판정은 하지 않고 ②의 개발책임자 질문 대상으로 남긴다.

| 화면 | 라우트(등록 근거) | 번호 컬럼 | 현재 상세 진입 수단 | 같은 자리의 다른 동작 | 상세에 뒤로가기 |
|---|---|---|---|---|---|
| 결재 유형 템플릿 | `/groupware/approval-templates` (`index.tsx:387`) | 없음 | 화면 내 편집 | 생성/편집/삭제 | 별도 상세 없음 |
| 결재 문서양식 | `/groupware/document-templates` (`index.tsx:395`) | 개정번호는 있으나 문서번호 아님 (`GroupwareDocumentTemplateAdminPage.tsx:71`) | 행의 편집 route | 활성/비활성 등 관리 | editor 복귀 계약 별도 |
| 알림 이력 | `/notifications` (`index.tsx:353`) | 없음 | 본문 열/확인 처리, 별도 상세 route 없음 | 읽음 처리·채널/미확인 필터 (`NotificationHistoryPage.tsx:24-27,65-78`) | 해당 없음 |
| 메신저 | `/messenger` (`index.tsx:411`) | 없음 | 대화 선택을 같은 화면에 표시 | 메시지 전송 | 별도 상세 없음 |
| 창고 | `/warehouses` (`index.tsx:420`) | 창고코드 | 별도 상세 없음 | 생성/수정/상태 | 해당 없음 |
| 주문 승인 큐 | `/sales/order-approvals` (`index.tsx:521`) | 주문 식별 자료는 있으나 별도 상세 링크 없음 | 화면 내 승인 처리 | 승인/거절 | 해당 없음 |
| 거래처 DC 설정 | `/sales/partner-dc-config` (`index.tsx:529`) | 거래처코드 | 별도 상세 없음 | 할인 설정 | 해당 없음 |
| 견적 단가 설정 | `/sales/estimate-config` (`index.tsx:537`) | 품목/거래처 key | 별도 상세 없음 | 설정 CRUD | 해당 없음 |
| 재고 현황/입출고 분석/안전재고 | `/inventory/stock-balance`, `/inventory/inout-analysis`, `/inventory/safety-stock-alerts` (`index.tsx:627,635,1773`) | 모델/품목/창고 코드 | 분석/알림 표, 상세 route 없음 | 필터/CSV | 해당 없음 |
| 계정과목/시산표 | `/accounting/accounts`, `/accounting/balances` (`index.tsx:675,715`) | 계정코드 | tree/집계 표 | 계정 관리/필터 | 문서 상세 없음 |
| 재무보고서 허브와 재무제표/집계 보고서군 | `/accounting/reports...` (`index.tsx:726-966`) | 대부분 계정·거래처코드 또는 없음 | 집계/인쇄, 독립 문서 상세 없음 | 필터/인쇄/CSV | 해당 없음 |
| 은행·카드·입출금·입금자 매핑 | `/accounting/bank-card-admin`, `/accounting/deposit-mappings`, `/accounting/bank-transactions`, `/accounting/funds/status` (`index.tsx:843,851,859,950`) | 은행/카드/거래 식별자 | disclosure 또는 같은 화면 처리 | 매핑/일괄 입금/상태 변경 | 별도 상세 route 없음 |
| 회계 원장 admin/마이그레이션 운영 | `/accounting/admin/ledger/sales`, `/purchase`, `/migration-ops` (`index.tsx:1226-1242`) | 거래처/원장 key | 집계/운영 dashboard | 필터/재처리 | 별도 상세 없음 |
| 기간 마감 | `/accounting/period-close` (`index.tsx:1309`) | 기간 | 화면 내 처리 | 마감/역마감 | 별도 상세 없음 |
| 공급자 프로필 | `/accounting/supplier-profiles` (`index.tsx:1361`) | 사업자/프로필 key | 같은 화면 편집 | 저장 | 별도 상세 없음 |
| 거래처 | `/admin/partners` (`index.tsx:1441`) | 거래처코드 `partnerCode`; 사업자번호도 존재 (`admin/PartnersPage.tsx:239-240`) | 행 클릭 → **4탭 dialog** (`admin/PartnersPage.tsx:111-118,464,502`) | 복원·삭제 (`admin/PartnersPage.tsx:279-324`) | 별도 route가 아니라 dialog 닫기 |
| 품목/견적품목/분류 | `/products/catalog`, `/products/estimate-items`, `/products/classifications` (`index.tsx:1452-1472`) | 모델코드/분류코드 | 품목은 우측 `[편집]` route (`ProductCatalogPage.tsx:200-209`); 나머지는 같은 화면 관리 | 등록·편집·노출/구성품/정렬 | 편집폼의 목록 복귀는 있으나 “상세” 아님 |
| 차단 거래처/알리고 주소록/시트 동기화 | `/admin/blocked-partners`, `/admin/aligo-address-book`, `/admin/sheet-sync` (`index.tsx:1495-1516`) | 거래처/주소록 key | 같은 화면 관리 | 차단/해제·동기화 | 별도 상세 없음 |
| 사용자/역할/부서/창고 admin | `/admin/users`, `/admin/roles`, `/admin/departments`, `/admin/warehouses` (`index.tsx:1538,1545-1547`) | 로그인ID/이름/코드 | modal 또는 같은 화면 관리 | 사용자 편집·권한·이력·비활성 등 (`admin/UsersPage.tsx:216-220,293-294`) | 별도 상세 없음 |
| 권한/그룹/결재선 설정 | `/admin/permission-*`, `/admin/approval-line-config` (`index.tsx:1558-1602`) | role/page/group/employee key | 같은 화면 관리 | 권한 토글·위임·저장 | 별도 상세 없음 |
| 운송사/지역/외부배송사/마감시간/단톡방 | `/admin/carriers`, `/admin/regions`, `/admin/external-carriers`, `/admin/slip-cutoff`, `/admin/chat-rooms` (`index.tsx:1059,1609-1645`) | 코드/이름 | 같은 화면 관리 | CRUD/매핑 | 별도 상세 없음 |
| 회계 요청/앱 공지·활동로그·릴리스 | `/admin/accounting-edit-requests`, `/admin/app-notices`, `/admin/activity-logs`, `/admin/app-releases` (`index.tsx:1665-1703`) | 요청/로그/버전 key | modal 또는 같은 화면 | 승인·거절/CRUD/배포관리 | 별도 상세 없음 |
| 아로로지스 자동/수동/기사 배정 admin | `/arologis/admin/*` (`index.tsx:1141-1160`) | 기사/운송/배차 key | 같은 화면 처리 | 배차 실행·배정 | 별도 상세 없음 |
| 품목별 DPS | `/warehouse/dps-compare/by-product` (`index.tsx:1761`) | 품목/모델코드 | 분석 표 | 필터/CSV | 별도 상세 없음 |

## ② 번호 컬럼이 없는 화면 목록

판정하지 않는다. 후보 link text만 적어 PM이 개발책임자께 올릴 수 있게 한다.

| 화면군 | 현재 보이는 업무 식별자 후보 | 판단이 필요한 이유 |
|---|---|---|
| 거래처 | 상호, 거래처코드, 사업자번호 | 상세가 route가 아니라 4탭 dialog이며 어느 값을 primary link로 삼을지 제품 결정 필요 |
| 품목 | 모델코드, 품목명 | 현재 목적지가 “상세”가 아닌 편집 route라 view 권한 사용자 계약과 충돌 가능 |
| 사용자 | 로그인ID, 이름 | 상세가 여러 modal(편집/권한/이력/서명)로 분산되어 단일 목적지가 없음 |
| 창고/운송사/지역/외부배송사/단톡방 | 각 코드 또는 이름 | 단일 상세 route 없이 inline CRUD |
| 계정과목/분류/권한그룹/결재선 | 코드 또는 이름 | 설정 화면이며 문서 상세 개념이 없음 |
| 알림·활동로그·앱공지·릴리스 | 제목/시각/버전 | 번호 하이퍼링크 지시의 “전표나 문서” 범위인지 결정 필요 |
| 분석·집계 보고서 | 계정코드/거래처코드/일자 | 행이 독립 문서가 아니며 연결할 canonical 상세가 없음 |
| messenger/배차 보드 | 대화방명/전표번호 카드 | master-detail 한 화면이라 browser back 계약이 맞지 않음 |

## ③ 화면별 목록 상태 보존 방식

### 결론

- **URL에 목록 상태를 완전하게 둔 목록은 찾지 못했다.** `useSearchParams`를 실제 목록 입력에 쓰는 곳은 극소수이고 대부분 전달/초기화 일부만 담당한다.
- React Query cache는 서버 응답을 재사용할 뿐, 필터 input·선택 row·page·scroll을 복원하지 않는다. 따라서 “cache가 있으니 복원”으로 판정하면 안 된다.
- 고정 목록 경로로 `navigate('/...')`하는 상세 CTA는 history back보다 더 강하게 목록 컴포넌트를 새로 mount하므로 local state를 확실히 잃는다.

| 화면 | 필터/페이지/선택 저장소 | URL query | react-query cache | 현재 복귀 결과 |
|---|---|---|---|---|
| 판매관리 | 컴포넌트 state: 날짜·page·검색·선택 (`sales-query/SalesQueryPage.tsx:197-217`) | 없음 | query key에 상태 포함 (`sales-query/SalesQueryPage.tsx:233`) | 상세 이동 시 필터/page/선택/scroll 소실 |
| 구매관리 | 컴포넌트 state: 날짜·page·검색·선택 (`purchase-query/PurchaseQueryPage.tsx:135-148`) | 없음 | query key 포함 (`purchase-query/PurchaseQueryPage.tsx:167`) | 소실 |
| 판매/구매 legacy 전표 | deliveryTag/dialog local state (`SlipListPage.tsx:161-164`), API page는 0 고정 (`SlipListPage.tsx:178`) | 없음 | 있음 | 필터/scroll 소실; 상세의 고정 `/sales`·`/purchases`는 원 route도 잃음 |
| 견적 | 상태·날짜·거래처 local state (`EstimateListPage.tsx:82-86`) | 없음 | 있음 | 소실; 상세에 복귀 CTA도 없음 |
| 주문서 | 날짜·거래처·상태·검색 local state (`SalesPartnerOrderListPage.tsx:91-102`) | 없음 | 있음 | 소실 |
| 재고이동 | filter/page state 없음, API 0/20 고정 (`TransferListPage.tsx:60`) | 없음 | 있음 | scroll만 소실 |
| 재고실사 | 창고·연도·상태 local state (`InventoryAuditListPage.tsx:70-72`) | 없음 | 있음 | 소실 |
| 분개 | 상태 local state (`JournalListPage.tsx:62`) | 없음 | 있음 | 소실; 상세 복귀 CTA 없음 |
| 세금계산서 | 상태·기간·거래처 local state (`TaxInvoiceListPage.tsx:63-66`) | 없음 | 있음 | 소실; 상세 복귀 CTA 없음 |
| 입금보고서 | page·draft/applied filter local state (`CashReceiptListPage.tsx:86-88`) | 없음 | 있음 | 번호 링크 뒤 상세의 고정 목록 CTA 사용 시 소실 |
| 그룹웨어 결재 | 상태 local state (`GroupwareApprovalListPage.tsx:55`) | 없음 | 있음 | 소실 |
| 회계 주문 | page·draft/applied filter local state (`accounting/admin/OrderListPage.tsx:31-42`) | 없음 | 있음 | 소실 |
| 전표정리 | 기간·tab·복원결과 local state (`SlipCleanupPage.tsx:195-203`) | 없음 | 있음 | 원본 전표 상세에서 고정 `/sales`로 가므로 정리 맥락 전부 소실 |
| 입고검수 | 상태·선택 dialog local state (`InboundInspectionListPage.tsx:53-54`) | 없음 | 있음 | modal이므로 목록은 mount 유지; 닫으면 보존됨 |
| 배차현황 이력 | 기간·상태·page·modal local state (`DispatchHistoryPage.tsx:43-48`) | 없음 | 있음 | modal 닫기 시 보존됨 |
| 배차 보드 | board 일부를 `useSearchParams`로 읽음 (`DispatchBoardPage.tsx:66`) + store/component state 혼합 | 일부 | 있음 | modal/board 내부 이동은 보존; 별도 전표 상세 route로 나가면 별도 설계 필요 |
| 아로로지스 가배차 | tab·기간·모드 local state (`ArologisPreClassifyPage.tsx:100-111`) | 없음 | 있음 | 외부 route 이동 시 소실 |
| 아로로지스 미배차 | 일자 local state (`ArologisUnassignedPage.tsx:79`) | 목적지 manual에만 `date/slipNo` 전달 (`ArologisUnassignedPage.tsx:92-100`) | 있음 | 돌아오면 원 일자/scroll 소실 |
| 아로로지스 수동배차 | form local state + `useSearchParams` 초기 입력 (`ArologisManualDispatchPage.tsx:42,182`) | 일부 입력만 | 있음 | source 목록 복귀정보 없음 |
| 사진 감사 | draft/committed filter와 page local state (`PhotoAuditPage.tsx:177-182`) | 없음 | 있음 | route 이탈 시 소실 |
| 시리얼 보상 실패 | showAll·page·dialog local state (`CompensationFailuresPage.tsx:126-130`) | 없음 | 있음 | dialog 닫기는 보존; route 이탈은 소실 |
| 거래처 | q·상태·유형·page·dialog local state (`admin/PartnersPage.tsx:103-118`) | 없음 | 있음 | dialog 닫기 시 보존 |
| 품목 | 검색·page local state (`ProductCatalogPage.tsx:98-100`) | 없음 | 있음 | 편집 route 왕복 시 소실 |
| 사용자 | 검색·role·상태·부서·page·modal local state (`UsersPage.tsx:209-220`) | 없음 | 있음 | modal 닫기 시 보존 |
| 알림 이력 | page·size·채널·미확인 local state (`NotificationHistoryPage.tsx:24-27`) | 없음 | 있음 | route 이탈 시 소실 |
| 견적품목 | `useSearchParams`가 `mode/returnTo` 등 진입 맥락을 사용 (`EstimateItemsCatalogPage.tsx:1133,1180,1355`) + 나머지 local state | 일부 | 있음 | query에 없는 필터/page/scroll은 소실 |
| 거래처원장/Statement batch | 인쇄 route에 query를 직렬화 (`PartnerLedgerPage.tsx:342-359`, `StatementBatchPage.tsx:154-165`) | 인쇄 입력만 | 있음 | 인쇄 목적에는 충분; 원본 목록 UI state 전체 복원 계약은 아님 |
| 그 밖 ①-B 목록 | 모두 component `useState` 또는 화면 내부 선택; `useSearchParams` 검색 결과 없음 | 없음 | 화면별 있음/없음 | route 이탈 시 필터/page/scroll 소실 |

### 상태 보존 표준 후보

1. 필터와 page는 URL query를 정본으로 둔다. 링크의 브라우저 기본 history가 그대로 복원한다.
2. scroll은 URL에 픽셀값을 넣지 않고 목록 route의 `location.key`별 `scrollY` 또는 행 anchor를 `sessionStorage`/전역 navigation store에 저장하고 mount 후 복원한다.
3. 상세의 CTA는 고정 목록 path가 아니라 `location.state.returnTo`(path+search) 우선, 없으면 canonical 목록 fallback을 쓴다.
4. 새 탭 직접 진입/새로고침에는 state가 없으므로 canonical 목록 fallback이 반드시 남아야 한다.

이는 구현안 후보일 뿐이며 최종 선택은 ⑦ 질문 3에 둔다.

## ④ 이미 하이퍼링크인 화면 · 표준 후보

### 1순위: 입금보고서 목록

- `CashReceiptListPage.tsx:145-156`: `slipNo` 열의 표시값 자체를 React Router `<Link to="/accounting/admin/cash-receipts/:id">`로 렌더한다.
- 좋은 점: 실제 `<a>`라서 Tab focus, Enter, 새 탭/주소 복사/브라우저 상태표시가 기본 제공된다. 행 클릭에 의존하지 않는다.
- 계약 테스트:
  - unit `CashReceiptListPage.test.tsx:49-57`: 표시 번호와 `href`를 직접 고정.
  - Playwright `playwright/cash-receipt-list/cash-receipt-list.spec.ts:29-41`: 실제 link의 visibility와 `href`를 고정.
- 부족한 점: 링크 accessible name이 표시 번호뿐이고 `aria-label`은 없다. 또한 목록 상태가 local state라 상세의 고정 목록 CTA로 돌아오면 필터/page/scroll을 잃는다.

### 보조 후보

- `TaxInvoiceDetailPage.tsx:711-722`는 연결 분개를 `<a href=".../#/accounting/journals/:id">`로 제공한다. native anchor 동작 참고는 되지만 HashRouter URL을 직접 조합하므로 목록 표준으로 복제할 후보는 아니다.
- 못 찾음: CashReceipt 외 목록 번호 셀을 `<Link>`로 렌더하면서 상세 route로 이동하는 구현. 찾아본 경로는 `clients/desktop/src/renderer/routes/**/*.tsx`의 `<Link`, `href`, 번호 header/field 전수 검색이다.

## ⑤ 접근성 계약과 관련 spec 전수

### 현재 계약

- 판매/구매 우측 상세 버튼은 `aria-label="${slipNo} 상세 보기"`를 가진다 (`SalesQueryPage.tsx:330-335`, `PurchaseQueryPage.tsx:221-226`). 소스 계약 Playwright도 이를 문자열로 고정한다 (`playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts:113-138`).
- 행 클릭 기반 목록의 공통 `DataTable`은 `<tr onClick>`만 붙인다. `tabIndex`, `role`, `onKeyDown`은 없다 (`clients/web/design-system/src/components/DataTable/DataTable.tsx:150-168`). 따라서 현재 행 클릭은 mouse 접근만 가능하고 keyboard 상세 진입 계약이 없다.
- 입금보고서 링크는 실제 `<a>`이며 unit/Playwright가 `href`를 검증한다(④ 참고).
- 일마감의 `[상세 보기]`는 별도 route가 아닌 disclosure 동작이며 unit test 3곳이 button name을 고정한다 (`DailyClosingPage.test.tsx:1002,1073,1185`). 이 버튼을 번호 링크 규칙으로 무조건 삭제하면 다른 계약이 깨진다.

### 링크 전환 시 지켜야 할 계약

1. semantic `<Link>`/`<a>`를 사용하고 `role="link"`를 중복 선언하지 않는다.
2. accessible name은 `${공개번호} 상세 보기`로 유지한다. 보이는 텍스트는 번호만 두되 `aria-label`로 목적을 보강한다.
3. Tab focus와 Enter는 native link에 맡기고, 공통 focus-visible outline을 제거하지 않는다. Ctrl/Cmd+Enter/click, 새 탭, URL 복사를 막는 `preventDefault`를 두지 않는다.
4. UUID는 link text·aria-label·testid에 넣지 않는다. `href` path param 내부 UUID는 현재 route 계약상 불가피하지만 사용자 표시/accessible name에는 공개 번호만 둔다.
5. 번호 link 클릭이 row click/선택/검수 dialog까지 bubble하지 않도록, 행 click을 제거하는 것이 우선이다. 병행 기간에는 link handler에서 propagation 계약을 명시적으로 검증한다.
6. 삭제/비활성 row는 현재 `rowClickable` 가드를 그대로 보존하고 link도 렌더하지 않거나 `aria-disabled`가 아닌 plain text로 내려야 한다. 견적 삭제행 회귀는 `EstimateListPage.test.tsx:124-156`에 있다.
7. mobile hidden column이 되지 않도록 번호 열의 `mobilePriority='primary'`를 유지한다.

### 관련 테스트/spec 전수 결과

| 파일 | 현재 고정하는 계약 | 이번 구현 때 필요한 변경 |
|---|---|---|
| `CashReceiptListPage.test.tsx:49-57` | 번호 link text/href | 표준 reference로 유지; accessible name/keyboard 추가 |
| `playwright/cash-receipt-list/cash-receipt-list.spec.ts:29-41` | 번호 link visibility/href | 표준 reference로 유지; 상세→복귀 state 검증 추가 |
| `playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts:113-138` | 판매/구매 우측 상세 button testid/navigate/aria-label | 번호 link/href 계약으로 교체; `[상세]` 부재와 인쇄·삭제·검수 보존 단언 |
| `EstimateListPage.test.tsx:124-156` | 삭제행 row click 차단 | 삭제행 번호 link도 없음을 추가 |
| `DailyClosingPage.test.tsx:1002,1073,1185` | disclosure `[상세 보기]` button | route 상세가 아니므로 유지 여부를 질문 2 결정 뒤 처리 |
| `playwright/compensation-failures/compensation-failures.spec.ts:58-119` | 전표번호와 해결 dialog | 번호 link로 오인해 해결 CTA를 삭제하지 않는 회귀 필요 |
| `playwright/dispatch-completed-history/dispatch-history-real-qa.spec.ts:87` | modal 상세 전표번호 표시 | modal 유지/route 전환 결정에 따라 보강 |

못 찾음: 브라우저 back 후 필터·page·scroll 세 축을 함께 단언하는 공통 spec. 찾아본 경로는 `clients/desktop/src/**/*.{test,spec}.ts(x)`와 `clients/desktop/playwright/**/*.spec.ts`에서 `뒤로`, `목록으로`, `scroll`, `history`, `navigate(-1)` 전수 검색이다.

## ⑥ 슬라이스 제안

### 권고: **PR은 #1105 한 건으로 유지하되, 내부 구현/게이트를 4개 슬라이스로 순차화**

“전 화면 공통” 불변식은 중간 PR 하나만 머지되면 깨진다. 반면 한 번에 모든 파일을 바꾸고 마지막에 검증하면 상태복원 결함을 찾기 어렵다. 따라서 통합 PR 안에서 아래 순서로 commit/checkpoint를 나누는 방식을 권고한다.

1. **S2 공통 복귀 계약 + reference 구현**
   - returnTo(path+search), scroll anchor 저장/복원, 번호 link 접근성 helper/test.
   - 게이트: CashReceipt reference + browser back/상세 CTA 양쪽에서 filter/page/scroll 복원; 새 탭 direct detail canonical fallback.
2. **S3 canonical 별도 상세 route 10계열**
   - 판매/구매(통합+legacy), 견적, 주문서, 재고이동, 재고실사, 분개, 세금계산서, 결재, 회계 주문/입금.
   - 게이트: 모든 번호 link·`[상세]` 제거·동일 자리 삭제/인쇄/검수/복원 보존·각 상세 back 존재.
3. **S4 운영 projection/원본 링크 화면**
   - 전표정리, 원장/분개현황/마감, 배차/아로로지스, 사진감사, 수정요청, DPS, 보상실패.
   - 게이트: API row가 canonical 상세에 필요한 `id + type + publicNo`를 가진 화면만 연결. 정보가 없으면 추측 link 금지하고 계약 보강을 별도 RED로 둔다.
4. **S5 번호 없는 master-detail 화면**
   - 거래처/품목/사용자/창고/설정 화면. ⑦ 질문 1·2 결정 뒤만 착수.
   - 게이트: view와 edit 권한 분리, modal 닫기 vs browser back 계약, inline CRUD 보존.

최종 PR gate는 (a) ① 표의 각 행이 구현됨/의도적 제외/질문 대기 중 하나로 0개 미분류, (b) 관련 unit+mock Playwright, (c) 실제 한국어 화면에서 filter/page/scroll 왕복, (d) `[상세]` 제거가 다른 행 동작을 지우지 않았다는 전수 단언이다.

## ⑦ 개발책임자께 올릴 질문

### Q1. 번호 없는 master 목록의 link text와 목적

- (a) **별도 read 상세가 있는 화면만 이름/코드를 link로 만들고, inline CRUD·설정 화면은 이번 규칙에서 제외** — 권고. 범위가 “전표나 문서 상세”와 일치하고 edit 권한 누수를 막는다.
- (b) 품목=모델코드, 거래처=거래처코드, 사용자=로그인ID를 각각 기존 edit/modal에 link — 더 통일돼 보이지만 “상세”가 편집 동작이 되어 view 사용자와 충돌한다.
- (c) 전부 read-only 상세 route를 새로 만든 뒤 link — 가장 일관되지만 신규 IA/API/권한/QA가 커져 #1094 범위를 크게 넘는다.

### Q2. 같은 화면 modal/disclosure도 “상세” 공통 규칙에 포함할지

- (a) **포함하되 번호 link가 modal/disclosure를 열고, browser back 대신 접근 가능한 `[닫기]`가 복귀 계약** — 권고. 입고검수·거래처·배차이력의 기존 상태 보존 장점을 유지한다.
- (b) 별도 상세 route로 모두 전환 — URL 공유/뒤로가기는 명확하지만 route/API/레이아웃 신설 비용이 크다.
- (c) modal/disclosure는 이번 규칙에서 제외 — 가장 작지만 “전 화면 공통”에서 예외가 많이 생긴다.

### Q3. 목록 상태 보존 정본

- (a) **필터/page=URL query, scroll=history entry별 session store, 상세 CTA=returnTo 우선** — 권고. 새로고침·주소 공유와 scroll 복원을 함께 만족한다.
- (b) 전역 Zustand store에 화면별 상태 보존 — 구현량은 줄 수 있으나 새로고침/URL 공유가 안 되고 stale state 정리 규칙이 필요하다.
- (c) 목록 컴포넌트를 route 밖에 keep-alive — scroll까지 자연스럽지만 메모리·query lifecycle·동시 편집 갱신 복잡도가 가장 크다.

### Q4. 원장/배차/감사처럼 번호는 있으나 canonical 상세 id/type이 없는 projection

- (a) **API가 `publicNo + documentType + detailId`를 줄 때만 link; 없는 화면은 계약 보강 후 적용** — 권고. 잘못된 판매/구매 상세 연결을 막는다.
- (b) 번호 형식/현재 메뉴로 대상 route 추론 — 빠르지만 같은 번호 공간·매입/매출 혼동 시 오진입 위험이 있다.
- (c) 번호를 검색 query로 목록에 넘김 — 상세 직접 진입 요구는 약해지지만 backend 변경 없이 안전한 fallback이다.

## ⑧ 새로 만든 파일 목록 (`git status --porcelain`)

이 라운드에서 허용된 신규 파일은 아래 1건뿐이다.

```text
?? docs/dev-reports/2026-08-07-1094-s1-list-screen-inventory.md
```

코드 수정, `git add`, commit, push는 하지 않았다.
