// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('./CollaborativeTextField', () => ({
  CollaborativeTextField: () => <div>협업 메모</div>,
}))
vi.mock('../../hooks/usePresence', () => ({ usePresence: () => [] }))
const canAccessMock = vi.fn(() => true)
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../realtime/JournalCollabRealtimeClient', () => ({
  JournalCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))
vi.mock('../../api/journalCollab', () => ({
  getJournalCollabComments: vi.fn(() => Promise.resolve([])),
  getJournalCollabEdits: vi.fn(() => Promise.resolve([])),
  addJournalCollabComment: vi.fn(),
  deleteJournalCollabComment: vi.fn(),
  resolveJournalCollabComment: vi.fn(),
  commitJournalCollabEdit: vi.fn(),
}))

import { JournalCollaborationPanel } from './JournalCollaborationPanel'

function renderPanel(journalId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <JournalCollaborationPanel
        journalId={journalId}
        currentValues={{ description: null, lines: [] }}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
})

describe('JournalCollaborationPanel 협업 패널 배치', () => {
  it('협업 메모를 제거하고 코멘트를 수정 이력 위에 전폭으로 렌더한다', () => {
    renderPanel('journal/id with spaces')

    const commentSection = screen.getByLabelText('코멘트')
    const editSection = screen.getByLabelText('수정 이력')
    expect(screen.queryByText('협업 메모')).toBeNull()
    expect(commentSection.style.width).toBe('100%')
    expect(editSection.style.width).toBe('100%')
    expect(commentSection.compareDocumentPosition(editSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
