/**
 * 재무상태표 화면 (`/accounting/reports/balance-sheet`).
 *
 * 기준일 선택 → 조회 → 한국 일반기업회계기준 형식으로 표시.
 * 좌측(자산) / 우측(부채+자본) 두 열 형태.
 * `balanced=false` 시 상단 빨강 배너 표시.
 * 인쇄 시 새 창 (`/accounting/reports/balance-sheet/print`) 열기 (D5).
 *
 * 권한: ACCOUNTANT / MASTER 만 진입 (RoleGuard — AppRouter 에서 적용).
 *
 * UUID 비공개 가드: 화면에 UUID 일절 노출 안 함.
 * API: `GET /accounting/reports/balance-sheet?asOfDate=YYYY-MM-DD`
 *
 * PR #134 FE+Designer 결함 fix:
 * - D1: raw hex 전면 → design-system 토큰 교체
 * - D2: balanced=false 배너 / 균형텍스트 → state-danger/color-success 토큰
 * - D4: 자산합계/부채+자본합계 행에 .report-grand-total-row class 부여
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
  getBalanceSheet,
  type BalanceSheetLine,
  type BalanceSheetResponse,
} from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'

// --------------------------------------------------------------------------
// 유틸
// --------------------------------------------------------------------------

/** KRW 정수 string → "5,000,000" 형식 표시 (₩ 미포함). */
function fmtKrw(raw: string | number): string {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw
  if (!Number.isFinite(n)) return String(raw)
  if (n === 0) return '—'
  const abs = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n < 0 ? `(${abs})` : abs
}

/** 전월 말일 계산 (YYYY-MM-DD). */
function prevMonthEnd(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const lastDay = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

/**
 * F3: 클라이언트 sortOrder 정렬 — BE 정렬 보장 무관 안전망.
 */
function sortedLines(lines: BalanceSheetLine[]): BalanceSheetLine[] {
  return [...lines].sort((a, b) => a.sortOrder - b.sortOrder)
}

// --------------------------------------------------------------------------
// 서브 컴포넌트
// --------------------------------------------------------------------------

interface BsRowProps {
  label: string
  amount: string
  indent?: boolean
  isSummary?: boolean
  isGrandTotal?: boolean
}

/**
 * 재무상태표 열 단일 행.
 * `isSummary=true` 이면 굵게, 음수 빨강.
 * `isGrandTotal=true` 이면 .report-grand-total-row class 부여.
 * D1: raw hex → design-system 토큰 교체.
 * D4: isSummary → .report-total-row, isGrandTotal → .report-grand-total-row.
 */
function BsRow({ label, amount, indent = false, isSummary = false, isGrandTotal = false }: BsRowProps) {
  const n = Number.parseInt(amount, 10)
  const isNeg = Number.isFinite(n) && n < 0
  const className = isGrandTotal ? 'report-grand-total-row' : isSummary ? 'report-total-row' : undefined
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '3px 8px',
        paddingLeft: indent ? 28 : 8,
        fontWeight: isSummary || isGrandTotal ? 700 : 400,
        fontSize: 13,
        fontVariantNumeric: 'tabular-nums',
        borderRadius: 2,
      }}
    >
      {/* D1: color-neutral-900 (기존 #111827) — grand-total 은 CSS class 가 색상 override */}
      <span style={{ color: isGrandTotal ? undefined : 'var(--color-neutral-900)' }}>{label}</span>
      {/* D1: 음수 color-danger (기존 #DC2626) — grand-total 은 CSS class 가 색상 override */}
      <span style={{ color: isGrandTotal ? undefined : (isNeg ? 'var(--color-danger)' : 'var(--color-neutral-900)'), marginLeft: 8 }}>
        {fmtKrw(amount)}
      </span>
    </div>
  )
}

interface BsColumnProps {
  title: string
  lines: BalanceSheetLine[]
  totalLabel: string
  totalAmount: string
}

/**
 * 재무상태표 한 컬럼 (자산 또는 부채+자본).
 * D1: 컬럼 헤더 color-neutral-800 (기존 #1F2937), 하단선 color-neutral-700 (기존 #374151).
 */
function BsColumn({ title, lines, totalLabel, totalAmount }: BsColumnProps) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          /* D1: color-neutral-800 (기존 #1F2937) */
          color: 'var(--color-neutral-800)',
          /* D1: border color-neutral-700 (기존 #374151) */
          borderBottom: '2px solid var(--color-neutral-700)',
          paddingBottom: 6,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {lines.map((line) => (
        <BsRow
          key={line.accountCode}
          label={line.accountName}
          amount={line.amount}
          indent
        />
      ))}
      <div
        style={{
          /* D1: border color-neutral-400 (기존 #9CA3AF) */
          borderTop: '1px solid var(--color-neutral-400)',
          marginTop: 8,
          paddingTop: 6,
        }}
      >
        <BsRow label={totalLabel} amount={totalAmount} isSummary />
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// 인쇄 스타일 — D5: 인쇄는 새 창으로 이동하므로 최소화
// --------------------------------------------------------------------------
const PRINT_STYLES = `
@media print {
  .no-print { display: none !important; }
  .balance-sheet-print-header { display: block !important; }
  .balance-sheet-columns { flex-direction: row !important; }
}
.balance-sheet-print-header { display: none; }
`

// --------------------------------------------------------------------------
// 메인 페이지
// --------------------------------------------------------------------------

export function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState<string>(prevMonthEnd())
  const [queryDate, setQueryDate] = useState<string>(prevMonthEnd())

  usePageTitle('재무상태표', queryDate)

  const query = useQuery<BalanceSheetResponse>({
    queryKey: ['accounting', 'reports', 'balance-sheet', queryDate],
    queryFn: () => getBalanceSheet(queryDate),
  })

  const data = query.data

  const handleSearch = () => setQueryDate(asOfDate)

  /**
   * D5: 인쇄 버튼 → 새 창으로 인쇄 전용 레이아웃 열기.
   * asOfDate 파라미터를 query string 으로 전달.
   */
  const handlePrint = () => {
    window.open(
      `/accounting/reports/balance-sheet/print?asOfDate=${queryDate}`,
      '_blank',
    )
  }

  return (
    <>
      {/* 인쇄용 스타일 */}
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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>재무상태표</h3>
        {/* F2: design-system Input + htmlFor 접근성 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label
            htmlFor="balance-sheet-date"
            style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 500 }}
          >
            기준일
          </label>
          <Input
            id="balance-sheet-date"
            type="date"
            inputSize="sm"
            fullWidth={false}
            value={asOfDate}
            onChange={(e) => {
              if (e.target.value) setAsOfDate(e.target.value)
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

      {/* D2: 불균형 경고 배너 — state-danger-bg / state-danger 토큰 */}
      {data && !data.balanced ? (
        <div
          role="alert"
          style={{
            background: 'var(--state-danger-bg)',
            border: '1px solid var(--state-danger)',
            borderRadius: 6,
            padding: '12px 16px',
            marginBottom: 12,
            color: 'var(--state-danger)',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          자산 ≠ 부채+자본 — 분개 검증이 필요합니다. (자산:{' '}
          {fmtKrw(data.totalAssets)} / 부채+자본:{' '}
          {fmtKrw(data.totalLiabilitiesAndEquity)})
        </div>
      ) : null}

      {/* 로딩 / 에러 */}
      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spinner size="lg" label="재무상태표 불러오는 중" />
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
          재무상태표를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : data ? (
        <Card>
          {/* 인쇄 헤더 */}
          {/* D6: font-size → print token 변수 */}
          <div
            className="balance-sheet-print-header"
            style={{ textAlign: 'center', marginBottom: 24 }}
          >
            {/* D6: 보고서명 var(--print-text-lg) 18pt */}
            <div style={{ fontSize: 'var(--print-text-lg)', fontWeight: 700 }}>(주)삼한공조시스템</div>
            {/* D6: 화면 제목 16pt */}
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>재무상태표</div>
            {/* D1/D6: color-neutral-500 (기존 #6B7280), var(--print-text-sm) 11pt */}
            <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 4 }}>
              기준일: {data.asOfDate}
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>재무상태표</div>
            {/* D1: color-neutral-500 (기존 #6B7280) */}
            <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>기준일: {data.asOfDate}</div>
          </div>

          {/* 본문 — 좌(자산) / 우(부채+자본) 두 열 */}
          <div
            data-testid="accounting-balance-sheet-table"
            className="balance-sheet-columns"
            style={{
              display: 'flex',
              gap: 32,
              alignItems: 'flex-start',
            }}
          >
            {/* 좌: 자산 — F3: sortedLines 안전망 적용 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <BsColumn
                title="자산"
                lines={sortedLines(data.assets)}
                totalLabel="자산총계 (소계)"
                totalAmount={data.totalAssets}
              />
              {/* D3/D4: 자산합계 grand-total 행 */}
              <div style={{ borderTop: '2px solid var(--color-neutral-900)', marginTop: 12 }}>
                <BsRow label="자산 합계" amount={data.totalAssets} isGrandTotal />
              </div>
            </div>

            {/* 구분선 — D1: color-neutral-200 (기존 #D1D5DB) */}
            <div
              style={{
                width: 1,
                background: 'var(--color-neutral-200)',
                alignSelf: 'stretch',
                flexShrink: 0,
              }}
            />

            {/* 우: 부채 + 자본 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* 부채 */}
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  /* D1: color-neutral-800 (기존 #1F2937) */
                  color: 'var(--color-neutral-800)',
                  /* D1: border color-neutral-700 (기존 #374151) */
                  borderBottom: '2px solid var(--color-neutral-700)',
                  paddingBottom: 6,
                  marginBottom: 8,
                }}
              >
                부채
              </div>
              {/* F3: sortedLines 안전망 적용 */}
              {sortedLines(data.liabilities).map((line) => (
                <BsRow
                  key={line.accountCode}
                  label={line.accountName}
                  amount={line.amount}
                  indent
                />
              ))}
              <div
                /* D1: border color-neutral-400 (기존 #9CA3AF) */
                style={{ borderTop: '1px solid var(--color-neutral-400)', marginTop: 8, paddingTop: 6, marginBottom: 16 }}
              >
                <BsRow label="부채총계" amount={data.totalLiabilities} isSummary />
              </div>

              {/* 자본 */}
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  /* D1: color-neutral-800 (기존 #1F2937) */
                  color: 'var(--color-neutral-800)',
                  /* D1: border color-neutral-700 (기존 #374151) */
                  borderBottom: '2px solid var(--color-neutral-700)',
                  paddingBottom: 6,
                  marginBottom: 8,
                }}
              >
                자본
              </div>
              {/* F3: sortedLines 안전망 적용 */}
              {sortedLines(data.equity).map((line) => (
                <BsRow
                  key={line.accountCode}
                  label={line.accountName}
                  amount={line.amount}
                  indent
                />
              ))}
              <div
                /* D1: border color-neutral-400 (기존 #9CA3AF) */
                style={{ borderTop: '1px solid var(--color-neutral-400)', marginTop: 8, paddingTop: 6 }}
              >
                <BsRow label="자본총계" amount={data.totalEquity} isSummary />
              </div>

              {/* D3/D4: 부채+자본 합계 grand-total — .report-grand-total-row class (isGrandTotal) */}
              {/* D1: borderTop color-neutral-900 (기존 #111827) */}
              <div
                style={{
                  borderTop: '2px solid var(--color-neutral-900)',
                  marginTop: 12,
                }}
              >
                <BsRow
                  label="부채+자본 합계"
                  amount={data.totalLiabilitiesAndEquity}
                  isGrandTotal
                />
              </div>
            </div>
          </div>

          {/* D2: 균형 여부 텍스트 — color-success / color-danger 토큰 */}
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 16,
              fontSize: 13,
              /* D2: #059669 → color-success, #DC2626 → color-danger */
              color: data.balanced ? 'var(--color-success)' : 'var(--color-danger)',
              fontWeight: 600,
            }}
          >
            {data.balanced ? '균형 (자산 = 부채+자본)' : '불균형 — 분개 검토 필요'}
          </div>

          {/* 생성 시각 */}
          {/* D1: color-neutral-400 (기존 #9CA3AF) */}
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-neutral-400)', textAlign: 'right' }}>
            보고서 생성: {new Date(data.generatedAt).toLocaleString('ko-KR')}
          </div>
        </Card>
      ) : null}
    </>
  )
}
