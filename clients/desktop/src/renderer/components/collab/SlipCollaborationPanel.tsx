/**
 * 입출고전표 협업 패널 — collab-core slip rollout.
 *
 * 댓글, 수정 제안, 기존 버전 이력을 한 화면에 모아 보여준다. UUID 는 API key/path 에만 쓰고,
 * 화면에는 작성자/제안자 실명과 전표번호/내용만 표시한다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Input, Select } from '@samhan/design-system'
import {
  acceptSlipCollabSuggestion,
  addSlipCollabComment,
  deleteSlipCollabComment,
  getSlipCollabComments,
  getSlipCollabSuggestions,
  proposeSlipCollabSuggestion,
  rejectSlipCollabSuggestion,
  resolveSlipCollabComment,
  withdrawSlipCollabSuggestion,
  type SlipCollabComment,
  type SlipCollabSuggestion,
  type SlipCollabSuggestionStatus,
} from '../../api/slipCollab'
import { SlipCollabRealtimeClient } from '../../realtime/SlipCollabRealtimeClient'
import { usePermissions } from '../../hooks/usePermissions'
import { SlipVersionHistoryPanel } from '../audit/SlipVersionHistoryPanel'

export interface SlipCollaborationPanelProps {
  /** 전표 UUID — query key/API path 전용. 화면 텍스트 노출 금지. */
  slipId: string
}

const SUGGESTION_STATUS_LABEL: Record<SlipCollabSuggestionStatus, string> = {
  PROPOSED: '제안',
  ACCEPTED: '수락',
  REJECTED: '거절',
  WITHDRAWN: '철회',
}

const SUGGESTION_STATUS_VARIANT: Record<
  SlipCollabSuggestionStatus,
  'neutral' | 'brand' | 'success' | 'danger'
> = {
  PROPOSED: 'brand',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
}

const OVERLAY_FIELD_OPTIONS = [
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

function isCollabEvent(eventName: string): boolean {
  return eventName.startsWith('comment.')
    || eventName.startsWith('suggestion.')
    || eventName.startsWith('slip:')
}

export function SlipCollaborationPanel({ slipId }: SlipCollaborationPanelProps) {
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [commentBody, setCommentBody] = useState('')
  const [suggestField, setSuggestField] = useState<(typeof OVERLAY_FIELD_OPTIONS)[number]['value']>('memo')
  const [suggestAfter, setSuggestAfter] = useState('')
  const [suggestReason, setSuggestReason] = useState('')
  const [rejectReasonById, setRejectReasonById] = useState<Record<string, string>>({})

  const commentQueryKey = useMemo(() => ['slipCollabComments', slipId] as const, [slipId])
  const suggestionQueryKey = useMemo(() => ['slipCollabSuggestions', slipId] as const, [slipId])

  const canWriteComments = canAccess('slip.comments', 'create')
  const canManageComments = canAccess('slip.comments', 'update')
  const canSuggest = canAccess('slip.audit-overlay', 'update')

  const commentsQuery = useQuery({
    queryKey: commentQueryKey,
    queryFn: () => getSlipCollabComments(slipId),
    enabled: !!slipId,
  })

  const suggestionsQuery = useQuery({
    queryKey: suggestionQueryKey,
    queryFn: () => getSlipCollabSuggestions(slipId),
    enabled: !!slipId,
  })

  useEffect(() => {
    if (!slipId) return
    const ctrl = SlipCollabRealtimeClient.subscribe(slipId, (evt) => {
      if (!isCollabEvent(evt.event)) return
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
      void queryClient.invalidateQueries({ queryKey: suggestionQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['slipRevisions', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slip', slipId] })
    })
    return () => ctrl.abort()
  }, [commentQueryKey, queryClient, slipId, suggestionQueryKey])

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

  const proposeMutation = useMutation({
    mutationFn: () => proposeSlipCollabSuggestion(slipId, {
      changeSet: JSON.stringify({
        [suggestField]: {
          after: suggestAfter.trim().length === 0 ? null : suggestAfter.trim(),
        },
      }),
      reason: suggestReason.trim() || undefined,
    }),
    onSuccess: () => {
      setSuggestAfter('')
      setSuggestReason('')
      void queryClient.invalidateQueries({ queryKey: suggestionQueryKey })
    },
  })

  const acceptMutation = useMutation({
    mutationFn: (suggestionId: string) => acceptSlipCollabSuggestion(slipId, suggestionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: suggestionQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['slipRevisions', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slip', slipId] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (suggestionId: string) =>
      rejectSlipCollabSuggestion(slipId, suggestionId, rejectReasonById[suggestionId]?.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: suggestionQueryKey })
    },
  })

  const withdrawMutation = useMutation({
    mutationFn: (suggestionId: string) => withdrawSlipCollabSuggestion(slipId, suggestionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: suggestionQueryKey })
    },
  })

  const comments: SlipCollabComment[] = Array.isArray(commentsQuery.data) ? commentsQuery.data : []
  const suggestions: SlipCollabSuggestion[] = Array.isArray(suggestionsQuery.data)
    ? suggestionsQuery.data
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
                    {canManageComments && comment.status === 'OPEN' ? (
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
                    {canManageComments ? (
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

          <section aria-label="수정 제안">
            <h5 style={{ margin: '0 0 10px', fontSize: 14 }}>수정 제안</h5>

            {canSuggest ? (
              <>
                <div
                  data-testid="slip-collab-suggestion-form"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px, 0.35fr) minmax(160px, 1fr)',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Select
                    value={suggestField}
                    onChange={(event) => setSuggestField(event.target.value as typeof suggestField)}
                    aria-label="제안 필드"
                    selectSize="sm"
                  >
                    {OVERLAY_FIELD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                  <Input
                    value={suggestAfter}
                    onChange={(event) => setSuggestAfter(event.target.value)}
                    placeholder="변경 후 값"
                    aria-label="변경 후 값"
                    inputSize="sm"
                  />
                  <Input
                    value={suggestReason}
                    onChange={(event) => setSuggestReason(event.target.value)}
                    placeholder="사유"
                    maxLength={500}
                    style={{ gridColumn: '1 / -1' }}
                    aria-label="제안 사유"
                    inputSize="sm"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    loading={proposeMutation.isPending}
                    disabled={proposeMutation.isPending}
                    onClick={() => proposeMutation.mutate()}
                  >
                    제안
                  </Button>
                </div>
                {proposeMutation.isError ? (
                  <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                    수정 제안을 등록하지 못했습니다.
                  </p>
                ) : null}
              </>
            ) : null}

            <div
              data-testid="slip-collab-suggestion-list"
              style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}
            >
              {suggestionsQuery.isLoading ? (
                <p style={{ margin: 0, color: 'var(--color-neutral-500)' }}>제안을 불러오는 중...</p>
              ) : suggestionsQuery.isError ? (
                <p role="alert" style={{ margin: 0, color: 'var(--color-danger-600)' }}>
                  제안을 불러오지 못했습니다.
                </p>
              ) : suggestions.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--color-neutral-500)' }}>아직 수정 제안이 없습니다.</p>
              ) : suggestions.map((suggestion) => (
                <article
                  key={suggestion.id}
                  data-testid="slip-collab-suggestion-item"
                  style={{ borderBottom: '1px solid var(--color-neutral-200)', paddingBottom: 8 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                    <strong>{displayName(suggestion.proposerName)}</strong>
                    <Badge variant={SUGGESTION_STATUS_VARIANT[suggestion.status]}>
                      {SUGGESTION_STATUS_LABEL[suggestion.status]}
                    </Badge>
                    <span style={{ color: 'var(--color-neutral-500)' }}>{formatDateTime(suggestion.createdAt)}</span>
                    {suggestion.decidedByName ? (
                      <span style={{ color: 'var(--color-neutral-600)' }}>
                        결정: {displayName(suggestion.decidedByName)}
                      </span>
                    ) : null}
                  </div>
                  <p style={{ margin: '6px 0 4px', fontSize: 13 }}>
                    {summarizeChangeSet(suggestion.changeSet)}
                  </p>
                  {suggestion.reason ? (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-600)' }}>
                      사유: {suggestion.reason}
                    </p>
                  ) : null}
                  {suggestion.status === 'PROPOSED' && canSuggest ? (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={acceptMutation.isPending}
                          onClick={() => acceptMutation.mutate(suggestion.id)}
                        >
                          수락
                        </Button>
                        <Input
                          value={rejectReasonById[suggestion.id] ?? ''}
                          onChange={(event) => setRejectReasonById((prev) => ({
                            ...prev,
                            [suggestion.id]: event.target.value,
                          }))}
                          placeholder="거절 사유"
                          maxLength={500}
                          aria-label="거절 사유"
                          inputSize="sm"
                          fullWidth={false}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={rejectMutation.isPending}
                          onClick={() => rejectMutation.mutate(suggestion.id)}
                        >
                          거절
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={withdrawMutation.isPending}
                          onClick={() => withdrawMutation.mutate(suggestion.id)}
                        >
                          철회
                        </Button>
                      </div>
                      {acceptMutation.isError ? (
                        <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                          수락 처리에 실패했습니다.
                        </p>
                      ) : null}
                      {rejectMutation.isError ? (
                        <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                          거절 처리에 실패했습니다.
                        </p>
                      ) : null}
                      {withdrawMutation.isError ? (
                        <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                          철회 처리에 실패했습니다.
                        </p>
                      ) : null}
                    </>
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
