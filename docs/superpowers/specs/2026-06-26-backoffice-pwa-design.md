# 백오피스 PWA (Phase 1) — 설계 (spec)

> 2026-06-26 개발책임자 승인(자율 진행). 모바일 레이아웃 갭 클로저 에픽(슬12~15) 완료 후속.
> 결정: **PWA 먼저 → 네이티브(Capacitor) 후속** · **앱 셸만 precache**(오프라인 데이터/쓰기 비범위) · **업데이트=prompt**.

## 1. 목표 + 범위
방금 모바일 반응형화(슬12~15)한 **데스크탑 백오피스 웹(`clients/desktop` 렌더러 → `vite.web.config.ts` → `dist/web`)**을 **설치형 PWA**로 만든다. 사내 직원이 모바일 브라우저에서 "홈화면에 추가"로 설치 → 네이티브 앱처럼 standalone 실행 + 앱 셸 즉시 로딩.

**본 에픽 산출**: PWA 인프라(manifest·service worker·아이콘·업데이트 흐름) 통합 + 로컬 검증. **Electron 데스크탑 빌드 무영향.**

## 2. 아키텍처 — `vite-plugin-pwa` (웹 빌드 전용)
- `clients/desktop/vite.web.config.ts`의 `plugins: [react()]`에 `VitePWA({...})` 추가. **electron-vite 빌드(별도 config)는 미변경** → PWA는 `dist/web`(웹) 산출물에만 적용.
- **Workbox 런타임 전략**:
  - 정적 asset(JS/CSS/폰트/아이콘·해시 파일명) = **precache**(앱 셸, 오프라인 로드).
  - `index.html` = **precache + navigateFallback**(셸/자산 원자적 업데이트는 prompt 경유 — vite-plugin-pwa prompt 표준 패턴, NetworkFirst 대비 우수).
  - **default-deny NetworkOnly**: 앱셸(precache) 외 **동일출처 비-navigation 요청 전부**(데이터·API·`/api`·`/auth`·collab 중첩경로·RBAC 등) = 캐시 금지(실시간·권한 stale 누출 차단). precache 라우팅 우선이라 빌드 asset 무영향. cross-origin :8080 게이트웨이는 SW 미인터셉트(이중 안전).
  - `globPatterns`로 빌드 asset만 precache, 외부/런타임 응답 제외.

## 3. 컴포넌트 (유닛)
1. **Web App Manifest** (vite-plugin-pwa `manifest` 옵션 또는 `public/manifest.webmanifest`):
   - `name: "Samhan Public 백오피스"`, `short_name: "삼한"`, `lang: "ko"`, `display: "standalone"`, `orientation: "portrait-primary"` 미강제(any), `start_url: "/"`, `scope: "/"`, `theme_color`/`background_color`=디자인 토큰 brand/surface 값.
   - `icons`: 192·512·maskable(512, safe-zone padding). → §6 아이콘.
2. **Service Worker 설정** (vite.web.config.ts `workbox`): §2 전략 인코딩. `cleanupOutdatedCaches: true`, `clientsClaim`/`skipWaiting`=**false**(prompt 전략이므로 자동 활성 금지).
3. **SW 등록 + 업데이트 prompt** (`main.tsx` + 소형 컴포넌트):
   - `virtual:pwa-register`의 `registerSW({ onNeedRefresh, onOfflineReady })`.
   - `registerType: 'prompt'` — 새 버전(새 SW) 감지 시 **비강제 토스트/배너** "새 버전이 있습니다 — 새로고침" 버튼 노출. 클릭 시 `updateSW()`로 활성+reload. **자동 reload 금지**(분개/전표/견적 폼 입력 중 미저장 손실 방지). `onOfflineReady`=최초 설치 시 "오프라인 사용 준비됨" 1회 알림.
   - 토스트는 기존 design-system/공용 알림 패턴 재사용(신규 무거운 의존 금지).
4. **index.html**: manifest link + theme-color meta + apple-touch-icon(iOS 홈화면) 추가.

## 4. 업데이트 전략 = prompt (확정)
autoUpdate(skipWaiting) 대신 **prompt**. 이유: 백오피스는 데이터 입력 폼 중심 → 배포 시 강제 reload는 미저장 입력 손실. 사용자가 안전 시점에 새로고침. **후속 "버전관리+자동업데이트 에픽③"의 토대**(SW 업데이트 감지 메커니즘 재사용).

## 5. ⚠️ 제약 — HTTPS / prod 호스팅 (Phase 11 의존)
PWA 설치·service worker는 **secure context(HTTPS, 또는 localhost)** 필요. 백오피스 prod 호스팅은 미설정(**Phase 11 AWS** 범위). 따라서:
- **본 에픽 = PWA 인프라 구축 + 로컬 검증**(vite preview `localhost`=secure context라 SW/설치/Lighthouse 검증 가능).
- **직원 실설치(모바일)는 prod HTTPS 배포 후 활성** — Phase 11 prod cutover 또는 web+gateway 임시 HTTPS 배포(백엔드 동반 필요라 별도 의사결정) 시점. spec에 명시하여 기대 정렬.
- 코드/manifest/SW는 prod URL에 무관하게 동작(상대경로·scope `/`).

## 6. 아이콘
`clients/desktop/public/print-logo.svg`는 **240×60 와이드 placeholder**라 정사각 앱 아이콘에 부적합. → **정사각 placeholder 아이콘**(브랜드색 배경 + "삼한"/"SP" 모노그램) 192×192·512×512·maskable 생성(`public/pwa-*.png` 또는 SVG). **print-logo 컨벤션대로 실 회사 로고 교체 가능**(주석 명시). vite-plugin-pwa `pwa-assets`/수동 생성 중 단순한 쪽.

## 7. 테스트 / QA
- **Lighthouse PWA 카테고리**: installable·manifest 유효·SW 등록·HTTPS(localhost) 통과.
- **로컬 설치**: Chrome(vite preview :5175) "앱 설치" → standalone 실행 확인.
- **오프라인 앱셸**: DevTools offline → 앱 로드(셸) 되고 데이터 호출은 실패(network-only 의도) 확인.
- **업데이트 prompt**: 재빌드 후 토스트 노출 + 새로고침 동작.
- **🚨 데스크탑/Electron 무회귀**: electron-vite 빌드 산출물에 SW/manifest 미주입 확인(PWA는 웹 빌드 한정). 기존 mock 회귀 hard gate green.

## 8. 🚫 비범위 (YAGNI)
- 오프라인 데이터 캐시·오프라인 쓰기 큐(§오프라인=앱셸만).
- 푸시 알림(Web Push) — **네이티브 phase**(Capacitor).
- Capacitor 네이티브 셸·앱스토어 배포 — **후속 phase**.
- 버전관리+자동업데이트 팝업 에픽③ — 별개(본 에픽은 SW 업데이트 prompt 토대만).
- 실 회사 로고 디자인 — placeholder + 교체 컨벤션.

## 9. 워크플로우
canonical 8단계: 본 spec → plan → 조기 PR → Codex 구현 → ④Opus 5차원+fix+QA ↔ ⑤Codex 0수렴 → ⑥PM종합 → ⑦CI green(mock 회귀 hard gate=Electron 무회귀 보증) → ⑧PM 자율머지 → 핸드오프. 라이브 QA=로컬 PWA 검증(Lighthouse/설치/오프라인). 매 Bundle ScheduleWakeup.
