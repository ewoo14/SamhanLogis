/**
 * 주문저장 (PartnerOrderDraft) 내역 — legacy `divSnapshotPage` (line 1138) 1:1 + v3 정정 #17.
 *
 * <p>v3 변경:
 * - `useDraftStore` 통합 (sessionStorage 30일 보관 fallback)
 * - 저장본 행 별 "불러오기" / "삭제" 액션
 * - "불러오기" 클릭 → 현재 lines/info 를 저장본으로 교체 후 `/orders/new` 이동
 *
 * <p>실 데이터 흐름: M4 partner-order-service `/api/v1/partner-orders/drafts` 미존재 →
 * 단계 1 sessionStorage. 추후 M4 통합 시 본 컴포넌트의 store 만 교체.
 */
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDraftStore, type PartnerOrderDraft } from '../stores/draftStore'
import { useOrderStore } from '../stores/order'

export function OrderSnapshotPage() {
  const navigate = useNavigate()
  const drafts = useDraftStore((s) => s.drafts)
  const bootstrap = useDraftStore((s) => s.bootstrap)
  const deleteDraft = useDraftStore((s) => s.deleteDraft)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  function handleLoad(d: PartnerOrderDraft) {
    useOrderStore.setState({ lines: d.lines, info: d.info })
    navigate('/orders/new', { replace: true })
  }

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

      {drafts.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-muted)' }}>
          저장된 주문이 없습니다.
          <br />
          (주문서에서 <strong>주문저장</strong> 버튼으로 30일간 보관)
        </div>
      ) : (
        <div className="order-list">
          <table>
            <thead>
              <tr>
                <th>저장 시각</th>
                <th>거래처</th>
                <th>품목 수</th>
                <th>합계</th>
                <th>만료일</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.savedAt}>
                  <td>{new Date(d.savedAt).toLocaleString('ko-KR')}</td>
                  <td style={{ textAlign: 'left' }}>
                    <strong>{d.partnerName}</strong>
                    <br />
                    <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>{d.bizno}</span>
                  </td>
                  <td>{d.lines.length}</td>
                  <td>{d.totalAmount.toLocaleString()} 원</td>
                  <td>{new Date(d.expireAt).toLocaleDateString('ko-KR')}</td>
                  <td>
                    <button
                      className="btn-mini"
                      onClick={() => handleLoad(d)}
                      style={{ marginRight: 6 }}
                    >
                      불러오기
                    </button>
                    <button
                      className="btn-mini"
                      onClick={() => {
                        if (window.confirm('이 저장본을 삭제하시겠습니까?')) {
                          deleteDraft(d.savedAt)
                        }
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
