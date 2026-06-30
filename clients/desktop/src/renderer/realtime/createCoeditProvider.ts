import * as Y from 'yjs'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness'
import {
  getSlipCoeditUpdates,
  postSlipCoeditAwareness,
  postSlipCoeditUpdate,
  type SlipCoeditUpdatesResponse,
} from '../api/slipCollab'
import { getAuthProvider } from '../auth/authProvider'
import { SlipCollabRealtimeClient } from './SlipCollabRealtimeClient'
import type { RealtimeEvent } from './createRealtimeClient'
import { presenceHexFromUserId } from '../utils/presenceColor'

const REMOTE_ORIGIN = 'samhan-coedit-remote'
const POST_DEBOUNCE_MS = 150
const AWARENESS_DEBOUNCE_MS = 120
const SNAPSHOT_RESYNC_MS = 5_000
export const EDIT_HIGHLIGHT_MS = 2_500
const HEADER_TEXT_FIELDS = new Set([
  'memo',
  'deliveryAddress',
  'supervisionAddress',
  'projectName',
])

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
  setLocalLastEdit: (fieldPath: string) => void
  getRemoteEdits: (fieldPath?: string, now?: number) => RemoteFieldEdit[]
  subscribeText: (listener: () => void) => () => void
  subscribeAwareness: (listener: () => void) => () => void
  destroy: () => void
}

export interface RemoteFieldCursor extends RemoteCursor {
  fieldPath: string
}

export interface RemoteFieldEdit {
  clientId: number
  displayName: string
  color: string
  fieldPath: string
  ts: number
}

export interface DocCoeditProvider {
  doc: Y.Doc
  header: Y.Map<unknown>
  items: Y.Array<Y.Map<unknown>>
  awareness: Awareness
  applyRemoteUpdate: (update: string) => void
  applyRemoteAwareness: (awareness: string) => void
  setLocalCursor: (fieldPath: string, anchor?: number, head?: number) => void
  getRemoteCursors: (fieldPath?: string) => RemoteFieldCursor[]
  setLocalLastEdit: (fieldPath: string) => void
  getRemoteEdits: (fieldPath?: string, now?: number) => RemoteFieldEdit[]
  getHeaderValue: (fieldName: string) => string
  setHeaderValue: (fieldName: string, value: string) => void
  getItemValue: (index: number, cellName: string) => string
  setItemValue: (index: number, cellName: string, value: string) => void
  replaceItems: (rows: object[]) => void
  isEmpty: () => boolean
  subscribeDoc: (listener: () => void) => () => void
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

function isFieldAwarenessState(value: unknown, fieldPath?: string): value is {
  user: { displayName: string; color: string }
  cursor: { fieldPath: string; anchor?: number; head?: number }
} {
  if (typeof value !== 'object' || value === null) return false
  const state = value as { user?: unknown; cursor?: unknown }
  if (typeof state.user !== 'object' || state.user === null) return false
  if (typeof state.cursor !== 'object' || state.cursor === null) return false
  const user = state.user as Record<string, unknown>
  const cursor = state.cursor as Record<string, unknown>
  if (typeof user['displayName'] !== 'string' || typeof user['color'] !== 'string') return false
  if (typeof cursor['fieldPath'] !== 'string') return false
  if (fieldPath && cursor['fieldPath'] !== fieldPath) return false
  return (cursor['anchor'] === undefined || typeof cursor['anchor'] === 'number')
    && (cursor['head'] === undefined || typeof cursor['head'] === 'number')
}

function isEditAwarenessState(value: unknown, fieldPath?: string): value is {
  user: { displayName: string; color: string }
  lastEdit: { fieldPath: string; ts: number }
} {
  if (typeof value !== 'object' || value === null) return false
  const state = value as { user?: unknown; lastEdit?: unknown }
  if (typeof state.user !== 'object' || state.user === null) return false
  if (typeof state.lastEdit !== 'object' || state.lastEdit === null) return false
  const user = state.user as Record<string, unknown>
  const edit = state.lastEdit as Record<string, unknown>
  if (typeof user['displayName'] !== 'string' || typeof user['color'] !== 'string') return false
  if (typeof edit['fieldPath'] !== 'string' || typeof edit['ts'] !== 'number') return false
  if (fieldPath && edit['fieldPath'] !== fieldPath) return false
  return true
}

async function resolveLocalUser(): Promise<{ displayName: string; color: string }> {
  try {
    const session = await getAuthProvider().getSession()
    const displayName = session?.fullName?.trim() || '사용자'
    return {
      displayName,
      color: presenceHexFromUserId(session?.userId || displayName),
    }
  } catch {
    return { displayName: '사용자', color: presenceHexFromUserId(null) }
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
  let destroyed = false

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
    void Promise.resolve(postUpdate(options.slipId, encodeBase64Update(merged))).catch(() => {
      if (destroyed) return
      queuedUpdates = [merged, ...queuedUpdates]
      if (flushTimer === null) flushTimer = setTimeout(flushUpdates, POST_DEBOUNCE_MS)
    })
  }

  const scheduleUpdatePost = (update: Uint8Array) => {
    if (destroyed) return
    queuedUpdates.push(update)
    if (flushTimer !== null) clearTimeout(flushTimer)
    flushTimer = setTimeout(flushUpdates, POST_DEBOUNCE_MS)
  }

  // awareness(커서/셀렉트) 도 debounce — 빠른 타이핑/이동 시 매 이벤트 HTTP POST 폭주 방지(FE 리뷰 N-3).
  let awarenessTimer: ReturnType<typeof setTimeout> | null = null
  let pendingAwarenessClients: number[] = []
  const flushAwareness = () => {
    awarenessTimer = null
    if (pendingAwarenessClients.length === 0) return
    const clients = Array.from(new Set(pendingAwarenessClients))
    pendingAwarenessClients = []
    void Promise.resolve(postAwareness(options.slipId, encodeBase64Update(encodeAwarenessUpdate(awareness, clients))))
      .catch(() => {
        if (destroyed) return
        pendingAwarenessClients = [...clients, ...pendingAwarenessClients]
        if (awarenessTimer === null) awarenessTimer = setTimeout(flushAwareness, AWARENESS_DEBOUNCE_MS)
      })
  }
  const scheduleAwarenessPost = (clients: number[]) => {
    if (destroyed) return
    pendingAwarenessClients.push(...clients)
    if (awarenessTimer !== null) clearTimeout(awarenessTimer)
    awarenessTimer = setTimeout(flushAwareness, AWARENESS_DEBOUNCE_MS)
  }

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (destroyed) return
    if (origin === REMOTE_ORIGIN) return
    scheduleUpdatePost(update)
  })

  awareness.on('update', (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (destroyed) return
    notifyAwareness()
    if (origin === REMOTE_ORIGIN) return
    const changedClients = [...changes.added, ...changes.updated, ...changes.removed]
    if (changedClients.length === 0) return
    scheduleAwarenessPost(changedClients)
  })

  const localUser = await resolveLocalUser()
  awareness.setLocalStateField('user', localUser)

  const applySnapshot = (snapshot: SlipCoeditUpdatesResponse) => {
    for (const update of snapshot.updates) {
      Y.applyUpdate(doc, decodeBase64Update(update), REMOTE_ORIGIN)
    }
  }

  const resyncSnapshot = async () => {
    if (destroyed) return
    const snapshot = await initialUpdates(options.slipId)
    if (destroyed) return // destroy 후 in-flight fetch 완료 시 destroyed doc 에 applyUpdate 방지(Opus 라운드3).
    applySnapshot(snapshot)
  }

  const stream = subscribe(options.slipId, (event) => {
    if (destroyed) return
    if (event.event === 'coedit:update' && isCoeditPayload(event.data, 'update')) {
      Y.applyUpdate(doc, decodeBase64Update(event.data.update), REMOTE_ORIGIN)
      return
    }
    if (event.event === 'coedit:awareness' && isCoeditPayload(event.data, 'awareness')) {
      applyAwarenessUpdate(awareness, decodeBase64Update(event.data.awareness), REMOTE_ORIGIN)
    }
  })

  const cleanupFailedInitialization = () => {
    destroyed = true
    if (flushTimer !== null) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (awarenessTimer !== null) {
      clearTimeout(awarenessTimer)
      awarenessTimer = null
    }
    queuedUpdates = []
    pendingAwarenessClients = []
    awareness.destroy()
    stream.abort()
    doc.destroy()
    textListeners.clear()
    awarenessListeners.clear()
  }

  let snapshot: SlipCoeditUpdatesResponse
  try {
    snapshot = await initialUpdates(options.slipId)
  } catch (error) {
    cleanupFailedInitialization()
    throw error
  }
  applySnapshot(snapshot)

  const resyncTimer = setInterval(() => {
    void resyncSnapshot().catch(() => undefined)
  }, SNAPSHOT_RESYNC_MS)

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
    setLocalLastEdit: (fieldPath: string) => {
      awareness.setLocalStateField('lastEdit', { fieldPath, ts: Date.now() })
    },
    getRemoteEdits: (fieldPath?: string, now: number = Date.now()) => {
      const edits: RemoteFieldEdit[] = []
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === doc.clientID || !isEditAwarenessState(state, fieldPath)) continue
        if (now - state.lastEdit.ts >= EDIT_HIGHLIGHT_MS) continue
        edits.push({
          clientId,
          displayName: state.user.displayName,
          color: state.user.color,
          fieldPath: state.lastEdit.fieldPath,
          ts: state.lastEdit.ts,
        })
      }
      return edits
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
      if (destroyed) return
      if (flushTimer !== null) {
        clearTimeout(flushTimer)
        flushUpdates()
      }
      if (awarenessTimer !== null) {
        clearTimeout(awarenessTimer)
        flushAwareness()
      }
      destroyed = true
      clearInterval(resyncTimer)
      text.unobserve(textObserver)
      awareness.destroy()
      stream.abort()
      doc.destroy()
      textListeners.clear()
      awarenessListeners.clear()
    },
  }
}

export interface CreateDocCoeditProviderOptions {
  slipId: string
  initialUpdates?: (slipId: string) => Promise<SlipCoeditUpdatesResponse>
  postUpdate?: (slipId: string, update: string) => Promise<void> | void
  postAwareness?: (slipId: string, awareness: string) => Promise<void> | void
  subscribe?: (slipId: string, onEvent: (event: RealtimeEvent) => void) => AbortController
}

function stringifyYValue(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Y.Text) return value.toString()
  return String(value)
}

function ensureItemMap(items: Y.Array<Y.Map<unknown>>, index: number): Y.Map<unknown> {
  while (items.length <= index) {
    items.push([new Y.Map<unknown>()])
  }
  return items.get(index)
}

function setYTextValue(text: Y.Text, value: string) {
  const current = text.toString()
  if (current === value) return
  if (text.length > 0) text.delete(0, text.length)
  if (value.length > 0) text.insert(0, value)
}

function ensureHeaderText(header: Y.Map<unknown>, fieldName: string): Y.Text {
  const existing = header.get(fieldName)
  if (existing instanceof Y.Text) return existing
  const text = new Y.Text()
  if (existing != null) text.insert(0, String(existing))
  header.set(fieldName, text)
  return text
}

export async function createDocCoeditProvider(
  options: CreateDocCoeditProviderOptions,
): Promise<DocCoeditProvider> {
  const doc = new Y.Doc()
  const header = doc.getMap<unknown>('header')
  const items = doc.getArray<Y.Map<unknown>>('items')
  const awareness = new Awareness(doc)
  const initialUpdates = options.initialUpdates ?? getSlipCoeditUpdates
  const postUpdate = options.postUpdate ?? postSlipCoeditUpdate
  const postAwareness = options.postAwareness ?? postSlipCoeditAwareness
  const subscribe = options.subscribe ?? SlipCollabRealtimeClient.subscribe
  const docListeners = new Set<() => void>()
  const awarenessListeners = new Set<() => void>()
  let queuedUpdates: Uint8Array[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let awarenessTimer: ReturnType<typeof setTimeout> | null = null
  let pendingAwarenessClients: number[] = []
  let destroyed = false

  const notifyDoc = () => {
    for (const listener of docListeners) listener()
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
    void Promise.resolve(postUpdate(options.slipId, encodeBase64Update(merged))).catch(() => {
      if (destroyed) return
      queuedUpdates = [merged, ...queuedUpdates]
      if (flushTimer === null) flushTimer = setTimeout(flushUpdates, POST_DEBOUNCE_MS)
    })
  }
  const scheduleUpdatePost = (update: Uint8Array) => {
    if (destroyed) return
    queuedUpdates.push(update)
    if (flushTimer !== null) clearTimeout(flushTimer)
    flushTimer = setTimeout(flushUpdates, POST_DEBOUNCE_MS)
  }
  const flushAwareness = () => {
    awarenessTimer = null
    if (pendingAwarenessClients.length === 0) return
    const clients = Array.from(new Set(pendingAwarenessClients))
    pendingAwarenessClients = []
    void Promise.resolve(postAwareness(options.slipId, encodeBase64Update(encodeAwarenessUpdate(awareness, clients))))
      .catch(() => {
        if (destroyed) return
        pendingAwarenessClients = [...clients, ...pendingAwarenessClients]
        if (awarenessTimer === null) awarenessTimer = setTimeout(flushAwareness, AWARENESS_DEBOUNCE_MS)
      })
  }
  const scheduleAwarenessPost = (clients: number[]) => {
    if (destroyed) return
    pendingAwarenessClients.push(...clients)
    if (awarenessTimer !== null) clearTimeout(awarenessTimer)
    awarenessTimer = setTimeout(flushAwareness, AWARENESS_DEBOUNCE_MS)
  }

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (destroyed) return
    notifyDoc()
    if (origin === REMOTE_ORIGIN) return
    scheduleUpdatePost(update)
  })
  awareness.on('update', (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (destroyed) return
    notifyAwareness()
    if (origin === REMOTE_ORIGIN) return
    const changedClients = [...changes.added, ...changes.updated, ...changes.removed]
    if (changedClients.length === 0) return
    scheduleAwarenessPost(changedClients)
  })

  const localUser = await resolveLocalUser()
  awareness.setLocalStateField('user', localUser)

  const applySnapshot = (snapshot: SlipCoeditUpdatesResponse) => {
    for (const update of snapshot.updates) {
      Y.applyUpdate(doc, decodeBase64Update(update), REMOTE_ORIGIN)
    }
  }
  const resyncSnapshot = async () => {
    if (destroyed) return
    const snapshot = await initialUpdates(options.slipId)
    if (destroyed) return
    applySnapshot(snapshot)
  }
  const stream = subscribe(options.slipId, (event) => {
    if (destroyed) return
    if (event.event === 'coedit:update' && isCoeditPayload(event.data, 'update')) {
      Y.applyUpdate(doc, decodeBase64Update(event.data.update), REMOTE_ORIGIN)
      return
    }
    if (event.event === 'coedit:awareness' && isCoeditPayload(event.data, 'awareness')) {
      applyAwarenessUpdate(awareness, decodeBase64Update(event.data.awareness), REMOTE_ORIGIN)
    }
  })
  const cleanupFailedInitialization = () => {
    destroyed = true
    if (flushTimer !== null) clearTimeout(flushTimer)
    if (awarenessTimer !== null) clearTimeout(awarenessTimer)
    queuedUpdates = []
    pendingAwarenessClients = []
    awareness.destroy()
    stream.abort()
    doc.destroy()
    docListeners.clear()
    awarenessListeners.clear()
  }

  try {
    applySnapshot(await initialUpdates(options.slipId))
  } catch (error) {
    cleanupFailedInitialization()
    throw error
  }
  const resyncTimer = setInterval(() => {
    void resyncSnapshot().catch(() => undefined)
  }, SNAPSHOT_RESYNC_MS)

  return {
    doc,
    header,
    items,
    awareness,
    applyRemoteUpdate: (update: string) => {
      Y.applyUpdate(doc, decodeBase64Update(update), REMOTE_ORIGIN)
    },
    applyRemoteAwareness: (encodedAwareness: string) => {
      applyAwarenessUpdate(awareness, decodeBase64Update(encodedAwareness), REMOTE_ORIGIN)
    },
    setLocalCursor: (fieldPath: string, anchor = 0, head = anchor) => {
      awareness.setLocalStateField('cursor', { fieldPath, anchor, head })
    },
    getRemoteCursors: (fieldPath?: string) => {
      const cursors: RemoteFieldCursor[] = []
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === doc.clientID || !isFieldAwarenessState(state, fieldPath)) continue
        cursors.push({
          clientId,
          displayName: state.user.displayName,
          color: state.user.color,
          fieldPath: state.cursor.fieldPath,
          anchor: state.cursor.anchor ?? 0,
          head: state.cursor.head ?? state.cursor.anchor ?? 0,
        })
      }
      return cursors
    },
    setLocalLastEdit: (fieldPath: string) => {
      awareness.setLocalStateField('lastEdit', { fieldPath, ts: Date.now() })
    },
    getRemoteEdits: (fieldPath?: string, now: number = Date.now()) => {
      const edits: RemoteFieldEdit[] = []
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === doc.clientID || !isEditAwarenessState(state, fieldPath)) continue
        if (now - state.lastEdit.ts >= EDIT_HIGHLIGHT_MS) continue
        edits.push({
          clientId,
          displayName: state.user.displayName,
          color: state.user.color,
          fieldPath: state.lastEdit.fieldPath,
          ts: state.lastEdit.ts,
        })
      }
      return edits
    },
    getHeaderValue: (fieldName: string) => stringifyYValue(header.get(fieldName)),
    setHeaderValue: (fieldName: string, value: string) => {
      if (HEADER_TEXT_FIELDS.has(fieldName)) {
        setYTextValue(ensureHeaderText(header, fieldName), value)
        return
      }
      header.set(fieldName, value)
    },
    getItemValue: (index: number, cellName: string) => stringifyYValue(items.get(index)?.get(cellName)),
    setItemValue: (index: number, cellName: string, value: string) => {
      ensureItemMap(items, index).set(cellName, value)
    },
    replaceItems: (rows: object[]) => {
      doc.transact(() => {
        if (items.length > 0) items.delete(0, items.length)
        const nextRows = rows.map((row) => {
          const map = new Y.Map<unknown>()
          for (const [key, value] of Object.entries(row)) {
            map.set(key, value == null ? '' : String(value))
          }
          return map
        })
        if (nextRows.length > 0) items.push(nextRows)
      })
    },
    isEmpty: () => header.size === 0 && items.length === 0,
    subscribeDoc: (listener: () => void) => {
      docListeners.add(listener)
      return () => docListeners.delete(listener)
    },
    subscribeAwareness: (listener: () => void) => {
      awarenessListeners.add(listener)
      return () => awarenessListeners.delete(listener)
    },
    destroy: () => {
      if (destroyed) return
      if (flushTimer !== null) {
        clearTimeout(flushTimer)
        flushUpdates()
      }
      if (awarenessTimer !== null) {
        clearTimeout(awarenessTimer)
        flushAwareness()
      }
      destroyed = true
      clearInterval(resyncTimer)
      awareness.destroy()
      stream.abort()
      doc.destroy()
      docListeners.clear()
      awarenessListeners.clear()
    },
  }
}
