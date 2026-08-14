import { useEffect, useRef, useState } from 'react'
import {
  SlipPresenceClient,
  type PresenceClient,
  type PresenceEntry,
  type PresenceUser,
} from '../realtime/createPresenceClient'
import { getAuthProvider } from '../auth/authProvider'
import { sanitizeDisplayName } from '../common/userDisplayName'

const HEARTBEAT_MS = 30_000

function isPresenceEntry(value: unknown): value is PresenceEntry {
  return typeof value === 'object'
    && value !== null
    && 'sessionId' in value
    && 'displayName' in value
    && 'color' in value
}

function upsertPresence(entries: PresenceEntry[], next: PresenceEntry): PresenceEntry[] {
  const without = entries.filter((entry) => entry.sessionId !== next.sessionId)
  return [...without, next].sort((a, b) => {
    const byName = a.displayName.localeCompare(b.displayName, 'ko')
    return byName === 0 ? a.sessionId.localeCompare(b.sessionId) : byName
  })
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `presence-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function resolveCurrentUser(sessionId: string): Promise<PresenceUser | null> {
  try {
    const auth = await getAuthProvider().getSession()
    if (!auth?.userId) return null
    return {
      sessionId,
      displayName: sanitizeDisplayName(auth.fullName),
    }
  } catch {
    return null
  }
}

export interface UsePresenceOptions {
  entityId: string
  client?: PresenceClient
  enabled?: boolean
}

export function usePresence({
  entityId,
  client = SlipPresenceClient,
  enabled = true,
}: UsePresenceOptions): PresenceEntry[] {
  const [entries, setEntries] = useState<PresenceEntry[]>([])
  const currentUserRef = useRef<PresenceUser | null>(null)

  useEffect(() => {
    if (!enabled || !entityId) {
      setEntries([])
      return
    }

    let cancelled = false
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    const joinAbort = new AbortController()
    const sessionId = createSessionId()
    currentUserRef.current = { sessionId, displayName: '사용자' }

    const refresh = async () => {
      try {
        if (cancelled) return
        const next = await client.list(entityId)
        if (cancelled) return
        setEntries(Array.isArray(next) ? next : [])
      } catch (err) {
        console.warn('[presence] 목록 조회 실패', err)
      }
    }

    const join = async () => {
      const currentUser = currentUserRef.current
      if (cancelled || !currentUser) return
      try {
        if (cancelled) return
        const entry = await client.join(entityId, currentUser, joinAbort.signal)
        if (cancelled || entry === null) return
        setEntries((prev) => upsertPresence(prev, entry))
      } catch (err) {
        if (joinAbort.signal.aborted) return
        console.warn('[presence] join/heartbeat 실패', err)
      }
    }

    const leave = async (allowAfterCancel = false) => {
      const currentUser = currentUserRef.current
      if ((!allowAfterCancel && cancelled) || !currentUser) return
      try {
        await client.leave(entityId, currentUser)
      } catch (err) {
        console.warn('[presence] leave 실패', err)
      }
    }

    // TODO(presence-rollout): 5문서 롤아웃 시 단일 collab 구독에 presence fan-out 통합 검토.
    const ctrl = client.subscribe(entityId, (evt) => {
      if (cancelled) return
      if (evt.event === 'connected') {
        void refresh()
        return
      }
      if (evt.event === 'presence:join' && isPresenceEntry(evt.data)) {
        const entry = evt.data
        setEntries((prev) => upsertPresence(prev, entry))
        return
      }
      if (evt.event === 'presence:leave' && isPresenceEntry(evt.data)) {
        const entry = evt.data
        setEntries((prev) => prev.filter((item) => item.sessionId !== entry.sessionId))
      }
    })

    void (async () => {
      const resolved = await resolveCurrentUser(sessionId)
      if (cancelled) return
      if (resolved) currentUserRef.current = resolved
      await refresh()
      if (cancelled) return
      await join()
      if (cancelled) return
      heartbeatTimer = setInterval(() => {
        if (cancelled) return
        void join()
      }, HEARTBEAT_MS)
    })()

    return () => {
      cancelled = true
      joinAbort.abort()
      ctrl.abort()
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
      void leave(true)
    }
  }, [client, enabled, entityId])

  return entries
}
