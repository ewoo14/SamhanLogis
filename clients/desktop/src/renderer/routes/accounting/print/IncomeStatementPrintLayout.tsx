/**
 * 손익계산서 인쇄 전용 레이아웃 컴포넌트.
 *
 * 라우트: `/accounting/reports/income-statement/print?period=YYYYMM`
 * 용지: A4 portrait (PrintLayout paper="a4-portrait" 재사용)
 *
 * REPORTS-DESIGN.md § 7 Props spec 완전 준수.
 * `../../print/PrintLayout` 의 `PrintLayout`, `COMPANY`, `krw` 헬퍼 재사용.
 *
 * D5: 인쇄 전용 컴포넌트 분리 (기존 페이지 내 window.print() 대신 새 창 열기).
 * D6: 헤더 font-size → --print-text-lg / --print-text-sm 토큰 사용.
 * D1: 모든 색상 → design-system 토큰.
 * D3/D4: 당기순이익 grand-total 행 .report-grand-total-row class.
 *
 * UUID 비공개 가드: accountCode / accountName / period 만 표시. UUID 노출 없음.
 */
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@samhan/design-system'
import {
  PrintLayout,
  COMPANY,
  krw,
} from '../../../print/PrintLayout'
import {
  getIncomeStatement,
  type FinancialStatementLine,
  type IncomeStatementResponse,
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

/** YYYYMM → "2026년 04월" */
function formatPeriodKo(period: string): string {
  if (!period || period.length < 6) return period
  const year = period.slice(0, 4)
  const month = period.slice(4, 6)
  return `${year}년 ${month}월`
}

/** F3: 클라이언트 sortOrder 정렬 안전망. */
function sortedLines(lines: FinancialStatementLine[]): FinancialStatementLine[] {
  return [...lines].sort((a, b) => a.sortOrder - b.sortOrder)
}

// --------------------------------------------------------------------------
// 인쇄 전용 CSS
// --------------------------------------------------------------------------
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
.is-report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--print-text-sm, 11pt);
  font-variant-numeric: tabular-nums;
}
.is-report-table td {
  padding: 2pt 4pt;
  vertical-align: middle;
}
.is-report-table td.amount {
  text-align: right;
  white-space: nowrap;
}
.is-category-header td {
  font-weight: 600;
  font-size: var(--print-text-md, 12pt);
  padding-top: 6pt;
  padding-bottom: 2pt;
  color: var(--color-neutral-700);
  border-top: 1pt solid var(--color-neutral-200);
}
.is-indent td:first-child {
  padding-left: 16pt;
}
.is-divider td {
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
// 서브 컴포넌트
// --------------------------------------------------------------------------

interface PrintRowProps {
  label: string
  amount: string
  indent?: boolean
  className?: string
}

function PrintRow({ label, amount, indent = false, className }: PrintRowProps) {
  const n = Number.parseInt(amount, 10)
  const isNeg = Number.isFinite(n) && n < 0
  return (
    <tr className={`${indent ? 'is-indent' : ''} ${className ?? ''}`.trim()}>
      <td style={{ color: 'var(--color-neutral-900)' }}>{label}</td>
      <td className="amount" style={{ color: isNeg ? 'var(--color-danger)' : 'var(--color-neutral-900)' }}>
        {fmtAmount(amount)}
      </td>
    </tr>
  )
}

interface PrintSectionProps {
  romanNo: string
  title: string
  lines: FinancialStatementLine[]
  summaryLabel: string
  summaryAmount: string
}

function PrintSection({ romanNo, title, lines, summaryLabel, summaryAmount }: PrintSectionProps) {
  if (lines.length === 0) return null
  return (
    <>
      <tr className="is-category-header">
        <td colSpan={2}>{romanNo}. {title}</td>
      </tr>
      {lines.map((line) => (
        <PrintRow
          key={line.accountCode}
          label={line.accountName}
          amount={line.amount}
          indent
        />
      ))}
      {/* D4: 합계 행 .report-total-row */}
      <PrintRow label={summaryLabel} amount={summaryAmount} className="report-total-row" />
      <tr className="is-divider"><td colSpan={2} /></tr>
    </>
  )
}

// --------------------------------------------------------------------------
// 메인 컴포넌트
// --------------------------------------------------------------------------

/**
 * 손익계산서 인쇄 전용 레이아웃.
 *
 * URL query: `period=YYYYMM`
 * REPORTS-DESIGN.md § 4 ASCII mockup 기반 — 1단 세로 나열.
 */
export function IncomeStatementPrintLayout() {
  const [searchParams] = useSearchParams()
  const period = searchParams.get('period') ?? ''

  const query = useQuery<IncomeStatementResponse>({
    queryKey: ['accounting', 'reports', 'income-statement', period],
    queryFn: () => getIncomeStatement(period),
    enabled: Boolean(period),
  })

  return (
    <PrintLayout paper="a4-portrait">
      <style>{PRINT_CSS}</style>

      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spinner size="lg" label="손익계산서 불러오는 중" />
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
          손익계산서를 불러오지 못했습니다. (period: {period})
        </div>
      ) : !query.data ? (
        <div style={{ color: 'var(--color-neutral-500)', fontSize: 14 }}>
          조회 중... (period={period || '미지정'})
        </div>
      ) : (
        <IncomeStatementPrintBody data={query.data} period={period} />
      )}
    </PrintLayout>
  )
}

interface BodyProps {
  data: IncomeStatementResponse
  period: string
}

/** 인쇄 본문 — 헤더 + 표 + 푸터. */
function IncomeStatementPrintBody({ data, period }: BodyProps) {
  const netN = Number.parseInt(data.netIncome, 10)
  const isNetNeg = Number.isFinite(netN) && netN < 0

  return (
    <div style={{ fontFamily: 'var(--font-family-sans)', color: 'var(--color-neutral-900)' }}>
      {/* 헤더 — D6: font-size → print token */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        {/* D6: 회사명 16pt */}
        <div style={{ fontSize: 16, fontWeight: 600 }}>{COMPANY.legalName}</div>
        {/* D6: 사업자번호 var(--print-text-sm) 11pt */}
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 2 }}>
          사업자등록번호: {COMPANY.businessRegNo}
        </div>
        {/* D6: 보고서명 var(--print-text-lg) 18pt */}
        <div style={{ fontSize: 'var(--print-text-lg)', fontWeight: 700, marginTop: 8, letterSpacing: '0.2em' }}>
          손 익 계 산 서
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 6 }}>
          기간: {data.fromDate} ~ {data.toDate} ({formatPeriodKo(period)})
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', marginTop: 2 }}>
          작성일: {new Date().toLocaleDateString('ko-KR')} &nbsp;&nbsp; (단위: 원)
        </div>
      </div>

      {/* 본문 표 */}
      <table className="is-report-table">
        <colgroup>
          <col style={{ width: '60%' }} />
          <col style={{ width: '40%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{
              textAlign: 'left',
              borderTop: '2pt solid var(--color-neutral-900)',
              borderBottom: '1pt solid var(--color-neutral-900)',
              padding: '4pt 4pt',
              fontSize: 'var(--print-text-md)',
              fontWeight: 700,
            }}>
              과 목
            </th>
            <th style={{
              textAlign: 'right',
              borderTop: '2pt solid var(--color-neutral-900)',
              borderBottom: '1pt solid var(--color-neutral-900)',
              padding: '4pt 4pt',
              fontSize: 'var(--print-text-md)',
              fontWeight: 700,
            }}>
              금 액
            </th>
          </tr>
        </thead>
        <tbody>
          {/* I. 매출액 */}
          <PrintSection
            romanNo="I"
            title="매출액"
            lines={sortedLines(data.revenue)}
            summaryLabel="매출액 합계"
            summaryAmount={data.revenue.reduce((s: number, l: FinancialStatementLine) => s + Number.parseInt(l.amount, 10), 0).toString()}
          />

          {/* II. 매출원가 */}
          <PrintSection
            romanNo="II"
            title="매출원가"
            lines={sortedLines(data.costOfSales)}
            summaryLabel="매출원가 합계"
            summaryAmount={data.costOfSales.reduce((s: number, l: FinancialStatementLine) => s + Number.parseInt(l.amount, 10), 0).toString()}
          />

          {/* III. 매출총이익 */}
          <tr className="report-total-row">
            <td style={{ color: 'var(--color-neutral-900)', padding: '3pt 4pt', fontWeight: 700 }}>III. 매출총이익</td>
            <td className="amount" style={{ color: 'var(--color-neutral-900)', padding: '3pt 4pt', fontWeight: 700 }}>
              {fmtAmount(data.grossProfit)}
            </td>
          </tr>
          <tr className="is-divider"><td colSpan={2} /></tr>

          {/* IV. 판매비와관리비 */}
          <PrintSection
            romanNo="IV"
            title="판매비와관리비"
            lines={sortedLines(data.sga)}
            summaryLabel="판관비 합계"
            summaryAmount={data.sga.reduce((s: number, l: FinancialStatementLine) => s + Number.parseInt(l.amount, 10), 0).toString()}
          />

          {/* V. 영업이익 */}
          <tr className="report-total-row">
            <td style={{ color: 'var(--color-neutral-900)', padding: '3pt 4pt', fontWeight: 700 }}>V. 영업이익</td>
            <td className="amount" style={{ color: 'var(--color-neutral-900)', padding: '3pt 4pt', fontWeight: 700 }}>
              {fmtAmount(data.operatingProfit)}
            </td>
          </tr>
          <tr className="is-divider"><td colSpan={2} /></tr>

          {/* VI. 영업외손익 */}
          {sortedLines(data.nonOperating).length > 0 ? (
            <>
              <tr className="is-category-header">
                <td colSpan={2}>VI. 영업외손익</td>
              </tr>
              {sortedLines(data.nonOperating).map((line) => (
                <PrintRow
                  key={line.accountCode}
                  label={line.accountName}
                  amount={line.amount}
                  indent
                />
              ))}
              <tr className="is-divider"><td colSpan={2} /></tr>
            </>
          ) : null}

          {/* VII. 법인세비용차감전순이익 */}
          <tr className="report-total-row">
            <td style={{ color: 'var(--color-neutral-900)', padding: '3pt 4pt', fontWeight: 700 }}>
              VII. 법인세비용차감전순이익
            </td>
            <td className="amount" style={{ color: 'var(--color-neutral-900)', padding: '3pt 4pt', fontWeight: 700 }}>
              {fmtAmount(data.incomeBeforeTax)}
            </td>
          </tr>
          <tr className="is-divider"><td colSpan={2} /></tr>

          {/* VIII. 법인세비용 */}
          <PrintRow label="VIII. 법인세비용" amount={data.incomeTax} />
          <tr className="is-divider"><td colSpan={2} /></tr>

          {/* IX. 당기순이익 — D3/D4: .report-grand-total-row */}
          <tr
            className="report-grand-total-row"
            style={{
              borderTop: '2pt solid var(--color-neutral-900)',
            }}
          >
            <td style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '6pt 4pt' }}>
              IX. 당기순이익
            </td>
            <td
              className="amount"
              style={{
                fontWeight: 700,
                fontSize: 'var(--print-text-md)',
                padding: '6pt 4pt',
                color: isNetNeg ? 'var(--color-danger)' : undefined,
              }}
            >
              {fmtAmount(data.netIncome)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 푸터 */}
      <div style={{ marginTop: 16, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', textAlign: 'center' }}>
        본 보고서는 한국 일반기업회계기준(K-GAAP)에 따라 작성됨
      </div>
      <div style={{ marginTop: 4, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', textAlign: 'right' }}>
        보고서 생성: {new Date(data.generatedAt).toLocaleString('ko-KR')}
      </div>
    </div>
  )
}
