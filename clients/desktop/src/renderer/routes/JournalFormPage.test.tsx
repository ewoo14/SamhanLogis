// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError } from 'axios'

function partnerLookupUnavailableError(): AxiosError {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    data: {
      success: false,
      code: 'PARTNER_IDENTITY_LOOKUP_UNAVAILABLE',
      message: '거래처 조회를 일시적으로 할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    },
    status: 502,
    statusText: 'Bad Gateway',
    headers: {},
    config: {} as never,
  })
}

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

function renderPage(initialEntry = '/accounting/journals/new') {
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
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/accounting/journals/new" element={<JournalFormPage />} />
          <Route path="/accounting/journals/:id/edit" element={<JournalFormPage />} />
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

  it('편집 진입 시 partnerName 만 있는 라인을 표시하고 정확 검색으로 partnerId 를 복원해 저장한다', async () => {
    mocks.getJournal.mockResolvedValue({
      id: 'journal-edit',
      journalNo: '2026/07/05-7',
      journalDate: '2026-07-05',
      status: 'DRAFT',
      sourceType: 'MANUAL',
      description: '편집 분개',
      totalDebit: '1000',
      totalCredit: '1000',
      createdByName: '오병승',
      createdAt: '2026-07-05T09:00:00+09:00',
      postedAt: null,
      reversedAt: null,
      reverseReason: null,
      lines: [
        {
          lineNo: 1,
          accountCode: '102',
          accountName: '보통예금',
          debit: '1000',
          credit: '0',
          debitAmount: '1000',
          creditAmount: '0',
          partnerName: '삼한테스트상사',
          memo: '입금 메모',
        },
        {
          lineNo: 2,
          accountCode: '401',
          accountName: '매출',
          debit: '0',
          credit: '1000',
          debitAmount: '0',
          creditAmount: '1000',
          partnerName: null,
          memo: null,
        },
      ],
      version: 0,
    })
    mocks.createJournal.mockResolvedValue({
      id: 'journal-new-from-edit',
      journalNo: '2026/07/05-8',
      journalDate: '2026-07-05',
      status: 'DRAFT',
      sourceType: 'MANUAL',
      description: '편집 분개',
      totalDebit: '1000',
      totalCredit: '1000',
      createdByName: '오병승',
      createdAt: '2026-07-05T09:05:00+09:00',
      postedAt: null,
      reversedAt: null,
      reverseReason: null,
      lines: [],
      version: 0,
    })

    renderPage('/accounting/journals/journal-edit/edit')

    await waitFor(() => {
      expect((screen.getByLabelText('라인 1 거래처') as HTMLInputElement).value)
        .toBe('삼한테스트상사')
    })
    await waitFor(() => expect(mocks.searchJournalPartners).toHaveBeenCalledWith('삼한테스트상사'))

    // #831 R-3 fix: 라인 2(partnerName=null — 조회 실패로 공란일 수도 있는 상태)는 재확인
    // 없이 무경고로 저장되지 않는다. 첫 클릭은 저장을 막고 경고만 띄운다(G4).
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(mocks.createJournal).not.toHaveBeenCalled()
    const warning = await screen.findByRole('alert')
    expect(warning.textContent).toContain('401')

    // 재확인(두 번째 클릭 — "그대로 저장")으로만 실제 저장이 진행된다.
    fireEvent.click(screen.getByRole('button', { name: '그대로 저장' }))

    await waitFor(() => expect(mocks.createJournal).toHaveBeenCalledTimes(1))
    const payload = mocks.createJournal.mock.calls[0][0]
    expect(payload.lines[0]).toMatchObject({
      accountCode: '102',
      partnerId: '00000000-0000-0000-0000-000000000713',
    })
    expect(payload.lines[1]).toMatchObject({
      accountCode: '401',
      partnerId: null,
    })
  })

  it('getJournal 이 실패하면(502/타임아웃) 빈 새 분개 폼으로 조용히 대체되지 않고 장애 안내를 렌더한다 (#831 신규 발견 — journalQuery.isError 가드 부재)', async () => {
    mocks.getJournal.mockRejectedValue(partnerLookupUnavailableError())
    renderPage('/accounting/journals/journal-edit/edit')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('거래처 조회를 일시적으로 할 수 없습니다')
    // 편집 대상 로드가 실패했는데 빈 새 폼(라인 입력 필드)이 대신 렌더되면 사용자가 다른
    // 분개를 편집 중인 줄 모르고 무관한 새 분개를 만들게 된다 — 폼 자체가 렌더되지 않아야 한다.
    expect(screen.queryByLabelText('라인 1 계정과목')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(mocks.getJournal).toHaveBeenCalledTimes(2))
  })

  it('거래처 검색이 UNAVAILABLE(502)로 실패하면 "다시 선택하세요" 대신 외부 조회 장애 문구를 보여준다 (G2 — R-3 dead-end 해소)', async () => {
    mocks.getJournal.mockResolvedValue({
      id: 'journal-edit-2',
      journalNo: '2026/07/05-9',
      journalDate: '2026-07-05',
      status: 'DRAFT',
      sourceType: 'MANUAL',
      description: '조회장애 분개',
      totalDebit: '1000',
      totalCredit: '1000',
      createdByName: '오병승',
      createdAt: '2026-07-05T09:00:00+09:00',
      postedAt: null,
      reversedAt: null,
      reverseReason: null,
      lines: [
        {
          lineNo: 1,
          accountCode: '102',
          accountName: '보통예금',
          debit: '1000',
          credit: '0',
          partnerName: '삼한테스트상사',
          memo: null,
        },
        {
          lineNo: 2,
          accountCode: '401',
          accountName: '매출',
          debit: '0',
          credit: '1000',
          partnerName: null,
          memo: null,
        },
      ],
      version: 0,
    })
    renderPage('/accounting/journals/journal-edit-2/edit')
    // renderPage() 는 내부에서 searchJournalPartners 를 기본 성공값으로 설정한다 — 그 이후에
    // (동일 동기 구간에서) reject 로 덮어써야 실제 컴포넌트 effect(비동기, getJournal 해석
    // 이후에야 호출)가 이 mock 을 부를 때 reject 가 적용된다.
    mocks.searchJournalPartners.mockRejectedValue(partnerLookupUnavailableError())

    await waitFor(() => expect(mocks.searchJournalPartners).toHaveBeenCalledWith('삼한테스트상사'))
    await waitFor(() => {
      expect((screen.getByLabelText('라인 1 계정과목') as HTMLInputElement).value).toBe('102')
    })
    // searchJournalPartners 의 reject → catch → Promise.all(...).then(...) 마이크로태스크
    // 체인이 모두 드레인될 때까지 매크로태스크 경계로 flush 한다(순수 마이크로태스크 체인이라
    // setTimeout(0) 이 뒤에 실행되는 것이 보장된다) — 그래야 이 클릭이
    // partnerLookupSuspectedUnavailable 반영 이후 상태를 본다.
    await new Promise((resolve) => setTimeout(resolve, 0))

    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(mocks.createJournal).not.toHaveBeenCalled()
    const warning = await screen.findByRole('alert')
    expect(warning.textContent).toContain('거래처 조회 서비스에 일시 장애')
    expect(warning.textContent).not.toContain('다시 선택하세요')
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
