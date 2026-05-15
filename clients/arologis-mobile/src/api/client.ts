/**
 * arologis-mobile fetch 래퍼 — `/auth/driver/login` 및 `/driver-app/arologis/**` 호출.
 *
 * axios 미도입 — RN expo 환경에서 가벼운 fetch + 자체 인터셉터로 충분.
 * 헤더 / 401 자동 logout / refresh rotation 은 본 모듈 안에서 구현.
 *
 * Base URL 결정 우선순위:
 * 1) `EXPO_PUBLIC_AROLOGIS_API_BASE` — 빌드 시 주입 (예: `https://api.arologis.samhan-air.com`).
 * 2) `__DEV__` 일 때 `http://localhost:8097` (arologis-service 직접).
 * 3) production fallback `https://api.arologis.samhan-air.com`.
 */
import { clearAuth, getAuth, setAuth } from '../stores/authStore';

const DEFAULT_DEV_API = 'http://localhost:8097';
const DEFAULT_PROD_API = 'https://api.arologis.samhan-air.com';

function resolveBaseUrl(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
  const envUrl = proc?.env?.EXPO_PUBLIC_AROLOGIS_API_BASE;
  if (envUrl) return envUrl;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDev = typeof (globalThis as any).__DEV__ !== 'undefined' ? (globalThis as any).__DEV__ : false;
  return isDev ? DEFAULT_DEV_API : DEFAULT_PROD_API;
}

export const API_BASE_URL = resolveBaseUrl();

interface RequestOptions {
  /** 401 시 자동 refresh 시도 여부 — 본 모듈 내부 재진입 차단용 (default true). */
  retryOnUnauthorized?: boolean;
  /** raw response 소비자가 4xx/5xx 분기를 직접 처리할 때 false 로 지정한다. */
  throwOnHttpError?: boolean;
}

/**
 * fetch 래퍼 — Authorization 헤더 자동 주입 + 401 시 refresh rotation 1회.
 *
 * @throws {ApiError} HTTP 4xx/5xx 응답 또는 네트워크 오류
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const response = await apiFetchRaw(path, init, options);

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/**
 * raw fetch 래퍼 — Authorization / refresh rotation 은 유지하고 응답 parsing 은 호출자가 담당한다.
 *
 * image/png 처럼 JSON 이 아닌 응답이나 409/422 JSON 분기 자체가 정상 계약인 endpoint 에서 사용한다.
 */
export async function apiFetchRaw(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<Response> {
  const retryOnUnauthorized = options.retryOnUnauthorized ?? true;
  const throwOnHttpError = options.throwOnHttpError ?? true;
  const auth = getAuth();
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body != null && !isFormDataBody(init.body)) {
    headers.set('Content-Type', 'application/json');
  }
  if (auth?.accessToken) {
    headers.set('Authorization', `Bearer ${auth.accessToken}`);
  }
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const response = await fetch(url, { ...init, headers });

  if (response.status === 401 && retryOnUnauthorized && auth?.refreshToken) {
    // refresh 후 본 요청 1회 재시도.
    const rotated = await tryRefresh();
    if (rotated) {
      return apiFetchRaw(path, init, { ...options, retryOnUnauthorized: false });
    }
    clearAuth();
    throw new ApiError(response.status, '인증이 만료되었습니다. 다시 로그인해 주세요.');
  }

  if (!response.ok) {
    if (!throwOnHttpError) return response;
    let message = response.statusText;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // ignore body parse error
    }
    throw new ApiError(response.status, message);
  }

  return response;
}

function isFormDataBody(body: BodyInit): boolean {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

/**
 * refreshToken 으로 access token 회전 시도. 성공 시 true.
 */
async function tryRefresh(): Promise<boolean> {
  const auth = getAuth();
  if (!auth?.refreshToken) return false;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    if (!response.ok) return false;
    const next = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      role: string;
      expiresAt: string;
      driverCode?: string | null;
      phoneNumber?: string | null;
    };
    setAuth({
      ...auth,
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      expiresAt: next.expiresAt,
      role: next.role,
      driverCode: next.driverCode ?? auth.driverCode,
      phoneNumber: next.phoneNumber ?? auth.phoneNumber,
    });
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}
