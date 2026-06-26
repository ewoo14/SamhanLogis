# 네이티브 iOS + FCM 푸시 빌드 가이드 (N3b)

> 본 문서는 `clients/desktop` Capacitor 네이티브 푸시 등록을 실제 기기에서 활성화하기 위한 운영 절차다.
> Firebase/APNs 자격 파일은 절대 커밋하지 않는다.

## 현재 코드 상태

- Capacitor 설정: `clients/desktop/capacitor.config.ts`
  - `plugins.PushNotifications.presentationOptions = ['badge', 'sound', 'alert']`
  - `ios.contentInset = 'automatic'`
  - `ios.scheme = 'SamhanPublic'`
- FE 등록 흐름:
  - 로그인 성공 후 Capacitor 런타임에서 `PushNotifications.requestPermissions()`
  - 권한 `granted` 시 `PushNotifications.register()`
  - `registration` 이벤트의 FCM/APNs registration token 을 `POST /api/v1/push-tokens` 로 등록
  - 로그아웃 시 마지막 token 을 `DELETE /api/v1/push-tokens/{token}` 로 해제
- Electron/PWA 브라우저 런타임은 no-op 이다.

## iOS 준비 (Mac 게이트)

Windows에서는 iOS native project 생성과 Xcode 빌드가 불가하다. Mac에서만 아래 절차를 진행한다.

```bash
cd clients/desktop
npm ci
npm run build:capacitor
npx cap add ios
npx cap sync ios
npx cap open ios
```

1. Firebase Console에서 iOS 앱을 등록한다.
   - Bundle ID는 Capacitor `appId`와 동일하게 `com.samhanair.backoffice` 사용.
2. `GoogleService-Info.plist`를 다운로드한다.
3. 파일을 `clients/desktop/ios/App/App/GoogleService-Info.plist`에 배치한다.
4. Xcode에서 Runner/App target의 Signing Team을 Apple Developer 계정으로 설정한다.
5. Xcode Capabilities에서 Push Notifications를 켠다.
6. Background Modes가 필요한 정책이면 Remote notifications를 켠다.
7. Firebase Cloud Messaging 설정에 APNs 인증서 또는 APNs Auth Key를 등록한다.
8. 실제 iPhone에서 실행해 권한 프롬프트, registration token 수신, 서버 `push_device_tokens` 적재를 확인한다.

## Android 준비

```bash
cd clients/desktop
npm ci
npm run build:capacitor
npx cap sync android
```

1. Firebase Console에서 Android 앱을 등록한다.
   - Package name은 `com.samhanair.backoffice` 사용.
2. `google-services.json`을 다운로드한다.
3. 파일을 `clients/desktop/android/app/google-services.json`에 배치한다.
4. Android Studio에서 동기화 후 실제 기기 또는 에뮬레이터에서 권한/토큰 등록을 확인한다.

## 자격 파일 커밋 금지

루트 `.gitignore`에 아래 경로가 등록되어 있어야 한다.

```gitignore
clients/desktop/android/app/google-services.json
clients/desktop/ios/App/GoogleService-Info.plist
clients/desktop/ios/App/App/GoogleService-Info.plist
```

평문 자격 파일은 PR, 이슈, 문서 본문에도 붙이지 않는다. Firebase Admin SDK credentials는 백엔드 운영 환경변수 또는 secret manager로만 주입한다.

## 게이트

- iOS native 생성과 Xcode 빌드: Mac/Xcode/Apple Developer 계정 필요.
- 실 FCM 발송: Firebase 프로젝트, Android/iOS 앱 등록, APNs 인증 필요.
- 모바일 실설치 운영 검증: Phase11 production HTTPS 환경 필요.
