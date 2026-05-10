/**
 * 부가세 신고서 인쇄 전용 레이아웃 컴포넌트.
 *
 * 라우트: `/accounting/reports/vat/print?period=YYYYMM`
 * 용지: A4 portrait (PrintLayout paper="a4-portrait" 재사용)
 *
 * REPORTS-DESIGN.md § 7 Props spec 준수.
 * `../../print/PrintLayout` 의 `PrintLayout`, `COMPANY`, `krw` 헬퍼 재사용.
 *
 * UUID 비공개 가드: period / 금액 만 표시. UUID 노출 없음.
 *
 * PR #134 회고:
 * - D1: raw hex 0건 — design-system 토큰만
 * - D3/D4: .report-total-row / .report-grand-total-row class + @media print 강제 색상
 * - D6: font-size → print token (--print-text-lg / --print-text-sm)
 */
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@samhan/design-system'
import {
  PrintLayout,
  COMPANY,
  krw,
} from '../../../print/PrintLayout'
import { getVatReport, type VatReportResponse } from '../../../api/accounting'

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

/** YYYYMM → "2026년 04월" */
function formatPeriodKo(period: string): string {
  if (!period || period.length < 6) return period
  return `${period.slice(0, 4)}년 ${period.slice(4, 6)}월`
}

// --------------------------------------------------------------------------
// 인쇄 전용 CSS
// --------------------------------------------------------------------------
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
.vat-report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--print-text-sm, 11pt);
  font-variant-numeric: tabular-nums;
}
.vat-report-table td {
  padding: 3pt 4pt;
  vertical-align: middle;
}
.vat-report-table td.amount {
  text-align: right;
  white-space: nowrap;
}
.vat-report-table td.count {
  text-align: right;
}
.vat-section-header td {
  font-weight: 600;
  font-size: var(--print-text-md, 12pt);
  padding-top: 6pt;
  padding-bottom: 2pt;
  color: var(--color-neutral-700);
  border-top: 1pt solid var(--color-neutral-200);
}
.vat-indent td:first-child {
  padding-left: 16pt;
}
.vat-divider td {
  border-top: 1pt solid var(--color-neutral-200);
  padding: 0;
  height: 4pt;
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
}
`

// --------------------------------------------------------------------------
// 서브 컴포넌트
// --------------------------------------------------------------------------

interface VatPrintRowProps {
  label: string
  value: string | number
  unit?: '원' | '매'
  indent?: boolean
  className?: string
}

function VatPrintRow({ label, value, unit = '원', indent = false, className }: VatPrintRowProps) {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value
  const isNeg = Number.isFinite(n) && n < 0
  const displayValue = unit === '매' ? `${String(value)} 매` : fmtAmount(String(value))

  return (
    <tr className={`${indent ? 'vat-indent' : ''} ${className ?? ''}`.trim()}>
      <td style={{ color: 'var(--color-neutral-900)' }}>{label}</td>
      <td
        className={unit === '매' ? 'count' : 'amount'}
        style={{ color: isNeg ? 'var(--color-danger)' : 'var(--color-neutral-900)' }}
      >
        {displayValue}
      </td>
    </tr>
  )
}

// --------------------------------------------------------------------------
// 메인 컴포넌트
// --------------------------------------------------------------------------

export function VatReportPrintLayout() {
  const [searchParams] = useSearchParams()
  const period = searchParams.get('period') ?? ''

  const query = useQuery<VatReportResponse>({
    queryKey: ['accounting', 'reports', 'vat', period],
    queryFn: () => getVatReport(period),
    enabled: Boolean(period),
  })

  return (
    <PrintLayout paper="a4-portrait">
      <style>{PRINT_CSS}</style>

      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spinner size="lg" label="부가세 신고서 불러오는 중" />
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
          부가세 신고서를 불러오지 못했습니다. (period: {period})
        </div>
      ) : !query.data ? (
        <div style={{ color: 'var(--color-neutral-500)', fontSize: 14 }}>
          조회 중... (period={period || '미지정'})
        </div>
      ) : (
        <VatReportPrintBody data={query.data} period={period} />
      )}
    </PrintLayout>
  )
}

interface BodyProps {
  data: VatReportResponse
  period: string
}

/** 부가세 신고서 인쇄 본문. */
function VatReportPrintBody({ data, period }: BodyProps) {
  const vatPayableN = Number.parseInt(data.vatPayable, 10)
  const isRefund = Number.isFinite(vatPayableN) && vatPayableN < 0

  return (
    <div style={{ fontFamily: 'var(--font-family-sans)', color: 'var(--color-neutral-900)' }}>
      {/* 헤더 */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{COMPANY.legalName}</div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 2 }}>
          사업자등록번호: {COMPANY.businessRegNo}
        </div>
        <div style={{ fontSize: 'var(--print-text-lg)', fontWeight: 700, marginTop: 8, letterSpacing: '0.2em' }}>
          부 가 세 신 고 서
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', marginTop: 6 }}>
          신고 기간: {data.fromDate} ~ {data.toDate} ({formatPeriodKo(period)})
        </div>
        <div style={{ fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', marginTop: 2 }}>
          작성일: {new Date().toLocaleDateString('ko-KR')} &nbsp;&nbsp; (단위: 원)
        </div>
      </div>

      {/* 본문 표 */}
      <table className="vat-report-table">
        <colgroup>
          <col style={{ width: '60%' }} />
          <col style={{ width: '40%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{
              textAlign: 'left',
              borderTop: '2pt solid var(--color-neutral-900)',
              borderBottom: '1pt solid var(--color-neutral-900)',
              padding: '4pt 4pt',
              fontSize: 'var(--print-text-md)',
              fontWeight: 700,
            }}>
              항 목
            </th>
            <th style={{
              textAlign: 'right',
              borderTop: '2pt solid var(--color-neutral-900)',
              borderBottom: '1pt solid var(--color-neutral-900)',
              padding: '4pt 4pt',
              fontSize: 'var(--print-text-md)',
              fontWeight: 700,
            }}>
              금 액
            </th>
          </tr>
        </thead>
        <tbody>
          {/* 매출 섹션 */}
          <tr className="vat-section-header">
            <td colSpan={2}>I. 매출 (Output VAT)</td>
          </tr>
          <VatPrintRow label="공급가액 합계" value={data.salesSupplyAmount} indent />
          <VatPrintRow label="부가세 합계" value={data.salesVatAmount} indent />
          <VatPrintRow
            label="총액 (공급가액 + 부가세)"
            value={String(
              Number.parseInt(data.salesSupplyAmount, 10)
              + Number.parseInt(data.salesVatAmount, 10),
            )}
            indent
          />
          <VatPrintRow
            label="세금계산서 발행 매수"
            value={data.salesInvoiceCount}
            unit="매"
            indent
          />
          <VatPrintRow
            label="매출 VAT 소계"
            value={data.salesVatAmount}
            className="report-total-row"
          />
          <tr className="vat-divider"><td colSpan={2} /></tr>

          {/* 매입 섹션 */}
          <tr className="vat-section-header">
            <td colSpan={2}>II. 매입 (Input VAT)</td>
          </tr>
          <VatPrintRow label="공급가액 합계" value={data.purchaseSupplyAmount} indent />
          <VatPrintRow label="부가세 합계" value={data.purchaseVatAmount} indent />
          <VatPrintRow
            label="총액 (공급가액 + 부가세)"
            value={String(
              Number.parseInt(data.purchaseSupplyAmount, 10)
              + Number.parseInt(data.purchaseVatAmount, 10),
            )}
            indent
          />
          <VatPrintRow
            label="세금계산서 수취 매수"
            value={data.purchaseInvoiceCount}
            unit="매"
            indent
          />
          <VatPrintRow
            label="매입 VAT 소계"
            value={data.purchaseVatAmount}
            className="report-total-row"
          />
          <tr className="vat-divider"><td colSpan={2} /></tr>

          {/* 납부세액 grand-total */}
          <tr
            className="report-grand-total-row"
            style={{ borderTop: '2pt solid var(--color-neutral-900)' }}
          >
            <td style={{ fontWeight: 700, fontSize: 'var(--print-text-md)', padding: '6pt 4pt' }}>
              {isRefund ? 'III. 환급세액' : 'III. 납부세액 (매출 VAT − 매입 VAT)'}
            </td>
            <td
              className="amount"
              style={{
                fontWeight: 700,
                fontSize: 'var(--print-text-md)',
                padding: '6pt 4pt',
                color: isRefund ? 'var(--color-danger)' : undefined,
              }}
            >
              {fmtAmount(data.vatPayable)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 신고 기한 */}
      <div style={{ marginTop: 12, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-700)' }}>
        신고 기한: <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{data.dueDate}</strong>
      </div>

      {/* 푸터 */}
      <div style={{ marginTop: 12, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-500)', textAlign: 'center' }}>
        본 보고서는 부가가치세법에 따라 작성됨
      </div>
      <div style={{ marginTop: 4, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-400)', textAlign: 'right' }}>
        보고서 생성: {new Date(data.generatedAt).toLocaleString('ko-KR')}
      </div>
    </div>
  )
}
