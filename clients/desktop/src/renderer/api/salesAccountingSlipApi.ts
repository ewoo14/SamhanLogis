import { apiClient, type ApiEnvelope } from './client'

export type SalesAccountingSlipStatus = 'DRAFT' | 'POSTED'
export type SalesTaxType = 'TAXABLE' | 'ZERO_RATED' | 'EXEMPT'

export interface SlipAllocationRequest {
  sourceSlipId: string
  sourceSlipNo: string
  sourceLineId: string
  sourceLineNo: number
  allocatedQty: string
  allocatedAmount: string
}

export interface SalesAccountingSlipLineRequest {
  productCode: string
  productName: string
  qty: string
  unitPrice: string
  allocations: SlipAllocationRequest[]
}

export interface CreateSalesAccountingSlipRequest {
  slipDate: string
  partnerId: string
  partnerCode: string
  partnerName: string
  taxType: SalesTaxType
  memo?: string
  lines: SalesAccountingSlipLineRequest[]
}

export interface SlipAllocationResponse {
  sourceSlipNo: string
  sourceLineNo: number
  allocatedQty: string
  allocatedAmount: string
}

export interface SalesAccountingSlipLineResponse {
  lineNo: number
  productCode: string
  productName: string
  qty: string
  unitPrice: string
  supplyAmount: string
  vatAmount: string
  lineTotal: string
  allocations: SlipAllocationResponse[]
}

export interface SalesAccountingSlipResponse {
  slipNo: string
  slipDate: string
  partnerCode: string
  partnerName: string
  taxType: SalesTaxType
  status: SalesAccountingSlipStatus
  totalSupplyAmount: string
  totalVatAmount: string
  totalAmount: string
  memo: string | null
  lines: SalesAccountingSlipLineResponse[]
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

export const MOCK_SALES_ACCOUNTING_SLIPS: SalesAccountingSlipResponse[] = [
  {
    slipNo: 'SAS-20260520-001',
    slipDate: '2026-05-20',
    partnerCode: 'P-10021',
    partnerName: '삼한물류 안산센터',
    taxType: 'TAXABLE',
    status: 'POSTED',
    totalSupplyAmount: '1250000',
    totalVatAmount: '125000',
    totalAmount: '1375000',
    memo: '출고전표 2건 묶음',
    lines: [
      {
        lineNo: 1,
        productCode: 'SKU-A100',
        productName: '표준 팔레트 A',
        qty: '10',
        unitPrice: '125000',
        supplyAmount: '1250000',
        vatAmount: '125000',
        lineTotal: '1375000',
        allocations: [
          {
            sourceSlipNo: 'OUT-20260520-014',
            sourceLineNo: 1,
            allocatedQty: '6',
            allocatedAmount: '750000',
          },
          {
            sourceSlipNo: 'OUT-20260520-018',
            sourceLineNo: 1,
            allocatedQty: '4',
            allocatedAmount: '500000',
          },
        ],
      },
    ],
  },
  {
    slipNo: 'SAS-20260519-004',
    slipDate: '2026-05-19',
    partnerCode: 'P-10044',
    partnerName: '동진상사',
    taxType: 'TAXABLE',
    status: 'DRAFT',
    totalSupplyAmount: '480000',
    totalVatAmount: '48000',
    totalAmount: '528000',
    memo: '검수 대기',
    lines: [],
  },
]

function buildMockDraft(req: CreateSalesAccountingSlipRequest): SalesAccountingSlipResponse {
  const supply = req.lines.reduce((sum, line) => {
    return sum + Number(line.qty || 0) * Number(line.unitPrice || 0)
  }, 0)
  const vat = req.taxType === 'TAXABLE' ? Math.round(supply * 0.1) : 0
  return {
    slipNo: `SAS-${req.slipDate.replace(/-/g, '')}-${String(Date.now()).slice(-3)}`,
    slipDate: req.slipDate,
    partnerCode: req.partnerCode,
    partnerName: req.partnerName,
    taxType: req.taxType,
    status: 'DRAFT',
    totalSupplyAmount: String(supply),
    totalVatAmount: String(vat),
    totalAmount: String(supply + vat),
    memo: req.memo ?? null,
    lines: req.lines.map((line, index) => {
      const lineSupply = Number(line.qty || 0) * Number(line.unitPrice || 0)
      const lineVat = req.taxType === 'TAXABLE' ? Math.round(lineSupply * 0.1) : 0
      return {
        lineNo: index + 1,
        productCode: line.productCode,
        productName: line.productName,
        qty: line.qty,
        unitPrice: line.unitPrice,
        supplyAmount: String(lineSupply),
        vatAmount: String(lineVat),
        lineTotal: String(lineSupply + lineVat),
        allocations: line.allocations.map((a) => ({
          sourceSlipNo: a.sourceSlipNo,
          sourceLineNo: a.sourceLineNo,
          allocatedQty: a.allocatedQty,
          allocatedAmount: a.allocatedAmount,
        })),
      }
    }),
  }
}

export async function listSalesAccountingSlips(options: {
  from?: string
  to?: string
  partnerCode?: string
  status?: SalesAccountingSlipStatus | 'ALL'
} = {}): Promise<SalesAccountingSlipResponse[]> {
  const rows = MOCK_SALES_ACCOUNTING_SLIPS.filter((row) => {
    if (options.from && row.slipDate < options.from) return false
    if (options.to && row.slipDate > options.to) return false
    if (options.partnerCode && !row.partnerCode.includes(options.partnerCode)) return false
    if (options.status && options.status !== 'ALL' && row.status !== options.status) return false
    return true
  })
  return Promise.resolve(rows)
}

export async function createSalesSlipDraft(
  body: CreateSalesAccountingSlipRequest,
): Promise<SalesAccountingSlipResponse> {
  if (isMockMode()) return buildMockDraft(body)
  const res = await apiClient.post<
    SalesAccountingSlipResponse | ApiEnvelope<SalesAccountingSlipResponse>
  >('/admin/sales-slips', body)
  return unwrap(res.data)
}

export async function postSalesSlip(
  slipNo: string,
): Promise<SalesAccountingSlipResponse | null> {
  if (isMockMode()) {
    const found = MOCK_SALES_ACCOUNTING_SLIPS.find((row) => row.slipNo === slipNo)
    return found ? { ...found, status: 'POSTED' } : null
  }
  const res = await apiClient.post<
    SalesAccountingSlipResponse | ApiEnvelope<SalesAccountingSlipResponse> | ''
  >(`/admin/sales-slips/${encodeURIComponent(slipNo)}/post`, {})
  if (!res.data) return null
  return unwrap(res.data as SalesAccountingSlipResponse | ApiEnvelope<SalesAccountingSlipResponse>)
}
