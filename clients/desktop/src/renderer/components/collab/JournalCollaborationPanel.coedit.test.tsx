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
  getJournalCollabComments: vi.fn(() => Promise.resolve([{
    id: 'comment-1',
    anchor: 'description',
    authorName: '홍길동',
    body: '적요 확인',
    parentId: null,
    status: 'OPEN',
    createdAt: '2026-07-06T09:00:00',
  }])),
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
  it('협업 헤더와 changeSet 수정 이력 목록을 제거하고 코멘트와 후속 버전이력 안내만 렌더한다', () => {
    renderPanel('journal/id with spaces')

    const commentSection = screen.getByLabelText('코멘트')
    expect(screen.queryByText('협업 메모')).toBeNull()
    expect(screen.queryByRole('heading', { name: '협업' })).toBeNull()
    expect(screen.queryByLabelText('수정 이력')).toBeNull()
    expect(screen.queryByTestId('journal-collab-edit-list')).toBeNull()
    expect(commentSection.style.width).toBe('100%')
    expect(screen.getByTestId('journal-version-history-gap').textContent).toContain('회계 분개 버전이력')
  })
})
