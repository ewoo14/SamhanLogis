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
import { loadApprovalSlipLineItems } from './approvalSlipLineItems'
import type { SlipLineDetail } from '../api/slip'
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
  // R3 HIGH-1/MED-1 fix: 이 쿼리들은 "레이아웃 결정 입력"(docType/pin 3컬럼)의 원천이라
  // documentTemplateQuery와 동일한 freshness 규칙을 따라야 한다([[feedback_react_query_freshness_route_param_reset]]).
  // staleTime만 0으로 두면 전역 refetchOnMount(기본 true=stale일 때만) 하에서는 "5분 내
  // 재마운트"에 캐시가 그대로 살아남아 재조회 자체가 트리거되지 않는다 — refetchOnMount:
  // 'always' 로 mount마다 무조건 재검증해야 한다.
  const approvalQuery = useQuery({
    queryKey: ['groupware-approval-print', id],
    queryFn: () => getGroupwareApproval(id),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
  })

  const attachmentsQuery = useQuery({
    queryKey: ['groupware-approval-print-attachments', id],
    queryFn: () => listApprovalAttachments(id),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
  })

  const templateId = approvalQuery.data?.templateId ?? null
  // 동일 결함 계열([[feedback_defect_family_sweep_fix]]) — docType의 대체 원천이므로 같은
  // freshness 규칙을 적용한다. 그렇지 않으면 templateQuery만 stale한 채 남아 위와 동일한
  // 무고지 구식 렌더를 다른 경로로 재도입한다.
  const templateQuery = useQuery({
    queryKey: ['groupware-approval-print-template', templateId],
    queryFn: () => findActiveApprovalTemplate(templateId!),
    enabled: Boolean(templateId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
  })

  const docType = approvalQuery.data?.documentType
    ?? (templateQuery.data?.code ? `GROUPWARE_${templateQuery.data.code}` : null)
  // R3 MED-1 fix: isLoading은 "캐시가 이미 있으면" 배경 refetch 중에도 즉시 false가 되어
  // stale 데이터로 레이아웃 latch를 먼저 확정시켜 버린다(뒤늦게 도착하는 fresh 응답을
  // 버림 — 실측). documentTemplateQuery/layoutReady가 이미 쓰는 isFetching 기반 패턴과
  // 동형으로 맞춘다: refetch가 끝나 성공/실패로 정착할 때까지 ready로 보지 않는다.
  const approvalReady = (
    !approvalQuery.isFetching && (approvalQuery.isSuccess || approvalQuery.isError)
  ) && (
    !attachmentsQuery.isFetching && (attachmentsQuery.isSuccess || attachmentsQuery.isError)
  )
  const inputTemplateReady = !templateId || (
    !templateQuery.isFetching && (templateQuery.isSuccess || templateQuery.isError)
  )

  const referencedSlipLineItemsQuery = useQuery<SlipLineDetail[] | null>({
    queryKey: [
      'groupware-approval-print-slip-lines',
      id,
      (attachmentsQuery.data ?? [])
        .filter((attachment) => attachment.refDocType === 'OUTBOUND_SLIP')
        .map((attachment) => attachment.refDocNo)
        .join('|'),
    ],
    queryFn: () => loadApprovalSlipLineItems(attachmentsQuery.data ?? []),
    enabled: approvalReady,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
  })
  const lineItemsReady = !approvalReady || (
    !referencedSlipLineItemsQuery.isFetching
    && (referencedSlipLineItemsQuery.isSuccess || referencedSlipLineItemsQuery.isError)
  )

  usePageTitle('결재문서', approvalQuery.data?.title)

  // docType/status/pin 중 하나라도 서버 응답으로 바뀌면 layout query/decision을 새 epoch로
  // 시작해 이전 양식·고지와 현재 approval model의 혼합 렌더를 차단한다.
  const layoutEpochKey = JSON.stringify([
    docType,
    approvalQuery.data?.status ?? null,
    approvalQuery.data?.documentTemplateId ?? null,
    approvalQuery.data?.documentTemplateRevision ?? null,
    approvalQuery.data?.documentTemplateDefaultPinned === true,
  ])
  return (
    <ApprovalDocViewLayout
      key={layoutEpochKey}
      id={id}
      docType={docType}
      approvalReady={approvalReady}
      lineItemsReady={lineItemsReady}
      inputTemplateReady={inputTemplateReady}
      approval={approvalQuery.data}
      attachments={attachmentsQuery.data ?? []}
      slipLineItems={referencedSlipLineItemsQuery.data ?? undefined}
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
  lineItemsReady: boolean
  inputTemplateReady: boolean
  approval: ApprovalLineAdminResponse | undefined
  attachments: ApprovalAttachment[]
  slipLineItems: SlipLineDetail[] | undefined
  templateFields: ApprovalTemplate['fields']
  approvalError: boolean
  attachmentsError: boolean
}

/** active layout query와 결정 latch를 docType epoch에 귀속하는 컴포넌트. */
function ApprovalDocViewLayout({
  id,
  docType,
  approvalReady,
  lineItemsReady,
  inputTemplateReady,
  approval,
  attachments,
  slipLineItems,
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
      if (approval?.documentTemplateDefaultPinned) return null
      const templateId = approval?.documentTemplateId
      const revision = approval?.documentTemplateRevision
      if (templateId && typeof revision === 'number' && Number.isInteger(revision) && revision > 0) {
        return findDocumentTemplateRevision(templateId, revision, docType!)
      }
      return findActiveDocumentTemplate(docType!)
    },
    // approvalReady가 아닌 동안(승인 데이터가 아직 재검증 중)에는 시작하지 않는다 — 그렇지
    // 않으면 stale approval의 pin 필드로 이 쿼리가 먼저 활성화되어 findActiveDocumentTemplate
    // 를 낭비 호출한 뒤, fresh approval이 도착하면 다른 queryKey로 다시 시작한다(R3 HIGH-1
    // 재검증 중 실측: 최종 렌더는 정확했지만 불필요한 API 호출이 발생했다).
    enabled: approvalReady && Boolean(docType) && approval?.documentTemplateDefaultPinned !== true,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
  })
  const [layoutDecision, setLayoutDecision] = useState<TemplateEnvelope | null>(null)
  // R3 MED-2 fix: 세 배너는 원래 매 렌더 "현재" approval/documentTemplateQuery 값에서
  // 다시 계산됐다. layoutDecision은 1회성 latch인데 배너는 latch되지 않으면, latch 이후
  // approval 캐시가 바뀌는 어떤 경로(재조회·무효화·경합)에서도 "화면에 보이는 배너"와
  // "실제로 그려진 문서"가 서로 다른 시점의 상태를 가리키는 모순이 가능해진다(실측 RED).
  // 배너 종류를 layoutDecision과 정확히 같은 순간에 함께 결정해 같은 latch로 묶는다.
  const [noticeKind, setNoticeKind] = useState<'none' | 'unpinned' | 'default-pinned' | 'pin-fetch-failed'>('none')
  const [layoutDecided, setLayoutDecided] = useState(false)
  const defaultPinned = approval?.documentTemplateDefaultPinned === true

  const layoutReady = defaultPinned || !docType || (
    !documentTemplateQuery.isFetching
    && (documentTemplateQuery.isSuccess || documentTemplateQuery.isError)
  )
  const hasPinnedLayout = Boolean(
    approval?.documentTemplateId
    && Number.isInteger(approval.documentTemplateRevision)
    && (approval.documentTemplateRevision ?? 0) > 0,
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
      const rawFetchFailed = documentTemplateQuery.isError || documentTemplateQuery.isRefetchError
      const activeResponse = defaultPinned
        ? null
        : rawFetchFailed
        ? null
        : documentTemplateQuery.data ?? null
      // pin은 있는데(승인 당시 각인은 성공) revision 조회 자체가 실패/malformed인 경우 —
      // 무고지로 DEFAULT에 강하하면 감사·법정 문서가 제3의 외형으로 조용히 인쇄된다(H-2).
      // isSuccess && data===null은 malformed 응답(파싱 실패)도 포함해 동일하게 고지한다.
      const pinFetchFailed = hasPinnedLayout && (
        rawFetchFailed || (documentTemplateQuery.isSuccess && documentTemplateQuery.data == null)
      )
      // docType이 아예 없는 문서(구식/독립형 결재)는 "레이아웃 pin" 개념 자체가 적용되지
      // 않으므로 고지 대상에서 제외한다(FABLE5 R1 LOW). 우선순위는 CHECK 제약상 상호배타인
      // 세 상태를 그대로 반영한다: pin-조회-실패 > default-pinned > unpinned.
      const nextNotice: typeof noticeKind = approval?.status !== 'APPROVED' || !docType
        ? 'none'
        : pinFetchFailed
        ? 'pin-fetch-failed'
        : defaultPinned
        ? 'default-pinned'
        : !hasPinnedLayout
        ? 'unpinned'
        : 'none'
      setLayoutDecision(resolveDocumentTemplate(activeResponse))
      setNoticeKind(nextNotice)
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
    documentTemplateQuery.isSuccess,
    defaultPinned,
    hasPinnedLayout,
    approval?.status,
    docType,
  ])

  if (!approvalReady || !lineItemsReady || !inputTemplateReady || !layoutDecided) {
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
    ...(slipLineItems == null ? {} : { slipLineItems }),
    backTo: `/groupware/approvals/${id}`,
  }
  const model = buildApprovalRenderModel(renderInput)

  return (
    <>
      {noticeKind === 'unpinned' && (
        <div
          className="approval-reprint-unpinned-notice no-print"
          role="status"
          data-testid="approval-reprint-unpinned-notice"
        >
          {/* R3 D-1 fix: 이 docType의 현재 ACTIVE 양식이 0개면 findActiveDocumentTemplate가
              null을 반환해 실제로는 GROUPWARE_DEFAULT가 렌더된다 — "현재 양식으로 표시됩니다"는
              그 경우 사실과 다르다(R2가 pin-fetch-failed 배너에서 이미 고친 것과 같은 계열). */}
          {layoutDecision?.docType === 'GROUPWARE_DEFAULT'
            ? '승인 당시 레이아웃 정보가 없고 현재 활성 양식도 없어 기본 양식(GROUPWARE_DEFAULT)으로 표시됩니다.'
            : '승인 당시 레이아웃 정보가 없어 현재 양식으로 표시됩니다.'}
        </div>
      )}
      {noticeKind === 'default-pinned' && (
        <div
          className="approval-reprint-default-pinned-notice no-print"
          role="status"
          data-testid="approval-reprint-default-pinned-notice"
        >
          승인 당시 활성 양식이 없어 기본 양식(GROUPWARE_DEFAULT)으로 고정 표시됩니다.
        </div>
      )}
      {noticeKind === 'pin-fetch-failed' && (
        <div
          className="approval-reprint-pin-failed-notice no-print"
          role="alert"
          data-testid="approval-reprint-pin-failed-notice"
        >
          승인 당시 레이아웃 조회에 실패해 기본 양식(GROUPWARE_DEFAULT)으로 대신 표시됩니다. 실제 승인 당시
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
