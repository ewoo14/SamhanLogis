/**
 * 첨부파일 도메인 API 클라이언트 — desktop viewer 용.
 *
 * 노출 endpoint (BE inventory-service / slip-service):
 * - `GET    /api/v1/inventory/inspections/{slipId}/attachments`        — 검수 첨부 목록 조회
 * - `GET    /api/v1/slips/{slipId}/attachments`                        — 슬립 첨부 목록 조회
 * - `DELETE /api/v1/attachments/{attachmentId}`                        — 첨부 삭제 (MASTER/MANAGER)
 *
 * desktop 은 사진 viewer 전용 — 업로드는 mobile-staff 가 담당 (multipart RN fetch).
 * desktop 에서 업로드 필요 시 file input 기반 별도 슬라이스로 추가 (현재 scope 외).
 *
 * UUID 비공개 가드:
 *   - `attachmentId` / `slipId` 는 API 경로 / 삭제 confirm 에만 사용 — 화면 미노출.
 *   - 사용자에게는 fileName / capturedAt / uploadedAt 만 표시.
 *
 * Mock 모드 (`VITE_MOCK_MODE=1`):
 *   - `listInspectionAttachmentsMock()` / `listSlipAttachmentsMock()` 가 결정적 dummy 반환.
 *   - Math.random 사용 금지 — 동일 slipId 입력 시 항상 동일한 결과.
 */

import { apiClient, type ApiEnvelope } from './client'
import { isMockMode } from './mock'

// ---------------------------------------------------------------------------
// 응답 타입 — BE AttachmentResponse record 와 1:1
// ---------------------------------------------------------------------------

export type AttachmentType = 'DELIVERY' | 'INSPECTION' | 'ESTIMATE'

/**
 * 첨부파일 응답 단건 — BE `AttachmentResponse` 와 1:1.
 *
 * UUID 비공개: `id` / `slipId` 는 삭제 API 경로 전용, 화면 표시 X.
 */
export interface AttachmentResponse {
  /** 첨부 UUID — 삭제 API path param 전용, 화면 미노출. */
  id: string
  /** 슬립 UUID — 화면 미노출. */
  slipId: string
  /** 첨부 유형. */
  attachmentType: AttachmentType
  /** 파일명 — 사용자 노출. */
  fileName: string
  /** 파일 크기 (bytes). */
  fileSize: number
  /** MIME 타입. */
  contentType: string
  /** EXIF GPS 위도 (촬영 위치, nullable). */
  exifGpsLat: string | null
  /** EXIF GPS 경도 (촬영 위치, nullable). */
  exifGpsLng: string | null
  /** 촬영 시각 ISO-8601 (nullable). */
  capturedAt: string | null
  /** 업로드 사용자 이름. */
  uploadedBy: string
  /** 업로드 시각 ISO-8601. */
  uploadedAt: string
  /** presigned download URL (1시간 유효, nullable — S3 미연동 시 null). */
  downloadUrl: string | null
}

// ---------------------------------------------------------------------------
// API 함수
// ---------------------------------------------------------------------------

/**
 * 입고 검수 첨부 목록 조회.
 *
 * @param slipId 슬립 UUID (path param 전용, 화면 미노출)
 * @returns 첨부파일 목록 (비어있으면 [])
 */
export async function listInspectionAttachments(
  slipId: string,
): Promise<AttachmentResponse[]> {
  if (isMockMode()) {
    return listInspectionAttachmentsMock(slipId)
  }
  const res = await apiClient.get<ApiEnvelope<AttachmentResponse[]>>(
    `/api/v1/inventory/inspections/${slipId}/attachments`,
  )
  return res.data.data ?? []
}

/**
 * 슬립 첨부 목록 조회 (배송/견적 첨부 포함).
 *
 * @param slipId 슬립 UUID (path param 전용, 화면 미노출)
 * @returns 첨부파일 목록 (비어있으면 [])
 */
export async function listSlipAttachments(
  slipId: string,
): Promise<AttachmentResponse[]> {
  if (isMockMode()) {
    return listSlipAttachmentsMock(slipId)
  }
  const res = await apiClient.get<ApiEnvelope<AttachmentResponse[]>>(
    `/api/v1/slips/${slipId}/attachments`,
  )
  return res.data.data ?? []
}

/**
 * 첨부 삭제 (MASTER/MANAGER 권한 전용).
 *
 * @param attachmentId 첨부 UUID (path param 전용, 화면 미노출)
 */
export async function deleteAttachment(attachmentId: string): Promise<void> {
  await apiClient.delete(`/api/v1/attachments/${attachmentId}`)
}

// ---------------------------------------------------------------------------
// Mock — 결정적 (Math.random 금지), slipId 기반 고정 데이터
// ---------------------------------------------------------------------------

const MOCK_INSPECTION_ATTACHMENTS: AttachmentResponse[] = [
  {
    id: 'atch-0001-0000-0000-0000-000000000001',
    slipId: 'slip-0001-0000-0000-0000-000000000001',
    attachmentType: 'INSPECTION',
    fileName: 'inspection-front-001.jpg',
    fileSize: 423680,
    contentType: 'image/jpeg',
    exifGpsLat: '37.5665000',
    exifGpsLng: '126.9780000',
    capturedAt: '2026-05-11T09:23:14',
    uploadedBy: '창고직원 김철수',
    uploadedAt: '2026-05-11T09:24:01Z',
    downloadUrl: null,
  },
  {
    id: 'atch-0001-0000-0000-0000-000000000002',
    slipId: 'slip-0001-0000-0000-0000-000000000001',
    attachmentType: 'INSPECTION',
    fileName: 'inspection-defect-label-002.jpg',
    fileSize: 298112,
    contentType: 'image/jpeg',
    exifGpsLat: '37.5665000',
    exifGpsLng: '126.9780000',
    capturedAt: '2026-05-11T09:24:33',
    uploadedBy: '창고직원 김철수',
    uploadedAt: '2026-05-11T09:25:02Z',
    downloadUrl: null,
  },
]

const MOCK_SLIP_ATTACHMENTS: AttachmentResponse[] = [
  {
    id: 'atch-0002-0000-0000-0000-000000000001',
    slipId: 'slip-0002-0000-0000-0000-000000000001',
    attachmentType: 'DELIVERY',
    fileName: 'delivery-complete-001.jpg',
    fileSize: 387072,
    contentType: 'image/jpeg',
    exifGpsLat: '37.5512000',
    exifGpsLng: '126.9882000',
    capturedAt: '2026-05-11T14:11:05',
    uploadedBy: '배송기사 이영희',
    uploadedAt: '2026-05-11T14:11:48Z',
    downloadUrl: null,
  },
]

function listInspectionAttachmentsMock(slipId: string): AttachmentResponse[] {
  // slipId 기반 결정적 반환 (Math.random 금지).
  // 첫 번째 mock slipId 와 매칭되면 2건, 그 외 0건.
  if (slipId === MOCK_INSPECTION_ATTACHMENTS[0]?.slipId) {
    return MOCK_INSPECTION_ATTACHMENTS.map((a) => ({ ...a, slipId }))
  }
  return MOCK_INSPECTION_ATTACHMENTS.map((a) => ({ ...a, slipId }))
}

function listSlipAttachmentsMock(slipId: string): AttachmentResponse[] {
  return MOCK_SLIP_ATTACHMENTS.map((a) => ({ ...a, slipId }))
}
