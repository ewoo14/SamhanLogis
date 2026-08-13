export interface ApiEnvelope<T> { data: T; success: boolean; code: string; message: string; timestamp: string }

export interface RecipientOption { userId: string; name: string; department: string | null; employeeCode: string | null }
export interface ChatRoom { roomCode: string; type: 'DIRECT' | 'GROUP' | 'SYSTEM'; roomName: string | null; partnerName?: string | null; partnerDepartment?: string | null; partnerEmployeeCode?: string | null }
export interface ChatMessage { roomCode: string; sequence: number; body: string; sentAt: string; senderName?: string | null; senderDepartment?: string | null; senderEmployeeCode?: string | null; mine?: boolean }

const baseUrl = String(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) throw new Error(`채팅 API 요청 실패 status=${response.status}`)
  const envelope = await response.json() as ApiEnvelope<T>
  return envelope.data
}

export function fetchChatRooms(): Promise<ChatRoom[]> { return request('/admin/groupware/chat/rooms') }
export function fetchChatMessages(roomCode: string): Promise<ChatMessage[]> { return request(`/admin/groupware/chat/rooms/${encodeURIComponent(roomCode)}/messages`) }
export function searchRecipients(query: string): Promise<RecipientOption[]> { return request(`/admin/groupware/messages/recipient-search?q=${encodeURIComponent(query)}&limit=10000`) }
export function createDirectChatRoom(participantId: string): Promise<ChatRoom> {
  return request('/admin/groupware/chat/rooms/direct', { method: 'POST', body: JSON.stringify({ participantId }) })
}
export function sendChatMessage(roomCode: string, body: string): Promise<ChatMessage> {
  return request(`/admin/groupware/chat/rooms/${encodeURIComponent(roomCode)}/messages`, { method: 'POST', body: JSON.stringify({ body }) })
}

export function subscribeToChatRoom(roomCode: string, onMessage: () => void): () => void {
  const controller = new AbortController()
  void fetch(`${baseUrl}/admin/groupware/chat/rooms/${encodeURIComponent(roomCode)}/stream`, {
    headers: { Accept: 'text/event-stream' }, credentials: 'include', signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok || !response.body) throw new Error(`SSE 연결 실패 status=${response.status}`)
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    while (!controller.signal.aborted) {
      const { done } = await reader.read()
      if (done) break
      onMessage()
    }
  }).catch(() => undefined)
  return () => controller.abort()
}
