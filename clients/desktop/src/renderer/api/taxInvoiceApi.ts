/**
 * 세금계산서 도메인 API 클라이언트 — P0-4.
 *
 * <p>BE 출처: {@code services/accounting-service} commit f8b8b49 — TaxInvoiceController.
 * 6 endpoint 매핑:
 * <ul>
 *   <li>{@code GET    /accounting/tax-invoices}             — 페이지 조회 (status / from / to / partnerId)</li>
 *   <li>{@code GET    /accounting/tax-invoices/{id}}        — 단건 + lines</li>
 *   <li>{@code POST   /accounting/tax-invoices}             — DRAFT 생성</li>
 *   <li>{@code PUT    /accounting/tax-invoices/{id}}        — DRAFT 수정 (헤더 + 라인 일괄)</li>
 *   <li>{@code POST   /accounting/tax-invoices/{id}/issue}  — DRAFT → ISSUED + 자동 분개 (110/255/400)</li>
 *   <li>{@code POST   /accounting/tax-invoices/{id}/cancel} — ISSUED → CANCELLED + 자동 역분개</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 ({@code feedback_uuid_no_user_visibility.md}):
 * - {@code id} / {@code partnerId} / {@code journalId} 는 path 또는 link 용 (사용자 노출 X)
 * - 화면 표시는 {@code taxInvoiceNo} (예: {@code 2026-05-001}) + {@code partnerName} + {@code partnerBusinessNo}
 *
 * <p>권한: ACCOUNTANT / MASTER 만 — RoleGuard 가 라우팅 단계에서 차단 (BE 도 PreAuthorize 강제).
 */
import {
  apiClient,
  type ApiEnvelope,
  type PageResponse,
} from './client'

/** 세금계산서 상태 — BE TaxInvoiceStatus 와 1:1. */
export type TaxInvoiceStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED'

/** 상태 → 한국어 라벨. */
export const TAX_INVOICE_STATUS_LABEL: Record<TaxInvoiceStatus, string> = {
  DRAFT: '임시저장',
  ISSUED: '발행',
  CANCELLED: '취소',
}

/**
 * 세금계산서 라인 응답 — BE {@code TaxInvoiceLineResponse}.
 *
 * <p>{@code supplyAmount = quantity × unitPrice}, {@code vatAmount = supplyAmount × 0.1}
 * 모두 BE 가 자동 계산. UI 는 표시 전용.
 */
export interface TaxInvoiceLine {
  /** 라인 UUID — 화면 미노출 (PUT 시 신규 생성). */
  lineId: string
  /** 0-based 라인 번호. */
  lineNo: number
  /** 품명. */
  itemName: string
  /** 규격 (옵션). */
  spec: string | null
  /** 수량 (BigDecimal — string). */
  quantity: string
  /** 단가 (KRW). */
  unitPrice: string
  /** 공급가액 = quantity × unitPrice. */
  supplyAmount: string
  /** 부가세 = supplyAmount × 0.1. */
  vatAmount: string
  /** 메모. */
  memo: string | null
}

/**
 * 세금계산서 헤더 — 페이지 조회용 (라인 미포함). BE {@code TaxInvoiceResponse}.
 */
export interface TaxInvoiceSummary {
  /** UUID — path param 전용. 화면 미노출. */
  id: string
  /** 사람이 읽는 발행번호 (ISSUED 상태일 때만 채워짐). */
  taxInvoiceNo: string | null
  partnerId: string
  partnerBusinessNo: string | null
  partnerName: string
  supplyDate: string
  supplyAmount: string
  vatAmount: string
  totalAmount: string
  status: TaxInvoiceStatus
  issuedAt: string | null
  issuedBy: string | null
  /** 자동 분개 UUID — 분개장 link 용. */
  journalId: string | null
  reverseJournalId: string | null
}

/**
 * 세금계산서 단건 상세 — BE {@code TaxInvoiceDetailResponse}.
 */
export interface TaxInvoiceDetail extends TaxInvoiceSummary {
  partnerAddress: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  eTaxExternalId: string | null
  description: string | null
  lines: TaxInvoiceLine[]
}

/** 라인 1건 생성/수정 요청. */
export interface CreateTaxInvoiceLineRequest {
  itemName: string
  spec?: string
  /** 수량 (BigDecimal — string 으로 직렬화). */
  quantity: string
  /** 단가. */
  unitPrice: string
  memo?: string
}

/** 세금계산서 신규/수정 요청 — POST/PUT 공용. */
export interface CreateTaxInvoiceRequest {
  partnerId: string
  partnerBusinessNo?: string
  partnerName: string
  partnerAddress?: string
  supplyDate: string
  description?: string
  lines: CreateTaxInvoiceLineRequest[]
}

/** 세금계산서 취소 요청 — 사유 필수 (BE `TaxInvoiceCancelRequest`). */
export interface TaxInvoiceCancelRequest {
  /** 취소 사유 (1~200자). */
  reason: string
}

/** 세금계산서 인쇄용 응답 — GET /{id}/print. 단건 상세와 동일 shape (BE alias). */
export type TaxInvoicePrintResponse = TaxInvoiceDetail

/** 세금계산서 목록 요약 응답 — GET / 페이지용 (lines 제외). BE `TaxInvoiceSummaryResponse`. */
export type TaxInvoiceSummaryResponse = TaxInvoiceSummary

/** 페이지 조회 옵션. */
export interface ListTaxInvoicesOptions {
  status?: TaxInvoiceStatus
  /** ISO 날짜 (YYYY-MM-DD) — supplyDate 범위 시작. */
  from?: string
  /** ISO 날짜 — supplyDate 범위 종료. */
  to?: string
  partnerId?: string
  page?: number
  size?: number
}

// ---------------------------------------------------------------------------
// endpoint 호출
// ---------------------------------------------------------------------------

/** 세금계산서 페이지 조회. */
export async function listTaxInvoices(
  options: ListTaxInvoicesOptions = {},
): Promise<PageResponse<TaxInvoiceSummary>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.status) params['status'] = options.status
  if (options.from) params['from'] = options.from
  if (options.to) params['to'] = options.to
  if (options.partnerId) params['partnerId'] = options.partnerId
  const res = await apiClient.get<ApiEnvelope<PageResponse<TaxInvoiceSummary>>>(
    '/accounting/tax-invoices',
    { params },
  )
  return res.data.data
}

/** 단건 상세. */
export async function getTaxInvoice(id: string): Promise<TaxInvoiceDetail> {
  const res = await apiClient.get<ApiEnvelope<TaxInvoiceDetail>>(
    `/accounting/tax-invoices/${id}`,
  )
  return res.data.data
}

/** 신규 생성 (DRAFT). */
export async function createTaxInvoice(
  body: CreateTaxInvoiceRequest,
): Promise<TaxInvoiceDetail> {
  const res = await apiClient.post<ApiEnvelope<TaxInvoiceDetail>>(
    '/accounting/tax-invoices',
    body,
  )
  return res.data.data
}

/** DRAFT 수정 — 헤더 + 라인 일괄 교체. */
export async function updateTaxInvoice(
  id: string,
  body: CreateTaxInvoiceRequest,
): Promise<TaxInvoiceDetail> {
  const res = await apiClient.put<ApiEnvelope<TaxInvoiceDetail>>(
    `/accounting/tax-invoices/${id}`,
    body,
  )
  return res.data.data
}

/** DRAFT → ISSUED — 발행번호 채번 + 자동 분개. */
export async function issueTaxInvoice(id: string): Promise<TaxInvoiceDetail> {
  const res = await apiClient.post<ApiEnvelope<TaxInvoiceDetail>>(
    `/accounting/tax-invoices/${id}/issue`,
    {},
  )
  return res.data.data
}

/**
 * ISSUED → CANCELLED — 자동 역분개.
 *
 * @param id 세금계산서 UUID (path param 전용).
 * @param request 취소 사유 (필수).
 */
export async function cancelTaxInvoice(
  id: string,
  request: TaxInvoiceCancelRequest,
): Promise<TaxInvoiceDetail> {
  const res = await apiClient.post<ApiEnvelope<TaxInvoiceDetail>>(
    `/accounting/tax-invoices/${id}/cancel`,
    request,
  )
  return res.data.data
}

/**
 * 인쇄용 데이터 조회 — GET /{id}/print.
 *
 * @param id 세금계산서 UUID (path param 전용).
 */
export async function getTaxInvoicePrintData(
  id: string,
): Promise<TaxInvoicePrintResponse> {
  const res = await apiClient.get<ApiEnvelope<TaxInvoicePrintResponse>>(
    `/accounting/tax-invoices/${id}/print`,
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 권한 helper — accounting.ts 의 canAccessAccounting 재사용 가능하지만,
// 세금계산서 전용 의미명으로 별도 export.
// ---------------------------------------------------------------------------

/** 세금계산서 메뉴/라우트 접근 권한 — ACCOUNTANT / MASTER 만 허용. */
export function canAccessTaxInvoice(role: string | undefined | null): boolean {
  if (!role) return false
  return role === 'ACCOUNTANT' || role === 'MASTER'
}
