# 네이티브 iOS + FCM 푸시 실연동 준비 (N3) — 설계 (spec)

> 2026-06-27 개발책임자 "iOS fcm 실연동 준비". **infra-now**: 코드·스키마·설정 완전구현 + 로컬 검증, **실 발송=Firebase·실 iOS 빌드=Mac/APNs 게이트**(가짜 완료 금지).

## 0. 컨텍스트 (recon)
- **notification-service**: `FcmPushAdapter`(Phase10 stub — credentials=CHANGE_ME_LOCAL_ONLY면 stub success), `NotificationGateway`(PUSH/EMAIL/SMS 전략), `/internal/notifications/send`(X-Internal-Token), `NotificationService`/`NotificationLog`, `notification_center` 테이블. **🔴 디바이스 토큰 등록 API/테이블 미존재**(핵심 신규).
- **desktop Capacitor 앱**(N1~생체인증 머지): `@capacitor/push-notifications` 미설치. capacitor.config iOS 미설정, `ios/` 폴더 미존재.
- 외부 게이트: Firebase 프로젝트·google-services.json·GoogleService-Info.plist·APNs 인증서 = 전부 미확보.

## 1. 목표 (N3)
FCM 푸시 실연동의 **코드/스키마/설정을 완전 구축**(디바이스 토큰 등록·저장·발송 배선 + 클라이언트 푸시 등록) + iOS 빌드 준비(설정·docs). 실 발송·실 iOS 빌드는 외부 리소스(Firebase/Mac/APNs) 확보 시 즉시 활성.

## 2. 슬라이스
### N3a — 백엔드 (디바이스 토큰 + FCM 발송 실연동)
- **`push_device_tokens` 테이블**(Flyway, notification-service): `user_id UUID`·`token VARCHAR`·`platform`(ANDROID/IOS/WEB CHECK)·`app_client`(DESKTOP/MOBILE...)·`last_seen_at`·BaseEntity 7 audit + soft delete. UNIQUE(token) active.
- **토큰 등록/해제 API**: `POST /api/v1/push-tokens`(인증 user-context, 토큰 upsert)·`DELETE /api/v1/push-tokens/{token}`(로그아웃·기기변경). 게이트웨이 인증 라우트.
- **FcmPushAdapter 실 SDK 통합**: Firebase Admin SDK(google-services/credentials) — **credentials placeholder면 기존 stub success 유지**(게이트), 실 자격 주입 시 실 FCM 발송. `FcmProperties` 확장(credentialsBase64/path).
- **PUSH 발송 배선**: NotificationService 가 PUSH 채널·recipient=USER 시 `push_device_tokens` 에서 user 토큰 조회 → 토큰별 발송(다기기). NotificationLog 토큰별 attempt.
- **Testcontainers IT**: 토큰 등록 upsert·중복·조회·발송(stub) 멱등. fresh probe(마이그). 인증(401 미인증).

### N3b — FE (Capacitor push 등록 + iOS 준비)
- `@capacitor/push-notifications` 설치(Capacitor 8) + `capacitor.config.ts` `plugins.PushNotifications`(presentationOptions) + **iOS 설정**(ios appId/scheme).
- **푸시 등록 모듈**(Capacitor 전용, 동적 import·플랫폼 가드): 로그인 후 `requestPermissions()`→`register()`→토큰 수신 리스너→`POST /api/v1/push-tokens`. 로그아웃 시 `DELETE`. 수신 리스너(`pushNotificationReceived`/`pushNotificationActionPerformed`→deeplink 라우팅). 단위테스트(플러그인 mock).
- **iOS 빌드 준비**: capacitor.config iOS + **`docs/dev-reports` iOS 빌드 가이드**(Mac 에서 `cap add ios`→`GoogleService-Info.plist`→APNs→Xcode). Android `google-services.json` 주입 위치(android/app/, gitignore) 문서화.

## 3. 외부 게이트 (정직)
- 실 FCM 발송 = **Firebase 프로젝트 + google-services.json/Admin credentials**(현 stub). iOS 빌드/APNs = **Mac/Apple Developer 인증서**(Windows cap add ios 불가). 모바일 실설치 = **Phase11 prod HTTPS**.
- 자격 평문 금지(GitGuardian·credential-plaintext-guard, google-services.json gitignore).

## 4. QA
- N3a: Testcontainers IT(토큰 CRUD·발송 stub·멱등·인증) + **실서버 라이브 QA**(실 로그인→POST /push-tokens 실 HTTP→DB 적재, dev_master 복구됨).
- N3b: 단위테스트(push 등록 mock)·`build:capacitor`/build:web/electron 무회귀·Playwright mock. iOS=docs(빌드 게이트).

## 5. 워크플로우
canonical 슬라이스별: spec→조기PR→Codex 구현(danger-full-access)→④Opus(BE/FE/QA)+fix↔⑤Codex 0수렴→⑥PM→실서버/로컬 QA→CI green→PM 머지. fix 재수렴. N3a 먼저(N3b 가 등록 API 의존).
