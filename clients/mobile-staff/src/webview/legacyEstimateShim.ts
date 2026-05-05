/**
 * mobile-staff v1 — estimate-app v2 WebView shim 스크립트 (영업직원 token bridge).
 *
 * 출처: Mobile v5 (`feature/migration-fe-mobile-v5-estimate` commit `6bf46bb` 의 legacyEstimateShim.ts)
 *      패턴 1:1 — header 가 `X-Samhan-Partner` (거래처) → `X-Samhan-Staff` (영업직원) 로 분리.
 *
 * 목적:
 *   estimate-app v2 (Node + Express + EJS) 의 views/index.ejs 안에서 호출되는
 *   `google.script.run.<함수>(...)` 체인은 EJS 자체가 line 1246~1283 의 `makeRunner()` shim 으로
 *   이미 가로채서 `POST /rpc/:fnName` 으로 fetch 한다.
 *
 *   따라서 본 mobile-staff shim 은:
 *   1. `__SAMHAN_AUTH__` 전역 — token / employeeCode / apiBaseUrl 보관 (RN bridge 갱신 가능)
 *   2. `__SAMHAN_BRIDGE__` 전역 — RN 에서 token 갱신 / postMessage 호환
 *   3. estimate-app v2 의 inline `google.script.run` shim 의 `fetch` 호출에
 *      `Authorization: Bearer <token>` + `X-Samhan-Staff: <employeeCode>` header 추가
 *   4. mobile-mode 자동 활성 검증 — DOMContentLoaded 후 `body.classList.contains('mobile-mode')`
 *      여부를 RN 에 보고
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
 *
 * UUID 미노출:
 *   - employeeCode (사번, e.g. "S001") 만 X-Samhan-Staff header 에 넣음 — employeeId UUID X.
 */

export interface LegacyEstimateShimConfig {
  /** SamhanLogis API gateway base URL — Mobile v4 와 동일. estimate-app v2 가 server-side 에서 사용. */
  apiBaseUrl: string;
  /** StaffLogin 인증 token (Authorization Bearer). null 이면 인증 전. */
  token: string | null;
  /** 인증된 영업직원 사번 — RPC 매핑에서 X-Samhan-Staff header 자동 추가. UUID 회피. */
  employeeCode: string | null;
  /** estimate-app v2 의 `?email=` 가 식별하는 사용자 이메일 — `__SAMHAN_AUTH__.userEmail` 보관. */
  userEmail?: string | null;
}

/**
 * estimate-app v2 의 index.ejs 첫 로드 직전에 주입되는 shim.
 *
 * @param config — base URL / token / employeeCode / userEmail 주입.
 * @returns IIFE JS string.
 */
export function getInjectedEstimateShim(config: LegacyEstimateShimConfig): string {
  const { apiBaseUrl, token, employeeCode, userEmail } = config;
  const safeBase = JSON.stringify(apiBaseUrl);
  const safeToken = JSON.stringify(token);
  const safeStaff = JSON.stringify(employeeCode);
  const safeEmail = JSON.stringify(userEmail ?? null);

  return `
(function() {
  if (window.__SAMHAN_ESTIMATE_SHIM_INSTALLED__) return;
  window.__SAMHAN_ESTIMATE_SHIM_INSTALLED__ = true;

  // -------- Auth state (RN bridge 로 갱신 가능) --------
  window.__SAMHAN_AUTH__ = Object.assign({}, window.__SAMHAN_AUTH__ || {}, {
    apiBaseUrl: ${safeBase},
    token: ${safeToken},
    employeeCode: ${safeStaff},
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

  // -------- fetch monkey-patch — /rpc/* 와 estimate-app 외부 호출에 Authorization + X-Samhan-Staff 첨부 --------
  // estimate-app v2 의 inline google.script.run shim (index.ejs line 1262~1267) 가 모든 RPC 를
  // fetch("/rpc/" prop, { method "POST", headers ContentType json, body ... }) 형태로 호출.
  // 본 shim 이 그 fetch 의 headers 에 Bearer token + 영업직원 사번 추가.
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
          if (auth.employeeCode && !headers.has('X-Samhan-Staff')) {
            headers.set('X-Samhan-Staff', auth.employeeCode);
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
    target: 'estimate-app-v2-staff'
  });
})();
true; // RN WebView injected JS 마지막 표현식 truthy 권장
`;
}

/**
 * RN → WebView 의 token 갱신 명령 (estimate 전용).
 *
 * StaffLogin 통과 후 또는 logout 시 RN 에서 호출.
 * `webViewRef.current?.injectJavaScript(setEstimateAuthScript({...}))`.
 */
export function setEstimateAuthScript(next: Partial<LegacyEstimateShimConfig>): string {
  const safeNext = JSON.stringify({
    apiBaseUrl: next.apiBaseUrl,
    token: next.token,
    employeeCode: next.employeeCode,
    userEmail: next.userEmail,
  });
  return `
    (function() {
      try {
        if (window.__SAMHAN_BRIDGE__ && typeof window.__SAMHAN_BRIDGE__.setAuth === 'function') {
          window.__SAMHAN_BRIDGE__.setAuth(${safeNext});
        }
      } catch (e) { console.error('[SAMHAN estimate-staff] setAuth failed', e); }
    })();
    true;
  `;
}

/**
 * estimate-app v2 가 사용하는 11 RPC 함수 inventory — TM 검토 / 디버깅용.
 * Mobile v5 와 동일.
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
