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
import { useEffect, useState } from 'react'
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
  type DepositJournalLine,
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
  onSelect: (result: DepositMatchResult) => void
}

function ResultRow({ result, index, onSelect }: ResultRowProps) {
  // MATCHED 행만 클릭 가능 — 자동 분개 미리보기 modal 오픈.
  const clickable = result.status === 'MATCHED'

  const rowStyle: React.CSSProperties = {
    cursor: clickable ? 'pointer' : 'default',
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
      onClick={clickable ? () => onSelect(result) : undefined}
      // <tr> 에 role="button" 은 ARIA 규격 위반(row context 파괴) — implicit row role 유지.
      // 클릭/키보드(Enter·Space) 활성화만 부여하고 가용성은 title 로 안내한다.
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${result.depositorName} 자동 분개 미리보기 열기` : undefined}
      title={clickable ? '클릭하면 자동 분개 미리보기를 표시합니다' : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(result)
              }
            }
          : undefined
      }
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
  onSelect: (result: DepositMatchResult) => void
}

function ResultTable({ results, onSelect }: ResultTableProps) {
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
            <ResultRow
              key={`${row.transactionDate}-${row.depositorName}-${row.amount}`}
              result={row}
              index={i}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 하위 컴포넌트 — 매칭 상세 + 자동 분개 미리보기 modal
// ---------------------------------------------------------------------------

interface DetailModalProps {
  result: DepositMatchResult
  onClose: () => void
}

/**
 * MATCHED 입금의 자동 분개 미리보기 modal.
 *
 * <p>차변 보통예금(102) / 대변 외상매출금(110) 라인을 표시한다.
 * DRY_RUN 단계 미리보기이며 실제 전표를 생성하지 않는다.
 * UUID 비공개: 계정 UUID·journalDraftId 미노출 — 계정코드/계정명/금액 + 비즈니스 식별자만.
 */
function DepositDetailModal({ result, onClose }: DetailModalProps) {
  const lines = result.journalDraft?.lines ?? []
  const debit = lines.find((l) => l.side === 'DEBIT')
  const credit = lines.find((l) => l.side === 'CREDIT')
  const hasJournal = lines.length > 0

  // ARIA dialog 패턴 — Escape 키로 닫기 (WCAG 2.1 SC 2.1.2).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  }
  const panelStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 10,
    padding: 20,
    width: 'min(520px, 92vw)',
    maxHeight: '88vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
  }
  const metaRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    padding: '6px 0',
    borderBottom: '1px solid var(--color-neutral-100, #f3f4f6)',
  }
  const journalLineStyle = (side: 'DEBIT' | 'CREDIT'): React.CSSProperties => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 6,
    fontSize: 13,
    background:
      side === 'DEBIT'
        ? 'var(--color-brand-50, #eff6ff)'
        : 'var(--color-success-50, #ecfdf5)',
    border: `1px solid ${side === 'DEBIT' ? 'var(--color-brand-200, #bfdbfe)' : 'var(--color-success-200, #a7f3d0)'}`,
  })

  const renderJournalLine = (
    line: DepositJournalLine | undefined,
    side: 'DEBIT' | 'CREDIT',
    testId: string,
  ) => {
    const label = side === 'DEBIT' ? '차변' : '대변'
    if (!line) {
      return (
        <div data-testid={testId} style={journalLineStyle(side)}>
          <span>{label}</span>
          <span style={{ color: 'var(--color-neutral-400, #9ca3af)' }}>—</span>
        </div>
      )
    }
    return (
      <div data-testid={testId} style={journalLineStyle(side)}>
        <span style={{ fontWeight: 600 }}>
          {label} · {line.accountName}({line.accountCode})
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', Consolas, monospace", fontVariantNumeric: 'tabular-nums' }}>
          {formatKrw(line.amount)}
        </span>
      </div>
    )
  }

  return (
    <div
      style={overlayStyle}
      onClick={onClose}
      role="presentation"
    >
      <div
        data-testid="deposit-match-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="입금 매칭 상세 · 자동 분개 미리보기"
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>매칭 상세</h4>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-500, #6b7280)' }}>
              자동 분개 미리보기 (DRY_RUN — 실제 전표 미생성)
            </p>
          </div>
          <Button variant="ghost" size="sm" type="button" onClick={onClose} aria-label="닫기">
            ✕
          </Button>
        </header>

        {/* 비즈니스 식별자 */}
        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={metaRowStyle}>
            <span style={{ color: 'var(--color-neutral-500, #6b7280)' }}>입금자명</span>
            <strong>{result.depositorName}</strong>
          </div>
          <div style={metaRowStyle}>
            <span style={{ color: 'var(--color-neutral-500, #6b7280)' }}>입금 금액</span>
            <strong style={{ fontFamily: "'JetBrains Mono', Consolas, monospace" }}>{formatKrw(result.amount)}</strong>
          </div>
          <div style={metaRowStyle}>
            <span style={{ color: 'var(--color-neutral-500, #6b7280)' }}>거래처코드</span>
            <strong>{result.matchedPartnerCode ?? '—'}</strong>
          </div>
          <div style={metaRowStyle}>
            <span style={{ color: 'var(--color-neutral-500, #6b7280)' }}>세금계산서번호</span>
            <strong>{result.matchedTaxInvoiceNo ?? '—'}</strong>
          </div>
        </section>

        {/* 자동 분개 미리보기 */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-neutral-700, #374151)' }}>
            자동 분개 미리보기
          </div>
          {hasJournal ? (
            <>
              {renderJournalLine(debit, 'DEBIT', 'deposit-match-journal-debit')}
              {renderJournalLine(credit, 'CREDIT', 'deposit-match-journal-credit')}
            </>
          ) : (
            <div
              role="status"
              style={{ fontSize: 13, color: 'var(--color-neutral-500, #6b7280)', padding: '8px 0' }}
            >
              자동 분개 데이터를 불러오지 못했습니다.
            </div>
          )}
        </section>
      </div>
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
  const [selectedResult, setSelectedResult] = useState<DepositMatchResult | null>(null)

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
    setSelectedResult(null)
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
            <ResultTable results={mutation.data.results} onSelect={setSelectedResult} />
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

      {/* 매칭 상세 + 자동 분개 미리보기 modal */}
      {selectedResult ? (
        <DepositDetailModal result={selectedResult} onClose={() => setSelectedResult(null)} />
      ) : null}
    </div>
  )
}
