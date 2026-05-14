/**
 * VehicleGroupColumn — 배차 보드 우측 차량 그룹 컬럼.
 *
 * <p>Phase A FE-4.
 *
 * 구성:
 * - 상단: [+ 차량 추가] 버튼 + taskCode 표시 + 상태 배지.
 * - 본문: 차량 그룹 카드 list (`VehicleGroupCard`).
 * - 하단: [✓ 배차 완료] 버튼 — 확인 dialog → arologis 발송.
 *
 * 상태 배지:
 *  - DRAFT — "작성 중" (회색).
 *  - DISPATCHING — "발송 완료, 매칭 대기" (파랑).
 *  - DISPATCHED — "배차 완료" (녹색) + 기사 정보.
 *  - FAILED — "배차 불가" (빨강) + 사유 + [재배차] (재배차 backlog Phase A 후속).
 */
import { useMemo, useState } from 'react'
import {
  DISPATCH_TASK_STATUS_LABEL,
  type DispatchTaskStatus,
  type DispatchVehicleGroupResponse,
  type MatchedDriverResponse,
} from '../../../api/dispatchTask'
import { useAddVehicleGroupMutation } from '../hooks/useDispatchTask'
import { VehicleGroupCard } from './VehicleGroupCard'
import { AddVehicleModal } from './AddVehicleModal'
import { DispatchCompleteDialog } from './DispatchCompleteDialog'

interface VehicleGroupColumnProps {
  taskId: string | null
  taskCode: string | null
  taskStatus: DispatchTaskStatus
  failureReason: string | null
  matchedDrivers: MatchedDriverResponse[]
  groups: DispatchVehicleGroupResponse[]
  onOpenSlipDetail: (slipId: string) => void
}

/**
 * 상태 → 배지 색상 매핑 (Samhan Public design tokens).
 */
const STATUS_BADGE_STYLE: Record<DispatchTaskStatus, React.CSSProperties> = {
  DRAFT: {
    background: 'var(--color-neutral-200)',
    color: 'var(--color-neutral-700)',
  },
  DISPATCHING: {
    background: 'var(--color-info-100, #DBEAFE)',
    color: 'var(--color-info-700, #1E40AF)',
  },
  DISPATCHED: {
    background: 'var(--color-success-100, #D1FAE5)',
    color: 'var(--color-success-700, #047857)',
  },
  FAILED: {
    background: 'var(--color-danger-100, #FEE2E2)',
    color: 'var(--color-danger-700, #B91C1C)',
  },
}

export function VehicleGroupColumn({
  taskId,
  taskCode,
  taskStatus,
  failureReason,
  matchedDrivers,
  groups,
  onOpenSlipDetail,
}: VehicleGroupColumnProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)

  const addMutation = useAddVehicleGroupMutation(taskId)

  // matchedDrivers 를 vehicleGroupSequence 기준 dict 화 (그룹 카드 헤더에 inline 노출).
  const matchedByGroupSeq = useMemo(() => {
    const m = new Map<number, MatchedDriverResponse>()
    matchedDrivers.forEach((d) => m.set(d.vehicleGroupSequence, d))
    return m
  }, [matchedDrivers])

  const canEdit = taskStatus === 'DRAFT'
  const canDispatch =
    taskStatus === 'DRAFT' && groups.length > 0 && groups.some((g) => g.slips.length > 0)

  return (
    <section
      data-testid="dispatch-board-vehicle-group-column"
      aria-label="차량 그룹 컬럼"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--color-neutral-0)',
        border: '1px solid var(--color-neutral-200)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: 12,
          borderBottom: '1px solid var(--color-neutral-200)',
          background: 'var(--color-neutral-50)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
        >
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>차량 그룹</h3>
          {taskCode ? (
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-neutral-500)',
                fontFamily: 'var(--font-family-mono, monospace)',
              }}
              data-testid="dispatch-board-task-code"
            >
              {taskCode}
            </span>
          ) : null}
          <span
            data-testid="dispatch-board-task-status"
            style={{
              marginLeft: 'auto',
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 600,
              ...STATUS_BADGE_STYLE[taskStatus],
            }}
          >
            {DISPATCH_TASK_STATUS_LABEL[taskStatus]}
          </span>
        </div>
        {taskStatus === 'FAILED' && failureReason ? (
          <div
            data-testid="dispatch-board-failure-reason"
            style={{
              padding: 8,
              fontSize: 12,
              color: 'var(--color-danger-700, #B91C1C)',
              background: 'var(--color-danger-50, #FEF2F2)',
              border: '1px solid var(--color-danger-200, #FECACA)',
              borderRadius: 4,
            }}
            role="alert"
          >
            <strong>배차 불가 사유:</strong> {failureReason}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          disabled={!canEdit || !taskId || addMutation.isPending}
          data-testid="dispatch-board-add-vehicle-button"
          style={{
            padding: '8px 12px',
            background: canEdit ? 'var(--color-action-brand, #1E40AF)' : 'var(--color-neutral-200)',
            color: canEdit ? 'var(--color-neutral-0)' : 'var(--color-neutral-500)',
            border: 'none',
            borderRadius: 4,
            cursor: canEdit && taskId ? 'pointer' : 'not-allowed',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          + 차량 추가
        </button>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {groups.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--color-neutral-500)',
              fontSize: 13,
              border: '2px dashed var(--color-neutral-200)',
              borderRadius: 8,
            }}
          >
            차량 그룹이 없습니다. [+ 차량 추가] 로 시작하세요.
          </div>
        ) : (
          groups.map((g) => (
            <VehicleGroupCard
              key={g.id}
              taskId={taskId}
              group={g}
              matchedDriver={matchedByGroupSeq.get(g.sequence) ?? null}
              canEdit={canEdit}
              onOpenSlipDetail={onOpenSlipDetail}
            />
          ))
        )}
      </div>

      <footer
        style={{
          padding: 12,
          borderTop: '1px solid var(--color-neutral-200)',
          background: 'var(--color-neutral-50)',
        }}
      >
        <button
          type="button"
          disabled={!canDispatch}
          onClick={() => setCompleteOpen(true)}
          data-testid="dispatch-board-complete-button"
          style={{
            width: '100%',
            padding: '10px 12px',
            background: canDispatch
              ? 'var(--color-success-600, #059669)'
              : 'var(--color-neutral-200)',
            color: canDispatch ? 'var(--color-neutral-0)' : 'var(--color-neutral-500)',
            border: 'none',
            borderRadius: 4,
            cursor: canDispatch ? 'pointer' : 'not-allowed',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ✓ 배차 완료
        </button>
      </footer>

      {addOpen && taskId ? (
        <AddVehicleModal
          onClose={() => setAddOpen(false)}
          onAdd={(vt) => {
            addMutation.mutate(vt, {
              onSettled: () => setAddOpen(false),
            })
          }}
          submitting={addMutation.isPending}
        />
      ) : null}

      {completeOpen && taskId ? (
        <DispatchCompleteDialog
          taskId={taskId}
          taskCode={taskCode}
          totalSlips={groups.reduce((sum, g) => sum + g.slips.length, 0)}
          totalGroups={groups.length}
          onClose={() => setCompleteOpen(false)}
        />
      ) : null}
    </section>
  )
}
