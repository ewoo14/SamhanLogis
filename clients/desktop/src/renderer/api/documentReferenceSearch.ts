/**
 * 그룹웨어 결재 통합 문서 참조 검색 API.
 *
 * UUID 비공개 가드: 검색 응답과 선택값은 문서번호, 거래처명, 적요, 금액, 일자만 사용한다.
 */
import { apiClient, type ApiEnvelope } from './client'
import { searchSlips, type SlipSearchResult } from './slipSearch'

export type ApprovalReferenceDocType =
  | 'OUTBOUND_SLIP'
  | 'INBOUND_SLIP'
  | 'JOURNAL'
  | 'TAX_INVOICE'
  | 'STATEMENT'
  | 'PARTNER_LEDGER'
  | 'SALES_COMMISSION_SETTLEMENT'

export const APPROVAL_REFERENCE_DOC_TYPE_LABEL: Record<ApprovalReferenceDocType, string> = {
  OUTBOUND_SLIP: '출고전표',
  INBOUND_SLIP: '입고전표',
  JOURNAL: '분개장',
  TAX_INVOICE: '세금계산서',
  STATEMENT: '거래명세서',
  PARTNER_LEDGER: '거래처원장',
  SALES_COMMISSION_SETTLEMENT: '영업수수료 정산서',
}

export interface AccountingJournalSearchResult {
  journalNo: string
  journalDate: string
  description: string | null
  totalAmount: string | number | null
}

export interface AccountingTaxInvoiceSearchResult {
  taxInvoiceNo: string
  date: string
  partnerName: string | null
  amount: string | number | null
}

export interface AccountingStatementSearchResult {
  statementNo: string
  date: string
  partnerName: string | null
  amount: string | number | null
}

export interface AccountingLedgerPartnerSearchResult {
  partnerCode: string
  partnerName: string
}

export interface AccountingSalesCommissionSettlementSearchResult {
  settlementNo: string
  settlementDate: string
  status: string
  payoutAmount: string | number | null
}

export type DocumentReferenceSearchResult =
  | SlipSearchResult
  | AccountingJournalSearchResult
  | AccountingTaxInvoiceSearchResult
  | AccountingStatementSearchResult
  | AccountingLedgerPartnerSearchResult
  | AccountingSalesCommissionSettlementSearchResult

export interface DocumentReferenceOption {
  type: ApprovalReferenceDocType
  refDocNo: string | null
  refDocLabel: string | null
  partnerCode: string | null
  partnerName: string | null
  date: string | null
  amount: string | number | null
  summary: string | null
}

function normalizeLimit(limit: number): number {
  return Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : 10, 1), 20)
}

async function searchAccounting<T>(path: string, q: string, limit: number): Promise<T[]> {
  const keyword = q.trim()
  if (!keyword) return []
  const res = await apiClient.get<ApiEnvelope<T[]>>(path, {
    params: { q: keyword, limit: normalizeLimit(limit) },
  })
  return res.data.data ?? []
}

export async function searchByType(
  type: ApprovalReferenceDocType,
  q: string,
  limit = 10,
): Promise<DocumentReferenceSearchResult[]> {
  const keyword = q.trim()
  if (!keyword) return []
  switch (type) {
    case 'OUTBOUND_SLIP':
      return searchSlips(keyword, limit, 'OUTBOUND')
    case 'INBOUND_SLIP':
      return searchSlips(keyword, limit, 'INBOUND')
    case 'JOURNAL':
      return searchAccounting<AccountingJournalSearchResult>('/admin/accounting/journals/search', keyword, limit)
    case 'TAX_INVOICE':
      return searchAccounting<AccountingTaxInvoiceSearchResult>('/admin/accounting/tax-invoices/search', keyword, limit)
    case 'STATEMENT':
      return searchAccounting<AccountingStatementSearchResult>('/admin/accounting/statements/search', keyword, limit)
    case 'PARTNER_LEDGER':
      return searchAccounting<AccountingLedgerPartnerSearchResult>('/admin/accounting/ledgers/partners/search', keyword, limit)
    case 'SALES_COMMISSION_SETTLEMENT':
      return searchAccounting<AccountingSalesCommissionSettlementSearchResult>(
        '/admin/accounting/sales-commission-settlements/search', keyword, limit,
      )
    default:
      return []
  }
}

export function normalizeDocumentReferenceOption(
  type: ApprovalReferenceDocType,
  result: DocumentReferenceSearchResult,
): DocumentReferenceOption {
  if (type === 'OUTBOUND_SLIP' || type === 'INBOUND_SLIP') {
    const row = result as SlipSearchResult
    return {
      type,
      refDocNo: row.slipNo,
      refDocLabel: row.partnerName,
      partnerCode: null,
      partnerName: row.partnerName,
      date: row.slipDate,
      amount: row.displayTotalAmount ?? row.totalAmount,
      summary: row.partnerName,
    }
  }
  if (type === 'JOURNAL') {
    const row = result as AccountingJournalSearchResult
    return {
      type,
      refDocNo: row.journalNo,
      refDocLabel: row.description,
      partnerCode: null,
      partnerName: null,
      date: row.journalDate,
      amount: row.totalAmount,
      summary: row.description,
    }
  }
  if (type === 'TAX_INVOICE') {
    const row = result as AccountingTaxInvoiceSearchResult
    return {
      type,
      refDocNo: row.taxInvoiceNo,
      refDocLabel: row.partnerName,
      partnerCode: null,
      partnerName: row.partnerName,
      date: row.date,
      amount: row.amount,
      summary: row.partnerName,
    }
  }
  if (type === 'STATEMENT') {
    const row = result as AccountingStatementSearchResult
    return {
      type,
      refDocNo: row.statementNo,
      refDocLabel: row.partnerName,
      partnerCode: null,
      partnerName: row.partnerName,
      date: row.date,
      amount: row.amount,
      summary: row.partnerName,
    }
  }
  if (type === 'SALES_COMMISSION_SETTLEMENT') {
    const row = result as AccountingSalesCommissionSettlementSearchResult
    return {
      type,
      refDocNo: row.settlementNo,
      refDocLabel: row.status,
      partnerCode: null,
      partnerName: null,
      date: row.settlementDate,
      amount: row.payoutAmount,
      summary: row.status,
    }
  }
  const row = result as AccountingLedgerPartnerSearchResult
  return {
    type,
    refDocNo: null,
    refDocLabel: row.partnerName,
    partnerCode: row.partnerCode,
    partnerName: row.partnerName,
    date: null,
    amount: null,
    summary: row.partnerCode,
  }
}
