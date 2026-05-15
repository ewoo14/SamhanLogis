/**
 * arologis-service driver-app API client.
 *
 * D-AX-15/16 범위는 dashboard + GPS + sign-and-send-copy 이식을 포함한다.
 * Base URL / Authorization / refresh rotation 은 `apiFetch` 가 담당한다.
 */
import { encode as base64Encode } from 'base-64';
import { apiFetch, apiFetchRaw } from './client';

export interface DispatchVehicleSummary {
  dispatchDate: string;
  dispatchType: 'DAY' | 'NIGHT' | 'EXPRESS';
  vehicleSequence: number;
  tonnage: 'TONNAGE_1' | 'TONNAGE_1_4' | 'TONNAGE_2_5' | 'TONNAGE_5' | 'TONNAGE_BIG';
  label?: string | null;
  status: 'PENDING' | 'MATCHING' | 'ASSIGNED' | 'DEPARTED' | 'DELIVERED' | 'CANCELLED';
  stops: DriverStopSummary[];
}

export interface DriverStopSummary {
  stopSequence: number;
  rawText: string;
  parsedAddress?: string | null;
  parsedPartnerName?: string | null;
  parsedKakaoSeq?: number | null;
  notes?: string | null;
  status: 'PENDING' | 'ARRIVED' | 'DELIVERED' | 'FAILED' | 'UNPARSED';
}

export type PhotoType = 'DELIVERY' | 'INSPECTION';

export interface AttachmentUploadInput {
  uri: string;
  fileName: string;
  mimeType: string;
  exifGpsLat?: number | null;
  exifGpsLng?: number | null;
  capturedAt?: string | null;
  parsedKakaoSeq?: number | null;
}

export interface StopPhotoUploadResponse {
  attachmentType: PhotoType;
  fileName: string;
  fileSize: number;
  contentType: string;
  exifGpsLat?: string | null;
  exifGpsLng?: string | null;
  capturedAt?: string | null;
  uploadedAt: string;
}

interface StopPhotoUploadRawResponse extends Omit<StopPhotoUploadResponse, 'attachmentType'> {
  photoType?: PhotoType;
  attachmentType?: PhotoType;
  downloadUrl?: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  code?: string;
  message?: string;
}

export async function fetchTodayDispatches(token: string | null): Promise<DispatchVehicleSummary[]> {
  void token;
  const response = await apiFetch<ApiResponse<DispatchVehicleSummary[]>>(
    '/driver-app/arologis/dispatches/today',
    {
      method: 'GET',
    },
  );
  assertApiResponseSuccess(response, '오늘의 배차');
  return response.data ?? [];
}

export interface ReportLocationPayload {
  latitude: number;
  longitude: number;
  capturedAt: string;
  source?: 'APP_GPS_ACTIVE' | 'APP_GPS_BACKGROUND';
}

export async function reportLocation(
  token: string | null,
  payload: ReportLocationPayload,
): Promise<{ locationId: string; capturedAt: string }> {
  void token;
  const response = await apiFetch<ApiResponse<{ locationId: string; capturedAt: string }>>(
    '/driver-app/arologis/locations',
    {
      method: 'POST',
      body: JSON.stringify({
        latitude: String(payload.latitude),
        longitude: String(payload.longitude),
        capturedAt: payload.capturedAt,
        source: payload.source ?? 'APP_GPS_ACTIVE',
      }),
    },
  );
  assertApiResponseSuccess(response, 'GPS 위치 보고');
  return response.data ?? { locationId: '', capturedAt: payload.capturedAt };
}

export interface SignAndSendCopyRequest {
  /** 기사 서명 base64 PNG (data URL prefix 포함 가능). */
  driverSignatureBase64: string;
  /** 인수자 서명 base64 PNG. */
  recipientSignatureBase64: string;
  /** 서버 LocalDateTime 파싱용 ISO 문자열 — timezone Z 제거 후 전송. */
  capturedAt: string;
  gpsLat?: number;
  gpsLng?: number;
  parsedKakaoSeq?: number | null;
}

export type CopyFailureReason =
  | 'RECIPIENT_PHONE_MISSING'
  | 'RENDERER_TIMEOUT'
  | 'RENDERER_ERROR'
  | 'STORAGE_FULL';

export interface SignAndSendCopyJsonResponse {
  signatureId?: string;
  slipBridged?: boolean;
  copySent?: boolean;
  copySentAt?: string;
  copyRecipientPhoneMasked?: string;
  copyFailureReason?: CopyFailureReason;
  error?: string;
  retryable?: boolean;
  previousCopySentAt?: string;
}

export interface SignAndSendCopySuccess {
  kind: 'success';
  pngBase64: string;
  signatureId?: string;
  copySentAt?: string;
  copyRecipientPhoneMasked?: string;
}

export interface SignAndSendCopyFail {
  kind: 'fail' | 'duplicate' | 'bridge';
  status: number;
  signatureId?: string;
  copyFailureReason?: CopyFailureReason;
  error?: string;
  retryable?: boolean;
  previousCopySentAt?: string;
}

export type SignAndSendCopyResult = SignAndSendCopySuccess | SignAndSendCopyFail;

export async function signAndSendCopy(
  token: string | null,
  dispatchType: DispatchVehicleSummary['dispatchType'],
  vehicleSeq: number,
  stopSeq: number,
  request: SignAndSendCopyRequest,
): Promise<SignAndSendCopyResult> {
  void token;
  const response = await apiFetchRaw(
    `/driver-app/arologis/dispatches/today/${dispatchType}/vehicles/${vehicleSeq}/stops/${stopSeq}/sign-and-send-copy`,
    {
      method: 'POST',
      headers: {
        Accept: 'image/png, application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
    { throwOnHttpError: false },
  );

  const contentType = response.headers.get('content-type') ?? '';
  if (response.ok && contentType.includes('image/png')) {
    const pngBase64 = arrayBufferToBase64(await response.arrayBuffer());
    return {
      kind: 'success',
      pngBase64,
      signatureId: response.headers.get('X-Signature-Id') ?? undefined,
      copySentAt: response.headers.get('X-Copy-Sent-At') ?? undefined,
      copyRecipientPhoneMasked: response.headers.get('X-Copy-Recipient-Phone-Masked') ?? undefined,
    };
  }

  const json = await parseSignAndSendCopyJson(response);
  if (response.status === 409) {
    return {
      kind: 'duplicate',
      status: response.status,
      error: json.error ?? 'COPY_ALREADY_SENT',
      previousCopySentAt: json.previousCopySentAt,
    };
  }
  if (response.status === 422) {
    return {
      kind: 'bridge',
      status: response.status,
      error: json.error ?? 'SIGNATURE_BRIDGE_FAILED',
      retryable: json.retryable,
    };
  }
  return {
    kind: 'fail',
    status: response.status,
    signatureId: json.signatureId,
    copyFailureReason: json.copyFailureReason,
    error: json.error,
    retryable: json.retryable,
  };
}

export async function uploadStopPhoto(
  token: string | null,
  dispatchType: DispatchVehicleSummary['dispatchType'],
  vehicleSeq: number,
  stopSeq: number,
  photoType: PhotoType,
  input: AttachmentUploadInput,
): Promise<StopPhotoUploadResponse> {
  void token;
  const body = buildStopPhotoMultipart(input);
  const response = await apiFetchRaw(
    `/driver-app/arologis/dispatches/today/${dispatchType}/vehicles/${vehicleSeq}/stops/${stopSeq}/photos/${photoType}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body,
    },
  );
  const json = (await response.json()) as ApiResponse<StopPhotoUploadRawResponse>;
  assertApiResponseSuccess(json, '사진 업로드');
  if (!json.data) {
    throw new ArologisApiError(0, '사진 업로드 응답 데이터가 없습니다');
  }
  return normalizeStopPhotoUploadResponse(json.data, photoType);
}

function normalizeStopPhotoUploadResponse(
  raw: StopPhotoUploadRawResponse,
  requestedPhotoType: PhotoType,
): StopPhotoUploadResponse {
  return {
    attachmentType: raw.attachmentType ?? raw.photoType ?? requestedPhotoType,
    fileName: raw.fileName,
    fileSize: raw.fileSize,
    contentType: raw.contentType,
    exifGpsLat: raw.exifGpsLat,
    exifGpsLng: raw.exifGpsLng,
    capturedAt: raw.capturedAt,
    uploadedAt: raw.uploadedAt,
  };
}

function buildStopPhotoMultipart(input: AttachmentUploadInput): FormData {
  const form = new FormData();
  form.append('file', {
    uri: input.uri,
    name: input.fileName,
    type: input.mimeType,
  } as unknown as Blob);
  if (input.parsedKakaoSeq != null) form.append('parsedKakaoSeq', String(input.parsedKakaoSeq));
  if (input.exifGpsLat != null) form.append('exifGpsLat', String(input.exifGpsLat));
  if (input.exifGpsLng != null) form.append('exifGpsLng', String(input.exifGpsLng));
  if (input.capturedAt) form.append('capturedAt', input.capturedAt);
  return form;
}

async function parseSignAndSendCopyJson(response: Response): Promise<SignAndSendCopyJsonResponse> {
  try {
    return (await response.json()) as SignAndSendCopyJsonResponse;
  } catch {
    return { copySent: false, error: `HTTP ${response.status} 응답 파싱 실패` };
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return base64Encode(binary);
}

function assertApiResponseSuccess<T>(
  response: ApiResponse<T>,
  label: string,
): asserts response is ApiResponse<T> & { success: true } {
  if (!response || typeof response !== 'object') {
    throw new ArologisApiError(0, `${label} 응답 형식 오류`);
  }
  if (response.success !== true) {
    const code = response.code ?? 'UNKNOWN';
    const message = response.message ?? `${label} 실패`;
    throw new ArologisApiError(0, `${message} (code=${code})`);
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
