/**
 * MIG-14 회계 admin 화면 API 클라이언트.
 *
 * UUID 비공개 가드: 응답 타입은 화면 표시용 비즈니스 식별자(orderNo, slipNo,
 * partnerCode, journalNo) 중심으로 선언한다. id 계열 필드는 사용하지 않는다.
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'
import { toOrderPathId } from '../utils/orderNo'

export type OrderProgressStatus =
  | 'COMPLETED'
  | 'IN_PROGRESS'
  | 'CANCELED'
  | 'PENDING'
  | string

export interface OrderListOptions {
  page?: number
  size?: number
  progressStatus?: string
  managerName?: string
  partnerName?: string
}

export interface OrderSummaryRow {
  orderNo: string
  partnerName: string
  managerName?: string | null
  progressStatus: OrderProgressStatus
  linkedSlipNo?: string | null
  validUntil?: string | null
  totalSupplyAmount?: string | null
  totalVatAmount?: string | null
  totalAmount?: string | null
  unresolvedLineCount?: number
}

export interface OrderLineRow {
  lineNo: number
  itemName: string
  quantity: string
  unitPrice?: string | null
  supplyAmount?: string | null
  vatAmount?: string | null
  lineTotal: string
  itemDueDate?: string | null
  unresolved?: boolean
}

export interface OrderDetailResponse extends OrderSummaryRow {
  paymentTerms?: string | null
  reference?: string | null
  lines: OrderLineRow[]
}

export interface LedgerListOptions {
  page?: number
  size?: number
  partnerName?: string
  from?: string
  to?: string
  transformStatus?: string
}

export interface LedgerReconcileRow {
  transactionRef: string
  transactionDate?: string | null
  sequenceNo?: number | null
  transactionType?: string | null
  electronicType?: string | null
  partnerCode?: string | null
  partnerName: string
  description?: string | null
  supplyAmount: string
  vatAmount: string
  totalAmount: string
  transformStatus?: string | null
  rejectReason?: string | null
  importedAt?: string | null
  rawDailyTotal?: string | null
  closingDailyTotal?: string | null
  dailyDiff?: string | null
}

function compactParams(
  params: Record<string, string | number | undefined>,
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  ) as Record<string, string | number>
}

export async function listAccountingOrders(
  options: OrderListOptions = {},
): Promise<PageResponse<OrderSummaryRow>> {
  const res = await apiClient.get<ApiEnvelope<PageResponse<OrderSummaryRow>>>(
    '/accounting/orders',
    {
      params: compactParams({
        page: options.page ?? 0,
        size: options.size ?? 50,
        progressStatus: options.progressStatus,
        managerName: options.managerName,
        partnerName: options.partnerName,
      }),
    },
  )
  return res.data.data
}

export async function getAccountingOrder(
  orderNo: string,
): Promise<OrderDetailResponse> {
  const res = await apiClient.get<ApiEnvelope<OrderDetailResponse>>(
    `/accounting/orders/${encodeURIComponent(toOrderPathId(orderNo))}`,
  )
  return res.data.data
}

export async function listSalesLedgers(
  options: LedgerListOptions = {},
): Promise<PageResponse<LedgerReconcileRow>> {
  const res = await apiClient.get<ApiEnvelope<PageResponse<LedgerReconcileRow>>>(
    '/accounting/ledger/sales',
    {
      params: compactParams({
        page: options.page ?? 0,
        size: options.size ?? 50,
        partnerName: options.partnerName,
        from: options.from,
        to: options.to,
        transformStatus: options.transformStatus,
      }),
    },
  )
  return res.data.data
}

export async function listPurchaseLedgers(
  options: LedgerListOptions = {},
): Promise<PageResponse<LedgerReconcileRow>> {
  const res = await apiClient.get<ApiEnvelope<PageResponse<LedgerReconcileRow>>>(
    '/accounting/ledger/purchase',
    {
      params: compactParams({
        page: options.page ?? 0,
        size: options.size ?? 50,
        partnerName: options.partnerName,
        from: options.from,
        to: options.to,
        transformStatus: options.transformStatus,
      }),
    },
  )
  return res.data.data
}
