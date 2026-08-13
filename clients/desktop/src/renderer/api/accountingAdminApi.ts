/**
 * MIG-14 원장 대조 admin 화면 API 클라이언트.
 *
 * UUID 비공개 가드: 응답 타입은 화면 표시용 비즈니스 식별자(orderNo, slipNo,
 * partnerCode, journalNo) 중심으로 선언한다. id 계열 필드는 사용하지 않는다.
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

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
