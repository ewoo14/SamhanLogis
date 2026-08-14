# Frontend 3 Client 기능 Inventory (W10-7 Stage 1)

> **목적** — Samhan Public 3 client (web/desktop/mobile) 의 모든 화면 / 컴포넌트 / 사용자 흐름 / API 의존을 한눈에 파악하여 운영 매뉴얼 작성의 기반으로 사용. **누락 UI 기능을 한눈에 확인** 가능.
>
> **branch** — `feature/integrated-phase-10-step-7-operator-manual`
> **작성일** — 2026-05-09
> **단계** — Stage 1 (Inventory). Stage 2 = 매뉴얼 본문 작성에서 본 inventory 의 ✅ 항목만 캡처.

---

## 2026-05-16 SP-05 현재 상태 우선 적용

이 문서는 2026-05-09 Stage 1 inventory 를 원본으로 보존하되, 이후 PR #203~#206 머지로 바뀐 Samhan Public 운영 화면은 본 블록을 우선한다.

- 거래처 기본 관리 UI는 `/admin/partners` 목록과 `/admin/partners/new` 생성 화면으로 운영 가능하다. 4탭 중 여신/단가·부가정보의 일부 고급 필드는 후속 보강 대상이지만, 더 이상 “거래처 UI 부재” 상태는 아니다.
- 판매관리와 구매관리는 목록에서 명시 상세 버튼으로 `/sales/:id`, `/purchases/:id`에 진입한다. 신규 작성은 각각 `/sales/new`, `/purchases/new`에서 처리하고, 상세 화면에서 수정/상태 전이를 이어간다.
- 구매관리는 `SAVED / CONFIRMED` 입고전표 행의 `검수` CTA로 `InboundInspectionDialog`에 진입한다. 라인별 불량/사진 첨부 등 고급 검수는 후속 P0/P1 보강 대상이다.
- `clients/mobile-staff`의 기사 모드는 D-AX-19 이후 은퇴했고, 기사 배차/GPS/서명은 `clients/arologis-mobile`이 전담한다.

---

## 0. 종합 통계

| 영역 | 수량 | 비고 |
|---|---|---|
| **Client** | 3 | design-system + desktop + mobile-staff (legacy `clients/web/order-app` + `estimate-app` + `mobile` 은 참고만) |
| **design-system 컴포넌트** | **35** | 전부 Storybook stories 보유 (35/35) |
| **desktop 화면 (route)** | **27** | login 1 + dashboard 1 + warehouse 1 + slip 8 + transfer 3 + accounting 6 + sales-v4 7 + signature mock 2 (모바일 시뮬) |
| **mobile-staff 화면** | **6** | EstimateWebView 1 (영업) + driver tab 4 (Dashboard / GPS / Signature / GpsBlocked) + AppRootNavigator 1 |
| **백엔드 endpoint 호출** | **약 60+** | desktop = auth/inventory/slip/sales/accounting/delivery/signature 7 도메인. mobile-staff = arologis 3 endpoint + 영업 WebView (cookie 인증) |
| **누락 후보 (이카운트 비교)** | **6+** | 거래처 고급 4탭 잔여 필드 / 판매·구매 line item 자동단가 / 견적·주문서 모바일 / 회계 보고서 보강 등 (§ 5 참고) |

---

## 1. design-system (clients/web/design-system)

> **위치** — `clients/web/design-system/src/components/` (35 컴포넌트 디렉토리)
> **스택** — Vite + React 18 + Storybook 8 + CSS Modules + Pretendard typography token
> **역할** — 공유 컴포넌트 라이브러리 (실 production UI 없음 — desktop / mobile-staff / order-app / estimate-app 이 import)
> **번들** — `dist/` (tsup) + `storybook-static/` (Storybook 빌드)

### 1.1 컴포넌트 매트릭스 (35개)

| # | 컴포넌트 | 위치 | Storybook | desktop 사용 | mobile-staff 사용 | 추가된 슬라이스 | 구현 상태 |
|---|---|---|---|---|---|---|---|
| 1 | **Button** | `Button/` | ✅ | ✅ (전 화면) | (theme-tokens 만) | base | ✅ |
| 2 | **Card** | `Card/` | ✅ | ✅ (Login/Dashboard) | — | base | ✅ |
| 3 | **Input** | `Input/` | ✅ | ✅ | — | base | ✅ |
| 4 | **Label** | `Label/` | ✅ | ✅ | — | base | ✅ |
| 5 | **FormField** | `FormField/` | ✅ | ✅ (Login/Slip 작성) | — | base | ✅ |
| 6 | **Modal** | `Modal/` | ✅ | ✅ | — | base | ✅ |
| 7 | **Spinner** | `Spinner/` | ✅ | ✅ | — | base | ✅ |
| 8 | **Badge** | `Badge/` | ✅ | ✅ (SlipList 출고/입고) | — | base | ✅ |
| 9 | **DataTable** | `DataTable/` | ✅ | ✅ (SlipList/TransferList/JournalList) | — | base | ✅ |
| 10 | **TagChip** | `TagChip/` | ✅ | ✅ | — | base | ✅ |
| 11 | **TagInput** | `TagInput/` | ✅ | ✅ | — | base | ✅ |
| 12 | **PriceField** | `PriceField/` | ✅ | ✅ (SlipForm) | — | base | ✅ |
| 13 | **WarehouseSelector** | `WarehouseSelector/` | ✅ | ✅ (Slip/Transfer) | — | base | ✅ |
| 14 | **DeliveryTagSelector** | `DeliveryTagSelector/` | ✅ | ✅ (SlipForm) | — | base | ✅ |
| 15 | **SlipNumberDisplay** | `SlipNumberDisplay/` | ✅ | ✅ (SlipList/Detail) | — | base | ✅ |
| 16 | **SlipStatusBadge** | `SlipStatusBadge/` | ✅ | ✅ (SlipList/Detail) | — | base | ✅ |
| 17 | **DragHandle** | `DragHandle/` | ✅ | ✅ (SlipForm 라인 정렬) | — | sales-form-polish | ✅ |
| 18 | **LineRow** | `LineRow/` | ✅ | ✅ (SlipForm) | — | sales-form-polish | ✅ |
| 19 | **StockBalanceModal** | `StockBalanceModal/` | ✅ | ✅ (SlipForm onBlur) | — | sales-form-polish | ✅ |
| 20 | **ProgressBar** | `ProgressBar/` | ✅ | ✅ (SlipDetail lifecycle) | — | sales-polish-2 | ✅ |
| 21 | **PhoneInput** | `PhoneInput/` | ✅ | ✅ (LinkDispatchList) | — | link-dispatch | ✅ |
| 22 | **CopyButton** | `CopyButton/` | ✅ | ✅ (LinkDispatchList) | — | link-dispatch | ✅ |
| 23 | **ChannelBadge** | `ChannelBadge/` | ✅ | ✅ (LinkDispatchList) | — | Phase 9 W4 fix | ✅ |
| 24 | **SignaturePad** | `SignaturePad/` | ✅ | ✅ (MobileSignaturePage) | (자체 RN 구현) | signature-slice-C | ✅ |
| 25 | **SignatureViewer** | `SignatureViewer/` | ✅ | ✅ (SlipDetail 관리자 조회) | — | signature-slice-C | ✅ |
| 26 | **AccountCodeSelect** | `AccountCodeSelect/` | ✅ | ✅ (JournalForm) | — | accounting-A | ✅ |
| 27 | **JournalStatusBadge** | `JournalStatusBadge/` | ✅ | ✅ (JournalList/Detail) | — | accounting-A | ✅ |
| 28 | **MoneyInput** | `MoneyInput/` | ✅ | ✅ (JournalForm) | — | accounting-A | ✅ |
| 29 | **JournalLineRow** | `JournalLineRow/` | ✅ | ✅ (JournalForm 라인) | — | accounting-A | ✅ |
| 30 | **EstimateLineRow** | `EstimateLineRow/` | ✅ | (legacy webview 만, 직접 사용 X) | — | migration-ds-extension | ⏳ (DS 만, 실 화면 미사용) |
| 31 | **BundleExpandToggle** | `BundleExpandToggle/` | ✅ | (legacy webview 만, 직접 사용 X) | — | migration-ds-extension | ⏳ |
| 32 | **ProductSpecList** | `ProductSpecList/` | ✅ | (legacy webview 만, 직접 사용 X) | — | migration-ds-extension | ⏳ |
| 33 | **CategoryTabs** | `CategoryTabs/` | ✅ | (legacy webview 만, 직접 사용 X) | — | migration-ds-extension | ⏳ |
| 34 | **SpecAddModal** | `SpecAddModal/` | ✅ | (legacy webview 만, 직접 사용 X) | — | migration-ds-extension | ⏳ |
| 35 | **PrintPreview** | `PrintPreview/` | ✅ | (legacy webview 만, 직접 사용 X) | — | migration-ds-extension | ⏳ |

> **소계** — DS 35개 / Storybook 35/35 (100%) / desktop 실 사용 = 29개 (✅) / 6개는 견적 React 변환 (v3) 폐기 후 legacy webview 임베드 채택으로 미사용 — DS 만 보유 (⏳ 정리 후보).

### 1.2 토큰 (design tokens)

| 토큰 | 위치 | 사용처 | 상태 |
|---|---|---|---|
| `tokens` (color/spacing/radii/typography) | `clients/web/design-system/src/tokens/` | desktop CSS Modules + mobile-staff `theme/tokens.ts` 1:1 복제 | ✅ |
| `styles` (global / reset / pretendard) | `clients/web/design-system/src/styles/` | Storybook + desktop main bundle | ✅ |

---

## 2. desktop (clients/desktop)

> **위치** — `clients/desktop/`
> **스택** — Electron 33 + electron-vite + React 18 + react-router-dom (`HashRouter`) + zustand + @tanstack/react-query 5 + axios + design-system
> **역할** — 사무실 데스크탑 메인 client (영업 / 창고 / 회계 / 마스터 전 role)
> **인증** — 메인 프로세스 (Electron secure storage) JWT 보관 + IPC `window.samhanAuth` 노출 → renderer axios 인터셉터에서 `Authorization: Bearer ...` 주입. 401 시 자동 `#/login` 리다이렉트.

### 2.1 라우트 매트릭스 (27개)

> **출처** — `clients/desktop/src/renderer/routes/index.tsx` (전 라우트 정의 단일 파일).
> **권한 체크** — `RoleGuard` 컴포넌트 (route-level) + `stores/session.ts` 의 `canCreateSlip` / `canTransitionSlip` / `canTransitionTransfer` / `canCreateJournal` / `canAccessAccounting` (button/action-level).
>
> **권한 풀네임** (feedback_role_naming_full.md) — `MASTER` / `MANAGER` / `SALES` / `WAREHOUSE` / `INVENTORY` / `ACCOUNTANT` / `DEVELOPER`.

#### 2.1.1 인증 / 메인

| # | Route | 컴포넌트 | 권한 | 백엔드 API | 구현 상태 |
|---|---|---|---|---|---|
| 1 | `/login` | `LoginPage.tsx` | 모두 (보호 X) | `POST /auth/login` | ✅ |
| 2 | `/` | `DashboardPage.tsx` | 인증 모두 | `GET /slips?slipType=OUTBOUND&status=PROCESSING&size=1` (1개 카드만 실 호출, 나머지 3개 = "준비중" placeholder) | ⏳ (4개 카드 중 1개만 활성) |
| 3 | `/warehouses` | `WarehousesPage.tsx` | 인증 모두 (등록 = MASTER/MANAGER/DEVELOPER) | `GET /inventory/warehouses` + `POST /inventory/warehouses` | ✅ |

#### 2.1.2 판매 (출고전표) — 영업/창고 흐름

| # | Route | 컴포넌트 | 권한 | 백엔드 API | 구현 상태 |
|---|---|---|---|---|---|
| 4 | `/sales` | `SalesQueryPage.tsx` (판매관리) | 인증 모두 | `GET /slips/query?type=OUTBOUND&status=&page=` | ✅ |
| 5 | `/sales/new` | `SlipFormPage.tsx` (mode=OUTBOUND) | SALES / MANAGER / MASTER | `GET /inventory/warehouses` + `GET /slips/lookup-product` + `POST /slips` | ✅ |
| 6 | `/sales/link-dispatch` | `LinkDispatchListPage.tsx` | MANAGER/MASTER | `GET/POST /delivery-batches` 7 endpoint | ✅ |
| 7 | `/sales/:id` | `SlipDetailPage.tsx` (mode=OUTBOUND) | 인증 모두 (transition = role 별) | `GET /slips/{id}` + `POST /slips/{id}/{action}` (save/send/accept/process/inspect/complete/ship/deliver/confirm/reject/cancel) | ✅ |
| 8 | `/sales/:id/print/invoice` | `print/InvoiceView.tsx` | 인증 모두 | `GET /slips/{id}` (캐시 재사용) | ✅ |
| 9 | `/sales/:id/print/dispatch` | `print/DispatchView.tsx` | 인증 모두 | `GET /slips/{id}` | ✅ |

#### 2.1.3 판매 v4 — Phase 6 sub-route (legacy webview 견적 + Samhan Public 신규 4종)

| # | Route | 컴포넌트 | 권한 | 백엔드 API | 구현 상태 |
|---|---|---|---|---|---|
| 10 | `/sales/estimates` | `SalesEstimateListPage.tsx` | 인증 모두 | `GET /api/v1/estimates` (M5) | ✅ |
| 11 | `/sales/estimates/legacy` | `EstimateLegacyWebviewPage.tsx` (Electron `<webview>` + preload shim) | 인증 모두 | legacy `migration/source/scripts/estimate/index.html` (18614 라인) + `legacyShim.mjs` 가 `google.script.run` → Samhan Public MS axios fetch 매핑 | ✅ (legacy 100% 보존) |
| 12 | `/sales/estimates/new` | `EstimateLegacyWebviewPage.tsx` (동일) | 인증 모두 | (legacy 그대로) | ✅ |
| 13 | `/sales/partner-orders` | `SalesPartnerOrderListPage.tsx` | 인증 모두 | `GET /api/v1/partner-orders?status=` | ✅ |
| 14 | `/sales/partner-orders/:id` | `SalesPartnerOrderDetailPage.tsx` | 인증 모두 | `GET /api/v1/partner-orders/{orderNumber}` | ✅ |
| 15 | `/sales/order-approvals` | `SalesOrderApprovalsPage.tsx` | MANAGER/MASTER | `GET /api/v1/partner-approvals?status=` + `POST /api/v1/partner-approvals/{partnerCode}/status` + `POST /api/v1/partner-approvals/{partnerCode}/reset-password` | ✅ |
| 16 | `/sales/partner-dc-config` | `SalesPartnerDcConfigPage.tsx` | MANAGER/MASTER | `GET /api/v1/partner-dc-configs` + `POST /api/v1/partner-dc-configs/{partnerCode}` | ✅ |

#### 2.1.4 구매 (입고전표) — 회계 흐름

| # | Route | 컴포넌트 | 권한 | 백엔드 API | 구현 상태 |
|---|---|---|---|---|---|
| 17 | `/purchases` | `PurchaseQueryPage.tsx` (구매관리) | 인증 모두 | `GET /slips/query?type=INBOUND` | ✅ |
| 18 | `/purchases/new` | `SlipFormPage.tsx` (mode=INBOUND) | SALES/MANAGER/MASTER | `POST /slips` (slipType=INBOUND) | ✅ |
| 19 | `/purchases/:id` | `SlipDetailPage.tsx` (mode=INBOUND) | 인증 모두 | `GET /slips/{id}` + transition (confirm = ACCOUNTANT/MANAGER/MASTER) | ✅ |

#### 2.1.5 재고이동 (StockTransfer) — 창고 흐름

| # | Route | 컴포넌트 | 권한 | 백엔드 API | 구현 상태 |
|---|---|---|---|---|---|
| 20 | `/transfers` | `TransferListPage.tsx` | 인증 모두 | `GET /inventory/transfers?status=&page=` | ✅ |
| 21 | `/transfers/new` | `TransferFormPage.tsx` | MASTER/MANAGER/WAREHOUSE/INVENTORY | `POST /inventory/transfers` | ✅ |
| 22 | `/transfers/:id` | `TransferDetailPage.tsx` | 인증 모두 (transition = role 별) | `GET /inventory/transfers/{id}` + `POST /inventory/transfers/{id}/{approve\|reject\|ship\|receive\|confirm\|cancel}` | ✅ |

#### 2.1.6 회계 (accounting-slice-A) — ACCOUNTANT/MANAGER/MASTER

| # | Route | 컴포넌트 | 권한 | 백엔드 API | 구현 상태 |
|---|---|---|---|---|---|
| 23 | `/accounting/accounts` | `AccountTreePage.tsx` | ACCOUNTANT/MANAGER/MASTER (RoleGuard) | `GET /accounting/accounts` | ✅ |
| 24 | `/accounting/journals` | `JournalListPage.tsx` | ACCOUNTANT/MANAGER/MASTER | `GET /accounting/journals?period=&status=&page=` | ✅ |
| 25 | `/accounting/journals/new` + `/:id/edit` | `JournalFormPage.tsx` | ACCOUNTANT/MANAGER/MASTER | `POST /accounting/journals` (DRAFT) | ✅ |
| 26 | `/accounting/journals/:id` | `JournalDetailPage.tsx` | ACCOUNTANT/MANAGER/MASTER | `GET /accounting/journals/{id}` + `POST /{id}/post` + `POST /{id}/reverse` | ✅ |
| 27 | `/accounting/balances` | `TrialBalancePage.tsx` | ACCOUNTANT/MANAGER/MASTER | `GET /accounting/balances?period=YYYYMM` | ✅ |

#### 2.1.7 모바일 mock (signature-slice-C, AuthGuard 외부)

> Phase 5 nginx 분리 전 desktop 안에서 모바일 화면 시뮬레이션. production 에서는 별도 nginx + samhan-air.com sub-domain 으로 분리.

| # | Route | 컴포넌트 | 권한 | 백엔드 API | 구현 상태 |
|---|---|---|---|---|---|
| (mock) | `/mobile/d/:token/s/:slipNo` | `MobileSignaturePage.tsx` | NO AUTH (1회용 token) | `GET /api/public/sign/...` + `POST /api/public/sign/.../signature` (서명 + 정보 동의) | ✅ (mock) |
| (mock) | `/mobile/share/:shareToken` | `MobileRecipientPage.tsx` | NO AUTH | `GET /api/public/share/{token}` | ✅ (mock) |

### 2.2 사용자 흐름 (desktop) — 4개 핵심 시나리오

#### 2.2.1 영업 출고전표 흐름 (SALES role)

1. `/login` → loginId/password 입력 → `POST /auth/login` → 토큰 메인 프로세스 저장
2. `/` 대시보드 → "처리중 출고전표" 카드 (실시간 카운트)
3. 사이드바 **판매관리** (`/sales`) → 출고전표 목록 (DataTable + 상태 badge)
4. **신규 작성** 버튼 → `/sales/new` → 거래처 / 창고 / 라인 (LineRow + StockBalanceModal onBlur 재고 검증) 입력 → `POST /slips`
5. `/sales/:id` 상세 → `save` → `send` 액션 → 창고로 이송
6. **링크발송** (`/sales/link-dispatch`) → `POST /delivery-batches/auto-group?date=` → 같은 기사 자동 묶음 → SMS 일괄 발송 (e-sign URL 포함)
7. 인쇄 → `/sales/:id/print/invoice` (거래명세서) 또는 `/print/dispatch` (작업지시서) → Electron 인쇄 dialog

#### 2.2.2 창고 흐름 (WAREHOUSE/INVENTORY role)

1. `/login` → `/sales` (출고 처리 대기 목록)
2. SlipDetail → `accept` (수락) → `process` (처리) → `inspect` (검수) → `complete` (완료) → `ship` (출하) → `deliver` (배송)
3. 사이드바 **재고이동 관리** (`/transfers`) → 창고 간 자체 이동전표 작성 → 라이프사이클 (`approve`/`reject`/`ship`/`receive`/`confirm`)

#### 2.2.3 회계 흐름 (ACCOUNTANT/MANAGER/MASTER role)

1. `/login` → `/` 대시보드
2. 사이드바 **회계** 그룹 활성 (RoleGuard) → **계정과목** (`/accounting/accounts`) → 표준 계정과목 트리 (한국 일반기업회계기준 100~900 코드)
3. **분개장** (`/accounting/journals`) → 월별 + 상태 필터 → 신규 분개 (`/journals/new`) → 차변/대변 라인 입력 (JournalLineRow + AccountCodeSelect + MoneyInput) → `POST /accounting/journals` (DRAFT)
4. 분개 상세 → `post` (확정) → 시산표 반영 / `reverse` (역분개)
5. **시산표** (`/accounting/balances?period=YYYYMM`) → 월별 시산표 조회

#### 2.2.4 모바일 서명 흐름 (외부 거래처)

1. SMS 수신 → e-sign URL (`https://sign.samhan-air.com/d/{token}/s/{slipNo}`) 클릭
2. `MobileSignaturePage` → 정보 동의 + SignaturePad 캔버스 서명
3. `POST /api/public/sign/.../signature` → 410 (만료) / 404 (토큰 무효) 시 GONE 페이지

### 2.3 desktop API 클라이언트 7 도메인

| 도메인 | 파일 | endpoint 수 | BE 서비스 |
|---|---|---|---|
| auth | `api/auth.ts` | 1 (login) | user-service |
| inventory | `api/inventory.ts` | 6 (warehouse + transfer 5) | inventory-service |
| slip | `api/slip.ts` | 5 (list/get/create/lookup/transition) | slip-service |
| signature | `api/signature.ts` | 4+ (admin 조회/무효화 + public sign) | slip-service + nginx public |
| sales | `api/sales.ts` | 14+ (products / specs / templates / material-prices / odu / branch-pipes / estimates / partner-orders / approvals / dc-configs / partners) | sales-service + partner-service |
| accounting | `api/accounting.ts` | 7 (accounts / journals 5 + balances) | accounting-service |
| delivery | `api/delivery.ts` | 7 (batch CRUD + sms + regenerate-token) | notification-service / batch-service |
| slipNumber | `api/slipNumber.ts` | (helper) | slip-service |
| mock | `api/mock.ts` | (dev-only `VITE_MOCK_MODE=1` fixture) | — |

### 2.4 design-system 사용 (desktop)

> **import path** — `@samhan/design-system` (workspace 패키지)
> **사용 컴포넌트** — 35개 중 29개 활성 (1.1 표 참고)
> **주요 미사용** (legacy webview 임베드 채택 후) — EstimateLineRow / BundleExpandToggle / ProductSpecList / CategoryTabs / SpecAddModal / PrintPreview (6개, 정리 후보)

---

## 3. mobile-staff (clients/mobile-staff)

> **위치** — `clients/mobile-staff/`
> **스택** — Expo SDK 51 + React Native + react-native-webview + react-native-safe-area-context (※ react-navigation 미설치 — 자체 minimal tab 구현)
> **역할** — (1) 영업직원 모바일 견적 WebView (legacy estimate 임베드) + (2) 배송기사 native UI (driver tab)
> **결정 (2026-05-07)** — 별도 mobile-driver 신규 X. mobile-staff 내부 driver tab 채택 → 단일 어플 + role 분기.

### 3.1 화면 매트릭스 (6개)

| # | Screen | 위치 | 권한 | 백엔드 API | 구현 상태 |
|---|---|---|---|---|---|
| 1 | **AppRootNavigator** | `screens/AppRootNavigator.tsx` | 모두 | (mode 분기 navigation) | ✅ (mode 토글 buttons "영업견적" / "배송기사" — production 은 ROLE_DRIVER 자동 감지 예정) |
| 2 | **EstimateWebViewScreen** (영업) | `screens/EstimateWebViewScreen.tsx` | 영업직원 (estimate-app v2 cookie 인증) | estimate-app v2 (Node + Express + EJS) WebView 임베드 + `X-Samhan-Staff` header shim | ✅ (legacy 100% 보존, max-width:1280px 분기 자동) |
| 3 | **DriverTabNavigator** | `screens/driver/DriverTabNavigator.tsx` | DRIVER | (자체 tab state) + GPS 권한 가드 | ✅ |
| 4 | **DriverDashboardScreen** | `screens/driver/DriverDashboardScreen.tsx` | DRIVER | `GET /driver-app/arologis/dispatches/today` (오늘 배정 vehicle 목록 + tonnage + status) | ✅ (W10-3, stops 는 W10-1 단순화로 미포함) |
| 5 | **DriverLocationTrackingScreen** | `screens/driver/DriverLocationTrackingScreen.tsx` | DRIVER + GPS foreground 권한 | `POST /driver-app/arologis/locations` (30초 주기, source = APP_GPS_ACTIVE / APP_GPS_BACKGROUND) | ✅ (W10-3) |
| 6 | **DriverSignatureScreen** | `screens/driver/DriverSignatureScreen.tsx` | DRIVER | `POST /driver-app/arologis/dispatches/{dispatchId}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign` (base64 PNG + GPS 좌표) | ✅ (W10-4 PR #99 — slipBridged 응답 포함) |
| (g) | **GpsBlockedScreen** | `screens/driver/GpsBlockedScreen.tsx` | DRIVER (GPS 거부 시) | — | ✅ |

### 3.2 사용자 흐름 (mobile-staff)

#### 3.2.1 영업직원 견적 흐름 (WebView 100%)

1. 앱 실행 → `AppRootNavigator` (default mode = `estimate`) → `EstimateWebViewScreen`
2. WebView 안 estimate-app v2 의 `body.mobile-mode` 자동 활성 (max-width:1280px 분기)
3. legacy `checkUserAuth(USER_EMAIL)` (Apps Script Code.js line 8726 1:1) 인증
4. 4 카드 grid (홈멀티 / 싱글세트 / 상업멀티 / 구형) → 1열 stack 자동 변환
5. 견적 작성 → 저장 → 인쇄 (legacy CSS/HTML/JS 100% 보존)
6. Android hardware 뒤로가기 → WebView `goBack()` 우선

#### 3.2.2 배송기사 흐름 (driver tab)

1. 앱 실행 → 우상단 "배송기사" 토글 (production = JWT ROLE_DRIVER 자동) → `DriverTabNavigator`
2. **GPS 권한 확인** (`useGpsPermission`) → 거부 시 `GpsBlockedScreen` (진입 차단)
3. **배차 tab** → `DriverDashboardScreen` → 오늘 배정 vehicle 목록 (sequence + tonnage badge + status)
4. **GPS tab** → `DriverLocationTrackingScreen` → 30초 주기 위치 보고
5. **서명 tab** → `DriverSignatureScreen` → SignaturePad 캔버스 서명 → base64 PNG + GPS 좌표 전송 → `slipBridged` 응답으로 slip-service 동기화 확인

### 3.3 mobile-staff API / WebView 의존

| 종류 | 파일 | 대상 | 인증 |
|---|---|---|---|
| API | `api/arologis.ts` | arologis-service 3 endpoint (today / locations / sign) — gateway 8080 → arologis 8097 | JWT Bearer (user-service `/auth/me` → ROLE_DRIVER) |
| WebView shim | `webview/legacyEstimateShim.ts` | estimate-app v2 (Node+Express+EJS) WebView 임베드 | cookie + `X-Samhan-Staff` header |
| WebView source | `webview/legacyEstimateSource.ts` | `EXPO_PUBLIC_ESTIMATE_URL` (default = production estimate-app URL) | — |
| Hook | `hooks/useGpsPermission.ts` | expo-location foreground/background 권한 분리 | — |
| Theme | `theme/tokens.ts` | DS tokens 1:1 복제 (color / spacing / radii / typography) | — |

### 3.4 design-system 사용 (mobile-staff)

> RN 환경이라 DS 컴포넌트 직접 import X (CSS Modules 비호환). 대신 **token 만 1:1 복제** (`theme/tokens.ts`) — 색/spacing/typography 일관성 유지.
>
> SignaturePad 는 DS 의 SignaturePad (HTML canvas) 와 별개로 RN native 자체 구현 (react-native-svg 등).

---

## 4. (참고) legacy clients — 본 inventory 범위 외

| Client | 위치 | 상태 | 비고 |
|---|---|---|---|
| `clients/web/order-app` v4 | `clients/web/order-app/` | 보존 (production hosting) | DECISIONS Phase 6 — sub-domain `order.samhan-air.com` 로 분리 hosting. desktop 의 `/sales/partner-orders` 와 별개 외부 client (거래처 전용) |
| `clients/web/estimate-app` v2 | `clients/web/estimate-app/` | 보존 (production hosting) | desktop 의 `/sales/estimates/legacy` webview 가 본 client URL 임베드. mobile-staff 의 EstimateWebView 도 동일 임베드 |
| `clients/mobile` v4 | `clients/mobile/` | legacy (deprecated) | mobile-staff v2 (단일 EstimateWebView) 로 대체. v1 의 StaffLogin / Home / Profile native screen + BottomTab 폐기 (`commit ad313ed`) |

---

## 5. 누락 후보 (이카운트 ERP 비교)

> **출처** — `docs/migration/ecount-reference/*.png` (16장 캡처, 2026-05-09 09:15~09:21 촬영).
> **방법** — 이카운트 표준 ERP 화면 16장 vs Samhan Public desktop 27 라우트 + mobile-staff 6 화면 매핑.

### 5.1 명백한 누락 (개발책임자 확인 필요)

| # | 이카운트 화면 | desktop 대응 라우트 | 상태 | 우선순위 |
|---|---|---|---|---|
| 1 | **거래처 등록 4 탭** (기본정보 / 거래처정보 / 여신단가 / 부가정보) | `/admin/partners`, `/admin/partners/new` | ⏳ 기본 생성 UI 운영 / 고급 4탭 필드 잔여 | **HIGH** (영업 흐름 필수) |
| 2 | **판매입력 화면** (line item table + 단가 자동 + 부가세) | `/sales/new` (SlipFormPage, LineRow 기반) | ⏳ 부분 (이카운트 만큼 단가 자동 연동 약함) | MED |
| 3 | **구매입력 화면** | `/purchases/new` (SlipFormPage mode=INBOUND) | ⏳ 부분 (판매입력과 동일 화면 재사용 — 구매 전용 필드 부족) | MED |
| 4 | **품목 등록 화면** (model / spec / category / 가격 정책) | (없음 — sales-service backend 만 존재) | ❌ 미구현 | HIGH |
| 5 | **시산표 보강** (분기/년 누적 + 전기/당기 비교) | `/accounting/balances` (월별만) | ⏳ 부분 (월별 단일) | LOW |
| 6 | **재무제표** (재무상태표 / 손익계산서 / 현금흐름표) | (없음 — accounting-service backend 미구현) | ❌ 미구현 | LOW (우선 시산표 후) |
| 7 | **세금계산서 발행** | (없음) | ❌ 미구현 | MED |
| 8 | **사용자 / 권한 관리 화면** | (없음 — user-service backend 만 존재) | ❌ 미구현 (DB seed 로 운영) | MED |

### 5.2 모바일 누락 후보

| # | 이카운트 mobile 기능 | mobile-staff 대응 | 상태 |
|---|---|---|---|
| M1 | **영업직원 모바일 견적** | EstimateWebView (WebView v2 임베드) | ✅ |
| M2 | **영업직원 모바일 주문서 작성** | (없음) — desktop `/sales/partner-orders` 만 | ❌ |
| M3 | **기사 모바일 배차 + GPS + 서명** | DriverDashboard / GPS / Signature 3 화면 | ✅ |
| M4 | **창고원 모바일 (입출고 검수)** | (없음) | ❌ (Phase 11 후 검토) |
| M5 | **회계원 모바일** | (없음 — desktop only) | ❌ (불필요 합의) |

### 5.3 design-system 정리 후보

> 견적 React 변환 (v3) 폐기 후 legacy webview 임베드 채택. 본 6 컴포넌트는 DS 만 보유, 실 화면 미사용:
>
> - `EstimateLineRow` / `BundleExpandToggle` / `ProductSpecList` / `CategoryTabs` / `SpecAddModal` / `PrintPreview`
>
> **결정 필요** — (a) 보존 (향후 React 재구현 대비) / (b) 정리 (deprecation marker) / (c) Storybook documentation only.

---

## 6. 정리 — 매뉴얼 작성 우선순위

### 6.1 캡처 우선 (✅ 항목, Stage 2 매뉴얼 본문)

1. **로그인 → 대시보드** (desktop)
2. **출고전표 풀 lifecycle** (작성 → send → accept → process → inspect → complete → ship → deliver → confirm) — 9 transition
3. **이동전표 풀 lifecycle** (request → approve → ship → receive → confirm) — 5 transition
4. **분개 풀 lifecycle** (DRAFT → POSTED → REVERSED) — 3 상태
5. **링크발송** (배송 묶음 + SMS + e-sign 모바일 서명)
6. **모바일 driver tab** (배차 / GPS / 서명)
7. **모바일 영업 견적 WebView**
8. **legacy webview 견적** (`/sales/estimates/legacy`)

### 6.2 보강 후 캡처 (⏳ 항목)

- 대시보드 4 카드 중 3개 placeholder ("준비중") → 실 카운트 활성 (저재고 / 미확인 메시지 / 추가 카드)
- 입고전표 전용 필드 (출고와 동일 form 재사용 → 입고 전용 분리 검토)

### 6.3 신규 화면 개발 결정 필요 (❌ 항목)

- 거래처 등록 4 탭 (HIGH)
- 품목 등록 화면 (HIGH)
- 사용자 / 권한 관리 화면 (MED)
- 세금계산서 발행 (MED)

---

## 부록 A — 파일 위치 빠른 참조

| 항목 | 절대 경로 |
|---|---|
| desktop 라우트 정의 | `C:\dev\SamhanLogis\clients\desktop\src\renderer\routes\index.tsx` |
| desktop AppLayout (사이드바) | `C:\dev\SamhanLogis\clients\desktop\src\renderer\components\AppLayout.tsx` |
| desktop session store (권한) | `C:\dev\SamhanLogis\clients\desktop\src\renderer\stores\session.ts` |
| desktop API client | `C:\dev\SamhanLogis\clients\desktop\src\renderer\api\client.ts` |
| desktop accounting role 함수 | `C:\dev\SamhanLogis\clients\desktop\src\renderer\api\accounting.ts` (canAccessAccounting / canCreateJournal) |
| design-system 컴포넌트 진입점 | `C:\dev\SamhanLogis\clients\web\design-system\src\index.ts` |
| design-system 컴포넌트 디렉토리 | `C:\dev\SamhanLogis\clients\web\design-system\src\components\` (35개) |
| mobile-staff App 진입 | `C:\dev\SamhanLogis\clients\mobile-staff\App.tsx` |
| mobile-staff RootNavigator | `C:\dev\SamhanLogis\clients\mobile-staff\src\screens\AppRootNavigator.tsx` |
| mobile-staff DriverTab | `C:\dev\SamhanLogis\clients\mobile-staff\src\screens\driver\DriverTabNavigator.tsx` |
| mobile-staff API (arologis) | `C:\dev\SamhanLogis\clients\mobile-staff\src\api\arologis.ts` |
| mobile-staff WebView shim | `C:\dev\SamhanLogis\clients\mobile-staff\src\webview\legacyEstimateShim.ts` |
| 이카운트 reference 캡처 | `C:\dev\SamhanLogis\docs\migration\ecount-reference\*.png` (16장) |

---

**Stage 1 완료** — 본 inventory 는 Stage 2 (매뉴얼 본문) 캡처 대상 ✅ 화면 결정의 기반. 누락 ❌ 항목 (5.1) 은 개발책임자 결정 후 별도 슬라이스로 진행.
