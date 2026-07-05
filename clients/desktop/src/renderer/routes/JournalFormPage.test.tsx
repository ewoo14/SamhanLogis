// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  createJournal: vi.fn(),
  getJournal: vi.fn(),
  listAccounts: vi.fn(),
  isMobile: vi.fn(() => false),
}))

vi.mock('@samhan/design-system', () => ({
  AccountCodeSelect: ({ value, ariaLabel }: any) => (
    <input aria-label={ariaLabel ?? '계정과목'} value={value} readOnly />
  ),
  Button: ({ children, variant: _variant, size: _size, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Input: ({ label, value, onChange, ...props }: any) => (
    <label>
      {label}
      <input value={value} onChange={onChange} {...props} />
    </label>
  ),
  JournalLineRow: ({ index, line, onChange, onRemove }: any) => (
    <div className="journal-line-row" data-line-index={index}>
      <div>{index}</div>
      <input aria-label={`라인 ${index} 계정과목`} value={line.accountCode} readOnly />
      <input
        aria-label={`라인 ${index} 거래처`}
        value={line.partnerName}
        onChange={(e) => onChange({ partnerName: e.target.value })}
      />
      <input
        aria-label={`라인 ${index} 차변`}
        value={line.debit}
        onChange={(e) => onChange({ debit: Number(e.target.value) })}
      />
      <input
        aria-label={`라인 ${index} 대변`}
        value={line.credit}
        onChange={(e) => onChange({ credit: Number(e.target.value) })}
      />
      <input
        aria-label={`라인 ${index} 메모`}
        value={line.note}
        onChange={(e) => onChange({ note: e.target.value })}
      />
      <button type="button" onClick={onRemove}>삭제</button>
    </div>
  ),
  MoneyInput: ({ value, ariaLabel }: any) => (
    <input aria-label={ariaLabel ?? '금액'} value={value} readOnly />
  ),
  Spinner: ({ label }: { label?: string }) => <div role="status">{label}</div>,
}))

vi.mock('../api/accounting', () => ({
  createJournal: mocks.createJournal,
  getJournal: mocks.getJournal,
  listAccounts: mocks.listAccounts,
}))

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: mocks.isMobile }))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))

import { JournalFormPage } from './JournalFormPage'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mocks.listAccounts.mockResolvedValue([
    { code: '102', name: '보통예금', category: 'ASSET' },
    { code: '401', name: '매출', category: 'REVENUE' },
  ])

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/accounting/journals/new']}>
        <JournalFormPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.isMobile.mockReturnValue(false)
})

describe('JournalFormPage 데스크톱 라인 grid', () => {
  it('헤더와 합계행이 상세 테이블과 같은 6열 계약과 금액 우측 정렬을 사용한다', async () => {
    const view = renderPage()

    await screen.findByText('계정과목')

    const header = screen.getByText('계정과목').parentElement
    expect(header).not.toBeNull()
    expect(header?.classList.contains('journal-line-grid-header')).toBe(true)
    expect(header?.parentElement?.classList.contains('journal-line-grid-scroll')).toBe(true)
    expect(header?.style.gridTemplateColumns).toBe('40px 160px 260px 110px 110px minmax(180px, 1fr)')
    expect(Array.from(header!.children).map((child) => child.textContent)).toEqual([
      '#',
      '계정과목',
      '거래처',
      '차변',
      '대변',
      '메모',
    ])

    const totals = view.container.querySelector<HTMLElement>('.journal-line-grid-total')
    expect(totals).not.toBeNull()
    expect(totals?.style.gridTemplateColumns).toBe(header?.style.gridTemplateColumns)
    expect(totals?.children.item(3)?.getAttribute('data-align')).toBe('right')
    expect(totals?.children.item(4)?.getAttribute('data-align')).toBe('right')
  })
})
