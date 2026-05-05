/**
 * 주문 상세 (조회 only — 발송 후) + v2 정정.
 *
 * <p>v1 → v2 변경:
 * <ul>
 *   <li>정정 #4: '모델' → '모델명'</li>
 *   <li>정정 #5: '품목' → '품목명'</li>
 *   <li>정정 #8: orderNo 'YYYY/MM/DD - 0001' 양식 표기</li>
 *   <li>정정 #12: 단가/소계 → {@link LinePriceDisplay} (DC + 옵션 적용)</li>
 * </ul>
 */
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getPartnerOrder } from '../api/orders'
import { useDcConfigStore } from '../stores/dcConfigStore'
import { BundleToggle } from '../components/order/BundleToggle'
import { LinePriceDisplay } from '../components/order/LinePriceDisplay'

export function OrderDetailPage() {
  // splat route — `*` 파라미터에 'YYYY/MM/DD - 0001' 전체 (slash 포함)
  const params = useParams<{ '*': string }>()
  const orderNo = params['*'] ?? ''
  const dcConfig = useDcConfigStore((s) => s.config)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['partner-order-detail', orderNo],
    queryFn: () => getPartnerOrder(orderNo),
    enabled: !!orderNo,
  })

  if (isLoading) return <div className="wrap">불러오는 중...</div>
  if (isError) return <div className="wrap">{(error as Error)?.message ?? '오류'}</div>
  if (!data) return <div className="wrap">주문을 찾을 수 없습니다.</div>

  return (
    <div className="wrap">
      <div className="top">
        {/* legacy `.title` 는 font-size:0 — OrderDetail 에서는 명시 헤딩 사용 */}
        <h2
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: '#0f172a',
            margin: 0,
          }}
        >
          주문 상세 — <span style={{ color: '#1e3a8a' }}>{data.orderNo}</span>
        </h2>
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
              <th>품목명</th>
              <th>모델명</th>
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
                <td>
                  <LinePriceDisplay
                    releasePrice={l.releasePrice}
                    category={l.estimateCategory}
                    options={l.options}
                    config={dcConfig}
                    compact
                  />
                </td>
                <td>{l.qty}</td>
                <td>
                  <LinePriceDisplay
                    releasePrice={l.releasePrice}
                    category={l.estimateCategory}
                    options={l.options}
                    config={dcConfig}
                    qty={l.qty}
                  />
                </td>
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
