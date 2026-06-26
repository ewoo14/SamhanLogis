# 백오피스 PWA Phase1 — 설치형 PWA (PR #624)

> 2026-06-26 · `feat/backoffice-pwa` · FE only (BE 무변경, Flyway 0)

## 배경 / 목표

모바일 레이아웃 갭 클로저 에픽(슬12~15) 완료 후 개발책임자 "PWA/네이티브 패키징 진행" 지시 → **PWA-first** 결정. desktop 백오피스(Electron + React + Vite)를 **설치형 PWA**로도 배포 가능한 인프라를 깔되, 기존 Electron 빌드는 무회귀로 보존한다.

## 구현 (Codex `c14e8f25` + Opus fix `09a4119e` + dev fix `f8b9a54e`)

### 이중 빌드 — 3-config 분리

| config | 용도 | vite-plugin-pwa |
|---|---|---|
| `vite.web.config.ts` | 웹/PWA 배포 | **full** (`generateSW`) — 앱셸 precache + 실 SW 생성 |
| `electron.vite.config.ts` | Electron 빌드 | `VitePWA({ disable: true })` — SW 불필요 no-op |
| `vite.config.ts` (신규, `f8b9a54e`) | dev/mock 서버 | `virtual:pwa-register` **no-op stub** (SW 없음) |

`vite.config.ts`는 `npx vite src/renderer`(Playwright mock 회귀 hard gate)가 사용한다. vite-plugin-pwa의 `virtual:pwa-register`는 **build 모드에서만** 제공되므로 dev serve에서 미해석 → 앱 hang 회귀가 발생했고, dev 전용 stub(`export function registerSW(){ return async () => {} }`)으로 import만 만족시켜 해소했다. playwright webServer command에 `--config vite.config.ts`를 명시한다(`npx vite [root]`는 root에서 config를 탐색하므로 clients/desktop config는 명시 필요).

### 앱셸 / 업데이트 프롬프트

- 앱셸 precache(오프라인 시 로그인 화면 렌더) + 정사각/maskable PWA 아이콘(192/512/apple-touch + source svg).
- `PwaUpdatePrompt.tsx` — `registerSW({onNeedRefresh,onOfflineReady})`로 새 SW 감지 시 **업데이트 프롬프트 토스트**(prompt 방식, 강제 reload 아님). 반환 `updateSW`를 저장 후 사용자 확인 시 `updateSW(true)` 호출.
- ④ Opus fix(`09a4119e`): runtime caching을 `NetworkOnly`가 아닌 **default-deny catch-all**로 — RBAC/collab API 응답이 SW에 캐시되는 footgun 차단.

## 리뷰 / 검증 (순차 듀얼리뷰 + 재수렴)

- ④ Opus 통합리뷰 + 라이브 PWA QA(SW active·오프라인 앱셸 로그인 렌더·Electron 무회귀) ↔ ⑤ Codex `CONVERGED`(실빌드 + npm ci).
- 🔴 0수렴 **후** 라이브 mock 게이트가 dev 서버 회귀를 **단독 적발**(정적 듀얼리뷰 미검출) → dev fix `f8b9a54e`.
- ⑤b **Codex 재수렴 리뷰**(`f8b9a54e`) 코드 finding 0 + PM 로컬 빌드 검증(typecheck + `build:web` 실 `sw.js`/workbox precache 15 entries) + CI 26 green — 특히 mock 회귀 hard gate `Desktop Playwright` **pass 8m22s**(직전 30m18s hang→cancelled 대비 hang 해소 입증).

## 교훈

- **PWA virtual 모듈은 웹빌드·Electron빌드·dev serve 3경로 모두 해석 검증 필수** — vite-plugin-pwa는 build 모드만 `virtual:pwa-register`를 제공, dev serve는 별도 stub이 필요. 정적 듀얼리뷰가 dev 경로를 누락 → 라이브 CI hard gate가 단독 적발(false-green 방어 가치).
- 로컬 **stale design-system dist**(gitignore라 체크아웃해도 미갱신)가 무관 파일(`rowTestId`) typecheck false-RED를 유발 → DS 재빌드로 해소. CI는 DS를 fresh 빌드하므로 무영향(로컬 한정 함정).

## 제약 / 후속

- 직원 실설치(모바일 홈화면 추가)는 **Phase11 prod HTTPS** 활성 후 가능(본 PR = PWA 인프라 + 로컬 검증).
- 후속(개발책임자 지정 대기): 네이티브(Capacitor) 패키징 phase · 버전관리 + 자동 업데이트.
