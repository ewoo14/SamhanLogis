/**
 * 견적서 인쇄 미리보기 — `/sales/estimates/:id/print` (상세/편집과 동일 UUID id).
 *
 * P0-4 인쇄 양식 5건 1차 mock — Designer 단계 신규.
 *
 * 구성 (A4 세로):
 * - 헤더: PrintLayout 결재문서 공통 헤더 (로고 없음)
 * - 거래처: 거래처명 + 현장주소 + 연락처 + 담당자
 * - 타이틀: "견적서" (큰 활자, 가운데)
 * - 견적 요약 박스: 합계금액 (한글) + (₩숫자) + 부가세 별도/포함 명시
 * - 라인 표 7-col: No / 품목 / 출고가 / 납품가 / 수량 / 소계 / 비고
 * - 합계: 공급가 + 부가세(별도) + 합계
 * - 결제 / 납기 안내
 * - 결재란: PrintLayout 전자서명 결재란 3칸 (작성 / 검토 / 승인)
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
import { PrintLayout, krw, krDate, toKoreanAmount } from './PrintLayout'

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
  // 인쇄 라우트(`/sales/estimates/:id/print`)는 상세/편집과 동일한 UUID id 를 path param 으로 받는다.
  // getEstimate() 가 이 id 를 BE `/slips/estimates/{id}` 로 그대로 전달한다 (estimateNo 아님).
  const params = useParams<{ id: string }>()
  const estimateId = params.id ?? ''
  const detailQuery = useQuery({
    // 인쇄뷰는 sales.getEstimate(DTO 구조가 estimateApi.getEstimate와 다름)를 사용하므로,
    // 같은 QueryClient에서 EstimateDetailPage의 ['estimate', id] 캐시와 충돌하지 않도록 키를 분리한다.
    // 같은 키 공유 시 금액/문서번호가 빈값으로 깨진다.
    queryKey: ['estimate-print', estimateId],
    queryFn: () => getEstimate(estimateId),
    enabled: !!estimateId,
  })

  // usePageTitle 의 2번째 인자는 데이터 필드(비즈니스 견적번호) — 라우트 param(UUID id)과 별개이므로 유지.
  usePageTitle('견적서', detailQuery.data?.estimateNumber)

  if (!estimateId) return null
  if (detailQuery.isLoading) return <p>불러오는 중...</p>
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        견적을 불러오지 못했습니다.
      </div>
    )
  }

  const est: EstimateDetail = detailQuery.data
  // 합계는 BE 가 분해해 내려준 헤더 값(공급가/부가세/합계)을 그대로 신뢰한다.
  // FE 에서 라인 소계로 재계산하면 라운딩/할인 처리 차이로 BE 와 금액이 어긋날 수 있다.
  const supply = est.totalSupply
  const vat = est.totalVat
  const total = est.totalAmount
  const validUntil = est.dueDate ?? calcValidUntil(est.createdAt)

  return (
    <PrintLayout
      paper="a4-portrait"
      backTo={`/sales/estimates/${estimateId}`}
      approvalDoc
      docHeader={{
        title: '견 적 서',
        docNo: est.estimateNumber,
        issueDate: est.createdAt,
        periodFrom: est.createdAt,
        periodTo: validUntil,
      }}
      approvalSteps={[
        // "작성" 칸의 name 은 현재 항상 공백 — BE estimate DTO 가 작성자 이름을 미제공한다.
        // 결재자 실명/서명 연동은 후속 BE 슬라이스(requesterId → user fullName resolve)에서 채운다.
        { label: '작성', name: est.authorName || undefined, decidedAt: est.createdAt },
        { label: '검토' },
        { label: '승인' },
      ]}
    >
      <div className="quote-page" data-testid="quote-print-area">
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

      </div>
    </PrintLayout>
  )
}
