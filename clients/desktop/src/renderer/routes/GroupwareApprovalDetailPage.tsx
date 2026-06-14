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
  Input,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  APPROVAL_ATTACHMENT_TYPE_LABEL,
  addApprovalAttachmentReference,
  deleteApprovalAttachment,
  downloadApprovalAttachment,
  listApprovalAttachments,
  uploadApprovalAttachmentFile,
  type ApprovalAttachment,
} from '../api/groupwareApprovalAttachment'
import {
  APPROVAL_STATUS_LABEL,
  APPROVAL_STEP_STATUS_LABEL,
  getGroupwareApproval,
  type ApprovalLineAdminResponse,
  type ApprovalStatus,
  type ApprovalStepView,
} from '../api/groupwareApproval'
import { getApprovalTemplate, type ApprovalTemplateField } from '../api/groupwareApprovalTemplate'
import { GroupwareApprovalCollaborationPanel } from '../components/collab/GroupwareApprovalCollaborationPanel'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

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

export function GroupwareApprovalDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const params = useParams<{ id: string }>()
  const approvalId = params['id']!
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [slipNoDraft, setSlipNoDraft] = useState('')
  const [slipTypeDraft, setSlipTypeDraft] = useState('SLIP_OUTBOUND')
  const [partnerCodeDraft, setPartnerCodeDraft] = useState('')
  const [partnerNameDraft, setPartnerNameDraft] = useState('')
  const [periodDraft, setPeriodDraft] = useState(new Date().toISOString().slice(0, 7))

  const query = useQuery({
    queryKey: ['groupwareApproval', approvalId],
    queryFn: () => getGroupwareApproval(approvalId),
    enabled: !!approvalId,
  })

  const templateQuery = useQuery({
    queryKey: ['groupwareApprovalTemplate', query.data?.templateId],
    queryFn: () => getApprovalTemplate(query.data!.templateId!),
    enabled: Boolean(query.data?.templateId),
    retry: 1,
  })

  const attachmentsQuery = useQuery({
    queryKey: ['groupwareApprovalAttachments', approvalId],
    queryFn: () => listApprovalAttachments(approvalId),
    enabled: !!approvalId,
  })

  usePageTitle('결재 상세', query.data?.approvalNo)

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
      render: (step) => `결재자 ${step.sequence + 1}`,
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
  ], [])

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

  const invalidateAttachments = () => {
    void queryClient.invalidateQueries({ queryKey: ['groupwareApprovalAttachments', approvalId] })
  }

  const addSlipMutation = useMutation({
    mutationFn: () => addApprovalAttachmentReference(approvalId, {
      attachmentType: 'SLIP_REF',
      label: '전표 참조',
      refSlipNo: slipNoDraft,
      refSlipType: slipTypeDraft,
    }),
    onSuccess: () => {
      setAttachmentError(null)
      setSlipNoDraft('')
      invalidateAttachments()
    },
    onError: (error) => setAttachmentError(serverErrorMessage(error)),
  })

  const addLedgerMutation = useMutation({
    mutationFn: () => addApprovalAttachmentReference(approvalId, {
      attachmentType: 'PARTNER_LEDGER_REF',
      label: '거래처원장 참조',
      refPartnerCode: partnerCodeDraft,
      refPartnerName: partnerNameDraft,
      refPeriod: periodDraft,
    }),
    onSuccess: () => {
      setAttachmentError(null)
      setPartnerCodeDraft('')
      setPartnerNameDraft('')
      invalidateAttachments()
    },
    onError: (error) => setAttachmentError(serverErrorMessage(error)),
  })

  const uploadFileMutation = useMutation({
    mutationFn: (file: File) => uploadApprovalAttachmentFile(approvalId, file, file.name),
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

  const handleCommitted = () => {
    void queryClient.invalidateQueries({ queryKey: ['groupwareApproval', approvalId] })
    void queryClient.invalidateQueries({ queryKey: ['groupwareApprovals'] })
  }

  return (
    <>
      <Card>
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
            <p style={{ margin: '10px 0 0', fontSize: 18, fontWeight: 700, overflowWrap: 'anywhere' }}>
              {approval.title}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate('/groupware/approvals')}
          >
            목록
          </Button>
        </div>

        <section style={{ display: 'grid', gap: 16 }}>
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

          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>결재선</h4>
            <DataTable
              columns={stepColumns}
              rows={approval.steps}
              rowKey={(step) => `${approval.approvalNo}-${step.sequence}`}
              emptyMessage="결재 단계가 없습니다."
            />
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
                      <Badge variant="neutral">{APPROVAL_ATTACHMENT_TYPE_LABEL[attachment.attachmentType]}</Badge>
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>
                        {attachment.attachmentType === 'SLIP_REF' ? (
                          <a href={`#/sales?slipNo=${encodeURIComponent(attachment.refSlipNo ?? '')}`}>
                            {attachment.refSlipNo ?? '-'}
                          </a>
                        ) : attachment.attachmentType === 'PARTNER_LEDGER_REF' ? (
                          <a href={`#/accounting/ledgers?partnerCode=${encodeURIComponent(attachment.refPartnerCode ?? '')}&period=${encodeURIComponent(attachment.refPeriod ?? '')}`}>
                            {attachment.refPartnerName ?? attachment.refPartnerCode ?? '-'} · {attachment.refPeriod ?? '-'}
                          </a>
                        ) : (
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px auto', gap: 8, alignItems: 'end' }}>
                  <Input label="전표번호" value={slipNoDraft} onChange={(event) => setSlipNoDraft(event.target.value)} inputSize="sm" />
                  <Input label="전표유형" value={slipTypeDraft} onChange={(event) => setSlipTypeDraft(event.target.value)} inputSize="sm" />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => addSlipMutation.mutate()}
                    disabled={!slipNoDraft.trim() || addSlipMutation.isPending}
                  >
                    전표 추가
                  </Button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 130px auto', gap: 8, alignItems: 'end' }}>
                  <Input label="거래처코드" value={partnerCodeDraft} onChange={(event) => setPartnerCodeDraft(event.target.value)} inputSize="sm" />
                  <Input label="거래처명" value={partnerNameDraft} onChange={(event) => setPartnerNameDraft(event.target.value)} inputSize="sm" />
                  <Input label="기간" type="month" value={periodDraft} onChange={(event) => setPeriodDraft(event.target.value)} inputSize="sm" />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => addLedgerMutation.mutate()}
                    disabled={!partnerCodeDraft.trim() || addLedgerMutation.isPending}
                  >
                    원장 추가
                  </Button>
                </div>
                <input
                  type="file"
                  aria-label="결재 첨부 파일"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) uploadFileMutation.mutate(file)
                    event.currentTarget.value = ''
                  }}
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
