/**
 * 그룹웨어 결재 상세 — `/groupware/approvals/:id`.
 *
 * URL path 는 approvalId(UUID)를 사용하고, 화면에는 approvalNo 슬래시 표기와 업무 필드만 노출한다.
 */
import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  DataTable,
  FormField,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  addApprovalAttachmentReference,
  deleteApprovalAttachment,
  downloadApprovalAttachment,
  listApprovalAttachments,
  uploadApprovalAttachmentFile,
  type ApprovalAttachment,
  type ApprovalAttachmentReferenceInput,
} from '../api/groupwareApprovalAttachment'
import {
  APPROVAL_REFERENCE_DOC_TYPE_LABEL,
  type ApprovalReferenceDocType,
} from '../api/documentReferenceSearch'
import {
  approvalAttachmentDetailLabel,
  approvalAttachmentHref,
  resolveApprovalAttachmentDocType,
} from '../api/approvalAttachmentPresentation'
import {
  APPROVAL_STATUS_LABEL,
  APPROVAL_STEP_STATUS_LABEL,
  getGroupwareApproval,
  resolveApprovalStepDisplayName,
  resolveApprovalStepTypeLabel,
  type ApprovalLineAdminResponse,
  type ApprovalStatus,
  type ApprovalStepView,
} from '../api/groupwareApproval'
// P1-C: fetchApprovalLineGroups(/auth/admin/approval-line-configs/groups) 제거 — 비-admin 페이지에서 admin 호출 차단.
// ApprovalStepView.approverGroupId → resolveApprovalStepDisplayName 에서 '권한그룹' 폴백으로 처리.
import { findActiveApprovalTemplate, type ApprovalTemplateField } from '../api/groupwareApprovalTemplate'
import { GroupwareApprovalCollaborationPanel } from '../components/collab/GroupwareApprovalCollaborationPanel'
import { DocumentReferencePicker, type DocumentReferenceValue } from '../components/groupware/DocumentReferencePicker'
import { MobileActionSheet } from '../components/common/MobileActionSheet'
import { MobileCollapsible } from '../components/common/MobileCollapsible'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { useIsMobile } from '../hooks/useIsMobile'

const STATUS_VARIANT: Record<ApprovalStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'brand',
  APPROVED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'warning',
}

const STEP_STATUS_VARIANT: Record<ApprovalStepView['status'], 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'neutral',
  APPROVED: 'success',
  REJECTED: 'danger',
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  return value.slice(0, 16).replace('T', ' ')
}

function displayNameOrFallback(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function serverErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) return '첨부 처리에 실패했습니다.'
  const data = error.response?.data as { message?: unknown } | undefined
  return typeof data?.message === 'string' && data.message.trim()
    ? data.message.trim()
    : '첨부 처리에 실패했습니다.'
}

function isEditableStatus(status: ApprovalStatus): boolean {
  return status === 'PENDING' || status === 'IN_PROGRESS'
}

function formatFileSize(value: number | null): string {
  if (!value) return '-'
  if (value < 1024) return `${value}B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)}KB`
  return `${(value / 1024 / 1024).toFixed(1)}MB`
}

function emptyReferenceDraft(type: ApprovalReferenceDocType = 'OUTBOUND_SLIP'): DocumentReferenceValue {
  return {
    refDocType: type,
    refDocNo: null,
    refDocLabel: null,
    refPartnerCode: null,
    refPartnerName: null,
    refPeriod: type === 'PARTNER_LEDGER' ? new Date().toISOString().slice(0, 7) : null,
  }
}

function buildReferenceInput(draft: DocumentReferenceValue, displayOrder: number): ApprovalAttachmentReferenceInput {
  const label = APPROVAL_REFERENCE_DOC_TYPE_LABEL[draft.refDocType]
  const refSlipType = draft.refDocType === 'OUTBOUND_SLIP'
    ? 'SLIP_OUTBOUND'
    : draft.refDocType === 'INBOUND_SLIP'
      ? 'SLIP_INBOUND'
      : null
  if (draft.refDocType === 'PARTNER_LEDGER') {
    return {
      attachmentType: 'PARTNER_LEDGER_REF',
      label,
      displayOrder,
      refDocType: draft.refDocType,
      refDocNo: null,
      refDocLabel: draft.refDocLabel,
      refPartnerCode: draft.refPartnerCode,
      refPartnerName: draft.refPartnerName,
      refPeriod: draft.refPeriod,
    }
  }
  return {
    attachmentType: 'SLIP_REF',
    label,
    displayOrder,
    refDocType: draft.refDocType,
    refDocNo: draft.refDocNo,
    refDocLabel: draft.refDocLabel,
    refSlipNo: refSlipType ? draft.refDocNo : null,
    refSlipType,
  }
}

function attachmentDisplayNo(attachment: ApprovalAttachment): string {
  const docType = resolveApprovalAttachmentDocType(attachment)
  if (docType === 'PARTNER_LEDGER') {
    return `${attachment.refPartnerName ?? attachment.refPartnerCode ?? '-'} · ${attachment.refPeriod ?? '-'}`
  }
  return attachment.refDocNo ?? attachment.refSlipNo ?? '-'
}

function canSubmitReference(draft: DocumentReferenceValue): boolean {
  if (draft.refDocType === 'PARTNER_LEDGER') {
    return Boolean(draft.refPartnerCode?.trim() && draft.refPartnerName?.trim() && draft.refPeriod?.trim())
  }
  return Boolean(draft.refDocNo?.trim())
}

function approvalStatusBadgeStyle(status: ApprovalStatus) {
  switch (status) {
    case 'APPROVED':
      return { background: '#D1FAE5', color: '#065F46' }
    case 'REJECTED':
      return { background: '#FEE2E2', color: '#991B1B' }
    case 'WITHDRAWN':
      return { background: '#FEF3C7', color: '#92400E' }
    case 'IN_PROGRESS':
      return { background: '#EDE9FE', color: '#5B21B6' }
    case 'PENDING':
    default:
      return { background: '#F3F4F6', color: '#4B5563' }
  }
}

export function GroupwareApprovalDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const isMobile = useIsMobile()
  const params = useParams<{ id: string }>()
  const approvalId = params['id']!
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [referenceFormOpen, setReferenceFormOpen] = useState(false)
  const [referenceDraft, setReferenceDraft] = useState<DocumentReferenceValue>(() => emptyReferenceDraft())
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)

  const query = useQuery({
    queryKey: ['groupwareApproval', approvalId],
    queryFn: () => getGroupwareApproval(approvalId),
    enabled: !!approvalId,
  })

  const templateQuery = useQuery({
    queryKey: ['groupwareApprovalTemplate', query.data?.templateId],
    queryFn: () => findActiveApprovalTemplate(query.data!.templateId!),
    enabled: Boolean(query.data?.templateId),
    retry: 1,
  })

  const attachmentsQuery = useQuery({
    queryKey: ['groupwareApprovalAttachments', approvalId],
    queryFn: () => listApprovalAttachments(approvalId),
    enabled: !!approvalId,
  })

  usePageTitle('결재 상세', query.data?.approvalNo)

  // P1-C: admin /auth/admin/approval-line-configs/groups 제거.
  // GROUP 단계는 resolveApprovalStepDisplayName 내 '권한그룹' 폴백으로 표시.
  const groupNameById = useMemo(() => new Map<string, string>(), [])
  const requesterIdForSteps = query.data?.requesterId ?? ''

  const stepColumns: DataTableColumn<ApprovalStepView>[] = useMemo(() => [
    {
      key: 'sequence',
      header: '순서',
      width: '70px',
      align: 'center',
      render: (step) => step.sequence + 1,
    },
    {
      key: 'approver',
      header: '결재자',
      render: (step) => (
        <div style={{ display: 'grid', gap: 2 }}>
          <span style={{ fontWeight: 600 }}>
            {resolveApprovalStepDisplayName(step, groupNameById)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
            {resolveApprovalStepTypeLabel(step, requesterIdForSteps)}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: '상태',
      width: '110px',
      render: (step) => (
        <Badge variant={STEP_STATUS_VARIANT[step.status]}>
          {APPROVAL_STEP_STATUS_LABEL[step.status]}
        </Badge>
      ),
    },
    {
      key: 'decidedAt',
      header: '처리일시',
      width: '160px',
      render: (step) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatDateTime(step.decidedAt)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: '사유',
      render: (step) => step.reason || '-',
    },
  ], [groupNameById, requesterIdForSteps])

  // 첨부 mutation 은 hook 이므로 조기 return(로딩/에러) 보다 위에 선언해야 한다
  // (early return 뒤 hook 선언 시 "Rendered more hooks than during the previous render" 크래시).
  const invalidateAttachments = () => {
    void queryClient.invalidateQueries({ queryKey: ['groupwareApprovalAttachments', approvalId] })
  }

  const addReferenceMutation = useMutation({
    mutationFn: () => addApprovalAttachmentReference(
      approvalId,
      buildReferenceInput(referenceDraft, (attachmentsQuery.data?.length ?? 0) + 1),
    ),
    onSuccess: () => {
      setAttachmentError(null)
      setReferenceDraft(emptyReferenceDraft())
      setReferenceFormOpen(false)
      invalidateAttachments()
    },
    onError: (error) => setAttachmentError(serverErrorMessage(error)),
  })

  const uploadFileMutation = useMutation({
    mutationFn: async (files: File[]) => {
      let displayOrder = (attachmentsQuery.data?.length ?? 0) + 1
      for (const file of files) {
        await uploadApprovalAttachmentFile(approvalId, file, file.name, displayOrder)
        displayOrder += 1
      }
    },
    onSuccess: () => {
      setAttachmentError(null)
      invalidateAttachments()
    },
    onError: (error) => setAttachmentError(serverErrorMessage(error)),
  })

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => deleteApprovalAttachment(approvalId, attachmentId),
    onSuccess: () => {
      setAttachmentError(null)
      invalidateAttachments()
    },
    onError: (error) => setAttachmentError(serverErrorMessage(error)),
  })

  const downloadMutation = useMutation({
    mutationFn: (attachment: ApprovalAttachment) => downloadApprovalAttachment(approvalId, attachment.id),
    onSuccess: (blob, attachment) => {
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = attachment.fileName ?? 'approval-attachment'
      link.click()
      URL.revokeObjectURL(href)
    },
    onError: (error) => setAttachmentError(serverErrorMessage(error)),
  })

  if (query.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="결재 문서 불러오는 중" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="error-banner" role="alert">
        결재 상세를 불러오지 못했습니다.
      </div>
    )
  }

  const approval: ApprovalLineAdminResponse = query.data
  const canWrite = canAccess('groupware.approvals', 'update')
  const locked = !isEditableStatus(approval.status)
  const templateFields: ApprovalTemplateField[] = templateQuery.data?.fields ?? []
  const fieldRows = templateFields.length > 0
    ? templateFields.map((field) => ({
      key: field.fieldKey,
      label: field.label,
      value: approval.fieldValues[field.fieldKey] ?? '',
    }))
    : Object.entries(approval.fieldValues ?? {}).map(([key, value]) => ({
      key,
      label: key,
      value,
    }))

  const handleCommitted = () => {
    void queryClient.invalidateQueries({ queryKey: ['groupwareApproval', approvalId] })
    void queryClient.invalidateQueries({ queryKey: ['groupwareApprovals'] })
  }

  return (
    <>
      {isMobile ? (
        <>
          <div className="mobile-summary-card" data-testid="groupware-approval-mobile-summary">
            <div className="mobile-summary-card-header">
              <span className="mobile-summary-doc-no">{approval.title}</span>
              <span className="mobile-status-badge" style={approvalStatusBadgeStyle(approval.status)}>
                {APPROVAL_STATUS_LABEL[approval.status]}
              </span>
            </div>
            <div className="mobile-summary-partner">
              기안자 {displayNameOrFallback(approval.requesterName, '요청자')}
            </div>
            <div className="mobile-summary-divider" />
            <div className="mobile-summary-total-row">
              <span className="mobile-summary-total-amount">{approval.approvalNo}</span>
            </div>
          </div>

          <div className="mobile-action-bar" role="toolbar" aria-label="결재 액션">
            <button
              type="button"
              className="mobile-action-primary"
              onClick={() => navigate(`/groupware/approvals/${approvalId}/print`)}
            >
              인쇄 미리보기
            </button>
            <button
              type="button"
              className="mobile-action-icon"
              aria-label="더보기"
              onClick={() => setMobileMoreOpen(true)}
            >
              ···
            </button>
            <MobileActionSheet open={mobileMoreOpen} onClose={() => setMobileMoreOpen(false)}>
                  <button
                    type="button"
                    className="mobile-more-sheet-item"
                    onClick={() => {
                      setMobileMoreOpen(false)
                      navigate('/groupware/approvals')
                    }}
                  >
                    목록
                  </button>
            </MobileActionSheet>
          </div>
        </>
      ) : null}

      <Card>
        {!isMobile ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h3
                style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}
                data-testid="groupware-approval-detail-no"
              >
                {approval.approvalNo}
              </h3>
              <Badge variant={STATUS_VARIANT[approval.status]}>
                {APPROVAL_STATUS_LABEL[approval.status]}
              </Badge>
              {approval.templateName ? <Badge variant="brand">{approval.templateName}</Badge> : null}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-neutral-600)' }}>
              요청자: {displayNameOrFallback(approval.requesterName, '요청자')}
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 18, fontWeight: 700, overflowWrap: 'anywhere' }}>
              {approval.title}
            </p>
          </div>
          <div className="detail-action-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(`/groupware/approvals/${approvalId}/print`)}
            >
              인쇄 미리보기
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate('/groupware/approvals')}
            >
              목록
            </Button>
          </div>
        </div>
        ) : null}

        <section style={{ display: 'grid', gap: 16 }}>
          <MobileCollapsible title="본문 · 세부 필드" defaultOpen className="mobile-section-card">
          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>내용</h4>
            <div
              data-testid="groupware-approval-detail-content"
              style={{
                minHeight: 96,
                padding: 12,
                border: '1px solid var(--color-neutral-200)',
                borderRadius: 4,
                background: 'var(--color-neutral-50)',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
                overflowWrap: 'anywhere',
              }}
            >
              {approval.content || '내용이 없습니다.'}
            </div>
          </div>

          {fieldRows.length > 0 ? (
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>세부 필드</h4>
              <div
                data-testid="groupware-approval-detail-fields"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 8,
                }}
              >
                {fieldRows.map((field) => (
                  <div
                    key={field.key}
                    style={{
                      padding: 10,
                      border: '1px solid var(--color-neutral-200)',
                      borderRadius: 6,
                      background: 'var(--color-neutral-50)',
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 4 }}>
                      {field.label}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                      {field.value || '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          </MobileCollapsible>

          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>결재선</h4>
            <div className="detail-mobile-hide">
              <DataTable
                columns={stepColumns}
                rows={approval.steps}
                rowKey={(step) => `${approval.approvalNo}-${step.sequence}`}
                emptyMessage="결재 단계가 없습니다."
              />
            </div>
            <div className="mobile-item-list" data-testid="groupware-approval-mobile-steps">
              {approval.steps.length === 0 ? (
                <div className="mobile-item-card">
                  <div className="mobile-item-total-row">
                    <span className="mobile-item-total-label">결재선</span>
                    <span className="mobile-item-total-value">결재 단계가 없습니다.</span>
                  </div>
                </div>
              ) : (
                approval.steps.map((step) => (
                  <div key={`${approval.approvalNo}-mobile-${step.sequence}`} className="mobile-item-card">
                    <div className="mobile-item-card-header">
                      <div className="mobile-item-name">
                        {resolveApprovalStepDisplayName(step, groupNameById)}
                      </div>
                      <span className="mobile-status-badge" style={approvalStatusBadgeStyle(step.status as ApprovalStatus)}>
                        {APPROVAL_STEP_STATUS_LABEL[step.status]}
                      </span>
                    </div>
                    <div className="mobile-item-model">
                      순서 {step.sequence + 1} · {resolveApprovalStepTypeLabel(step, approval.requesterId)}
                    </div>
                    <div className="mobile-item-divider" />
                    <div className="mobile-item-total-row">
                      <span className="mobile-item-total-label">처리일시</span>
                      <span className="mobile-item-total-value">{formatDateTime(step.decidedAt)}</span>
                    </div>
                    {step.reason ? (
                      <div className="mobile-item-chips">
                        <span className="mobile-item-chip">{step.reason}</span>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>첨부</h4>
            {attachmentsQuery.isLoading ? (
              <p style={{ margin: 0, color: 'var(--color-neutral-500)' }}>첨부를 불러오는 중...</p>
            ) : attachmentsQuery.isError ? (
              <p role="alert" style={{ margin: 0, color: 'var(--color-danger-700)' }}>첨부를 불러오지 못했습니다.</p>
            ) : (attachmentsQuery.data ?? []).length === 0 ? (
              <p style={{ margin: 0, color: 'var(--color-neutral-500)' }}>등록된 첨부가 없습니다.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {(attachmentsQuery.data ?? []).map((attachment) => (
                  <div
                    key={attachment.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      padding: 10,
                      border: '1px solid var(--color-neutral-200)',
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <Badge variant="neutral">
                        {attachment.attachmentType === 'FILE'
                          ? '파일'
                          : approvalAttachmentDetailLabel(attachment)}
                      </Badge>
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>
                        {attachment.attachmentType === 'FILE' ? (
                          <button
                            type="button"
                            onClick={() => downloadMutation.mutate(attachment)}
                            style={{
                              border: 0,
                              background: 'transparent',
                              padding: 0,
                              color: 'var(--color-brand-700)',
                              cursor: 'pointer',
                              font: 'inherit',
                              fontWeight: 700,
                            }}
                          >
                            {attachment.fileName ?? '파일'} ({formatFileSize(attachment.fileSize)})
                          </button>
                        ) : (
                          (() => {
                            const href = approvalAttachmentHref(attachment)
                            const displayNo = attachmentDisplayNo(attachment)
                            return href ? <a href={href}>{displayNo}</a> : <span>{displayNo}</span>
                          })()
                        )}
                      </div>
                      {attachment.label ? (
                        <div style={{ marginTop: 2, fontSize: 12, color: 'var(--color-neutral-500)' }}>
                          {attachment.label}
                        </div>
                      ) : null}
                    </div>
                    {canWrite && !locked ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteAttachmentMutation.mutate(attachment.id)}
                        disabled={deleteAttachmentMutation.isPending}
                      >
                        삭제
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {canWrite && !locked ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setReferenceFormOpen((current) => !current)}
                    disabled={addReferenceMutation.isPending}
                  >
                    문서 참조 추가
                  </Button>
                </div>
                {referenceFormOpen ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) auto', gap: 8, alignItems: 'end' }}>
                    <DocumentReferencePicker
                      value={referenceDraft}
                      onChange={setReferenceDraft}
                      inputSize="sm"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => addReferenceMutation.mutate()}
                      disabled={!canSubmitReference(referenceDraft) || addReferenceMutation.isPending}
                    >
                      추가
                    </Button>
                  </div>
                ) : null}
                <FormField
                  label="파일 첨부"
                  render={({ id, ariaDescribedBy }) => (
                    <input
                      id={id}
                      type="file"
                      multiple
                      aria-describedby={ariaDescribedBy}
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? [])
                        if (files.length > 0) uploadFileMutation.mutate(files)
                        event.currentTarget.value = ''
                      }}
                    />
                  )}
                />
              </div>
            ) : null}

            {locked && canWrite ? (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-neutral-500)' }}>
                최종 승인, 반려, 회수된 결재 문서는 첨부를 변경할 수 없습니다.
              </p>
            ) : null}
            {attachmentError ? (
              <p role="alert" style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-danger-700)' }}>
                {attachmentError}
              </p>
            ) : null}
          </div>
        </section>
      </Card>

      <GroupwareApprovalCollaborationPanel
        approvalId={approval.approvalId}
        approvalNo={approval.approvalNo}
        status={approval.status}
        currentValues={{
          title: approval.title,
          content: approval.content,
          fieldValues: approval.fieldValues,
        }}
        templateFields={templateFields}
        onCommitted={handleCommitted}
      />
    </>
  )
}
