/**
 * 거래처별 미수/미지급 인쇄 전용 레이아웃 컴포넌트.
 *
 * 라우트: `/accounting/reports/partner-aging/print?asOfDate=YYYY-MM-DD&type=RECEIVABLE|PAYABLE`
 * 용지: A4 portrait (PrintLayout paper="a4-portrait" 재사용)
 *
 * UUID 비공개 가드:
 * - `partnerId` 필드 화면 노출 금지 (feedback_uuid_no_user_visibility).
 * - 표에는 `partnerCode` / `partnerName` 만 표시.
 *
 * PR #134 회고:
 * - D1: raw hex 0건 — design-system 토큰만
 * - D3/D4: .report-total-row / .report-grand-total-row + @media print 강제 색상
 * - D6: font-size → print token
 * - 클라이언트 sortOrder 안전망 (agingDays 내림차순)
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
  getPartnerAging,
  type PartnerAgingResponse,
  type PartnerAgingLine,
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
 * 클라이언트 정렬 안전망 — agingDays 내림차순 (연체 심각 순).
 */
function sortedLines(lines: PartnerAgingLine[]): PartnerAgingLine[] {
  return [...lines].sort((a, b) => b.agingDays - a.agingDays)
}

/**
 * 연체일수 → 행 배경 CSS 클래스 (D3 — REPORTS-B-DESIGN §2-2 / §8).
 * 경계값: >= 60 위험(danger), >= 30 주의(warning).
 * 60일 정확히는 위험 구간.
 */
function agingClass(agingDays: number): string {
  if (agingDays >= 60) return 'aging-overdue-danger'
  if (agingDays >= 30) return 'aging-overdue-warning'
  return ''
}

// --------------------------------------------------------------------------
// 인쇄 전용 CSS
// --------------------------------------------------------------------------
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
.aging-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--print-text-sm, 11pt);
  font-variant-numeric: tabular-nums;
}
.aging-table th, .aging-table td {
  padding: 3pt 4pt;
  vertical-align: middle;
}
.aging-table th {
  text-align: left;
  border-top: 2pt solid var(--color-neutral-900);
  border-bottom: 1pt solid var(--color-neutral-900);
  font-size: var(--print-text-md, 12pt);
  font-weight: 700;
}
.aging-table th.amount-col {
  text-align: right;
}
.aging-table th.center-col {
  text-align: center;
}
.aging-table td.amount {
  text-align: right;
  white-space: nowrap;
}
.aging-table td.center {
  text-align: center;
}
.aging-row-even {
  background-color: var(--color-neutral-50);
}
.aging-badge-danger {
  color: var(--color-danger);
  font-weight: 700;
}
.aging-badge-warning {
  color: var(--color-warning);
  font-weight: 700;
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
  .aging-row-even {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background-color: var(--color-neutral-50) !important;
  }
  .aging-overdue-warning {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background-color: var(--state-warning-bg) !important;
    color: var(--state-warning) !important;
  }
  .aging-overdue-danger {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background-color: var(--state-danger-bg) !important;
    color: var(--state-danger) !important;
  }
}
`

// --------------------------------------------------------------------------
// 메인 컴포넌트
// --------------------------------------------------------------------------

export function PartnerAgingPrintLayout() {
  const [searchParams] = useSearchParams()
  const asOfDate = searchParams.get('asOfDate') ?? ''
  const typeParam = searchParams.get('type')
  const type: 'RECEIVABLE' | 'PAYABLE' =
    typeParam === 'PAYABLE' ? 'PAYABLE' : 'RECEIVABLE'

  const query = useQuery<PartnerAgingResponse>({
    queryKey: ['accounting', 'reports', 'partner-aging', asOfDate, type],
    queryFn: () => getPartnerAging(asOfDate, type),
    enabled: Boolean(asOfDate),
  })

  return (
    <PrintLayout paper="a4-portrait">
      <style>{PRINT_CSS}</style>

      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spinner size="lg" label="거래처 잔액 불러오는 중" />
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
          거래처 잔액을 불러오지 못했습니다. (asOfDate: {asOfDate})
        </div>
      ) : !query.data ? (
        <div style={{ color: 'var(--color-neutral-500)', fontSize: 14 }}>
          조회 중... (asOfDate={asOfDate || '미지정'})
        </div>
      ) : (
        <PartnerAgingPrintBody data={query.data} />
      )}
    </PrintLayout>
  )
}

interface BodyProps {
  data: PartnerAgingResponse
}

/** 거래처별 미수/미지급 인쇄 본문. */
function PartnerAgingPrintBody({ data }: BodyProps) {
  const { company } = useCompanyProfile()
  const typeLabel = data.type === 'RECEIVABLE' ? '미수금' : '미지급금'
  const lines = sortedLines(data.lines)

  return (
    <div style={{ fontFamily: 'var(--font-family-sans)', color: 'var(--color-neutral-900)' }}>
      {/* 헤더 */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{company.legalName}</div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 2 }}>
          사업자등록번호: {company.businessRegNo}
        </div>
        <div style={{ fontSize: 'var(--print-text-lg)', fontWeight: 700, marginTop: 8, letterSpacing: '0.2em' }}>
          거 래 처 별 {typeLabel} 잔 액
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 6 }}>
          계정과목: {data.accountCode} {data.accountName} &nbsp;|&nbsp; 기준일: {data.asOfDate}
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', marginTop: 2 }}>
          거래처 수: {data.partnerCount}개 &nbsp;|&nbsp;
          합계 잔액: {fmtAmount(data.totalAmount)} 원 &nbsp;|&nbsp;
          작성일: {new Date().toLocaleDateString('ko-KR')}
        </div>
      </div>

      {/* 본문 표 — UUID partnerId 열 없음 (화면 노출 금지) */}
      <table className="aging-table">
        <colgroup>
          <col style={{ width: '12%' }} />
          <col style={{ width: '28%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>거래처코드</th>
            <th>거래처명</th>
            <th className="amount-col">잔 액</th>
            <th className="center-col">가장 오래된 일자</th>
            <th className="center-col">연체일수</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            const overdueCls = agingClass(line.agingDays)
            const zebraCls = !overdueCls && idx % 2 === 1 ? 'aging-row-even' : undefined
            const rowCls = [overdueCls, zebraCls].filter(Boolean).join(' ') || undefined
            return (
              <tr
                key={line.partnerCode}
                className={rowCls}
              >
                {/* UUID 비공개: partnerCode 만 — partnerId 절대 미노출 */}
                <td style={{ color: 'var(--color-neutral-700)' }}>
                  {line.partnerCode}
                </td>
                <td style={{ fontWeight: 500 }}>{line.partnerName}</td>
                <td className="amount">{fmtAmount(line.balance)}</td>
                <td className="center">{line.oldestUnpaidDate ?? '—'}</td>
                <td className="center">
                  <span
                    className={
                      line.agingDays >= 60
                        ? 'aging-badge-danger'
                        : line.agingDays >= 30
                        ? 'aging-badge-warning'
                        : undefined
                    }
                  >
                    {line.agingDays}일
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
        {/* 합계 행 */}
        <tfoot>
          <tr
            className="report-grand-total-row"
            style={{ borderTop: '2pt solid var(--color-neutral-900)' }}
          >
            <td
              colSpan={2}
              style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt 4pt' }}
            >
              합 계 ({data.partnerCount}개 거래처)
            </td>
            <td
              className="amount"
              style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '5pt 4pt' }}
            >
              {fmtAmount(data.totalAmount)}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>

      {/* 범례 */}
      <div style={{ marginTop: 10, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-600)' }}>
        연체일수: 30일 이하 (정상) / 31~60일 (주의) / 61일 이상 (연체 위험)
      </div>

      {/* 푸터 */}
      <div style={{ marginTop: 12, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', textAlign: 'center' }}>
        본 보고서는 한국 일반기업회계기준(K-GAAP)에 따라 작성됨
      </div>
      <div style={{ marginTop: 4, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', textAlign: 'right' }}>
        보고서 생성: {new Date(data.generatedAt).toLocaleString('ko-KR')}
      </div>
    </div>
  )
}
