/**
 * 손익계산서 화면 (`/accounting/reports/income-statement`).
 *
 * 월 선택 → 조회 → 한국 일반기업회계기준 형식으로 표시.
 * 합계 행 굵게, 음수 금액 빨강, 빈 카테고리 표시 안 함.
 * 인쇄 시 새 창 (`/accounting/reports/income-statement/print`) 열기 (D5).
 *
 * 권한: ACCOUNTANT / MASTER 만 진입 (RoleGuard — AppRouter 에서 적용).
 *
 * UUID 비공개 가드: 화면에 UUID 일절 노출 안 함.
 * API: `GET /accounting/reports/income-statement?period=YYYYMM`
 *
 * PR #134 FE+Designer 결함 fix:
 * - D1: raw hex 전면 → design-system 토큰 교체
 * - D3: 당기순이익 grand-total 배경 (color-neutral-900/0)
 * - D4: .report-total-row / .report-grand-total-row CSS class 부여
 * - D6: 인쇄 헤더 font-size → print token 변수
 * - D7: 에러 배너 hex → state-danger 토큰
 * - F2: design-system Input 컴포넌트 + htmlFor 접근성
 * - F3: sortOrder 클라이언트 정렬 안전망
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  Input,
  Spinner,
} from '@samhan/design-system'
import {
  getIncomeStatement,
  type FinancialStatementLine,
  type IncomeStatementResponse,
} from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'

// --------------------------------------------------------------------------
// 유틸
// --------------------------------------------------------------------------

/** KRW 정수 string → "5,000,000" 표시 (₩ 미포함, 음수 부호 유지). */
function fmtKrw(raw: string | number): string {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw
  if (!Number.isFinite(n)) return String(raw)
  if (n === 0) return '—'
  const abs = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n < 0 ? `(${abs})` : abs
}

/** YYYYMM → "2026년 4월" */
function formatPeriodKo(period: string): string {
  const year = period.slice(0, 4)
  const month = String(Number.parseInt(period.slice(4, 6), 10))
  return `${year}년 ${month}월`
}

/** 전월 YYYYMM 계산. */
function prevMonth(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * F3: 클라이언트 sortOrder 정렬 — BE 정렬 보장 무관 안전망.
 */
function sortedLines(lines: FinancialStatementLine[]): FinancialStatementLine[] {
  return [...lines].sort((a, b) => a.sortOrder - b.sortOrder)
}

// --------------------------------------------------------------------------
// 서브 컴포넌트
// --------------------------------------------------------------------------

interface SectionRowProps {
  label: string
  amount: string
  indent?: boolean
  isSummary?: boolean
}

/**
 * 손익계산서 한 행 — label(좌) / 금액(우).
 * `isSummary=true` 이면 굵게, 음수 금액은 빨강.
 * D1: raw hex → design-system 토큰 교체.
 * D4: isSummary 행에 .report-total-row class 부여.
 */
function StatementRow({ label, amount, indent = false, isSummary = false }: SectionRowProps) {
  const n = Number.parseInt(amount, 10)
  const isNeg = Number.isFinite(n) && n < 0
  return (
    <div
      className={isSummary ? 'report-total-row' : undefined}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 8px',
        paddingLeft: indent ? 32 : 8,
        fontWeight: isSummary ? 700 : 400,
        fontSize: 14,
        fontVariantNumeric: 'tabular-nums',
        borderRadius: 2,
      }}
    >
      {/* D1: color-neutral-900 (기존 #111827) */}
      <span style={{ color: 'var(--color-neutral-900)' }}>{label}</span>
      {/* D1: 음수 color-danger (기존 #DC2626), 양수 color-neutral-900 */}
      <span style={{ color: isNeg ? 'var(--color-danger)' : 'var(--color-neutral-900)' }}>
        {fmtKrw(amount)}
      </span>
    </div>
  )
}

interface SectionProps {
  title: string
  lines: FinancialStatementLine[]
  summaryLabel: string
  summaryAmount: string
}

/**
 * 손익계산서 한 섹션 (예: 매출액 + 세부 + 합계).
 * 세부 항목이 없으면 섹션 자체를 숨김 (조건부 렌더).
 * D1: 카테고리 헤더 color-neutral-700 (기존 #374151).
 */
function StatementSection({ title, lines, summaryLabel, summaryAmount }: SectionProps) {
  if (lines.length === 0) return null
  return (
    <div style={{ marginBottom: 4 }}>
      {/* D1: color-neutral-700 (기존 #374151) */}
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-neutral-700)', padding: '6px 8px 2px' }}>
        {title}
      </div>
      {lines.map((line) => (
        <StatementRow
          key={line.accountCode}
          label={line.accountName}
          amount={line.amount}
          indent
        />
      ))}
      <StatementRow label={summaryLabel} amount={summaryAmount} isSummary />
    </div>
  )
}

/** 구분선 — D1: color-neutral-200 (기존 #D1D5DB). */
function Divider() {
  return (
    <div
      style={{
        borderTop: '1px solid var(--color-neutral-200)',
        margin: '8px 0',
      }}
    />
  )
}

// --------------------------------------------------------------------------
// 인쇄 스타일 (@media print) — D5: 인쇄는 새 창으로 이동하므로 최소화
// --------------------------------------------------------------------------
const PRINT_STYLES = `
@media print {
  .no-print { display: none !important; }
  .income-statement-print-header { display: block !important; }
}
.income-statement-print-header { display: none; }
`

// --------------------------------------------------------------------------
// 메인 페이지
// --------------------------------------------------------------------------

export function IncomeStatementPage() {
  const [period, setPeriod] = useState<string>(prevMonth())
  const [queryPeriod, setQueryPeriod] = useState<string>(prevMonth())

  usePageTitle('손익계산서', formatPeriodKo(queryPeriod))

  const query = useQuery<IncomeStatementResponse>({
    queryKey: ['accounting', 'reports', 'income-statement', queryPeriod],
    queryFn: () => getIncomeStatement(queryPeriod),
  })

  const data = query.data

  const handleSearch = () => setQueryPeriod(period)

  /**
   * D5: 인쇄 버튼 → 새 창으로 인쇄 전용 레이아웃 열기.
   * period 파라미터를 query string 으로 전달.
   */
  const handlePrint = () => {
    window.open(
      `/accounting/reports/income-statement/print?period=${queryPeriod}`,
      '_blank',
    )
  }

  return (
    <>
      {/* 인쇄용 스타일 (fallback — 새 창 미지원 환경) */}
      <style>{PRINT_STYLES}</style>

      {/* 조회 컨트롤 */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>손익계산서</h3>
        {/* F2: design-system Input + htmlFor 접근성 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label
            htmlFor="income-statement-period"
            style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 500 }}
          >
            회계 월
          </label>
          <Input
            id="income-statement-period"
            type="month"
            inputSize="sm"
            fullWidth={false}
            value={`${period.slice(0, 4)}-${period.slice(4, 6)}`}
            onChange={(e) => {
              const v = e.target.value.replace('-', '')
              if (/^\d{6}$/.test(v)) setPeriod(v)
            }}
            style={{ width: 160 }}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSearch}
          disabled={query.isFetching}
        >
          조회
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handlePrint}
          disabled={!data}
        >
          인쇄
        </Button>
      </div>

      {/* 로딩 / 에러 */}
      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spinner size="lg" label="손익계산서 불러오는 중" />
        </div>
      ) : query.isError ? (
        /* D7: 에러 배너 hex → state-danger 토큰 */
        <div
          role="alert"
          style={{
            background: 'var(--state-danger-bg)',
            border: '1px solid var(--state-danger)',
            borderRadius: 6,
            padding: '12px 16px',
            color: 'var(--state-danger)',
            fontSize: 14,
          }}
        >
          손익계산서를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : data ? (
        <Card>
          {/* 인쇄 헤더 (fallback) */}
          {/* D6: font-size → print token 변수 */}
          <div className="income-statement-print-header" style={{ textAlign: 'center', marginBottom: 24 }}>
            {/* D6: 보고서명 var(--print-text-lg) 18pt */}
            <div style={{ fontSize: 'var(--print-text-lg)', fontWeight: 700 }}>(주)삼한공조시스템</div>
            {/* D6: 화면 제목 16pt */}
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>손익계산서</div>
            {/* D1/D6: color-neutral-500 (기존 #6B7280), var(--print-text-sm) 11pt */}
            <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 4 }}>
              {data.fromDate} ~ {data.toDate}
            </div>
            {/* D1: color-neutral-400 (기존 #9CA3AF) */}
            <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', marginTop: 4 }}>
              작성일: {new Date().toLocaleDateString('ko-KR')}
            </div>
          </div>

          {/* 화면 제목 (no-print) */}
          <div
            className="no-print"
            style={{ textAlign: 'center', marginBottom: 16 }}
          >
            <div style={{ fontSize: 16, fontWeight: 700 }}>손익계산서</div>
            {/* D1: color-neutral-500 (기존 #6B7280) */}
            <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
              {data.fromDate} ~ {data.toDate}
            </div>
          </div>

          {/* 본문 */}
          <div
            data-testid="accounting-income-statement-table"
            style={{ maxWidth: 600, margin: '0 auto' }}
          >
            {/* 매출액 — F3: sortedLines 안전망 적용 */}
            <StatementSection
              title="I. 매출액"
              lines={sortedLines(data.revenue)}
              summaryLabel="매출액 합계"
              summaryAmount={data.revenue.reduce((s, l) => s + Number.parseInt(l.amount, 10), 0).toString()}
            />

            <Divider />

            {/* 매출원가 — F3: sortedLines 안전망 적용 */}
            <StatementSection
              title="II. 매출원가"
              lines={sortedLines(data.costOfSales)}
              summaryLabel="매출원가 합계"
              summaryAmount={data.costOfSales.reduce((s, l) => s + Number.parseInt(l.amount, 10), 0).toString()}
            />

            <Divider />

            {/* 매출총이익 */}
            <StatementRow label="III. 매출총이익" amount={data.grossProfit} isSummary />

            <Divider />

            {/* 판매비와관리비 — F3: sortedLines 안전망 적용 */}
            <StatementSection
              title="IV. 판매비와관리비"
              lines={sortedLines(data.sga)}
              summaryLabel="판매비와관리비 합계"
              summaryAmount={data.sga.reduce((s, l) => s + Number.parseInt(l.amount, 10), 0).toString()}
            />

            <Divider />

            {/* 영업이익 */}
            <StatementRow label="V. 영업이익" amount={data.operatingProfit} isSummary />

            <Divider />

            {/* 영업외 수익/비용 — F3: sortedLines 안전망 적용 */}
            {sortedLines(data.nonOperating).length > 0 ? (
              <>
                {/* D1: color-neutral-700 (기존 #374151) */}
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-neutral-700)', padding: '6px 8px 2px' }}>
                  VI. 영업외손익
                </div>
                {sortedLines(data.nonOperating).map((line) => (
                  <StatementRow
                    key={line.accountCode}
                    label={line.accountName}
                    amount={line.amount}
                    indent
                  />
                ))}
                <Divider />
              </>
            ) : null}

            {/* 법인세차감전순이익 */}
            <StatementRow label="VII. 법인세차감전순이익" amount={data.incomeBeforeTax} isSummary />

            {/* 법인세비용 */}
            <StatementRow label="VIII. 법인세비용" amount={data.incomeTax} indent />

            <Divider />

            {/* D3: 당기순이익 grand-total 행 — .report-grand-total-row class + 배경/텍스트 토큰 */}
            {/* D1: borderTop color-neutral-900 (기존 #111827) */}
            <div
              className="report-grand-total-row"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 8px',
                fontWeight: 700,
                fontSize: 16,
                borderTop: '2px solid var(--color-neutral-900)',
                fontVariantNumeric: 'tabular-nums',
                borderRadius: 2,
              }}
            >
              <span>IX. 당기순이익</span>
              <span>{fmtKrw(data.netIncome)}</span>
            </div>

            {/* 생성 시각 */}
            {/* D1: color-neutral-400 (기존 #9CA3AF) */}
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--color-neutral-400)', textAlign: 'right' }}>
              보고서 생성: {new Date(data.generatedAt).toLocaleString('ko-KR')}
            </div>
          </div>
        </Card>
      ) : null}
    </>
  )
}
