import { apiClient, type ApiEnvelope } from './client'
import { isMockMode } from './mock'

export type AccountingSlipLinkBatchItem = {
  sourceSlipIdToken?: string
  sourceSlipNo?: string
  sourceSlipType: 'OUTBOUND' | 'INBOUND'
}

export type AccountingSlipLinkEligibility = {
  sourceSlipNo: string | null
  readModel: {
    sourceSlipNo: string | null
    sourceSlipStatus: string | null
    sourceQuantity: string
    sourceAmount: string
    allocatedQuantity: string
    allocatedAmount: string
    remainingQuantity: string
    remainingAmount: string
    linkedSlips: Array<{ slipNo: string; status: string; amount: string; taxInvoiceLinkStatus: string }>
    taxInvoiceLinkStatus: string
    legacyReadOnly: boolean
  } | null
  allowed: boolean
  reasons: string[]
  reasonMessages: string[]
}

export async function listAccountingSlipLinkEligibility(
  items: AccountingSlipLinkBatchItem[],
  dailyAmountVerified = false,
): Promise<AccountingSlipLinkEligibility[]> {
  if (isMockMode()) return []
  const res = await apiClient.post<ApiEnvelope<AccountingSlipLinkEligibility[]>>(
    '/accounting/slip-links/eligibility/batch',
    { items, dailyAmountVerified },
  )
  return res.data.data
}
