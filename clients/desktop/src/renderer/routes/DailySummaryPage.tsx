/**
 * 일계표 화면 (`/accounting/reports/daily-summary`).
 *
 * 일자 선택 → 조회 → 계정과목별 차/대변 합계 + 잔액 표시.
 * balanced 상태 chip (일치/불일치) + 분개 건수 / 총 차변 / 총 대변 summary.
 * 인쇄 시 새 창 (`/accounting/reports/daily-summary/print`) 열기.
 *
 * 권한: ACCOUNTANT / MANAGER / MASTER (RoleGuard — AppRouter 에서 적용).
 * UUID 비공개 가드: 화면에 UUID 일절 노출 안 함.
 *
 * API: `GET /api/v1/accounting/reports/daily-summary?date=YYYY-MM-DD`
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
  getDailySummary,
  type AccountSummaryItem,
  type DailySummaryResponse,
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

/** 오늘 날짜 YYYY-MM-DD. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
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
function SummaryItem({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
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
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-neutral-500)', textTransform: 'uppercase' }}>
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

// --------------------------------------------------------------------------
// 메인 페이지
// --------------------------------------------------------------------------

/**
 * 일계표 메인 페이지.
 *
 * 상단: 일자 picker + 조회 + 인쇄.
 * summary 카드: 분개 건수 / 총 차변 / 총 대변 / 균형 chip.
 * 본문: 계정과목별 차/대변 합계 + 잔액 표.
 */
export function DailySummaryPage() {
  const [date, setDate] = useState<string>(today())
  const [queryDate, setQueryDate] = useState<string>(today())

  usePageTitle('일계표', queryDate)

  const query = useQuery<DailySummaryResponse>({
    queryKey: ['accounting', 'reports', 'daily-summary', queryDate],
    queryFn: () => getDailySummary(queryDate),
  })

  const data = query.data
  const handleSearch = () => setQueryDate(date)

  const handlePrint = () => {
    window.open(
      `/accounting/reports/daily-summary/print?date=${queryDate}`,
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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>일계표</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label
            htmlFor="daily-summary-date"
            style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 500 }}
          >
            조회 일자
          </label>
          <Input
            id="daily-summary-date"
            type="date"
            inputSize="sm"
            fullWidth={false}
            value={date}
            onChange={(e) => setDate(e.target.value)}
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
          <Spinner size="lg" label="일계표 불러오는 중" />
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
          일계표를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : data ? (
        <Card>
          {/* 화면 헤더 */}
          <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>일계표</div>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
              {data.date}
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
            <SummaryItem label="분개 건수" value={`${data.journalCount}건`} />
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
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-neutral-500)', textTransform: 'uppercase' }}>
                균형
              </span>
              <Badge variant={data.balanced ? 'success' : 'danger'}>
                {data.balanced ? '일치' : '불일치'}
              </Badge>
            </div>
          </div>

          {/* 계정별 표 */}
          <div
            data-testid="accounting-daily-summary-table"
            style={{ overflowX: 'auto' }}
          >
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
                {sortedAccounts(data.accountSummary).map((item) => (
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
                    {fmtKrw(data.totalDebit)}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>
                    {fmtKrw(data.totalCredit)}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>—</td>
                </tr>
              </tbody>
            </table>
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
              차변/대변 합계가 일치하지 않습니다. 해당 일자 분개를 확인하세요.
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
            조회 일자: {queryDate}
          </div>
        </Card>
      ) : null}
    </>
  )
}
