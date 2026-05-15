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

## 환경 변수

| 변수 | 용도 |
|---|---|
| `EXPO_PUBLIC_AROLOGIS_API_BASE` | fetch baseURL (예: `https://api.arologis.samhan-air.com`). 미지정 시 `__DEV__` true 면 localhost:8097. |

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
    │   └── arologis.ts     (D-AX-15 dashboard/GPS driver-app API)
    ├── navigation/
    │   └── RootNavigator.tsx
    ├── screens/
    │   ├── PhoneLoginScreen.tsx     (휴대번호만 입력)
    │   ├── DispatchListScreen.tsx   (보존용 skeleton)
    │   ├── GpsPermissionScreen.tsx  (foreground 거부 시 차단 — F7)
    │   └── driver/
    │       ├── DriverTabNavigator.tsx
    │       ├── DriverDashboardScreen.tsx
    │       └── DriverLocationTrackingScreen.tsx
    ├── stores/authStore.ts          (in-memory + listener)
    └── theme/tokens.ts              (RN driver 토큰)
```

## 인증 흐름 (passwordless)

1. PhoneLoginScreen 에서 본인 휴대번호 입력.
2. `POST /auth/driver/login` → 401 시 alert "등록되지 않은 번호입니다. 관리자에게 문의하세요." (사전 등록 admin 필요).
3. 성공 → `setAuth(...)` → RootNavigator 가 `DriverTabNavigator` 로 분기.
4. 401 (만료 토큰) → fetch 인터셉터가 `/auth/refresh` rotation 1회 시도. 실패 시 clearAuth + 로그인 화면.

## D-AX-15 dashboard/GPS 이식

- 추천안 B 기준으로 `DriverDashboardScreen` 과 `DriverLocationTrackingScreen` 만 먼저 이식.
- 하단 2탭: `배차` / `GPS` + 로그아웃.
- API:
  - `GET /driver-app/arologis/dispatches/today`
  - `POST /driver-app/arologis/locations`
- 이번 PR에서 서명/배송사진/검수사진/native photo dependency 는 추가하지 않음.

## GPS 권한 가드 (F7)

- foreground = 의무 (배송 위치 추적). 거부 시 어플 사용 불가 차단 화면 노출.
- background = 선택 (운영 시점 결정).

## UUID 비공개

화면 어디에도 UUID 노출 금지. 사용자 노출 = `driverCode` / `phoneNumber` / dispatch slip 번호 등.

## 후속 슬라이스 (본 PR 외)

- 서명 / sign-and-send-copy 화면 이식.
- 배송사진 / 검수사진 화면 이식.
- 실제 slip 연결값이 배차 응답에 포함되면 아로로지스 모바일 전용 상세 bridge 설계.
- mobile-staff 의 driver tab 제거 + AppRootNavigator 단순화 (estimate WebView 단일 모드).
