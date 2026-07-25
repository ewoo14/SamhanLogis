# arologis-mobile

> 아로로지스 기사 어플 (RN Expo SDK 53).
> Samhan Public 의 `clients/mobile-staff` 의 driver tab 을 분리 독립 (D-AX-03 / D-AX-09).

---

## 빌드

```bash
cd clients/arologis-mobile
npm install
npx expo prebuild --no-install       # ios/android native 프로젝트 생성 (smoke check)
eas build --profile preview --platform android
```

preview/production은 `BUILD_ENV`가 릴리스 모드로 동작하므로 `EXPO_PUBLIC_APP_VERSION`을
반드시 `YYYY/MM/DD-번호` 형식으로 주입해야 합니다. 누락하면 `0.1.0-dev` sentinel 대신
app.config 단계에서 실패합니다.

```powershell
$env:EXPO_PUBLIC_APP_VERSION = '2026/07/25-91003'
eas build --profile production --platform android
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `EXPO_PUBLIC_AROLOGIS_API_BASE` | `http://localhost:8097` (`__DEV__` true 시) | fetch baseURL. 운영 빌드 예시: `https://api.arologis.samhan-air.com`. |

## Pretendard 폰트 self-host

`assets/fonts/` 에 OTF 4 weight 가 포함되어 있습니다 (mobile-staff 패턴 일관).

| 파일 | weight |
|---|---|
| `Pretendard-Regular.otf` | 400 |
| `Pretendard-Medium.otf` | 500 |
| `Pretendard-SemiBold.otf` | 600 |
| `Pretendard-Bold.otf` | 700 |

`src/theme/usePretendardFontGuarded.ts` 의 `usePretendardFontGuarded()` hook 이 `expo-font` 로 4 weight 를 로드합니다.
폰트 로딩 완료 전에는 `App.tsx` 가 `SafeAreaProvider + StatusBar` 만 렌더링 (SplashScreen 대체).
`expo-font` 미설치 또는 asset 누락 시 graceful guard 로 `fontsReady = true` 처리하여 RN UI 를 차단하지 않습니다.

RN family 이름은 `Pretendard` (단일 family, weight 는 `fontWeight` prop 으로 분기).

## 디렉토리 구조

```
clients/arologis-mobile/
├── app.json                (bundleIdentifier: com.samhanair.arologis.driver)
├── eas.json                (development / preview / production)
├── App.tsx                 (SafeAreaProvider + StatusBar + RootNavigator)
├── package.json            (@samhan/arologis-mobile)
├── tsconfig.json
└── src/
    ├── api/
    │   ├── client.ts       (fetch 래퍼 + 401 자동 refresh)
    │   ├── auth.ts         (POST /auth/driver/login passwordless)
    │   └── arologis.ts     (D-AX-15 dashboard/GPS + D-AX-16 sign-and-send-copy API)
    ├── navigation/
    │   └── RootNavigator.tsx
    ├── screens/
    │   ├── PhoneLoginScreen.tsx     (휴대번호만 입력)
    │   ├── DispatchListScreen.tsx   (보존용 skeleton)
    │   ├── GpsPermissionScreen.tsx  (foreground 거부 시 차단 — F7)
    │   └── driver/
    │       ├── DriverTabNavigator.tsx
    │       ├── DriverDashboardScreen.tsx
    │       ├── DriverLocationTrackingScreen.tsx
    │       └── DriverSignatureScreen.tsx
    ├── stores/authStore.ts          (in-memory + listener)
    └── theme/tokens.ts              (RN driver 토큰)
```

## 인증 흐름 (passwordless)

1. PhoneLoginScreen 에서 본인 휴대번호 입력.
2. `POST /auth/driver/login` → 401 시 alert "등록되지 않은 번호입니다. 관리자에게 문의하세요." (사전 등록 admin 필요).
3. 성공 → `setAuth(...)` → RootNavigator 가 `DriverTabNavigator` 로 분기.
4. 401 (만료 토큰) → fetch 인터셉터가 `/auth/refresh` rotation 1회 시도. 실패 시 clearAuth + 로그인 화면.

## D-AX-15/16 driver runtime 이식

- D-AX-15: 추천안 B 기준으로 `DriverDashboardScreen` 과 `DriverLocationTrackingScreen` 먼저 이식.
- D-AX-16: 추천안 1 기준으로 `DriverSignatureScreen` + sign-and-send-copy 1-tap 흐름 이식.
- 하단 3탭: `배차` / `GPS` / `서명` + 로그아웃.
- API:
  - `GET /driver-app/arologis/dispatches/today`
  - `POST /driver-app/arologis/locations`
  - `POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy`
- 서명 흐름:
  - 배차 카드에서 실제 정차를 선택해야 서명 target 이 설정된다.
  - `react-native-signature-canvas` 로 기사/인수자 실제 서명을 캡처하고 data URL prefix 는 제거해 전송한다.
  - 기사 서명 시점 GPS 1회 캡처.
  - 기사 + 인수자 서명 후 `image/png` 응답을 cache 파일로 저장하고 `expo-sharing` Share Sheet 로 전달.
  - 409 duplicate / 422 bridge fail / `RECIPIENT_PHONE_MISSING` / renderer fail 분기를 화면 toast 로 표시.

## GPS 권한 가드 (F7)

- foreground = 의무 (배송 위치 추적). 거부 시 어플 사용 불가 차단 화면 노출.
- background = 선택 (운영 시점 결정).

## UUID 비공개

화면과 driver-facing API 어디에도 UUID 노출 금지. D-AX-16 은 `dispatchType` / `vehicleSequence` / `stopSequence` / 카톡 순번으로 today target 을 좁히고, 서버가 내부 `dispatchId` 를 해석한다. 사용자 노출 = `driverCode` / `phoneNumber` / 차량 순번 / 정차 순번 / 카톡 순번 등.

## E2E (Detox Android)

아로로지스 기사 어플의 E2E 시나리오는 `qa/detox` 중앙 패키지에서 관리됩니다 (`mobile-staff` / `mobile-v4` 와 동일 패턴).

### 사전 조건

- Node 20+, Java 17, Android Studio
- AVD: `Pixel_6_API_34` (Android 14) — Android Studio AVD Manager 에서 생성
- `npx expo prebuild -p android --clean` 으로 `clients/arologis-mobile/android/` 생성 필요

### 실행 방법

```bash
cd qa/detox
npm install

# 빌드 (첫 실행 또는 네이티브 변경 후)
npm run detox-build:arologis

# 스모크 테스트 실행
npm run detox-test:arologis

# debug 빌드 (개발 중 핫리로드 확인)
npm run detox-build:arologis-debug
npm run detox-test:arologis-debug
```

### 시나리오 (`qa/detox/e2e/arologis-mobile/smoke.test.ts`)

| 시나리오 | 검증 항목 |
|---|---|
| 앱 부팅 → 로그인 화면 | heading "아로로지스 기사" 텍스트 가시성 (Pretendard 폰트 로드 완료 포함) |
| 수동 입력 카드 노출 | `phone-input` / `phone-submit` testID 가시성 (READ_PHONE_NUMBERS 권한 미부여 fallback) |
| 빈 번호 제출 방어 | Alert "휴대번호를 입력해 주세요." 노출 |

### CI

`.github/workflows/qa-e2e.yml` 의 `detox-android-arologis` job 이 `macos-latest` runner 에서 자동 실행됩니다.
현재는 typecheck + Detox config 검증까지만 수행하며, 실 AVD 구동은 후속 빌드 PR 에서 enable 됩니다.

### AVD 이름 변경

로컬 AVD 이름이 `Pixel_6_API_34` 와 다르면 `qa/detox/.detoxrc.js` 의 `arologisEmulator.device.avdName` 을 수정하세요.

## 후속 슬라이스 (본 PR 외)

- 배송사진 / 검수사진 화면 이식.
- 실제 slip 연결값이 배차 응답에 포함되면 아로로지스 모바일 전용 상세 bridge 설계.
- mobile-staff 의 driver tab 제거 + AppRootNavigator 단순화 (estimate WebView 단일 모드).
