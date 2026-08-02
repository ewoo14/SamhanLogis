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
  /** 디자인 시스템 `WarehouseAutocomplete`/`WarehouseSelector` 의 `Warehouse` 타입 호환용 가상 필드 (항상 true). */
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

/**
 * BE `POST /inventory/balances/batch` 의 실제 응답 — `ProductBalanceResponse` 와 1:1.
 *
 * BE 는 productId 별 모든 창고 잔량을 평면 배열로 반환하며 모델명/품목명은 포함하지
 * 않는다 (잔량이 0 보다 큰 적이 있어 row 가 존재하는 창고만 포함; 잔량 0 row 도 유지).
 */
interface ProductBalanceResponse {
  productId: string
  balances: Array<{
    warehouseId: string
    warehouseCode: string
    warehouseName: string
    warehouseType: WarehouseType
    availableQty: number
    reservedQty: number
    totalQty: number
  }>
}

/**
 * 재고조회 매트릭스 입력 라인 — productId + 화면 표시용 모델명/품목명.
 *
 * BE 응답에는 모델명/품목명이 없으므로 호출자(SlipFormPage 선택 라인)가
 * 함께 전달하여 pivot 시 결합한다.
 */
export interface StockBalanceLookupLine {
  productId: string
  modelName: string
  productName: string
}

// ---------------------------------------------------------------------------
// StockBalance 목록 조회 (Phase 2.6c — 가용/실재고/예약 구분 표시)
// ---------------------------------------------------------------------------

/**
 * `GET /inventory/balances` 응답 row — BE `StockBalanceResponse` 와 1:1.
 *
 * UUID 비공개 가드: 응답에는 내부 UUID가 없으며 화면 노출 식별자만 수신한다.
 */
export interface StockBalanceListRow {
  productCode: string
  productName: string
  warehouseCode: string
  warehouseName: string
  warehouseType: WarehouseType
  /** 가용재고 = 실재고 - 예약재고. 전환 가능 여부 기준. */
  availableQty: number
  /** 예약재고 = 전환(reserve) 으로 잠긴 수량. */
  reservedQty: number
  /** 실재고 = 물리 보유 수량. */
  totalQty: number
}

/** 목록 조회 옵션. */
export interface ListStockBalancesOptions {
  /** 기존 품목별 재고 조회 호출부 호환용 선택 필터. */
  productId?: string
  warehouseId?: string
  page?: number
  size?: number
}

/** 입출고 분석 모델코드 집계 응답 — UUID는 포함하지 않는다. */
export interface InOutAnalysisRow {
  modelCode: string
  productName: string
  categoryKey: string | null
  inboundQuantity: number
  outboundQuantity: number
  purchaseAmount: number | null
  salesAmount: number
  profitAmount: number | null
  profitRate: number | null
}

/** 확정 입출고 기간별 모델코드 집계 조회. */
export async function listInOutAnalysis(dateFrom: string, dateTo: string): Promise<InOutAnalysisRow[]> {
  const res = await apiClient.get<ApiEnvelope<InOutAnalysisRow[]>>('/slips/query/inout-analysis', {
    params: { dateFrom, dateTo },
  })
  return res.data.data
}

/**
 * 재고 현황 목록 조회 — 가용/실재고/예약 3구분.
 *
 * BE `GET /inventory/balances` 호출.
 * 반환 행에서 warehouseType=VIRTUAL 인 항목은 예약 대상 외이므로
 * 목록에 포함하되 화면에서 회색 처리한다.
 *
 * @param options 창고 필터 + 페이지 옵션
 */
export async function listStockBalances(
  options: ListStockBalancesOptions = {},
): Promise<PageResponse<StockBalanceListRow>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 50,
  }
  if (options.productId) params['productId'] = options.productId
  if (options.warehouseId) params['warehouseId'] = options.warehouseId

  const res = await apiClient.get<ApiEnvelope<PageResponse<StockBalanceListRow>>>(
    '/inventory/balances',
    { params },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// BalanceMatrix (Phase 2.6d — 품목 × 창고 가용/실/예약 매트릭스)
// ---------------------------------------------------------------------------

/** 창고 컬럼 — 매트릭스 헤더. */
export interface BalanceWarehouseCol {
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  warehouseType: WarehouseType
}

/** 품목 행 — 창고코드별 가용/실/예약 셀. */
export interface BalanceMatrixRow {
  productId: string
  modelName: string
  productName: string
  /**
   * warehouseCode → {available, reserved, total}.
   * listWarehouses 머지로 전 창고 채움 (없으면 0/0/0).
   */
  cells: Record<string, { available: number; reserved: number; total: number }>
}

/** 매트릭스 전체 — 헤더(창고 컬럼) + 행(품목). */
export interface BalanceMatrix {
  warehouses: BalanceWarehouseCol[]
  rows: BalanceMatrixRow[]
}

/**
 * 다건 품목의 창고별 가용/실/예약 매트릭스 — Phase 2.6d.
 *
 * batch(가용/실/예약) + listWarehouses 머지로 전 창고 집합 확보(D-IL-01).
 * VIRTUAL 창고 제외(D-IL-04 / 2.6c 관례).
 *
 * UUID 비공개 가드: warehouseId / productId 는 내부 key 전용, 화면 미노출.
 *
 * @param lines 조회 대상 라인 (productId + 모델명/품목명)
 * @return 전 창고(비-VIRTUAL) × 품목 매트릭스 (0/0/0 채움 포함)
 */
export async function fetchProductBalancesMatrix(
  lines: StockBalanceLookupLine[],
): Promise<BalanceMatrix> {
  const productIds = lines.map((l) => l.productId)
  const [balRes, warehouses] = await Promise.all([
    apiClient.post<ApiEnvelope<ProductBalanceResponse[]>>(
      '/inventory/balances/batch',
      { productIds },
    ),
    listWarehouses(),
  ])

  // 전 창고(비-VIRTUAL) 컬럼 — displayOrder ASC (listWarehouses 정렬 유지)
  const cols: BalanceWarehouseCol[] = warehouses
    .filter((w) => w.type !== 'VIRTUAL')
    .map((w) => ({
      warehouseId: w.id,
      warehouseCode: w.code,
      warehouseName: w.name,
      warehouseType: w.type,
    }))

  // batch 응답을 productId 키로 인덱싱 (B-2: 응답 없는 품목도 0/0/0 행 생성)
  const batchById = new Map(
    balRes.data.data.map((p) => [p.productId, p] as const),
  )

  // lines 기준 순회 — batch 응답 없는 품목도 전 창고 0/0/0 행 생성 (D-IL-01 동일 원칙)
  const rows: BalanceMatrixRow[] = lines.map((line) => {
    const p = batchById.get(line.productId)
    const cells: Record<string, { available: number; reserved: number; total: number }> = {}
    // 전 창고 0/0/0 초기화
    for (const c of cols) {
      cells[c.warehouseCode] = { available: 0, reserved: 0, total: 0 }
    }
    // batch 응답 있는 경우 덮어쓰기 (VIRTUAL 제외)
    if (p) {
      for (const b of p.balances) {
        if (b.warehouseType === 'VIRTUAL') continue
        cells[b.warehouseCode] = {
          available: b.availableQty,
          reserved: b.reservedQty,
          total: b.totalQty,
        }
      }
    }
    return {
      productId: line.productId,
      modelName: line.modelName,
      productName: line.productName,
      cells,
    }
  })

  return { warehouses: cols, rows }
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
