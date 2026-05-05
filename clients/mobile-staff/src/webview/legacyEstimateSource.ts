/**
 * mobile-staff v2 — estimate-app v2 (Node + Express + EJS) 의 source URL 결정.
 *
 * 출처: v1 (PR #63 close, commit `d69a7f7`) 의 legacyEstimateSource.ts 1:1 — v2 에서는 인증
 * 폐기에 따라 `userEmail` query 추가 흐름이 옵션화 (default 미부여 → estimate-app v2 가 자체 처리).
 *
 * 운영:
 *   - dev (`__DEV__ === true`): `http://localhost:5183/`
 *     (clients/web/estimate-app v2 dev server — `npm run dev` PORT 5183)
 *   - production: `https://estimate.samhan-air.com/`
 *     (DECISIONS Phase 6 Section 4 sub-domain)
 *
 * 모바일 자동 분기 (코드 변경 0):
 *   - estimate-app v2 의 views/index.ejs 의 line 162 `body.mobile-mode .grid` /
 *     line 530 `.mobile-only { display: none; }` (기본 desktop 숨김) /
 *     line 533 `@media (max-width: 1280px) { ... .mobile-only { display: table-cell !important } }` /
 *     line 7157 `const mqMobile = window.matchMedia('(max-width: 1280px)')` /
 *     line 7187 `document.body.classList.toggle('mobile-mode', isMobile)`
 *   → react-native-webview 의 device width (iPhone 14 Pro = 390, Galaxy S22 = 360) → mobile-mode 자동.
 *
 * 환경변수 override:
 *   - `EXPO_PUBLIC_ESTIMATE_APP_URL` 가 정의되면 dev/prod 분기 무시하고 사용.
 *
 * UUID 미노출:
 *   - estimate-app v2 의 `?email=` query 자리에 사번 기반 식별자 전달 (e.g. "S001@samhan-air.com").
 *   - v2 default 는 query 미부여 — WebView 안 legacy 의 default user 처리.
 */

const DEFAULT_DEV_URL = 'http://localhost:5183/';
const DEFAULT_PROD_URL = 'https://estimate.samhan-air.com/';

export interface LegacyEstimateUriOptions {
  /** dev override URL — Expo Go LAN 테스트용 (e.g. `http://192.168.0.5:5183/`). */
  devOverride?: string;
  /** EJS render 시 사용자 식별용 query parameter (`?email=...`). v2 default 미부여. */
  userEmail?: string;
}

/**
 * Expo SDK 53 의 `EXPO_PUBLIC_ESTIMATE_APP_URL` 환경변수 우선 채택.
 */
function resolveBaseUrl(devOverride?: string): string {
  if (devOverride) return devOverride;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
  const envUrl = proc?.env?.EXPO_PUBLIC_ESTIMATE_APP_URL;
  if (envUrl) return envUrl;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDev = typeof (globalThis as any).__DEV__ !== 'undefined' ? (globalThis as any).__DEV__ : false;
  return isDev ? DEFAULT_DEV_URL : DEFAULT_PROD_URL;
}

/**
 * estimate-app v2 의 진입 URL.
 *
 * @param opts.userEmail — `?email=...` query 추가. 미정의 시 estimate-app v2 가 default user 처리.
 * @param opts.devOverride — dev URL 강제 override.
 */
export function getLegacyEstimateUri(opts: LegacyEstimateUriOptions = {}): string {
  const base = resolveBaseUrl(opts.devOverride);
  if (opts.userEmail) {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}email=${encodeURIComponent(opts.userEmail)}`;
  }
  return base;
}

/**
 * v2 임무 명세 시그니처 — 무인자 helper. `getLegacyEstimateUri()` 의 default 흐름과 동일.
 *
 * 사용 위치: `EstimateWebViewScreen.tsx` 의 `WebView source.uri`.
 */
export function getEstimateAppUrl(): string {
  return getLegacyEstimateUri();
}

/** dev / prod base URL pair (헬퍼 export — 디버깅 / .env.example 검증용). */
export const LEGACY_ESTIMATE_URLS = {
  dev: DEFAULT_DEV_URL,
  prod: DEFAULT_PROD_URL,
};

/**
 * estimate-app v2 URL 환경변수 검증 — RootNavigator hydrate 단계 (v1) 또는 EstimateWebViewScreen
 * mount 단계 (v2) 에서 호출 가능.
 *
 * @returns 환경변수 또는 default 가 정상 URL 형태인지 boolean.
 */
export function validateEstimateAppUrl(): { ok: boolean; url: string; source: 'env' | 'default-dev' | 'default-prod' } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
  const envUrl = proc?.env?.EXPO_PUBLIC_ESTIMATE_APP_URL;
  if (envUrl) {
    try {
      // eslint-disable-next-line no-new
      new URL(envUrl);
      return { ok: true, url: envUrl, source: 'env' };
    } catch {
      return { ok: false, url: envUrl, source: 'env' };
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDev = typeof (globalThis as any).__DEV__ !== 'undefined' ? (globalThis as any).__DEV__ : false;
  const url = isDev ? DEFAULT_DEV_URL : DEFAULT_PROD_URL;
  return { ok: true, url, source: isDev ? 'default-dev' : 'default-prod' };
}
