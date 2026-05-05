/**
 * 임시저장 (snapshot) 내역 — legacy snapshot table 1:1.
 *
 * <p>현 단계: M4 partner-order-service `/api/v1/partner-orders/drafts` 미존재 →
 * 본 화면은 placeholder. 실 데이터는 M4 통합 후.
 */
import { Link } from 'react-router-dom'

export function OrderSnapshotPage() {
  return (
    <div className="wrap">
      <div className="top">
        <div className="title">주문 저장 내역</div>
        <div className="top-actions">
          <Link className="btn btn-ghost" to="/orders/new">
            주문 작성으로
          </Link>
        </div>
      </div>
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-muted)' }}>
        저장된 임시 주문이 없습니다.<br />
        (M4 partner-order-service 통합 후 활성)
      </div>
    </div>
  )
}
