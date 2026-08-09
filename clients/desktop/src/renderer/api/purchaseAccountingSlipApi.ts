import { apiClient, type ApiEnvelope } from './client'
import { isMockMode } from './mock'
import { assertMockAllocationPartner, MOCK_SOURCE_SLIPS } from './slipAllocationSourceApi'
import { toOrderPathId } from '../utils/orderNo'
import type {
  SalesTaxType,
  SlipAllocationRequest,
  SlipAllocationResponse,
} from './salesAccountingSlipApi'
import { splitVatInclusive } from '../utils/vatRounding'

export type PurchaseAccountingSlipStatus = 'DRAFT' | 'POSTED'

export interface PurchaseAccountingSlipLineRequest {
  productCode: string
  productName: string
  qty: string
  unitPrice: string
  allocations: SlipAllocationRequest[]
}

export interface CreatePurchaseAccountingSlipRequest {
  slipDate: string
  partnerId: string
  partnerCode: string
  partnerName: string
  taxType: SalesTaxType
  memo?: string
  lines: PurchaseAccountingSlipLineRequest[]
}

export interface PurchaseAccountingSlipLineResponse {
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

export interface PurchaseAccountingSlipResponse {
  id: string | null
  slipNo: string
  slipDate: string
  partnerCode: string
  partnerName: string
  taxType: SalesTaxType
  status: PurchaseAccountingSlipStatus
  totalSupplyAmount: string
  totalVatAmount: string
  totalAmount: string
  memo: string | null
  lines: PurchaseAccountingSlipLineResponse[]
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

export const MOCK_PURCHASE_ACCOUNTING_SLIPS: PurchaseAccountingSlipResponse[] = [
  {
    id: '00000000-0000-4000-8000-0000000a5301',
    slipNo: '2026/05/20-1',
    slipDate: '2026-05-20',
    partnerCode: 'V-30011',
    partnerName: '한빛포장',
    taxType: 'TAXABLE',
    status: 'POSTED',
    totalSupplyAmount: '860000',
    totalVatAmount: '86000',
    totalAmount: '946000',
    memo: '입고전표 2건 묶음',
    lines: [
      {
        lineNo: 1,
        productCode: 'PKG-B200',
        productName: '완충 포장재 B',
        qty: '20',
        unitPrice: '43000',
        supplyAmount: '860000',
        vatAmount: '86000',
        lineTotal: '946000',
        allocations: [
          {
            sourceSlipNo: '2026/05/20-6',
            sourceLineNo: 1,
            allocatedQty: '12',
            allocatedAmount: '516000',
          },
          {
            sourceSlipNo: '2026/05/20-11',
            sourceLineNo: 1,
            allocatedQty: '8',
            allocatedAmount: '344000',
          },
        ],
      },
    ],
  },
  {
    id: '00000000-0000-4000-8000-0000000a5303',
    slipNo: '2026/05/19-3',
    slipDate: '2026-05-19',
    partnerCode: 'V-30028',
    partnerName: '태영물산',
    taxType: 'TAXABLE',
    status: 'DRAFT',
    totalSupplyAmount: '310000',
    totalVatAmount: '31000',
    totalAmount: '341000',
    memo: '매입세금계산서 수신 전',
    lines: [],
  },
]

function buildMockDraft(req: CreatePurchaseAccountingSlipRequest): PurchaseAccountingSlipResponse {
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
    // 실 BE PurchaseAccountingSlipNumberGenerator = yyyy/MM/dd-N 슬래시 (feedback_slip_order_number_format)
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

export async function listPurchaseAccountingSlips(options: {
  from?: string
  to?: string
  partnerCode?: string
  status?: PurchaseAccountingSlipStatus | 'ALL'
} = {}): Promise<PurchaseAccountingSlipResponse[]> {
  if (isMockMode()) {
    const rows = MOCK_PURCHASE_ACCOUNTING_SLIPS.filter((row) => {
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
    PurchaseAccountingSlipResponse[] | ApiEnvelope<PurchaseAccountingSlipResponse[]>
  >(query ? `/admin/purchase-slips?${query}` : '/admin/purchase-slips')
  return unwrap(res.data)
}

export async function createPurchaseSlipDraft(
  body: CreatePurchaseAccountingSlipRequest,
): Promise<PurchaseAccountingSlipResponse> {
  if (isMockMode()) return buildMockDraft(body)
  const res = await apiClient.post<
    PurchaseAccountingSlipResponse | ApiEnvelope<PurchaseAccountingSlipResponse>
  >('/admin/purchase-slips', body)
  return unwrap(res.data)
}

export async function postPurchaseSlip(
  slipNo: string,
): Promise<PurchaseAccountingSlipResponse | null> {
  if (isMockMode()) {
    const found = MOCK_PURCHASE_ACCOUNTING_SLIPS.find((row) => row.slipNo === slipNo)
    return found ? { ...found, status: 'POSTED' } : null
  }
  const res = await apiClient.post<
    PurchaseAccountingSlipResponse | ApiEnvelope<PurchaseAccountingSlipResponse> | ''
  >(`/admin/purchase-slips/${encodeURIComponent(toOrderPathId(slipNo))}/post`, {})
  if (!res.data) return null
  return unwrap(res.data as PurchaseAccountingSlipResponse | ApiEnvelope<PurchaseAccountingSlipResponse>)
}
