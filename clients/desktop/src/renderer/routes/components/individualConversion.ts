import type {
  ConvertResult,
  ConvertToSlipItem,
  PartnerOrderDetail,
} from '../../api/sales'

export interface IndividualConversionSuccess {
  orderNumber: string
  status: 'success'
  slipNo: string
}

export interface IndividualConversionFailure {
  orderNumber: string
  status: 'failed'
  reason: string
}

export type IndividualConversionResult = IndividualConversionSuccess | IndividualConversionFailure

export type IndividualConverter = (
  orderNumber: string,
  request: { items: ConvertToSlipItem[]; warehouseCode: string },
) => Promise<ConvertResult>

function errorReason(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return '전환 요청에 실패했습니다.'
}

/** 주문별 전환을 독립적으로 실행해 성공분을 보존하고 주문별 결과를 반환한다. */
export async function runIndividualConversions(
  orders: PartnerOrderDetail[],
  warehouseCode: string,
  convert: IndividualConverter,
): Promise<IndividualConversionResult[]> {
  const results: IndividualConversionResult[] = []
  for (const order of orders) {
    const items = order.lines
      .map((line) => ({
        orderLineId: line.lineId,
        quantity: line.quantity - (line.convertedQuantity ?? 0),
      }))
      .filter((item) => item.quantity > 0)

    try {
      const result = await convert(order.orderNumber, { items, warehouseCode })
      results.push({ orderNumber: order.orderNumber, status: 'success', slipNo: result.slipNo })
    } catch (error) {
      results.push({ orderNumber: order.orderNumber, status: 'failed', reason: errorReason(error) })
    }
  }
  return results
}
