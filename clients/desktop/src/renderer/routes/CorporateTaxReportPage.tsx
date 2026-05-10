/**
 * 법인세 신고서 화면 (`/accounting/reports/corporate-tax`).
 *
 * 사업연도 선택 → 조회 → 한국 법인세 신고서 형식 표시.
 * 과세표준 → 단계별 세율 적용(2억 이하 9%, 200억 이하 19%) → 산출세액 → 차감납부세액.
 * 인쇄 시 새 창 (`/accounting/reports/corporate-tax/print`) 열기.
 *
 * 권한: ACCOUNTANT / MANAGER / MASTER (RoleGuard — AppRouter 적용).
 *
 * UUID 비공개 가드: 화면에 UUID 일절 노출 안 함.
 * API: `GET /accounting/reports/corporate-tax?fiscalYear=YYYY`
 *
 * PR #134 회고 가드:
 * - raw hex 0건 — design-system 토큰만
 * - design-system Input (native input 금지)
 * - tabular-nums 금액
 * - .report-total-row / .report-grand-total-row class 부여
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Input, Spinner } from '@samhan/design-system'
import { getCorporateTaxReport, type CorporateTaxReportResponse } from '../api/accounting'
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

/** 법인세 단계별 세율 적용 — 한국 법인세법 제55조 기준 (2024년 기준). */
function calcTaxBrackets(taxableIncome: number): Array<{
  label: string
  taxAmount: number
}> {
  const brackets = [
    { limit: 200_000_000, rate: 0.09, label: '2억 이하 9%' },
    { limit: 20_000_000_000, rate: 0.19, label: '200억 이하 19%' },
    { limit: 300_000_000_000, rate: 0.21, label: '3,000억 이하 21%' },
    { limit: Number.POSITIVE_INFINITY, rate: 0.24, label: '3,000억 초과 24%' },
  ]

  let remaining = taxableIncome
  let prevLimit = 0
  const result: Array<{ label: string; taxAmount: number }> = []

  for (const bracket of brackets) {
    if (remaining <= 0) break
    const base = Math.min(remaining, bracket.limit - prevLimit)
    const tax = Math.round(base * bracket.rate)
    if (base > 0) {
      result.push({ label: bracket.label, taxAmount: tax })
    }
    remaining -= base
    prevLimit = bracket.limit
  }

  return result
}

// --------------------------------------------------------------------------
// 서브 컴포넌트
// --------------------------------------------------------------------------

interface TaxRowProps {
  label: string
  value: string | number
  indent?: boolean
  isSummary?: boolean
  isGrandTotal?: boolean
  isAddition?: boolean
}

/**
 * 법인세 신고서 1행.
 * D4: isSummary → .report-total-row, isGrandTotal → .report-grand-total-row.
 */
function TaxRow({
  label,
  value,
  indent = false,
  isSummary = false,
  isGrandTotal = false,
  isAddition = false,
}: TaxRowProps) {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value
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
        fontWeight: isSummary || isGrandTotal ? 700 : 400,
        fontSize: 14,
        fontVariantNumeric: 'tabular-nums',
        borderRadius: 2,
      }}
    >
      <span style={{ color: 'var(--color-neutral-900)' }}>
        {isAddition && !isNeg ? '+  ' : ''}
        {label}
      </span>
      <span
        style={{
          color: isNeg ? 'var(--color-danger)' : 'var(--color-neutral-900)',
        }}
      >
        {fmtKrw(typeof value === 'number' ? String(value) : value)}
      </span>
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
 * 법인세 신고서 메인 페이지.
 *
 * 상단: 사업연도 picker + 조회 + 인쇄.
 * 본문: 손익 → 조정 → 과세표준 → 단계별 세율 → 산출세액 → 납부세액.
 */
export function CorporateTaxReportPage() {
  const currentYear = new Date().getFullYear()
  const [fiscalYear, setFiscalYear] = useState<number>(currentYear - 1)
  const [queryYear, setQueryYear] = useState<number>(currentYear - 1)

  usePageTitle('법인세 신고서', `${queryYear}년`)

  const query = useQuery<CorporateTaxReportResponse>({
    queryKey: ['accounting', 'reports', 'corporate-tax', queryYear],
    queryFn: () => getCorporateTaxReport(queryYear),
  })

  const data = query.data

  const handleSearch = () => setQueryYear(fiscalYear)

  /** 인쇄 버튼 → 새 창 인쇄 전용 레이아웃. */
  const handlePrint = () => {
    window.open(
      `/accounting/reports/corporate-tax/print?fiscalYear=${queryYear}`,
      '_blank',
    )
  }

  const taxBrackets = data
    ? calcTaxBrackets(Number.parseInt(data.taxableIncome, 10))
    : []

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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>법인세 신고서</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label
            htmlFor="corp-tax-fiscal-year"
            style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 500 }}
          >
            사업연도
          </label>
          <Input
            id="corp-tax-fiscal-year"
            type="number"
            inputSize="sm"
            fullWidth={false}
            value={String(fiscalYear)}
            onChange={(e) => {
              const y = Number.parseInt(e.target.value, 10)
              if (y >= 2000 && y <= 2099) setFiscalYear(y)
            }}
            style={{ width: 100 }}
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
          <Spinner size="lg" label="법인세 신고서 불러오는 중" />
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
          법인세 신고서를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : data ? (
        <Card>
          {/* 화면 헤더 */}
          <div
            className="no-print"
            style={{ textAlign: 'center', marginBottom: 16 }}
          >
            <div style={{ fontSize: 16, fontWeight: 700 }}>법인세 신고서</div>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
              사업연도: {data.fiscalYear}년
            </div>
          </div>

          {/* 본문 */}
          <div
            data-testid="accounting-corporate-tax-report-table"
            style={{ maxWidth: 560, margin: '0 auto' }}
          >
            {/* 손익 및 조정 */}
            <TaxRow
              label="법인세차감전순이익"
              value={data.incomeBeforeTax}
            />
            <TaxRow
              label="가산조정"
              value={data.addBack}
              indent
              isAddition
            />
            <TaxRow
              label="차감조정"
              value={`-${data.deductions}`}
              indent
            />

            <Divider />

            {/* 과세표준 */}
            <TaxRow
              label="과세표준"
              value={data.taxableIncome}
              isSummary
            />

            <Divider />

            {/* 단계별 세율 */}
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: 'var(--color-neutral-700)',
                padding: '6px 8px 2px',
              }}
            >
              세율 적용 (단계별)
            </div>
            {taxBrackets.map((b) => (
              <TaxRow
                key={b.label}
                label={b.label}
                value={String(b.taxAmount)}
                indent
              />
            ))}

            <Divider />

            {/* 산출세액 */}
            <TaxRow
              label="산출세액"
              value={data.calculatedTax}
              isSummary
            />

            {/* 기납부세액 */}
            <TaxRow
              label="기납부세액 (중간예납)"
              value={`-${data.prepaidTax}`}
              indent
            />

            <Divider />

            {/* 차감납부세액 grand-total */}
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
              <span>차감납부세액</span>
              <span
                style={{
                  color:
                    Number.parseInt(data.taxPayable, 10) < 0
                      ? 'var(--color-danger)'
                      : undefined,
                }}
              >
                {fmtKrw(data.taxPayable)}
              </span>
            </div>

            {Number.parseInt(data.taxPayable, 10) < 0 ? (
              <div
                role="note"
                style={{
                  marginTop: 8,
                  padding: '6px 8px',
                  background: 'var(--state-warning-bg)',
                  border: '1px solid var(--state-warning)',
                  borderRadius: 4,
                  fontSize: 13,
                  color: 'var(--state-warning)',
                }}
              >
                차감납부세액이 음수입니다 — 환급 처리 예정.
              </div>
            ) : null}

            {/* 신고 기한 */}
            <div
              style={{
                marginTop: 16,
                padding: '8px',
                background: 'var(--color-bg-subtle)',
                borderRadius: 4,
                fontSize: 13,
                color: 'var(--color-neutral-700)',
              }}
            >
              신고 기한:{' '}
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                {data.dueDate}
              </strong>{' '}
              (12월 결산 법인 기준)
            </div>

            {/* 생성 시각 */}
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: 'var(--color-neutral-400)',
                textAlign: 'right',
              }}
            >
              보고서 생성: {new Date(data.generatedAt).toLocaleString('ko-KR')}
            </div>
          </div>
        </Card>
      ) : null}
    </>
  )
}
