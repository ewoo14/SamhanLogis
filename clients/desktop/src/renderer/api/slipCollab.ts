/**
 * 전표 협업 API client — collab-core slip rollout.
 *
 * UUID 비공개: id/parentId 는 React key 와 API path 에만 사용한다. 화면에는 authorName,
 * proposerName, decidedByName, body, 사유, 시각만 노출한다.
 */
import { apiClient, type ApiEnvelope } from './client'
import type { SlipDetail } from './slip'
import { makeCoeditApi } from '../realtime/coeditApi'

export interface SlipCollabComment {
  id: string
  anchor: string | null
  authorName: string
  body: string
  parentId: string | null
  status: 'OPEN' | 'RESOLVED'
  createdAt: string
}

export interface AddSlipCollabCommentInput {
  body: string
  parentId?: string
  anchor?: string
}

export type SlipCollabEditStatus = 'ACCEPTED'

export interface SlipCollabEdit {
  id: string
  changeSet: string
  reason: string | null
  proposerName: string
  status: SlipCollabEditStatus
  decidedByName: string | null
  decidedAt: string | null
  createdAt: string
}

export interface CommitSlipCollabEditInput {
  changeSet: string
  reason?: string
}

export interface CommitSlipCollabEditResponse {
  edit: SlipCollabEdit
  slip: SlipDetail
}

export interface SlipCoeditUpdatesResponse {
  updates: string[]
}

export async function getSlipCollabComments(
  slipId: string,
  limit = 20,
): Promise<SlipCollabComment[]> {
  const res = await apiClient.get<ApiEnvelope<SlipCollabComment[]>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/comments`,
    { params: { limit } },
  )
  return res.data.data
}

export async function addSlipCollabComment(
  slipId: string,
  input: AddSlipCollabCommentInput,
): Promise<SlipCollabComment> {
  const res = await apiClient.post<ApiEnvelope<SlipCollabComment>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/comments`,
    input,
  )
  return res.data.data
}

export async function deleteSlipCollabComment(
  slipId: string,
  commentId: string,
): Promise<void> {
  await apiClient.delete(
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/comments/${encodeURIComponent(commentId)}`,
  )
}

export async function resolveSlipCollabComment(
  slipId: string,
  commentId: string,
): Promise<SlipCollabComment> {
  const res = await apiClient.post<ApiEnvelope<SlipCollabComment>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/comments/${encodeURIComponent(commentId)}/resolve`,
  )
  return res.data.data
}

export async function getSlipCollabEdits(
  slipId: string,
): Promise<SlipCollabEdit[]> {
  const res = await apiClient.get<ApiEnvelope<SlipCollabEdit[]>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/edits`,
  )
  return res.data.data
}

export async function commitSlipCollabEdit(
  slipId: string,
  input: CommitSlipCollabEditInput,
): Promise<CommitSlipCollabEditResponse> {
  const res = await apiClient.post<ApiEnvelope<CommitSlipCollabEditResponse>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/edits`,
    input,
  )
  return res.data.data
}

export async function getSlipCoeditUpdates(
  slipId: string,
): Promise<SlipCoeditUpdatesResponse> {
  return { updates: await makeCoeditApi(`/slips/${encodeURIComponent(slipId)}`).getUpdates() }
}

export async function postSlipCoeditUpdate(
  slipId: string,
  update: string,
): Promise<void> {
  await makeCoeditApi(`/slips/${encodeURIComponent(slipId)}`).postUpdate(update)
}

export async function postSlipCoeditAwareness(
  slipId: string,
  awareness: string,
): Promise<void> {
  await makeCoeditApi(`/slips/${encodeURIComponent(slipId)}`).postAwareness(awareness)
}
