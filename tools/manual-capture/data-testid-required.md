# data-testid 누락 백로그 — frontend-engineer agent

매뉴얼 캡처 (`tools/manual-capture/`) 가 정확한 박스/화살표 어노테이션을 합성하려면 desktop / mobile-staff 의 핵심 element 에 `data-testid` 속성이 필요하다. 누락 시 Playwright 의 `boundingBox()` 가 selector 를 해석하지 못해 어노테이션이 skip 된다.

본 문서는 `capture.config.json` 의 `screens[]` 가 참조하는 selector 의 누락 현황을 추적한다. frontend-engineer agent 가 슬라이스별로 추가 후 본 문서를 갱신.

## 우선순위 1 — Stage 1 캡처 화면 (즉시 필요)

### `LoginPage` (`clients/desktop/src/renderer/routes/LoginPage.tsx`)

| selector | element | 상태 |
|----------|---------|------|
| `[data-testid="login-id-input"]` | 로그인 ID `Input` | 누락 |
| `[data-testid="login-password-input"]` | 비밀번호 `Input` | 누락 |
| `[data-testid="login-submit-button"]` | 로그인 `Button` (type=submit) | 누락 |

**fallback**: `capture-desktop.js` 의 `performLogin` 은 `input[type="text"]` / `input[type="password"]` / `button[type="submit"]` 으로 폴백 — Stage 1 캡처는 동작하나 명시적 testid 권장.

### `AppLayout` (`clients/desktop/src/renderer/components/AppLayout.tsx`)

| selector | element | 상태 |
|----------|---------|------|
| `[data-testid="sidebar-sales"]` | `<NavLink to="/sales">판매관리</NavLink>` | 완료 (SP-04) |
| `[data-testid="sidebar-warehouses"]` | `<NavLink to="/warehouses">창고 관리</NavLink>` | 완료 (SP-04) |
| `[data-testid="sidebar-purchases"]` | `<NavLink to="/purchases">구매관리</NavLink>` | 완료 (SP-04) |
| `[data-testid="sidebar-transfers"]` | `<NavLink to="/transfers">재고이동 관리</NavLink>` | 완료 (SP-04) |
| `[data-testid="sidebar-link-dispatch"]` | `<SidebarLink to="/sales/link-dispatch">링크발송</SidebarLink>` | 완료 (SP-04, MANAGER/MASTER 가드) |
| `[data-testid="sidebar-accounting-accounts"]` | 회계 그룹 — 계정과목 (ACCOUNTANT/MANAGER/MASTER) | 완료 (SP-04) |
| `[data-testid="sidebar-accounting-journals"]` | 회계 그룹 — 분개장 | 완료 (SP-04) |
| `[data-testid="sidebar-accounting-balances"]` | 회계 그룹 — 시산표 | 완료 (SP-04) |
| `[data-testid="sidebar-logout"]` | 우상단 로그아웃 `Button` | 누락 |
| `[data-testid="header-user-name"]` | 우상단 사용자명 표시 | 누락 |
| `[data-testid="header-page-title"]` | 동적 페이지 제목 (`usePageTitleStore`) | 완료 (SP-04) |

## 우선순위 2 — Stage 3 캡처 화면 (annotation 박스 미해석 — 즉시 필요)

Stage 3 (`capture.config.json` v3) 가 14 desktop + 4 mobile 화면을 정의했으나, 아래 selector 들이 모두 `[warn] 미발견` 으로 skip 되었다. PNG 원본은 캡처되었으나 annotation 박스(붉은 박스) 가 합성되지 않으므로 매뉴얼 가이드 효과가 떨어진다. 본 우선순위 2 의 testid 를 추가하면 `node capture-desktop.js` 재실행만으로 박스 합성이 자동 적용된다.

### `SlipListPage` (출고전표 / 입고전표 목록)

| selector | element |
|----------|---------|
| `[data-testid="slip-list-table"]` | 전표 목록 table |
| `[data-testid="slip-list-add-button"]` | 신규 작성 버튼 |
| `[data-testid="slip-list-search-input"]` | 검색 input |
| `[data-testid="slip-list-status-filter"]` | 상태 필터 select |

### `SlipFormPage` (전표 작성)

| selector | element |
|----------|---------|
| `[data-testid="slip-form-partner-select"]` | 거래처 검색/선택 |
| `[data-testid="slip-form-warehouse-select"]` | 창고 select |
| `[data-testid="slip-form-line-add"]` | 품목 라인 추가 |
| `[data-testid="slip-form-submit"]` | 등록 버튼 |

### `WarehousesPage`

| selector | element | 상태 |
|----------|---------|------|
| `[data-testid="warehouse-list-table"]` | 창고 목록 table | 완료 (SP-04) |
| `[data-testid="warehouse-add-button"]` | 창고 추가 버튼 | 완료 (SP-04) |
| `[data-testid="warehouse-edit-button"]` | row 별 편집 버튼 (`[data-testid="warehouse-row-{id}-edit"]`) |

### `SalesEstimateListPage` / `EstimateLegacyWebviewPage`

| selector | element |
|----------|---------|
| `[data-testid="estimate-list-new-button"]` | 견적서 신규 작성 |
| `[data-testid="estimate-legacy-webview"]` | webview placeholder |
| `[data-testid="estimate-print-button"]` | 인쇄 버튼 |

### accounting-slice-A — `JournalListPage` / `JournalFormPage` / `TrialBalancePage`

| selector | element |
|----------|---------|
| `[data-testid="journal-list-table"]` | 분개장 목록 |
| `[data-testid="journal-list-add-button"]` | 분개 신규 작성 |
| `[data-testid="journal-form-debit-line"]` | 차변 라인 input |
| `[data-testid="journal-form-credit-line"]` | 대변 라인 input |
| `[data-testid="journal-form-confirm"]` | 확정 버튼 |
| `[data-testid="trial-balance-month-select"]` | 월 선택 |
| `[data-testid="trial-balance-table"]` | 시산표 table |
| `[data-testid="account-tree-root"]` | 계정과목 트리 root (100/200/.../900) |

### `TransferListPage` / `LinkDispatchListPage` (Stage 3 신규)

| selector | element | 상태 |
|----------|---------|------|
| `[data-testid="transfer-list-table"]` | 재고이동 목록 | 완료 (SP-04) |
| `[data-testid="transfer-list-add-button"]` | 재고이동 신규 | 완료 (SP-04) |
| `[data-testid="link-dispatch-table"]` | 링크발송 배송 묶음 목록 | 누락 |
| `[data-testid="link-dispatch-send-button"]` | SMS 일괄 발송 | 누락 |

### `SalesPartnerOrderListPage` / `SalesOrderApprovalsPage` / `SalesPartnerDcConfigPage` (Phase 6 v4)

| selector | element |
|----------|---------|
| `[data-testid="partner-order-list-table"]` | 거래처 주문서 목록 |
| `[data-testid="order-approvals-table"]` | 주문서 승인 목록 |
| `[data-testid="order-approve-button"]` | 주문서 승인 버튼 |
| `[data-testid="partner-dc-config-table"]` | 거래처 DC 설정 table |

## 우선순위 3 — mobile-staff (Expo)

### Login + Drawer

| selector | element |
|----------|---------|
| `[data-testid="mobile-login-id"]` | 모바일 로그인 ID |
| `[data-testid="mobile-login-password"]` | 모바일 로그인 PW |
| `[data-testid="mobile-login-submit"]` | 로그인 버튼 |
| `[data-testid="mobile-drawer-toggle"]` | ▼ 페이지 메뉴 토글 |
| `[data-testid="mobile-drawer-menu"]` | 13 메뉴 dropdown |

(Stage 2 에서 mobile-staff 화면 정의가 capture.config.json 에 추가될 때 본 섹션 갱신.)

## 우선순위 4 — Phase 10 step-8 9 슬라이스 (사전 spec)

> 9 슬라이스 통합 PR (`feature/integrated-phase-10-step-8-ui-9-slice`) 의 신규 페이지에 대한 data-testid 사전 명세. 각 슬라이스 PR 의 frontend-engineer agent 가 본 표를 기준으로 testid 부여 + 후속 PR 의 `capture-desktop.js` / `capture-mobile.js` 가 박스 어노테이션 자동 합성.

### 슬라이스 1 — 비밀번호 재설정 (P0-2, auth-service + desktop)

매뉴얼 출처: `docs/manual/06-트러블슈팅/01-로그인-실패.md` §1-3

| selector | element | route |
|----------|---------|-------|
| `[data-testid="password-reset-email-input"]` | reset 요청 이메일 input | LoginPage `PasswordResetDialog` STEP 1 |
| `[data-testid="password-reset-token-input"]` | 토큰 input (이메일 본문 복사) | `PasswordResetDialog` STEP 2 |
| `[data-testid="password-reset-new-password-input"]` | 신규 비밀번호 input | `PasswordResetDialog` STEP 2 |
| `[data-testid="password-reset-submit-button"]` | STEP 1/STEP 2 공통 제출 버튼 | `PasswordResetDialog` |
| `[data-testid="password-policy-hint"]` | 정책 힌트 (8자/특수문자) | `PasswordResetDialog` + `/password/change` |
| `[data-testid="password-change-current"]` | 본인 비밀번호 변경 — 현재 PW | `/password/change` (`PasswordChangePage`) |
| `[data-testid="password-change-new"]` | 본인 비밀번호 변경 — 신규 PW | `/password/change` |
| `[data-testid="password-change-submit"]` | 본인 비밀번호 변경 — 제출 | `/password/change` |
| `[data-testid="account-locked-banner"]` | 5회 실패 잠금 배너 | login page (잠금 시) |
| `[data-testid="master-account-unlock-button"]` | MASTER unlock 버튼 (per row) | `/admin/users` (P0-5 의존) |
| `[data-testid="header-user-menu-password-change"]` | 헤더 메뉴 — 비밀번호 변경 navigate | AppLayout 헤더 |

### 슬라이스 2 — 회계 17 보고서 (P0-1, accounting-service + desktop)

매뉴얼 출처: `docs/manual/02-회계/02-보고서.md`

| selector | element | route |
|----------|---------|-------|
| `[data-testid="report-list-side-tree"]` | 17 보고서 좌측 트리 (경영자료 9 / 장부 11 / 재무제표 5) | `/accounting/reports` |
| `[data-testid="report-balance-sheet-print"]` | 재무상태표 인쇄 버튼 | `/accounting/reports/balance-sheet` |
| `[data-testid="report-income-statement-print"]` | 손익계산서 인쇄 버튼 | `/accounting/reports/income-statement` |
| `[data-testid="report-trial-balance-period-select"]` | 시산표 기간 select (월/분기/년) | `/accounting/reports/trial-balance` |
| `[data-testid="report-cash-daily-table"]` | 자금일보 table | `/accounting/reports/cash-daily` |
| `[data-testid="report-account-ledger-account-select"]` | 계정별원장 — 계정 선택 | `/accounting/reports/account-ledger` |
| `[data-testid="report-partner-ledger-partner-search"]` | 거래처별원장 — 거래처 검색 | `/accounting/reports/partner-ledger` |
| `[data-testid="report-export-excel"]` | Excel export 버튼 (모든 보고서 공통) | `/accounting/reports/*` |

### 슬라이스 3 — 거래처 등록 4 탭 (P0-6, desktop)

매뉴얼 출처: `docs/manual/01-영업/02-거래처-조회.md`

| selector | element | route |
|----------|---------|-------|
| `[data-testid="partner-form-tab-basic"]` | 탭 1 — 기본 | `/admin/partners/new` |
| `[data-testid="partner-form-tab-info"]` | 탭 2 — 거래처정보 | 동일 |
| `[data-testid="partner-form-tab-credit"]` | 탭 3 — 여신/단가 | 동일 |
| `[data-testid="partner-form-tab-extra"]` | 탭 4 — 부가정보 | 동일 |
| `[data-testid="partner-form-business-no"]` | 사업자등록번호 input | 탭 2 |
| `[data-testid="partner-form-credit-limit"]` | 여신한도 input | 탭 3 |
| `[data-testid="partner-form-pay-due-day"]` | 수금/지급예정일 select | 탭 3 |
| `[data-testid="partner-form-submit"]` | 거래처 등록 제출 | 탭 1~4 footer |

### 슬라이스 4 — 품목 등록 7 탭 (P0-7, desktop)

매뉴얼 출처: `docs/manual/01-영업/01-품목조회.md`

| selector | element | route |
|----------|---------|-------|
| `[data-testid="product-form-tab-basic"]` | 탭 1 — 기본 | `/admin/products/new` |
| `[data-testid="product-form-tab-info"]` | 탭 2 — 품목정보 | 동일 |
| `[data-testid="product-form-tab-quantity"]` | 탭 3 — 수량 | 동일 |
| `[data-testid="product-form-tab-price"]` | 탭 4 — 단가 | 동일 |
| `[data-testid="product-form-tab-cost"]` | 탭 5 — 원가 | 동일 |
| `[data-testid="product-form-tab-extra"]` | 탭 6 — 부가정보 | 동일 |
| `[data-testid="product-form-tab-managed"]` | 탭 7 — 관리대상 | 동일 |
| `[data-testid="product-form-vat-rate-sales"]` | 매출 부가세율 input | 탭 2 |
| `[data-testid="product-form-vat-rate-purchase"]` | 매입 부가세율 input | 탭 2 |
| `[data-testid="product-form-safety-stock"]` | 안전재고 input | 탭 3 |

### 슬라이스 5 — 사용자 / 권한 관리 화면 (P0-5, desktop)

매뉴얼 출처: `docs/manual/00-시작하기/03-역할별-권한.md`

| selector | element | route |
|----------|---------|-------|
| `[data-testid="admin-users-table"]` | 직원 목록 table | `/admin/users` |
| `[data-testid="admin-users-add-button"]` | 신규 직원 등록 | `/admin/users` |
| `[data-testid="admin-users-disable-button"]` | 계정 비활성화 토글 (per row) | `/admin/users` |
| `[data-testid="admin-users-enable-button"]` | 계정 활성화 토글 (per row) | `/admin/users` |
| `[data-testid="admin-users-role-select"]` | ROLE 변경 select | `/admin/users/{id}/role` |
| `[data-testid="role-matrix-table"]` | 권한 매트릭스 (9 ROLE × endpoint) | `/admin/roles` |
| `[data-testid="org-chart-tree"]` | 조직도 트리 | `/admin/org-chart` |

### 슬라이스 6 — 모바일 사진 첨부 (P1-8, mobile-staff RN Expo)

매뉴얼 출처: `docs/manual/04-모바일/04-사진-첨부.md`

| selector | element | screen |
|----------|---------|--------|
| `[testID="attachment-camera-button"]` | [사진 첨부] 버튼 (정차 도착 후 노출) | `PhotoAttachmentCapture` (driver `SignaturePhotoScreen` 내) |
| `[testID="attachment-gallery-button"]` | 갤러리에서 선택 버튼 | `PhotoAttachmentCapture` |
| `[testID="attachment-file-button"]` | 파일 선택 버튼 (Android) | `PhotoAttachmentCapture` |
| `[testID="attachment-preview-{i}"]` | 촬영된 사진 thumbnail (index 별) | `PhotoAttachmentCapture` |
| `[testID="attachment-delete-{i}"]` | thumbnail 삭제 (per item, 24h 내 본인만) | `PhotoAttachmentCapture` |
| `[testID="attachment-upload-progress"]` | 업로드 progress bar | `PhotoAttachmentCapture` |
| `[testID="attachment-enable-toggle"]` | 사진 첨부 toggle | `SignaturePhotoScreen` |
| `[testID="attachment-type-delivery"]` | 배송 사진 타입 | `SignaturePhotoScreen` |
| `[testID="attachment-type-inspection"]` | 검수 사진 타입 | `SignaturePhotoScreen` |
| `[testID="attachment-upload-button"]` | 업로드 버튼 | `SignaturePhotoScreen` |

### 슬라이스 7 — 슬립 검수 UI (P0-9, desktop + mobile-staff)

매뉴얼 출처: `docs/manual/03-창고/02-입고-검수.md`

| selector | element | route |
|----------|---------|-------|
| `[data-testid="slip-inspect-page"]` | 검수 page root | `/slips/{id}/inspect` |
| `[data-testid="slip-inspect-line-row-{lineNo}"]` | 라인별 row | 동일 |
| `[data-testid="slip-inspect-line-status-normal"]` | 정상 radio | per row |
| `[data-testid="slip-inspect-line-status-defect"]` | 불량 radio | per row |
| `[data-testid="slip-inspect-line-status-missing"]` | 누락 radio | per row |
| `[data-testid="slip-inspect-photo-attach"]` | 검수 사진 첨부 (P0-3 + P1-8 의존) | per row |
| `[data-testid="slip-inspect-confirm-button"]` | 검수 완료 → DELIVERED 트리거 | footer |

### 슬라이스 8 — 알림 UI 통합 (P1-1, desktop AppLayout)

매뉴얼 출처: `docs/manual/00-시작하기/02-메인-화면.md` §3-5 (예정)

| selector | element | location |
|----------|---------|----------|
| `[data-testid="header-notification-bell"]` | 🔔 알림 벨 | `AppLayout` 헤더 우상단 |
| `[data-testid="header-notification-badge"]` | 미확인 카운트 뱃지 | bell 우상단 |
| `[data-testid="notification-dropdown"]` | 알림 dropdown | bell 클릭 시 |
| `[data-testid="notification-dropdown-item-{id}"]` | 알림 row | dropdown 내 |
| `[data-testid="notification-mark-read-all"]` | 모두 읽음 처리 | dropdown footer |
| `[data-testid="notification-go-to-list"]` | 알림 전체 목록 이동 | dropdown footer |
| `[data-testid="notification-list-page"]` | 알림 전체 page | `/admin/notifications` |
| `[data-testid="notification-settings-button"]` | 사용자별 알림 설정 | `/admin/profile/notifications` |

### 슬라이스 9 — arologis 배차 화면 보강 (P1-5, desktop)

매뉴얼 출처: `docs/manual/05-arologis/01-수동-배정.md`

| selector | element | route |
|----------|---------|-------|
| `[data-testid="arologis-dispatch-list-table"]` | 배차 목록 table | `/arologis/dispatches` |
| `[data-testid="arologis-dispatch-add-button"]` | 수동 배차 등록 | `/arologis/dispatches/new` |
| `[data-testid="arologis-driver-assign-select"]` | 기사 배정 select (drag 미지원 시 폴백) | per row |
| `[data-testid="arologis-driver-auto-assign-button"]` | 자동 배정 (DriverMatcher) 버튼 | per row |
| `[data-testid="arologis-gps-map-container"]` | GPS 지도 컨테이너 (관리자 view) | `/arologis/gps` |
| `[data-testid="arologis-gps-driver-marker-{driverId}"]` | 기사 marker | 지도 내 |
| `[data-testid="arologis-vendor-sync-button"]` | 인성데이타 vendor 양방향 sync 버튼 | `/arologis/vendor` |
| `[data-testid="arologis-dispatch-print-button"]` | 배차 지시서 인쇄 양식 | per row + detail page |

### 슬라이스 10 — 매출 마감 (P2-4, accounting-service + desktop) — TM 추가

매뉴얼 출처: `docs/manual/02-회계/04-매출-마감.md`
실 FE: `clients/desktop/src/renderer/routes/MonthEndClosingPage.tsx`

| selector | element | route |
|----------|---------|-------|
| `[data-testid="closing-new-button"]` | 신규 마감 (DAILY/MONTHLY 모달 진입) | `/accounting/closings` |
| `[data-testid="closing-list-table"]` | 마감 목록 table | `/accounting/closings` |
| `[data-testid="closing-reverse-button"]` | 역마감 버튼 (MASTER 만 노출) | `/accounting/closings` per row |
| `[data-testid="period-lock-banner-locked"]` | 마감 일자 변경 차단 배너 (시산표 등) | `/accounting/reports/*` |

### 슬라이스 11 — 재고 실사 (P2-6, inventory-service + desktop) — TM 추가

매뉴얼 출처: `docs/manual/03-창고/05-재고-실사.md`
실 FE: `clients/desktop/src/renderer/routes/InventoryAudit*.tsx`

| selector | element | route |
|----------|---------|-------|
| `[data-testid="audit-list-table"]` | 실사 목록 table | `/inventory/audits` |
| `[data-testid="audit-list-new-button"]` | 신규 실사 등록 navigate | `/inventory/audits` |
| `[data-testid="audit-list-warehouse-filter"]` | 창고 필터 select | `/inventory/audits` |
| `[data-testid="audit-list-year-filter"]` | 연도 필터 select | `/inventory/audits` |
| `[data-testid="audit-list-status-filter"]` | 상태 필터 select (PLANNED/IN_PROGRESS/COMPLETED/CANCELLED) | `/inventory/audits` |
| `[data-testid="audit-form-warehouse-select"]` | 폼 — 창고 select | `/inventory/audits/new` |
| `[data-testid="audit-form-date-input"]` | 폼 — 실사 일자 input | `/inventory/audits/new` |
| `[data-testid="audit-form-submit"]` | 폼 — 등록 (PLANNED + snapshot 자동) | `/inventory/audits/new` |
| `[data-testid="audit-detail-header"]` | detail 헤더 (실사번호 / 창고 / 상태) | `/inventory/audits/{id}` |
| `[data-testid="audit-start-button"]` | PLANNED → IN_PROGRESS | detail |
| `[data-testid="audit-complete-button"]` | IN_PROGRESS → COMPLETED + 차이 분개 trigger | detail |
| `[data-testid="audit-cancel-button"]` | PLANNED/IN_PROGRESS → CANCELLED | detail |
| `[data-testid="audit-line-barcode-input"]` | 라인 입력 — 바코드 input | detail |
| `[data-testid="audit-line-actual-input"]` | 라인 입력 — 실사 수량 input | detail |
| `[data-testid="audit-line-record-button"]` | 라인 입력 — 저장 버튼 | detail |
| `[data-testid="audit-detail-lines-table"]` | 라인 list table (snapshot + actual + diff) | detail |
| `[data-testid="audit-journal-link"]` | 차이 분개 link (150/919) | detail |

### 슬라이스별 spec 갱신 protocol

각 슬라이스 PR 발행 시 frontend-engineer agent 가 본 표의 "상태" 컬럼 (현재는 `누락` 가정) 을 `완료 (PR #N)` 로 갱신. 누락 selector 가 `[warn]` 출력되면 PR 머지 전 fix 의무.

## 추가 가이드

- `data-testid` 값은 **kebab-case**, **slice-prefix** (`sidebar-*`, `slip-list-*`, `warehouse-*`).
- React Testing Library 의 `getByTestId` 와 호환 — 향후 단위 테스트에서도 재사용.
- Designer 가 wireframe 의 element 명을 그대로 testid 로 채택 (디자인 시스템 일관성).
- 누락 시 `capture-desktop.js` 가 `[warn] selector 미발견` 출력 — CI 에서 경고 수집 가능 (Stage 3).

## 갱신 절차

1. frontend-engineer agent 가 슬라이스별 PR 에서 testid 추가
2. 본 문서 표의 "상태" 컬럼을 "완료 (PR #N)" 로 갱신
3. 매뉴얼 캡처 작성자가 `node capture-desktop.js` 재실행하여 어노테이션 검증
