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
  isEditableStatus,
  type DispatchTaskResponse,
  type DispatchTaskStatus,
  type DispatchVehicleGroupResponse,
  type MatchedDriverResponse,
} from '../../../api/dispatchTask'
import { useAddVehicleGroupMutation } from '../hooks/useDispatchTask'
import { VehicleGroupCard } from './VehicleGroupCard'
import { AddVehicleModal } from './AddVehicleModal'
import { DispatchCompleteDialog } from './DispatchCompleteDialog'
import { DispatchTaskDetailModal } from './DispatchTaskDetailModal'

interface VehicleGroupColumnProps {
  taskId: string | null
  taskCode: string | null
  taskStatus: DispatchTaskStatus
  failureReason: string | null
  matchedDrivers: MatchedDriverResponse[]
  groups: DispatchVehicleGroupResponse[]
  /** 상세 modal 진입 시 사용. 전체 task 객체 (badge 클릭 시 modal 에 전달). */
  task: DispatchTaskResponse | null
  onOpenSlipDetail: (slipId: string) => void
}

/**
 * 상태 → 배지 색상 매핑 (Samhan Public design tokens + Phase C 6 신규 + CANCELLED).
 *
 * <p>Phase C 색상 규칙 (spec § 6.1):
 *  - MODIFICATION_REQUESTED / CANCEL_REQUESTED → 보라색 (요청 대기)
 *  - MODIFICATION_ACCEPTED / CANCEL_ACCEPTED → 녹색 (수락됨)
 *  - MODIFICATION_REJECTED / CANCEL_REJECTED → 빨강 (거부됨)
 *  - CANCELLED → 회색 (취소 완료, 종착 상태)
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
  MODIFICATION_REQUESTED: {
    background: 'var(--color-purple-100, #EDE9FE)',
    color: 'var(--color-purple-700, #6B21A8)',
  },
  MODIFICATION_ACCEPTED: {
    background: 'var(--color-success-100, #D1FAE5)',
    color: 'var(--color-success-700, #047857)',
  },
  MODIFICATION_REJECTED: {
    background: 'var(--color-danger-100, #FEE2E2)',
    color: 'var(--color-danger-700, #B91C1C)',
  },
  CANCEL_REQUESTED: {
    background: 'var(--color-purple-100, #EDE9FE)',
    color: 'var(--color-purple-700, #6B21A8)',
  },
  CANCEL_ACCEPTED: {
    background: 'var(--color-success-100, #D1FAE5)',
    color: 'var(--color-success-700, #047857)',
  },
  CANCEL_REJECTED: {
    background: 'var(--color-danger-100, #FEE2E2)',
    color: 'var(--color-danger-700, #B91C1C)',
  },
  CANCELLED: {
    background: 'var(--color-neutral-200)',
    color: 'var(--color-neutral-700)',
  },
}

export function VehicleGroupColumn({
  taskId,
  taskCode,
  taskStatus,
  failureReason,
  matchedDrivers,
  groups,
  task,
  onOpenSlipDetail,
}: VehicleGroupColumnProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  const addMutation = useAddVehicleGroupMutation(taskId)

  // matchedDrivers 를 vehicleGroupSequence 기준 dict 화 (그룹 카드 헤더에 inline 노출).
  const matchedByGroupSeq = useMemo(() => {
    const m = new Map<number, MatchedDriverResponse>()
    matchedDrivers.forEach((d) => m.set(d.vehicleGroupSequence, d))
    return m
  }, [matchedDrivers])

  // Phase C — DRAFT 또는 MODIFICATION_ACCEPTED 시 편집 가능 (D-DC-08).
  const canEdit = isEditableStatus(taskStatus)
  const canDispatch =
    canEdit && groups.length > 0 && groups.some((g) => g.slips.length > 0)

  // Phase C — DISPATCHED 이후 (배차 완료 후) 상태에서 상세 모달 진입 가능.
  // 단순화: DRAFT/DISPATCHING 외 모든 상태에서 상세 보기 활성.
  const canOpenDetail =
    !!task &&
    taskStatus !== 'DRAFT' &&
    taskStatus !== 'DISPATCHING'

  // 거부 사유 / 요청 사유가 있을 때 헤더에 inline 안내 노출.
  const showRejectionBanner =
    !!task?.rejectionReason &&
    (taskStatus === 'MODIFICATION_REJECTED' || taskStatus === 'CANCEL_REJECTED')
  const showRequestBanner =
    !!task?.modificationReason &&
    (taskStatus === 'MODIFICATION_REQUESTED' || taskStatus === 'CANCEL_REQUESTED')
  const showAcceptedBanner = taskStatus === 'MODIFICATION_ACCEPTED'

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
          {canOpenDetail ? (
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              data-testid="dispatch-board-task-status"
              aria-label={`배차 작업 상세 보기 — 현재 상태: ${DISPATCH_TASK_STATUS_LABEL[taskStatus]}`}
              style={{
                marginLeft: 'auto',
                padding: '2px 8px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                border: '1px dashed transparent',
                cursor: 'pointer',
                ...STATUS_BADGE_STYLE[taskStatus],
              }}
            >
              {DISPATCH_TASK_STATUS_LABEL[taskStatus]} ⓘ
            </button>
          ) : (
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
          )}
        </div>
        {showAcceptedBanner ? (
          <div
            data-testid="dispatch-board-modification-accepted-banner"
            role="status"
            style={{
              padding: 8,
              fontSize: 12,
              color: 'var(--color-success-700, #047857)',
              background: 'var(--color-success-50, #ECFDF5)',
              border: '1px solid var(--color-success-200, #A7F3D0)',
              borderRadius: 4,
            }}
          >
            <strong>수정 가능 (편집 모드 활성):</strong> 차량/슬립 구성을 수정한 뒤 [배차 완료] 를 다시 누르면 아로로지스로 재 발송됩니다.
          </div>
        ) : null}
        {showRequestBanner ? (
          <div
            data-testid="dispatch-board-modification-pending-banner"
            role="status"
            style={{
              padding: 8,
              fontSize: 12,
              color: 'var(--color-purple-700, #6B21A8)',
              background: 'var(--color-purple-50, #FAF5FF)',
              border: '1px solid var(--color-purple-200, #E9D5FF)',
              borderRadius: 4,
            }}
          >
            <strong>아로로지스 회신 대기:</strong> {task?.modificationReason}
          </div>
        ) : null}
        {showRejectionBanner ? (
          <div
            data-testid="dispatch-board-rejection-banner"
            role="alert"
            style={{
              padding: 8,
              fontSize: 12,
              color: 'var(--color-danger-700, #B91C1C)',
              background: 'var(--color-danger-50, #FEF2F2)',
              border: '1px solid var(--color-danger-200, #FECACA)',
              borderRadius: 4,
            }}
          >
            <strong>거부 사유:</strong> {task?.rejectionReason}
          </div>
        ) : null}
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
          aria-label={
            taskStatus === 'MODIFICATION_ACCEPTED'
              ? '수정 배차 완료 — 아로로지스로 재 발송'
              : '배차 완료 — 아로로지스로 발송'
          }
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
          {taskStatus === 'MODIFICATION_ACCEPTED'
            ? '✓ 수정 배차 완료 (재 발송)'
            : '✓ 배차 완료'}
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

      {detailOpen && task ? (
        <DispatchTaskDetailModal
          task={task}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </section>
  )
}
