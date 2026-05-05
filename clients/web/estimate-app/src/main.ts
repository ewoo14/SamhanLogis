/**
 * Vite entry — clients/web/estimate-app v1 (legacy estimate/index.html 임베드).
 *
 * <p>역할:
 * 1. shim 설치 (synchronous) — `window.google.script.run` Proxy + UrlFetchApp noop +
 *    빈 부트스트랩 객체 즉시 주입 (legacy inline script 가 안전하게 동작)
 * 2. 비동기 부트스트랩 prefetch — `/api/v1/estimates/bootstrap` 응답을
 *    `window.__SAMHAN_BOOTSTRAP__` 에 병합 + `samhan:bootstrap-ready` CustomEvent 발행
 * 3. PWA service worker 등록 (vite-plugin-pwa virtual import)
 *
 * <p>실행 순서 보증:
 * - 본 모듈 (`<script type="module">` in head) 은 기본적으로 defer 동작 (HTML parse 완료 후 실행)
 * - legacy inline `<script>` (body, line 1234~18613) 는 parser-blocking 이라 본 모듈보다 먼저 실행됨
 * - 그러나 legacy 의 실제 render/init (DOMContentLoaded listener — line 8846 등) 은
 *   `DOMContentLoaded` 시점에 실행 → 본 모듈의 sync 부분이 그 전에 완료됨
 * - shim 의 sync 부분 (window.google + window.__SAMHAN_BOOTSTRAP__={}) 만 보장하면 OK
 *
 * <p>제한 (TODO M3 backend):
 * - `/api/v1/estimates/bootstrap` 미구현 → 부트스트랩은 빈 객체. legacy 카탈로그 (homemulti / singleSets /
 *   commercialMulti / oldProducts 등 13종) 는 비어있는 상태로 진입.
 * - build script 가 legacy 의 Apps Script 템플릿 (`<?!= homemulti ?>` 등) 을
 *   `window.__SAMHAN_BOOTSTRAP__.homemulti || '[]'` JS 표현식으로 변환 → 빈 배열 fallback.
 * - BizGate 는 정상 동작 (checkUserAuth RPC 만 의존). 인증 실패 시 authFailBox 표시.
 *
 * <p>참조: clients/web/order-app v4 의 동일 모듈 (PR #50 MERGED).
 */
import { installLegacyShim } from './legacyShim'
import { samhanApi } from './samhanApi'

// ─── 1) shim 동기 설치 + 빈 부트스트랩 — legacy inline script 가 즉시 사용 가능 ───
installLegacyShim({})

// ─── 2) 비동기 부트스트랩 prefetch + window 객체 갱신 + CustomEvent ───
samhanApi
  .fetchBootstrap()
  .then((bootstrap) => {
    Object.assign(window.__SAMHAN_BOOTSTRAP__ || {}, bootstrap)
    // legacy 가 listen 하면 재렌더, 미구현이어도 무영향
    document.dispatchEvent(
      new CustomEvent('samhan:bootstrap-ready', { detail: bootstrap }),
    )
  })
  .catch((err: unknown) => {
    console.warn('[estimate-app v1 main] bootstrap prefetch error', err)
  })

// ─── 3) PWA service worker 등록 (vite-plugin-pwa virtual module) ───
if ('serviceWorker' in navigator) {
  // virtual:pwa-register 는 vite-plugin-pwa 가 빌드 시 주입. 타입은 plugin 의 client.d.ts.
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onOfflineReady() {
          console.info('[estimate-app v1 PWA] offline ready')
        },
        onNeedRefresh() {
          console.info('[estimate-app v1 PWA] new version available — reload to apply')
        },
      })
    })
    .catch((err: unknown) => {
      // dev 환경 또는 plugin 미주입 시 swallow
      console.info('[estimate-app v1 PWA] registerSW skipped', err)
    })
}
