/**
 * 거래명세서 인쇄 미리보기 — `/sales/:id/print/invoice`.
 *
 * P0-4 인쇄 양식 5건 1차 mock — Designer 단계 rewrite.
 *
 * 구성 (A4 세로):
 * - 상단 좌: 회사 로고 (`/print-logo.svg`) + 회사 정보 (상호/주소/사업자번호/대표/TEL)
 * - 상단 우: 발행일 + 거래처 정보 박스 (거래처명/주소/연락처)
 * - 본문 타이틀: "거래명세서" (큰 활자, 가운데)
 * - 라인 표 6-col: 품목 / 규격 / 수량 / 단가 / 공급가 / 부가세
 * - 합계 행: 공급가액 / 부가세 / 합계 (한글 금액 별도 표기)
 * - 하단: 발행자 사인란 (담당자 / 인수자 — 인 도장)
 *
 * 출처: `docs/manual/06-트러블슈팅/03-인쇄-안됨.md` §1 표 (P0-4).
 *
 * Iteration 가드 (memory `feedback_print_design_iteration.md`):
 * 본 1차 mock — 사용자 Edge 캡처 검토 후 2~5차 갱신 예정.
 */
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSlip, type SlipDetail } from '../api/slip'
import { usePageTitle } from '../hooks/usePageTitle'
import { PrintLayout, krw, krDate, toKoreanAmount, calcAmounts } from './PrintLayout'
import { useCompanyProfile } from './useCompanyProfile'

export function InvoiceView() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const detailQuery = useQuery({
    queryKey: ['slip', id],
    queryFn: () => getSlip(id),
    enabled: !!id,
  })

  usePageTitle('거래명세서', detailQuery.data?.slipNo)

  if (!id) return null
  if (detailQuery.isLoading) return <p>불러오는 중...</p>
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        전표를 불러오지 못했습니다.
      </div>
    )
  }

  const { company } = useCompanyProfile()

  const slip: SlipDetail = detailQuery.data
  const totalSupply = slip.lines.reduce((sum, l) => sum + Number(l.lineTotal), 0)
  const { supply, vat, total } = calcAmounts(totalSupply)

  return (
    <PrintLayout paper="a4-portrait" backTo={`/sales/${id}`}>
      <div className="invoice-v2" data-testid="invoice-print-area">
        {/* 헤더: 좌(로고 + 회사 정보) | 우(발행일 + 거래처) */}
        <header className="invoice-v2-header">
          <div className="invoice-v2-supplier">
            <img className="invoice-v2-logo" src={company.logoPath} alt={company.legalName} />
            <table className="invoice-v2-supplier-table">
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
                  <th>TEL</th>
                  <td className="num">{company.tel}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="invoice-v2-meta">
            <div className="invoice-v2-issue">
              <span className="label">발행일</span>
              <span className="value">{krDate(slip.slipDate)}</span>
            </div>
            <div className="invoice-v2-slip-no">
              <span className="label">전표번호</span>
              <span className="value">{slip.slipNo}</span>
            </div>
            <div className="invoice-v2-partner">
              <div className="invoice-v2-partner-name">{slip.partnerName ?? '-'}님 귀하</div>
              <div className="invoice-v2-partner-address">
                {slip.shippingAddress ?? '주소 정보 없음'}
              </div>
              <div className="invoice-v2-partner-phone">
                ☎ {slip.contactPhone ?? '-'}
              </div>
            </div>
          </div>
        </header>

        {/* 타이틀 */}
        <h1 className="invoice-v2-title">거 래 명 세 서</h1>

        {/* 합계 한글 금액 (요약) */}
        <div className="invoice-v2-amount-summary">
          <span className="label">합계금액</span>
          <span className="korean">{toKoreanAmount(total)}</span>
          <span className="number">(₩ {krw(total)})</span>
        </div>

        {/* 라인 표 6-col */}
        <table className="invoice-v2-table">
          <thead>
            <tr>
              <th className="col-no">No.</th>
              <th className="col-product">품목</th>
              <th className="col-spec">규격</th>
              <th className="col-qty">수량</th>
              <th className="col-price">단가</th>
              <th className="col-supply">공급가액</th>
              <th className="col-vat">부가세</th>
            </tr>
          </thead>
          <tbody>
            {slip.lines.map((l, idx) => {
              const lineSupply = Number(l.lineTotal)
              const lineVat = Math.floor(lineSupply * 0.1)
              const productLabel = l.modelName
                ? `${l.modelName}${l.productName ? ` (${l.productName})` : ''}`
                : (l.productName ?? '-')
              return (
                <tr key={l.id}>
                  <td className="col-no">{idx + 1}</td>
                  <td className="col-product">{productLabel}</td>
                  <td className="col-spec">{l.specification ?? '-'}</td>
                  <td className="col-qty num">{l.quantity.toLocaleString()}</td>
                  <td className="col-price num">{krw(l.unitPrice)}</td>
                  <td className="col-supply num">{krw(lineSupply)}</td>
                  <td className="col-vat num">{krw(lineVat)}</td>
                </tr>
              )
            })}
            {/* 빈 행 padding — 라인 < 5 시 시각 균형 */}
            {Array.from({ length: Math.max(0, 5 - slip.lines.length) }).map((_, i) => (
              <tr key={`pad-${i}`} className="pad-row">
                <td className="col-no">&nbsp;</td>
                <td className="col-product">&nbsp;</td>
                <td className="col-spec">&nbsp;</td>
                <td className="col-qty">&nbsp;</td>
                <td className="col-price">&nbsp;</td>
                <td className="col-supply">&nbsp;</td>
                <td className="col-vat">&nbsp;</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="totals-label">합계</td>
              <td className="col-supply num strong">{krw(supply)}</td>
              <td className="col-vat num strong">{krw(vat)}</td>
            </tr>
            <tr>
              <td colSpan={5} className="totals-label strong">총계 (공급가액 + 부가세)</td>
              <td colSpan={2} className="num strong total-grand">{krw(total)}</td>
            </tr>
          </tfoot>
        </table>

        {/* 발행자 사인란 */}
        <footer className="invoice-v2-footer">
          <div className="invoice-v2-sign-box">
            <div className="invoice-v2-sign-label">담당자</div>
            <div className="invoice-v2-sign-value">
              <span>{slip.ownerFullName ?? '-'}</span>
              <span className="invoice-v2-seal">[인]</span>
            </div>
          </div>
          <div className="invoice-v2-sign-box">
            <div className="invoice-v2-sign-label">인수자</div>
            <div className="invoice-v2-sign-value">
              <span>{slip.signerName ?? ' '}</span>
              {slip.signaturePng ? (
                <img className="invoice-v2-sign-png" src={slip.signaturePng} alt="인수자 서명" />
              ) : (
                <span className="invoice-v2-seal">[인]</span>
              )}
            </div>
          </div>
          <div className="invoice-v2-issuer">
            <div className="issuer-name">{company.legalName}</div>
            <div className="issuer-meta">
              사업자번호 {company.businessRegNo} / 대표 {company.ceo}
            </div>
            <div className="issuer-seal">[직인]</div>
          </div>
        </footer>
      </div>
    </PrintLayout>
  )
}
