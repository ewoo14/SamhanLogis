/**
 * 매출 세금계산서 인쇄 양식 — `/sales/:id/print/invoice-slip`.
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
 * Iteration 가드: 1차 mock — 사용자 Edge 캡처 검토 후 추가 갱신 예정
 * (memory `feedback_print_design_iteration.md`).
 */
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSlip, type SlipDetail } from '../api/slip'
import { listWarehouses, type Warehouse } from '../api/inventory'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  PrintLayout,
  COMPANY,
  krw,
  krDate,
  calcAmounts,
} from './PrintLayout'

/** 출력일시 포맷 — "YYYY-MM-DD HH:mm" */
function nowPrintedAt(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** ISO 8601 timestamp → "YYYY-MM-DD HH:mm" */
function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16)
}

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

  usePageTitle('세금계산서', detailQuery.data?.slipNo)

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

  const totalSupply = slip.lines.reduce((sum, l) => sum + Number(l.lineTotal), 0)
  const { supply, vat, total } = calcAmounts(totalSupply)

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
              src={COMPANY.logoPath}
              alt={COMPANY.legalName}
            />
            <span className="sales-print-company-name">{COMPANY.legalName}</span>
          </div>
          <div className="sales-print-header-center">
            <h1 className="sales-print-title">세 금 계 산 서</h1>
          </div>
          <div className="sales-print-header-right">
            <div className="sales-print-header-meta-row">
              <span className="sales-print-meta-label">전표번호</span>
              <span className="sales-print-meta-value strong">{slip.slipNo}</span>
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
          {/* 공급자 (발행자) — COMPANY 상수 */}
          <div className="sales-invoice-party-box">
            <div className="sales-invoice-party-title">공급자 (발행자)</div>
            <dl className="sales-invoice-party-dl">
              <div className="sales-invoice-party-row">
                <dt className="sales-invoice-party-label">상호</dt>
                <dd className="sales-invoice-party-value strong">{COMPANY.legalName}</dd>
              </div>
              <div className="sales-invoice-party-row">
                <dt className="sales-invoice-party-label">사업자번호</dt>
                <dd className="sales-invoice-party-value">{COMPANY.businessRegNo}</dd>
              </div>
              <div className="sales-invoice-party-row">
                <dt className="sales-invoice-party-label">대표자</dt>
                <dd className="sales-invoice-party-value">{COMPANY.ceo}</dd>
              </div>
              <div className="sales-invoice-party-row">
                <dt className="sales-invoice-party-label">주소</dt>
                <dd className="sales-invoice-party-value">{COMPANY.address}</dd>
              </div>
              <div className="sales-invoice-party-row">
                <dt className="sales-invoice-party-label">업태/종목</dt>
                <dd className="sales-invoice-party-value">
                  {COMPANY.businessType} / {COMPANY.businessItem}
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

        {/* 라인 테이블 — 8컬럼 */}
        <table className="sales-print-table">
          <thead>
            <tr>
              <th className="col-no">No.</th>
              <th className="col-product">품목명</th>
              <th className="col-spec">규격</th>
              <th className="col-qty">수량</th>
              <th className="col-price">단가</th>
              <th className="col-supply">공급가액</th>
              <th className="col-vat">세액</th>
              <th className="col-memo">적요</th>
            </tr>
          </thead>
          <tbody>
            {lines.slice(0, PAGE_LINE_LIMIT).map((l, idx) => {
              const lineSupply = Number(l.lineTotal)
              const lineVat = Math.round(lineSupply * 0.1)
              return (
                <tr key={l.id}>
                  <td className="col-no">{idx + 1}</td>
                  <td className="col-product">{l.modelName ?? l.productName ?? '-'}</td>
                  <td className="col-spec">{l.specification ?? '-'}</td>
                  <td className="col-qty num">{l.quantity.toLocaleString('ko-KR')}</td>
                  <td className="col-price num">{krw(l.unitPrice)}</td>
                  <td className="col-supply num">{krw(lineSupply)}</td>
                  <td className="col-vat num">{krw(lineVat)}</td>
                  <td className="col-memo">{l.note ?? ''}</td>
                </tr>
              )
            })}
            {/* 최소 5행 유지 — 여백 행 */}
            {Array.from({ length: Math.max(0, 5 - lines.length) }).map((_, i) => (
              <tr key={`pad-${i}`} className="sales-print-pad-row">
                <td className="col-no">&nbsp;</td>
                <td className="col-product">&nbsp;</td>
                <td className="col-spec">&nbsp;</td>
                <td className="col-qty">&nbsp;</td>
                <td className="col-price">&nbsp;</td>
                <td className="col-supply">&nbsp;</td>
                <td className="col-vat">&nbsp;</td>
                <td className="col-memo">&nbsp;</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="sales-print-table-totals-label">합계</td>
              <td className="col-supply num strong">{krw(supply)}</td>
              <td className="col-vat num strong">{krw(vat)}</td>
              <td className="col-memo">&nbsp;</td>
            </tr>
          </tfoot>
        </table>

        {/* 합계 영역 — 공급가액 / 세액(부가세) / 합계 */}
        <section className="sales-print-totals">
          <div className="sales-print-totals-row">
            <span className="sales-print-totals-label">공급가액</span>
            <span className="sales-print-totals-value num">{krw(supply)}</span>
          </div>
          <div className="sales-print-totals-row">
            <span className="sales-print-totals-label">세액 (10%)</span>
            <span className="sales-print-totals-value num">{krw(vat)}</span>
          </div>
          <div className="sales-print-totals-row strong">
            <span className="sales-print-totals-label">합계금액</span>
            <span className="sales-print-totals-value num">{krw(total)} 원</span>
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
