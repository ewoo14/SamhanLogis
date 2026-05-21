import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, type DataTableColumn } from '@samhan/design-system'
import {
  type CashTransactionListOptions,
  type CashTransactionRow,
} from '../../../api/accountingAdminApi'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { firstDayOfMonth, today } from '../../../utils/dateUtils'
import {
  FilterField,
  MoneyText,
  PAGE_SIZE,
  PagedTable,
  PlainText,
  filterBarStyle,
  headerStyle,
  inputStyle,
  pageRootStyle,
} from './Mig14AdminShared'

interface CashTransactionListProps {
  title: string
  testId: string
  queryKey: string
  emptyMessage: string
  kindLabels: Record<string, string>
  kindOptions: Array<{ value: string; label: string }>
  loadRows: (options: CashTransactionListOptions) => Promise<{
    content: CashTransactionRow[]
    totalElements: number
    totalPages: number
    number: number
    size: number
    first: boolean
    last: boolean
  }>
}

export function CashTransactionList({
  title,
  testId,
  queryKey,
  emptyMessage,
  kindLabels,
  kindOptions,
  loadRows,
}: CashTransactionListProps) {
  usePageTitle(title)

  const [page, setPage] = useState(0)
  const [partnerName, setPartnerName] = useState('')
  const [slipNo, setSlipNo] = useState('')
  const [kind, setKind] = useState('')
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState(today())
  const [applied, setApplied] = useState({
    partnerName: '',
    slipNo: '',
    kind: '',
    from: firstDayOfMonth(),
    to: today(),
  })

  const query = useQuery({
    queryKey: [queryKey, page, applied],
    queryFn: () =>
      loadRows({
        page,
        size: PAGE_SIZE,
        partnerName: applied.partnerName || undefined,
        slipNo: applied.slipNo || undefined,
        kind: applied.kind || undefined,
        from: applied.from || undefined,
        to: applied.to || undefined,
      }),
  })

  const columns: DataTableColumn<CashTransactionRow>[] = useMemo(
    () => [
      { key: 'transactionDate', header: '거래일', width: '110px' },
      { key: 'slipNo', header: '전표번호', width: '160px' },
      {
        key: 'partnerName',
        header: '거래처',
        render: (row) => (
          <div>
            <div>{row.partnerName}</div>
            <div style={{ fontSize: 11, color: '#6B7280' }}>
              <PlainText value={row.partnerCode} />
            </div>
          </div>
        ),
      },
      {
        key: 'kind',
        header: '유형',
        width: '110px',
        render: (row) => kindLabels[row.kind] ?? row.kind,
      },
      {
        key: 'amount',
        header: '금액',
        width: '130px',
        align: 'right',
        render: (row) => <MoneyText value={row.amount} strong />,
      },
      {
        key: 'journalNo',
        header: '연결 분개',
        width: '150px',
        render: (row) => <PlainText value={row.journalNo} />,
      },
      {
        key: 'memo',
        header: '메모',
        render: (row) => <PlainText value={row.memo} />,
      },
    ],
    [kindLabels],
  )

  const applyFilters = () => {
    setPage(0)
    setApplied({
      partnerName: partnerName.trim(),
      slipNo: slipNo.trim(),
      kind,
      from,
      to,
    })
  }

  return (
    <div style={pageRootStyle} data-testid={testId}>
      <div style={headerStyle}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <Button variant="primary" size="sm" onClick={applyFilters}>
          조회
        </Button>
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
        <FilterField label="전표번호">
          <input
            value={slipNo}
            onChange={(e) => setSlipNo(e.target.value)}
            placeholder="전표번호"
            style={inputStyle}
          />
        </FilterField>
        <FilterField label="유형">
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle}>
            <option value="">전체</option>
            {kindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="시작일">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
        </FilterField>
        <FilterField label="종료일">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </FilterField>
      </div>

      <PagedTable
        columns={columns}
        rows={query.data?.content ?? []}
        loading={query.isLoading}
        rowKey={(row) => `${row.slipNo}-${row.transactionDate}-${row.journalNo ?? ''}`}
        emptyMessage={emptyMessage}
        page={page}
        pageData={query.data}
        onPageChange={setPage}
        testId={`${testId}-table`}
      />

      {query.isError ? (
        <div className="error-banner" role="alert">
          {title} 데이터를 불러오지 못했습니다.
        </div>
      ) : null}
    </div>
  )
}
