import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, type DataTableColumn } from '@samhan/design-system'
import {
  type LedgerListOptions,
  type LedgerReconcileRow,
} from '../../../api/accountingAdminApi'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { firstDayOfMonth, today } from '../../../utils/dateUtils'
import {
  FilterField,
  LEDGER_TRANSFORM_STATUS_LABEL,
  MoneyText,
  PAGE_SIZE,
  PagedTable,
  PlainText,
  StatusBadge,
  diffTone,
  filterBarStyle,
  headerStyle,
  inputStyle,
  pageRootStyle,
} from './Mig14AdminShared'

function ledgerTransformStatusTone(status: string): 'neutral' | 'success' | 'danger' | 'warning' {
  if (status === 'TRANSFORMED') return 'success'
  if (status === 'PENDING') return 'warning'
  return 'neutral'
}

interface LedgerListProps {
  title: string
  testId: string
  queryKey: string
  emptyMessage: string
  loadRows: (options: LedgerListOptions) => Promise<{
    content: LedgerReconcileRow[]
    totalElements: number
    totalPages: number
    number: number
    size: number
    first: boolean
    last: boolean
  }>
}

export function LedgerList({
  title,
  testId,
  queryKey,
  emptyMessage,
  loadRows,
}: LedgerListProps) {
  usePageTitle(title)

  const [page, setPage] = useState(0)
  const [partnerName, setPartnerName] = useState('')
  const [transformStatus, setTransformStatus] = useState('')
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState(today())
  const [applied, setApplied] = useState({
    partnerName: '',
    transformStatus: '',
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
        from: applied.from || undefined,
        to: applied.to || undefined,
        transformStatus: applied.transformStatus || undefined,
      }),
  })

  const columns: DataTableColumn<LedgerReconcileRow>[] = useMemo(
    () => [
      {
        key: 'transactionDate',
        header: '거래일',
        width: '110px',
        render: (row) => <PlainText value={row.transactionDate} />,
      },
      { key: 'transactionRef', header: '거래참조', width: '160px' },
      {
        key: 'transactionType',
        header: '거래유형',
        width: '110px',
        render: (row) => <PlainText value={row.transactionType} />,
      },
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
        key: 'supplyAmount',
        header: '공급가',
        width: '130px',
        align: 'right',
        render: (row) => <MoneyText value={row.supplyAmount} />,
      },
      {
        key: 'vatAmount',
        header: '부가세',
        width: '130px',
        align: 'right',
        render: (row) => <MoneyText value={row.vatAmount} />,
      },
      {
        key: 'totalAmount',
        header: '합계',
        width: '130px',
        align: 'right',
        render: (row) => <MoneyText value={row.totalAmount} strong />,
      },
      {
        key: 'dailyDiff',
        header: '일마감 차이',
        width: '130px',
        align: 'right',
        render: (row) => <MoneyText value={row.dailyDiff} strong />,
      },
      {
        key: 'transformStatus',
        header: '대조',
        width: '90px',
        render: (row) => {
          const tone = diffTone(row.dailyDiff)
          const status = row.transformStatus ?? 'PENDING'
          const label = LEDGER_TRANSFORM_STATUS_LABEL[status] ?? status
          if (tone === 'success') {
            return <StatusBadge label="일치" tone="success" />
          }
          if (status !== 'PENDING') {
            return <StatusBadge label={label} tone={ledgerTransformStatusTone(status)} />
          }
          return (
            <StatusBadge
              label="차이"
              tone="danger"
            />
          )
        },
      },
    ],
    [],
  )

  const applyFilters = () => {
    setPage(0)
    setApplied({
      partnerName: partnerName.trim(),
      transformStatus,
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
        <FilterField label="변환상태">
          <select
            value={transformStatus}
            onChange={(e) => setTransformStatus(e.target.value)}
            style={inputStyle}
          >
            <option value="">전체</option>
            <option value="PENDING">대기</option>
            <option value="TRANSFORMED">변환완료</option>
            <option value="REJECTED">제외</option>
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
        rowKey={(row) => `${row.transactionRef}-${row.sequenceNo ?? ''}-${row.transactionDate ?? ''}`}
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
