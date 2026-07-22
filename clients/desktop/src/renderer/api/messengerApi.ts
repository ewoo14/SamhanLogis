import { apiClient, type ApiEnvelope } from './client'

/** 메신저 수신자 후보. userId는 발송 payload 전용이다. */
export interface RecipientOption {
  userId: string
  name: string
  department: string | null
}

export type MessageStatus = 'UNREAD' | 'READ'

/** 수신함/발송 결과 공용 메신저 행. UUID 필드는 화면에 렌더링하지 않는다. */
export interface MessageResponse {
  messageId: string
  senderId: string
  recipientId: string
  body: string
  status: MessageStatus
  sentAt: string
  readAt: string | null
}

export interface MessageBulkSendRequest {
  recipientIds: string[]
  body: string
}

export interface MessageBulkSendResponse {
  batchId: string
  sentCount: number
  messages: MessageResponse[]
}

/** 메신저 수신자 검색. user-service는 groupware 내부에서 activeOnly=true로 호출한다. */
export async function searchRecipients(q: string): Promise<RecipientOption[]> {
  const response = await apiClient.get<ApiEnvelope<RecipientOption[]>>(
    '/admin/groupware/messages/recipient-search',
    { params: { q, limit: '20' } },
  )
  return response.data.data
}

/** 복수 수신 메신저 발송. 송신자 식별자는 payload에 포함하지 않는다. */
export async function sendBulkMessage(
  payload: MessageBulkSendRequest,
): Promise<MessageBulkSendResponse> {
  const response = await apiClient.post<ApiEnvelope<MessageBulkSendResponse>>(
    '/admin/groupware/messages/bulk',
    payload,
  )
  return response.data.data
}

/** 호출자 본인 수신함 조회. userId 쿼리로 범위를 바꾸지 않는다. */
export async function fetchInbox(): Promise<MessageResponse[]> {
  const response = await apiClient.get<ApiEnvelope<MessageResponse[]>>(
    '/admin/groupware/messages/inbox',
  )
  return response.data.data
}

/** 수신자 본인의 쪽지를 읽음 처리한다. 호출자 신원은 gateway 헤더로만 전달된다. */
export async function markMessageRead(messageId: string): Promise<MessageResponse> {
  const response = await apiClient.put<ApiEnvelope<MessageResponse>>(
    `/admin/groupware/messages/${encodeURIComponent(messageId)}/read`,
  )
  return response.data.data
}
