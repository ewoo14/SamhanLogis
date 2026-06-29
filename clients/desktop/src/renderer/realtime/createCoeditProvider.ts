import * as Y from 'yjs'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness'
import { userIdToColor } from '@samhan/design-system'
import {
  getSlipCoeditUpdates,
  postSlipCoeditAwareness,
  postSlipCoeditUpdate,
  type SlipCoeditUpdatesResponse,
} from '../api/slipCollab'
import { getAuthProvider } from '../auth/authProvider'
import { SlipCollabRealtimeClient } from './SlipCollabRealtimeClient'
import type { RealtimeEvent } from './createRealtimeClient'

const REMOTE_ORIGIN = 'samhan-coedit-remote'
const POST_DEBOUNCE_MS = 150

export interface RemoteCursor {
  clientId: number
  displayName: string
  color: string
  anchor: number
  head: number
}

export interface CoeditProvider {
  text: Y.Text
  awareness: Awareness
  applyRemoteUpdate: (update: string) => void
  applyRemoteAwareness: (awareness: string) => void
  setLocalCursor: (anchor: number, head: number) => void
  getRemoteCursors: () => RemoteCursor[]
  subscribeText: (listener: () => void) => () => void
  subscribeAwareness: (listener: () => void) => () => void
  destroy: () => void
}

export interface CreateCoeditProviderOptions {
  slipId: string
  fieldName: string
  initialUpdates?: (slipId: string) => Promise<SlipCoeditUpdatesResponse>
  postUpdate?: (slipId: string, update: string) => Promise<void> | void
  postAwareness?: (slipId: string, awareness: string) => Promise<void> | void
  subscribe?: (slipId: string, onEvent: (event: RealtimeEvent) => void) => AbortController
}

export function encodeBase64Update(update: Uint8Array): string {
  let binary = ''
  for (const byte of update) {
    binary += String.fromCharCode(byte)
  }
  return globalThis.btoa(binary)
}

export function decodeBase64Update(update: string): Uint8Array {
  const binary = globalThis.atob(update)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function isCoeditPayload(value: unknown, key: 'update' | 'awareness'): value is Record<typeof key, string> {
  return typeof value === 'object'
    && value !== null
    && key in value
    && typeof (value as Record<typeof key, unknown>)[key] === 'string'
}

function isAwarenessState(value: unknown, fieldName: string): value is {
  user: { displayName: string; color: string }
  cursor: { fieldName: string; anchor: number; head: number }
} {
  if (typeof value !== 'object' || value === null) return false
  const state = value as {
    user?: unknown
    cursor?: unknown
  }
  if (typeof state.user !== 'object' || state.user === null) return false
  if (typeof state.cursor !== 'object' || state.cursor === null) return false
  const user = state.user as Record<string, unknown>
  const cursor = state.cursor as Record<string, unknown>
  return typeof user['displayName'] === 'string'
    && typeof user['color'] === 'string'
    && cursor['fieldName'] === fieldName
    && typeof cursor['anchor'] === 'number'
    && typeof cursor['head'] === 'number'
}

async function resolveLocalUser(): Promise<{ displayName: string; color: string }> {
  try {
    const session = await getAuthProvider().getSession()
    const displayName = session?.fullName?.trim() || '사용자'
    return {
      displayName,
      color: userIdToColor(session?.userId || displayName),
    }
  } catch {
    return { displayName: '사용자', color: '#2563EB' }
  }
}

export async function createCoeditProvider(options: CreateCoeditProviderOptions): Promise<CoeditProvider> {
  const doc = new Y.Doc()
  const text = doc.getText(options.fieldName)
  const awareness = new Awareness(doc)
  const initialUpdates = options.initialUpdates ?? getSlipCoeditUpdates
  const postUpdate = options.postUpdate ?? postSlipCoeditUpdate
  const postAwareness = options.postAwareness ?? postSlipCoeditAwareness
  const subscribe = options.subscribe ?? SlipCollabRealtimeClient.subscribe
  const textListeners = new Set<() => void>()
  const awarenessListeners = new Set<() => void>()
  let queuedUpdates: Uint8Array[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  const notifyText = () => {
    for (const listener of textListeners) listener()
  }
  const notifyAwareness = () => {
    for (const listener of awarenessListeners) listener()
  }

  const flushUpdates = () => {
    flushTimer = null
    const next = queuedUpdates
    queuedUpdates = []
    if (next.length === 0) return
    const merged = next.length === 1 ? next[0]! : Y.mergeUpdates(next)
    void postUpdate(options.slipId, encodeBase64Update(merged))
  }

  const scheduleUpdatePost = (update: Uint8Array) => {
    queuedUpdates.push(update)
    if (flushTimer !== null) clearTimeout(flushTimer)
    flushTimer = setTimeout(flushUpdates, POST_DEBOUNCE_MS)
  }

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN) return
    scheduleUpdatePost(update)
  })

  awareness.on('update', (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    notifyAwareness()
    if (origin === REMOTE_ORIGIN) return
    const changedClients = [...changes.added, ...changes.updated, ...changes.removed]
    if (changedClients.length === 0) return
    void postAwareness(options.slipId, encodeBase64Update(encodeAwarenessUpdate(awareness, changedClients)))
  })

  const localUser = await resolveLocalUser()
  awareness.setLocalStateField('user', localUser)

  const snapshot = await initialUpdates(options.slipId)
  for (const update of snapshot.updates) {
    Y.applyUpdate(doc, decodeBase64Update(update), REMOTE_ORIGIN)
  }

  const stream = subscribe(options.slipId, (event) => {
    if (event.event === 'coedit:update' && isCoeditPayload(event.data, 'update')) {
      Y.applyUpdate(doc, decodeBase64Update(event.data.update), REMOTE_ORIGIN)
      return
    }
    if (event.event === 'coedit:awareness' && isCoeditPayload(event.data, 'awareness')) {
      applyAwarenessUpdate(awareness, decodeBase64Update(event.data.awareness), REMOTE_ORIGIN)
    }
  })

  const textObserver = () => notifyText()
  text.observe(textObserver)

  return {
    text,
    awareness,
    applyRemoteUpdate: (update: string) => {
      Y.applyUpdate(doc, decodeBase64Update(update), REMOTE_ORIGIN)
    },
    applyRemoteAwareness: (encodedAwareness: string) => {
      applyAwarenessUpdate(awareness, decodeBase64Update(encodedAwareness), REMOTE_ORIGIN)
    },
    setLocalCursor: (anchor: number, head: number) => {
      awareness.setLocalStateField('cursor', { fieldName: options.fieldName, anchor, head })
    },
    getRemoteCursors: () => {
      const cursors: RemoteCursor[] = []
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === doc.clientID || !isAwarenessState(state, options.fieldName)) continue
        cursors.push({
          clientId,
          displayName: state.user.displayName,
          color: state.user.color,
          anchor: state.cursor.anchor,
          head: state.cursor.head,
        })
      }
      return cursors
    },
    subscribeText: (listener: () => void) => {
      textListeners.add(listener)
      return () => textListeners.delete(listener)
    },
    subscribeAwareness: (listener: () => void) => {
      awarenessListeners.add(listener)
      return () => awarenessListeners.delete(listener)
    },
    destroy: () => {
      if (flushTimer !== null) {
        clearTimeout(flushTimer)
        flushUpdates()
      }
      text.unobserve(textObserver)
      awareness.destroy()
      stream.abort()
      doc.destroy()
      textListeners.clear()
      awarenessListeners.clear()
    },
  }
}
