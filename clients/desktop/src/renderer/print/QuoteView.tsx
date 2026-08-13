/**
 * 견적서 인쇄 미리보기 — `/sales/estimates/:estimateNumber/print`.
 *
 * P0-4 인쇄 양식 5건 1차 mock — Designer 단계 신규.
 *
 * 구성 (A4 세로):
 * - 헤더: 회사 로고 + 회사 정보 (좌) | 견적번호 + 작성일 + 유효기간 (우)
 * - 거래처: 거래처명 + 현장주소 + 연락처 + 담당자
 * - 타이틀: "견적서" (큰 활자, 가운데)
 * - 견적 요약 박스: 합계금액 (한글) + (₩숫자) + 부가세 별도/포함 명시
 * - 라인 표 7-col: No / 품목 / 출고가 / 납품가 / 수량 / 소계 / 비고
 * - 합계: 공급가 + 부가세(별도) + 합계
 * - 결제 / 납기 안내
 * - 회사 직인 + 발행자 사인란
 *
 * 출처: `docs/manual/06-트러블슈팅/03-인쇄-안됨.md` §1 표 6번 (P0-4 견적서 인쇄).
 *
 * Iteration 가드 (memory `feedback_print_design_iteration.md`):
 * 본 1차 mock — 사용자 Edge 캡처 검토 후 2~5차 갱신 예정.
 */
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getEstimate, type EstimateDetail } from '../api/sales'
import { usePageTitle } from '../hooks/usePageTitle'
import { PrintLayout, krw, krDate, toKoreanAmount, calcAmounts } from './PrintLayout'
import { useCompanyProfile } from './useCompanyProfile'
import { safeActorName } from '@samhan/design-system'

/**
 * 견적 유효기간 — `createdAt + 30 일` 기본 (실제 운영은 EstimateDetail 에 expirationDate 추가
 * 후 후속 iteration 에서 교체). LocalDate "YYYY-MM-DD" 반환.
 */
function calcValidUntil(createdAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(createdAt)
  if (!m) return ''
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}`)
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

export function QuoteView() {
  const params = useParams<{ estimateNumber: string }>()
  const estimateNumber = params.estimateNumber ?? ''
  const detailQuery = useQuery({
    queryKey: ['estimate', estimateNumber],
    queryFn: () => getEstimate(estimateNumber),
    enabled: !!estimateNumber,
  })

  usePageTitle('견적서', detailQuery.data?.estimateNumber)

  // 훅 규칙(rules-of-hooks): early-return 보다 앞에 위치
  const { company } = useCompanyProfile()

  if (!estimateNumber) return null
  if (detailQuery.isLoading) return <p>불러오는 중...</p>
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        견적을 불러오지 못했습니다.
      </div>
    )
  }

  const est: EstimateDetail = detailQuery.data
  const totalSupply = est.lines.reduce((sum, l) => sum + l.subtotal, 0)
  const { supply, vat, total } = calcAmounts(totalSupply)
  const validUntil = est.dueDate ?? calcValidUntil(est.createdAt)

  return (
    <PrintLayout paper="a4-portrait" backTo={`/sales/estimates/${estimateNumber}`}>
      <div className="quote-page" data-testid="quote-print-area">
        <header className="quote-header">
          <div className="quote-supplier">
            <img className="quote-logo" src={company.logoPath} alt={company.legalName} />
            <table className="quote-supplier-table">
              <tbody>
                <tr>
                  <th>상호</th>
                  <td>{company.legalName}</td>
                </tr>
                <tr>
                  <th>대표자</th>
                  <td>{company.ceo}</td>
                </tr>
                <tr>
                  <th>사업자번호</th>
                  <td className="num">{company.businessRegNo}</td>
                </tr>
                <tr>
                  <th>주소</th>
                  <td>{company.address}</td>
                </tr>
                <tr>
                  <th>TEL / FAX</th>
                  <td className="num">{company.tel} / {company.fax}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="quote-meta">
            <table className="quote-meta-table">
              <tbody>
                <tr>
                  <th>견적번호</th>
                  <td className="strong">{est.estimateNumber}</td>
                </tr>
                <tr>
                  <th>작성일</th>
                  <td>{krDate(est.createdAt)}</td>
                </tr>
                <tr>
                  <th>유효기간</th>
                  <td className="emphasis">{krDate(validUntil)} 까지</td>
                </tr>
                <tr>
                  <th>작성자</th>
                  <td>{safeActorName(est.authorName) ?? '변경자 미상'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </header>

        <h1 className="quote-title">견 적 서</h1>

        {/* 거래처 박스 */}
        <section className="quote-partner-box">
          <div className="row">
            <span className="label">수신</span>
            <span className="value strong">{est.partnerName} 귀하</span>
          </div>
          <div className="row">
            <span className="label">현장</span>
            <span className="value">{est.siteAddress ?? est.deliveryAddress ?? '-'}</span>
          </div>
          <div className="row">
            <span className="label">연락처</span>
            <span className="value">{est.contactPhone ?? '-'}</span>
          </div>
          <p className="quote-greeting">
            아래와 같이 견적합니다. 검토 후 회신 부탁드립니다.
          </p>
        </section>

        {/* 합계 요약 — 한글 + 숫자 + 부가세 별도 */}
        <section className="quote-amount-summary">
          <div className="row">
            <span className="label">합계금액</span>
            <span className="korean">{toKoreanAmount(total)}</span>
          </div>
          <div className="row">
            <span className="label">금액(숫자)</span>
            <span className="number">₩ {krw(total)}</span>
          </div>
          <div className="row meta">
            <span>※ 부가세 별도 표기 (공급가액 + 부가세 10%)</span>
          </div>
        </section>

        {/* 라인 표 */}
        <table className="quote-table">
          <thead>
            <tr>
              <th className="col-no">No.</th>
              <th className="col-product">품목 / 모델</th>
              <th className="col-release">출고가</th>
              <th className="col-delivery">납품가</th>
              <th className="col-qty">수량</th>
              <th className="col-subtotal">소계</th>
              <th className="col-note">비고</th>
            </tr>
          </thead>
          <tbody>
            {est.lines.map((l, idx) => (
              <tr key={l.id}>
                <td className="col-no">{idx + 1}</td>
                <td className="col-product">
                  <div className="model-code">{l.modelCode}</div>
                  <div className="model-name">{l.productName}</div>
                </td>
                <td className="col-release num">{krw(l.releasePrice)}</td>
                <td className="col-delivery num">{krw(l.deliveryPrice)}</td>
                <td className="col-qty num">{l.quantity.toLocaleString()}</td>
                <td className="col-subtotal num">{krw(l.subtotal)}</td>
                <td className="col-note">
                  {l.hasVariableDiscount ? <span className="badge">변동DC</span> : null}
                  {l.bundleMode ? <span className="badge">{l.bundleMode}</span> : null}
                </td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 5 - est.lines.length) }).map((_, i) => (
              <tr key={`pad-${i}`} className="pad-row">
                <td className="col-no">&nbsp;</td>
                <td className="col-product">&nbsp;</td>
                <td className="col-release">&nbsp;</td>
                <td className="col-delivery">&nbsp;</td>
                <td className="col-qty">&nbsp;</td>
                <td className="col-subtotal">&nbsp;</td>
                <td className="col-note">&nbsp;</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="totals-label">공급가액</td>
              <td className="col-subtotal num">{krw(supply)}</td>
              <td>&nbsp;</td>
            </tr>
            <tr>
              <td colSpan={5} className="totals-label">부가세 (10%)</td>
              <td className="col-subtotal num">{krw(vat)}</td>
              <td>&nbsp;</td>
            </tr>
            <tr>
              <td colSpan={5} className="totals-label strong">총계</td>
              <td className="col-subtotal num strong total-grand">{krw(total)}</td>
              <td>&nbsp;</td>
            </tr>
          </tfoot>
        </table>

        {/* 결제 / 납기 안내 */}
        <section className="quote-terms">
          <div className="row">
            <span className="label">납기일</span>
            <span className="value">{est.dueDate ? krDate(est.dueDate) : '협의'}</span>
          </div>
          <div className="row">
            <span className="label">결제기한</span>
            <span className="value">{est.paymentDueDate ? krDate(est.paymentDueDate) : '세금계산서 발행일 기준 30일'}</span>
          </div>
          {est.memo ? (
            <div className="row">
              <span className="label">비고</span>
              <span className="value">{est.memo}</span>
            </div>
          ) : null}
        </section>

        {/* 회사 직인 영역 */}
        <footer className="quote-footer">
          <div className="quote-issuer-block">
            <div className="issuer-name">{company.legalName}</div>
            <div className="issuer-meta">사업자번호 {company.businessRegNo}</div>
            <div className="issuer-meta">대표 {company.ceo}</div>
            <div className="issuer-seal">[직인]</div>
          </div>
        </footer>
      </div>
    </PrintLayout>
  )
}
