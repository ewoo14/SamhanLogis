/**
 * arologis 기사 배정 admin UI — `/arologis/admin/driver-assignment` (P1-5).
 *
 * <p>이미 ASSIGNED 상태인 차량의 기사 변경 (PATCH /driver) + 미배정 차량 신규 배정 통합 화면.
 *
 * 매뉴얼: docs/manual/05-arologis/03-기사-배정.md
 *
 * <pre>
 *  ┌────────────────────────────────────────────────────────────────────┐
 *  │ 헤더: 기사 배정              [일자 선택]                            │
 *  │                                                                    │
 *  │  좌측 (가용 기사 list)        우측 (배차 list)                     │
 *  │  ┌──────────────────┐        ┌──────────────────────────────────┐ │
 *  │  │ driverCode       │        │ 일자 / 유형 / 차량 수 + vehicleSeq│ │
 *  │  │ phoneNumber      │        │ [기사 변경/배정] 버튼            │ │
 *  │  │ vehicleType      │        │ (좌측 기사 선택 후 활성화)       │ │
 *  │  │ source / 설치    │        │                                  │ │
 *  │  └──────────────────┘        └──────────────────────────────────┘ │
 *  └────────────────────────────────────────────────────────────────────┘
 * </pre>
 *
 * BE 연결 (BE 신규 controller `DispatchAdminV1Controller` 와 1:1):
 * - GET   `/api/v1/arologis/admin/drivers/available?date` — 가용 기사 list
 * - GET   `/api/v1/arologis/admin/dispatches?fromDate&toDate` — 배차 list
 * - PATCH `/api/v1/arologis/admin/dispatches/{id}/driver` body{vehicleSeq, newDriverCode}
 *   — 기사 변경 (이미 ASSIGNED 차량) — MatchSource.MANUAL 재기록
 *
 * UUID 비공개 가드 (feedback_uuid_no_user_visibility.md):
 * - 사용자 라벨 노출: driverCode + phoneNumber + vehicleType + 배차 일자 + 유형 + vehicleSeq
 * - dispatchId UUID 는 admin 화면 routing 전용
 *
 * 풀네임 ROLE: MASTER / MANAGER (BE @PreAuthorize 1:1).
 *
 * data-testid:
 * - driver-assignment-date-input             — 일자 input
 * - driver-assignment-driver-list            — 기사 목록 패널
 * - driver-assignment-dispatch-list          — 배차 패널
 * - driver-assignment-driver-{driverCode}    — 기사 카드
 * - driver-assignment-dispatch-{dispatchId}  — 배차 카드
 * - driver-assignment-vehicle-seq-{dispatchId} — vehicleSeq input
 * - driver-assignment-assign-{driverCode}-{dispatchId} — 변경 버튼
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card } from '@samhan/design-system'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  changeDriver,
  getAvailableDrivers,
  listDispatches,
  DISPATCH_TYPE_LABEL,
  DRIVER_SOURCE_LABEL,
  type AvailableDriver,
  type DispatchSummary,
} from '../api/arologisAdminDispatchApi'

/** 오늘 날짜 YYYY-MM-DD. */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function DriverAssignmentPage() {
  usePageTitle('기사 배정')

  const [date, setDate] = useState<string>(todayIso())
  const [selectedDriverCode, setSelectedDriverCode] = useState<string | null>(null)
  // 배차별 입력 vehicleSeq (기본 1)
  const [vehicleSeqMap, setVehicleSeqMap] = useState<Record<string, number>>({})
  const [assigningKey, setAssigningKey] = useState<string | null>(null)

  const queryClient = useQueryClient()

  // 가용 기사
  const driverQuery = useQuery({
    queryKey: ['arologis-available-drivers', date],
    queryFn: () => getAvailableDrivers(date),
    enabled: !!date,
  })

  // 배차 list
  const dispatchQuery = useQuery({
    queryKey: ['arologis-admin-dispatch-list', date],
    queryFn: () =>
      listDispatches({ fromDate: date, toDate: date, page: 0, size: 50 }),
    enabled: !!date,
  })

  const drivers: AvailableDriver[] = driverQuery.data?.availableDrivers ?? []
  const dispatches: DispatchSummary[] = dispatchQuery.data?.content ?? []

  const assignMutation = useMutation({
    mutationFn: (input: {
      dispatchId: string
      vehicleSeq: number
      driverCode: string
    }) => changeDriver(input.dispatchId, input.vehicleSeq, input.driverCode),
    onMutate: ({ dispatchId, driverCode }) => {
      setAssigningKey(`${driverCode}-${dispatchId}`)
    },
    onSettled: () => {
      setAssigningKey(null)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['arologis-admin-dispatch-list'] })
      void queryClient.invalidateQueries({ queryKey: ['arologis-available-drivers'] })
    },
  })

  const handleAssign = (dispatchId: string, vehicleSeq: number) => {
    if (!selectedDriverCode) return
    assignMutation.mutate({
      dispatchId,
      vehicleSeq,
      driverCode: selectedDriverCode,
    })
  }

  const handleDriverSelect = (driverCode: string) => {
    setSelectedDriverCode((prev) => (prev === driverCode ? null : driverCode))
  }

  const setVehicleSeq = (dispatchId: string, seq: number) => {
    setVehicleSeqMap((prev) => ({ ...prev, [dispatchId]: seq }))
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h3 style={{ margin: 0 }}>기사 배정</h3>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-500, #6B7280)' }}>
            좌측 기사를 선택 후 우측 배차의 차량 순번 + [변경] 버튼으로 기사를 배정합니다.
          </span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          배차 일자
          <input
            type="date"
            data-testid="driver-assignment-date-input"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setSelectedDriverCode(null)
              setVehicleSeqMap({})
            }}
            style={inputStyle}
          />
        </label>
      </div>

      {/* 오류 banner */}
      {assignMutation.isError ? (
        <div role="alert" className="error-banner" style={{ marginBottom: 16 }}>
          기사 배정에 실패했습니다. 차량 순번 / 기사 코드를 확인하세요.
        </div>
      ) : null}

      {/* 2-panel 레이아웃 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.5fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* ============================== */}
        {/* 좌측 — 가용 기사 리스트       */}
        {/* ============================== */}
        <Card padding={4} shadow="sm">
          <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
            가용 기사 ({drivers.length}명)
            {selectedDriverCode ? (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  fontWeight: 400,
                  color: 'var(--color-brand-600, #2563EB)',
                }}
              >
                선택됨: {selectedDriverCode}
              </span>
            ) : null}
          </div>
          <div
            data-testid="driver-assignment-driver-list"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 480,
              overflowY: 'auto',
            }}
          >
            {driverQuery.isLoading ? (
              <div style={emptyStyle}>가용 기사를 조회 중…</div>
            ) : drivers.length === 0 ? (
              <div style={emptyStyle}>가용 기사가 없습니다.</div>
            ) : (
              drivers.map((driver) => (
                <DriverCard
                  key={driver.driverCode}
                  driver={driver}
                  selected={selectedDriverCode === driver.driverCode}
                  onClick={() => handleDriverSelect(driver.driverCode)}
                />
              ))
            )}
          </div>
        </Card>

        {/* ============================== */}
        {/* 우측 — 배차 리스트            */}
        {/* ============================== */}
        <Card padding={4} shadow="sm">
          <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
            배차 ({dispatches.length}건)
          </div>
          <div
            data-testid="driver-assignment-dispatch-list"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 480,
              overflowY: 'auto',
            }}
          >
            {dispatchQuery.isLoading ? (
              <div style={emptyStyle}>배차를 조회 중…</div>
            ) : dispatches.length === 0 ? (
              <div style={emptyStyle}>배차가 없습니다.</div>
            ) : (
              dispatches.map((dispatch) => {
                const seq = vehicleSeqMap[dispatch.dispatchId] ?? 1
                const assignKey = selectedDriverCode
                  ? `${selectedDriverCode}-${dispatch.dispatchId}`
                  : null
                return (
                  <DispatchCard
                    key={dispatch.dispatchId}
                    dispatch={dispatch}
                    selectedDriverCode={selectedDriverCode}
                    vehicleSeq={seq}
                    onChangeSeq={(s) => setVehicleSeq(dispatch.dispatchId, s)}
                    assigning={assigningKey === assignKey}
                    onAssign={() => handleAssign(dispatch.dispatchId, seq)}
                  />
                )
              })
            )}
          </div>
        </Card>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// 기사 카드 (좌측)
// ---------------------------------------------------------------------------

interface DriverCardProps {
  driver: AvailableDriver
  selected: boolean
  onClick: () => void
}

function DriverCard({ driver, selected, onClick }: DriverCardProps) {
  return (
    <div
      data-testid={`driver-assignment-driver-${driver.driverCode}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        padding: '10px 12px',
        borderRadius: 6,
        border: `2px solid ${selected ? 'var(--color-brand-500, #3B82F6)' : 'var(--color-neutral-200, #E5E7EB)'}`,
        background: selected ? 'var(--color-brand-50, #EFF6FF)' : '#fff',
        cursor: 'pointer',
        transition: 'border-color 0.12s, background 0.12s',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>{driver.driverCode}</span>
        <Badge variant="neutral">{DRIVER_SOURCE_LABEL[driver.source]}</Badge>
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--color-neutral-600, #4B5563)',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span>전화: {driver.phoneNumber}</span>
        {driver.vehicleType ? <span>차종: {driver.vehicleType}</span> : null}
        <span>본 어플: {driver.appInstalled ? '설치' : '미설치'}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 배차 카드 (우측)
// ---------------------------------------------------------------------------

interface DispatchCardProps {
  dispatch: DispatchSummary
  selectedDriverCode: string | null
  vehicleSeq: number
  onChangeSeq: (seq: number) => void
  assigning: boolean
  onAssign: () => void
}

function DispatchCard({
  dispatch,
  selectedDriverCode,
  vehicleSeq,
  onChangeSeq,
  assigning,
  onAssign,
}: DispatchCardProps) {
  return (
    <div
      data-testid={`driver-assignment-dispatch-${dispatch.dispatchId}`}
      style={{
        padding: '10px 12px',
        borderRadius: 6,
        border: '1px solid var(--color-neutral-200, #E5E7EB)',
        background: '#fff',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{dispatch.dispatchDate}</span>
          <Badge variant={dispatch.dispatchType === 'NIGHT' ? 'warning' : 'neutral'}>
            {DISPATCH_TYPE_LABEL[dispatch.dispatchType]}
          </Badge>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              color: 'var(--color-neutral-700, #374151)',
            }}
          >
            차량 #
            <input
              type="number"
              data-testid={`driver-assignment-vehicle-seq-${dispatch.dispatchId}`}
              value={vehicleSeq}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10)
                if (!Number.isNaN(v) && v >= 1 && v <= dispatch.vehicleCount) {
                  onChangeSeq(v)
                }
              }}
              min={1}
              max={dispatch.vehicleCount}
              style={{
                ...inputStyle,
                width: 60,
                height: 28,
                fontSize: 12,
              }}
            />
          </label>
          <Button
            variant="primary"
            size="sm"
            data-testid={
              selectedDriverCode
                ? `driver-assignment-assign-${selectedDriverCode}-${dispatch.dispatchId}`
                : undefined
            }
            onClick={onAssign}
            disabled={!selectedDriverCode || assigning}
            loading={assigning}
            title={
              selectedDriverCode
                ? `${selectedDriverCode} 기사를 차량 #${vehicleSeq} 에 변경/배정`
                : '좌측 기사 목록에서 먼저 기사를 선택하세요'
            }
          >
            {selectedDriverCode ? `${selectedDriverCode} 변경` : '기사 선택 필요'}
          </Button>
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--color-neutral-600, #4B5563)',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span>차량 수: {dispatch.vehicleCount}대</span>
        <span style={{ color: 'var(--color-neutral-500, #6B7280)' }}>
          등록: {dispatch.createdAt?.replace('T', ' ').slice(0, 16) ?? '—'}
        </span>
      </div>
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

const emptyStyle: React.CSSProperties = {
  padding: '24px 12px',
  textAlign: 'center',
  color: 'var(--color-neutral-500, #6B7280)',
  fontSize: 13,
}
