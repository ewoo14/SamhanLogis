# migration-fe-desktop-sales — Phase 6 frontend Sub-team Desktop

본 문서는 `feature/migration-fe-desktop-sales` 슬라이스 (Phase 6 Sub-team A+B 통합 — FRONTEND + DESIGN + QA) 의 함수 단위 누적 기록이다 (`feedback_function_documentation.md` 3-layer 가드).

## 목표

clients/desktop 의 [판매] 메뉴 신설 — 견적서 / 주문서 조회 / 장기미발주 3 화면 (총 7 sub-route). legacy estimate index.html (18,614 라인) 의 화면 구조를 React 로 1:1 변환하고, M1a backend 의 카탈로그 / Spec / SpecKeyTemplate endpoint 를 실 fetch.

## 핵심 결정 (임무 prompt)

| 코드 | 결정 | 본 슬라이스에서 적용 |
|---|---|---|
| F1 (a) | legacy 100% 보존 | sales.module.css 의 `--c-bg/--c-line/--c-accent` 등 legacy CSS variable 그대로 옮김. DS 컴포넌트 import 0 (Button/Card/Input 등 self-contained). |
| F3 | 인쇄 react-pdf 사용 (skeleton + M3 완성) | 본 슬라이스는 CSS-only A4 portrait preview (브라우저 인쇄 → PDF 저장). react-pdf 통합은 후속. |
| F5 | 종합견적서 layout 인쇄 | `SalesEstimatePrintPage` 의 `.printPaper` (794×1123 px) 안에 헤더 / 거래처 box / 라인 표 / 합계 row. |
| G13 (b) | 분기계산 화면 skeleton/placeholder | `BranchCalcPlaceholder` 컴포넌트 — "M3 단계 EstimateBranchCalcService 통합 예정" 라벨. |
| M1a 실 fetch | ProductMaster + ProductSpec + Bundle | `api/sales.ts` 의 `listProducts` / `getProductSpecs` / `listSpecKeyTemplates` / `listMaterialPrices` / `listOduRecommendations` / `lookupBranchPipe`. |

## 신규 / 변경 파일 목록

### renderer (React)

신규 — 9 routes/components:
- `clients/desktop/src/renderer/api/sales.ts` — 판매 도메인 API client (M1a + M3 + M4 + M5 endpoint 9종)
- `clients/desktop/src/renderer/stores/usePricingStore.ts` — Zustand store (라인 / 합계 / 카테고리 / 거래처 form)
- `clients/desktop/src/renderer/components/sales/sales.module.css` — legacy CSS 보존 (theme variable 14개 + table + modal + print layout)
- `clients/desktop/src/renderer/components/sales/SalesSubNav.tsx` — sub-nav (3 sub-route 탭)
- `clients/desktop/src/renderer/components/sales/CategoryTabs.tsx` — legacy `body.{cat}-active` toggle 대체 (4 카테고리 + count badge)
- `clients/desktop/src/renderer/components/sales/EstimateLineRow.tsx` — 견적/주문 라인 row (수량 input + Bundle 토글 + spec 클릭)
- `clients/desktop/src/renderer/components/sales/BundleExpandToggle.tsx` — DOMAIN-EXTENSIONS §2 EXPAND/KEEP 토글
- `clients/desktop/src/renderer/components/sales/ProductPickerModal.tsx` — legacy `#modalInventory` 의 React 변환 (M1a `GET /api/v1/products` 실 fetch)
- `clients/desktop/src/renderer/components/sales/ProductSpecModal.tsx` — legacy `#dlgSpec` 변환 (M1a `GET /api/v1/products/{code}/specs` 실 fetch)
- `clients/desktop/src/renderer/components/sales/AddrSearchDock.tsx` — legacy `#addrDock` (Daum Postcode 미통합 — 수동 입력 dialog)
- `clients/desktop/src/renderer/routes/SalesEstimateListPage.tsx` — `/sales/estimates`
- `clients/desktop/src/renderer/routes/SalesEstimateFormPage.tsx` — `/sales/estimates/new` + `/sales/estimates/:id` (mock)
- `clients/desktop/src/renderer/routes/SalesEstimateDetailPage.tsx` — `/sales/estimates/:id` (read-only)
- `clients/desktop/src/renderer/routes/SalesEstimatePrintPage.tsx` — `/sales/estimates/:id/print`
- `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx` — `/sales/partner-orders`
- `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` — `/sales/partner-orders/:id` (Bundle expanded components 표시)
- `clients/desktop/src/renderer/routes/SalesLongPendingPage.tsx` — `/sales/long-pending`

변경:
- `clients/desktop/src/renderer/routes/index.tsx` — 7 sub-route 추가 + import
- `clients/desktop/src/renderer/components/AppLayout.tsx` — sidebar 에 [판매] 그룹 + 3 NavLink 추가
- `clients/desktop/src/renderer/api/mock.ts` — sales mock seed 6 group 추가 (catalog 11 row / specs / templates / estimates 5 / partner-orders 4 / long-pending 5)
- `clients/desktop/src/main/capture.ts` — `CAPTURE_SLICE=migration-fe-desktop` 분기 (6 캡처 라우트)

## 검증 결과

| 단계 | 명령 | 결과 |
|---|---|---|
| design-system 사전 빌드 | `cd clients/web/design-system && npm run build` | PASS — dist 105 modules / 92 KB |
| desktop typecheck (node + web) | `cd clients/desktop && npm run typecheck` | PASS (0 error) |
| desktop lint | `cd clients/desktop && npm run lint` | PASS — 본 슬라이스 신규 0 warning (기존 SlipDetailPage 1 unrelated) |
| desktop build (mock 모드) | `VITE_MOCK_MODE=1 npm run build` | PASS — out/renderer 119 KB CSS / 1060 KB JS |
| 캡처 6장 (Edge headless) | PowerShell + msedge --headless=new | 6/6 OK (41~71 KB) |

## 캡처 결과

`docs/qa/migration-fe-desktop/` (6장 PNG, 1920×1080, mock 모드 빌드 + Edge headless):
1. `01-desktop-sales-menu.png` — sidebar [판매] 그룹 + 3 sub-route NavLink + sub-nav 표시 (= 02 와 동일 화면 다른 angle)
2. `02-desktop-estimate-list.png` — 견적서 목록 5건 (확정/발송/작성중/전표전환/취소 status badge + 카테고리 분포)
3. `03-desktop-estimate-form-home.png` — 견적서 작성 (홈멀티 active 카테고리 탭 + 라인 grid + 거래처/배송 form + 분기계산 placeholder)
4. `04-desktop-estimate-print.png` — A4 portrait 인쇄 미리보기 (헤더 + 거래처 box + 라인 표 + 합계 row)
5. `05-desktop-partner-orders.png` — 주문서 조회 4건 (status filter dropdown + 연결 슬립 컬럼)
6. `06-desktop-long-pending.png` — 장기미발주 5건 (LONG_PENDING_NO_ORDER / ACCESS_DENIED status badge + 미발주 일수 yellow badge)

## legacy 모방 범위 / 후속 결정 필요 항목

### 본 슬라이스 완성 범위
- 4 카드 grid → 단일 활성 카드 + CategoryTabs 패턴 (legacy `body.{cat}-active` className toggle 의 React 등가)
- 거래처/배송/현장 form (`#cardOrderInfo`) — 8 fields + 주소 검색 dock (수동 입력 fallback)
- 라인 grid + 수량 input → 자동 소계/합계 selector (Zustand `usePricingStore`)
- ProductPickerModal — M1a 실 fetch + 카테고리 자동 필터
- ProductSpecModal — M1a 실 fetch + displayOrder 정렬
- 인쇄 미리보기 (CSS-only A4)
- Bundle EXPAND/KEEP 토글 (DOMAIN-EXTENSIONS §2)
- 변동DC marker badge (backend `VariableDiscountDetector` 결과 받아 표시)

### 본 슬라이스 미완성 (후속 슬라이스 예정 — 사용자 결정 요청)
1. **분기계산 (`pageBranch`) DnD 매트릭스** — G13 b 결정대로 placeholder. M3 EstimateBranchCalcService + react-beautiful-dnd 통합 예정.
2. **Excel 키보드 매트릭스** (`initKeyboardFix` line 16936) — 셀 단위 화살표 네비, 셀 합계 badge. MVP 단계에서 보류.
3. **남은 모달 7종** (12 → 5 완성):
   - 미완성: `#dlgSlipDetail` (전표 인쇄 미리보기) / `#dlgInvoice` (거래명세서 상세) / `#pageHistory` (Notion DB 조회) / `#snapshotTableBody` (견적 저장내역) / `#showCustNameModal` (저장 시 거래처명) / `#dlgProgress` (전송 진행) / `#gateImageModal` (게이트 슬라이더)
   - 완성: `#modalInventory` (ProductPickerModal) / `#dlgSpec` (ProductSpecModal) / `#addrDock` (AddrSearchDock) / `#cardOrderInfo` 의 form / 인쇄 미리보기
4. **Daum Postcode SDK 통합** — 현재 수동 입력 dialog. `react-daum-postcode` 또는 직접 SDK script 후속.
5. **react-pdf 통합** — F3/F5 결정대로 인쇄는 CSS-only preview + 브라우저 인쇄. PDF embed 양식은 후속 슬라이스.
6. **인터랙션 7종 중 5종** — `recompute*Derived` (자동 패널/리모컨/분기관 추가) 의 실 backend 룰 반영, drag&drop 라인 재정렬, custom rows 추가, 다크모드 toggle, 자동 로그아웃 timer 표시. Zustand store 의 `addLineFromCatalog` 가 단순 upsert 만 — 자동 derived 추가는 backend `EstimateService.computeDerivedLines` 통합 후 적용.

### 사용자 후속 결정 요청
- 본 슬라이스의 견적 작성 화면이 4 카드 grid 가 아닌 **단일 활성 카드 + 카테고리 탭** 패턴이다. legacy 의 4 카드 동시 노출이 익숙하다면 후속 슬라이스에서 `media (min-width: 1920px)` 분기로 4 카드 grid 동시 표시 가능. 어떤 패턴이 사용자가 더 익숙한지 결정 필요.
- 견적 라인 grid 의 컬럼 수가 본 슬라이스에서는 7 col (체크 미포함). legacy 는 8~10 col (체크 박스 + 분류 L/M/S/D + 모델 + 출고가 + 규격 + 수량 + 납품가 + 소계). 컬럼 추가 필요 여부 결정 (추가 시 spec 모달 의존성 일부 본문 inline 표시 가능).
- mock 모드 캡처는 backend 미배포 가정. 실 product-service 시드 적용 시 카탈로그 실 row (3113) 가 표시되며, 이때 추가 검증 캡처 필요 여부.

## 회고 가드 적용 검증

- `feedback_korean_commits.md` — commit 메시지 한국어 작성
- `feedback_uuid_no_user_visibility.md` — 모든 화면에서 UUID 미노출 (modelCode / estimateNumber / partnerCode / businessRegistrationNumber 만 노출)
- `feedback_role_naming_full.md` — 본 슬라이스에서 권한 표기는 미사용 (역할 guard 없음 — 모든 인증 사용자 접근 가능)
- `feedback_function_documentation.md` — (1) 모든 신규 컴포넌트 + store + API 모듈에 한국어 Javadoc, (2) springdoc-openapi 적용 대상은 backend (본 슬라이스는 frontend 라 무관), (3) 본 dev-report md 누적
- `feedback_print_design_iteration.md` — 인쇄 미리보기는 첫 번째 iteration. 사용자 피드백 후 3~5회 mock → Edge 캡처 → CSS-only 미세조정 반복 예정
- `feedback_pr_qa_screenshots.md` — 캡처 6장 PNG `docs/qa/migration-fe-desktop/` 인라인 첨부 준비

## 의존 endpoint 명세 (M1a + M3 + M4 + M5)

| Method | Path | 책임 service | 상태 |
|---|---|---|---|
| GET | `/api/v1/products?usageScope&category` | product-service | M1a 배포 완료 (ProductCatalogController) |
| GET | `/api/v1/products/{modelCode}/specs` | product-service | M1a 배포 완료 |
| GET | `/api/v1/spec-key-templates?category` | product-service | M1a 배포 완료 |
| GET | `/api/v1/material-prices` | product-service | M1a 배포 완료 (구현 미확인 — 본 슬라이스 미사용) |
| GET | `/api/v1/branch-pipes/lookup?capHp` | product-service | M1a 배포 완료 (구현 미확인 — 본 슬라이스 미사용) |
| GET | `/api/v1/odu-recommendations?type&indoorCap` | product-service | M1a 배포 완료 (구현 미확인 — 본 슬라이스 미사용) |
| GET | `/api/v1/estimates` | estimate-service | M3 미배포 — 빈 목록 안내 fallback |
| GET | `/api/v1/estimates/{number}` | estimate-service | M3 미배포 — 안내 fallback |
| GET | `/api/v1/partner-orders` | partner-order-service | M4 미배포 — 안내 fallback |
| GET | `/api/v1/partner-orders/{number}` | partner-order-service | M4 미배포 — 안내 fallback |
| GET | `/api/v1/partners/long-pending` | partner-service | M5 미배포 — 안내 fallback |

mock 모드 (`VITE_MOCK_MODE=1`) 활성 시 위 endpoint 가 mock seed 로 응답됨 — 본 슬라이스 캡처는 mock 모드 빌드.
