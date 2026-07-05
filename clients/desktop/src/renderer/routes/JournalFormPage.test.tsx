// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  createJournal: vi.fn(),
  getJournal: vi.fn(),
  listAccounts: vi.fn(),
  searchJournalPartners: vi.fn(),
  isMobile: vi.fn(() => false),
}))

vi.mock('@samhan/design-system', () => ({
  AsyncAutocomplete: ({ ariaLabel, value, onChange, search }: any) => (
    <div>
      <input aria-label={ariaLabel} value={value?.name ?? ''} readOnly />
      <button
        type="button"
        aria-label={`${ariaLabel} 선택`}
        onClick={async () => {
          const results = await search('삼한')
          onChange(results[0] ?? null)
        }}
      >
        거래처 선택
      </button>
    </div>
  ),
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
  JournalLineRow: ({ index, line, onChange, onRemove, renderPartnerField }: any) => (
    <div className="journal-line-row" data-line-index={index}>
      <div>{index}</div>
      <input
        aria-label={`라인 ${index} 계정과목`}
        value={line.accountCode}
        onChange={(e) => onChange({ accountCode: e.target.value })}
      />
      {renderPartnerField
        ? renderPartnerField()
        : (
            <input
              aria-label={`라인 ${index} 거래처`}
              value={line.partnerName}
              onChange={(e) => onChange({ partnerName: e.target.value })}
            />
          )}
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
  searchJournalPartners: mocks.searchJournalPartners,
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
  mocks.searchJournalPartners.mockResolvedValue([
    {
      partnerId: '00000000-0000-0000-0000-000000000713',
      partnerCode: 'P-713',
      name: '삼한테스트상사',
      bizNo: '123-45-67890',
    },
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
  it('헤더/라인/합계행을 단일 가로 스크롤 컨테이너와 동일 좌우 기준선에 렌더한다', async () => {
    const view = renderPage()

    await screen.findByText('계정과목')

    const scrollContainers = view.container.querySelectorAll('.journal-line-grid-scroll')
    expect(scrollContainers).toHaveLength(1)

    const header = screen.getByText('계정과목').parentElement
    expect(header).not.toBeNull()
    expect(header?.classList.contains('journal-line-grid-header')).toBe(true)
    expect(header?.parentElement?.classList.contains('journal-line-grid-scroll')).toBe(true)
    expect(header?.style.gridTemplateColumns).toBe('40px 160px 260px 110px 110px minmax(180px, 1fr)')
    expect(header?.style.paddingLeft).toBe('0px')
    expect(header?.style.paddingRight).toBe('0px')
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
    expect(totals?.parentElement).toBe(header?.parentElement)
    expect(totals?.style.gridTemplateColumns).toBe(header?.style.gridTemplateColumns)
    expect(totals?.style.paddingLeft).toBe(header?.style.paddingLeft)
    expect(totals?.style.paddingRight).toBe(header?.style.paddingRight)
    expect(totals?.children.item(3)?.getAttribute('data-align')).toBe('right')
    expect(totals?.children.item(4)?.getAttribute('data-align')).toBe('right')
  })

  it('저장 시 BE CreateJournalLineRequest 필드명과 partnerId로 전송한다', async () => {
    mocks.createJournal.mockResolvedValue({
      id: 'journal-new',
      journalNo: '2026/07/05-1',
      journalDate: '2026-07-05',
      status: 'DRAFT',
      sourceType: 'MANUAL',
      description: '테스트 분개',
      totalDebit: '1000',
      totalCredit: '1000',
      createdByName: '오병승',
      createdAt: '2026-07-05T09:00:00+09:00',
      postedAt: null,
      reversedAt: null,
      reverseReason: null,
      lines: [],
      version: 0,
    })
    renderPage()

    await screen.findByText('계정과목')

    fireEvent.change(screen.getByLabelText('적요'), { target: { value: '테스트 분개' } })
    fireEvent.change(screen.getByLabelText('라인 1 계정과목'), { target: { value: '102' } })
    fireEvent.change(screen.getByLabelText('라인 1 차변'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('라인 1 메모'), { target: { value: '입금 메모' } })
    fireEvent.click(screen.getByLabelText('라인 1 거래처 선택'))
    fireEvent.change(screen.getByLabelText('라인 2 계정과목'), { target: { value: '401' } })
    fireEvent.change(screen.getByLabelText('라인 2 대변'), { target: { value: '1000' } })

    await waitFor(() => {
      expect((screen.getByLabelText('라인 1 거래처') as HTMLInputElement).value)
        .toBe('삼한테스트상사')
    })

    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(mocks.createJournal).toHaveBeenCalledTimes(1))
    const payload = mocks.createJournal.mock.calls[0][0]
    expect(payload.lines[0]).toEqual({
      accountCode: '102',
      debitAmount: '1000',
      creditAmount: '0',
      partnerId: '00000000-0000-0000-0000-000000000713',
      memo: '입금 메모',
    })
    expect(payload.lines[0]).not.toHaveProperty('debit')
    expect(payload.lines[0]).not.toHaveProperty('credit')
    expect(payload.lines[0]).not.toHaveProperty('partnerName')
    expect(payload.lines[0]).not.toHaveProperty('note')
    expect(payload.lines[1]).toEqual({
      accountCode: '401',
      debitAmount: '0',
      creditAmount: '1000',
      partnerId: null,
      memo: undefined,
    })
  })
})

describe('JournalFormPage 모바일 라인 카드', () => {
  it('데스크톱 그리드와 같은 계정과목-거래처-차변-대변-메모 순서로 필드를 렌더한다', async () => {
    mocks.isMobile.mockReturnValue(true)

    const view = renderPage()

    await screen.findByLabelText('라인 1 계정과목')

    const firstCard = view.container.querySelector<HTMLElement>(
      '.mobile-line-card[data-line-index="1"]',
    )
    expect(firstCard).not.toBeNull()

    const fieldLabels = Array.from(
      firstCard!.querySelectorAll<HTMLElement>('.mobile-line-field-label'),
    ).map((label) => label.textContent)

    expect(fieldLabels).toEqual(['계정과목', '거래처', '차변', '대변', '메모'])
  })
})
