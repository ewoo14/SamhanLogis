/**
 * 주문 발송내역 (legacy `#pageHistory` 1:1).
 *
 * <p>출고희망일 / 주문일시 별 기간 조회 + 검색어 + 상태 필터.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listPartnerOrders } from '../api/orders'
import { useSessionStore } from '../stores/session'

export function OrderListPage() {
  const auth = useSessionStore((s) => s.auth)
  const bizno = auth?.bizno ?? ''

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['partner-orders', bizno, startDate, endDate, search],
    queryFn: () => listPartnerOrders({ bizno, startDate, endDate, search }),
    enabled: !!bizno,
  })

  return (
    <div className="wrap">
      <div className="top">
        <div className="title">발송내역 ({auth?.partnerName ?? bizno})</div>
        <div className="top-actions">
          <Link className="btn btn-ghost" to="/orders/new">
            주문 작성으로
          </Link>
        </div>
      </div>

      <div className="filter-bar" style={{ borderRadius: 12, marginBottom: 12 }}>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{ height: 36, border: '1px solid var(--c-line)', borderRadius: 8, padding: '0 10px' }}
        />
        <span>~</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={{ height: 36, border: '1px solid var(--c-line)', borderRadius: 8, padding: '0 10px' }}
        />
        <div className="filter-search">
          <span className="filter-icon">🔍</span>
          <input
            className="filter-input"
            placeholder="주문번호 / 현장명"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="order-list">
        <table>
          <thead>
            <tr>
              <th>주문번호</th>
              <th>주문일시</th>
              <th>출고희망일</th>
              <th>상태</th>
              <th>품목수</th>
              <th>합계</th>
              <th>조회</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} style={{ padding: 24 }}>
                  불러오는 중...
                </td>
              </tr>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 24, color: 'var(--c-muted)' }}>
                  발송내역이 없습니다.
                </td>
              </tr>
            )}
            {data?.map((o) => (
              <tr key={o.orderNo}>
                <td>{o.orderNo}</td>
                <td>{new Date(o.orderedAt).toLocaleString('ko-KR')}</td>
                <td>{o.dueDate}</td>
                <td>{o.status}</td>
                <td>{o.lineCount}</td>
                <td>{o.totalAmount.toLocaleString()} 원</td>
                <td>
                  <Link to={`/orders/detail/${o.orderNo}`} className="btn-mini">
                    상세
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
