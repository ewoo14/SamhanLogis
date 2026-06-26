# 모바일 레이아웃 갭 클로저 — 슬12~15 설계 (2026-06-26)

> 모바일 에픽② 잔여 반응형 레이아웃 갭 닫기. 개발책임자 스코프 확정: **레이아웃 갭만**
> (PWA/네이티브 패키징/버전관리 에픽③/Phase11 prod cutover 는 별도 에픽으로 분리).

## 배경 — 실서버 라이브 검수로 ground-truth (390px, dev_master)

슬1~11 로 모바일 반응형 골격 완결: 인증 Dual-mode(#596)·Drawer(#597)·DataTable 자동 카드화(#598)·Modal 풀스크린(#599)·FormGrid 1열(#600)·상세 9종 모바일-퍼스트(#602)·mobilePriority 37 리스트(#603~#610). 라이브 검수 결과 **병합분은 무회귀 정상**(드로어 기능·리스트 카드·슬4c 상세·폼 1열). 단 아래 갭이 실측 확인됨:

- 🚨 **원시 `<table>` 리스트가 클립**: 주문서관리 table 515px 가 390px 뷰포트서 우측 잘림(`.app-main overflow-x:hidden` 가 스크롤 대신 클립). 공용 DataTable 미사용이라 슬3 자동 카드화 비적용.
- 🚨 **미이관 입력 폼 글자 뭉개짐**: 견적폼 4열 그리드가 1열로 안 접혀 "거/래/처/명" 세로 분해 + 우측 필드 클립.
- **권한 매트릭스 액션열 클립**: 7-액션 매트릭스(980px)가 모바일서 우측 잘림 → 권한 토글 불가.
- 거래명세서/DPS비교: 시드 데이터 없어(rows 0/1) 라이브 무확인 → 코드로만 갭 확정.

본 에픽 4 슬라이스로 이 갭을 닫는다. 전 슬라이스 공통: **FE-only · Flyway 0 · 데스크탑 무회귀**(@media≤768px 또는 `useIsMobile` 분기) · canonical 8단계 · 매 리뷰 라운드 라이브 Docker QA · PM 자율머지.

## 슬12 — 원시 `<table>` genuine 리스트 8종 카드화

**문제**: 공용 DataTable 미사용 raw `<table>` 8 화면은 슬3 자동 카드화 혜택이 없어 모바일서 클립/압축.

**대상(8)** (clients/desktop/src/renderer/routes):
1. `SalesPartnerOrderListPage` — 주문서 관리 (판매)
2. `SalesOrderApprovalsPage` — 주문서 승인 (판매)
3. `NotificationHistoryPage` — 알림 내역
4. `InventoryDpsComparePage` — DPS 입고 비교 (창고)
5. `ManualDispatchAdminPage` — 수동 배차 (배차)
6. `KakaoAutoDispatchPage` — 카카오톡 자동 매칭 (배차)
7. `ArologisPreClassifyPage` — 가배차 분류 (아로로지스)
8. `ArologisDispatchReconcilePage` — 운송사 실배차 비교 (아로로지스)

**접근**: 표준 리스트성 화면은 **공용 design-system `DataTable` 로 전환** → 슬3 자동 카드화 + mobilePriority 머신을 무료 획득(최대 레버리지). 비교/대조성(DPS비교·실배차비교)으로 전환 비용이 크거나 컬럼 의미가 매트릭스성이면 **`useIsMobile` 카드 폴백**(데스크탑 raw table 보존). 페이지별 판단. 데스크탑 렌더 동일 보존 필수.

**규모 분할 가능**: 12a(판매 2 + 알림 1 = 표준 리스트) / 12b(배차 2 + 아로로지스 2 + DPS 1 = 비교/커스텀). 한 PR 8화면이 과대하면 분할.

## 슬13 — 미이관 입력 폼 ~22곳 FormGrid 1열

**문제**: 인라인 다열 grid 폼이 `@media` 로 안 덮여 ≤768px 1열 미전환 → 라벨/입력 세로 뭉개짐.

**대상(14파일 / ~22폼)**:
- 전표·회계(8): `JournalFormPage:224`, `TaxInvoiceFormPage:424`, `SlipFormPage:544/642/680`, `SlipDetailPage:1875`(기사편집), `TransferFormPage:163/185`
- 견적·품목(6): `EstimateFormPage:501`, `ProductFormPage:875/882`, `EstimatePricingConfigPage:149`, `EstimateItemsCatalogPage:2119`(분류모달), `ProductClassificationsPage:646`
- 그룹웨어(2): `GroupwareApprovalTemplateAdminPage:311`, `GroupwareApprovalCreatePage:295`(2-pane — 경계, 검토)
- 배차(5): `DispatchSmsPage:477`, `ArologisManualDispatchPage:472/508/569/697`
- 공급자(1): `SupplierProfilePage:807`(입금계좌 편집행 — 폼/품목라인 경계, 검토)

**접근**: 공용 `<FormGrid>`(--fg-cols + module.css `@media 1열`) 교체. 품목 라인표(수량/단가/금액)·버튼행·읽기전용 표시는 제외(입력 폼 그리드만). 전역 폼클래스(`.form-row`/`.sfp-form-grid--*`/`.driver-edit-grid`)도 @media 1열 규칙 추가 또는 FormGrid 이관. 슬4b 패턴 재사용.

## 슬14 — overflow/scroll 보강 (소형 CSS)

- **권한 매트릭스 3종**(`PermissionMatrixPage`/`PermissionGroupMatrixPage`/`PermissionMatrixBulkPage`): 7-액션 매트릭스(minWidth 980)에 `overflow-x:auto` 스크롤 래퍼(모바일 액션열 스크롤 도달). sticky 첫 컬럼 유지 검토.
- **거래명세서**(`StatementBatchPage`): raw table(8컬럼 ~820px) overflow 래퍼 부재 → `overflow-x:auto` 래퍼 추가(시드 무관 즉시 적용).
- **sub-nav 2종**(`ProductClassificationsPage`/`EstimateItemsCatalogPage` 카테고리 4탭, inline-flex no-wrap): `overflow-x:auto` + `flex-shrink:0`(공용 Tabs 가로스크롤 패턴 동형).
- **필터바 hard 2종**(`PhotoAuditPage:440` 5열 / `DocumentReferencePicker:191`): 전역 `.mobile-filter-grid`(@media 1열) 적용. (soft ~11 flex-wrap 필터는 자연 줄바꿈 — 선택 이관, 본 슬라이스 제외.)

## 슬15 — mobilePriority 잔여 ~7 폴리시

DataTable 카드는 자동 적용되나 컬럼 우선순위 미튜닝인 저traffic admin 리스트:
`GroupwareApprovalTemplateAdminPage`, `PermissionGroupManagePage`, `AccountTreePage`, `SalesClosingPage`, `MonthEndClosingPage`, `PeriodCloseListPage`, `WarehousesPage`(레거시 중복 확인 후).
컬럼 정의에 `mobilePriority`(primary 제목 / secondary 2열 / hidden) 지정. 슬5~11 패턴. (와이드 재무 리포트 7종 = 의도적 SKIP 유지, 가로스크롤 적절.)

## 실행 순서 & 워크플로우

순서: **슬12(최대 기능 갭) → 슬13(최다 시각 손상) → 슬14(소형) → 슬15(폴리시)**. 순서는 조정 가능.

각 슬라이스 canonical 8단계: Opus 기획+조기PR(OPEN) → Codex 구현(danger-full-access·파일만·git PM 대행, Opus 임의구현 금지) → ④Opus 5차원 ↔ ⑤Codex 0수렴 → 매 라운드 라이브 Docker QA 재캡처(390px, dev_master) → ⑥PM 종합 → ⑦CI green(mock gate hard) → ⑧PM 자율머지. 매 단계 ScheduleWakeup 재자각·mega-턴 금지.

## 검증 & 정직 한계

각 슬라이스 라이브 390px 재캡처(병합 무회귀 + 해당 갭 해소 시각 확인) + 데스크탑 무회귀 + mock gate + CI green. **무시드 화면**(거래명세서·일부 admin·DPS 데이터 0/1)은 코드+패턴 검증으로 대체하고 "라이브 무확인+사유" 정직 보고([[feedback_no_fake_data_ever]]). admin dev_master 403(`mockDepartment=대표실` 우회) 한계도 명시.
