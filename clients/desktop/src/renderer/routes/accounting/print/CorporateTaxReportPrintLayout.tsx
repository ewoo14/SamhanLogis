/**
 * 법인세 신고서 인쇄 전용 레이아웃 컴포넌트.
 *
 * 라우트: `/accounting/reports/corporate-tax/print?fiscalYear=YYYY`
 * 용지: A4 portrait (PrintLayout paper="a4-portrait" 재사용)
 *
 * REPORTS-DESIGN.md § 7 Props spec 준수.
 *
 * UUID 비공개 가드: fiscalYear / 금액 만 표시. UUID 노출 없음.
 *
 * PR #134 회고:
 * - D1: raw hex 0건 — design-system 토큰만
 * - D3/D4: .report-total-row / .report-grand-total-row class + @media print 강제 색상
 * - D6: font-size → print token
 */
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@samhan/design-system'
import {
  PrintLayout,
  COMPANY,
  krw,
} from '../../../print/PrintLayout'
import { getCorporateTaxReport, type CorporateTaxReportResponse } from '../../../api/accounting'

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

/** 법인세 단계별 세율 적용 — 한국 법인세법 제55조 (2024년 기준). */
function calcTaxBrackets(taxableIncome: number): Array<{
  label: string
  taxAmount: number
}> {
  const brackets = [
    { limit: 200_000_000, rate: 0.09, label: '2억 이하 9%' },
    { limit: 20_000_000_000, rate: 0.19, label: '200억 이하 19%' },
    { limit: 300_000_000_000, rate: 0.21, label: '3,000억 이하 21%' },
    { limit: Number.POSITIVE_INFINITY, rate: 0.24, label: '3,000억 초과 24%' },
  ]
  let remaining = taxableIncome
  let prevLimit = 0
  const result: Array<{ label: string; taxAmount: number }> = []
  for (const bracket of brackets) {
    if (remaining <= 0) break
    const base = Math.min(remaining, bracket.limit - prevLimit)
    const tax = Math.round(base * bracket.rate)
    if (base > 0) result.push({ label: bracket.label, taxAmount: tax })
    remaining -= base
    prevLimit = bracket.limit
  }
  return result
}

// --------------------------------------------------------------------------
// 인쇄 전용 CSS
// --------------------------------------------------------------------------
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
.ct-report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--print-text-sm, 11pt);
  font-variant-numeric: tabular-nums;
}
.ct-report-table td {
  padding: 3pt 4pt;
  vertical-align: middle;
}
.ct-report-table td.amount {
  text-align: right;
  white-space: nowrap;
}
.ct-section-header td {
  font-weight: 600;
  font-size: var(--print-text-md, 12pt);
  padding-top: 6pt;
  padding-bottom: 2pt;
  color: var(--color-neutral-700);
  border-top: 1pt solid var(--color-neutral-200);
}
.ct-indent td:first-child {
  padding-left: 16pt;
}
.ct-divider td {
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

interface CtPrintRowProps {
  label: string
  value: string | number
  indent?: boolean
  className?: string
}

function CtPrintRow({ label, value, indent = false, className }: CtPrintRowProps) {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value
  const isNeg = Number.isFinite(n) && n < 0
  return (
    <tr className={`${indent ? 'ct-indent' : ''} ${className ?? ''}`.trim()}>
      <td style={{ color: 'var(--color-neutral-900)' }}>{label}</td>
      <td
        className="amount"
        style={{ color: isNeg ? 'var(--color-danger)' : 'var(--color-neutral-900)' }}
      >
        {fmtAmount(typeof value === 'number' ? String(value) : value)}
      </td>
    </tr>
  )
}

// --------------------------------------------------------------------------
// 메인 컴포넌트
// --------------------------------------------------------------------------

export function CorporateTaxReportPrintLayout() {
  const [searchParams] = useSearchParams()
  const fiscalYearStr = searchParams.get('fiscalYear') ?? ''
  const fiscalYear = Number.parseInt(fiscalYearStr, 10)

  const query = useQuery<CorporateTaxReportResponse>({
    queryKey: ['accounting', 'reports', 'corporate-tax', fiscalYear],
    queryFn: () => getCorporateTaxReport(fiscalYear),
    enabled: Boolean(fiscalYear),
  })

  return (
    <PrintLayout paper="a4-portrait">
      <style>{PRINT_CSS}</style>

      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spinner size="lg" label="법인세 신고서 불러오는 중" />
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
          법인세 신고서를 불러오지 못했습니다. (fiscalYear: {fiscalYearStr})
        </div>
      ) : !query.data ? (
        <div style={{ color: 'var(--color-neutral-500)', fontSize: 14 }}>
          조회 중... (fiscalYear={fiscalYearStr || '미지정'})
        </div>
      ) : (
        <CorporateTaxPrintBody data={query.data} />
      )}
    </PrintLayout>
  )
}

interface BodyProps {
  data: CorporateTaxReportResponse
}

/** 법인세 신고서 인쇄 본문. */
function CorporateTaxPrintBody({ data }: BodyProps) {
  const taxPayableN = Number.parseInt(data.taxPayable, 10)
  const isRefund = Number.isFinite(taxPayableN) && taxPayableN < 0
  const taxBrackets = calcTaxBrackets(Number.parseInt(data.taxableIncome, 10))

  return (
    <div style={{ fontFamily: 'var(--font-family-sans)', color: 'var(--color-neutral-900)' }}>
      {/* 헤더 */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{COMPANY.legalName}</div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 2 }}>
          사업자등록번호: {COMPANY.businessRegNo}
        </div>
        <div style={{ fontSize: 'var(--print-text-lg)', fontWeight: 700, marginTop: 8, letterSpacing: '0.2em' }}>
          법 인 세 신 고 서
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 6 }}>
          사업연도: {data.fiscalYear}년 (1월 1일 ~ 12월 31일)
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', marginTop: 2 }}>
          작성일: {new Date().toLocaleDateString('ko-KR')} &nbsp;&nbsp; (단위: 원)
        </div>
      </div>

      {/* 본문 표 */}
      <table className="ct-report-table">
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
              항 목
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
          {/* 손익 및 조정 */}
          <CtPrintRow label="법인세차감전순이익" value={data.incomeBeforeTax} />
          <CtPrintRow label="+ 가산조정" value={data.addedDeductions} indent />
          <CtPrintRow label="- 차감조정" value={`-${data.subtractedDeductions}`} indent />
          <tr className="ct-divider"><td colSpan={2} /></tr>

          {/* 과세표준 */}
          <CtPrintRow
            label="과세표준"
            value={data.taxableIncome}
            className="report-total-row"
          />
          <tr className="ct-divider"><td colSpan={2} /></tr>

          {/* 단계별 세율 — D2 .tax-rate-box (REPORTS-B-DESIGN §7) */}
          <tr>
            <td colSpan={2} style={{ padding: 0 }}>
              <div className="tax-rate-box">
                <div style={{
                  fontWeight: 600,
                  fontSize: 'var(--print-text-md, 12pt)',
                  color: 'var(--color-neutral-700)',
                  paddingBottom: '2pt',
                }}>
                  세율 적용 (단계별 — 법인세법 제55조)
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--print-text-sm, 11pt)' }}>
                  <tbody>
                    {taxBrackets.map((b) => (
                      <tr key={b.label}>
                        <td style={{ paddingLeft: 16, color: 'var(--color-neutral-900)' }}>{b.label}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{b.taxAmount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
          <tr className="ct-divider"><td colSpan={2} /></tr>

          {/* 산출세액 */}
          <CtPrintRow
            label="산출세액"
            value={data.calculatedTax}
            className="report-total-row"
          />
          <CtPrintRow label="- 기납부세액 (중간예납)" value={`-${data.taxAlreadyPaid}`} indent />
          <tr className="ct-divider"><td colSpan={2} /></tr>

          {/* 차감납부세액 grand-total */}
          <tr
            className="report-grand-total-row"
            style={{ borderTop: '2pt solid var(--color-neutral-900)' }}
          >
            <td style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '6pt 4pt' }}>
              {isRefund ? '환급세액' : '차감납부세액'}
            </td>
            <td
              className="amount"
              style={{
                fontWeight: 700,
                fontSize: 'var(--print-text-md)',
                padding: '6pt 4pt',
                color: isRefund ? 'var(--color-danger)' : undefined,
              }}
            >
              {fmtAmount(data.taxPayable)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 신고 기한 — D1 .deadline-banner (REPORTS-B-DESIGN §2-3) */}
      <div className="deadline-banner" style={{ marginTop: 12, fontSize: 'var(--print-text-sm)' }}>
        신고 기한: <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{data.filingDeadline}</strong>
        &nbsp;(12월 결산 법인 기준)
      </div>

      {/* 푸터 */}
      <div style={{ marginTop: 12, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', textAlign: 'center' }}>
        본 보고서는 법인세법에 따라 작성됨
      </div>
      <div style={{ marginTop: 4, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', textAlign: 'right' }}>
        보고서 생성: {new Date(data.generatedAt).toLocaleString('ko-KR')}
      </div>
    </div>
  )
}
