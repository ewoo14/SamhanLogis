# 권한 인벤토리 — 거래처주문 · 상품 · DC 설정 (sales-products)

> Phase 0 도메인 audit. 대상 서비스: `partner-order-service` (거래처주문) · `product-service` (상품) · `dc-config-service` (거래처 DC 설정 / DC import).
> 7 action (VIEW / CREATE / UPDATE / DELETE / RESTORE / DOWNLOAD / PRINT) × 21 PageCode.
> 판정 기준 = [README.md](README.md) §audit 컬럼. HTTP verb → action 매핑 + FE route/menu 존재 확인.
> `@RequirePermission(page, action)` AOP 가드 기준. **action 표기 주의**: BE 가드는 mutation 을 일괄 `EDIT` action 으로 둠 (CREATE/UPDATE/DELETE 미세분). 본 표는 README 의 HTTP→action 의미 판정을 따르되, 구현 근거에 실제 가드 action 을 병기.

## 셀 표기
`✅` 구현 / `❌` 없음 / `⚠️` 부분.

## 매트릭스

| PageCode | 프로그램 (FE) | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT |
|---|---|---|---|---|---|---|---|---|
| sales.partner-order.list | desktop `/sales/partner-orders`, `/:id` (SalesPartnerOrderListPage/DetailPage) | ✅ GET `/api/v1/partner-orders`, `/{id}` `PartnerOrderListController#list/detail` (VIEW) + FE route+sidebar | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| sales.partner-order.draft | web order-app 거래처주문 (saveOrderSnapshot/getOrderSnapshotHistory shim) | ✅ GET `/drafts`, `/drafts/{id}` `PartnerOrderDraftController#list/getOne` (VIEW) | ✅ POST `/drafts` `#create` (가드 EDIT) | ⚠️ 별도 PUT 없음 — 신규 draft 생성으로 갱신 (POST only) | ❌ | ❌ | ❌ | ❌ |
| sales.partner-order.edit | desktop DetailPage (즉시 수정) + 견적→주문 변환 | ❌ (조회는 .list) | ✅ POST `/from-estimate/{estimateId}` `PartnerOrderFromEstimateController#createFromEstimate` (가드 EDIT) | ✅ PUT `/{id}` `PartnerOrderEditController#update` (가드 EDIT) | ✅ DELETE `/{id}` `PartnerOrderDeleteController#delete` soft-delete (가드 EDIT) | ❌ | ❌ | ❌ |
| sales.partner-order.confirm | web order-app (sendOrderFromUi) + desktop 확정 | ❌ | ✅ POST `/{draftId}/confirm` `PartnerOrderConfirmController#confirm` (가드 EDIT, 출고전표 발행) | ❌ | ❌ | ❌ | ❌ | ❌ |
| sales.partner-order.history | web order-app (getOrderHistory) | ✅ GET `/history` `PartnerOrderHistoryController#history` (VIEW, bizCode+기간 페이지) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| sales.partner-order.history.view (SP-D7 전용 VIEW) | desktop DetailPage 내 audit timeline + SSE | ✅ GET `/{id}/audit-logs` `PartnerOrderAuditLogController#listAuditLogs` + GET `/{id}/realtime` `PartnerOrderRealtimeController#subscribe` (둘 다 VIEW) | ❌ | ❌ | ❌ | ⚠️ audit timeline 조회만 — 롤백/revert endpoint 미구현 (Javadoc "overlay patch + revert 향후 슬라이스") | ❌ | ❌ |
| sales.partner-order.print (주문서 인쇄) | desktop DetailPage 인쇄 버튼 → A4 HTML 새 탭 | ✅ (인쇄 view 접근 = VIEW action) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **실 인쇄 view**: GET `/{id}/print` `PartnerOrderPrintController#print` → A4 HTML(text/html) 반환, FE `SalesPartnerOrderDetailPage#handlePrint` window.open 새 탭 브라우저 인쇄 (가드 VIEW) |
| sales.partner-order.edit-requests | desktop DetailPage '수정 요청 이력' 섹션 | ✅ GET `/{id}/edit-requests` `PartnerOrderEditRequestController#listByOrder` (VIEW) | ✅ POST `/{id}/edit-request` `#createRequest` (가드 EDIT, 요청 생성) | ❌ | ❌ | ❌ | ❌ | ❌ |
| sales.partner-order.edit-requests.decide | desktop `/sales/order-approvals` (SalesOrderApprovalsPage) | ✅ GET `/edit-requests?targetRole` `#listForRole` (VIEW 대시보드) | ✅ POST `/{id}/edit-request/{rid}/approve`·`/reject` `#approveRequest/#rejectRequest` (승인/거절, 가드 EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| sales.partner-order.tutorial | web order-app (saveTutorialState) | ❌ (조회 endpoint 없음 — PATCH 전용) | ❌ | ✅ PATCH `/api/v1/auth/partner-tutorial` `TutorialStateController#patch` (가드 EDIT) | ❌ | ❌ | ❌ | ❌ |
| sales.vendor-order (벤더 발주) | desktop `/sales/vendor-order-upload` (SalesVendorOrderUploadPage, Designer mock) | ❌ (조회 endpoint 없음) | ✅ POST `/admin/partner-order/vendor/upload`(OCR preview)·`/confirm` `VendorOrderController#upload/#confirm` (가드 EDIT) | ❌ | ❌ | ❌ | ❌ (업로드는 입력. export 없음) | ❌ |
| sales.partner-dc-config (거래처 DC 설정) | desktop `/sales/partner-dc-config` (SalesPartnerDcConfigPage) | ✅ GET `/api/v1/partner-dc-configs` `PartnerDcConfigsController#list` (VIEW, keyword+page) + FE route+sidebar | ❌ (PATCH 시 DC 미설정 거래처 자동 생성 — 별도 POST 없음) | ✅ PATCH `/{partnerCode}` `#updateInline` (가드 EDIT, 인라인 수정) | ❌ | ❌ | ❌ | ❌ |
| dc-config.import (DC 설정 import) | (전용 FE 화면 미확인 — admin CSV import) | ❌ (조회 endpoint 없음) | ✅ POST `/api/v1/dc-config/admin/import` `DcConfigImportController#importCsv` CSV upsert (가드 EDIT + `@PreAuthorize` MASTER 이중) | ❌ | ❌ | ❌ | ❌ (import 전용. export 없음) | ❌ |
| products.list | desktop **FE 화면 없음** (sidebar 미노출, 라우트 미존재 — PermissionMatrixPage 주석 "향후 상품 메뉴 추가 시 연결") | ⚠️ GET `/products`, `/{id}`, `/by-model/{n}`, POST `/products/lookup`, GET `/api/products/by-code/{c}` (VIEW) — **BE만 존재, 전용 FE route 없음** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| products.list.view (SP-D7 전용 VIEW) | desktop 화면 없음 (audit/realtime API) | ✅ GET `/products/{id}/audit-logs` `ProductAuditLogController#listAuditLogs` + GET `/products/{id}/realtime` `ProductRealtimeController#subscribe` (VIEW) | ❌ | ❌ | ❌ | ⚠️ audit timeline 조회만 — revert 미구현 | ❌ | ❌ |
| products.admin (카테고리 편집) | desktop 화면 없음 (BE만) | ❌ (카테고리 트리 GET `/products/categories` 는 무가드 public) | ✅ POST `/products` `ProductController#create`, POST `/products/categories` `CategoryController#create` (가드 EDIT) | ✅ PATCH `/{id}`, PUT `/{id}/tags`, POST `/{id}/discontinue|reactivate`, PATCH 카테고리 `/{id}` (가드 EDIT) | ✅ DELETE `/products/{id}` `ProductController#delete` soft-delete, DELETE `/products/categories/{id}` `CategoryController#delete` (가드 EDIT) | ⚠️ POST `/{id}/reactivate` = discontinue 복구이나 버전 롤백 아님 (status 토글) | ❌ | ❌ |
| products.price (가격 관리) | desktop 화면 없음 (BE만) | ❌ | ❌ | ✅ PATCH `/products/{id}/price` `ProductController#updatePrice` (가드 EDIT, ACCOUNTANT 전용 권한) | ❌ | ❌ | ❌ | ❌ |
| products.edit-requests | desktop 화면 없음 (BE만) | ✅ GET `/products/{id}/edit-requests` `ProductEditRequestController#listByProduct` (VIEW) | ✅ POST `/products/{id}/edit-request` `#createRequest` (가드 EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| products.edit-requests.decide | desktop 화면 없음 (BE만) | ✅ GET `/products/edit-requests?targetRole` `#listForRole` (VIEW) | ✅ POST `/{id}/edit-request/{rid}/approve`·`/reject` `#approveRequest/#rejectRequest` (가드 EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| products.ecount-import (이카운트 품목 import) | desktop 화면 없음 (admin CSV import) | ❌ (조회 endpoint 없음) | ✅ POST `/admin/products/imports/ecount` `EcountProductImportController#upload` 품목/관계/그룹 CSV (가드 EDIT) | ❌ | ❌ | ❌ | ❌ (import 전용. export 없음) | ❌ |

## 핵심 판정 노트

### 주문서 인쇄 (sales.partner-order.print) — 실 인쇄 view ✅
- BE `PartnerOrderPrintController#print` 가 `GET /api/v1/partner-orders/{id}/print` 로 **A4 인쇄용 HTML** (`text/html;charset=UTF-8`) 을 직접 렌더 (`PartnerOrderPrintService#renderPrintHtml`).
- FE `SalesPartnerOrderDetailPage#handlePrint` (L158~) 가 해당 URL 을 fetch 한 뒤 `window.open(url, '_blank')` 로 새 탭 열어 브라우저 인쇄 → **PDF 변환/저장 별도 endpoint 아님**.
- 가드 action 은 `VIEW` (인쇄 view 접근). FE `PRINT_ROLES = ['SALES','MANAGER','MASTER']` 추가 클라이언트 가드.
- 판정: PRINT ✅ (실 인쇄 view 존재). DOWNLOAD ❌ (PDF/PNG 파일 export 아님).

### Excel / PDF / PNG export (DOWNLOAD) — 도메인 전체 ❌
- partner-order-service / product-service / dc-config-service 어디에도 `.xlsx` / Excel(XSSF/Workbook) / PDF / ByteArray export endpoint **없음** (grep `export|Excel|xlsx|download|XSSF|Workbook|application/vnd` 결과 0건, importer 파일명 매칭만).
- 벤더 발주(upload)·DC import·이카운트 품목 import 는 모두 **입력(import)** 방향이며 CREATE 로 판정, DOWNLOAD 아님.
- 비교 참고: 전표 도메인은 `slip.print.export` Excel 가 별도 PageCode 로 존재하나, 본 도메인엔 export PageCode 자체가 없음.

### RESTORE — 전 PageCode 미구현/부분
- audit timeline 조회 (`.history.view`, `.list.view`) 는 존재하나 **버전 롤백/revert endpoint 미구현** (controller Javadoc 명시: "overlay patch + revert endpoint 는 향후 슬라이스"). → ⚠️.
- products.admin 의 `reactivate` 는 단종 상태 토글이지 버전 복원 아님 → ⚠️ (느슨).
- edit-requests 워크플로우는 "수정 잠금 해제 요청 → 1회 mutation 허용" 으로 RESTORE 와 무관 (CREATE/VIEW 로 분류).

### FE 화면 부재 — products.* 전체
- desktop 클라이언트에 **상품 관리 전용 route/페이지 없음**. `routes/index.tsx` 에 `/products*` 라우트 미존재, `AppLayout` sidebar 미노출, `PermissionMatrixPage` L309~311 주석 "products.* 현재 사이드바 직접 노출 없음 ... 향후 상품 메뉴 추가 시 SidebarLink 연결".
- 따라서 products.list 의 VIEW 는 BE endpoint 만 존재하고 전용 FE route/menu 가 없어 README 기준(조회 endpoint + FE route/메뉴) 부분 충족 → ⚠️.
- products.admin/price/edit-requests/ecount-import 도 전용 FE 화면 없이 BE 가드만 존재 (Slip 라인 입력 시 by-model 조회 등 간접 소비).
- `dc-config.import`, `products.ecount-import` 도 admin CSV import 전용 FE 화면 미확인 (BE endpoint 만).

### 거래처주문 FE 분산
- 본사 영업(desktop): 목록/상세/인쇄/즉시수정/edit-request 이력 + `/sales/order-approvals` 승인 대시보드.
- 거래처(web order-app): legacy GAS shim (`samhanApi.ts`) 으로 draft/confirm/history/tutorial 을 partner-order endpoint 에 매핑 — UUID 비공개, 자체 화면 없이 GAS 호출 호환.

## 신규 구현 필요 집계

> ❌ + 의미상 필요한 항목 (해당 PageCode 의 도메인 성격상 마땅히 있어야 하나 미구현) 위주. 단순 "해당 없음"(예: import PageCode 의 PRINT)은 제외.

### A. DOWNLOAD (Excel/PDF export) — 도메인 전반 부재
1. **sales.partner-order.list / history — Excel export 없음**: 주문 목록·이력 다운로드 미구현. legacy GAS 동등 기능 점검 필요 (타 도메인 `slip.print.export` 대비 누락).
2. **sales.partner-order.print — PDF 저장 없음**: 현재 HTML 새 탭 인쇄만. PDF 파일 다운로드 필요 시 신규.
3. **products.list — Excel export 없음**: 상품 마스터 목록 다운로드 미구현.
4. **sales.partner-dc-config — Excel export 없음**: DC 설정은 import(CSV)만 있고 export 없음 (round-trip 비대칭).

### B. RESTORE (버전 롤백) — audit overlay revert 미구현
5. **sales.partner-order.history.view — revert endpoint 미구현**: audit timeline 조회만, 롤백 없음 (Javadoc 명시 향후 슬라이스).
6. **products.list.view — revert endpoint 미구현**: 동일.

### C. FE 화면 신규 (BE 가드만 존재, 전용 route/menu 부재)
7. **products.list / products.admin (카테고리 편집) / products.price — desktop 상품 관리 화면 신규**: BE CRUD 완비, FE route/sidebar 전무 (PermissionMatrixPage 주석으로 확인된 의도적 미연결).
8. **products.edit-requests / products.edit-requests.decide — 상품 수정 요청 대시보드 화면 신규**: BE 워크플로우 완비, FE 미존재.
9. **products.ecount-import / dc-config.import — admin import 화면 신규**: BE import endpoint 존재, 전용 FE 업로드 화면 미확인.

### D. 액션 세분화 (참고 — 신규 아닌 정합 정리)
- BE 가드가 mutation 을 모두 `EDIT` action 으로 둠 (CREATE/UPDATE/DELETE 미분리). 권한 재편 시 action 세분 여부 검토 대상 (partner-order edit/draft, products.admin, partner-dc-config 등).
- sales.partner-order.draft 는 PUT 수정 없이 POST(신규 draft) 만으로 갱신 — UPDATE 부분(⚠️).
