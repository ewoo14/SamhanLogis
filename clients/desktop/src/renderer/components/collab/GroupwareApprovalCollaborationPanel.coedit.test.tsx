// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// CollaborativeTextField 를 stub 으로 대체해 패널이 넘기는 props(배선)만 단언 — 실 provider/네트워크 회피.
vi.mock('./CollaborativeTextField', () => ({
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

vi.mock('../../hooks/usePresence', () => ({ usePresence: () => [] }))
const canAccessMock = vi.fn(() => true)
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../realtime/GroupwareApprovalCollabRealtimeClient', () => ({
  GroupwareApprovalCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))
vi.mock('../../api/groupwareApprovalCollab', () => ({
  getGroupwareApprovalCollabComments: vi.fn(() => Promise.resolve([])),
  getGroupwareApprovalCollabEdits: vi.fn(() => Promise.resolve([])),
  addGroupwareApprovalCollabComment: vi.fn(),
  deleteGroupwareApprovalCollabComment: vi.fn(),
  resolveGroupwareApprovalCollabComment: vi.fn(),
  commitGroupwareApprovalCollabEdit: vi.fn(),
}))

import { GroupwareApprovalCollaborationPanel } from './GroupwareApprovalCollaborationPanel'

function renderPanel(approvalId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <GroupwareApprovalCollaborationPanel
        approvalId={approvalId}
        approvalNo="GW-1"
        status="PENDING"
        currentValues={{ title: '결재 제목', content: null }}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
})

describe('GroupwareApprovalCollaborationPanel coedit 메모 배선', () => {
  it('협업 메모 필드를 documentId/basePath(encodeURIComponent)/fieldName=memo 로 배선한다', () => {
    renderPanel('approval/id with spaces')
    const stub = screen.getByTestId('memo-coedit-stub')
    expect(stub.textContent).toBe('협업 메모')
    expect(stub.getAttribute('data-document-id')).toBe('approval/id with spaces')
    expect(stub.getAttribute('data-base-path')).toBe('/admin/groupware/approvals/approval%2Fid%20with%20spaces')
    expect(stub.getAttribute('data-field-name')).toBe('memo')
    expect(stub.getAttribute('data-rows')).toBe('4')
    expect(stub.getAttribute('data-read-only')).toBe('false')
  })

  it('편집 권한이 없으면 협업 메모를 readOnly 로 배선한다', () => {
    canAccessMock.mockReturnValue(false)
    renderPanel('approval-readonly')
    expect(screen.getByTestId('memo-coedit-stub').getAttribute('data-read-only')).toBe('true')
  })
})
