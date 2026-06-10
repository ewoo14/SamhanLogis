/**
 * 재무상태표 인쇄 전용 레이아웃 컴포넌트.
 *
 * 라우트: `/accounting/reports/balance-sheet/print?asOfDate=YYYY-MM-DD`
 * 용지: A4 portrait (PrintLayout paper="a4-portrait" 재사용)
 *
 * REPORTS-DESIGN.md § 8 Props spec 완전 준수.
 * `../../print/PrintLayout` 의 `PrintLayout`, `COMPANY`, `krw` 헬퍼 재사용.
 *
 * D5: 인쇄 전용 컴포넌트 분리 (기존 페이지 내 window.print() 대신 새 창 열기).
 * D6: 헤더 font-size → --print-text-lg / --print-text-sm 토큰 사용.
 * D1: 모든 색상 → design-system 토큰.
 * D2: balanced=false 배너 → state-danger-bg / state-danger 토큰.
 * D3/D4: 자산합계 / 부채+자본합계 행 .report-grand-total-row class.
 *
 * UUID 비공개 가드: accountCode / accountName / asOfDate 만 표시. UUID 노출 없음.
 */
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@samhan/design-system'
import {
  PrintLayout,
  krw,
} from '../../../print/PrintLayout'
import { useCompanyProfile } from '../../../print/useCompanyProfile'
import {
  getBalanceSheet,
  type BalanceSheetLine,
  type BalanceSheetResponse,
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

/** F3: 클라이언트 sortOrder 정렬 안전망. */
function sortedLines(lines: BalanceSheetLine[]): BalanceSheetLine[] {
  return [...lines].sort((a, b) => a.sortOrder - b.sortOrder)
}

// --------------------------------------------------------------------------
// 인쇄 전용 CSS
// --------------------------------------------------------------------------
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
.bs-report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--print-text-sm, 11pt);
  font-variant-numeric: tabular-nums;
  table-layout: fixed;
}
.bs-report-table td, .bs-report-table th {
  padding: 2pt 4pt;
  vertical-align: top;
}
.bs-col-header {
  font-weight: 700;
  font-size: var(--print-text-md, 12pt);
  border-bottom: 2pt solid var(--color-neutral-700);
  padding-bottom: 3pt;
  color: var(--color-neutral-800);
}
.bs-indent { padding-left: 14pt !important; }
.bs-amount {
  text-align: right;
  white-space: nowrap;
}
.bs-summary-row td {
  font-weight: 700;
  border-top: 1pt solid var(--color-neutral-400);
  padding-top: 3pt;
  background-color: var(--color-neutral-100);
}
.bs-divider td {
  border-top: 1pt solid var(--color-neutral-200);
  height: 4pt;
  padding: 0;
}
.bs-col-divider {
  width: 1pt;
  background: var(--color-neutral-200);
  padding: 0 !important;
}
@media print {
  .report-total-row td, .bs-summary-row td {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background-color: var(--color-neutral-100) !important;
  }
  .report-grand-total-row td {
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

/**
 * 재무상태표 인쇄 전용 레이아웃.
 *
 * URL query: `asOfDate=YYYY-MM-DD`
 * REPORTS-DESIGN.md § 5 ASCII mockup 기반 — 좌(자산) / 우(부채+자본) 2단.
 */
export function BalanceSheetPrintLayout() {
  const [searchParams] = useSearchParams()
  const asOfDate = searchParams.get('asOfDate') ?? ''

  const query = useQuery<BalanceSheetResponse>({
    queryKey: ['accounting', 'reports', 'balance-sheet', asOfDate],
    queryFn: () => getBalanceSheet(asOfDate),
    enabled: Boolean(asOfDate),
  })

  return (
    <PrintLayout paper="a4-portrait">
      <style>{PRINT_CSS}</style>

      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spinner size="lg" label="재무상태표 불러오는 중" />
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
          재무상태표를 불러오지 못했습니다. (asOfDate: {asOfDate})
        </div>
      ) : !query.data ? (
        <div style={{ color: 'var(--color-neutral-500)', fontSize: 14 }}>
          조회 중... (asOfDate={asOfDate || '미지정'})
        </div>
      ) : (
        <BalanceSheetPrintBody data={query.data} asOfDate={asOfDate} />
      )}
    </PrintLayout>
  )
}

interface BodyProps {
  data: BalanceSheetResponse
  asOfDate: string
}

/** 인쇄 본문 — 헤더 + 2단 표 + 균형여부 + 푸터. */
function BalanceSheetPrintBody({ data, asOfDate }: BodyProps) {
  const { company } = useCompanyProfile()
  const assets = sortedLines(data.assets)
  const liabilities = sortedLines(data.liabilities)
  const equity = sortedLines(data.equity)

  return (
    <div style={{ fontFamily: 'var(--font-family-sans)', color: 'var(--color-neutral-900)' }}>
      {/* 헤더 — D6: font-size → print token */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        {/* D6: 회사명 16pt */}
        <div style={{ fontSize: 16, fontWeight: 600 }}>{company.legalName}</div>
        {/* D6: 사업자번호 var(--print-text-sm) 11pt */}
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 2 }}>
          사업자등록번호: {company.businessRegNo}
        </div>
        {/* D6: 보고서명 var(--print-text-lg) 18pt */}
        <div style={{ fontSize: 'var(--print-text-lg)', fontWeight: 700, marginTop: 8, letterSpacing: '0.2em' }}>
          재 무 상 태 표
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 6 }}>
          기준일: {asOfDate}
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', marginTop: 2 }}>
          작성일: {new Date().toLocaleDateString('ko-KR')} &nbsp;&nbsp; (단위: 원)
        </div>
      </div>

      {/* D2: 불균형 경고 배너 */}
      {!data.balanced ? (
        <div
          role="alert"
          style={{
            background: 'var(--state-danger-bg)',
            border: '1pt solid var(--state-danger)',
            borderRadius: 4,
            padding: '6pt 8pt',
            color: 'var(--state-danger)',
            fontSize: 'var(--print-text-sm)',
            fontWeight: 600,
            marginBottom: 8,
            textAlign: 'center',
          }}
        >
          경고: 자산 ≠ 부채+자본 — 분개 검증 필요
        </div>
      ) : null}

      {/* 본문 표 — 좌(자산) / 우(부채+자본) 2단 */}
      <table
        className="bs-report-table"
        style={{ borderTop: '2pt solid var(--color-neutral-900)' }}
      >
        <colgroup>
          <col style={{ width: '49%' }} />
          <col style={{ width: '2%' }} />
          <col style={{ width: '49%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{
              textAlign: 'center',
              borderBottom: '1pt solid var(--color-neutral-900)',
              padding: '4pt',
              fontSize: 'var(--print-text-md)',
              fontWeight: 700,
            }}>
              자 산
            </th>
            <th className="bs-col-divider" />
            <th style={{
              textAlign: 'center',
              borderBottom: '1pt solid var(--color-neutral-900)',
              padding: '4pt',
              fontSize: 'var(--print-text-md)',
              fontWeight: 700,
            }}>
              부 채 및 자 본
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {/* 좌: 자산 */}
            <td style={{ verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--print-text-sm)', fontVariantNumeric: 'tabular-nums' }}>
                <tbody>
                  {assets.map((line) => (
                    <tr key={line.accountCode}>
                      <td className="bs-indent" style={{ color: 'var(--color-neutral-900)' }}>
                        {line.accountName}
                      </td>
                      <td className="bs-amount" style={{ color: 'var(--color-neutral-900)' }}>
                        {fmtAmount(line.amount)}
                      </td>
                    </tr>
                  ))}
                  {/* 자산 소계 */}
                  <tr className="bs-summary-row">
                    <td style={{ color: 'var(--color-neutral-900)', fontWeight: 700 }}>자산총계 (소계)</td>
                    <td className="bs-amount" style={{ color: 'var(--color-neutral-900)', fontWeight: 700 }}>
                      {fmtAmount(data.totalAssets)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>

            {/* 구분선 */}
            <td className="bs-col-divider" />

            {/* 우: 부채 + 자본 */}
            <td style={{ verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--print-text-sm)', fontVariantNumeric: 'tabular-nums' }}>
                <tbody>
                  {/* 부채 헤더 */}
                  <tr>
                    <td colSpan={2} className="bs-col-header">부채</td>
                  </tr>
                  {liabilities.map((line) => (
                    <tr key={line.accountCode}>
                      <td className="bs-indent" style={{ color: 'var(--color-neutral-900)' }}>
                        {line.accountName}
                      </td>
                      <td className="bs-amount" style={{ color: 'var(--color-neutral-900)' }}>
                        {fmtAmount(line.amount)}
                      </td>
                    </tr>
                  ))}
                  {/* 부채총계 */}
                  <tr className="bs-summary-row">
                    <td style={{ color: 'var(--color-neutral-900)', fontWeight: 700 }}>부채총계</td>
                    <td className="bs-amount" style={{ color: 'var(--color-neutral-900)', fontWeight: 700 }}>
                      {fmtAmount(data.totalLiabilities)}
                    </td>
                  </tr>

                  {/* 자본 헤더 */}
                  <tr><td colSpan={2} style={{ height: '6pt' }} /></tr>
                  <tr>
                    <td colSpan={2} className="bs-col-header">자본</td>
                  </tr>
                  {equity.map((line) => (
                    <tr key={line.accountCode}>
                      <td className="bs-indent" style={{ color: 'var(--color-neutral-900)' }}>
                        {line.accountName}
                      </td>
                      <td className="bs-amount" style={{ color: 'var(--color-neutral-900)' }}>
                        {fmtAmount(line.amount)}
                      </td>
                    </tr>
                  ))}
                  {/* 자본총계 */}
                  <tr className="bs-summary-row">
                    <td style={{ color: 'var(--color-neutral-900)', fontWeight: 700 }}>자본총계</td>
                    <td className="bs-amount" style={{ color: 'var(--color-neutral-900)', fontWeight: 700 }}>
                      {fmtAmount(data.totalEquity)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          {/* D3/D4: 자산합계 / 부채+자본합계 grand-total 행 */}
          <tr
            className="report-grand-total-row"
            style={{ borderTop: '2pt solid var(--color-neutral-900)' }}
          >
            <td style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt 4pt' }}>
              자산 합계 &nbsp; {fmtAmount(data.totalAssets)}
            </td>
            <td className="bs-col-divider" />
            <td style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt 4pt' }}>
              부채+자본 합계 &nbsp; {fmtAmount(data.totalLiabilitiesAndEquity)}
              {/* D2: 균형 여부 */}
              <span style={{
                marginLeft: 8,
                fontSize: 'var(--print-text-sm)',
                color: data.balanced ? 'var(--color-success)' : 'var(--color-danger)',
              }}>
                {data.balanced ? '(균형)' : '(불균형)'}
              </span>
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
