# @samhan/mobile-staff — SamhanLogis 영업직원 + 배송기사 (React Native Expo) — v4 (Phase 10 W10-3)

> Phase 6 frontend mobile client (영업직원용 — v2/v3) + Phase 10 W10-3 driver tab (배송기사용 — v4).
> Expo SDK 53. AppRootNavigator 의 `mode='estimate' | 'driver'` 분기 로 두 역할 통합.

## 개요

(주)삼한공조시스템 **영업직원 + 배송기사 통합 어플**. v3 까지 영업직원 단일 화면이었으나, Phase 10 W10-3
(2026-05-07 사용자 결정) 부터 **mobile-staff 내부에 driver tab 통합** (별도 mobile-driver 신규 X).

- **estimate mode** (default — v2/v3 100% 보존)
  영업직원이 estimate-app v2 (Express + EJS 임베드된 legacy estimate 18614 라인) 를 그대로 사용.
  react-native-webview 단일 screen 으로 estimate-app v2 를 모바일 viewport 임베드.
- **driver mode** (Phase 10 W10-3 신규)
  배송기사가 arologis-service (port 8097) 의 driver-app 3 endpoint (today / locations / sign) 를 호출.
  RN native UI — 오늘 배차 / GPS 30초 추적 / 전자서명 + GPS 캡처.

- RN 측은 SafeAreaProvider + StatusBar + WebView wrapper 만 책임.
- 캡처 script 는 estimate-app v2 dev server (port 5183) 에 직접 진입하여 실 화면을 캡처
  (mock HTML overlay 미사용).

## driver tab (Phase 10 W10-3 신규)

> 사용자 결정 (2026-05-07) — `clients/mobile-staff` 내부 driver tab 채택 (별도 mobile-driver 신규 X).

### D-AX-12 slip detail 경계

- `DriverTabNavigator` 는 더 이상 상위 `../SlipDetailScreen` 을 직접 import 하지 않는다.
- driver tab 의 전표 상세 진입은 `src/screens/driver/DriverSlipDetailEntry.tsx` 로 들어간다.
- 현재 배차 응답은 실제 slip 연결값을 제공하지 않으므로 `vehicle-*` placeholder 는 안내 화면으로 처리한다.
- 기존 Samhan Public `SlipDetailScreen` 의 comment / audit / edit-request / SSE 기능은 보존한다.
- 후속 아로로지스 모바일 이식에서 실제 slip bridge 또는 아로로지스 전용 상세 화면으로 확장한다.

### D-AX-15 아로로지스 모바일 dashboard/GPS 선이식

- `clients/arologis-mobile` 이 로그인 후 자체 `DriverTabNavigator` 로 진입한다.
- 이번 PR 범위는 dashboard + GPS 두 탭이며, `mobile-staff` driver mode 는 운영 검증 전까지 보존한다.
- 서명 / 배송사진 / 검수사진 / driver mode 제거는 후속 PR에서 다자선택 후 진행한다.

### 화면 구성

```
AppRootNavigator (mode bar 우상단 토글)
├── mode='estimate' (default) → EstimateWebViewScreen (v2/v3 보존)
└── mode='driver' (W10-3 신규) → DriverTabNavigator
    ├── (GPS 권한 거부 / 미가용) → GpsBlockedScreen (어플 사용 불가)
    └── (GPS OK)
        ├── tab='dashboard'  → DriverDashboardScreen   (오늘 배차 vehicle 목록)
        ├── tab='tracking'   → DriverLocationTrackingScreen (30초 GPS 보고)
        └── tab='signature'  → DriverSignatureScreen   (전자서명 + GPS 캡처)
```

### GPS 권한 정책 (사용자 결정 4 GPS 하이브리드, 2026-05-07)

| 항목 | 정책 |
|---|---|
| **foreground 권한** | **의무** (`expo-location.requestForegroundPermissionsAsync`) |
| **background 권한** | 선택 (`requestBackgroundPermissionsAsync`, graceful) |
| **거부 fallback** | **어플 사용 불가** (`GpsBlockedScreen` 노출, driver tab 진입 차단) |
| **본 PR (W10-3) source** | `APP_GPS_ACTIVE` 만 활성 (인성 LBS 통합은 W10-2 시점) |

### arologis-service 3 endpoint (`src/api/arologis.ts`)

| 함수 | endpoint | 설명 |
|---|---|---|
| `fetchTodayDispatches(token)` | GET `/driver-app/arologis/dispatches/today` | 본인 배정 vehicle 목록 |
| `reportLocation(token, payload)` | POST `/driver-app/arologis/locations` | 30초 주기 GPS 위치 보고 |
| `submitSignature(token, dispatchId, vehicleSeq, stopSeq, payload)` | POST `/driver-app/arologis/dispatches/{id}/vehicles/{seq}/stops/{stopSeq}/sign` | 전자서명 + GPS 동시 등록 |

base URL = `EXPO_PUBLIC_API_BASE_URL` (default `http://localhost:8080` = api-gateway 진입). gateway 가
JWT verify + ROLE_DRIVER 확인 + X-User-* 주입 후 arologis-service 8097 으로 forward.

### theme/tokens.ts — W3+W4+W5+post-W5+W10-1 토큰 1:1 복제 (Designer-2 채택)

`src/theme/tokens.ts` 가 `clients/web/design-system/src/tokens/tokens.css` 의 RGB 값을 1:1 복제:
- post-W5 surface / ink / line / action / state (sales-form-polish-slice)
- W3 dashboard — Google Material method + status badge (ok/warn/info/new)
- W4 notification — 3 channel badge (push/email/sms)
- post-W5 D-W5-2 — slice accent (success/pending/deferred)
- W10-1 — unparsed peach (b-unparsed)

`badgeStyle(kind)` 헬퍼 = RN inline style 객체 반환 (CSS class `b-channel-push` / `slice-accent-success`
1:1 매핑).

### Pretendard self-host (Designer-2 채택)

- jsdelivr CDN 회피 + 정식 도입 (`assets/fonts/Pretendard-*.otf` 4 weight).
- `app.json` `plugins.expo-font` 정식 등록.
- `usePretendardFontGuarded()` = useFonts hook 정식 활성 + try/catch graceful (asset 미배치 환경 RN UI 미차단).

## 주요 화면 캡처 매핑

`docs/qa/legacy-original/estimate/` 의 직접 캡처 3장이 v3 캡처의 기준:

| v3 캡처 | 화면 내용 |
|---|---|
| `01-staff-app-init.png` | 전표작성 거래처 form (거래처 / 대표자 / 대표번호 / 사업자주소 / 거래처분류 / 특이사항 / 출고일 / 출고창고 + 하단 버튼 4개) |
| `02-staff-app-page-menu.png` | 페이지 메뉴 dropdown (전표작성 / 홈멀티 / 싱글세트 / 상업멀티 / 구형 / 견적서(기본) / 견적서(세트상세) / 전표업로드목록 / 장비스펙 / 발송내역 / 견적저장 / 저장내역 / 다크모드 + 자동 로그아웃 + 닫기) |
| `03-staff-app-card-line.png` | 홈멀티 카테고리 진입 후 라인 grid (품목명 / 모델명 / 수량 / 납품가 + 좌측 옵션 tab + 우측 필터 tab + 하단 검색/조합비/초기화) |

## 디렉토리 구조

```
clients/mobile-staff/
├── package.json (Expo SDK 53 + react-native-webview + react-native-safe-area-context, v0.3.0)
├── app.json (name "삼한공조 견적", bundleId com.samhan.estimate, v0.3.0)
├── tsconfig.json
├── babel.config.js
├── App.tsx (단일 SafeAreaProvider + StatusBar + EstimateWebViewScreen)
├── .env.example (EXPO_PUBLIC_ESTIMATE_APP_URL + EXPO_PUBLIC_API_BASE_URL)
├── src/
│   ├── screens/
│   │   └── EstimateWebViewScreen.tsx — 단일 WebView + RN 뒤로가기 + status bar
│   └── webview/
│       ├── legacyEstimateShim.ts (X-Samhan-Staff header 보존)
│       └── legacyEstimateSource.ts (dev:5183 / prod:estimate.samhan-air.com + override + validate)
├── scripts/
│   └── capture-v3.cjs (Playwright 3 캡처 — 실 dev server 직접 진입)
└── README.md
```

## 인증 흐름

```
[App 시작]
  ↓
[App.tsx → SafeAreaProvider → EstimateWebViewScreen]
  ↓
[WebView source = estimate.samhan-air.com / localhost:5183]
  ↓
[shim 사전 주입 (X-Samhan-Staff header 안전망 only — default 무인증)]
  ↓
[WebView 안 legacy estimate index.ejs 실행]
  ↓
[lib/code.js 의 checkUserAuth(USER_EMAIL) 자동 호출 — Apps Script Code.js line 16495 1:1]
  ↓
[iam-service GET /api/v1/auth/me?email= (mock fallback) → 영업직원 식별]
  ↓
[token 은 WebView 안 cookie / sessionStorage 에 저장 — RN 미관여]
  ↓
[견적 작성 RPC 11종 — 모두 WebView 안 inline google.script.run shim 가 처리]
```

→ RN 측 인증 코드 0줄. shim 의 `X-Samhan-Staff` header 첨부는 후속 (RN push notification + SSO 통합) 을
   위한 안전망으로만 보존 (default = `token=null, employeeCode=null`).

## legacy mobile UI 자동 활성

estimate-app v2 의 views/index.ejs 가 line 7187 에서:

```js
document.body.classList.toggle('mobile-mode', isMobile);
```

react-native-webview 의 device width (iPhone 14 Pro = 390, Galaxy S22 = 360) → 자동 활성.

→ 4 카드 grid (홈멀티/싱글세트/상업멀티/구형) 가 1열 stack 으로 자동 변환.
→ `.mobile-only` class 의 desktop 숨김 컬럼들이 자동 노출 (품목명, 모델 상세 등).
→ `#handleTop` (▼ 페이지 메뉴) drawer 가 활성 — 모바일 전용 메뉴 진입점.
→ `#handleLeft` (옵션) / `#handleRight` (필터) drawer 가 카테고리 진입 시 측면 sidebar 로 노출.

mobile-staff v3 의 RN wrapper 는 viewport 만 제공. mobile UI 활성은 100% legacy estimate 자체 책임.

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

# capture (PM 의 estimate-app v2 dev server 가 port 5183 에서 가동 중 필수)
curl http://localhost:5183/healthz   # 200 = 가동 중
npm run capture:v3                    # node scripts/capture-v3.cjs
```

→ `docs/qa/migration-fe-mobile-staff-v3/` 에 3장 PNG 생성.

dev server 미가동 시 capture script 가 abort + 안내 출력:

```
[abort] estimate-app v2 dev server 미가동: http://localhost:5183/healthz 응답 없음.
        먼저 다음 명령으로 dev server 를 시작하세요:
        cd c:/dev/SamhanLogis/clients/web/estimate-app && node server.js
```

## QA 캡처 3장

| 파일 | 설명 |
|---|---|
| `01-staff-app-init.png` | 진입 직후 — 전표작성 거래처 form (mobile-mode default) |
| `02-staff-app-page-menu.png` | 페이지 메뉴 dropdown 활성 (13 메뉴 + 자동 로그아웃 + 닫기) |
| `03-staff-app-card-line.png` | 홈멀티 카테고리 진입 후 라인 grid (옵션·필터 sidebar) |

Phase 7 추가: `qa/detox/e2e/mobile-staff/` 의 3 시나리오 (`estimate-form` /
`line-grid` / `confirm`) 가 본 client 의 iOS sim 빌드에 대해 자동 검증한다.

## RN 뒤로가기

- Android = `BackHandler.addEventListener('hardwareBackPress')` 가 WebView 의 `canGoBack` state 확인.
  - history 있음 → `webview.goBack()` 우선 (event consumed).
  - history 끝 → default (앱 종료).
- iOS = native swipe-back gesture 는 single screen 이므로 미적용 (기본 OS 흐름).

## 후속 (모호 항목)

- Android push notification → WebView 안 영업직원 알림 routing 통합.
- iOS App Store 배포 시 `bundleIdentifier` / 인증서 / Apple sign-in 정책.
- 영업직원 SSO (Google Workspace / Naver Works) → shim 의 `setEstimateAuthScript` 부활 가능성.
- DEVOPS — `https://estimate.samhan-air.com` Render production 배포 (Phase 7 6차 cutover 예정).

## 참고

- Mobile v4 (`clients/mobile`, 거래처용 — order-app v4 WebView) 와 분리.
- 직접 캡처 원본: `docs/qa/legacy-original/estimate/`.

## Phase F — DriverSignatureScreen 1-tap + Share Sheet (2026-05-15)

[D-DF-07/12/13](../../migration/decisions/DECISIONS.md#d-df-00) 적용 — 기사 어플 정차 도착 → DELIVERY 사진 첨부 → 자체+인수자 서명 캡처 → arologis-service 가 양쪽 저장 + PNG 사본 합성 → mobile expo-sharing 으로 인수자 카톡/SMS 발송 (기사 본인 발신, Aligo 0).

### 흐름 (W10-4 deep link 활성)

```
[정차 도착] DriverDashboardScreen
  ↓ "배송 사진 + 서명" 탭
[SignaturePhotoScreen]  (D-DF-13 — 1MB 압축, 최대 3장)
  → onUploaded callback
  ↓ navigation.replace('DriverSignature')
[DriverSignatureScreen] (D-DF-07/12 — 1-tap)
  → 자체 서명 + 인수자 서명 캡처
  → btn-complete-and-share 1-tap
    ↓ POST /sign-and-send-copy
  → image/png 응답 (성공) → expo-file-system 임시 저장 → expo-sharing.shareAsync (Share Sheet)
  → application/json {copyFailureReason} 응답 (실패) → toast + btn-retry-copy
  → 409 duplicate → toast "이미 발송됨"
```

### 신규 의존성 (`package.json`)

| 패키지 | 용도 |
|---|---|
| `expo-sharing` | OS Share Sheet 호출 (카톡/SMS/메시지 선택) |
| `expo-file-system` | base64 PNG → 임시 파일 (Share Sheet 입력) |
| `base-64` | base64 인코딩 헬퍼 |
| `jest` + `@types/jest` + `jest-expo` | 단위 시나리오 (RN environment) |

### 5 토스트 분기 (D-DF-07)

| 상태 | 토스트 | 재시도 버튼 |
|---|---|---|
| 성공 | `010-****-5678 에게 보내세요` (마스킹) | X |
| RECIPIENT_PHONE_MISSING | `인수자 번호 미등록 — Admin 재발송 요청` | X |
| RENDERER_TIMEOUT | `사본 합성 실패 (RENDERER_TIMEOUT)` | O |
| RENDERER_ERROR / STORAGE_FULL | `사본 합성 실패 — 잠시 후 재시도` | O |
| 409 duplicate | `이미 발송됨 (YYYY-MM-DD HH:mm)` | X |

### Jest

```bash
npx jest --testPathPattern='driver/(DriverSignatureScreen|SignaturePhotoScreenChain)'
# 7 PASS / 0 fail (success/skip/timeout/duplicate/bridge/disabled + chain)
```
