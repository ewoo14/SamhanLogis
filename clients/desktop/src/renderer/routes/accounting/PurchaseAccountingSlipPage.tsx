import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, DataTable, Spinner, type DataTableColumn } from '@samhan/design-system'
import {
  listPurchaseAccountingSlips,
  postPurchaseSlip,
  type PurchaseAccountingSlipResponse,
  type PurchaseAccountingSlipStatus,
} from '../../api/purchaseAccountingSlipApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'
import { today, firstDayOfMonth } from '../../utils/dateUtils'
import { fmtKrw } from '../../utils/currencyUtils'

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--line-default)',
  background: 'var(--surface-card)',
}

const SLIP_STATUS_LABEL: Record<PurchaseAccountingSlipStatus, string> = {
  DRAFT: '임시저장',
  POSTED: '반영완료(전기)',
}

export function PurchaseAccountingSlipPage() {
  usePageTitle('매입전표')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canCreate = canAccess('accounting.purchase-slip.accounting', 'create')
  const canPost = canAccess('accounting.purchase-slip.accounting', 'update')
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState(today())
  const [partnerCode, setPartnerCode] = useState('')
  const [status, setStatus] = useState<PurchaseAccountingSlipStatus | 'ALL'>('ALL')

  const query = useQuery({
    queryKey: ['purchase-accounting-slips', from, to, partnerCode, status],
    queryFn: () =>
      listPurchaseAccountingSlips({
        from,
        to,
        partnerCode: partnerCode.trim() || undefined,
        status,
      }),
  })

  const postMutation = useMutation({
    mutationFn: postPurchaseSlip,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-accounting-slips'] })
    },
  })

  const columns: DataTableColumn<PurchaseAccountingSlipResponse>[] = useMemo(
    () => [
      { key: 'slipNo', header: '전표번호', width: '160px', mobilePriority: 'primary' },
      { key: 'slipDate', header: '일자', width: '110px', mobilePriority: 'hidden' },
      { key: 'partnerName', header: '거래처', mobilePriority: 'secondary' },
      {
        key: 'status',
        header: '상태',
        width: '90px',
        mobilePriority: 'secondary',
        render: (row) => (
          <Badge variant={row.status === 'POSTED' ? 'success' : 'danger'}>
            {SLIP_STATUS_LABEL[row.status] ?? row.status}
          </Badge>
        ),
      },
      {
        key: 'totalSupplyAmount',
        header: '공급가',
        width: '120px',
        align: 'right',
        mobilePriority: 'hidden',
        render: (row) => fmtKrw(row.totalSupplyAmount),
      },
      {
        key: 'totalAmount',
        header: '합계',
        width: '120px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (row) => fmtKrw(row.totalAmount),
      },
      {
        key: 'action',
        header: '',
        width: '96px',
        mobilePriority: 'secondary',
        render: (row) =>
          canPost && row.status === 'DRAFT' ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={postMutation.isPending}
              onClick={() => postMutation.mutate(row.slipNo)}
            >
              전기
            </Button>
          ) : null,
      },
    ],
    [canPost, postMutation],
  )

  return (
    <div data-testid="purchase-accounting-slip-page">
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>매입전표</h3>
          {canCreate ? (
            <Button variant="primary" onClick={() => navigate('/accounting/purchase-slips/new')}>
              작성
            </Button>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          <input
            value={partnerCode}
            onChange={(e) => setPartnerCode(e.target.value)}
            placeholder="거래처 코드"
            style={{ ...inputStyle, width: 140 }}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value as PurchaseAccountingSlipStatus | 'ALL')} style={inputStyle}>
            <option value="ALL">전체</option>
            <option value="DRAFT">{SLIP_STATUS_LABEL.DRAFT}</option>
            <option value="POSTED">{SLIP_STATUS_LABEL.POSTED}</option>
          </select>
        </div>
      </Card>

      <Card>
        {query.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
            <Spinner size="lg" label="매입전표 로딩 중" />
          </div>
        ) : query.isError ? (
          <div className="error-banner" role="alert">매입전표 목록을 불러오지 못했습니다.</div>
        ) : (
          <DataTable
            columns={columns}
            rows={query.data ?? []}
            rowKey={(row) => row.slipNo}
            emptyMessage="매입전표가 없습니다."
          />
        )}
      </Card>
    </div>
  )
}
