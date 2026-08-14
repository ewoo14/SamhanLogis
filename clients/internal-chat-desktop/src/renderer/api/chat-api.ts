export type PresenceStatus = 'AVAILABLE' | 'AWAY' | 'ABSENT' | 'IN_MEETING' | 'ON_CALL' | 'OFFLINE'
export interface Employee { employeeCode: string | null; name: string; jobTitle: string; departmentName: string; departmentOrder?: number; hireDate?: string | null; presenceStatus: PresenceStatus }
export interface ChatRoom { roomCode: string; type: 'DIRECT' | 'GROUP' | 'SYSTEM'; roomName: string | null; partnerName?: string | null; partnerDepartment?: string | null; partnerEmployeeCode?: string | null; unreadCount?: number; memberCount?: number; lastMessage?: string | null; lastMessageAt?: string | null }
export interface ChatMessage { roomCode: string; sequence: number; body: string; sentAt: string; senderName?: string | null; senderDepartment?: string | null; senderEmployeeCode?: string | null; mine?: boolean; read?: boolean }

const base = String(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...init, credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  if (!response.ok) throw new Error(`채팅 API 요청 실패 status=${response.status}`)
  const payload = await response.json() as { data: T }
  return payload.data
}
export const fetchDirectory = () => request<Employee[]>('/api/users/messenger/directory')
export const fetchMe = () => request<Employee>('/api/users/messenger/me')
export const joinPresence = (sessionId: string) => request<void>(`/api/users/messenger/presence/sessions/${encodeURIComponent(sessionId)}`, { method: 'POST' })
export const leavePresence = (sessionId: string) => request<void>(`/api/users/messenger/presence/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', keepalive: true })
export const updatePresence = (presenceStatus: PresenceStatus) => request<void>('/api/users/messenger/presence', { method: 'PUT', body: JSON.stringify({ presenceStatus }) })
export const fetchRooms = () => request<ChatRoom[]>('/admin/groupware/chat/rooms')
export async function fetchGroups(): Promise<ChatRoom[]> {
  const rooms = await request<Array<ChatRoom & { participants?: unknown[]; latestMessageAt?: string | null }>>('/admin/groupware/chat/rooms/groups')
  return Promise.all(rooms.map(async (room) => {
    const messages = await fetchMessages(room.roomCode).catch(() => [])
    const latest = messages.at(-1)
    return {
      ...room,
      memberCount: room.memberCount ?? room.participants?.length ?? 0,
      lastMessage: room.lastMessage ?? latest?.body ?? null,
      lastMessageAt: room.lastMessageAt ?? latest?.sentAt ?? room.latestMessageAt ?? null,
    }
  }))
}
export const fetchMessages = (roomCode: string) => request<ChatMessage[]>(`/admin/groupware/chat/rooms/${encodeURIComponent(roomCode)}/messages`)
export const createDirectRoom = (employeeCode: string) => request<ChatRoom>('/api/v1/admin/groupware/chat/rooms/direct/by-employee-code', { method: 'POST', body: JSON.stringify({ employeeCode }) })
export const createGroupRoom = (employeeCodes: string[]) => request<ChatRoom>('/admin/groupware/chat/rooms/groups', { method: 'POST', body: JSON.stringify({ employeeCodes, roomName: null }) })
export const sendMessage = (roomCode: string, body: string) => request<ChatMessage>(`/admin/groupware/chat/rooms/${encodeURIComponent(roomCode)}/messages`, { method: 'POST', body: JSON.stringify({ body }) })
export function subscribe(roomCode: string, onEvent: () => void): () => void {
  const controller = new AbortController()
  void fetch(`${base}/admin/groupware/chat/rooms/${encodeURIComponent(roomCode)}/stream`, { credentials: 'include', headers: { Accept: 'text/event-stream' }, signal: controller.signal }).then(async (response) => {
    if (!response.ok || !response.body) return
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    while (!controller.signal.aborted) { const chunk = await reader.read(); if (chunk.done) break; onEvent() }
  }).catch(() => undefined)
  return () => controller.abort()
}

export function subscribePresence(onEvent: (event: { employeeCode?: string | null; presenceStatus: PresenceStatus }) => void): () => void {
  const controller = new AbortController()
  void fetch(`${base}/api/users/messenger/presence/stream`, { credentials: 'include', headers: { Accept: 'text/event-stream' }, signal: controller.signal }).then(async (response) => {
    if (!response.ok || !response.body) return
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    while (!controller.signal.aborted) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += chunk.value
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ''
      for (const raw of events) {
        const data = raw.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice(5).trim()
        if (!data) continue
        try {
          const parsed = JSON.parse(data) as { employeeCode?: unknown; presenceStatus?: unknown }
          if (parsed.presenceStatus === 'AVAILABLE' || parsed.presenceStatus === 'AWAY' || parsed.presenceStatus === 'ABSENT' || parsed.presenceStatus === 'IN_MEETING' || parsed.presenceStatus === 'ON_CALL' || parsed.presenceStatus === 'OFFLINE') {
            onEvent({ employeeCode: typeof parsed.employeeCode === 'string' ? parsed.employeeCode : null, presenceStatus: parsed.presenceStatus })
          }
        } catch { /* malformed SSE events are ignored, never converted into fake presence */ }
      }
    }
  }).catch(() => undefined)
  return () => controller.abort()
}
