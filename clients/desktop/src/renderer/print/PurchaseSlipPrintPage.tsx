/**
 * 매입 전표 인쇄 양식 — `/purchases/:id/print/purchase`.
 *
 * SP-08-5-5 P1 신규: legacy GAS 매입 전표 양식 100% 매칭 목표.
 * 2차 iteration — 8컬럼 라인테이블 + 헤더 3열 그리드 + 거래처 2열 그리드 반영
 * (memory `feedback_print_design_iteration.md`).
 *
 * 구성 (A4 portrait 210mm × 297mm, padding 12mm):
 * - 상단 헤더: 좌(회사명/로고) / 중앙("매 입 전 표" 20pt 700) / 우(전표번호/일자/담당자) — 3열
 * - 슬립 정보 행: 슬립번호 / 슬립일자 / 입고창고명 / 담당자
 * - 거래처 정보 영역: 좌(거래처명/사업자번호/대표자) + 우(입고창고/담당자/주소) — 2열 그리드
 * - 라인 테이블: No./품목명/규격/수량/단가/공급가액/부가세/적요 (8컬럼)
 * - 합계 영역: 공급가액 / 부가세 / 합계
 * - 검수란 (수기 작성 공란): 검수일자 / 검수자 / 검수결과 / 비고
 * - 푸터: 비고 / audit (createdBy + modifiedBy + updatedAt)
 *
 * UUID 비공개 가드: `id` 는 path param / QueryKey 전용. 화면 노출 X.
 * 슬립번호(slipNo) 만 사용자 노출.
 *
 * Iteration 가드: 본 2차 mock — 사용자 Edge 캡처 검토 후 추가 갱신 예정.
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
  // "2026-05-18T14:32:18+09:00" → "2026-05-18 14:32"
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16)
}

export function PurchaseSlipPrintPage() {
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

  usePageTitle('매입 전표', detailQuery.data?.slipNo)

  if (!id) return null
  if (detailQuery.isLoading) return <p>불러오는 중...</p>
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        매입 전표를 불러오지 못했습니다.
      </div>
    )
  }

  const slip: SlipDetail = detailQuery.data

  const totalSupply = slip.lines.reduce((sum, l) => sum + Number(l.lineTotal), 0)
  const totalQty = slip.lines.reduce((sum, l) => sum + l.quantity, 0)
  const { supply, vat, total } = calcAmounts(totalSupply)

  const destWarehouseName =
    warehousesQuery.data?.find((w) => w.id === slip.destinationWarehouseId)?.name ?? '-'

  /** 30행 초과 시 분할 인쇄 대비 — 최대 30행 1페이지 */
  const PAGE_LINE_LIMIT = 30
  const lines = slip.lines

  const printedAt = nowPrintedAt()

  return (
    <PrintLayout paper="a4-portrait" backTo={`/purchases/${id}`}>
      <div className="purchase-print-page" data-testid="purchase-print-area">

        {/* 상단 헤더 — 3열 그리드: 좌(로고+회사명) / 중앙(양식 제목) / 우(전표번호/일자/담당자) */}
        <header className="purchase-print-header purchase-print-header-3col">
          <div className="purchase-print-header-left">
            <img
              className="purchase-print-logo"
              src={COMPANY.logoPath}
              alt={COMPANY.legalName}
            />
            <span className="purchase-print-company-name">{COMPANY.legalName}</span>
          </div>
          <div className="purchase-print-header-center">
            <h1 className="purchase-print-title">매 입 전 표</h1>
          </div>
          <div className="purchase-print-header-right">
            <div className="purchase-print-header-meta-row">
              <span className="purchase-print-meta-label">전표번호</span>
              <span className="purchase-print-meta-value strong">{slip.slipNo}</span>
            </div>
            <div className="purchase-print-header-meta-row">
              <span className="purchase-print-meta-label">전표일자</span>
              <span className="purchase-print-meta-value">{krDate(slip.slipDate)}</span>
            </div>
            <div className="purchase-print-header-meta-row">
              <span className="purchase-print-meta-label">담당자</span>
              <span className="purchase-print-meta-value">{slip.ownerFullName ?? '-'}</span>
            </div>
            <div className="purchase-print-printed-at">출력일시: {printedAt}</div>
          </div>
        </header>

        {/* 거래처 정보 영역 — 2열 그리드: 좌(거래처명/사업자번호/대표자/전화) + 우(입고창고/담당자/주소) */}
        <section className="purchase-print-partner purchase-print-partner-2col">
          <div className="purchase-print-partner-col">
            <dl className="purchase-print-partner-dl">
              <div className="purchase-print-partner-row">
                <dt className="purchase-print-partner-label">거래처</dt>
                <dd className="purchase-print-partner-value strong">{slip.partnerName ?? '-'}</dd>
              </div>
              {slip.businessNumber ? (
                <div className="purchase-print-partner-row">
                  <dt className="purchase-print-partner-label">사업자번호</dt>
                  <dd className="purchase-print-partner-value">{slip.businessNumber}</dd>
                </div>
              ) : null}
              {slip.contactPhone ? (
                <div className="purchase-print-partner-row">
                  <dt className="purchase-print-partner-label">전화번호</dt>
                  <dd className="purchase-print-partner-value">{slip.contactPhone}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <div className="purchase-print-partner-col">
            <dl className="purchase-print-partner-dl">
              <div className="purchase-print-partner-row">
                <dt className="purchase-print-partner-label">입고창고</dt>
                <dd className="purchase-print-partner-value emphasis">{destWarehouseName}</dd>
              </div>
              <div className="purchase-print-partner-row">
                <dt className="purchase-print-partner-label">담당자</dt>
                <dd className="purchase-print-partner-value">{slip.ownerFullName ?? '-'}</dd>
              </div>
              {slip.deliveryAddress ? (
                <div className="purchase-print-partner-row">
                  <dt className="purchase-print-partner-label">주소</dt>
                  <dd className="purchase-print-partner-value">{slip.deliveryAddress}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>

        {/* 라인 테이블 (메인 영역) — 8컬럼: No./품목명/규격/수량/단가/공급가액/부가세/적요 */}
        <table className="purchase-print-table">
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
              <tr key={`pad-${i}`} className="purchase-print-pad-row">
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
              <td colSpan={5} className="purchase-print-table-totals-label">합계</td>
              <td className="col-supply num strong">{krw(supply)}</td>
              <td className="col-vat num strong">{krw(vat)}</td>
              <td className="col-memo">&nbsp;</td>
            </tr>
          </tfoot>
        </table>

        {/* 합계 영역 */}
        <section className="purchase-print-totals">
          <div className="purchase-print-totals-row">
            <span className="purchase-print-totals-label">공급가액</span>
            <span className="purchase-print-totals-value num">{krw(supply)}</span>
          </div>
          <div className="purchase-print-totals-row">
            <span className="purchase-print-totals-label">부가세 (10%)</span>
            <span className="purchase-print-totals-value num">{krw(vat)}</span>
          </div>
          <div className="purchase-print-totals-row strong">
            <span className="purchase-print-totals-label">합계</span>
            <span className="purchase-print-totals-value num">{krw(total)} 원</span>
          </div>
        </section>

        {/* 검수란 (수기 작성 공란) */}
        <section className="purchase-print-inspection">
          <div className="purchase-print-inspection-title">검 수 란</div>
          <div className="purchase-print-inspection-grid">
            <div className="purchase-print-inspection-cell">
              <div className="purchase-print-inspection-label">검수일자</div>
              <div className="purchase-print-inspection-blank">&nbsp;</div>
            </div>
            <div className="purchase-print-inspection-cell">
              <div className="purchase-print-inspection-label">검수자</div>
              <div className="purchase-print-inspection-blank">&nbsp;</div>
            </div>
            <div className="purchase-print-inspection-cell">
              <div className="purchase-print-inspection-label">검수결과</div>
              <div className="purchase-print-inspection-blank">&nbsp;</div>
            </div>
            <div className="purchase-print-inspection-cell">
              <div className="purchase-print-inspection-label">비고</div>
              <div className="purchase-print-inspection-blank">&nbsp;</div>
            </div>
          </div>
        </section>

        {/* 푸터 — 비고 + audit (담당자 / 최종수정일시 / 출력일시) */}
        <footer className="purchase-print-footer">
          {slip.memo ? (
            <div className="purchase-print-memo">
              <span className="purchase-print-memo-label">비고</span>
              <span className="purchase-print-memo-value">{slip.memo}</span>
            </div>
          ) : null}
          <div className="purchase-print-audit-row">
            <span>담당자: {slip.ownerFullName ?? '-'}</span>
            <span>최종수정: {fmtDatetime(slip.updatedAt)}</span>
            <span className="purchase-print-audit-printed">출력일시: {printedAt}</span>
          </div>
        </footer>
      </div>
    </PrintLayout>
  )
}
