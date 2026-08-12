/**
 * 견적 협업 API client — ESTIMATE collab rollout.
 *
 * UUID 비공개: id/parentId 는 React key 와 API path 에만 사용한다. 화면에는 authorName,
 * proposerName, decidedByName, body, 사유, 시각, estimateNo/lineKey 라벨만 노출한다.
 */
import { apiClient, type ApiEnvelope } from './client'
import type { EstimateDetail } from './estimateApi'
import { collabHeaders } from '../auth/collabHeaders'
import { toOrderPathId } from '../utils/orderNo'

export interface EstimateCollabComment {
  id: string
  anchor: string | null
  authorName: string
  body: string
  parentId: string | null
  status: 'OPEN' | 'RESOLVED'
  createdAt: string
}

export interface AddEstimateCollabCommentInput {
  body: string
  parentId?: string
  anchor?: string
}

export type EstimateCollabEditStatus = 'ACCEPTED'

export interface EstimateCollabEdit {
  id: string
  changeSet: string
  reason: string | null
  proposerName: string
  status: EstimateCollabEditStatus
  decidedByName: string | null
  decidedAt: string | null
  createdAt: string
}

export interface CommitEstimateCollabEditInput {
  changeSet: string
  reason?: string
}

export interface CommitEstimateCollabEditResponse {
  edit: EstimateCollabEdit
  estimate: EstimateDetail
}

function collabPath(estimateId: string, suffix: string): string {
  return `/api/v1/slips/estimates/${encodeURIComponent(toOrderPathId(estimateId))}/collab/${suffix}`
}

export async function getEstimateCollabComments(
  estimateId: string,
  limit = 20,
): Promise<EstimateCollabComment[]> {
  const res = await apiClient.get<ApiEnvelope<EstimateCollabComment[]>>(
    collabPath(estimateId, 'comments'),
    { params: { limit }, headers: await collabHeaders() },
  )
  return res.data.data
}

export async function addEstimateCollabComment(
  estimateId: string,
  input: AddEstimateCollabCommentInput,
): Promise<EstimateCollabComment> {
  const res = await apiClient.post<ApiEnvelope<EstimateCollabComment>>(
    collabPath(estimateId, 'comments'),
    input,
    { headers: await collabHeaders() },
  )
  return res.data.data
}

export async function deleteEstimateCollabComment(
  estimateId: string,
  commentId: string,
): Promise<void> {
  await apiClient.delete(
    collabPath(estimateId, `comments/${encodeURIComponent(commentId)}`),
    { headers: await collabHeaders() },
  )
}

export async function resolveEstimateCollabComment(
  estimateId: string,
  commentId: string,
): Promise<EstimateCollabComment> {
  const res = await apiClient.post<ApiEnvelope<EstimateCollabComment>>(
    collabPath(estimateId, `comments/${encodeURIComponent(commentId)}/resolve`),
    undefined,
    { headers: await collabHeaders() },
  )
  return res.data.data
}

export async function getEstimateCollabEdits(
  estimateId: string,
): Promise<EstimateCollabEdit[]> {
  const res = await apiClient.get<ApiEnvelope<EstimateCollabEdit[]>>(
    collabPath(estimateId, 'edits'),
    { headers: await collabHeaders() },
  )
  return res.data.data
}

export async function commitEstimateCollabEdit(
  estimateId: string,
  input: CommitEstimateCollabEditInput,
): Promise<CommitEstimateCollabEditResponse> {
  const res = await apiClient.post<ApiEnvelope<CommitEstimateCollabEditResponse>>(
    collabPath(estimateId, 'edits'),
    input,
    { headers: await collabHeaders() },
  )
  return res.data.data
}
