/**
 * 견적서 인쇄 미리보기 — `/sales/estimates/:id/print`.
 *
 * <p>v2 정정 통합:
 * <ul>
 *   <li>§정정 6 — legacy estimate Apps Script 의 `종합견적서` 인쇄 양식 1:1 변환.
 *       `pageFinal`/`tablePreview`/`hidden-export-container` 의 layout (line 1693-1815) 을
 *       React 단일 페이지로 정확히 모방.</li>
 *   <li>§정정 7 — [복사] / [이미지 저장] / [PDF 저장 (벡터)] 3 버튼 모두 지원.
 *       복사 = `clipboard.writeText` (text + HTML), 이미지 = `html2canvas` PNG download,
 *       PDF = `jsPDF` 벡터 모드 (텍스트 select 가능).</li>
 *   <li>§정정 8 — 견적 번호 양식 `YYYY/MM/DD - {seq}` (formatSlipNumber).</li>
 *   <li>§정정 4/5 — '모델명' / '품목명' header 라벨.</li>
 * </ul>
 *
 * <p>F1 (a) 100% 보존 — DS 컴포넌트 import 0, sales.module.css 의 `printPaperLegacy` /
 * `printTableLegacy` token 사용.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePricingStore } from '../stores/usePricingStore'
import { usePageTitleStore } from '../stores/pageTitle'
import { ESTIMATE_CATEGORY_LABEL } from '../api/sales'
import { formatSlipDate, formatSlipNumber } from '../api/slipNumber'
import styles from '../components/sales/sales.module.css'

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)

type SaveResult = { ok: true; message: string } | { ok: false; message: string }

export function SalesEstimatePrintPage() {
  const params = useParams<{ id?: string }>()
  const lines = usePricingStore((s) => s.lines)
  const orderInfo = usePricingStore((s) => s.orderInfo)
  const grandTotal = usePricingStore((s) => s.grandTotal)
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)

  const paperRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<'copy' | 'image' | 'pdf' | null>(null)
  const [result, setResult] = useState<SaveResult | null>(null)

  useEffect(() => {
    setPageTitle({ title: '견적서 인쇄 미리보기', meta: '판매' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  // 견적 번호 — 화면이 ephemeral store 기반이므로 fallback 처리.
  const today = new Date()
  const seq = params.id ? params.id : '0001'
  // params.id 가 이미 'YYYY/MM/DD - {seq}' 양식이면 그대로, 아니면 합성.
  const printedNumber = params.id?.includes('/')
    ? params.id
    : formatSlipNumber(today, seq)
  const printedDate = formatSlipDate(today)

  /**
   * v2 §정정 7 — 복사 버튼.
   * navigator.clipboard.writeText (text/plain) 우선. ClipboardItem 가용 시 HTML 도 함께.
   */
  async function handleCopy() {
    const paper = paperRef.current
    if (!paper) return
    setBusy('copy')
    setResult(null)
    try {
      const text = paper.innerText
      if (
        navigator.clipboard
        && typeof window.ClipboardItem !== 'undefined'
        && typeof navigator.clipboard.write === 'function'
      ) {
        const html = paper.outerHTML
        const blob = new Blob([html], { type: 'text/html' })
        const txtBlob = new Blob([text], { type: 'text/plain' })
        await navigator.clipboard.write([
          new window.ClipboardItem({
            'text/html': blob,
            'text/plain': txtBlob,
          }),
        ])
      } else {
        await navigator.clipboard.writeText(text)
      }
      setResult({ ok: true, message: '클립보드로 복사되었습니다.' })
    } catch (e) {
      setResult({
        ok: false,
        message: `복사에 실패했습니다: ${(e as Error).message}`,
      })
    } finally {
      setBusy(null)
    }
  }

  /**
   * v2 §정정 7 — 이미지 저장 (PNG, html2canvas).
   * dynamic import 로 번들 사이즈 분리.
   */
  async function handleSaveImage() {
    const paper = paperRef.current
    if (!paper) return
    setBusy('image')
    setResult(null)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(paper, {
        scale: 2,
        backgroundColor: '#ffffff',
      })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `${printedNumber.replace(/[\\/:*?"<>|]/g, '-')}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setResult({ ok: true, message: 'PNG 이미지 저장 완료.' })
    } catch (e) {
      setResult({
        ok: false,
        message: `이미지 저장 실패: ${(e as Error).message}`,
      })
    } finally {
      setBusy(null)
    }
  }

  /**
   * v2 §정정 7 — PDF 저장 (벡터 mode).
   * jsPDF 의 html() 메서드는 내부적으로 텍스트 노드를 PDF text 객체로 추가 (벡터),
   * 즉 PDF 뷰어에서 텍스트 select / 검색 가능.
   */
  async function handleSavePdf() {
    const paper = paperRef.current
    if (!paper) return
    setBusy('pdf')
    setResult(null)
    try {
      const { default: jsPDF } = await import('jspdf')
      // A4 portrait, 단위 mm.
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      // 794px (A4 96dpi) → 210mm 비율 (1mm ≈ 3.78px)
      // jsPDF.html() 내부적으로 html2canvas 를 fallback 으로 쓸 수 있지만
      // 본 환경은 텍스트 노드 1차 PDF object 화 → 벡터.
      await pdf.html(paper, {
        x: 8,
        y: 8,
        width: 194,
        windowWidth: paper.scrollWidth,
        autoPaging: 'text',
      })
      pdf.save(`${printedNumber.replace(/[\\/:*?"<>|]/g, '-')}.pdf`)
      setResult({
        ok: true,
        message: 'PDF 저장 완료 — 텍스트 select 가능 (벡터 모드).',
      })
    } catch (e) {
      setResult({
        ok: false,
        message: `PDF 저장 실패: ${(e as Error).message}`,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={`${styles['salesScope']} ${styles['printShell']}`}>
      <div className={`${styles['noPrint']} ${styles['printToolbar']}`}>
        <Link to="/sales/estimates" className={styles['btnGhost']}>
          ← 목록
        </Link>
        <button
          type="button"
          className={styles['btn']}
          style={{ background: '#059669' }}
          onClick={handleCopy}
          disabled={busy !== null}
          aria-label="복사"
        >
          {busy === 'copy' ? '복사 중…' : '복사'}
        </button>
        <button
          type="button"
          className={styles['btn']}
          style={{ background: '#0ea5e9' }}
          onClick={handleSaveImage}
          disabled={busy !== null}
          aria-label="이미지 저장"
        >
          {busy === 'image' ? '저장 중…' : '이미지 저장'}
        </button>
        <button
          type="button"
          className={styles['btn']}
          style={{ background: '#dc2626' }}
          onClick={handleSavePdf}
          disabled={busy !== null}
          aria-label="PDF 저장"
        >
          {busy === 'pdf' ? '저장 중…' : 'PDF 저장 (벡터)'}
        </button>
        <button
          type="button"
          className={styles['btnGhost']}
          onClick={() => window.print()}
          aria-label="브라우저 인쇄"
        >
          🖨 브라우저 인쇄
        </button>
      </div>

      {result ? (
        <div
          role="status"
          className={styles['noPrint']}
          style={{
            background: result.ok ? '#d1fae5' : '#fee2e2',
            color: result.ok ? '#065f46' : '#991b1b',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 12,
            width: 794,
            maxWidth: 'calc(100vw - 48px)',
            boxSizing: 'border-box',
          }}
        >
          {result.message}
        </div>
      ) : null}

      {/* legacy 종합견적서 양식 1:1 — `hidden-export-container` (line 1791) 의 layout. */}
      <div ref={paperRef} className={styles['printPaperLegacy']}>
        <h2>종 합 견 적 서</h2>

        <div className={styles['printRatioRow']}>
          <div className={styles['printRatio']}>
            견적번호: {printedNumber}
          </div>
          <div>견적일: {printedDate}</div>
        </div>

        <div className={styles['printPartnerInfo']}>
          <div>
            <span className={styles['label']}>거래처명</span>
            {orderInfo.partnerName ?? '(미입력)'}
          </div>
          <div>
            <span className={styles['label']}>사업자번호</span>
            {orderInfo.partnerCode ?? '(미입력)'}
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span className={styles['label']}>배송지</span>
            {orderInfo.deliveryAddress}
            {orderInfo.deliveryAddressDetail ? ` ${orderInfo.deliveryAddressDetail}` : ''}
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span className={styles['label']}>현장</span>
            {orderInfo.siteAddress || '-'}
            {orderInfo.siteAddressDetail ? ` ${orderInfo.siteAddressDetail}` : ''}
          </div>
          <div>
            <span className={styles['label']}>연락처</span>
            {orderInfo.contactPhone || '-'}
          </div>
          <div>
            <span className={styles['label']}>납기</span>
            {orderInfo.dueDate || '-'}
          </div>
        </div>

        <table className={styles['printTableLegacy']}>
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr>
              {/* legacy `previewBody` table 컬럼 1:1 + v2 §정정 4/5 라벨. */}
              <th>품목명</th>
              <th>모델명</th>
              <th>단위</th>
              <th>수량</th>
              <th>납품가</th>
              <th>금액</th>
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
                  <td className={styles['itemCol']}>
                    [{ESTIMATE_CATEGORY_LABEL[l.category]}] {l.productName}
                  </td>
                  <td>{l.modelCode}</td>
                  <td>EA</td>
                  <td>{l.quantity}</td>
                  <td className={styles['numericCol']}>{krw(l.deliveryPrice)}</td>
                  <td className={styles['numericCol']}>{krw(l.subtotal)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ textAlign: 'right' }}>
                합계 (VAT 별도)
              </td>
              <td className={styles['numericCol']}>{krw(grandTotal())}원</td>
            </tr>
          </tfoot>
        </table>

        {orderInfo.memo ? (
          <div style={{ borderTop: '1px solid #000', paddingTop: 8, fontSize: 12 }}>
            <strong>요청사항: </strong>
            {orderInfo.memo}
          </div>
        ) : null}

        <div className={styles['printFooter']}>
          (주)삼한공조시스템 · 본 견적서는 발행일로부터 14일간 유효합니다.
        </div>
      </div>
    </div>
  )
}
