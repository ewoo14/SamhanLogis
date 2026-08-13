/**
 * 그룹웨어 결재 API client.
 *
 * UUID 비공개: approvalId/requesterId/approverId 는 path/API 연동 전용이다. 화면에는
 * approvalNo, title, status, 결재 단계 순번만 표시한다.
 */
import { apiClient, type ApiEnvelope } from './client'
import { STEP_TYPE_LABEL } from './approvalLineConfigApi'
import type { ApprovalAttachmentReferenceInput } from './groupwareApprovalAttachment'

export type ApprovalStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'

export type ApprovalStepStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type ApprovalStepType = 'GROUP' | 'USER'

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: '대기',
  IN_PROGRESS: '진행중',
  APPROVED: '승인',
  REJECTED: '반려',
  WITHDRAWN: '회수',
}

export const APPROVAL_STEP_STATUS_LABEL: Record<ApprovalStepStatus, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
}

export interface ApprovalStepView {
  sequence: number
  stepType: ApprovalStepType
  approverGroupId: string | null
  approverId: string | null
  approverName: string | null
  status: ApprovalStepStatus
  decidedAt: string | null
  reason: string | null
}

export interface ApprovalLineAdminResponse {
  approvalId: string
  approvalNo: string
  requesterId: string
  requesterName: string | null
  title: string
  content: string | null
  templateId: string | null
  templateName: string | null
  documentType: string | null
  documentTemplateId?: string | null
  documentTemplateRevision?: number | null
  // R3 mock parity fix: BE documentTemplateDefaultPinned는 primitive boolean이라 항상
  // 직렬화된다(never absent) — optional로 두면 mock 픽스처가 키 자체를 누락해도
  // 타입체크를 통과해 DTO 스큐가 컴파일 타임에 잡히지 않는다([[feedback_mock_value_format_be_parity]]).
  documentTemplateDefaultPinned: boolean
  fieldValues: Record<string, string>
  status: ApprovalStatus
  steps: ApprovalStepView[]
}

export interface ListGroupwareApprovalsOptions {
  status?: ApprovalStatus
  requesterId?: string
}

export interface CreateGroupwareApprovalInput {
  requesterId: string
  title: string
  content?: string | null
  approverIds: string[]
  templateId?: string | null
  fieldValues?: Record<string, string>
  references?: ApprovalAttachmentReferenceInput[]
}

export interface GroupwareApprovalDecisionInput {
  approverId: string
  reason?: string | null
}

export function resolveApprovalStepDisplayName(
  step: ApprovalStepView,
  groupNameById: ReadonlyMap<string, string>,
): string {
  if (step.stepType === 'GROUP') {
    if (!step.approverGroupId) return STEP_TYPE_LABEL.GROUP
    return groupNameById.get(step.approverGroupId) ?? STEP_TYPE_LABEL.GROUP
  }
  const name = step.approverName?.trim()
  if (name) return name
  return STEP_TYPE_LABEL[step.stepType]
}

export function resolveApprovalStepTypeLabel(
  step: ApprovalStepView,
  requesterId: string,
): string {
  if (step.sequence === 0 && step.stepType === 'USER' && step.approverId === requesterId) {
    return '작성자'
  }
  return STEP_TYPE_LABEL[step.stepType]
}

export async function listGroupwareApprovals(
  options: ListGroupwareApprovalsOptions = {},
): Promise<ApprovalLineAdminResponse[]> {
  const params: Record<string, string> = {}
  if (options.status) params['status'] = options.status
  if (options.requesterId) params['requesterId'] = options.requesterId
  const res = await apiClient.get<ApiEnvelope<ApprovalLineAdminResponse[]>>(
    '/admin/groupware/approvals',
    { params },
  )
  return res.data.data
}

export async function getGroupwareApproval(
  approvalId: string,
): Promise<ApprovalLineAdminResponse> {
  const res = await apiClient.get<ApiEnvelope<ApprovalLineAdminResponse>>(
    `/admin/groupware/approvals/${encodeURIComponent(approvalId)}`,
  )
  return res.data.data
}

export async function createGroupwareApproval(
  input: CreateGroupwareApprovalInput,
): Promise<ApprovalLineAdminResponse> {
  const res = await apiClient.post<ApiEnvelope<ApprovalLineAdminResponse>>(
    '/admin/groupware/approvals',
    input,
  )
  return res.data.data
}

export async function approveGroupwareApproval(
  approvalId: string,
  input: GroupwareApprovalDecisionInput,
): Promise<ApprovalLineAdminResponse> {
  const res = await apiClient.put<ApiEnvelope<ApprovalLineAdminResponse>>(
    `/admin/groupware/approvals/${encodeURIComponent(approvalId)}/approve`,
    input,
  )
  return res.data.data
}

export async function rejectGroupwareApproval(
  approvalId: string,
  input: GroupwareApprovalDecisionInput,
): Promise<ApprovalLineAdminResponse> {
  const res = await apiClient.put<ApiEnvelope<ApprovalLineAdminResponse>>(
    `/admin/groupware/approvals/${encodeURIComponent(approvalId)}/reject`,
    input,
  )
  return res.data.data
}
