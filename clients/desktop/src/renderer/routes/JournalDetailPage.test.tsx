// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Journal } from '../api/accounting'

const mocks = vi.hoisted(() => ({
  getJournal: vi.fn(),
  postJournal: vi.fn(),
  reverseJournal: vi.fn(),
  isMobile: vi.fn(() => false),
}))

vi.mock('@samhan/design-system', () => ({
  Button: ({ children, variant: _variant, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DataTable: ({ rows, columns, emptyMessage }: any) => (
    <table>
      <tbody>
        {rows.length === 0 ? (
          <tr><td>{emptyMessage}</td></tr>
        ) : rows.map((row: any) => (
          <tr key={row.id}>
            {columns.map((column: any) => (
              <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
  JournalStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  Spinner: ({ label }: { label?: string }) => <div role="status">{label}</div>,
}))

vi.mock('../api/accounting', () => ({
  getJournal: mocks.getJournal,
  postJournal: mocks.postJournal,
  reverseJournal: mocks.reverseJournal,
}))

vi.mock('../components/collab/JournalCollaborationPanel', () => ({
  JournalCollaborationPanel: () => <div data-testid="journal-collab-panel" />,
}))

vi.mock('../components/common/MobileActionSheet', () => ({
  MobileActionSheet: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    open ? <div>{children}</div> : null
  ),
}))

vi.mock('../components/common/MobileCollapsible', () => ({
  MobileCollapsible: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  ),
}))

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true }),
}))
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: mocks.isMobile }))

import { JournalDetailPage } from './JournalDetailPage'

function makeJournal(overrides: Partial<Journal> = {}): Journal {
  return {
    id: 'journal-1',
    journalNo: '2026/07/03-1',
    journalDate: '2026-07-03',
    status: 'POSTED',
    sourceType: 'MANUAL',
    description: '수기 분개',
    totalDebit: '1000',
    totalCredit: '1000',
    createdByName: '오병승',
    createdAt: '2026-07-03T09:00:00+09:00',
    postedAt: '2026-07-03T09:10:00+09:00',
    reversedAt: null,
    reverseReason: null,
    version: 1,
    lines: [
      {
        id: 'line-1',
        lineNo: 1,
        accountCode: '102',
        accountName: '보통예금',
        debit: '1000',
        credit: '0',
        partnerName: '테스트 거래처',
        note: '메모',
        memo: '메모',
      },
      {
        id: 'line-2',
        lineNo: 2,
        accountCode: '110',
        accountName: '외상매출금',
        debit: '0',
        credit: '1000',
        partnerName: '테스트 거래처',
        note: '메모',
        memo: '메모',
      },
    ],
    ...overrides,
  }
}

function renderPage(journal: Journal) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mocks.getJournal.mockResolvedValue(journal)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/accounting/journals/journal-1']}>
        <Routes>
          <Route path="/accounting/journals/:id" element={<JournalDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.isMobile.mockReturnValue(false)
})

describe('JournalDetailPage 역분개 액션 가드', () => {
  it('CASH_RECEIPT POSTED 분개는 역분개 버튼을 숨기고 입금보고서 경유 안내를 노출한다', async () => {
    renderPage(makeJournal({
      sourceType: 'CASH_RECEIPT',
      description: '입금보고서 확정 2026/07/03-1',
    }))

    const cashReceiptButton = await screen.findByRole('button', { name: '입금보고서에서 처리' })
    expect((cashReceiptButton as HTMLButtonElement).disabled).toBe(true)
    expect(cashReceiptButton.getAttribute('title')).toBe(
      '이 분개는 입금보고서에서 자동 생성되었습니다. 원천 입금보고서 취소/수정 시 역분개가 자동 게시됩니다. (입금보고서 관리 화면 준비 중)',
    )
    expect(screen.queryByRole('button', { name: '역분개' })).toBeNull()
    expect(screen.getByText('입금보고서 자동 분개는 원천 입금보고서 취소/수정 시 역분개가 자동 게시됩니다.')).not.toBeNull()
  })

  it('MANUAL POSTED 분개는 역분개 버튼을 노출한다', async () => {
    renderPage(makeJournal({ sourceType: 'MANUAL' }))

    const reverseButton = await screen.findByRole('button', { name: '역분개' })
    expect((reverseButton as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByRole('button', { name: '입금보고서에서 처리' })).toBeNull()
  })
})
