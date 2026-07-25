/**
 * 거래처별 미수/미지급 잔액 화면 (`/accounting/reports/partner-aging`).
 *
 * URL query `?type=RECEIVABLE` 또는 `?type=PAYABLE` 로 모드 결정.
 * 기준일 선택 → 조회 → 거래처별 잔액 + 연체일수 표 표시.
 * 인쇄 시 새 창 (`/accounting/reports/partner-aging/print`) 열기.
 * Excel 다운로드 (CSV) — 브라우저 Blob API 활용.
 *
 * 권한: ACCOUNTANT / MANAGER / MASTER (RoleGuard — AppRouter 적용).
 *
 * UUID 비공개 가드:
 * - `PartnerAgingLine` 응답에는 partner UUID 를 포함하지 않는다 (feedback_uuid_no_user_visibility).
 * - 사용자에게 노출되는 식별자: `bizNo` / `partnerName` 만.
 *
 * API: `GET /accounting/reports/partner-aging?asOfDate=YYYY-MM-DD&type=RECEIVABLE|PAYABLE`
 *
 * PR #134 회고 가드:
 * - raw hex 0건 — design-system 토큰만
 * - design-system Input (native input 금지)
 * - tabular-nums 금액
 * - .report-total-row / .report-grand-total-row class 부여
 * - 연체일수 Badge: 30일 이하 neutral / 31-60일 warning / 61일 이상 danger
 * - 클라이언트 sortOrder 정렬 안전망 (잔액 내림차순 agingDays 내림차순)
 */
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Input, Spinner } from '@samhan/design-system'
import { getPartnerAging, type PartnerAgingResponse, type PartnerAgingLine } from '../api/accounting'
import { PartnerLookupErrorBanner } from '../components/common/PartnerLookupErrorBanner'
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

/** 전월말일 계산. */
function prevMonthEnd(): string {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  d.setDate(0) // 전월 마지막 일
  return d.toISOString().slice(0, 10)
}

/**
 * 클라이언트 정렬 안전망 — agingDays 내림차순 (연체 심각 순).
 * BE 정렬 보장 무관.
 */
function sortedLines(lines: PartnerAgingLine[]): PartnerAgingLine[] {
  return [...lines].sort((a, b) => b.agingDays - a.agingDays)
}

/**
 * 연체일수 → 행 배경 CSS 클래스 (D3 — REPORTS-B-DESIGN §2-2 / §8).
 * 경계값: >= 60 위험(danger), >= 30 주의(warning).
 * 60일 정확히는 위험 구간.
 */
function agingClass(agingDays: number): string {
  if (agingDays >= 60) return 'aging-overdue-danger'
  if (agingDays >= 30) return 'aging-overdue-warning'
  return ''
}

/**
 * 연체일수 → Badge 스타일.
 * - 0–29일: neutral (회색)
 * - 30–59일: warning (노랑)
 * - 60일 이상: danger (빨강)
 * 경계값 정정 (D3): >= 60 / >= 30 (기존 > 60 / > 30 오차 수정).
 */
function agingBadgeStyle(agingDays: number): React.CSSProperties {
  if (agingDays >= 60) {
    return {
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
      background: 'var(--state-danger-bg)',
      color: 'var(--state-danger)',
      fontVariantNumeric: 'tabular-nums',
    }
  }
  if (agingDays >= 30) {
    return {
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
      background: 'var(--state-warning-bg)',
      color: 'var(--state-warning)',
      fontVariantNumeric: 'tabular-nums',
    }
  }
  return {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 600,
    background: 'var(--color-bg-muted)',
    color: 'var(--color-neutral-600)',
    fontVariantNumeric: 'tabular-nums',
  }
}

/** CSV 다운로드 — Blob API (UUID 는 포함 안 함). */
function downloadCsv(data: PartnerAgingResponse): void {
  const header = '거래처코드,거래처명,잔액,가장오래된일자,연체일수'
  const rows = (data.lines ?? []).map((l) =>
    [l.bizNo?.replace(/\D/g, '') ?? '', l.partnerName, l.balance, l.oldestUnpaidDate ?? '', l.agingDays].join(','),
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `partner-aging-${data.type}-${data.asOfDate}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// --------------------------------------------------------------------------
// import for React.CSSProperties type
// --------------------------------------------------------------------------
import type React from 'react'

// --------------------------------------------------------------------------
// 서브 컴포넌트
// --------------------------------------------------------------------------

/**
 * 연체 범례 — 색상 의미 설명.
 */
function AgingLegend() {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        marginBottom: 12,
        fontSize: 12,
        alignItems: 'center',
      }}
    >
      <span style={{ color: 'var(--color-neutral-500)' }}>연체일수:</span>
      <span style={agingBadgeStyle(10)}>30일 이하</span>
      <span style={agingBadgeStyle(45)}>31~60일</span>
      <span style={agingBadgeStyle(90)}>61일 이상</span>
    </div>
  )
}

// --------------------------------------------------------------------------
// 메인 페이지
// --------------------------------------------------------------------------

/**
 * 거래처별 미수/미지급 메인 페이지.
 *
 * URL `?type=RECEIVABLE` → 미수금 (외상매출금), `?type=PAYABLE` → 미지급금 (외상매입금).
 * 상단: 기준일 picker + type radio + 조회 + 인쇄 + CSV 다운로드.
 * 본문: 요약 카드 + 거래처별 표 (연체일수 Badge 포함).
 */
export function PartnerAgingPage() {
  const [searchParams] = useSearchParams()
  const urlType = searchParams.get('type')
  const initType: 'RECEIVABLE' | 'PAYABLE' =
    urlType === 'PAYABLE' ? 'PAYABLE' : 'RECEIVABLE'

  const [asOfDate, setAsOfDate] = useState<string>(prevMonthEnd())
  const [type, setType] = useState<'RECEIVABLE' | 'PAYABLE'>(initType)
  const [queryAsOfDate, setQueryAsOfDate] = useState<string>(prevMonthEnd())
  const [queryType, setQueryType] = useState<'RECEIVABLE' | 'PAYABLE'>(initType)

  const typeLabel = queryType === 'RECEIVABLE' ? '미수금' : '미지급금'
  usePageTitle(`거래처별 ${typeLabel}`, queryAsOfDate)

  const query = useQuery<PartnerAgingResponse>({
    queryKey: ['accounting', 'reports', 'partner-aging', queryAsOfDate, queryType],
    queryFn: () => getPartnerAging(queryAsOfDate, queryType),
  })

  const data = query.data

  const handleSearch = () => {
    setQueryAsOfDate(asOfDate)
    setQueryType(type)
  }

  const handlePrint = () => {
    window.open(
      `/accounting/reports/partner-aging/print?asOfDate=${queryAsOfDate}&type=${queryType}`,
      '_blank',
    )
  }

  const handleDownloadCsv = () => {
    if (!data) return
    downloadCsv(data)
  }

  const lines = data ? sortedLines(data.lines) : []

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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          거래처별 {type === 'RECEIVABLE' ? '미수금' : '미지급금'}
        </h3>

        {/* 기준일 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label
            htmlFor="partner-aging-date"
            style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 500 }}
          >
            기준일
          </label>
          <Input
            id="partner-aging-date"
            type="date"
            inputSize="sm"
            fullWidth={false}
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            style={{ width: 160 }}
          />
        </div>

        {/* 유형 선택 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 500 }}>
            유형
          </span>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 14 }}>
            <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                name="partner-aging-type"
                value="RECEIVABLE"
                checked={type === 'RECEIVABLE'}
                onChange={() => setType('RECEIVABLE')}
              />
              미수금 (외상매출금)
            </label>
            <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                name="partner-aging-type"
                value="PAYABLE"
                checked={type === 'PAYABLE'}
                onChange={() => setType('PAYABLE')}
              />
              미지급금 (외상매입금)
            </label>
          </div>
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
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDownloadCsv}
          disabled={!data}
        >
          Excel (CSV)
        </Button>
      </div>

      {/* 로딩 / 에러 / 본문 */}
      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <Spinner size="lg" label="거래처 잔액 불러오는 중" />
        </div>
      ) : query.isError ? (
        // #831 R-2: 이전엔 "백엔드 연결을 확인하세요"로 사용자 귀책·설치 문제로 오인시켰고
        // 재시도 수단도 없었다. BE 가 만든 정확한 원인 문구(거래처 서비스 일시 장애)를 그대로
        // 노출하고 재시도 버튼을 제공한다.
        <PartnerLookupErrorBanner
          error={query.error}
          onRetry={() => query.refetch()}
          subject="거래처 잔액"
        />
      ) : data ? (
        <Card>
          {/* 요약 */}
          <div
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              background: 'var(--color-bg-subtle)',
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
              {data.accountCode} {data.accountName}
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <span>
                기준일:{' '}
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {data.asOfDate}
                </strong>
              </span>
              <span>
                거래처 수:{' '}
                <strong>{data.partnerCount}</strong>개
              </span>
              <span>
                합계 잔액:{' '}
                <strong
                  className="report-total-row"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {fmtKrw(data.totalAmount)}
                </strong>{' '}
                원
              </span>
            </div>
          </div>

          {/* 범례 */}
          <AgingLegend />

          {/* 표 */}
          <div style={{ overflowX: 'auto' }}>
            <table
              data-testid="accounting-partner-aging-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 14,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '2px solid var(--color-neutral-900)',
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>거래처코드</th>
                  <th style={{ padding: '6px 8px' }}>거래처명</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>잔액</th>
                  <th style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    가장 오래된 일자
                  </th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    연체일수
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const overdueCls = agingClass(line.agingDays)
                  return (
                  <tr
                    key={line.partnerCode}
                    className={overdueCls || undefined}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      background:
                        overdueCls
                          ? undefined
                          : idx % 2 === 0
                          ? 'transparent'
                          : 'var(--color-bg-subtle)',
                    }}
                  >
                    <td
                      style={{
                        padding: '6px 8px',
                        color: 'var(--color-neutral-700)',
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {line.bizNo?.replace(/\D/g, '') || '—'}
                    </td>
                    <td style={{ padding: '6px 8px', fontWeight: 500 }}>
                      {line.partnerName}
                    </td>
                    <td
                      style={{
                        padding: '6px 8px',
                        textAlign: 'right',
                        color: 'var(--color-neutral-900)',
                      }}
                    >
                      {fmtKrw(line.balance)}
                    </td>
                    <td
                      style={{
                        padding: '6px 8px',
                        color: 'var(--color-neutral-600)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {line.oldestUnpaidDate ?? '—'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <span style={agingBadgeStyle(line.agingDays)}>
                        {line.agingDays}일
                      </span>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
              {/* 합계 행 */}
              <tfoot>
                <tr
                  className="report-grand-total-row"
                  style={{
                    borderTop: '2px solid var(--color-neutral-900)',
                  }}
                >
                  <td
                    colSpan={2}
                    style={{ padding: '6px 8px', fontWeight: 700 }}
                  >
                    합계
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontWeight: 700,
                    }}
                  >
                    {fmtKrw(data.totalAmount)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
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
        </Card>
      ) : null}
    </>
  )
}
