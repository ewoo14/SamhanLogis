/**
 * 부가세 신고서 화면 (`/accounting/reports/vat`).
 *
 * 분기/월 선택 → 조회 → 한국 부가세 신고서 간소형 표시.
 * 납부세액 = 매출 VAT - 매입 VAT. 음수 시 환급세액 빨강 표시.
 * 인쇄 시 새 창 (`/accounting/reports/vat/print`) 열기.
 *
 * 권한: ACCOUNTANT / MANAGER / MASTER (RoleGuard — AppRouter 적용).
 *
 * UUID 비공개 가드: 화면에 UUID 일절 노출 안 함.
 * API: `GET /accounting/reports/vat?period=YYYYMM`
 *
 * PR #134 회고 가드 준수:
 * - raw hex 0건 — design-system 토큰만 사용
 * - design-system Input 컴포넌트 (native input 금지)
 * - tabular-nums 금액 표시
 * - .report-total-row / .report-grand-total-row CSS class 부여
 * - sortOrder 정렬 안전망 (본 보고서는 집계형으로 정렬 없음)
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Input, Spinner } from '@samhan/design-system'
import { getVatReport, type VatReportResponse } from '../api/accounting'
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

/** YYYYMM → "2026년 04월" */
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

// --------------------------------------------------------------------------
// 서브 컴포넌트
// --------------------------------------------------------------------------
// D4 3열 테이블로 재구성 후 VatRow / SectionHeader / Divider 제거됨.

// --------------------------------------------------------------------------
// 메인 페이지
// --------------------------------------------------------------------------

/**
 * 부가세 신고서 메인 페이지.
 *
 * 상단: 회계 월 picker + 조회 + 인쇄.
 * 본문: 매출 섹션 / 매입 섹션 / 납부세액 grand-total.
 * 신고 기한 안내 + 보고서 생성 시각.
 */
export function VatReportPage() {
  const [period, setPeriod] = useState<string>(prevMonth())
  const [queryPeriod, setQueryPeriod] = useState<string>(prevMonth())

  usePageTitle('부가세 신고서', formatPeriodKo(queryPeriod))

  const query = useQuery<VatReportResponse>({
    queryKey: ['accounting', 'reports', 'vat', queryPeriod],
    queryFn: () => getVatReport(queryPeriod),
  })

  const data = query.data

  const handleSearch = () => setQueryPeriod(period)

  /** 인쇄 버튼 → 새 창 인쇄 전용 레이아웃. */
  const handlePrint = () => {
    window.open(
      `/accounting/reports/vat/print?period=${queryPeriod}`,
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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>부가세 신고서</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label
            htmlFor="vat-report-period"
            style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 500 }}
          >
            신고 기간 (월)
          </label>
          <Input
            id="vat-report-period"
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
          <Spinner size="lg" label="부가세 신고서 불러오는 중" />
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
          부가세 신고서를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : data ? (
        <Card>
          {/* 화면 헤더 */}
          <div
            className="no-print"
            style={{ textAlign: 'center', marginBottom: 16 }}
          >
            <div style={{ fontSize: 16, fontWeight: 700 }}>부가세 신고서</div>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
              {data.fromDate} ~ {data.toDate}
            </div>
          </div>

          {/* 본문 — D4: 3열 테이블 (과목 50% / 공급가액 30% / 세액 20%) REPORTS-B-DESIGN §4 */}
          <div
            data-testid="accounting-vat-report-table"
            style={{ maxWidth: 640, margin: '0 auto' }}
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
                <col style={{ width: '50%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-neutral-900)' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>
                    과목
                  </th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>
                    공급가액
                  </th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>
                    세액
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* 매출 섹션 */}
                <tr style={{ borderTop: '1px solid var(--color-neutral-200)', marginTop: 8 }}>
                  <td
                    colSpan={3}
                    style={{
                      padding: '6px 8px 2px',
                      fontWeight: 600,
                      fontSize: 13,
                      color: 'var(--color-neutral-700)',
                    }}
                  >
                    I. 매출 (Output VAT)
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px 4px 24px', color: 'var(--color-neutral-900)' }}>
                    세금계산서 ({data.salesInvoiceCount}매)
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--color-neutral-900)' }}>
                    {fmtKrw(data.salesSupplyAmount)}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--color-neutral-900)' }}>
                    {fmtKrw(data.salesVatAmount)}
                  </td>
                </tr>
                <tr className="report-total-row">
                  <td style={{ padding: '4px 8px', fontWeight: 700 }}>매출 소계</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>
                    {fmtKrw(data.salesSupplyAmount)}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>
                    {fmtKrw(data.salesVatAmount)}
                  </td>
                </tr>

                {/* 구분선 행 */}
                <tr><td colSpan={3} style={{ borderTop: '1px solid var(--color-neutral-200)', padding: 0, height: 4 }} /></tr>

                {/* 매입 섹션 */}
                <tr>
                  <td
                    colSpan={3}
                    style={{
                      padding: '6px 8px 2px',
                      fontWeight: 600,
                      fontSize: 13,
                      color: 'var(--color-neutral-700)',
                    }}
                  >
                    II. 매입 (Input VAT)
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px 4px 24px', color: 'var(--color-neutral-900)' }}>
                    세금계산서 ({data.purchaseInvoiceCount}매)
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--color-neutral-900)' }}>
                    {fmtKrw(data.purchaseSupplyAmount)}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--color-neutral-900)' }}>
                    {fmtKrw(data.purchaseVatAmount)}
                  </td>
                </tr>
                <tr className="report-total-row">
                  <td style={{ padding: '4px 8px', fontWeight: 700 }}>매입 소계</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>
                    {fmtKrw(data.purchaseSupplyAmount)}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>
                    {fmtKrw(data.purchaseVatAmount)}
                  </td>
                </tr>

                {/* 납부세액 grand-total */}
                <tr
                  className="report-grand-total-row"
                  style={{ borderTop: '2px solid var(--color-neutral-900)' }}
                >
                  <td style={{ padding: '8px 8px', fontWeight: 700, fontSize: 15 }}>
                    III. 납부세액 (매출 VAT − 매입 VAT)
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, fontSize: 15 }}>—</td>
                  <td
                    style={{
                      padding: '8px 8px',
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: 15,
                      color:
                        Number.parseInt(data.vatPayable, 10) < 0
                          ? 'var(--color-danger)'
                          : undefined,
                    }}
                  >
                    {fmtKrw(data.vatPayable)}
                  </td>
                </tr>
              </tbody>
            </table>

            {Number.parseInt(data.vatPayable, 10) < 0 ? (
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
                납부세액이 음수입니다 — 환급세액으로 처리됩니다.
              </div>
            ) : null}

            {/* 신고 기한 — D1 .deadline-banner (REPORTS-B-DESIGN §2-3) */}
            <div className="deadline-banner" style={{ marginTop: 16, fontSize: 13 }}>
              신고 기한:{' '}
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                {data.filingDeadline}
              </strong>
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
