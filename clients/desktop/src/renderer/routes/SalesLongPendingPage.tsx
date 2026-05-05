/**
 * 장기미발주 거래처 목록 — `/sales/long-pending`.
 *
 * <p>30일 이상 미발주 거래처 목록 표시 (M5 LongPendingScheduler 결과).
 *
 * <p>UUID 비공개 가드 — 사용자 노출 식별자는 businessRegistrationNumber / companyName 만.
 */
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listLongPendingPartners } from '../api/sales'
import { usePageTitleStore } from '../stores/pageTitle'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import styles from '../components/sales/sales.module.css'

const ymd = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '-')

export function SalesLongPendingPage() {
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  useEffect(() => {
    setPageTitle({ title: '장기미발주 거래처', meta: '판매' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  const query = useQuery({
    queryKey: ['long-pending', 0, 100],
    queryFn: () => listLongPendingPartners(0, 100),
    retry: 1,
  })

  return (
    <div className={styles['salesScope']}>
      <SalesSubNav />
      <div className={styles['wrap']}>
        <div className={styles['top']}>
          <div className={styles['title']}>
            장기미발주 거래처
            <span className={styles['badge']}>전체 {query.data?.totalElements ?? 0}건</span>
          </div>
          <div className={styles['topActions']}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              30일 이상 미발주 거래처 (M5 LongPendingScheduler 결과)
            </span>
          </div>
        </div>

        {query.isLoading ? (
          <div className={styles['emptyState']}>장기미발주 목록을 불러오는 중…</div>
        ) : query.isError ? (
          <div className={styles['emptyState']}>
            <h3>partner-service 가 응답하지 않습니다</h3>
            <p>M5 단계 LongPendingScheduler 가 미배포 상태일 수 있습니다.</p>
            <p style={{ fontSize: 11 }}>endpoint: GET /api/v1/partners/long-pending</p>
          </div>
        ) : (query.data?.content ?? []).length === 0 ? (
          <div className={styles['emptyState']}>
            <h3>장기미발주 거래처가 없습니다</h3>
            <p>모든 거래처가 30일 내 활동이 있습니다.</p>
          </div>
        ) : (
          <table className={styles['listTable']}>
            <thead>
              <tr>
                <th>사업자번호</th>
                <th>거래처명</th>
                <th>담당자</th>
                <th>마지막 주문일</th>
                <th>마지막 견적일</th>
                <th>최근 활동일</th>
                <th>미발주 일수</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.content ?? []).map((p) => (
                <tr key={p.businessRegistrationNumber}>
                  <td>{p.businessRegistrationNumber}</td>
                  <td>{p.companyName}</td>
                  <td>{p.assignedManagerName ?? '-'}</td>
                  <td>{ymd(p.lastOrderAt)}</td>
                  <td>{ymd(p.lastEstimateAt)}</td>
                  <td>{ymd(p.lastActivityAt)}</td>
                  <td>
                    {p.daysSinceLastActivity != null && p.daysSinceLastActivity > 30 ? (
                      <span
                        className={`${styles['statusBadge']} ${styles['statusLongPending']}`}
                      >
                        {p.daysSinceLastActivity}일
                      </span>
                    ) : (
                      `${p.daysSinceLastActivity ?? '-'}일`
                    )}
                  </td>
                  <td>
                    {p.authStatus ? (
                      <span className={`${styles['statusBadge']} ${styles['statusLongPending']}`}>
                        {p.authStatus}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
