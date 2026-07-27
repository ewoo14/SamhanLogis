/**
 * 매출 거래명세서 인쇄 양식 — `/sales/:id/print/statement`.
 *
 * 2026-06-10 원본 양식 전면 정렬 (개발책임자 샘플 이미지 — docs/sample, 비커밋):
 * 기존 SP-08-6-4 구조(3열 헤더/2열 거래처 그리드/8컬럼/audit 푸터)를 폐기하고
 * legacy GAS 원본 양식 구조로 재설계.
 *
 * 구성 (A4 portrait, 원본 1:1):
 * - 상단: SAMSUNG 로고 + 「거래명세서」 제목
 * - 좌: 공급받는자 박스 — 거래처명 貴中 / 거래처 사업자주소 / ☎ 대표번호
 *   (개발책임자 확정 2026-06-10. partner-service getPartnerFull(partnerCode) — slip 미보유 필드)
 * - 우: 공급자 표 — 세로 '공급자' 라벨 + 일련번호·TEL / 사업자등록번호·성명 / 상호 / 주소
 *   + 법인 인감 스탬프 overlay (company.stampUrl — useCompanyProfile 훅)
 * - 배송지 행 (검정 볼드 — 개발책임자 정정 2026-06-10, 적색 아님): 인수자번호 / 배송주소
 * - 금액 행: 한글 금액 정 + (₩ 숫자) — printUtils.krwHangul
 * - 품목표 6컬럼: 월/일 | 품목명 | 수량 | 단가(VAT포함) | 공급가액 | 부가세 + 빈행 filler
 * - 합계행: 수량 | 공급가액 | VAT | 합계 | 인수 | 인
 * - 계좌 푸터 (적색): company.bankNotice (useCompanyProfile 훅 — API에서 실시간 조회)
 *
 * 단가 컬럼 = VAT 포함 단가 (원본 검증: 13,662×3 = 공급 37,260+부가세 3,726).
 * line.unitPriceWithVat 우선, legacy null 이면 (공급+부가세)/수량 계산.
 *
 * 가변 길이: 품목 다량 시 useFitOneA4 로 한 A4 자동 비율 축소 (개발책임자 2026-06-10),
 * 하한(0.5) 초과 분량은 자연 다페이지 (thead 반복 + 행 잘림 방지 CSS).
 *
 * UUID 비공개 가드: id 는 path param / QueryKey 전용. slipNo / partnerName / partnerCode 만 노출.
 */
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSlip, type SlipDetail, type SlipLineDetail } from '../api/slip'
import { getPartnerFull } from '../api/partnerApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { stripSlipNoZeros } from '../utils/orderNo'
import { PrintLayout, krw } from './PrintLayout'
import { krwHangul } from './printUtils'
import { storedLineAmounts, storedLineUnitPrices } from './printAmounts'
import { useFitOneA4 } from './useFitOneA4'
import { useCompanyProfile } from './useCompanyProfile'

/** "YYYY-MM-DD" → "MM/DD" (원본 양식 월/일 컬럼). */
function toMonthDay(isoDate: string | null | undefined): string {
  if (!isoDate || isoDate.length < 10) return ''
  return `${isoDate.slice(5, 7)}/${isoDate.slice(8, 10)}`
}

/** 품목명 — 원본 양식은 모델코드+괄호 설명 한 컬럼 (DispatchView 와 동일 규칙). */
function lineDisplayName(l: SlipLineDetail): string {
  const model = l.modelName?.trim() || ''
  const product = l.productName?.trim() || ''
  if (model && product && product !== model) return `${model} (${product})`
  return model || product || '-'
}

/**
 * 라인 금액 분해 — supplyAmount/vatAmount 우선, legacy(null) 는 lineTotal 기준 산출.
 *
 * <p>재수렴 4차(#937): 단가는 저장 컬럼을 무조건 믿지 않고 권위 금액과의 항등식
 * ({@code 단가 × 수량 = 공급가액 + 부가세}, 이 양식의 원본 검증 13,662×3 = 37,260+3,726)을
 * 만족할 때만 그대로 쓴다 — 만족하지 못하는 행(2026-07-27 실측 22건)은 권위 금액에서 유도한다.
 */
function lineAmounts(l: SlipLineDetail): { supply: number; vat: number; unitWithVat: number } {
  // 🚨 재수렴 6차(#937): 라인 객체를 <b>통째로</b> 넘긴다 — 종전처럼 필드를 하나씩 골라 넘기면
  // 저장 컬럼이 늘 때마다 이 지점이 조용히 누락된다(실제로 A안의 unitPriceDomain 을 여기서만
  // 빠뜨려도 거래명세서가 화면과 다른 단가를 인쇄했다 — 뮤테이션 FE5 가 어떤 테스트도 깨지
  // 않고 통과했다). 세금계산서·매입전표 인쇄는 이미 이 방식으로 호출한다.
  const { supply, vat } = storedLineAmounts(l)
  return { supply, vat, unitWithVat: storedLineUnitPrices(l).inclusiveUnit }
}

/** 빈행 filler — 원본 양식의 고정 높이 느낌 유지 (품목 적을 때 최소 행수). */
const MIN_ROWS = 10

export function SalesTransactionStatementPrintPage() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''

  const detailQuery = useQuery({
    queryKey: ['slip', id],
    queryFn: () => getSlip(id),
    enabled: !!id,
  })

  const partnerCode = detailQuery.data?.partnerCode ?? null
  /** 공급받는자 주소/전화 — slip 미보유 → partner 기본정보 조회 (실패해도 양식은 렌더). */
  const partnerQuery = useQuery({
    queryKey: ['partner-full', partnerCode],
    queryFn: () => getPartnerFull(partnerCode as string),
    enabled: !!partnerCode,
  })

  const { company } = useCompanyProfile()

  // 한 A4 자동 비율 — 품목 수 변동 시 재측정 (개발책임자 2026-06-10)
  // P3 fix: bankNotice 로드 시 계좌 푸터 높이 변동 → 재측정 의무 (사이클1)
  const { ref: fitRef, zoom } = useFitOneA4<HTMLDivElement>([
    detailQuery.data?.lines?.length ?? 0,
    company.bankNotice,
  ])

  const displaySlipNo = stripSlipNoZeros(detailQuery.data?.slipNo)
  usePageTitle('거래명세서', displaySlipNo)

  if (!id) return null
  if (detailQuery.isLoading) return <p>불러오는 중...</p>
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        매출 전표를 불러오지 못했습니다.
      </div>
    )
  }

  const slip: SlipDetail = detailQuery.data
  const lines = slip.lines
  const partnerBasic = partnerQuery.data?.basic ?? null

  const totalQty = lines.reduce((s, l) => s + l.quantity, 0)
  const perLine = lines.map(lineAmounts)
  const totalSupply = perLine.reduce((s, a) => s + a.supply, 0)
  const totalVat = perLine.reduce((s, a) => s + a.vat, 0)
  const grandTotal = totalSupply + totalVat

  const fillerCount = Math.max(0, MIN_ROWS - lines.length)

  return (
    <PrintLayout paper="a4-portrait" backTo={`/sales/${id}`}>
      <div
        className="stm-page"
        data-testid="sales-statement-print-area"
        ref={fitRef}
        style={{ zoom }}
      >
        {/* 상단 — 로고 + 제목 (원본 양식 청색 SAMSUNG 워드마크 — DispatchView 와 동일 텍스트 방식) */}
        <header className="stm-brand-row">
          <span className="stm-logo-wordmark">SAMSUNG</span>
          <h1 className="stm-title">거래명세서</h1>
        </header>

        {/* 공급받는자(좌) + 공급자(우) */}
        <div className="stm-top-row">
          {/* 개발책임자 확정(2026-06-10): 거래처명 아래 = 거래처 '사업자주소' + '대표번호' */}
          <div className="stm-buyer-box">
            <div className="stm-buyer-name">{slip.partnerName ?? '-'}貴 中</div>
            {partnerBasic?.address ? (
              <div className="stm-buyer-addr">{partnerBasic.address}</div>
            ) : null}
            {partnerBasic?.phone ? (
              <div className="stm-buyer-tel">☎ {partnerBasic.phone}</div>
            ) : null}
          </div>
          <div className="stm-supplier-wrap">
            <table className="stm-supplier">
              <tbody>
                <tr>
                  <th className="stm-vlabel" rowSpan={4}>
                    공<br />급<br />자
                  </th>
                  <th className="stm-k">일련번호</th>
                  <td className="stm-v stm-num">{displaySlipNo}</td>
                  <th className="stm-k stm-k-narrow">TEL</th>
                  <td className="stm-v stm-nowrap">{company.tel}</td>
                </tr>
                <tr>
                  <th className="stm-k">사업자등록<br />번호</th>
                  <td className="stm-v stm-num">{company.businessRegNo}</td>
                  <th className="stm-k stm-k-narrow">성명</th>
                  <td className="stm-v">{company.ceo}</td>
                </tr>
                <tr>
                  <th className="stm-k">상호</th>
                  <td className="stm-v" colSpan={3}>{company.legalName}</td>
                </tr>
                <tr>
                  <th className="stm-k">주소</th>
                  <td className="stm-v" colSpan={3}>{company.address}</td>
                </tr>
              </tbody>
            </table>
            {company.stampUrl ? (
              <img className="stm-stamp" src={company.stampUrl} alt="법인 인감" />
            ) : null}
          </div>
        </div>

        {/* 배송지 (적색 볼드) — 인수자번호 / 배송주소 */}
        <div className="stm-ship-box">
          배송지: {slip.recipientPhone ?? slip.contactPhone ?? '-'} /{' '}
          {slip.shippingAddress ?? slip.deliveryAddress ?? '-'}
        </div>

        {/* 금액 — 한글 금액 정 + (₩ 숫자) */}
        <div className="stm-amount-box">
          <span>금액: {krwHangul(grandTotal)}원 정</span>
          <span className="stm-amount-won">(₩ {krw(grandTotal)})</span>
        </div>

        {/* 품목표 — 월/일 | 품목명 | 수량 | 단가(VAT포함) | 공급가액 | 부가세 */}
        <table className="stm-items">
          <thead>
            <tr>
              <th className="col-date">월/일</th>
              <th className="col-product">품목명</th>
              <th className="col-qty">수량</th>
              <th className="col-unit">단가</th>
              <th className="col-supply">공급가액</th>
              <th className="col-vat">부가세</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => {
              const a = perLine[idx] ?? { supply: 0, vat: 0, unitWithVat: 0 }
              return (
                <tr key={l.id}>
                  <td className="col-date">{toMonthDay(slip.slipDate)}</td>
                  <td className="col-product">{lineDisplayName(l)}</td>
                  <td className="col-qty num">{l.quantity.toLocaleString('ko-KR')}</td>
                  <td className="col-unit num">{a.unitWithVat ? krw(a.unitWithVat) : ''}</td>
                  <td className="col-supply num">{krw(a.supply)}</td>
                  <td className="col-vat num">{krw(a.vat)}</td>
                </tr>
              )
            })}
            {Array.from({ length: fillerCount }).map((_, i) => (
              <tr key={`pad-${i}`} className="stm-pad-row">
                <td className="col-date">&nbsp;</td>
                <td className="col-product">&nbsp;</td>
                <td className="col-qty">&nbsp;</td>
                <td className="col-unit">&nbsp;</td>
                <td className="col-supply">&nbsp;</td>
                <td className="col-vat">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 합계행 — 수량 | 공급가액 | VAT | 합계 | 인수 | 인 */}
        <table className="stm-sum">
          <tbody>
            <tr>
              <td className="stm-sum-k">수량</td>
              <td className="stm-sum-v">{totalQty.toLocaleString('ko-KR')}</td>
              <td className="stm-sum-k">공급가액</td>
              <td className="stm-sum-v">{krw(totalSupply)}</td>
              <td className="stm-sum-k">VAT</td>
              <td className="stm-sum-v">{krw(totalVat)}</td>
              <td className="stm-sum-k">합계</td>
              <td className="stm-sum-v">{krw(grandTotal)}</td>
              <td className="stm-sum-k stm-sum-recv">인수</td>
              <td className="stm-sum-recv-v">인</td>
            </tr>
          </tbody>
        </table>

        {/* 입금계좌 푸터 (적색) — API에서 실시간 조회 (bankNotice 빈 문자열이면 미표시) */}
        {company.bankNotice ? (
          <footer className="stm-bank-box">
            {company.bankNotice}&nbsp;&nbsp;&nbsp;{krw(grandTotal)}원
          </footer>
        ) : null}
      </div>
    </PrintLayout>
  )
}
