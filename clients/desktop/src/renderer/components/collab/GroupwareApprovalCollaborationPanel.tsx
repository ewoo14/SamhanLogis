/**
 * 그룹웨어 결재 협업 패널.
 *
 * 결재 문서 title/content 수정완료와 코멘트를 한 화면에서 처리한다. approvalId 는
 * query key/API path 전용이며 화면에는 approvalNo 와 본문 정보만 표시한다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Input } from '@samhan/design-system'
import {
  addGroupwareApprovalCollabComment,
  commitGroupwareApprovalCollabEdit,
  deleteGroupwareApprovalCollabComment,
  getGroupwareApprovalCollabComments,
  resolveGroupwareApprovalCollabComment,
  type GroupwareApprovalCollabComment,
} from '../../api/groupwareApprovalCollab'
import type { ApprovalStatus } from '../../api/groupwareApproval'
import type { ApprovalTemplateField } from '../../api/groupwareApprovalTemplate'
import { DynamicApprovalFieldInput } from '../groupware/DynamicApprovalFieldInput'
import { GroupwareApprovalCollabRealtimeClient } from '../../realtime/GroupwareApprovalCollabRealtimeClient'
import { usePermissions } from '../../hooks/usePermissions'
import { usePresence } from '../../hooks/usePresence'
import { GroupwareApprovalPresenceClient } from '../../realtime/createPresenceClient'
import { PresenceIndicator } from './PresenceIndicator'
import { CollaborativeSlipInput } from './CollaborativeSlipInput'
import { CollaborativeSlipTextArea } from './CollaborativeSlipTextArea'
import { createDocCoeditProvider, type DocCoeditProvider } from '../../realtime/createCoeditProvider'

export interface GroupwareApprovalCollabCurrentValues {
  title: string
  content?: string | null
  fieldValues?: Record<string, string>
}

export interface GroupwareApprovalCollaborationPanelProps {
  approvalId: string
  approvalNo: string
  status: ApprovalStatus
  currentValues: GroupwareApprovalCollabCurrentValues
  templateFields?: ApprovalTemplateField[]
  onCommitted?: () => void
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  return value.slice(0, 16).replace('T', ' ')
}

function displayName(value: string | null | undefined): string {
  return value && value !== 'system' ? value : '시스템'
}

function normalizeCollabAnchor(anchor: string | null | undefined): string | null {
  const normalized = (anchor ?? '').trim().replace(/^\/+/, '').replace(/\//g, '.')
  return normalized.length > 0 ? normalized : null
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

function isCollabEvent(eventName: string): boolean {
  return eventName.startsWith('comment.')
    || eventName.startsWith('suggestion.')
}

function isEditableStatus(status: ApprovalStatus): boolean {
  return status === 'PENDING' || status === 'IN_PROGRESS'
}

function dynamicFieldCoeditKey(fieldKey: string): string {
  return `field_${fieldKey}`
}

function seedGroupwareApprovalCoeditProvider(
  provider: DocCoeditProvider,
  currentValues: GroupwareApprovalCollabCurrentValues,
  templateFields: ApprovalTemplateField[],
) {
  provider.setHeaderValue('title', valueForEdit(currentValues.title))
  provider.setHeaderValue('content', valueForEdit(currentValues.content))
  for (const field of templateFields) {
    provider.setHeaderValue(
      dynamicFieldCoeditKey(field.fieldKey),
      valueForEdit(currentValues.fieldValues?.[field.fieldKey]),
    )
  }
}

export function GroupwareApprovalCollaborationPanel({
  approvalId,
  approvalNo,
  status,
  currentValues,
  templateFields = [],
  onCommitted,
}: GroupwareApprovalCollaborationPanelProps) {
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [commentBody, setCommentBody] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [contentDraft, setContentDraft] = useState('')
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({})
  const [editReason, setEditReason] = useState('')
  const [editNotice, setEditNotice] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [approvalFormCoeditProvider, setApprovalFormCoeditProvider] = useState<DocCoeditProvider | null>(null)
  const [approvalFormCoeditPending, setApprovalFormCoeditPending] = useState(false)
  const [activeFieldPath, setActiveFieldPath] = useState<string | null>(null)
  const currentValuesRef = useRef(currentValues)
  currentValuesRef.current = currentValues
  const presenceEntries = usePresence({ entityId: approvalId, client: GroupwareApprovalPresenceClient, enabled: !!approvalId })

  const commentQueryKey = useMemo(() => ['groupwareApprovalCollabComments', approvalId] as const, [approvalId])
  const approvalQueryKey = useMemo(() => ['groupwareApproval', approvalId] as const, [approvalId])
  const approvalListQueryKey = useMemo(() => ['groupwareApprovals'] as const, [])
  const collabBasePath = useMemo(
    () => `/admin/groupware/approvals/${encodeURIComponent(approvalId)}`,
    [approvalId],
  )
  const approvalHeaderTextFields = useMemo(
    () => new Set([
      'content',
      ...templateFields
        .filter((field) => field.fieldType === 'TEXTAREA')
        .map((field) => dynamicFieldCoeditKey(field.fieldKey)),
    ]),
    [templateFields],
  )

  const canWrite = canAccess('groupware.approvals', 'update')
  const canStartEdit = isEditableStatus(status) && canWrite
  const locked = !isEditableStatus(status)

  const commentsQuery = useQuery({
    queryKey: commentQueryKey,
    queryFn: () => getGroupwareApprovalCollabComments(approvalId),
    enabled: !!approvalId,
  })

  useEffect(() => {
    if (!editMode) return
    if (approvalFormCoeditProvider) return
    setTitleDraft(valueForEdit(currentValues.title))
    setContentDraft(valueForEdit(currentValues.content))
    setFieldDrafts({ ...(currentValues.fieldValues ?? {}) })
    setEditReason('')
    setEditNotice(null)
    setCommitError(null)
  }, [approvalFormCoeditProvider, currentValues.content, currentValues.fieldValues, currentValues.title, editMode])

  useEffect(() => {
    if (!approvalId || !editMode || !canWrite) {
      setApprovalFormCoeditProvider(null)
      setApprovalFormCoeditPending(false)
      return undefined
    }

    let disposed = false
    let provider: DocCoeditProvider | null = null
    let unsubscribeDoc: (() => void) | null = null
    setApprovalFormCoeditPending(true)

    const applyProviderState = (nextProvider: DocCoeditProvider) => {
      setTitleDraft(nextProvider.getHeaderValue('title'))
      setContentDraft(nextProvider.getHeaderValue('content'))
      setFieldDrafts((current) => {
        const next = { ...current }
        for (const field of templateFields) {
          next[field.fieldKey] = nextProvider.getHeaderValue(dynamicFieldCoeditKey(field.fieldKey))
        }
        return next
      })
    }

    void createDocCoeditProvider({
      documentId: approvalId,
      basePath: collabBasePath,
      headerTextFields: approvalHeaderTextFields,
    }).then((nextProvider) => {
      if (disposed) {
        nextProvider.destroy()
        return
      }
      provider = nextProvider
      if (nextProvider.isEmpty()) {
        seedGroupwareApprovalCoeditProvider(nextProvider, currentValuesRef.current, templateFields)
      }
      applyProviderState(nextProvider)
      unsubscribeDoc = nextProvider.subscribeDoc(() => applyProviderState(nextProvider))
      setApprovalFormCoeditProvider(nextProvider)
      setApprovalFormCoeditPending(false)
    }).catch(() => {
      if (disposed) return
      setApprovalFormCoeditProvider(null)
      setApprovalFormCoeditPending(false)
    })

    return () => {
      disposed = true
      unsubscribeDoc?.()
      provider?.destroy()
      setApprovalFormCoeditProvider(null)
      setApprovalFormCoeditPending(false)
    }
  }, [approvalHeaderTextFields, approvalId, canWrite, collabBasePath, editMode, templateFields])

  useEffect(() => {
    if (!approvalId) return
    const ctrl = GroupwareApprovalCollabRealtimeClient.subscribe(approvalId, (evt) => {
      if (!isCollabEvent(evt.event)) return
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
      void queryClient.invalidateQueries({ queryKey: approvalQueryKey })
      void queryClient.invalidateQueries({ queryKey: approvalListQueryKey })
    })
    return () => ctrl.abort()
  }, [approvalId, approvalListQueryKey, approvalQueryKey, commentQueryKey, queryClient])

  const addCommentMutation = useMutation({
    mutationFn: (body: string) => addGroupwareApprovalCollabComment(approvalId, { body }),
    onSuccess: () => {
      setCommentBody('')
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteGroupwareApprovalCollabComment(approvalId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const resolveCommentMutation = useMutation({
    mutationFn: (commentId: string) => resolveGroupwareApprovalCollabComment(approvalId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentQueryKey })
    },
  })

  const commitMutation = useMutation({
    mutationFn: () => {
      // BE 계약 = path -> {after} (before 는 GroupwareApprovalDocumentCollaborationPort
      // .enrichChangeSetWithBefore 가 DB 현재값으로 채운다 — FE before 전송은 무시·덮어쓰기됨).
      const changeSet: Record<string, { after: string | null }> = {}
      const beforeTitle = valueForEdit(currentValues.title)
      if (beforeTitle !== titleDraft) {
        changeSet.title = { after: valueForChange(titleDraft) }
      }
      const beforeContent = valueForEdit(currentValues.content)
      if (beforeContent !== contentDraft) {
        changeSet.content = { after: valueForChange(contentDraft) }
      }
      for (const field of templateFields) {
        const before = valueForEdit(currentValues.fieldValues?.[field.fieldKey])
        const after = valueForEdit(fieldDrafts[field.fieldKey])
        if (before !== after) {
          changeSet[`field.${field.fieldKey}`] = { after: valueForChange(after) }
        }
      }
      if (Object.keys(changeSet).length === 0) {
        throw new Error('변경된 필드가 없습니다.')
      }
      return commitGroupwareApprovalCollabEdit(approvalId, {
        changeSet: JSON.stringify(changeSet),
        reason: editReason.trim() || undefined,
      })
    },
    onSuccess: (response) => {
      setEditMode(false)
      setEditNotice('수정완료되었습니다.')
      queryClient.setQueryData(approvalQueryKey, response.approval)
      void queryClient.invalidateQueries({ queryKey: approvalQueryKey })
      void queryClient.invalidateQueries({ queryKey: approvalListQueryKey })
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

  const comments: GroupwareApprovalCollabComment[] = Array.isArray(commentsQuery.data) ? commentsQuery.data : []
  const trimmedComment = commentBody.trim()

  return (
    <section data-testid="groupware-approval-collaboration-panel" style={{ marginTop: 24 }}>
      <Card padding={4} shadow="sm">
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <PresenceIndicator entries={presenceEntries} />
            <span style={{ fontSize: 12, color: 'var(--color-neutral-500)', fontVariantNumeric: 'tabular-nums' }}>
              {approvalNo}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-4, 16px)' }}>
          <section aria-label="코멘트" style={{ width: '100%' }}>
            <h5 style={{ margin: '0 0 10px', fontSize: 14 }}>코멘트</h5>
            <div
              data-testid="groupware-approval-collab-comment-list"
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
                const highlighted = !!fieldPath && fieldPath === activeFieldPath
                return (
                <article
                  key={comment.id}
                  data-testid="groupware-approval-collab-comment-item"
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
                  <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {comment.body}
                  </p>
                </article>
                )
              })}
            </div>

            {canWrite ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
                  <textarea
                    data-testid="groupware-approval-collab-comment-input"
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
                    onClick={() => addCommentMutation.mutate(trimmedComment)}
                  >
                    등록
                  </Button>
                </div>
                {addCommentMutation.isError || deleteCommentMutation.isError || resolveCommentMutation.isError ? (
                  <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                    {serverErrorMessage(addCommentMutation.error)
                      ?? serverErrorMessage(deleteCommentMutation.error)
                      ?? serverErrorMessage(resolveCommentMutation.error)
                      ?? '코멘트 처리에 실패했습니다.'}
                  </p>
                ) : null}
              </>
            ) : null}
          </section>

          <section aria-label="수정" style={{ width: '100%' }}>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {canStartEdit && !editMode ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setEditMode(true)}
                  data-testid="groupware-approval-collab-edit-start"
                >
                  수정
                </Button>
              ) : null}
              {locked && canWrite ? (
                <span
                  data-testid="groupware-approval-collab-locked"
                  style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
                >
                  최종 승인, 반려, 회수된 결재 문서는 제목/내용을 수정할 수 없습니다.
                </span>
              ) : null}
            </header>

            {editMode ? (
              <div
                data-testid="groupware-approval-collab-edit-form"
                style={{
                  display: 'grid',
                  gap: 8,
                  padding: 10,
                  border: '1px solid var(--color-neutral-200)',
                  borderRadius: 4,
                  background: 'var(--color-neutral-50)',
                  marginBottom: 12,
                }}
              >
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                  제목
                  <CollaborativeSlipInput
                    provider={approvalFormCoeditProvider}
                    coeditPending={approvalFormCoeditPending}
                    fieldPath="header.title"
                    value={titleDraft}
                    onValueChange={setTitleDraft}
                    aria-label="제목 수정값"
                    maxLength={200}
                    inputSize="sm"
                    data-testid="groupware-approval-collab-edit-title"
                  />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                  내용
                  <CollaborativeSlipTextArea
                    provider={approvalFormCoeditProvider}
                    coeditPending={approvalFormCoeditPending}
                    fieldPath="header.content"
                    value={contentDraft}
                    onValueChange={setContentDraft}
                    maxLength={2000}
                    rows={5}
                    aria-label="내용 수정값"
                    data-testid="groupware-approval-collab-edit-content"
                    textareaStyle={{
                      width: '100%',
                      resize: 'vertical',
                      minHeight: 112,
                      padding: '8px 10px',
                      borderRadius: 4,
                      border: '1px solid var(--color-neutral-300)',
                      fontSize: 13,
                      fontFamily: 'inherit',
                    }}
                  />
                </label>
                {templateFields.length > 0 ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <h6 style={{ margin: '4px 0 0', fontSize: 12 }}>세부 필드</h6>
                    {templateFields.map((field) => (
                      <DynamicApprovalFieldInput
                        key={field.fieldKey}
                        field={field}
                        value={fieldDrafts[field.fieldKey] ?? ''}
                        onChange={(value) => setFieldDrafts((current) => ({ ...current, [field.fieldKey]: value }))}
                        provider={approvalFormCoeditProvider}
                        fieldPath={`header.${dynamicFieldCoeditKey(field.fieldKey)}`}
                        coeditPending={approvalFormCoeditPending}
                      />
                    ))}
                  </div>
                ) : null}
                {approvalFormCoeditPending ? (
                  <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-500)' }}>
                    협업 연결 중…
                  </p>
                ) : null}
                <Input
                  value={editReason}
                  onChange={(event) => setEditReason(event.target.value)}
                  placeholder="사유"
                  maxLength={500}
                  aria-label="수정 사유"
                  inputSize="sm"
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={commitMutation.isPending}
                    onClick={() => setEditMode(false)}
                  >
                    취소
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    loading={commitMutation.isPending}
                    disabled={commitMutation.isPending || approvalFormCoeditPending}
                    onClick={() => commitMutation.mutate()}
                    data-testid="groupware-approval-collab-edit-submit"
                  >
                    수정완료
                  </Button>
                </div>
                {commitError ? (
                  <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
                    {commitError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {editNotice ? (
              <p role="status" style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-success-700, #047857)' }}>
                {editNotice}
              </p>
            ) : null}

          </section>
        </div>
      </Card>
      <Card
        padding={4}
        shadow="sm"
        style={{ marginTop: 24 }}
        data-testid="groupware-approval-version-history-gap"
      >
        <h4 style={{ marginTop: 0 }}>버전 이력</h4>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-600)' }}>
          그룹웨어 결재 버전이력은 full-snapshot revision/restore API가 없어 이번 화면에서는 코멘트만 제공합니다. 현재 확인 가능한 것은 결재 audit log 계열 이력이며, 동등 버전이력 패널은 후속 백엔드 계약이 필요합니다.
        </p>
      </Card>
    </section>
  )
}

export default GroupwareApprovalCollaborationPanel
