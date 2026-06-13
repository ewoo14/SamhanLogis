/**
 * 그룹웨어 결재 상세 — `/groupware/approvals/:id`.
 *
 * URL path 는 approvalId(UUID)를 사용하고, 화면에는 approvalNo 슬래시 표기와 업무 필드만 노출한다.
 */
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  APPROVAL_STATUS_LABEL,
  APPROVAL_STEP_STATUS_LABEL,
  getGroupwareApproval,
  type ApprovalLineAdminResponse,
  type ApprovalStatus,
  type ApprovalStepView,
} from '../api/groupwareApproval'
import { GroupwareApprovalCollaborationPanel } from '../components/collab/GroupwareApprovalCollaborationPanel'
import { usePageTitle } from '../hooks/usePageTitle'

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

export function GroupwareApprovalDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id: string }>()
  const approvalId = params['id']!

  const query = useQuery({
    queryKey: ['groupwareApproval', approvalId],
    queryFn: () => getGroupwareApproval(approvalId),
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

          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>결재선</h4>
            <DataTable
              columns={stepColumns}
              rows={approval.steps}
              rowKey={(step) => `${approval.approvalNo}-${step.sequence}`}
              emptyMessage="결재 단계가 없습니다."
            />
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
        }}
        onCommitted={handleCommitted}
      />
    </>
  )
}
