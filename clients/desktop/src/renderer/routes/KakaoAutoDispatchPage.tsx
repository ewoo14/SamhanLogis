/**
 * arologis 카카오톡 자동 매칭 admin UI — `/arologis/admin/auto-dispatch` (P1-5).
 *
 * 매뉴얼: docs/manual/05-arologis/01-카카오톡-배차.md
 *
 * <pre>
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │ 헤더: 카카오톡 자동 매칭      [일자 선택] [자동 매칭 실행] 버튼  │
 *  │ 요약 banner (총 슬립 / 매칭 / 미매칭)                           │
 *  │ 매칭 결과 표: slipNo / 거래처명 / 주소 / 기사 / 차량 / 신뢰도   │
 *  └──────────────────────────────────────────────────────────────────┘
 * </pre>
 *
 * BE 연결:
 * - GET  /admin/arologis/dispatches/unassigned?date — 미배차 슬립 목록 (실행 전 카운트)
 * - POST /admin/arologis/dispatches/parse-kakao     — 자동 매칭 실행
 *
 * UUID 비공개 (feedback_uuid_no_user_visibility.md):
 * - 노출 식별자: slipNo / partnerName / address / driverCode / driverName / vehicleLabel
 * - dispatchId / driverId UUID 화면 노출 금지.
 *
 * 풀네임 ROLE (feedback_role_naming_full.md): DISPATCH / MANAGER / MASTER.
 *
 * data-testid:
 * - auto-dispatch-date-input      — 일자 선택 input
 * - auto-dispatch-run-btn         — 자동 매칭 실행 버튼
 * - auto-dispatch-result-table    — 결과 표 wrapper
 * - auto-dispatch-row-{slipNo}    — 행별 testid
 */
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Badge, Button, Card } from '@samhan/design-system'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  runAutoMatch,
  type AutoMatchResultEntry,
} from '../api/arologisAdminDispatchApi'
import { getUnassigned } from '../api/arologisDispatchApi'

/** 오늘 날짜 YYYY-MM-DD. */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 신뢰도에 따른 Badge variant. */
function confidenceVariant(confidence: number): 'success' | 'warning' | 'danger' {
  if (confidence >= 80) return 'success'
  if (confidence >= 50) return 'warning'
  return 'danger'
}

export function KakaoAutoDispatchPage() {
  usePageTitle('카카오톡 자동 매칭')

  const [date, setDate] = useState<string>(todayIso())

  // 미배차 슬립 건수 — 실행 전 현황 파악
  const unassignedQuery = useQuery({
    queryKey: ['arologis-unassigned', date],
    queryFn: () => getUnassigned(date),
    enabled: !!date,
  })

  // 자동 매칭 실행 mutation
  const matchMutation = useMutation({
    mutationFn: () => runAutoMatch(date),
  })

  const result = matchMutation.data ?? null
  const running = matchMutation.isPending

  const handleRun = () => {
    matchMutation.mutate()
  }

  const unassignedCount = unassignedQuery.data?.unassignedCount ?? 0

  return (
    <>
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h3 style={{ margin: 0 }}>카카오톡 자동 매칭</h3>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-500, #6B7280)' }}>
            DriverMatcher (Mock + Insung) 자동 배정 — 매칭 실패 건은 수동 배차에서 보정
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            배차 일자
            <input
              type="date"
              data-testid="auto-dispatch-date-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
          </label>
          <Button
            variant="primary"
            data-testid="auto-dispatch-run-btn"
            onClick={handleRun}
            disabled={running || !date}
            loading={running}
          >
            자동 매칭 실행
          </Button>
        </div>
      </div>

      {/* 실행 전 현황 */}
      {!result && (
        <Card padding={4} shadow="sm" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--color-neutral-700, #374151)' }}>
            {unassignedQuery.isLoading ? (
              '미배차 슬립 조회 중…'
            ) : (
              <>
                기준 일자 <strong>{date}</strong> 미배차 슬립{' '}
                <strong>{unassignedCount}</strong>건 — 위 "자동 매칭 실행"
                버튼으로 DriverMatcher 를 실행합니다.
              </>
            )}
          </div>
          <div
            style={{ marginTop: 8, fontSize: 12, color: 'var(--color-neutral-500, #6B7280)' }}
          >
            매칭 정확도 약 80% — 미매칭 건은 수동 배차{' '}
            <span style={{ fontWeight: 600 }}>(/arologis/admin/manual-dispatch)</span> 에서
            기사를 직접 선택하세요.
          </div>
        </Card>
      )}

      {/* 실행 오류 */}
      {matchMutation.isError ? (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            border: '1px solid var(--color-danger-300, #fca5a5)',
            background: 'var(--color-danger-50, #fef2f2)',
            color: 'var(--color-danger-700, #b91c1c)',
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          자동 매칭 실행 중 오류가 발생했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : null}

      {/* 매칭 결과 요약 */}
      {result ? (
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <SummaryChip label="대상 슬립" value={result.totalSlips} tone="neutral" />
          <SummaryChip label="매칭 성공" value={result.matchedCount} tone="success" />
          <SummaryChip label="매칭 실패" value={result.unmatchedCount} tone="danger" />
        </div>
      ) : null}

      {/* 매칭 결과 표 */}
      {result ? (
        <div
          data-testid="auto-dispatch-result-table"
          style={{
            border: '1px solid var(--color-neutral-200, #E5E7EB)',
            borderRadius: 6,
            background: '#fff',
            overflow: 'auto',
          }}
        >
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: 'var(--color-neutral-50, #F9FAFB)' }}>
                <th style={thStyle}>전표번호</th>
                <th style={thStyle}>거래처명</th>
                <th style={thStyle}>주소</th>
                <th style={thStyle}>기사 코드</th>
                <th style={thStyle}>기사명</th>
                <th style={thStyle}>차량</th>
                <th style={{ ...thStyle, width: 100 }}>신뢰도</th>
                <th style={{ ...thStyle, width: 90 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {result.entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: '24px 12px',
                      textAlign: 'center',
                      color: 'var(--color-neutral-500, #6B7280)',
                    }}
                  >
                    매칭 대상 슬립이 없습니다.
                  </td>
                </tr>
              ) : (
                result.entries.map((entry) => (
                  <ResultRow key={entry.slipNo} entry={entry} />
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// 결과 행 컴포넌트
// ---------------------------------------------------------------------------

interface ResultRowProps {
  entry: AutoMatchResultEntry
}

function ResultRow({ entry }: ResultRowProps) {
  return (
    <tr
      data-testid={`auto-dispatch-row-${entry.slipNo}`}
      style={{
        borderTop: '1px solid var(--color-neutral-100, #F3F4F6)',
        background: entry.matched
          ? 'transparent'
          : 'var(--color-danger-50, #fef2f2)',
      }}
    >
      <td style={tdStyle}>{entry.slipNo}</td>
      <td style={tdStyle}>{entry.partnerName ?? '—'}</td>
      <td style={{ ...tdStyle, color: 'var(--color-neutral-600, #4B5563)' }}>
        {entry.address ?? '—'}
      </td>
      <td style={tdStyle}>{entry.driverCode ?? '—'}</td>
      <td style={tdStyle}>{entry.driverName ?? '—'}</td>
      <td style={tdStyle}>{entry.vehicleLabel ?? '—'}</td>
      <td style={tdStyle}>
        {entry.matched ? (
          <Badge variant={confidenceVariant(entry.confidence)}>
            {entry.confidence}%
          </Badge>
        ) : (
          <span style={{ color: 'var(--color-neutral-400, #9CA3AF)', fontSize: 12 }}>
            —
          </span>
        )}
      </td>
      <td style={tdStyle}>
        <Badge variant={entry.matched ? 'success' : 'danger'}>
          {entry.matched ? '매칭됨' : '실패'}
        </Badge>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// 요약 chip
// ---------------------------------------------------------------------------

interface SummaryChipProps {
  label: string
  value: number
  tone: 'success' | 'danger' | 'neutral'
}

const CHIP_BG: Record<SummaryChipProps['tone'], string> = {
  success: 'var(--color-success-50, #ecfdf5)',
  danger:  'var(--color-danger-50, #fef2f2)',
  neutral: 'var(--color-neutral-100, #F3F4F6)',
}
const CHIP_FG: Record<SummaryChipProps['tone'], string> = {
  success: 'var(--color-success-700, #047857)',
  danger:  'var(--color-danger-700, #b91c1c)',
  neutral: 'var(--color-neutral-700, #374151)',
}

function SummaryChip({ label, value, tone }: SummaryChipProps) {
  return (
    <div
      style={{
        padding: '6px 14px',
        borderRadius: 999,
        background: CHIP_BG[tone],
        color: CHIP_FG[tone],
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      {label} {value}건
    </div>
  )
}

// ---------------------------------------------------------------------------
// 공통 스타일
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--color-neutral-300, #D1D5DB)',
  borderRadius: 6,
  fontSize: 13,
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 12,
  color: 'var(--color-neutral-700, #374151)',
  borderBottom: '1px solid var(--color-neutral-200, #E5E7EB)',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'top',
}
