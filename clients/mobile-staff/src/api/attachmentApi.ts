/**
 * 첨부파일 API client — mobile-staff 사진 첨부 (P1 3건 통합).
 *
 * <p>P1 사진 첨부 4가지 흐름 (TM PR #147 fix — gateway routing 정합성 확보):
 * <ol>
 *   <li>검수 사진 (INSPECTION) — {@link uploadInspectionAttachment}:
 *       client URL {@code /api/v1/inventory/inspections/{slipId}/attachments} (인증).
 *       gateway StripPrefix=2 후 inventory-service 도착 경로
 *       {@code /inventory/inspections/{slipId}/attachments}.</li>
 *   <li>배송 완료 사진 (DELIVERY, 인증) — {@link uploadDeliveryAttachment}:
 *       client URL {@code /api/v1/slips/{slipId}/delivery-attachments}
 *       (DRIVER/MANAGER/MASTER). gateway StripPrefix=2 후 slip-service 도착 경로
 *       {@code /slips/{slipId}/delivery-attachments}.</li>
 *   <li>배송 완료 사진 (token 비인증) — {@link uploadAttachmentByToken}:
 *       client URL {@code /api/public/batches/{token}/slips/{slipNo}/attachments}.</li>
 *   <li>영업 방문 사진 (VISIT_PHOTO) — {@link uploadVisitAttachment}:
 *       client URL {@code /api/v1/partners/admin/partners/{partnerCode}/visit-attachments} (인증).
 *       gateway StripPrefix=2 후 partner-service 도착 경로
 *       {@code /admin/partners/{partnerCode}/visit-attachments}.
 *       UUID 비공개 가드 — partnerCode (비즈니스 식별자) 만 사용.</li>
 * </ol>
 *
 * <p>매뉴얼: {@code docs/manual/04-모바일/04-사진-첨부.md}.
 *
 * <p>UUID 비공개 가드:
 * <ul>
 *   <li>응답 {@code id} (attachment UUID), {@code slipId} 는 API 경로 전용, 화면 미노출.</li>
 *   <li>방문 사진은 {@code partnerCode} (비즈니스 식별자) 만 사용 — UUID 비공개 의무 강제.</li>
 *   <li>사용자에게는 fileName + uploadedAt + capturedAt 만 노출.</li>
 * </ul>
 */

import { API_BASE_URL } from './salesUtils';

// ----------------------------------------------------------------------
// 응답 타입 — backend SlipAttachmentResponse record 와 1:1.
// ----------------------------------------------------------------------

export type SlipAttachmentTypeApi = 'DELIVERY' | 'INSPECTION' | 'ESTIMATE' | 'VISIT_PHOTO';

export interface SlipAttachmentResponseDto {
  id: string;                      // UUID — UI 노출 X
  slipId: string;                  // UUID — UI 노출 X
  attachmentType: SlipAttachmentTypeApi;
  fileName: string;
  fileSize: number;                // bytes
  contentType: string;
  exifGpsLat: string | null;       // BigDecimal → string (정밀도 보존)
  exifGpsLng: string | null;
  capturedAt: string | null;       // ISO-8601
  uploadedBy: string;
  uploadedAt: string;              // ISO-8601
  downloadUrl: string | null;      // presigned URL (1시간 유효, 캐시)
}

// ----------------------------------------------------------------------
// 업로드 입력 — RN 환경 (expo-image-picker / expo-image-manipulator) 결과 정규화.
// ----------------------------------------------------------------------

export interface AttachmentUploadInput {
  /** local file URI (file:// 접두) — image-picker / image-manipulator 결과. */
  uri: string;
  /** 파일명 (확장자 포함). picker.assets[].fileName 또는 자동 생성 (capture-{ts}.jpg). */
  fileName: string;
  /** MIME — image/jpeg | image/png | application/pdf */
  mimeType: string;
  /** EXIF GPS 위도 (옵션). */
  exifGpsLat?: number | null;
  /** EXIF GPS 경도 (옵션). */
  exifGpsLng?: number | null;
  /** 촬영 시각 ISO-8601 (옵션). image-picker EXIF DateTimeOriginal 또는 RN `new Date()`. */
  capturedAt?: string | null;
}

// ----------------------------------------------------------------------
// public token 기반 업로드 — no auth, multipart/form-data.
// ----------------------------------------------------------------------

/**
 * 공개 배송 사진 업로드 (DeliveryBatch token + slipNo 검증).
 *
 * <p>client URL = {@code POST /api/public/batches/{token}/slips/{slipNo}/attachments}
 * <p>gateway slip-service-public route StripPrefix=1 후 도착
 *    {@code /public/batches/{token}/slips/{slipNo}/attachments}.
 * <p>BE 가 attachmentType=DELIVERY 를 강제한다.
 *
 * @param token DeliveryBatch token (URL safe)
 * @param slipNo 슬립 번호 (e.g. S-2026-00321)
 * @param input 업로드 파일 정규화 결과
 * @param onProgress 0~1 진행률 callback (선택, fetch 미지원 → polyfill 시점만 사용)
 * @returns 업로드 성공 응답
 */
export async function uploadAttachmentByToken(
  token: string,
  slipNo: string,
  input: AttachmentUploadInput,
  onProgress?: (ratio: number) => void,
): Promise<SlipAttachmentResponseDto> {
  const url = `${API_BASE_URL}/api/public/batches/${encodeURIComponent(token)}/slips/${encodeURIComponent(slipNo)}/attachments`;
  const body = buildMultipart(input);
  return uploadWithRetry(url, body, undefined, onProgress);
}

// ----------------------------------------------------------------------
// P1: 배송 완료 사진 업로드 (인증 — DRIVER/MANAGER/MASTER).
// ----------------------------------------------------------------------

/**
 * 배송 완료 사진 업로드 (인증) — DeliveryAttachmentController 전용.
 *
 * <p>client URL = {@code POST /api/v1/slips/{slipId}/delivery-attachments}
 * (Bearer JWT + DRIVER / SALES / MANAGER / MASTER role).
 * <p>gateway StripPrefix=2 후 slip-service 도착 경로
 *    {@code /slips/{slipId}/delivery-attachments}. BE 가 attachmentType=DELIVERY 강제.
 * <p>슬립 상태가 SHIPPING / DELIVERED / COMPLETED / CONFIRMED 일 때만 허용 (BE 409).
 *
 * @param token JWT access token (Bearer)
 * @param slipId 슬립 UUID (path param 전용)
 * @param input 업로드 파일 정규화 결과
 */
export async function uploadDeliveryAttachment(
  token: string | null,
  slipId: string,
  input: AttachmentUploadInput,
  onProgress?: (ratio: number) => void,
): Promise<SlipAttachmentResponseDto> {
  const url = `${API_BASE_URL}/api/v1/slips/${encodeURIComponent(slipId)}/delivery-attachments`;
  const body = buildMultipart(input);  // BE controller 가 type 파라미터 미요구 (DELIVERY 강제)
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return uploadWithRetry(url, body, headers, onProgress);
}

// ----------------------------------------------------------------------
// P1: 검수 사진 업로드 (창고/기사 — 인증 기반).
// ----------------------------------------------------------------------

/**
 * 검수 사진 업로드 — 입고 검수 시 화물 상태 / 불량 증빙 사진 (INSPECTION).
 *
 * <p>BE = {@code POST /api/v1/inventory/inspections/{slipId}/attachments}
 * (Bearer JWT + WAREHOUSE / DRIVER / MANAGER / MASTER role)
 *
 * @param token JWT access token (Bearer)
 * @param slipId 슬립 UUID (path param 전용)
 * @param input 업로드 파일 정규화 결과
 */
export async function uploadInspectionAttachment(
  token: string | null,
  slipId: string,
  input: AttachmentUploadInput,
  onProgress?: (ratio: number) => void,
): Promise<SlipAttachmentResponseDto> {
  const url = `${API_BASE_URL}/api/v1/inventory/inspections/${encodeURIComponent(slipId)}/attachments`;
  const body = buildMultipart(input, 'INSPECTION');
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return uploadWithRetry(url, body, headers, onProgress);
}

// ----------------------------------------------------------------------
// P1: 영업 방문 사진 업로드 (인증 기반).
// ----------------------------------------------------------------------

/** 방문 사진 업로드 입력 — AttachmentUploadInput + memo 필드 추가. */
export interface VisitAttachmentUploadInput extends AttachmentUploadInput {
  /** 방문 메모 (선택). */
  memo?: string | null;
}

/**
 * 영업 방문 사진 업로드.
 *
 * <p>client URL = {@code POST /api/v1/partners/admin/partners/{partnerCode}/visit-attachments}
 * (Bearer JWT + SALES / MANAGER / MASTER role).
 * <p>gateway StripPrefix=2 후 partner-service 도착 경로
 *    {@code /admin/partners/{partnerCode}/visit-attachments}.
 * <p>BE controller 가 AttachmentType=VISIT_PHOTO 강제 — type 파라미터 미요구.
 * <p>UUID 비공개 가드 — partnerCode (비즈니스 식별자) 만 사용.
 *
 * @param token JWT access token (Bearer)
 * @param partnerCode 거래처 코드 (비즈니스 식별자, UUID 비공개)
 * @param input 업로드 파일 + 메모 (description 으로 BE 전달)
 */
export async function uploadVisitAttachment(
  token: string | null,
  partnerCode: string,
  input: VisitAttachmentUploadInput,
  onProgress?: (ratio: number) => void,
): Promise<SlipAttachmentResponseDto> {
  const url = `${API_BASE_URL}/api/v1/partners/admin/partners/${encodeURIComponent(partnerCode)}/visit-attachments`;
  const body = buildMultipart(input);  // type 미전송 (BE 가 VISIT_PHOTO 강제)
  // BE PartnerVisitAttachmentController 는 description 파라미터를 받음 (memo → description 매핑).
  if (input.memo) body.append('description', input.memo);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return uploadWithRetry(url, body, headers, onProgress);
}

// ----------------------------------------------------------------------
// 인증 기반 업로드 (estimate mode P2 stub — Phase 12 활성).
// ----------------------------------------------------------------------

/**
 * 인증 사용자 사진 업로드 — estimate mode (P2 — Phase 12) 활성 예정.
 *
 * <p>BE = {@code POST /slips/{slipId}/attachments} (Bearer + role guard).
 * <p>본 함수는 향후 SalesEstimatePhotoScreen 진입 시 사용 — 현재 stub TODO.
 *
 * @param token JWT access token (Bearer)
 * @param slipId 슬립 UUID (estimate → slip 변환 후 ID 확보)
 * @param attachmentType DELIVERY | INSPECTION | ESTIMATE
 * @param input 업로드 파일
 */
export async function uploadAttachmentAuthenticated(
  token: string | null,
  slipId: string,
  attachmentType: SlipAttachmentTypeApi,
  input: AttachmentUploadInput,
  onProgress?: (ratio: number) => void,
): Promise<SlipAttachmentResponseDto> {
  const url = `${API_BASE_URL}/slips/${encodeURIComponent(slipId)}/attachments`;
  const body = buildMultipart(input, attachmentType);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return uploadWithRetry(url, body, headers, onProgress);
}

// ----------------------------------------------------------------------
// 내부 — multipart 빌드 + 재시도 (3회) + 응답 파싱.
// ----------------------------------------------------------------------

function buildMultipart(
  input: AttachmentUploadInput,
  attachmentType?: SlipAttachmentTypeApi,
): FormData {
  const form = new FormData();
  // RN FormData — { uri, name, type } literal 객체 append.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form.append('file', {
    uri: input.uri,
    name: input.fileName,
    type: input.mimeType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  if (attachmentType) form.append('type', attachmentType);
  if (input.exifGpsLat != null) form.append('exifGpsLat', String(input.exifGpsLat));
  if (input.exifGpsLng != null) form.append('exifGpsLng', String(input.exifGpsLng));
  if (input.capturedAt) form.append('capturedAt', input.capturedAt);
  return form;
}

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [500, 1500, 3500]; // 1차 즉시 실패 후 0.5s / 1.5s / 3.5s

async function uploadWithRetry(
  url: string,
  body: FormData,
  headers: Record<string, string> | undefined,
  onProgress?: (ratio: number) => void,
): Promise<SlipAttachmentResponseDto> {
  let lastErr: AttachmentApiError | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      // RN fetch 는 multipart upload progress event 미지원 — 시작/완료 2단계만 보고.
      onProgress?.(0);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          ...(headers ?? {}),
        },
        body,
      });
      if (!res.ok) {
        const text = await safeText(res);
        const err = new AttachmentApiError(res.status, friendlyMessage(res.status, text));
        // 4xx (400/404/410/413) = client 오류 → 재시도 의미 없음, 즉시 throw.
        if (res.status >= 400 && res.status < 500) {
          throw err;
        }
        lastErr = err;
      } else {
        onProgress?.(1);
        const json = await res.json();
        assertApiResponseSuccess(json);
        return json.data as SlipAttachmentResponseDto;
      }
    } catch (e) {
      // network 단절 / timeout → 재시도. AttachmentApiError 의 4xx 는 위에서 즉시 throw.
      if (e instanceof AttachmentApiError && e.status >= 400 && e.status < 500) {
        throw e;
      }
      lastErr = e instanceof AttachmentApiError
        ? e
        : new AttachmentApiError(0, networkFriendlyMessage(e));
    }
    // backoff 후 재시도 (마지막 attempt 후에는 sleep 생략).
    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(RETRY_BACKOFF_MS[attempt]);
    }
  }
  throw lastErr ?? new AttachmentApiError(0, '사진 업로드에 반복 실패했습니다 (3회 재시도).');
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ''; }
}

function friendlyMessage(status: number, text: string): string {
  switch (status) {
    case 400:
      return '파일 형식이 허용되지 않거나 크기가 5MB 를 초과합니다. 다시 촬영하거나 다른 사진을 선택해주세요.';
    case 404:
      return '대상 전표를 찾을 수 없습니다. 배차 토큰 / 전표 번호를 확인해주세요.';
    case 410:
      return '배송 토큰이 만료되었습니다. 영업 / 배차 담당에게 새 링크를 요청해주세요.';
    case 413:
      return '파일이 너무 큽니다. 압축 후 다시 시도해주세요 (최대 5MB).';
    case 401:
    case 403:
      return '권한이 없습니다. 다시 로그인해주세요.';
    case 500:
    case 502:
    case 503:
    case 504:
      return '서버 일시 오류입니다. 잠시 후 자동으로 재시도합니다.';
    default:
      return `사진 업로드 실패 (HTTP ${status})${text ? ` — ${text.slice(0, 80)}` : ''}`;
  }
}

function networkFriendlyMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/network|fetch|timeout|abort/i.test(raw)) {
    return '네트워크 연결이 불안정합니다. Wi-Fi / LTE 상태를 확인하고 자동 재시도를 기다려주세요.';
  }
  return `사진 업로드 중 오류가 발생했습니다 — ${raw}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ----------------------------------------------------------------------
// ApiResponse wrapper schema assert — mobile-staff API client 패턴 일관 (silent fall-through 제거).
// ----------------------------------------------------------------------

function assertApiResponseSuccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any,
): asserts json is { success: true; data: SlipAttachmentResponseDto; code?: string; message?: string } {
  if (json == null || typeof json !== 'object') {
    throw new AttachmentApiError(0, '서버 응답 형식 오류 — 본문이 객체가 아닙니다.');
  }
  if (json.success !== true) {
    const code = typeof json.code === 'string' ? json.code : 'UNKNOWN';
    const message = typeof json.message === 'string' ? json.message : '사진 업로드 응답이 실패로 표시되었습니다.';
    throw new AttachmentApiError(0, `${message} (code=${code})`);
  }
}

export class AttachmentApiError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AttachmentApiError';
    this.status = status;
  }
}
