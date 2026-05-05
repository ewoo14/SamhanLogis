# mobile-staff v2 — Dev Report (WebView only)

> Phase 6 frontend Sub-team **mobile-staff v2 (WebView only RN wrapper)**.
> 출처: DECISIONS Phase 6 § (commit `ad313ed`), PR #63 회고.

## 1. 사용자 명시

> "앱 버전에서도 현재 견적서의 모바일 뷰를 그대로 사용하는 방안으로 진행"

→ v1 의 RN native (StaffLogin / Home / Profile + 3-tab BottomTab) 폐기 + estimate-app v2 의 mobile UI
   를 react-native-webview 로 100% 재사용.

## 2. v1 → v2 핵심 변경

| 항목 | v1 (PR #63 close, commit `d69a7f7`) | v2 (본 PR) |
|---|---|---|
| StaffLogin native | RN form (사번 + 비밀번호) | 폐기 — WebView 안 legacy `checkUserAuth` 가 처리 |
| Home native | RN | 폐기 |
| Profile native | RN | 폐기 |
| BottomTab Navigator | 3 tabs (홈/견적/프로필) | 폐기 (legacy estimate 에 없음) |
| 메인 screen | LegacyEstimateWebViewScreen (tab 안) | EstimateWebViewScreen (단일) |
| RN wrapper | header + reload + help button + error overlay | SafeAreaView + WebView only |
| React Navigation | `@react-navigation/{native,bottom-tabs,native-stack}` | 폐기 |
| zustand authStore | 사번/이름/token 저장 | 폐기 |
| @tanstack/react-query | 사용 | 폐기 |
| axios | API client | 폐기 |
| AsyncStorage | staff.auth.* | 폐기 |
| 파일 수 | 24 | 9 (실 코드 7 + .env.example + README) |

## 3. 신규/변경 파일

### 신규 (v2)

| 경로 | 라인 수 | 설명 |
|---|---|---|
| `clients/mobile-staff/package.json` | 30 | navigation/zustand/axios/react-query/AsyncStorage 의존성 폐기 |
| `clients/mobile-staff/app.json` | 22 | v0.2.0 — bundle/이름 보존 |
| `clients/mobile-staff/tsconfig.json` | 21 | v1 동일 |
| `clients/mobile-staff/babel.config.js` | 11 | v1 동일 |
| `clients/mobile-staff/.env.example` | 18 | v1 의 staff/SSO 환경변수 폐기, estimate-app URL + API base URL 만 |
| `clients/mobile-staff/App.tsx` | 24 | SafeAreaProvider + StatusBar + EstimateWebViewScreen — navigation 의존 0 |
| `clients/mobile-staff/src/screens/EstimateWebViewScreen.tsx` | 105 | 단일 screen, WebView + 뒤로가기 + status bar |
| `clients/mobile-staff/src/webview/legacyEstimateShim.ts` | 195 | v1 logic 1:1 + `buildShim()` alias 추가 |
| `clients/mobile-staff/src/webview/legacyEstimateSource.ts` | 107 | v1 logic 1:1 + `getEstimateAppUrl()` alias 추가 |
| `clients/mobile-staff/scripts/capture-v2.cjs` | 240 | Playwright 3 캡처 (5장 → 3장 단순화) |
| `clients/mobile-staff/README.md` | 130 | v2 설명 + v1 비교표 + 후속 모호 항목 |

### 폐기 (v1, branch `feature/migration-fe-mobile-staff-v1` 에서 참조)

| 경로 | 폐기 이유 |
|---|---|
| `src/api/auth.ts` | RN 측 인증 코드 0 — WebView 안 legacy 가 처리 |
| `src/api/client.ts` | axios 의존 폐기 |
| `src/global.d.ts` | (필요 시 v2 에 재추가) |
| `src/navigation/AuthStackNavigator.tsx` | navigation 의존 폐기 |
| `src/navigation/BottomTabNavigator.tsx` | tab 폐기 (legacy 에 없음) |
| `src/navigation/RootNavigator.tsx` | 단일 screen, navigation 불요 |
| `src/navigation/types.ts` | navigation 의존 폐기 |
| `src/screens/auth/StaffLoginScreen.tsx` | WebView 안 legacy `checkUserAuth` |
| `src/screens/estimate/LegacyEstimateWebViewScreen.tsx` | EstimateWebViewScreen 으로 교체 (단순화) |
| `src/screens/home/HomeScreen.tsx` | legacy 에 없음 |
| `src/screens/profile/ProfileScreen.tsx` | legacy 에 없음 |
| `src/stores/authStore.ts` | zustand 의존 폐기 |
| `src/tokens/tokens.ts` | RN 디자인 토큰 0 사용 — WebView 안 legacy CSS 가 처리 |
| `scripts/capture-v1.cjs` | capture-v2.cjs 로 교체 (5장 → 3장) |

## 4. 인증 흐름

```
[App.tsx → SafeAreaProvider → EstimateWebViewScreen]
  ↓
[WebView source = EXPO_PUBLIC_ESTIMATE_APP_URL || (dev http://localhost:5183/ | prod https://estimate.samhan-air.com/)]
  ↓
[shim 사전 주입 — buildShim() — X-Samhan-Staff header 안전망 (v2 default 무인증)]
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

## 5. 함수 단위 문서화 (3-layer)

### EstimateWebViewScreen.tsx

| Export | 한국어 Javadoc | 시그니처 |
|---|---|---|
| `EstimateWebViewScreen` (default) | mobile-staff v2 의 단일 메인 screen — WebView + 뒤로가기 + status bar | `(): JSX.Element` |

### legacyEstimateShim.ts

| Export | 한국어 Javadoc | 시그니처 |
|---|---|---|
| `LegacyEstimateShimConfig` | shim config interface (apiBaseUrl + token + employeeCode + userEmail) | `interface` |
| `getInjectedEstimateShim(config)` | estimate-app v2 index.ejs 첫 로드 직전 주입 IIFE JS string | `(config) => string` |
| `setEstimateAuthScript(next)` | RN → WebView token 갱신 (v1 호환, v2 미사용) | `(next) => string` |
| `buildShim()` | v2 임무 명세 시그니처 alias — 무인자, .env 의 EXPO_PUBLIC_API_BASE_URL 사용 | `() => string` |
| `ESTIMATE_RPC_INVENTORY` | 11 RPC 함수 inventory | `readonly tuple` |
| `EstimateRpcName` | 11 RPC 함수명 union | `type` |

### legacyEstimateSource.ts

| Export | 한국어 Javadoc | 시그니처 |
|---|---|---|
| `LegacyEstimateUriOptions` | URI 옵션 interface (devOverride + userEmail) | `interface` |
| `getLegacyEstimateUri(opts)` | estimate-app v2 진입 URL — query 옵션 포함 | `(opts) => string` |
| `getEstimateAppUrl()` | v2 임무 명세 시그니처 alias — 무인자 default | `() => string` |
| `LEGACY_ESTIMATE_URLS` | dev/prod URL pair | `const` |
| `validateEstimateAppUrl()` | 환경변수 또는 default URL 정상 형태 검증 | `() => {ok, url, source}` |

## 6. UUID 미노출 (`feedback_uuid_no_user_visibility.md`)

- `EstimateWebViewScreen.tsx` 자체 UUID 노출 0.
- shim 의 `X-Samhan-Staff` header 값 = 사번 (e.g. "S001") — UUID 회피.
- estimate-app v2 의 EJS 가 사업자번호/거래처코드/모델명 만 표시 — UUID 없음 (이전 PR #18 회고 반영).

## 7. springdoc-openapi

본 PR 은 RN client 만이며 BE API 변경 0 → springdoc-openapi 변경 없음. RN 측에서는 OpenAPI 미사용
(인증/RPC 모두 WebView 안 legacy 가 처리).

## 8. QA 캡처 3장

| 파일 | 시각 검증 |
|---|---|
| `docs/qa/migration-fe-mobile-staff-v2/01-app-init.png` | SafeAreaView + StatusBar + WebView 로딩 placeholder |
| `docs/qa/migration-fe-mobile-staff-v2/02-app-mobile-ui.png` | legacy mobile-mode UI 활성 (4 카드 1열 stack + 메뉴 toolbar) |
| `docs/qa/migration-fe-mobile-staff-v2/03-app-after-add.png` | 라인 추가 후 (recompute*Derived 자동) |

## 9. 검증

```sh
cd clients/mobile-staff
npm install --legacy-peer-deps  # navigation/zustand/axios/react-query/AsyncStorage 의존성 미설치 확인
npx tsc --noEmit                # 0 error
npx expo-doctor                 # PASS
npx expo export --platform web  # dist/ 생성
node scripts/capture-v2.cjs     # docs/qa/migration-fe-mobile-staff-v2/ 3장 PNG
```

## 10. 모호 항목 (PM 검토 필요)

- Android push notification 통합 — WebView 안 영업직원 알림 routing 흐름 (M3 이후).
- iOS App Store 배포 시 bundleIdentifier 보존 + 인증서 + Apple Sign-In 정책.
- 영업직원 SSO (Google Workspace / Naver Works) 통합 시 `setEstimateAuthScript` 부활 흐름.
- 단일 screen 이므로 RN navigation event (deep link, universal link) 추후 ecosystem.
