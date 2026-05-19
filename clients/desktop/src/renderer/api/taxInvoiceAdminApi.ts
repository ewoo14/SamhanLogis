import { apiClient, type ApiEnvelope } from './client'
import { MOCK_PURCHASE_ACCOUNTING_SLIPS } from './purchaseAccountingSlipApi'
import { MOCK_SALES_ACCOUNTING_SLIPS } from './salesAccountingSlipApi'

export interface CreateTaxInvoiceFromSalesSlipsRequest {
  salesSlipIds: string[]
  issuedDate: string
}

export interface TaxInvoiceFromSalesSlipsResponse {
  taxInvoiceNo: string
  partnerCode: string
  partnerName: string
  totalSupplyAmount: string
  totalVatAmount: string
  totalAmount: string
  linkedSalesSlipCount: number
  linkedSalesSlipNos: string[]
  status: string
}

export interface RegisterInboundTaxInvoiceRequest {
  purchaseSlipIds: string[]
  issuedDate: string
}

export interface InboundTaxInvoiceAttachmentResponse {
  filename: string
  minioObjectKey: string
  contentType: string
  sizeBytes: number
}

export interface InboundTaxInvoiceResponse {
  taxInvoiceId: string
  taxInvoiceNo: string
  partnerCode: string
  partnerName: string
  totalSupplyAmount: string
  totalVatAmount: string
  totalAmount: string
  linkedPurchaseSlipCount: number
  linkedPurchaseSlipNos: string[]
  status: string
  attachments: InboundTaxInvoiceAttachmentResponse[]
}

function unwrap<T>(payload: T | ApiEnvelope<T>): T {
  if (
    typeof payload === 'object'
    && payload !== null
    && 'data' in payload
    && 'success' in payload
  ) {
    return (payload as ApiEnvelope<T>).data
  }
  return payload as T
}

function isMockMode(): boolean {
  return import.meta.env['VITE_MOCK_MODE'] === '1'
}

export async function createTaxInvoiceFromSalesSlips(
  body: CreateTaxInvoiceFromSalesSlipsRequest,
): Promise<TaxInvoiceFromSalesSlipsResponse> {
  if (isMockMode()) {
    const selected = MOCK_SALES_ACCOUNTING_SLIPS.filter((row) =>
      body.salesSlipIds.includes(row.slipNo),
    )
    const first = selected[0] ?? MOCK_SALES_ACCOUNTING_SLIPS[0]
    const supply = selected.reduce((sum, row) => sum + Number(row.totalSupplyAmount), 0)
    const vat = selected.reduce((sum, row) => sum + Number(row.totalVatAmount), 0)
    return {
      taxInvoiceNo: `TI-${body.issuedDate.replace(/-/g, '')}-B01`,
      partnerCode: first?.partnerCode ?? 'P-10021',
      partnerName: first?.partnerName ?? '삼한물류 안산센터',
      totalSupplyAmount: String(supply),
      totalVatAmount: String(vat),
      totalAmount: String(supply + vat),
      linkedSalesSlipCount: selected.length,
      linkedSalesSlipNos: selected.map((row) => row.slipNo),
      status: 'ISSUED',
    }
  }
  const res = await apiClient.post<
    TaxInvoiceFromSalesSlipsResponse | ApiEnvelope<TaxInvoiceFromSalesSlipsResponse>
  >('/admin/tax-invoices/batch-from-sales-slips', body)
  return unwrap(res.data)
}

export async function registerInboundTaxInvoice(
  body: RegisterInboundTaxInvoiceRequest,
): Promise<InboundTaxInvoiceResponse> {
  if (isMockMode()) {
    const selected = MOCK_PURCHASE_ACCOUNTING_SLIPS.filter((row) =>
      body.purchaseSlipIds.includes(row.slipNo),
    )
    const first = selected[0] ?? MOCK_PURCHASE_ACCOUNTING_SLIPS[0]
    const supply = selected.reduce((sum, row) => sum + Number(row.totalSupplyAmount), 0)
    const vat = selected.reduce((sum, row) => sum + Number(row.totalVatAmount), 0)
    return {
      taxInvoiceId: body.purchaseSlipIds[0] ?? 'mock-inbound-tax-invoice-id',
      taxInvoiceNo: `IN-${body.issuedDate.replace(/-/g, '')}-R01`,
      partnerCode: first?.partnerCode ?? 'V-30011',
      partnerName: first?.partnerName ?? '한빛포장',
      totalSupplyAmount: String(supply),
      totalVatAmount: String(vat),
      totalAmount: String(supply + vat),
      linkedPurchaseSlipCount: selected.length,
      linkedPurchaseSlipNos: selected.map((row) => row.slipNo),
      status: 'RECEIVED',
      attachments: [],
    }
  }
  const res = await apiClient.post<
    InboundTaxInvoiceResponse | ApiEnvelope<InboundTaxInvoiceResponse>
  >('/admin/tax-invoices/inbound', body)
  return unwrap(res.data)
}

export async function uploadInboundTaxInvoiceAttachment(
  taxInvoiceId: string,
  file: File,
): Promise<InboundTaxInvoiceAttachmentResponse> {
  if (isMockMode()) {
    return {
      filename: file.name,
      minioObjectKey: `mock/inbound-tax-invoices/${taxInvoiceId}/${file.name}`,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    }
  }
  const form = new FormData()
  form.append('file', file)
  const res = await apiClient.post<
    InboundTaxInvoiceAttachmentResponse | ApiEnvelope<InboundTaxInvoiceAttachmentResponse>
  >(`/admin/tax-invoices/inbound/${encodeURIComponent(taxInvoiceId)}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return unwrap(res.data)
}
