# dev-report — frontend-order-app (clients/web/order-app)

> 슬라이스: legacy migration Phase 6 frontend Sub-team C
> branch: `feature/migration-fe-order-app`
> 입력: `migration/analysis/06-frontend-design.md` §2.2 / §1.2 / §7.1
> 가드: feedback_function_documentation.md 의 3-layer (한국어 JSDoc + springdoc 해당 없음 + 본 dev-report)

## 1. 산출물

### 1.1 디렉토리
- `clients/web/order-app/` (신규) — Vite + React 18 + TS + react-router + react-query + zustand
- `docs/qa/migration-fe-order-app/` (신규) — QA 캡처 5장 (PR body 인라인 첨부)
- `docs/dev-reports/frontend-order-app.md` (본 파일)

### 1.2 Route 12 (10 spec + 2 보강)

| Route | 컴포넌트 | 주요 기능 | legacy 매핑 |
|---|---|---|---|
| `/auth/login` | `BizGatePage.tsx` | 사업자번호 입력 + 10 status enum 분기 + PW 인라인 | `#pageBizGate` 566 |
| `/auth/register` | `RegisterPage.tsx` | 승인 요청 form | `requestAuthApproval` |
| `/auth/temp-password` | `TempPasswordPage.tsx` | 신규 4자리 PW 설정 | `setAuthPassword` |
| `/orders` | `OrderListPage.tsx` | 발송내역 (기간 + 검색) | `#pageHistory` 890 |
| `/orders/new` | `OrderFormPage.tsx` | 메인 SPA — 4 카테고리 카드 grid + body class 토글 | `.wrap` 658 + 4 cards 706-887 |
| `/orders/preview` | `OrderPreviewPage.tsx` | 미리보기 — 라인 + Bundle 모드 | `#dlgFinal` 1092 |
| `/orders/info` | `OrderInfoPage.tsx` | 주문 정보 입력 + 발송 | `#pageOrderInfo` 1010 |
| `/orders/snapshots` | `OrderSnapshotPage.tsx` | 임시저장 내역 (M4 placeholder) | `snapshot table` 1174 |
| `/orders/:orderNo` | `OrderDetailPage.tsx` | 단일 주문 조회 | (신규) |
| `/branch` | `BranchCalculationPage.tsx` | 분기계산 (placeholder, 후속 PR DnD) | `#pageBranch` 923 |
| `/profile` | `ProfilePage.tsx` | 거래처 자기 정보 | (신규) |
| `/settings` | `SettingsPage.tsx` | PWA 캐시 비우기 / 로그아웃 | (신규) |

### 1.3 컴포넌트 분리

```
src/
├── App.tsx                          (QueryClient + Routes + PwaInstallPrompt)
├── main.tsx                         (createRoot + BrowserRouter + tokens.css import)
├── api/
│   ├── client.ts                    (axios + sessionStorage 토큰 + 401 redirect)
│   ├── auth.ts                      (checkAuthStatus / tryLogin / setAuthPassword / requestAuthApproval — mock fallback)
│   ├── catalog.ts                   (listProducts / listProductSpecs — M1a + mock fallback)
│   └── orders.ts                    (listPartnerOrders / createOrderDraft / confirmOrder — M4 stub)
├── stores/
│   ├── session.ts                   (zustand AuthSession + bootstrap + sessionStorage)
│   └── order.ts                     (zustand 4 카테고리 라인 + Bundle EXPAND/KEEP + info)
├── components/
│   ├── auth/AuthGuard.tsx
│   ├── layout/PwaInstallPrompt.tsx  (5초 후 표시 / 7일 dismiss)
│   └── order/
│       ├── CategoryCard.tsx         (단일 카테고리 카드 — filter + line table + Bundle toggle)
│       └── BundleToggle.tsx         (Bundle EXPAND/KEEP 토글)
├── routes/                           (12 page 컴포넌트)
├── styles/global.css                 (legacy `<style>` block 1:1 변환 + 모바일 반응형)
└── types/index.ts                    (AuthSession / ProductCatalog / OrderLine / ...)
```

## 2. 핵심 결정 준수

### 2.1 F1 (a) legacy 100% 보존
- DS 컴포넌트 (`Button` / `Card` / `DataTable` / 등) import 0 — `grep "@samhan/design-system'" src/` 결과 0 확인
- `tokens.css` 만 import (`src/styles/global.css`)
- legacy `<style>` block (line 1~562) → `src/styles/global.css` 1:1 변환 (1280/768/480 breakpoint 보존)
- legacy class 명 (`.wrap` / `.top` / `.grid` / `.card` / `.card-head` / `.opts` / `.filter-bar` / `.est-table` / `.bundle-toggle` / `.page-gate` / `.biz-box` / 등) 그대로 유지
- legacy ID 명 (`#pageBizGate` / `#stepBizInput` / `#stepAuthAction` / `#cardHome` / `#cardSingle` / `#cardComm` / `#cardOld` / `#mobileGate` / `#btnPreview` / `#btnHistory` / `#btnSaveSnapshot` / 등) 도 유지 (legacy 검색 추적성)
- body class toggle (`home-active` / `single-active` / `comm-active` / `old-active` / `no-active`) — `OrderFormPage` `useEffect` 로 동적 적용

### 2.2 F2 PWA
- `vite-plugin-pwa` autoUpdate registerType
- manifest: name=`삼한공조시스템 주문서`, theme_color=`#020617`, display=`standalone`, lang=`ko`
- workbox runtimeCaching: `/api/v1/(products|partner-orders/catalog)` → StaleWhileRevalidate (24h, 200 entries)
- install prompt: 5초 지연 표시, dismiss 시 localStorage `samhan.pwa.dismissedAt` 기록 → 7일 후 재시도
- 아이콘: `public/icons/icon-{192,512}.png` placeholder (DESIGN team 후속 PNG export — README.md 안내)

### 2.3 인증 게이트 (M2 통합 대기)
- `src/api/auth.ts` — `checkAuthStatus / tryLogin / setAuthPassword / requestAuthApproval`
- BE 미존재 시 axios 404/네트워크 오류 catch → 사업자번호 패턴별 mock 응답 (BizGate UI 시연용)
- M2 partner-service `POST /api/v1/partner-auth/{check,login,set-pw,request}` 통합 후 자동 전환 (mock fallback 만 비활성)
- 10 status enum 분기 1:1 모방 — ICON_MAP / TITLE_MAP

## 3. backend 의존

### 3.1 M1a product-service (실 fetch — 활성)
- `GET /api/v1/products?usageScope=PARTNER_ORDER&category=HOME_MULTI` — `CategoryCard` 가 4 카테고리 별 호출
- `GET /api/v1/products/{modelCode}/specs` — `listProductSpecs` (스펙 모달 — 후속 PR)

### 3.2 M2 partner-service auth (mock fallback — 통합 대기)
- `POST /api/v1/partner-auth/check` — bizno → status 10
- `POST /api/v1/partner-auth/login` — bizno + pw → AuthSession (token + accessLimit)
- `POST /api/v1/partner-auth/set-pw`
- `POST /api/v1/partner-auth/request`

### 3.3 M4 partner-order-service (mock sessionStorage — 통합 대기)
- `GET /api/v1/partner-orders?bizno&startDate&endDate` — 발송내역
- `POST /api/v1/partner-orders` — DRAFT 생성
- `POST /api/v1/partner-orders/{id}/confirm` — DRAFT → CONFIRMED + Event

## 4. 검증

### 4.1 typecheck / lint / build
| 명령 | 기대 |
|---|---|
| `npm run typecheck` | tsc --noEmit PASS |
| `npm run lint` | eslint src — warning 만 (no error) |
| `npm run build` | vite build — `dist/` 산출 + manifest.webmanifest + sw.js 생성 |

### 4.2 수동 QA 체크리스트
1. `/auth/login` 진입 — 어두운 #020617 배경 + 사업자번호 input
2. `123-45-67890` 입력 → "조회" → PW 단계 (NEED_PW_INPUT)
3. PW `0000` → `/orders/new` 메인 SPA (mobile-gate 표시 — 4 큰 버튼)
4. "홈멀티" 클릭 → home-active body class → cardHome 만 표시 (다른 카드 숨김)
5. 라인 수량 입력 → selectedCount badge + 합계 갱신
6. "견적/주문하기" → `/orders/preview` 미리보기
7. "주문하기" → `/orders/info` form → "주문 발송" → 상세 페이지로 이동
8. 모바일 viewport (390px) — top bar wrap + grid 1column 확인
9. PWA install prompt — 5초 후 표시 (Edge/Chrome `beforeinstallprompt` 발생 시)

### 4.3 캡처 5장 (`docs/qa/migration-fe-order-app/`)
- 01-order-app-bizgate-login.png
- 02-order-app-main.png
- 03-order-app-form.png
- 04-order-app-mobile-responsive.png
- 05-order-app-pwa-install-prompt.png

## 5. 알려진 한계 / 후속 PR

| 항목 | 사유 | 후속 |
|---|---|---|
| 분기계산 DnD UI | 분량 안내 — 핵심 5 route 우선 | 후속 PR (`BranchPipeMatrix` + M1a `/api/v1/branch-pipes/lookup`) |
| 주문저장 (snapshot) 실 데이터 | M4 미존재 | M4 통합 후 `/api/v1/partner-orders/drafts` 연동 |
| Daum Postcode 임베드 | legacy `#addrDock` 별도 SDK | 후속 PR — kakao postcode SDK script 추가 |
| 튜토리얼 (`#tutBox`) | legacy `runTutStep` + `saveTutorialState` | 후속 PR — react-joyride 또는 자체 구현 |
| ProductSpec 모달 (`#dlgSpec`) | M1b spec API placeholder | 후속 PR — DS `<SpecAddModal>` 재사용 |
| Daum Postcode embed iframe | legacy `#addrDock` line 1183 | 후속 PR |
| PWA 아이콘 PNG export | DESIGN team 후속 | DESIGN team 작업 (samhan logo PNG 192/512) |

## 6. 회고 가드 검증

- [x] `feedback_function_documentation.md` — 모든 export/page 컴포넌트 한국어 JSDoc + dev-report
- [x] `feedback_uuid_no_user_visibility.md` — UUID 직접 노출 0 (사업자번호 / 거래처명 / 주문번호 / modelCode 만)
- [x] `feedback_korean_commits.md` — commit/PR/dev-report 한국어
- [x] `feedback_role_naming_full.md` — Role 약어 미사용
- [x] `feedback_print_design_iteration.md` — 인쇄 양식 본 슬라이스에 미포함 (legacy partner-order 자체에 인쇄 없음 — §1.2.4 표 참조)

---

## v2 — 정정 라운드 (2026-05-05)

### 7. v1 → v2 변경 사항 (DECISIONS frontend sub-team 정정 라운드 §)

| # | 정정 | 본 PR 적용 |
|---|---|---|
| 2 | 품목 drag-and-drop 이동 | `@dnd-kit/core` + `@dnd-kit/sortable` 추가, 선택된 라인 `≡` 핸들로 정렬 변경 (`reorderLines`) |
| 4 | '모델 코드' → '모델명' | 모든 grid header / 라벨 (CategoryCard / OrderPreviewPage / OrderDetailPage) |
| 5 | '품명' → '품목명' | 동상 (legacy 에서 v1 도 일부 동일 — 누락 컬럼 보강) |
| 8 | 견적/주문 번호 'YYYY/MM/DD - {전표번호}' 통일 | `src/utils/formatSlipNumber.ts` + orders.ts mock orderNo 적용 + Route splat (`/orders/detail/*`) |
| 12 | 사업자번호 입장 시 DC율 자동 적용 | `dcConfigStore` (BizGate 인증 후 fetch) + `LinePriceDisplay` (출고가 + DC% + 옵션 가산 + 최종가) + `calcDcPrice.ts` (legacy `applyConfigFromServer` 1:1) |
| 17 | 재캡처 | 6장 모두 재캡처 (`docs/qa/migration-fe-order-app-v2/`) |

### 7.1 신규 모듈

| 파일 | 역할 |
|---|---|
| `src/types/index.ts` (수정) | `PartnerDcConfig` (12 컬럼) 신설, `OrderLine.releasePrice` + `options` + `sortOrder`, `ProductCatalog.releasePrice` (deliveryPrice 폐기), `AuthSession.partnerCode` |
| `src/utils/calcDcPrice.ts` (신규) | `calcLineFinalPrice({releasePrice, category, options, config})` — DC율 + 옵션 가산 + 단위처리. legacy `applyConfigFromServer` + `roundByConfig` 1:1 |
| `src/utils/formatSlipNumber.ts` (신규) | `formatSlipNumber(date, seq) → 'YYYY/MM/DD - 0001'` + `parseSlipNumber` |
| `src/api/dc.ts` (신규) | `getPartnerDcConfig(partnerCode)` — backend `GET /api/v1/partners/{partnerCode}/dc-config` + csv 222 row 중 sample 4 fallback |
| `src/stores/dcConfigStore.ts` (신규) | Zustand store — BizGate 인증 후 자동 load, 라인 grid 가 구독 |
| `src/components/order/LinePriceDisplay.tsx` (신규) | 출고가 (취소선 + 작은 회색) + DC% (빨강) + 옵션 (초록/빨강) + 최종가 (굵은 검정) 단일 cell 렌더 |
| `src/components/order/CategoryCard.tsx` (수정) | DnD context + sortable 선택 라인 + LinePriceDisplay 적용 + 헤더 '모델명'/'품목명' + 핸들 col 추가 |
| `src/routes/OrderFormPage.tsx` (수정) | DC banner top + dev-qa-seed 라인 시드 + dev-qa-drag 시각 효과 |
| `src/routes/OrderPreviewPage.tsx` (수정) | LinePriceDisplay 적용 + '모델명'/'품목명' + DC 적용 거래처 안내 |
| `src/routes/OrderDetailPage.tsx` (수정) | LinePriceDisplay + 명시 헤딩 (legacy `.title` font-size:0 우회) + slip number 노출 |
| `src/routes/BizGatePage.tsx` (수정) | tryLogin 직후 `useDcConfigStore.loadFor(partnerCode)` |
| `src/stores/session.ts` (수정) | bootstrap 시 dc config 자동 복원, logout 시 dc store clear |
| `src/api/orders.ts` (수정) | mock orderNo `formatSlipNumber` + DC 적용 후 totalAmount 계산 + 상세 (lines/info) sessionStorage 보강 |
| `src/api/auth.ts` (수정) | mock 응답에 `partnerCode` 포함 |
| `src/api/catalog.ts` (수정) | mock products 의 `deliveryPrice` → `releasePrice` 일괄 변경 |
| `public/dev-qa-seed.html` (신규) | QA 캡처용 — session + DC + 발송 1건 + 라인 시드 + 자동 redirect |
| `public/dev-qa-drag.html` (신규) | QA 캡처용 — drag 시각 효과 활성 후 form 으로 redirect |
| `src/styles/global.css` (말미 추가) | `body.qa-dragdemo-active` CSS — 첫 라인에 dashed outline + 색상 |
| `src/App.tsx` (수정) | 주문 상세 route `/orders/:orderNo` → `/orders/detail/*` (slip number slash 호환 splat) |
| `package.json` (수정) | `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/utilities` 추가 |

### 7.2 DC 계산 알고리즘 (legacy applyConfigFromServer 매핑)

| legacy (index.html line 1322) | v2 React |
|---|---|
| `window.DISCOUNT_RATE_HOME = cfg.homeDiscount` | `PartnerDcConfig.homeMultiDc` |
| `window.DISCOUNT_RATE_COMM = cfg.commDiscount` | `PartnerDcConfig.commercialMultiDc` |
| `window.SHOW_I_HOSE = !!cfg.showIHose` | `PartnerDcConfig.flexibleHoseI` |
| `window.DISCOUNT_360_AMT` 등 6 옵션 | `PartnerDcConfig.option360 / option4way / ...` |
| `window.UNIT_ROUND_TO` | `PartnerDcConfig.unitProcessing` |
| `Math.round(currentListPrice * (1 - useRate))` (line 2419) | `calcLineFinalPrice` 의 `dcAppliedPrice` |
| `roundByConfig(computed)` (line 2425) | `roundByUnit(value, unitRoundTo)` |

### 7.3 csv 222 row 동작 테스트 (mock fallback 4 sample)

| partnerCode | csv row | 시연 동작 |
|---|---|---|
| `4348703365` | row 1 — 엠엠시스템에어 | 홈멀티 46% 적용 / I형 호스 노출 |
| `2568700899` | row 3 — 제이앤피공조 | DC 0% / 옵션 4 종 +70,000~+50,000 가산 |
| `2188601069` | row 4 — 삼성에스에이씨비투비 | 홈멀티 45% + 옵션 +20,000 4종 |
| `1234567890` | mock 인증용 (`MOCK_BIZNO_OK = '123-45-67890'`) | 홈멀티 46% / 상업멀티 40% / 옵션 4 종 / 단위처리 1000 — 모든 효과 한 번에 시연 |

### 7.4 검증

| 단계 | 명령 | 결과 |
|---|---|---|
| typecheck | `npm run typecheck` | PASS (0 error) |
| lint | `npm run lint` | PASS (0 warning) |
| build | `npm run build` | PASS — `dist/manifest.webmanifest`, `dist/sw.js`, `dist/workbox-*.js` 모두 생성 (precache 10 entries / 360 KiB) |
| QA 캡처 | Edge headless `--screenshot` 1280x800/900/1100 | 6장 `docs/qa/migration-fe-order-app-v2/` |

### 7.5 캡처 6장 (`docs/qa/migration-fe-order-app-v2/`)

| # | 파일 | 검증 |
|---|---|---|
| 1 | `01-order-app-bizgate.png` | BizGate 사업자번호 입력 page |
| 2 | `02-order-app-main-after-login.png` | 메인 4 카테고리 + DC banner top ((주)테스트거래처 홈멀티 46% / 상업멀티 40% / 옵션 4way +70,000 / 360 +70,000) |
| 3 | `03-order-app-form-with-dc.png` | 주문 입력 (라인 3건) — 헤더 '품목명'/'모델명', 출고가 취소선 + DC -46% + 최종가 + 옵션 가산 (+70,000 → +280,000 합계) |
| 4 | `04-order-app-mobile-responsive.png` | 390px viewport — DC banner / top action 줄바꿈 / 표 횡스크롤 |
| 5 | `05-order-app-order-number.png` | 주문 상세 — `2026/05/05 - 0001` 양식 표시 + 3 라인 DC 적용 + 배송 정보 |
| 6 | `06-order-app-drag-drop.png` | drag-and-drop 진행 중 — 첫 라인 파란 dashed outline (active drag) + 두번째 라인 노랑 (drop target) |

### 7.6 알려진 한계 / 후속 PR (v2)

| 항목 | 사유 | 후속 |
|---|---|---|
| 옵션 토글 UI | DC config 의 옵션 6 종 (4way/360/1way/stand/deluxe/grade1) — 라인별 토글 UI 미노출 (현재는 시드 라인에 직접 `options: ['4way']` 부여) | 후속 PR — 라인 옵션 dropdown 또는 modal |
| backend M2 PartnerDcConfig endpoint | 미존재 (mock fallback) | M2 통합 PR |
| DC config 변경 시 라인 가격 실시간 재계산 | 현재는 store 변경 시 component re-render 의존 (selector 가 dcConfigStore 구독) — 일부 selector 가 `useOrderStore.getState().config` 동적 참조 → re-render 미 trigger 가능 | 후속 PR — DC 변경 이벤트 발행 또는 selector 보강 |

## 8. v3 — 정정 #17/#18 (branch `feature/migration-fe-order-app-v3`)

### 8.1 v2 → v3 변경 요약

| 정정 | 영역 | 변경 |
|---|---|---|
| #17 | 메뉴 toolbar | legacy partner-order index.html 의 모든 메뉴 toolbar 보존 + 주문저장 (`btnSaveDraft`) 과 저장내역 (`btnDraftList`) 분리 |
| #17 | 9 모달 inventory | placeholder mount (핵심 4 React + 5 placeholder) |
| #18 | cardOrderInfo 흐름 | 라인 0건 시 cardOrderInfo 숨김, 라인 1건 추가 시 자동 표시 + 첫 input(배송지) focus |

### 8.2 신규 / 변경 파일

| 파일 | 분류 | 비고 |
|---|---|---|
| `src/components/order/LegacyMenuToolbar.tsx` | 신규 | OrderFormPage 에서 메뉴 toolbar 분리 — view-group / 분기계산 / 견적·주문 / 발송내역 / 주문저장 / 저장내역 |
| `src/components/order/InlineOrderInfoCard.tsx` | 신규 | 정정 #18 — 인라인 주문정보 카드 (라인 1+ 시 표시 + 첫 input focus + cardFinal 합계+발주) |
| `src/components/order/LegacyModalInventory.tsx` | 신규 | 정정 #17 — 9 모달 inventory placeholder mount (id 만 보존, 후속 PR 활성) |
| `src/stores/draftStore.ts` | 신규 | PartnerOrderDraft 30일 보관 (sessionStorage fallback) |
| `src/routes/OrderFormPage.tsx` | 수정 | LegacyMenuToolbar 분리 + InlineOrderInfoCard mount + LegacyModalInventory mount |
| `src/routes/OrderSnapshotPage.tsx` | 수정 | useDraftStore 통합 — 저장본 list + 불러오기/삭제 |
| `public/dev-qa-seed-v3.html` | 신규 | v3 QA 캡처 시나리오 (login/empty/add1/draft/mainNoLines) |

### 8.3 9 모달 inventory 분류

| # | id | 분류 | 구현 |
|---|---|---|---|
| 1 | `dlgSpec` | 핵심 4 | React 라우트 (품목 detail) — `dlgSpecPlaceholder` 만 mount, 실 구현은 후속 PR |
| 2 | `dlgPreview` | 핵심 4 | React 라우트 `OrderPreviewPage` |
| 3 | `dlgOrderDetail` | 핵심 4 | React 라우트 `OrderDetailPage` |
| 4 | `dlgFinal` | 핵심 4 | React 라우트 `OrderInfoPage` (배송 정보 + 발송) |
| 5 | `dlgProgress` | 보조 | placeholder mount |
| 6 | `divSnapshotPage` | 핵심 4 | React 라우트 `OrderSnapshotPage` |
| 7 | `dlgInventory` | 후속 | placeholder mount (M5 inventory-service 통합 후) |
| 8 | `dlgHistory` | 후속 | placeholder mount (M4 partner-order-service 통합 후) |
| 9 | `dlgSnapshot` | 후속 | placeholder mount |

### 8.4 정정 #18 — 라인 1건 이상 시 cardOrderInfo 자동 표시 흐름

```
1. 사용자 BizGate 인증
2. /orders/new 진입 → 4 카테고리 카드 grid (no-active mode)
3. 카테고리 클릭 (예: 홈멀티) → home-active mode
   → 카테고리 카드 표시, cardOrderInfo 숨김 (lines.length === 0)
4. 품목 수량 입력 (qty: 0 → 1+)
   → cardOrderInfo 자동 표시 + 배송지 input focus (requestAnimationFrame)
5. 사용자가 배송지/인수자/연락처/출고희망일 입력
   → 모두 채워지면 "견적 확인 및 발주" 버튼 활성
6. 클릭 시 /orders/preview 로 이동 (기존 v2 흐름 유지)
```

cardOrderInfo 안의 거래처는 BizGate 인증 시 sessionStorage 의 `auth.partnerName` + `auth.bizno` 자동 표시 (read-only — 변경 불가).

### 8.5 QA 캡처 6장 (v3) — `docs/qa/migration-fe-order-app-v3/`

| # | 파일 | 의도 |
|---|---|---|
| 1 | `01-order-app-bizgate.png` | 사업자번호 입력 게이트 (변경 없음 — 인증 첫 화면) |
| 2 | `02-order-app-main-after-login.png` | 인증 후 메인 진입 (no-active) — DC banner + 메뉴 toolbar + 4 카테고리 mobile-gate |
| 3 | `03-order-app-form-empty.png` | 카테고리 진입 + 라인 0건 → cardOrderInfo X (정정 #18) |
| 4 | `04-order-app-form-after-add-1.png` | 라인 1건 추가 → cardOrderInfo 자동 표시 + 배송지 input focus + cardFinal (정정 #18) |
| 5 | `05-order-app-menu-toolbar.png` | legacy 메뉴 toolbar — 4 카테고리 보기 / 임의 분기계산 / 견적·주문 / 과거 발송내역 / 주문저장 / 저장내역 (정정 #17) |
| 6 | `06-order-app-mobile-responsive-after-add.png` | 모바일 viewport (420px) + cardOrderInfo 단일 column 표시 |

### 8.6 v3 알려진 한계 / 후속 PR

| 항목 | 사유 | 후속 |
|---|---|---|
| OrderInfoPage 라우트 (`/orders/info`) 존속 | InlineOrderInfoCard 가 동일 입력 form 을 inline 화 → /orders/info 는 deprecated 상태이지만 라우트 보존 (외부 deep link 호환) | 차기 PR — 사용 여부 검토 후 제거 가능 |
| 9 모달 중 5 placeholder 의 실 동작 | dlgInventory/dlgHistory/dlgSnapshot/dlgProgress/dlgSpecPlaceholder — id 만 mount | M5/M4 통합 후 활성 |
| Daum Postcode 통합 | 배송지 input 은 단순 text — 주소 검색 X | 후속 PR — react-daum-postcode |
| btnSaveDraft → backend M4 endpoint | 현 단계 sessionStorage fallback (`samhan.order.draft.mock`) | M4 `/api/v1/partner-orders/drafts` endpoint 통합 |
