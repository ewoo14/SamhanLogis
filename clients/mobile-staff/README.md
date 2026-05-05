# @samhan/mobile-staff — SamhanLogis 영업직원 견적 (React Native Expo) — v1

> Phase 6 frontend Sub-team **mobile-staff v1 (영업직원 전용 견적)**.
> DECISIONS Phase 6 v4 후속 정정 § (commit `fd35212`) — PR #60 회고.

## 개요 (v1)

(주)삼한공조시스템 **영업직원** 이 모바일에서 estimate-app v2 (Node + Express + EJS 임베드된 legacy
estimate 18614 라인) 를 그대로 보면서 견적 작성. **react-native-webview** 로 estimate-app v2 를
모바일 viewport 임베드, RN 프레임워크 (StaffLogin native + 3-tab BottomTab + safe area) 보존.

- 사용자 명시 (PR #60 회고):
  - "견적서와 주문서 모바일은 별도 / 견적서 → 삼한 사무실 영업직원용 / 주문서 → 외부 거래처용"
  - "추천대로 진행 (옵션 b 웹 모바일 뷰포트) / 단 앱 버전도 만들고 싶음 / 해당 뷰포트 그대로 사용"
- Mobile v4 (`clients/mobile`, 거래처용 — partner-order WebView) 와 분리.
- legacy 시각/기능 100% 일치 — RN 측은 navigation routing / token 전달 만 책임.

## Mobile v4 (거래처) vs mobile-staff (영업직원)

| 항목 | clients/mobile (Mobile v4) | clients/mobile-staff (v1) |
|---|---|---|
| 사용자 | 외부 거래처 | 삼한 사무실 영업직원 |
| 인증 | BizGate (사업자번호) | StaffLogin (사번 + 비밀번호) |
| 메인 WebView | order.samhan-air.com (legacy partner-order) | estimate.samhan-air.com (estimate-app v2) |
| BottomTab | 홈/주문/알림/프로필 (4 tabs) | 홈/견적/프로필 (3 tabs, 단순) |
| Bundle ID | com.samhanair.mobile | com.samhan.estimate |
| App 이름 | SamhanLogis 주문 | 삼한공조 견적 |
| AsyncStorage namespace | `auth.*` | `staff.auth.*` (충돌 방지) |
| WebView header | X-Samhan-Partner | X-Samhan-Staff |
| DC 표시 | 거래처용 (별도 hotfix PR #61 로 삭제) | n/a — 영업직원은 DC OK |

## 화면 구조 (v1)

| 영역 | 화면 | 구현 |
|---|---|---|
| 인증 (Auth Stack) | StaffLogin | RN native (사번 + 비밀번호) |
| 견적 (Estimate Stack) | **LegacyEstimate** | react-native-webview (estimate-app v2) |
| 홈 | Home | RN native (영업직원 환영 + 견적 진입 button) |
| 프로필 (Profile Stack) | Profile | RN native (사번 + 이름 + 로그아웃) |

Bottom Tab (3): 홈 / 견적 / 프로필 (탭 전환 시 stack 보존)

## 인증

본 v1 = 사번 + 비밀번호 (`POST /api/v1/auth/staff-login`).

iam-service M2 의 staff-login endpoint **미구현** 시, `loginStaff()` 가 mock fallback 활성화:

| 사번 | 비밀번호 | 이름 |
|---|---|---|
| S001 | 1234 | 홍길동 |
| S002 | 1234 | 김영희 |

후속 (v2) — SSO (OAuth) 옵션 추가.

## WebView 통합

- `src/screens/estimate/LegacyEstimateWebViewScreen.tsx` — `<WebView>` 단일 화면.
- `src/webview/legacyEstimateShim.ts` — fetch monkey-patch + Authorization Bearer + X-Samhan-Staff.
- `src/webview/legacyEstimateSource.ts` — dev / prod URL.

dev URL: `http://localhost:5183/` (clients/web/estimate-app v2 dev server).
prod URL: `https://estimate.samhan-air.com/`.

token 전달: StaffLogin native 인증 후 `webViewRef.injectJavaScript(setEstimateAuthScript({...}))`.

## mobile-mode 자동 활성

estimate-app v2 의 views/index.ejs (legacy estimate 18614 라인 그대로) 가 line 7187 의
`document.body.classList.toggle('mobile-mode', isMobile)` 로 viewport 1280px 미만 시 자동 활성.

react-native-webview 의 device width (iPhone 14 Pro = 390, Galaxy S22 = 360) 가 모두 1280 미만 →
**코드 변경 0** 으로 mobile-mode 자동 활성, `.mobile-only` 자동 노출, 4 카드 grid 1열 stack.

## 디자인 시스템 — token only

DS 컴포넌트 (`@samhan/design-system/components/*`) 는 RN 미호환이므로 **import 금지**.

`src/tokens/tokens.ts` 가 DS 의 색상·spacing·fontSize 값을 RN 호환 형태로 hard-code.
Mobile v4 의 token 과 동일 + `staffGateBg` / `staffBadgeBg` 영업직원 전용 alias 추가.

## 실행

```bash
cd clients/mobile-staff
npm install --legacy-peer-deps    # Expo SDK 53 + RN 0.79 peer 충돌 회피
npx tsc --noEmit                  # 타입 검사
npx expo-doctor                   # Expo 호환성 검사
npx expo export --platform web    # web 타깃 export (dist/)

# 모바일 emulator
npx expo start --android          # Android
npx expo start --ios              # iOS (macOS 만)
npx expo start --web              # web fallback
```

## 환경변수 (`.env.example` 참고)

| 변수 | dev default | prod default | 비고 |
|---|---|---|---|
| `EXPO_PUBLIC_ESTIMATE_APP_URL` | `http://localhost:5183/` | `https://estimate.samhan-air.com/` | 미정의 시 dev/prod 분기 |
| `EXPO_PUBLIC_API_BASE_URL` | `http://localhost:8080` | `https://api.samhan-air.com` | iam-service staff-login |

## QA 캡처 5장

`docs/qa/migration-fe-mobile-staff-v1/`:

1. `01-staff-login.png` — 사번 + 비밀번호 입력
2. `02-staff-home.png` — 영업직원 환영 + 견적 진입 button (3 tabs)
3. `03-staff-estimate-webview.png` — 견적 tab → WebView (mobile-mode 활성, 4 카드 1열)
4. `04-staff-estimate-webview-after-add.png` — 라인 추가 후 (legacy recompute*Derived 자동)
5. `05-staff-profile.png` — 영업직원 프로필 + 로그아웃

## 모호 항목 (PM 검토 요청)

- **영업직원 인증 endpoint 미구현**: iam-service M2 의 `POST /api/v1/auth/staff-login` 별도 슬라이스 필요.
  v1 은 mock fallback (S001/1234) 으로 작동.
- **SSO vs 사번**: 옵션 B (OAuth SSO) 후속 (v2). v1 = 사번 + 비밀번호.
- **WebView ↔ RN bridge 의 staff token 호환**: estimate-app v2 의 server.js 가 `X-Samhan-Staff` header
  를 인지하도록 별도 BE 슬라이스 필요. 현재 mock fallback 작동 가능.
