/**
 * 입출고전표 협업 패널 — collab-core slip rollout.
 *
 * 댓글, 수정완료 이력, 기존 버전 이력을 한 화면에 모아 보여준다. UUID 는 API key/path 에만 쓰고,
 * 화면에는 작성자/수정자 실명과 전표번호/내용만 표시한다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Input, safeActorName, Select } from '@samhan/design-system'
import {
  addSlipCollabComment,
  commitSlipCollabEdit,
  deleteSlipCollabComment,
  getSlipCollabComments,
  resolveSlipCollabComment,
  type SlipCollabComment,
} from '../../api/slipCollab'
import { SlipCollabRealtimeClient } from '../../realtime/SlipCollabRealtimeClient'
import { usePermissions } from '../../hooks/usePermissions'
import { SlipVersionHistoryPanel } from '../audit/SlipVersionHistoryPanel'

export interface SlipCollaborationPanelProps {
  /** 전표 UUID — query key/API path 전용. 화면 텍스트 노출 금지. */
  slipId: string
  /** overlay 편집 필드의 현재 값 snapshot. */
  currentValues?: Record<string, string | null | undefined>
  /** 상세 상단 "협업 수정" 버튼과 연결되는 편집모드 상태. */
  editMode?: boolean
  /** 편집모드 상태 변경 콜백. */
  onEditModeChange?: (next: boolean) => void
  /** 외부 lifecycle 전이로 현재 협업 입력 저장이 무효화된 경우의 안내. */
  editBlockedReason?: string | null
  /** dirty 입력 여부를 상세 lifecycle 조정기에 전달한다. */
  onDirtyChange?: (dirty: boolean) => void
  /** 협업 수정 저장 pending 여부를 상세 lifecycle 조정기에 전달한다. */
  onPendingChange?: (pending: boolean) => void
  /** 수정완료 후 상세 화면이 추가 동작을 해야 할 때 사용. */
  onCommitted?: () => void
}

export const OVERLAY_FIELD_OPTIONS = [
  { value: 'memo', label: '메모' },
  { value: 'shippingAddress', label: '배송지' },
  { value: 'inspectionAddress', label: '검수지' },
  { value: 'receiverPhone', label: '수령자 연락처' },
  { value: 'customerTel', label: '거래처 연락처' },
  { value: 'customerAddress', label: '거래처 주소' },
  { value: 'customerRepresentative', label: '거래처 대표자' },
  { value: 'paymentDueLabel', label: '결제 만기' },
  { value: 'discountInfo', label: '할인 정보' },
  { value: 'collectTerm', label: '회수 조건' },
  { value: 'agreeTerm', label: '약정 조건' },
] as const

const EMPTY_CURRENT_VALUES: Record<string, string | null | undefined> = {}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  return value.slice(0, 16).replace('T', ' ')
}

function displayName(value: string | null | undefined): string {
  if (value == null || value.trim().length === 0) return '시스템'
  return safeActorName(value) ?? '변경자 미상'
}

function normalizeCollabAnchor(anchor: string | null | undefined): string | null {
  const normalized = (anchor ?? '').trim().replace(/^\/+/, '').replace(/\//g, '.')
  return normalized.length > 0 ? normalized : null
}

function labelForAnchor(fieldPath: string): string {
  const normalized = fieldPath.replace(/^header\./, '')
  return OVERLAY_FIELD_OPTIONS.find((option) => option.value === normalized)?.label ?? fieldPath
}

function valueForEdit(value: string | null | undefined): string {
  return value ?? ''
}

/**
 * 협업 패널이 invalidate 해야 하는 SSE 이벤트 화이트리스트.
 *
 * <p>SlipDetailPage(SlipRealtimeClient)와 본 패널(SlipCollabRealtimeClient)이 같은 slipId
 * 채널을 2중 구독하므로, `slip:` prefix 전체를 잡으면 비협업 이벤트(slip:edit /
 * slip:edit-request:*)에도 4개 query key 가 중복 invalidate 된다.
 * 협업 산출물(comment.created/resolved/deleted · suggestion.accepted)과
 * 수정완료/버전이력 변동(slip:edit / slip:restored / slip:reverted)만 수신한다 — 나머지 slip:*
 * 이벤트는 SlipDetailPage 구독이 담당.
 *
 * <p>DEFER: 2중 구독 자체의 공유 구독(단일 채널 fan-out) 리팩토링은 침습적이라 본 fix
 * 범위 밖.
 */
function isCollabEvent(eventName: string): boolean {
  return eventName.startsWith('comment.')
    || eventName.startsWith('suggestion.')
    || eventName === 'slip:edit'
    || eventName === 'slip:restored'
    || eventName === 'slip:reverted'
}

export function SlipCollaborationPanel({
  slipId,
  currentValues = EMPTY_CURRENT_VALUES,
  editMode = false,
  onEditModeChange,
  editBlockedReason = null,
  onDirtyChange,
  onPendingChange,
  onCommitted,
}: SlipCollaborationPanelProps) {
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [commentBody, setCommentBody] = useState('')
  const [commentAnchor, setCommentAnchor] = useState('')
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [editReason, setEditReason] = useState('')
  const [editNotice, setEditNotice] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [activeRevisionNo, setActiveRevisionNo] = useState<number | null>(null)
  /**
   * 코멘트 anchor ↔ 버전이력 fieldPath 공유 하이라이트 상태 — 리비전 1건이 헤더 필드 여러 개를
   * 동시에 바꿀 수 있어 배열로 관리한다(PR #747 재수렴 MEDIUM fix). 정방향(코멘트 클릭)은
   * 단일원소 배열([anchor])로, 역방향(버전이력 행 클릭)은 해당 리비전의 fieldPaths 전체로 채운다.
   */
  const [activeFieldPaths, setActiveFieldPaths] = useState<string[]>([])
  const editModeInitializedRef = useRef(false)
  const editBaselineRef = useRef<Record<string, string>>({})

  const commentQueryKey = useMemo(() => ['slipCollabComments', slipId] as const, [slipId])

  const canWriteComments = canAccess('slip.comments', 'create')
  const canResolveComments = canAccess('slip.comments', 'update')
  const canDeleteComments = canAccess('slip.comments', 'delete')
  const canEdit = canAccess('slip.audit-overlay', 'update')

  const commentsQuery = useQuery({
    queryKey: commentQueryKey,
    queryFn: () => getSlipCollabComments(slipId),
    enabled: !!slipId,
  })

  useEffect(() => {
    if (!editMode) {
      editModeInitializedRef.current = false
      editBaselineRef.current = {}
      return
    }
    if (editModeInitializedRef.current) return
    editModeInitializedRef.current = true
    const next: Record<string, string> = {}
    for (const option of OVERLAY_FIELD_OPTIONS) {
      next[option.value] = valueForEdit(currentValues[option.value])
    }
    editBaselineRef.current = next
    setEditValues(next)
    setEditReason('')
    setEditNotice(null)
    setCommitError(null)
  }, [currentValues, editMode])

  useEffect(() => {
    if (!slipId) return
    const ctrl = SlipCollabRealtimeClient.subscribe(slipId, (evt) => {
      if (!isCollabEvent(evt.event)) return
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['slipRevisions', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slipAuditLogs', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slip', slipId] })
    })
    return () => ctrl.abort()
  }, [commentQueryKey, queryClient, slipId])

  const addCommentMutation = useMutation({
    mutationFn: ({ body, anchor }: { body: string; anchor?: string }) =>
      addSlipCollabComment(slipId, { body, anchor }),
    onSuccess: () => {
      setCommentBody('')
      setCommentAnchor('')
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteSlipCollabComment(slipId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const resolveCommentMutation = useMutation({
    mutationFn: (commentId: string) => resolveSlipCollabComment(slipId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const commitMutation = useMutation({
    mutationFn: () => {
      const changeSet: Record<string, { before: string | null; after: string | null }> = {}
      for (const option of OVERLAY_FIELD_OPTIONS) {
        const before = valueForEdit(editBaselineRef.current[option.value])
        const after = valueForEdit(editValues[option.value])
        if (before !== after) {
          changeSet[option.value] = {
            before: before.length === 0 ? null : before,
            after: after.length === 0 ? null : after,
          }
        }
      }
      if (Object.keys(changeSet).length === 0) {
        throw new Error('변경된 필드가 없습니다.')
      }
      return commitSlipCollabEdit(slipId, {
        changeSet: JSON.stringify(changeSet),
        reason: editReason.trim() || undefined,
      })
    },
    onSuccess: () => {
      onEditModeChange?.(false)
      setEditNotice('수정완료되었습니다.')
      void queryClient.invalidateQueries({ queryKey: ['slipAuditLogs', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slipRevisions', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slip', slipId] })
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

  const editDirty = editMode
    && editModeInitializedRef.current
    && (OVERLAY_FIELD_OPTIONS.some((option) => (
      valueForEdit(editBaselineRef.current[option.value]) !== valueForEdit(editValues[option.value])
    )) || editReason.trim().length > 0)

  useEffect(() => {
    onDirtyChange?.(editDirty)
  }, [editDirty, onDirtyChange])

  useEffect(() => {
    onPendingChange?.(commitMutation.isPending)
  }, [commitMutation.isPending, onPendingChange])

  const comments: SlipCollabComment[] = Array.isArray(commentsQuery.data) ? commentsQuery.data : []
  const trimmedComment = commentBody.trim()

  return (
    <section data-testid="slip-collaboration-panel" style={{ marginTop: 24 }}>
      <Card padding={4} shadow="sm">
        <div style={{ display: 'grid', gap: 'var(--space-4, 16px)' }}>
          <section aria-label="코멘트" style={{ width: '100%' }}>
            <h5 style={{ margin: '0 0 10px', fontSize: 14 }}>코멘트</h5>
            <div
              data-testid="slip-collab-comment-list"
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
                const highlighted = !!fieldPath && activeFieldPaths.includes(fieldPath)
                return (
                  <article
                    key={comment.id}
                    data-testid="slip-collab-comment-item"
                    data-active={highlighted ? 'true' : undefined}
                    role={fieldPath ? 'button' : undefined}
                    aria-current={highlighted ? 'true' : undefined}
                    tabIndex={fieldPath ? 0 : undefined}
                    onClick={() => {
                      if (!fieldPath) return
                      setActiveRevisionNo(null)
                      setActiveFieldPaths([fieldPath])
                    }}
                    onKeyDown={(event) => {
                      if (!fieldPath) return
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      setActiveRevisionNo(null)
                      setActiveFieldPaths([fieldPath])
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
                          data-testid="slip-collab-comment-anchor-badge"
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
                    data-testid="slip-collab-comment-anchor-select"
                    aria-label="코멘트 연결 필드"
                    value={commentAnchor}
                    onChange={(event) => setCommentAnchor(event.target.value)}
                    selectSize="sm"
                  >
                    <option value="">전체 코멘트</option>
                    {OVERLAY_FIELD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
                  <textarea
                    data-testid="slip-collab-comment-input"
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
            <section aria-label="협업 수정" style={{ width: '100%' }}>
                {editBlockedReason ? (
                  <p role="alert" style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                    {editBlockedReason}
                  </p>
                ) : null}
                <div
                  data-testid="slip-collab-edit-form"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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
                    수정 가능 필드 11종
                  </p>
                  {OVERLAY_FIELD_OPTIONS.map((option) => (
                    <label key={option.value} style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                      {option.label}
                      <Input
                        value={editValues[option.value] ?? ''}
                        disabled={Boolean(editBlockedReason)}
                        onChange={(event) => setEditValues((prev) => ({
                          ...prev,
                          [option.value]: event.target.value,
                        }))}
                        aria-label={`${option.label} 수정값`}
                        inputSize="sm"
                      />
                    </label>
                  ))}
                  <Input
                    value={editReason}
                    disabled={Boolean(editBlockedReason)}
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
                    disabled={commitMutation.isPending || Boolean(editBlockedReason)}
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

      <SlipVersionHistoryPanel
        slipId={slipId}
        activeRevisionNo={activeRevisionNo}
        activeFieldPaths={activeFieldPaths}
        onRevisionSelect={(revisionNo, fieldPaths) => {
          setActiveRevisionNo(revisionNo)
          // 리비전 행 클릭 시 해당 리비전의 fieldPaths 전체를 그대로 전달한다 — 다중필드 변경
          // 리비전에서 2번째 이후 필드에 anchor 된 코멘트도 역방향으로 하이라이트되어야 한다
          // (PR #747 재수렴 MEDIUM fix — 이전엔 fieldPaths?.[0] 만 채택해 첫 필드만 매칭됐다).
          setActiveFieldPaths(fieldPaths ?? [])
        }}
      />
    </section>
  )
}

export default SlipCollaborationPanel
