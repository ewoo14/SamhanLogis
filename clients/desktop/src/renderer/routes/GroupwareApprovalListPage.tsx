/**
 * 그룹웨어 결재 목록 — `/groupware/approvals`.
 *
 * approvalNo 는 슬래시 표기를 그대로 보여주고, 상세 URL 은 approvalId(UUID)를 사용한다.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  DataTable,
  safeActorName,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  APPROVAL_STATUS_LABEL,
  listGroupwareApprovals,
  type ApprovalLineAdminResponse,
  type ApprovalStatus,
} from '../api/groupwareApproval'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { DocumentNumberLink } from '../components/DocumentNumberLink'

const STATUS_OPTIONS: Array<{ value: ApprovalStatus | ''; label: string }> = [
  { value: '', label: '전체' },
  { value: 'PENDING', label: '대기' },
  { value: 'IN_PROGRESS', label: '진행중' },
  { value: 'APPROVED', label: '승인' },
  { value: 'REJECTED', label: '반려' },
  { value: 'WITHDRAWN', label: '회수' },
]

const STATUS_VARIANT: Record<ApprovalStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'brand',
  APPROVED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'warning',
}

function requestDateFromApprovalNo(approvalNo: string): string {
  const match = approvalNo.match(/^(\d{4}\/\d{2}\/\d{2})-/)
  return match?.[1] ?? '-'
}

function displayNameOrFallback(value: string | null | undefined): string {
  return safeActorName(value) ?? '-'
}

export function GroupwareApprovalListPage() {
  const navigate = useNavigate()
  const { canAccess } = usePermissions()
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | ''>('')

  usePageTitle('그룹웨어 결재')

  const query = useQuery({
    queryKey: ['groupwareApprovals', statusFilter],
    queryFn: () =>
      listGroupwareApprovals(statusFilter ? { status: statusFilter } : {}),
  })

  const rows = Array.isArray(query.data) ? query.data : []
  const canCreate = canAccess('groupware.approvals', 'update')

  const columns: DataTableColumn<ApprovalLineAdminResponse>[] = useMemo(() => [
    {
      key: 'title',
      header: '제목',
      mobilePriority: 'primary',
      render: (row) => (
        <span style={{ overflowWrap: 'anywhere' }}>{row.title}</span>
      ),
    },
    {
      key: 'approvalNo',
      header: '결재문서번호',
      width: '170px',
      mobilePriority: 'hidden',
      render: (row) => (
        <DocumentNumberLink
          number={row.approvalNo}
          to={row.approvalId ? `/groupware/approvals/${row.approvalId}` : ''}
        />
      ),
    },
    {
      key: 'status',
      header: '상태',
      width: '110px',
      mobilePriority: 'secondary',
      render: (row) => (
        <Badge variant={STATUS_VARIANT[row.status]}>
          {APPROVAL_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
    {
      key: 'requesterName',
      header: '요청자',
      width: '120px',
      mobilePriority: 'secondary',
      render: (row) => displayNameOrFallback(row.requesterName),
    },
    {
      key: 'requestDate',
      header: '요청일',
      width: '120px',
      mobilePriority: 'secondary',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {requestDateFromApprovalNo(row.approvalNo)}
        </span>
      ),
    },
  ], [])

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ margin: 0 }}>
          결재
          <span style={{ fontSize: 12, color: 'var(--color-neutral-500, #6B7280)', marginLeft: 8 }}>
            전체 {rows.length}건
          </span>
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: 'var(--ink-primary)' }}>
            상태
            <br />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ApprovalStatus | '')}
              style={{
                height: 36,
                padding: '0 8px',
                borderRadius: 6,
                border: '1px solid var(--color-neutral-300)',
                fontSize: 13,
                minWidth: 130,
              }}
              data-testid="groupware-approval-list-status-filter"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {canCreate ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => navigate('/groupware/approvals/new')}
              data-testid="groupware-approval-create-link"
            >
              결재 작성
            </Button>
          ) : null}
        </div>
      </div>

      <div data-testid="groupware-approval-list-table">
        <DataTable
          columns={columns}
          rows={rows}
          loading={query.isLoading}
          rowKey={(row) => row.approvalId}
          onRowClick={(row) => navigate(`/groupware/approvals/${row.approvalId}`)}
          emptyMessage="등록된 결재 문서가 없습니다."
        />
      </div>

      {query.isError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          결재 목록을 불러오지 못했습니다. groupware-service 의 결재 조회 endpoint 를 확인하세요.
        </div>
      ) : null}
    </Card>
  )
}
