import { apiClient, type ApiEnvelope } from './client'

/**
 * 메신저 수신자 후보. userId는 발송 payload 전용이다.
 *
 * @param employeeCode 담당자코드 — 동명이인 구분용. 로그인ID/이메일/UUID 대신 이 값만 화면 병기 후보로
 *   쓴다. 미부여 계정(개발 시드 등)은 null.
 */
export interface RecipientOption {
  userId: string
  name: string
  department: string | null
  employeeCode: string | null
}

export type MessageStatus = 'UNREAD' | 'READ'

/** 수신함/발송 결과 공용 메신저 행. UUID 필드는 화면에 렌더링하지 않는다. */
export interface MessageResponse {
  messageId: string
  senderId: string
  /** 발신자 표시명 — 수신함 조회 응답에만 채워진다(발송 응답은 송신자=본인이라 null). */
  senderDisplayName: string | null
  recipientId: string
  body: string
  status: MessageStatus
  sentAt: string
  readAt: string | null
}

/** 수신함 배열에 서버가 계산한 실제 다음 페이지 존재 여부를 부착한다. */
export type InboxMessages = MessageResponse[] & { hasNextPage?: boolean }

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
    { params: { q, limit: '10000' } },
  )
  return response.data.data.map((recipient) => ({
    ...recipient,
    name: sanitizeInternalLabel(recipient.name) ?? '알 수 없는 사용자',
  }))
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

/** 호출자 본인 수신함 조회 — 50건 단위 페이지(0-base). userId 쿼리로 범위를 바꾸지 않는다. */
export async function fetchInbox(page = 0): Promise<InboxMessages> {
  const response = await apiClient.get<ApiEnvelope<MessageResponse[]>>(
    '/admin/groupware/messages/inbox',
    { params: { page } },
  )
  const messages = response.data.data as InboxMessages
  messages.hasNextPage = response.headers?.['x-has-next-page'] === 'true'
  return messages
}

/** 수신자 본인의 쪽지를 읽음 처리한다. 호출자 신원은 gateway 헤더로만 전달된다. */
export async function markMessageRead(messageId: string): Promise<MessageResponse> {
  const response = await apiClient.put<ApiEnvelope<MessageResponse>>(
    `/admin/groupware/messages/${encodeURIComponent(messageId)}/read`,
  )
  return response.data.data
}

export interface ChatRoom { roomCode: string; type: 'DIRECT' | 'GROUP' | 'SYSTEM'; roomName: string | null; partnerName?: string | null; partnerDepartment?: string | null; partnerEmployeeCode?: string | null }
export interface ChatMessage { roomCode: string; sequence: number; body: string; sentAt: string; senderName?: string | null; senderDepartment?: string | null; senderEmployeeCode?: string | null; mine?: boolean }

/** 개발용 seed provenance는 데이터 보존 대상이지만 사용자 표시 경계에서는 제거한다. */
export function sanitizeInternalLabel(value: string | null | undefined): string | null | undefined {
  if (value == null) return value
  return value.replace(/^\[DEV-SEED\]\s*/i, '').trim() || '알 수 없는 사용자'
}

export async function fetchChatRooms(): Promise<ChatRoom[]> {
  const response = await apiClient.get<ApiEnvelope<ChatRoom[]>>('/admin/groupware/chat/rooms')
  return response.data.data.map((room) => ({
    ...room,
    roomName: sanitizeInternalLabel(room.roomName) ?? null,
    partnerName: sanitizeInternalLabel(room.partnerName),
  }))
}

export async function fetchChatMessages(roomCode: string): Promise<ChatMessage[]> {
  const response = await apiClient.get<ApiEnvelope<ChatMessage[]>>(`/admin/groupware/chat/rooms/${encodeURIComponent(roomCode)}/messages`)
  return response.data.data.map((message) => ({
    ...message,
    senderName: sanitizeInternalLabel(message.senderName),
  }))
}

export async function sendChatMessage(roomCode: string, body: string): Promise<ChatMessage> {
  const response = await apiClient.post<ApiEnvelope<ChatMessage>>(`/admin/groupware/chat/rooms/${encodeURIComponent(roomCode)}/messages`, { body })
  return response.data.data
}

export async function createDirectChatRoom(participantId: string): Promise<ChatRoom> {
  const response = await apiClient.post<ApiEnvelope<ChatRoom>>('/admin/groupware/chat/rooms/direct', { participantId })
  const room = response.data.data
  return { ...room, roomName: sanitizeInternalLabel(room.roomName) ?? null, partnerName: sanitizeInternalLabel(room.partnerName) }
}
