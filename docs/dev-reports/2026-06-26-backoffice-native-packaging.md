# 백오피스 네이티브 패키징 N1 — Capacitor 파운데이션

## 범위

2026-06-26 PR #627 범위는 desktop 백오피스 renderer 를 Capacitor Android 네이티브 셸로 감싸기 위한 N1 파운데이션이다. Electron/PWA/dev renderer 동작은 유지하고, Capacitor 전용 웹 산출물과 native 인증 분기를 추가한다.

## 단계 분해

| phase | 범위 | 상태 |
|---|---|---|
| N1 | Capacitor 설정, Android 스캐폴드, `dist/capacitor`, Bearer 인증 provider, 무회귀 검증 | 본 작업 |
| N2 | HTTPS/LAN 실연동, iOS 스캐폴드(Mac 필요), 실기기 인증 검증 | 후속 |
| N3 | FCM 네이티브 푸시와 notification-service 디바이스 토큰 등록 | 후속 |
| N4 | 생체인증, secure storage 승격, 카메라 바코드/QR 스캔 | 후속 |
| N5 | 서명, 스토어/MDM 배포, CI 네이티브 빌드 | 후속 |

## N2 BLOCKING 체크리스트

🚨 N2 BLOCKING 체크리스트: ① `cleartext:true` 제거 ② Android Network Security Config HTTPS-only 적용 ③ 예제 테스트(이미 본 PR서 삭제)

## 구현 요약

- `capacitor.config.ts`: `com.samhanair.backoffice`, `삼한 백오피스`, `webDir='dist/capacitor'`, 개발용 cleartext 허용을 명시했다.
- `vite.capacitor.config.ts`: PWA web config 를 미러하되 `VitePWA`를 제거하고 `base:''`, `VITE_PLATFORM='capacitor'`, `outDir='dist/capacitor'`로 분리했다.
- `capacitorAuthProvider`: Electron Bearer 흐름을 미러하고 저장소만 `@capacitor/preferences`로 교체했다.
- `authProvider.ts`: 플랫폼 선택 우선순위를 Electron → Capacitor → Web 으로 확장했다.
- `api/client.ts`: native(Electron/Capacitor)는 쿠키를 쓰지 않도록 `withCredentials=false`, 401 리다이렉트는 HashRouter `#/login`으로 통일했다.
- `.gitignore`: Android/Capacitor 빌드 산출물과 sync 된 public asset 을 제외했다.

## 인증 전략

웹/PWA는 httpOnly 쿠키가 맞지만, Capacitor WebView origin(`capacitor://localhost`)에서는 api-gateway(`http://localhost:8080` 또는 HTTPS gateway)로 쿠키 전달이 안정적이지 않다. 따라서 Capacitor는 Electron이 검증해 온 Bearer 토큰 경로를 재사용한다. 원시 토큰은 session store/UI에 노출하지 않고 provider 내부 snapshot 에만 보관한다.

## dist 분리

`dist/web`은 PWA 전용으로 service worker와 manifest 를 포함한다. `dist/capacitor`는 native 전용으로 service worker 를 포함하지 않는다. 이 분리로 WebView 내부 캐시 간섭, `capacitor://localhost` 절대경로 문제, PWA runtime caching 정책 충돌을 피한다.

## 무회귀 기준

- Electron: `npm run build` green.
- PWA web: `npm run build:web` green, `sw.js` 생성 유지.
- Capacitor: `npm run build:capacitor` green, `sw.js`/`workbox-*` 미생성.
- API/auth 단위 테스트: Capacitor Bearer 저장/복원/클리어와 native 401 hash redirect 를 검증한다.
- TypeScript: `tsconfig.node.json`에 Capacitor/Vite config 를 포함해 typecheck 대상에 편입했다.

## 정직한 deferral

N1은 스캐폴드와 sync 검증까지다. Android SDK가 없는 환경에서는 `./gradlew assembleDebug` APK 빌드는 수행할 수 없으며, 성공으로 보고하지 않는다. iOS, 스토어 배포, 네이티브 푸시, secure storage, 생체인증/스캔은 N2~N5에서 별도 설계와 검증이 필요하다.

## 교훈

PWA와 native는 같은 renderer 를 공유하더라도 배포 runtime 의 인증·캐시 조건이 다르다. 빌드 산출물을 분리하고 authProvider 추상화 뒤에 플랫폼별 인증 정책을 둔 것이 Electron/web 무회귀를 유지하는 가장 작은 변경이었다.
