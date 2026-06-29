import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SlipFieldLockClient,
  type FieldLockClient,
  type FieldLockEntry,
  type FieldLockUser,
} from '../realtime/createPresenceClient'
import { getAuthProvider } from '../auth/authProvider'

const HEARTBEAT_MS = 30_000

function isFieldLockEntry(value: unknown): value is FieldLockEntry {
  return typeof value === 'object'
    && value !== null
    && 'fieldPath' in value
    && 'sessionId' in value
    && 'displayName' in value
    && 'color' in value
}

function upsertLock(entries: FieldLockEntry[], next: FieldLockEntry): FieldLockEntry[] {
  const without = entries.filter((entry) => !(
    entry.fieldPath === next.fieldPath && entry.sessionId === next.sessionId
  ))
  return [...without, next].sort((a, b) => {
    const byField = a.fieldPath.localeCompare(b.fieldPath)
    if (byField !== 0) return byField
    const byName = a.displayName.localeCompare(b.displayName, 'ko')
    return byName === 0 ? a.sessionId.localeCompare(b.sessionId) : byName
  })
}

function removeLock(entries: FieldLockEntry[], target: FieldLockEntry): FieldLockEntry[] {
  return entries.filter((entry) => !(
    entry.fieldPath === target.fieldPath && entry.sessionId === target.sessionId
  ))
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `field-lock-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function resolveCurrentUser(sessionId: string): Promise<Omit<FieldLockUser, 'fieldPath'> | null> {
  try {
    const auth = await getAuthProvider().getSession()
    if (!auth?.userId) return null
    return {
      sessionId,
      displayName: auth.fullName?.trim() || '사용자',
    }
  } catch {
    return null
  }
}

export interface UseFieldLockOptions {
  entityId: string
  client?: FieldLockClient
  enabled?: boolean
}

export interface UseFieldLockResult {
  locks: FieldLockEntry[]
  lockedBy: (fieldPath: string) => FieldLockEntry[]
  acquire: (fieldPath: string) => Promise<void>
  release: (fieldPath: string) => Promise<void>
}

export function useFieldLock({
  entityId,
  client = SlipFieldLockClient,
  enabled = true,
}: UseFieldLockOptions): UseFieldLockResult {
  const [locks, setLocks] = useState<FieldLockEntry[]>([])
  const currentUserRef = useRef<Omit<FieldLockUser, 'fieldPath'> | null>(null)
  const activeFieldPathsRef = useRef<Set<string>>(new Set())
  const requestAbortRef = useRef<AbortController | null>(null)

  const acquire = useCallback(async (fieldPath: string) => {
    const currentUser = currentUserRef.current
    if (!enabled || !entityId || !fieldPath || !currentUser) return
    activeFieldPathsRef.current.add(fieldPath)
    try {
      const entry = await client.acquire(
        entityId,
        { ...currentUser, fieldPath },
        requestAbortRef.current?.signal,
      )
      if (entry) {
        setLocks((prev) => upsertLock(prev, entry))
      }
    } catch (err) {
      if (requestAbortRef.current?.signal.aborted) return
      console.warn('[field-lock] acquire 실패', err)
    }
  }, [client, enabled, entityId])

  const release = useCallback(async (fieldPath: string) => {
    const currentUser = currentUserRef.current
    if (!entityId || !fieldPath || !currentUser) return
    activeFieldPathsRef.current.delete(fieldPath)
    const localEntry: FieldLockEntry = {
      fieldPath,
      sessionId: currentUser.sessionId,
      displayName: currentUser.displayName,
      color: 'BLUE',
    }
    setLocks((prev) => removeLock(prev, localEntry))
    try {
      await client.release(entityId, { ...currentUser, fieldPath }, requestAbortRef.current?.signal)
    } catch (err) {
      if (requestAbortRef.current?.signal.aborted) return
      console.warn('[field-lock] release 실패', err)
    }
  }, [client, entityId])

  const lockedBy = useCallback((fieldPath: string) => {
    const currentSessionId = currentUserRef.current?.sessionId
    return locks.filter((entry) =>
      entry.fieldPath === fieldPath && entry.sessionId !== currentSessionId)
  }, [locks])

  useEffect(() => {
    if (!enabled || !entityId) {
      setLocks([])
      activeFieldPathsRef.current.clear()
      return
    }

    let cancelled = false
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    const requestAbort = new AbortController()
    requestAbortRef.current = requestAbort
    const sessionId = createSessionId()
    currentUserRef.current = { sessionId, displayName: '사용자' }

    const refresh = async () => {
      try {
        const next = await client.list(entityId)
        if (cancelled) return
        setLocks(Array.isArray(next) ? next : [])
      } catch (err) {
        console.warn('[field-lock] 목록 조회 실패', err)
      }
    }

    const ctrl = client.subscribe(entityId, (evt) => {
      if (cancelled) return
      if (evt.event === 'connected') {
        void refresh()
        return
      }
      if (evt.event === 'presence:field-lock-acquired' && isFieldLockEntry(evt.data)) {
        const entry = evt.data
        setLocks((prev) => upsertLock(prev, entry))
        return
      }
      if (evt.event === 'presence:field-lock-released' && isFieldLockEntry(evt.data)) {
        const entry = evt.data
        setLocks((prev) => removeLock(prev, entry))
      }
    })

    void (async () => {
      const resolved = await resolveCurrentUser(sessionId)
      if (cancelled) return
      if (resolved) currentUserRef.current = resolved
      await refresh()
      if (cancelled) return
      heartbeatTimer = setInterval(() => {
        if (cancelled) return
        for (const fieldPath of activeFieldPathsRef.current) {
          void acquire(fieldPath)
        }
      }, HEARTBEAT_MS)
    })()

    return () => {
      cancelled = true
      requestAbort.abort()
      ctrl.abort()
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
      const currentUser = currentUserRef.current
      if (currentUser) {
        for (const fieldPath of activeFieldPathsRef.current) {
          void client.release(entityId, { ...currentUser, fieldPath })
        }
      }
      activeFieldPathsRef.current.clear()
    }
  }, [acquire, client, enabled, entityId])

  return {
    locks,
    lockedBy,
    acquire,
    release,
  }
}
