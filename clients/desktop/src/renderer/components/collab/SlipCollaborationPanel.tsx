/**
 * 입출고전표 협업 패널 — collab-core slip rollout.
 *
 * 댓글, 수정완료 이력, 기존 버전 이력을 한 화면에 모아 보여준다. UUID 는 API key/path 에만 쓰고,
 * 화면에는 작성자/수정자 실명과 전표번호/내용만 표시한다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Input, Select } from '@samhan/design-system'
import {
  addSlipCollabComment,
  commitSlipCollabEdit,
  deleteSlipCollabComment,
  getSlipCollabComments,
  getSlipCollabEdits,
  resolveSlipCollabComment,
  type SlipCollabComment,
  type SlipCollabEdit,
} from '../../api/slipCollab'
import { SlipCollabRealtimeClient } from '../../realtime/SlipCollabRealtimeClient'
import { usePermissions } from '../../hooks/usePermissions'
import { SlipVersionHistoryPanel } from '../audit/SlipVersionHistoryPanel'

export interface SlipCollaborationPanelProps {
  /** 전표 UUID — query key/API path 전용. 화면 텍스트 노출 금지. */
  slipId: string
  /** overlay 편집 필드의 현재 값 snapshot. */
  currentValues?: Record<string, string | null | undefined>
  /** 상세 상단 "수정" 버튼과 연결되는 편집모드 상태. */
  editMode?: boolean
  /** 편집모드 상태 변경 콜백. */
  onEditModeChange?: (next: boolean) => void
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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  return value.slice(0, 16).replace('T', ' ')
}

function displayName(value: string | null | undefined): string {
  return value && value !== 'system' ? value : '시스템'
}

function summarizeChangeSet(changeSet: string): string {
  try {
    const parsed = JSON.parse(changeSet) as Record<string, { after?: unknown }>
    return Object.entries(parsed)
      .map(([path, change]) => {
        const fieldName = path.replace(/^\/+/, '')
        const label = OVERLAY_FIELD_OPTIONS.find((option) => option.value === fieldName)?.label ?? fieldName
        const after = change.after == null ? '비움' : String(change.after)
        return `${label}: ${after}`
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
    return Object.entries(parsed).map(([path, change]) => {
      const fieldName = path.replace(/^\/+/, '')
      const label = OVERLAY_FIELD_OPTIONS.find((option) => option.value === fieldName)?.label ?? fieldName
      return {
        fieldName,
        label,
        before: change.before == null ? null : String(change.before),
        after: change.after == null ? null : String(change.after),
      }
    })
  } catch {
    return []
  }
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
  currentValues = {},
  editMode = false,
  onEditModeChange,
  onCommitted,
}: SlipCollaborationPanelProps) {
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [commentBody, setCommentBody] = useState('')
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [editReason, setEditReason] = useState('')
  const [editNotice, setEditNotice] = useState<string | null>(null)

  const commentQueryKey = useMemo(() => ['slipCollabComments', slipId] as const, [slipId])
  const editQueryKey = useMemo(() => ['slipCollabEdits', slipId] as const, [slipId])

  const canWriteComments = canAccess('slip.comments', 'create')
  const canResolveComments = canAccess('slip.comments', 'update')
  const canDeleteComments = canAccess('slip.comments', 'delete')
  const canEdit = canAccess('slip.audit-overlay', 'update')

  const commentsQuery = useQuery({
    queryKey: commentQueryKey,
    queryFn: () => getSlipCollabComments(slipId),
    enabled: !!slipId,
  })

  const editsQuery = useQuery({
    queryKey: editQueryKey,
    queryFn: () => getSlipCollabEdits(slipId),
    enabled: !!slipId,
  })

  useEffect(() => {
    if (!editMode) return
    const next: Record<string, string> = {}
    for (const option of OVERLAY_FIELD_OPTIONS) {
      next[option.value] = valueForEdit(currentValues[option.value])
    }
    setEditValues(next)
    setEditReason('')
    setEditNotice(null)
  }, [currentValues, editMode])

  useEffect(() => {
    if (!slipId) return
    const ctrl = SlipCollabRealtimeClient.subscribe(slipId, (evt) => {
      if (!isCollabEvent(evt.event)) return
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
      void queryClient.invalidateQueries({ queryKey: editQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['slipRevisions', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slipAuditLogs', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slip', slipId] })
    })
    return () => ctrl.abort()
  }, [commentQueryKey, editQueryKey, queryClient, slipId])

  const addCommentMutation = useMutation({
    mutationFn: (body: string) => addSlipCollabComment(slipId, { body }),
    onSuccess: () => {
      setCommentBody('')
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
        const before = valueForEdit(currentValues[option.value])
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
      void queryClient.invalidateQueries({ queryKey: editQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['slipAuditLogs', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slipRevisions', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slip', slipId] })
      onCommitted?.()
    },
  })

  const comments: SlipCollabComment[] = Array.isArray(commentsQuery.data) ? commentsQuery.data : []
  const edits: SlipCollabEdit[] = Array.isArray(editsQuery.data)
    ? editsQuery.data
    : []
  const trimmedComment = commentBody.trim()

  return (
    <section data-testid="slip-collaboration-panel" style={{ marginTop: 24 }}>
      <Card padding={4} shadow="sm">
        <h4 style={{ margin: 0, marginBottom: 16 }}>협업</h4>

        <div className="detail-grid" style={{ alignItems: 'start' }}>
          <section aria-label="코멘트">
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
              ) : comments.map((comment) => (
                <article
                  key={comment.id}
                  data-testid="slip-collab-comment-item"
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
                    data-testid="slip-collab-comment-input"
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
                  data-testid="slip-collab-edit-form"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Select value="all" aria-label="수정 가능 필드" selectSize="sm" disabled>
                    <option value="all">수정 가능 필드 11종</option>
                  </Select>
                  {OVERLAY_FIELD_OPTIONS.map((option) => (
                    <label key={option.value} style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                      {option.label}
                      <Input
                        value={editValues[option.value] ?? ''}
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
                {commitMutation.isError ? (
                  <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                    수정완료에 실패했습니다.
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
              data-testid="slip-collab-edit-list"
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
              ) : edits.map((edit) => (
                <article
                  key={edit.id}
                  data-testid="slip-collab-edit-item"
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
                    {parseChangeSetDiffs(edit.changeSet).map((diff) => (
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
                    {parseChangeSetDiffs(edit.changeSet).length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13 }}>{summarizeChangeSet(edit.changeSet)}</p>
                    ) : null}
                  </div>
                  {edit.reason ? (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-600)' }}>
                      사유: {edit.reason}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      </Card>

      <SlipVersionHistoryPanel slipId={slipId} />
    </section>
  )
}

export default SlipCollaborationPanel
