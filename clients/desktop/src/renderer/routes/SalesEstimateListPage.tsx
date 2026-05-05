/**
 * 견적서 목록 페이지 — `/sales/estimates`.
 *
 * <p>legacy `loadSnapshotHistory` (16423) 의 견적 저장내역 화면을 React 로 옮긴다.
 * 본 슬라이스 백엔드 (M3 estimate-service) 가 미배포 상태일 경우 빈 목록 + 안내 표시.
 *
 * <p>UUID 비공개 가드 — 사용자 노출 식별자는 estimateNumber / partnerName 만.
 */
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  ESTIMATE_CATEGORY_LABEL,
  ESTIMATE_STATUS_LABEL,
  listEstimates,
  type EstimateStatus,
} from '../api/sales'
import { usePageTitleStore } from '../stores/pageTitle'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import styles from '../components/sales/sales.module.css'

const STATUS_CLASS: Record<EstimateStatus, string> = {
  DRAFT: styles['statusDraft']!,
  CONFIRMED: styles['statusConfirmed']!,
  SENT: styles['statusSent']!,
  CONVERTED: styles['statusConverted']!,
  CANCELED: styles['statusCanceled']!,
}

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)
const ymd = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().slice(0, 10)
}

export function SalesEstimateListPage() {
  const navigate = useNavigate()
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)

  useEffect(() => {
    setPageTitle({ title: '견적서 목록', meta: '판매' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  const query = useQuery({
    queryKey: ['estimates', 0, 50],
    queryFn: () => listEstimates(0, 50),
    retry: 1,
  })

  return (
    <div className={styles['salesScope']}>
      <SalesSubNav />
      <div className={styles['wrap']}>
        <div className={styles['top']}>
          <div className={styles['title']}>
            견적서 목록
            <span className={styles['badge']}>전체 {query.data?.totalElements ?? 0}건</span>
          </div>
          <div className={styles['topActions']}>
            <button
              type="button"
              className={styles['btn']}
              onClick={() => navigate('/sales/estimates/new')}
            >
              + 새 견적
            </button>
          </div>
        </div>

        {query.isLoading ? (
          <div className={styles['emptyState']}>견적 목록을 불러오는 중…</div>
        ) : query.isError ? (
          <div className={styles['emptyState']}>
            <h3>estimate-service 가 응답하지 않습니다</h3>
            <p>M3 단계 estimate-service 가 미배포 상태일 수 있습니다.</p>
            <p style={{ fontSize: 11 }}>endpoint: GET /api/v1/estimates</p>
          </div>
        ) : (query.data?.content ?? []).length === 0 ? (
          <div className={styles['emptyState']}>
            <h3>등록된 견적이 없습니다</h3>
            <p>상단 [+ 새 견적] 버튼으로 첫 견적을 작성하세요.</p>
          </div>
        ) : (
          <table className={styles['listTable']}>
            <thead>
              <tr>
                <th>견적 번호</th>
                <th>작성일</th>
                <th>거래처</th>
                <th>카테고리</th>
                <th style={{ textAlign: 'right' }}>합계</th>
                <th>상태</th>
                <th>작성자</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.content ?? []).map((e) => (
                <tr
                  key={e.estimateNumber}
                  onClick={() => navigate(`/sales/estimates/${encodeURIComponent(e.estimateNumber)}`)}
                >
                  <td>{e.estimateNumber}</td>
                  <td>{ymd(e.createdAt)}</td>
                  <td>{e.partnerName}</td>
                  <td>{ESTIMATE_CATEGORY_LABEL[e.category]}</td>
                  <td className="numeric">{krw(e.totalAmount)}원</td>
                  <td>
                    <span className={`${styles['statusBadge']} ${STATUS_CLASS[e.status]}`}>
                      {ESTIMATE_STATUS_LABEL[e.status]}
                    </span>
                  </td>
                  <td>{e.authorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
