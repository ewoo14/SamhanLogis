import type { EstimateSummary } from '../api/estimateApi'
import type { PartnerOrderStatus, PartnerOrderSummary } from '../api/sales'

export type UnifiedEstimateSource = 'estimate' | 'order'

export interface UnifiedEstimateListRow {
  id: string
  source: UnifiedEstimateSource
  sourceLabel: '종합견적서' | '주문서'
  documentNo: string
  partnerName: string | null
  /** 주문서만 보유한다. 종합견적서의 partner_id/사업자번호로 대체하지 않는다. */
  partnerCode: string | null
  amount: string
  /** requester_id 기반 담당 표시명. created_by 작성 기록과 혼동하지 않도록 담당으로 명명한다. */
  owner: string | null
  writtenAt: string | null
  sortAt: string | null
  status: string
  isDeleted: boolean
  navigationPath: string | null
}

type EstimateListSource = Pick<
  EstimateSummary,
  'id' | 'estimateNo' | 'estimateDate' | 'status' | 'partnerName' | 'totalAmount' | 'requesterId' | 'requesterName' | 'isDeleted'
>
type OrderListSource = Pick<
  PartnerOrderSummary,
  'orderNumber' | 'partnerCode' | 'partnerName' | 'submittedAt' | 'createdAt' | 'status' | 'totalAmount' | 'isDeleted'
>

const estimateStatusLabel: Record<EstimateSummary['status'], string> = {
  QUOTE_DRAFT: '작성중',
  QUOTE_SENT: '발송완료',
  QUOTE_ACCEPTED: '수주완료',
  QUOTE_REJECTED: '거절',
  QUOTE_CONVERTED: '전표변환완료',
}

const orderStatusLabel: Record<PartnerOrderStatus, string> = {
  DRAFT: '진행중',
  ON_HOLD: '보류',
  CONFIRMING: '확인중',
  CONFIRMED: '완료',
  CANCELED: '취소',
  CONVERTED: '전환완료',
}

const asTimestamp = (value: string | null): number => {
  if (!value) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

/**
 * 두 DB의 전체 목록을 화면에서 합친다.
 *
 * 현재 화면은 두 계열을 전량 조회 후 정렬한다. 이 방식이 감당하지 못하는 경계는
 * 두 계열 합산 10,000행으로 잡는다. 그 이상이면 서버측
 * 읽기 모델/페이지네이션으로 전환해야 하며, 이 함수에 무한 조회를 추가하지 않는다.
 */
export function mergeEstimateAndOrderRows(
  estimates: EstimateListSource[],
  orders: OrderListSource[],
): UnifiedEstimateListRow[] {
  const estimateRows: UnifiedEstimateListRow[] = estimates.map((row) => ({
    id: `estimate:${row.id}`,
    source: 'estimate',
    sourceLabel: '종합견적서',
    documentNo: row.estimateNo,
    partnerName: row.partnerName ?? null,
    partnerCode: null,
    amount: String(row.totalAmount),
    owner: row.requesterName ?? null,
    writtenAt: row.estimateDate,
    sortAt: row.estimateDate,
    status: estimateStatusLabel[row.status],
    isDeleted: row.isDeleted === true,
    navigationPath: row.isDeleted ? null : `/sales/estimates/${encodeURIComponent(row.id)}`,
  }))

  const orderRows: UnifiedEstimateListRow[] = orders.map((row) => ({
    id: `order:${row.orderNumber}`,
    source: 'order',
    sourceLabel: '주문서',
    documentNo: row.orderNumber,
    partnerName: row.partnerName ?? null,
    partnerCode: row.partnerCode || null,
    amount: String(row.totalAmount),
    // 주문서 목록 응답은 createdBy/작성자명을 제공하지 않는다. UUID를 추론하거나 표시하지 않는다.
    owner: null,
    writtenAt: row.createdAt ?? null,
    sortAt: row.submittedAt ?? row.createdAt ?? null,
    status: orderStatusLabel[row.status],
    isDeleted: row.isDeleted === true,
    navigationPath: row.isDeleted ? null : `/sales/partner-orders/${encodeURIComponent(row.orderNumber)}`,
  }))

  return [...estimateRows, ...orderRows].sort((a, b) => {
    const dateOrder = asTimestamp(b.sortAt) - asTimestamp(a.sortAt)
    if (dateOrder !== 0) return dateOrder
    return a.id.localeCompare(b.id)
  })
}
