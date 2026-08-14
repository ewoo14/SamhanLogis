// Pretendard @font-face 선언을 dist/style.css 에 포함 — desktop/order-app 등이
// `@samhan/design-system/style.css` 만 import 해도 self-host font 경로가 등록됨.
// fonts.css 는 side-effect only (no exports).
import './styles/fonts.css'

export * from './tokens'
export * from './components/Badge'
export * from './components/Button'
export * from './components/Card'
export * from './components/DataTable'
export * from './components/FormField'
export * from './components/Input'
export * from './components/Select'
export * from './components/Label'
export * from './components/Modal'
export * from './components/DeliveryTagSelector'
export * from './components/PriceField'
export * from './components/SlipNumberDisplay'
export * from './components/SlipStatusBadge'
export * from './components/OrderNumberDisplay'
export * from './components/OrderStatusBadge'
export * from './components/Spinner'
export * from './components/MascotLoader'
export * from './components/MascotEmptyState'
export * from './components/TagChip'
export * from './components/TagInput'
// WarehouseSelector 제거(2026-06-03) — 전 창고 선택 UI 가 WarehouseAutocomplete 로 일원화됨.
//   Warehouse/WarehouseType 타입은 WarehouseAutocomplete 에서 export.
// sales-form-polish 슬라이스 신규 컴포넌트
export * from './components/DragHandle'
export * from './components/LineRow'
// sales-polish-2-slice (Slice A) 신규 컴포넌트
export * from './components/ProgressBar'
// link-dispatch-slice 신규 컴포넌트 (PhoneInput / CopyButton)
export * from './components/PhoneInput'
export * from './components/CopyButton'
// Phase 9 W4 후속 fix (Designer D-W4-2 + FE-W4-1/2/3 통합) — ChannelBadge 컴포넌트
export * from './components/ChannelBadge'
// signature-slice-C (Slice C) 신규 컴포넌트 (SignaturePad / SignatureViewer)
export * from './components/SignaturePad'
export * from './components/SignatureViewer'
// accounting-slice-A (Phase 4 회계 Slice A) 신규 컴포넌트 4종
export * from './components/AccountCodeSelect'
export * from './components/JournalStatusBadge'
export * from './components/MoneyInput'
export * from './components/JournalLineRow'
// legacy-migration DS 사전 작업 (feature/migration-ds-extension) — 6 신규 컴포넌트
// 출처: migration/analysis/06-frontend-design.md §3.2
export * from './components/EstimateLineRow'
export * from './components/BundleExpandToggle'
export * from './components/ProductSpecList'
export * from './components/CategoryTabs'
// SpecAddModal 은 CategoryTabs 의 EstimateCategory 를 재사용 (중복 export 방지)
export * from './components/SpecAddModal'
export * from './components/PrintPreview'
// PR-D Phase B 신규 — 4 admin 페이지 (Regions/DcConfig/ChatRooms/BlockedPartners) 공통 CSV 일괄 등록 다이얼로그
export * from './components/CsvUploadDialog'
// Phase 12 시리즈 공유 자산 — userId → HSL 색상 deterministic hash util
// 사용처: PR-H2 audit overlay 수정자 색상 dot, PR-H3 코멘트 author avatar 배경색
export * from './utils'
// PR-H2 신규 — SlipDetailPage audit overlay 컴포넌트 (취소선 + 색상 + 수정자)
export * from './components/AuditOverlay'
// PR-H3 신규 — CONFIRMED 전표 수정/삭제 요청 사유 입력 다이얼로그
export * from './components/SlipEditRequestDialog'
// P0-6 신규 — 범용 Tabs (tablist + tabpanel ARIA) 거래처 4탭 등록/조회 UI 첫 사용
export * from './components/Tabs'
// P1-3 신규 — 안전재고 긴급도 4단계 Badge (CRITICAL/DANGER/WARNING/NOTICE) + calcUrgencyLevel 유틸
export * from './components/UrgencyBadge'
export * from './components/AppUpdateNotice'
// P1-6 신규 — Excel/CSV blob 다운로드 버튼 (4 list 페이지 공통 사용)
export * from './components/ExcelDownloadButton'
// supplier-profile + datagrid 슬라이스 신규 — Excel-like DataGrid (열헤더 필터 + 다중 셀 선택 + 복사/붙여넣기)
export * from './components/DataGrid'
// mobile-s4b 슬라이스 신규 — 반응형 폼 그리드(데스크탑 N열/≤768px 1열)
export * from './components/FormGrid'
// AC-1 슬라이스 신규 — 창고 자동완성 typeahead (AccountCodeSelect 패턴 이식)
export * from './components/WarehouseAutocomplete'
// AC-2 슬라이스 신규 — 품목 서버검색 자동완성 (async debounced, stale 방지)
export * from './components/ProductAutocomplete'
// AC-3 슬라이스 신규 — 거래처 서버검색 자동완성 (async debounced, stale 방지)
export * from './components/PartnerAutocomplete'
// AAC 공통화 — Product/Partner async 자동완성 공용 base
export * from './components/AsyncAutocomplete'
// #825 슬4 — AsyncAutocomplete + TagChip 조합 복수선택 표준
export * from './components/MultiSelectAutocomplete'
export * from './components/SearchResultSelectionModal'
// #825 슬4 — 검색 없는 순서형 문자열 칩 입력
export * from './components/FreeTextChipInput'
