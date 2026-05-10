/**
 * arologis 기사 배정 admin UI — `/arologis/admin/driver-assignment` (P1-5).
 *
 * 매뉴얼: docs/manual/05-arologis/03-기사-배정.md
 *
 * <pre>
 *  ┌────────────────────────────────────────────────────────────────┐
 *  │ 헤더: 기사 배정                [일자 선택]                      │
 *  │                                                                │
 *  │  좌측 (가용 기사 list)       우측 (미배정 배차 + 드롭 영역)    │
 *  │  ┌──────────────────┐       ┌──────────────────────────────┐  │
 *  │  │ 기사코드 / 기사명 │       │ 배차코드 / 정차 / 슬립 수   │  │
 *  │  │ 차량 / 권역      │       │ [기사 선택] 버튼             │  │
 *  │  │ [배정] 버튼      │       │ (또는 기사 리스트에서 배정)  │  │
 *  │  └──────────────────┘       └──────────────────────────────┘  │
 *  └────────────────────────────────────────────────────────────────┘
 * </pre>
 *
 * BE 연결:
 * - GET  /admin/arologis/drivers/available?date          — 가용 기사 목록
 * - GET  /admin/arologis/dispatches?date&status=PENDING  — 미배정 배차 목록
 * - POST /admin/arologis/dispatches/{dispatchCode}/assign — 기사 배정
 *
 * UUID 비공개 (feedback_uuid_no_user_visibility.md):
 * - 노출 식별자: driverCode / driverName / dispatchCode / vehicleLabel / region
 * - UUID 화면 노출 금지.
 *
 * 풀네임 ROLE (feedback_role_naming_full.md): DISPATCH / MANAGER / MASTER.
 *
 * data-testid:
 * - driver-assignment-date-input       — 일자 input
 * - driver-assignment-driver-list      — 기사 목록 패널
 * - driver-assignment-dispatch-list    — 미배정 배차 패널
 * - driver-assignment-driver-{code}    — 기사 행
 * - driver-assignment-dispatch-{code}  — 배차 행
 * - driver-assignment-assign-{dCode}-{dispCode} — 배정 버튼
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card } from '@samhan/design-system'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  getAvailableDrivers,
  getDispatchList,
  assignDriver,
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
  // 선택된 기사 코드 (좌측 기사 list 에서 클릭 → 우측 배차에 배정 가능)
  const [selectedDriverCode, setSelectedDriverCode] = useState<string | null>(null)
  // 배정 진행 중 표시 — dispatchCode 기준
  const [assigningCode, setAssigningCode] = useState<string | null>(null)

  const queryClient = useQueryClient()

  // 가용 기사 목록
  const driverQuery = useQuery({
    queryKey: ['arologis-available-drivers', date],
    queryFn: () => getAvailableDrivers(date),
    enabled: !!date,
  })

  // 미배정 배차 목록 (PENDING 만)
  const dispatchQuery = useQuery({
    queryKey: ['arologis-dispatch-list', date, 'PENDING'],
    queryFn: () => getDispatchList(date, 'PENDING'),
    enabled: !!date,
  })

  const drivers: AvailableDriver[] = driverQuery.data?.drivers ?? []
  const dispatches: DispatchSummary[] = dispatchQuery.data?.dispatches ?? []

  const assignMutation = useMutation({
    mutationFn: ({ dispatchCode, driverCode }: { dispatchCode: string; driverCode: string }) =>
      assignDriver(dispatchCode, driverCode),
    onMutate: ({ dispatchCode }) => {
      setAssigningCode(dispatchCode)
    },
    onSettled: () => {
      setAssigningCode(null)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['arologis-dispatch-list'] })
      void queryClient.invalidateQueries({ queryKey: ['arologis-available-drivers'] })
    },
  })

  const handleAssign = (dispatchCode: string, driverCode: string) => {
    assignMutation.mutate({ dispatchCode, driverCode })
  }

  // 기사 선택 toggle — 같은 기사 재클릭 시 해제
  const handleDriverSelect = (driverCode: string) => {
    setSelectedDriverCode((prev) => (prev === driverCode ? null : driverCode))
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
            좌측 기사를 선택 후 우측 미배정 배차에 [배정] 버튼을 누르세요.
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
            }}
            style={inputStyle}
          />
        </label>
      </div>

      {/* 오류 배너 */}
      {assignMutation.isError ? (
        <div role="alert" className="error-banner" style={{ marginBottom: 16 }}>
          기사 배정에 실패했습니다. 기사 코드 / 배차 코드를 확인하세요.
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
        {/* 우측 — 미배정 배차 리스트     */}
        {/* ============================== */}
        <Card padding={4} shadow="sm">
          <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
            미배정 배차 ({dispatches.length}건)
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
              <div style={emptyStyle}>미배정 배차를 조회 중…</div>
            ) : dispatches.length === 0 ? (
              <div style={emptyStyle}>미배정 배차가 없습니다.</div>
            ) : (
              dispatches.map((dispatch) => (
                <DispatchCard
                  key={dispatch.dispatchCode}
                  dispatch={dispatch}
                  selectedDriverCode={selectedDriverCode}
                  assigning={assigningCode === dispatch.dispatchCode}
                  onAssign={handleAssign}
                />
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// 기사 카드 컴포넌트 (좌측)
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
      tabIndex={driver.active ? 0 : -1}
      onClick={driver.active ? onClick : undefined}
      onKeyDown={(e) => {
        if (driver.active && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        padding: '10px 12px',
        borderRadius: 6,
        border: `2px solid ${selected ? 'var(--color-brand-500, #3B82F6)' : 'var(--color-neutral-200, #E5E7EB)'}`,
        background: selected
          ? 'var(--color-brand-50, #EFF6FF)'
          : driver.active
            ? '#fff'
            : 'var(--color-neutral-50, #F9FAFB)',
        cursor: driver.active ? 'pointer' : 'not-allowed',
        opacity: driver.active ? 1 : 0.55,
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
        <span style={{ fontWeight: 600, fontSize: 13 }}>{driver.driverName}</span>
        <Badge variant={driver.active ? 'success' : 'danger'}>
          {driver.active ? '활성' : '비활성'}
        </Badge>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-neutral-600, #4B5563)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>코드: {driver.driverCode}</span>
        <span>전화: {driver.phone}</span>
        {driver.vehicleLabel ? <span>차량: {driver.vehicleLabel}</span> : null}
        {driver.region ? <span>권역: {driver.region}</span> : null}
        <span>현재 배차: {driver.currentDispatchCount}건</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 배차 카드 컴포넌트 (우측)
// ---------------------------------------------------------------------------

interface DispatchCardProps {
  dispatch: DispatchSummary
  selectedDriverCode: string | null
  assigning: boolean
  onAssign: (dispatchCode: string, driverCode: string) => void
}

function DispatchCard({
  dispatch,
  selectedDriverCode,
  assigning,
  onAssign,
}: DispatchCardProps) {
  return (
    <div
      data-testid={`driver-assignment-dispatch-${dispatch.dispatchCode}`}
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
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {dispatch.dispatchCode}
        </span>
        <Button
          variant="primary"
          size="sm"
          data-testid={
            selectedDriverCode
              ? `driver-assignment-assign-${selectedDriverCode}-${dispatch.dispatchCode}`
              : undefined
          }
          onClick={() => {
            if (selectedDriverCode) {
              onAssign(dispatch.dispatchCode, selectedDriverCode)
            }
          }}
          disabled={!selectedDriverCode || assigning}
          loading={assigning}
          title={
            selectedDriverCode
              ? `${selectedDriverCode} 기사를 ${dispatch.dispatchCode} 배차에 배정`
              : '좌측 기사 목록에서 먼저 기사를 선택하세요'
          }
        >
          {selectedDriverCode ? `${selectedDriverCode} 배정` : '기사 선택 필요'}
        </Button>
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
        <span>정차: {dispatch.totalStops}건</span>
        <span>슬립: {dispatch.totalSlips}건</span>
        {dispatch.driverCode ? (
          <span style={{ color: 'var(--color-warning-700, #b45309)' }}>
            현 기사: {dispatch.driverCode} ({dispatch.driverName})
          </span>
        ) : (
          <span style={{ color: 'var(--color-danger-600, #dc2626)' }}>
            기사 미배정
          </span>
        )}
        {dispatch.vehicleLabel ? <span>차량: {dispatch.vehicleLabel}</span> : null}
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
