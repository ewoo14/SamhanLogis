/**
 * 회계전표 협업 API client — ACCOUNTING_VOUCHER collab rollout.
 *
 * UUID 비공개: id/parentId 는 React key 와 API path 에만 사용한다. 화면에는 authorName,
 * proposerName, decidedByName, body, 사유, 시각, journalNo/lineNo 라벨만 노출한다.
 */
import { apiClient, type ApiEnvelope } from './client'
import { normalizeJournal, type Journal } from './accounting'

export interface JournalCollabComment {
  id: string
  anchor: string | null
  authorName: string
  body: string
  parentId: string | null
  status: 'OPEN' | 'RESOLVED'
  createdAt: string
}

export interface AddJournalCollabCommentInput {
  body: string
  parentId?: string
  anchor?: string
}

export type JournalCollabEditStatus = 'ACCEPTED'

export interface JournalCollabEdit {
  id: string
  changeSet: string
  reason: string | null
  proposerName: string
  status: JournalCollabEditStatus
  decidedByName: string | null
  decidedAt: string | null
  createdAt: string
}

export interface CommitJournalCollabEditInput {
  changeSet: string
  reason?: string
}

export interface CommitJournalCollabEditResponse {
  edit: JournalCollabEdit
  journal: Journal
}

export async function getJournalCollabComments(
  journalId: string,
  limit = 20,
): Promise<JournalCollabComment[]> {
  const res = await apiClient.get<ApiEnvelope<JournalCollabComment[]>>(
    `/accounting/journals/${encodeURIComponent(journalId)}/collab/comments`,
    { params: { limit } },
  )
  return res.data.data
}

export async function addJournalCollabComment(
  journalId: string,
  input: AddJournalCollabCommentInput,
): Promise<JournalCollabComment> {
  const res = await apiClient.post<ApiEnvelope<JournalCollabComment>>(
    `/accounting/journals/${encodeURIComponent(journalId)}/collab/comments`,
    input,
  )
  return res.data.data
}

export async function deleteJournalCollabComment(
  journalId: string,
  commentId: string,
): Promise<void> {
  await apiClient.delete(
    `/accounting/journals/${encodeURIComponent(journalId)}/collab/comments/${encodeURIComponent(commentId)}`,
  )
}

export async function resolveJournalCollabComment(
  journalId: string,
  commentId: string,
): Promise<JournalCollabComment> {
  const res = await apiClient.post<ApiEnvelope<JournalCollabComment>>(
    `/accounting/journals/${encodeURIComponent(journalId)}/collab/comments/${encodeURIComponent(commentId)}/resolve`,
  )
  return res.data.data
}

export async function getJournalCollabEdits(
  journalId: string,
): Promise<JournalCollabEdit[]> {
  const res = await apiClient.get<ApiEnvelope<JournalCollabEdit[]>>(
    `/accounting/journals/${encodeURIComponent(journalId)}/collab/edits`,
  )
  return res.data.data
}

export async function commitJournalCollabEdit(
  journalId: string,
  input: CommitJournalCollabEditInput,
): Promise<CommitJournalCollabEditResponse> {
  const res = await apiClient.post<ApiEnvelope<CommitJournalCollabEditResponse>>(
    `/accounting/journals/${encodeURIComponent(journalId)}/collab/edits`,
    input,
  )
  return {
    ...res.data.data,
    journal: normalizeJournal(res.data.data.journal),
  }
}
