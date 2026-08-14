/**
 * 입고 전표 인쇄 양식 — `/purchases/:id/print/purchase`.
 *
 * SP-08-5-5 P1 신규: legacy GAS 입고 전표 양식 100% 매칭 목표.
 * 2차 iteration — 8컬럼 라인테이블 + 헤더 3열 그리드 + 거래처 2열 그리드 반영
 * (memory `feedback_print_design_iteration.md`).
 *
 * 구성 (A4 portrait 210mm × 297mm, padding 12mm):
 * - 상단 헤더: 좌(회사명) / 중앙("매 입 전 표" 20pt 700) / 우(전표번호/담당자/출력일시) — 3열
 * - 거래처 정보 영역: 좌(거래처명/사업자번호/대표자) + 우(입고창고/담당자/주소) — 2열 그리드
 * - 라인 테이블: No./품목명/규격/수량/단가/공급가액/부가세/적요 (8컬럼)
 * - 라인 테이블 tfoot 합계: 공급가액 / 부가세
 * - 결재란: SLIP_INBOUND 설정 기반 작성자 / 입고자 / 검수자 / 추가단계
 * - 푸터: 비고 / audit (createdBy + modifiedBy + updatedAt)
 *
 * UUID 비공개 가드: `id` 는 path param / QueryKey 전용. 화면 노출 X.
 * 전표번호(slipNo) 만 사용자 노출.
 *
 * 저장된 전표 라인 금액을 우선 사용하며 legacy 금액만 호환 fallback 한다.
 */
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSlip, type SlipDetail } from '../api/slip'
import { listWarehouses, type Warehouse } from '../api/inventory'
import { fetchApprovalLineStructure } from '../api/approvalLineConfigApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { stripSlipNoZeros } from '../utils/orderNo'
import {
  PrintLayout,
  krw,
} from './PrintLayout'
import { nowPrintedAt, fmtDatetime } from './printUtils'
import { useCompanyProfile } from './useCompanyProfile'
import { ApprovalRoleCells, fallbackRoles } from './approvalRoleCells'
import { storedLineAmounts, storedLineUnitPrices } from './printAmounts'

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

  const structureQuery = useQuery({
    queryKey: ['approval-line-structure', 'SLIP_INBOUND'],
    queryFn: () => fetchApprovalLineStructure('SLIP_INBOUND'),
  })

  const displaySlipNo = stripSlipNoZeros(detailQuery.data?.slipNo)
  usePageTitle('입고 전표', displaySlipNo)

  // 훅 규칙(rules-of-hooks): early-return 보다 앞에 위치
  const { company } = useCompanyProfile()

  if (!id) return null
  if (detailQuery.isLoading) return <p>불러오는 중...</p>
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        입고 전표를 불러오지 못했습니다.
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

  const destWarehouseName =
    warehousesQuery.data?.find((w) => w.id === slip.destinationWarehouseId)?.name ?? '-'

  /** 30행 초과 시 분할 인쇄 대비 — 최대 30행 1페이지 */
  const PAGE_LINE_LIMIT = 30
  const lines = slip.lines

  const printedAt = nowPrintedAt()

  return (
    <PrintLayout paper="a4-portrait" backTo={`/purchases/${id}`}>
      <div className="purchase-print-page" data-testid="purchase-print-area">

        {/* 상단 헤더 — 3열 그리드: 좌(회사명) / 중앙(양식 제목) / 우(전표번호/담당자/출력일시) */}
        <header className="purchase-print-header purchase-print-header-3col">
          <div className="purchase-print-header-left">
            <span className="purchase-print-company-name">{company.legalName}</span>
          </div>
          <div className="purchase-print-header-center">
            <h1 className="purchase-print-title">매 입 전 표</h1>
          </div>
          <div className="purchase-print-header-right">
            <div className="purchase-print-header-meta-row">
              <span className="purchase-print-meta-label">전표번호</span>
              <span className="purchase-print-meta-value strong">{displaySlipNo}</span>
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
              const { supply: lineSupply, vat: lineVat } = storedLineAmounts(l)
              /** 저장된 S/V/T를 우선 사용하고 legacy 라인만 호환 fallback 한다. */
              /** 단가 열은 공급가액 열과 같은 VAT 제외 도메인 — 단가 x 수량 = 공급가액 (#937 재수렴 4차). */
              const lineUnitPrice = storedLineUnitPrices(l).supplyUnit
              return (
                <tr key={l.id}>
                  <td className="col-no">{idx + 1}</td>
                  <td className="col-product">{l.modelName ?? l.productName ?? '-'}</td>
                  <td className="col-spec">{l.specification ?? '-'}</td>
                  <td className="col-qty num">{l.quantity.toLocaleString('ko-KR')}</td>
                  <td className="col-price num">{krw(lineUnitPrice)}</td>
                  <td className="col-supply num">{krw(lineSupply)}</td>
                  <td className="col-vat num">{krw(lineVat)}</td>
                  <td className="col-memo">{l.note ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="purchase-print-table-totals-label">합계</td>
              <td className="col-supply num strong">{krw(totals.supply)}</td>
              <td className="col-vat num strong">{krw(totals.vat)}</td>
              <td className="col-memo">&nbsp;</td>
            </tr>
          </tfoot>
        </table>

        {/* 결재란 — SLIP_INBOUND 설정 구조 기반. 단계 수(N)에 맞춰 그리드 열 고정(auto-fit 줄바꿈 붕괴 방지, DispatchView 패턴). */}
        <section
          className="purchase-print-approval"
          style={{
            gridTemplateColumns: `repeat(${(structureQuery.data ?? fallbackRoles('INBOUND')).length}, 1fr)`,
          }}
        >
          <div className="purchase-print-approval-title">결 재 란</div>
          <ApprovalRoleCells
            slip={slip}
            roles={structureQuery.data ?? null}
            slipType="INBOUND"
          />
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
