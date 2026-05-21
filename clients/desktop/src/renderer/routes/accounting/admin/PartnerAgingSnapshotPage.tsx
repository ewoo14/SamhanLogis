import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, type DataTableColumn } from '@samhan/design-system'
import { FilterChipBar, type FilterChip } from '../../../components/FilterChipBar'
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
  PagedTable,
  PlainText,
  TimestampText,
  filterBarStyle,
  headerStyle,
  inputStyle,
  pageRootStyle,
} from './Mig14AdminShared'

const AGING_DEFAULT_PAGE_SIZE = 100
const AGING_PAGE_SIZE_OPTIONS = [50, 100, 200, 500]

export function PartnerAgingSnapshotPage() {
  usePageTitle('거래처 잔액 스냅샷')
  const queryClient = useQueryClient()
  const { canAccess, permissions } = usePermissions()
  const canRefreshSnapshot = !!permissions && canAccess('ecount.mig14.aging-snapshot', 'edit')

  const [page, setPage] = useState(0)
  const [size, setSize] = useState(AGING_DEFAULT_PAGE_SIZE)
  const [partnerName, setPartnerName] = useState('')
  const [sort, setSort] = useState('net_receivable_desc')
  const [applied, setApplied] = useState({ partnerName: '', sort: 'net_receivable_desc' })
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const query = useQuery({
    queryKey: ['mig14-aging-snapshot', page, size, applied],
    queryFn: () =>
      listPartnerAgingSnapshots({
        page,
        size,
        partnerName: applied.partnerName || undefined,
        sort: applied.sort,
      }),
  })

  const refreshMutation = useMutation({
    mutationFn: refreshPartnerAgingSnapshot,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['mig14-aging-snapshot'] })
      setToast({
        type: 'success',
        message: `새로고침 완료 — ${formatRefreshTime(result.refreshedAt)}`,
      })
    },
    onError: (error) => {
      console.error('Partner aging snapshot refresh failed', error)
      setToast({ type: 'error', message: '새로고침 실패 — 운영자 문의' })
    },
  })

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

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

  const activeFilters: FilterChip[] = [
    applied.partnerName
      ? {
          key: 'partnerName',
          label: '거래처',
          value: applied.partnerName,
          onRemove: () => {
            setPage(0)
            setPartnerName('')
            setApplied((prev) => ({ ...prev, partnerName: '' }))
          },
        }
      : null,
  ].filter((filter): filter is FilterChip => filter !== null)

  const resetFilters = () => {
    setPage(0)
    setPartnerName('')
    setSort('net_receivable_desc')
    setApplied({ partnerName: '', sort: 'net_receivable_desc' })
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

      <FilterChipBar filters={activeFilters} onResetAll={resetFilters} />

      <PagedTable
        columns={columns}
        rows={query.data?.content ?? []}
        loading={query.isLoading}
        rowKey={(row) => `${row.partnerCode ?? row.partnerName}-${row.partnerName}`}
        emptyMessage="조회된 스냅샷이 없습니다."
        page={page}
        pageData={query.data}
        onPageChange={setPage}
        pageSize={size}
        pageSizeOptions={AGING_PAGE_SIZE_OPTIONS}
        onPageSizeChange={(nextSize) => {
          setPage(0)
          setSize(nextSize)
        }}
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
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 1000,
            maxWidth: 360,
            padding: '10px 14px',
            borderRadius: 6,
            background: toast.type === 'success' ? 'var(--color-success-700)' : 'var(--color-danger-700)',
            color: 'var(--color-neutral-0)',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
          }}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  )
}

function formatRefreshTime(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR')
}
