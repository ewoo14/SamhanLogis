// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const canAccessMock = vi.fn(() => true)

vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../hooks/usePresence', () => ({ usePresence: () => [] }))
vi.mock('../../realtime/PartnerOrderCollabRealtimeClient', () => ({
  PartnerOrderCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))

vi.mock('../../api/partnerOrderCollab', () => ({
  getPartnerOrderCollabComments: vi.fn(() => Promise.resolve([
    {
      id: 'partner-order-comment-memo',
      anchor: 'memo',
      authorName: 'tester',
      body: 'Partner order memo anchor',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:00:00',
    },
    {
      id: 'partner-order-comment-due-date',
      anchor: 'dueDate',
      authorName: 'tester',
      body: 'Partner order due-date anchor',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:05:00',
    },
    {
      id: 'partner-order-comment-general',
      anchor: null,
      authorName: 'tester',
      body: 'Partner order general comment',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:10:00',
    },
  ])),
  addPartnerOrderCollabComment: vi.fn(),
  deletePartnerOrderCollabComment: vi.fn(),
  resolvePartnerOrderCollabComment: vi.fn(),
  commitPartnerOrderCollabEdit: vi.fn(),
}))

vi.mock('../../api/partnerOrderRevision', () => ({
  listPartnerOrderRevisions: vi.fn(() => Promise.resolve([
    {
      revisionNo: 4,
      revisionType: 'EDIT',
      sourceRevisionNo: null,
      orderNo: '2026/07/06-4',
      actorName: 'tester',
      actorColor: null,
      createdAt: '2026-07-06T09:20:00',
      changeSummary: { headerChanged: 1, lineAdded: 0, lineRemoved: 0, lineModified: 0 },
    },
    {
      revisionNo: 3,
      revisionType: 'EDIT',
      sourceRevisionNo: null,
      orderNo: '2026/07/06-4',
      actorName: 'tester',
      actorColor: null,
      createdAt: '2026-07-05T09:20:00',
      changeSummary: { headerChanged: 1, lineAdded: 0, lineRemoved: 0, lineModified: 0 },
    },
  ])),
  restorePartnerOrderRevision: vi.fn(),
}))

import { PartnerOrderCollaborationPanel } from './PartnerOrderCollaborationPanel'

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PartnerOrderCollaborationPanel
        orderId="partner-order-test-id"
        status="DRAFT"
        currentValues={{ memo: null, dueDate: null, lines: [] }}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
})

describe('PartnerOrderCollaborationPanel + PartnerOrderVersionHistoryPanel row bridge', () => {
  it('highlights all anchored comments only when the latest revision row is selected', async () => {
    renderPanel()

    await screen.findByText('Partner order memo anchor')
    const items = screen.getAllByTestId('partner-order-collab-comment-item')
    const memoComment = items.find((el) => el.textContent?.includes('Partner order memo anchor'))
    const dueDateComment = items.find((el) => el.textContent?.includes('Partner order due-date anchor'))
    const generalComment = items.find((el) => el.textContent?.includes('Partner order general comment'))
    expect(memoComment).toBeDefined()
    expect(dueDateComment).toBeDefined()
    expect(generalComment).toBeDefined()

    expect(memoComment!.getAttribute('data-active')).toBeNull()
    expect(dueDateComment!.getAttribute('data-active')).toBeNull()
    expect(generalComment!.getAttribute('data-active')).toBeNull()

    fireEvent.click(memoComment!)

    fireEvent.click(await screen.findByTestId('partner-order-version-history-row-4'))

    await waitFor(() => {
      expect(memoComment!.getAttribute('data-active')).toBe('true')
      expect(dueDateComment!.getAttribute('data-active')).toBe('true')
    })
    expect(generalComment!.getAttribute('data-active')).toBeNull()

    fireEvent.click(screen.getByTestId('partner-order-version-history-row-3'))

    await waitFor(() => {
      expect(memoComment!.getAttribute('data-active')).toBeNull()
      expect(dueDateComment!.getAttribute('data-active')).toBeNull()
    })
    expect(generalComment!.getAttribute('data-active')).toBeNull()
  })

  it('shows field-label badges only for anchored comments', async () => {
    renderPanel()

    await screen.findByText('Partner order memo anchor')
    const anchorSelect = screen.getByTestId('partner-order-collab-comment-anchor-select')
    const memoLabel = anchorSelect.querySelector('option[value="memo"]')?.textContent
    const items = screen.getAllByTestId('partner-order-collab-comment-item')
    const memoComment = items.find((el) => el.textContent?.includes('Partner order memo anchor'))
    const generalComment = items.find((el) => el.textContent?.includes('Partner order general comment'))
    expect(memoComment).toBeDefined()
    expect(generalComment).toBeDefined()

    expect(within(memoComment!).getByTestId('partner-order-collab-comment-anchor-badge').textContent).toBe(memoLabel)
    expect(within(generalComment!).queryByTestId('partner-order-collab-comment-anchor-badge')).toBeNull()
  })
})
