import { apiClient, type ApiEnvelope } from '../api/client'
import { collabHeaders } from '../auth/collabHeaders'
import { createRealtimeClient, type RealtimeEvent } from './createRealtimeClient'

export type PresenceColor =
  | 'BLUE'
  | 'GREEN'
  | 'AMBER'
  | 'ROSE'
  | 'VIOLET'
  | 'CYAN'
  | 'LIME'
  | 'PINK'

export interface PresenceEntry {
  /** 클라이언트 mount 단위 opaque 식별자. account UUID 가 아니다. */
  sessionId: string
  displayName: string
  color: PresenceColor
}

export interface FieldLockEntry {
  /** 도메인 무관 필드 경로. 예: memo, shippingAddress. */
  fieldPath: string
  /** 클라이언트 mount 단위 opaque 식별자. account UUID 가 아니다. */
  sessionId: string
  displayName: string
  color: PresenceColor
}

export interface PresenceUser {
  sessionId: string
  displayName: string
}

export interface PresenceClientConfig {
  name: string
  presencePath: (entityId: string, action?: 'join' | 'leave') => string
  streamPath: (entityId: string) => string
}

export interface PresenceClient {
  list: (entityId: string) => Promise<PresenceEntry[]>
  join: (entityId: string, user: PresenceUser, signal?: AbortSignal) => Promise<PresenceEntry | null>
  leave: (entityId: string, user: PresenceUser, signal?: AbortSignal) => Promise<void>
  subscribe: (entityId: string, onEvent: (event: RealtimeEvent) => void) => AbortController
}

export interface FieldLockUser extends PresenceUser {
  fieldPath: string
}

export interface FieldLockClientConfig {
  name: string
  fieldLockPath: (entityId: string, action?: 'acquire' | 'release') => string
  streamPath: (entityId: string) => string
}

export interface FieldLockClient {
  list: (entityId: string) => Promise<FieldLockEntry[]>
  acquire: (entityId: string, user: FieldLockUser, signal?: AbortSignal) => Promise<FieldLockEntry | null>
  release: (entityId: string, user: FieldLockUser, signal?: AbortSignal) => Promise<void>
  subscribe: (entityId: string, onEvent: (event: RealtimeEvent) => void) => AbortController
}

export function createPresenceClient(config: PresenceClientConfig): PresenceClient {
  const realtime = createRealtimeClient({
    name: `${config.name}-presence`,
    endpointPath: config.streamPath,
  })

  async function list(entityId: string): Promise<PresenceEntry[]> {
    const res = await apiClient.get<ApiEnvelope<PresenceEntry[]> | PresenceEntry[]>(
      config.presencePath(entityId),
      { headers: await collabHeaders() },
    )
    const body = res.data
    const items = Array.isArray(body)
      ? body
      : typeof body === 'object' && body !== null && 'data' in body
        ? body.data
        : []
    return Array.isArray(items) ? items : []
  }

  async function join(
    entityId: string,
    user: PresenceUser,
    signal?: AbortSignal,
  ): Promise<PresenceEntry | null> {
    const headers = await collabHeaders()
    if (signal?.aborted) return null
    const res = await apiClient.post<ApiEnvelope<PresenceEntry>>(
      config.presencePath(entityId, 'join'),
      user,
      { headers, signal },
    )
    return res.data.data
  }

  async function leave(
    entityId: string,
    user: PresenceUser,
    signal?: AbortSignal,
  ): Promise<void> {
    const headers = await collabHeaders()
    if (signal?.aborted) return
    await apiClient.post<ApiEnvelope<null>>(
      config.presencePath(entityId, 'leave'),
      user,
      { headers, signal },
    )
  }

  return {
    list,
    join,
    leave,
    subscribe: realtime.subscribe,
  }
}

export function createFieldLockClient(config: FieldLockClientConfig): FieldLockClient {
  const realtime = createRealtimeClient({
    name: `${config.name}-field-lock`,
    endpointPath: config.streamPath,
  })

  async function list(entityId: string): Promise<FieldLockEntry[]> {
    const res = await apiClient.get<ApiEnvelope<FieldLockEntry[]> | FieldLockEntry[]>(
      config.fieldLockPath(entityId),
      { headers: await collabHeaders() },
    )
    const body = res.data
    const items = Array.isArray(body)
      ? body
      : typeof body === 'object' && body !== null && 'data' in body
        ? body.data
        : []
    return Array.isArray(items) ? items : []
  }

  async function acquire(
    entityId: string,
    user: FieldLockUser,
    signal?: AbortSignal,
  ): Promise<FieldLockEntry | null> {
    const headers = await collabHeaders()
    if (signal?.aborted) return null
    const res = await apiClient.post<ApiEnvelope<FieldLockEntry>>(
      config.fieldLockPath(entityId, 'acquire'),
      user,
      { headers, signal },
    )
    return res.data.data
  }

  async function release(
    entityId: string,
    user: FieldLockUser,
    signal?: AbortSignal,
  ): Promise<void> {
    const headers = await collabHeaders()
    if (signal?.aborted) return
    await apiClient.post<ApiEnvelope<null>>(
      config.fieldLockPath(entityId, 'release'),
      user,
      { headers, signal },
    )
  }

  return {
    list,
    acquire,
    release,
    subscribe: realtime.subscribe,
  }
}

export const SlipPresenceClient = createPresenceClient({
  name: 'slip',
  presencePath: (slipId, action) => {
    const base = `/api/v1/slips/${encodeURIComponent(slipId)}/collab/presence`
    return action ? `${base}/${action}` : base
  },
  streamPath: (slipId) =>
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/stream`,
})

export const SlipFieldLockClient = createFieldLockClient({
  name: 'slip',
  fieldLockPath: (slipId, action) => {
    const base = `/api/v1/slips/${encodeURIComponent(slipId)}/collab/field-locks`
    return action ? `${base}/${action}` : base
  },
  streamPath: (slipId) =>
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/stream`,
})

export const JournalPresenceClient = createPresenceClient({
  name: 'journal',
  presencePath: (journalId, action) => {
    const base = `/accounting/journals/${encodeURIComponent(journalId)}/collab/presence`
    return action ? `${base}/${action}` : base
  },
  streamPath: (journalId) =>
    `/accounting/journals/${encodeURIComponent(journalId)}/collab/stream`,
})

export const PartnerOrderPresenceClient = createPresenceClient({
  name: 'partner-order',
  presencePath: (orderId, action) => {
    const base = `/api/v1/partner-orders/${encodeURIComponent(orderId)}/collab/presence`
    return action ? `${base}/${action}` : base
  },
  streamPath: (orderId) =>
    `/api/v1/partner-orders/${encodeURIComponent(orderId)}/collab/stream`,
})

export const EstimatePresenceClient = createPresenceClient({
  name: 'estimate',
  presencePath: (estimateId, action) => {
    const base = `/slips/estimates/${encodeURIComponent(estimateId)}/collab/presence`
    return action ? `${base}/${action}` : base
  },
  streamPath: (estimateId) =>
    `/slips/estimates/${encodeURIComponent(estimateId)}/collab/stream`,
})

export const GroupwareApprovalPresenceClient = createPresenceClient({
  name: 'groupware-approval',
  presencePath: (approvalId, action) => {
    const base = `/admin/groupware/approvals/${encodeURIComponent(approvalId)}/collab/presence`
    return action ? `${base}/${action}` : base
  },
  streamPath: (approvalId) =>
    `/admin/groupware/approvals/${encodeURIComponent(approvalId)}/collab/stream`,
})

export const DispatchPresenceClient = createPresenceClient({
  name: 'dispatch',
  presencePath: (taskId, action) => {
    const base = `/admin/dispatch-tasks/${encodeURIComponent(taskId)}/collab/presence`
    return action ? `${base}/${action}` : base
  },
  streamPath: (taskId) =>
    `/admin/dispatch-tasks/${encodeURIComponent(taskId)}/collab/stream`,
})
