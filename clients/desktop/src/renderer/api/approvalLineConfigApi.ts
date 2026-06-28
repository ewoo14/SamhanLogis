import { apiClient, type ApiEnvelope } from './client'

export type StepType = 'CREATOR' | 'GROUP' | 'USER'

/**
 * StepType 한국어 라벨 단일 소스.
 * ApprovalLineConfigPage / GroupwareApprovalCreatePage 에서 import 해 로컬 중복 제거.
 */
export const STEP_TYPE_LABEL: Record<StepType, string> = {
  CREATOR: '작성자',
  USER: '직접지정',
  GROUP: '권한그룹',
}

export interface ApprovalLineRole {
  id: string
  sequence: number
  label: string
  stepType: StepType
  approvers: ApprovalLineApprover[]
  required: boolean
  enforced: boolean
  seedManaged: boolean
}

export interface ApprovalLineStructure {
  sequence: number
  label: string
  stepType: StepType
  actionKey: string | null
}

export interface ApprovalLineDefaultApprover {
  sequence: number
  label: string
  userId: string
  displayName: string
}

export interface ApprovalLineGroupOption {
  id: string
  name: string
}

export interface ApprovalLineApprover {
  id: string
  type: 'GROUP' | 'USER'
  refId: string
  displayName: string
}

export interface ApprovalLineUserOption {
  id: string
  displayName: string
}

export type ConfigurableDocType = {
  value: string
  label: string
  kind: 'SLIP' | 'GROUPWARE'
}

interface ActiveApprovalTemplateDto {
  code: string
  name: string
  active?: boolean
  displayOrder?: number
}

/** 결재라인 설정 대상 전표 종류. */
export const DOC_TYPES: { value: string; label: string }[] = [
  { value: 'SLIP_OUTBOUND', label: '판매전표' },
  { value: 'SLIP_INBOUND', label: '입고전표' },
  { value: 'PARTNER_ORDER', label: '주문' },
]

const SLIP_CONFIGURABLE_DOC_TYPES: ConfigurableDocType[] = DOC_TYPES.map((type) => ({
  ...type,
  kind: 'SLIP',
}))

export async function fetchConfigurableDocTypes(): Promise<ConfigurableDocType[]> {
  try {
    const res = await apiClient.get<ApiEnvelope<ActiveApprovalTemplateDto[]>>(
      '/groupware/approval-templates/active',
    )
    const groupwareDocTypes = (res.data.data ?? [])
      .filter((template) => template.active !== false)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((template) => ({
        value: `GROUPWARE_${template.code}`,
        label: template.name,
        kind: 'GROUPWARE' as const,
      }))
    return [...SLIP_CONFIGURABLE_DOC_TYPES, ...groupwareDocTypes]
  } catch {
    return [...SLIP_CONFIGURABLE_DOC_TYPES]
  }
}

export async function fetchApprovalLineRoles(documentType: string): Promise<ApprovalLineRole[]> {
  const res = await apiClient.get<ApiEnvelope<ApprovalLineRole[]>>(
    `/auth/admin/approval-line-configs?documentType=${encodeURIComponent(documentType)}`,
  )
  return res.data.data ?? []
}

export async function fetchApprovalLineStructure(documentType: string): Promise<ApprovalLineStructure[]> {
  const res = await apiClient.get<ApiEnvelope<ApprovalLineStructure[]>>(
    `/auth/approval-line-configs/${encodeURIComponent(documentType)}/structure`,
  )
  return res.data.data ?? []
}

export async function fetchDefaultApprovers(documentType: string): Promise<ApprovalLineDefaultApprover[]> {
  try {
    const res = await apiClient.get<ApiEnvelope<ApprovalLineDefaultApprover[]>>(
      `/auth/approval-line-configs/${encodeURIComponent(documentType)}/default-approvers`,
    )
    return res.data.data ?? []
  } catch {
    return []
  }
}

export async function fetchApprovalLineGroups(): Promise<ApprovalLineGroupOption[]> {
  try {
    const res = await apiClient.get<ApiEnvelope<ApprovalLineGroupOption[]>>(
      '/auth/admin/approval-line-configs/groups',
    )
    return res.data.data ?? []
  } catch {
    const res = await apiClient.get<ApiEnvelope<ApprovalLineGroupOption[]>>(
      '/auth/admin/permission-groups',
    )
    return (res.data.data ?? []).map((group) => ({ id: group.id, name: group.name }))
  }
}

export async function updateApprovalLineRole(
  id: string,
  payload: { required: boolean },
): Promise<ApprovalLineRole> {
  const res = await apiClient.put<ApiEnvelope<ApprovalLineRole>>(
    `/auth/admin/approval-line-configs/${encodeURIComponent(id)}`,
    payload,
  )
  return res.data.data
}

export async function addApprovalLineStep(
  documentType: string,
  label: string,
): Promise<ApprovalLineRole> {
  const res = await apiClient.post<ApiEnvelope<ApprovalLineRole>>(
    '/auth/admin/approval-line-configs',
    { documentType, label },
  )
  return res.data.data
}

export async function deleteApprovalLineStep(id: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<null>>(
    `/auth/admin/approval-line-configs/${encodeURIComponent(id)}`,
  )
}

export async function searchApprovalLineUsers(q: string, limit = 20): Promise<ApprovalLineUserOption[]> {
  const res = await apiClient.get<ApiEnvelope<ApprovalLineUserOption[]>>(
    `/auth/admin/approval-line-configs/users?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`,
  )
  return res.data.data ?? []
}

export async function addApprovalLineApprover(
  roleId: string,
  type: 'GROUP' | 'USER',
  refId: string,
): Promise<ApprovalLineRole> {
  const res = await apiClient.post<ApiEnvelope<ApprovalLineRole>>(
    `/auth/admin/approval-line-configs/${encodeURIComponent(roleId)}/approvers`,
    { type, refId },
  )
  return res.data.data
}

export async function removeApprovalLineApprover(
  roleId: string,
  approverId: string,
): Promise<ApprovalLineRole> {
  const res = await apiClient.delete<ApiEnvelope<ApprovalLineRole>>(
    `/auth/admin/approval-line-configs/${encodeURIComponent(roleId)}/approvers/${encodeURIComponent(approverId)}`,
  )
  return res.data.data
}

/**
 * 결재라인 역할 라벨 인라인 편집 — PUT /auth/admin/approval-line-configs/{id}/label.
 * CREATOR 역할은 BE 에서 거부(400). blank 입력은 FE 에서 사전 차단.
 */
export async function renameApprovalLineRole(
  id: string,
  label: string,
): Promise<ApprovalLineRole> {
  const res = await apiClient.put<ApiEnvelope<ApprovalLineRole>>(
    `/auth/admin/approval-line-configs/${encodeURIComponent(id)}/label`,
    { label },
  )
  return res.data.data
}

/**
 * 결재라인 역할 순서 변경 — PUT /auth/admin/approval-line-configs/reorder?documentType=.
 * orderedIds[0] 는 CREATOR 강제(BE 검증). 비-CREATOR 행만 재배치 대상.
 */
export async function reorderApprovalLineRoles(
  documentType: string,
  orderedIds: string[],
): Promise<ApprovalLineRole[]> {
  const res = await apiClient.put<ApiEnvelope<ApprovalLineRole[]>>(
    `/auth/admin/approval-line-configs/reorder?documentType=${encodeURIComponent(documentType)}`,
    { orderedIds },
  )
  return res.data.data ?? []
}
