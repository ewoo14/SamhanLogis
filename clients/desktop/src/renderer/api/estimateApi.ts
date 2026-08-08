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
import { withLineIdContract } from './lineIdContract'
import type { BundleSetOptions } from './slip'

export type { BundleSetOptions }

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
  specificationSource?: 'CATALOG' | 'USER' | null
  quantity: number
  unitPrice: string
  supplyAmount: string
  vatAmount: string
  lineTotal: string
  note: string | null
  /** VAT 포함 단가 — 단가 부가세포함 전환(2026-06-09). 화면 '단가' 표시값. nullable(legacy). */
  unitPriceWithVat?: string | null
  /**
   * 세트 전개 첫 구성품 여부 — 화면 식별자로 표시하지 않는다.
   *
   * <p>[R8-FE-8] 🔴 <b>현재 FE 소비자 0</b>이며 그건 의도다. 근거를 남긴다:
   *
   * <p>이 필드는 커밋 {@code 34f978ec9} 가 "전표 {@code SlipLineResponse} 엔 있는데 견적엔 없다"
   * 는 <b>slip/estimate 비대칭</b>을 없애려고 노출했다. 그런데 같은 커밋이 도입한
   * <b>lineId 왕복 계약</b>이 계보 보존의 책임을 서버로 옮겼다 — FE 는 상세 응답의 {@code id} 를
   * {@code lineId} 로 되돌려 보내기만 하면 되고, 서버({@code BundleLineageResolver})가
   * {@code Map<lineId, lineage>} 로 계보를 결정적으로 승계한다. 즉 <b>FE 가 계보를 알 필요가
   * 없어졌다</b>. 종전처럼 FE 가 계보를 읽어 되돌려 보내는 설계는 R5~R7 이 붕괴시킨 그 경로다.
   *
   * <p>따라서 이 필드의 현재 역할은 (1) BE 응답 스키마와의 타입 parity (2) 향후 소비 후보의
   * 계약 표면이다. 소비 후보 — <b>세트 구성품 시각 표시</b>와 <b>품목 교체 경고</b>:
   * D-R8-8 로 구성품의 품목을 교체하면 서버가 계보를 조용히 끊으므로("세트에서 분리됩니다")
   * 사전 고지가 유효하다. 다만 그건 신규 UI 설계·QA 가 필요한 별도 범위라 #820 에서 하지 않는다.
   *
   * <p>⚠️ 이 필드를 읽어 저장 payload 로 되돌려 보내지 말 것 — 그게 lineId 계약이 폐기한 설계다.
   */
  setHead: boolean
  /** 세트 구성품 부모 modelCode — 일반 라인은 null. 소비 정책은 {@link EstimateLine#setHead} 참조. */
  parentSetModel: string | null
  /** 화면에서 선택한 BUNDLE 옵션 문맥. 일반/SINGLE/legacy 라인은 null. */
  setOptions?: BundleSetOptions | null
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
  /** 담당자 표시명 — UUID를 화면에 표시하지 않기 위한 서버 제공 label. */
  requesterName?: string | null
  /** 불변 작성 기록 표시명 — 담당 변경과 별개의 감사 정보. */
  createdByName?: string | null
  version: number
  isDeleted: boolean
  deletedAt: string | null
  deletedByName: string | null
  restoreAvailable?: boolean
}

/** 견적서 단건 상세 — BE {@code EstimateDetailResponse}. */
export interface EstimateDetail extends EstimateSummary {
  partnerAddress: string | null
  rejectedAt: string | null
  memo: string | null
  lines: EstimateLine[]
}

/**
 * Jackson BigDecimal 은 JSON number 로 내려올 수 있으므로 폼에 닿기 전에 금액을 string 으로 고정한다.
 * 이 경계 정규화가 없으면 hydration/coedit provenance 비교가 number/string 런타임 타입에 좌우된다.
 */
function normalizeEstimateSummary<T extends EstimateSummary>(estimate: T): T {
  return {
    ...estimate,
    totalSupply: String(estimate.totalSupply),
    totalVat: String(estimate.totalVat),
    totalAmount: String(estimate.totalAmount),
  }
}

function normalizeEstimateDetail(estimate: EstimateDetail): EstimateDetail {
  return {
    ...normalizeEstimateSummary(estimate),
    lines: estimate.lines.map((line) => ({
      ...line,
      setOptions: line.setOptions ?? null,
      unitPrice: String(line.unitPrice),
      unitPriceWithVat: line.unitPriceWithVat == null ? null : String(line.unitPriceWithVat),
      supplyAmount: String(line.supplyAmount),
      vatAmount: String(line.vatAmount),
      lineTotal: String(line.lineTotal),
    })),
  }
}

/** 견적 라인 1건 생성/수정 요청. */
export interface EstimateLineRequest {
  /** 상세 응답 `id` 왕복값 — payload 전용, 화면 미표시. 신규 라인은 null/미지정. */
  lineId?: string | null
  productId: string
  productName?: string
  modelName?: string
  specification?: string
  specificationSource?: 'CATALOG' | 'USER'
  quantity: number
  /** 단가 (BigDecimal — string). */
  unitPrice: string
  note?: string
  /** 세트 전개 옵션 — BUNDLE 품목 라인에 한해 전달(BE BundleExpander). */
  setOptions?: BundleSetOptions
  /** 단가 부가세포함 여부 — true 면 unitPrice 가 VAT 포함 단가(BE 라인 단위 분해). 2026-06-09. */
  priceVatInclusive?: boolean
  /** 권위 공급가액 S — VAT 열을 편집한 라인에서만 3값 함께 전송. */
  supplyAmount?: string
  /** 권위 부가세 V — VAT 열을 편집한 라인에서만 3값 함께 전송. */
  vatAmount?: string
  /** 권위 VAT 포함 합계 T — 견적 lineTotal과 동일 의미의 요청 합계. */
  lineTotalWithVat?: string
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
  /** 삭제 문서 감사/복원 표면에서만 명시적으로 활성화한다. */
  includeDeleted?: boolean
  page?: number
  size?: number
}

/** 담당 변경 요청 — 견적서 계열만 허용하며 UUID는 payload 전용이다. */
export interface ChangeEstimateOwnerRequest {
  requesterId: string
  documentType?: 'ESTIMATE'
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
  if (options.includeDeleted) params['includeDeleted'] = 'true'
  const res = await apiClient.get<ApiEnvelope<PageResponse<EstimateSummary>>>(
    '/slips/estimates',
    { params },
  )
  return {
    ...res.data.data,
    content: res.data.data.content.map(normalizeEstimateSummary),
  }
}

/** 웹 표면 자기 담당 견적 조회. 데스크톱 견적서 메뉴는 {@link listEstimates}를 사용한다. */
export async function listAssignedEstimates(
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
  if (options.includeDeleted) params['includeDeleted'] = 'true'
  const res = await apiClient.get<ApiEnvelope<PageResponse<EstimateSummary>>>(
    '/slips/estimates/assigned',
    { params },
  )
  return {
    ...res.data.data,
    content: res.data.data.content.map(normalizeEstimateSummary),
  }
}

/** 단건 상세. */
export async function getEstimate(id: string): Promise<EstimateDetail> {
  const res = await apiClient.get<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${id}`,
  )
  return normalizeEstimateDetail(res.data.data)
}

/** 신규 생성 (DRAFT). */
export async function createEstimate(
  body: CreateEstimateRequest,
): Promise<EstimateDetail> {
  const res = await apiClient.post<ApiEnvelope<EstimateDetail>>(
    '/slips/estimates',
    body,
  )
  return normalizeEstimateDetail(res.data.data)
}

/** DRAFT/SENT 수정. */
export async function updateEstimate(
  id: string,
  body: UpdateEstimateRequest,
): Promise<EstimateDetail> {
  const res = await apiClient.put<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${id}`,
    // [D-R8-9] 전표 미러 — 계약 마커 스탬프. 누락 시 BE 400.
    withLineIdContract(body),
  )
  return normalizeEstimateDetail(res.data.data)
}

/** DRAFT → SENT. */
export async function sendEstimate(id: string): Promise<EstimateDetail> {
  const res = await apiClient.post<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${id}/send`,
    {},
  )
  return normalizeEstimateDetail(res.data.data)
}

/** SENT → ACCEPTED. */
export async function acceptEstimate(id: string): Promise<EstimateDetail> {
  const res = await apiClient.post<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${id}/accept`,
    {},
  )
  return normalizeEstimateDetail(res.data.data)
}

/** SENT → REJECTED. */
export async function rejectEstimate(id: string): Promise<EstimateDetail> {
  const res = await apiClient.post<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${id}/reject`,
    {},
  )
  return normalizeEstimateDetail(res.data.data)
}

/** ACCEPTED → CONVERTED — Slip(OUTBOUND DRAFT) 자동 발행. */
export async function convertEstimate(id: string): Promise<EstimateDetail> {
  const res = await apiClient.post<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${id}/convert`,
    {},
  )
  return normalizeEstimateDetail(res.data.data)
}

/** 견적서 soft-delete 복원. */
export async function restoreEstimate(id: string): Promise<void> {
  await apiClient.post<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${encodeURIComponent(id)}/restore`,
    {},
  )
}

/** 견적서 메뉴에서 담당을 변경한다. created_by는 서버에서 보존한다. */
export async function changeEstimateOwner(
  id: string,
  request: ChangeEstimateOwnerRequest,
): Promise<EstimateDetail> {
  const res = await apiClient.patch<ApiEnvelope<EstimateDetail>>(
    `/slips/estimates/${encodeURIComponent(id)}/owner`,
    request,
  )
  return normalizeEstimateDetail(res.data.data)
}
