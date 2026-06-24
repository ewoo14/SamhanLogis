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
  channel: ExternalDispatchChannel
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

export interface ExternalDispatchPrintSlipLine {
  slipNo: string
  deliveryAddress: string
  recipientName: string
  recipientPhone: string
  itemSummary: string
  sequence: number
}

export interface ExternalDispatchPrintDataResponse {
  carrierName: string
  carrierPhone: string
  dispatchDate: string
  channel: ExternalDispatchChannel
  items: ExternalDispatchPrintSlipLine[]
}

/** 선택 전표를 외부기사/배송사에게 지정 채널로 발송한다. */
export async function dispatchExternal(
  req: ExternalDispatchRequest,
): Promise<ExternalDispatchResponse> {
  const res = await apiClient.post<ApiEnvelope<ExternalDispatchResponse>>(
    '/admin/external-dispatches',
    req,
  )
  return res.data.data
}

/** 선택 전표를 외부기사/배송사에게 SMS 발송한다. 슬3 호환 alias. */
export const dispatchExternalSms = dispatchExternal

/** 타배송사 배차의뢰서 인쇄 데이터를 조회한다. */
export async function fetchExternalDispatchPrintData(
  id: string,
): Promise<ExternalDispatchPrintDataResponse> {
  const res = await apiClient.get<ApiEnvelope<ExternalDispatchPrintDataResponse>>(
    `/admin/external-dispatches/${id}/print-data`,
  )
  return res.data.data
}
