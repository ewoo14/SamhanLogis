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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getGroupwareApproval } from '../api/groupwareApproval'
import type { ApprovalLineAdminResponse } from '../api/groupwareApproval'
import { listApprovalAttachments } from '../api/groupwareApprovalAttachment'
import type { ApprovalAttachment } from '../api/groupwareApprovalAttachment'
import { findActiveApprovalTemplate } from '../api/groupwareApprovalTemplate'
import type { ApprovalTemplate } from '../api/groupwareApprovalTemplate'
import { findActiveDocumentTemplate, findDocumentTemplateRevision } from '../api/documentTemplate'
import { usePageTitle } from '../hooks/usePageTitle'
import { resolveDocumentTemplate } from './approvalDefaultTemplate'
import { buildApprovalRenderModel } from './approvalRenderModel'
import { DocumentRenderer } from './DocumentRenderer'
import type { TemplateEnvelope } from './templateSchema'

/**
 * route id를 React epoch에 귀속한다. 같은 QueryClient에서 A→B로 이동해도
 * 이전 layout decision이 B의 model과 결합되는 렌더 epoch를 허용하지 않는다.
 */
export function ApprovalDocView() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''

  if (!id) return null
  return <ApprovalDocViewInner key={id} id={id} />
}

type ApprovalDocViewInnerProps = {
  id: string
}

/** 인쇄 route의 approval/입력 양식 query를 소유하는 컴포넌트. */
function ApprovalDocViewInner({ id }: ApprovalDocViewInnerProps) {
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
  const approvalReady = !approvalQuery.isLoading && !attachmentsQuery.isLoading
  const inputTemplateReady = !templateId || !templateQuery.isLoading

  usePageTitle('결재문서', approvalQuery.data?.title)

  // docType가 서버 응답으로 바뀌는 경우에도 layout query/decision을 새 epoch로
  // 시작해 이전 양식과 현재 approval model의 혼합 렌더를 차단한다.
  return (
    <ApprovalDocViewLayout
      key={docType ?? 'no-document-type'}
      id={id}
      docType={docType}
      approvalReady={approvalReady}
      inputTemplateReady={inputTemplateReady}
      approval={approvalQuery.data}
      attachments={attachmentsQuery.data ?? []}
      templateFields={templateQuery.data?.fields ?? []}
      approvalError={approvalQuery.isError}
      attachmentsError={attachmentsQuery.isError}
    />
  )
}

type ApprovalDocViewLayoutProps = {
  id: string
  docType: string | null
  approvalReady: boolean
  inputTemplateReady: boolean
  approval: ApprovalLineAdminResponse | undefined
  attachments: ApprovalAttachment[]
  templateFields: ApprovalTemplate['fields']
  approvalError: boolean
  attachmentsError: boolean
}

/** active layout query와 결정 latch를 docType epoch에 귀속하는 컴포넌트. */
function ApprovalDocViewLayout({
  id,
  docType,
  approvalReady,
  inputTemplateReady,
  approval,
  attachments,
  templateFields,
  approvalError,
  attachmentsError,
}: ApprovalDocViewLayoutProps) {
  const documentTemplateQuery = useQuery({
    queryKey: [
      'approval.documentLayout',
      id,
      docType,
      approval?.documentTemplateId ?? null,
      approval?.documentTemplateRevision ?? null,
    ],
    queryFn: () => {
      const templateId = approval?.documentTemplateId
      const revision = approval?.documentTemplateRevision
      if (templateId && typeof revision === 'number' && Number.isInteger(revision) && revision > 0) {
        return findDocumentTemplateRevision(templateId, revision, docType!)
      }
      return findActiveDocumentTemplate(docType!)
    },
    enabled: Boolean(docType),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
  })
  const [layoutDecision, setLayoutDecision] = useState<TemplateEnvelope | null>(null)
  const [layoutDecided, setLayoutDecided] = useState(false)

  const layoutReady = !docType || (
    !documentTemplateQuery.isFetching
    && (documentTemplateQuery.isSuccess || documentTemplateQuery.isError)
  )
  const hasPinnedLayout = Boolean(
    approval?.documentTemplateId
    && Number.isInteger(approval.documentTemplateRevision)
    && (approval.documentTemplateRevision ?? 0) > 0,
  )
  // docType이 아예 없는 문서(구식/독립형 결재)는 "레이아웃 pin" 개념 자체가 적용되지 않으므로
  // 고지 대상에서 제외한다(FABLE5 R1 LOW — docType=null 문서에 부정확한 고지 노출 금지).
  const shouldShowUnpinnedNotice = approval?.status === 'APPROVED' && Boolean(docType) && !hasPinnedLayout
  // pin은 있는데(승인 당시 각인은 성공) revision 조회 자체가 실패/malformed인 경우 — 무고지로
  // DEFAULT에 강하하면 감사·법정 문서가 제3의 외형으로 조용히 인쇄된다(FABLE5 R1 H-2).
  // isSuccess && data===null은 malformed 응답(파싱 실패)도 포함해 동일하게 고지한다.
  const shouldShowPinFetchFailedNotice = approval?.status === 'APPROVED' && hasPinnedLayout && (
    documentTemplateQuery.isError
    || (documentTemplateQuery.isSuccess && documentTemplateQuery.data == null)
  )

  /** pin revision 조회 실패 후 사용자가 직접 재시도할 수 있는 경로(H-2 — 무고지 강하 금지). */
  const handleRetryPinnedLayout = () => {
    setLayoutDecided(false)
    void documentTemplateQuery.refetch()
  }

  useEffect(() => {
    if (!layoutDecided && approvalReady && inputTemplateReady && layoutReady) {
      // findActiveDocumentTemplate 은 이미 parseDocumentTemplate 로 정규화된 full
      // TemplateEnvelope(또는 null)를 반환한다. 오류/malformed 는 DEFAULT 로 수렴한다.
      const activeResponse = documentTemplateQuery.isError || documentTemplateQuery.isRefetchError
        ? null
        : documentTemplateQuery.data ?? null
      setLayoutDecision(resolveDocumentTemplate(activeResponse))
      setLayoutDecided(true)
    }
  }, [
    approvalReady,
    inputTemplateReady,
    layoutReady,
    layoutDecided,
    documentTemplateQuery.data,
    documentTemplateQuery.isError,
    documentTemplateQuery.isRefetchError,
  ])

  if (!approvalReady || !inputTemplateReady || !layoutDecided) {
    return <p>불러오는 중...</p>
  }
  if (approvalError || attachmentsError || !approval) {
    return (
      <div className="error-banner" role="alert">
        결재문서를 불러오지 못했습니다.
      </div>
    )
  }

  const renderInput = {
    approval,
    templateFields,
    attachments: attachments.slice().sort((a, b) => a.displayOrder - b.displayOrder),
    backTo: `/groupware/approvals/${id}`,
  }
  const model = buildApprovalRenderModel(renderInput)

  return (
    <>
      {shouldShowUnpinnedNotice && (
        <div
          className="approval-reprint-unpinned-notice no-print"
          role="status"
          data-testid="approval-reprint-unpinned-notice"
        >
          승인 당시 레이아웃 정보가 없어 현재 양식으로 표시됩니다.
        </div>
      )}
      {shouldShowPinFetchFailedNotice && (
        <div
          className="approval-reprint-pin-failed-notice no-print"
          role="alert"
          data-testid="approval-reprint-pin-failed-notice"
        >
          승인 당시 레이아웃 조회에 실패해 현재 양식으로 대신 표시됩니다. 실제 승인 당시
          양식과 다를 수 있습니다.{' '}
          <button type="button" onClick={handleRetryPinnedLayout}>다시 시도</button>
        </div>
      )}
      <DocumentRenderer
        template={layoutDecision!}
        model={model}
        backTo={renderInput.backTo}
      />
    </>
  )
}
