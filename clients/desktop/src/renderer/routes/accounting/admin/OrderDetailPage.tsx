import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, DataTable, Spinner, type DataTableColumn } from '@samhan/design-system'
import {
  getAccountingOrder,
  type OrderLineRow,
} from '../../../api/accountingAdminApi'
import { usePageTitle } from '../../../hooks/usePageTitle'
import {
  MoneyText,
  ORDER_STATUS_LABEL,
  PlainText,
  StatusBadge,
  headerStyle,
  orderStatusTone,
  pageRootStyle,
} from './Mig14AdminShared'

const fieldGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--ink-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--ink-primary)' }}>{value}</div>
    </div>
  )
}

export function OrderDetailPage() {
  usePageTitle('주문서 상세')
  const navigate = useNavigate()
  const { orderNo = '' } = useParams()
  const decodedOrderNo = decodeURIComponent(orderNo)

  const query = useQuery({
    queryKey: ['mig14-accounting-order-detail', decodedOrderNo],
    enabled: decodedOrderNo.length > 0,
    queryFn: () => getAccountingOrder(decodedOrderNo),
  })

  const columns: DataTableColumn<OrderLineRow>[] = useMemo(
    () => [
      {
        key: 'lineNo',
        header: '순번',
        width: '70px',
        align: 'right',
      },
      {
        key: 'itemName',
        header: '품목명',
        render: (row) => <span>{row.itemName}{row.unresolved ? ' (미해소)' : ''}</span>,
      },
      {
        key: 'quantity',
        header: '수량',
        width: '90px',
        align: 'right',
        render: (row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.quantity}</span>,
      },
      {
        key: 'unitPrice',
        header: '단가',
        width: '120px',
        align: 'right',
        render: (row) => <MoneyText value={row.unitPrice} />,
      },
      {
        key: 'supplyAmount',
        header: '공급가',
        width: '120px',
        align: 'right',
        render: (row) => <MoneyText value={row.supplyAmount} />,
      },
      {
        key: 'vatAmount',
        header: '부가세',
        width: '110px',
        align: 'right',
        render: (row) => <MoneyText value={row.vatAmount} />,
      },
      {
        key: 'totalAmount',
        header: '합계',
        width: '120px',
        align: 'right',
        render: (row) => <MoneyText value={row.lineTotal} strong />,
      },
      {
        key: 'itemDueDate',
        header: '납기',
        width: '110px',
        render: (row) => <PlainText value={row.itemDueDate} />,
      },
    ],
    [],
  )

  const order = query.data

  return (
    <div style={pageRootStyle} data-testid="mig14-order-detail-page">
      <div style={headerStyle}>
        <h3 style={{ margin: 0 }}>주문서 상세</h3>
        <Button variant="secondary" size="sm" onClick={() => navigate('/accounting/admin/orders')}>
          목록
        </Button>
      </div>

      {query.isLoading ? (
        <Card>
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 180 }}>
            <Spinner size="lg" label="주문서 로딩 중" />
          </div>
        </Card>
      ) : query.isError || !order ? (
        <div className="error-banner" role="alert">
          주문서 상세를 불러오지 못했습니다.
        </div>
      ) : (
        <>
          <Card>
            <div style={fieldGridStyle}>
              <DetailField label="주문번호" value={order.orderNo} />
              <DetailField label="유효기한" value={<PlainText value={order.validUntil} />} />
              <DetailField label="거래처" value={order.partnerName} />
              <DetailField label="담당자" value={<PlainText value={order.managerName} />} />
              <DetailField
                label="진행상태"
                value={
                  <StatusBadge
                    label={ORDER_STATUS_LABEL[order.progressStatus] ?? order.progressStatus}
                    tone={orderStatusTone(order.progressStatus)}
                  />
                }
              />
              <DetailField label="연결 전표" value={<PlainText value={order.linkedSlipNo} />} />
              <DetailField label="결제 조건" value={<PlainText value={order.paymentTerms} />} />
              <DetailField label="참조" value={<PlainText value={order.reference} />} />
              <DetailField label="공급가" value={<MoneyText value={order.totalSupplyAmount} />} />
              <DetailField label="부가세" value={<MoneyText value={order.totalVatAmount} />} />
              <DetailField label="합계" value={<MoneyText value={order.totalAmount} strong />} />
            </div>
          </Card>
          <div data-testid="mig14-order-detail-lines">
            <DataTable
              columns={columns}
              rows={order.lines ?? []}
              rowKey={(row) => `${order.orderNo}-${row.lineNo}`}
              emptyMessage="주문 라인이 없습니다."
            />
          </div>
        </>
      )}
    </div>
  )
}
