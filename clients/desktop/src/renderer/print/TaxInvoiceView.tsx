/**
 * 세금계산서 인쇄 미리보기 — `/accounting/tax-invoices/:id/print`.
 *
 * P0-4 인쇄 양식 5건 BE API 연결 (Phase 10 Step 8 — slice 3).
 *
 * **데이터 출처 변경 (1차 mock → BE)** —
 * 본 view 는 1차 mock (Designer 단계, commit 5dcbbef) 에서 slip-service 의
 * `SlipDetail` 을 시연용으로 사용했으나, 정식 운영은 accounting-service 의
 * `TaxInvoice` 도메인 (별도 entity, P0-4 #3 BE) 으로 교체. UUID path param 도
 * `slip.id` → `taxInvoice.id` 로 전환된다 (라우트는 `/accounting/tax-invoices/:id/print`).
 *
 * 한국 국세청 (NTS) 전자세금계산서 표준 양식 (e-Tax) 을 모사한다.
 *
 * 표준 구성:
 * - 빨간색 "세금계산서 (공급받는자 보관용)" 타이틀
 * - 책번호 / 일련번호 (좌상단) — `taxInvoiceNo` 로 일련번호 표시
 * - 공급자 박스 (좌): 등록번호 / 종사업장번호 / 상호 / 성명 / 사업장 주소 / 업태 / 종목
 * - 공급받는자 박스 (우): TaxInvoice snapshot (partnerName/partnerBusinessNo/partnerAddress)
 * - 작성일자 (연/월/일 셀 분리) — `supplyDate`
 * - 공급가액 / 세액 (조-천억-...-원 셀 분리, 11자리)
 * - 합계금액 (한글 + 숫자) — `totalAmount`
 * - 라인 표 (월/일/품목/규격/수량/단가/공급가/세액/비고) — `lines[]`
 * - 영수 / 청구 체크박스
 *
 * 출처: `docs/manual/06-트러블슈팅/03-인쇄-안됨.md` §3 (P0-4 세금계산서).
 *
 * Iteration 가드 (memory `feedback_print_design_iteration.md`):
 * Designer CSS (`tax-invoice-*` 클래스) 보존 — 본 PR 은 데이터 연결만, 디자인 변경 X.
 */
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getTaxInvoice, type TaxInvoiceDetail } from '../api/printApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { PrintLayout, COMPANY, krDate, toKoreanAmount } from './PrintLayout'

/**
 * 정수 → 11자리 셀 분리 (천억-백억-십억-억-천만-백만-십만-만-천-백-십-원).
 * e-Tax 표준 11자리 — 공급가액/세액 셀에 사용. 빈자리는 공백.
 */
function splitDigits11(n: number): string[] {
  const s = String(Math.max(0, Math.floor(n)))
  const padded = s.padStart(11, ' ')
  return padded.split('')
}

/**
 * "YYYY-MM-DD" → { year, month, day } 분리 (작성일자 셀 분리용).
 */
function splitDate(iso: string | null | undefined): { year: string; month: string; day: string } {
  if (!iso) return { year: '', month: '', day: '' }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return { year: '', month: '', day: '' }
  return { year: m[1] ?? '', month: m[2] ?? '', day: m[3] ?? '' }
}

/** 공급/세액 11자리 셀 — e-Tax 표준 라벨 (천억-백억-십억-억-천만-백만-십만-만-천-백-십-원). */
const DIGIT_LABELS = ['천억', '백억', '십억', '억', '천만', '백만', '십만', '만', '천', '백', '십', '원']

/** BigDecimal string → number (NaN/null 안전). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

/** 사업자번호 표시 — 빈 값/null 시 빈 셀. */
function fmtBizNo(v: string | null | undefined): string {
  return v && v.trim().length > 0 ? v : '-'
}

export function TaxInvoiceView() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const detailQuery = useQuery({
    queryKey: ['tax-invoice', id],
    queryFn: () => getTaxInvoice(id),
    enabled: !!id,
  })

  usePageTitle('세금계산서', detailQuery.data?.taxInvoiceNo ?? undefined)

  if (!id) return null
  if (detailQuery.isLoading) return <p>불러오는 중...</p>
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        세금계산서를 불러오지 못했습니다.
      </div>
    )
  }

  const ti: TaxInvoiceDetail = detailQuery.data
  const supply = num(ti.supplyAmount)
  const vat = num(ti.vatAmount)
  const total = num(ti.totalAmount)
  const writeDate = splitDate(ti.supplyDate)
  const issuedLabel = ti.taxInvoiceNo && ti.taxInvoiceNo.trim().length > 0
    ? ti.taxInvoiceNo
    : '미발행 (DRAFT)'

  return (
    <PrintLayout paper="a4-portrait" backTo={`/accounting/tax-invoices/${id}`}>
      <div className="tax-invoice-page" data-testid="tax-invoice-print-area">
        {/* 상단 — 책번호 / 일련번호 / 빨간 타이틀 */}
        <header className="tax-invoice-top">
          <div className="tax-invoice-book">
            <div>책번호                권              호</div>
            <div>일련번호 {issuedLabel}</div>
          </div>
          <h1 className="tax-invoice-title">세 금 계 산 서 <span className="tax-invoice-title-sub">(공급받는자 보관용)</span></h1>
        </header>

        {/* 공급자 + 공급받는자 박스 */}
        <table className="tax-invoice-parties">
          <tbody>
            <tr>
              <td className="party-side party-supplier" rowSpan={5}>공<br />급<br />자</td>
              <th>등록번호</th>
              <td className="party-regno">{COMPANY.businessRegNo}</td>
              <td className="party-side party-receiver" rowSpan={5}>공<br />급<br />받<br />는<br />자</td>
              <th>등록번호</th>
              <td className="party-regno">{fmtBizNo(ti.partnerBusinessNo)}</td>
            </tr>
            <tr>
              <th>상호<br />(법인명)</th>
              <td>{COMPANY.legalName}</td>
              <th>성명</th>
              <td className="seal-cell">{COMPANY.ceo}<span className="party-seal">(인)</span></td>
              <th>상호<br />(법인명)</th>
              <td>{ti.partnerName ?? '-'}</td>
            </tr>
            <tr>
              <th>사업장<br />주소</th>
              <td colSpan={3}>{COMPANY.address}</td>
              <th>사업장<br />주소</th>
              <td>{ti.partnerAddress ?? '-'}</td>
            </tr>
            <tr>
              <th>업태</th>
              <td>{COMPANY.businessType}</td>
              <th>종목</th>
              <td>{COMPANY.businessItem}</td>
              <th>업태</th>
              <td>-</td>
            </tr>
            <tr>
              <th>종사업장<br />번호</th>
              <td>{COMPANY.subBusinessNo}</td>
              <th>전화</th>
              <td className="num">{COMPANY.tel}</td>
              <th>종목</th>
              <td>-</td>
            </tr>
          </tbody>
        </table>

        {/* 작성일자 + 공급가액 + 세액 (11자리 셀 분리) */}
        <table className="tax-invoice-amounts">
          <thead>
            <tr>
              <th rowSpan={2} className="col-write-date">작성</th>
              <th colSpan={12}>공 급 가 액</th>
              <th colSpan={12}>세 액</th>
              <th rowSpan={2} className="col-remark">비 고</th>
            </tr>
            <tr>
              {DIGIT_LABELS.map((lbl) => (
                <th key={`s-${lbl}`} className="digit-label">{lbl}</th>
              ))}
              {DIGIT_LABELS.map((lbl) => (
                <th key={`v-${lbl}`} className="digit-label">{lbl}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="write-date">
                <div>{writeDate.year}</div>
                <div>{writeDate.month}.{writeDate.day}</div>
              </td>
              {splitDigits11(supply).map((d, i) => (
                <td key={`sd-${i}`} className="digit-cell">{d}</td>
              ))}
              {splitDigits11(vat).map((d, i) => (
                <td key={`vd-${i}`} className="digit-cell">{d}</td>
              ))}
              <td className="tax-invoice-remark">{ti.description ?? ''}</td>
            </tr>
          </tbody>
        </table>

        {/* 라인 표 — 월/일/품목/규격/수량/단가/공급가/세액/비고 */}
        <table className="tax-invoice-lines">
          <thead>
            <tr>
              <th className="col-month">월</th>
              <th className="col-day">일</th>
              <th className="col-product">품 목</th>
              <th className="col-spec">규 격</th>
              <th className="col-qty">수 량</th>
              <th className="col-price">단 가</th>
              <th className="col-supply">공 급 가 액</th>
              <th className="col-vat">세 액</th>
              <th className="col-note">비 고</th>
            </tr>
          </thead>
          <tbody>
            {ti.lines.map((l) => {
              const lineSupply = num(l.supplyAmount)
              const lineVat = num(l.vatAmount)
              const lineQty = num(l.quantity)
              const linePrice = num(l.unitPrice)
              return (
                <tr key={l.lineId}>
                  <td className="col-month num">{writeDate.month}</td>
                  <td className="col-day num">{writeDate.day}</td>
                  <td className="col-product">{l.itemName}</td>
                  <td className="col-spec">{l.specification ?? ''}</td>
                  <td className="col-qty num">{lineQty.toLocaleString()}</td>
                  <td className="col-price num">{linePrice.toLocaleString()}</td>
                  <td className="col-supply num">{lineSupply.toLocaleString()}</td>
                  <td className="col-vat num">{lineVat.toLocaleString()}</td>
                  <td className="col-note">{l.memo ?? ''}</td>
                </tr>
              )
            })}
            {Array.from({ length: Math.max(0, 4 - ti.lines.length) }).map((_, i) => (
              <tr key={`pad-${i}`} className="pad-row">
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 합계금액 + 현금/수표/어음/외상/영수/청구 */}
        <table className="tax-invoice-bottom">
          <thead>
            <tr>
              <th className="col-total-label">합계금액</th>
              <th className="col-cash">현 금</th>
              <th className="col-check">수 표</th>
              <th className="col-bill">어 음</th>
              <th className="col-credit">외상미수금</th>
              <th rowSpan={2} className="col-receipt-claim">
                <div>이 금액을</div>
                <div className="receipt-claim-options">
                  <span className="check-box">□ 영수</span>
                  <span className="check-box">■ 청구</span>
                </div>
                <div>함</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="col-total-amount num strong">{total.toLocaleString()}</td>
              <td className="num">&nbsp;</td>
              <td className="num">&nbsp;</td>
              <td className="num">&nbsp;</td>
              <td className="num">{total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {/* 한글 합계 (보조) */}
        <div className="tax-invoice-korean-total">
          <span className="label">금액(한글)</span>
          <span className="value">{toKoreanAmount(total)}</span>
        </div>

        {/* 발행일 */}
        <div className="tax-invoice-issue-date">
          작성일자: {krDate(ti.supplyDate)}
        </div>
      </div>
    </PrintLayout>
  )
}
