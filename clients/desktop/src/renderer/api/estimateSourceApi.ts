import { apiClient, type ApiEnvelope } from './client'
import type { WebPartnerOrderDraftListSource, WebQuoteSnapshotListSource } from '../routes/estimateSourceSeparatedListModel'

/** UUID와 payload를 제외한 웹 저장분 목록 메타데이터. */
export type WebQuoteSnapshotSummary = WebQuoteSnapshotListSource
export type WebPartnerOrderDraftSummary = WebPartnerOrderDraftListSource

export async function listWebQuoteSnapshotSummaries(filters: {
  startDate?: string
  endDate?: string
} = {}): Promise<WebQuoteSnapshotSummary[]> {
  const res = await apiClient.get<ApiEnvelope<WebQuoteSnapshotSummary[]>>(
    '/api/v1/estimates/web-snapshots',
    { params: filters },
  )
  return res.data.data ?? []
}

export async function listWebPartnerOrderDraftSummaries(filters: {
  startDate?: string
  endDate?: string
} = {}): Promise<WebPartnerOrderDraftSummary[]> {
  const res = await apiClient.get<ApiEnvelope<WebPartnerOrderDraftSummary[]>>(
    '/api/v1/partner-orders/web-drafts',
    { params: filters },
  )
  return res.data.data ?? []
}
