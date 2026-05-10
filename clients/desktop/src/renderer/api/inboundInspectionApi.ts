/**
 * 입고 검수 도메인 API 클라이언트.
 *
 * 노출 endpoint (BE inventory-service):
 * - `GET    /api/v1/inventory/inbound-inspections/{slipId}`              — 검수 상세 (라인 포함)
 * - `POST   /api/v1/inventory/inbound-inspections/{slipId}/inspect`      — 검수 저장 (DRAFT)
 * - `GET    /api/v1/inventory/inbound-inspections`                        — Page<검수 요약> (status 필터)
 * - `POST   /api/v1/inventory/inbound-inspections/{slipId}/complete`      — 검수 완료 (재고 적용)
 *
 * UUID 비공개 가드: `slipId` 는 path param 으로만 사용. 화면 표시 영역에는
 * 절대 노출하지 않는다 (`feedback_uuid_no_user_visibility.md`).
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

// ---------------------------------------------------------------------------
// 검수 상태 enum
// ---------------------------------------------------------------------------

/**
 * BE {@code InspectionStatus} enum 과 1:1 정합 (TM PR #142 검증 fix).
 *
 * BE 가 발행하는 값: PENDING / COMPLETED / CANCELED — DRAFT 는 BE 정의에 없음.
 * (서비스 레이어에서 inspect 저장 시 status 는 PENDING 유지.)
 */
export type InboundInspectionStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'CANCELED'

/** InboundInspectionStatus → 한국어 표시 라벨. */
export const INSPECTION_STATUS_LABEL: Record<InboundInspectionStatus, string> = {
  PENDING: '검수대기',
  COMPLETED: '검수완료',
  CANCELED: '검수취소',
}

// ---------------------------------------------------------------------------
// 검수 응답 타입 (BE 1:1)
// ---------------------------------------------------------------------------

/**
 * 검수 라인 응답 — BE `InboundInspectionLineResponse` 와 1:1.
 *
 * UUID 비공개 가드: `productId` / `lineId` 는 React key + 요청 body 에만 사용.
 * 화면에 표시되는 식별자는 `modelCode` (modelName).
 */
export interface InboundInspectionLine {
  /** 라인 UUID — React key 용, 화면 미노출. */
  lineId: string
  /**
   * BE `slipLineId` (slip-service 의 SlipLine UUID, internal reference).
   * 본 필드는 BE record 의 `slipLineId` 와 매핑된다 — TM PR #142 검증에서 BE/FE 정합 정정.
   * 화면 미노출.
   */
  slipLineId?: string | null
  /** 모델코드 — 사용자 노출 식별자. */
  modelCode: string
  /** 제품명. */
  productName: string | null
  /** 입고 예정 수량 (슬립 라인에서 가져옴). */
  expectedQty: number
  /** 검수 수량 (사용자 입력). */
  inspectedQty: number
  /** 불량 수량 (사용자 입력). */
  defectQty: number
  /** 불량 사유 (사용자 입력, nullable). */
  defectReason: string | null
}

/**
 * 검수 상세 응답 — BE `InboundInspectionDetailResponse` 와 1:1.
 *
 * 슬립 헤더 정보 + 라인 목록을 포함한다.
 * UUID 비공개 가드: `slipId` / `inspectorId` 는 화면 미노출.
 */
export interface InboundInspectionDetailResponse {
  /** 슬립 UUID — path param 전용, 화면 미노출. */
  slipId: string
  /** 슬립 번호 — 사용자 노출. */
  slipNo: string
  /** 거래처명. */
  partnerName: string | null
  /** 입고일 (YYYY-MM-DD). */
  slipDate: string
  /** 검수자 이름 (검수 완료 전 null). */
  inspectorName: string | null
  /** 검수 상태. */
  status: InboundInspectionStatus
  /** 라인별 검수 데이터. */
  lines: InboundInspectionLine[]
}

/**
 * 검수 목록 요약 응답 — BE `InboundInspectionSummaryResponse` 와 1:1.
 *
 * DataTable 행 표시용. UUID 비공개 가드 적용.
 */
export interface InboundInspectionSummary {
  /** 슬립 UUID — rowKey + onRowClick 에만 사용, 화면 미노출. */
  slipId: string
  /** 슬립 번호 — 사용자 노출. */
  slipNo: string
  /** 거래처명. */
  partnerName: string | null
  /** 입고일 (YYYY-MM-DD). */
  slipDate: string
  /** 검수 상태. */
  status: InboundInspectionStatus
  /** 검수자 이름 (대기 상태는 null). */
  inspectorName: string | null
}

// ---------------------------------------------------------------------------
// 검수 요청 타입 (BE 1:1)
// ---------------------------------------------------------------------------

/**
 * 라인별 검수 입력 — BE `InboundInspectionLineRequest` 와 1:1.
 */
export interface InboundInspectionLineRequest {
  /** 라인 UUID. */
  lineId: string
  /** 검수 수량. */
  inspectedQty: number
  /** 불량 수량 (기본 0). */
  defectQty: number
  /** 불량 사유 (defectQty > 0 시 권장). */
  defectReason?: string | null
}

/**
 * 검수 저장/완료 요청 body — BE `InboundInspectionRequest` 와 1:1.
 */
export interface InboundInspectionRequest {
  /** 라인별 검수 결과. */
  lines: InboundInspectionLineRequest[]
}

/**
 * 검수 목록 조회 옵션.
 */
export interface ListInboundInspectionsOptions {
  status?: InboundInspectionStatus
  page?: number
  size?: number
}

// ---------------------------------------------------------------------------
// API 함수
// ---------------------------------------------------------------------------

/**
 * 입고 검수 상세 조회 — 슬립 헤더 + 라인 포함.
 *
 * @param slipId 슬립 UUID (path param 전용, 화면 미노출)
 * @returns 검수 상세 응답 (status=PENDING 이면 lines 는 expectedQty 만 채워짐)
 */
export async function getInboundInspection(
  slipId: string,
): Promise<InboundInspectionDetailResponse> {
  const res = await apiClient.get<ApiEnvelope<InboundInspectionDetailResponse>>(
    `/api/v1/inventory/inbound-inspections/${slipId}`,
  )
  return res.data.data
}

/**
 * 검수 저장 (DRAFT) — 라인별 검수 수량/불량 수량/불량 사유 임시 저장.
 *
 * 재고에는 즉시 반영되지 않는다. `completeInboundInspection` 호출 시 재고 적용.
 *
 * @param slipId 슬립 UUID
 * @param body 라인별 검수 입력
 */
export async function inspectInbound(
  slipId: string,
  body: InboundInspectionRequest,
): Promise<void> {
  await apiClient.post(
    `/api/v1/inventory/inbound-inspections/${slipId}/inspect`,
    body,
  )
}

/**
 * 검수 완료 — 재고 lot 생성 + 분개 자동 발행.
 *
 * COMPLETED 전환 후 슬립 상태도 CONFIRMED 로 자동 전환 (BE 가드).
 * 검수 수량과 입고 예정 수량 차이가 있으면 차이 lot 을 별도 기록.
 *
 * @param slipId 슬립 UUID
 */
export async function completeInboundInspection(slipId: string): Promise<void> {
  await apiClient.post(
    `/api/v1/inventory/inbound-inspections/${slipId}/complete`,
  )
}

/**
 * 입고 검수 목록 페이지 조회 — status 필터 + 페이지네이션.
 *
 * @param options status / page / size 옵션
 * @returns Spring Page<InboundInspectionSummary>
 */
export async function listInboundInspections(
  options: ListInboundInspectionsOptions = {},
): Promise<PageResponse<InboundInspectionSummary>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.status) params['status'] = options.status

  const res = await apiClient.get<ApiEnvelope<PageResponse<InboundInspectionSummary>>>(
    '/api/v1/inventory/inbound-inspections',
    { params },
  )
  return res.data.data
}
