/**
 * 영업 API client 공통 유틸 — P1-4 신규.
 *
 * arologis.ts 의 resolveApiBaseUrl / assertApiResponseSuccess / ArologisApiError 패턴을
 * 영업 API 용으로 동등 복제 (두 모듈이 독립 번들 — 상호 import 없음).
 */

const DEFAULT_DEV_API = 'http://localhost:8080';
const DEFAULT_PROD_API = 'https://api.samhan-air.com';

function resolveApiBaseUrl(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
  const envUrl = proc?.env?.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) return envUrl;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDev = typeof (globalThis as any).__DEV__ !== 'undefined' ? (globalThis as any).__DEV__ : false;
  return isDev ? DEFAULT_DEV_API : DEFAULT_PROD_API;
}

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * ApiResponse wrapper schema assert — backend `{ success, data, code, message }` 구조 검증.
 * success !== true 또는 wrapper 부재 시 SalesApiError throw.
 */
export function assertApiResponseSuccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any,
  endpointLabel: string,
): asserts json is { success: true; data: unknown; code?: string; message?: string } {
  if (json == null || typeof json !== 'object') {
    throw new SalesApiError(0, `${endpointLabel} 응답 schema 위반 — body 가 객체가 아닙니다`);
  }
  if (json.success !== true) {
    const code = typeof json.code === 'string' ? json.code : 'UNKNOWN';
    const message = typeof json.message === 'string' ? json.message : `${endpointLabel} 실패`;
    throw new SalesApiError(0, `${endpointLabel} ApiResponse.success=false (code=${code}, message=${message})`);
  }
}

export class SalesApiError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SalesApiError';
    this.status = status;
  }
}
