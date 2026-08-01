import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Input, Select, type DataTableColumn } from '@samhan/design-system'
import { FilterChipBar, type FilterChip } from '../components/FilterChipBar'
import {
  listCashReceipts,
  type CashReceiptRow,
} from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import {
  CASH_RECEIPT_KIND_OPTIONS,
  KIND_TONE,
  cashReceiptKindLabel,
  formatCashReceiptAmount,
  formatCashReceiptDate,
  listCashReceiptQueryOptions,
  truncatePartnerName,
  type CashReceiptFilterState,
} from './CashReceiptListPage.model'
import {
  FilterField,
  PAGE_SIZE,
  PagedTable,
  filterBarStyle,
  headerStyle,
  inputStyle,
  pageRootStyle,
} from './accounting/admin/Mig14AdminShared'

const PAGE_CODE = 'accounting.cash-receipts'

const INITIAL_FILTERS: CashReceiptFilterState = {
  partnerName: '',
  slipNo: '',
  kind: '',
  from: '',
  to: '',
}

const skeletonRows: CashReceiptRow[] = Array.from({ length: 8 }, (_, index) => ({
  id: `cash-receipt-loading-${index}`,
  slipNo: `__loading-${index}`,
  partnerName: '',
  amount: '',
  transactionDate: '',
  kind: '',
  status: '__LOADING__',
}))

function isSkeletonRow(row: CashReceiptRow): boolean {
  return row.status === '__LOADING__'
}

function SkeletonCell({ width = 80 }: { width?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width,
        maxWidth: '100%',
        height: 14,
        borderRadius: 4,
        background: 'var(--color-neutral-200)',
      }}
    />
  )
}

function amountStyle(row: CashReceiptRow) {
  const n = Number(row.amount)
  return {
    color: Number.isFinite(n) && n < 0 ? 'var(--state-danger)' : undefined,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  } as const
}

export function CashReceiptListPage() {
  usePageTitle('입금보고서')

  const { canAccess } = usePermissions()
  const canView = canAccess(PAGE_CODE, 'view')
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<CashReceiptFilterState>(INITIAL_FILTERS)
  const [applied, setApplied] = useState<CashReceiptFilterState>(INITIAL_FILTERS)

  const queryOptions = useMemo(
    () => listCashReceiptQueryOptions(applied, page, PAGE_SIZE),
    [applied, page],
  )

  const query = useQuery({
    queryKey: ['accounting', 'cash-receipts', queryOptions],
    queryFn: () => listCashReceipts(queryOptions),
    enabled: canView,
  })

  const applyFilters = () => {
    setPage(0)
    setApplied({
      partnerName: filters.partnerName.trim(),
      slipNo: filters.slipNo.trim(),
      kind: filters.kind,
      from: filters.from,
      to: filters.to,
    })
  }

  const resetFilters = () => {
    setPage(0)
    setFilters(INITIAL_FILTERS)
    setApplied(INITIAL_FILTERS)
  }

  const removeFilter = (key: keyof CashReceiptFilterState) => {
    setPage(0)
    setFilters((prev) => ({ ...prev, [key]: '' }))
    setApplied((prev) => ({ ...prev, [key]: '' }))
  }

  const activeFilters: FilterChip[] = [
    applied.partnerName
      ? { key: 'partnerName', label: '거래처명', value: applied.partnerName, onRemove: () => removeFilter('partnerName') }
      : null,
    applied.slipNo
      ? { key: 'slipNo', label: '전표번호', value: applied.slipNo, onRemove: () => removeFilter('slipNo') }
      : null,
    applied.kind
      ? { key: 'kind', label: '구분', value: cashReceiptKindLabel(applied.kind), onRemove: () => removeFilter('kind') }
      : null,
    applied.from
      ? { key: 'from', label: '시작일', value: applied.from, onRemove: () => removeFilter('from') }
      : null,
    applied.to
      ? { key: 'to', label: '종료일', value: applied.to, onRemove: () => removeFilter('to') }
      : null,
  ].filter((filter): filter is FilterChip => filter !== null)

  const columns: DataTableColumn<CashReceiptRow>[] = useMemo(
    () => [
      {
        key: 'slipNo',
        header: '전표번호',
        width: '170px',
        mobilePriority: 'primary',
        render: (row) => isSkeletonRow(row) ? <SkeletonCell width={120} /> : (
          <Link
            to={`/accounting/admin/cash-receipts/${row.id}`}
            style={{ fontWeight: 700, color: 'var(--color-brand-700)', textDecoration: 'none' }}
            data-testid={`cash-receipt-slip-${row.slipNo}`}
          >
            {row.slipNo}
          </Link>
        ),
      },
      {
        key: 'partnerName',
        header: '거래처',
        mobilePriority: 'secondary',
        render: (row) => isSkeletonRow(row) ? <SkeletonCell width={90} /> : (
          <span title={row.partnerName}>{truncatePartnerName(row.partnerName)}</span>
        ),
      },
      {
        key: 'kind',
        header: '구분',
        width: '110px',
        mobilePriority: 'secondary',
        render: (row) => isSkeletonRow(row) ? <SkeletonCell width={72} /> : (
          <Badge variant={KIND_TONE[row.kind] ?? 'neutral'}>
            {cashReceiptKindLabel(row.kind)}
          </Badge>
        ),
      },
      {
        key: 'transactionDate',
        header: '거래일',
        width: '120px',
        mobilePriority: 'secondary',
        render: (row) => isSkeletonRow(row) ? <SkeletonCell width={86} /> : (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatCashReceiptDate(row.transactionDate)}
          </span>
        ),
      },
      {
        key: 'amount',
        header: '금액',
        width: '140px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (row) => isSkeletonRow(row) ? <SkeletonCell width={92} /> : (
          <span style={amountStyle(row)}>{formatCashReceiptAmount(row.amount)}</span>
        ),
      },
      {
        key: 'journalNo',
        header: '연결 분개번호',
        width: '150px',
        mobilePriority: 'hidden',
        render: (row) => isSkeletonRow(row) ? <SkeletonCell width={110} /> : (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.journalNo || '-'}</span>
        ),
      },
    ],
    [],
  )

  // 권한 게이트는 라우트의 PermissionGuard(accounting.cash-receipts view)가 담당 —
  // 미보유 시 홈 리다이렉트되어 본 컴포넌트는 마운트되지 않는다(내부 재검사 불요).
  const rows = query.isLoading ? skeletonRows : (query.data?.content ?? [])
  const isEmpty = !query.isLoading && !query.isError && rows.length === 0

  return (
    <div style={pageRootStyle} data-testid="cash-receipt-list-page">
      <div style={headerStyle}>
        <h3 style={{ margin: 0 }}>입금보고서</h3>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={query.isFetching}
          disabled={query.isFetching}
          onClick={() => query.refetch()}
        >
          새로고침
        </Button>
      </div>

      <div style={filterBarStyle} data-testid="cash-receipt-filters">
        <FilterField label="거래처명">
          <Input
            value={filters.partnerName}
            onChange={(e) => setFilters((prev) => ({ ...prev, partnerName: e.target.value }))}
            placeholder="거래처명"
            fullWidth={false}
            data-testid="cash-receipt-filter-partner-name"
          />
        </FilterField>
        <FilterField label="전표번호">
          <Input
            value={filters.slipNo}
            onChange={(e) => setFilters((prev) => ({ ...prev, slipNo: e.target.value }))}
            placeholder="전표번호"
            fullWidth={false}
            data-testid="cash-receipt-filter-slip-no"
          />
        </FilterField>
        <FilterField label="구분">
          <Select
            value={filters.kind}
            onChange={(e) => setFilters((prev) => ({ ...prev, kind: e.target.value }))}
            fullWidth={false}
            style={inputStyle}
            aria-label="구분"
            data-testid="cash-receipt-filter-kind"
          >
            {CASH_RECEIPT_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="기간 시작">
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
            fullWidth={false}
            data-testid="cash-receipt-filter-from"
          />
        </FilterField>
        <FilterField label="기간 종료">
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
            fullWidth={false}
            data-testid="cash-receipt-filter-to"
          />
        </FilterField>
        <Button type="button" variant="primary" size="sm" onClick={applyFilters}>
          검색
        </Button>
      </div>

      <FilterChipBar filters={activeFilters} onResetAll={resetFilters} />

      {query.isError ? (
        <div className="error-banner" role="alert" data-testid="cash-receipt-error">
          입금 자료를 불러오지 못했습니다.
          <Button type="button" variant="secondary" size="sm" onClick={() => query.refetch()} style={{ marginLeft: 8 }}>
            다시 시도
          </Button>
        </div>
      ) : (
        <>
          <PagedTable
            columns={columns}
            rows={rows}
            loading={false}
            rowKey={(row) => row.id ?? row.slipNo}
            emptyMessage="조건에 맞는 입금 자료가 없습니다."
            page={page}
            pageData={query.data}
            onPageChange={setPage}
            testId="cash-receipt-list-table"
            pageSize={PAGE_SIZE}
          />

          {isEmpty ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Button type="button" variant="secondary" size="sm" onClick={resetFilters}>
                필터 초기화
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
