import * as Y from 'yjs'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness'
import { getAuthProvider } from '../auth/authProvider'
import { makeCoeditApi, normalizeCoeditBasePath } from './coeditApi'
import { createRealtimeClient } from './createRealtimeClient'
import type { RealtimeEvent } from './createRealtimeClient'
import { presenceHexFromUserId } from '../utils/presenceColor'
import { sanitizeDisplayName } from '../common/userDisplayName'

const REMOTE_ORIGIN = 'samhan-coedit-remote'
const POST_DEBOUNCE_MS = 150
const AWARENESS_DEBOUNCE_MS = 120
const SNAPSHOT_RESYNC_MS = 5_000
export const EDIT_HIGHLIGHT_MS = 2_500
const EMPTY_HEADER_TEXT_FIELDS = new Set<string>()

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
  getItemIndexById: (lineId: string) => number
  getItemValueById: (lineId: string, cellName: string) => string
  setItemValueById: (lineId: string, cellName: string, value: string) => void
  addItem: (seed?: Record<string, unknown>) => string
  removeItem: (lineId: string) => void
  replaceItems: (rows: object[]) => void
  isEmpty: () => boolean
  subscribeDoc: (listener: () => void) => () => void
  subscribeAwareness: (listener: () => void) => () => void
  destroy: () => void
}

export interface CreateCoeditProviderOptions {
  documentId: string
  basePath: string
  fieldName: string
  initialUpdates?: (documentId: string) => Promise<CoeditUpdatesResponse>
  postUpdate?: (documentId: string, update: string) => Promise<void> | void
  postAwareness?: (documentId: string, awareness: string) => Promise<void> | void
  subscribe?: (documentId: string, onEvent: (event: RealtimeEvent) => void) => AbortController
}

export interface CoeditUpdatesResponse {
  updates: string[]
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

/** corrupt/비-Yjs update 를 문서 전체 브릭 없이 건너뛰기 위한 안전 적용(리뷰 #691 QA 적발). */
function safeApplyUpdate(doc: Y.Doc, update: string, origin: unknown, logPrefix: string): boolean {
  try {
    Y.applyUpdate(doc, decodeBase64Update(update), origin)
    return true
  } catch (err) {
    console.warn(`${logPrefix} corrupt coedit update 건너뜀`, err)
    return false
  }
}

/** corrupt/비-Yjs awareness update 를 커서 표시 파손 없이 건너뛰기 위한 안전 적용(awareness-side #692 미러). */
function safeApplyAwareness(awareness: Awareness, encoded: string, origin: unknown, logPrefix: string): boolean {
  const previousStates = new Map(awareness.states)
  const previousMeta = new Map(awareness.meta)
  try {
    applyAwarenessUpdate(awareness, decodeBase64Update(encoded), origin)
    return true
  } catch (err) {
    awareness.states = previousStates
    awareness.meta = previousMeta
    console.warn(`${logPrefix} corrupt coedit awareness 건너뜀`, err)
    return false
  }
}

function isCoeditPayload(value: unknown, key: 'update' | 'awareness'): value is Record<typeof key, string> {
  return typeof value === 'object'
    && value !== null
    && key in value
    && typeof (value as Record<typeof key, unknown>)[key] === 'string'
}

function createBasePathRealtimeClient(name: string, basePath: string) {
  const endpointPath = `${normalizeCoeditBasePath(basePath)}/collab/stream`
  return createRealtimeClient({
    name,
    endpointPath: () => endpointPath,
    allowMockMode: true,
  })
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
    const displayName = sanitizeDisplayName(session?.fullName)
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
  const defaultApi = makeCoeditApi(options.basePath)
  const initialUpdates = options.initialUpdates
    ?? (async () => ({ updates: await defaultApi.getUpdates() }))
  const postUpdate = options.postUpdate
    ?? ((_documentId: string, update: string) => defaultApi.postUpdate(update))
  const postAwareness = options.postAwareness
    ?? ((_documentId: string, awarenessValue: string) => defaultApi.postAwareness(awarenessValue))
  const subscribe = options.subscribe ?? createBasePathRealtimeClient('coedit', options.basePath).subscribe
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
    void Promise.resolve(postUpdate(options.documentId, encodeBase64Update(merged))).catch(() => {
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
    void Promise.resolve(postAwareness(options.documentId, encodeBase64Update(encodeAwarenessUpdate(awareness, clients))))
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

  const applySnapshot = (snapshot: CoeditUpdatesResponse) => {
    for (const update of snapshot.updates) {
      safeApplyUpdate(doc, update, REMOTE_ORIGIN, '[coedit]')
    }
  }

  const resyncSnapshot = async () => {
    if (destroyed) return
    const snapshot = await initialUpdates(options.documentId)
    if (destroyed) return // destroy 후 in-flight fetch 완료 시 destroyed doc 에 applyUpdate 방지(Opus 라운드3).
    applySnapshot(snapshot)
  }

  const stream = subscribe(options.documentId, (event) => {
    if (destroyed) return
    if (event.event === 'coedit:update' && isCoeditPayload(event.data, 'update')) {
      safeApplyUpdate(doc, event.data.update, REMOTE_ORIGIN, '[coedit]')
      return
    }
    if (event.event === 'coedit:awareness' && isCoeditPayload(event.data, 'awareness')) {
      safeApplyAwareness(awareness, event.data.awareness, REMOTE_ORIGIN, '[coedit]')
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

  let snapshot: CoeditUpdatesResponse
  try {
    snapshot = await initialUpdates(options.documentId)
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
      safeApplyUpdate(doc, update, REMOTE_ORIGIN, '[coedit]')
    },
    applyRemoteAwareness: (encodedAwareness: string) => {
      safeApplyAwareness(awareness, encodedAwareness, REMOTE_ORIGIN, '[coedit]')
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
      return edits.sort((a, b) => b.ts - a.ts)
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
  documentId: string
  basePath: string
  headerTextFields?: Set<string>
  initialUpdates?: (documentId: string) => Promise<CoeditUpdatesResponse>
  postUpdate?: (documentId: string, update: string) => Promise<void> | void
  postAwareness?: (documentId: string, awareness: string) => Promise<void> | void
  subscribe?: (documentId: string, onEvent: (event: RealtimeEvent) => void) => AbortController
}

function stringifyYValue(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Y.Text) return value.toString()
  return String(value)
}

// ── 라인 안정키(lineId) 규약 ───────────────────────────────────────────────
// coedit 라인 항목은 위치(index) 대신 불변 lineId 로 식별한다.
// ⚠️ lineId 는 (1) 비어있지 않고 (2) 순수 숫자문자열(/^\d+$/)이 아니어야 한다 —
//    CollaborativeSlipInput 이 fieldPath `items.{seg}.{cell}` 의 seg 가 숫자면 기존 index API,
//    아니면 lineId(byId) API 로 분기하므로 순수 숫자 lineId 는 index 로 오라우팅된다.
//    generateLineId()(UUID/`line-` 접두)는 이 규약을 보장한다. slA1b 에서 서버 line.id 를
//    lineId 로 시드할 때 그 id 가 정수형이면 반드시 비숫자 형태(예: `sl-${id}`)로 래핑할 것.
//    (듀얼리뷰 slA1: FE/Codex 공통 지적 — 숫자 seed → index 오라우팅 함정.)
const LINE_ID_FIELD = 'lineId'

function readLineId(map: Y.Map<unknown>): string {
  const value = map.get(LINE_ID_FIELD)
  return typeof value === 'string' ? value : ''
}

/** 라인 안정키 생성 - Electron 렌더러/jsdom 모두 crypto.randomUUID 우선, 미가용 시 폴백. */
function generateLineId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `line-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function findItemIndexById(items: Y.Array<Y.Map<unknown>>, lineId: string): number {
  // 빈/falsy lineId 는 유효한 라인키가 아니다 — lineId 미보유 legacy row(readLineId→'')와
  // 우발 매칭을 차단(setItemValueById('')/removeItem('')가 첫 구행을 오손하는 사고 방지, 리뷰 Codex MEDIUM).
  if (!lineId) return -1
  for (let i = 0; i < items.length; i += 1) {
    if (readLineId(items.get(i)) === lineId) return i
  }
  return -1
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
  const headerTextFields = options.headerTextFields ?? EMPTY_HEADER_TEXT_FIELDS
  const defaultApi = makeCoeditApi(options.basePath)
  const initialUpdates = options.initialUpdates
    ?? (async () => ({ updates: await defaultApi.getUpdates() }))
  const postUpdate = options.postUpdate
    ?? ((_documentId: string, update: string) => defaultApi.postUpdate(update))
  const postAwareness = options.postAwareness
    ?? ((_documentId: string, awarenessValue: string) => defaultApi.postAwareness(awarenessValue))
  const subscribe = options.subscribe ?? createBasePathRealtimeClient('doc-coedit', options.basePath).subscribe
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
    void Promise.resolve(postUpdate(options.documentId, encodeBase64Update(merged))).catch(() => {
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
    void Promise.resolve(postAwareness(options.documentId, encodeBase64Update(encodeAwarenessUpdate(awareness, clients))))
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

  const applySnapshot = (snapshot: CoeditUpdatesResponse) => {
    for (const update of snapshot.updates) {
      safeApplyUpdate(doc, update, REMOTE_ORIGIN, '[doc-coedit]')
    }
  }
  const resyncSnapshot = async () => {
    if (destroyed) return
    const snapshot = await initialUpdates(options.documentId)
    if (destroyed) return
    applySnapshot(snapshot)
  }
  const stream = subscribe(options.documentId, (event) => {
    if (destroyed) return
    if (event.event === 'coedit:update' && isCoeditPayload(event.data, 'update')) {
      safeApplyUpdate(doc, event.data.update, REMOTE_ORIGIN, '[doc-coedit]')
      return
    }
    if (event.event === 'coedit:awareness' && isCoeditPayload(event.data, 'awareness')) {
      safeApplyAwareness(awareness, event.data.awareness, REMOTE_ORIGIN, '[doc-coedit]')
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
    applySnapshot(await initialUpdates(options.documentId))
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
      safeApplyUpdate(doc, update, REMOTE_ORIGIN, '[doc-coedit]')
    },
    applyRemoteAwareness: (encodedAwareness: string) => {
      safeApplyAwareness(awareness, encodedAwareness, REMOTE_ORIGIN, '[doc-coedit]')
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
      return edits.sort((a, b) => b.ts - a.ts)
    },
    getHeaderValue: (fieldName: string) => stringifyYValue(header.get(fieldName)),
    setHeaderValue: (fieldName: string, value: string) => {
      if (headerTextFields.has(fieldName)) {
        setYTextValue(ensureHeaderText(header, fieldName), value)
        return
      }
      header.set(fieldName, value)
    },
    getItemValue: (index: number, cellName: string) => stringifyYValue(items.get(index)?.get(cellName)),
    setItemValue: (index: number, cellName: string, value: string) => {
      ensureItemMap(items, index).set(cellName, value)
    },
    getItemIndexById: (lineId: string) => findItemIndexById(items, lineId),
    getItemValueById: (lineId: string, cellName: string) => {
      const index = findItemIndexById(items, lineId)
      return index < 0 ? '' : stringifyYValue(items.get(index)?.get(cellName))
    },
    setItemValueById: (lineId: string, cellName: string, value: string) => {
      const index = findItemIndexById(items, lineId)
      if (index < 0) return // 원격 라인 삭제 경합은 멱등 no-op으로 처리한다.
      items.get(index).set(cellName, value)
    },
    addItem: (seed?: Record<string, unknown>) => {
      const lineId = generateLineId()
      doc.transact(() => {
        const map = new Y.Map<unknown>()
        map.set(LINE_ID_FIELD, lineId)
        if (seed) {
          for (const [key, value] of Object.entries(seed)) {
            if (key === LINE_ID_FIELD) continue
            map.set(key, value == null ? '' : String(value))
          }
        }
        items.push([map])
      })
      return lineId
    },
    removeItem: (lineId: string) => {
      doc.transact(() => {
        const index = findItemIndexById(items, lineId)
        if (index >= 0) items.delete(index, 1)
      })
    },
    replaceItems: (rows: object[]) => {
      doc.transact(() => {
        if (items.length > 0) items.delete(0, items.length)
        const nextRows = rows.map((row) => {
          const map = new Y.Map<unknown>()
          let lineIdSet = false
          for (const [key, value] of Object.entries(row)) {
            if (key === LINE_ID_FIELD) {
              const seeded = value == null || value === '' ? generateLineId() : String(value)
              map.set(LINE_ID_FIELD, seeded)
              lineIdSet = true
            } else {
              map.set(key, value == null ? '' : String(value))
            }
          }
          if (!lineIdSet) map.set(LINE_ID_FIELD, generateLineId())
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
