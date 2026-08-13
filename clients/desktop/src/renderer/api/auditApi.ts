/**
 * 재고 실사 API 클라이언트 — Phase 10 P2-6 슬라이스 9.
 *
 * BE endpoint (commit 2064f72):
 * - GET    /inventory/audits                  — warehouse/year/status 필터 + 페이지
 * - GET    /inventory/audits/{id}             — 단건 상세 (라인 포함)
 * - POST   /inventory/audits                  — 신규 등록 (PLANNED + snapshot 라인)
 * - POST   /inventory/audits/{id}/start       — PLANNED → IN_PROGRESS
 * - POST   /inventory/audits/{id}/lines       — 바코드/수동 라인 입력
 * - PUT    /inventory/audits/{id}/lines/{lineId} — 라인 직접 수정
 * - POST   /inventory/audits/{id}/complete    — IN_PROGRESS → COMPLETED + 차이 자동 분개
 * - POST   /inventory/audits/{id}/cancel      — PLANNED/IN_PROGRESS → CANCELLED
 *
 * UUID 비공개 가드: id / lineId / productId 는 mutation key 전용. 사용자 노출 식별자는
 * auditNo / warehouseCode / productName.
 *
 * 권한: 조회 = MASTER/MANAGER/DEVELOPER/ACCOUNTANT/WAREHOUSE/INVENTORY,
 *       생성/start/complete/cancel = MASTER/MANAGER/INVENTORY,
 *       라인 입력 = MASTER/MANAGER/WAREHOUSE/INVENTORY.
 */
import {
  apiClient,
  type ApiEnvelope,
  type PageResponse,
} from './client'

/** BE `AuditStatus` enum 과 1:1. */
export type AuditStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

/** AuditStatus → 한국어 표시 라벨. */
export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = {
  PLANNED: '계획됨',
  IN_PROGRESS: '진행중',
  COMPLETED: '완료',
  CANCELLED: '취소',
}

/** BE `AuditResponse` 와 1:1 (목록용 요약). */
export interface AuditSummary {
  /** 실사 UUID — mutation path key 전용, 화면 미노출. */
  id: string
  /** 사용자 노출 식별자 (예: AUD-2026/05-001). */
  auditNo: string
  /** 창고 UUID — 필터/조회 키 전용. */
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  /** YYYY-MM-DD. */
  auditDate: string
  status: AuditStatus
  /** KRW 정수 string (BigDecimal 직렬화). */
  totalDiffAmount: string
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
}

/** BE `AuditDetailResponse.AuditLineResponse` 와 1:1. */
export interface AuditLine {
  /** 라인 UUID — mutation path key 전용. */
  id: string
  /** 제품 UUID — 라인 검색/입력 키 (사용자 미노출). */
  productId: string
  /** snapshot 시점의 제품명. */
  productName: string
  expectedQty: number
  actualQty: number | null
  diffQty: number
  /** 단가 KRW string. */
  unitCost: string
  /** 차이 금액 KRW string. */
  diffAmount: string
  barcodeScanned: boolean
  scannedAt: string | null
}

/** BE `AuditDetailResponse` 와 1:1. */
export interface AuditDetail extends AuditSummary {
  lines: AuditLine[]
}

/** 실사 목록 조회 옵션. */
export interface ListAuditsOptions {
  warehouseId?: string
  year?: number
  status?: AuditStatus
  page?: number
  size?: number
}

/**
 * 재고 실사 목록 조회.
 */
export async function listAudits(
  options: ListAuditsOptions = {},
): Promise<PageResponse<AuditSummary>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.warehouseId) params['warehouseId'] = options.warehouseId
  if (options.year !== undefined) params['year'] = options.year
  if (options.status) params['status'] = options.status

  const res = await apiClient.get<ApiEnvelope<PageResponse<AuditSummary>>>(
    '/inventory/audits',
    { params },
  )
  return res.data.data
}

/** 재고 실사 단건 상세 (라인 포함). */
export async function getAudit(id: string): Promise<AuditDetail> {
  const res = await apiClient.get<ApiEnvelope<AuditDetail>>(
    `/inventory/audits/${id}`,
  )
  return res.data.data
}

/** 신규 실사 등록 요청 — BE `CreateAuditRequest`. */
export interface CreateAuditRequest {
  warehouseId: string
  /** YYYY-MM-DD. */
  auditDate: string
}

/** 신규 실사 등록 (PLANNED + snapshot 라인 자동 생성). */
export async function createAudit(
  body: CreateAuditRequest,
): Promise<AuditDetail> {
  const res = await apiClient.post<ApiEnvelope<AuditDetail>>(
    '/inventory/audits',
    body,
  )
  return res.data.data
}

/** 실사 시작 — PLANNED → IN_PROGRESS. */
export async function startAudit(id: string): Promise<AuditDetail> {
  const res = await apiClient.post<ApiEnvelope<AuditDetail>>(
    `/inventory/audits/${id}/start`,
    {},
  )
  return res.data.data
}

/** 실사 완료 — IN_PROGRESS → COMPLETED + 차이 자동 분개. */
export async function completeAudit(id: string): Promise<AuditDetail> {
  const res = await apiClient.post<ApiEnvelope<AuditDetail>>(
    `/inventory/audits/${id}/complete`,
    {},
  )
  return res.data.data
}

/** 실사 취소 — PLANNED/IN_PROGRESS → CANCELLED. */
export async function cancelAudit(id: string): Promise<AuditDetail> {
  const res = await apiClient.post<ApiEnvelope<AuditDetail>>(
    `/inventory/audits/${id}/cancel`,
    {},
  )
  return res.data.data
}

/** 라인 입력 요청 — BE `AuditLineRequest`. */
export interface AuditLineRequest {
  productId?: string
  productCode?: string
  actualQty: number
  scanned?: boolean
}

/** 라인 입력 (POST) — productId 또는 품목코드/바코드로 snapshot 라인을 검색해 actual_qty set. */
export async function recordAuditLine(
  id: string,
  body: AuditLineRequest,
): Promise<AuditDetail> {
  const res = await apiClient.post<ApiEnvelope<AuditDetail>>(
    `/inventory/audits/${id}/lines`,
    body,
  )
  return res.data.data
}

/** 라인 직접 수정 (PUT). */
export async function updateAuditLine(
  id: string,
  lineId: string,
  body: AuditLineRequest,
): Promise<AuditDetail> {
  const res = await apiClient.put<ApiEnvelope<AuditDetail>>(
    `/inventory/audits/${id}/lines/${lineId}`,
    body,
  )
  return res.data.data
}
