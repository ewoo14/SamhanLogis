# 권한 체계 전면 재편 — Phase 0 메뉴 인벤토리 (마스터)

> 2026-05-28 산출. 8개 도메인 fan-out 에이전트가 [inventory/](inventory/) 하위에 도메인별 7-action 매트릭스를 audit, 본 문서는 이를 종합한 마스터 + 크로스컷팅 발견 + Phase 1/2 입력.
>
> 토대 설계: [`docs/superpowers/specs/2026-05-27-permission-overhaul-foundation-design.md`](../superpowers/specs/2026-05-27-permission-overhaul-foundation-design.md)
> 도메인 섹션: [inventory/README.md](inventory/README.md) (audit 컬럼 정의)

---

## 1. 도메인 섹션 인덱스 (8 그룹)

| # | 도메인 | 섹션 파일 | PageCode 수 |
|---|---|---|---|
| 1 | 회계 core (accounting-service 핵심) | [accounting-core.md](inventory/accounting-core.md) | 31 |
| 2 | 이카운트 마이그레이션 (accounting-service import) | [ecount-migration.md](inventory/ecount-migration.md) | 35 |
| 3 | 재고 (inventory-service) | [inventory.md](inventory/inventory.md) | 17 |
| 4 | 전표·매출슬립·매입슬립·견적 (slip-service) | [slip-estimates.md](inventory/slip-estimates.md) | 33 (32 + estimates.list) |
| 5 | 아로로지스 배차 (arologis-service) | [arologis.md](inventory/arologis.md) | 8 |
| 6 | 거래처 (partner-service / partner-auth-service) | [partners.md](inventory/partners.md) | 14 |
| 7 | 거래처주문·상품·DC설정 (partner-order / product / dc-config) | [sales-products.md](inventory/sales-products.md) | 21 |
| 8 | 관리·알림·메신저·배차SMS (user/auth/dashboard/notification/groupware) | [platform-admin-notify.md](inventory/platform-admin-notify.md) | 17 |
| | **합계** | | **176** (audit 대상 = enum 173 + 일부 alias / `.view` 포함, dead 코드 포함) |

---

## 2. 크로스컷팅 발견 (Phase 1 재편의 핵심 시사점)

### 2-1. 🚨 현행 모델은 2-action (VIEW / EDIT) 만 존재
- 전 ~380 `@RequirePermission` annotation 이 `{VIEW, EDIT}` 2 bit 에만 매핑됨. CREATE / UPDATE / DELETE / DOWNLOAD / PRINT 가 전부 `EDIT` 1개 bit 에 collapse.
- 결과: Phase 1 의 **본체 노동 = ~380 endpoint 재주석화 (2 → 7 action)**. 단순 schema 교체가 아님.
- 인벤토리가 발견한 **잘못된 주석화** 도 동시 정정 필요:
  - `partners.delete` DELETE endpoint 가 `action="EDIT"` 로 가드 (→ DELETE 로).
  - `slip.cleanup-history` 리스트/상세 read 가 `EDIT` 로 가드 (→ VIEW 로).
  - `admin.users` VIEW 가 `admin.employees` 코드로 가드 (→ 별도 코드 또는 정렬).
  - `ecount.mig5.stock-transfer` = 구현 endpoint 부재 (orphan).
  - `ecount.mig2.product` / `ecount.mig2.warehouse` = orphan (실 import 는 `products.ecount-import` / `ecount.import.inventory` 코드 사용).
  - `arologis.admin` = 레거시 guard-only 코드와 실 annotation 코드(`arologis.dispatch.admin`) 불일치 (dual-guard 정리).
  - `partners.list`, `partners.edit-request` (단수형) = dead 코드 (사용처 0).
  - `PartnerPermissionGuard` 상수 = call site 0.
  - `accounting.balances`, `accounting.sales-slip.list`, `accounting.purchase-slip.list`, `accounting.tax-invoice.inbound` = FE-route-only 코드, BE 는 형제 코드(`.trial-balance` / `.accounting` / `.inbound.manage`)로 가드.

### 2-2. 🚨 RESTORE 는 거의 비어 있음
- **유일한 진짜 RESTORE** (Phase 1 가드 대상):
  - `inventory.warehouse.admin`: `WarehouseController#restore` (un-soft-delete) + `WarehouseController#revertAudit` (필드 단위 audit `oldValue` 재적용). FE 완전 연결.
  - `slip.audit-revert`: `SlipAuditLogService#revertToRevision` (audit `oldValue` 재적용). soft-delete restore 는 아님.
- **⚠️ 부분 RESTORE 유사물** (전면 RESTORE 정책 검토 필요): edit-request `decide` 워크플로우 (전 도메인), `accounting.daily-closing.unlock`, `accounting.period-close.reverse`, `accounting.tax-invoice.cancel` (자동 reverse-entry), `arologis.dispatch.ops` 명명 스냅샷 저장/복원, `partners.credit-history` read-only 이력.
- **❌ 미구현** (Phase 2 신규 구현 후보, 대다수): 회계 전 page (warehouse 제외 전 재고), 전 전표 (audit-revert 제외), 전 거래처, 전 거래처주문, 전 상품, 전 관리/알림. **soft-delete 복원**은 warehouse 외 전무 — 사용자 요구 "전표 복원" 의 데이터 모델/메커니즘은 Phase 2 도메인별 spec.

### 2-3. 🚨 DOWNLOAD = Excel 만 존재, PDF / PNG = 0
- **Excel(.xlsx via Apache POI)**: `accounting.journals` (export.xlsx), `accounting.hometax-export` (12/59 컬럼 split), `slip.print.export` (`SlipController#exportXlsx`), `partners.edit` (거래처목록 xlsx export), `partners.edit` 알리고 CSV export, `partners.edit` 이카운트 CSV import (inbound), `partners.block.bulk` Notion CSV import (inbound). 약 5-7 endpoint.
- **PDF**: 전 codebase 0건 (jsPDF / pdfmake / openpdf / iText / Spring HtmlToPdf — grep 결과 미사용).
- **PNG**: 전 codebase 0건 (html2canvas / dom-to-image / toPng — grep 결과 미사용).
- → Phase 1 `can_download` 권한 bit 가 게이팅하는 실제 capability 는 위 7개 내외. Phase 2 가 PDF/PNG 신규 구현.

### 2-4. 🚨 PRINT 는 HTML print view 일부, 전용 PRINT endpoint 1개
- **HTML print view** (CSS `@media print` + `window.print()`):
  - `accounting.tax-invoice.list` (`TaxInvoiceView` + 유일한 dedicated `GET /{id}/print`).
  - `accounting.statement-batch` (거래명세서 일괄).
  - `accounting.partner-ledger` (거래처 원장).
  - `accounting.reports` (11 보고서 PrintLayout).
  - `sales.partner-order.print` (`PartnerOrderPrintController#print` → A4 HTML, FE 새 탭 인쇄).
  - `slip.print.next-day` (전표 이미지).
- **❌ 미구현 (PRINT 대상이지만 view 없음)**: `accounting.daily-closing`, `accounting.general-ledger`, `accounting.balances.trial-balance`, `accounting.period-close`, `accounting.sales-slip.*`, `accounting.purchase-slip.*`, `accounting.deposit-match`, `accounting.tax-invoice.inbound`, 그리고 거래처/재고/배차/관리 전 도메인.

### 2-5. BE-only PageCode (FE 화면 없음)
- 인벤토리 발견: `products.*` 전체 (BE annotation 만, desktop 사이드바 미연결 — `PermissionMatrixPage` 코멘트 "향후 상품 메뉴 추가 시 연결"), `messenger.admin` / `messenger.send` (BE 만), `notifications.admin` (BE 만), arologis `region(.manage)` / `edit-requests`/.decide (BE workflow 만), 다수 SP-D6 도입 annotation-only 코드.
- Phase 1 매트릭스 UI 는 BE-only 코드도 표시 (PageCode 가 권한의 단위이므로). FE 화면 추가는 별도 슬라이스.

### 2-6. Mobile-staff / 모바일 분포
- mobile-staff: 재고 화면 0개 (현 시점). 출고/배송 위주.
- arologis 별도 client 2종: `clients/arologis-desktop` (배차 admin), `clients/arologis-mobile` (기사앱 = `arologis.driver`).
- Phase 1 매트릭스 UI 의 "프로그램" 컬럼에 desktop / mobile / mobile-staff / web(estimate·order) / arologis-desktop / arologis-mobile 표시.

---

## 3. 신규 구현 필요 — 종합 집계 (Phase 2 입력)

도메인 섹션 7-action 매트릭스에서 ❌ 셀을 capability 별로 종합:

| capability | Phase 1 가드 대상 (기존) | Phase 2 신규 구현 대상 (개략) |
|---|---|---|
| **RESTORE** (전표 복원) | 2 endpoint (warehouse, slip audit-revert) | ~30+ page (회계 전표 / 재고 조정 / 거래처 / 상품 / 거래처주문 / 배차 / 알림 ...). 도메인별 versioning + rollback. 사용자 요구 "전표 단위, `YYYY/MM/DD-{전표번호}`" — Phase 2 spec 에서 범용 vs 도메인별 결정. |
| **DOWNLOAD PDF** | 0 | 거의 모든 출력형 page (세금계산서 / 거래명세서 / 보고서 / 견적 / 주문서 / 배차 ...). 라이브러리 결정 (jsPDF FE 측 vs Spring 서버측 HtmlToPdf) Phase 2 spec. |
| **DOWNLOAD PNG** | 0 | 인쇄 가능한 view 의 PNG 스냅샷 (html2canvas / toPng). Phase 2 spec. |
| **DOWNLOAD Excel** (보강) | 7 endpoint | 추가 보고서 / 거래처 원장 / 시산표 / 재고 잔액 / 거래처주문 list 등. |
| **PRINT** (HTML view) | 6 page 그룹 | 일마감 / 원장 / 시산표 / 월말마감 / 매출슬립 / 매입슬립 / 입금매칭 / 수신세금계산서 / 거래처/재고/배차/관리 전 도메인. |

---

## 4. Phase 1 spec 에 직접 입력되는 사실

1. **재주석화 범위**: ~380 endpoint, 8 도메인 commit 으로 분할.
2. **마이그레이션 행동보존**: 현 V10/V31/V32/V35/V36/V38 `role_page_permissions` row 를 7-action 분해해 templates + account 행으로 expand (개발책임자 결정 2026-05-28).
3. **MASTER bypass**: 전권 (1200 셀 인서트 없이 PermissionAspect short-circuit).
4. **PARTNER 경계**: internal page 자동 deny (boundary 가드 유지). PARTNER 자기-서비스는 partner-auth-service.
5. **dead/orphan 코드 정리 동반**: 위 §2-1 의 6건은 Phase 1 PR 안에서 정정 (enum 정리는 별도 commit, 행동 변경 없음).
6. **인벤토리 발견 mis-annotation 정정 동반**: 위 §2-1 의 3건 (partners.delete, slip.cleanup-history, admin.users).

---

## 5. 본 인벤토리 자체의 한계 + 향후 audit

- 본 인벤토리는 **PageCode 단위** 의 audit. PageCode 1개에 다수 endpoint 가 매핑되어 있을 때 각 endpoint 의 7-action 분류는 Phase 1 재주석화 commit 안에서 정밀 결정.
- mobile-staff / arologis-mobile / web(estimate/order/design-system) 의 buttons-level 권한 사용은 부분 audit. FE button 노출 정책(권한 false 시 hidden vs disabled) 은 Phase 1 UI 정책 결정.
- 본 audit 는 read-only 코드 검사 + grep + FE route 매칭 기반. 일부 audit-revert / restore semantic 은 코드 의미해석에 의존 — Phase 1 IT 가 실증.
