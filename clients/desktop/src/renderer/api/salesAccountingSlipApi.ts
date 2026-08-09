import { apiClient, type ApiEnvelope } from './client'
import { isMockMode } from './mock'
import { assertMockAllocationPartner, MOCK_SOURCE_SLIPS } from './slipAllocationSourceApi'
import { toOrderPathId } from '../utils/orderNo'
import { splitVatInclusive } from '../utils/vatRounding'

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
  id: string | null
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

export const MOCK_SALES_ACCOUNTING_SLIPS: SalesAccountingSlipResponse[] = [
  {
    id: '00000000-0000-4000-8000-0000000a5201',
    slipNo: '2026/05/20-1',
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
            sourceSlipNo: '2026/05/20-14',
            sourceLineNo: 1,
            allocatedQty: '6',
            allocatedAmount: '750000',
          },
          {
            sourceSlipNo: '2026/05/20-18',
            sourceLineNo: 1,
            allocatedQty: '4',
            allocatedAmount: '500000',
          },
        ],
      },
    ],
  },
  {
    id: '00000000-0000-4000-8000-0000000a5204',
    slipNo: '2026/05/19-4',
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
  assertMockAllocationPartner(req.partnerId, req.lines.flatMap((line) => line.allocations))
  const firstAllocation = req.lines.flatMap((line) => line.allocations)[0]
  const source = firstAllocation == null
    ? undefined
    : MOCK_SOURCE_SLIPS.find((summary) => summary.lines.some((line) => line.lineId === firstAllocation.sourceLineId))
  const amounts = req.lines.map((line) => splitVatInclusive(
    Number(line.qty || 0) * Number(line.unitPrice || 0),
    req.taxType === 'TAXABLE',
  ))
  const supply = amounts.reduce((sum, amount) => sum + amount.supply, 0)
  const vat = amounts.reduce((sum, amount) => sum + amount.vat, 0)
  const total = amounts.reduce((sum, amount) => sum + amount.total, 0)
  return {
    id: null,
    // 실 BE SalesAccountingSlipNumberGenerator = yyyy/MM/dd-N 슬래시 (feedback_slip_order_number_format)
    slipNo: `${req.slipDate.replace(/-/g, '/')}-${Number(String(Date.now()).slice(-3)) || 1}`,
    slipDate: req.slipDate,
    partnerCode: source?.partnerCode ?? '',
    partnerName: source?.partnerName ?? '',
    taxType: req.taxType,
    status: 'DRAFT',
    totalSupplyAmount: String(supply),
    totalVatAmount: String(vat),
    totalAmount: String(total),
    memo: req.memo ?? null,
    lines: req.lines.map((line, index) => {
      const lineAmount = splitVatInclusive(
        Number(line.qty || 0) * Number(line.unitPrice || 0),
        req.taxType === 'TAXABLE',
      )
      return {
        lineNo: index + 1,
        productCode: line.productCode,
        productName: line.productName,
        qty: line.qty,
        unitPrice: line.unitPrice,
        supplyAmount: String(lineAmount.supply),
        vatAmount: String(lineAmount.vat),
        lineTotal: String(lineAmount.total),
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
  if (isMockMode()) {
    const rows = MOCK_SALES_ACCOUNTING_SLIPS.filter((row) => {
      if (options.from && row.slipDate < options.from) return false
      if (options.to && row.slipDate > options.to) return false
      if (options.partnerCode && !row.partnerCode.includes(options.partnerCode)) return false
      if (options.status && options.status !== 'ALL' && row.status !== options.status) return false
      return true
    })
    return Promise.resolve(rows)
  }
  const params = new URLSearchParams()
  if (options.from) params.set('from', options.from)
  if (options.to) params.set('to', options.to)
  if (options.partnerCode) params.set('partnerCode', options.partnerCode)
  if (options.status && options.status !== 'ALL') params.set('status', options.status)
  const query = params.toString()
  const res = await apiClient.get<
    SalesAccountingSlipResponse[] | ApiEnvelope<SalesAccountingSlipResponse[]>
  >(query ? `/admin/sales-slips?${query}` : '/admin/sales-slips')
  return unwrap(res.data)
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
  >(`/admin/sales-slips/${encodeURIComponent(toOrderPathId(slipNo))}/post`, {})
  if (!res.data) return null
  return unwrap(res.data as SalesAccountingSlipResponse | ApiEnvelope<SalesAccountingSlipResponse>)
}
