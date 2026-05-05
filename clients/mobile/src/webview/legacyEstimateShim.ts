/**
 * Mobile v5 — estimate-app v2 WebView shim 스크립트.
 *
 * 목적:
 *   estimate-app v2 (Node + Express + EJS) 의 views/index.ejs 안에서
 *   호출되는 `google.script.run.<함수>(...)` 체인은 EJS 자체가 line 1246~1283 의 `makeRunner()`
 *   shim 으로 이미 가로채서 `POST /rpc/:fnName` 으로 fetch 한다 — Mobile v4 의 Apps Script 직접
 *   호출 패턴과 다르다.
 *
 *   따라서 본 mobile shim 은:
 *   1. `__SAMHAN_AUTH__` 전역 — token / partnerCode / apiBaseUrl 보관 (RN bridge 갱신 가능)
 *   2. `__SAMHAN_BRIDGE__` 전역 — RN 에서 token 갱신 / postMessage 호환
 *   3. estimate-app v2 의 inline `google.script.run` shim 의 `fetch` 호출에
 *      `Authorization: Bearer <token>` header 추가 (fetch monkey-patch)
 *   4. mobile-mode 자동 활성 검증 — DOMContentLoaded 후 `body.classList.contains('mobile-mode')`
 *      여부를 RN 에 보고
 *
 * 즉 "Mobile v4 의 legacyShim.ts" 는 google.script.run 자체를 정의했지만,
 *    "Mobile v5 의 legacyEstimateShim.ts" 는 이미 EJS 가 정의한 google.script.run 의
 *    fetch 콜만 augment 한다 (token bridge).
 *
 * estimate-app v2 의 11 RPC site (lib/code.js export §):
 *   - getCustomerDataAsync      (line 8787)
 *   - searchCustomerByBizno     (line 10145, 모바일 검색)
 *   - getGateImages             (line 12940)
 *   - getQuoteHistory           (line 13279)
 *   - logFrontEvent             (line 14003)
 *   - saveQuoteSnapshot         (line 15110)
 *   - sendOrderFromUi           (line 15152, 견적 → 슬립 자동)
 *   - getNotionHistory          (line 15289, MS DB 로 변환됨)
 *   - getInventoryTable         (line 15567, 재고 표)
 *   - checkUserAuth             (line 16495)
 *   - getManagersForInput       (line 16778)
 *
 * postMessage:
 *   - WebView → RN: `window.ReactNativeWebView.postMessage(JSON.stringify({type, payload}))`
 *   - RN → WebView: `webViewRef.current.injectJavaScript(setEstimateAuthScript({...}))`
 */

export interface LegacyEstimateShimConfig {
  /** SamhanLogis API gateway base URL — Mobile v4 와 동일. estimate-app v2 가 server-side 에서 사용. */
  apiBaseUrl: string;
  /** BizGate 인증 token (Authorization Bearer). null 이면 인증 전 (estimate-app v2 의 mobileGate 진입 차단). */
  token: string | null;
  /** 인증된 거래처 코드 — RPC 매핑에서 partnerCode query param 자동 추가 가능. */
  partnerCode: string | null;
  /** estimate-app v2 의 `?email=` 가 식별하는 사용자 이메일 — `__SAMHAN_AUTH__.userEmail` 보관. */
  userEmail?: string | null;
}

/**
 * estimate-app v2 의 index.ejs 첫 로드 직전에 주입되는 shim.
 *
 * @param config — base URL / token / partnerCode / userEmail 주입.
 * @returns IIFE JS string.
 *
 * 핵심 책임:
 *  1. `__SAMHAN_AUTH__` 전역 — token / partnerCode / apiBaseUrl / userEmail.
 *  2. `__SAMHAN_BRIDGE__` 전역 — RN 에서 token 갱신.
 *  3. `window.fetch` monkey-patch — `/rpc/...` 로 가는 요청에 `Authorization: Bearer <token>` 추가.
 *     (estimate-app v2 의 server.js 는 인증 없이 mock fallback 작동하지만, 실 MSA 연동 시 필수)
 *  4. 모바일 분기 검증 — DOMContentLoaded 후 mobile-mode class 활성 여부 RN 에 보고.
 */
export function getInjectedEstimateShim(config: LegacyEstimateShimConfig): string {
  const { apiBaseUrl, token, partnerCode, userEmail } = config;
  const safeBase = JSON.stringify(apiBaseUrl);
  const safeToken = JSON.stringify(token);
  const safePartner = JSON.stringify(partnerCode);
  const safeEmail = JSON.stringify(userEmail ?? null);

  return `
(function() {
  if (window.__SAMHAN_ESTIMATE_SHIM_INSTALLED__) return;
  window.__SAMHAN_ESTIMATE_SHIM_INSTALLED__ = true;

  // -------- Auth state (RN bridge 로 갱신 가능) --------
  window.__SAMHAN_AUTH__ = Object.assign({}, window.__SAMHAN_AUTH__ || {}, {
    apiBaseUrl: ${safeBase},
    token: ${safeToken},
    partnerCode: ${safePartner},
    userEmail: ${safeEmail}
  });

  function postToRN(type, payload) {
    try {
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
      }
    } catch (_e) { /* swallow */ }
  }

  // -------- Bridge — RN → WebView 핸들 --------
  window.__SAMHAN_BRIDGE__ = window.__SAMHAN_BRIDGE__ || {
    setAuth: function(next) {
      window.__SAMHAN_AUTH__ = Object.assign({}, window.__SAMHAN_AUTH__, next || {});
      try { window.dispatchEvent(new Event('samhan:auth')); } catch (_e) {}
    },
    handle: function(_msg) { /* RN → WebView 명령 라우팅 (확장 여지) */ },
    log: function(label, payload) { postToRN('log', { label: label, payload: payload }); }
  };

  // -------- fetch monkey-patch — /rpc/* 와 estimate-app 외부 호출에 Authorization 첨부 --------
  // estimate-app v2 의 inline google.script.run shim (index.ejs line 1262~1267) 가 모든 RPC 를
  // fetch("/rpc/" prop, { method "POST", headers ContentType json, body ... }) 형태로 호출.
  // 본 shim 이 그 fetch 의 headers 에 Bearer token 을 추가한다.
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
  // estimate-app v2 의 index.ejs:
  //  - line 7157: const mqMobile = window.matchMedia('(max-width: 1280px)');
  //  - line 7159: function isMobileNow(){ return mqMobile.matches; }
  //  - line 7187: document.body.classList.toggle('mobile-mode', isMobile);
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
    target: 'estimate-app-v2'
  });
})();
true; // RN WebView injected JS 마지막 표현식 truthy 권장
`;
}

/**
 * RN → WebView 의 token 갱신 명령 (estimate 전용).
 *
 * BizGate 통과 후 또는 logout 시 RN 에서 호출.
 * `webViewRef.current?.injectJavaScript(setEstimateAuthScript({...}))`.
 */
export function setEstimateAuthScript(next: Partial<LegacyEstimateShimConfig>): string {
  const safeNext = JSON.stringify({
    apiBaseUrl: next.apiBaseUrl,
    token: next.token,
    partnerCode: next.partnerCode,
    userEmail: next.userEmail,
  });
  return `
    (function() {
      try {
        if (window.__SAMHAN_BRIDGE__ && typeof window.__SAMHAN_BRIDGE__.setAuth === 'function') {
          window.__SAMHAN_BRIDGE__.setAuth(${safeNext});
        }
      } catch (e) { console.error('[SAMHAN estimate] setAuth failed', e); }
    })();
    true;
  `;
}

/**
 * estimate-app v2 가 사용하는 11 RPC 함수 inventory — TM 검토 / 디버깅용.
 *
 * 본 list 는 lib/code.js 의 RPC dispatch 와 일치해야 한다.
 * 누락 시 estimate-app v2 의 routes/rpc.js 가 404 응답 → 본 shim 의 monkey-patch 가
 * `rpc-missing` postMessage 발송.
 */
export const ESTIMATE_RPC_INVENTORY = [
  'getCustomerDataAsync',
  'searchCustomerByBizno',
  'getGateImages',
  'getQuoteHistory',
  'logFrontEvent',
  'saveQuoteSnapshot',
  'sendOrderFromUi',
  'getNotionHistory',
  'getInventoryTable',
  'checkUserAuth',
  'getManagersForInput',
] as const;

export type EstimateRpcName = (typeof ESTIMATE_RPC_INVENTORY)[number];
