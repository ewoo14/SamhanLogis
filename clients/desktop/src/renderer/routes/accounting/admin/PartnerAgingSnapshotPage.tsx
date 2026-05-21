import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, type DataTableColumn } from '@samhan/design-system'
import {
  listPartnerAgingSnapshots,
  refreshPartnerAgingSnapshot,
  type PartnerAgingSnapshotRow,
} from '../../../api/accountingAdminApi'
import { usePermissions } from '../../../hooks/usePermissions'
import { usePageTitle } from '../../../hooks/usePageTitle'
import {
  FilterField,
  MoneyText,
  PAGE_SIZE,
  PagedTable,
  PlainText,
  TimestampText,
  filterBarStyle,
  headerStyle,
  inputStyle,
  pageRootStyle,
} from './Mig14AdminShared'

export function PartnerAgingSnapshotPage() {
  usePageTitle('거래처 잔액 스냅샷')
  const queryClient = useQueryClient()
  const { canAccess, permissions } = usePermissions()
  const canRefreshSnapshot = !!permissions && canAccess('ecount.mig14.aging-snapshot', 'edit')

  const [page, setPage] = useState(0)
  const [partnerName, setPartnerName] = useState('')
  const [sort, setSort] = useState('net_receivable_desc')
  const [applied, setApplied] = useState({ partnerName: '', sort: 'net_receivable_desc' })

  const query = useQuery({
    queryKey: ['mig14-aging-snapshot', page, applied],
    queryFn: () =>
      listPartnerAgingSnapshots({
        page,
        size: PAGE_SIZE,
        partnerName: applied.partnerName || undefined,
        sort: applied.sort,
      }),
  })

  const refreshMutation = useMutation({
    mutationFn: refreshPartnerAgingSnapshot,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mig14-aging-snapshot'] })
    },
  })

  const columns: DataTableColumn<PartnerAgingSnapshotRow>[] = useMemo(
    () => [
      {
        key: 'partnerCode',
        header: '거래처코드',
        width: '120px',
        render: (row) => <PlainText value={row.partnerCode} />,
      },
      { key: 'partnerName', header: '거래처' },
      {
        key: 'totalReceivable',
        header: '미수 합계',
        width: '130px',
        align: 'right',
        render: (row) => <MoneyText value={row.totalReceivable} />,
      },
      {
        key: 'totalPayable',
        header: '미지급 합계',
        width: '130px',
        align: 'right',
        render: (row) => <MoneyText value={row.totalPayable} />,
      },
      {
        key: 'totalReceipt',
        header: '회수 합계',
        width: '130px',
        align: 'right',
        render: (row) => <MoneyText value={row.totalReceipt} />,
      },
      {
        key: 'totalDisbursement',
        header: '지출 합계',
        width: '130px',
        align: 'right',
        render: (row) => <MoneyText value={row.totalDisbursement} />,
      },
      {
        key: 'netReceivable',
        header: '순미수',
        width: '130px',
        align: 'right',
        render: (row) => <MoneyText value={row.netReceivable} strong />,
      },
      {
        key: 'netPayable',
        header: '순미지급',
        width: '130px',
        align: 'right',
        render: (row) => <MoneyText value={row.netPayable} strong />,
      },
      {
        key: 'netCash',
        header: '순현금',
        width: '130px',
        align: 'right',
        render: (row) => <MoneyText value={row.netCash} strong />,
      },
      {
        key: 'lastRefreshedAt',
        header: '갱신시각',
        width: '150px',
        render: (row) => <TimestampText value={row.lastRefreshedAt} />,
      },
    ],
    [],
  )

  const applyFilters = () => {
    setPage(0)
    setApplied({ partnerName: partnerName.trim(), sort })
  }

  return (
    <div style={pageRootStyle} data-testid="mig14-aging-snapshot-page">
      <div style={headerStyle}>
        <h3 style={{ margin: 0 }}>거래처 잔액 스냅샷</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {canRefreshSnapshot ? (
            <Button variant="secondary" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
              스냅샷 새로고침
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={applyFilters}>
            조회
          </Button>
        </div>
      </div>

      <div style={filterBarStyle}>
        <FilterField label="거래처명">
          <input
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            placeholder="거래처명"
            style={inputStyle}
          />
        </FilterField>
        <FilterField label="정렬">
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={inputStyle}>
            <option value="net_receivable_desc">순미수 큰 순</option>
            <option value="net_payable_desc">순미지급 큰 순</option>
            <option value="net_cash_desc">순현금 큰 순</option>
            <option value="partner_name_asc">거래처명</option>
          </select>
        </FilterField>
      </div>

      <PagedTable
        columns={columns}
        rows={query.data?.content ?? []}
        loading={query.isLoading}
        rowKey={(row) => `${row.partnerCode ?? row.partnerName}-${row.partnerName}`}
        emptyMessage="조회된 스냅샷이 없습니다."
        page={page}
        pageData={query.data}
        onPageChange={setPage}
        testId="mig14-aging-snapshot-table"
      />

      {query.isError ? (
        <div className="error-banner" role="alert">
          거래처 잔액 스냅샷을 불러오지 못했습니다.
        </div>
      ) : null}
      {refreshMutation.isError ? (
        <div className="error-banner" role="alert">
          스냅샷 새로고침 요청에 실패했습니다.
        </div>
      ) : null}
    </div>
  )
}
