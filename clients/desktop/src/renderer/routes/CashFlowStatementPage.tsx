/**
 * 현금흐름표 화면 (`/accounting/reports/cash-flow`).
 *
 * 월 선택 → 조회 → 한국 일반기업회계기준 현금흐름표 3분류 표시.
 * - 영업활동 현금흐름 (CFO)
 * - 투자활동 현금흐름 (CFI)
 * - 재무활동 현금흐름 (CFF)
 * - 현금 순증감 + 기초/기말 현금
 * cashReconciled=false 시 빨강 경고 배너.
 * 인쇄 시 새 창 (`/accounting/reports/cash-flow/print`) 열기.
 *
 * 권한: ACCOUNTANT / MANAGER / MASTER (RoleGuard — AppRouter 에서 적용).
 * UUID 비공개 가드: 화면에 UUID 일절 노출 안 함.
 *
 * API: `GET /api/v1/accounting/reports/cash-flow?period=YYYYMM`
 *
 * P0-1 Slice C 가드 준수:
 * - raw hex 0건 — design-system 토큰만
 * - design-system Input / Button / Card / Spinner 컴포넌트
 * - tabular-nums 금액
 * - .report-total-row / .report-grand-total-row CSS class 부여
 * - sortOrder 클라이언트 정렬 안전망
 * - BE record 필드명 1:1 정확 일치
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Input, Spinner } from '@samhan/design-system'
import {
  getCashFlowStatement,
  type CashFlowItem,
  type CashFlowStatementResponse,
} from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'

// --------------------------------------------------------------------------
// 유틸
// --------------------------------------------------------------------------

/** KRW 정수 string → "5,000,000" 형식 (음수 괄호). */
function fmtKrw(raw: string | number): string {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw
  if (!Number.isFinite(n)) return String(raw)
  if (n === 0) return '—'
  const abs = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n < 0 ? `(${abs})` : abs
}

/** YYYYMM → "2026년 05월" */
function formatPeriodKo(period: string): string {
  if (!period || period.length < 6) return period
  const year = period.slice(0, 4)
  const month = period.slice(4, 6)
  return `${year}년 ${month}월`
}

/** 전월 YYYYMM 계산. */
function prevMonth(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** sortOrder 클라이언트 정렬 안전망. */
function sortedItems(items: CashFlowItem[]): CashFlowItem[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder)
}

// --------------------------------------------------------------------------
// 서브 컴포넌트
// --------------------------------------------------------------------------

interface CashFlowRowProps {
  label: string
  amount: string
  indent?: boolean
  isSummary?: boolean
  isGrandTotal?: boolean
}

/**
 * 현금흐름표 한 행.
 * isSummary=true → .report-total-row, isGrandTotal=true → .report-grand-total-row
 */
function CashFlowRow({ label, amount, indent = false, isSummary = false, isGrandTotal = false }: CashFlowRowProps) {
  const n = Number.parseInt(amount, 10)
  const isNeg = Number.isFinite(n) && n < 0
  const className = isGrandTotal
    ? 'report-grand-total-row'
    : isSummary
      ? 'report-total-row'
      : undefined
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 8px',
        paddingLeft: indent ? 32 : 8,
        fontWeight: isGrandTotal ? 700 : isSummary ? 700 : 400,
        fontSize: isGrandTotal ? 15 : 14,
        fontVariantNumeric: 'tabular-nums',
        borderRadius: 2,
        borderTop: isGrandTotal ? '2px solid var(--color-neutral-900)' : undefined,
      }}
    >
      <span style={{ color: 'var(--color-neutral-900)' }}>{label}</span>
      <span
        style={{
          color: isNeg ? 'var(--color-danger)' : 'var(--color-neutral-900)',
        }}
      >
        {fmtKrw(amount)}
      </span>
    </div>
  )
}

interface ActivitySectionProps {
  title: string
  items: CashFlowItem[]
  totalLabel: string
  totalAmount: string
}

/**
 * 현금흐름표 활동 섹션 (영업/투자/재무).
 * sortOrder 안전망 정렬 적용.
 */
function ActivitySection({ title, items, totalLabel, totalAmount }: ActivitySectionProps) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--color-neutral-700)',
          padding: '6px 8px 2px',
        }}
      >
        {title}
      </div>
      {sortedItems(items).map((item, idx) => (
        <CashFlowRow
          key={`${item.label}-${idx}`}
          label={item.label}
          amount={item.amount}
          indent
        />
      ))}
      <CashFlowRow label={totalLabel} amount={totalAmount} isSummary />
    </div>
  )
}

/** 구분선. */
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
// 메인 페이지
// --------------------------------------------------------------------------

/**
 * 현금흐름표 메인 페이지.
 *
 * 상단: 회계 월 picker + 조회 + 인쇄.
 * 본문: 영업/투자/재무 활동 현금흐름 3분류 + 순증감 + 기초/기말.
 */
export function CashFlowStatementPage() {
  const [period, setPeriod] = useState<string>(prevMonth())
  const [queryPeriod, setQueryPeriod] = useState<string>(prevMonth())

  usePageTitle('현금흐름표', formatPeriodKo(queryPeriod))

  const query = useQuery<CashFlowStatementResponse>({
    queryKey: ['accounting', 'reports', 'cash-flow', queryPeriod],
    queryFn: () => getCashFlowStatement(queryPeriod),
  })

  const data = query.data
  const handleSearch = () => setQueryPeriod(period)

  /** 인쇄 버튼 → 새 창 인쇄 전용 레이아웃 열기. */
  const handlePrint = () => {
    window.open(
      `/accounting/reports/cash-flow/print?period=${queryPeriod}`,
      '_blank',
    )
  }

  return (
    <>
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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>현금흐름표</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label
            htmlFor="cash-flow-period"
            style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 500 }}
          >
            회계 월
          </label>
          <Input
            id="cash-flow-period"
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

      {/* 로딩 / 에러 / 본문 */}
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
            borderRadius: 6,
            padding: '12px 16px',
            color: 'var(--state-danger)',
            fontSize: 14,
          }}
        >
          현금흐름표를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : data ? (
        <Card>
          {/* 화면 헤더 */}
          <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>현금흐름표</div>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
              {data.fromDate} ~ {data.toDate}
            </div>
          </div>

          {/* cashReconciled=false 경고 배너 */}
          {!data.cashReconciled ? (
            <div
              role="alert"
              style={{
                background: 'var(--state-danger-bg)',
                border: '1px solid var(--state-danger)',
                borderRadius: 4,
                padding: '8px 12px',
                color: 'var(--state-danger)',
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              현금 잔액이 불일치합니다 — 기초현금 + 순증감 ≠ 기말현금. 분개를 확인하세요.
            </div>
          ) : null}

          {/* 본문 */}
          <div
            data-testid="accounting-cash-flow-table"
            style={{ maxWidth: 600, margin: '0 auto' }}
          >
            {/* I. 영업활동 현금흐름 */}
            <ActivitySection
              title="I. 영업활동 현금흐름"
              items={[
                { label: '당기순이익', amount: data.netIncome, sortOrder: 0 },
                ...data.operatingAdjustments,
              ]}
              totalLabel="영업활동 합계 (CFO)"
              totalAmount={data.cashFromOperating}
            />

            <Divider />

            {/* II. 투자활동 현금흐름 */}
            <ActivitySection
              title="II. 투자활동 현금흐름"
              items={data.investingActivities}
              totalLabel="투자활동 합계 (CFI)"
              totalAmount={data.cashFromInvesting}
            />

            <Divider />

            {/* III. 재무활동 현금흐름 */}
            <ActivitySection
              title="III. 재무활동 현금흐름"
              items={data.financingActivities}
              totalLabel="재무활동 합계 (CFF)"
              totalAmount={data.cashFromFinancing}
            />

            <Divider />

            {/* 현금 순증감 */}
            <CashFlowRow
              label="IV. 현금 순증감 (CFO + CFI + CFF)"
              amount={data.netCashFlow}
              isSummary
            />

            <Divider />

            {/* 기초 현금 */}
            <CashFlowRow label="V. 기초 현금" amount={data.beginningCash} />

            {/* 기말 현금 — grand-total */}
            <CashFlowRow
              label="VI. 기말 현금"
              amount={data.endingCash}
              isGrandTotal
            />

            {/* 생성 시각 */}
            <div
              style={{
                marginTop: 16,
                fontSize: 12,
                color: 'var(--color-neutral-400)',
                textAlign: 'right',
              }}
            >
              조회 기준: {formatPeriodKo(queryPeriod)}
            </div>
          </div>
        </Card>
      ) : null}
    </>
  )
}
