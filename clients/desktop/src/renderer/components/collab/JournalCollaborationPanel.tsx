/**
 * 회계전표 협업 패널 — ACCOUNTING_VOUCHER collab rollout.
 *
 * 댓글과 수정완료 이력을 한 화면에 모아 보여준다. UUID 는 API key/path 에만 쓰고,
 * 화면에는 작성자/수정자 실명과 전표번호/라인번호/내용만 표시한다.
 */
import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Input, safeActorName, Select } from '@samhan/design-system'
import {
  addJournalCollabComment,
  commitJournalCollabEdit,
  deleteJournalCollabComment,
  getJournalCollabComments,
  getJournalCollabEdits,
  resolveJournalCollabComment,
  type JournalCollabComment,
  type JournalCollabEdit,
} from '../../api/journalCollab'
import { JournalCollabRealtimeClient } from '../../realtime/JournalCollabRealtimeClient'
import { usePermissions } from '../../hooks/usePermissions'
import { usePresence } from '../../hooks/usePresence'
import { JournalPresenceClient } from '../../realtime/createPresenceClient'
import { PresenceIndicator } from './PresenceIndicator'

export interface JournalCollabEditableLine {
  lineNo: number
  accountCode: string
  accountName?: string | null
  debit: string
  credit: string
  memo: string | null | undefined
}

export interface JournalCollabCurrentValues {
  description?: string | null
  lines: JournalCollabEditableLine[]
}

export interface JournalCollaborationPanelProps {
  /** 분개 UUID — query key/API path 전용. 화면 텍스트 노출 금지. */
  journalId: string
  /** overlay 편집 필드의 현재 값 snapshot. */
  currentValues: JournalCollabCurrentValues
  /** 상세 상단 "수정" 버튼과 연결되는 편집모드 상태. */
  editMode?: boolean
  /** 편집모드 상태 변경 콜백. */
  onEditModeChange?: (next: boolean) => void
  /** 수정완료 후 상세 화면이 추가 동작을 해야 할 때 사용. */
  onCommitted?: () => void
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  return value.slice(0, 16).replace('T', ' ')
}

function displayName(value: string | null | undefined): string {
  if (value == null || value.trim().length === 0) return '시스템'
  return safeActorName(value) ?? '변경자 미상'
}

function lineMemoPath(lineNo: number): string {
  return `line.${lineNo}.memo`
}

function normalizeCollabAnchor(anchor: string | null | undefined): string | null {
  const normalized = (anchor ?? '').trim().replace(/^\/+/, '').replace(/\//g, '.')
  return normalized.length > 0 ? normalized : null
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '')
}

function labelForPath(path: string): string {
  const normalized = normalizePath(path)
  if (normalized === 'description') return '적요'
  const lineMatch = normalized.match(/^line\.(\d+)\.memo$/)
  if (lineMatch) {
    // lineNo 는 BE 1-based(JournalService lineNo=1.. / line.{lineNo}.memo) — 그대로 표기한다.
    return `${lineMatch[1]}번 라인 메모`
  }
  return normalized
}

function summarizeChangeSet(changeSet: string): string {
  try {
    const parsed = JSON.parse(changeSet) as Record<string, { after?: unknown }>
    return Object.entries(parsed)
      .map(([path, change]) => {
        const after = change.after == null ? '비움' : String(change.after)
        return `${labelForPath(path)}: ${after}`
      })
      .join(' · ')
  } catch {
    return '변경 내용 형식을 해석하지 못했습니다.'
  }
}

function parseChangeSetDiffs(changeSet: string): Array<{
  fieldName: string
  label: string
  before: string | null
  after: string | null
}> {
  try {
    const parsed = JSON.parse(changeSet) as Record<string, { before?: unknown; after?: unknown }>
    return Object.entries(parsed).map(([path, change]) => ({
      fieldName: normalizePath(path),
      label: labelForPath(path),
      before: change.before == null ? null : String(change.before),
      after: change.after == null ? null : String(change.after),
    }))
  } catch {
    return []
  }
}

/** 필드 경로 → 안전한 data-testid 접미사 (영숫자 이외는 하이픈으로 치환). */
function fieldPathTestId(fieldPath: string): string {
  return fieldPath.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function valueForEdit(value: string | null | undefined): string {
  return value ?? ''
}

function formatKrw(raw: string): string {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return raw
  if (n === 0) return '-'
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function isCollabEvent(eventName: string): boolean {
  return eventName.startsWith('comment.')
    || eventName.startsWith('suggestion.')
    || eventName === 'journal:edit'
    || eventName === 'accounting-voucher:edit'
    || eventName === 'message'
}

export function JournalCollaborationPanel({
  journalId,
  currentValues,
  editMode = false,
  onEditModeChange,
  onCommitted,
}: JournalCollaborationPanelProps) {
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [commentBody, setCommentBody] = useState('')
  const [commentAnchor, setCommentAnchor] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [lineMemoDrafts, setLineMemoDrafts] = useState<Record<number, string>>({})
  const [editReason, setEditReason] = useState('')
  const [editNotice, setEditNotice] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [activeFieldPath, setActiveFieldPath] = useState<string | null>(null)
  const presenceEntries = usePresence({ entityId: journalId, client: JournalPresenceClient, enabled: !!journalId })

  const commentQueryKey = useMemo(() => ['journalCollabComments', journalId] as const, [journalId])
  const editQueryKey = useMemo(() => ['journalCollabEdits', journalId] as const, [journalId])
  const journalQueryKey = useMemo(() => ['accounting', 'journal', journalId] as const, [journalId])
  const canWriteComments = canAccess('accounting.journals', 'update')
  const canResolveComments = canAccess('accounting.journals', 'update')
  const canDeleteComments = canAccess('accounting.journals', 'update')
  const canEdit = canAccess('accounting.journals', 'update')

  const lines = useMemo(
    () => [...currentValues.lines].sort((a, b) => a.lineNo - b.lineNo),
    [currentValues.lines],
  )

  const commentsQuery = useQuery({
    queryKey: commentQueryKey,
    queryFn: () => getJournalCollabComments(journalId),
    enabled: !!journalId,
  })

  const editsQuery = useQuery({
    queryKey: editQueryKey,
    queryFn: () => getJournalCollabEdits(journalId),
    enabled: !!journalId,
  })

  useEffect(() => {
    if (!editMode) return
    const nextLineMemos: Record<number, string> = {}
    for (const line of lines) {
      nextLineMemos[line.lineNo] = valueForEdit(line.memo)
    }
    setDescriptionDraft(valueForEdit(currentValues.description))
    setLineMemoDrafts(nextLineMemos)
    setEditReason('')
    setEditNotice(null)
    setCommitError(null)
  }, [currentValues.description, editMode, lines])

  useEffect(() => {
    if (!journalId) return
    const ctrl = JournalCollabRealtimeClient.subscribe(journalId, (evt) => {
      if (!isCollabEvent(evt.event)) return
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
      void queryClient.invalidateQueries({ queryKey: editQueryKey })
      void queryClient.invalidateQueries({ queryKey: journalQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['accounting', 'journals'] })
    })
    return () => ctrl.abort()
  }, [commentQueryKey, editQueryKey, journalId, journalQueryKey, queryClient])

  const addCommentMutation = useMutation({
    mutationFn: ({ body, anchor }: { body: string; anchor?: string }) =>
      addJournalCollabComment(journalId, { body, anchor }),
    onSuccess: () => {
      setCommentBody('')
      setCommentAnchor('')
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteJournalCollabComment(journalId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const resolveCommentMutation = useMutation({
    mutationFn: (commentId: string) => resolveJournalCollabComment(journalId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const commitMutation = useMutation({
    mutationFn: () => {
      const changeSet: Record<string, { before: string | null; after: string | null }> = {}
      const beforeDescription = valueForEdit(currentValues.description)
      if (beforeDescription !== descriptionDraft) {
        changeSet.description = {
          before: beforeDescription.length === 0 ? null : beforeDescription,
          after: descriptionDraft.length === 0 ? null : descriptionDraft,
        }
      }

      for (const line of lines) {
        const before = valueForEdit(line.memo)
        const after = valueForEdit(lineMemoDrafts[line.lineNo])
        if (before !== after) {
          changeSet[lineMemoPath(line.lineNo)] = {
            before: before.length === 0 ? null : before,
            after: after.length === 0 ? null : after,
          }
        }
      }

      if (Object.keys(changeSet).length === 0) {
        throw new Error('변경된 필드가 없습니다.')
      }
      return commitJournalCollabEdit(journalId, {
        changeSet: JSON.stringify(changeSet),
        reason: editReason.trim() || undefined,
      })
    },
    onSuccess: () => {
      onEditModeChange?.(false)
      setEditNotice('수정완료되었습니다.')
      // setQueryData(result.journal) 금지 — commit 응답 journal 은 상세 조회 DTO 의 부분집합이라
      // reversedAt/reverseReason 등이 undefined 로 덮여 사라진다. invalidate 로 권위 있는 재조회에 위임.
      void queryClient.invalidateQueries({ queryKey: editQueryKey })
      void queryClient.invalidateQueries({ queryKey: journalQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['accounting', 'journals'] })
      onCommitted?.()
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === '변경된 필드가 없습니다.') {
        setCommitError('변경된 필드가 없습니다.')
        return
      }
      const serverMessage = isAxiosError(error)
        ? (() => {
            const data = error.response?.data as { message?: unknown } | undefined
            const msg = data?.message
            return typeof msg === 'string' && msg.trim() ? msg.trim() : null
          })()
        : null
      setCommitError(serverMessage ?? '수정 저장에 실패했습니다. 다시 시도해 주세요.')
    },
  })

  const comments: JournalCollabComment[] = Array.isArray(commentsQuery.data) ? commentsQuery.data : []
  const edits: JournalCollabEdit[] = Array.isArray(editsQuery.data) ? editsQuery.data : []
  const trimmedComment = commentBody.trim()

  return (
    <section data-testid="journal-collaboration-panel" style={{ marginTop: 24 }}>
      <Card padding={4} shadow="sm">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: presenceEntries.length > 0 ? 12 : 0 }}>
          <PresenceIndicator entries={presenceEntries} />
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-4, 16px)' }}>
          <section aria-label="코멘트" style={{ width: '100%' }}>
            <h5 style={{ margin: '0 0 10px', fontSize: 14 }}>코멘트</h5>
            <div
              data-testid="journal-collab-comment-list"
              style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}
            >
              {commentsQuery.isLoading ? (
                <p style={{ margin: 0, color: 'var(--color-neutral-500)' }}>코멘트를 불러오는 중...</p>
              ) : commentsQuery.isError ? (
                <p role="alert" style={{ margin: 0, color: 'var(--color-danger-600)' }}>
                  코멘트를 불러오지 못했습니다.
                </p>
              ) : comments.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--color-neutral-500)' }}>아직 코멘트가 없습니다.</p>
              ) : comments.map((comment) => {
                const fieldPath = normalizeCollabAnchor(comment.anchor)
                const anchorLabel = fieldPath ? labelForPath(fieldPath) : null
                const highlighted = !!fieldPath && fieldPath === activeFieldPath
                return (
                <article
                  key={comment.id}
                  data-testid="journal-collab-comment-item"
                  data-active={highlighted ? 'true' : undefined}
                  role={fieldPath ? 'button' : undefined}
                  aria-current={highlighted ? 'true' : undefined}
                  tabIndex={fieldPath ? 0 : undefined}
                  onClick={() => {
                    if (!fieldPath) return
                    setActiveFieldPath(fieldPath)
                  }}
                  onKeyDown={(event) => {
                    if (!fieldPath) return
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    setActiveFieldPath(fieldPath)
                  }}
                  style={{
                    borderBottom: '1px solid var(--color-neutral-200)',
                    padding: highlighted ? '8px' : '0 0 8px',
                    borderRadius: highlighted ? 6 : 0,
                    background: highlighted ? 'var(--color-warning-50, #FEF6E7)' : 'transparent',
                    cursor: fieldPath ? 'pointer' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                    <strong>{displayName(comment.authorName)}</strong>
                    <span style={{ color: 'var(--color-neutral-500)' }}>{formatDateTime(comment.createdAt)}</span>
                    {anchorLabel ? (
                      <Badge
                        variant="neutral"
                        data-testid="journal-collab-comment-anchor-badge"
                        style={{ maxWidth: '100%', overflowWrap: 'anywhere' }}
                      >
                        {anchorLabel}
                      </Badge>
                    ) : null}
                    {comment.status === 'RESOLVED' ? <Badge variant="success">해결</Badge> : null}
                    {canResolveComments && comment.status === 'OPEN' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={resolveCommentMutation.isPending}
                        onClick={(event) => {
                          event.stopPropagation()
                          resolveCommentMutation.mutate(comment.id)
                        }}
                      >
                        해결
                      </Button>
                    ) : null}
                    {canDeleteComments ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deleteCommentMutation.isPending}
                        onClick={(event) => {
                          event.stopPropagation()
                          deleteCommentMutation.mutate(comment.id)
                        }}
                      >
                        삭제
                      </Button>
                    ) : null}
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {comment.body}
                  </p>
                </article>
                )
              })}
            </div>

            {canWriteComments ? (
              <>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, maxWidth: 260, marginTop: 12 }}>
                  연결 필드
                  <Select
                    data-testid="journal-collab-comment-anchor-select"
                    aria-label="코멘트 연결 필드"
                    value={commentAnchor}
                    onChange={(event) => setCommentAnchor(event.target.value)}
                    selectSize="sm"
                  >
                    <option value="">전체 코멘트</option>
                    <option value="description">적요</option>
                    {lines.map((line) => (
                      <option key={line.lineNo} value={lineMemoPath(line.lineNo)}>
                        {line.lineNo}번 라인 메모
                      </option>
                    ))}
                  </Select>
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
                  <textarea
                    data-testid="journal-collab-comment-input"
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="코멘트 입력..."
                    style={{
                      flex: 1,
                      width: '100%',
                      maxWidth: 'min(720px, 100%)',
                      minWidth: 0,
                      minHeight: 56,
                      resize: 'vertical',
                      border: '1px solid var(--color-neutral-300)',
                      borderRadius: 4,
                      padding: '8px 10px',
                      font: 'inherit',
                    }}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={trimmedComment.length === 0 || addCommentMutation.isPending}
                    loading={addCommentMutation.isPending}
                    onClick={() => addCommentMutation.mutate({ body: trimmedComment, anchor: commentAnchor || undefined })}
                  >
                    등록
                  </Button>
                </div>
                {addCommentMutation.isError ? (
                  <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                    코멘트를 등록하지 못했습니다.
                  </p>
                ) : null}
                {deleteCommentMutation.isError ? (
                  <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                    코멘트를 삭제하지 못했습니다.
                  </p>
                ) : null}
                {resolveCommentMutation.isError ? (
                  <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                    코멘트를 해결 처리하지 못했습니다.
                  </p>
                ) : null}
              </>
            ) : null}
          </section>

          {canEdit && editMode ? (
            <section aria-label="수정" style={{ width: '100%' }}>
                <div
                  data-testid="journal-collab-edit-form"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--color-neutral-600)',
                      gridColumn: '1 / -1',
                    }}
                  >
                    수정 가능 필드: 적요, 라인별 메모
                  </p>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, gridColumn: '1 / -1' }}>
                    적요
                    <Input
                      value={descriptionDraft}
                      onChange={(event) => setDescriptionDraft(event.target.value)}
                      aria-label="적요 수정값"
                      inputSize="sm"
                    />
                  </label>
                  {lines.map((line) => (
                    <div
                      key={line.lineNo}
                      style={{
                        display: 'grid',
                        gap: 4,
                        padding: 8,
                        border: '1px solid var(--color-neutral-200)',
                        borderRadius: 4,
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
                        <strong>{line.lineNo}번 라인</strong>
                        <span style={{ marginLeft: 6 }}>
                          {line.accountCode} {line.accountName ?? ''}
                        </span>
                        <span style={{ marginLeft: 6 }}>
                          차변 {formatKrw(line.debit)} / 대변 {formatKrw(line.credit)}
                        </span>
                      </div>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                        라인 메모
                        <Input
                          value={lineMemoDrafts[line.lineNo] ?? ''}
                          onChange={(event) => setLineMemoDrafts((prev) => ({
                            ...prev,
                            [line.lineNo]: event.target.value,
                          }))}
                          aria-label={`${line.lineNo}번 라인 메모 수정값`}
                          inputSize="sm"
                        />
                      </label>
                    </div>
                  ))}
                  <Input
                    value={editReason}
                    onChange={(event) => setEditReason(event.target.value)}
                    placeholder="사유"
                    maxLength={500}
                    style={{ gridColumn: '1 / -1' }}
                    aria-label="수정 사유"
                    inputSize="sm"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    loading={commitMutation.isPending}
                    disabled={commitMutation.isPending}
                    onClick={() => commitMutation.mutate()}
                  >
                    수정완료
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={commitMutation.isPending}
                    onClick={() => onEditModeChange?.(false)}
                  >
                    취소
                  </Button>
                </div>
                {commitError ? (
                  <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                    {commitError}
                  </p>
                ) : null}
            </section>
          ) : null}
          {editNotice ? (
            <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--color-success-700, #047857)' }}>
              {editNotice}
            </p>
          ) : null}
        </div>
      </Card>
      <Card
        as="section"
        aria-label="수정 이력"
        padding={4}
        shadow="sm"
        style={{ marginTop: 24, width: '100%' }}
        data-testid="journal-collab-edit-history-panel"
      >
        <h4 style={{ marginTop: 0 }}>수정 이력</h4>
        <div
          data-testid="journal-collab-edit-list"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}
        >
          {editsQuery.isLoading ? (
            <p style={{ margin: 0, color: 'var(--color-neutral-500)' }}>수정 이력을 불러오는 중...</p>
          ) : editsQuery.isError ? (
            <p role="alert" style={{ margin: 0, color: 'var(--color-danger-600)' }}>
              수정 이력을 불러오지 못했습니다.
            </p>
          ) : edits.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-neutral-500)' }}>아직 수정 이력이 없습니다.</p>
          ) : edits.map((edit) => {
            const diffs = parseChangeSetDiffs(edit.changeSet)
            return (
              <article
                key={edit.id}
                data-testid="journal-collab-edit-item"
                style={{ borderBottom: '1px solid var(--color-neutral-200)', paddingBottom: 8 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                  <strong>{displayName(edit.decidedByName ?? edit.proposerName)}</strong>
                  <Badge variant="success">수정완료</Badge>
                  <span style={{ color: 'var(--color-neutral-500)' }}>
                    {formatDateTime(edit.decidedAt ?? edit.createdAt)}
                  </span>
                </div>
                <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                  {diffs.map((diff) => {
                    const isActive = diff.fieldName === activeFieldPath
                    return (
                      <div
                        key={`${edit.id}-${diff.fieldName}`}
                        data-testid={`journal-collab-edit-change-${fieldPathTestId(diff.fieldName)}`}
                        data-active={isActive ? 'true' : undefined}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveFieldPath(diff.fieldName)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          setActiveFieldPath(diff.fieldName)
                        }}
                        style={{
                          fontSize: 13,
                          padding: isActive ? '4px 6px' : 0,
                          borderRadius: 4,
                          background: isActive ? 'var(--color-warning-50, #FEF6E7)' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <strong>{diff.label}</strong>
                        <span style={{ marginLeft: 8, color: 'var(--color-neutral-500)', textDecoration: 'line-through' }}>
                          {diff.before ?? '이전값 미기록'}
                        </span>
                        <span aria-hidden="true" style={{ margin: '0 6px', color: 'var(--color-neutral-400)' }}>→</span>
                        <span style={{ color: 'var(--color-brand-700, #0F766E)', fontWeight: 700 }}>
                          {diff.after ?? '비움'}
                        </span>
                      </div>
                    )
                  })}
                  {diffs.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13 }}>{summarizeChangeSet(edit.changeSet)}</p>
                  ) : null}
                </div>
                {edit.reason ? (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-neutral-600)' }}>
                    사유: {edit.reason}
                  </p>
                ) : null}
              </article>
            )
          })}
        </div>
      </Card>
    </section>
  )
}

export default JournalCollaborationPanel
