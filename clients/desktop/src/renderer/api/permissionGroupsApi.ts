import { apiClient, type ApiEnvelope } from './client'
import {
  type AccountPermissionMatrix,
  type AccountPermissionUpdate,
  type ChangedCountResponse,
  type PageCode,
  type PermissionActionMatrix,
} from './permissionsApi'

export interface PermissionGroupSummary {
  id: string
  name: string
  description: string | null
  isBuiltin: boolean
  isSystemMaster: boolean
  assignedAccountCount: number
}

export interface AccountGroupSummary {
  accountId: string
  accountDisplayName: string
  groupId: string
  groupName: string
  groupDescription: string | null
  groupBuiltin: boolean
  groupSystemMaster: boolean
}

interface RawPermissionGroupSummary {
  id: string
  name: string
  description?: string | null
  builtin?: boolean
  systemMaster?: boolean
  isBuiltin?: boolean
  isSystemMaster?: boolean
  assignedAccountCount?: number
}

function normalizeGroup(raw: RawPermissionGroupSummary): PermissionGroupSummary {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? null,
    isBuiltin: raw.isBuiltin ?? raw.builtin ?? false,
    isSystemMaster: raw.isSystemMaster ?? raw.systemMaster ?? false,
    assignedAccountCount: raw.assignedAccountCount ?? 0,
  }
}

function actionMatrixFromRaw(raw: Partial<PermissionActionMatrix> | undefined): PermissionActionMatrix {
  return {
    view: raw?.view ?? false,
    create: raw?.create ?? false,
    update: raw?.update ?? false,
    delete: raw?.delete ?? false,
    restore: raw?.restore ?? false,
    download: raw?.download ?? false,
    print: raw?.print ?? false,
  }
}

function toGroupPermissionRow(row: AccountPermissionUpdate) {
  return {
    pageCode: row.pageCode,
    actions: {
      view: row.actions.view,
      create: row.actions.create,
      update: row.actions.update,
      delete: row.actions.delete,
      restore: row.actions.restore,
      download: row.actions.download,
      print: row.actions.print,
    },
  }
}

export async function fetchPermissionGroups(): Promise<PermissionGroupSummary[]> {
  const res = await apiClient.get<ApiEnvelope<RawPermissionGroupSummary[]>>(
    '/auth/admin/permission-groups',
  )
  return (res.data.data ?? []).map(normalizeGroup)
}

export async function createPermissionGroup(payload: {
  name: string
  description?: string | null
}): Promise<PermissionGroupSummary> {
  const res = await apiClient.post<ApiEnvelope<RawPermissionGroupSummary>>(
    '/auth/admin/permission-groups',
    payload,
  )
  return normalizeGroup(res.data.data)
}

export async function updatePermissionGroup(
  groupId: string,
  payload: { name: string; description?: string | null },
): Promise<PermissionGroupSummary> {
  const res = await apiClient.put<ApiEnvelope<RawPermissionGroupSummary>>(
    `/auth/admin/permission-groups/${encodeURIComponent(groupId)}`,
    payload,
  )
  return normalizeGroup(res.data.data)
}

export async function deletePermissionGroup(groupId: string): Promise<void> {
  await apiClient.delete(`/auth/admin/permission-groups/${encodeURIComponent(groupId)}`)
}

export async function fetchPermissionGroupMatrix(groupId: string): Promise<AccountPermissionMatrix> {
  const res = await apiClient.get<ApiEnvelope<Record<string, PermissionActionMatrix>>>(
    `/auth/admin/permission-groups/${encodeURIComponent(groupId)}/permissions`,
  )
  const cells = Object.entries(res.data.data ?? {}).map(([pageCode, actions]) => ({
    pageCode: pageCode as PageCode,
    ...actionMatrixFromRaw(actions),
  }))
  return { cells, generatedAt: new Date().toISOString() }
}

export async function updatePermissionGroupMatrix(
  groupId: string,
  updates: AccountPermissionUpdate[],
): Promise<ChangedCountResponse> {
  const res = await apiClient.put<ApiEnvelope<ChangedCountResponse>>(
    `/auth/admin/permission-groups/${encodeURIComponent(groupId)}/permissions`,
    { rows: updates.map(toGroupPermissionRow) },
  )
  return res.data.data
}

export async function fetchAccountGroups(accountId: string): Promise<AccountGroupSummary[]> {
  const res = await apiClient.get<ApiEnvelope<AccountGroupSummary[]>>(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/groups`,
  )
  return res.data.data ?? []
}

export async function assignAccountGroup(
  accountId: string,
  groupId: string,
): Promise<AccountGroupSummary> {
  const res = await apiClient.post<ApiEnvelope<AccountGroupSummary>>(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/groups`,
    { groupId },
  )
  return res.data.data
}

export async function unassignAccountGroup(
  accountId: string,
  groupId: string,
): Promise<void> {
  await apiClient.delete(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/groups/${encodeURIComponent(groupId)}`,
  )
}

export function emptyGroupPermissionMatrix(): PermissionActionMatrix {
  return {
    view: false,
    create: false,
    update: false,
    delete: false,
    restore: false,
    download: false,
    print: false,
  }
}
