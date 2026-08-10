/**
 * 홈택스 일괄 등록 양식 export API — PR-E2 FE-9 (단순 다운로드) + PR #161 흡수 (4탭 preview/split/exclusions/history).
 *
 * <p>BE 출처: {@code services/accounting-service}.
 *
 * <p>endpoint 목록:
 * <ul>
 *   <li>Tab 0 (단순 다운로드): {@code GET /accounting/tax-invoice/hometax-export?from=&to=}
 *       — legacy 단일 xlsx (8컬럼, 회귀 보존)</li>
 *   <li>Tab 1 (미리보기): {@code POST /accounting/hometax-export/preview}
 *       — 59컬럼 변환 + 100건 분할 + 제외 거래처 적용</li>
 *   <li>Tab 2 (결과): {@code GET /accounting/hometax-export/{batchId}/split?fileIndex=N}
 *       — 분할 xlsx Blob</li>
 *   <li>Tab 3 (제외): {@code GET/POST/DELETE /accounting/hometax-export/exclusions[/{partnerCode}]}</li>
 *   <li>Tab 4 (이력): {@code GET /accounting/hometax-export/history[/{batchId}]}</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 ({@code feedback_uuid_no_user_visibility.md}):
 * - {@code batchId} 는 path 전용 (화면 미노출)
 * - 사용자 노출: {@code batchNo} / {@code partnerCode} / {@code slipNo} 만 허용
 *
 * <p>권한: ACCOUNTANT / MANAGER / MASTER — RoleGuard 가 라우팅 단계에서 차단.
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

// ---------------------------------------------------------------------------
// 타입 정의 (PR #161 TaxInvoiceBatchPage 에서 통합)
// ---------------------------------------------------------------------------

/**
 * 홈택스 양식 단일 행 — BE HometaxPreviewRow 와 1:1 매핑.
 *
 * <p>컬럼은 국세청 홈택스 일괄등록 CSV 스펙 기준 (부가가치세법 시행규칙 별지 제38호).
 */
/** 백엔드 HomtaxRow wire DTO — 필드명은 HomtaxRow record와 동일하게 유지한다. */
export interface HometaxPreviewRow {
  invoiceType: string
  writeDate: string
  supplierRegNo: string
  supplierSubNo: string
  supplierName: string
  supplierCeo: string
  supplierAddress: string
  supplierBizType: string
  supplierBizItem: string
  supplierEmail: string
  buyerRegNo: string
  buyerSubNo: string
  buyerName: string
  buyerCeo: string
  buyerAddress: string
  buyerBizType: string
  buyerBizItem: string
  buyerEmail1: string
  buyerEmail2: string
  supplyAmount: string | number | null
  vatAmount: string | number | null
  remark: string
  itemDate1: string
  itemName1: string
  itemSpec1: string
  itemQty1: string | number | null
  itemPrice1: string | number | null
  itemSupply1: string | number | null
  itemVat1: string | number | null
  itemRemark1: string
  itemDate2: string
  itemName2: string
  itemSpec2: string
  itemQty2: string | number | null
  itemPrice2: string | number | null
  itemSupply2: string | number | null
  itemVat2: string | number | null
  itemRemark2: string
  itemDate3: string
  itemName3: string
  itemSpec3: string
  itemQty3: string | number | null
  itemPrice3: string | number | null
  itemSupply3: string | number | null
  itemVat3: string | number | null
  itemRemark3: string
  itemDate4: string
  itemName4: string
  itemSpec4: string
  itemQty4: string | number | null
  itemPrice4: string | number | null
  itemSupply4: string | number | null
  itemVat4: string | number | null
  itemRemark4: string
  cash: string | number | null
  check: string | number | null
  bill: string | number | null
  credit: string | number | null
  receiptType: string
  slipNo: string
  /** 내부용 정본 필드 — HomtaxRow 결과표 표시용. XLSX에는 포함하지 않는다. */
  partnerCode: string
}

/** 결과표 전용 파생 필드. 나머지 열은 HometaxRow wire 필드를 그대로 사용한다. */
export type HometaxResultRow = HometaxPreviewRow & { rowNo: number; totalAmount: string }

/** 백엔드 정본 필드에서 화면 결과표 행을 만든다. */
export function toHometaxResultRow(row: HometaxPreviewRow, rowNo: number): HometaxResultRow {
  const supply = Number(row.supplyAmount ?? 0)
  const vat = Number(row.vatAmount ?? 0)
  return { ...row, rowNo, totalAmount: String(supply + vat) }
}

/**
 * 미리보기 생성 요청 — POST /hometax-export/preview.
 */
export interface HometaxPreviewRequest {
  /** 시작일 (YYYY-MM-DD). */
  fromDate: string
  /** 종료일 (YYYY-MM-DD). */
  toDate: string
  /**
   * true = 회계반영일자 미전표 포함 / false = 확정 전표만.
   */
  includeUnconfirmed: boolean
  /** 추가 제외 거래처 코드 (선택). */
  excludePartnerCodes?: string[]
}

/**
 * 미리보기 생성 응답 — POST /hometax-export/preview.
 */
export interface HometaxPreviewResponse {
  /** 일괄발행 배치 식별 번호 — 사람이 읽는 식별자 (사용자 노출). */
  batchNo: string
  /** 내부 배치 UUID — path 전용 (화면 미노출). */
  batchId: string
  /** 전체 행 수. */
  totalRowCount: number
  /** 100건 단위 분할 파일 수. */
  splitFileCount: number
  /** 현재 페이지(파일 인덱스 0) rows. */
  rows: HometaxPreviewRow[]
  /** 적용된 제외 거래처 코드 목록. */
  exclusions: string[]
  /** 처리 기준 기간 시작일. */
  fromDate: string
  /** 처리 기준 기간 종료일. */
  toDate: string
}

/**
 * 제외 거래처 마스터 단일 항목.
 */
export interface HometaxExclusion {
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
export interface AddHometaxExclusionRequest {
  partnerCode: string
  partnerName: string
  reason: string
}

/**
 * 일괄발행 이력 단일 항목 — GET /hometax-export/history 목록용.
 */
export interface HometaxBatchHistory {
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
 * 이력 단건 조회 응답 — HometaxPreviewResponse 와 동일 shape.
 */
export type HometaxBatchHistoryDetail = HometaxPreviewResponse

// ---------------------------------------------------------------------------
// API 호출 함수 — Tab 0 (legacy 단순 다운로드)
// ---------------------------------------------------------------------------

/**
 * 홈택스 일괄 등록 양식 .xlsx 다운로드 (Tab 0 legacy — PR-E2 FE-9).
 *
 * @param from ISO 날짜 (YYYY-MM-DD) — supplyDate 범위 시작
 * @param to   ISO 날짜 (YYYY-MM-DD) — supplyDate 범위 종료
 * @return     binary .xlsx Blob
 */
export async function downloadHometaxExport(
  from: string,
  to: string,
): Promise<Blob> {
  const res = await apiClient.get<Blob>(
    '/accounting/tax-invoice/hometax-export',
    {
      params: { from, to },
      responseType: 'blob',
      timeout: 60_000,
    },
  )
  return res.data
}

/**
 * 한국어 파일명 빌더 — `홈택스_일괄등록_YYYY-MM-DD_YYYY-MM-DD.xlsx`.
 *
 * <p>피드백 — 한국어 파일명 의무 (사용자 노출 파일명).
 */
export function buildHometaxExportFilename(from: string, to: string): string {
  return `홈택스_일괄등록_${from}_${to}.xlsx`
}

// ---------------------------------------------------------------------------
// API 호출 함수 — Tab 1 (미리보기 생성)
// ---------------------------------------------------------------------------

/**
 * 미리보기 생성 — BE cleanup agent 신규 endpoint.
 *
 * @param req 미리보기 생성 요청 (fromDate / toDate / includeUnconfirmed)
 */
export async function previewHometax(
  req: HometaxPreviewRequest,
): Promise<HometaxPreviewResponse> {
  const res = await apiClient.post<ApiEnvelope<HometaxPreviewResponse>>(
    '/accounting/hometax-export/preview',
    req,
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// API 호출 함수 — Tab 2 (분할 Excel 다운로드)
// ---------------------------------------------------------------------------

/**
 * 분할 Excel 다운로드 — fileIndex 는 0-based (splitFileCount - 1 까지).
 *
 * @param batchId 배치 UUID (path param 전용 — 화면 미노출)
 * @param fileIndex 0-based 파일 인덱스 (100건 단위 분할)
 */
export async function downloadHometaxSplit(
  batchId: string,
  fileIndex: number,
): Promise<Blob> {
  const res = await apiClient.get(
    `/accounting/hometax-export/${batchId}/split`,
    {
      params: { fileIndex },
      responseType: 'blob',
    },
  )
  return res.data as Blob
}

// ---------------------------------------------------------------------------
// API 호출 함수 — Tab 3 (제외 거래처 CRUD)
// ---------------------------------------------------------------------------

/**
 * 제외 거래처 마스터 목록 조회.
 */
export async function listHometaxExclusions(): Promise<HometaxExclusion[]> {
  const res = await apiClient.get<ApiEnvelope<HometaxExclusion[]>>(
    '/accounting/hometax-export/exclusions',
  )
  return res.data.data
}

/**
 * 제외 거래처 신규 추가.
 *
 * @param req 거래처 코드 + 사유
 */
export async function addHometaxExclusion(
  req: AddHometaxExclusionRequest,
): Promise<HometaxExclusion> {
  const res = await apiClient.post<ApiEnvelope<HometaxExclusion>>(
    '/accounting/hometax-export/exclusions',
    req,
  )
  return res.data.data
}

/**
 * 제외 거래처 삭제.
 *
 * @param partnerCode 거래처 코드 (path param)
 */
export async function deleteHometaxExclusion(partnerCode: string): Promise<void> {
  await apiClient.delete(
    `/accounting/hometax-export/exclusions/${encodeURIComponent(partnerCode)}`,
  )
}

// ---------------------------------------------------------------------------
// API 호출 함수 — Tab 4 (저장 내역)
// ---------------------------------------------------------------------------

/**
 * 과거 일괄발행 이력 목록 조회.
 *
 * @param opts 페이지 옵션 (page / size)
 */
export async function listHometaxHistory(opts: {
  page?: number
  size?: number
}): Promise<PageResponse<HometaxBatchHistory>> {
  const res = await apiClient.get<ApiEnvelope<PageResponse<HometaxBatchHistory>>>(
    '/accounting/hometax-export/history',
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
 * @param batchId 배치 UUID (path param 전용 — 화면 미노출)
 */
export async function getHometaxHistory(batchId: string): Promise<HometaxBatchHistoryDetail> {
  const res = await apiClient.get<ApiEnvelope<HometaxBatchHistoryDetail>>(
    `/accounting/hometax-export/history/${batchId}`,
  )
  return res.data.data
}
