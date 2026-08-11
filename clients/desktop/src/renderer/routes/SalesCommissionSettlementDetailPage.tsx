import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Spinner } from '@samhan/design-system'
import { confirmSalesCommissionSettlement, getSalesCommissionSettlement } from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

const PAGE_CODE = 'accounting.sales-commission-settlement'
const LIST_PATH = '/accounting/sales-commission-settlements'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '임시저장',
  CONFIRMED: '확정',
}

const amountLabel = (value: string | null): string => {
  if (value === null || value === undefined) return '—'
  const number = Number(value)
  return Number.isFinite(number) ? `₩${number.toLocaleString('ko-KR')}` : value
}

export function SalesCommissionSettlementDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()

  const query = useQuery({
    queryKey: ['accounting', 'sales-commission-settlement', id],
    queryFn: () => getSalesCommissionSettlement(id),
    enabled: Boolean(id),
  })

  usePageTitle('영업수수료 정산 상세', query.data?.documentNo ?? '임시저장')

  const confirmMutation = useMutation({
    mutationFn: () => confirmSalesCommissionSettlement(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'sales-commission-settlement', id] })
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'sales-commission-settlements'] })
    },
  })

  if (query.isLoading) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}><Spinner size="lg" label="정산서 불러오는 중" /></div>
  }

  if (query.isError || !query.data) {
    return <div className="error-banner" role="alert">영업수수료 정산서를 불러오지 못했습니다.</div>
  }

  const settlement = query.data
  const isDraft = settlement.status === 'DRAFT'
  const returnTo = typeof location.state === 'object' && location.state !== null
    && 'returnTo' in location.state && typeof location.state.returnTo === 'string'
    ? location.state.returnTo
    : LIST_PATH

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>{settlement.documentNo ?? '문서번호 없음'}</h3>
            <Badge variant={isDraft ? 'neutral' : 'success'}>{STATUS_LABEL[settlement.status]}</Badge>
          </div>
          <p style={{ margin: '8px 0 0', color: 'var(--color-neutral-600, #4B5563)', fontSize: 13 }}>
            확정 시 정산 기준일로 문서번호가 채번됩니다.
          </p>
        </div>
        <div className="detail-action-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="button" variant="ghost" onClick={() => navigate(returnTo)} data-testid="sales-commission-settlement-back">
            뒤로 가기
          </Button>
          {isDraft && canAccess(PAGE_CODE, 'update') ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}
              data-testid="sales-commission-settlement-confirm"
            >
              정산서 확정
            </Button>
          ) : null}
        </div>
      </div>

      {confirmMutation.isError ? <div role="alert" className="error-banner" style={{ marginTop: 16 }}>정산서 확정에 실패했습니다.</div> : null}

      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 18, margin: '28px 0 0' }}>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>정산 기준일</dt><dd style={{ margin: '4px 0 0' }}>{settlement.settlementDate}</dd></div>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>총액</dt><dd style={{ margin: '4px 0 0' }}>{amountLabel(settlement.totalAmount)}</dd></div>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>지급액</dt><dd style={{ margin: '4px 0 0' }}>{amountLabel(settlement.payoutAmount)}</dd></div>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>공급가액</dt><dd style={{ margin: '4px 0 0' }}>{amountLabel(settlement.supplyAmount)}</dd></div>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>부가세</dt><dd style={{ margin: '4px 0 0' }}>{amountLabel(settlement.vatAmount)}</dd></div>
        <div><dt style={{ color: '#6B7280', fontSize: 12 }}>적용 요율 계약</dt><dd style={{ margin: '4px 0 0' }}>{settlement.rateContractVersion === null ? '—' : `v${settlement.rateContractVersion}`}</dd></div>
      </dl>
    </Card>
  )
}
