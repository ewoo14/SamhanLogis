/**
 * 주문 협업 패널 — PARTNER_ORDER collab rollout.
 *
 * 댓글과 수정완료 이력을 한 화면에 모아 보여준다. UUID 는 API key/path 에만 쓰고,
 * 화면에는 작성자/수정자 실명과 주문번호/라인번호/내용만 표시한다.
 */
import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Input } from '@samhan/design-system'
import {
  addPartnerOrderCollabComment,
  commitPartnerOrderCollabEdit,
  deletePartnerOrderCollabComment,
  getPartnerOrderCollabComments,
  getPartnerOrderCollabEdits,
  resolvePartnerOrderCollabComment,
  type PartnerOrderCollabComment,
  type PartnerOrderCollabEdit,
} from '../../api/partnerOrderCollab'
import { PartnerOrderCollabRealtimeClient } from '../../realtime/PartnerOrderCollabRealtimeClient'
import { usePermissions } from '../../hooks/usePermissions'
import { usePresence } from '../../hooks/usePresence'
import { PartnerOrderPresenceClient } from '../../realtime/createPresenceClient'
import { PresenceIndicator } from './PresenceIndicator'
import { CollaborativeTextField } from './CollaborativeTextField'

export interface PartnerOrderCollabEditableLine {
  /** BE PartnerOrderDocumentCollaborationPort lineKey 와 동일한 1-based 활성 라인 index. */
  lineKey: number
  modelCode: string
  productName: string
  quantity: number
  deliveryPrice: number
  subtotal: number
  convertedQuantity: number
  remark: string | null | undefined
}

export interface PartnerOrderCollabCurrentValues {
  memo?: string | null
  dueDate?: string | null
  lines: PartnerOrderCollabEditableLine[]
}

export interface PartnerOrderCollaborationPanelProps {
  /** 주문 식별자 — query key/API path 전용. 화면 텍스트 노출 금지. */
  orderId: string
  /** overlay 편집 필드의 현재 값 snapshot. */
  currentValues: PartnerOrderCollabCurrentValues
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
  return value && value !== 'system' ? value : '시스템'
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\//g, '.')
}

function lineRemarkPath(lineKey: number): string {
  return `line.${lineKey}.remark`
}

function labelForPath(path: string): string {
  const normalized = normalizePath(path)
  if (normalized === 'memo') return '요청사항'
  if (normalized === 'dueDate') return '납기'
  const lineMatch = normalized.match(/^line\.(\d+)\.remark$/)
  if (lineMatch) {
    // lineKey 는 BE PartnerOrderDocumentCollaborationPort 의 1-based 활성 라인 index 와 동일.
    return `${lineMatch[1]}번 라인 비고`
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

function valueForEdit(value: string | null | undefined): string {
  return value ?? ''
}

function valueForChange(value: string): string | null {
  return value.length === 0 ? null : value
}

function formatKrw(raw: number): string {
  if (!Number.isFinite(raw)) return '-'
  if (raw === 0) return '-'
  return raw.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function isCollabEvent(eventName: string): boolean {
  return eventName.startsWith('comment.')
    || eventName.startsWith('suggestion.')
    || eventName === 'partner-order:edit'
    || eventName === 'partner_order:edit'
    || eventName === 'message'
}

export function PartnerOrderCollaborationPanel({
  orderId,
  currentValues,
  editMode = false,
  onEditModeChange,
  onCommitted,
}: PartnerOrderCollaborationPanelProps) {
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [commentBody, setCommentBody] = useState('')
  const [memoDraft, setMemoDraft] = useState('')
  const [dueDateDraft, setDueDateDraft] = useState('')
  const [lineRemarkDrafts, setLineRemarkDrafts] = useState<Record<number, string>>({})
  const [editReason, setEditReason] = useState('')
  const [editNotice, setEditNotice] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const presenceEntries = usePresence({ entityId: orderId, client: PartnerOrderPresenceClient, enabled: !!orderId })

  const commentQueryKey = useMemo(() => ['partnerOrderCollabComments', orderId] as const, [orderId])
  const editQueryKey = useMemo(() => ['partnerOrderCollabEdits', orderId] as const, [orderId])
  const orderQueryKey = useMemo(() => ['partner-order', orderId] as const, [orderId])

  const collabBasePath = useMemo(
    () => `/partner-orders/${encodeURIComponent(orderId)}`,
    [orderId],
  )

  const canWriteComments = canAccess('sales.partner-order.edit', 'update')
  const canResolveComments = canAccess('sales.partner-order.edit', 'update')
  const canDeleteComments = canAccess('sales.partner-order.edit', 'update')
  const canEdit = canAccess('sales.partner-order.edit', 'update')

  const lines = useMemo(
    () => currentValues.lines.map((line, index) => ({
      ...line,
      lineKey: line.lineKey || index + 1,
    })),
    [currentValues.lines],
  )

  const commentsQuery = useQuery({
    queryKey: commentQueryKey,
    queryFn: () => getPartnerOrderCollabComments(orderId),
    enabled: !!orderId,
  })

  const editsQuery = useQuery({
    queryKey: editQueryKey,
    queryFn: () => getPartnerOrderCollabEdits(orderId),
    enabled: !!orderId,
  })

  useEffect(() => {
    if (!editMode) return
    const nextLineRemarks: Record<number, string> = {}
    for (const line of lines) {
      nextLineRemarks[line.lineKey] = valueForEdit(line.remark)
    }
    setMemoDraft(valueForEdit(currentValues.memo))
    setDueDateDraft(valueForEdit(currentValues.dueDate))
    setLineRemarkDrafts(nextLineRemarks)
    setEditReason('')
    setEditNotice(null)
    setCommitError(null)
  }, [currentValues.dueDate, currentValues.memo, editMode, lines])

  useEffect(() => {
    if (!orderId) return
    const ctrl = PartnerOrderCollabRealtimeClient.subscribe(orderId, (evt) => {
      if (!isCollabEvent(evt.event)) return
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
      void queryClient.invalidateQueries({ queryKey: editQueryKey })
      void queryClient.invalidateQueries({ queryKey: orderQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
    })
    return () => ctrl.abort()
  }, [commentQueryKey, editQueryKey, orderId, orderQueryKey, queryClient])

  const addCommentMutation = useMutation({
    mutationFn: (body: string) => addPartnerOrderCollabComment(orderId, { body }),
    onSuccess: () => {
      setCommentBody('')
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deletePartnerOrderCollabComment(orderId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const resolveCommentMutation = useMutation({
    mutationFn: (commentId: string) => resolvePartnerOrderCollabComment(orderId, commentId),
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

      const beforeDueDate = valueForEdit(currentValues.dueDate)
      if (beforeDueDate !== dueDateDraft) {
        changeSet.dueDate = {
          before: valueForChange(beforeDueDate),
          after: valueForChange(dueDateDraft),
        }
      }

      for (const line of lines) {
        const before = valueForEdit(line.remark)
        const after = valueForEdit(lineRemarkDrafts[line.lineKey])
        if (before !== after) {
          changeSet[lineRemarkPath(line.lineKey)] = {
            before: valueForChange(before),
            after: valueForChange(after),
          }
        }
      }

      if (Object.keys(changeSet).length === 0) {
        throw new Error('변경된 필드가 없습니다.')
      }
      return commitPartnerOrderCollabEdit(orderId, {
        changeSet: JSON.stringify(changeSet),
        reason: editReason.trim() || undefined,
      })
    },
    onSuccess: () => {
      onEditModeChange?.(false)
      setEditNotice('수정완료되었습니다.')
      // setQueryData 금지 — commit 응답은 서버 enrich 필드가 일부 빠질 수 있어 권위 있는 재조회에 위임.
      void queryClient.invalidateQueries({ queryKey: editQueryKey })
      void queryClient.invalidateQueries({ queryKey: orderQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
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

  const comments: PartnerOrderCollabComment[] = Array.isArray(commentsQuery.data) ? commentsQuery.data : []
  const edits: PartnerOrderCollabEdit[] = Array.isArray(editsQuery.data) ? editsQuery.data : []
  const trimmedComment = commentBody.trim()

  return (
    <section data-testid="partner-order-collaboration-panel" style={{ marginTop: 24 }}>
      <Card padding={4} shadow="sm">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <h4 style={{ margin: 0 }}>협업</h4>
          <PresenceIndicator entries={presenceEntries} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <CollaborativeTextField
            documentId={orderId}
            basePath={collabBasePath}
            fieldName="memo"
            label="협업 메모"
            rows={4}
            readOnly={!canWriteComments}
          />
        </div>

        <div className="detail-grid" style={{ alignItems: 'start' }}>
          <section aria-label="코멘트">
            <h5 style={{ margin: '0 0 10px', fontSize: 14 }}>코멘트</h5>
            <div
              data-testid="partner-order-collab-comment-list"
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
              ) : comments.map((comment) => (
                <article
                  key={comment.id}
                  data-testid="partner-order-collab-comment-item"
                  style={{ borderBottom: '1px solid var(--color-neutral-200)', paddingBottom: 8 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                    <strong>{displayName(comment.authorName)}</strong>
                    <span style={{ color: 'var(--color-neutral-500)' }}>{formatDateTime(comment.createdAt)}</span>
                    {comment.status === 'RESOLVED' ? <Badge variant="success">해결</Badge> : null}
                    {canResolveComments && comment.status === 'OPEN' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={resolveCommentMutation.isPending}
                        onClick={() => resolveCommentMutation.mutate(comment.id)}
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
                        onClick={() => deleteCommentMutation.mutate(comment.id)}
                      >
                        삭제
                      </Button>
                    ) : null}
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {comment.body}
                  </p>
                </article>
              ))}
            </div>

            {canWriteComments ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
                  <textarea
                    data-testid="partner-order-collab-comment-input"
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="코멘트 입력..."
                    style={{
                      flex: 1,
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
                    onClick={() => addCommentMutation.mutate(trimmedComment)}
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

          <section aria-label="수정 이력">
            <h5 style={{ margin: '0 0 10px', fontSize: 14 }}>수정 이력</h5>

            {canEdit && editMode ? (
              <>
                <div
                  data-testid="partner-order-collab-edit-form"
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
                    수정 가능 필드: 요청사항, 납기, 라인별 비고
                  </p>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    요청사항
                    <Input
                      value={memoDraft}
                      onChange={(event) => setMemoDraft(event.target.value)}
                      aria-label="요청사항 수정값"
                      maxLength={1000}
                      inputSize="sm"
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    납기
                    <Input
                      type="date"
                      value={dueDateDraft}
                      onChange={(event) => setDueDateDraft(event.target.value)}
                      aria-label="납기 수정값"
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
                          {line.productName} ({line.modelCode})
                        </span>
                        <span style={{ marginLeft: 6 }}>
                          수량 {line.quantity} / 단가 {formatKrw(line.deliveryPrice)} / 소계 {formatKrw(line.subtotal)}
                        </span>
                        {line.convertedQuantity > 0 ? (
                          <span style={{ marginLeft: 6 }}>전환 {line.convertedQuantity}</span>
                        ) : null}
                      </div>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                        라인 비고
                        <Input
                          value={lineRemarkDrafts[line.lineKey] ?? ''}
                          onChange={(event) => setLineRemarkDrafts((prev) => ({
                            ...prev,
                            [line.lineKey]: event.target.value,
                          }))}
                          aria-label={`${line.lineKey}번 라인 비고 수정값`}
                          maxLength={500}
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
              </>
            ) : null}
            {editNotice ? (
              <p role="status" style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-success-700, #047857)' }}>
                {editNotice}
              </p>
            ) : null}

            <div
              data-testid="partner-order-collab-edit-list"
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
                    data-testid="partner-order-collab-edit-item"
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
                      {diffs.map((diff) => (
                        <div key={`${edit.id}-${diff.fieldName}`} style={{ fontSize: 13 }}>
                          <strong>{diff.label}</strong>
                          <span style={{ marginLeft: 8, color: 'var(--color-neutral-500)', textDecoration: 'line-through' }}>
                            {diff.before ?? '이전값 미기록'}
                          </span>
                          <span aria-hidden="true" style={{ margin: '0 6px', color: 'var(--color-neutral-400)' }}>→</span>
                          <span style={{ color: 'var(--color-brand-700, #0F766E)', fontWeight: 700 }}>
                            {diff.after ?? '비움'}
                          </span>
                        </div>
                      ))}
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
          </section>
        </div>
      </Card>
    </section>
  )
}

export default PartnerOrderCollaborationPanel
