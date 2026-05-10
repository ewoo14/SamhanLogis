/**
 * 재무상태표 화면 (`/accounting/reports/balance-sheet`).
 *
 * 기준일 선택 → 조회 → 한국 일반기업회계기준 형식으로 표시.
 * 좌측(자산) / 우측(부채+자본) 두 열 형태.
 * `balanced=false` 시 상단 빨강 배너 표시.
 * 인쇄 시 "(주)삼한공조시스템" 헤더 + 기준일 포함.
 *
 * 권한: ACCOUNTANT / MANAGER / MASTER 진입 (RoleGuard — AppRouter 에서 적용, BE @PreAuthorize 일치).
 *
 * UUID 비공개 가드: 화면에 UUID 일절 노출 안 함.
 * API: `GET /accounting/reports/balance-sheet?asOfDate=YYYY-MM-DD`
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
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

// --------------------------------------------------------------------------
// 서브 컴포넌트
// --------------------------------------------------------------------------

interface BsRowProps {
  label: string
  amount: string
  indent?: boolean
  isSummary?: boolean
}

/**
 * 재무상태표 열 단일 행.
 * `isSummary=true` 이면 굵게, 음수 빨강.
 */
function BsRow({ label, amount, indent = false, isSummary = false }: BsRowProps) {
  const n = Number.parseInt(amount, 10)
  const isNeg = Number.isFinite(n) && n < 0
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '3px 0',
        paddingLeft: indent ? 20 : 0,
        fontWeight: isSummary ? 700 : 400,
        fontSize: 13,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ color: '#111827' }}>{label}</span>
      <span style={{ color: isNeg ? '#DC2626' : '#111827', marginLeft: 8 }}>{fmtKrw(amount)}</span>
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
 * 빈 라인 목록이면 최소 플레이스홀더 표시.
 */
function BsColumn({ title, lines, totalLabel, totalAmount }: BsColumnProps) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          color: '#1F2937',
          borderBottom: '2px solid #374151',
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
          borderTop: '1px solid #9CA3AF',
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
// 인쇄 스타일
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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>재무상태표</h3>
        <label style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
          기준일:
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => {
              if (e.target.value) setAsOfDate(e.target.value)
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

      {/* 불균형 경고 배너 */}
      {data && !data.balanced ? (
        <div
          role="alert"
          style={{
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 6,
            padding: '12px 16px',
            marginBottom: 12,
            color: '#991B1B',
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
          재무상태표를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : data ? (
        <Card>
          {/* 인쇄 헤더 */}
          <div
            className="balance-sheet-print-header"
            style={{ textAlign: 'center', marginBottom: 24 }}
          >
            <div style={{ fontSize: 22, fontWeight: 700 }}>(주)삼한공조시스템</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>재무상태표</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
              기준일: {data.asOfDate}
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>재무상태표</div>
            <div style={{ fontSize: 13, color: '#6B7280' }}>기준일: {data.asOfDate}</div>
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
            {/* 좌: 자산 */}
            <BsColumn
              title="자산"
              lines={data.assets}
              totalLabel="자산총계"
              totalAmount={data.totalAssets}
            />

            {/* 구분선 */}
            <div
              style={{
                width: 1,
                background: '#D1D5DB',
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
                  color: '#1F2937',
                  borderBottom: '2px solid #374151',
                  paddingBottom: 6,
                  marginBottom: 8,
                }}
              >
                부채
              </div>
              {data.liabilities.map((line) => (
                <BsRow
                  key={line.accountCode}
                  label={line.accountName}
                  amount={line.amount}
                  indent
                />
              ))}
              <div
                style={{ borderTop: '1px solid #9CA3AF', marginTop: 8, paddingTop: 6, marginBottom: 16 }}
              >
                <BsRow label="부채총계" amount={data.totalLiabilities} isSummary />
              </div>

              {/* 자본 */}
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: '#1F2937',
                  borderBottom: '2px solid #374151',
                  paddingBottom: 6,
                  marginBottom: 8,
                }}
              >
                자본
              </div>
              {data.equity.map((line) => (
                <BsRow
                  key={line.accountCode}
                  label={line.accountName}
                  amount={line.amount}
                  indent
                />
              ))}
              <div
                style={{ borderTop: '1px solid #9CA3AF', marginTop: 8, paddingTop: 6 }}
              >
                <BsRow label="자본총계" amount={data.totalEquity} isSummary />
              </div>

              {/* 부채 + 자본 합계 */}
              <div
                style={{
                  borderTop: '2px solid #111827',
                  marginTop: 12,
                  paddingTop: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  fontSize: 14,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span>부채+자본 합계</span>
                <span>{fmtKrw(data.totalLiabilitiesAndEquity)}</span>
              </div>
            </div>
          </div>

          {/* 균형 여부 */}
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 16,
              fontSize: 13,
              color: data.balanced ? '#059669' : '#DC2626',
              fontWeight: 600,
            }}
          >
            {data.balanced ? '균형 (자산 = 부채+자본)' : '불균형 — 분개 검토 필요'}
          </div>

          {/* 생성 시각 */}
          <div style={{ marginTop: 8, fontSize: 12, color: '#9CA3AF', textAlign: 'right' }}>
            보고서 생성: {new Date(data.generatedAt).toLocaleString('ko-KR')}
          </div>
        </Card>
      ) : null}
    </>
  )
}
