/**
 * arologis 수동 배차 admin UI — `/arologis/admin/manual-dispatch` (P1-5).
 *
 * 매뉴얼: docs/manual/05-arologis/02-수동-배차.md
 *
 * <pre>
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │ 헤더: 수동 배차       [일자] [유형 필터]                             │
 *  │ 배차 목록 표 (페이징)                                                │
 *  │   각 행 → "수동 배차 (vehicleSeq)" 버튼 → DriverSelectModal          │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 *  DriverSelectModal:
 *  ┌───────────────────────────────────────────────┐
 *  │ 가용 기사 list (date 기준)                    │
 *  │ driverCode / phoneNumber / vehicleType / 소스 │
 *  │ vehicleSeq input + [선택] 버튼 → manualAssign │
 *  └───────────────────────────────────────────────┘
 * </pre>
 *
 * BE 연결 (BE 신규 controller `DispatchAdminV1Controller` 와 1:1):
 * - GET  `/api/v1/arologis/admin/dispatches?fromDate&toDate&status` — 배차 목록
 * - GET  `/api/v1/arologis/admin/drivers/available?date`            — 가용 기사
 * - POST `/api/v1/arologis/admin/dispatches/{id}/manual-assign`     — 수동 배차
 *   body{vehicleSeq, driverCode}
 *
 * UUID 비공개 가드 (feedback_uuid_no_user_visibility.md):
 * - 사용자 라벨 노출: 배차 일자 + 유형 + 차량 수 + driverCode + phoneNumber + vehicleType
 * - dispatchId UUID 는 admin 화면 routing 전용 (테이블 라벨에는 일자/유형만)
 *
 * 풀네임 ROLE: MASTER / MANAGER (BE @PreAuthorize 1:1).
 *
 * data-testid (DISPATCH-DESIGN.md §4.4 — arologis-manual-* prefix):
 * - arologis-manual-kakao-input        — 카톡 textarea
 * - arologis-manual-preview-button     — 미리보기 버튼
 * - arologis-manual-vehicle-input      — 차량 순번 input
 * - arologis-manual-stop-add           — 정차 추가 버튼
 * - arologis-manual-item-add           — 품목(메모) 추가
 * - arologis-manual-submit-button      — 저장 버튼
 * - arologis-manual-driver-code        — 기사 코드 input (신규)
 * - arologis-manual-driver-lookup      — 기사 조회 링크 (신규)
 * - arologis-manual-realtime-notice    — 실시간 갱신 안내
 * - arologis-manual-preview-result     — 미리보기 결과 영역 (신규)
 * - arologis-manual-preview-status     — 미리보기 Status Badge (신규)
 * - arologis-manual-date               — 일자 input (관리 화면)
 * - arologis-manual-status-filter      — 유형 필터 select
 * - arologis-manual-table              — 배차 목록 표
 * - arologis-manual-row-{dispatchId}   — 행
 * - arologis-manual-assign-btn-{dispatchId} — 수동 배차 버튼
 * - arologis-manual-driver-select-modal     — 기사 선택 modal
 * - arologis-manual-driver-row-{driverCode} — 기사 행
 * - arologis-manual-driver-confirm-{driverCode} — 선택 버튼
 * - arologis-manual-vehicle-seq-input       — vehicleSeq input
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Modal } from '@samhan/design-system'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  listDispatches,
  getAvailableDrivers,
  manualAssign,
  DISPATCH_TYPE_LABEL,
  DRIVER_SOURCE_LABEL,
  type DispatchType,
  type DispatchStatus,
  type DispatchSummary,
  type AvailableDriver,
} from '../api/arologisAdminDispatchApi'

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
    case 'AUTO_MATCHED':      return 'brand'
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

const TYPE_FILTER_OPTIONS: Array<{ value: DispatchType | ''; label: string }> = [
  { value: '', label: '전체 유형' },
  { value: 'DAY', label: DISPATCH_TYPE_LABEL.DAY },
  { value: 'NIGHT', label: DISPATCH_TYPE_LABEL.NIGHT },
  { value: 'EXPRESS', label: DISPATCH_TYPE_LABEL.EXPRESS },
]

export function ManualDispatchAdminPage() {
  usePageTitle('수동 배차')

  const [date, setDate] = useState<string>(todayIso())
  const [typeFilter, setTypeFilter] = useState<DispatchType | ''>('')
  const [assignTarget, setAssignTarget] = useState<DispatchSummary | null>(null)

  const queryClient = useQueryClient()

  // 배차 목록 (단일 일자, 페이징 50)
  const listQuery = useQuery({
    queryKey: ['arologis-admin-dispatch-list', date, typeFilter],
    queryFn: () =>
      listDispatches({
        fromDate: date,
        toDate: date,
        status: typeFilter || undefined,
        page: 0,
        size: 50,
      }),
    enabled: !!date,
  })

  const dispatches: DispatchSummary[] = listQuery.data?.content ?? []

  // 수동 배차 mutation
  const assignMutation = useMutation({
    mutationFn: (input: {
      dispatchId: string
      vehicleSeq: number
      driverCode: string
    }) => manualAssign(input.dispatchId, input.vehicleSeq, input.driverCode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['arologis-admin-dispatch-list'] })
      void queryClient.invalidateQueries({ queryKey: ['arologis-available-drivers'] })
      setAssignTarget(null)
    },
  })

  const handleAssignClick = (dispatch: DispatchSummary) => {
    setAssignTarget(dispatch)
  }

  const handleDriverSelect = (driverCode: string, vehicleSeq: number) => {
    if (!assignTarget) return
    assignMutation.mutate({ dispatchId: assignTarget.dispatchId, vehicleSeq, driverCode })
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
              data-testid="arologis-manual-date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
          </label>
          <select
            data-testid="arologis-manual-status-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as DispatchType | '')}
            style={inputStyle}
          >
            {TYPE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 오류 banner */}
      {listQuery.isError ? (
        <div role="alert" className="error-banner" style={{ marginBottom: 16 }}>
          배차 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : null}

      {/* 배차 목록 */}
      <div
        data-testid="arologis-manual-table"
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
            {listQuery.isLoading ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>
                  배차 목록을 불러오는 중…
                </td>
              </tr>
            ) : dispatches.length === 0 ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>
                  해당 일자의 배차 내역이 없습니다.
                </td>
              </tr>
            ) : (
              dispatches.map((d) => (
                <tr
                  key={d.dispatchId}
                  data-testid={`arologis-manual-row-${d.dispatchId}`}
                  style={{ borderTop: '1px solid var(--color-neutral-100, #F3F4F6)' }}
                >
                  <td style={tdStyle}>{d.dispatchDate}</td>
                  <td style={tdStyle}>
                    <Badge variant={d.dispatchType === 'NIGHT' ? 'warning' : 'neutral'}>
                      {DISPATCH_TYPE_LABEL[d.dispatchType]}
                    </Badge>
                  </td>
                  <td style={tdStyle}>
                    <DispatchStatusBadge status={d.dispatchStatus} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{d.vehicleCount}</td>
                  <td style={{ ...tdStyle, color: 'var(--color-neutral-500, #6B7280)' }}>
                    {d.createdAt?.replace('T', ' ').slice(0, 16) ?? '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      data-testid={`arologis-manual-assign-btn-${d.dispatchId}`}
                      onClick={() => handleAssignClick(d)}
                    >
                      수동 배차
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 기사 선택 Modal */}
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
  onSelect: (driverCode: string, vehicleSeq: number) => void
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
  // BE 가 vehicleSeq 별 개별 배정 — 사용자 입력 (1-based, 차량 수 이내)
  const [vehicleSeq, setVehicleSeq] = useState<number>(1)

  const driverQuery = useQuery({
    queryKey: ['arologis-available-drivers', date],
    queryFn: () => getAvailableDrivers(date),
    enabled: !!date,
  })

  const drivers: AvailableDriver[] = driverQuery.data?.availableDrivers ?? []

  return (
    <Modal
      open
      onClose={onClose}
      title={`수동 배차 — ${dispatch.dispatchDate} ${DISPATCH_TYPE_LABEL[dispatch.dispatchType]} (차량 ${dispatch.vehicleCount}대)`}
      size="lg"
      data-testid="arologis-manual-driver-select-modal"
      footer={
        <Button variant="ghost" onClick={onClose} disabled={assigning}>
          취소
        </Button>
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          fontSize: 13,
          color: 'var(--color-neutral-700, #374151)',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          차량 순번
          <input
            type="number"
            data-testid="arologis-manual-vehicle-seq-input"
            value={vehicleSeq}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10)
              if (!Number.isNaN(v) && v >= 1 && v <= dispatch.vehicleCount) {
                setVehicleSeq(v)
              }
            }}
            min={1}
            max={dispatch.vehicleCount}
            style={{ ...inputStyle, width: 80 }}
          />
        </label>
        <span style={{ fontSize: 12, color: 'var(--color-neutral-500, #6B7280)' }}>
          (1 ~ {dispatch.vehicleCount}) — 가용 기사 선택 후 [선택] 버튼으로 배정
        </span>
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
          기사 배정에 실패했습니다. 차량 순번 / 기사 코드를 확인하세요.
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
              <th style={thStyle}>휴대전화</th>
              <th style={thStyle}>차량 종류</th>
              <th style={thStyle}>소스</th>
              <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>본 어플</th>
              <th style={{ ...thStyle, width: 100, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {driverQuery.isLoading ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>
                  가용 기사를 조회 중…
                </td>
              </tr>
            ) : drivers.length === 0 ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>
                  가용 기사가 없습니다.
                </td>
              </tr>
            ) : (
              drivers.map((driver) => (
                <tr
                  key={driver.driverCode}
                  data-testid={`arologis-manual-driver-row-${driver.driverCode}`}
                  style={{ borderTop: '1px solid var(--color-neutral-100, #F3F4F6)' }}
                >
                  <td style={tdStyle}>{driver.driverCode}</td>
                  <td style={tdStyle}>{driver.phoneNumber}</td>
                  <td style={tdStyle}>{driver.vehicleType ?? '—'}</td>
                  <td style={tdStyle}>
                    <Badge variant="neutral">{DRIVER_SOURCE_LABEL[driver.source]}</Badge>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {driver.appInstalled ? (
                      <Badge variant="success">설치</Badge>
                    ) : (
                      <Badge variant="neutral">미설치</Badge>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      data-testid={`arologis-manual-driver-confirm-${driver.driverCode}`}
                      onClick={() => onSelect(driver.driverCode, vehicleSeq)}
                      disabled={assigning}
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
