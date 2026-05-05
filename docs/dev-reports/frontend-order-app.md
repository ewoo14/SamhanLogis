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
