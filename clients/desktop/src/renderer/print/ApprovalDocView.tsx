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
import { getGroupwareApproval } from '../api/groupwareApproval'
import {
  listApprovalAttachments,
} from '../api/groupwareApprovalAttachment'
import { findActiveApprovalTemplate } from '../api/groupwareApprovalTemplate'
import { usePageTitle } from '../hooks/usePageTitle'
import { resolveApprovalDocumentTemplate } from './approvalDefaultTemplate'
import { buildApprovalRenderModel } from './approvalRenderModel'
import { DocumentRenderer } from './DocumentRenderer'

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
    queryFn: () => findActiveApprovalTemplate(templateId!),
    enabled: Boolean(templateId),
  })

  usePageTitle('결재문서', approvalQuery.data?.title)

  if (!id) return null
  const isTemplateLoading = Boolean(templateId) && templateQuery.isLoading
  if (approvalQuery.isLoading || attachmentsQuery.isLoading || isTemplateLoading) {
    return <p>불러오는 중...</p>
  }
  if (
    approvalQuery.isError
    || attachmentsQuery.isError
    || !approvalQuery.data
  ) {
    return (
      <div className="error-banner" role="alert">
        결재문서를 불러오지 못했습니다.
      </div>
    )
  }

  const approval = approvalQuery.data
  const attachments = (attachmentsQuery.data ?? [])
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
  const renderInput = {
    approval,
    templateFields: templateQuery.data?.fields ?? [],
    attachments,
    backTo: `/groupware/approvals/${id}`,
  }
  const model = buildApprovalRenderModel(renderInput)

  return (
    <DocumentRenderer
      template={resolveApprovalDocumentTemplate(templateQuery.data)}
      model={model}
      backTo={renderInput.backTo}
    />
  )
}
