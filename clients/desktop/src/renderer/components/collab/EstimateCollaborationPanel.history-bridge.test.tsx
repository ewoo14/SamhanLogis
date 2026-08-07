// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const canAccessMock = vi.fn(() => true)

vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../hooks/usePresence', () => ({ usePresence: () => [] }))
vi.mock('../../realtime/EstimateCollabRealtimeClient', () => ({
  EstimateCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))

vi.mock('../../api/estimateCollab', () => ({
  getEstimateCollabComments: vi.fn(() => Promise.resolve([
    {
      id: 'estimate-comment-memo',
      anchor: 'memo',
      authorName: 'tester',
      body: 'Estimate memo anchor',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:00:00',
    },
    {
      id: 'estimate-comment-valid-until',
      anchor: 'validUntil',
      authorName: 'tester',
      body: 'Estimate valid-until anchor',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:05:00',
    },
    {
      id: 'estimate-comment-general',
      anchor: null,
      authorName: 'tester',
      body: 'Estimate general comment',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:10:00',
    },
  ])),
  addEstimateCollabComment: vi.fn(),
  deleteEstimateCollabComment: vi.fn(),
  resolveEstimateCollabComment: vi.fn(),
  commitEstimateCollabEdit: vi.fn(),
}))

vi.mock('../../api/estimateRevision', () => ({
  listRevisions: vi.fn(() => Promise.resolve([
    {
      revisionNo: 3,
      revisionType: 'EDIT',
      sourceRevisionNo: null,
      estimateNo: '2026/07/05-3',
      estimateDate: '2026-07-06',
      actorName: 'tester',
      createdAt: '2026-07-06T09:20:00',
      changeSummary: { headerChanged: 1, lineAdded: 0, lineRemoved: 0, lineModified: 0 },
    },
    {
      revisionNo: 2,
      revisionType: 'EDIT',
      sourceRevisionNo: null,
      estimateNo: '2026/07/05-3',
      estimateDate: '2026-07-05',
      actorName: 'tester',
      createdAt: '2026-07-05T09:20:00',
      changeSummary: { headerChanged: 1, lineAdded: 0, lineRemoved: 0, lineModified: 0 },
    },
  ])),
  restoreRevision: vi.fn(),
}))

import { EstimateCollaborationPanel } from './EstimateCollaborationPanel'

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <EstimateCollaborationPanel
        estimateId="estimate-test-id"
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

describe('EstimateCollaborationPanel + EstimateVersionHistoryPanel row bridge', () => {
  it('highlights all anchored comments only when the latest revision row is selected', async () => {
    renderPanel()

    await screen.findByText('Estimate memo anchor')
    const items = screen.getAllByTestId('estimate-collab-comment-item')
    const memoComment = items.find((el) => el.textContent?.includes('Estimate memo anchor'))
    const validUntilComment = items.find((el) => el.textContent?.includes('Estimate valid-until anchor'))
    const generalComment = items.find((el) => el.textContent?.includes('Estimate general comment'))
    expect(memoComment).toBeDefined()
    expect(validUntilComment).toBeDefined()
    expect(generalComment).toBeDefined()

    expect(memoComment!.getAttribute('data-active')).toBeNull()
    expect(validUntilComment!.getAttribute('data-active')).toBeNull()
    expect(generalComment!.getAttribute('data-active')).toBeNull()

    fireEvent.click(memoComment!)

    fireEvent.click(await screen.findByTestId('estimate-version-history-row-3'))

    await waitFor(() => {
      expect(memoComment!.getAttribute('data-active')).toBe('true')
      expect(validUntilComment!.getAttribute('data-active')).toBe('true')
    })
    expect(generalComment!.getAttribute('data-active')).toBeNull()

    fireEvent.click(screen.getByTestId('estimate-version-history-row-2'))

    await waitFor(() => {
      expect(memoComment!.getAttribute('data-active')).toBeNull()
      expect(validUntilComment!.getAttribute('data-active')).toBeNull()
    })
    expect(generalComment!.getAttribute('data-active')).toBeNull()
  })

  it('shows field-label badges only for anchored comments', async () => {
    renderPanel()

    await screen.findByText('Estimate memo anchor')
    const anchorSelect = screen.getByTestId('estimate-collab-comment-anchor-select')
    const memoLabel = anchorSelect.querySelector('option[value="memo"]')?.textContent
    const items = screen.getAllByTestId('estimate-collab-comment-item')
    const memoComment = items.find((el) => el.textContent?.includes('Estimate memo anchor'))
    const generalComment = items.find((el) => el.textContent?.includes('Estimate general comment'))
    expect(memoComment).toBeDefined()
    expect(generalComment).toBeDefined()

    expect(within(memoComment!).getByTestId('estimate-collab-comment-anchor-badge').textContent).toBe(memoLabel)
    expect(within(generalComment!).queryByTestId('estimate-collab-comment-anchor-badge')).toBeNull()
  })
})
