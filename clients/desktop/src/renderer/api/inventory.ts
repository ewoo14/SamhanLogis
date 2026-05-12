/**
 * 재고 도메인 API 클라이언트 — 창고 + 이동전표 (StockTransfer).
 *
 * 노출 endpoint:
 * - `GET    /inventory/warehouses`              — 활성 창고 목록 (displayOrder ASC)
 * - `POST   /inventory/warehouses`              — 신규 창고 등록
 * - `GET    /inventory/transfers`               — Page<TransferSummary> (status 필터)
 * - `GET    /inventory/transfers/{id}`          — 이동전표 상세 (라인 포함)
 * - `POST   /inventory/transfers`               — 이동전표 신규 생성 (REQUESTED)
 * - `POST   /inventory/transfers/{id}/{action}` — 라이프사이클 transition
 *
 * UUID 비공개 가드: warehouseId / productId 등은 axios body / path param 으로만 사용.
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

/** BE `WarehouseType` enum 과 1:1. */
export type WarehouseType =
  | 'HEADQUARTERS'
  | 'VEHICLE'
  | 'CONSIGNMENT'
  | 'VIRTUAL'

/**
 * 창고 응답 — BE `WarehouseResponse` 의 핵심 필드.
 * `active` 는 BE 응답에 직접 포함되지 않지만, soft-delete 미삭제 행만
 * 반환되므로 렌더러에서는 항상 `true` 로 가정한다.
 */
export interface Warehouse {
  id: string
  code: string
  name: string
  type: WarehouseType
  address: string | null
  displayOrder: number
  description: string | null
  createdAt: string
  modifiedAt: string
  /** 디자인 시스템 `WarehouseSelector` 호환을 위한 가상 필드 (항상 true). */
  active: boolean
}

/**
 * 창고 신규 등록 요청 body — BE `CreateWarehouseRequest`.
 *
 * 1a (2026-05) — `code` 는 optional. 미지정 시 backend 가 `WH-XXXXXX` 자동 생성.
 * 데스크탑 신규 등록 모달은 코드 입력 필드를 노출하지 않음 (자동 생성 안내만).
 */
export interface CreateWarehouseRequest {
  code?: string
  name: string
  type: WarehouseType
  address?: string
  displayOrder?: number
  description?: string
}

/**
 * 활성 창고 전체 조회. displayOrder ASC.
 *
 * @return Warehouse[] — `active: true` 가 강제 주입된다.
 */
export async function listWarehouses(): Promise<Warehouse[]> {
  const res = await apiClient.get<ApiEnvelope<Warehouse[]>>(
    '/inventory/warehouses',
  )
  return res.data.data.map((w) => ({ ...w, active: true }))
}

/**
 * 신규 창고 생성. 권한 부족 시 403, code 중복 시 409.
 *
 * @param body 신규 창고 정의
 * @return 생성된 Warehouse
 */
export async function createWarehouse(
  body: CreateWarehouseRequest,
): Promise<Warehouse> {
  const res = await apiClient.post<ApiEnvelope<Warehouse>>(
    '/inventory/warehouses',
    body,
  )
  return { ...res.data.data, active: true }
}

// ---------------------------------------------------------------------------
// StockTransfer (이동전표)
// ---------------------------------------------------------------------------

/** BE `TransferStatus` enum 과 1:1. */
export type TransferStatus =
  | 'REQUESTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELED'

/** BE `TransferReason` enum 과 1:1. */
export type TransferReason =
  | 'REBALANCE'
  | 'URGENT'
  | 'CONSOLIDATE'
  | 'MAINTENANCE'
  | 'SAMSUNG_DIRECT'
  | 'OTHER'

/** TransferStatus → 한국어 표시 라벨. */
export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  REQUESTED: '요청됨',
  PENDING_APPROVAL: '결재대기',
  APPROVED: '승인',
  SHIPPED: '출고',
  IN_TRANSIT: '이동중',
  RECEIVED: '입고',
  CONFIRMED: '확정',
  REJECTED: '반려',
  CANCELED: '취소',
}

/** TransferReason → 한국어 표시 라벨. */
export const TRANSFER_REASON_LABEL: Record<TransferReason, string> = {
  REBALANCE: '재배치',
  URGENT: '긴급보충',
  CONSOLIDATE: '통합',
  MAINTENANCE: '점검',
  SAMSUNG_DIRECT: '삼성직배',
  OTHER: '기타',
}

/** 목록 응답 — BE `TransferResponse`. */
export interface TransferSummary {
  id: string
  transferNo: string
  sourceWarehouseId: string
  sourceWarehouseCode: string
  destinationWarehouseId: string
  destinationWarehouseCode: string
  reason: TransferReason
  reasonDetail: string | null
  status: TransferStatus
  requesterId: string | null
  approverId: string | null
  requestedAt: string
  approvedAt: string | null
  shippedAt: string | null
  receivedAt: string | null
  confirmedAt: string | null
}

/** 라인 응답. */
export interface TransferLineDetail {
  id: string
  productId: string
  requestedQuantity: number
  shippedQuantity: number
  receivedQuantity: number
}

/** 상세 응답 — TransferSummary + 라인. */
export interface TransferDetail extends TransferSummary {
  lines: TransferLineDetail[]
}

/** 신규 라인 입력. */
export interface TransferLineInput {
  productId: string
  requestedQuantity: number
}

/** 이동전표 생성 요청 body — BE `CreateTransferRequest`. */
export interface CreateTransferRequest {
  sourceWarehouseId: string
  destinationWarehouseId: string
  reason: TransferReason
  reasonDetail?: string
  lines: TransferLineInput[]
}

/** 페이지 조회 옵션. */
export interface ListTransfersOptions {
  status?: TransferStatus
  page?: number
  size?: number
}

/**
 * 이동전표 페이지 조회.
 */
export async function listTransfers(
  options: ListTransfersOptions = {},
): Promise<PageResponse<TransferSummary>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.status) params['status'] = options.status

  const res = await apiClient.get<ApiEnvelope<PageResponse<TransferSummary>>>(
    '/inventory/transfers',
    { params },
  )
  return res.data.data
}

/**
 * 이동전표 단건 상세.
 *
 * @param id 이동전표 UUID (path param)
 */
export async function getTransfer(id: string): Promise<TransferDetail> {
  const res = await apiClient.get<ApiEnvelope<TransferDetail>>(
    `/inventory/transfers/${id}`,
  )
  return res.data.data
}

/**
 * 신규 이동전표 생성.
 */
export async function createTransfer(
  body: CreateTransferRequest,
): Promise<TransferDetail> {
  const res = await apiClient.post<ApiEnvelope<TransferDetail>>(
    '/inventory/transfers',
    body,
  )
  return res.data.data
}

/**
 * 이동전표 라이프사이클 transition action 코드.
 *
 * - `approve`  REQUESTED/PENDING_APPROVAL → APPROVED
 * - `reject`   REQUESTED/PENDING_APPROVAL → REJECTED (사유 필수)
 * - `ship`     APPROVED → SHIPPED (가상창고면 즉시 RECEIVED)
 * - `receive`  SHIPPED/IN_TRANSIT → RECEIVED
 * - `confirm`  RECEIVED → CONFIRMED
 * - `cancel`   REQUESTED/PENDING_APPROVAL/APPROVED → CANCELED
 */
export type TransferTransitionAction =
  | 'approve'
  | 'reject'
  | 'ship'
  | 'receive'
  | 'confirm'
  | 'cancel'

// ---------------------------------------------------------------------------
// StockBalance batch (sales-form-polish 슬라이스 신규)
// ---------------------------------------------------------------------------

/**
 * batch 재고 조회 응답 row — BE `StockBalanceBatchResponse.Row` 와 1:1.
 *
 * UUID 비공개 가드: `productId` 는 React key 로만 사용, 화면 미노출.
 * 화면에 표시되는 식별자는 `modelName` / `productName`.
 */
export interface StockBalanceBatchRow {
  productId: string
  modelName: string
  productName: string
  /** 창고 코드 → 수량 (재고 0 이면 0, 가상창고는 null). */
  perWarehouse: Record<string, number | null>
  /** 합계 (가상창고 제외). */
  total: number
}

/** batch 응답 envelope. */
export interface StockBalanceBatchResponse {
  rows: StockBalanceBatchRow[]
}

/**
 * 다건 productId 의 창고별 재고 + 합계 조회.
 *
 * SlipFormPage 의 [선택 항목 재고조회] 버튼에서 호출. N건을 1회 batch 로
 * 가져오므로 100건 이하 가정 (Designer ux-flow.md § 8.3).
 *
 * @param productIds 조회 대상 product UUID 배열 (호출자가 선택 라인에서 추출)
 * @return 모델명 × 창고 matrix + 합계 + 가상창고 null
 */
export async function fetchStockBalanceBatch(
  productIds: string[],
): Promise<StockBalanceBatchResponse> {
  const res = await apiClient.post<ApiEnvelope<StockBalanceBatchResponse>>(
    '/inventory/balances/batch',
    { productIds },
  )
  return res.data.data
}

/**
 * 이동전표 라이프사이클 transition. reject 만 body (`reason`) 필요.
 */
export async function transitionTransfer(
  id: string,
  action: TransferTransitionAction,
  body?: { reason?: string },
): Promise<TransferDetail> {
  const res = await apiClient.post<ApiEnvelope<TransferDetail>>(
    `/inventory/transfers/${id}/${action}`,
    body ?? {},
  )
  return res.data.data
}
