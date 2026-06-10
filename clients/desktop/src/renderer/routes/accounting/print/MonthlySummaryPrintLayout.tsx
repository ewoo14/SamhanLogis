/**
 * 월계표 인쇄 전용 레이아웃.
 *
 * 라우트: `/accounting/reports/monthly-summary/print?period=YYYYMM`
 * 용지: A4 portrait (PrintLayout paper="a4-portrait" 재사용)
 *
 * UUID 비공개 가드: period / 계정코드 / 금액 만 표시. UUID 노출 없음.
 *
 * 인쇄에는 계정별 합계 표만 포함 (일별 breakdown 은 2페이지로 이어짐).
 *
 * P0-1 Slice C 가드 준수:
 * - raw hex 0건 — design-system 토큰만
 * - .report-grand-total-row class + @media print 강제 색상
 * - BE record 필드명 1:1 정확 일치
 */
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@samhan/design-system'
import { PrintLayout, krw } from '../../../print/PrintLayout'
import { useCompanyProfile } from '../../../print/useCompanyProfile'
import {
  getMonthlySummary,
  type DailyBreakdownLine,
  type MonthlySummaryResponse,
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


// --------------------------------------------------------------------------
// 인쇄 전용 CSS
// --------------------------------------------------------------------------
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
.ms-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--print-text-sm, 11pt);
  font-variant-numeric: tabular-nums;
}
.ms-table th, .ms-table td {
  padding: 3pt 4pt;
  vertical-align: middle;
}
.ms-table td.amount { text-align: right; white-space: nowrap; }
.ms-table th { text-align: right; }
.ms-table th:first-child, .ms-table th:nth-child(2), .ms-table th:nth-child(3) { text-align: left; }
.ms-page-break { page-break-before: always; }
@media print {
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

export function MonthlySummaryPrintLayout() {
  const [searchParams] = useSearchParams()
  const period = searchParams.get('period') ?? ''
  // W-2 fix: showDailyBreakdown query param (기본 false, 인쇄 시 true 권장)
  const showDailyBreakdown = searchParams.get('showDailyBreakdown') === 'true'

  const query = useQuery<MonthlySummaryResponse>({
    queryKey: ['accounting', 'reports', 'monthly-summary', period],
    queryFn: () => getMonthlySummary(period),
    enabled: Boolean(period),
  })

  return (
    <PrintLayout paper="a4-portrait">
      <style>{PRINT_CSS}</style>
      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spinner size="lg" label="월계표 불러오는 중" />
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
          월계표를 불러오지 못했습니다. (period: {period})
        </div>
      ) : !query.data ? (
        <div style={{ color: 'var(--color-neutral-500)', fontSize: 14 }}>
          조회 중...
        </div>
      ) : (
        <MonthlySummaryPrintBody
          data={query.data}
          period={period}
          showDailyBreakdown={showDailyBreakdown}
        />
      )}
    </PrintLayout>
  )
}

interface BodyProps {
  data: MonthlySummaryResponse
  period: string
  /** W-2 fix: true 시 일별 breakdown 2페이지 출력. 기본 false. */
  showDailyBreakdown?: boolean
}

/** 월계표 인쇄 본문 — 총계 요약 + (옵션) 일별 breakdown 2페이지. */
function MonthlySummaryPrintBody({ data, period, showDailyBreakdown = false }: BodyProps) {
  const { company } = useCompanyProfile()
  // B-3 fix: DailyBreakdownLine `journalDate` 기준 정렬 (구 `date` X)
  const dailySorted = [...data.dailyBreakdown].sort((a, b) =>
    a.journalDate.localeCompare(b.journalDate),
  )

  return (
    <div style={{ fontFamily: 'var(--font-family-sans)', color: 'var(--color-neutral-900)' }}>
      {/* 헤더 */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{company.legalName}</div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 2 }}>
          사업자등록번호: {company.businessRegNo}
        </div>
        <div style={{ fontSize: 'var(--print-text-lg)', fontWeight: 700, marginTop: 8, letterSpacing: '0.2em' }}>
          월 계 표
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 6 }}>
          {data.fromDate} ~ {data.toDate} ({formatPeriodKo(period)})
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', marginTop: 2 }}>
          작성일: {new Date().toLocaleDateString('ko-KR')} &nbsp;&nbsp; (단위: 원) &nbsp;&nbsp; 분개 {data.journalCount}건
        </div>
      </div>

      {/* 균형 불일치 경고 */}
      {!data.balanced ? (
        <div style={{ marginBottom: 8, padding: '4pt 8pt', background: 'var(--state-danger-bg)', border: '1pt solid var(--state-danger)', borderRadius: 3, color: 'var(--state-danger)', fontSize: 'var(--print-text-sm)' }}>
          차변/대변 불일치 — 분개 확인 요망
        </div>
      ) : null}

      {/* 월 총계 요약 표 (1페이지) — B-3 fix: accountSummary 없음 → 총계 행만 */}
      <MonthlySummaryTotalTable
        totalDebit={data.totalDebit}
        totalCredit={data.totalCredit}
        journalCount={data.journalCount}
        balanced={data.balanced}
      />

      {/* W-2: showDailyBreakdown=true 시에만 일별 breakdown 2페이지 포함 */}
      {showDailyBreakdown ? (
        <>
          <div className="ms-page-break" />
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>일별 현황</div>
          <DailyTable items={dailySorted} />
        </>
      ) : null}

      <div style={{ marginTop: 12, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', textAlign: 'right' }}>
        보고서 생성: {new Date().toLocaleString('ko-KR')}
      </div>
    </div>
  )
}

/**
 * 월 총계 요약 표. B-3 fix: BE `MonthlySummaryResponse` 에 accountSummary 없음.
 */
function MonthlySummaryTotalTable({
  totalDebit,
  totalCredit,
  journalCount,
  balanced,
}: {
  totalDebit: string
  totalCredit: string
  journalCount: number
  balanced: boolean
}) {
  return (
    <table className="ms-table">
      <colgroup>
        <col style={{ width: '40%' }} />
        <col style={{ width: '30%' }} />
        <col style={{ width: '30%' }} />
      </colgroup>
      <thead>
        <tr>
          {['구분', '차변 합계', '대변 합계'].map((h, i) => (
            <th
              key={h}
              style={{
                borderTop: '2pt solid var(--color-neutral-900)',
                borderBottom: '1pt solid var(--color-neutral-900)',
                padding: '4pt',
                fontSize: 'var(--print-text-md)',
                fontWeight: 700,
                textAlign: i === 0 ? 'left' : 'right',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr style={{ borderBottom: '0.5pt solid var(--color-neutral-100)' }}>
          <td>당월 합계 ({journalCount}건)</td>
          <td className="amount">{fmtAmount(totalDebit)}</td>
          <td className="amount">{fmtAmount(totalCredit)}</td>
        </tr>
        <tr className="report-grand-total-row" style={{ borderTop: '2pt solid var(--color-neutral-900)' }}>
          <td style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt 4pt' }}>
            균형 여부: {balanced ? '일치' : '불일치'}
          </td>
          <td className="amount" style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt 4pt' }}>{fmtAmount(totalDebit)}</td>
          <td className="amount" style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt 4pt' }}>{fmtAmount(totalCredit)}</td>
        </tr>
      </tbody>
    </table>
  )
}

/** 일별 breakdown 표. B-3 fix: `journalDate`/`debitTotal`/`creditTotal` */
function DailyTable({ items }: { items: DailyBreakdownLine[] }) {
  return (
    <table className="ms-table">
      <colgroup>
        <col style={{ width: '25%' }} />
        <col style={{ width: '15%' }} />
        <col style={{ width: '30%' }} />
        <col style={{ width: '30%' }} />
      </colgroup>
      <thead>
        <tr>
          {['일자', '분개 건수', '차변 합계', '대변 합계'].map((h, i) => (
            <th
              key={h}
              style={{
                borderTop: '2pt solid var(--color-neutral-900)',
                borderBottom: '1pt solid var(--color-neutral-900)',
                padding: '4pt',
                fontSize: 'var(--print-text-md)',
                fontWeight: 700,
                textAlign: i < 2 ? 'left' : 'right',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {/* B-3 fix: `journalDate`/`debitTotal`/`creditTotal` (구 date/totalDebit X) */}
        {items.map((item) => (
          <tr key={item.journalDate} style={{ borderBottom: '0.5pt solid var(--color-neutral-100)' }}>
            <td>{item.journalDate}</td>
            <td>{item.journalCount}건</td>
            <td className="amount">{fmtAmount(item.debitTotal)}</td>
            <td className="amount">{fmtAmount(item.creditTotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
