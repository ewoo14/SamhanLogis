# @samhan/mobile — SamhanLogis 거래처 주문서 (React Native Expo) — v4

> Phase 6 frontend mobile client (거래처용). **legacy WebView 단일화 패턴 채택**.
> mobile-staff v3 의 `EstimateWebViewScreen` 패턴 1:1 적용.

## 개요

거래처가 모바일에서 order-app v4 (Vite + legacy `partner-order/index.html` 9427 라인 임베드) 를
react-native-webview 로 통째 임베드. RN 측은 SafeAreaProvider + StatusBar + WebView wrapper 만.

- 단일 WebView wrapper = `MobileOrderWebViewScreen`. 모바일 게이트 / 페이지 메뉴 drawer /
  4 카테고리 진입 / 임시저장 / 확정 / 과거 발송내역 / 자동 로그아웃 timer 모두 WebView 안
  legacy 가 자체 표시.
- legacy 시각/기능 100% 일치 — RN 측은 wrapper 만 책임.

## 화면 구조

| 영역 | 화면 | 구현 |
|---|---|---|
| 단일 메인 | `MobileOrderWebViewScreen` | react-native-webview (order-app v4 임베드) |

navigation / BottomTab / AuthStack / HomeScreen / NotificationListScreen / ProfileScreen
모두 폐기 — `<NavigationContainer>` 자체 미사용.

## WebView 통합

- `clients/mobile/src/screens/MobileOrderWebViewScreen.tsx` — `<WebView>` 단일 화면.
- `clients/mobile/src/webview/legacyOrderShim.ts` — fetch monkey-patch (X-Samhan-Partner header) +
  mobile-mode 자동 활성 검증 + postMessage bridge. `google.script.run` shim 은 order-app v4
  inline 이 자체 제공 → RN 중복 X.
- `clients/mobile/src/webview/legacyOrderSource.ts` — dev / prod URL.

dev URL: `http://localhost:5185/` (`clients/web/order-app` v4 dev server).
prod URL: `https://order.samhan-air.com/`.

인증: WebView 안 legacy `tryLogin` (Apps Script 1:1) 가 cookie 로 처리. RN 측 BizGate native 폐기.

## 모바일 분기 자동 활성

- order-app v4 의 legacy `partner-order/index.html`:
  - line 119  : `.mobile-gate { display:none; flex-direction:column; gap:16px; margin:20px 0 12px }`
  - line 120  : `body.no-active .mobile-gate { display:flex }` (인증 통과 후 default 4 카테고리 노출)
  - line 121  : `.select-big { width:100%; height:150px; ... font-size:36px }`
  - line 4480 : `document.body.classList.toggle('mobile-mode', isMobile)`
- react-native-webview 의 device width (iPhone 14 Pro = 390 < 1280) → mobile-mode 자동.

## 실행

```sh
cd clients/mobile
npm install --legacy-peer-deps
npm run start          # Expo Dev Server (QR 코드)
npm run ios            # iOS 시뮬레이터
npm run android        # Android 에뮬레이터
npm run web            # web preview (mobile viewport)
npm run typecheck      # TypeScript 검증
npm run doctor         # expo-doctor 검증
npm run export:web     # web preview build (CI)
npm run capture:v4     # Playwright QA 캡처 (dev server 5185 필요)
```

EAS `preview`/`production` 빌드는 `BUILD_ENV`가 릴리스 모드이므로
`EXPO_PUBLIC_APP_VERSION=YYYY/MM/DD-번호`를 반드시 주입해야 합니다. 누락 시 app.config가
실패하며 개발 sentinel을 포함한 릴리스 산출물을 만들지 않습니다.

## QA 캡처

`docs/qa/migration-fe-mobile-v4-design-audit/` —
mobile-staff v3 의 `capture-v3.cjs` 패턴 1:1, mock HTML overlay 폐기.

| 캡처 | 화면 |
|---|---|
| 01-mobile-gate.png | 모바일 게이트 4 카테고리 |
| 02-page-menu.png | 페이지 메뉴 drawer + 자동 로그아웃 timer |
| 03-home-active.png | 홈멀티 진입 직후 라인 grid + 옵션·필터 sidebar |
| 04-page-history.png | 과거 발송내역 페이지 |
| 05-bizgate.png | 인증 게이트 (#pageBizGate) |

Phase 7 추가: `qa/playwright/` 의 `mobile-chrome` (Pixel 7) / `mobile-safari` (iPhone 14) project
가 본 client 의 dev URL `http://localhost:5184` 에 대해 happy + edge 시나리오를 자동 검증한다.

## UUID 미노출

본 RN wrapper 자체에서는 UUID 노출 없음. 화면에 노출되는 식별자는 모두 WebView 안
order-app v4 가 표시 — `orderNumber` (PO-YYYYMMDD-NNNN) / `partnerCode` (사업자번호 10자리) /
`partnerName` (거래처명) / `modelCode` (품목코드) 만.

UUID 가 필요한 backend 호출 (예: stock 조회) 은 Phase 7 3차 추가된 product-service
`GET /api/products/by-code/{modelCode}` 로 modelCode → productId 변환을 거쳐 진행한다.

## 한국 path 트랩

worktree path 가 한글이면 npm install / Metro bundler 실패 가능 — JDK 17 `@argfile`
인코딩 한계의 RN 변형. ASCII 전용 경로 (예: `C:\dev\SamhanLogis`) 사용 권장.

## 환경변수 표준 (Phase 8 / Phase 9 일관)

본 client (Expo SDK 53) 는 Expo 의 표준 prefix `EXPO_PUBLIC_*` 만 사용한다 (런타임 노출 가능 변수만).

| 변수                               | 기본값                          | 용도                                            | 사용 위치                                               |
| ---------------------------------- | ------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`         | `http://localhost:8080`         | api-gateway base URL (Phase 9 신규 service 포함) | `src/api/client.ts` (현재 `__DEV__` 하드코딩 — Phase 9 W1 정정 위임) |
| `EXPO_PUBLIC_ORDER_APP_URL`        | `http://localhost:5185`         | order-app v4 dev server URL                     | `src/webview/legacyOrderSource.ts` `dev` 분기            |
| `EXPO_PUBLIC_ORDER_APP_PROD_URL`   | `https://order.samhan-air.com`  | order-app v4 prod URL                           | `src/webview/legacyOrderSource.ts` `prod` 분기           |

### Phase 8 가드

- **`EXPO_PUBLIC_*` prefix 의무** — Expo 가 빌드 타임에 `process.env.EXPO_PUBLIC_*` 만 RN bundle 에 inline. prefix 미준수 시 `undefined`.
- **하드코딩 회피** — 현재 `src/api/client.ts:18-20` 의 `__DEV__` 분기 + 하드코딩 호스트는 Phase 9 W1 (partner-service skeleton 진입) 시점에 `EXPO_PUBLIC_API_BASE_URL` override 패턴으로 정정 위임.
- **AWS Route 53 cutover 호환** — `*.samhan-air.com` 8 subdomain (Phase 10 cutover) 모두 `EXPO_PUBLIC_*` 환경변수로 주입 가능. `.env.production` / `.env.staging` 분리는 Phase 9 W1 시점 `EAS Build` profile 구성 시 도입.

### Phase 9 신규 service 의 client 노출

| service              | client 호출 | 환경변수                              | 비고                                       |
| -------------------- | ----------- | ------------------------------------- | ------------------------------------------ |
| partner-service      | (없음)      | -                                     | backend internal lookup (slip-service 경유) |
| notification-service | 직접 호출   | `EXPO_PUBLIC_API_BASE_URL` 의 prefix  | push token 등록 + permission grant flow 만 |
| dashboard-service    | (없음)      | -                                     | 거래처 화면 비노출 (직원용 only)            |
| groupware-service    | (없음)      | -                                     | 거래처 화면 비노출 (직원용 only)            |

### slice 명 정정 (Phase 9 W4 — W3 FE backlog #5 채택)

데스크톱의 `notification-slice-B` (배송 묶음 + e-sign URL SMS 발송 슬라이스) 가 backend 신규 `notification-service` (8093) 와 명칭 충돌하여 `link-dispatch-slice` 로 일괄 정정. 본 mobile client 는 해당 slice 직접 의존 없음 — 단어 충돌 회피 인지 + 향후 push 통합 시 `notification-service` (backend) 와 `link-dispatch-slice` (frontend) 명확 구분.

상세는 `docs/migration/phase9/M-PHASE-9-readiness.md` 참조.
