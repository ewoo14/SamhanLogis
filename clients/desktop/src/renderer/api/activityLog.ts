import { apiClient, type ApiEnvelope } from './client'

export type ActivityLogAction = 'MENU_ACCESS' | 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'LOGIN' | string

export interface ActivityLogItem {
  occurredAt: string
  user: string
  userRole: string
  action: ActivityLogAction
  resourceType: string
  resourceId: string
  description: string
  serviceName: string
}

export interface ActivityLogPage {
  items: ActivityLogItem[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface ActivityLogQuery {
  action?: string
  resourceType?: string
  resourceId?: string
  userId?: string
  q?: string
  fromInstant?: string
  toInstant?: string
  page?: number
  size?: number
}

export interface MenuAccessPayload {
  resourceId: string
  userId?: string
  userRole?: string
  description?: string
  occurredAt?: string
}

function compactParams(query: ActivityLogQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    params[key] = typeof value === 'string' ? value.trim() : value
  }
  return params
}

export async function fetchActivityLogs(query: ActivityLogQuery): Promise<ActivityLogPage> {
  const res = await apiClient.get<ApiEnvelope<ActivityLogPage>>('/logs/activity', {
    params: compactParams(query),
  })
  return res.data.data
}

export async function recordMenuAccess(payload: MenuAccessPayload): Promise<void> {
  await apiClient.post<ApiEnvelope<null>>('/logs/front', {
    action: 'MENU_ACCESS',
    resourceType: 'MENU',
    resourceId: payload.resourceId,
    userId: payload.userId,
    userRole: payload.userRole,
    description: payload.description,
    occurredAt: payload.occurredAt,
  })
}
