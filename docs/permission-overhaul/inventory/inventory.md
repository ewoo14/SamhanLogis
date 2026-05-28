# 권한 체계 전면 재편 — Phase 0 인벤토리: inventory-service (재고 도메인 + 입고검수)

> 작성일 2026-05-28 · 읽기 전용 감사 (코드 무수정) · 대상 service = `inventory-service` (입고검수 포함, 별도 service 아님)

## 1. 개요

본 문서는 권한 체계 전면 재편의 **Phase 0 인벤토리** 단계로, `inventory-service` 의 재고(inventory) 도메인 + 입고검수(inbound.inspection) PageCode 별로
**7개 액션(VIEW / CREATE / UPDATE / DELETE / RESTORE / DOWNLOAD / PRINT)** 의 실제 구현 상태를 BE 컨트롤러 HTTP verb 와 FE 라우트/메뉴를 교차 확인하여 판정한다.

판정 기준 (HTTP → action):
- **VIEW** = GET/조회 endpoint + FE 라우트/메뉴 존재
- **CREATE** = POST 신규 생성
- **UPDATE** = PUT/PATCH (상태전이 POST 워크플로우도 "변경"으로 포함 판정하되 evidence 에 명시)
- **DELETE** = DELETE soft-delete (`is_deleted=true`)
- **RESTORE** = 버전 이력 + rollback (대부분 MISSING 예상). 단 창고는 enum 노트대로 복구 API 보유 → 실체 검증
- **DOWNLOAD** = Excel/PDF/PNG export (포맷 표기)
- **PRINT** = 인쇄 전용 뷰

권한 정의 원본: `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java` (319~367행 재고 블록, 244행 입고검수, 366~367행 ecount import).
모든 BE 가드는 `@RequirePermission(page=..., action=VIEW|EDIT)` 2-액션 모델 (CREATE/UPDATE/DELETE/RESTORE/DOWNLOAD 가 BE 레벨에선 전부 `EDIT` 로 뭉뚱그려짐 — 재편 시 세분화 후보).

### 핵심 발견 (warehouse.admin RESTORE 실체)

`inventory.warehouse.admin` 의 "복구(RESTORE)" 는 enum 노트(`생성/수정/삭제/복구 API`)대로 **실재**하며, **두 종류가 모두 구현**되어 있다:

1. **un-soft-delete 복구** — `WarehouseController#restore` (`POST /inventory/warehouses/{id}/restore`, 252~260행). `is_deleted=true → false` 단순 부활 + audit 1행. FE 완비 (`admin/WarehousesPage.tsx` "비활성화된 창고" 탭 + 복구 confirm modal, `restoreAdminWarehouse` → `adminApi.ts:491`).
2. **진짜 버전 롤백** — `WarehouseController#revertAudit` (`POST /inventory/warehouses/{id}/audit/revert/{revisionNo}`, 197~207행). 선택 revision 의 `oldValue` 를 entity 에 재적용 + revert 자체도 신규 audit row. FE 완비 (`EditWarehouseModal.tsx` AuditTimeline 의 revision 별 "되돌리기" 버튼, `revertAdminWarehouseRevision` → `adminApi.ts:504`). 단 `isDeleted` 필드 revert 는 의도적 미지원 (버튼 숨김, EditWarehouseModal.tsx:378~379).

→ 즉 warehouse.admin RESTORE 는 **un-soft-delete + 필드 단위 version-rollback 둘 다 진짜 구현**. 다른 모든 재고 PageCode 에는 RESTORE 부재.

## 2. PageCode × 7-액션 매트릭스

> ✅ 구현 · ❌ 미구현 · ⚠️ 부분/주의. evidence 의 파일 경로는 모두 `services/inventory-service/src/main/java/...web/` (BE) 또는 `clients/desktop/src/renderer/` (FE) 기준 축약.

| PageCode | 프로그램 | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT |
|---|---|---|---|---|---|---|---|---|
| inventory.warehouse | 창고 관리 (desktop `WarehousesPage`, 라우트 `/warehouses`, 사이드바 "창고관리") | ✅ `WarehouseController#listAll/search/getOne/listAuditLogs/subscribeRealtime` GET | ⚠️ POST `#create` 존재하나 가드 page=`warehouse.admin` (이 코드 아님) | ⚠️ PATCH `#update` 가드 page=`warehouse.admin` | ⚠️ DELETE `#delete` 가드 page=`warehouse.admin` | ⚠️ `#listAuditLogs`(GET 이력) 는 이 코드 VIEW, 실제 복구/revert 는 warehouse.admin | ❌ 창고 마스터 자체 export 없음 | ❌ |
| inventory.warehouse.admin | 창고 관리 admin (desktop `admin/WarehousesPage` 라우트 `/admin/warehouses`) | ⚠️ 전용 VIEW 없음(`#listDeleted` GET 은 action=EDIT) | ✅ `#create` POST (`@RequirePermission warehouse.admin EDIT`, 125~134행) | ✅ `#update` PATCH (144~153행) + `#revertAudit` POST | ✅ `#delete` DELETE soft (216~225행) | ✅✅ **실재** — `#restore` POST `/{id}/restore` (un-delete, 252행) + `#revertAudit` POST `/{id}/audit/revert/{revisionNo}` (version rollback, 197행). FE 완비 | ❌ | ❌ |
| inventory.stock | 재고 현황 | ⚠️ enum 정의는 있으나 BE 에 page=`inventory.stock` 가드 endpoint **0건**. FE 직접 사이드바 없음(AppLayout.tsx:300 "서브페이지" 주석, 라우트 가드 미사용) — 사실상 미연결 placeholder | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| inventory.stock-transfer | 재고 이동 화면 (desktop `TransferListPage` 라우트 `/transfers`, 사이드바 "재고이동 관리") | ⚠️ FE 화면/메뉴는 존재하나 BE 에 page=`inventory.stock-transfer` 가드 endpoint **0건** (실 데이터는 `inventory.transfer` 코드가 담당). FE 가드만 이 코드 사용 (AppLayout.tsx:301) | ❌ | ❌ | ❌ | ❌ | ⚠️ `TransferListPage` 가 재고현황 Excel(`exportStocks`) 호출하나 BE 가드는 `inventory.stock-balance` | ❌ |
| inventory.dps | DPS 비교/이력 (desktop `InventoryDpsComparePage`/`DpsByProductPage`/`DpsHistoryTab`) | ✅ `DpsCompareController#compare`(POST multipart, VIEW)·`#downloadTemplate`·`#analyzeByProduct` GET / `DpsSaveHistoryController#list/detail/latest` GET — 전부 action=VIEW | ⚠️ `DpsSaveHistoryController#save` POST 이나 action=**VIEW** (저장도 조회 권한으로 처리) | ❌ | ❌ | ❌ DPS 이력 삭제 없음 | ✅ `#downloadTemplate` GET `/template` → **.xlsx** 빈 양식 (action=VIEW) | ❌ |
| inventory.audit | 재고 감사 (desktop `InventoryAuditListPage`/`FormPage`/`DetailPage` 라우트 `/warehouse/audit`, 사이드바 "재고 실사") | ⚠️ enum 정의 있으나 BE 가드 endpoint **0건** — 실 감사 API 는 전부 `inventory.detail`(조회)/`inventory.adjust`(쓰기) 코드 사용. FE 메뉴 가드만 이 코드 (AppLayout.tsx:303) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| inventory.list | 재고 목록/예약/차감 | ✅ `StockController#batchBalances` POST `/balances/batch` (action=VIEW, 다중제품 잔량) | ❌ 순수 신규 생성 없음 | ✅ `#reserve`·`#release`·`#deduct` POST (예약/해제/차감, action=EDIT, 228~266행) | ❌ (차감은 mutation 이나 DELETE 아님) | ❌ | ❌ | ❌ |
| inventory.detail | 재고 상세/감사 조회 | ✅ `InventoryAuditController#list/getOne/listAuditLogs/subscribeRealtime` GET (action=VIEW, 82~227행) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| inventory.adjust | 재고 조정/승인 | ❌ 조회 endpoint 없음 (전부 EDIT) | ✅ `InventoryAuditController#create` POST `/inventory/audits` (실사 신규, action=EDIT, 119~126행) | ✅ `StockController#adjust` POST `/adjust` + 실사 `#start/#complete/#cancel` + transfer `#approve/#reject/#confirm/#cancel` (전부 EDIT) | ❌ | ❌ | ❌ | ❌ |
| inventory.transfer | 재고 이동 API (`StockTransferController`) | ✅ `#list`·`#getOne` GET (action=VIEW, 59~80행) | ✅ `#create` POST (REQUESTED 이동전표 생성, action=EDIT, 95~102행) | ✅ `#ship`·`#receive` POST 상태전이 (action=EDIT); approve/confirm/cancel 은 `inventory.adjust` 코드 | ❌ soft-delete 없음 (취소는 상태전이) | ❌ | ❌ | ❌ |
| inventory.stock-balance | 재고 잔액/로트/입고 (`StockController` + `InboundInspectionController` + `InspectionAttachmentController`) | ✅ `StockController#balances/lots/movements` GET + 검수 `#getInspection/#listInspections` GET (action=VIEW) | ✅ `#inbound` POST `/lots/inbound` (신규 lot, action=EDIT, 213행) | ✅ 검수 `#saveResult/#completeInspection` POST + 감사라인 `recordLine`(POST)/`updateLine`(PUT) (action=EDIT) | ⚠️ `InspectionAttachmentController#delete` DELETE (검수첨부 soft-delete, action=EDIT, 158~167행) — 잔액 자체 삭제는 아님 | ❌ | ✅ `StockController#exportXlsx` GET `/stocks/export.xlsx` → **.xlsx** 재고잔액 (action=**EDIT**, 300~312행) ⚠️조회인데 EDIT 가드 | ❌ |
| inventory.stock-balance.view | 재고 잔액 조회 (SP-D7 전용 VIEW) | ✅ `InspectionAttachmentController#list/#detail` GET (검수 첨부 조회 + presigned URL, action=VIEW, 120~146행) | ❌ | ❌ | ❌ | ❌ | ⚠️ `#detail` 가 presigned downloadUrl(1h) 발급 — 사진 다운로드는 가능하나 export 파일 생성 아님 | ❌ |
| inventory.safety-stock | 안전재고 (desktop `SafetyStockAlertsPage` 라우트 `/inventory/safety-stock-alerts`, 사이드바 "안전재고 알림") | ✅ `SafetyStockController#listAlerts/#alertCount` GET (action=VIEW, 65~93행) | ❌ 순수 신규 없음 | ✅ `#setSafetyStock` POST `/products/{id}/safety-stock` (임계값 upsert, action=EDIT, 119~126행) | ❌ | ❌ | ❌ | ❌ |
| inventory.edit-requests | 재고 수정 요청 | ❌ 전용 조회 없음 | ✅ `InventoryAuditController#createEditRequest` POST `/{id}/edit-requests` (요청 생성, action=EDIT, 241~253행) | ❌ | ❌ | ❌ | ❌ | ❌ |
| inventory.edit-requests.decide | 재고 수정 요청 승인 | ✅ `#listPending` GET `/edit-requests/pending` (action=VIEW, 258행) | ❌ | ✅ `#approveEditRequest`·`#rejectEditRequest` POST (승인/거절, action=EDIT, 268~294행) | ❌ | ❌ | ❌ | ❌ |
| ecount.import.inventory | 이카운트 재고 import (`EcountWarehouseImportController` + `EcountStockTransferImportController`) | ❌ 조회 없음 (import 전용) | ✅ `#upload` POST `/ecount` ×2 (창고 CSV `/admin/warehouses/imports/ecount` + 재고이동 CSV `/admin/inventory/stock-transfers/imports/ecount`, action=EDIT) | ❌ | ❌ | ❌ | ❌ (입력 import 만, export 아님) | ❌ |
| inbound.inspection | 입고 검수 (host = **inventory-service**, desktop `InboundInspectionListPage`/`InboundInspectionDialog` 라우트 `/warehouse/inbound-inspections`, 사이드바 "입고 검수") | ⚠️ FE 화면/메뉴 존재 + BE `InboundInspectionController` 존재하나, 그 BE 가드는 전부 page=`inventory.stock-balance` 코드 (검수 getInspection/listInspections=VIEW, inspect/complete=EDIT). page=`inbound.inspection` 직접 가드 endpoint **0건** — enum 만 등록, 실 가드는 stock-balance 가 대행 | ⚠️ (stock-balance 가 대행) | ⚠️ (stock-balance 가 대행) | ❌ | ❌ | ❌ | ❌ |

### 매트릭스 보충 주석

- **코드 vs 가드 불일치 다발**: `inventory.stock`, `inventory.stock-transfer`, `inventory.audit`, `inbound.inspection` 4개 PageCode 는 enum 에 등록·FE 메뉴/라우트는 존재하나 **그 코드명으로 가드된 BE endpoint 가 0건**. 실제 BE 데이터는 `inventory.transfer`(이동), `inventory.detail`+`inventory.adjust`(감사), `inventory.stock-balance`(검수) 가 대행. 재편 시 코드-가드 정합 정리 필요.
- **2-액션 압축**: BE 는 VIEW/EDIT 2개만 존재. CREATE/UPDATE/DELETE/RESTORE/DOWNLOAD 가 전부 `EDIT` 한 덩어리. 위 표의 ✅ 는 "해당 HTTP verb 의 endpoint 가 EDIT 가드 하에 실재"를 뜻하며, 권한 재편 시 액션 세분화가 핵심 작업.
- **DOWNLOAD 가드 오분류**: `StockController#exportXlsx` (재고잔액 .xlsx) 가 조회성인데 `action=EDIT` 가드 (300~301행). 재편 시 DOWNLOAD 액션 분리 + VIEW/DOWNLOAD 권한으로 재배치 후보.
- **PRINT 전무**: 재고 도메인 전체에 인쇄 전용 뷰 없음. `clients/desktop/src/renderer/print/` 의 PrintPage 들은 전부 매출/매입/회계 (SalesInvoice / PurchaseSlip / StatementBatch / 회계 리포트). 재고에는 0건.
- **RESTORE 전무 (warehouse.admin 제외)**: 13개 비-창고 PageCode 중 version-history+rollback 또는 un-delete 를 가진 것은 없음. `inventory.detail`/`inventory.warehouse` 의 `audit-logs` GET 은 "이력 조회"일 뿐 rollback 아님 (rollback 은 warehouse.admin 의 `revertAudit` 만).
- **모바일**: `clients/mobile-staff/src` 에는 재고/창고/검수 화면 **없음** (sales / dispatch-board / slip 만). 재고 도메인 FE 는 전부 desktop 전용.

## 3. 신규 구현 필요 집계

권한 재편 관점에서 "신규 구현/정비가 필요한" 항목 (액션 부재 또는 가드 불일치):

### 3-1. RESTORE (버전 이력 + rollback) 신규 필요
- **inventory.stock-balance** — 재고 잔액/lot 조정은 audit overlay 기록은 있으나(`InventoryAuditLogRecorder`) 잔액/lot 단위 rollback API 없음. 재고 오입력 복원 수요 高 → version-rollback 신규 후보.
- **inventory.detail (재고 실사)** — `audit-logs` 조회만 있고 COMPLETED 실사 rollback 없음 (edit-request 우회만). RESTORE 신규 후보.
- **inventory.transfer / inventory.adjust** — 상태전이만, 취소 후 복원 rollback 없음.
- (warehouse.admin 은 이미 완비 → 신규 불필요. 오히려 다른 도메인의 reference 구현으로 활용.)

### 3-2. DOWNLOAD 신규/정비 필요
- **inventory.transfer** — 이동전표 목록 Excel export 없음 (현재 TransferListPage 는 재고잔액 export 만 빌림). 이동전표 .xlsx 신규 후보.
- **inventory.detail** — 재고 실사 결과 .xlsx/PDF export 없음. 한국 회계기준 실사 보고서 export 수요 → 신규 후보.
- **inventory.stock-balance DOWNLOAD 가드 재배치** — 현 `exportXlsx` 가 EDIT 가드 → VIEW/DOWNLOAD 권한으로 이동.

### 3-3. PRINT 신규 필요 (전 도메인 0건)
- **inventory.detail** — 실사 확정서/차이 보고서 인쇄 뷰.
- **inventory.transfer** — 이동전표 인쇄 뷰 (창고 간 이동증).
- **inbound.inspection** — 검수 결과서 인쇄 뷰.
- (수요 검증 후 선택 구현. 매출/회계 print/ 패턴 재사용 가능.)

### 3-4. 코드-가드 정합 정리 (구현이라기보단 권한 재배치)
- **inventory.stock** — placeholder. 실 endpoint 가 `inventory.stock-balance`/`inventory.transfer` 로 분산 → 통합하거나 제거 결정 필요.
- **inventory.stock-transfer** — FE 메뉴는 이 코드, BE 는 `inventory.transfer`. 단일 코드로 통일 권장.
- **inventory.audit** — FE 메뉴는 이 코드, BE 는 `inventory.detail`+`inventory.adjust`. 통일 권장.
- **inbound.inspection** — FE 메뉴 + 컨트롤러 존재하나 가드는 `inventory.stock-balance` 가 대행. 전용 코드로 가드 전환 권장 (검수 권한을 잔액 권한과 분리).

### 3-5. CREATE/UPDATE/DELETE 액션 세분화 (BE 2-액션 → 7-액션)
- 전 PageCode 의 EDIT 가드를 CREATE / UPDATE / DELETE 로 분해. 특히:
  - `inventory.warehouse.admin` — create / update / delete / restore 가 전부 EDIT 1개 → 4액션 분리.
  - `inventory.list` — reserve/release/deduct (UPDATE 성격) 가 EDIT → 차감(DEDUCT) 등 도메인 액션 정의 검토.
  - `inventory.adjust` — 조정 + 실사 워크플로우(start/complete/cancel) + 이동 승인이 한 코드 EDIT 에 혼재 → 승인(APPROVE) 액션 분리 후보.

---

### 부록: 근거 파일 경로

BE (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/`):
- `web/WarehouseController.java` (창고 CRUD + restore + audit revert)
- `web/StockController.java` (잔액/lot/이동 조회 + inbound/reserve/release/deduct/adjust + exportXlsx)
- `web/StockTransferController.java` (이동전표 워크플로우)
- `web/InventoryAuditController.java` (실사 + edit-request)
- `web/SafetyStockController.java` (안전재고)
- `web/DpsCompareController.java` / `web/DpsSaveHistoryController.java` (DPS)
- `web/InboundInspectionController.java` (입고검수)
- `web/EcountWarehouseImportController.java` / `web/EcountStockTransferImportController.java` (ecount import)
- `attachment/web/InspectionAttachmentController.java` (검수 첨부 — stock-balance.view)

권한 정의: `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`

FE (`clients/desktop/src/renderer/`):
- `routes/index.tsx` (라우트 등록) · `components/AppLayout.tsx` (사이드바 가드)
- `routes/admin/WarehousesPage.tsx` (창고 admin + 복구 탭) · `components/EditWarehouseModal.tsx` (audit revert 되돌리기)
- `api/adminApi.ts` (restoreAdminWarehouse / revertAdminWarehouseRevision / listDeletedAdminWarehouses)
- `api/excelExportApi.ts` (exportStocks .xlsx) · `routes/TransferListPage.tsx` · `routes/SafetyStockAlertsPage.tsx`
- `routes/InventoryAuditListPage.tsx` / `InboundInspectionListPage.tsx` / `InventoryDpsComparePage.tsx` / `warehouse/DpsByProductPage.tsx`
- 모바일: `clients/mobile-staff/src` — 재고 도메인 화면 **없음**
