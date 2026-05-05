/**
 * 주문서 조회 목록 — `/sales/partner-orders` (read-only).
 *
 * <p>거래처가 보낸 주문 목록 (legacy partner-order Code.js 의 ORDER DB 결과 → SamhanLogis
 * partner-order-service M4 통합).
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  PARTNER_ORDER_STATUS_LABEL,
  listPartnerOrders,
  type PartnerOrderStatus,
} from '../api/sales'
import { formatSlipDate } from '../api/slipNumber'
import { usePageTitleStore } from '../stores/pageTitle'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import styles from '../components/sales/sales.module.css'

const STATUS_CLASS: Record<PartnerOrderStatus, string> = {
  DRAFT: styles['statusDraft']!,
  SUBMITTED: styles['statusSent']!,
  CONFIRMED: styles['statusConfirmed']!,
  CONVERTED: styles['statusConverted']!,
  CANCELED: styles['statusCanceled']!,
}

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)
// v2 §정정 8 — 'YYYY/MM/DD' 통일.
const ymd = (iso: string | null) => (iso ? formatSlipDate(iso) : '-')

export function SalesPartnerOrderListPage() {
  const navigate = useNavigate()
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const [statusFilter, setStatusFilter] = useState<PartnerOrderStatus | ''>('')

  useEffect(() => {
    setPageTitle({ title: '주문서 조회', meta: '판매' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  const query = useQuery({
    queryKey: ['partner-orders', statusFilter, 0],
    queryFn: () => listPartnerOrders(0, 50, statusFilter || undefined),
    retry: 1,
  })

  return (
    <div className={styles['salesScope']}>
      <SalesSubNav />
      <div className={styles['wrap']}>
        <div className={styles['top']}>
          <div className={styles['title']}>
            주문서 조회
            <span className={styles['badge']}>전체 {query.data?.totalElements ?? 0}건</span>
          </div>
          <div className={styles['topActions']}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PartnerOrderStatus | '')}
              aria-label="상태 필터"
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 13,
                background: '#fff',
              }}
            >
              <option value="">전체</option>
              {(Object.keys(PARTNER_ORDER_STATUS_LABEL) as PartnerOrderStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PARTNER_ORDER_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {query.isLoading ? (
          <div className={styles['emptyState']}>주문 목록을 불러오는 중…</div>
        ) : query.isError ? (
          <div className={styles['emptyState']}>
            <h3>partner-order-service 가 응답하지 않습니다</h3>
            <p>M4 단계 partner-order-service 가 미배포 상태일 수 있습니다.</p>
            <p style={{ fontSize: 11 }}>endpoint: GET /api/v1/partner-orders</p>
          </div>
        ) : (query.data?.content ?? []).length === 0 ? (
          <div className={styles['emptyState']}>
            <h3>등록된 주문이 없습니다</h3>
            <p>거래처가 주문서를 발송하면 본 목록에 표시됩니다.</p>
          </div>
        ) : (
          <table className={styles['listTable']}>
            <thead>
              <tr>
                <th>주문 번호</th>
                <th>거래처 코드</th>
                <th>거래처명</th>
                <th>발송일</th>
                <th style={{ textAlign: 'right' }}>합계</th>
                <th>상태</th>
                <th>연결 슬립</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.content ?? []).map((o) => (
                <tr
                  key={o.orderNumber}
                  onClick={() =>
                    navigate(`/sales/partner-orders/${encodeURIComponent(o.orderNumber)}`)
                  }
                >
                  <td>{o.orderNumber}</td>
                  <td>{o.partnerCode}</td>
                  <td>{o.partnerName}</td>
                  <td>{ymd(o.submittedAt)}</td>
                  <td className="numeric">{krw(o.totalAmount)}원</td>
                  <td>
                    <span className={`${styles['statusBadge']} ${STATUS_CLASS[o.status]}`}>
                      {PARTNER_ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </td>
                  <td>{o.linkedSlipNo ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
