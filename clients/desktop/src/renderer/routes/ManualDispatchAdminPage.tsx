/**
 * arologis 수동 배차 admin UI — `/arologis/admin/manual-dispatch` (P1-5).
 *
 * 매뉴얼: docs/manual/05-arologis/02-수동-배차.md
 *
 * <pre>
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │ 헤더: 수동 배차         [일자 선택] [상태 필터]                      │
 *  │ 배차 목록 표: dispatchCode / 기사 / 차량 / 정차 수 / 슬립 수 / 상태│
 *  │   → 각 행에 "기사 직접 선택" 버튼 → DriverSelectModal              │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 *  DriverSelectModal:
 *  ┌───────────────────────────────────┐
 *  │  가용 기사 목록 (일자 기준)       │
 *  │  기사코드 / 기사명 / 차량 / 권역  │
 *  │  [선택] 버튼 → assignDriver API  │
 *  └───────────────────────────────────┘
 * </pre>
 *
 * BE 연결:
 * - GET  /admin/arologis/dispatches?date&status          — 배차 목록
 * - GET  /admin/arologis/drivers/available?date          — 가용 기사 목록
 * - POST /admin/arologis/dispatches/{dispatchCode}/assign — 기사 배정
 *
 * UUID 비공개 (feedback_uuid_no_user_visibility.md):
 * - 노출 식별자: dispatchCode / driverCode / driverName / vehicleLabel / slipNo
 * - UUID (dispatchId, driverId) 화면 노출 금지.
 *
 * 풀네임 ROLE (feedback_role_naming_full.md): DISPATCH / MANAGER / MASTER.
 *
 * data-testid:
 * - manual-dispatch-date-input        — 일자 input
 * - manual-dispatch-status-filter     — 상태 필터 select
 * - manual-dispatch-table             — 배차 목록 표
 * - manual-dispatch-row-{code}        — 행별 testid
 * - manual-dispatch-assign-btn-{code} — 기사 직접 선택 버튼
 * - driver-select-modal               — 기사 선택 modal
 * - driver-select-row-{driverCode}    — modal 내 기사 행
 * - driver-select-confirm-{code}      — modal 내 [선택] 버튼
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Modal } from '@samhan/design-system'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  getDispatchList,
  getAvailableDrivers,
  assignDriver,
  DISPATCH_STATUS_LABEL,
  type DispatchStatus,
  type DispatchSummary,
  type AvailableDriver,
} from '../api/arologisAdminDispatchApi'

/** 오늘 날짜 YYYY-MM-DD. */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const STATUS_FILTER_OPTIONS: Array<{ value: DispatchStatus | ''; label: string }> = [
  { value: '', label: '전체' },
  { value: 'PENDING', label: DISPATCH_STATUS_LABEL.PENDING },
  { value: 'ASSIGNED', label: DISPATCH_STATUS_LABEL.ASSIGNED },
  { value: 'IN_TRANSIT', label: DISPATCH_STATUS_LABEL.IN_TRANSIT },
  { value: 'DONE', label: DISPATCH_STATUS_LABEL.DONE },
  { value: 'CANCELLED', label: DISPATCH_STATUS_LABEL.CANCELLED },
]

const STATUS_BADGE_VARIANT: Record<DispatchStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  ASSIGNED: 'neutral',
  IN_TRANSIT: 'neutral',
  DONE: 'success',
  CANCELLED: 'danger',
}

export function ManualDispatchAdminPage() {
  usePageTitle('수동 배차')

  const [date, setDate] = useState<string>(todayIso())
  const [statusFilter, setStatusFilter] = useState<DispatchStatus | ''>('')
  // 기사 직접 선택 modal — 선택 대상 dispatch
  const [assignTarget, setAssignTarget] = useState<DispatchSummary | null>(null)

  const queryClient = useQueryClient()

  // 배차 목록
  const listQuery = useQuery({
    queryKey: ['arologis-dispatch-list', date, statusFilter],
    queryFn: () => getDispatchList(date, statusFilter || undefined),
    enabled: !!date,
  })

  const dispatches: DispatchSummary[] = listQuery.data?.dispatches ?? []

  // 기사 배정 mutation
  const assignMutation = useMutation({
    mutationFn: ({ dispatchCode, driverCode }: { dispatchCode: string; driverCode: string }) =>
      assignDriver(dispatchCode, driverCode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['arologis-dispatch-list'] })
      setAssignTarget(null)
    },
  })

  const handleAssignClick = (dispatch: DispatchSummary) => {
    setAssignTarget(dispatch)
  }

  const handleDriverSelect = (driverCode: string) => {
    if (!assignTarget) return
    assignMutation.mutate({ dispatchCode: assignTarget.dispatchCode, driverCode })
  }

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
        <h3 style={{ margin: 0 }}>수동 배차</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            배차 일자
            <input
              type="date"
              data-testid="manual-dispatch-date-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
          </label>
          <select
            data-testid="manual-dispatch-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DispatchStatus | '')}
            style={inputStyle}
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 오류 */}
      {listQuery.isError ? (
        <div role="alert" className="error-banner" style={{ marginBottom: 16 }}>
          배차 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : null}

      {/* 배차 목록 */}
      <div
        data-testid="manual-dispatch-table"
        style={{
          border: '1px solid var(--color-neutral-200, #E5E7EB)',
          borderRadius: 6,
          background: '#fff',
          overflow: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--color-neutral-50, #F9FAFB)' }}>
              <th style={thStyle}>배차 코드</th>
              <th style={thStyle}>기사 코드</th>
              <th style={thStyle}>기사명</th>
              <th style={thStyle}>차량</th>
              <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>정차</th>
              <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>슬립</th>
              <th style={{ ...thStyle, width: 100 }}>상태</th>
              <th style={{ ...thStyle, width: 140, textAlign: 'right' }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.isLoading ? (
              <tr>
                <td colSpan={8} style={emptyCellStyle}>
                  배차 목록을 불러오는 중…
                </td>
              </tr>
            ) : dispatches.length === 0 ? (
              <tr>
                <td colSpan={8} style={emptyCellStyle}>
                  해당 일자의 배차 내역이 없습니다.
                </td>
              </tr>
            ) : (
              dispatches.map((d) => (
                <tr
                  key={d.dispatchCode}
                  data-testid={`manual-dispatch-row-${d.dispatchCode}`}
                  style={{ borderTop: '1px solid var(--color-neutral-100, #F3F4F6)' }}
                >
                  <td style={tdStyle}>{d.dispatchCode}</td>
                  <td style={tdStyle}>{d.driverCode ?? '—'}</td>
                  <td style={tdStyle}>{d.driverName ?? '—'}</td>
                  <td style={tdStyle}>{d.vehicleLabel ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{d.totalStops}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{d.totalSlips}</td>
                  <td style={tdStyle}>
                    <Badge variant={STATUS_BADGE_VARIANT[d.status]}>
                      {DISPATCH_STATUS_LABEL[d.status]}
                    </Badge>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      data-testid={`manual-dispatch-assign-btn-${d.dispatchCode}`}
                      onClick={() => handleAssignClick(d)}
                      disabled={d.status === 'DONE' || d.status === 'CANCELLED'}
                    >
                      기사 직접 선택
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 기사 직접 선택 Modal */}
      {assignTarget ? (
        <DriverSelectModal
          date={date}
          dispatch={assignTarget}
          assigning={assignMutation.isPending}
          assignError={assignMutation.isError}
          onSelect={handleDriverSelect}
          onClose={() => {
            setAssignTarget(null)
            assignMutation.reset()
          }}
        />
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// 기사 선택 Modal
// ---------------------------------------------------------------------------

interface DriverSelectModalProps {
  date: string
  dispatch: DispatchSummary
  assigning: boolean
  assignError: boolean
  onSelect: (driverCode: string) => void
  onClose: () => void
}

function DriverSelectModal({
  date,
  dispatch,
  assigning,
  assignError,
  onSelect,
  onClose,
}: DriverSelectModalProps) {
  const driverQuery = useQuery({
    queryKey: ['arologis-available-drivers', date],
    queryFn: () => getAvailableDrivers(date),
    enabled: !!date,
  })

  const drivers: AvailableDriver[] = driverQuery.data?.drivers ?? []

  return (
    <Modal
      open
      onClose={onClose}
      title={`기사 직접 선택 — 배차 ${dispatch.dispatchCode}`}
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose} disabled={assigning}>
          취소
        </Button>
      }
    >
      <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--color-neutral-600, #4B5563)' }}>
        배차 일자 <strong>{date}</strong> 기준 가용 기사를 선택하세요.
        배정 후 기사 mobile-staff 앱에 푸시 알림이 발송됩니다.
      </div>

      {assignError ? (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            border: '1px solid var(--color-danger-300, #fca5a5)',
            background: 'var(--color-danger-50, #fef2f2)',
            color: 'var(--color-danger-700, #b91c1c)',
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          기사 배정에 실패했습니다. 기사 코드 / 배차 코드를 확인하세요.
        </div>
      ) : null}

      <div
        style={{
          border: '1px solid var(--color-neutral-200, #E5E7EB)',
          borderRadius: 6,
          overflow: 'auto',
          maxHeight: 360,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--color-neutral-50, #F9FAFB)' }}>
              <th style={thStyle}>기사 코드</th>
              <th style={thStyle}>기사명</th>
              <th style={thStyle}>휴대전화</th>
              <th style={thStyle}>차량</th>
              <th style={thStyle}>운행 권역</th>
              <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>현재 배차</th>
              <th style={{ ...thStyle, width: 90 }}>상태</th>
              <th style={{ ...thStyle, width: 80, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {driverQuery.isLoading ? (
              <tr>
                <td colSpan={8} style={emptyCellStyle}>
                  가용 기사를 조회 중…
                </td>
              </tr>
            ) : drivers.length === 0 ? (
              <tr>
                <td colSpan={8} style={emptyCellStyle}>
                  가용 기사가 없습니다.
                </td>
              </tr>
            ) : (
              drivers.map((driver) => (
                <tr
                  key={driver.driverCode}
                  data-testid={`driver-select-row-${driver.driverCode}`}
                  style={{
                    borderTop: '1px solid var(--color-neutral-100, #F3F4F6)',
                    opacity: driver.active ? 1 : 0.5,
                  }}
                >
                  <td style={tdStyle}>{driver.driverCode}</td>
                  <td style={tdStyle}>{driver.driverName}</td>
                  <td style={tdStyle}>{driver.phone}</td>
                  <td style={tdStyle}>{driver.vehicleLabel ?? '—'}</td>
                  <td style={tdStyle}>{driver.region ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {driver.currentDispatchCount}건
                  </td>
                  <td style={tdStyle}>
                    <Badge variant={driver.active ? 'success' : 'danger'}>
                      {driver.active ? '활성' : '비활성'}
                    </Badge>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      data-testid={`driver-select-confirm-${driver.driverCode}`}
                      onClick={() => onSelect(driver.driverCode)}
                      disabled={assigning || !driver.active}
                      loading={assigning}
                    >
                      선택
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </Modal>
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
  whiteSpace: 'nowrap',
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
