# 권한 체계 전면 재편 — Phase 0 인벤토리: slip-service (전표 / 매출·매입 슬립 / 견적 / 매입 OCR)

> **범위**: slip-service 도메인 33개 PageCode × 7개 action (VIEW / CREATE / UPDATE / DELETE / RESTORE / DOWNLOAD / PRINT)
> **방식**: read-only 코드 감사. BE = `services/slip-service/src/main/java` `@RequirePermission` + controller method, FE = `clients/desktop/src/renderer` 라우트/메뉴 + `clients/web` 견적/주문 + `clients/mobile`.
> **판정 범례**: ✅ = 구현됨 / ❌ = 미구현 / ⚠️ = 부분·간접 구현 (별도 endpoint 없음 또는 우회)

---

## 1. 개요 (intro)

slip-service 는 `@RequirePermission(page=..., action=...)` 으로 모든 사용자-facing mutation/조회를 보호한다(SP-D6-6 ~ SP-D7 마이그레이션 완료). 다만 본 도메인의 action 모델에는 두 가지 구조적 특이점이 있다.

1. **action 은 사실상 `VIEW` / `EDIT` 2값만 사용한다.** `@RequirePermission` 의 `action` 은 `EDIT` 또는 `VIEW` 만 존재하고, CREATE / UPDATE / DELETE / RESTORE / DOWNLOAD / PRINT 의 의미적 구분은 **HTTP 메서드 + endpoint 경로**로만 표현된다. 즉 권한 매트릭스 상으로는 한 PageCode 의 모든 write(생성/수정/삭제/복원/export) 가 동일한 `EDIT` 권한 비트 하나로 묶여 있다 — 이번 재편의 핵심 분해 대상.
2. **목록(list) VIEW 가드는 두 방식이 혼재한다.** 일부는 `@RequirePermission(...,VIEW)` 어노테이션, 일부(`sales.slip.list` / `purchases.slip.list`)는 `SlipController#list` 내부 `checkViewPermission(role, pageCode)` **프로그램적 가드**(`DynamicPermissionClient.canView`)로 처리된다. `estimates.list` 의 list/detail 은 `@PreAuthorize("isAuthenticated()")` + `EstimatePermissionGuard.checkView()` 조합.

### RESTORE 핵심 결론 (선행 요약)
- **`slip.audit-revert` 는 TRUE version-rollback 이다.** `SlipAuditLogService#revertToRevision`(`audit/service/SlipAuditLogService.java:176`) 은 대상 revision 의 audit row 들에서 `oldValue` 를 읽어 `slip.applyOverlayPatch(field, restoreTo)` 로 실제 필드를 과거 값으로 되돌리고, 복원 자체를 신규 revisionNo audit row 로 영구 기록한다. → 진짜 RESTORE 의 의미(이전 버전으로 롤백 + 이력 보존)를 충족.
- 단, **이 RESTORE 는 `slip.audit-overlay` 가 추적하는 overlay 필드(메모/주소 등)의 값 롤백**이며 **soft-deleted 슬립의 복원(undelete)이 아니다.** 즉 DELETE(soft-delete) 와는 별개 메커니즘 — soft-delete 된 슬립을 되살리는 endpoint 는 도메인 전체에 존재하지 않는다(아래 집계 참조).

### DOWNLOAD / PRINT 핵심 결론 (선행 요약)
- **DOWNLOAD = Excel(.xlsx) 만 존재.** `slip.print.export` → `SlipController#exportXlsx`(`web/SlipController.java:541`), `GET /slips/export.xlsx`, MIME `...spreadsheetml.sheet`. FE = `excelExportApi.ts#exportSlips` + `ExcelDownloadButton`. **PDF / CSV(실파일) export 는 BE 에 없음** (CSV 는 FE mock 모드 한정).
- **PRINT = HTML print 뷰(window.print / html2canvas).** PDF 파일 생성이 아니라 브라우저 인쇄 미리보기 페이지. 대표:
  - `slip.print.next-day` → `SlipController#nextDayImageData`(`:480`, `GET /slips/next-day-image-data`, VIEW) + FE `print/NextDaySlipView.tsx` (`/print/next-day-slip`, 단톡방별 page-break). **전표 "이미지"** = html2canvas/PNG 렌더 의도이나 BE 는 데이터 JSON 만 제공, 이미지화는 FE.
  - 거래명세서 인쇄 = FE `print/SalesTransactionStatementPrintPage.tsx` (`/sales/:id/print/statement`, A4 portrait), 거래명세서 일괄 = `print/StatementBatchView.tsx`. 이들은 별도 PageCode 가 없고 `sales.slip.list` 화면에서 진입(전용 권한 비트 부재).

---

## 2. PageCode × Action 매트릭스

| PageCode | 프로그램 (FE/용도) | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT |
|---|---|---|---|---|---|---|---|---|
| **slip.transfer.process** | 전표 상태 전이(accept/process/inspect/complete/ship/deliver), `SlipDetailPage` 액션 | ⚠️ list/detail 은 `sales/purchases.slip.list` 가드 공유 | ❌ 생성 아님 | ✅ `SlipController#accept/process/inspect/complete/ship/deliver` (`:323~385`, EDIT, 상태전이=UPDATE 성격) | ❌ | ❌ | ❌ | ❌ |
| **slip.reject** | 전표 반려, `SlipDetailPage` | ❌ 전용 VIEW 없음 | ❌ | ✅ `SlipController#reject` (`:407`, EDIT) | ❌ | ❌ | ❌ | ❌ |
| **slip.period-lock** | 기간 마감 lock (accounting 연동) | ❌ 전용 VIEW 없음 | ❌ | ✅ `SlipController#lockByPeriod` (`:447`, POST /lock-by-period, EDIT) | ❌ | ❌ | ❌ | ❌ |
| **slip.print.next-day** | 내일자 전표 이미지, FE `NextDaySlipPage`+`NextDaySlipView` | ✅ `SlipController#nextDayImageData` (`:480`, GET, VIEW) | ❌ | ❌ | ❌ | ❌ | ⚠️ 이미지(PNG) 화는 FE html2canvas, BE 는 JSON 만 | ✅ FE print 뷰 `/print/next-day-slip` (window.print, 단톡방별 page-break) |
| **slip.print.export** | 전표 목록 Excel 다운로드, FE `ExcelDownloadButton` | ❌ (export 전용) | ❌ | ❌ | ❌ | ❌ | ✅ `SlipController#exportXlsx` (`:541`, GET /export.xlsx, **action=EDIT**, .xlsx) | ❌ |
| **slip.cleanup** | 전표정리 리스트(GAS#13), FE `SlipCleanupPage` | ✅ `SlipController#cleanup` (`:511`, GET /cleanup, VIEW) | ❌ | ❌ | ❌ | ❌ | ❌ (BE export 없음) | ❌ |
| **slip.cleanup-history** | 전표정리 저장내역, `SlipCleanupSaveHistoryController` | ⚠️ list/detail/latest 가 **action=EDIT** 로 표기됨 (`:84/:122/:143`, GET 이나 EDIT 비트) | ✅ `#save` (`:58`, POST, EDIT — 저장내역 INSERT) | ❌ | ❌ | ⚠️ detail payload 로 "실행 탭 복원"(파라미터 재적용)이나 entity rollback 아님 | ❌ | ❌ |
| **slip.attachments.upload** | 슬립 첨부 업로드/조회, `SlipAttachmentController` | ✅ `#list`/`#detail` (`:93/:105`, VIEW) | ✅ `#upload` (`:74`, POST, EDIT) | ❌ | ❌ | ❌ | ⚠️ `#detail` presigned downloadUrl(1h, `:104`) — 파일 다운로드이나 export 아님, VIEW 비트 | ❌ |
| **slip.attachments.delete** | 슬립 첨부 soft-delete | ❌ (delete 전용) | ❌ | ❌ | ✅ `#delete` (`:117`, DELETE, EDIT, MinIO 객체 보존 soft-delete) | ❌ | ❌ | ❌ |
| **slip.delivery-attachments.upload** | 배송완료 사진 업로드/조회, `DeliveryAttachmentController` | ✅ `#list` (`:133`, VIEW, DELIVERY 유형 필터) | ✅ `#upload` (`:98`, POST, EDIT, 상태가드 SHIPPING~CONFIRMED) | ❌ | ❌ | ❌ | ⚠️ 목록 downloadUrl 캐시 제공 | ❌ |
| **slip.photo-audit** | 관리자 사진 감사 목록, `SlipPhotoAuditAdminController` | ✅ `#list` (`:58`, GET, VIEW, type/from/to/slipNo 필터) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **slip.comments** | 슬립 협업 댓글 + SSE, `SlipCommentController` + `SlipRealtimeController` | ✅ `#listRecent` (`:82`, VIEW) + SSE subscribe (`Realtime:55`, VIEW) | ✅ `#add` (`:62`, POST, EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **slip.audit-overlay** | 실시간 협업 필드 patch + 수정이력, `SlipAuditLogController` | ✅ `#listAuditLogs` (`:62`, GET /audit-logs, VIEW, audit timeline) | ❌ (신규 row 아님) | ✅ `#applyOverlayPatch` (`:85`, PATCH /audit/overlay, EDIT, 단일필드+SSE) | ❌ | ❌ (revert 는 별도 PageCode) | ❌ | ❌ |
| **slip.audit-revert** | audit revert(특정 revision 복원), `SlipAuditLogController` | ❌ (revert 전용) | ❌ | ❌ | ❌ | ✅ **TRUE rollback** `#revertToRevision` (`:108`, POST /audit/revert/{revisionNo}, EDIT) → `Service#revertToRevision:176` 가 `oldValue` 로 실 필드 복원 + 신규 audit row | ❌ | ❌ |
| **slip.edit-requests** | 수정/삭제 요청 생성·이력, `SlipEditRequestController` | ✅ `#listBySlip` (`:162`, GET /{id}/edit-requests, VIEW) | ✅ `#createRequest` (`:74`, POST /edit-request, EDIT, 요청 생성) | ❌ | ❌ | ⚠️ 요청 승인 시 작성자가 1회 mutation 가능 — 잠금해제 워크플로우(롤백 아님) | ❌ | ❌ |
| **slip.edit-requests.decide** | 수정요청 승인/거절 + 권한자 대시보드 | ✅ `#listForRole` (`:147`, GET /edit-requests, VIEW, PENDING 대시보드) | ❌ | ✅ `#approveRequest`/`#rejectRequest` (`:99/:125`, POST, EDIT, 요청 상태전이) | ❌ | ❌ | ❌ | ❌ |
| **slip.signature** | 관리자 서명 조회/무효화, `SlipSignatureController` | ✅ `#getSignature` (`:58`, GET /{id}/signature, VIEW, MANAGER/MASTER) | ❌ | ❌ | ⚠️ `#invalidateSignature` (`:83`, **DELETE** /{id}/signature, EDIT) — 서명 무효화(논리 삭제 성격), 슬립 삭제 아님 | ❌ | ❌ | ❌ |
| **slip.lookup-product** | 모델명 제품 lookup(facade), `SlipLookupController` | ✅ `#lookupProduct` (`:48`, GET /lookup-product, VIEW, product-service 위임) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **slip.delivery-batch** | 배송 묶음(링크발송) 자동그룹/SMS, `DeliveryBatchController` | ✅ `#list`/`#getOne` (`:54/:64`, VIEW) | ✅ `#autoGroup` (`:45`, POST, EDIT, 배치 생성) | ✅ `#addSlip`/`#removeSlip`/`#sendSms`/`#regenerateToken` (`:78~106`, EDIT) | ❌ | ❌ | ❌ | ❌ |
| **slip.mobile-sales** | 영업 모바일 대시보드/견적/주문, `MobileSalesController` | ✅ `#dashboard`/`#visitsToday` (`:80/:160`, VIEW) | ✅ `#createQuotation`/`#createPartnerOrder` (`:112/:139`, POST, EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **slip.publish.from-estimate** | 견적→출고전표 발행, `SlipPublishController` | ✅ `#findBySource` (`:143`, GET /by-source, VIEW) | ✅ `#publishFromEstimate` (`:89`, POST /from-estimate, EDIT, 멱등) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **slip.publish.from-partner-order** | 협력사주문→출고전표 발행 | ❌ (by-source VIEW 는 from-estimate 코드 공유) | ✅ `#publishFromPartnerOrder` (`:116`, POST /from-partner-order, EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **sales.slip.list** | 매출(OUTBOUND) 전표 목록, FE `SlipListPage mode=OUTBOUND` (`/sales/slips`) | ⚠️ `SlipController#list` 내 프로그램적 `checkViewPermission(role,"sales.slip.list")` (`:145`) + FE `PermissionGuard view` | ❌ (생성은 sales.slip.create) | ❌ | ❌ | ❌ | ⚠️ 화면에서 `slip.print.export`(.xlsx) 진입 | ⚠️ 화면에서 거래명세서 인쇄(`SalesTransactionStatementPrintPage`) 진입 — 전용 권한 비트 없음 |
| **sales.slip.create** | 매출 전표 생성, FE `SlipFormPage mode=OUTBOUND` (`/sales/new`) | ❌ (create 전용) | ✅ `SlipController#create` (`:185`, POST /slips, EDIT) + slipType 기반 동적 EDIT 가드 | ❌ | ❌ | ❌ | ❌ | ❌ |
| **sales.slip.edit** | 매출 전표 수정/라인/저장/발송/삭제 | ❌ (edit 전용) | ⚠️ `#addLine` (`:253`, 라인 추가) | ✅ `#editHeader`/`#updateV20`/`#save`/`#send`/`#removeLine` (`:202~307`, EDIT); `SalesSlipUpdateController#update` (`:48`) | ✅ `SalesSlipDeleteController#delete` (`:56`, **DELETE /{id}/sales**, EDIT, soft-delete, DRAFT/SAVED 만) | ❌ | ❌ | ❌ |
| **sales.slip.confirm** | 매출 전표 확정 | ❌ | ❌ | ✅ `SlipController#confirm` (`:392`, EDIT) | ❌ | ❌ | ❌ | ❌ |
| **sales.slip.cancel** | 매출 전표 취소 | ❌ | ❌ | ✅ `SlipController#cancel` (`:422`, EDIT) | ⚠️ 취소(CANCELED 상태)는 논리적 무효화 — soft-delete 아님 | ❌ | ❌ | ❌ |
| **purchases.slip.list** | 매입(INBOUND) 전표 목록, FE `SlipListPage mode=INBOUND` (`/purchases/slips`) | ⚠️ `SlipController#list` 내 `checkViewPermission(role,"purchases.slip.list")` (`:143`) + FE `PermissionGuard view` | ❌ | ❌ | ❌ | ❌ | ⚠️ `slip.print.export` 공유(slipType=INBOUND .xlsx) | ⚠️ 매입 인쇄 양식(`/purchases/:id/print/inbound` `InboundView`) 진입 — 전용 권한 비트 없음 |
| **purchases.slip.edit** | 매입 전표 수정, `SlipUpdateController` | ❌ | ❌ | ✅ `SlipUpdateController#update` (`:39`, PUT, EDIT) | ❌ | ❌ | ❌ | ❌ |
| **purchases.slip.delete** | 매입 전표 soft-delete, `SlipDeleteController` | ❌ | ❌ | ❌ | ✅ `SlipDeleteController#delete` (`:54`, **DELETE /{id}**, EDIT, soft-delete, DRAFT/SAVED 만) | ❌ | ❌ | ❌ |
| **purchases.receipt-ocr** | 영수증 OCR→매입전표 자동생성, `ReceiptOcrController` | ❌ (OCR 전용, 동적 EDIT 가드) | ✅ `#parseReceipt` (`:93`, POST /receipt-ocr multipart, EDIT, OCR→DRAFT 생성) | ❌ | ❌ | ❌ | ⚠️ 입력=이미지 업로드(jpg/png≤10MB) — 다운로드 아님 | ❌ |
| **estimates.list** | 견적서 목록/CRUD/상태전이, `EstimateController` (FE `EstimateListPage` `/sales/estimates`) | ✅ `#list`/`#getOne` (`:71/:90`, `@PreAuthorize isAuthenticated()` + `EstimatePermissionGuard.checkView`) + FE `PermissionGuard view` | ✅ `#create` (`:105`, POST, EDIT) | ✅ `#update`/`#send`/`#accept`/`#reject`/`#convert` (`:117~171`, EDIT; update=PUT) | ❌ (견적 삭제 endpoint 없음) | ❌ | ❌ | ⚠️ 견적서 인쇄 = FE `QuoteView` (`/sales/estimates/:estimateNumber/print`) — estimates.list 화면 진입, 전용 권한 비트 없음 |

---

## 3. 신규 구현 필요 집계 (재편 대상)

### 3.1 action 분해 — 현 `EDIT` 1비트 → CREATE/UPDATE/DELETE 분리 필요
현재 모든 write 가 단일 `EDIT` 비트로 묶여 의미 구분이 불가능. 아래는 한 PageCode 안에 복수 의미가 섞인 케이스(분해 1순위):

- **`sales.slip.edit`** — UPDATE(헤더/라인/저장/발송/V20) + CREATE 성격(`addLine`) + **DELETE(soft-delete `/{id}/sales`)** 가 전부 동일 EDIT 비트. → UPDATE / DELETE 분리 필요.
- **`slip.delivery-batch`** — CREATE(autoGroup) + UPDATE(addSlip/removeSlip/sendSms/regenerateToken) 혼재.
- **`slip.mobile-sales`** — CREATE(quotation/partner-order) 가 EDIT 로 통합.
- **`slip.edit-requests` / `slip.edit-requests.decide`** — CREATE(요청생성) vs UPDATE(승인/거절 상태전이) 혼재.
- **`slip.cleanup-history`** — **조회(list/detail/latest)가 `VIEW` 가 아닌 `EDIT` 비트로 표기**(설계 오류 의심). VIEW 로 재배치 필요.
- **`estimates.list`** — list/CRUD/상태전이/변환이 1개 PageCode(estimates.list) + EDIT 1비트. CREATE/UPDATE/DELETE 미분리.

### 3.2 DELETE / RESTORE 공백
- **DELETE(soft-delete)** 구현 PageCode: `purchases.slip.delete`(`/{id}`), `sales.slip.edit`(`/{id}/sales`), `slip.attachments.delete`. 그 외 슬립/견적/배송배치/댓글 등은 **삭제 endpoint 없음**.
  - `estimates.list` 에는 견적 삭제 endpoint 자체가 부재 → 필요 시 신규.
- **RESTORE(undelete = soft-delete 복원)** 는 **도메인 전체에 0건.** `slip.audit-revert` 의 RESTORE 는 overlay 필드 값 롤백이지 삭제된 슬립/첨부 되살리기가 아님. soft-delete 복원 권한 액션을 신설하려면 BE endpoint 자체가 신규.
- `slip.signature#invalidateSignature`, `sales.slip.cancel` 은 DELETE/취소를 ⚠️ 로 표기 — 논리적 무효화이며 삭제 액션 비트로 매핑할지 정책 결정 필요.

### 3.3 DOWNLOAD / PRINT 공백
- **DOWNLOAD = `slip.print.export`(.xlsx) 단 1개**, 그나마 `action=EDIT` 로 표기됨 → DOWNLOAD 전용 액션으로 재배치 권장. PDF export 는 도메인 전체에 없음(필요성 검토).
- **PRINT 전용 권한 비트 부재.** 거래명세서 인쇄(`SalesTransactionStatementPrintPage`/`StatementBatchView`), 매입 인쇄(`InboundView`), 견적서 인쇄(`QuoteView`), 출고/입고전표 인쇄는 모두 FE print 라우트로만 존재하고 `sales.slip.list`/`purchases.slip.list`/`estimates.list` 화면 권한에 묶여 있다. `slip.print.next-day` 만이 PRINT 의미를 가진 별도 PageCode(VIEW) — 일관성 없음. PRINT 액션을 list PageCode 에 신설하거나 인쇄 전용 PageCode 도입 검토.
- **첨부 다운로드(presigned URL)** 는 `slip.attachments.upload` / `slip.delivery-attachments.upload` 의 VIEW 비트에 묶임 — DOWNLOAD 분리 여부 정책 결정 필요.

### 3.4 VIEW 가드 방식 통일 필요
- `sales.slip.list` / `purchases.slip.list` 는 어노테이션이 아닌 `SlipController#list` 내부 프로그램적 `checkViewPermission`(slipType 확정 후 분기)로 처리 → 자동 인벤토리/감사에서 누락되기 쉬움.
- `estimates.list` list/detail 은 `@PreAuthorize("isAuthenticated()")` + `EstimatePermissionGuard.checkView` → `@RequirePermission(VIEW)` 로 미전환. 재편 시 통일 권장.
