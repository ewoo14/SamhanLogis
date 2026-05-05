# @samhan/mobile-staff — SamhanLogis 영업직원 견적 (React Native Expo) — v2

> Phase 6 frontend Sub-team **mobile-staff v2 (WebView only)**.
> DECISIONS Phase 6 § (commit `ad313ed`) — PR #63 회고 후속.

## 개요 (v2)

(주)삼한공조시스템 **영업직원** 이 모바일에서 estimate-app v2 (Node + Express + EJS 임베드된 legacy
estimate 18614 라인) 를 그대로 사용. **react-native-webview** 단일 screen 으로 estimate-app v2 를
모바일 viewport 임베드.

- 사용자 명시: "앱 버전에서도 현재 견적서의 모바일 뷰를 그대로 사용하는 방안으로 진행".
- v1 (PR #63 close) 의 StaffLogin / Home / Profile native + 3-tab BottomTab 전부 폐기.
- 인증 = WebView 안 legacy estimate `checkUserAuth(USER_EMAIL)` (Apps Script Code.js line 8726 1:1).
- 코드 분량 ~80% 감소 (24 파일 → ~7 파일).

## v1 → v2 변경표

| 항목 | v1 (PR #63 close) | v2 (신규) |
|---|---|---|
| StaffLogin native | RN form (사번 + 비밀번호) | **폐기** (WebView 안 legacy `checkUserAuth`) |
| Home native | RN | **폐기** |
| Profile native | RN | **폐기** |
| BottomTab Navigator | 3 tabs (홈/견적/프로필) | **폐기** (legacy 에 없음) |
| LegacyEstimateWebViewScreen | tab 안 1개 | **메인 단일 screen** (`EstimateWebViewScreen`) |
| RN wrapper | 복잡 (header + reload + help) | **단순** (status bar + safe area + 뒤로가기) |
| React Navigation | Stack + Tab + 의존성 | **폐기** (단일 screen, navigation 불요) |
| zustand authStore | 사번/이름/token 저장 | **폐기** (cookie/sessionStorage 활용) |
| @tanstack/react-query | 사용 | **폐기** (RN 측 API 호출 없음) |
| axios | API client | **폐기** |
| AsyncStorage | staff.auth.* | **폐기** |
| 파일 수 | 24 | ~7 |

## 디렉토리 구조

```
clients/mobile-staff/
├── package.json (Expo SDK 53 + react-native-webview + react-native-safe-area-context)
├── app.json (name "삼한공조 견적", bundleId com.samhan.estimate)
├── tsconfig.json
├── babel.config.js
├── App.tsx (단일 SafeAreaProvider + StatusBar + EstimateWebViewScreen)
├── .env.example (EXPO_PUBLIC_ESTIMATE_APP_URL + EXPO_PUBLIC_API_BASE_URL)
├── src/
│   ├── screens/
│   │   └── EstimateWebViewScreen.tsx — 단일 WebView + RN 뒤로가기 + status bar
│   └── webview/
│       ├── legacyEstimateShim.ts (Mobile v5 패턴 1:1, X-Samhan-Staff header 보존)
│       └── legacyEstimateSource.ts (dev:5183 / prod:estimate.samhan-air.com + override + validate)
├── scripts/
│   └── capture-v2.cjs (Playwright 3 캡처)
└── README.md
```

## 인증 흐름 (legacy estimate 그대로)

```
[App 시작]
  ↓
[App.tsx → SafeAreaProvider → EstimateWebViewScreen]
  ↓
[WebView source = estimate.samhan-air.com / localhost:5183]
  ↓
[shim 사전 주입 (X-Samhan-Staff header 안전망 only — v2 default 무인증)]
  ↓
[WebView 안 legacy estimate index.ejs 실행]
  ↓
[lib/code.js 의 checkUserAuth(USER_EMAIL) 자동 호출 — Apps Script Code.js line 8726 1:1]
  ↓
[iam-service GET /api/v1/auth/me?email= (mock fallback) → 영업직원 식별]
  ↓
[token 은 WebView 안 cookie / sessionStorage 에 저장 — RN 미관여]
  ↓
[견적 작성 RPC 11종 — 모두 WebView 안 inline google.script.run shim 가 처리]
```

→ RN 측 인증 코드 0줄. shim 의 `X-Samhan-Staff` header 첨부는 후속 (RN push notification + SSO 통합) 을
   위한 안전망으로만 보존 (v2 default = `token=null, employeeCode=null`).

## legacy mobile UI 자동 활성

estimate-app v2 의 views/index.ejs 가 line 7187 에서:

```js
document.body.classList.toggle('mobile-mode', isMobile);
```

react-native-webview 의 device width (iPhone 14 Pro = 390, Galaxy S22 = 360) → 자동 활성.

→ 4 카드 grid (홈멀티/싱글세트/상업멀티/구형) 가 1열 stack 으로 자동 변환.
→ `.mobile-only` class 의 desktop 숨김 컬럼들이 자동 노출 (품목명, 모델 상세 등).

mobile-staff v2 의 RN wrapper 는 viewport 만 제공. mobile UI 활성은 100% legacy estimate 자체 책임.

## 환경변수

`.env.example` 참고. Expo SDK 53 의 `EXPO_PUBLIC_*` prefix 만 client 노출.

```
EXPO_PUBLIC_ESTIMATE_APP_URL=https://estimate.samhan-air.com/
EXPO_PUBLIC_API_BASE_URL=https://api.samhan-air.com
```

미정의 시:
- dev (`__DEV__ === true`): `http://localhost:5183/` + `http://localhost:8080`
- prod: `https://estimate.samhan-air.com/` + `https://api.samhan-air.com`

## 검증

```sh
cd clients/mobile-staff
npm install --legacy-peer-deps
npx tsc --noEmit
npx expo-doctor
npx expo export --platform web
node scripts/capture-v2.cjs
```

→ `docs/qa/migration-fe-mobile-staff-v2/` 에 3장 PNG 생성.

## QA 캡처 3장

| 파일 | 설명 |
|---|---|
| `01-app-init.png` | 앱 진입 (SafeAreaView + StatusBar + WebView 로딩 → estimate-app v2 모바일 UI) |
| `02-app-mobile-ui.png` | legacy estimate `body.mobile-mode` UI 활성 (4 카드 1열 stack + 메뉴 toolbar) |
| `03-app-after-add.png` | 라인 추가 후 (legacy recompute*Derived 자동 동작) |

## RN 뒤로가기

- Android = `BackHandler.addEventListener('hardwareBackPress')` 가 WebView 의 `canGoBack` state 확인.
  - history 있음 → `webview.goBack()` 우선 (event consumed).
  - history 끝 → default (앱 종료).
- iOS = native swipe-back gesture 는 single screen 이므로 미적용 (기본 OS 흐름).

## 후속 (모호 항목)

- Android push notification → WebView 안 영업직원 알림 routing 통합 (M3 이후).
- iOS App Store 배포 시 `bundleIdentifier` / 인증서 / Apple sign-in 정책.
- 영업직원 SSO (Google Workspace / Naver Works) → shim 의 `setEstimateAuthScript` 부활 가능성.

## 참고

- Mobile v4 (`clients/mobile`, 거래처용 — partner-order WebView, BizGate 인증, 4-tab) 와 분리.
- v1 코드는 `feature/migration-fe-mobile-staff-v1` branch (close PR #63) 에서 참조 가능.
