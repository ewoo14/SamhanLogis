/**
 * Vite entry — clients/web/order-app v4 (legacy partner-order/index.html 임베드).
 *
 * <p>역할:
 * 1. shim 설치 (synchronous) — `window.google.script.run` Proxy + UrlFetchApp noop
 * 2. head classic script 가 선주입한 부트스트랩 객체를 보존
 * 3. 선주입이 아직 없는 dev/preview 경로에서만 비동기 부트스트랩 prefetch —
 *    `/api/v1/partner-orders/bootstrap` 응답을 `window.__SAMHAN_BOOTSTRAP__` 에 병합 +
 *    `samhan:bootstrap-ready` CustomEvent 발행
 * 4. PWA service worker 등록 (vite-plugin-pwa virtual import)
 *
 * <p>실행 순서 보증:
 * - 본 모듈 (`<script type="module">` in head) 은 defer 동작이라 legacy inline script 의
 *   데이터 const 평가보다 늦다.
 * - 따라서 index.html 의 parser-blocking classic script 가 먼저 bootstrap 을 채우고,
 *   main.ts 는 그 객체를 덮어쓰지 않는다.
 *
 * <p>backend 가용성:
 * - `/api/v1/partner-orders/bootstrap` 은 M4 PartnerOrderBootstrapController (PR #76) 가 제공.
 * - parser-blocking sync prefetch 실패는 index.html 이 fatal UI 로 중단한다. legacy const snapshot 이
 *   빈 카탈로그로 고정되는 false-ready 상태를 허용하지 않는다.
 */
import { installLegacyShim } from './legacyShim'
import { samhanApi } from './samhanApi'
import { mountOrderVersionGate } from './version/versionGate'

const CURRENT_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.0-dev'
const VERSION_API_BASE_URL = import.meta.env.VITE_VERSION_API_BASE_URL || 'http://localhost:8080'

// ─── 1) shim 동기 설치 + head 선주입 bootstrap 보존 ───
installLegacyShim(window.__SAMHAN_BOOTSTRAP__ || {})

void mountOrderVersionGate({
  currentVersion: CURRENT_VERSION,
  apiBaseUrl: VERSION_API_BASE_URL,
})

// ─── 2) 동기 선주입이 없고 fatal 도 아닌 경로에서만 비동기 fallback prefetch ───
if (!window.__SAMHAN_BOOTSTRAP_PREFETCHED__ && !window.__SAMHAN_BOOTSTRAP_FATAL__) {
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
      console.warn('[v4 main] bootstrap prefetch error', err)
    })
}

// ─── 3) PWA service worker 등록 (vite-plugin-pwa virtual module) ───
if ('serviceWorker' in navigator) {
  // virtual:pwa-register 는 vite-plugin-pwa 가 빌드 시 주입. 타입은 plugin 의 client.d.ts.
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onOfflineReady() {
          console.info('[v4 PWA] offline ready')
        },
        onNeedRefresh() {
          console.info('[v4 PWA] new version available — reload to apply')
        },
      })
    })
    .catch((err: unknown) => {
      // dev 환경 또는 plugin 미주입 시 swallow
      console.info('[v4 PWA] registerSW skipped', err)
    })
}
