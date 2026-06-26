# 백오피스 네이티브 패키징 (Capacitor) — Native Phase 1 (스캐폴드 파운데이션) 설계 (spec)

> 2026-06-26 개발책임자 "네이티브 패키징 진행" + "PM 자동 진행". PWA Phase1(PR #624) 후속.
> **목적(개발책임자 Q1, 4종 전부)**: ① 관리형/앱스토어 배포 ② 네이티브 푸시(FCM) ③ 네이티브 디바이스 기능(생체인증/스캔) ④ 태블릿 현장 폼팩터.
> **빌드 환경(개발책임자 Q2)**: 미확보 → **스캐폴드 우선**(실 스토어 배포 후속).
> **플랫폼(개발책임자 2026-06-26)**: iOS·Android **모두 최종 빌드 예정**, **Android 우선** → N1 = Android 스캐폴드, iOS = N2(Mac 확보 시).

## 0. 단계 분해 (큰 에픽 → sub-project)
목적 4종 전부 = 다단계 에픽. 단일 spec 부적합 → 분해. **본 spec = Native Phase 1만.**

| Phase | 범위 | 의존 |
|---|---|---|
| **N1 (본 spec)** | Capacitor 도입 + **Android 스캐폴드** + `dist/web` 래핑 + `capacitorAuthProvider` + 무회귀 | 없음 |
| N2 | 백엔드 연동 + 인증 실검증(LAN/임시 또는 HTTPS) + **iOS 스캐폴드**(Mac 확보 시) | Phase11 또는 임시 HTTPS·Mac |
| N3 | 네이티브 푸시 (FCM + notification-service 디바이스 토큰 등록 엔드포인트) | N2 |
| N4 | 디바이스 기능 (생체인증 로그인·카메라 바코드/QR 스캔) | N2 |
| N5 | 스토어/MDM 배포 (서명·Apple/Google 계정·CI 빌드) | 빌드 env·계정 |

## 1. 목표 + 범위 (Phase 1)
desktop 백오피스 renderer 웹 빌드(`clients/desktop/dist/web`)를 **Capacitor 네이티브 셸로 래핑**하는 파운데이션. "one renderer, multiple targets"(Electron · PWA-web · **Capacitor-native**) 패턴 확장. **Electron·PWA-web·dev/mock 전부 무회귀.**

**산출**: Capacitor 설정 + Android 네이티브 프로젝트 스캐폴드 + Capacitor 인증 provider + 빌드 스크립트 + 문서.
**비범위(정직)**: 실 APK/IPA 빌드·에뮬 실행·스토어 배포 = 빌드 env 미확보로 후속(가짜 빌드 주장 금지).

## 2. 접근법 (대안 검토)
- **(채택) Capacitor가 기존 `dist/web` 래핑 — `clients/desktop` 내부**: 렌더러·authProvider·design-system 100% 재사용, 최소 신규. 추천.
- (반려) 별도 `clients/backoffice-native` 신규 클라이언트: 렌더러 중복·동기화 부담.
- (반려) React Native 재작성: 16라우트 백오피스 전면 재구현 — 비용 과대·웹 자산 폐기.
- (반려) PWA-only 유지: 개발책임자가 네이티브 명시(앱스토어/FCM/생체인증은 PWA로 불가·iOS 제약).

## 3. 아키텍처
- `clients/desktop/capacitor.config.ts`: `appId='com.samhanair.backoffice'`, `appName='삼한 백오피스'`, `webDir='dist/capacitor'`, server(개발 cleartext 허용 + `VITE_API_BASE_URL` 구성가능 — 실기기는 HTTPS 게이트웨이[Phase11/N2]).
- `clients/desktop/vite.capacitor.config.ts` (4번째 config): web config 미러 + `VITE_PLATFORM='capacitor'` + **service worker 미주입**(네이티브 WebView는 `capacitor://localhost` 자체 서빙 → SW 불요·간섭 위험; dev stub처럼 PWA 비활성). `build:capacitor` npm 스크립트 → **`dist/capacitor` 산출(PWA `dist/web`와 분리 — SW 충돌 방지)**.
- 네이티브 프로젝트: `npx cap add android` → `clients/desktop/android/`(커밋). `npx cap sync android`로 웹 자산 복사.
- iOS = N2(Mac/CocoaPods 필요, Windows 생성 불가).

## 4. 인증 (`capacitorAuthProvider`)
기존 `authProvider.ts` 추상화 확장(현 3분기: Electron IPC / Web 쿠키). Capacitor WebView origin = `capacitor://localhost` → :8080 게이트웨이로 **httpOnly 쿠키 cross-origin 전달 차단**(특히 iOS WKWebView 3rd-party 쿠키) → 웹 쿠키 경로 부적합.
→ **Electron 경로(Bearer) 미러**: 로그인 응답 토큰을 `@capacitor/preferences`(추후 N4 secure-storage 승격)에 저장 → `Authorization: Bearer` 헤더. **백엔드 무변경**(Bearer는 Electron이 이미 사용 = 검증된 경로). 플랫폼 감지 = `Capacitor.isNativePlatform()`. 감지 우선순위: Electron(`window.samhanAuth`) → Capacitor(`Capacitor.isNativePlatform`) → Web(쿠키).

## 5. 컴포넌트 (유닛)
1. Capacitor deps(`@capacitor/core`·`@capacitor/cli`·`@capacitor/android`·`@capacitor/preferences`) — clients/desktop package.json.
2. `capacitor.config.ts`.
3. `vite.capacitor.config.ts` + `build:capacitor` 스크립트.
4. `capacitorAuthProvider`(authProvider.ts 분기 확장) + 플랫폼 감지.
5. `android/` 네이티브 스캐폴드.
6. 문서: desktop README "네이티브 패키징" 섹션 + `docs/dev-reports/2026-06-26-backoffice-native-packaging.md`(단계 로드맵·인증·제약).

## 6. 테스트 / QA
- `npm run build:capacitor` 웹자산 산출 + `npx cap sync android` 성공(자산 복사) + `npm run typecheck` 0.
- **🚨 무회귀(핵심)**: Electron 빌드(`build`)·PWA-web 빌드(`build:web` 실 SW)·dev/mock(**mock 회귀 hard gate**) 그대로 green. SW는 web config 한정 → capacitor config 미주입 검증.
- **네이티브 APK 빌드/에뮬 = Phase 1 비범위**(Android SDK 미확보 → 빌드 env 확보 후, 정직 보고).

## 7. 🚫 비범위 (YAGNI / 후속 phase)
- iOS 스캐폴드·빌드(N2) · 네이티브 푸시(N3) · 생체인증·스캔(N4) · 스토어/MDM 배포(N5).
- 실 백엔드 연동 검증(N2, Phase11 의존) · 오프라인 데이터/쓰기.

## 8. 워크플로우
canonical 8단계: spec → plan → 조기 PR → Codex 구현 → ④Opus 5차원+fix+QA ↔ ⑤Codex 0수렴 → ⑥PM종합 → ⑦CI green(mock 회귀 hard gate=무회귀 보증) → ⑧PM 자율머지 → 핸드오프.
- **실행 분담**: PM이 네이티브 스캐폴드 생성(npm install·`cap add` — 네트워크/네이티브 도구 필요, Codex 샌드박스 제약 회피) 대행, Codex는 config/provider/문서 코드.
- 라이브 QA = 로컬 웹빌드 + `cap sync` + 무회귀(네이티브 빌드 정직 deferral 명시).
- 매 단계 ScheduleWakeup 자각.
