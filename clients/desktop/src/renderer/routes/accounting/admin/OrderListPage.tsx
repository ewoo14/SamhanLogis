import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, type DataTableColumn } from '@samhan/design-system'
import { FilterChipBar, type FilterChip } from '../../../components/FilterChipBar'
import {
  listAccountingOrders,
  type OrderSummaryRow,
} from '../../../api/accountingAdminApi'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { toOrderPathId } from '../../../utils/orderNo'
import {
  FilterField,
  MoneyText,
  ORDER_STATUS_LABEL,
  PAGE_SIZE,
  PagedTable,
  PlainText,
  StatusBadge,
  filterBarStyle,
  headerStyle,
  inputStyle,
  orderStatusTone,
  pageRootStyle,
} from './Mig14AdminShared'

export function OrderListPage() {
  usePageTitle('주문서 관리')
  const navigate = useNavigate()

  const [page, setPage] = useState(0)
  const [partnerName, setPartnerName] = useState('')
  const [managerName, setManagerName] = useState('')
  const [progressStatus, setProgressStatus] = useState('')
  const [applied, setApplied] = useState({
    partnerName: '',
    managerName: '',
    progressStatus: '',
  })

  const query = useQuery({
    queryKey: ['mig14-accounting-orders', page, applied],
    queryFn: () =>
      listAccountingOrders({
        page,
        size: PAGE_SIZE,
        partnerName: applied.partnerName || undefined,
        managerName: applied.managerName || undefined,
        progressStatus: applied.progressStatus || undefined,
      }),
  })

  const columns: DataTableColumn<OrderSummaryRow>[] = useMemo(
    () => [
      { key: 'orderNo', header: '주문번호', width: '160px', mobilePriority: 'primary' },
      {
        key: 'validUntil',
        header: '유효기한',
        width: '110px',
        mobilePriority: 'hidden',
        render: (row) => <PlainText value={row.validUntil} />,
      },
      { key: 'partnerName', header: '거래처', mobilePriority: 'secondary' },
      {
        key: 'managerName',
        header: '담당자',
        width: '110px',
        mobilePriority: 'hidden',
        render: (row) => <PlainText value={row.managerName} />,
      },
      {
        key: 'progressStatus',
        header: '진행상태',
        width: '110px',
        mobilePriority: 'secondary',
        render: (row) => (
          <StatusBadge
            label={ORDER_STATUS_LABEL[row.progressStatus] ?? row.progressStatus}
            tone={orderStatusTone(row.progressStatus)}
          />
        ),
      },
      {
        key: 'linkedSlipNo',
        header: '연결 전표',
        width: '150px',
        mobilePriority: 'hidden',
        render: (row) => <PlainText value={row.linkedSlipNo} />,
      },
      {
        key: 'totalAmount',
        header: '합계',
        width: '130px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (row) => <MoneyText value={row.totalAmount} strong />,
      },
      {
        key: 'unresolvedLineCount',
        header: '미해소 라인',
        width: '110px',
        render: (row) => row.unresolvedLineCount ? `${row.unresolvedLineCount}건` : '-',
      },
      {
        key: 'totalSupplyAmount',
        header: '공급가',
        width: '130px',
        align: 'right',
        mobilePriority: 'hidden',
        render: (row) => <MoneyText value={row.totalSupplyAmount} />,
      },
    ],
    [],
  )

  const applyFilters = () => {
    setPage(0)
    setApplied({
      partnerName: partnerName.trim(),
      managerName: managerName.trim(),
      progressStatus,
    })
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
    applied.managerName
      ? {
          key: 'managerName',
          label: '담당자',
          value: applied.managerName,
          onRemove: () => {
            setPage(0)
            setManagerName('')
            setApplied((prev) => ({ ...prev, managerName: '' }))
          },
        }
      : null,
    applied.progressStatus
      ? {
          key: 'progressStatus',
          label: '진행상태',
          value: ORDER_STATUS_LABEL[applied.progressStatus] ?? applied.progressStatus,
          onRemove: () => {
            setPage(0)
            setProgressStatus('')
            setApplied((prev) => ({ ...prev, progressStatus: '' }))
          },
        }
      : null,
  ].filter((filter): filter is FilterChip => filter !== null)

  const resetFilters = () => {
    setPage(0)
    setPartnerName('')
    setManagerName('')
    setProgressStatus('')
    setApplied({
      partnerName: '',
      managerName: '',
      progressStatus: '',
    })
  }

  return (
    <div style={pageRootStyle} data-testid="mig14-order-list-page">
      <div style={headerStyle}>
        <h3 style={{ margin: 0 }}>주문서 관리</h3>
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
        <FilterField label="담당자명">
          <input
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            placeholder="담당자명"
            style={inputStyle}
          />
        </FilterField>
        <FilterField label="진행상태">
          <select
            value={progressStatus}
            onChange={(e) => setProgressStatus(e.target.value)}
            style={inputStyle}
          >
            <option value="">전체</option>
            <option value="PENDING">대기</option>
            <option value="IN_PROGRESS">진행</option>
            <option value="COMPLETED">완료</option>
            <option value="CANCELED">취소</option>
          </select>
        </FilterField>
      </div>

      <FilterChipBar filters={activeFilters} onResetAll={resetFilters} />

      <PagedTable
        columns={columns}
        rows={query.data?.content ?? []}
        loading={query.isLoading}
        rowKey={(row) => row.orderNo}
        onRowClick={(row) => navigate(`/accounting/admin/orders/${encodeURIComponent(toOrderPathId(row.orderNo))}`)}
        emptyMessage="조회된 주문서가 없습니다."
        page={page}
        pageData={query.data}
        onPageChange={setPage}
        testId="mig14-order-list-table"
      />

      {query.isError ? (
        <div className="error-banner" role="alert">
          주문서 목록을 불러오지 못했습니다.
        </div>
      ) : null}
    </div>
  )
}
