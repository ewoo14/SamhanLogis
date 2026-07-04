import { apiClient, type ApiEnvelope } from './client'
import { isMockMode } from './mock'
import { MOCK_PURCHASE_ACCOUNTING_SLIPS } from './purchaseAccountingSlipApi'

export type TaxInvoiceStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED'
export type TaxInvoiceType = 'SALES' | 'PURCHASE'

export interface InboundTaxInvoiceSummary {
  id: string | null
  taxInvoiceNo: string
  invoiceType: TaxInvoiceType
  partnerCode: string | null
  partnerName: string
  partnerBusinessNumber: string | null
  issueDate: string
  supplyAmount: string
  vatAmount: string
  totalAmount: string
  status: TaxInvoiceStatus
  issuedAt: string | null
  issuedBy: string | null
  cancelledAt: string | null
  cancelReason: string | null
}

export async function listInboundTaxInvoices(filters: {
  from?: string
  to?: string
  partnerCode?: string
} = {}): Promise<InboundTaxInvoiceSummary[]> {
  if (isMockMode()) {
    return MOCK_PURCHASE_ACCOUNTING_SLIPS
      .filter((row) => {
        if (row.status !== 'POSTED') return false
        if (filters.from && row.slipDate < filters.from) return false
        if (filters.to && row.slipDate > filters.to) return false
        if (filters.partnerCode && !row.partnerCode.includes(filters.partnerCode)) return false
        return true
      })
      .map((row, index) => ({
        id: row.slipNo,
        taxInvoiceNo: `${row.slipDate.replace(/-/g, '/')}-${index + 1}`,
        invoiceType: 'PURCHASE',
        partnerCode: row.partnerCode,
        partnerName: row.partnerName,
        partnerBusinessNumber: null,
        issueDate: row.slipDate,
        supplyAmount: row.totalSupplyAmount,
        vatAmount: row.totalVatAmount,
        totalAmount: row.totalAmount,
        status: 'ISSUED',
        issuedAt: `${row.slipDate}T09:00:00`,
        issuedBy: 'mock-accountant',
        cancelledAt: null,
        cancelReason: null,
      }))
  }

  const params = new URLSearchParams()
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.partnerCode) params.set('partnerCode', filters.partnerCode)
  const query = params.toString()
  const res = await apiClient.get<
    InboundTaxInvoiceSummary[] | ApiEnvelope<InboundTaxInvoiceSummary[]>
  >(query ? `/admin/tax-invoices/inbound?${query}` : '/admin/tax-invoices/inbound')
  if (
    typeof res.data === 'object'
    && res.data !== null
    && 'data' in res.data
    && 'success' in res.data
  ) {
    return (res.data as ApiEnvelope<InboundTaxInvoiceSummary[]>).data
  }
  return res.data as InboundTaxInvoiceSummary[]
}
