/**
 * 자본변동표 인쇄 전용 레이아웃.
 *
 * 라우트: `/accounting/reports/equity-changes/print?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`
 * 용지: A4 portrait (PrintLayout paper="a4-portrait" 재사용)
 *
 * UUID 비공개 가드: 기간 / 금액 만 표시. UUID 노출 없음.
 *
 * P0-1 Slice C 가드 준수:
 * - raw hex 0건 — design-system 토큰만
 * - .report-total-row / .report-grand-total-row class + @media print 강제 색상
 * - BE record 필드명 1:1 정확 일치
 */
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@samhan/design-system'
import { PrintLayout, COMPANY, krw } from '../../../print/PrintLayout'
import {
  getEquityChanges,
  type EquityChangesResponse,
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

// --------------------------------------------------------------------------
// 인쇄 전용 CSS
// --------------------------------------------------------------------------
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
.eq-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--print-text-sm, 11pt);
  font-variant-numeric: tabular-nums;
}
.eq-table th, .eq-table td {
  padding: 3pt 5pt;
  vertical-align: middle;
}
.eq-table td.amount {
  text-align: right;
  white-space: nowrap;
}
.eq-table th {
  text-align: right;
}
.eq-table th:first-child, .eq-table td:first-child {
  text-align: left;
}
.eq-indent td:first-child {
  padding-left: 14pt;
  font-size: calc(var(--print-text-sm, 11pt) - 0.5pt);
  color: var(--color-neutral-700);
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

export function EquityChangesPrintLayout() {
  const [searchParams] = useSearchParams()
  const fromDate = searchParams.get('fromDate') ?? ''
  const toDate = searchParams.get('toDate') ?? ''

  const query = useQuery<EquityChangesResponse>({
    queryKey: ['accounting', 'reports', 'equity-changes', fromDate, toDate],
    queryFn: () => getEquityChanges(fromDate, toDate),
    enabled: Boolean(fromDate) && Boolean(toDate),
  })

  return (
    <PrintLayout paper="a4-portrait">
      <style>{PRINT_CSS}</style>
      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spinner size="lg" label="자본변동표 불러오는 중" />
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
          자본변동표를 불러오지 못했습니다.
        </div>
      ) : !query.data ? (
        <div style={{ color: 'var(--color-neutral-500)', fontSize: 14 }}>
          조회 중...
        </div>
      ) : (
        <EquityChangesPrintBody data={query.data} />
      )}
    </PrintLayout>
  )
}

interface BodyProps {
  data: EquityChangesResponse
}

/** 자본변동표 인쇄 본문. */
function EquityChangesPrintBody({ data }: BodyProps) {
  const totalBeginning = String(
    Number.parseInt(data.beginningCapitalStock, 10) +
    Number.parseInt(data.beginningRetainedEarnings, 10),
  )
  const totalEnding = String(
    Number.parseInt(data.endingCapitalStock, 10) +
    Number.parseInt(data.endingRetainedEarnings, 10),
  )

  return (
    <div style={{ fontFamily: 'var(--font-family-sans)', color: 'var(--color-neutral-900)' }}>
      {/* 헤더 */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{COMPANY.legalName}</div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 2 }}>
          사업자등록번호: {COMPANY.businessRegNo}
        </div>
        <div style={{ fontSize: 'var(--print-text-lg)', fontWeight: 700, marginTop: 8, letterSpacing: '0.2em' }}>
          자 본 변 동 표
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 6 }}>
          {data.fromDate} ~ {data.toDate}
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', marginTop: 2 }}>
          작성일: {new Date().toLocaleDateString('ko-KR')} &nbsp;&nbsp; (단위: 원)
        </div>
      </div>

      {/* 본문 표 */}
      <table className="eq-table">
        <colgroup>
          <col style={{ width: '28%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '24%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ borderTop: '2pt solid var(--color-neutral-900)', borderBottom: '1pt solid var(--color-neutral-900)', padding: '4pt', fontSize: 'var(--print-text-md)', fontWeight: 700, textAlign: 'left' }}>
              구 분
            </th>
            <th style={{ borderTop: '2pt solid var(--color-neutral-900)', borderBottom: '1pt solid var(--color-neutral-900)', padding: '4pt', fontSize: 'var(--print-text-md)', fontWeight: 700 }}>
              자본금
            </th>
            <th style={{ borderTop: '2pt solid var(--color-neutral-900)', borderBottom: '1pt solid var(--color-neutral-900)', padding: '4pt', fontSize: 'var(--print-text-md)', fontWeight: 700 }}>
              이익잉여금
            </th>
            <th style={{ borderTop: '2pt solid var(--color-neutral-900)', borderBottom: '1pt solid var(--color-neutral-900)', padding: '4pt', fontSize: 'var(--print-text-md)', fontWeight: 700 }}>
              자본 총계
            </th>
          </tr>
        </thead>
        <tbody>
          {/* 기초 잔액 */}
          <tr className="report-total-row">
            <td style={{ fontWeight: 700 }}>기초 잔액</td>
            <td className="amount" style={{ fontWeight: 700 }}>{fmtAmount(data.beginningCapitalStock)}</td>
            <td className="amount" style={{ fontWeight: 700 }}>{fmtAmount(data.beginningRetainedEarnings)}</td>
            <td className="amount" style={{ fontWeight: 700 }}>{fmtAmount(totalBeginning)}</td>
          </tr>
          {/* 증자 */}
          <tr className="eq-indent">
            <td>증자 (유상/무상)</td>
            <td className="amount">{fmtAmount(data.capitalStockIncrease)}</td>
            <td className="amount" style={{ color: 'var(--color-neutral-400)' }}>—</td>
            <td className="amount">{fmtAmount(data.capitalStockIncrease)}</td>
          </tr>
          {/* 감자 */}
          <tr className="eq-indent">
            <td>감자</td>
            <td className="amount" style={{ color: 'var(--color-danger)' }}>{fmtAmount(data.capitalStockDecrease)}</td>
            <td className="amount" style={{ color: 'var(--color-neutral-400)' }}>—</td>
            <td className="amount" style={{ color: 'var(--color-danger)' }}>{fmtAmount(data.capitalStockDecrease)}</td>
          </tr>
          {/* 당기순이익 */}
          <tr className="eq-indent">
            <td>당기순이익</td>
            <td className="amount" style={{ color: 'var(--color-neutral-400)' }}>—</td>
            <td className="amount">{fmtAmount(data.netIncome)}</td>
            <td className="amount">{fmtAmount(data.netIncome)}</td>
          </tr>
          {/* 배당금 */}
          <tr className="eq-indent">
            <td>배당금 지급</td>
            <td className="amount" style={{ color: 'var(--color-neutral-400)' }}>—</td>
            <td className="amount" style={{ color: 'var(--color-danger)' }}>{fmtAmount(data.dividends)}</td>
            <td className="amount" style={{ color: 'var(--color-danger)' }}>{fmtAmount(data.dividends)}</td>
          </tr>
          {/* 기말 잔액 grand-total */}
          <tr className="report-grand-total-row" style={{ borderTop: '2pt solid var(--color-neutral-900)' }}>
            <td style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt' }}>기말 잔액</td>
            <td className="amount" style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt' }}>{fmtAmount(data.endingCapitalStock)}</td>
            <td className="amount" style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt' }}>{fmtAmount(data.endingRetainedEarnings)}</td>
            <td className="amount" style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt' }}>{fmtAmount(totalEnding)}</td>
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
