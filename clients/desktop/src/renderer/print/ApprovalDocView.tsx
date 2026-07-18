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
import { findActiveDocumentTemplate } from '../api/documentTemplate'
import { usePageTitle } from '../hooks/usePageTitle'
import { resolveDocumentTemplate } from './approvalDefaultTemplate'
import { buildApprovalRenderModel } from './approvalRenderModel'
import { DocumentRenderer } from './DocumentRenderer'
import type { TemplateEnvelope } from './templateSchema'
import { useEffect, useState } from 'react'

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

  const docType = approvalQuery.data?.documentType
    ?? (templateQuery.data?.code ? `GROUPWARE_${templateQuery.data.code}` : null)
  const documentTemplateQuery = useQuery({
    queryKey: ['approval.documentType', docType],
    queryFn: () => findActiveDocumentTemplate(docType!),
    enabled: Boolean(docType),
    retry: false,
    refetchOnReconnect: false,
  })
  const [layoutDecision, setLayoutDecision] = useState<TemplateEnvelope | null>(null)
  const [layoutDecided, setLayoutDecided] = useState(false)

  const approvalReady = !approvalQuery.isLoading && !attachmentsQuery.isLoading
  const inputTemplateReady = !templateId || !templateQuery.isLoading
  const layoutReady = !docType || (!documentTemplateQuery.isLoading && !documentTemplateQuery.isPending)
  useEffect(() => {
    if (!layoutDecided && approvalReady && inputTemplateReady && layoutReady) {
      // findActiveDocumentTemplate 은 이미 parseDocumentTemplate 로 정규화된 full
      // TemplateEnvelope(또는 null)를 반환한다. 여기서 .document(payload)만 꺼내면
      // resolveDocumentTemplate 의 재파싱이 최상위 schemaVersion/docType/name/revision
      // 부재로 실패해 활성 레이아웃이 있어도 항상 DEFAULT 로 수렴하므로, envelope 전체를
      // 전달한다. null/오류/malformed 는 data 가 null/undefined → DEFAULT 로 안전 수렴.
      setLayoutDecision(resolveDocumentTemplate(documentTemplateQuery.data ?? null))
      setLayoutDecided(true)
    }
  }, [approvalReady, inputTemplateReady, layoutReady, layoutDecided, documentTemplateQuery.data])

  usePageTitle('결재문서', approvalQuery.data?.title)

  if (!id) return null
  const isTemplateLoading = Boolean(templateId) && templateQuery.isLoading
  if (approvalQuery.isLoading || attachmentsQuery.isLoading || isTemplateLoading || !layoutDecided) {
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
      template={layoutDecision!}
      model={model}
      backTo={renderInput.backTo}
    />
  )
}
