/**
 * 입고전표 인쇄 미리보기 — `/purchases/:id/print/inbound`.
 *
 * P0-4 인쇄 양식 5건 1차 mock — Designer 단계 신규.
 *
 * 구성 (A4 기본 / 88mm 전환):
 * - 헤더: 회사명 + 입고전표 타이틀 + 전표번호
 * - 공급처: 공급처명 + 연락처 + 입고창고
 * - 라인 표: 품목 / 규격 / 수량 / 단가 / 금액
 * - 합계: 공급가 + 부가세 + 합계
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

export function InboundView() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const [paper, setPaper] = useState<PaperSize>('a4-portrait')

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
  usePageTitle('입고전표', displaySlipNo)

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
  const destWarehouseName =
    warehousesQuery.data?.find((w) => w.id === slip.destinationWarehouseId)?.name ?? '-'

  const variant = paper === 'receipt-88mm' ? 'receipt' : 'a4'

  return (
    <PrintLayout
      paper={paper}
      backTo={`/purchases/${id}`}
      showFormatToggle
      onToggleFormat={() => setPaper((p) => (p === 'receipt-88mm' ? 'a4-portrait' : 'receipt-88mm'))}
    >
      <div className={`inbound-page inbound-${variant}`} data-testid="inbound-print-area">
        <header className="inbound-header">
          <div className="inbound-company">{company.legalName}</div>
          <h1 className="inbound-title">입 고 전 표</h1>
          <div className="inbound-meta-row">
            <span>전표번호: <strong>{displaySlipNo}</strong></span>
            <span>발행일: {krDate(slip.slipDate)}</span>
          </div>
          <div className="inbound-meta-row">
            <span>입고창고: <strong>{destWarehouseName}</strong></span>
          </div>
        </header>

        <div className="inbound-divider">- - - - - - - - - - - - - - - - - - - -</div>

        <section className="inbound-supplier">
          <div className="row">
            <span className="label">공급처</span>
            <span className="value">{slip.partnerName ?? '-'}</span>
          </div>
          {slip.contactPhone ? (
            <div className="row">
              <span className="label">연락처</span>
              <span className="value">{slip.contactPhone}</span>
            </div>
          ) : null}
        </section>

        <div className="inbound-divider">- - - - - - - - - - - - - - - - - - - -</div>

        <table className="inbound-table">
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

        <div className="inbound-divider">- - - - - - - - - - - - - - - - - - - -</div>

        <section className="inbound-totals">
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
          <section className="inbound-memo">
            <span className="label">비고</span>
            <span className="value">{slip.memo}</span>
          </section>
        ) : null}
      </div>
    </PrintLayout>
  )
}
