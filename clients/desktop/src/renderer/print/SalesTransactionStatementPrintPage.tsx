/**
 * 매출 거래명세서 인쇄 양식 — `/sales/:id/print/statement`.
 *
 * SP-08-6-4 P1 신규: legacy GAS 매출 거래명세서 100% 매칭 목표.
 * SP-08-5-5 PurchaseSlipPrintPage 패턴 1:1 이식 (purchase-print-* → sales-print-* prefix).
 *
 * 구성 (A4 portrait 210mm × 297mm, padding 12mm):
 * - 상단 헤더: 좌(회사명/로고) / 중앙("거 래 명 세 서" 20pt 700) / 우(전표번호/일자/담당자) — 3열
 * - 거래처 정보 영역: 좌(거래처명/사업자번호/대표자/전화) + 우(출고창고/담당자/주소) — 2열 그리드
 * - 라인 테이블: No./품목명/규격/수량/단가/공급가액/부가세/적요 (8컬럼)
 * - 합계 영역: 공급가액 / 부가세 (10%) / 합계
 * - 비고
 * - 푸터: 담당자 / 최종수정일시 / 출력일시
 *
 * UUID 비공개 가드: `id` 는 path param / QueryKey 전용. 화면 노출 X.
 * 슬립번호(slipNo) + 거래처명(partnerName) 만 사용자 노출.
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

export function SalesTransactionStatementPrintPage() {
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

  usePageTitle('거래명세서', detailQuery.data?.slipNo)

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

  /** 출고창고명 — OUTBOUND 전표는 sourceWarehouseId 가 출고 창고 */
  const srcWarehouseName =
    warehousesQuery.data?.find((w) => w.id === slip.sourceWarehouseId)?.name ?? '-'

  /** 최대 30행 1페이지 */
  const PAGE_LINE_LIMIT = 30
  const lines = slip.lines

  const printedAt = nowPrintedAt()

  return (
    <PrintLayout paper="a4-portrait" backTo={`/sales/${id}`}>
      <div className="sales-print-page" data-testid="sales-statement-print-area">

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
            <h1 className="sales-print-title">거 래 명 세 서</h1>
          </div>
          <div className="sales-print-header-right">
            <div className="sales-print-header-meta-row">
              <span className="sales-print-meta-label">전표번호</span>
              <span className="sales-print-meta-value strong">{slip.slipNo}</span>
            </div>
            <div className="sales-print-header-meta-row">
              <span className="sales-print-meta-label">전표일자</span>
              <span className="sales-print-meta-value">{krDate(slip.slipDate)}</span>
            </div>
            <div className="sales-print-header-meta-row">
              <span className="sales-print-meta-label">담당자</span>
              <span className="sales-print-meta-value">{slip.ownerFullName ?? '-'}</span>
            </div>
            <div className="sales-print-printed-at">출력일시: {printedAt}</div>
          </div>
        </header>

        {/* 거래처 정보 영역 — 2열 그리드 */}
        <section className="sales-print-partner sales-print-partner-2col">
          <div className="sales-print-partner-col">
            <dl className="sales-print-partner-dl">
              <div className="sales-print-partner-row">
                <dt className="sales-print-partner-label">거래처</dt>
                <dd className="sales-print-partner-value strong">{slip.partnerName ?? '-'}</dd>
              </div>
              {slip.businessNumber ? (
                <div className="sales-print-partner-row">
                  <dt className="sales-print-partner-label">사업자번호</dt>
                  <dd className="sales-print-partner-value">{slip.businessNumber}</dd>
                </div>
              ) : null}
              {slip.contactPhone ? (
                <div className="sales-print-partner-row">
                  <dt className="sales-print-partner-label">전화번호</dt>
                  <dd className="sales-print-partner-value">{slip.contactPhone}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <div className="sales-print-partner-col">
            <dl className="sales-print-partner-dl">
              <div className="sales-print-partner-row">
                <dt className="sales-print-partner-label">출고창고</dt>
                <dd className="sales-print-partner-value emphasis">{srcWarehouseName}</dd>
              </div>
              <div className="sales-print-partner-row">
                <dt className="sales-print-partner-label">담당자</dt>
                <dd className="sales-print-partner-value">{slip.ownerFullName ?? '-'}</dd>
              </div>
              {slip.deliveryAddress ? (
                <div className="sales-print-partner-row">
                  <dt className="sales-print-partner-label">주소</dt>
                  <dd className="sales-print-partner-value">{slip.deliveryAddress}</dd>
                </div>
              ) : null}
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
              <th className="col-vat">부가세</th>
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

        {/* 합계 영역 */}
        <section className="sales-print-totals">
          <div className="sales-print-totals-row">
            <span className="sales-print-totals-label">공급가액</span>
            <span className="sales-print-totals-value num">{krw(supply)}</span>
          </div>
          <div className="sales-print-totals-row">
            <span className="sales-print-totals-label">부가세 (10%)</span>
            <span className="sales-print-totals-value num">{krw(vat)}</span>
          </div>
          <div className="sales-print-totals-row strong">
            <span className="sales-print-totals-label">합계</span>
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
