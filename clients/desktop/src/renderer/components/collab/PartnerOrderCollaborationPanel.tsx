/**
 * 주문 협업 패널 — PARTNER_ORDER collab rollout.
 *
 * 댓글과 수정완료 이력을 한 화면에 모아 보여준다. UUID 는 API key/path 에만 쓰고,
 * 화면에는 작성자/수정자 실명과 주문번호/라인번호/내용만 표시한다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Input, safeActorName, Select } from '@samhan/design-system'
import {
  addPartnerOrderCollabComment,
  commitPartnerOrderCollabEdit,
  deletePartnerOrderCollabComment,
  getPartnerOrderCollabComments,
  resolvePartnerOrderCollabComment,
  type PartnerOrderCollabComment,
} from '../../api/partnerOrderCollab'
import type { PartnerOrderStatus } from '../../api/sales'
import { PartnerOrderCollabRealtimeClient } from '../../realtime/PartnerOrderCollabRealtimeClient'
import { usePermissions } from '../../hooks/usePermissions'
import { usePresence } from '../../hooks/usePresence'
import { PartnerOrderPresenceClient } from '../../realtime/createPresenceClient'
import { PresenceIndicator } from './PresenceIndicator'
import { PartnerOrderVersionHistoryPanel } from '../audit/PartnerOrderVersionHistoryPanel'
import { AuthorityCommitDeduper } from './authorityCommitDeduper'

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
  /** 현재 주문 상태 — 버전이력 복원 가드에 전달한다. */
  status: PartnerOrderStatus
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
  if (value == null || value.trim().length === 0) return '시스템'
  return safeActorName(value) ?? '변경자 미상'
}

function lineRemarkPath(lineKey: number): string {
  return `line.${lineKey}.remark`
}

function normalizeCollabAnchor(anchor: string | null | undefined): string | null {
  const normalized = (anchor ?? '').trim().replace(/^\/+/, '').replace(/\//g, '.')
  return normalized.length > 0 ? normalized : null
}

function labelForAnchor(fieldPath: string): string {
  if (fieldPath === 'memo') return '요청사항'
  if (fieldPath === 'dueDate') return '납기'
  const lineMatch = fieldPath.match(/^line\.(\d+)\.remark$/)
  if (lineMatch) return `${lineMatch[1]}번 라인 비고`
  return fieldPath
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

const PARTNER_ORDER_AUTHORITY_EVENT = 'partner-order:authority'

/** 서버 권위 사건에서 소비 멱등 키만 추출한다. 문서/snapshot은 의도적으로 읽지 않는다. */
function authorityCommitId(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('commitId' in data)) return null
  const commitId = (data as { commitId?: unknown }).commitId
  return typeof commitId === 'string' && commitId.trim().length > 0 ? commitId.trim() : null
}

export function PartnerOrderCollaborationPanel({
  orderId,
  status,
  currentValues,
  editMode = false,
  onEditModeChange,
  onCommitted,
}: PartnerOrderCollaborationPanelProps) {
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [commentBody, setCommentBody] = useState('')
  const [commentAnchor, setCommentAnchor] = useState('')
  const [memoDraft, setMemoDraft] = useState('')
  const [dueDateDraft, setDueDateDraft] = useState('')
  const [lineRemarkDrafts, setLineRemarkDrafts] = useState<Record<number, string>>({})
  const [editReason, setEditReason] = useState('')
  const [editNotice, setEditNotice] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [activeRevisionNo, setActiveRevisionNo] = useState<number | null>(null)
  const [activeFieldPath, setActiveFieldPath] = useState<string | null>(null)
  const [activeRevisionIsLatest, setActiveRevisionIsLatest] = useState(false)
  const authorityCommitIdsRef = useRef(new AuthorityCommitDeduper())
  const editDraftInitializedRef = useRef(false)
  const presenceEntries = usePresence({ entityId: orderId, client: PartnerOrderPresenceClient, enabled: !!orderId })

  const commentQueryKey = useMemo(() => ['partnerOrderCollabComments', orderId] as const, [orderId])
  const orderQueryKey = useMemo(() => ['partner-order', orderId] as const, [orderId])

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

  useEffect(() => {
    if (!editMode) {
      editDraftInitializedRef.current = false
      return
    }
    if (editDraftInitializedRef.current) return
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
    editDraftInitializedRef.current = true
  }, [currentValues.dueDate, currentValues.memo, editMode, lines])

  useEffect(() => {
    if (!orderId) return
    const ctrl = PartnerOrderCollabRealtimeClient.subscribe(orderId, (evt) => {
      if (evt.event === PARTNER_ORDER_AUTHORITY_EVENT) {
        const commitId = authorityCommitId(evt.data)
        if (!commitId || !authorityCommitIdsRef.current.consume(commitId)) return

        // 서버가 권위 데이터를 재조회하게 한다. snapshot/Y.Doc에는 쓰지 않아
        // 다른 세션의 미저장 draft와 CRDT 구조를 보존한다.
        void queryClient.invalidateQueries({ queryKey: orderQueryKey })
        void queryClient.invalidateQueries({ queryKey: ['partner-order-revisions', orderId] })
        void queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
        return
      }
      if (!isCollabEvent(evt.event)) return
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
      void queryClient.invalidateQueries({ queryKey: orderQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
    })
    return () => ctrl.abort()
  }, [commentQueryKey, orderId, orderQueryKey, queryClient])

  const addCommentMutation = useMutation({
    mutationFn: ({ body, anchor }: { body: string; anchor?: string }) =>
      addPartnerOrderCollabComment(orderId, { body, anchor }),
    onSuccess: () => {
      setCommentBody('')
      setCommentAnchor('')
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
  const trimmedComment = commentBody.trim()
  const highlightsLatestAnchoredComments = activeRevisionNo !== null && activeRevisionIsLatest

  return (
    <section data-testid="partner-order-collaboration-panel" style={{ marginTop: 24 }}>
      <Card padding={4} shadow="sm">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: presenceEntries.length > 0 ? 12 : 0 }}>
          <PresenceIndicator entries={presenceEntries} />
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-4, 16px)' }}>
          <section aria-label="코멘트" style={{ width: '100%' }}>
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
              ) : comments.map((comment) => {
                const fieldPath = normalizeCollabAnchor(comment.anchor)
                const anchorLabel = fieldPath ? labelForAnchor(fieldPath) : null
                const highlighted = !!fieldPath
                  && (fieldPath === activeFieldPath || highlightsLatestAnchoredComments)
                return (
                <article
                  key={comment.id}
                  data-testid="partner-order-collab-comment-item"
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
                        data-testid="partner-order-collab-comment-anchor-badge"
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
                    data-testid="partner-order-collab-comment-anchor-select"
                    aria-label="코멘트 연결 필드"
                    value={commentAnchor}
                    onChange={(event) => setCommentAnchor(event.target.value)}
                    selectSize="sm"
                  >
                    <option value="">전체 코멘트</option>
                    <option value="memo">요청사항</option>
                    <option value="dueDate">납기</option>
                    {lines.map((line) => (
                      <option key={line.lineKey} value={lineRemarkPath(line.lineKey)}>
                        {line.lineKey}번 라인 비고
                      </option>
                    ))}
                  </Select>
                </label>
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
            </section>
          ) : null}
          {editNotice ? (
            <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--color-success-700, #047857)' }}>
              {editNotice}
            </p>
          ) : null}
        </div>
      </Card>
      <PartnerOrderVersionHistoryPanel
        orderId={orderId}
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

export default PartnerOrderCollaborationPanel
