/**
 * 배차 메뉴 (Samhan Public Phase A) — `/dispatch-board` 진입 페이지.
 *
 * 좌우 split layout:
 * - 좌측: 미배차 출고전표 list (날짜 ±1일 + 50/page) — `UnDispatchedSlipList`
 * - 우측: 차량 그룹 컬럼 (9 종류 차량 추가 + drag-and-drop + 배차 완료) — `VehicleGroupColumn`
 *
 * UI 흐름 (spec § 5.1, plan F1~F5):
 *  - 좌측 미배차 슬립을 drag → 우측 차량 그룹 drop 시 `POST /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips`
 *  - 그룹 내부 sortable 순서 변경 시 `PUT .../slips/order`
 *  - 차량 추가 modal 에서 9 종류 (오토바이/다마스/1톤/1.5/2.5/3/5/10/20톤) 선택 → group 생성
 *  - [배차 완료] → 확인 dialog → `POST /admin/dispatch-tasks/{taskId}/dispatch` → DISPATCHED 회신 대기
 *
 * UUID 비공개 (feedback_uuid_no_user_visibility.md):
 *  - slipNumber / taskCode / partnerCode / driverCode 만 사용자 노출.
 *  - 모든 UUID 식별자는 API path/body 안에만 사용.
 *
 * accessibility:
 *  - 좌측 drag handle = `aria-label="출고전표 {slipNumber} {partnerName} 드래그 가능"`.
 *  - 키보드 드래그 (스페이스 grab + 화살표 이동, @dnd-kit/core KeyboardSensor 기본).
 *  - 모바일은 `clients/mobile-staff` 의 `DispatchBoardScreen` 에서 tab 전환 + TouchSensor 활용.
 *
 * DndContext 위치 결정:
 *  - DndContext 는 page level 에 둔다 — 좌측 (drag source) ↔ 우측 (drop target) 양쪽을 wrap 해야
 *    cross-component 드래그가 작동한다. PointerSensor + TouchSensor + KeyboardSensor 동시 활성.
 *  - desktop 은 PointerSensor 기본 + TouchSensor long-press 250ms 보조 (mouse + touch 양쪽 지원).
 *  - 모바일 RN 은 별도 화면 (`DispatchBoardScreen`) 에서 TouchSensor 만 활성.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { usePageTitle } from '../../hooks/usePageTitle'
import { UnDispatchedSlipList } from './components/UnDispatchedSlipList'
import { VehicleGroupColumn } from './components/VehicleGroupColumn'
import { SlipDetailModal } from './components/SlipDetailModal'
import { todayIsoSeoul } from '../../api/dispatchBoard'
import {
  useAssignSlipToGroupMutation,
  useCreateDispatchTaskMutation,
  useDispatchTaskQuery,
  useReorderGroupSlipsMutation,
} from './hooks/useDispatchTask'
import type { DispatchSlipDragData } from './components/UnDispatchedSlipList'

/**
 * 그룹 안 sortable slip row 가 useSortable 에 넘기는 data.
 */
export interface DispatchGroupSlipDragData {
  type: 'group-slip'
  groupId: string
  slipId: string
  slipNumber: string
}

/**
 * Phase A 배차 메뉴 page.
 *
 * <p>진입 직후 mount 1회만 `createDispatchTask` 호출하여 빈 DRAFT task 생성 →
 * 응답의 task UUID + taskCode 를 page state 로 보관. 모든 후속 mutation 은 본 taskId 인자 사용.
 */
export default function DispatchBoardPage() {
  usePageTitle('배차 메뉴')

  // 슬립 상세 modal (slipId 보유 시 open).
  const [detailSlipId, setDetailSlipId] = useState<string | null>(null)

  // 현재 task UUID — mount 직후 자동 생성.
  const [taskId, setTaskId] = useState<string | null>(null)

  const createMutation = useCreateDispatchTaskMutation()
  const taskQuery = useDispatchTaskQuery(taskId)

  useEffect(() => {
    if (taskId) return
    if (createMutation.isPending || createMutation.isError) return
    createMutation.mutate(todayIsoSeoul(), {
      onSuccess: (task) => setTaskId(task.id),
    })
    // intentionally exclude createMutation from deps (mutate stable reference)
  }, [taskId])

  const task = taskQuery.data

  const assignMutation = useAssignSlipToGroupMutation(taskId)
  const reorderMutation = useReorderGroupSlipsMutation(taskId)

  // @dnd-kit sensors — PointerSensor (mouse + pen) + TouchSensor (long-press 250ms) +
  // KeyboardSensor (스페이스 grab + 화살표 이동, accessibility 가드).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  /**
   * onDragEnd — 두 흐름 처리.
   * 1) 좌측 미배차 slip → 우측 차량 그룹: `assignSlipToGroup` mutation.
   * 2) 그룹 안 slip 순서 변경: `reorderGroupSlips` mutation.
   *
   * over.data.current 의 type 으로 drop target 판별:
   *  - `group` → 우측 그룹 컨테이너 drop (slip 할당).
   *  - `group-slip` → 그룹 안 다른 slip 자리 drop (순서 변경).
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || !taskId || !task) return
    const activeData = active.data.current as
      | DispatchSlipDragData
      | DispatchGroupSlipDragData
      | undefined
    const overData = over.data.current as
      | { type: 'group'; groupId: string }
      | DispatchGroupSlipDragData
      | undefined
    if (!activeData || !overData) return

    // case 1: 좌측 list → 차량 그룹 drop.
    if (activeData.type === 'slip') {
      const groupId =
        overData.type === 'group' ? overData.groupId : overData.groupId
      if (!groupId) return
      assignMutation.mutate({ groupId, slipId: activeData.slipId })
      return
    }

    // case 2: 그룹 안 sortable 순서 변경.
    if (activeData.type === 'group-slip' && overData.type === 'group-slip') {
      if (activeData.groupId !== overData.groupId) {
        // 그룹 간 이동은 현재 backend 단일 endpoint 미지원 — Phase A 범위 외.
        return
      }
      const group = task.vehicleGroups.find((g) => g.id === activeData.groupId)
      if (!group) return
      const currentIds = group.slips.map((s) => s.slip.id)
      const oldIndex = currentIds.indexOf(activeData.slipId)
      const newIndex = currentIds.indexOf(overData.slipId)
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return
      const newOrder = arrayMove(currentIds, oldIndex, newIndex)
      reorderMutation.mutate({ groupId: activeData.groupId, orderedSlipIds: newOrder })
    }
  }

  // task 가 아직 없으면 spinner.
  const initializing = !taskId && createMutation.isPending
  const failed = !taskId && createMutation.isError

  const groups = useMemo(() => task?.vehicleGroups ?? [], [task])

  return (
    <div
      className="dispatch-board-page"
      data-testid="dispatch-board-page"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 16,
        padding: 16,
        height: '100%',
        minHeight: 0,
      }}
    >
      {initializing ? (
        <div
          style={{ gridColumn: '1 / span 2', padding: 24, color: 'var(--color-neutral-500)' }}
        >
          배차 작업을 준비하는 중…
        </div>
      ) : failed ? (
        <div
          style={{ gridColumn: '1 / span 2', padding: 24, color: 'var(--color-danger-500)' }}
          role="alert"
        >
          배차 작업 초기화 실패. 페이지를 새로고침해주세요.
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <UnDispatchedSlipList onOpenSlipDetail={(id) => setDetailSlipId(id)} />
          <VehicleGroupColumn
            taskId={taskId}
            taskCode={task?.taskCode ?? null}
            taskStatus={task?.status ?? 'DRAFT'}
            failureReason={task?.failureReason ?? null}
            matchedDrivers={task?.matchedDrivers ?? []}
            groups={groups}
            task={task ?? null}
            onOpenSlipDetail={(id) => setDetailSlipId(id)}
          />
        </DndContext>
      )}
      {detailSlipId ? (
        <SlipDetailModal
          slipId={detailSlipId}
          onClose={() => setDetailSlipId(null)}
        />
      ) : null}
    </div>
  )
}
