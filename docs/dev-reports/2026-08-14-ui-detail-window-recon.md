# 상세 새 창 · 목록 날짜 열 · 라인 입력줄 정찰 (2026-08-14)

## 0. 판정 범위와 결론

- 정본: `docs/decisions/2026-08-14-detail-window-and-list-columns.md:1-103`. 확정된 네 결정은 다시 미결로 올리지 않았다.
- 정적 전수 범위: `clients/desktop/src/renderer`와 `clients/arologis-desktop/src/renderer`의 운영 TS/TSX, `clients/internal-chat-desktop/src`, 날짜 열을 실제로 만드는 Excel export 서비스와 인쇄 컴포넌트. 테스트·story·golden HTML의 중복 문자열은 화면 수에서 제외했다.
- 기존 이슈 대조: CLOSED `#1094`는 “전 화면 공통”을 요구했지만 종료 코멘트에서 확인한 화면은 견적·주문·입금보고서 3개뿐이다. 현 코드에는 번호 평문이 여전히 다수다. OPEN `#894`는 “독립 페이지/별도 창”까지 정했지만 Electron `BrowserWindow`인지 같은 창의 독립 라우트인지는 미확정으로 남겼다.
- 핵심 결론:
  1. 번호 날짜와 실제 열 날짜가 같은 **확정 삭제 후보 16표면**, 의미가 다른 **유지 24표면**, 같은지 코드만으로 단정할 수 없는 **미결 6표면**을 찾았다. 같은 컴포넌트의 탭/CSV/인쇄를 각각 사용자 표면으로 세었다.
  2. `SlipNumberDisplay`를 목록에서 쓰는 곳은 `SlipListPage` 한 컴포넌트(출고·입고 2메뉴), `OrderNumberDisplay`는 주문 목록 한 곳뿐이다. 나머지는 대부분 평문이다.
  3. 정본이 직접 열거한 9개 메뉴를 기준으로 현재 상세 진입은 **페이지 이동 7, 모달 0, 새 창 0, 상세 진입 자체 없음 2**다. 배차보드의 출고전표 보조 상세까지 넣으면 모달 1이 추가된다.
  4. 삭제 대상 배지는 상태/세트/재고가 아니라 **단가 출처(`거래처 최근단가`/`판매가`)와 `단가 변경` 상태**다. 우측 합계열은 라인 VAT 포함 합계와 공급가액·VAT 분해값을 보여준다. 다만 전표/견적 모두 하단 총합이 있어 문서 총액은 남는다.
  5. 사내 메신저의 현행 구현은 방별 `BrowserWindow`가 아니다. 단일 420×720 창 + tray hide/show다. 삼한 데스크톱도 내부 `window.open`을 전부 거절하는 단일 `BrowserWindow`라서 새 창은 기존 참고 구현의 단순 복사가 아니라 main/preload/IPC/창 registry가 필요한 플랫폼 작업이다.

---

## ① 작성일 계열 열 전수

### ①-A. 번호가 날짜를 품어 삭제가 확정되는 표면

`삭제 대상`의 괄호는 열을 지울 때 함께 보존해야 하는 의존성이다. “필터 유지”는 날짜 열을 숨겨도 기간 검색 자체는 계속 제공해야 한다는 뜻이다.

| 화면 | 열 라벨 | 그 화면의 번호가 날짜를 품는가 | 삭제 대상인가 |
|---|---|---:|---|
| 견적서 관리 — 자체 견적 탭 | 작성일 | 예. 견적번호는 `yyyy/MM/dd-N` (`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/domain/EstimateNumberSequence.java:22`) | **예**. 번호 링크/날짜 열은 `EstimateListPage.tsx:260-339`. 기간 필터는 별도 계약이므로 유지(`EstimateListPage.tsx:8`) |
| 견적서 관리 — 통합 탭의 자체 견적·주문 행 | 작성일 | 예. `documentNo`가 견적번호/주문번호 (`estimateUnifiedListModel.ts:108-135`) | **예, 단 행 종류별**. 웹 snapshot/draft는 아래 미결. 한 열에 혼합되어 있어 무조건 열 삭제는 금지 (`EstimateListPage.tsx:428-466`) |
| 견적서 관리 — 출처별 탭의 자체 견적·주문 행 | 작성일 | 예 (`estimateSourceSeparatedListModel.ts:91-141`) | **예, 단 행 종류별**. 웹 원천과 혼합 (`EstimateListPage.tsx:494-533`) |
| 세금계산서 목록 | 작성일 | 예. 회계 문서번호도 `yyyy/MM/dd-N` 표준 (`.claude/memory/feedback_slip_order_number_format.md:17`) | **예**. 공급일 기간 필터는 유지 (`TaxInvoiceListPage.tsx:64-76,88-125`) |
| 매출 회계전표 목록 | 일자 | 예. `slipNo`와 `slipDate` (`SalesAccountingSlipPage.tsx:59-63`) | **예**. from/to 기간 검색은 유지 (`SalesAccountingSlipPage.tsx:36-46,124-125`) |
| 매입 회계전표 목록 | 일자 | 예. 판매 쪽과 같은 계약 (`PurchaseAccountingSlipPage.tsx:59-63`) | **예**. from/to 기간 검색은 유지 (`PurchaseAccountingSlipPage.tsx:36-46,124-125`) |
| 세금계산서 일괄발행 후보 | 일자 | 예. 후보의 매출전표번호가 날짜 포함 | **예**. 발행월은 별도 업무값이라 유지 (`TaxInvoiceBatchIssuePage.tsx:60-94`) |
| 매입 세금계산서 등록 — 매입전표 후보 | 일자 | 예 | **예**. 하단 수신 세금계산서의 `수신일`은 별개라 유지 (`TaxInvoiceInboundPage.tsx:68-114`) |
| 판매조회 grid | 출고일자 | 예. 판매번호=`slipNo` (`sales-query/SalesQueryPage.tsx:297-315`) | **예**. 날짜는 검색 필드이며 Excel에도 현재 `전표일자`가 있으므로 필터 유지·Excel 헤더 제거 필요 (`SalesQueryPage.tsx:437-439`; `SlipExcelExportService.java:58-67`) |
| 구매조회 grid | 전표일자 | 예. 구매번호=`slipNo` (`purchase-query/PurchaseQueryPage.tsx:192-204`) | **예**. 날짜 필터 유지·공용 전표 Excel 헤더 제거 필요 |
| 전표정리 | 전표일자 | 예. 같은 행의 전표번호 | **예**. 화면 CSV가 전표일자도 내보내므로 CSV 헤더/행 동시 수정 (`SlipCleanupPage.tsx:109-126,480-500`) |
| 분개장 | 일자 | 예. 분개번호 `yyyy/MM/dd-N` (`Journal.java:67-71`) | **예**. 화면에는 기간 필터가 없지만 BE/Excel 정렬이 `journalDate DESC`이며 Excel `분개일자`를 내보낸다. 정렬 유지·Excel 열만 제거 (`JournalListPage.tsx:80-92,168-172`; `JournalExcelExportService.java:39-48,60-62`) |
| 총계정원장 | 일자 | 예. 같은 행에 분개번호 (`GeneralLedgerPage.tsx:65,182`) | **예**. CSV와 조회 기간은 유지 (`GeneralLedgerPage.tsx:353,480`) |
| 거래처원장 라인 | 일자 | 예. 같은 행에 분개번호 (`PartnerLedgerPage.tsx:773-855`) | **예**. 화면 CSV도 `[일자, 분개번호,…]`이므로 CSV 열 제거 필요 (`PartnerLedgerPage.tsx:170-178`) |
| 전표 목록 Excel | 전표일자 | 예. 바로 앞 열이 전표번호 | **예**. 단 export 조회·정렬의 `from/to`, `slipDate DESC`는 유지 (`SlipExcelExportService.java:58-67,77-79,108-119`) |
| 분개 목록 Excel | 분개일자 | 예. 바로 앞 열이 분개번호 | **예**. 기간 필터와 정렬 유지 (`JournalExcelExportService.java:39-48,54-62`) |

### ①-B. 번호의 날짜와 열 날짜가 다르거나 번호가 없어 유지하는 표면

| 화면 | 열 라벨 | 그 화면의 번호가 날짜를 품는가 | 삭제 대상인가 |
|---|---|---:|---|
| 입금보고서 목록 | 거래일 | 보고서번호는 날짜를 품지만 이 열은 실제 거래일이자 필터/정렬 기준 | **아니오**. 보고서번호 채번일과 거래일이 같은지 강제하는 불변식 확인 전 삭제 금지 (`CashReceiptListPage.tsx:172-175,219-225`; `CashReceiptService.java:448-474`) |
| 영업수수료 정산서 | 정산 기준일 | 확정 문서번호가 날짜 포함, DRAFT는 번호 없음 | **아니오**. DRAFT 식별/생성 입력에 필요 (`SalesCommissionSettlementListPage.tsx:64-85,112-138`; `SalesCommissionSettlement.java:148-163`) |
| 그룹웨어 결재 목록 | 요청일 | 결재번호에서 날짜를 다시 파싱하지만 요청일은 workflow 값 | **아니오**. 현 코드는 별도 필드가 아니라 번호에서 파생 (`GroupwareApprovalListPage.tsx:43-44,107-113`) |
| 재고실사 목록 | 실사일자 | **아니오일 수 있음**. 번호는 생성 당일 `now()`, 실사일자는 요청값 (`InventoryAuditService.java:143-144`) | **아니오**. 번호 날짜=문서 발행일, 열=실사 기준일 |
| 받을어음 | 발행일 / 만기일 | 어음번호가 날짜를 품는 표준 없음 | **아니오** (`NotesReceivablePage.tsx:168-169`) |
| 자금현황 | 일자 | 문서번호 열 없음 | **아니오** (`FundsStatusPage.tsx:197-205`) |
| 월별 요약 상세 | 일자 | 집계 행 번호 없음 | **아니오** (`MonthlySummaryPage.tsx:137`) |
| 월마감/매출마감 상세 | 기간 일자 / 마감 시각 | 마감 workflow 행이며 전표번호 행이 아님 | **아니오** (`MonthEndClosingPage.tsx:275,326`; `SalesClosingPage.tsx:277,312`) |
| 일마감 목록 | 마감일 | 번호의 중복 날짜 열이 아니라 마감 단위 | **아니오** (`DailyClosingPage.tsx:129`) |
| 매출마감 세금계산서 행 | 기간 일자(상단) | 행의 세금계산서번호와 직접 대응하지 않는 조회/마감 기준 | **아니오** (`SalesClosingPage.tsx:372,408-418`) |
| 회계 관리자 원장 | 거래일 | 원장 거래 자체의 키 | **아니오** (`accounting/admin/LedgerList.tsx:86,209`) |
| 아로로지스 현금출납부 | 일자 | 문서번호 열 없음 | **아니오** (`arologis-desktop/.../CashbookPage.tsx:126,520`) |
| 수동배차/카카오 자동매칭 | 배차 일자 / 등록 일시 | 배차 업무시각이며 전표 문서번호 행이 아님 | **아니오** (`ManualDispatchAdminPage.tsx:174-203`; `KakaoAutoDispatchPage.tsx:146-175`) |
| 배차 저장이력 4종 | 작성시각 | 저장 이력에 문서번호 없음 | **아니오** (`DispatchSmsHistoryTab.tsx:142`; `DpsHistoryTab.tsx:92`; `SlipCleanupHistoryTab.tsx:126`; `arologis-desktop/.../HistoryTab.tsx:151`) |
| 배차이력 | 배차일 | 배차 task 업무일 | **아니오** (`dispatch-board/DispatchHistoryPage.tsx:83`) |
| 연동배차 목록 | 배송일 | batch 업무일 | **아니오** (`LinkDispatchListPage.tsx:93`) |
| 입고검수 목록 | 입고일 | 전표번호 날짜가 아니라 실제 검수/입고 workflow 값 | **아니오** (`InboundInspectionListPage.tsx:100`) |
| 앱 릴리스/활동로그/알림/실패보상 | 배포 일시 / 시각(KST) / 발생 시각 / 발생일시 | 문서번호 없음 | **아니오** (`AppReleaseManagementPage.tsx:221`; `ActivityLogPage.tsx:101`; `NotificationHistoryPage.tsx:47`; `CompensationFailuresPage.tsx:315`) |
| 계정 수정요청/전표 수정요청/주문 승인 | 요청 시각 / 승인 요청 일시 | workflow 감사시각 | **아니오** (`AccountingEditRequestsPage.tsx:185`; `SlipEditRequestsPage.tsx:233`; `SalesOrderApprovalsPage.tsx:190`) |
| 카드/예금주 매핑/사용자/직원 | 등록시각 / 수정·변경일시 / 변경 시각 / 입사일 | 마스터 목록 | **아니오** (`BankCardAdminPage.tsx:198`; `DepositorMappingPage.tsx:196,478`; `UsersPage.tsx:1489`; `arologis-desktop/.../EmployeesPage.tsx:120,636`) |
| 품목 단가 예약/마감설정 | 적용일 / 마감시각 | 설정 마스터 | **아니오** (`ProductPriceSchedulePage.tsx:170`; `SlipCutoffConfigPage.tsx:256`) |
| 사진감사 | 촬영시각 / 업로드시각 | 전표번호 날짜와 다른 증거 시각 | **아니오** (`PhotoAuditPage.tsx:331-336`) |
| 홈택스 제외 거래처 | 등록일시 | 거래처 마스터의 제외 등록시각 | **아니오** (`HometaxExportPage.tsx:889`) |
| 거래명세 일괄 인쇄의 라인 | 일자 | 한 batch에 여러 전표·거래행이 섞일 수 있는 거래일 | **아니오** (`StatementBatchView.tsx:368`) |
| 거래처 채권연령 | 가장 오래된 일자 | 연체 계산의 본질 값 | **아니오**. CSV/인쇄에도 필요 (`PartnerAgingPage.tsx:122,387`; `PartnerAgingPrintLayout.tsx:235`) |

### ①-C. 임의 판정 금지 — 개발책임자 확인이 필요한 표면

| 화면 | 열 라벨 | 그 화면의 번호가 날짜를 품는가 | 삭제 대상인가 |
|---|---|---:|---|
| 견적 통합/출처별의 웹 snapshot·web draft | 작성일 | `documentLabel` 형식이 API 외부 원천값이라 날짜 포함이 보장되지 않음 (`estimateUnifiedListModel.ts:143-169`) | **미결**. 자체 견적·주문 행과 한 열을 공유하므로 행별 숨김도 불가. 탭 분리/번호 포맷 보장 중 어느 계약을 택할지 질문 필요 |
| 아로로지스 배차 대조 | 일자 | 전표번호는 날짜 포함이나 열은 `dispatchDate`; 동일 날짜라는 불변식 확인 안 됨 | **미결**. CSV도 일자를 내보냄 (`arologis-desktop/.../DispatchReconcilePage.tsx:334-339,730-776`) |
| 삼한 내 아로로지스 배차 대조 | 일자 | 위와 동일 | **미결** (`ArologisDispatchReconcilePage.tsx:263-268,654-698`) |
| 재고수불부 | 일자 | 입출고·이동·실사·전일재고·합계가 한 표에 혼합. 번호 없는 합계행도 있음 | **미결**. 전표행만 날짜를 비우면 열 자체는 남아야 한다 (`StockLedgerModal.tsx:52-69`) |
| 견적서 인쇄 | 작성일 | 자체 견적번호는 날짜 포함 | **삭제 방향은 확정이나 인쇄 문서의 법정/업무 메타 유지 여부 미결**. 번호와 작성일을 함께 인쇄 (`QuoteView.tsx:7,110`) |
| 세금계산서/거래명세/출고 인쇄 공통 | 작성일자 / 발행일 | 번호는 날짜 포함하지만 공급일·발행일이 세무 의미를 가질 수 있음 | **미결**. 목록 중복 제거 결정을 법정 증빙 인쇄 메타까지 확장하는지 확인 필요 (`TaxInvoiceView.tsx:19,161,283-285`; `InvoiceView.tsx:8,92`; `PrintLayout.tsx:148-162`; `SalesInvoicePrintPage.tsx:109`) |

### ①-D. 삭제 시 실제로 깨지는 것

| 의존성 | 발견 | 안전한 처리 조건 |
|---|---|---|
| 정렬 | 전표 Excel은 `slipDate DESC`, 분개 Excel은 `journalDate DESC`; 현금보고서는 `transactionDate DESC`; 원장은 date+journalNo 순 (`SlipExcelExportService.java:119`; `JournalExcelExportService.java:61`; `CashReceiptService.java:474`; `JournalRepository.java:93`) | **표시 열만 제거하고 query/orderBy는 제거하지 않는다.** 번호 문자열 정렬로 바꾸면 월/일/순번 정렬 계약이 달라질 수 있음 |
| 필터·기간 검색 | 세금계산서, 매출·매입 회계전표, 판매/구매조회, 견적 원천 탭, 원장 export가 날짜를 사용 | **필터 UI와 API 파라미터를 유지한다.** “열 삭제”를 “날짜 조건 삭제”로 확장하지 않는다 |
| Excel/CSV | 공용 전표 Excel `전표일자`, 분개 Excel `분개일자`, 전표정리 CSV `전표일자`, 거래처원장 CSV `일자`, 아로로지스 대조 CSV `일자` | 번호와 같은 날짜인 확정 후보만 export 열 제거. 대조/수불부는 미결 해소 전 유지 |
| 인쇄 | 견적·세금계산서·거래명세·출고문서·회계 보고서에 작성/발행일 메타 존재 | 회계 보고서의 `작성일`은 문서번호가 없으므로 유지. 증빙 인쇄의 공급일/발행일은 별도 결정 전 유지 |

---

## ② 번호 하이퍼링크 전수

### ②-A. design-system 번호 컴포넌트 사용처

| 컴포넌트 | 목록에서 쓰는 곳 | 상세에서 표시용으로만 쓰는 곳 | 판정 |
|---|---|---|---|
| `SlipNumberDisplay` | `SlipListPage` 출고·입고 2메뉴 (`SlipListPage.tsx:65,213-228`) | `SlipDetailPage` 헤더 (`SlipDetailPage.tsx:3975`) | 목록 사용은 사실상 1개 컴포넌트뿐. 판매조회·구매조회·회계전표·수불부·배차 화면은 미사용 |
| `OrderNumberDisplay` | `SalesPartnerOrderListPage` (`SalesPartnerOrderListPage.tsx:18,255-262`) | `SalesPartnerOrderDetailPage` (`SalesPartnerOrderDetailPage.tsx:18,762`) | 주문서는 목록 링크까지 연결됨 |

### ②-B. 번호 자체가 링크여서 상세 진입이 되는 화면

| 화면 | 번호 렌더 | 현재 동작 | 근거 |
|---|---|---|---|
| 출고전표 목록 | `SlipNumberDisplay` | 번호 셀 클릭/행 클릭 → 같은 창 상세 페이지 | `SlipListPage.tsx:213-228,479` |
| 입고전표 목록 | `SlipNumberDisplay` | 번호 셀 클릭/행 클릭 → 같은 창 상세 페이지 | 같은 컴포넌트의 `mode=INBOUND` |
| 견적 자체 목록 | 평문 `Link` | 번호 링크 → 상세 페이지 | `EstimateListPage.tsx:260-281` |
| 견적 출처별 — 자체 견적 | 평문 `Link` | 번호 링크 → 상세 페이지 | `EstimateListPage.tsx:494-506` |
| 주문서 목록 | `OrderNumberDisplay` 안의 `Link` | 번호 링크 → 상세 페이지 | `SalesPartnerOrderListPage.tsx:255-262,414` |
| 입금보고서 목록 | 평문 `Link` | 번호 링크 → 상세 페이지 | `CashReceiptListPage.tsx:187-190` |
| 영업수수료 정산서 | 평문 `Link` | 문서번호 링크 → 상세 페이지 | `SalesCommissionSettlementListPage.tsx:64-76` |
| 재고수불부 | 평문 `button` | 전표번호 버튼 → 같은 창 상세 페이지 | `StockLedgerModal.tsx:52-53`; 호출부 `InventoryStockBalancePage.tsx:446-448` |

### ②-C. 상세는 열리지만 번호가 링크가 아닌 화면

| 화면 | 번호가 현재 어떻게 보이는가 | 상세 진입 방식 | 근거 |
|---|---|---|---|
| 세금계산서 목록 | 평문 `<span>` | 행 클릭 | `TaxInvoiceListPage.tsx:88-101,272` |
| 분개장 | DataTable 기본 평문 | 행 클릭 | `JournalListPage.tsx:80-92,208` |
| 재고이동 | DataTable 기본 평문 | 행 클릭 | `TransferListPage.tsx:63-98,145` |
| 재고실사 | DataTable 기본 평문 | 행 클릭 | `InventoryAuditListPage.tsx:99-113,224` |
| 그룹웨어 결재 | DataTable 기본 평문 | 행 클릭 | `GroupwareApprovalListPage.tsx:180` |
| 판매조회 | `<Td>{row.slipNo}</Td>` | 우측 `상세 보기` 버튼/행 액션 | `sales-query/SalesQueryPage.tsx:740-741,800-805` |
| 구매조회 | `<Td>{row.slipNo}</Td>` | 우측 `상세 보기` 버튼 | `purchase-query/PurchaseQueryPage.tsx:541-542,574-575` |
| 전표정리 | 평문 `<td>` | 우측 별도 상세 버튼 | `SlipCleanupPage.tsx:480-500,525-526` |

### ②-D. 번호가 평문이고 상세 진입도 없는 화면

| 화면 | 번호 평문 근거 | 비고 |
|---|---|---|
| 매출 회계전표 목록 | `slipNo` 기본 셀 (`SalesAccountingSlipPage.tsx:59-63`) | 액션은 `전기`뿐 (`:92-105`) |
| 매입 회계전표 목록 | 판매 화면과 동일 (`PurchaseAccountingSlipPage.tsx:59-63,92-105`) | 정본의 새 창 대상인데 현 상세 route 자체가 없음 |
| 세금계산서 일괄발행 후보 | `slipNo` 기본 셀 (`TaxInvoiceBatchIssuePage.tsx:60-83`) | checkbox만 있음 |
| 매입 세금계산서 등록 후보/수신 목록 | `slipNo`/`taxInvoiceNo` 기본 셀 (`TaxInvoiceInboundPage.tsx:68-114`) | 상세 링크 없음 |
| 총계정원장/거래처원장 | 분개번호 평문 (`GeneralLedgerPage.tsx:182`; `PartnerLedgerPage.tsx:831-855`) | 상세 링크 없음 |
| 수불부 외 전표검색 결과 — 아로로지스 미배차 | 전표번호 평문 (`ArologisUnassignedPage.tsx:213-250`; 독립 앱 `UnassignedPage.tsx:324-361`) | 버튼은 수동배차 이동이지 전표 상세가 아님 |
| 아로로지스 사전분류 | 전표번호 평문 4표/모바일 (`ArologisPreClassifyPage.tsx:406-416,464-474,597-606,648-657,683-710`) | 상세 없음 |
| 아로로지스 배차대조 | `slipNo` 평문 (`ArologisDispatchReconcilePage.tsx:654-698`; 독립 앱 `DispatchReconcilePage.tsx:730-776`) | 상세 없음 |
| 사진감사 | 전표번호 평문 (`PhotoAuditPage.tsx:331-349`) | 사진 미리보기만 있음 |

**판정:** CLOSED `#1094`의 전 화면 공통 요구는 현재 코드 기준 미완료다. 특히 `SlipNumberDisplay`/`OrderNumberDisplay` 미사용 화면이 누락의 대부분이며, “행 클릭이 되니 번호 링크도 된다”로 세면 안 된다.

---

## ③ 현재 상세가 열리는 방식

### ③-A. 정본이 직접 열거한 9메뉴 기준

| 방식 | 수 | 화면 | 근거 |
|---|---:|---|---|
| 페이지 이동 | **7** | 출고전표, 입고전표, 견적서, 주문서, 세금계산서, 이동전표, 실사 | route 등록 `routes/index.tsx:536,575-576,590-598,646-656,698-714,1458-1474,1789-1805`; 각 목록 navigate/link는 ② 표 참조 |
| 모달 | **0** | 없음 | 정본 9메뉴의 canonical 목록은 전부 route 또는 진입 없음 |
| 새 창 | **0** | 없음 | Electron main이 내부 `window.open`을 거절 (`clients/desktop/src/main/index.ts:75-80`) |
| 상세 진입 자체 없음 | **2** | 매출 회계전표, 매입 회계전표 | 목록에는 `전기` 액션만 있고 상세 route가 없음 (`SalesAccountingSlipPage.tsx:92-105`; `PurchaseAccountingSlipPage.tsx:92-105`) |

### ③-B. 보조/인접 번호 문서 표면을 포함한 확장 집계

| 방식 | 추가 수 | 화면 | 근거 |
|---|---:|---|---|
| 페이지 이동 | **+6** | 분개장, 입금보고서, 영업수수료 정산서, 그룹웨어 결재, 수불부 전표 클릭, 전표정리 | `routes/index.tsx:380,751-759,783,1314-1322`; 수불부/정리 근거는 ② 표 |
| 모달 | **+3** | 배차보드 출고전표 상세, 배차 task 상세, 연동배차 batch 상세 | `DispatchBoardPage.tsx:256`; `DispatchHistoryPage.tsx:316`; `LinkDispatchListPage.tsx:205` |
| 새 창 | **+0** | 없음 | `window.open`은 인쇄에서만 호출되며 Electron main에서 내부 URL을 deny. 상세용 BrowserWindow 생성 코드 0건 |

`StockSlipDetailModal`은 컴포넌트 파일은 있으나 import/사용처가 0건이라 현재 모달 수에 넣지 않았다 (`warehouse/StockSlipDetailModal.tsx:5-10`).

### ③-C. 새 창 전환 시 끊기기 쉬운 기존 계약

| 계약 | 현재 | 새 창에서 필요한 고려 |
|---|---|---|
| 목록 상태 복원 | 견적/주문/입금보고서는 CLOSED #1094에서 scroll/history 복원을 구현. 코드도 `returnTo`/scroll anchor를 전달 (`EstimateListPage.tsx:276-280`; `SalesPartnerOrderListPage.tsx:256-259`) | 창을 닫는 것이 “뒤로가기”를 대체하므로 기존 history 복원과 중복 동작하지 않게 해야 함 |
| 딥링크 | 모든 canonical 상세가 HashRouter route를 가짐 (`routes/index.tsx` 위 근거) | 새 BrowserWindow도 같은 route를 직접 load할 수 있어야 함 |
| 인쇄 | 상세 내부 `window.open` 호출은 현재 Electron에서 deny (`TaxInvoiceDetailPage.tsx:25,320`; `EstimateDetailPage.tsx:249`) | 상세 창 안에서 다시 인쇄할 때 자식 창 정책/현재 창 route 정책을 별도 정의해야 함 |
| 목록 동시 사용 | 현재는 같은 BrowserWindow route 이동이라 목록을 동시에 쓸 수 없음 | BrowserWindow 분리가 정본 불변식 3을 만족하는 직접 경로. 웹 `window.open`만으로는 Electron에서 작동하지 않음 |

---

## ④ 라인 입력줄 배지와 합계열

### ④-A. 후보 컴포넌트와 실제 소비처

| 후보 | 실제 전표 상세/작성 사용 여부 | 실제 역할 | 판정 |
|---|---|---|---|
| `LineRow` | **사용함**. `SlipFormPage`의 desktop 행 (`SlipFormPage.tsx:35,584-635`) | 입·출고전표 작성 라인 | 핵심 대상 |
| `EstimateLineRow` | **운영 소비처 0**. 파일 주석도 story/test 전용이라고 명시 (`EstimateLineRow.tsx:19`) | 향후 견적/주문 표시용 DS 컴포넌트 | 이것만 고쳐서는 실제 견적 화면이 안 바뀜 |
| 견적 실제 desktop 행 | DS 컴포넌트가 아니라 `EstimateFormPage` 인라인 grid (`EstimateFormPage.tsx:2262-2288,2325-2582`) | 견적 작성 라인 | 별도 핵심 대상 |
| `JournalLineRow` | **사용함** (`JournalFormPage.tsx:580-595`) | 분개 라인. 차변/대변 입력 | 배지와 우측 합계열이 애초에 없음. 결정 4의 삭제 대상 아님 (`JournalLineRow.tsx:59-70,83-155`) |

### ④-B. “배지”가 담는 정보

| 표시 | 무엇을 표시하는가 | 삭제하면 사라지는 정보 | 근거 |
|---|---|---|---|
| `거래처 최근단가` | 선택 거래처+품목의 마지막 저장 단가 자동채움(`REMEMBERED`) | 이 값이 사용자 입력인지 과거 거래처 단가 자동채움인지, 저장일 tooltip | `LineRow.tsx:354-373,538-547` |
| `판매가` | 최근단가가 없거나 거래처 미선택 시 제품 마스터 판매가 자동채움(`CATALOG`) | 제품 마스터 자동값인지 사용자 입력인지 | `LineRow.tsx:358-372` |
| `단가 변경` | 거래처 변경 등으로 자동 단가가 실제 바뀐 행 | 사용자가 보던 값이 비동기로 변경됐다는 행 단위 경고 | `LineRow.tsx:468-474` |
| 견적의 같은 두 단가출처 배지 | 위와 같은 `priceStatus.label/description` | 같은 정보와 저장일(모바일은 날짜를 별도 시각 표시) | `EstimateFormPage.tsx:663-686,2494-2506` |
| `품절`, `⚠ 10%와 다름` | 재고상태/세액 이상 경고 | 정본의 “배지”가 이것들까지 뜻하는지 불명확 | `LineRow.tsx:494-516,590-592`; 견적 `EstimateFormPage.tsx:2465,2535` |

**미결:** “배지 삭제”를 단가출처 칩만으로 해석하면 `품절`·VAT 경고는 남는다. 모든 행내 상태표시를 뜻하면 주문오류 방지 정보까지 사라진다. 정본 문맥은 줄바꿈을 만드는 단가출처 칩(`priceMemoryNote`)을 가장 직접적으로 가리키지만, 범위를 개발책임자에게 확인해야 한다.

### ④-C. “가장 우측 합계열”의 값과 대체 확인처

| 화면 | 우측 열이 보여주는 값 | 열 삭제 후 남는 곳 | 정보 손실 판정 |
|---|---|---|---|
| 입·출고전표 `LineRow` | 일반 모드 `수량×단가`; VAT 모드 `합계(VAT포함)` + 작은 글씨 `공급/VAT` (`LineRow.tsx:598-620`) | 폼 하단에 건수·공급가액·부가세·총액 (`SlipFormPage.tsx:2774-2801`) | **문서 총액은 안 사라짐. 개별 행 합계/행별 VAT 분해는 사라짐.** 공급가액·부가세가 별도 입력열로 보이는 VAT 모드에서는 행별 합계만 중복이지만 일반 모드에서는 행별 금액이 완전히 사라질 수 있음 |
| 견적 실제 desktop 행 | editable `lineTotal` + 작은 글씨 `공급/VAT` (`EstimateFormPage.tsx:2537-2563`) | 폼 하단 공급가액·부가세·총합 (`EstimateFormPage.tsx:2605-2631`) | **총액은 남지만 행별 합계가 사라짐. 더 중요하게 현재 견적 합계는 입력 가능하므로 열 삭제는 단순 표시 제거가 아니라 입력 경로 제거** |
| 견적 모바일 카드 | 합계(VAT포함) 입력 + 공급/VAT 요약 (`EstimateFormPage.tsx:690-709`) | 같은 하단 총합 | 정본이 desktop 열만 뜻하는지 모바일 field도 뜻하는지 미결 |
| `EstimateLineRow` | `lineAmount` 소계 표시 (`EstimateLineRow.tsx:41-44,178-181`) | 운영 소비처 없음 | 현행 앱 기능 손실 없음. 향후 DS 계약만 변함 |
| `JournalLineRow` | 우측 합계열 없음 | 부모가 하단 차변합·대변합·차이를 표시 (`JournalFormPage.tsx:598-633`) | 삭제할 대상 없음 |

### ④-D. 여백/줄바꿈의 실제 원인

- `LineRow` grid는 열 사이 독립 `gap`이 아니라 조밀한 CSS grid이고, 단가 input 안에 badge가 들어간다. 배지가 있는 행만 `:has(.priceMemoryNote)`로 input 높이를 다르게 조정한다 (`LineRow.module.css:277-291`). 행별 높이 차이의 직접 원인이다.
- 견적 desktop grid는 `ESTIMATE_LINE_GRID_TEMPLATE`을 공유하지만 `gap`이 없고 단가 칸 아래에 badge/단가변경 표시를 추가한다 (`EstimateFormPage.tsx:220,2264-2288,2494-2506`).
- `JournalLineRow`는 이미 `gap: var(--space-2)`이고 합계열/배지가 없다 (`JournalLineRow.module.css:5-7`).

### ④-E. design-system 회귀 비용

`LineRow` 변경은 design-system 소스 빌드 후 desktop 전체 mock gate까지 포함해야 한다. vitest/typecheck만으로는 debounce·키보드·listbox 행동 회귀를 잡지 못한 전례가 있고, stale `dist`는 수정 미적용/오적용 오판을 만든다 (`.claude/memory/feedback_design_system_playwright_mock_suite.md:7-22,28-39`). 최소 영향 스펙은 라인입력 `1062-line-input-ux` 계열과 LineRow unit/contrast, 광범위 영향이면 `clients/desktop && npx playwright test` 전체다.

---

## ⑤ 새 창 컨트롤 참고 구현

### ⑤-A. 현행 코드 대조

| 앱 | BrowserWindow 구조 | 전체창/축소/닫기 자체 컨트롤 | 방별 창인가 | 근거 |
|---|---|---|---:|---|
| 삼한 데스크톱 | 단일 1280×800 `BrowserWindow`; 다중창은 범위 밖이라고 명시 | 없음. OS frame 사용 | 아니오 | `clients/desktop/src/main/index.ts:26-29,49-80` |
| 아로로지스 데스크톱 | 단일 1280×800 `BrowserWindow` | 없음 | 아니오 | `clients/arologis-desktop/src/main/index.ts:28-29,62-84` |
| 사내 메신저 독립 앱 | 단일 420×720 `BrowserWindow` + tray. 닫기 시 app 종료 대신 hide | 없음 | **아니오** | `clients/internal-chat-desktop/src/main/index.ts:9-24,37-65` |

따라서 “사내 메신저가 방별 BrowserWindow를 이미 쓴다”는 현재 코드와 일치하지 않는다. 재사용 가능한 것은 `BrowserWindow` 기본 보안설정(`contextIsolation`, `nodeIntegration:false`, `sandbox:true`)과 close→hide 생명주기뿐이다. 방별 registry, route별 창 생성, 최대화 상태 감시, 창 컨트롤 IPC는 없다.

### ⑤-B. 관련 이슈/결정과의 관계

- OPEN `#894` 코멘트는 채팅창을 “독립 페이지/별도 창”으로 확정했지만 구현체는 “Electron 별도 BrowserWindow vs 같은 창의 독립 라우트” 미확정이라고 명시했다. 같은 사실이 정찰 보고서에도 남아 있다 (`docs/dev-reports/2026-08-10-1125-s1-recon.md:205`).
- 현재 `clients/internal-chat-desktop`은 그 후속 구현에서도 단일 창이다. 즉 이번 상세창 구현을 메신저 방별 창에서 복사할 수 없다.
- 삼한 desktop main은 `setWindowOpenHandler`에서 모든 내부 open을 deny한다 (`clients/desktop/src/main/index.ts:75-80`). renderer의 `window.open`은 웹 브라우저에서는 탭/창이지만 Electron packaged 앱에서는 새 BrowserWindow가 아니다.

### ⑤-C. Electron BrowserWindow와 웹 브라우저 창의 차이

| 항목 | 웹 `window.open` | Electron `BrowserWindow` |
|---|---|---|
| 현행 동작 | 개발 브라우저에서는 열릴 수 있음 | main에서 명시 생성해야 함. 현행 handler는 deny |
| 인증 | 브라우저 storage/session 공유에 의존 | 같은 session partition을 명시적으로 공유하거나 token 전달 IPC 필요 |
| 컨트롤 | 브라우저/OS chrome을 앱이 정확히 제어 못 함 | `maximize`, `unmaximize`, `close`, `isMaximized`를 main에서 제어 가능 |
| 상태 동기화 | `resize` 추정 | `maximize`/`unmaximize` event를 renderer에 전달 가능 |
| 생명주기 | 브라우저 정책 | 문서 key→window registry, 중복 클릭 focus, 부모 종료/로그아웃 시 정리 필요 |
| 보안 | opener/noopener, URL allowlist | preload 최소화, navigation allowlist, sandbox/session partition, IPC sender 검증 필요 |

**기술 판정:** 정본의 `[전체창]/[축소창]/[닫기]`, 목록 동시 사용, packaged Electron 일관성을 모두 만족시키려면 Electron `BrowserWindow`가 자연스럽다. 그러나 `#894`가 같은 선택을 이미 확정했다는 근거는 없으므로 “기존 구현 재사용”으로 확정하면 안 된다.

### ⑤-D. 미결로 올릴 것

1. 새 상세창에 native frame을 유지하면서 콘텐츠 우측 상단에 버튼을 또 둘지, `frame:false`/custom titlebar로 갈지. 정본은 버튼 배치만 정했지 frame 제거를 정하지 않았다.
2. 같은 문서를 두 번 클릭할 때 기존 창 focus인가 새 창 중복 허용인가.
3. 로그인 만료/로그아웃 때 열린 상세창을 모두 닫을지 재인증 화면으로 바꿀지.
4. 상세창 안의 인쇄는 같은 창 route 전환, 별도 print BrowserWindow, OS print dialog 중 무엇인지.
5. 정본 열거 밖의 분개·입금보고서·그룹웨어 결재·영업수수료 정산·배차 task/batch도 “번호가 있는 문서”에 포함하는지.

---

## 작업 슬라이스 제안 — 큰 순서

한 트랙 안에서 아래 순서로 단계별 진행한다. 슬라이스마다 별도 PR을 만들지 않는다.

| 순위 | 슬라이스 | 범위 | 큰 이유 / 게이트 |
|---:|---|---|---|
| 1 | Electron 상세창 플랫폼 | main/preload IPC, document-window registry, route load, auth/session, 전체창↔축소 상태 event, 닫기, 중복 focus, logout cleanup, packaged 보안 | 현재 참고 구현이 없고 main의 window-open deny 정책을 바꿔야 한다. 잘못되면 dev 브라우저만 되고 packaged 앱은 안 되는 false-green 가능성이 가장 큼 |
| 2 | 번호 링크 + 상세 route 계약 | 정본 9메뉴 우선. `SlipNumberDisplay`/`OrderNumberDisplay` 적용 확대, 평문/행클릭/별도 상세 버튼 제거, 상세 없는 매출·매입 회계전표 2메뉴 계약 신설 여부 | CLOSED #1094 잔여가 넓고, URL UUID 비공개·필터/scroll/history·딥링크가 함께 걸림. 회계전표 2메뉴는 구현 전에 상세의 데이터 원천을 결정해야 함 |
| 3 | 라인 입력줄 | 실제 소비처 `LineRow` + 견적 인라인 grid. 단가출처 정보 대체 위치, 우측 행합계 제거, 입력칸 gap, mobile 범위 | design-system blast radius + Playwright mock hard gate. 견적은 합계가 현재 editable이라 데이터 입력 계약도 바뀜 |
| 4 | 날짜 열·export·인쇄 정리 | ①-A 확정 후보부터 UI 열 제거, 날짜 filter/sort 유지, 공용 Excel/CSV 헤더 정리. ①-C는 결정 후 | 파일 수는 넓지만 기계적. 단 한꺼번에 문자열 삭제하면 filter/sort/export를 같이 죽일 위험. 인쇄 증빙은 별도 결정 전 제외 |
| 5 | 확장 후보 | 분개·입금보고서·정산서·결재·배차/수불부 등 정본 열거 밖 문서 | 범위 결정 후 마지막에 같은 공통 창 계약으로 흡수 |

## 개발책임자에게 확인할 질문

1. “배지 삭제”는 **단가출처/단가변경 표시만**인가, `품절`·`VAT 10%와 다름` 같은 행내 경고도 포함하는가. 본인은 전자를 권장한다. 후자는 주문오류 방지 정보다.
2. 새 창 대상의 “번호가 있는 문서”에 정본 열거 밖인 **분개·입금보고서·영업수수료 정산·그룹웨어 결재·배차 task/batch**도 포함하는가. 포함 여부가 플랫폼 슬라이스 뒤의 화면 수를 크게 바꾼다.
3. 세금계산서·거래명세·견적 인쇄의 공급일/발행일/작성일도 번호 날짜 중복으로 삭제하는가. 세무·증빙 의미가 있을 수 있어 목록 열 결정만으로 임의 삭제하지 않았다.
