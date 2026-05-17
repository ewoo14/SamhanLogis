/**
 * 매입 전표 인쇄 양식 — `/purchases/:id/print/purchase`.
 *
 * SP-08-5-5 P1 신규: legacy GAS 매입 전표 양식 100% 매칭 목표.
 * 1차 mock — Edge 캡처 → CSS-only 미세 조정 2~5회 iteration 예정
 * (memory `feedback_print_design_iteration.md`).
 *
 * 구성 (A4 portrait 210mm × 297mm, padding 12mm):
 * - 상단 헤더: 회사명/로고 (좌) + "매입 전표" + 출력일시 (우)
 * - 슬립 정보 행: 슬립번호 / 슬립일자 / 입고창고명 / 담당자
 * - 거래처 정보 영역: 거래처명 / 사업자번호 / 주소
 * - 라인 테이블: 번호 / 모델명 / 품목설명 / 수량 / 단가 / 합계
 * - 합계 영역: 총 수량 / 공급가 / 부가세 / 합계
 * - 검수란 (수기 작성 공란): 검수일자 / 검수자 / 검수결과 / 비고
 * - 푸터: 비고 / audit 4 필드 (createdAt/By, modifiedAt/By)
 *
 * UUID 비공개 가드: `id` 는 path param / QueryKey 전용. 화면 노출 X.
 * 슬립번호(slipNo) 만 사용자 노출.
 *
 * Iteration 가드: 본 1차 mock — 사용자 Edge 캡처 검토 후 2~5차 갱신 예정.
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

        {/* 상단 헤더 */}
        <header className="purchase-print-header">
          <div className="purchase-print-header-left">
            <img
              className="purchase-print-logo"
              src={COMPANY.logoPath}
              alt={COMPANY.legalName}
            />
            <span className="purchase-print-company-name">{COMPANY.legalName}</span>
          </div>
          <div className="purchase-print-header-right">
            <h1 className="purchase-print-title">매 입 전 표</h1>
            <div className="purchase-print-printed-at">출력일시: {printedAt}</div>
          </div>
        </header>

        {/* 슬립 정보 행 */}
        <section className="purchase-print-slip-info">
          <div className="purchase-print-info-cell">
            <span className="purchase-print-info-label">전표번호</span>
            <span className="purchase-print-info-value strong">{slip.slipNo}</span>
          </div>
          <div className="purchase-print-info-cell">
            <span className="purchase-print-info-label">전표일자</span>
            <span className="purchase-print-info-value">{krDate(slip.slipDate)}</span>
          </div>
          <div className="purchase-print-info-cell">
            <span className="purchase-print-info-label">입고창고</span>
            <span className="purchase-print-info-value emphasis">{destWarehouseName}</span>
          </div>
          <div className="purchase-print-info-cell">
            <span className="purchase-print-info-label">담당자</span>
            <span className="purchase-print-info-value">{slip.ownerFullName ?? '-'}</span>
          </div>
        </section>

        {/* 거래처 정보 영역 */}
        <section className="purchase-print-partner">
          <div className="purchase-print-partner-row">
            <span className="purchase-print-partner-label">거래처</span>
            <span className="purchase-print-partner-value strong">{slip.partnerName ?? '-'}</span>
          </div>
          {slip.businessNumber ? (
            <div className="purchase-print-partner-row">
              <span className="purchase-print-partner-label">사업자번호</span>
              <span className="purchase-print-partner-value">{slip.businessNumber}</span>
            </div>
          ) : null}
          {slip.deliveryAddress ? (
            <div className="purchase-print-partner-row">
              <span className="purchase-print-partner-label">주소</span>
              <span className="purchase-print-partner-value">{slip.deliveryAddress}</span>
            </div>
          ) : null}
        </section>

        {/* 라인 테이블 (메인 영역) */}
        <table className="purchase-print-table">
          <thead>
            <tr>
              <th className="col-no">번호</th>
              <th className="col-model">모델명</th>
              <th className="col-desc">품목설명</th>
              <th className="col-qty">수량</th>
              <th className="col-price">단가</th>
              <th className="col-amount">합계</th>
            </tr>
          </thead>
          <tbody>
            {lines.slice(0, PAGE_LINE_LIMIT).map((l, idx) => (
              <tr key={l.id}>
                <td className="col-no">{idx + 1}</td>
                <td className="col-model">{l.modelName ?? '-'}</td>
                <td className="col-desc">{l.productName ?? (l.specification ?? '-')}</td>
                <td className="col-qty num">{l.quantity.toLocaleString('ko-KR')}</td>
                <td className="col-price num">{krw(l.unitPrice)}</td>
                <td className="col-amount num">{krw(l.lineTotal)}</td>
              </tr>
            ))}
            {/* 최소 5행 유지 — 여백 행 */}
            {Array.from({ length: Math.max(0, 5 - lines.length) }).map((_, i) => (
              <tr key={`pad-${i}`} className="purchase-print-pad-row">
                <td className="col-no">&nbsp;</td>
                <td className="col-model">&nbsp;</td>
                <td className="col-desc">&nbsp;</td>
                <td className="col-qty">&nbsp;</td>
                <td className="col-price">&nbsp;</td>
                <td className="col-amount">&nbsp;</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="purchase-print-table-totals-label">합계</td>
              <td className="col-qty num strong">{totalQty.toLocaleString('ko-KR')}</td>
              <td className="col-price">&nbsp;</td>
              <td className="col-amount num strong">{krw(total)}</td>
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
