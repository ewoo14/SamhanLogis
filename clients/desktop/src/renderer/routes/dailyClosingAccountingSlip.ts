import type { CreatePurchaseAccountingSlipRequest } from '../api/purchaseAccountingSlipApi'
import type { CreateSalesAccountingSlipRequest, SalesTaxType } from '../api/salesAccountingSlipApi'

export interface DailyClosingAccountingSource {
  sourceKind: 'SALES_SLIP' | 'PURCHASE_SLIP'
  slipDate: string
  slipId: string
  slipNo: string
  lineId: string
  sourceLineNo: number
  partnerId: string
  partnerCode: string
  partnerName: string
  productCode: string
  productName: string
  quantity: number
  unitPriceWithVat: string | number
  total?: string | number | null
  taxType: SalesTaxType
  accountingPostedAt?: string | null
}

export type DailyClosingAccountingRequest =
  | { kind: 'SALES'; body: CreateSalesAccountingSlipRequest }
  | { kind: 'PURCHASE'; body: CreatePurchaseAccountingSlipRequest }

export function buildDailyClosingAccountingSlipRequest(
  input: DailyClosingAccountingSource | DailyClosingAccountingSource[],
): DailyClosingAccountingRequest {
  const sources = Array.isArray(input) ? input : [input]
  const source = sources[0]
  if (!source) throw new Error('회계전표 원본행이 없습니다')
  if (sources.some((row) => row.accountingPostedAt)) {
    throw new Error('이미 회계전표가 반영된 전표입니다')
  }
  const sourceTotal = source.total == null
    ? Number(source.quantity) * Number(source.unitPriceWithVat)
    : Number(source.total)
  if (!Number.isFinite(sourceTotal) || sourceTotal < 0) {
    throw new Error('원천행 합계금액이 올바르지 않습니다')
  }
  const unitPrice = source.quantity > 0 ? sourceTotal / source.quantity : Number(source.unitPriceWithVat)
  const amountText = (value: number) => String(Number(value.toFixed(2)))
  const body = {
    slipDate: source.slipDate,
    partnerId: source.partnerId,
    partnerCode: source.partnerCode,
    partnerName: source.partnerName,
    taxType: source.taxType,
    memo: `일마감 ${source.slipNo} 연결`,
    lines: sources.map((row) => ({
      productCode: row.productCode,
      productName: row.productName,
      qty: String(row.quantity),
      unitPrice: amountText(row === source ? unitPrice : (Number(row.total ?? Number(row.quantity) * Number(row.unitPriceWithVat)) / row.quantity)),
      allocations: [{
        sourceSlipId: row.slipId,
        sourceSlipNo: row.slipNo,
        sourceLineId: row.lineId,
        sourceLineNo: row.sourceLineNo,
        allocatedQty: String(row.quantity),
        allocatedAmount: amountText(row.total == null
          ? Number(row.quantity) * Number(row.unitPriceWithVat)
          : Number(row.total)),
      }],
    })),
  }
  return source.sourceKind === 'SALES_SLIP'
    ? { kind: 'SALES', body }
    : { kind: 'PURCHASE', body }
}
