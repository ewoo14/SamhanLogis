/**
 * 견적/주문 미리보기 (legacy `dlgFinal` + `dlgProgress` 1:1).
 *
 * <p>발송 전 마지막 확인. 라인 + 합계 + Bundle 펼침 모드 표시.
 * "주문하기" 클릭 시 `OrderInfoPage` 로 이동 (배송/현장 입력).
 */
import { Link, useNavigate } from 'react-router-dom'
import { useOrderStore } from '../stores/order'
import { BundleToggle } from '../components/order/BundleToggle'
import { useSessionStore } from '../stores/session'

export function OrderPreviewPage() {
  const navigate = useNavigate()
  const lines = useOrderStore((s) => s.lines)
  const grandTotal = useOrderStore((s) => s.grandTotal())
  const auth = useSessionStore((s) => s.auth)

  return (
    <div className="wrap">
      <div className="top">
        <div className="title">미리보기</div>
        <div className="top-actions">
          <Link className="btn btn-ghost" to="/orders/new">
            돌아가기
          </Link>
          <button className="btn" disabled={lines.length === 0} onClick={() => navigate('/orders/info')}>
            주문하기
          </button>
        </div>
      </div>

      <div style={{ padding: 12, border: '1px solid var(--c-line)', borderRadius: 8, marginBottom: 12 }}>
        <strong>거래처:</strong> {auth?.partnerName ?? '-'} ({auth?.bizno ?? '-'})
      </div>

      <div className="order-list">
        <table>
          <thead>
            <tr>
              <th>카테고리</th>
              <th>품목</th>
              <th>모델</th>
              <th>단가</th>
              <th>수량</th>
              <th>합계</th>
              <th>Bundle</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 24, color: 'var(--c-muted)' }}>
                  선택된 품목이 없습니다.
                </td>
              </tr>
            )}
            {lines.map((l) => (
              <tr key={l.lineKey}>
                <td>{l.estimateCategory}</td>
                <td style={{ textAlign: 'left' }}>{l.productName}</td>
                <td>{l.modelCode}</td>
                <td>{l.deliveryPrice.toLocaleString()}</td>
                <td>{l.qty}</td>
                <td>{(l.qty * l.deliveryPrice).toLocaleString()}</td>
                <td>{l.bundleMode ? <BundleToggle mode={l.bundleMode} onToggle={() => {}} readOnly /> : '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="sumrow">
              <td colSpan={5}>
                <strong>합계</strong>
              </td>
              <td colSpan={2}>
                <strong>{grandTotal.toLocaleString()} 원</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
