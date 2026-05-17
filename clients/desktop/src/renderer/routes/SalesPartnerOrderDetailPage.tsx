/**
 * 주문서 상세 — `/sales/partner-orders/:id` (read-only).
 *
 * <p>거래처가 입력한 그대로 표시 (수정 X). Bundle EXPAND/KEEP 결과 + expanded
 * components + 자동 생성 슬립 번호 표시.
 */
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  PARTNER_ORDER_STATUS_LABEL,
  getPartnerOrder,
} from '../api/sales'
import { usePageTitleStore } from '../stores/pageTitle'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import styles from '../components/sales/sales.module.css'

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)
const bundleModeLabel = (mode: 'EXPAND' | 'KEEP' | null) => {
  if (mode === 'EXPAND') return '구성품 펼침'
  if (mode === 'KEEP') return '묶음 유지'
  return null
}

export function SalesPartnerOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)

  const isValidId = !!id && id !== 'undefined' && id !== 'null'

  const query = useQuery({
    queryKey: ['partner-order', id],
    queryFn: () => getPartnerOrder(id!),
    enabled: isValidId,
    retry: 1,
  })

  useEffect(() => {
    setPageTitle({ title: `주문서 ${query.data?.orderNumber ?? (isValidId ? id : '')}`, meta: '영업' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle, id, isValidId, query.data?.orderNumber])

  if (!isValidId) {
    return (
      <div className={styles['salesScope']}>
        <SalesSubNav />
        <div className={styles['wrap']}>
          <div className={styles['emptyState']}>
            <h3>주문번호가 지정되지 않았습니다</h3>
            <p>주문서 목록에서 항목을 선택해 주세요.</p>
            <Link to="/sales/partner-orders" className={styles['btnGhost']}>
              ← 목록으로 이동
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles['salesScope']}>
      <SalesSubNav />
      <div className={styles['wrap']}>
        <div className={styles['top']}>
          <div className={styles['title']}>
            주문서 상세
            <span className={styles['badge']}>{query.data?.orderNumber ?? id}</span>
          </div>
          <div className={styles['topActions']}>
            <Link to="/sales/partner-orders" className={styles['btnGhost']}>
              ← 목록
            </Link>
          </div>
        </div>

        {query.isLoading ? (
          <div className={styles['emptyState']}>주문 상세를 불러오는 중…</div>
        ) : query.isError ? (
          <div className={styles['emptyState']}>
            <h3>주문 조회에 실패했습니다</h3>
            <p>주문번호를 확인한 뒤 다시 시도해 주세요.</p>
          </div>
        ) : query.data ? (
          <>
            <div className={styles['card']}>
              <div className={styles['cardHead']}>
                <div className={styles['cardTitle']}>
                  거래처 · {query.data.partnerName ?? query.data.partnerCode}
                  <span className={styles['badge']}>
                    {PARTNER_ORDER_STATUS_LABEL[query.data.status]}
                  </span>
                </div>
                <div className={styles['cardActions']}>
                  <span className={styles['ratio']}>합계 {krw(query.data.totalAmount)}원</span>
                </div>
              </div>
              <div className={styles['formGrid']}>
                <div className={styles['formField']}>
                  <label>거래처 코드</label>
                  <input readOnly value={query.data.partnerCode} />
                </div>
                <div className={styles['formField']}>
                  <label>연결 전표</label>
                  <input readOnly value={query.data.linkedSlipNo ?? '-'} />
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
                {query.data.memo ? (
                  <div className={styles['formField']} style={{ gridColumn: '1 / -1' }}>
                    <label>요청사항</label>
                    <textarea readOnly value={query.data.memo} rows={3} />
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles['card']} style={{ marginTop: 12 }}>
              <div className={styles['cardHead']}>
                <div className={styles['cardTitle']}>
                  라인 ({query.data.lines?.length ?? 0}건)
                </div>
              </div>
              <div className={styles['tableWrap']}>
                <table className={styles['estTable']}>
                  <thead>
                    {/* v2 §정정 4/5 — '품명'→'품목명', '모델 코드'→'모델명' */}
                    <tr>
                      <th>품목명</th>
                      <th>모델명</th>
                      <th>수량</th>
                      <th>납품가</th>
                      <th>소계</th>
                      <th>묶음 처리</th>
                      <th>구성품 펼침</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(query.data.lines ?? []).map((line, index) => (
                      <tr key={`${line.modelCode}-${index}`}>
                        <td style={{ textAlign: 'left' }}>{line.productName}</td>
                        <td>{line.modelCode}</td>
                        <td>{line.quantity}</td>
                        <td className="numeric">{krw(line.deliveryPrice)}</td>
                        <td className="numeric">{krw(line.subtotal)}</td>
                        <td>
                          {bundleModeLabel(line.bundleMode) ? (
                            <span className={styles['badge']}>{bundleModeLabel(line.bundleMode)}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ textAlign: 'left', fontSize: 11 }}>
                          {line.expandedComponents.length === 0
                            ? '-'
                            : line.expandedComponents.map((c) => (
                                <div key={c.modelCode}>
                                  {c.productName} ({c.modelCode}) × {c.quantity}
                                </div>
                              ))}
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
