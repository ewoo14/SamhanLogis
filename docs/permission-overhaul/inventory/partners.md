# 권한 체계 전면 재편 — Phase 0 인벤토리: 거래처(partners) 도메인

> 대상 서비스: `partner-service` (거래처 마스터/4탭/차단/수정요청) + `partner-auth-service` (거래처 self-service auth)
> 작성 방식: read-only 감사. BE `@RequirePermission` annotation + controller HTTP method + FE route/menu/버튼 근거.
> 판정 기준 (7 action):
> - **VIEW** = GET/조회 endpoint + FE route/menu
> - **CREATE** = POST 신규 생성
> - **UPDATE** = PUT/PATCH 수정
> - **DELETE** = DELETE soft-delete
> - **RESTORE** = 버전 이력 + rollback (edit-requests/credit-history 는 부분 = ⚠️)
> - **DOWNLOAD** = Excel/CSV/PDF/PNG export (partners.edit 는 export/import 동반 — 포맷 명시)
> - **PRINT** = 인쇄 전용 뷰
> 범례: ✅ 구현됨 · ❌ 없음 · ⚠️ 부분/우회

---

## 1. 요약

거래처 도메인의 권한 페이지코드는 `partner-service` 의 6개 controller 에 `@RequirePermission` 으로 선언되어 있다. CRUD 의 핵심(VIEW/CREATE/UPDATE/DELETE)은 대부분 구현되어 있으나, **RESTORE(버전 이력 롤백)는 어디에도 없고**(edit-requests 결재 워크플로우 + credit-history 조회만 부분 존재), **PRINT 는 거래처 도메인 전체에 부재**하다. **DOWNLOAD 는 `partners.edit` 한 곳에만 집중**(Excel .xlsx export + 알리고 CSV export + 이카운트/Notion CSV import)되어 있고 나머지 페이지코드는 DOWNLOAD 없음.

주의점:
- `partners.list` / `partners.detail.view` / `partners.edit-request`(단수) 는 정의/예약만 되어 있고 실제 `@RequirePermission` 으로 가드되는 endpoint 가 거의 없다(아래 표 참조). `PartnerPermissionGuard` 상수(PAGE_LIST/PAGE_DETAIL/PAGE_BLOCK/PAGE_EDIT_REQUEST)는 선언만 있고 controller 에서 `checkView/checkEdit` 호출처가 없음(Javadoc 에만 언급).
- `partner-auth-service` 의 `PartnerAuthController`(7 endpoint) / `PartnerApprovalsController`(3 endpoint) 는 거래처 PARTNER self-service / 영업자 승인용으로, **`@RequirePermission` 가드가 전혀 없음**(헤더/토큰 기반). 권한 페이지코드 체계 밖. 별도 행으로 표기.

---

## 2. 페이지코드별 7-action 매트릭스

| PageCode | 프로그램 | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT |
|---|---|---|---|---|---|---|---|---|
| **partners.list** (거래처 목록) | FE `PartnersPage.tsx` `/admin/partners` (AdminLayout nav `admin-nav-partners`) | ⚠️ FE route/menu 존재하나 BE `@RequirePermission(partners.list)` endpoint 없음. 상수 `PartnerPermissionGuard.PAGE_LIST` 만 선언, 호출처 0. 실제 목록 조회는 `partners.search` 로 가드됨 | ❌ | ❌ | ❌ | ❌ (목록 자체 export 는 `partners.edit` 의 export.xlsx) | ❌ |
| **partners.detail** (4탭 상세) | FE `PartnerDetailDialog.tsx` (행 클릭 모달) | ✅ `PartnerAdminController#findOne` `GET /admin/partners/{partnerCode}` `@RequirePermission(partners.detail,VIEW)` | ❌ | ⚠️ 첨부파일 등록만 `PartnerVisitAttachmentController#upload`/`PartnerAttachmentController#upload` `@RequirePermission(partners.detail,EDIT)` (본문 수정은 partners.edit/4tab) | ⚠️ 첨부 삭제 `@RequirePermission(partners.detail,EDIT)` | ❌ | ❌ | ❌ |
| **partners.detail.view** (상세 조회, SP-D7 전용 VIEW) | 첨부 다운로드/조회 (PartnerDetailDialog 내부) | ✅ `PartnerVisitAttachmentController#list/download` + `PartnerAttachmentController#list/download` `@RequirePermission(partners.detail.view,VIEW)` | ❌ | ❌ | ❌ | ⚠️ 첨부파일 download endpoint 가 본 코드로 가드됨(개별 파일 binary, Excel/PDF 아님) | ❌ |
| **partners.block** (차단) | FE `BlockedPartnersPage.tsx` `/admin/blocked-partners` (영업 nav) | ✅ `PartnerBlockAdminController#findAll` `GET /api/v1/partners/admin/blocks` `@RequirePermission(partners.block,VIEW)` | ✅ `#create` `POST /admin/blocks` `@RequirePermission(partners.block,EDIT)` ("단건 차단") | ❌ (차단 수정 없음, 해제=DELETE 는 block.bulk) | ❌ (해제는 partners.block.bulk) | ❌ | ❌ |
| **partners.edit-request** (편집 결재, 단수) | — (예약/legacy 상수) | ❌ BE endpoint 없음. `PartnerPermissionGuard.PAGE_EDIT_REQUEST="partners.edit-request"` 상수만 선언, 호출처 0. 실제 워크플로우는 복수형 `partners.edit-requests` 사용 | ❌ | ❌ | ❌ | ❌ | ❌ |
| **partners.search** (검색) | FE `PartnersPage.tsx` 검색바/필터 (`admin-partners-search-input`) | ✅ `PartnerAdminController#findAll` `GET /admin/partners` + `#search` `GET /admin/partners/search` 둘 다 `@RequirePermission(partners.search,VIEW)` | ❌ | ❌ | ❌ | ❌ | ❌ |
| **partners.edit** (등록/수정/export/import) | FE `PartnerCreatePage.tsx` `/admin/partners/new` + `PartnersPage` "Excel 다운로드"/"신규 등록" 버튼 | ✅ `#lookupByName` `GET /admin/partners/by-name` + export endpoint 들 `@RequirePermission(partners.edit,VIEW)` | ✅ `PartnerAdminController#create` `POST /admin/partners` `@RequirePermission(partners.edit,EDIT)` | ✅ `#update` `PUT /admin/partners/{partnerCode}` `@RequirePermission(partners.edit,EDIT)` | ❌ (soft-delete 는 별도 `partners.delete`) | ❌ (롤백 없음) | ✅ **Excel/CSV export 2종 + import 2종** — 아래 별도 절 참조 | ❌ |
| **partners.delete** (삭제) | FE — 전용 UI 미확인 (BE endpoint 만) | ❌ | ❌ | ⚠️ `@RequirePermission(partners.delete, **EDIT**)` (DELETE action 코드가 아닌 EDIT 로 가드) | ✅ `PartnerAdminController#delete` `DELETE /admin/partners/{partnerCode}` soft-delete | ❌ | ❌ | ❌ |
| **partners.credit-history** (신용 거래 이력) | FE — 전용 소비 화면 없음 (PermissionMatrix 에만 "신용 이력" 등록) | ✅ `PartnerAdminController#findHistory` `GET /admin/partners/{partnerCode}/credit-history` `@RequirePermission(partners.credit-history,VIEW)` | ❌ | ❌ | ❌ | ⚠️ **신용한도 변경 이력(CREDIT_LIMIT_CHANGE) 조회는 RESTORE 의 부분 근거** — 이력 read-only, rollback 액션 없음 → RESTORE ⚠️ 로도 카운트 | ❌ | ❌ |
| **partners.block.bulk** (차단 bulk) | FE `BlockedPartnersPage` "CSV 업로드"(MASTER) + 행 "차단 해제"(MASTER) | ❌ (별도 조회 없음, 목록은 partners.block) | ❌ | ❌ | ✅ `PartnerBlockAdminController#unblock` `DELETE /admin/blocks/{id}` `@RequirePermission(partners.block.bulk,EDIT)` soft-delete (차단해제) | ❌ | ✅ **CSV import** `#importCsv` `POST /admin/blocks/import` multipart `@RequirePermission(partners.block.bulk,EDIT)` (Notion 발송금지 CSV, UTF-8 BOM) — import(=업로드)만, export 없음 | ❌ |
| **partners.4tab** (4탭 조회/일괄 등록) | FE `PartnerDetailDialog` 4탭 (기본/단가할인/배송지/담당자) | ✅ `Partner4TabController#getFull/getPriceDiscount/getShippingAddresses/getContacts` (GET) `@RequirePermission(partners.4tab,VIEW)` | ✅ `#registerFull` `POST /api/v1/partners/full` `@RequirePermission(partners.4tab,EDIT)` (4탭 일괄 등록) | ❌ (수정은 partners.4tab.edit) | ❌ | ❌ | ❌ | ❌ |
| **partners.4tab.edit** (4탭 수정) | FE `PartnerDetailDialog` [편집] 모드 (MANAGER/MASTER) | ❌ (조회는 partners.4tab) | ✅ 서브엔티티 추가 `#addShippingAddress`/`#addContact` (POST) `@RequirePermission(partners.4tab.edit,EDIT)` | ✅ `#updateFull` `PATCH /{partnerCode}/full` + `#upsertPriceDiscount` `PUT /{partnerCode}/price-discount` `@RequirePermission(partners.4tab.edit,EDIT)` | ✅ `#deleteShippingAddress`/`#deleteContact` `DELETE` soft-delete `@RequirePermission(partners.4tab.edit,EDIT)` | ❌ | ❌ | ❌ |
| **partners.edit-requests** (수정 요청) | FE — 거래처 전용 결재 화면 없음 (accounting/slip edit-requests 만 FE 존재). SSE 구독만 | ✅ `PartnerEditRequestController#listByEntity` `GET /entities/{id}/edit-requests` + `PartnerRealtimeController#subscribe` SSE `@RequirePermission(partners.edit-requests,VIEW)` | ✅ `#createRequest` `POST /entities/{entityId}/edit-request` `@RequirePermission(partners.edit-requests,EDIT)` (수정/삭제 요청 생성) | ❌ | ❌ | ⚠️ **수정/삭제 요청 워크플로우 자체** = entity 변경 결재 (버전 이력 부분) → RESTORE ⚠️ 근거 | ❌ | ❌ |
| **partners.edit-requests.decide** (수정 요청 승인) | FE — 거래처 전용 결재 화면 없음 | ✅ `#listForRole` `GET /edit-requests?targetRole` `@RequirePermission(partners.edit-requests.decide,VIEW)` (PENDING 대시보드) | ❌ | ✅ `#approveRequest` `POST /edit-requests/{id}/approve` + `#rejectRequest` `.../reject` `@RequirePermission(partners.edit-requests.decide,EDIT)` (결재 승인/거절) | ❌ | ⚠️ 승인 시 잠금 mutation 해제 = 변경 적용 결재 (RESTORE 부분 근거) | ❌ | ❌ |
| *(가드 외)* partner-auth `PartnerAuthController` | 거래처 PARTNER self-service (status/register/password/login/temp-pw/expiration/tutorial) | ⚠️ GET partner-status/expiration 존재하나 **`@RequirePermission` 없음** (passwordless, 헤더/토큰) | ⚠️ POST register/temp-password (가드 없음) | ⚠️ PATCH partner-password/tutorial (가드 없음) | ❌ | ❌ | ❌ | ❌ |
| *(가드 외)* partner-auth `PartnerApprovalsController` | 영업 "주문서 승인" `/sales/order-approvals` (목록/status변경/비번초기화) | ⚠️ GET list (가드 없음) | ✅ POST reset-password (가드 없음) | ⚠️ PATCH status (가드 없음) | ❌ | ❌ | ❌ | ❌ |

---

## 3. partners.edit DOWNLOAD/IMPORT 포맷 상세 (사용자 명시 요청)

`partners.edit` 페이지코드는 거래처 도메인 유일의 export/import 집결지다. 모두 `PartnerAdminController` / `EcountPartnerImportController` 에서 `@RequirePermission(page="partners.edit", action=...)` 로 가드됨.

| 종류 | 방향 | 포맷 | endpoint | 가드 action | 비고 |
|---|---|---|---|---|---|
| 거래처 목록 Excel | **export(DOWNLOAD)** | `.xlsx` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) | `PartnerAdminController#exportXlsx` `GET /admin/partners/export.xlsx?q&status` | `partners.edit / VIEW` | 최대 10,000행. FE `PartnersPage` "Excel 다운로드" 버튼(`admin-partners-excel-export`), `excelExportApi.exportPartners()` |
| 알리고 주소록 CSV | **export(DOWNLOAD)** | `text/csv; charset=UTF-8` (UTF-8 BOM) | `PartnerAdminController#exportAligoCsv` `GET /admin/partners/export/aligo-csv` | `partners.edit / VIEW` | 활성 거래처 + 차단 제외 + 휴대폰 정규화. FE `AligoAddressBookPage` |
| 이카운트 거래처 CSV | **import(업로드)** | CSV multipart (17컬럼, UTF-8 BOM) | `EcountPartnerImportController#uploadEcountPartnerCsv` `POST /admin/partners/imports/ecount` | `partners.edit / EDIT` | MIG-1 PoC. **FE 진입점 미확인(BE/admin 콘솔 전용)** |

> 추가로 `partners.block.bulk` 에 **발송금지 CSV import**(`POST /admin/blocks/import`, Notion export, UTF-8 BOM)가 별도로 존재하나 이는 `partners.edit` 가 아님 — FE `BlockedPartnersPage` "CSV 업로드" 버튼(MASTER 전용)으로 노출.
> partners.edit 자체에는 **PDF/PNG export 없음, 인쇄 뷰 없음**.

---

## 4. 신규 구현 필요 집계

### 4.1 RESTORE (버전 이력 + rollback) — 전 페이지 ❌/⚠️, **진정한 rollback 0건**
- 거래처 도메인 어디에도 "버전 스냅샷 → 특정 시점 복원(rollback)" 기능 없음.
- 부분 근거(⚠️)만 존재: `partners.credit-history`(신용 변경 이력 read-only), `partners.edit-requests` / `.decide`(수정/삭제 결재 워크플로우 = 변경 적용/거절). 모두 **이력 조회 또는 결재일 뿐 rollback 아님**.
- **신규 구현 필요**: 거래처 본문(Partner/4탭) 변경 버전 이력 + rollback. (대상: partners.detail / partners.4tab / partners.edit)

### 4.2 PRINT (인쇄 뷰) — **거래처 도메인 전체 0건**
- `PartnersPage` / `PartnerDetailDialog` / `BlockedPartnersPage` / edit-request 어디에도 `window.print` / PrintLayout / `@media print` 없음.
- (참고: 별도 도메인인 거래처원장 `PartnerLedgerView` / 거래처채권연령 `PartnerAgingPrintLayout` 은 인쇄 뷰가 있으나, 이는 accounting 도메인이며 본 거래처 마스터 페이지코드에 속하지 않음.)
- **신규 구현 필요**: 거래처 상세/목록 인쇄 뷰 (필요 시).

### 4.3 페이지코드 정합성 — "선언만 되고 미사용" 코드
- `partners.list`: FE route/menu 는 있으나 BE `@RequirePermission(partners.list)` endpoint 0. 실제 목록은 `partners.search` 가드. → **코드 통합 또는 실가드 부여 필요.**
- `partners.detail.view`: 첨부 download/조회 전용으로만 사용(SP-D7). 본 상세 조회 자체는 `partners.detail / VIEW`. → 역할 경계 명확화 필요.
- `partners.edit-request`(단수): `PartnerPermissionGuard` 상수로만 존재, 호출처 0. 실제 워크플로우는 복수형 `partners.edit-requests`(+`.decide`). → **dead 코드, 제거 또는 통합 대상.**
- `PartnerPermissionGuard.checkView/checkEdit` (PAGE_LIST/DETAIL/BLOCK/EDIT_REQUEST 상수): Javadoc 에만 언급, controller 호출처 0. → SP-D4 잔재, **dead 컴포넌트 가능성.**

### 4.4 action 코드 표기 불일치
- `partners.delete` 의 DELETE endpoint 가 `action="EDIT"` 로 가드됨(DELETE action 아님). → 신규 권한 체계에서 DELETE action 분리 시 정정 필요.
- 4탭/차단의 soft-delete 도 모두 `EDIT` action 으로 가드(`partners.4tab.edit / EDIT`, `partners.block.bulk / EDIT`). → DELETE action 세분화 시 재매핑 필요.

### 4.5 가드 부재 (partner-auth-service)
- `PartnerAuthController`(7) · `PartnerApprovalsController`(3) 모두 `@RequirePermission` 없음. PARTNER self-service 는 passwordless 설계상 의도된 것이나, **영업자용 `PartnerApprovalsController`(주문서 승인 목록/status변경/비번초기화)는 권한 가드 신규 부여 검토 필요.**

### 4.6 CREATE/UPDATE/DELETE/VIEW/DOWNLOAD 현황 (구현 완료, 신규 불필요)
- VIEW: partners.detail / partners.detail.view / partners.search / partners.block / partners.4tab / partners.credit-history / partners.edit-requests(.decide) ✅
- CREATE: partners.edit / partners.4tab / partners.block / partners.edit-requests / partners.4tab.edit(서브) ✅
- UPDATE: partners.edit / partners.4tab.edit / partners.edit-requests.decide ✅
- DELETE: partners.delete / partners.4tab.edit / partners.block.bulk ✅ (모두 soft-delete)
- DOWNLOAD: partners.edit(xlsx+aligo CSV) / partners.block.bulk(import) / partners.detail.view(첨부 binary) — 신규 불필요, 단 PDF/PNG 는 전무.

---

## 5. 근거 파일 경로

BE (partner-service):
- `services/partner-service/src/main/java/com/samhanair/logis/partner/controller/PartnerAdminController.java` (create/findAll/search/lookupByName/findOne/update/delete/exportAligoCsv/exportXlsx/findHistory)
- `services/partner-service/src/main/java/com/samhanair/logis/partner/controller/PartnerBlockAdminController.java` (findAll/create/importCsv/unblock)
- `services/partner-service/src/main/java/com/samhanair/logis/partner/controller/EcountPartnerImportController.java` (uploadEcountPartnerCsv)
- `services/partner-service/src/main/java/com/samhanair/logis/partner/tab/web/Partner4TabController.java` (getFull/registerFull/updateFull/price-discount/shipping/contacts)
- `services/partner-service/src/main/java/com/samhanair/logis/partner/editrequest/web/PartnerEditRequestController.java` (createRequest/approve/reject/listForRole/listByEntity)
- `services/partner-service/src/main/java/com/samhanair/logis/partner/realtime/PartnerRealtimeController.java` (subscribe SSE)
- `services/partner-service/src/main/java/com/samhanair/logis/partner/controller/PartnerVisitAttachmentController.java` / `web/PartnerAttachmentController.java` (첨부 upload/list/download/delete)
- `services/partner-service/src/main/java/com/samhanair/logis/partner/controller/PartnerPermissionGuard.java` (PAGE_* 상수 — 호출처 0)

BE (partner-auth-service, 가드 외):
- `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/controller/PartnerAuthController.java`
- `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/controller/PartnerApprovalsController.java`

FE (clients/desktop/src/renderer):
- `routes/admin/PartnersPage.tsx` (`/admin/partners` 목록/검색/Excel다운로드/신규등록)
- `routes/admin/PartnerDetailDialog.tsx` (4탭 상세 + 인라인 편집)
- `routes/admin/PartnerCreatePage.tsx` (`/admin/partners/new` 신규 등록)
- `routes/admin/BlockedPartnersPage.tsx` (`/admin/blocked-partners` 차단/해제/CSV업로드)
- `routes/admin/AligoAddressBookPage.tsx` (알리고 CSV)
- `api/partnerApi.ts` · `api/adminApi.ts` · `api/blockedPartnerApi.ts` · `api/excelExportApi.ts`
- `routes/index.tsx` (라우트 등록 L1381/L1391/L1414) · `components/AdminLayout.tsx` (nav)
- `api/permissionsApi.ts` (L201–214 페이지코드 enum) · `routes/PermissionMatrixPage.tsx` (라벨)
- PRINT 검색 결과: partner master 화면 0건 (`window.print`/`@media print` 미검출)
