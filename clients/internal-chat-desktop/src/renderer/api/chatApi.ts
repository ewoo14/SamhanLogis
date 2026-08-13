export interface ApiEnvelope<T> { data: T; success: boolean; code: string; message: string; timestamp: string }

export type PresenceStatus = 'AVAILABLE' | 'AWAY' | 'ABSENT' | 'OFFLINE'
export interface MessengerEmployee { employeeCode: string | null; name: string; jobTitle: string; departmentName: string; employmentStatus: 'ACTIVE'; presenceStatus: PresenceStatus }
export interface MessengerMe extends MessengerEmployee {}
export interface ChatRoom { roomCode: string; type: 'DIRECT' | 'GROUP' | 'SYSTEM'; roomName: string | null; partnerName?: string | null; partnerDepartment?: string | null; partnerEmployeeCode?: string | null }
export interface GroupParticipant { name: string; jobTitle?: string | null; departmentName?: string | null; employeeCode?: string | null; presenceStatus?: PresenceStatus }
export interface GroupChatRoom { roomCode: string; type: 'GROUP'; roomName: string | null; participants: GroupParticipant[]; unreadCount: number; latestMessageAt: string | null }
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
export function fetchMessengerDirectory(): Promise<MessengerEmployee[]> { return request('/users/messenger/directory') }
export function fetchMessengerMe(): Promise<MessengerMe> { return request('/users/messenger/me') }
export function joinMessengerPresence(sessionId: string): Promise<void> { return request(`/users/messenger/presence/sessions/${encodeURIComponent(sessionId)}`, { method: 'POST' }) }
export function leaveMessengerPresence(sessionId: string): Promise<void> { return request(`/users/messenger/presence/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }) }
export function fetchGroupChatRooms(): Promise<GroupChatRoom[]> { return request('/admin/groupware/chat/groups') }
export function createGroupChatRoom(employeeCodes: string[], roomName?: string): Promise<ChatRoom> {
  return request('/admin/groupware/chat/groups', { method: 'POST', body: JSON.stringify({ employeeCodes, roomName: roomName || null }) })
}
export function createDirectChatRoomByEmployeeCode(employeeCode: string): Promise<ChatRoom> {
  return request('/admin/groupware/chat/rooms/direct/by-employee-code', { method: 'POST', body: JSON.stringify({ employeeCode }) })
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
