import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, Card, DataTable, type DataTableColumn } from '@samhan/design-system'
import {
  createSalesCommissionSettlement,
  listSalesCommissionSettlements,
  type SalesCommissionSettlement,
} from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { getScrollAnchor, saveScrollAnchor, type ReturnToLocation } from '../utils/returnContract'

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

export function SalesCommissionSettlementListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [formError, setFormError] = useState('')

  usePageTitle('영업수수료 정산')

  const returnTo: ReturnToLocation = { pathname: location.pathname, search: location.search }

  useEffect(() => {
    const anchor = getScrollAnchor(location.key)
    if (anchor == null) return
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: anchor, behavior: 'auto' }))
    return () => window.cancelAnimationFrame(frame)
  }, [location.key])

  const query = useQuery({
    queryKey: ['accounting', 'sales-commission-settlements'],
    queryFn: () => listSalesCommissionSettlements({ page: 0, size: 20 }),
  })

  const createMutation = useMutation({
    mutationFn: () => createSalesCommissionSettlement({ settlementDate }),
    onSuccess: async (settlement) => {
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'sales-commission-settlements'] })
      navigate(`${LIST_PATH}/${settlement.id}`)
    },
    onError: (error: Error) => setFormError(error.message || '정산서 생성에 실패했습니다.'),
  })

  const columns: DataTableColumn<SalesCommissionSettlement>[] = [
    {
      key: 'documentNo',
      header: '문서번호',
      width: '180px',
      mobilePriority: 'primary',
      render: (row) => {
        const linkLabel = row.documentNo ?? `${STATUS_LABEL[row.status] ?? row.status} · ${row.settlementDate}`
        return (
          <Link
            to={`${LIST_PATH}/${row.id}`}
            state={{ returnTo, returnEntryKey: location.key }}
            onClick={() => saveScrollAnchor(location.key)}
            aria-label={`${linkLabel} 상세 보기`}
            style={{ fontWeight: 700, color: 'var(--color-brand-700)', textDecoration: 'none' }}
            data-testid={`sales-commission-settlement-document-${row.documentNo ?? `draft-${row.settlementDate}`}`}
          >
            {linkLabel}
          </Link>
        )
      },
    },
    {
      key: 'settlementDate',
      header: '정산 기준일',
      width: '120px',
      mobilePriority: 'secondary',
    },
    {
      key: 'status',
      header: '상태',
      width: '100px',
      mobilePriority: 'secondary',
      render: (row) => STATUS_LABEL[row.status] ?? row.status,
    },
    {
      key: 'payoutAmount',
      header: '지급액',
      align: 'right',
      width: '140px',
      mobilePriority: 'secondary',
      render: (row) => amountLabel(row.payoutAmount),
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0 }}>영업수수료 정산</h3>
          <p style={{ margin: '6px 0 0', color: 'var(--color-neutral-600, #4B5563)', fontSize: 13 }}>
            DRAFT는 번호 없이 저장되고, 확정할 때 정산 기준일로 문서번호를 채번합니다.
          </p>
        </div>
        {canAccess(PAGE_CODE, 'create') ? (
          <Card>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                setFormError('')
                createMutation.mutate()
              }}
              style={{ display: 'flex', alignItems: 'end', gap: 8, flexWrap: 'wrap' }}
              data-testid="sales-commission-settlement-create-form"
            >
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--color-neutral-700, #374151)' }}>
                정산 기준일
                <input
                  type="date"
                  value={settlementDate}
                  onChange={(event) => setSettlementDate(event.target.value)}
                  required
                  aria-label="정산 기준일"
                  style={{ minHeight: 34, border: '1px solid #D1D5DB', borderRadius: 6, padding: '0 8px' }}
                />
              </label>
              <Button type="submit" variant="primary" loading={createMutation.isPending} data-testid="sales-commission-settlement-create">
                정산서 생성
              </Button>
            </form>
          </Card>
        ) : null}
      </div>

      {formError ? <div role="alert" className="error-banner" style={{ marginBottom: 16 }}>{formError}</div> : null}
      {query.isError ? <div role="alert" className="error-banner">정산서 목록을 불러오지 못했습니다.</div> : null}
      <div data-testid="sales-commission-settlement-list">
        <DataTable
          columns={columns}
          rows={query.data?.content ?? []}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          emptyMessage="등록된 영업수수료 정산서가 없습니다."
        />
      </div>
    </>
  )
}
