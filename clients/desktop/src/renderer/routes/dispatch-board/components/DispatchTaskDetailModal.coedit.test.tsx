// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DispatchTaskResponse } from '../../../api/dispatchTask'

vi.mock('@samhan/design-system', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
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

vi.mock('../../../components/collab/CollaborativeTextField', () => ({
  CollaborativeTextField: (props: {
    documentId: string
    basePath: string
    fieldName: string
    label: string
    rows?: number
    readOnly?: boolean
  }) => (
    <div
      data-testid="memo-coedit-stub"
      data-document-id={props.documentId}
      data-base-path={props.basePath}
      data-field-name={props.fieldName}
      data-rows={String(props.rows)}
      data-read-only={String(props.readOnly)}
    >
      {props.label}
    </div>
  ),
}))

vi.mock('../../../hooks/usePresence', () => ({ usePresence: () => [] }))
const canAccessMock = vi.fn(() => true)
vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: canAccessMock }),
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
vi.mock('../hooks/useDispatchTask', () => ({
  dispatchTaskQueryKey: (taskId: string) => ['dispatchTask', taskId],
  useMarkManualDispatchCompleteMutation: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
  useRestoreSlipFromGroupMutation: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
  useRestoreVehicleGroupMutation: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
  useSetMatchedDriverMutation: () => ({ isPending: false, isError: false, mutate: vi.fn(), reset: vi.fn() }),
  useStartRedispatchMutation: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
}))

import { DispatchTaskDetailModal } from './DispatchTaskDetailModal'

function makeTask(id: string): DispatchTaskResponse {
  return {
    id,
    taskCode: '2099/06/13-1',
    dispatchDate: '2099-06-13',
    status: 'DISPATCHED',
    arologisDispatchId: 'ARO-1',
    vehicleGroups: [],
    matchedDrivers: [],
    duplicateSlipIds: [],
    failureReason: null,
    memo: '저장 비고',
    modificationReason: null,
    rejectionReason: null,
    modificationRequestedAt: null,
    modificationDecidedAt: null,
  }
}

function renderModal(taskId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DispatchTaskDetailModal task={makeTask(taskId)} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
})

describe('DispatchTaskDetailModal coedit 메모 배선', () => {
  it('협업 메모 필드를 documentId/basePath(encodeURIComponent)/fieldName=memo 로 배선한다', () => {
    renderModal('task/id with spaces')
    const stub = screen.getByTestId('memo-coedit-stub')
    expect(stub.textContent).toBe('협업 메모')
    expect(stub.getAttribute('data-document-id')).toBe('task/id with spaces')
    expect(stub.getAttribute('data-base-path')).toBe('/admin/dispatch-tasks/task%2Fid%20with%20spaces')
    expect(stub.getAttribute('data-field-name')).toBe('memo')
    expect(stub.getAttribute('data-rows')).toBe('4')
    expect(stub.getAttribute('data-read-only')).toBe('false')
  })

  it('편집 권한이 없으면 협업 메모를 readOnly 로 배선한다', () => {
    canAccessMock.mockReturnValue(false)
    renderModal('dispatch-readonly')
    expect(screen.getByTestId('memo-coedit-stub').getAttribute('data-read-only')).toBe('true')
  })
})
