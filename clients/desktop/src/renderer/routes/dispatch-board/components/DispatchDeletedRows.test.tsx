// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  DispatchTaskResponse,
  DispatchVehicleGroupResponse,
} from '../../../api/dispatchTask'

vi.mock('@samhan/design-system', () => ({
  safeActorName: (value: string | null | undefined) => value === 'system' ? '시스템' : value,
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  ),
  Button: ({
    children,
    loading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
    <button aria-busy={loading || undefined} {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Modal: ({
    children,
    footer,
    title,
  }: {
    children: React.ReactNode
    footer?: React.ReactNode
    title?: React.ReactNode
  }) => (
    <section>
      <h2>{title}</h2>
      {children}
      {footer}
    </section>
  ),
  Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
}))

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

const canAccessMock = vi.fn(() => true)
vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: canAccessMock }),
}))

vi.mock('../../../hooks/usePresence', () => ({ usePresence: () => [] }))
vi.mock('../../../components/collab/CollaborativeTextField', () => ({
  CollaborativeTextField: () => <div data-testid="memo-coedit-stub" />,
}))
vi.mock('../../../realtime/DispatchCollabRealtimeClient', () => ({
  DispatchCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))
vi.mock('../../../api/dispatchCollab', () => ({
  commitDispatchCollabEdit: vi.fn(),
  getDispatchCollabEdits: vi.fn(() => Promise.resolve([])),
}))
vi.mock('./DispatchCommentThread', () => ({
  DispatchCommentThread: () => <div data-testid="dispatch-comment-thread" />,
  dispatchCommentsQueryKey: (taskId: string) => ['dispatchComments', taskId],
}))
vi.mock('./ModificationRequestDialog', () => ({ ModificationRequestDialog: () => null }))
vi.mock('./CancellationRequestDialog', () => ({ CancellationRequestDialog: () => null }))

const restoreGroupMutate = vi.fn()
const restoreSlipMutate = vi.fn()
vi.mock('../hooks/useDispatchTask', () => ({
  dispatchTaskQueryKey: (taskId: string) => ['dispatchTask', taskId],
  useDeleteVehicleGroupMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useAssignSlipToGroupMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useRemoveSlipFromGroupMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useRestoreVehicleGroupMutation: () => ({ isPending: false, mutate: restoreGroupMutate }),
  useRestoreSlipFromGroupMutation: () => ({ isPending: false, mutate: restoreSlipMutate }),
  useMarkManualDispatchCompleteMutation: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
  useSetMatchedDriverMutation: () => ({ isPending: false, isError: false, mutate: vi.fn(), reset: vi.fn() }),
  useStartRedispatchMutation: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
}))

import { DispatchTaskDetailModal } from './DispatchTaskDetailModal'
import { VehicleGroupCard } from './VehicleGroupCard'

function deletedGroup(overrides: Partial<DispatchVehicleGroupResponse> = {}): DispatchVehicleGroupResponse {
  return {
    id: 'group-1',
    sequence: 1,
    vehicleType: 'TONNAGE_1',
    vehicleTypeDisplay: '1톤',
    vehicleBodyType: 'CARGO',
    vehicleBodyTypeDisplay: '카고',
    tonnage: 'T_1',
    tonnageDisplay: '1톤',
    dispatchStatus: 'PENDING',
    isDeleted: true,
    deletedAt: '2026-07-02T10:20:00',
    deletedByName: '이운영',
    slips: [
      {
        id: 'mapping-1',
        slipId: 'slip-1',
        sequence: 1,
        isDeleted: true,
        deletedAt: '2026-07-02T10:20:00',
        deletedByName: null,
        slip: {
          slipNo: '2026/07/02-1',
          partnerCode: 'P-001',
          partnerName: '동탄공조',
          deliveryAddress: null,
          recipientPhone: null,
          dispatchStatus: 'UNDISPATCHED',
        },
      },
    ],
    ...overrides,
  }
}

function taskWithDeletedRows(group: DispatchVehicleGroupResponse = deletedGroup()): DispatchTaskResponse {
  return {
    id: 'task-1',
    taskCode: '2026/07/02-1',
    dispatchDate: '2026-07-02',
    status: 'DRAFT',
    arologisDispatchId: null,
    vehicleGroups: [group],
    matchedDrivers: [],
    duplicateSlipIds: [],
    failureReason: null,
    memo: null,
    modificationReason: null,
    rejectionReason: null,
    modificationRequestedAt: null,
    modificationDecidedAt: null,
  }
}

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
  restoreGroupMutate.mockReset()
  restoreSlipMutate.mockReset()
})

describe('dispatch deleted rows', () => {
  it('삭제 그룹과 삭제 전표 매핑을 숨기지 않고 취소선과 삭제자 배지로 표시한다', () => {
    renderWithQueryClient(
      <VehicleGroupCard
        taskId="task-1"
        group={deletedGroup()}
        matchedDriver={null}
        canEdit
        taskStatus="DRAFT"
        duplicateSlipIds={[]}
        assignedSlips={[]}
        selected={false}
        onSelectedChange={vi.fn()}
        onOpenSlipDetail={vi.fn()}
      />,
    )

    expect(screen.getByTestId('dispatch-board-vehicle-group-1')).toBeTruthy()
    expect(screen.getByText('삭제: 이운영')).toBeTruthy()
    expect(screen.getByText('삭제됨')).toBeTruthy()
    expect(screen.getByTestId('dispatch-board-vehicle-group-1-deleted-label').style.textDecoration)
      .toContain('line-through')
    expect(screen.getByTestId('dispatch-board-group-slip-2026/07/02-1-deleted-label').style.textDecoration)
      .toContain('line-through')
  })

  it('복원 권한이 없으면 삭제행 복원 버튼을 노출하지 않는다', () => {
    canAccessMock.mockImplementation((_page, action) => action !== 'restore')

    renderWithQueryClient(
      <DispatchTaskDetailModal
        task={taskWithDeletedRows()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('dispatch-task-detail-restore-group-1')).toBeNull()
    expect(screen.queryByTestId('dispatch-task-detail-restore-slip-2026/07/02-1')).toBeNull()
  })

  it('복원 권한이 있으면 보드 카드에서 삭제 그룹 복원 버튼을 노출한다', () => {
    renderWithQueryClient(
      <VehicleGroupCard
        taskId="task-1"
        group={deletedGroup()}
        matchedDriver={null}
        canEdit
        taskStatus="DRAFT"
        duplicateSlipIds={[]}
        assignedSlips={[]}
        selected={false}
        onSelectedChange={vi.fn()}
        onOpenSlipDetail={vi.fn()}
      />,
    )

    expect(screen.getByTestId('dispatch-board-vehicle-group-1-restore')).toBeTruthy()
  })

  it('deletedByName 이 null 이면 삭제자 이름을 추정하지 않고 삭제됨만 표시한다', () => {
    renderWithQueryClient(
      <DispatchTaskDetailModal
        task={taskWithDeletedRows(deletedGroup({ deletedByName: null }))}
        onClose={vi.fn()}
        readOnly
      />,
    )

    expect(screen.getAllByText('삭제됨').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/삭제: /)).toBeNull()
  })

  it('비-DRAFT 상태에서는 복원 버튼을 노출하지 않는다 (BE requireDraftTask 게이트 정합)', () => {
    renderWithQueryClient(
      <VehicleGroupCard
        taskId="task-1"
        group={deletedGroup()}
        matchedDriver={null}
        canEdit={false}
        taskStatus="DISPATCHED"
        duplicateSlipIds={[]}
        assignedSlips={[]}
        selected={false}
        onSelectedChange={vi.fn()}
        onOpenSlipDetail={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('dispatch-board-vehicle-group-1-restore')).toBeNull()

    const dispatchedTask = { ...taskWithDeletedRows(), status: 'DISPATCHING' as const }
    renderWithQueryClient(
      <DispatchTaskDetailModal task={dispatchedTask} onClose={vi.fn()} />,
    )
    expect(screen.queryByTestId('dispatch-task-detail-restore-group-1')).toBeNull()
  })

  it('복원 실패 시 카드에 role=alert 에러를 표시한다', () => {
    restoreGroupMutate.mockImplementation(
      (_groupId: string, opts?: { onError?: (e: unknown) => void }) => {
        opts?.onError?.(new Error('409'))
      },
    )
    renderWithQueryClient(
      <VehicleGroupCard
        taskId="task-1"
        group={deletedGroup()}
        matchedDriver={null}
        canEdit
        taskStatus="DRAFT"
        duplicateSlipIds={[]}
        assignedSlips={[]}
        selected={false}
        onSelectedChange={vi.fn()}
        onOpenSlipDetail={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('dispatch-board-vehicle-group-1-restore'))

    expect(restoreGroupMutate).toHaveBeenCalledWith('group-1', expect.anything())
    const alert = screen.getByTestId('dispatch-board-vehicle-group-1-restore-error')
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toContain('복원에 실패했습니다')
  })

  it('카운트/게이팅은 활성 행 기준이고 삭제행에는 중복 경고를 표시하지 않는다', () => {
    const mixedGroup = deletedGroup({
      isDeleted: false,
      deletedAt: null,
      deletedByName: null,
      slips: [
        {
          id: 'mapping-1',
          slipId: 'slip-1',
          sequence: 1,
          isDeleted: true,
          deletedAt: '2026-07-02T10:20:00',
          deletedByName: '이운영',
          slip: {
            slipNo: '2026/07/02-1',
            partnerCode: 'P-001',
            partnerName: '동탄공조',
            deliveryAddress: null,
            recipientPhone: null,
            dispatchStatus: 'UNDISPATCHED',
          },
        },
        {
          id: 'mapping-2',
          slipId: 'slip-2',
          sequence: 1,
          isDeleted: false,
          deletedAt: null,
          deletedByName: null,
          slip: {
            slipNo: '2026/07/02-2',
            partnerCode: 'P-002',
            partnerName: '수원설비',
            deliveryAddress: null,
            recipientPhone: null,
            dispatchStatus: 'UNDISPATCHED',
          },
        },
      ],
    })

    renderWithQueryClient(
      <VehicleGroupCard
        taskId="task-1"
        group={mixedGroup}
        matchedDriver={null}
        canEdit
        taskStatus="DRAFT"
        duplicateSlipIds={['slip-1']}
        assignedSlips={[]}
        selected={false}
        onSelectedChange={vi.fn()}
        onOpenSlipDetail={vi.fn()}
      />,
    )

    // 삭제행 1 + 활성행 1 → 카운트는 활성 1건, 취소선 행이 있어도 그룹 삭제 게이트는 활성 0 일 때만 풀림.
    expect(screen.getByTestId('dispatch-board-vehicle-group-1-count').textContent).toBe('(1건)')
    // 삭제행(slip-1)이 duplicateSlipIds 에 있어도 취소선 행에는 ⚠ 를 붙이지 않는다.
    expect(screen.queryByTestId('dispatch-board-group-slip-2026/07/02-1-duplicate-warning')).toBeNull()
  })
})
