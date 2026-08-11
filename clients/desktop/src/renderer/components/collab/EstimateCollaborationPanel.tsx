/**
 * 견적 협업 패널 — ESTIMATE collab rollout.
 *
 * 댓글과 수정완료 이력을 한 화면에 모아 보여준다. UUID 는 API key/path 에만 쓰고,
 * 화면에는 작성자/수정자 실명과 견적번호/라인번호/내용만 표시한다.
 */
import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Input, safeActorName, Select } from '@samhan/design-system'
import {
  addEstimateCollabComment,
  commitEstimateCollabEdit,
  deleteEstimateCollabComment,
  getEstimateCollabComments,
  resolveEstimateCollabComment,
  type EstimateCollabComment,
} from '../../api/estimateCollab'
import type { EstimateStatus } from '../../api/estimateApi'
import { EstimateCollabRealtimeClient } from '../../realtime/EstimateCollabRealtimeClient'
import { usePermissions } from '../../hooks/usePermissions'
import { usePresence } from '../../hooks/usePresence'
import { EstimatePresenceClient } from '../../realtime/createPresenceClient'
import { PresenceIndicator } from './PresenceIndicator'
import { EstimateVersionHistoryPanel } from '../audit/EstimateVersionHistoryPanel'

export interface EstimateCollabEditableLine {
  /** BE EstimateDocumentCollaborationPort lineKey 와 동일한 1-based 활성 라인 index. */
  lineKey: number
  productName: string | null
  modelName: string | null
  quantity: number
  unitPrice: string | number
  note: string | null | undefined
}

export interface EstimateCollabCurrentValues {
  memo?: string | null
  validUntil?: string | null
  lines: EstimateCollabEditableLine[]
}

export interface EstimateCollaborationPanelProps {
  /** 견적 식별자 — query key/API path 전용. 화면 텍스트 노출 금지. */
  estimateId: string
  /** 현재 견적 상태 — 버전이력 복원 가드에 전달한다. */
  status: EstimateStatus
  /** overlay 편집 필드의 현재 값 snapshot. */
  currentValues: EstimateCollabCurrentValues
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

function lineNotePath(lineKey: number): string {
  return `line.${lineKey}.note`
}

function normalizeCollabAnchor(anchor: string | null | undefined): string | null {
  const normalized = (anchor ?? '').trim().replace(/^\/+/, '').replace(/\//g, '.')
  return normalized.length > 0 ? normalized : null
}

function labelForAnchor(fieldPath: string): string {
  if (fieldPath === 'memo') return '비고'
  if (fieldPath === 'validUntil') return '유효기간'
  const lineMatch = fieldPath.match(/^line\.(\d+)\.note$/)
  if (lineMatch) return `${lineMatch[1]}번 라인 메모`
  return fieldPath
}

function valueForEdit(value: string | null | undefined): string {
  return value ?? ''
}

function valueForChange(value: string): string | null {
  return value.length === 0 ? null : value
}

function serverErrorMessage(error: unknown): string | null {
  if (!isAxiosError(error)) return null
  const data = error.response?.data as { message?: unknown } | undefined
  const msg = data?.message
  return typeof msg === 'string' && msg.trim() ? msg.trim() : null
}

function formatKrw(raw: string | number): string {
  const n = typeof raw === 'string' ? Number.parseFloat(raw) : raw
  if (!Number.isFinite(n)) return '-'
  if (n === 0) return '-'
  return Math.trunc(n).toLocaleString('ko-KR')
}

function isCollabEvent(eventName: string): boolean {
  // 협업 stream(/collab/stream) 은 comment.* / suggestion.* 만 발행한다.
  // 본문 실시간 동기화는 coedit(coedit:update)이 담당하며, 구 estimate:edit 채널은 폐기됨.
  return eventName.startsWith('comment.')
    || eventName.startsWith('suggestion.')
    || eventName === 'message'
}

export function EstimateCollaborationPanel({
  estimateId,
  status,
  currentValues,
  editMode = false,
  onEditModeChange,
  onCommitted,
}: EstimateCollaborationPanelProps) {
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [commentBody, setCommentBody] = useState('')
  const [commentAnchor, setCommentAnchor] = useState('')
  const [memoDraft, setMemoDraft] = useState('')
  const [validUntilDraft, setValidUntilDraft] = useState('')
  const [lineNoteDrafts, setLineNoteDrafts] = useState<Record<number, string>>({})
  const [editReason, setEditReason] = useState('')
  const [editNotice, setEditNotice] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [activeRevisionNo, setActiveRevisionNo] = useState<number | null>(null)
  const [activeFieldPath, setActiveFieldPath] = useState<string | null>(null)
  const [activeRevisionIsLatest, setActiveRevisionIsLatest] = useState(false)
  const presenceEntries = usePresence({ entityId: estimateId, client: EstimatePresenceClient, enabled: !!estimateId })

  const commentQueryKey = useMemo(() => ['estimateCollabComments', estimateId] as const, [estimateId])
  const estimateQueryKey = useMemo(() => ['estimate', estimateId] as const, [estimateId])
  const canWrite = canAccess('estimates.list', 'update')
  const lines = useMemo(
    () => currentValues.lines.map((line, index) => ({
      ...line,
      lineKey: line.lineKey || index + 1,
    })),
    [currentValues.lines],
  )

  const commentsQuery = useQuery({
    queryKey: commentQueryKey,
    queryFn: () => getEstimateCollabComments(estimateId),
    enabled: !!estimateId,
  })

  useEffect(() => {
    if (!editMode) return
    const nextLineNotes: Record<number, string> = {}
    for (const line of lines) {
      nextLineNotes[line.lineKey] = valueForEdit(line.note)
    }
    setMemoDraft(valueForEdit(currentValues.memo))
    setValidUntilDraft(valueForEdit(currentValues.validUntil))
    setLineNoteDrafts(nextLineNotes)
    setEditReason('')
    setEditNotice(null)
    setCommitError(null)
  }, [currentValues.memo, currentValues.validUntil, editMode, lines])

  useEffect(() => {
    if (!estimateId) return
    const ctrl = EstimateCollabRealtimeClient.subscribe(estimateId, (evt) => {
      if (!isCollabEvent(evt.event)) return
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
      void queryClient.invalidateQueries({ queryKey: estimateQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['estimateRevisions', estimateId] })
      void queryClient.invalidateQueries({ queryKey: ['estimates'] })
    })
    return () => ctrl.abort()
  }, [commentQueryKey, estimateId, estimateQueryKey, queryClient])

  const addCommentMutation = useMutation({
    mutationFn: ({ body, anchor }: { body: string; anchor?: string }) =>
      addEstimateCollabComment(estimateId, { body, anchor }),
    onSuccess: () => {
      setCommentBody('')
      setCommentAnchor('')
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteEstimateCollabComment(estimateId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const resolveCommentMutation = useMutation({
    mutationFn: (commentId: string) => resolveEstimateCollabComment(estimateId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const commitMutation = useMutation({
    mutationFn: () => {
      const changeSet: Record<string, { before: string | null; after: string | null }> = {}
      const beforeMemo = valueForEdit(currentValues.memo)
      if (beforeMemo !== memoDraft) {
        changeSet.memo = {
          before: valueForChange(beforeMemo),
          after: valueForChange(memoDraft),
        }
      }

      const beforeValidUntil = valueForEdit(currentValues.validUntil)
      if (beforeValidUntil !== validUntilDraft) {
        changeSet.validUntil = {
          before: valueForChange(beforeValidUntil),
          after: valueForChange(validUntilDraft),
        }
      }

      for (const line of lines) {
        const before = valueForEdit(line.note)
        const after = valueForEdit(lineNoteDrafts[line.lineKey])
        if (before !== after) {
          changeSet[lineNotePath(line.lineKey)] = {
            before: valueForChange(before),
            after: valueForChange(after),
          }
        }
      }

      if (Object.keys(changeSet).length === 0) {
        throw new Error('변경된 필드가 없습니다.')
      }
      return commitEstimateCollabEdit(estimateId, {
        changeSet: JSON.stringify(changeSet),
        reason: editReason.trim() || undefined,
      })
    },
    onSuccess: () => {
      onEditModeChange?.(false)
      setEditNotice('수정완료되었습니다.')
      void queryClient.invalidateQueries({ queryKey: estimateQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['estimateRevisions', estimateId] })
      void queryClient.invalidateQueries({ queryKey: ['estimates'] })
      onCommitted?.()
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === '변경된 필드가 없습니다.') {
        setCommitError('변경된 필드가 없습니다.')
        return
      }
      setCommitError(serverErrorMessage(error) ?? '수정 저장에 실패했습니다. 다시 시도해 주세요.')
    },
  })

  const comments: EstimateCollabComment[] = Array.isArray(commentsQuery.data) ? commentsQuery.data : []
  const trimmedComment = commentBody.trim()
  const highlightsLatestAnchoredComments = activeRevisionNo !== null && activeRevisionIsLatest

  return (
    <section data-testid="estimate-collaboration-panel" style={{ marginTop: 24 }}>
      <Card padding={4} shadow="sm">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: presenceEntries.length > 0 ? 12 : 0 }}>
          <PresenceIndicator entries={presenceEntries} />
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-4, 16px)' }}>
          <section aria-label="코멘트" style={{ width: '100%' }}>
            <h5 style={{ margin: '0 0 10px', fontSize: 14 }}>코멘트</h5>
            <div
              data-testid="estimate-collab-comment-list"
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
                const anchorLabel = fieldPath ? labelForAnchor(fieldPath) : null
                const highlighted = !!fieldPath
                  && (fieldPath === activeFieldPath || highlightsLatestAnchoredComments)
                return (
                <article
                  key={comment.id}
                  data-testid="estimate-collab-comment-item"
                  data-active={highlighted ? 'true' : undefined}
                  role={fieldPath ? 'button' : undefined}
                  aria-current={highlighted ? 'true' : undefined}
                  tabIndex={fieldPath ? 0 : undefined}
                  onClick={() => {
                    if (!fieldPath) return
                    setActiveRevisionNo(null)
                    setActiveRevisionIsLatest(false)
                    setActiveFieldPath(fieldPath)
                  }}
                  onKeyDown={(event) => {
                    if (!fieldPath) return
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    setActiveRevisionNo(null)
                    setActiveRevisionIsLatest(false)
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
                        data-testid="estimate-collab-comment-anchor-badge"
                        style={{ maxWidth: '100%', overflowWrap: 'anywhere' }}
                      >
                        {anchorLabel}
                      </Badge>
                    ) : null}
                    {comment.status === 'RESOLVED' ? <Badge variant="success">해결</Badge> : null}
                    {canWrite && comment.status === 'OPEN' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`${displayName(comment.authorName)} 코멘트 해결`}
                        disabled={resolveCommentMutation.isPending}
                        onClick={(event) => {
                          event.stopPropagation()
                          resolveCommentMutation.mutate(comment.id)
                        }}
                      >
                        해결
                      </Button>
                    ) : null}
                    {canWrite ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`${displayName(comment.authorName)} 코멘트 삭제`}
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
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: 13,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {comment.body}
                  </p>
                </article>
                )
              })}
            </div>

            {canWrite ? (
              <>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, maxWidth: 260, marginTop: 12 }}>
                  연결 필드
                  <Select
                    data-testid="estimate-collab-comment-anchor-select"
                    aria-label="코멘트 연결 필드"
                    value={commentAnchor}
                    onChange={(event) => setCommentAnchor(event.target.value)}
                    selectSize="sm"
                  >
                    <option value="">전체 코멘트</option>
                    <option value="memo">비고</option>
                    <option value="validUntil">유효기간</option>
                    {lines.map((line) => (
                      <option key={line.lineKey} value={lineNotePath(line.lineKey)}>
                        {line.lineKey}번 라인 메모
                      </option>
                    ))}
                  </Select>
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
                  <textarea
                    data-testid="estimate-collab-comment-input"
                    aria-label="코멘트 입력"
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
                    {serverErrorMessage(addCommentMutation.error) ?? '코멘트를 등록하지 못했습니다.'}
                  </p>
                ) : null}
                {deleteCommentMutation.isError ? (
                  <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                    {serverErrorMessage(deleteCommentMutation.error) ?? '코멘트를 삭제하지 못했습니다.'}
                  </p>
                ) : null}
                {resolveCommentMutation.isError ? (
                  <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                    {serverErrorMessage(resolveCommentMutation.error) ?? '코멘트를 해결 처리하지 못했습니다.'}
                  </p>
                ) : null}
              </>
            ) : null}
          </section>

          {canWrite && editMode ? (
            <section aria-label="수정" style={{ width: '100%' }}>
                <div
                  data-testid="estimate-collab-edit-form"
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
                    수정 가능 필드: 비고, 유효기간, 라인별 메모
                  </p>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    비고
                    <Input
                      value={memoDraft}
                      onChange={(event) => setMemoDraft(event.target.value)}
                      aria-label="비고 수정값"
                      maxLength={1000}
                      inputSize="sm"
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    유효기간
                    <Input
                      type="date"
                      value={validUntilDraft}
                      onChange={(event) => setValidUntilDraft(event.target.value)}
                      aria-label="유효기간 수정값"
                      inputSize="sm"
                    />
                  </label>
                  {lines.map((line) => (
                    <div
                      key={line.lineKey}
                      style={{
                        display: 'grid',
                        gap: 4,
                        padding: 8,
                        border: '1px solid var(--color-neutral-200)',
                        borderRadius: 4,
                        gridColumn: '1 / -1',
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
                        <strong>{line.lineKey}번 라인</strong>
                        <span style={{ marginLeft: 6 }}>
                          {line.productName ?? '-'} ({line.modelName ?? '-'})
                        </span>
                        <span style={{ marginLeft: 6 }}>
                          수량 {line.quantity} / 단가 {formatKrw(line.unitPrice)}
                        </span>
                      </div>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                        라인 메모
                        <Input
                          value={lineNoteDrafts[line.lineKey] ?? ''}
                          onChange={(event) => setLineNoteDrafts((prev) => ({
                            ...prev,
                            [line.lineKey]: event.target.value,
                          }))}
                          aria-label={`${line.lineKey}번 라인 메모 수정값`}
                          maxLength={200}
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
      <EstimateVersionHistoryPanel
        estimateId={estimateId}
        status={status}
        activeRevisionNo={activeRevisionNo}
        activeFieldPath={activeFieldPath}
        onRevisionSelect={(revisionNo, fieldPaths, meta) => {
          setActiveRevisionNo(revisionNo)
          setActiveRevisionIsLatest(meta?.isLatest === true)
          setActiveFieldPath(fieldPaths?.[0] ?? null)
        }}
      />
    </section>
  )
}

export default EstimateCollaborationPanel
