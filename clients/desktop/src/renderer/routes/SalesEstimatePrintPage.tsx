/**
 * 견적서 인쇄 미리보기 — `/sales/estimates/:id/print`.
 *
 * <p>legacy estimate index.html 의 종합견적서 layout 을 React 단일 페이지로 옮긴다.
 * 본 슬라이스에서는 react-pdf 미통합 — A4 portrait CSS-only preview 만 제공
 * (브라우저 인쇄 → PDF 저장).
 *
 * <p>F5 결정: react-pdf 통합은 후속 슬라이스 (Sub-team A skeleton 단계 → M3 완성).
 *
 * <p>본 페이지는 store ephemeral 라인을 그대로 사용 (실제 estimate 저장 후에는 GET
 * `/api/v1/estimates/{id}` fetch 로 교체).
 */
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePricingStore } from '../stores/usePricingStore'
import { usePageTitleStore } from '../stores/pageTitle'
import { ESTIMATE_CATEGORY_LABEL } from '../api/sales'
import styles from '../components/sales/sales.module.css'

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)

export function SalesEstimatePrintPage() {
  const params = useParams<{ id?: string }>()
  const lines = usePricingStore((s) => s.lines)
  const orderInfo = usePricingStore((s) => s.orderInfo)
  const grandTotal = usePricingStore((s) => s.grandTotal)
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)

  useEffect(() => {
    setPageTitle({ title: '견적서 인쇄 미리보기', meta: '판매' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className={`${styles['salesScope']} ${styles['printShell']}`}>
      <div className={`${styles['noPrint']} ${styles['top']}`}>
        <Link to="/sales/estimates" className={styles['btnGhost']}>
          ← 목록
        </Link>
        <button
          type="button"
          className={styles['btn']}
          onClick={() => window.print()}
        >
          인쇄 / PDF 저장
        </button>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          F5 결정: react-pdf 통합 후속 슬라이스 — 현재는 브라우저 인쇄로 PDF 저장
        </span>
      </div>

      <div className={styles['printPaper']}>
        <div className={styles['printHeader']}>
          <h1>종 합 견 적 서</h1>
          <div className={styles['printMeta']}>
            견적번호: {params.id ?? '신규'}
            <br />
            발행일: {today}
          </div>
        </div>

        <div className={styles['printPartnerBox']}>
          <label>거래처명</label>
          <div>{orderInfo.partnerName ?? '(미입력)'}</div>
          <label>사업자번호</label>
          <div>{orderInfo.partnerCode ?? '(미입력)'}</div>
          <label>배송지</label>
          <div>
            {orderInfo.deliveryAddress}
            {orderInfo.deliveryAddressDetail ? ` ${orderInfo.deliveryAddressDetail}` : ''}
          </div>
          <label>현장</label>
          <div>
            {orderInfo.siteAddress}
            {orderInfo.siteAddressDetail ? ` ${orderInfo.siteAddressDetail}` : ''}
          </div>
          <label>연락처</label>
          <div>{orderInfo.contactPhone || '-'}</div>
          <label>납기</label>
          <div>{orderInfo.dueDate || '-'}</div>
        </div>

        <table className={styles['estTable']}>
          <thead>
            <tr>
              <th>카테고리</th>
              <th>품명</th>
              <th>모델</th>
              <th style={{ width: 60 }}>수량</th>
              <th>납품가</th>
              <th>소계</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 24, color: '#6b7280' }}>
                  견적 라인이 없습니다.
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.id}>
                  <td>{ESTIMATE_CATEGORY_LABEL[l.category]}</td>
                  <td style={{ textAlign: 'left' }}>{l.productName}</td>
                  <td>{l.modelCode}</td>
                  <td>{l.quantity}</td>
                  <td className="numeric">{krw(l.deliveryPrice)}</td>
                  <td className="numeric">{krw(l.subtotal)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className={styles['printTotalRow']}>
              <td colSpan={5} style={{ textAlign: 'right' }}>
                합계 (VAT 별도)
              </td>
              <td className="numeric">{krw(grandTotal())}원</td>
            </tr>
          </tfoot>
        </table>

        {orderInfo.memo ? (
          <div style={{ borderTop: '1px solid #000', paddingTop: 8, fontSize: 13 }}>
            <strong>요청사항: </strong>
            {orderInfo.memo}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 'auto',
            paddingTop: 24,
            display: 'flex',
            justifyContent: 'flex-end',
            fontSize: 12,
          }}
        >
          삼한공조시스템 · 인쇄 미리보기 (react-pdf 통합 후속)
        </div>
      </div>
    </div>
  )
}
