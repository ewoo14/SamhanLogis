/**
 * 타배송사 발송 API 클라이언트.
 *
 * <p>UUID 는 요청 payload/internal key 전용이며 화면 식별자는 배송사명/전화번호/전표번호다.
 */
import { apiClient, type ApiEnvelope } from './client'

export type ExternalDispatchChannel = 'SMS' | 'PRINT' | 'BOTH'
export type ExternalDispatchStatus = 'SENT' | 'FAILED'

export interface ExternalDispatchRequest {
  carrierId: string
  slipIds: string[]
  channel: 'SMS'
}

export interface ExternalDispatchResponse {
  id: string
  carrierName: string
  channel: ExternalDispatchChannel
  dispatchDate: string
  sentAt: string | null
  status: ExternalDispatchStatus
  slipCount: number
  slipNos: string[]
}

/** 선택 전표를 외부기사/배송사에게 SMS 발송한다. */
export async function dispatchExternalSms(
  req: ExternalDispatchRequest,
): Promise<ExternalDispatchResponse> {
  const res = await apiClient.post<ApiEnvelope<ExternalDispatchResponse>>(
    '/admin/external-dispatches',
    req,
  )
  return res.data.data
}
