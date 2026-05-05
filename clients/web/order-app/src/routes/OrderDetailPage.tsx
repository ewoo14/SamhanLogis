/**
 * 주문 상세 (조회 only — 발송 후).
 */
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getPartnerOrder } from '../api/orders'
import { BundleToggle } from '../components/order/BundleToggle'

export function OrderDetailPage() {
  const { orderNo } = useParams<{ orderNo: string }>()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['partner-order-detail', orderNo],
    queryFn: () => getPartnerOrder(orderNo!),
    enabled: !!orderNo,
  })

  if (isLoading) return <div className="wrap">불러오는 중...</div>
  if (isError) return <div className="wrap">{(error as Error)?.message ?? '오류'}</div>
  if (!data) return <div className="wrap">주문을 찾을 수 없습니다.</div>

  return (
    <div className="wrap">
      <div className="top">
        <div className="title">주문 상세 — {data.orderNo}</div>
        <div className="top-actions">
          <Link className="btn btn-ghost" to="/orders">
            목록
          </Link>
          <Link className="btn" to="/orders/new">
            새 주문
          </Link>
        </div>
      </div>

      <div className="order-list">
        <table>
          <thead>
            <tr>
              <th>품목</th>
              <th>모델</th>
              <th>단가</th>
              <th>수량</th>
              <th>합계</th>
              <th>Bundle</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.lineKey}>
                <td>{l.productName}</td>
                <td>{l.modelCode}</td>
                <td>{l.deliveryPrice.toLocaleString()}</td>
                <td>{l.qty}</td>
                <td>{(l.qty * l.deliveryPrice).toLocaleString()}</td>
                <td>{l.bundleMode ? <BundleToggle mode={l.bundleMode} onToggle={() => {}} readOnly /> : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--c-line)', borderRadius: 8 }}>
        <div>
          <strong>배송지:</strong> {data.info.deliveryAddress} {data.info.deliveryAddressDetail}
        </div>
        <div>
          <strong>현장명:</strong> {data.info.siteName}
        </div>
        <div>
          <strong>인수자:</strong> {data.info.receiver} ({data.info.receiverPhone})
        </div>
        <div>
          <strong>출고희망일:</strong> {data.info.dueDate}
        </div>
        <div>
          <strong>요청사항:</strong> {data.info.requestNote ?? '-'}
        </div>
      </div>
    </div>
  )
}
