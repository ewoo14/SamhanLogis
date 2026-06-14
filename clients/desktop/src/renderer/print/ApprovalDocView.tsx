/**
 * 그룹웨어 결재문서 인쇄 미리보기 — `/groupware/approvals/:id/print`.
 *
 * 책임:
 * - 실 그룹웨어 결재 DTO(`ApprovalLineAdminResponse`)와 첨부 API를 `PrintLayout approvalDoc`
 *   골격에 연결한다.
 * - 상세 화면 queryKey(`groupwareApproval`, `groupwareApprovalAttachments`)와 충돌하지 않도록
 *   인쇄 전용 queryKey를 사용한다.
 * - UUID는 path/API 연동 전용으로만 쓰고, 화면에는 문서번호/제목/이름/라벨/전표번호만 표시한다.
 */
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  getGroupwareApproval,
  type ApprovalLineAdminResponse,
  type ApprovalStepView,
} from '../api/groupwareApproval'
import {
  APPROVAL_ATTACHMENT_TYPE_LABEL,
  listApprovalAttachments,
  type ApprovalAttachment,
} from '../api/groupwareApprovalAttachment'
import {
  getApprovalTemplate,
  type ApprovalTemplateField,
} from '../api/groupwareApprovalTemplate'
import { usePageTitle } from '../hooks/usePageTitle'
import { stripSlipNoZeros } from '../utils/orderNo'
import { PrintLayout, type PrintApprovalStep, type PrintDocHeader } from './PrintLayout'

const CLOSING_NOTE = '위와 같이 품의하오니 검토 후 재가하여 주시기 바랍니다.'

function buildApprovalStep(label: string, name: string, decidedAt?: string): PrintApprovalStep {
  const step: PrintApprovalStep = { label, name }
  if (decidedAt) step.decidedAt = decidedAt
  return step
}

function buildApprovalSteps(approval: ApprovalLineAdminResponse): PrintApprovalStep[] {
  const sortedSteps = [...approval.steps].sort((a, b) => a.sequence - b.sequence)
  return [
    buildApprovalStep('작성', approval.requesterName ?? '-'),
    ...sortedSteps.map((step, index) => {
      const label = step.sequence === approval.steps.length || index === sortedSteps.length - 1
        ? '결재'
        : '합의'
      const decidedAt = step.status === 'APPROVED' ? step.decidedAt ?? undefined : undefined
      return buildApprovalStep(label, step.approverName ?? '-', decidedAt)
    }),
  ]
}

function firstDecidedAt(steps: ApprovalStepView[]): string | undefined {
  return steps
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .find((step) => Boolean(step.decidedAt))
    ?.decidedAt ?? undefined
}

function buildDocHeader(approval: ApprovalLineAdminResponse): PrintDocHeader {
  const issueDate = firstDecidedAt(approval.steps)
  return {
    title: approval.title,
    docNo: approval.approvalNo,
    ...(issueDate ? { issueDate } : {}),
  }
}

function contentParagraphs(content: string | null): string[] {
  return (content ?? '')
    .split(/\r?\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
}

function fieldLabelMap(fields: ApprovalTemplateField[]): Map<string, string> {
  return new Map(fields.map((field) => [field.fieldKey, field.label]))
}

function fieldRows(
  fieldValues: Record<string, string>,
  fields: ApprovalTemplateField[],
): Array<{ key: string; label: string; value: string }> {
  const labels = fieldLabelMap(fields)
  return Object.entries(fieldValues)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => ({
      key,
      label: labels.get(key) ?? key,
      value,
    }))
}

function attachmentTitle(attachment: ApprovalAttachment): string {
  return attachment.label
    ?? attachment.refDocLabel
    ?? attachment.fileName
    ?? '-'
}

function attachmentDetails(attachment: ApprovalAttachment): string[] {
  return [
    attachment.refSlipNo ? stripSlipNoZeros(attachment.refSlipNo) : '',
    attachment.refPartnerName ?? '',
    attachment.refPeriod ?? '',
  ].filter((value) => value.length > 0)
}

/**
 * 그룹웨어 결재문서 인쇄 미리보기 컴포넌트.
 */
export function ApprovalDocView() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''

  const approvalQuery = useQuery({
    queryKey: ['groupware-approval-print', id],
    queryFn: () => getGroupwareApproval(id),
    enabled: !!id,
  })

  const attachmentsQuery = useQuery({
    queryKey: ['groupware-approval-print-attachments', id],
    queryFn: () => listApprovalAttachments(id),
    enabled: !!id,
  })

  const templateId = approvalQuery.data?.templateId ?? null
  const templateQuery = useQuery({
    queryKey: ['groupware-approval-print-template', templateId],
    queryFn: () => getApprovalTemplate(templateId!),
    enabled: Boolean(templateId),
  })

  usePageTitle('결재문서', approvalQuery.data?.title)

  if (!id) return null
  const isTemplateLoading = Boolean(templateId) && templateQuery.isLoading
  if (approvalQuery.isLoading || attachmentsQuery.isLoading || isTemplateLoading) {
    return <p>불러오는 중...</p>
  }
  if (approvalQuery.isError || attachmentsQuery.isError || !approvalQuery.data) {
    return (
      <div className="error-banner" role="alert">
        결재문서를 불러오지 못했습니다.
      </div>
    )
  }

  const approval = approvalQuery.data
  const paragraphs = contentParagraphs(approval.content)
  const fields = fieldRows(approval.fieldValues, templateQuery.data?.fields ?? [])
  const attachments = (attachmentsQuery.data ?? [])
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <PrintLayout
      paper="a4-portrait"
      backTo={`/groupware/approvals/${id}`}
      approvalDoc
      docHeader={buildDocHeader(approval)}
      approvalSteps={buildApprovalSteps(approval)}
      closingNote={CLOSING_NOTE}
    >
      <div
        className="approval-doc-print-content"
        style={{ display: 'grid', gap: '5mm', color: '#000', fontSize: '10pt' }}
      >
        {paragraphs.length > 0 ? (
          <section aria-label="결재문서 내용" style={{ display: 'grid', gap: '2mm' }}>
            {paragraphs.map((paragraph, index) => (
              <p
                key={`${index}-${paragraph.slice(0, 16)}`}
                style={{ margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
                {paragraph}
              </p>
            ))}
          </section>
        ) : null}

        {fields.length > 0 ? (
          <section aria-label="결재문서 세부 필드">
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.key}>
                    <th
                      scope="row"
                      style={{
                        width: '32mm',
                        padding: '2mm',
                        border: '1px solid #000',
                        background: '#F4F5F7',
                        textAlign: 'left',
                        fontWeight: 700,
                      }}
                    >
                      {field.label}
                    </th>
                    <td
                      style={{
                        padding: '2mm',
                        border: '1px solid #000',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {field.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {attachments.length > 0 ? (
          <section aria-label="결재문서 첨부">
            <h2 style={{ margin: '0 0 2mm', fontSize: '11pt' }}>첨부</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: '30mm', padding: '2mm', border: '1px solid #000', background: '#F4F5F7' }}>
                    유형
                  </th>
                  <th style={{ padding: '2mm', border: '1px solid #000', background: '#F4F5F7' }}>
                    문서
                  </th>
                  <th style={{ width: '58mm', padding: '2mm', border: '1px solid #000', background: '#F4F5F7' }}>
                    참조
                  </th>
                </tr>
              </thead>
              <tbody>
                {attachments.map((attachment, index) => {
                  const details = attachmentDetails(attachment)
                  return (
                    <tr key={`${attachment.displayOrder}-${index}`}>
                      <td style={{ padding: '2mm', border: '1px solid #000' }}>
                        {APPROVAL_ATTACHMENT_TYPE_LABEL[attachment.attachmentType]}
                      </td>
                      <td style={{ padding: '2mm', border: '1px solid #000', overflowWrap: 'anywhere' }}>
                        {attachmentTitle(attachment)}
                      </td>
                      <td style={{ padding: '2mm', border: '1px solid #000', overflowWrap: 'anywhere' }}>
                        {details.join(' · ')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    </PrintLayout>
  )
}
