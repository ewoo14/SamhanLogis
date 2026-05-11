/**
 * arologis 카카오톡 자동 매칭 admin UI — `/arologis/admin/auto-dispatch` (P1-5).
 *
 * 매뉴얼: docs/manual/05-arologis/01-카카오톡-배차.md
 *
 * <pre>
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │ 헤더: 카카오톡 자동 매칭     [일자] [배차 선택] [자동 매칭 실행]    │
 *  │ 미배차 슬립 현황 banner (오늘 미배차 N건)                           │
 *  │ 배차 list 표 (페이징): 배차ID / 일자 / 유형 / 차량수 / 자동매칭     │
 *  └──────────────────────────────────────────────────────────────────────┘
 * </pre>
 *
 * BE 연결 (BE 신규 controller `DispatchAdminV1Controller` 와 1:1):
 * - GET  `/api/v1/arologis/admin/dispatches?fromDate&toDate`
 *   — 배차 list (페이징) + 자동매칭 trigger 대상 선택
 * - POST `/api/v1/arologis/admin/dispatches/auto-match` body{dispatchId}
 *   — 선택 배차의 PENDING 차량 자동 매칭 (DriverMatcher Mock + Insung)
 * - GET  `/admin/arologis/dispatches/unassigned?date`
 *   — 미배차 슬립 현황 (UnassignedService, 기존 endpoint 재사용)
 *
 * UUID 비공개 가드 (feedback_uuid_no_user_visibility.md):
 * - 사용자 라벨 노출: 배차 일자 + 유형 + 차량수 (UUID 직접 라벨 X)
 * - dispatchId UUID 는 admin 화면 routing 전용
 *
 * 풀네임 ROLE: MASTER / MANAGER (BE @PreAuthorize 1:1).
 *
 * data-testid (DISPATCH-DESIGN.md §3.5 — arologis-auto-* prefix):
 * - arologis-auto-date              — 일자 input
 * - arologis-auto-run-btn           — 자동 매칭 실행 버튼 (행별)
 * - arologis-auto-status-filter     — 상태 필터 select
 * - arologis-auto-result-table      — 결과 표 wrapper
 * - arologis-auto-row-{slipNo}      — 결과 행 (slipNo 기반)
 * - arologis-auto-chip-matched      — Summary Chip 자동 매칭됨
 * - arologis-auto-chip-failed       — Summary Chip 매칭실패
 * - arologis-auto-chip-pending      — Summary Chip 대기중
 * - arologis-auto-csv-btn           — CSV 다운로드 버튼
 * - arologis-auto-refresh-btn       — 새로고침 버튼
 * - arologis-auto-realtime-indicator — 실시간 갱신 안내
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card } from '@samhan/design-system'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  listDispatches,
  triggerAutoMatch,
  DISPATCH_TYPE_LABEL,
  type AutoMatchResult,
  type DispatchSummary,
  type DispatchStatus,
} from '../api/arologisAdminDispatchApi'
import { getUnassigned } from '../api/arologisDispatchApi'

// ---------------------------------------------------------------------------
// DispatchStatus Badge 헬퍼 (DISPATCH-DESIGN.md §2.1)
// ---------------------------------------------------------------------------

const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = {
  PENDING: '대기중',
  AUTO_MATCHED: '자동 매칭됨',
  MANUALLY_ASSIGNED: '수동 배정됨',
  DRIVER_ASSIGNED: '기사 배정됨',
  IN_TRANSIT: '운송중',
  DELIVERED: '배달완료',
  CANCELLED: '취소됨',
  FAILED: '매칭실패',
}

type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

function dispatchStatusVariant(status: DispatchStatus): BadgeVariant {
  switch (status) {
    case 'PENDING':           return 'neutral'
    case 'AUTO_MATCHED':      return 'brand'    // design-system 에 info 없음 → brand 대체
    case 'MANUALLY_ASSIGNED': return 'success'
    case 'DRIVER_ASSIGNED':   return 'success'
    case 'IN_TRANSIT':        return 'warning'
    case 'DELIVERED':         return 'success'
    case 'CANCELLED':         return 'danger'
    case 'FAILED':            return 'danger'
    default:                  return 'neutral'
  }
}

function DispatchStatusBadge({ status }: { status: DispatchStatus }) {
  return (
    <Badge variant={dispatchStatusVariant(status)}>
      {DISPATCH_STATUS_LABEL[status]}
    </Badge>
  )
}

/** 오늘 날짜 YYYY-MM-DD. */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function KakaoAutoDispatchPage() {
  usePageTitle('카카오톡 자동 매칭')

  const [date, setDate] = useState<string>(todayIso())
  const [latestResult, setLatestResult] = useState<{
    dispatchId: string
    result: AutoMatchResult
  } | null>(null)

  const queryClient = useQueryClient()

  // 미배차 슬립 건수 (실행 전 현황)
  const unassignedQuery = useQuery({
    queryKey: ['arologis-unassigned', date],
    queryFn: () => getUnassigned(date),
    enabled: !!date,
  })

  // 배차 list (당일 단일 일자 — fromDate=toDate=date)
  const dispatchListQuery = useQuery({
    queryKey: ['arologis-admin-dispatch-list', date],
    queryFn: () => listDispatches({ fromDate: date, toDate: date, page: 0, size: 50 }),
    enabled: !!date,
  })

  const dispatches: DispatchSummary[] = dispatchListQuery.data?.content ?? []

  // 자동 매칭 trigger mutation
  const matchMutation = useMutation({
    mutationFn: (dispatchId: string) => triggerAutoMatch(dispatchId),
    onSuccess: (result, dispatchId) => {
      setLatestResult({ dispatchId, result })
      void queryClient.invalidateQueries({ queryKey: ['arologis-admin-dispatch-list'] })
      void queryClient.invalidateQueries({ queryKey: ['arologis-unassigned'] })
    },
  })

  const handleRun = (dispatchId: string) => {
    matchMutation.mutate(dispatchId)
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
            DriverMatcher (Mock + Insung) 자동 배정 — 매칭 실패 차량은 수동 배차에서 보정
          </span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          배차 일자
          <input
            type="date"
            data-testid="arologis-auto-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />
        </label>
      </div>

      {/* 미배차 현황 banner */}
      <Card padding={4} shadow="sm" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--color-neutral-700, #374151)' }}>
          {unassignedQuery.isLoading ? (
            '미배차 전표 조회 중…'
          ) : (
            <>
              기준 일자 <strong>{date}</strong> 미배차 전표{' '}
              <strong>{unassignedCount}</strong>건 — 아래 배차 목록의 "자동 매칭 실행" 버튼으로
              DriverMatcher 를 실행합니다.
            </>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-neutral-500, #6B7280)' }}>
          매칭 정확도 약 80% — 매칭 실패 차량은{' '}
          <span style={{ fontWeight: 600 }}>수동 배차 (/arologis/admin/manual-dispatch)</span> 화면에서
          기사를 직접 선택하세요.
        </div>
      </Card>

      {/* 자동 매칭 결과 banner */}
      {latestResult ? (
        <div
          data-testid="arologis-auto-result-banner"
          style={{
            padding: '10px 14px',
            border: '1px solid var(--color-success-300, #86efac)',
            background: 'var(--color-success-50, #ecfdf5)',
            color: 'var(--color-success-700, #047857)',
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          자동 매칭 완료 — 대상 차량{' '}
          <strong>{latestResult.result.totalVehicles}</strong>대 중{' '}
          <strong>{latestResult.result.matched}</strong>대 매칭 성공
          {latestResult.result.totalVehicles - latestResult.result.matched > 0 ? (
            <>
              {' '}(미매칭{' '}
              <strong>
                {latestResult.result.totalVehicles - latestResult.result.matched}
              </strong>
              대 → 수동 배차 필요)
            </>
          ) : null}
        </div>
      ) : null}

      {/* 실행 오류 banner */}
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

      {/* 배차 list 표 */}
      <div
        data-testid="arologis-auto-result-table"
        style={{
          border: '1px solid var(--color-neutral-200, #E5E7EB)',
          borderRadius: 6,
          background: 'var(--surface-card)',
          overflow: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--color-neutral-50, #F9FAFB)' }}>
              <th style={thStyle}>배차 일자</th>
              <th style={thStyle}>유형</th>
              <th style={thStyle}>배차 상태</th>
              <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>차량 수</th>
              <th style={thStyle}>등록 일시</th>
              <th style={{ ...thStyle, width: 200, textAlign: 'right' }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {dispatchListQuery.isLoading ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>
                  배차 목록을 불러오는 중…
                </td>
              </tr>
            ) : dispatches.length === 0 ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>
                  해당 일자의 배차가 없습니다.
                </td>
              </tr>
            ) : (
              dispatches.map((dispatch) => {
                const running =
                  matchMutation.isPending && matchMutation.variables === dispatch.dispatchId
                return (
                  <tr
                    key={dispatch.dispatchId}
                    data-testid={`arologis-auto-row-${dispatch.dispatchId}`}
                    style={{ borderTop: '1px solid var(--color-neutral-100, #F3F4F6)' }}
                  >
                    <td style={tdStyle}>{dispatch.dispatchDate}</td>
                    <td style={tdStyle}>
                      <Badge variant={dispatch.dispatchType === 'NIGHT' ? 'warning' : 'neutral'}>
                        {DISPATCH_TYPE_LABEL[dispatch.dispatchType]}
                      </Badge>
                    </td>
                    <td style={tdStyle}>
                      <DispatchStatusBadge status={dispatch.dispatchStatus} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {dispatch.vehicleCount}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--color-neutral-500, #6B7280)' }}>
                      {dispatch.createdAt?.replace('T', ' ').slice(0, 16) ?? '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <Button
                        variant="primary"
                        size="sm"
                        data-testid={`arologis-auto-run-btn`}
                        onClick={() => handleRun(dispatch.dispatchId)}
                        loading={running}
                        disabled={running}
                      >
                        자동 매칭 실행
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </>
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

const emptyCellStyle: React.CSSProperties = {
  padding: '24px 12px',
  textAlign: 'center',
  color: 'var(--color-neutral-500, #6B7280)',
}
