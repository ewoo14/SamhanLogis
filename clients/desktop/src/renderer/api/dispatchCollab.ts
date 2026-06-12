/**
 * DispatchTask 코멘트 API client — C1c.
 *
 * UUID 비공개: id / parentId 는 React key 와 API path 에만 사용한다.
 * 화면에는 authorName, body, createdAt 만 노출한다.
 */
import { apiClient, type ApiEnvelope } from './client'

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

export async function getDispatchComments(
  taskId: string,
): Promise<DispatchComment[]> {
  const res = await apiClient.get<ApiEnvelope<DispatchComment[]>>(
    `/admin/dispatch-tasks/${taskId}/comments`,
  )
  return res.data.data
}

export async function addDispatchComment(
  taskId: string,
  input: AddDispatchCommentInput,
): Promise<DispatchComment> {
  const res = await apiClient.post<ApiEnvelope<DispatchComment>>(
    `/admin/dispatch-tasks/${taskId}/comments`,
    input,
  )
  return res.data.data
}

export async function deleteDispatchComment(
  taskId: string,
  commentId: string,
): Promise<void> {
  await apiClient.delete(
    `/admin/dispatch-tasks/${taskId}/comments/${commentId}`,
  )
}
