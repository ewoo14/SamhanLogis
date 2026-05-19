/**
 * 세금계산서 일괄발행 (홈택스 양식) API 클라이언트 — GAS 이식 슬라이스.
 *
 * <p>BE 출처: {@code services/accounting-service} — TaxInvoiceBatchController.
 * 엔드포인트 목록:
 * <ul>
 *   <li>{@code POST /accounting/tax-invoices/batch/preview}        — 미리보기 생성 (날짜 범위 + 필터)</li>
 *   <li>{@code GET  /accounting/tax-invoices/batch/{id}/excel?fileIndex=N} — 분할 Excel 다운로드</li>
 *   <li>{@code GET  /accounting/tax-invoices/batch/exclusions}      — 제외 거래처 코드 마스터 목록</li>
 *   <li>{@code POST /accounting/tax-invoices/batch/exclusions}      — 제외 거래처 신규 추가</li>
 *   <li>{@code DELETE /accounting/tax-invoices/batch/exclusions/{partnerCode}} — 제외 거래처 삭제</li>
 *   <li>{@code GET  /accounting/tax-invoices/batch/history}         — 과거 일괄발행 이력 목록</li>
 *   <li>{@code GET  /accounting/tax-invoices/batch/history/{batchId}} — 단건 이력 조회</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 ({@code feedback_uuid_no_user_visibility.md}):
 * - {@code batchId} 는 path 전용 (화면 미노출)
 * - 사용자 노출: {@code batchNo} / {@code partnerCode} / {@code slipNo} 만 허용
 *
 * <p>권한: ACCOUNTANT / MANAGER / MASTER — RoleGuard 가 라우팅 단계에서 차단.
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'
import { isMockMode } from './mock'
import { MOCK_SALES_ACCOUNTING_SLIPS } from './salesAccountingSlipApi'

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

/**
 * 홈택스 양식 단일 행 — BE BatchPreviewRow 와 1:1 매핑.
 *
 * <p>컬럼은 국세청 홈택스 일괄등록 CSV 스펙 기준 (부가가치세법 시행규칙 별지 제38호).
 * 30개 컬럼 중 삼한로지스 업무 사용 필드만 포함.
 */
export interface BatchPreviewRow {
  /** 행 순번 (1-based). 화면 표시 전용 — BE 가 부여. */
  rowNo: number
  /** 전표번호 — 사용자 노출 식별자. */
  slipNo: string
  /** 작성일자 (YYYY-MM-DD). */
  issueDate: string
  /** 공급자 상호. */
  supplierName: string
  /** 공급자 사업자등록번호. */
  supplierBusinessNo: string
  /** 공급받는자 상호. */
  recipientName: string
  /** 공급받는자 사업자등록번호. */
  recipientBusinessNo: string
  /** 공급받는자 이메일 (전자세금계산서 수신). */
  recipientEmail: string | null
  /** 공급가액 (KRW — string BigDecimal). */
  supplyAmount: string
  /** 세액 = supplyAmount × 0.1. */
  vatAmount: string
  /** 합계 = supplyAmount + vatAmount. */
  totalAmount: string
  /** 품목명. */
  itemName: string | null
  /** 규격. */
  specification: string | null
  /** 수량. */
  quantity: string | null
  /** 단가. */
  unitPrice: string | null
  /** 비고. */
  remark: string | null
  /** 거래처 코드 — 비즈니스 식별자 (UUID 비공개). */
  partnerCode: string
}

/**
 * 미리보기 생성 요청 — POST /batch/preview.
 */
export interface BatchPreviewRequest {
  /** 시작일 (YYYY-MM-DD, Asia/Seoul 기준 이번달 1일 기본). */
  fromDate: string
  /** 종료일 (YYYY-MM-DD, Asia/Seoul 기준 이번달 말일 기본). */
  toDate: string
  /**
   * true = 회계반영일자 미전표 포함 / false = 회계반영일자 확정 전표만.
   * GAS '회계반영일자 미전표 제외' 토글의 역 논리.
   */
  includeUnconfirmed: boolean
  /** 추가 제외 거래처 코드 (선택). 미지정 시 exclusions 마스터 전체 적용. */
  excludePartnerCodes?: string[]
}

/**
 * 미리보기 생성 응답 — POST /batch/preview.
 */
export interface BatchPreviewResponse {
  /** 일괄발행 배치 식별 번호 — 사람이 읽는 식별자. */
  batchNo: string
  /** 내부 배치 UUID — path 전용 (화면 미노출). */
  batchId: string
  /** 전체 행 수. */
  totalRowCount: number
  /** 100건 단위 분할 파일 수. */
  splitFileCount: number
  /** 현재 페이지(파일 인덱스 0) rows — BE 는 전체 rows 를 단일 응답. */
  rows: BatchPreviewRow[]
  /** 적용된 제외 거래처 코드 목록. */
  exclusions: string[]
  /** 처리 기준 기간. */
  fromDate: string
  toDate: string
}

/**
 * 제외 거래처 마스터 단일 항목.
 */
export interface Exclusion {
  /** 거래처 코드 — 비즈니스 식별자 (사용자 노출 허용). */
  partnerCode: string
  /** 거래처명 (표시용). */
  partnerName: string
  /** 제외 사유. */
  reason: string
  /** 등록일시. */
  createdAt: string
  /** 등록자명. */
  createdBy: string
}

/**
 * 제외 거래처 신규 추가 요청.
 */
export interface AddExclusionRequest {
  partnerCode: string
  partnerName: string
  reason: string
}

/**
 * 일괄발행 이력 단일 항목 — GET /batch/history 목록용.
 */
export interface BatchHistory {
  /** 배치 UUID — path 전용 (화면 미노출). */
  batchId: string
  /** 사람이 읽는 배치 번호 — 사용자 노출. */
  batchNo: string
  /** 처리 기준 기간 시작일. */
  fromDate: string
  /** 처리 기준 기간 종료일. */
  toDate: string
  /** 처리일시. */
  processedAt: string
  /** 작업자명. */
  processedBy: string
  /** 전체 행 수. */
  totalRowCount: number
  /** 분할 파일 수. */
  splitFileCount: number
}

/**
 * 이력 단건 조회 응답 — GET /batch/history/{batchId}.
 * BatchPreviewResponse 와 동일 shape (dataSnapshotJson 복원).
 */
export type BatchHistoryDetail = BatchPreviewResponse

export interface TaxInvoiceBatchCandidateSlip {
  salesSlipId: string
  slipNo: string
  slipDate: string
  totalSupplyAmount: string
  totalVatAmount: string
  totalAmount: string
}

export interface TaxInvoiceBatchCandidate {
  groupKey: string
  month: string
  partnerCode: string
  partnerName: string
  slipCount: number
  totalSupplyAmount: string
  totalVatAmount: string
  totalAmount: string
  salesSlips: TaxInvoiceBatchCandidateSlip[]
}

// ---------------------------------------------------------------------------
// API 호출 함수
// ---------------------------------------------------------------------------

/**
 * 미리보기 생성 — 날짜 범위 + 필터 옵션으로 홈택스 양식 rows 생성.
 *
 * @param req 미리보기 생성 요청 (fromDate / toDate / includeUnconfirmed)
 */
export async function previewBatch(
  req: BatchPreviewRequest,
): Promise<BatchPreviewResponse> {
  const res = await apiClient.post<ApiEnvelope<BatchPreviewResponse>>(
    '/accounting/tax-invoices/batch/preview',
    req,
  )
  return res.data.data
}

/**
 * 분할 Excel 다운로드 — fileIndex 는 0-based (splitFileCount - 1 까지).
 *
 * @param batchId 배치 UUID (path param 전용)
 * @param fileIndex 0-based 파일 인덱스 (100건 단위 분할)
 */
export async function downloadBatchExcel(
  batchId: string,
  fileIndex: number,
): Promise<Blob> {
  const res = await apiClient.get(
    `/accounting/tax-invoices/batch/${batchId}/excel`,
    {
      params: { fileIndex },
      responseType: 'blob',
    },
  )
  return res.data as Blob
}

/**
 * 제외 거래처 마스터 목록 조회.
 */
export async function listExclusions(): Promise<Exclusion[]> {
  const res = await apiClient.get<ApiEnvelope<Exclusion[]>>(
    '/accounting/tax-invoices/batch/exclusions',
  )
  return res.data.data
}

/**
 * 제외 거래처 신규 추가.
 *
 * @param req 거래처 코드 + 사유
 */
export async function addExclusion(req: AddExclusionRequest): Promise<Exclusion> {
  const res = await apiClient.post<ApiEnvelope<Exclusion>>(
    '/accounting/tax-invoices/batch/exclusions',
    req,
  )
  return res.data.data
}

/**
 * 제외 거래처 삭제.
 *
 * @param partnerCode 거래처 코드 (path param)
 */
export async function deleteExclusion(partnerCode: string): Promise<void> {
  await apiClient.delete(
    `/accounting/tax-invoices/batch/exclusions/${encodeURIComponent(partnerCode)}`,
  )
}

/**
 * 과거 일괄발행 이력 목록 조회.
 *
 * @param opts 페이지 옵션 (page / size)
 */
export async function listBatchHistory(opts: {
  page?: number
  size?: number
}): Promise<PageResponse<BatchHistory>> {
  const res = await apiClient.get<ApiEnvelope<PageResponse<BatchHistory>>>(
    '/accounting/tax-invoices/batch/history',
    {
      params: {
        page: opts.page ?? 0,
        size: opts.size ?? 20,
      },
    },
  )
  return res.data.data
}

/**
 * 이력 단건 조회 — dataSnapshotJson 복원하여 Tab 2 rows 표시용.
 *
 * @param batchId 배치 UUID (path param 전용)
 */
export async function getBatchHistory(batchId: string): Promise<BatchHistoryDetail> {
  const res = await apiClient.get<ApiEnvelope<BatchHistoryDetail>>(
    `/accounting/tax-invoices/batch/history/${batchId}`,
  )
  return res.data.data
}

export async function listTaxInvoiceBatchCandidates(filters: {
  from?: string
  to?: string
  partnerCode?: string
} = {}): Promise<TaxInvoiceBatchCandidate[]> {
  if (isMockMode()) {
    const rows = MOCK_SALES_ACCOUNTING_SLIPS.filter((row) => {
      if (row.status !== 'POSTED') return false
      if (filters.from && row.slipDate < filters.from) return false
      if (filters.to && row.slipDate > filters.to) return false
      if (filters.partnerCode && !row.partnerCode.includes(filters.partnerCode)) return false
      return true
    })
    const grouped = new Map<string, typeof rows>()
    for (const row of rows) {
      const month = row.slipDate.slice(0, 7)
      const key = `${row.partnerCode}:${month}`
      grouped.set(key, [...(grouped.get(key) ?? []), row])
    }
    return Array.from(grouped.entries()).map(([groupKey, groupRows]) => {
      const first = groupRows[0]!
      const totalSupply = groupRows.reduce((sum, row) => sum + Number(row.totalSupplyAmount), 0)
      const totalVat = groupRows.reduce((sum, row) => sum + Number(row.totalVatAmount), 0)
      const total = groupRows.reduce((sum, row) => sum + Number(row.totalAmount), 0)
      return {
        groupKey,
        month: first.slipDate.slice(0, 7),
        partnerCode: first.partnerCode,
        partnerName: first.partnerName,
        slipCount: groupRows.length,
        totalSupplyAmount: String(totalSupply),
        totalVatAmount: String(totalVat),
        totalAmount: String(total),
        salesSlips: groupRows.map((row) => ({
          salesSlipId: row.slipNo,
          slipNo: row.slipNo,
          slipDate: row.slipDate,
          totalSupplyAmount: row.totalSupplyAmount,
          totalVatAmount: row.totalVatAmount,
          totalAmount: row.totalAmount,
        })),
      }
    })
  }

  const params = new URLSearchParams()
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.partnerCode) params.set('partnerCode', filters.partnerCode)
  const query = params.toString()
  const res = await apiClient.get<
    TaxInvoiceBatchCandidate[] | ApiEnvelope<TaxInvoiceBatchCandidate[]>
  >(query
    ? `/admin/tax-invoices/batch-from-sales-slips/candidates?${query}`
    : '/admin/tax-invoices/batch-from-sales-slips/candidates')
  if (
    typeof res.data === 'object'
    && res.data !== null
    && 'data' in res.data
    && 'success' in res.data
  ) {
    return (res.data as ApiEnvelope<TaxInvoiceBatchCandidate[]>).data
  }
  return res.data as TaxInvoiceBatchCandidate[]
}
