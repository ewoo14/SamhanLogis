# #817 데스크톱 패키지 앱 white-screen fix — 실 GUI 재QA 리포트

- **일자**: 2026-07-14
- **대상 브랜치**: `fix/desktop-packaging-preload` (CJS preload + sandbox:true 정식 전환)
- **환경**: 패키지 `win-unpacked` exe (electron-builder `--win --dir`, file:///…/app.asar 로드) · 실 백엔드 Docker 스택(api-gateway :8080 · auth-service :8081 · postgres) · mock OFF
- **검증 방식**: 패키지 exe `--remote-debugging-port=9222` + CDP(node WebSocket). 실 로그인 폼 입력 → 실 `/auth/login` 왕복 → 대시보드 전이. `Page.captureScreenshot`(fromSurface)로 실 렌더 GUI 캡처.
  - ⚠️ 캡처 함정: hidden/occluded 윈도우는 Chromium 페인팅 스로틀로 `captureScreenshot`가 hang → exe 기동에 `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-gpu` 부여로 해소(실 렌더 정상 캡처).

## 결과: PASS (white screen 완전 해소)

| 단계 | 관측 | 스샷 |
|---|---|---|
| preload 브릿지 | `typeof window.samhanAuth` = **object** (CJS preload 가 sandbox:true 하에서 로드) | — |
| 로그인 화면 | `location.hash` = **#/login** · heading "**Samhan Public 로그인**" · 입력 2(사용자 ID/비밀번호) · 로그인 버튼 — 정상 렌더(white 아님) | `01-login-screen.png` |
| 로그인 | dev_master / (시드 비밀번호) 입력 → 실 `/auth/login` → **token role=MASTER, [DEV-SEED] 개발마스터 저장** | — |
| 대시보드 전이 | 1초 내 전이(TRANSITIONED) · `location.hash` = **#/** · 사이드바(판매~창고운영) · 대시보드 카드 · 빠른액션 완전 렌더 | `02-post-login-dashboard.png` |

## 근본원인 대비 검증

- **기존 증상**: 패키지(file://) 에서 preload(ESM `.mjs`) + `sandbox:true` → "Cannot use import statement outside a module" → `window.samhanAuth` 미정의 → 세션 부트/라우팅 실패 → **로그인 후 흰 화면**.
- **정식 수정**: preload 를 CommonJS(`.cjs`, `format:'cjs'`) 로 빌드하여 **`sandbox:true` 유지**(#748 보안 하드닝 복원). 산출 `out/preload/index.cjs` = `require("electron")` 확인. `out/main/index.js` = `preload/index.cjs` + `sandbox: true` 확인.
- **검증**: 브릿지 object · 로그인 화면/대시보드 실 렌더 · 실 인증 왕복 성공 → 근본원인 제거 확증.

## 잔여(비-blocking, 본 fix 무관)

- 대시보드 일부 위젯 카드 "준비중" + 콘솔 500/403/503 — 백엔드 위젯 API warmup/권한(로컬 스택 서비스 준비상태). 코어 셸/라우팅/인증은 정상. 흰 화면과 무관.
- 폰트 `ERR_FILE_NOT_FOUND`(Pretendard woff2) — 빌드 시 `/fonts/*.woff2` 미해석 경고(런타임 fallback). 선행 패키징 nuance, 흰 화면과 무관.

## 회귀 가드

`clients/desktop/src/main/packaging-invariants.test.ts` (vitest) — CI 가 `build:win` 을 실행하지 않는 사각을 소스 레벨에서 방어: `sandbox:true` 유지 · preload `.cjs` 경로 · `format:'cjs'` · `@samhan/design-system` devDependencies. (4 tests PASS)
