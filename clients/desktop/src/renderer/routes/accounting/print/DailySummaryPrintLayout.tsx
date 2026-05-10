/**
 * 일계표 인쇄 전용 레이아웃.
 *
 * 라우트: `/accounting/reports/daily-summary/print?date=YYYY-MM-DD`
 * 용지: A4 portrait (PrintLayout paper="a4-portrait" 재사용)
 *
 * UUID 비공개 가드: date / 계정코드 / 금액 만 표시. UUID 노출 없음.
 *
 * P0-1 Slice C 가드 준수:
 * - raw hex 0건 — design-system 토큰만
 * - .report-grand-total-row class + @media print 강제 색상
 * - BE record 필드명 1:1 정확 일치
 */
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@samhan/design-system'
import { PrintLayout, COMPANY, krw } from '../../../print/PrintLayout'
import {
  getDailySummary,
  type AccountSummaryLine,
  type DailySummaryResponse,
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

/**
 * accountCode 사전순 정렬 안전망.
 * B-1 fix (PR #137): AccountSummaryLine 에 sortOrder 없음 → accountCode 기반 정렬.
 */
function sortedAccounts(items: AccountSummaryLine[]): AccountSummaryLine[] {
  return [...items].sort((a, b) => a.accountCode.localeCompare(b.accountCode))
}

/**
 * 잔액 산출 (B-1 fix: balance BE 미제공 → 클라이언트 산출).
 */
function calcBalance(item: AccountSummaryLine): string {
  const debit = Number.parseInt(item.debitTotal, 10) || 0
  const credit = Number.parseInt(item.creditTotal, 10) || 0
  const prefix = item.accountCode.charAt(0)
  const isDebitNature = prefix === '1' || prefix === '5' || prefix === '8'
  return String(isDebitNature ? debit - credit : credit - debit)
}

/**
 * 계정 코드 prefix 1자리 → 한국어 분류명 (BE record 에 category 미제공 → 클라이언트 산출).
 */
function categoryFromCode(code: string): string {
  const prefix = code.charAt(0)
  const map: Record<string, string> = {
    '1': '자산', '2': '부채', '3': '자본',
    '4': '수익', '5': '비용', '8': '판관비', '9': '영업외',
  }
  return map[prefix] ?? '-'
}

// --------------------------------------------------------------------------
// 인쇄 전용 CSS
// --------------------------------------------------------------------------
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
.ds-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--print-text-sm, 11pt);
  font-variant-numeric: tabular-nums;
}
.ds-table th, .ds-table td {
  padding: 3pt 4pt;
  vertical-align: middle;
}
.ds-table td.amount { text-align: right; white-space: nowrap; }
.ds-table th { text-align: right; }
.ds-table th:first-child, .ds-table th:nth-child(2), .ds-table th:nth-child(3) { text-align: left; }
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

export function DailySummaryPrintLayout() {
  const [searchParams] = useSearchParams()
  const date = searchParams.get('date') ?? ''

  const query = useQuery<DailySummaryResponse>({
    queryKey: ['accounting', 'reports', 'daily-summary', date],
    queryFn: () => getDailySummary(date),
    enabled: Boolean(date),
  })

  return (
    <PrintLayout paper="a4-portrait">
      <style>{PRINT_CSS}</style>
      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spinner size="lg" label="일계표 불러오는 중" />
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
          일계표를 불러오지 못했습니다. (date: {date})
        </div>
      ) : !query.data ? (
        <div style={{ color: 'var(--color-neutral-500)', fontSize: 14 }}>
          조회 중...
        </div>
      ) : (
        <DailySummaryPrintBody data={query.data} />
      )}
    </PrintLayout>
  )
}

interface BodyProps {
  data: DailySummaryResponse
}

/** 일계표 인쇄 본문. */
function DailySummaryPrintBody({ data }: BodyProps) {
  // B-1 fix: BE `accountTotals` (구 accountSummary X)
  const sorted = sortedAccounts(data.accountTotals)

  return (
    <div style={{ fontFamily: 'var(--font-family-sans)', color: 'var(--color-neutral-900)' }}>
      {/* 헤더 */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{COMPANY.legalName}</div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 2 }}>
          사업자등록번호: {COMPANY.businessRegNo}
        </div>
        <div style={{ fontSize: 'var(--print-text-lg)', fontWeight: 700, marginTop: 8, letterSpacing: '0.2em' }}>
          일 계 표
        </div>
        {/* B-1 fix: BE `summaryDate` (구 date X) */}
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 6 }}>
          {data.summaryDate}
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

      {/* 본문 표 */}
      <table className="ds-table">
        <colgroup>
          <col style={{ width: '10%' }} />
          <col style={{ width: '28%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead>
          <tr>
            {['코드', '계정과목', '분류', '차변 합계', '대변 합계', '잔액'].map((h, i) => (
              <th
                key={h}
                style={{
                  borderTop: '2pt solid var(--color-neutral-900)',
                  borderBottom: '1pt solid var(--color-neutral-900)',
                  padding: '4pt',
                  fontSize: 'var(--print-text-md)',
                  fontWeight: 700,
                  textAlign: i < 3 ? 'left' : 'right',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const balance = calcBalance(item)
            return (
              <tr key={item.accountCode} style={{ borderBottom: '0.5pt solid var(--color-neutral-100)' }}>
                <td style={{ fontFamily: 'monospace' }}>{item.accountCode}</td>
                <td>{item.accountName}</td>
                {/* B-1 fix: category BE 미제공 → accountCode 기반 분류 산출 */}
                <td style={{ fontSize: 'calc(var(--print-text-sm) - 0.5pt)', color: 'var(--color-neutral-500)' }}>
                  {categoryFromCode(item.accountCode)}
                </td>
                {/* B-1 fix: `debitTotal`/`creditTotal` (구 totalDebit/totalCredit X) */}
                <td className="amount">{fmtAmount(item.debitTotal)}</td>
                <td className="amount">{fmtAmount(item.creditTotal)}</td>
                {/* B-1 fix: balance BE 미제공 → 클라이언트 산출 */}
                <td
                  className="amount"
                  style={{
                    fontWeight: 600,
                    color: Number.parseInt(balance, 10) < 0 ? 'var(--color-danger)' : undefined,
                  }}
                >
                  {fmtAmount(balance)}
                </td>
              </tr>
            )
          })}
          {/* 합계 grand-total */}
          <tr className="report-grand-total-row" style={{ borderTop: '2pt solid var(--color-neutral-900)' }}>
            <td colSpan={3} style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt 4pt' }}>합 계</td>
            <td className="amount" style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt 4pt' }}>{fmtAmount(data.totalDebit)}</td>
            <td className="amount" style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt 4pt' }}>{fmtAmount(data.totalCredit)}</td>
            <td className="amount" style={{ padding: '5pt 4pt' }}>—</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 12, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', textAlign: 'right' }}>
        보고서 생성: {new Date().toLocaleString('ko-KR')}
      </div>
    </div>
  )
}
