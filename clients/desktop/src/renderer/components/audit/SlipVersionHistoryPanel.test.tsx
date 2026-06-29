// @vitest-environment jsdom
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SlipVersionHistoryPanel } from './SlipVersionHistoryPanel'
import * as slipRevisionApi from '../../api/slipRevision'

vi.mock('../../api/slipRevision', () => ({
  listRevisions: vi.fn(),
  restoreRevision: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SlipVersionHistoryPanel slipId="slip-test-id" />
    </QueryClientProvider>,
  )
}

describe('SlipVersionHistoryPanel', () => {
  it('버전별 필드/품목 셀 변경 목록과 단일 actor 색상을 표시한다', async () => {
    vi.mocked(slipRevisionApi.listRevisions).mockResolvedValue([
      {
        revisionNo: 2,
        revisionType: 'EDIT',
        sourceRevisionNo: null,
        slipNo: '2026/06/30-1',
        slipDate: '2026-06-30',
        actorName: '김영업',
        actorColor: '#DB2777',
        createdAt: '2026-06-30T09:15:00',
        changeSummary: {
          headerChanged: 1,
          lineAdded: 0,
          lineRemoved: 0,
          lineModified: 1,
        },
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
          {
            fieldPath: 'lines[0].quantity',
            label: '품목 1행 수량',
            beforeValue: '1',
            afterValue: '3',
            actorName: '김영업',
            actorColor: '#DB2777',
            changedAt: '2026-06-30T09:15:00',
          },
        ],
      } as any,
    ])

    renderPanel()

    const memoChange = await screen.findByTestId('slip-version-history-change-header-memo')
    const quantityChange = await screen.findByTestId('slip-version-history-change-lines-0-quantity')

    expect(memoChange.textContent).toContain('김영업')
    expect(memoChange.textContent).toContain('메모')
    expect(memoChange.textContent).toContain('원본 메모')
    expect(memoChange.textContent).toContain('수정 메모')
    expect(quantityChange.textContent).toContain('품목 1행 수량')
    expect(quantityChange.textContent).toContain('1')
    expect(quantityChange.textContent).toContain('3')
    expect(screen.queryByText('slip-test-id')).toBeNull()
    const color = screen.getAllByTestId('slip-version-history-change-color')[0] as HTMLElement
    expect(['#DB2777', 'rgb(219, 39, 119)']).toContain(color.style.background)
  })
})
