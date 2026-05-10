/**
 * 자본변동표 화면 (`/accounting/reports/equity-changes`).
 *
 * 기간 선택 (from/to) → 조회 → 자본금 / 이익잉여금 / 자본총계 기초→증감→기말 표 표시.
 * 인쇄 시 새 창 (`/accounting/reports/equity-changes/print`) 열기.
 *
 * 권한: ACCOUNTANT / MANAGER / MASTER (RoleGuard — AppRouter 에서 적용).
 * UUID 비공개 가드: 화면에 UUID 일절 노출 안 함.
 *
 * API: `GET /api/v1/accounting/reports/equity-changes?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`
 *
 * P0-1 Slice C 가드 준수:
 * - raw hex 0건 — design-system 토큰만
 * - design-system Input / Button / Card / Spinner 컴포넌트
 * - tabular-nums 금액
 * - .report-total-row / .report-grand-total-row CSS class 부여
 * - BE record 필드명 1:1 정확 일치
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Input, Spinner } from '@samhan/design-system'
import {
  getEquityChanges,
  type EquityChangesResponse,
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

/** 당해연도 1월 1일 (YYYY-01-01). */
function yearStart(): string {
  return `${new Date().getFullYear()}-01-01`
}

/** 전월말 (YYYY-MM-DD). */
function prevMonthEnd(): string {
  const d = new Date()
  d.setDate(0) // 전월 마지막 날
  return d.toISOString().slice(0, 10)
}

// --------------------------------------------------------------------------
// 서브 컴포넌트
// --------------------------------------------------------------------------

/**
 * 자본변동표 테이블 셀 (금액, 우측 정렬).
 */
function AmountCell({ amount, bold = false, negative = false }: { amount: string; bold?: boolean; negative?: boolean }) {
  const n = Number.parseInt(amount, 10)
  const isNeg = negative || (Number.isFinite(n) && n < 0)
  return (
    <td
      style={{
        textAlign: 'right',
        padding: '5px 10px',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: bold ? 700 : 400,
        fontSize: 14,
        color: isNeg ? 'var(--color-danger)' : 'var(--color-neutral-900)',
        whiteSpace: 'nowrap',
      }}
    >
      {fmtKrw(amount)}
    </td>
  )
}

/** 구분선. */
function Divider() {
  return (
    <div style={{ borderTop: '1px solid var(--color-neutral-200)', margin: '8px 0' }} />
  )
}

// --------------------------------------------------------------------------
// 메인 페이지
// --------------------------------------------------------------------------

/**
 * 자본변동표 메인 페이지.
 *
 * 상단: 기간 picker (from/to) + 조회 + 인쇄.
 * 본문: 자본금 / 이익잉여금 / 자본총계 기초→증감→기말 4열 표.
 */
export function EquityChangesPage() {
  const [fromDate, setFromDate] = useState<string>(yearStart())
  const [toDate, setToDate] = useState<string>(prevMonthEnd())
  const [queryFrom, setQueryFrom] = useState<string>(yearStart())
  const [queryTo, setQueryTo] = useState<string>(prevMonthEnd())

  usePageTitle('자본변동표', `${queryFrom} ~ ${queryTo}`)

  const query = useQuery<EquityChangesResponse>({
    queryKey: ['accounting', 'reports', 'equity-changes', queryFrom, queryTo],
    queryFn: () => getEquityChanges(queryFrom, queryTo),
  })

  const data = query.data
  const handleSearch = () => {
    setQueryFrom(fromDate)
    setQueryTo(toDate)
  }

  const handlePrint = () => {
    window.open(
      `/accounting/reports/equity-changes/print?fromDate=${queryFrom}&toDate=${queryTo}`,
      '_blank',
    )
  }

  // 자본 총계 계산
  const totalBeginning = data
    ? String(
        Number.parseInt(data.beginningCapitalStock, 10) +
        Number.parseInt(data.beginningRetainedEarnings, 10),
      )
    : '0'
  const totalEnding = data
    ? String(
        Number.parseInt(data.endingCapitalStock, 10) +
        Number.parseInt(data.endingRetainedEarnings, 10),
      )
    : '0'

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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>자본변동표</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label
            htmlFor="equity-from-date"
            style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 500 }}
          >
            시작일
          </label>
          <Input
            id="equity-from-date"
            type="date"
            inputSize="sm"
            fullWidth={false}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ width: 160 }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label
            htmlFor="equity-to-date"
            style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 500 }}
          >
            종료일
          </label>
          <Input
            id="equity-to-date"
            type="date"
            inputSize="sm"
            fullWidth={false}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
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
          <Spinner size="lg" label="자본변동표 불러오는 중" />
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
          자본변동표를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : data ? (
        <Card>
          {/* 화면 헤더 */}
          <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>자본변동표</div>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
              {data.fromDate} ~ {data.toDate}
            </div>
          </div>

          {/* 본문 표 */}
          <div
            data-testid="accounting-equity-changes-table"
            style={{ maxWidth: 700, margin: '0 auto', overflowX: 'auto' }}
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
                <col style={{ width: '28%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '24%' }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-neutral-900)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700 }}>
                    구분
                  </th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>
                    자본금
                  </th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>
                    이익잉여금
                  </th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>
                    자본 총계
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* 기초 잔액 */}
                <tr className="report-total-row">
                  <td style={{ padding: '5px 10px', fontWeight: 700, fontSize: 14 }}>기초 잔액</td>
                  <AmountCell amount={data.beginningCapitalStock} bold />
                  <AmountCell amount={data.beginningRetainedEarnings} bold />
                  <AmountCell amount={totalBeginning} bold />
                </tr>

                {/* 구분선 */}
                <tr>
                  <td
                    colSpan={4}
                    style={{ borderTop: '1px solid var(--color-neutral-200)', padding: 0, height: 4 }}
                  />
                </tr>

                {/* 자본금 증가 */}
                <tr>
                  <td style={{ padding: '5px 10px 5px 24px', color: 'var(--color-neutral-700)', fontSize: 13 }}>
                    증자 (유상/무상)
                  </td>
                  <AmountCell amount={data.capitalStockIncrease} />
                  <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--color-neutral-400)' }}>—</td>
                  <AmountCell amount={data.capitalStockIncrease} />
                </tr>

                {/* 자본금 감소 */}
                <tr>
                  <td style={{ padding: '5px 10px 5px 24px', color: 'var(--color-neutral-700)', fontSize: 13 }}>
                    감자
                  </td>
                  <AmountCell amount={data.capitalStockDecrease} negative />
                  <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--color-neutral-400)' }}>—</td>
                  <AmountCell amount={data.capitalStockDecrease} negative />
                </tr>

                {/* 당기순이익 */}
                <tr>
                  <td style={{ padding: '5px 10px 5px 24px', color: 'var(--color-neutral-700)', fontSize: 13 }}>
                    당기순이익
                  </td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--color-neutral-400)' }}>—</td>
                  <AmountCell amount={data.netIncome} />
                  <AmountCell amount={data.netIncome} />
                </tr>

                {/* 배당금 */}
                <tr>
                  <td style={{ padding: '5px 10px 5px 24px', color: 'var(--color-neutral-700)', fontSize: 13 }}>
                    배당금 지급
                  </td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--color-neutral-400)' }}>—</td>
                  <AmountCell amount={data.dividends} negative />
                  <AmountCell amount={data.dividends} negative />
                </tr>

                {/* 구분선 */}
                <tr>
                  <td
                    colSpan={4}
                    style={{ borderTop: '1px solid var(--color-neutral-200)', padding: 0, height: 4 }}
                  />
                </tr>

                {/* 기말 잔액 — grand-total */}
                <tr
                  className="report-grand-total-row"
                  style={{ borderTop: '2px solid var(--color-neutral-900)' }}
                >
                  <td style={{ padding: '7px 10px', fontWeight: 700, fontSize: 15 }}>기말 잔액</td>
                  <AmountCell amount={data.endingCapitalStock} bold />
                  <AmountCell amount={data.endingRetainedEarnings} bold />
                  <AmountCell amount={totalEnding} bold />
                </tr>
              </tbody>
            </table>

            <Divider />

            {/* 자본 총계 변동 요약 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 16,
                fontSize: 13,
                color: 'var(--color-neutral-600)',
                padding: '4px 8px',
              }}
            >
              <span>자본 총계 변동:</span>
              <span
                style={{
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color:
                    Number.parseInt(data.totalChange, 10) < 0
                      ? 'var(--color-danger)'
                      : 'var(--color-neutral-900)',
                }}
              >
                {fmtKrw(data.totalChange)}
              </span>
            </div>

            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: 'var(--color-neutral-400)',
                textAlign: 'right',
              }}
            >
              조회 기간: {queryFrom} ~ {queryTo}
            </div>
          </div>
        </Card>
      ) : null}
    </>
  )
}
