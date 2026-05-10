/**
 * 손익계산서 화면 (`/accounting/reports/income-statement`).
 *
 * 월 선택 → 조회 → 한국 일반기업회계기준 형식으로 표시.
 * 합계 행 굵게, 음수 금액 빨강, 빈 카테고리 표시 안 함.
 * 인쇄 시 "(주)삼한공조시스템" 헤더 + 작성일 + 회계 기간 포함.
 *
 * 권한: ACCOUNTANT / MANAGER / MASTER 진입 (RoleGuard — AppRouter 에서 적용, BE @PreAuthorize 일치).
 *
 * UUID 비공개 가드: 화면에 UUID 일절 노출 안 함.
 * API: `GET /accounting/reports/income-statement?period=YYYYMM`
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
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
 */
function StatementRow({ label, amount, indent = false, isSummary = false }: SectionRowProps) {
  const n = Number.parseInt(amount, 10)
  const isNeg = Number.isFinite(n) && n < 0
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 0',
        paddingLeft: indent ? 24 : 0,
        fontWeight: isSummary ? 700 : 400,
        fontSize: 14,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ color: '#111827' }}>{label}</span>
      <span style={{ color: isNeg ? '#DC2626' : '#111827' }}>{fmtKrw(amount)}</span>
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
 */
function StatementSection({ title, lines, summaryLabel, summaryAmount }: SectionProps) {
  if (lines.length === 0) return null
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#374151', padding: '6px 0 2px' }}>
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

/** 구분선 */
function Divider() {
  return (
    <div
      style={{
        borderTop: '1px solid #D1D5DB',
        margin: '8px 0',
      }}
    />
  )
}

// --------------------------------------------------------------------------
// 인쇄 스타일 (@media print)
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

  const handlePrint = () => window.print()

  return (
    <>
      {/* 인쇄용 스타일 */}
      <style>{PRINT_STYLES}</style>

      {/* 조회 컨트롤 */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>손익계산서</h3>
        <label style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
          회계 월:
          <input
            type="month"
            value={`${period.slice(0, 4)}-${period.slice(4, 6)}`}
            onChange={(e) => {
              const v = e.target.value.replace('-', '')
              if (/^\d{6}$/.test(v)) setPeriod(v)
            }}
            style={{
              height: 32,
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid #D1D5DB',
              fontSize: 13,
            }}
          />
        </label>
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
        <div
          role="alert"
          style={{
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 6,
            padding: '12px 16px',
            color: '#991B1B',
            fontSize: 14,
          }}
        >
          손익계산서를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : data ? (
        <Card>
          {/* 인쇄 헤더 */}
          <div className="income-statement-print-header" style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>(주)삼한공조시스템</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>손익계산서</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
              {data.fromDate} ~ {data.toDate}
            </div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
              작성일: {new Date().toLocaleDateString('ko-KR')}
            </div>
          </div>

          {/* 화면 제목 (no-print) */}
          <div
            className="no-print"
            style={{ textAlign: 'center', marginBottom: 16 }}
          >
            <div style={{ fontSize: 16, fontWeight: 700 }}>손익계산서</div>
            <div style={{ fontSize: 13, color: '#6B7280' }}>
              {data.fromDate} ~ {data.toDate}
            </div>
          </div>

          {/* 본문 */}
          <div
            data-testid="accounting-income-statement-table"
            style={{ maxWidth: 600, margin: '0 auto' }}
          >
            {/* 매출액 */}
            <StatementSection
              title="I. 매출액"
              lines={data.revenue}
              summaryLabel="매출액 합계"
              summaryAmount={data.revenue.reduce((s, l) => s + Number.parseInt(l.amount, 10), 0).toString()}
            />

            <Divider />

            {/* 매출원가 */}
            <StatementSection
              title="II. 매출원가"
              lines={data.costOfSales}
              summaryLabel="매출원가 합계"
              summaryAmount={data.costOfSales.reduce((s, l) => s + Number.parseInt(l.amount, 10), 0).toString()}
            />

            <Divider />

            {/* 매출총이익 */}
            <StatementRow label="III. 매출총이익" amount={data.grossProfit} isSummary />

            <Divider />

            {/* 판매비와관리비 */}
            <StatementSection
              title="IV. 판매비와관리비"
              lines={data.sga}
              summaryLabel="판매비와관리비 합계"
              summaryAmount={data.sga.reduce((s, l) => s + Number.parseInt(l.amount, 10), 0).toString()}
            />

            <Divider />

            {/* 영업이익 */}
            <StatementRow label="V. 영업이익" amount={data.operatingProfit} isSummary />

            <Divider />

            {/* 영업외 수익/비용 */}
            {data.nonOperating.length > 0 ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#374151', padding: '6px 0 2px' }}>
                  VI. 영업외손익
                </div>
                {data.nonOperating.map((line) => (
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

            {/* 당기순이익 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                fontWeight: 700,
                fontSize: 16,
                borderTop: '2px solid #111827',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>IX. 당기순이익</span>
              <span
                style={{
                  color: Number.parseInt(data.netIncome, 10) < 0 ? '#DC2626' : '#059669',
                }}
              >
                {fmtKrw(data.netIncome)}
              </span>
            </div>

            {/* 생성 시각 */}
            <div style={{ marginTop: 16, fontSize: 12, color: '#9CA3AF', textAlign: 'right' }}>
              보고서 생성: {new Date(data.generatedAt).toLocaleString('ko-KR')}
            </div>
          </div>
        </Card>
      ) : null}
    </>
  )
}
