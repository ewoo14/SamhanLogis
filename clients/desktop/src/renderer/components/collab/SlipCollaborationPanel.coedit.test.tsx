// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('./CollaborativeTextField', () => ({
  CollaborativeTextField: () => <div>협업 메모</div>,
}))
vi.mock('../audit/SlipVersionHistoryPanel', () => ({
  SlipVersionHistoryPanel: () => <div data-testid="slip-version-history-stub" />,
}))

const canAccessMock = vi.fn(() => true)
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../realtime/SlipCollabRealtimeClient', () => ({
  SlipCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))
vi.mock('../../api/slipCollab', () => ({
  getSlipCollabComments: vi.fn(() => Promise.resolve([])),
  getSlipCollabEdits: vi.fn(() => Promise.resolve([])),
  addSlipCollabComment: vi.fn(),
  deleteSlipCollabComment: vi.fn(),
  resolveSlipCollabComment: vi.fn(),
  commitSlipCollabEdit: vi.fn(),
}))

import { SlipCollaborationPanel } from './SlipCollaborationPanel'

function renderPanel(slipId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SlipCollaborationPanel slipId={slipId} currentValues={{ memo: null }} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
})

describe('SlipCollaborationPanel 협업 패널 배치', () => {
  it('협업 메모를 제거하고 코멘트를 수정 이력 위에 전폭으로 렌더한다', () => {
    renderPanel('slip/id with spaces')

    const commentSection = screen.getByLabelText('코멘트')
    const editSection = screen.getByLabelText('수정 이력')
    expect(screen.queryByText('협업 메모')).toBeNull()
    expect(commentSection.style.width).toBe('100%')
    expect(editSection.style.width).toBe('100%')
    expect(commentSection.compareDocumentPosition(editSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
