/**
 * 전표 협업 API client — collab-core slip rollout.
 *
 * UUID 비공개: id/parentId 는 React key 와 API path 에만 사용한다. 화면에는 authorName,
 * proposerName, decidedByName, body, 사유, 시각만 노출한다.
 */
import { apiClient, type ApiEnvelope } from './client'

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

export type SlipCollabSuggestionStatus =
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'

export interface SlipCollabSuggestion {
  id: string
  changeSet: string
  reason: string | null
  proposerName: string
  status: SlipCollabSuggestionStatus
  decidedByName: string | null
  decidedAt: string | null
  createdAt: string
}

export interface ProposeSlipCollabSuggestionInput {
  changeSet: string
  reason?: string
}

export async function getSlipCollabComments(
  slipId: string,
): Promise<SlipCollabComment[]> {
  const res = await apiClient.get<ApiEnvelope<SlipCollabComment[]>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/comments`,
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

export async function getSlipCollabSuggestions(
  slipId: string,
): Promise<SlipCollabSuggestion[]> {
  const res = await apiClient.get<ApiEnvelope<SlipCollabSuggestion[]>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/suggestions`,
  )
  return res.data.data
}

export async function proposeSlipCollabSuggestion(
  slipId: string,
  input: ProposeSlipCollabSuggestionInput,
): Promise<SlipCollabSuggestion> {
  const res = await apiClient.post<ApiEnvelope<SlipCollabSuggestion>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/suggestions`,
    input,
  )
  return res.data.data
}

export async function acceptSlipCollabSuggestion(
  slipId: string,
  suggestionId: string,
): Promise<SlipCollabSuggestion> {
  const res = await apiClient.post<ApiEnvelope<SlipCollabSuggestion>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/suggestions/${encodeURIComponent(suggestionId)}/accept`,
  )
  return res.data.data
}

export async function rejectSlipCollabSuggestion(
  slipId: string,
  suggestionId: string,
  reason?: string,
): Promise<SlipCollabSuggestion> {
  const res = await apiClient.post<ApiEnvelope<SlipCollabSuggestion>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/suggestions/${encodeURIComponent(suggestionId)}/reject`,
    { reason },
  )
  return res.data.data
}

export async function withdrawSlipCollabSuggestion(
  slipId: string,
  suggestionId: string,
): Promise<SlipCollabSuggestion> {
  const res = await apiClient.post<ApiEnvelope<SlipCollabSuggestion>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/suggestions/${encodeURIComponent(suggestionId)}/withdraw`,
  )
  return res.data.data
}
