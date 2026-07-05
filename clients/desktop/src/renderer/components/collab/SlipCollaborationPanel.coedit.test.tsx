// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('./CollaborativeTextField', () => ({
  CollaborativeTextField: () => <div>협업 메모</div>,
}))
vi.mock('../audit/SlipVersionHistoryPanel', () => ({
  SlipVersionHistoryPanel: ({ activeFieldPath, activeRevisionNo, onRevisionSelect }: {
    activeFieldPath?: string | null
    activeRevisionNo?: number | null
    onRevisionSelect?: (revisionNo: number, fieldPaths?: string[]) => void
  }) => (
    <div
      data-testid="slip-version-history-stub"
      data-active-field={activeFieldPath ?? ''}
      data-active-revision={activeRevisionNo ?? ''}
    >
      <button type="button" onClick={() => onRevisionSelect?.(2, ['memo'])}>
        버전 선택
      </button>
    </div>
  ),
}))

const canAccessMock = vi.fn(() => true)
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../realtime/SlipCollabRealtimeClient', () => ({
  SlipCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))
vi.mock('../../api/slipCollab', () => ({
  getSlipCollabComments: vi.fn(() => Promise.resolve([{
    id: 'comment-1',
    anchor: 'memo',
    authorName: '홍길동',
    body: '메모 확인',
    parentId: null,
    status: 'OPEN',
    createdAt: '2026-07-06T09:00:00',
  }])),
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
  it('협업 헤더와 changeSet 수정 이력 목록을 제거하고 코멘트와 버전 이력만 렌더한다', () => {
    renderPanel('slip/id with spaces')

    const commentSection = screen.getByLabelText('코멘트')
    expect(screen.queryByText('협업 메모')).toBeNull()
    expect(screen.queryByRole('heading', { name: '협업' })).toBeNull()
    expect(screen.queryByLabelText('수정 이력')).toBeNull()
    expect(screen.queryByTestId('slip-collab-edit-list')).toBeNull()
    expect(commentSection.style.width).toBe('100%')
    expect(screen.getByTestId('slip-version-history-stub')).not.toBeNull()
    expect(commentSection.compareDocumentPosition(screen.getByTestId('slip-version-history-stub')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('코멘트 anchor 클릭과 버전 행 선택이 같은 하이라이트 상태를 공유한다', async () => {
    renderPanel('slip/id with spaces')

    await screen.findByText('메모 확인')
    fireEvent.click(screen.getByTestId('slip-collab-comment-item'))
    await waitFor(() => {
      expect(screen.getByTestId('slip-version-history-stub').getAttribute('data-active-field')).toBe('memo')
    })

    fireEvent.click(screen.getByText('버전 선택'))
    expect(screen.getByTestId('slip-version-history-stub').getAttribute('data-active-revision')).toBe('2')
  })
})
