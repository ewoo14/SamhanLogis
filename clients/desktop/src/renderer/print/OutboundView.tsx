/**
 * 출고전표 인쇄 미리보기 — `/sales/:id/print/outbound`.
 *
 * P0-4 인쇄 양식 5건 1차 mock — Designer 단계 신규.
 *
 * DispatchView (`/sales/:id/print/dispatch`) 와의 차이:
 * - DispatchView = 작업지시서 (창고 내부 — 4-col 라인, 큰 거래처명, 결재란 5칸).
 * - OutboundView = 출고 시 거래처 동봉용 영수증 형식 — 88mm ↔ A4 toggle.
 *
 * 구성 (88mm 기본 / A4 분기):
 * - 헤더: 회사명 + 출고전표 타이틀 + 전표번호
 * - 거래처: 거래처명 + 배송지 + 연락처
 * - 라인: 품목 / 규격 / 수량 / 단가 / 금액
 * - 합계: 공급가 + 부가세 + 합계
 * - 도장 자리: 출고인 도장 + 인수자 서명 (88mm 는 압축)
 *
 * 출처: `docs/manual/06-트러블슈팅/03-인쇄-안됨.md` §1 표 (P0-4).
 *
 * Iteration 가드 (memory `feedback_print_design_iteration.md`):
 * 본 1차 mock — 사용자 Edge 캡처 검토 후 2~5차 갱신 예정.
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSlip, type SlipDetail } from '../api/slip'
import { listWarehouses, type Warehouse } from '../api/inventory'
import { usePageTitle } from '../hooks/usePageTitle'
import { stripSlipNoZeros } from '../utils/orderNo'
import { PrintLayout, krw, krDate, calcAmounts, type PaperSize } from './PrintLayout'
import { useCompanyProfile } from './useCompanyProfile'

export function OutboundView() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const [paper, setPaper] = useState<PaperSize>('receipt-88mm')

  const detailQuery = useQuery({
    queryKey: ['slip', id],
    queryFn: () => getSlip(id),
    enabled: !!id,
  })
  const warehousesQuery = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const displaySlipNo = stripSlipNoZeros(detailQuery.data?.slipNo)
  usePageTitle('출고전표', displaySlipNo)

  // 훅 규칙(rules-of-hooks): early-return 보다 앞에 위치
  const { company } = useCompanyProfile()

  if (!id) return null
  if (detailQuery.isLoading) return <p>불러오는 중...</p>
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        전표를 불러오지 못했습니다.
      </div>
    )
  }

  const slip: SlipDetail = detailQuery.data
  const totalSupply = slip.lines.reduce((sum, l) => sum + Number(l.lineTotal), 0)
  const totalQty = slip.lines.reduce((sum, l) => sum + l.quantity, 0)
  const { supply, vat, total } = calcAmounts(totalSupply)
  const sourceWarehouseName =
    warehousesQuery.data?.find((w) => w.id === slip.sourceWarehouseId)?.name ?? '-'

  const variant = paper === 'receipt-88mm' ? 'receipt' : 'a4'

  return (
    <PrintLayout
      paper={paper}
      backTo={`/sales/${id}`}
      showFormatToggle
      onToggleFormat={() => setPaper((p) => (p === 'receipt-88mm' ? 'a4-portrait' : 'receipt-88mm'))}
    >
      <div className={`outbound-page outbound-${variant}`} data-testid="outbound-print-area">
        <header className="outbound-header">
          <div className="outbound-company">{company.legalName}</div>
          <h1 className="outbound-title">출 고 전 표</h1>
          <div className="outbound-meta-row">
            <span>전표번호: <strong>{displaySlipNo}</strong></span>
            <span>발행일: {krDate(slip.slipDate)}</span>
          </div>
          <div className="outbound-meta-row">
            <span>출하창고: <strong>{sourceWarehouseName}</strong></span>
          </div>
        </header>

        <div className="outbound-divider">- - - - - - - - - - - - - - - - - - - -</div>

        <section className="outbound-partner">
          <div className="row">
            <span className="label">거래처</span>
            <span className="value">{slip.partnerName ?? '-'}</span>
          </div>
          <div className="row">
            <span className="label">배송지</span>
            <span className="value">{slip.shippingAddress ?? '-'}</span>
          </div>
          <div className="row">
            <span className="label">연락처</span>
            <span className="value">{slip.contactPhone ?? '-'}</span>
          </div>
          {slip.driverName ? (
            <div className="row">
              <span className="label">기사</span>
              <span className="value">{slip.driverName} ({slip.driverPhone ?? '-'})</span>
            </div>
          ) : null}
        </section>

        <div className="outbound-divider">- - - - - - - - - - - - - - - - - - - -</div>

        <table className="outbound-table">
          <thead>
            <tr>
              <th className="col-product">품목</th>
              {variant === 'a4' ? <th className="col-spec">규격</th> : null}
              <th className="col-qty">수량</th>
              <th className="col-price">단가</th>
              <th className="col-amount">금액</th>
            </tr>
          </thead>
          <tbody>
            {slip.lines.map((l) => {
              const lineSupply = Number(l.lineTotal)
              const productLabel = l.modelName
                ? `${l.modelName}${l.productName ? ` / ${l.productName}` : ''}`
                : (l.productName ?? '-')
              return (
                <tr key={l.id}>
                  <td className="col-product">{productLabel}</td>
                  {variant === 'a4' ? <td className="col-spec">{l.specification ?? '-'}</td> : null}
                  <td className="col-qty num">{l.quantity.toLocaleString()}</td>
                  <td className="col-price num">{krw(l.unitPrice)}</td>
                  <td className="col-amount num">{krw(lineSupply)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="outbound-divider">- - - - - - - - - - - - - - - - - - - -</div>

        <section className="outbound-totals">
          <div className="row">
            <span>총 수량</span>
            <span className="num">{totalQty.toLocaleString()}</span>
          </div>
          <div className="row">
            <span>공급가액</span>
            <span className="num">{krw(supply)}</span>
          </div>
          <div className="row">
            <span>부가세 (10%)</span>
            <span className="num">{krw(vat)}</span>
          </div>
          <div className="row strong">
            <span>합계</span>
            <span className="num">{krw(total)} 원</span>
          </div>
        </section>

        {slip.memo ? (
          <section className="outbound-memo">
            <span className="label">비고</span>
            <span className="value">{slip.memo}</span>
          </section>
        ) : null}

        <footer className="outbound-footer">
          <div className="outbound-stamp-row">
            <div className="stamp-cell">
              <div className="stamp-label">출고인</div>
              <div className="stamp-value">
                {slip.dispatcher?.fullName ?? ''}
                <span className="stamp-mark">[인]</span>
              </div>
            </div>
            <div className="stamp-cell">
              <div className="stamp-label">인수자</div>
              <div className="stamp-value">
                {slip.signerName ?? ''}
                {slip.signaturePng ? (
                  <img className="stamp-png" src={slip.signaturePng} alt="인수자 서명" />
                ) : (
                  <span className="stamp-mark">[인]</span>
                )}
              </div>
            </div>
          </div>
          <p className="outbound-issuer-note">
            발행: {company.legalName} / TEL {company.tel}
          </p>
        </footer>
      </div>
    </PrintLayout>
  )
}
