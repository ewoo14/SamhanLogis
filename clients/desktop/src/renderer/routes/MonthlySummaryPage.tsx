/**
 * 월계표 화면 (`/accounting/reports/monthly-summary`).
 *
 * 월 선택 → 조회 → 계정별 합계 + 일별 breakdown 표시.
 * balanced 상태 chip (일치/불일치) + 분개 건수 / 총 차변 / 총 대변 summary.
 * 인쇄 시 새 창 (`/accounting/reports/monthly-summary/print`) 열기.
 *
 * 일계표와 동일 구조 + 월 단위 + 일별 breakdown 탭 추가.
 *
 * 권한: ACCOUNTANT / MANAGER / MASTER (RoleGuard — AppRouter 에서 적용).
 * UUID 비공개 가드: 화면에 UUID 일절 노출 안 함.
 *
 * API: `GET /api/v1/accounting/reports/monthly-summary?period=YYYYMM`
 *
 * P0-1 Slice C 가드 준수:
 * - raw hex 0건 — design-system 토큰만
 * - design-system Input / Button / Card / Spinner / Badge 컴포넌트
 * - tabular-nums 금액
 * - .report-total-row / .report-grand-total-row CSS class 부여
 * - sortOrder 클라이언트 정렬 안전망
 * - BE record 필드명 1:1 정확 일치
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Card, Input, Spinner } from '@samhan/design-system'
import {
  getMonthlySummary,
  type AccountSummaryItem,
  type DailyBreakdownItem,
  type MonthlySummaryResponse,
} from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'

// --------------------------------------------------------------------------
// 유틸
// --------------------------------------------------------------------------

/** KRW 정수 string → "5,000,000" 형식. */
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
  return `${period.slice(0, 4)}년 ${period.slice(4, 6)}월`
}

/** 전월 YYYYMM 계산. */
function prevMonth(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** sortOrder 클라이언트 정렬 안전망. */
function sortedAccounts(items: AccountSummaryItem[]): AccountSummaryItem[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder)
}

/** 카테고리 코드 → 한국어 분류명. */
function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    '100': '자산',
    '200': '부채',
    '300': '자본',
    '400': '수익',
    '500': '비용',
    '800': '판매비와관리비',
    '900': '영업외',
  }
  return map[cat] ?? cat
}

// --------------------------------------------------------------------------
// 서브 컴포넌트
// --------------------------------------------------------------------------

/** summary 카드 단일 항목. */
function SummaryItem({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '12px 16px',
        background: emphasis ? 'var(--color-neutral-100)' : 'var(--color-bg-muted)',
        borderRadius: 6,
        minWidth: 140,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-neutral-500)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: emphasis ? 'var(--color-neutral-900)' : 'var(--color-neutral-800)',
        }}
      >
        {value}
      </span>
    </div>
  )
}

/** 계정별 합계 표. */
function AccountSummaryTable({
  items,
  totalDebit,
  totalCredit,
}: {
  items: AccountSummaryItem[]
  totalDebit: string
  totalCredit: string
}) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 14,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <colgroup>
        <col style={{ width: '10%' }} />
        <col style={{ width: '28%' }} />
        <col style={{ width: '12%' }} />
        <col style={{ width: '18%' }} />
        <col style={{ width: '18%' }} />
        <col style={{ width: '14%' }} />
      </colgroup>
      <thead>
        <tr style={{ borderBottom: '2px solid var(--color-neutral-900)' }}>
          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>코드</th>
          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>계정과목</th>
          <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>분류</th>
          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>차변 합계</th>
          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>대변 합계</th>
          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>잔액</th>
        </tr>
      </thead>
      <tbody>
        {sortedAccounts(items).map((item) => (
          <tr
            key={item.accountCode}
            style={{ borderBottom: '1px solid var(--color-neutral-100)' }}
          >
            <td style={{ padding: '4px 8px', color: 'var(--color-neutral-600)', fontFamily: 'monospace' }}>
              {item.accountCode}
            </td>
            <td style={{ padding: '4px 8px', color: 'var(--color-neutral-900)' }}>
              {item.accountName}
            </td>
            <td
              style={{
                padding: '4px 8px',
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--color-neutral-500)',
              }}
            >
              {categoryLabel(item.category)}
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--color-neutral-900)' }}>
              {fmtKrw(item.totalDebit)}
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--color-neutral-900)' }}>
              {fmtKrw(item.totalCredit)}
            </td>
            <td
              style={{
                padding: '4px 8px',
                textAlign: 'right',
                fontWeight: 600,
                color:
                  Number.parseInt(item.balance, 10) < 0
                    ? 'var(--color-danger)'
                    : 'var(--color-neutral-900)',
              }}
            >
              {fmtKrw(item.balance)}
            </td>
          </tr>
        ))}
        {/* 합계 행 */}
        <tr className="report-grand-total-row" style={{ borderTop: '2px solid var(--color-neutral-900)' }}>
          <td colSpan={3} style={{ padding: '7px 8px', fontWeight: 700, fontSize: 14 }}>
            합계
          </td>
          <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>
            {fmtKrw(totalDebit)}
          </td>
          <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>
            {fmtKrw(totalCredit)}
          </td>
          <td style={{ padding: '7px 8px', textAlign: 'right' }}>—</td>
        </tr>
      </tbody>
    </table>
  )
}

/** 일별 breakdown 표. */
function DailyBreakdownTable({ items }: { items: DailyBreakdownItem[] }) {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date))
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 14,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <colgroup>
        <col style={{ width: '20%' }} />
        <col style={{ width: '15%' }} />
        <col style={{ width: '32%' }} />
        <col style={{ width: '33%' }} />
      </colgroup>
      <thead>
        <tr style={{ borderBottom: '2px solid var(--color-neutral-900)' }}>
          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>일자</th>
          <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>분개 건수</th>
          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>차변 합계</th>
          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>대변 합계</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((item) => (
          <tr
            key={item.date}
            style={{ borderBottom: '1px solid var(--color-neutral-100)' }}
          >
            <td style={{ padding: '4px 8px', color: 'var(--color-neutral-900)' }}>
              {item.date}
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--color-neutral-700)' }}>
              {item.journalCount}건
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--color-neutral-900)' }}>
              {fmtKrw(item.totalDebit)}
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--color-neutral-900)' }}>
              {fmtKrw(item.totalCredit)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// --------------------------------------------------------------------------
// 메인 페이지
// --------------------------------------------------------------------------

type TabType = 'account' | 'daily'

/**
 * 월계표 메인 페이지.
 *
 * 상단: 회계 월 picker + 조회 + 인쇄.
 * summary 카드: 분개 건수 / 총 차변 / 총 대변 / 균형 chip.
 * 탭: 계정별 합계 / 일별 breakdown.
 */
export function MonthlySummaryPage() {
  const [period, setPeriod] = useState<string>(prevMonth())
  const [queryPeriod, setQueryPeriod] = useState<string>(prevMonth())
  const [activeTab, setActiveTab] = useState<TabType>('account')

  usePageTitle('월계표', formatPeriodKo(queryPeriod))

  const query = useQuery<MonthlySummaryResponse>({
    queryKey: ['accounting', 'reports', 'monthly-summary', queryPeriod],
    queryFn: () => getMonthlySummary(queryPeriod),
  })

  const data = query.data
  const handleSearch = () => setQueryPeriod(period)

  const handlePrint = () => {
    window.open(
      `/accounting/reports/monthly-summary/print?period=${queryPeriod}`,
      '_blank',
    )
  }

  // 탭 버튼 공통 스타일 계산
  const tabStyle = (tab: TabType) => ({
    padding: '6px 16px',
    fontSize: 13,
    fontWeight: activeTab === tab ? 700 : 400,
    border: '1px solid var(--color-neutral-300)',
    borderRadius: 4,
    background: activeTab === tab ? 'var(--color-neutral-900)' : 'var(--color-bg-surface)',
    color: activeTab === tab ? 'var(--color-neutral-0)' : 'var(--color-neutral-700)',
    cursor: 'pointer',
  })

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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>월계표</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label
            htmlFor="monthly-summary-period"
            style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 500 }}
          >
            회계 월
          </label>
          <Input
            id="monthly-summary-period"
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
          <Spinner size="lg" label="월계표 불러오는 중" />
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
          월계표를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : data ? (
        <Card>
          {/* 화면 헤더 */}
          <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>월계표</div>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
              {data.fromDate} ~ {data.toDate}
            </div>
          </div>

          {/* Summary 카드 영역 */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 20,
              alignItems: 'stretch',
            }}
          >
            <SummaryItem label="총 분개 건수" value={`${data.journalCount}건`} />
            <SummaryItem label="총 차변" value={fmtKrw(data.totalDebit)} emphasis />
            <SummaryItem label="총 대변" value={fmtKrw(data.totalCredit)} emphasis />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '12px 16px',
                background: 'var(--color-bg-muted)',
                borderRadius: 6,
                minWidth: 100,
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--color-neutral-500)',
                  textTransform: 'uppercase',
                }}
              >
                균형
              </span>
              <Badge variant={data.balanced ? 'success' : 'danger'}>
                {data.balanced ? '일치' : '불일치'}
              </Badge>
            </div>
          </div>

          {/* 탭 선택 */}
          <div
            className="no-print"
            style={{ display: 'flex', gap: 8, marginBottom: 16 }}
          >
            <button
              type="button"
              style={tabStyle('account')}
              onClick={() => setActiveTab('account')}
            >
              계정별 합계
            </button>
            <button
              type="button"
              style={tabStyle('daily')}
              onClick={() => setActiveTab('daily')}
            >
              일별 breakdown
            </button>
          </div>

          {/* 탭 본문 */}
          <div
            data-testid="accounting-monthly-summary-table"
            style={{ overflowX: 'auto' }}
          >
            {activeTab === 'account' ? (
              <AccountSummaryTable
                items={data.accountSummary}
                totalDebit={data.totalDebit}
                totalCredit={data.totalCredit}
              />
            ) : (
              <DailyBreakdownTable items={data.dailyBreakdown} />
            )}
          </div>

          {!data.balanced ? (
            <div
              role="alert"
              style={{
                marginTop: 12,
                padding: '8px 12px',
                background: 'var(--state-danger-bg)',
                border: '1px solid var(--state-danger)',
                borderRadius: 4,
                fontSize: 13,
                color: 'var(--state-danger)',
              }}
            >
              차변/대변 합계가 일치하지 않습니다. 해당 월 분개를 확인하세요.
            </div>
          ) : null}

          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: 'var(--color-neutral-400)',
              textAlign: 'right',
            }}
          >
            조회 기준: {formatPeriodKo(queryPeriod)}
          </div>
        </Card>
      ) : null}
    </>
  )
}
