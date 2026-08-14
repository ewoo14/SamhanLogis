import type { PresenceStatus } from './chat-api'

const base = String(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '')

async function request(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(`${base}${path}`, { ...init, credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  if (!response.ok) throw new Error(`presence API 요청 실패 status=${response.status}`)
}

export const updatePresence = (presenceStatus: PresenceStatus) => request('/api/users/messenger/presence', { method: 'PUT', body: JSON.stringify({ presenceStatus }) })

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
          if (parsed.presenceStatus === 'AVAILABLE' || parsed.presenceStatus === 'AWAY' || parsed.presenceStatus === 'ABSENT' || parsed.presenceStatus === 'OFFLINE') onEvent({ employeeCode: typeof parsed.employeeCode === 'string' ? parsed.employeeCode : null, presenceStatus: parsed.presenceStatus })
        } catch { /* malformed events are ignored; no synthetic presence is created */ }
      }
    }
  }).catch(() => undefined)
  return () => controller.abort()
}
