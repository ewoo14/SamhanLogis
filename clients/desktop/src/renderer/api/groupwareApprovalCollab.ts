/**
 * 그룹웨어 결재 협업 API client.
 *
 * UUID 비공개: id/parentId 는 React key 와 API path 에만 사용한다. 화면에는 작성자명,
 * 코멘트, 수정 사유, 변경 diff, 결재문서번호만 표시한다.
 */
import { apiClient, type ApiEnvelope } from './client'
import type { ApprovalLineAdminResponse } from './groupwareApproval'

export interface GroupwareApprovalCollabComment {
  id: string
  anchor: string | null
  authorName: string
  body: string
  parentId: string | null
  status: 'OPEN' | 'RESOLVED'
  createdAt: string
}

export interface AddGroupwareApprovalCollabCommentInput {
  body: string
  parentId?: string
  anchor?: string
}

export type GroupwareApprovalCollabEditStatus = 'ACCEPTED'

export interface GroupwareApprovalCollabEdit {
  id: string
  changeSet: string
  reason: string | null
  proposerName: string
  status: GroupwareApprovalCollabEditStatus
  decidedByName: string | null
  decidedAt: string | null
  createdAt: string
}

export interface CommitGroupwareApprovalCollabEditInput {
  changeSet: string
  reason?: string
}

export interface CommitGroupwareApprovalCollabEditResponse {
  edit: GroupwareApprovalCollabEdit
  approval: ApprovalLineAdminResponse
}

async function collabHeaders(): Promise<Record<string, string>> {
  try {
    const auth = await window.samhanAuth.getToken()
    const headers: Record<string, string> = {}
    if (auth?.userId) headers['X-User-Id'] = auth.userId
    if (auth?.fullName) headers['X-User-Name'] = auth.fullName
    return headers
  } catch {
    return {}
  }
}

function collabPath(approvalId: string, suffix: string): string {
  return `/admin/groupware/approvals/${encodeURIComponent(approvalId)}/collab/${suffix}`
}

export async function getGroupwareApprovalCollabComments(
  approvalId: string,
  limit = 20,
): Promise<GroupwareApprovalCollabComment[]> {
  const res = await apiClient.get<ApiEnvelope<GroupwareApprovalCollabComment[]>>(
    collabPath(approvalId, 'comments'),
    { params: { limit }, headers: await collabHeaders() },
  )
  return res.data.data
}

export async function addGroupwareApprovalCollabComment(
  approvalId: string,
  input: AddGroupwareApprovalCollabCommentInput,
): Promise<GroupwareApprovalCollabComment> {
  const res = await apiClient.post<ApiEnvelope<GroupwareApprovalCollabComment>>(
    collabPath(approvalId, 'comments'),
    input,
    { headers: await collabHeaders() },
  )
  return res.data.data
}

export async function deleteGroupwareApprovalCollabComment(
  approvalId: string,
  commentId: string,
): Promise<void> {
  await apiClient.delete(
    collabPath(approvalId, `comments/${encodeURIComponent(commentId)}`),
    { headers: await collabHeaders() },
  )
}

export async function resolveGroupwareApprovalCollabComment(
  approvalId: string,
  commentId: string,
): Promise<GroupwareApprovalCollabComment> {
  const res = await apiClient.post<ApiEnvelope<GroupwareApprovalCollabComment>>(
    collabPath(approvalId, `comments/${encodeURIComponent(commentId)}/resolve`),
    undefined,
    { headers: await collabHeaders() },
  )
  return res.data.data
}

export async function getGroupwareApprovalCollabEdits(
  approvalId: string,
): Promise<GroupwareApprovalCollabEdit[]> {
  const res = await apiClient.get<ApiEnvelope<GroupwareApprovalCollabEdit[]>>(
    collabPath(approvalId, 'edits'),
    { headers: await collabHeaders() },
  )
  return res.data.data
}

export async function commitGroupwareApprovalCollabEdit(
  approvalId: string,
  input: CommitGroupwareApprovalCollabEditInput,
): Promise<CommitGroupwareApprovalCollabEditResponse> {
  const res = await apiClient.post<ApiEnvelope<CommitGroupwareApprovalCollabEditResponse>>(
    collabPath(approvalId, 'edits'),
    input,
    { headers: await collabHeaders() },
  )
  return res.data.data
}
