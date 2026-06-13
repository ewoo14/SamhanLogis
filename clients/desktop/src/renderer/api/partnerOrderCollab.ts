/**
 * 주문 협업 API client — PARTNER_ORDER collab rollout.
 *
 * UUID 비공개: id/parentId 는 React key 와 API path 에만 사용한다. 화면에는 authorName,
 * proposerName, decidedByName, body, 사유, 시각, orderNumber/lineKey 라벨만 노출한다.
 */
import { apiClient, type ApiEnvelope } from './client'
import { normalizePartnerOrderDetail, type PartnerOrderDetail } from './sales'

export interface PartnerOrderCollabComment {
  id: string
  anchor: string | null
  authorName: string
  body: string
  parentId: string | null
  status: 'OPEN' | 'RESOLVED'
  createdAt: string
}

export interface AddPartnerOrderCollabCommentInput {
  body: string
  parentId?: string
  anchor?: string
}

export type PartnerOrderCollabEditStatus = 'ACCEPTED'

export interface PartnerOrderCollabEdit {
  id: string
  changeSet: string
  reason: string | null
  proposerName: string
  status: PartnerOrderCollabEditStatus
  decidedByName: string | null
  decidedAt: string | null
  createdAt: string
}

export interface CommitPartnerOrderCollabEditInput {
  changeSet: string
  reason?: string
}

export interface CommitPartnerOrderCollabEditResponse {
  edit: PartnerOrderCollabEdit
  order: PartnerOrderDetail
}

export type PartnerOrderCollabCommitInput = CommitPartnerOrderCollabEditInput
export type PartnerOrderCollabCommitResponse = CommitPartnerOrderCollabEditResponse

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

function collabPath(orderId: string, suffix: string): string {
  return `/api/v1/partner-orders/${encodeURIComponent(orderId)}/collab/${suffix}`
}

export async function getPartnerOrderCollabComments(
  orderId: string,
  limit = 20,
): Promise<PartnerOrderCollabComment[]> {
  const res = await apiClient.get<ApiEnvelope<PartnerOrderCollabComment[]>>(
    collabPath(orderId, 'comments'),
    { params: { limit }, headers: await collabHeaders() },
  )
  return res.data.data
}

export async function addPartnerOrderCollabComment(
  orderId: string,
  input: AddPartnerOrderCollabCommentInput,
): Promise<PartnerOrderCollabComment> {
  const res = await apiClient.post<ApiEnvelope<PartnerOrderCollabComment>>(
    collabPath(orderId, 'comments'),
    input,
    { headers: await collabHeaders() },
  )
  return res.data.data
}

export async function deletePartnerOrderCollabComment(
  orderId: string,
  commentId: string,
): Promise<void> {
  await apiClient.delete(
    collabPath(orderId, `comments/${encodeURIComponent(commentId)}`),
    { headers: await collabHeaders() },
  )
}

export async function resolvePartnerOrderCollabComment(
  orderId: string,
  commentId: string,
): Promise<PartnerOrderCollabComment> {
  const res = await apiClient.post<ApiEnvelope<PartnerOrderCollabComment>>(
    collabPath(orderId, `comments/${encodeURIComponent(commentId)}/resolve`),
    undefined,
    { headers: await collabHeaders() },
  )
  return res.data.data
}

export async function getPartnerOrderCollabEdits(
  orderId: string,
): Promise<PartnerOrderCollabEdit[]> {
  const res = await apiClient.get<ApiEnvelope<PartnerOrderCollabEdit[]>>(
    collabPath(orderId, 'edits'),
    { headers: await collabHeaders() },
  )
  return res.data.data
}

export async function commitPartnerOrderCollabEdit(
  orderId: string,
  input: CommitPartnerOrderCollabEditInput,
): Promise<CommitPartnerOrderCollabEditResponse> {
  const res = await apiClient.post<ApiEnvelope<CommitPartnerOrderCollabEditResponse>>(
    collabPath(orderId, 'edits'),
    input,
    { headers: await collabHeaders() },
  )
  return {
    ...res.data.data,
    order: normalizePartnerOrderDetail(res.data.data.order),
  }
}
