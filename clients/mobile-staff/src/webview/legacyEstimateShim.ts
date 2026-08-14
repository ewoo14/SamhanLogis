/**
 * mobile-staff v2 — estimate-app v2 WebView shim 스크립트.
 *
 * v1 (PR #63 close, commit `d69a7f7`) 의 legacyEstimateShim.ts 와 동일한 핵심 로직 (X-Samhan-Staff
 * header + fetch monkey-patch + mobile-mode 자동 활성 검증) 을 보존하면서, v2 단순화에 맞춰 다음 차이:
 *   1. v1 = StaffLogin native 통과 후 RN authStore 의 token / employeeCode 를 shim 에 주입.
 *      v2 = RN 측 인증 코드 폐기. token 은 WebView 안 legacy estimate `checkUserAuth(USER_EMAIL)`
 *      (Apps Script Code.js line 8726 1:1) 가 cookie / sessionStorage 에 저장. shim 은 무인증 default
 *      `buildShim()` 으로 시작 (apiBaseUrl 만 .env 에서 주입).
 *   2. `setEstimateAuthScript` 는 후속 호환을 위해 남겨두지만 v2 RN 에서는 호출하지 않음.
 *   3. `buildShim()` = 임무 명세 시그니처 alias — 무인자, .env 의 EXPO_PUBLIC_API_BASE_URL 사용.
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
 *   - checkUserAuth             (line 16495 — v2 의 인증 진입점)
 *   - getManagersForInput       (line 16778)
 *
 * postMessage:
 *   - WebView → RN: `window.ReactNativeWebView.postMessage(JSON.stringify({type, payload}))`
 *
 * UUID 미노출:
 *   - estimate-app v2 의 EJS 자체가 사업자번호/거래처코드/모델명 만 노출 (UUID X).
 *   - shim 의 X-Samhan-Staff header 값도 사번 (e.g. "S001") — UUID 회피.
 */

export interface LegacyEstimateShimConfig {
  /** SamhanLogis API gateway base URL — shim 이 fetch monkey-patch 시 RPC URL 매칭 보조용 (현재 미사용, 후속 확장 여지). */
  apiBaseUrl: string;
  /** 인증 token (Authorization Bearer). v2 default null — WebView 안 checkUserAuth 가 cookie 로 처리. */
  token: string | null;
  /** 인증된 영업직원 사번 — RPC 매핑에서 X-Samhan-Staff header 자동 추가. UUID 회피. v2 default null. */
  employeeCode: string | null;
  /** estimate-app v2 의 `?email=` query 매핑 — `__SAMHAN_AUTH__.userEmail` 보관. v2 default null. */
  userEmail?: string | null;
}

/**
 * estimate-app v2 의 index.ejs 첫 로드 직전에 주입되는 shim (v1 패턴 1:1).
 *
 * v2 에서는 default config 으로 호출되며, 실제 인증은 WebView 안 legacy 가 자체 처리.
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

  // -------- Auth state (RN 의 직접 갱신 없음 — WebView 안 legacy checkUserAuth 가 cookie 로 처리) --------
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

  var otaDirty = false;
  var otaPendingRequests = 0;
  function reportOtaActivity() { postToRN('ota-activity', { active: otaDirty || otaPendingRequests > 0 }); }
  document.addEventListener('input', function() { otaDirty = true; reportOtaActivity(); }, true);
  document.addEventListener('change', function() { otaDirty = true; reportOtaActivity(); }, true);
  document.addEventListener('submit', function() { otaDirty = false; reportOtaActivity(); }, true);

  // -------- Bridge — v1 호환 유지 (v2 에서는 미사용, RN 후속 확장 여지) --------
  window.__SAMHAN_BRIDGE__ = window.__SAMHAN_BRIDGE__ || {
    setAuth: function(next) {
      window.__SAMHAN_AUTH__ = Object.assign({}, window.__SAMHAN_AUTH__, next || {});
      try { window.dispatchEvent(new Event('samhan:auth')); } catch (_e) {}
    },
    handle: function(_msg) { /* RN → WebView 명령 라우팅 (확장 여지) */ },
    log: function(label, payload) { postToRN('log', { label: label, payload: payload }); }
  };

  // -------- fetch monkey-patch — /rpc/* 와 SamhanLogis API 호출에 X-Samhan-Staff 첨부 --------
  // estimate-app v2 의 inline google.script.run shim 가 모든 RPC 를 fetch("/rpc/" prop, {...}) 형태로 호출.
  // 본 shim 이 그 fetch 의 headers 에 (있다면) Bearer token + 사번 추가.
  // v2 default = token/employeeCode null 이므로 header 첨부 skip — WebView 안 legacy 의 cookie 가 인증.
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
      if (isRpc || isSamhanApi) { otaPendingRequests += 1; reportOtaActivity(); }
      if ((isRpc || isSamhanApi) && typeof p.finally === 'function') { p.finally(function() { otaPendingRequests = Math.max(0, otaPendingRequests - 1); reportOtaActivity(); }); }
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
    target: 'estimate-app-v2-staff-webview-only'
  });
})();
true; // RN WebView injected JS 마지막 표현식 truthy 권장
`;
}

/**
 * RN → WebView 의 token 갱신 명령 (v1 호환 유지 — v2 에서는 RN 측 호출 없음).
 *
 * 후속에 RN 측 push notification / SSO 통합 시 부활 가능.
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
      } catch (e) { console.error('[SAMHAN estimate-staff v2] setAuth failed', e); }
    })();
    true;
  `;
}

/**
 * v2 임무 명세 시그니처 — 무인자 helper. EXPO_PUBLIC_API_BASE_URL 환경변수 또는 default 로
 * `getInjectedEstimateShim({apiBaseUrl, token:null, employeeCode:null, userEmail:null})` 호출.
 *
 * 사용 위치: `EstimateWebViewScreen.tsx` 의 `injectedJavaScriptBeforeContentLoaded` prop.
 */
export function buildShim(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
  const envApi = proc?.env?.EXPO_PUBLIC_API_BASE_URL;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDev = typeof (globalThis as any).__DEV__ !== 'undefined' ? (globalThis as any).__DEV__ : false;
  const apiBaseUrl = envApi || (isDev ? 'http://localhost:8080' : 'https://api.samhan-air.com');
  return getInjectedEstimateShim({
    apiBaseUrl,
    token: null,
    employeeCode: null,
    userEmail: null,
  });
}

/**
 * estimate-app v2 가 사용하는 11 RPC 함수 inventory — TM 검토 / 디버깅용.
 * v1 과 동일.
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
