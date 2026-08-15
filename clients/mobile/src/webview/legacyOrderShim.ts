/**
 * Mobile v4 — order-app v4 WebView shim 스크립트 (회고 #2 정정).
 *
 * 회고 #2 (2026-05-05) — 사용자 명시:
 *   "주문서는 ... 처음 모바일 게이트를 제외한 나머지는 모두 다름을 확인."
 *
 * 정정 결정 (mobile-staff v3 의 `legacyEstimateShim.ts` 패턴 1:1 적용):
 *   - 이전 v4 = `legacyShim.ts` 가 `google.script.run` Proxy + 12 RPC 매핑 + axios fetch monkey-patch
 *     를 RN 측에서 직접 정의 → order-app v4 가 자체적으로 google.script.run shim
 *     (`clients/web/order-app/src/legacyShim.ts` + `samhanApi.ts`) 을 제공함에도 중복.
 *   - 신규 v4 = order-app v4 의 root `index.html` (legacy partner-order/index.html 9427 라인 그대로) +
 *     `<script type="module" src="/src/main.ts">` (shim 자동 주입) 가 모든 RPC 처리 → RN shim 은
 *     단순 fetch monkey-patch (X-Samhan-Partner header 첨부) + mobile-mode 자동 활성 검증 + postMessage
 *     bridge 만 담당.
 *
 * 정정 #2 (2026-05-05 PR #70 revert 후속):
 *   - PR #70 으로 legacy-v2 (clients/web/order-legacy 의 Express + EJS 포팅) 가 main 에서 제거됨.
 *   - 본 shim 은 운영 시 작동하지 않는 order-legacy 가 아니라, main 에 존재하는 order-app v4 위에 동작.
 *   - shim 자체의 동작 (fetch monkey-patch + postMessage) 은 양 환경 모두 호환.
 *
 * order-app v4 의 12 RPC site (samhanApi.ts RPC_MAP §):
 *   - getProducts / getCustomers / getManagers / saveOrderSnapshot / getOrderSnapshotHistory
 *   - sendOrderFromUi / requestAuthApproval / setAuthPassword / tryLogin / applyConfigFromServer
 *   - logFrontEvent / getGateImages / getLogoImage
 *
 * postMessage:
 *   - WebView → RN: `window.ReactNativeWebView.postMessage(JSON.stringify({type, payload}))`
 *
 * UUID 미노출:
 *   - order-app v4 의 임베드된 legacy partner-order/index.html 자체가 사업자번호/거래처코드/모델명 만 노출 (UUID X).
 *   - shim 의 X-Samhan-Partner header 값도 거래처코드 (e.g. "P001") — UUID 회피.
 */

export interface LegacyOrderShimConfig {
  /** SamhanLogis API gateway base URL — shim 이 fetch monkey-patch 시 RPC URL 매칭 보조용. */
  apiBaseUrl: string;
  /** 인증 token (Authorization Bearer). v4 default null — WebView 안 tryLogin 가 cookie 로 처리. */
  token: string | null;
  /** 인증된 거래처코드 — RPC 매핑에서 X-Samhan-Partner header 자동 추가. UUID 회피. v4 default null. */
  partnerCode: string | null;
}

/**
 * order-app v4 의 index.html 첫 로드 직전에 주입되는 RN-side shim (mobile-staff v3 패턴 1:1).
 *
 * v4 에서는 default config 으로 호출되며, 실제 인증은 WebView 안 legacy 가 자체 처리.
 *
 * @param config — base URL / token / partnerCode 주입.
 * @returns IIFE JS string.
 */
export function getInjectedOrderShim(config: LegacyOrderShimConfig): string {
  const { apiBaseUrl, token, partnerCode } = config;
  const safeBase = JSON.stringify(apiBaseUrl);
  const safeToken = JSON.stringify(token);
  const safePartner = JSON.stringify(partnerCode);

  return `
(function() {
  if (window.__SAMHAN_ORDER_SHIM_INSTALLED__) return;
  window.__SAMHAN_ORDER_SHIM_INSTALLED__ = true;

  // -------- Auth state (RN 의 직접 갱신 없음 — WebView 안 legacy tryLogin 이 cookie 로 처리) --------
  window.__SAMHAN_AUTH__ = Object.assign({}, window.__SAMHAN_AUTH__ || {}, {
    apiBaseUrl: ${safeBase},
    token: ${safeToken},
    partnerCode: ${safePartner}
  });

  function postToRN(type, payload) {
    try {
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
      }
    } catch (_e) { /* swallow */ }
  }

  // -------- OTA 작업 보호 — 미저장 입력 또는 진행 중 요청이면 RN에 active를 알림 --------
  var otaDirty = false;
  var otaPendingRequests = 0;
  function reportOtaActivity() {
    postToRN('ota-activity', { active: otaDirty || otaPendingRequests > 0 });
  }
  document.addEventListener('input', function() {
    otaDirty = true;
    reportOtaActivity();
  }, true);
  document.addEventListener('change', function() {
    otaDirty = true;
    reportOtaActivity();
  }, true);
  document.addEventListener('submit', function() {
    otaDirty = false;
    reportOtaActivity();
  }, true);

  // -------- Bridge — RN → WebView 명령 라우팅 (확장 여지) --------
  window.__SAMHAN_BRIDGE__ = window.__SAMHAN_BRIDGE__ || {
    setAuth: function(next) {
      window.__SAMHAN_AUTH__ = Object.assign({}, window.__SAMHAN_AUTH__, next || {});
      try { window.dispatchEvent(new Event('samhan:auth')); } catch (_e) {}
    },
    handle: function(_msg) { /* RN → WebView 명령 라우팅 (확장 여지) */ },
    log: function(label, payload) { postToRN('log', { label: label, payload: payload }); }
  };

  // -------- fetch monkey-patch — /rpc/* 와 SamhanLogis API 호출에 X-Samhan-Partner 첨부 --------
  // order-app v4 의 main.ts 가 주입하는 google.script.run shim (legacyShim.ts) 이 모든 RPC 를
  // samhanApi.call() → axios → /api/v1/... 형태로 dispatch. 본 RN shim 은 그 fetch 의 headers 에
  // (있다면) Bearer token + 거래처코드 추가. v4 default = token/partnerCode null → header 첨부 skip
  // (WebView 안 legacy 의 cookie / tryLogin 결과로 인증 처리).
  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function(input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var isRpc = /\\/rpc\\//.test(url);
        var isSamhanApi = /\\/api\\/v1\\//.test(url);
        if (isRpc || isSamhanApi) {
          init = init || {};
          var headers = new Headers(init.headers || (input && input.headers) || {});
          var auth = window.__SAMHAN_AUTH__ || {};
          if (auth.token && !headers.has('Authorization')) {
            headers.set('Authorization', 'Bearer ' + auth.token);
          }
          if (auth.partnerCode && !headers.has('X-Samhan-Partner')) {
            headers.set('X-Samhan-Partner', auth.partnerCode);
          }
          init.headers = headers;
        }
      } catch (_e) { /* swallow — fetch 원본으로 진행 */ }
      var p = origFetch.call(window, input, init);
      var countsAsWork = isRpc || isSamhanApi;
      if (countsAsWork) {
        otaPendingRequests += 1;
        reportOtaActivity();
        p.then(function() {
          otaPendingRequests = Math.max(0, otaPendingRequests - 1);
          reportOtaActivity();
        }).catch(function() {
          otaPendingRequests = Math.max(0, otaPendingRequests - 1);
          reportOtaActivity();
        });
      }
      // RPC 응답 가시화 (dev 디버깅) — 매핑 누락 시 RN 에 알림.
      if (typeof p.then === 'function') {
        p.then(function(res) {
          try {
            if (res && /\\/rpc\\//.test(res.url || '') && res.status === 404) {
              postToRN('rpc-missing', { url: res.url });
            } else if (res && /\\/rpc\\//.test(res.url || '') && res.status >= 400) {
              postToRN('rpc-error', { url: res.url, status: res.status });
            }
          } catch (_e) { /* swallow */ }
          return res;
        }).catch(function(_e) { /* swallow */ });
      }
      return p;
    };
  }

  // -------- 모바일 분기 자동 활성 검증 --------
  // order-app v4 의 index.html (legacy partner-order/index.html 1:1):
  //  - line 4491: document.body.classList.toggle('mobile-mode', isMobile);
  //  - line 8435: document.body.classList.toggle('mobile-mode', isMobile);
  // → react-native-webview 의 device width (iPhone/Galaxy 모두 < 1280) → mobile-mode 자동 추가.
  document.addEventListener('DOMContentLoaded', function() {
    if (!document.querySelector('meta[name="viewport"]')) {
      var m = document.createElement('meta');
      m.name = 'viewport';
      m.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.head.appendChild(m);
    }
    // 안전망 — legacy 의 onViewportChange 가 호출되기 전에 RN 가 mobile-mode 강제.
    try {
      if (window.matchMedia && window.matchMedia('(max-width: 1280px)').matches) {
        document.body.classList.add('mobile-mode');
      }
    } catch (_e) { /* swallow */ }
    var mobileActive = !!(document.body && document.body.classList && document.body.classList.contains('mobile-mode'));
    postToRN('legacy-loaded', { url: location.href, mobileMode: mobileActive });
  });

  postToRN('shim-installed', {
    apiBaseUrl: window.__SAMHAN_AUTH__.apiBaseUrl,
    hasToken: !!window.__SAMHAN_AUTH__.token,
    target: 'order-app-v4-partner-webview-only'
  });
  reportOtaActivity();
})();
true; // RN WebView injected JS 마지막 표현식 truthy 권장
`;
}

/**
 * RN → WebView 의 token 갱신 명령 (mobile-staff v3 호환 패턴).
 *
 * 후속에 RN 측 push notification / SSO 통합 시 부활 가능 — v4 default 흐름에서는 호출 없음.
 */
export function setOrderAuthScript(next: Partial<LegacyOrderShimConfig>): string {
  const safeNext = JSON.stringify({
    apiBaseUrl: next.apiBaseUrl,
    token: next.token,
    partnerCode: next.partnerCode,
  });
  return `
    (function() {
      try {
        if (window.__SAMHAN_BRIDGE__ && typeof window.__SAMHAN_BRIDGE__.setAuth === 'function') {
          window.__SAMHAN_BRIDGE__.setAuth(${safeNext});
        }
      } catch (e) { console.error('[SAMHAN order v4] setAuth failed', e); }
    })();
    true;
  `;
}

/**
 * v4 임무 명세 시그니처 — 무인자 helper. EXPO_PUBLIC_API_BASE_URL 환경변수 또는 default 로
 * `getInjectedOrderShim({apiBaseUrl, token:null, partnerCode:null})` 호출.
 *
 * 사용 위치: `MobileOrderWebViewScreen.tsx` 의 `injectedJavaScriptBeforeContentLoaded` prop.
 */
export function buildOrderShim(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
  const envApi = proc?.env?.EXPO_PUBLIC_API_BASE_URL;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDev = typeof (globalThis as any).__DEV__ !== 'undefined' ? (globalThis as any).__DEV__ : false;
  const apiBaseUrl = envApi || (isDev ? 'http://localhost:8080' : 'https://api.samhan-air.com');
  return getInjectedOrderShim({
    apiBaseUrl,
    token: null,
    partnerCode: null,
  });
}

/**
 * order-app v4 가 사용하는 12 RPC 함수 inventory — TM 검토 / 디버깅용.
 */
export const ORDER_RPC_INVENTORY = [
  'getProducts',
  'getCustomers',
  'getManagers',
  'saveOrderSnapshot',
  'getOrderSnapshotHistory',
  'sendOrderFromUi',
  'requestAuthApproval',
  'setAuthPassword',
  'tryLogin',
  'applyConfigFromServer',
  'logFrontEvent',
  'getGateImages',
  'getLogoImage',
] as const;

export type OrderRpcName = (typeof ORDER_RPC_INVENTORY)[number];
