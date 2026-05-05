/**
 * 견적/주문 미리보기 (legacy `dlgFinal` + `dlgProgress` 1:1 + v2 정정).
 *
 * <p>v1 → v2 변경:
 * <ul>
 *   <li>정정 #4: '모델' → '모델명'</li>
 *   <li>정정 #5: '품목' → '품목명'</li>
 *   <li>정정 #12: 단가/소계 → {@link LinePriceDisplay} (출고가 + DC% + 최종가)</li>
 * </ul>
 *
 * <p>발송 전 마지막 확인. 라인 + 합계 + Bundle 펼침 모드 표시.
 * "주문하기" 클릭 시 `OrderInfoPage` 로 이동 (배송/현장 입력).
 */
import { Link, useNavigate } from 'react-router-dom'
import { useOrderStore } from '../stores/order'
import { useDcConfigStore } from '../stores/dcConfigStore'
import { BundleToggle } from '../components/order/BundleToggle'
import { LinePriceDisplay } from '../components/order/LinePriceDisplay'
import { useSessionStore } from '../stores/session'

const CATEGORY_LABEL: Record<string, string> = {
  HOME_MULTI: '홈멀티',
  SINGLE_SET: '싱글세트',
  COMMERCIAL_MULTI: '상업멀티',
  LEGACY: '구형',
}

export function OrderPreviewPage() {
  const navigate = useNavigate()
  const lines = useOrderStore((s) => s.lines)
  const grandTotal = useOrderStore((s) => s.grandTotal())
  const auth = useSessionStore((s) => s.auth)
  const dcConfig = useDcConfigStore((s) => s.config)

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
        {dcConfig && (
          <span style={{ marginLeft: 12, color: '#1e40af', fontSize: 13 }}>
            DC 자동 적용 중
            {dcConfig.homeMultiDc !== null && ` · 홈멀티 ${Math.round(dcConfig.homeMultiDc * 100)}%`}
            {dcConfig.commercialMultiDc !== null && ` · 상업멀티 ${Math.round(dcConfig.commercialMultiDc * 100)}%`}
          </span>
        )}
      </div>

      <div className="order-list">
        <table>
          <thead>
            <tr>
              <th>카테고리</th>
              <th>품목명</th>
              <th>모델명</th>
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
                <td>{CATEGORY_LABEL[l.estimateCategory] ?? l.estimateCategory}</td>
                <td style={{ textAlign: 'left' }}>{l.productName}</td>
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
