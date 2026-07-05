// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const apiMocks = vi.hoisted(() => ({
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
vi.mock('../../api/journalCollab', () => apiMocks)

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
  apiMocks.getJournalCollabComments.mockResolvedValue([{
    id: 'comment-1',
    anchor: 'description',
    authorName: '홍길동',
    body: '적요 확인',
    parentId: null,
    status: 'OPEN',
    createdAt: '2026-07-06T09:00:00',
  }])
  apiMocks.getJournalCollabEdits.mockResolvedValue([])
  apiMocks.addJournalCollabComment.mockReset()
})

describe('JournalCollaborationPanel 협업 패널 배치', () => {
  it('협업 헤더는 제거하고 코멘트+수정 이력을 전폭으로 렌더한다 (버전이력 안내 카드 없음, #31 결정1 복구)', async () => {
    renderPanel('journal/id with spaces')

    const commentSection = screen.getByLabelText('코멘트')
    await screen.findByText('적요 확인')
    expect(screen.queryByText('협업 메모')).toBeNull()
    expect(screen.queryByRole('heading', { name: '협업' })).toBeNull()
    expect(commentSection.style.width).toBe('100%')
    // #31 이력 일원화가 남긴 버전이력 격차 안내 카드는 결정1로 완전히 대체된다.
    expect(screen.queryByTestId('journal-version-history-gap')).toBeNull()

    const editHistorySection = screen.getByLabelText('수정 이력')
    expect(editHistorySection.style.width).toBe('100%')
    const editList = screen.getByTestId('journal-collab-edit-list')
    expect(editList.textContent).toContain('아직 수정 이력이 없습니다')
    expect(commentSection.compareDocumentPosition(editHistorySection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('수정 이력 diff 클릭과 코멘트 anchor 클릭이 같은 activeFieldPath 하이라이트 상태를 공유한다 (결정2 양방향)', async () => {
    apiMocks.getJournalCollabEdits.mockResolvedValue([{
      id: 'edit-1',
      changeSet: JSON.stringify({
        description: { before: '이전 적요', after: '적요 확인 완료' },
        'line.1.memo': { before: null, after: '라인 메모 변경' },
      }),
      reason: null,
      proposerName: '홍길동',
      status: 'ACCEPTED',
      decidedByName: '홍길동',
      decidedAt: '2026-07-06T09:10:00',
      createdAt: '2026-07-06T09:10:00',
    }])

    renderPanel('journal/id with spaces')

    const commentItem = await screen.findByTestId('journal-collab-comment-item')
    const descriptionDiff = await screen.findByTestId('journal-collab-edit-change-description')
    const lineMemoDiff = screen.getByTestId('journal-collab-edit-change-line-1-memo')

    // 1) 코멘트(anchor=description) 클릭 → 같은 필드 수정 이력 diff 가 하이라이트된다.
    fireEvent.click(commentItem)
    await waitFor(() => {
      expect(descriptionDiff.getAttribute('data-active')).toBe('true')
    })
    expect(lineMemoDiff.getAttribute('data-active')).toBeNull()

    // 2) 반대 방향 — 다른 필드 diff 클릭 → activeFieldPath 이동으로 코멘트 하이라이트가 해제된다.
    fireEvent.click(lineMemoDiff)
    await waitFor(() => {
      expect(lineMemoDiff.getAttribute('data-active')).toBe('true')
    })
    expect(descriptionDiff.getAttribute('data-active')).toBeNull()
    expect(commentItem.getAttribute('data-active')).toBeNull()
  })

  it('연결 필드를 선택해 코멘트를 등록하면 anchor 가 요청에 포함된다 (결정2 anchor 생성 UX)', async () => {
    apiMocks.addJournalCollabComment.mockResolvedValue({
      id: 'comment-2',
      anchor: 'description',
      authorName: '홍길동',
      body: '새 코멘트',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:20:00',
    })

    renderPanel('journal/id with spaces')
    await screen.findByText('적요 확인')

    fireEvent.change(screen.getByTestId('journal-collab-comment-anchor-select'), { target: { value: 'description' } })
    fireEvent.change(screen.getByTestId('journal-collab-comment-input'), { target: { value: '새 코멘트' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() => {
      expect(apiMocks.addJournalCollabComment).toHaveBeenCalledWith('journal/id with spaces', {
        body: '새 코멘트',
        anchor: 'description',
      })
    })
  })
})
