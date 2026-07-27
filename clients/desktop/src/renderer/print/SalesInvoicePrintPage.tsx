/**
 * 매출 세금계산서 인쇄 양식 — `/sales/:id/print/invoice`.
 *
 * SP-08-6-4 P1 신규: legacy GAS 매출 세금계산서 100% 매칭 목표.
 * SP-08-5-5 PurchaseSlipPrintPage / SalesTransactionStatementPrintPage 패턴 이식.
 *
 * 세금계산서 특이점 (거래명세서 대비):
 * - 양식 제목: "세 금 계 산 서"
 * - 상단에 공급자(발행자) / 공급받는자 정보 2열 박스 추가
 *   - 공급자: COMPANY 상수 (사업자번호 / 대표자 / 주소 / 업태/종목)
 *   - 공급받는자: slip.partnerName / slip.businessNumber / slip.deliveryAddress
 * - 합계란에 공급가액 + 세액 별도 명시 (legacy GAS B 회계 정합)
 * - 라인 테이블 동일 8컬럼
 *
 * UUID 비공개 가드: `id` 는 path param / QueryKey 전용. 화면 노출 X.
 * slipNo + partnerName 만 사용자 노출.
 *
 * 저장된 전표 라인 금액을 우선 사용하며 legacy 금액만 호환 fallback 한다.
 */
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSlip, type SlipDetail } from '../api/slip'
import { listWarehouses, type Warehouse } from '../api/inventory'
import { usePageTitle } from '../hooks/usePageTitle'
import { stripSlipNoZeros } from '../utils/orderNo'
import {
  PrintLayout,
  krw,
  krDate,
} from './PrintLayout'
import { nowPrintedAt, fmtDatetime } from './printUtils'
import { useCompanyProfile } from './useCompanyProfile'
import { storedLineAmounts, storedLineUnitPrices } from './printAmounts'

export function SalesInvoicePrintPage() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''

  const detailQuery = useQuery({
    queryKey: ['slip', id],
    queryFn: () => getSlip(id),
    enabled: !!id,
  })

  const warehousesQuery = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const { company } = useCompanyProfile()

  const displaySlipNo = stripSlipNoZeros(detailQuery.data?.slipNo)
  usePageTitle('세금계산서', displaySlipNo)

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

  const totals = slip.lines.reduce((sum, line) => {
    const amounts = storedLineAmounts(line)
    return {
      supply: sum.supply + amounts.supply,
      vat: sum.vat + amounts.vat,
      total: sum.total + amounts.total,
    }
  }, { supply: 0, vat: 0, total: 0 })

  /** 출고창고명 */
  const srcWarehouseName =
    warehousesQuery.data?.find((w) => w.id === slip.sourceWarehouseId)?.name ?? '-'

  /** 최대 30행 1페이지 */
  const PAGE_LINE_LIMIT = 30
  const lines = slip.lines

  const printedAt = nowPrintedAt()

  return (
    <PrintLayout paper="a4-portrait" backTo={`/sales/${id}`}>
      <div className="sales-print-page" data-testid="sales-invoice-print-area">

        {/* 상단 헤더 — 3열 그리드 */}
        <header className="sales-print-header sales-print-header-3col">
          <div className="sales-print-header-left">
            <img
              className="sales-print-logo"
              src={company.logoPath}
              alt={company.legalName}
            />
            <span className="sales-print-company-name">{company.legalName}</span>
          </div>
          <div className="sales-print-header-center">
            <h1 className="sales-print-title">세 금 계 산 서</h1>
          </div>
          <div className="sales-print-header-right">
            <div className="sales-print-header-meta-row">
              <span className="sales-print-meta-label">전표번호</span>
              <span className="sales-print-meta-value strong">{displaySlipNo}</span>
            </div>
            <div className="sales-print-header-meta-row">
              <span className="sales-print-meta-label">작성일자</span>
              <span className="sales-print-meta-value">{krDate(slip.slipDate)}</span>
            </div>
            <div className="sales-print-header-meta-row">
              <span className="sales-print-meta-label">담당자</span>
              <span className="sales-print-meta-value">{slip.ownerFullName ?? '-'}</span>
            </div>
            <div className="sales-print-printed-at">출력일시: {printedAt}</div>
          </div>
        </header>

        {/* 공급자 / 공급받는자 정보 박스 — 2열 */}
        <section className="sales-invoice-parties">
          {/* 공급자 (발행자) — useCompanyProfile 훅 */}
          <div className="sales-invoice-party-box">
            <div className="sales-invoice-party-title">공급자 (발행자)</div>
            <dl className="sales-invoice-party-dl">
              <div className="sales-invoice-party-row">
                <dt className="sales-invoice-party-label">상호</dt>
                <dd className="sales-invoice-party-value strong">{company.legalName}</dd>
              </div>
              <div className="sales-invoice-party-row">
                <dt className="sales-invoice-party-label">사업자번호</dt>
                <dd className="sales-invoice-party-value">{company.businessRegNo}</dd>
              </div>
              <div className="sales-invoice-party-row">
                <dt className="sales-invoice-party-label">대표자</dt>
                <dd className="sales-invoice-party-value">{company.ceo}</dd>
              </div>
              <div className="sales-invoice-party-row">
                <dt className="sales-invoice-party-label">주소</dt>
                <dd className="sales-invoice-party-value">{company.address}</dd>
              </div>
              <div className="sales-invoice-party-row">
                <dt className="sales-invoice-party-label">업태/종목</dt>
                <dd className="sales-invoice-party-value">
                  {company.businessType} / {company.businessItem}
                </dd>
              </div>
            </dl>
          </div>

          {/* 공급받는자 — slip.partnerName / businessNumber / deliveryAddress */}
          <div className="sales-invoice-party-box">
            <div className="sales-invoice-party-title">공급받는자</div>
            <dl className="sales-invoice-party-dl">
              <div className="sales-invoice-party-row">
                <dt className="sales-invoice-party-label">상호</dt>
                <dd className="sales-invoice-party-value strong">{slip.partnerName ?? '-'}</dd>
              </div>
              {slip.businessNumber ? (
                <div className="sales-invoice-party-row">
                  <dt className="sales-invoice-party-label">사업자번호</dt>
                  <dd className="sales-invoice-party-value">{slip.businessNumber}</dd>
                </div>
              ) : null}
              {slip.contactPhone ? (
                <div className="sales-invoice-party-row">
                  <dt className="sales-invoice-party-label">전화번호</dt>
                  <dd className="sales-invoice-party-value">{slip.contactPhone}</dd>
                </div>
              ) : null}
              {slip.deliveryAddress ? (
                <div className="sales-invoice-party-row">
                  <dt className="sales-invoice-party-label">주소</dt>
                  <dd className="sales-invoice-party-value">{slip.deliveryAddress}</dd>
                </div>
              ) : null}
              <div className="sales-invoice-party-row">
                <dt className="sales-invoice-party-label">출고창고</dt>
                <dd className="sales-invoice-party-value">{srcWarehouseName}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* 라인 테이블 — 7컬럼 (spec §12: 월/일 / 품목명 / 규격 / 수량 / 단가 / 공급가액 / 세액) */}
        <table className="sales-print-table">
          <thead>
            <tr>
              <th className="col-date">월/일</th>
              <th className="col-product">품목명</th>
              <th className="col-spec">규격</th>
              <th className="col-qty">수량</th>
              <th className="col-price">단가</th>
              <th className="col-supply">공급가액</th>
              <th className="col-vat">세액</th>
            </tr>
          </thead>
          <tbody>
            {lines.slice(0, PAGE_LINE_LIMIT).map((l, idx) => {
              const { supply: lineSupply, vat: lineVat } = storedLineAmounts(l)
              /** 저장된 S/V/T를 우선 사용하고 legacy 라인만 호환 fallback 한다. */
              /** 단가 열은 공급가액 열과 같은 VAT 제외 도메인 — 단가 x 수량 = 공급가액 (#937 재수렴 4차). */
              const lineUnitPrice = storedLineUnitPrices(l).supplyUnit
              /** MM/DD 포맷 — 전표 slipDate 기준 (라인별 날짜 없음) */
              const slipMmDd = slip.slipDate
                ? slip.slipDate.slice(5, 7) + '/' + slip.slipDate.slice(8, 10)
                : ''
              return (
                <tr key={`${l.id}-${idx}`}>
                  <td className="col-date">{slipMmDd}</td>
                  <td className="col-product">{l.modelName ?? l.productName ?? '-'}</td>
                  <td className="col-spec">{l.specification ?? '-'}</td>
                  <td className="col-qty num">{l.quantity.toLocaleString('ko-KR')}</td>
                  <td className="col-price num">{krw(lineUnitPrice)}</td>
                  <td className="col-supply num">{krw(lineSupply)}</td>
                  <td className="col-vat num">{krw(lineVat)}</td>
                </tr>
              )
            })}
            {/* 최소 5행 유지 — 여백 행 */}
            {Array.from({ length: Math.max(0, 5 - lines.length) }).map((_, i) => (
              <tr key={`pad-${i}`} className="sales-print-pad-row">
                <td className="col-date">&nbsp;</td>
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
              <td colSpan={4} className="sales-print-table-totals-label">합계</td>
              <td className="col-qty num strong">{slip.lines.reduce((s, l) => s + l.quantity, 0).toLocaleString('ko-KR')}</td>
               <td className="col-supply num strong">{krw(totals.supply)}</td>
               <td className="col-vat num strong">{krw(totals.vat)}</td>
            </tr>
          </tfoot>
        </table>

        {/* 합계 영역 — 공급가액 / 세액(부가세) / 합계 */}
        <section className="sales-print-totals">
          <div className="sales-print-totals-row">
            <span className="sales-print-totals-label">공급가액</span>
            <span className="sales-print-totals-value num">{krw(totals.supply)}</span>
          </div>
          <div className="sales-print-totals-row">
            <span className="sales-print-totals-label">세액</span>
            <span className="sales-print-totals-value num">{krw(totals.vat)}</span>
          </div>
          <div className="sales-print-totals-row strong">
            <span className="sales-print-totals-label">합계금액</span>
            <span className="sales-print-totals-value num">{krw(totals.total)} 원</span>
          </div>
        </section>

        {/* 푸터 — 비고 + audit */}
        <footer className="sales-print-footer">
          {slip.memo ? (
            <div className="sales-print-memo">
              <span className="sales-print-memo-label">비고</span>
              <span className="sales-print-memo-value">{slip.memo}</span>
            </div>
          ) : null}
          <div className="sales-print-audit-row">
            <span>담당자: {slip.ownerFullName ?? '-'}</span>
            <span>최종수정: {fmtDatetime(slip.updatedAt)}</span>
            <span className="sales-print-audit-printed">출력일시: {printedAt}</span>
          </div>
        </footer>
      </div>
    </PrintLayout>
  )
}
