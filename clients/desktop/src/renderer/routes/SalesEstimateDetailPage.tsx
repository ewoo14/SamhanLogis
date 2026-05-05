/**
 * 견적서 조회/편집 페이지 — `/sales/estimates/:id`.
 *
 * <p>작성 페이지 ({@code SalesEstimateFormPage}) 와 동일한 4 카드 grid + Excel UX 를
 * 재사용하되, status === 'DRAFT' 일 때만 편집 가능, 그 외에는 read-only.
 *
 * <p>본 슬라이스에서는 estimate-service M3 가 미배포 → fetch 실패 시 작성 페이지로
 * fallback 하지 않고 안내 표시 (사용자가 새 견적 페이지로 이동).
 */
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ESTIMATE_CATEGORY_LABEL,
  ESTIMATE_STATUS_LABEL,
  getEstimate,
} from '../api/sales'
import { usePageTitleStore } from '../stores/pageTitle'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import styles from '../components/sales/sales.module.css'

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)

export function SalesEstimateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)

  useEffect(() => {
    setPageTitle({ title: `견적서 ${id ?? ''}`, meta: '판매' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle, id])

  const query = useQuery({
    queryKey: ['estimate', id],
    queryFn: () => getEstimate(id!),
    enabled: !!id,
    retry: 1,
  })

  return (
    <div className={styles['salesScope']}>
      <SalesSubNav />
      <div className={styles['wrap']}>
        <div className={styles['top']}>
          <div className={styles['title']}>
            견적서 상세
            <span className={styles['badge']}>{id}</span>
          </div>
          <div className={styles['topActions']}>
            <Link
              to={`/sales/estimates/${encodeURIComponent(id ?? '')}/print`}
              className={styles['btnGhost']}
            >
              인쇄 미리보기
            </Link>
          </div>
        </div>

        {query.isLoading ? (
          <div className={styles['emptyState']}>견적 상세를 불러오는 중…</div>
        ) : query.isError ? (
          <div className={styles['emptyState']}>
            <h3>견적 조회에 실패했습니다</h3>
            <p>견적번호: {id}</p>
            <p style={{ fontSize: 11 }}>endpoint: GET /api/v1/estimates/{'{id}'}</p>
            <p>M3 estimate-service 가 미배포 상태일 수 있습니다.</p>
            <Link to="/sales/estimates" className={styles['btn']}>
              목록으로
            </Link>
          </div>
        ) : query.data ? (
          <>
            <div className={styles['card']}>
              <div className={styles['cardHead']}>
                <div className={styles['cardTitle']}>
                  거래처 · {query.data.partnerName}
                  <span className={styles['badge']}>
                    {ESTIMATE_STATUS_LABEL[query.data.status]}
                  </span>
                </div>
                <div className={styles['cardActions']}>
                  <span className={styles['ratio']}>
                    합계 {krw(query.data.totalAmount)}원
                  </span>
                </div>
              </div>
              <div className={styles['formGrid']}>
                <div className={styles['formField']}>
                  <label>카테고리</label>
                  <input
                    readOnly
                    value={ESTIMATE_CATEGORY_LABEL[query.data.category]}
                  />
                </div>
                <div className={styles['formField']}>
                  <label>작성자</label>
                  <input readOnly value={query.data.authorName} />
                </div>
                <div className={styles['formField']}>
                  <label>배송지</label>
                  <input readOnly value={query.data.deliveryAddress ?? '-'} />
                </div>
                <div className={styles['formField']}>
                  <label>현장</label>
                  <input readOnly value={query.data.siteAddress ?? '-'} />
                </div>
                <div className={styles['formField']}>
                  <label>연락처</label>
                  <input readOnly value={query.data.contactPhone ?? '-'} />
                </div>
                <div className={styles['formField']}>
                  <label>납기</label>
                  <input readOnly value={query.data.dueDate ?? '-'} />
                </div>
              </div>
            </div>

            <div className={styles['card']} style={{ marginTop: 12 }}>
              <div className={styles['cardHead']}>
                <div className={styles['cardTitle']}>
                  라인 ({query.data.lines.length}건)
                </div>
              </div>
              <div className={styles['tableWrap']}>
                <table className={styles['estTable']}>
                  <thead>
                    <tr>
                      <th>카테고리</th>
                      <th>품명</th>
                      <th>모델 코드</th>
                      <th>수량</th>
                      <th>납품가</th>
                      <th>소계</th>
                      <th>Bundle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{ESTIMATE_CATEGORY_LABEL[line.category]}</td>
                        <td style={{ textAlign: 'left' }}>{line.productName}</td>
                        <td>{line.modelCode}</td>
                        <td>{line.quantity}</td>
                        <td className="numeric">{krw(line.deliveryPrice)}</td>
                        <td className="numeric">{krw(line.subtotal)}</td>
                        <td>
                          {line.bundleMode ? (
                            <span className={styles['badge']}>{line.bundleMode}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
