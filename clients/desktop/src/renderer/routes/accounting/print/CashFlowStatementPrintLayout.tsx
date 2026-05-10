/**
 * 현금흐름표 인쇄 전용 레이아웃.
 *
 * 라우트: `/accounting/reports/cash-flow/print?period=YYYYMM`
 * 용지: A4 portrait (PrintLayout paper="a4-portrait" 재사용)
 *
 * UUID 비공개 가드: period / 금액 만 표시. UUID 노출 없음.
 *
 * P0-1 Slice C 가드 준수:
 * - raw hex 0건 — design-system 토큰만
 * - .report-total-row / .report-grand-total-row class + @media print 강제 색상
 * - font-size → print token (--print-text-lg / --print-text-sm)
 * - BE record 필드명 1:1 정확 일치
 */
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@samhan/design-system'
import { PrintLayout, COMPANY, krw } from '../../../print/PrintLayout'
import {
  getCashFlowStatement,
  type CashFlowItem,
  type CashFlowStatementResponse,
} from '../../../api/accounting'

// --------------------------------------------------------------------------
// 유틸
// --------------------------------------------------------------------------

/** KRW 정수 string → 괄호 음수 포맷 (인쇄 표준). */
function fmtAmount(raw: string | number): string {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw
  if (!Number.isFinite(n)) return String(raw)
  if (n === 0) return '—'
  const formatted = krw(Math.abs(n))
  return n < 0 ? `(${formatted})` : formatted
}

/** YYYYMM → "2026년 05월" */
function formatPeriodKo(period: string): string {
  if (!period || period.length < 6) return period
  return `${period.slice(0, 4)}년 ${period.slice(4, 6)}월`
}

/** sortOrder 클라이언트 정렬 안전망. */
function sortedItems(items: CashFlowItem[]): CashFlowItem[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder)
}

// --------------------------------------------------------------------------
// 인쇄 전용 CSS
// --------------------------------------------------------------------------
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
.cf-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--print-text-sm, 11pt);
  font-variant-numeric: tabular-nums;
}
.cf-table td {
  padding: 3pt 4pt;
  vertical-align: middle;
}
.cf-table td.amount {
  text-align: right;
  white-space: nowrap;
}
.cf-section-header td {
  font-weight: 600;
  font-size: var(--print-text-md, 12pt);
  padding-top: 6pt;
  color: var(--color-neutral-700);
  border-top: 1pt solid var(--color-neutral-200);
}
.cf-indent td:first-child {
  padding-left: 14pt;
}
.cf-divider td {
  border-top: 1pt solid var(--color-neutral-200);
  padding: 0;
  height: 4pt;
}
@media print {
  .report-total-row {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background-color: var(--color-neutral-100) !important;
  }
  .report-grand-total-row {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background-color: var(--color-neutral-900) !important;
    color: var(--color-neutral-0) !important;
  }
}
`

// --------------------------------------------------------------------------
// 메인 컴포넌트
// --------------------------------------------------------------------------

export function CashFlowStatementPrintLayout() {
  const [searchParams] = useSearchParams()
  const period = searchParams.get('period') ?? ''

  const query = useQuery<CashFlowStatementResponse>({
    queryKey: ['accounting', 'reports', 'cash-flow', period],
    queryFn: () => getCashFlowStatement(period),
    enabled: Boolean(period),
  })

  return (
    <PrintLayout paper="a4-portrait">
      <style>{PRINT_CSS}</style>
      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spinner size="lg" label="현금흐름표 불러오는 중" />
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          style={{
            background: 'var(--state-danger-bg)',
            border: '1px solid var(--state-danger)',
            borderRadius: 4,
            padding: '12px 16px',
            color: 'var(--state-danger)',
            fontSize: 14,
          }}
        >
          현금흐름표를 불러오지 못했습니다. (period: {period})
        </div>
      ) : !query.data ? (
        <div style={{ color: 'var(--color-neutral-500)', fontSize: 14 }}>
          조회 중... (period={period || '미지정'})
        </div>
      ) : (
        <CashFlowPrintBody data={query.data} period={period} />
      )}
    </PrintLayout>
  )
}

interface BodyProps {
  data: CashFlowStatementResponse
  period: string
}

/** 현금흐름표 인쇄 본문. */
function CashFlowPrintBody({ data, period }: BodyProps) {
  const operatingItems: CashFlowItem[] = [
    { label: '당기순이익', amount: data.netIncome, sortOrder: 0 },
    ...data.operatingAdjustments,
  ]

  return (
    <div style={{ fontFamily: 'var(--font-family-sans)', color: 'var(--color-neutral-900)' }}>
      {/* 헤더 */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{COMPANY.legalName}</div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 2 }}>
          사업자등록번호: {COMPANY.businessRegNo}
        </div>
        <div style={{ fontSize: 'var(--print-text-lg)', fontWeight: 700, marginTop: 8, letterSpacing: '0.2em' }}>
          현 금 흐 름 표
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 6 }}>
          {data.fromDate} ~ {data.toDate} ({formatPeriodKo(period)})
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', marginTop: 2 }}>
          작성일: {new Date().toLocaleDateString('ko-KR')} &nbsp;&nbsp; (단위: 원)
        </div>
      </div>

      {/* 불균형 경고 */}
      {!data.cashReconciled ? (
        <div style={{ marginBottom: 10, padding: '5pt 8pt', background: 'var(--state-danger-bg)', border: '1pt solid var(--state-danger)', borderRadius: 3, color: 'var(--state-danger)', fontSize: 'var(--print-text-sm)' }}>
          현금 잔액 불일치 — 기초현금 + 순증감 ≠ 기말현금 (분개 확인 요망)
        </div>
      ) : null}

      {/* 본문 표 */}
      <table className="cf-table">
        <colgroup>
          <col style={{ width: '65%' }} />
          <col style={{ width: '35%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderTop: '2pt solid var(--color-neutral-900)', borderBottom: '1pt solid var(--color-neutral-900)', padding: '4pt', fontSize: 'var(--print-text-md)', fontWeight: 700 }}>
              과 목
            </th>
            <th style={{ textAlign: 'right', borderTop: '2pt solid var(--color-neutral-900)', borderBottom: '1pt solid var(--color-neutral-900)', padding: '4pt', fontSize: 'var(--print-text-md)', fontWeight: 700 }}>
              금 액
            </th>
          </tr>
        </thead>
        <tbody>
          {/* I. 영업활동 */}
          <tr className="cf-section-header"><td colSpan={2}>I. 영업활동 현금흐름</td></tr>
          {sortedItems(operatingItems).map((item, idx) => (
            <tr key={`op-${idx}`} className="cf-indent">
              <td>{item.label}</td>
              <td className="amount" style={{ color: Number.parseInt(item.amount, 10) < 0 ? 'var(--color-danger)' : undefined }}>
                {fmtAmount(item.amount)}
              </td>
            </tr>
          ))}
          <tr className="report-total-row">
            <td style={{ padding: '3pt 4pt', fontWeight: 700 }}>영업활동 합계 (CFO)</td>
            <td className="amount" style={{ fontWeight: 700 }}>{fmtAmount(data.cashFromOperating)}</td>
          </tr>
          <tr className="cf-divider"><td colSpan={2} /></tr>

          {/* II. 투자활동 */}
          <tr className="cf-section-header"><td colSpan={2}>II. 투자활동 현금흐름</td></tr>
          {sortedItems(data.investingActivities).map((item, idx) => (
            <tr key={`inv-${idx}`} className="cf-indent">
              <td>{item.label}</td>
              <td className="amount" style={{ color: Number.parseInt(item.amount, 10) < 0 ? 'var(--color-danger)' : undefined }}>
                {fmtAmount(item.amount)}
              </td>
            </tr>
          ))}
          <tr className="report-total-row">
            <td style={{ padding: '3pt 4pt', fontWeight: 700 }}>투자활동 합계 (CFI)</td>
            <td className="amount" style={{ fontWeight: 700 }}>{fmtAmount(data.cashFromInvesting)}</td>
          </tr>
          <tr className="cf-divider"><td colSpan={2} /></tr>

          {/* III. 재무활동 */}
          <tr className="cf-section-header"><td colSpan={2}>III. 재무활동 현금흐름</td></tr>
          {sortedItems(data.financingActivities).map((item, idx) => (
            <tr key={`fin-${idx}`} className="cf-indent">
              <td>{item.label}</td>
              <td className="amount" style={{ color: Number.parseInt(item.amount, 10) < 0 ? 'var(--color-danger)' : undefined }}>
                {fmtAmount(item.amount)}
              </td>
            </tr>
          ))}
          <tr className="report-total-row">
            <td style={{ padding: '3pt 4pt', fontWeight: 700 }}>재무활동 합계 (CFF)</td>
            <td className="amount" style={{ fontWeight: 700 }}>{fmtAmount(data.cashFromFinancing)}</td>
          </tr>
          <tr className="cf-divider"><td colSpan={2} /></tr>

          {/* 현금 순증감 */}
          <tr className="report-total-row">
            <td style={{ padding: '3pt 4pt', fontWeight: 700 }}>IV. 현금 순증감 (CFO + CFI + CFF)</td>
            <td className="amount" style={{ fontWeight: 700 }}>{fmtAmount(data.netCashFlow)}</td>
          </tr>
          <tr className="cf-divider"><td colSpan={2} /></tr>

          {/* 기초 현금 */}
          <tr>
            <td style={{ padding: '3pt 4pt' }}>V. 기초 현금</td>
            <td className="amount">{fmtAmount(data.beginningCash)}</td>
          </tr>

          {/* 기말 현금 grand-total */}
          <tr className="report-grand-total-row" style={{ borderTop: '2pt solid var(--color-neutral-900)' }}>
            <td style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt 4pt' }}>VI. 기말 현금</td>
            <td className="amount" style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt 4pt' }}>
              {fmtAmount(data.endingCash)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 푸터 */}
      <div style={{ marginTop: 12, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', textAlign: 'center' }}>
        본 보고서는 한국 일반기업회계기준에 따라 작성됨
      </div>
      <div style={{ marginTop: 4, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', textAlign: 'right' }}>
        보고서 생성: {new Date().toLocaleString('ko-KR')}
      </div>
    </div>
  )
}
