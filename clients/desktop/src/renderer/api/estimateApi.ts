/**
 * 견적서 도메인 API 클라이언트 — P2-1 (Stage 4).
 *
 * <p>BE 출처: {@code services/slip-service} commit 59232bd — EstimateController.
 * 8 endpoint 매핑:
 * <ul>
 *   <li>{@code GET    /slips/estimates}              — 페이지 조회 (status / partnerId / startDate / endDate)</li>
 *   <li>{@code GET    /slips/estimates/{id}}         — 단건 + lines</li>
 *   <li>{@code POST   /slips/estimates}              — DRAFT 생성</li>
 *   <li>{@code PUT    /slips/estimates/{id}}         — DRAFT/SENT 수정 (헤더 + 라인 일괄 replace)</li>
 *   <li>{@code POST   /slips/estimates/{id}/send}    — DRAFT → SENT</li>
 *   <li>{@code POST   /slips/estimates/{id}/accept}  — SENT → ACCEPTED</li>
 *   <li>{@code POST   /slips/estimates/{id}/reject}  — SENT → REJECTED</li>
 *   <li>{@code POST   /slips/estimates/{id}/convert} — ACCEPTED → CONVERTED + Slip(OUTBOUND DRAFT) 자동 발행</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 ({@code feedback_uuid_no_user_visibility.md}):
 * - {@code id} / {@code partnerId} / {@code productId} / {@code convertedSlipId} 는 path/link 용 (사용자 노출 X)
 * - 화면 표시는 {@code estimateNo} (예: {@code Q-2026/05-001}) + {@code partnerName} + {@code productName / modelName}
 *
 * <p>권한: SALES / MANAGER / MASTER 가 작성/전이/변환. 조회는 모든 인증 사용자.
 */
import {
  apiClient,
  type ApiEnvelope,
  type PageResponse,
} from './client'

/** 견적서 상태 — BE EstimateStatus 와 1:1. */
export type EstimateStatus =
  | 'QUOTE_DRAFT'
  | 'QUOTE_SENT'
  | 'QUOTE_ACCEPTED'
  | 'QUOTE_REJECTED'
  | 'QUOTE_CONVERTED'

/** 상태 → 한국어 라벨. */
export const ESTIMATE_STATUS_LABEL: Record<EstimateStatus, string> = {
  QUOTE_DRAFT: '작성중',
  QUOTE_SENT: '발송완료',
  QUOTE_ACCEPTED: '수주완료',
  QUOTE_REJECTED: '거절',
  QUOTE_CONVERTED: '전표변환완료',
}

/** 견적 라인 응답 — BE {@code EstimateLineResponse}. */
export interface EstimateLine {
  /** 라인 UUID — 화면 미노출. */
  id: string
  /** 0-based 라인 번호. */
  lineNo: number
  /** 제품 UUID — productId 화면 미노출 (modelName 만 노출). */
  productId: string
  productName: string | null
  modelName: string | null
  specification: string | null
  quantity: number
  unitPrice: string
  supplyAmount: string
  vatAmount: string
  lineTotal: string
  note: string | null
}

/** 견적서 헤더 (요약) — 페이지 조회용. BE {@code EstimateResponse}. */
export interface EstimateSummary {
  /** UUID — path param 전용. 화면 미노출. */
  id: string
  /** 사람이 읽는 견적번호 (예: Q-2026/05-001). */
  estimateNo: string
  estimateDate: string
  seqNo: number
  status: EstimateStatus
  partnerId: string
  partnerName: string
  partnerBusinessNo: string | null
  validUntil: string | null
  totalSupply: string
  totalVat: string
  totalAmount: string
  /** 변환 슬립 UUID — 변환 후 슬립 상세로 link 용. */
  convertedSlipId: string | null
  sentAt: string | null
  acceptedAt: string | null
  convertedAt: string | null
  requesterId: string | null
  version: number
}

/** 견적서 단건 상세 — BE {@code EstimateDetailResponse}. */
export interface EstimateDetail extends EstimateSummary {
  partnerAddress: string | null
  rejectedAt: string | null
  memo: string | null
  lines: EstimateLine[]
}

/** 견적 라인 1건 생성/수정 요청. */
export interface EstimateLineRequest {
  productId: string
  productName?: string
  modelName?: string
  specification?: string
  quantity: number
  /** 단가 (BigDecimal — string). */
  unitPrice: string
  note?: string
}

/** 견적서 신규 생성 요청. */
export interface CreateEstimateRequest {
  estimateDate?: string
  partnerId: string
  partnerName?: string
  partnerBusinessNo?: string
  partnerAddress?: string
  validUntil?: string
  memo?: string
  lines: EstimateLineRequest[]
}

/** 견적서 수정 요청. */
export interface UpdateEstimateRequest {
  partnerId?: string
  partnerName?: string
  partnerBusinessNo?: string
  partnerAddress?: string
  validUntil?: string
  memo?: string
  /** lines null 시 보존, 빈 배열 시 모두 제거, 값 있으면 replace. */
  lines?: EstimateLineRequest[]
}

/** 페이지 조회 옵션. */
export interface ListEstimatesOptions {
  status?: EstimateStatus
  partnerId?: string
  startDate?: string
  endDate?: string
  page?: number
  size?: number
}

// ---------------------------------------------------------------------------
// endpoint 호출
// ---------------------------------------------------------------------------

/** 견적서 페이지 조회. */
export async function listEstimates(
  options: ListEstimatesOptions = {},
): Promise<PageResponse<EstimateSummary>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.status) params['status'] = options.status
  if (options.partnerId) params['partnerId'] = options.partnerId
  if (options.startDate) params['startDate'] = options.startDate
  if (options.endDate) params['endDate'] = options.endDate
  const res = await apiClient.get<ApiEnvelope<PageResponse<EstimateSummary>>>(
    '/slips/estimates',
    { params },
  )
  return res.data.data
}

/** 단건 상세. */
export async function getEstimate(id: string): Promise<EstimateDetail> {
  const res = await apiClient.get<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${id}`,
  )
  return res.data.data
}

/** 신규 생성 (DRAFT). */
export async function createEstimate(
  body: CreateEstimateRequest,
): Promise<EstimateDetail> {
  const res = await apiClient.post<ApiEnvelope<EstimateDetail>>(
    '/slips/estimates',
    body,
  )
  return res.data.data
}

/** DRAFT/SENT 수정. */
export async function updateEstimate(
  id: string,
  body: UpdateEstimateRequest,
): Promise<EstimateDetail> {
  const res = await apiClient.put<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${id}`,
    body,
  )
  return res.data.data
}

/** DRAFT → SENT. */
export async function sendEstimate(id: string): Promise<EstimateDetail> {
  const res = await apiClient.post<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${id}/send`,
    {},
  )
  return res.data.data
}

/** SENT → ACCEPTED. */
export async function acceptEstimate(id: string): Promise<EstimateDetail> {
  const res = await apiClient.post<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${id}/accept`,
    {},
  )
  return res.data.data
}

/** SENT → REJECTED. */
export async function rejectEstimate(id: string): Promise<EstimateDetail> {
  const res = await apiClient.post<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${id}/reject`,
    {},
  )
  return res.data.data
}

/** ACCEPTED → CONVERTED — Slip(OUTBOUND DRAFT) 자동 발행. */
export async function convertEstimate(id: string): Promise<EstimateDetail> {
  const res = await apiClient.post<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${id}/convert`,
    {},
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 권한 helper
// ---------------------------------------------------------------------------

/** 견적서 작성/수정/전이/변환 권한 — SALES / MANAGER / MASTER. */
export function canMutateEstimate(
  role: string | undefined | null,
): boolean {
  if (!role) return false
  return role === 'SALES' || role === 'MANAGER' || role === 'MASTER'
}
