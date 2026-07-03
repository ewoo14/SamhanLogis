// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
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
  DataTable: ({ rows, columns, emptyMessage, rowKey, rowClassName, tableLayout }: any) => (
    <table>
      <colgroup>
        {columns.map((column: any) => (
          <col key={column.key} style={column.width ? { width: column.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column: any) => (
            <th
              key={column.key}
              style={column.width ? { width: column.width } : undefined}
              data-align={column.headerAlign ?? column.align ?? 'left'}
              data-table-layout={tableLayout}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={columns.length}>{emptyMessage}</td></tr>
        ) : rows.map((row: any) => (
          <tr key={rowKey ? rowKey(row) : row.id} className={rowClassName?.(row)}>
            {columns.map((column: any) => (
              <td
                key={column.key}
                data-label={column.header}
                data-align={column.align ?? 'left'}
              >
                {column.render ? column.render(row) : row[column.key]}
              </td>
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

describe('JournalDetailPage 라인 테이블', () => {
  it('데스크톱 라인 테이블 헤더와 합계행을 고정 순서로 렌더한다', async () => {
    const view = renderPage(makeJournal({
      totalDebit: '1000',
      totalCredit: '1000',
    }))

    await screen.findByText('2026/07/03-1')

    const table = view.container.querySelector('table')
    expect(table).not.toBeNull()
    const headers = Array.from(table!.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(headers).toEqual(['#', '계정과목', '거래처', '차변', '대변', '메모'])

    const bodyRows = table!.querySelectorAll('tbody tr')
    const totalRow = bodyRows.item(bodyRows.length - 1)
    const totalCells = totalRow.querySelectorAll('td')
    expect(totalRow.classList.contains('journal-total-row')).toBe(true)
    expect(within(totalRow as HTMLElement).getByText('합계')).not.toBeNull()
    expect(totalCells.item(3).textContent).toBe('1,000')
    expect(totalCells.item(4).textContent).toBe('1,000')
  })

  it('라인 0건 분개는 합계행 없이 테이블 emptyMessage 를 렌더한다', async () => {
    const view = renderPage(makeJournal({
      totalDebit: '0',
      totalCredit: '0',
      lines: [],
    }))

    await screen.findByText('2026/07/03-1')

    const table = view.container.querySelector('table')
    expect(table).not.toBeNull()
    expect(table!.querySelector('.journal-total-row')).toBeNull()
    expect(within(table as HTMLElement).getByText('라인이 없습니다.')).not.toBeNull()
  })
})
