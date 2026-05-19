import { apiClient, type ApiEnvelope } from './client'
import type {
  SalesTaxType,
  SlipAllocationRequest,
  SlipAllocationResponse,
} from './salesAccountingSlipApi'

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

function isMockMode(): boolean {
  return import.meta.env['VITE_MOCK_MODE'] === '1'
}

export const MOCK_PURCHASE_ACCOUNTING_SLIPS: PurchaseAccountingSlipResponse[] = [
  {
    slipNo: 'PAS-20260520-001',
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
            sourceSlipNo: 'IN-20260520-006',
            sourceLineNo: 1,
            allocatedQty: '12',
            allocatedAmount: '516000',
          },
          {
            sourceSlipNo: 'IN-20260520-011',
            sourceLineNo: 1,
            allocatedQty: '8',
            allocatedAmount: '344000',
          },
        ],
      },
    ],
  },
  {
    slipNo: 'PAS-20260519-003',
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
  const supply = req.lines.reduce((sum, line) => {
    return sum + Number(line.qty || 0) * Number(line.unitPrice || 0)
  }, 0)
  const vat = req.taxType === 'TAXABLE' ? Math.round(supply * 0.1) : 0
  return {
    slipNo: `PAS-${req.slipDate.replace(/-/g, '')}-${String(Date.now()).slice(-3)}`,
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

export async function listPurchaseAccountingSlips(options: {
  from?: string
  to?: string
  partnerCode?: string
  status?: PurchaseAccountingSlipStatus | 'ALL'
} = {}): Promise<PurchaseAccountingSlipResponse[]> {
  const rows = MOCK_PURCHASE_ACCOUNTING_SLIPS.filter((row) => {
    if (options.from && row.slipDate < options.from) return false
    if (options.to && row.slipDate > options.to) return false
    if (options.partnerCode && !row.partnerCode.includes(options.partnerCode)) return false
    if (options.status && options.status !== 'ALL' && row.status !== options.status) return false
    return true
  })
  return Promise.resolve(rows)
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
  >(`/admin/purchase-slips/${encodeURIComponent(slipNo)}/post`, {})
  if (!res.data) return null
  return unwrap(res.data as PurchaseAccountingSlipResponse | ApiEnvelope<PurchaseAccountingSlipResponse>)
}
