/**
 * KFTC 오픈뱅킹 입금 매칭 화면 (SP-09-4).
 *
 * <h2>용도</h2>
 * 기간 + 계좌 핀번호(accountFinNo) 기준으로 KFTC 오픈뱅킹 입금 내역을 조회하고
 * 거래처 및 세금계산서를 자동 매칭한다. shell 단계에서는 DRY_RUN 모드가 고정이며
 * Phase 11 sandbox 연동 후 KFTC 모드가 활성화된다.
 *
 * <h2>권한 가드</h2>
 * <ul>
 *   <li>ACCOUNTANT / MANAGER / MASTER 만 접근 가능.</li>
 *   <li>그 외 role 진입 시 RoleGuard 가 403 화면을 표시.</li>
 * </ul>
 *
 * <h2>4개 영역</h2>
 * <ol>
 *   <li>조회 폼 — 날짜 범위 + 계좌 핀번호 + submitMethod 안내 (DRY_RUN 고정)</li>
 *   <li>조회 결과 요약 — 총 / 매칭 / 미매칭 카운트 Badge</li>
 *   <li>결과 테이블 — 입금자명 / 금액 / 거래일 / 매칭 거래처코드 / 매칭 세금계산서번호 / 상태 Badge</li>
 *   <li>422 / 502 한국어 에러 (role="alert")</li>
 * </ol>
 *
 * <h2>UUID 비공개</h2>
 * <p>BE {@code DepositMatchResultDto} 는 UUID 를 응답에 포함하지 않는다
 * (feedback_uuid_no_user_visibility). 사용자 표시 식별자는
 * {@code matchedPartnerCode} / {@code matchedTaxInvoiceNo} 텍스트만 사용.
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code deposit-match-from / deposit-match-to / deposit-match-account-fin-no}</li>
 *   <li>{@code deposit-match-submit-btn / deposit-match-reset-btn}</li>
 *   <li>{@code deposit-match-summary}</li>
 *   <li>{@code deposit-match-table / deposit-match-row-{n}}</li>
 *   <li>{@code deposit-match-error}</li>
 * </ul>
 */
import { useState } from 'react'
import axios from 'axios'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@samhan/design-system'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  fetchAndMatchDeposits,
  DepositValidationError,
  KftcGatewayError,
  type DepositMatchResponse,
  type DepositMatchResult,
} from '../api/depositMatchApi'

// ---------------------------------------------------------------------------
// 유틸 함수
// ---------------------------------------------------------------------------

function formatKrw(value: number): string {
  return value.toLocaleString('ko-KR') + '원'
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${year}년 ${month}월 ${day}일`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthStartIso(): string {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// 에러 메시지 변환
// ---------------------------------------------------------------------------

function toUserMessage(err: unknown): string {
  if (err instanceof DepositValidationError) {
    return err.message
  }
  if (err instanceof KftcGatewayError) {
    return err.message
  }
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined
    if (data?.message) return data.message
    const status = err.response?.status
    if (status === 422) return '입력값 검증에 실패했습니다. 날짜 범위 및 계좌 핀번호를 확인하세요.'
    if (status === 502) return 'KFTC 오픈뱅킹 외부 서비스에 일시적 오류가 발생했습니다. 잠시 후 다시 시도하세요.'
    return `요청에 실패했습니다. (HTTP ${status ?? '알 수 없음'})`
  }
  if (err instanceof Error) return err.message
  return '알 수 없는 오류가 발생했습니다.'
}

// ---------------------------------------------------------------------------
// 하위 컴포넌트 — 상태 Badge
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  status: 'MATCHED' | 'UNMATCHED'
}

function StatusBadge({ status }: StatusBadgeProps) {
  const isMatched = status === 'MATCHED'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        background: isMatched
          ? 'var(--color-success-100, #d1fae5)'
          : 'var(--color-neutral-100, #f3f4f6)',
        color: isMatched
          ? 'var(--color-success-800, #065f46)'
          : 'var(--color-neutral-600, #4b5563)',
      }}
    >
      {isMatched ? '매칭' : '미매칭'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// 하위 컴포넌트 — 요약 Badge 그룹
// ---------------------------------------------------------------------------

interface SummaryBadgeProps {
  label: string
  count: number
  variant: 'total' | 'matched' | 'unmatched'
}

function SummaryBadge({ label, count, variant }: SummaryBadgeProps) {
  const bgMap: Record<SummaryBadgeProps['variant'], string> = {
    total: 'var(--color-brand-50, #eff6ff)',
    matched: 'var(--color-success-50, #ecfdf5)',
    unmatched: 'var(--color-warning-50, #fffbeb)',
  }
  const colorMap: Record<SummaryBadgeProps['variant'], string> = {
    total: 'var(--color-brand-700, #1d4ed8)',
    matched: 'var(--color-success-700, #047857)',
    unmatched: 'var(--color-warning-700, #b45309)',
  }
  const borderMap: Record<SummaryBadgeProps['variant'], string> = {
    total: 'var(--color-brand-200, #bfdbfe)',
    matched: 'var(--color-success-200, #a7f3d0)',
    unmatched: 'var(--color-warning-200, #fde68a)',
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 24px',
        border: `1px solid ${borderMap[variant]}`,
        background: bgMap[variant],
        borderRadius: 8,
        minWidth: 100,
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: colorMap[variant],
          fontFamily: "'JetBrains Mono', Consolas, monospace",
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {count.toLocaleString('ko-KR')}
      </div>
      <div style={{ fontSize: 12, color: colorMap[variant], fontWeight: 500 }}>
        {label}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 하위 컴포넌트 — 결과 테이블 행
// ---------------------------------------------------------------------------

interface ResultRowProps {
  result: DepositMatchResult
  index: number
}

function ResultRow({ result, index }: ResultRowProps) {
  const rowStyle: React.CSSProperties = {
    display: 'contents',
  }

  const cellStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 13,
    borderBottom: '1px solid var(--color-neutral-200, #e5e7eb)',
    verticalAlign: 'middle',
  }

  return (
    <tr
      data-testid={`deposit-match-row-${index + 1}`}
      style={rowStyle}
    >
      <td style={cellStyle}>{result.depositorName}</td>
      <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', Consolas, monospace" }}>
        {formatKrw(result.amount)}
      </td>
      <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{formatDate(result.transactionDate)}</td>
      <td style={cellStyle}>
        {result.matchedPartnerCode ?? (
          <span style={{ color: 'var(--color-neutral-400, #9ca3af)' }}>—</span>
        )}
      </td>
      <td style={cellStyle}>
        {result.matchedTaxInvoiceNo ?? (
          <span style={{ color: 'var(--color-neutral-400, #9ca3af)' }}>—</span>
        )}
      </td>
      <td style={cellStyle}>
        <StatusBadge status={result.status} />
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// 하위 컴포넌트 — 결과 테이블
// ---------------------------------------------------------------------------

interface ResultTableProps {
  results: DepositMatchResult[]
}

function ResultTable({ results }: ResultTableProps) {
  const thStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-neutral-500, #6b7280)',
    background: 'var(--color-neutral-50, #f9fafb)',
    borderBottom: '2px solid var(--color-neutral-200, #e5e7eb)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  }

  return (
    <div
      data-testid="deposit-match-table"
      style={{
        overflowX: 'auto',
        border: '1px solid var(--color-neutral-200, #e5e7eb)',
        borderRadius: 8,
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
        }}
      >
        <thead>
          <tr>
            <th style={thStyle}>입금자명</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>금액</th>
            <th style={thStyle}>거래일</th>
            <th style={thStyle}>매칭 거래처코드</th>
            <th style={thStyle}>매칭 세금계산서번호</th>
            <th style={thStyle}>상태</th>
          </tr>
        </thead>
        <tbody>
          {results.map((row, i) => (
            <ResultRow key={`${row.transactionDate}-${row.depositorName}-${i}`} result={row} index={i} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 메인 페이지 컴포넌트
// ---------------------------------------------------------------------------

export function DepositMatchPage() {
  usePageTitle('입금 매칭')

  const [from, setFrom] = useState(monthStartIso())
  const [to, setTo] = useState(todayIso())
  const [accountFinNo, setAccountFinNo] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation<
    DepositMatchResponse,
    unknown,
    { from: string; to: string; accountFinNo: string }
  >({
    mutationFn: ({ from: f, to: t, accountFinNo: fin }) =>
      fetchAndMatchDeposits(f, t, fin, 'DRY_RUN'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!accountFinNo.trim()) {
      setFormError('계좌 핀번호를 입력해주세요.')
      return
    }
    if (!from || !to) {
      setFormError('날짜 범위를 입력해주세요.')
      return
    }
    if (from > to) {
      setFormError('시작일은 종료일보다 이전이어야 합니다.')
      return
    }

    mutation.mutate({ from, to, accountFinNo: accountFinNo.trim() })
  }

  const handleReset = () => {
    setFrom(monthStartIso())
    setTo(todayIso())
    setAccountFinNo('')
    setFormError(null)
    mutation.reset()
  }

  const isLoading = mutation.isPending
  const apiError = mutation.isError ? toUserMessage(mutation.error) : null
  const errorMessage = formError ?? apiError

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-neutral-700, #374151)',
    marginBottom: 4,
    display: 'block',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--color-neutral-300, #d1d5db)',
    borderRadius: 6,
    fontSize: 13,
    color: 'var(--color-neutral-900, #111827)',
    background: '#fff',
    boxSizing: 'border-box',
  }

  return (
    <div
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        maxWidth: 900,
      }}
    >
      {/* 헤더 */}
      <header>
        <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700 }}>
          KFTC 오픈뱅킹 입금 매칭
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-600, #4B5563)' }}>
          기간 및 계좌 핀번호를 입력하면 입금 내역을 조회하고 거래처 및 세금계산서를 자동으로 매칭합니다.
        </p>
      </header>

      {/* ───────── 영역 1: 조회 폼 ───────── */}
      <section
        style={{
          border: '1px solid var(--color-neutral-200, #e5e7eb)',
          borderRadius: 8,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* submitMethod 안내 배너 */}
        <div
          style={{
            padding: '10px 14px',
            border: '1px solid var(--color-warning-200, #fde68a)',
            background: 'var(--color-warning-50, #fffbeb)',
            borderRadius: 6,
            fontSize: 13,
            color: 'var(--color-warning-800, #92400e)',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <div style={{ fontWeight: 600 }}>처리 방식: DRY_RUN (sandbox)</div>
          <div>
            현재 shell 단계에서는 DRY_RUN 모드가 고정 사용됩니다.
            Phase 11 sandbox 연동 완료 후 KFTC 오픈뱅킹 모드가 활성화됩니다.
          </div>
        </div>

        {/* 폼 */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '14px 20px',
          }}
        >
          {/* 시작일 */}
          <div>
            <label htmlFor="deposit-match-from" style={labelStyle}>
              시작일
            </label>
            <input
              id="deposit-match-from"
              data-testid="deposit-match-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
              disabled={isLoading}
              style={inputStyle}
            />
          </div>

          {/* 종료일 */}
          <div>
            <label htmlFor="deposit-match-to" style={labelStyle}>
              종료일
            </label>
            <input
              id="deposit-match-to"
              data-testid="deposit-match-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
              disabled={isLoading}
              style={inputStyle}
            />
          </div>

          {/* 계좌 핀번호 */}
          <div>
            <label htmlFor="deposit-match-account-fin-no" style={labelStyle}>
              계좌 핀번호
            </label>
            <input
              id="deposit-match-account-fin-no"
              data-testid="deposit-match-account-fin-no"
              type="text"
              value={accountFinNo}
              onChange={(e) => setAccountFinNo(e.target.value)}
              placeholder="KFTC 계좌 핀번호 입력"
              disabled={isLoading}
              style={inputStyle}
            />
          </div>

          {/* 버튼 영역 — 전체 열 차지 */}
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
            }}
          >
            <Button
              variant="secondary"
              type="button"
              data-testid="deposit-match-reset-btn"
              onClick={handleReset}
              disabled={isLoading}
            >
              초기화
            </Button>
            <Button
              variant="primary"
              type="submit"
              data-testid="deposit-match-submit-btn"
              disabled={isLoading}
            >
              {isLoading ? '조회 중...' : '입금 매칭 조회'}
            </Button>
          </div>
        </form>
      </section>

      {/* ───────── 영역 4: 에러 메시지 ───────── */}
      {errorMessage ? (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          data-testid="deposit-match-error"
          style={{
            padding: '12px 14px',
            border: '1px solid var(--color-danger-200, #fecaca)',
            background: 'var(--color-danger-50, #fef2f2)',
            borderRadius: 6,
            fontSize: 13,
            color: 'var(--color-danger-800, #991b1b)',
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      {/* ───────── 영역 2: 조회 결과 요약 ───────── */}
      {mutation.isSuccess && mutation.data ? (
        <>
          <section
            role="status"
            data-testid="deposit-match-summary"
            aria-label="입금 매칭 요약"
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <SummaryBadge label="전체" count={mutation.data.totalCount} variant="total" />
            <SummaryBadge label="매칭" count={mutation.data.matchedCount} variant="matched" />
            <SummaryBadge label="미매칭" count={mutation.data.unmatchedCount} variant="unmatched" />
          </section>

          {/* ───────── 영역 3: 결과 테이블 ───────── */}
          {mutation.data.results.length > 0 ? (
            <ResultTable results={mutation.data.results} />
          ) : (
            <div
              style={{
                padding: '32px 0',
                textAlign: 'center',
                fontSize: 14,
                color: 'var(--color-neutral-500, #6b7280)',
              }}
            >
              조회된 입금 내역이 없습니다.
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
