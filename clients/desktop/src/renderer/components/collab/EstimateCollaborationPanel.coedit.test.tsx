// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('./CollaborativeTextField', () => ({
  CollaborativeTextField: () => <div>협업 메모</div>,
}))
vi.mock('../../hooks/usePresence', () => ({ usePresence: () => [] }))
vi.mock('../audit/EstimateVersionHistoryPanel', () => ({
  EstimateVersionHistoryPanel: ({ activeFieldPath, activeRevisionNo, onRevisionSelect }: {
    activeFieldPath?: string | null
    activeRevisionNo?: number | null
    onRevisionSelect?: (revisionNo: number, fieldPaths?: string[]) => void
  }) => (
    <div
      data-testid="estimate-version-history-stub"
      data-active-field={activeFieldPath ?? ''}
      data-active-revision={activeRevisionNo ?? ''}
    >
      <button type="button" onClick={() => onRevisionSelect?.(3, ['memo'])}>
        견적 버전 선택
      </button>
    </div>
  ),
}))
const canAccessMock = vi.fn(() => true)
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../realtime/EstimateCollabRealtimeClient', () => ({
  EstimateCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))
vi.mock('../../api/estimateCollab', () => ({
  getEstimateCollabComments: vi.fn(() => Promise.resolve([{
    id: 'comment-1',
    anchor: 'memo',
    authorName: '홍길동',
    body: '견적 메모 확인',
    parentId: null,
    status: 'OPEN',
    createdAt: '2026-07-06T09:00:00',
  }])),
  getEstimateCollabEdits: vi.fn(() => Promise.resolve([])),
  addEstimateCollabComment: vi.fn(),
  deleteEstimateCollabComment: vi.fn(),
  resolveEstimateCollabComment: vi.fn(),
  commitEstimateCollabEdit: vi.fn(),
}))

import { EstimateCollaborationPanel } from './EstimateCollaborationPanel'

function renderPanel(estimateId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <EstimateCollaborationPanel
        estimateId={estimateId}
        status="QUOTE_DRAFT"
        currentValues={{ memo: null, validUntil: null, lines: [] }}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
})

describe('EstimateCollaborationPanel 협업 패널 배치', () => {
  it('협업 헤더와 changeSet 수정 이력 목록을 제거하고 코멘트와 버전 이력만 렌더한다', () => {
    renderPanel('estimate/id with spaces')

    const commentSection = screen.getByLabelText('코멘트')
    expect(screen.queryByText('협업 메모')).toBeNull()
    expect(screen.queryByRole('heading', { name: '협업' })).toBeNull()
    expect(screen.queryByLabelText('수정 이력')).toBeNull()
    expect(screen.queryByTestId('estimate-collab-edit-list')).toBeNull()
    expect(commentSection.style.width).toBe('100%')
    expect(screen.getByTestId('estimate-version-history-stub')).not.toBeNull()
    expect(commentSection.compareDocumentPosition(screen.getByTestId('estimate-version-history-stub')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('코멘트 anchor 클릭과 버전 행 선택이 같은 하이라이트 상태를 공유한다', async () => {
    renderPanel('estimate/id with spaces')

    await screen.findByText('견적 메모 확인')
    fireEvent.click(screen.getByTestId('estimate-collab-comment-item'))
    await waitFor(() => {
      expect(screen.getByTestId('estimate-version-history-stub').getAttribute('data-active-field')).toBe('memo')
    })

    fireEvent.click(screen.getByText('견적 버전 선택'))
    expect(screen.getByTestId('estimate-version-history-stub').getAttribute('data-active-revision')).toBe('3')
  })
})
