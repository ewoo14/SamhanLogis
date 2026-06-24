/**
 * DispatchTask 코멘트 API client — C1c.
 *
 * UUID 비공개: id / parentId 는 React key 와 API path 에만 사용한다.
 * 화면에는 authorName, body, createdAt 만 노출한다.
 */
import { apiClient, type ApiEnvelope } from './client'
import type { DispatchTaskResponse } from './dispatchTask'
import { collabHeaders } from '../auth/collabHeaders'

export interface DispatchComment {
  id: string
  anchor: string | null
  authorName: string
  body: string
  parentId: string | null
  status: 'OPEN' | 'RESOLVED'
  createdAt: string
}

export interface AddDispatchCommentInput {
  body: string
  parentId?: string
  anchor?: string
}

export type DispatchCollabEditStatus = 'ACCEPTED'

export interface DispatchCollabEdit {
  id: string
  changeSet: string
  reason: string | null
  proposerName: string
  status: DispatchCollabEditStatus
  decidedByName: string | null
  decidedAt: string | null
  createdAt: string
}

export interface CommitDispatchCollabEditInput {
  changeSet: string
  reason?: string
}

export interface CommitDispatchCollabEditResponse {
  edit: DispatchCollabEdit
  task: DispatchTaskResponse
}

function dispatchTaskPath(taskId: string, suffix: string): string {
  return `/admin/dispatch-tasks/${encodeURIComponent(taskId)}/${suffix}`
}

export async function getDispatchComments(
  taskId: string,
): Promise<DispatchComment[]> {
  const res = await apiClient.get<ApiEnvelope<DispatchComment[]>>(
    dispatchTaskPath(taskId, 'comments'),
    { headers: await collabHeaders() },
  )
  return res.data.data
}

export async function addDispatchComment(
  taskId: string,
  input: AddDispatchCommentInput,
): Promise<DispatchComment> {
  const res = await apiClient.post<ApiEnvelope<DispatchComment>>(
    dispatchTaskPath(taskId, 'comments'),
    input,
    { headers: await collabHeaders() },
  )
  return res.data.data
}

export async function deleteDispatchComment(
  taskId: string,
  commentId: string,
): Promise<void> {
  await apiClient.delete(
    dispatchTaskPath(taskId, `comments/${encodeURIComponent(commentId)}`),
    { headers: await collabHeaders() },
  )
}

export async function getDispatchCollabEdits(
  taskId: string,
): Promise<DispatchCollabEdit[]> {
  const res = await apiClient.get<ApiEnvelope<DispatchCollabEdit[]>>(
    dispatchTaskPath(taskId, 'edits'),
    { headers: await collabHeaders() },
  )
  return res.data.data
}

export async function commitDispatchCollabEdit(
  taskId: string,
  input: CommitDispatchCollabEditInput,
): Promise<CommitDispatchCollabEditResponse> {
  const res = await apiClient.post<ApiEnvelope<CommitDispatchCollabEditResponse>>(
    dispatchTaskPath(taskId, 'edits'),
    input,
    { headers: await collabHeaders() },
  )
  return res.data.data
}
