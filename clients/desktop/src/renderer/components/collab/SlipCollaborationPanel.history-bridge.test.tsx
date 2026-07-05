// @vitest-environment jsdom
/**
 * SlipCollaborationPanel ↔ SlipVersionHistoryPanel 실컴포넌트 연동 회귀 가드
 * (PR #747 재수렴 HIGH fix).
 *
 * <p>{@link SlipCollaborationPanel.coedit.test.tsx} 는 {@code SlipVersionHistoryPanel} 을
 * 통째로 stub 처리해 코멘트→activeFieldPath 배선만 검증한다 — fieldPath 정규화(접두사 정합) 는
 * stub 뒤에 가려져 실제로 검증되지 못했다("getByTestId 만 봐서 누락"). 본 파일은
 * {@code SlipVersionHistoryPanel} 을 stub 하지 않고 두 실컴포넌트를 그대로 조립해, BE 가 실제로
 * 내려주는 {@code "header.memo"} 형태와 코멘트 anchor 의 {@code "memo"}(접두사 없음) 형태가
 * 화면에서 실제로 서로를 하이라이트하는지 data-active 속성으로 확인한다.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const canAccessMock = vi.fn(() => true)
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../realtime/SlipCollabRealtimeClient', () => ({
  SlipCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))

vi.mock('../../api/slipCollab', () => ({
  getSlipCollabComments: vi.fn(() => Promise.resolve([
    {
      id: 'comment-memo',
      anchor: 'memo',
      authorName: '홍길동',
      body: '메모 확인 부탁드립니다',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:00:00',
    },
    {
      id: 'comment-no-anchor',
      anchor: null,
      authorName: '김영업',
      body: '전체 코멘트입니다',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:05:00',
    },
  ])),
  addSlipCollabComment: vi.fn(),
  deleteSlipCollabComment: vi.fn(),
  resolveSlipCollabComment: vi.fn(),
  commitSlipCollabEdit: vi.fn(),
}))

vi.mock('../../api/slipRevision', () => ({
  listRevisions: vi.fn(() => Promise.resolve([
    {
      revisionNo: 2,
      revisionType: 'EDIT',
      sourceRevisionNo: null,
      slipNo: '2026/06/30-1',
      slipDate: '2026-06-30',
      actorName: '김영업',
      actorColor: '#DB2777',
      createdAt: '2026-06-30T09:15:00',
      changeSummary: { headerChanged: 1, lineAdded: 0, lineRemoved: 0, lineModified: 1 },
      fieldChanges: [
        {
          fieldPath: 'header.memo',
          label: '메모',
          beforeValue: '원본 메모',
          afterValue: '수정 메모',
          actorName: '김영업',
          actorColor: '#DB2777',
          changedAt: '2026-06-30T09:15:00',
        },
      ],
    },
    {
      revisionNo: 1,
      revisionType: 'CREATE',
      sourceRevisionNo: null,
      slipNo: '2026/06/30-1',
      slipDate: '2026-06-30',
      actorName: '김영업',
      actorColor: '#DB2777',
      createdAt: '2026-06-30T09:10:00',
      changeSummary: { headerChanged: 0, lineAdded: 0, lineRemoved: 0, lineModified: 0 },
      fieldChanges: [],
    },
  ])),
  restoreRevision: vi.fn(),
}))

import { SlipCollaborationPanel } from './SlipCollaborationPanel'

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SlipCollaborationPanel slipId="slip-test-id" currentValues={{ memo: null }} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
})

describe('SlipCollaborationPanel + SlipVersionHistoryPanel 실컴포넌트 연동 (접두사 정합 회귀 가드)', () => {
  it('memo anchor 코멘트 클릭 → header.memo 버전이력 항목이 하이라이트된다 (정방향)', async () => {
    renderPanel()

    await screen.findByText('메모 확인 부탁드립니다')
    const memoChange = await screen.findByTestId('slip-version-history-change-header-memo')
    const revisionRow = await screen.findByTestId('slip-version-history-row-2')

    // 클릭 전 — 코멘트 anchor 를 아직 활성화하지 않았으므로 미하이라이트.
    expect(memoChange.getAttribute('data-active')).toBeNull()
    expect(revisionRow.getAttribute('data-active')).toBeNull()

    const commentItems = screen.getAllByTestId('slip-collab-comment-item')
    const memoComment = commentItems.find((el) => el.textContent?.includes('메모 확인 부탁드립니다'))
    expect(memoComment).toBeDefined()
    fireEvent.click(memoComment!)

    await waitFor(() => {
      expect(screen.getByTestId('slip-version-history-change-header-memo').getAttribute('data-active')).toBe('true')
    })
    expect(screen.getByTestId('slip-version-history-row-2').getAttribute('data-active')).toBe('true')
  })

  it('header.memo 버전이력 항목 클릭 → memo anchor 코멘트가 하이라이트된다 (역방향)', async () => {
    renderPanel()

    await screen.findByText('메모 확인 부탁드립니다')
    const memoChange = await screen.findByTestId('slip-version-history-change-header-memo')
    fireEvent.click(memoChange)

    const commentItems = await screen.findAllByTestId('slip-collab-comment-item')
    const memoComment = commentItems.find((el) => el.textContent?.includes('메모 확인 부탁드립니다'))
    const otherComment = commentItems.find((el) => el.textContent?.includes('전체 코멘트입니다'))
    expect(memoComment).toBeDefined()
    expect(otherComment).toBeDefined()

    expect(memoComment!.getAttribute('data-active')).toBe('true')
    expect(memoComment!.getAttribute('aria-current')).toBe('true')
    // anchor 없는 코멘트는 애초 매칭 대상이 아니므로 하이라이트되지 않는다.
    expect(otherComment!.getAttribute('data-active')).toBeNull()
  })
})
