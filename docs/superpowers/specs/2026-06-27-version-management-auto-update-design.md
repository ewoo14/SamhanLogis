# 버전관리 + 자동업데이트 (V1) — 설계 (spec)

> 2026-06-27. 개발책임자 2026-06-25 결정(`2026-06-25-version-auto-update-inspection.md`) 구현 + **모바일 확장**(사용자 지시: 데스크탑·웹·모바일 각 클라이언트).
> 착수 조건 충족(PWA Phase1 #624 머지). recon: electron-updater/expo-updates/버전API 전무, PwaUpdatePrompt(웹) 존재, EAS 구성됨(runtimeVersion 미정의).

## 0. 개발책임자 결정 (2026-06-25)
- **Option B**: 자체 버전체크 API(`GET /app/version`) + 인앱 팝업 (electron-updater 아님 — 코드서명/인증서 불요).
- **2단계 강제**: Critical/Major=강제(차단, 업데이트 안 하면 사용 불가) / Minor=권고('다시 보지 않기' 허용).
- **릴리스노트**: admin 관리화면(DB 등록).
- 범위: 웹/Electron 공통 + **모바일(사용자 추가 지시)**. 데스크탑 .exe 자동설치는 미포함(신버전 안내→웹사용/수동 재설치).

## 1. 목표 (V1)
클라이언트(데스크탑/웹/모바일)가 부팅·주기적으로 **최신 버전·강제수준·릴리스노트를 백엔드에서 조회**하고, 강제수준에 따라 **차단 모달(Critical/Major)** 또는 **권고 토스트(Minor)** 표시. 관리자가 릴리스노트/강제수준을 admin 화면에서 등록.

## 2. 아키텍처
### 2.1 백엔드 (dashboard-service 확장)
- **테이블** `app_release`(Flyway): `client_type`(DESKTOP/WEB/MOBILE), `version`(semver), `force_level`(CRITICAL/MAJOR/MINOR), `release_notes`(TEXT), `released_at`, `min_supported_version`, BaseEntity 7 audit + soft delete.
- **공개 조회** `GET /app/version?clientType=&currentVersion=` → `{latestVersion, minSupportedVersion, forceLevel(NONE|MINOR|MAJOR|CRITICAL), releaseNotes, releasedAt}`. forceLevel 산정: currentVersion < minSupported → **CRITICAL(강제차단, 등록 force 무관)**, < latest → 등록 force_level, ≥ latest → NONE. **인증 불요**(부팅 전 호출 가능, public route).
- **admin CRUD** `/app/releases`(GET/POST/PUT/DELETE) `@RequirePermission(admin.app-release)` — 릴리스 등록/수정.
- 게이트웨이 라우트 + public(/app/version)·인증(/app/releases) 분리.

### 2.2 공통 클라이언트 (version-check 모듈)
- 빌드 시 버전 주입: `VITE_APP_VERSION`(define, package.json version 또는 git describe) / Expo `Constants.expoConfig.version`.
- `checkAppVersion(clientType, currentVersion)` → GET /app/version → forceLevel 분기:
  - CRITICAL/MAJOR → **차단 모달**(릴리스노트 + 업데이트 안내, 닫기 불가, 앱 사용 차단).
  - MINOR → **권고 토스트/배너**('지금 보기' + '다시 보지 않기'[localStorage 영속]).
  - NONE → no-op.
- 부팅 1회 + 선택적 주기 폴링.

### 2.3 클라이언트별
- **Electron 데스크탑**(clients/desktop): 부팅 시 version-check, 차단 모달(웹/Electron 공용 컴포넌트). 버전 표기 UI(설정/about). `VITE_APP_VERSION` 주입.
- **웹/PWA**(clients/desktop dist/web, order-app): 동일 version-check + 차단/권고. **PwaUpdatePrompt(SW 업데이트)와 별개**(SW=자산, version-check=앱버전 정책). 공존.
- **모바일 Expo**(mobile-staff, mobile, arologis-mobile): ① **app.json `runtimeVersion`**(policy `appVersion`) 설정 + **expo-updates** 의존성/설정(eas.json update 채널) ② 인앱 version-check(동일 API, RN 컴포넌트) ③ OTA = `Updates.checkForUpdateAsync()`(expo-updates) — **OTA publish 활성=EAS 계정 게이트**(설정·코드 now, publish 후속).

## 3. 비범위 / 외부 게이트 (정직)
- **데스크탑 .exe 자동설치**(Option B 제외 — 안내만). **EAS OTA publish 활성**=EAS 계정 인증(설정·런타임 구현 now, 실 publish 후속). **코드서명 인증서**=미확보. **Phase 11 prod HTTPS**=모바일 실배포 전제.
- 실 릴리스 발행 워크플로우(CI 태깅/아티팩트)=별도 후속.

## 4. 슬라이스 분해
- **V1a (백엔드)**: app_release 테이블/엔티티 + GET /app/version(public) + admin CRUD + Testcontainers IT + 게이트웨이 라우트.
- **V1b (데스크탑/웹)**: version-check 모듈 + 차단/권고 컴포넌트(design-system) + 부팅 배선 + VITE_APP_VERSION + mock + Playwright. admin 릴리스 관리화면.
- **V1c (모바일)**: 3 Expo 앱 runtimeVersion + expo-updates 설정 + 인앱 version-check + OTA 코드(publish 게이트 명시).

## 5. QA
- 백엔드: Testcontainers IT(버전 비교 로직·forceLevel 산정·admin CRUD). fresh Postgres probe(마이그).
- 데스크탑/웹: **실서버 라이브 QA**(Docker + 실 로그인 → 차단/권고 모달 실 동작 캡처). mock Playwright.
- 모바일: expo prebuild/typecheck + 설정 검증(OTA publish는 게이트 명시).

## 6. 워크플로우
canonical(슬라이스별): spec→조기PR→Codex 구현(danger-full-access)→④Opus(BE/FE/Design/QA)+fix↔⑤Codex 0수렴→⑥PM→실서버/로컬 QA→CI green→PM 머지. 각 fix 재수렴.
