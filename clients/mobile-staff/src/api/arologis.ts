/**
 * arologis-service driver-app API client — Phase 10 W10-3 신규 + Phase F (D-DF-07/12) 갱신.
 *
 * 출처: `services/arologis-service/.../ArologisDriverAppController.java` 3 endpoint + sign-and-send-copy.
 *
 * Base URL = `EXPO_PUBLIC_API_BASE_URL` (default `http://localhost:8080` = api-gateway 진입).
 * gateway 가 JWT verify + ROLE_DRIVER 확인 + X-User-* 주입 후 arologis-service 8097 으로 forward.
 *
 * 인증:
 *   - JWT = user-service 발급 (Bearer access token).
 *   - WebView 안 legacy estimate 의 sessionStorage 저장 token 을 RN driver tab 에서 별도 보관 X.
 *     → driver tab 진입 시점에 user-service `/api/v1/auth/me` 호출하여 ROLE_DRIVER 확인 후 token 보관.
 *
 * UUID 비공개:
 *   - 응답에 driverCode + 정차 식별자 (parsed_partner_code 전표번호) 만 노출.
 *   - dispatch UUID 는 path parameter 로만 사용 (UI 에 표시 X).
 */

import { encode as base64Encode } from 'base-64';

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

// ----------------------------------------------------------------------
// 응답 타입 — backend ArologisDriverAppController.java 와 1:1.
// ----------------------------------------------------------------------

export interface DispatchVehicleSummary {
  vehicleSequence: number;
  tonnage: 'TONNAGE_1' | 'TONNAGE_1_4' | 'TONNAGE_2_5' | 'TONNAGE_5' | 'TONNAGE_BIG';
  status: 'PENDING' | 'MATCHING' | 'ASSIGNED' | 'DEPARTED' | 'DELIVERED' | 'CANCELLED';
}

export interface DispatchStopSummary {
  stopSequence: number;
  rawText: string;
  parsedAddress: string | null;
  parsedPartnerName: string | null;
  parsedPartnerCode: string | null;
  notes: string | null;
  status: 'PENDING' | 'ARRIVED' | 'DELIVERED' | 'FAILED' | 'UNPARSED';
}

/**
 * 본 어플 driver 의 오늘 배정 vehicle 목록.
 *
 * 본 PR (W10-3) 시점 backend 응답 = `[{vehicleSequence, tonnage, status}]` (W10-1 단순화).
 * UI 표시는 backend 응답을 그대로 사용 + stops 는 향후 W10-3 backend 확장 시 활성.
 */
export async function fetchTodayDispatches(token: string | null): Promise<DispatchVehicleSummary[]> {
  const url = `${API_BASE_URL}/driver-app/arologis/dispatches/today`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    throw new ArologisApiError(res.status, `today fetch failed: HTTP ${res.status}`);
  }
  // FE-2 채택 fix — ApiResponse<T> wrapper 명시 + schema assert (silent fall-through 제거)
  const json = await res.json();
  assertApiResponseSuccess(json, 'today');
  return (json.data ?? []) as DispatchVehicleSummary[];
}

/**
 * GPS 위치 보고 (driver-app foreground 30초 주기).
 *
 * source = APP_GPS_ACTIVE (foreground 권한 O 시점). background 시 source = APP_GPS_BACKGROUND.
 *
 * BE-1 / QA-3 / Designer-2 통합 채택 fix 일관 — backend `DriverLocationSource` enum 4값.
 */
export interface ReportLocationPayload {
  latitude: number;
  longitude: number;
  capturedAt: string; // ISO8601 — `new Date().toISOString()`
  source?: 'APP_GPS_ACTIVE' | 'APP_GPS_BACKGROUND';
}

export async function reportLocation(
  token: string | null,
  payload: ReportLocationPayload,
): Promise<{ locationId: string; capturedAt: string }> {
  const url = `${API_BASE_URL}/driver-app/arologis/locations`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      latitude: String(payload.latitude),
      longitude: String(payload.longitude),
      capturedAt: payload.capturedAt,
      source: payload.source ?? 'APP_GPS_ACTIVE',
    }),
  });
  if (!res.ok) {
    throw new ArologisApiError(res.status, `location report failed: HTTP ${res.status}`);
  }
  // FE-2 채택 fix — ApiResponse wrapper 명시 + schema assert
  const json = await res.json();
  assertApiResponseSuccess(json, 'location');
  return json.data as { locationId: string; capturedAt: string };
}

/**
 * 전자서명 등록 (정차 도착 시점).
 *
 * imageRef = base64 PNG dataURL (`data:image/png;base64,...`).
 * latitude/longitude = 서명 시점 GPS 위치 (정확도 NUMERIC(10,7) ~1.1cm).
 * signatureSource = APP (backend SignatureSource enum).
 */
export interface SignaturePayload {
  imageRef: string;       // base64 PNG dataURL or storage ref
  latitude?: number;
  longitude?: number;
}

/**
 * 전자서명 등록 응답 — Phase 10 W10-4 (PR #99) 종합 TM (FE-3 채택) 통합:
 * - signatureId — arologis 자체 signatures INSERT id
 * - slipBridged — slip-service 양쪽 저장 성공 여부 (true = 동기화 OK / false = 자체 저장만)
 * - capturedAt — 서명 캡처 시각 ISO
 */
export interface SignatureSubmitResult {
  signatureId: string;
  slipBridged: boolean;
  capturedAt: string;
}

export async function submitSignature(
  token: string | null,
  dispatchId: string,
  vehicleSeq: number,
  stopSeq: number,
  payload: SignaturePayload,
): Promise<SignatureSubmitResult> {
  const url = `${API_BASE_URL}/driver-app/arologis/dispatches/${dispatchId}/vehicles/${vehicleSeq}/stops/${stopSeq}/sign`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const body: Record<string, string> = { imageRef: payload.imageRef };
  if (payload.latitude !== undefined) body.latitude = String(payload.latitude);
  if (payload.longitude !== undefined) body.longitude = String(payload.longitude);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ArologisApiError(res.status, `signature submit failed: HTTP ${res.status}`);
  }
  // FE-2 채택 fix — ApiResponse wrapper 명시 + schema assert
  const json = await res.json();
  assertApiResponseSuccess(json, 'signature');
  const data = json.data as Partial<SignatureSubmitResult> | null | undefined;
  return {
    signatureId: data?.signatureId ?? '',
    slipBridged: Boolean(data?.slipBridged),
    capturedAt: data?.capturedAt ?? '',
  };
}

// ----------------------------------------------------------------------
// Phase F (D-DF-07/12) — sign-and-send-copy 1-tap endpoint.
// arologis POST /driver-app/.../sign-and-send-copy
// 응답 분기:
//   200 image/png        → success (PNG byte[] 응답 + X-* 헤더로 메타)
//   200 application/json → fail (서명 양쪽 저장은 OK, 사본 합성/발송 실패)
//   409 application/json → duplicate (이미 사본 발송됨)
//   422 application/json → bridge fail (서명 양쪽 저장 자체 실패, 롤백)
// ----------------------------------------------------------------------

export interface SignAndSendCopyRequest {
  /** 기사 서명 base64 PNG (헤더 prefix 포함 또는 raw). */
  driverSignatureBase64: string;
  /** 인수자 서명 base64 PNG. */
  recipientSignatureBase64: string;
  /** 캡처 시각 ISO LocalDateTime (서버 timezone — 'Z' 제거). */
  capturedAt: string;
  /** 캡처 시점 GPS 위도 (옵션). */
  gpsLat?: number;
  /** 캡처 시점 GPS 경도 (옵션). */
  gpsLng?: number;
}

/**
 * 사본 합성/발송 실패 사유 — backend `CopyFailureReason` enum 1:1.
 * - `RECIPIENT_PHONE_MISSING` — slip 의 인수자 번호 미등록 (Admin 재발송 필요).
 * - `RENDERER_TIMEOUT` — Playwright PNG 합성 timeout (재시도 가능).
 * - `RENDERER_ERROR` — Playwright 렌더 실패 (재시도 가능).
 * - `STORAGE_FULL` — 디스크 가용량 부족 (재시도 의미 없음).
 */
export type CopyFailureReason =
  | 'RECIPIENT_PHONE_MISSING'
  | 'RENDERER_TIMEOUT'
  | 'RENDERER_ERROR'
  | 'STORAGE_FULL';

/**
 * sign-and-send-copy JSON 응답 (fail / duplicate / bridge 모두 동일 schema).
 * backend `SignAndSendCopyResponse` DTO 와 1:1.
 */
export interface SignAndSendCopyJsonResponse {
  signatureId?: string;
  slipBridged?: boolean;
  copySent: boolean;
  copySentAt?: string;
  copyRecipientPhoneMasked?: string;
  copyFailureReason?: CopyFailureReason;
  error?: string;
  previousCopySentAt?: string;
  retryable?: boolean;
}

/**
 * 성공 응답 — image/png byte[] + X-* 헤더 메타.
 */
export interface SignAndSendCopySuccess {
  kind: 'success';
  /** PNG byte[] base64 인코딩 (FileSystem.writeAsStringAsync encoding='base64' 호환). */
  pngBase64: string;
  signatureId: string;
  copySentAt: string;
  copyRecipientPhoneMasked: string;
}

/**
 * 실패 응답 분기.
 *  - kind='fail'      : 200 application/json (copySent=false) — 서명 OK, 사본 fail
 *  - kind='duplicate' : 409 — 이미 사본 발송됨
 *  - kind='bridge'    : 422 — 서명 양쪽 저장 자체 실패 (롤백)
 */
export interface SignAndSendCopyFail {
  kind: 'fail' | 'duplicate' | 'bridge';
  json: SignAndSendCopyJsonResponse;
  status: number;
}

/**
 * Phase F (D-DF-07) — 양쪽 저장 + 사본 PNG 합성/저장 1-tap.
 *
 * <p>Accept = `image/png, application/json` (서버가 분기 응답).
 *
 * <p>응답 분기:
 * - 200 image/png → success (PNG byte[] base64, X-Signature-Id / X-Copy-Sent-At / X-Copy-Recipient-Phone-Masked 헤더)
 * - 200 application/json (copySent=false) → fail (서명만 OK)
 * - 409 application/json → duplicate (previousCopySentAt 포함)
 * - 422 application/json → bridge fail (롤백 완료, retryable=true 시 재시도 가능)
 */
export async function signAndSendCopy(
  token: string | null,
  dispatchId: string,
  vehicleSeq: number,
  stopSeq: number,
  request: SignAndSendCopyRequest,
): Promise<SignAndSendCopySuccess | SignAndSendCopyFail> {
  const url = `${API_BASE_URL}/driver-app/arologis/dispatches/${dispatchId}/vehicles/${vehicleSeq}/stops/${stopSeq}/sign-and-send-copy`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'image/png, application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  const contentType = response.headers.get('content-type') ?? '';

  if (response.ok && contentType.includes('image/png')) {
    const buffer = await response.arrayBuffer();
    const pngBase64 = arrayBufferToBase64(buffer);
    return {
      kind: 'success',
      pngBase64,
      signatureId: response.headers.get('X-Signature-Id') ?? '',
      copySentAt: response.headers.get('X-Copy-Sent-At') ?? '',
      copyRecipientPhoneMasked: response.headers.get('X-Copy-Recipient-Phone-Masked') ?? '',
    };
  }

  // JSON 분기 — 서버가 항상 ApiResponse wrapper 가 아니라 정의된 SignAndSendCopyResponse DTO 직접 반환.
  // 따라서 assertApiResponseSuccess 우회.
  let json: SignAndSendCopyJsonResponse;
  try {
    json = (await response.json()) as SignAndSendCopyJsonResponse;
  } catch {
    json = { copySent: false, error: `HTTP ${response.status} (응답 파싱 실패)` };
  }
  if (response.status === 409) {
    return { kind: 'duplicate', json, status: 409 };
  }
  if (response.status === 422) {
    return { kind: 'bridge', json, status: 422 };
  }
  return { kind: 'fail', json, status: response.status };
}

/**
 * ArrayBuffer → base64 (RN/Hermes 호환). React Native 에는 atob/btoa 가 없으므로 base-64 npm 사용.
 *
 * <p>대용량 PNG (수백 KB) 는 String.fromCharCode(...new Uint8Array) 가 stack overflow 가능 →
 * 8KB chunk 단위로 분할.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB chunk
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return base64Encode(binary);
}

/**
 * ApiResponse wrapper schema assert — FE-2 채택 fix (silent fall-through 제거).
 *
 * backend ApiResponse: `{ success: boolean, data: T | null, code?: string, message?: string }`
 * — `success !== true` 또는 wrapper 부재 시 ArologisApiError throw.
 */
function assertApiResponseSuccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any,
  endpointLabel: string,
): asserts json is { success: true; data: unknown; code?: string; message?: string } {
  if (json == null || typeof json !== 'object') {
    throw new ArologisApiError(0, `${endpointLabel} 응답 schema 위반 — body 가 객체가 아닙니다`);
  }
  if (json.success !== true) {
    const code = typeof json.code === 'string' ? json.code : 'UNKNOWN';
    const message = typeof json.message === 'string' ? json.message : `${endpointLabel} 실패`;
    throw new ArologisApiError(0, `${endpointLabel} ApiResponse.success=false (code=${code}, message=${message})`);
  }
}

export class ArologisApiError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ArologisApiError';
    this.status = status;
  }
}
