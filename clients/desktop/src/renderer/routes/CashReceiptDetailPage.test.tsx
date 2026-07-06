// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { CashReceiptRow } from '../api/accounting'

const mocks = vi.hoisted(() => ({
  getCashReceipt: vi.fn(),
  confirmCashReceipt: vi.fn(),
  cancelCashReceipt: vi.fn(),
  deleteCashReceipt: vi.fn(),
  createDocCoeditProvider: vi.fn(),
  canAccess: vi.fn(() => true),
  navigate: vi.fn(),
}))

vi.mock('@samhan/design-system', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-variant={variant}>{children}</span>
  ),
  Button: ({ children, variant: _variant, size: _size, loading: _loading, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Spinner: ({ label }: { label?: string }) => <div role="status">{label}</div>,
}))

vi.mock('../api/accounting', () => ({
  getCashReceipt: mocks.getCashReceipt,
  confirmCashReceipt: mocks.confirmCashReceipt,
  cancelCashReceipt: mocks.cancelCashReceipt,
  deleteCashReceipt: mocks.deleteCashReceipt,
}))

vi.mock('../realtime/createCoeditProvider', () => ({
  createDocCoeditProvider: mocks.createDocCoeditProvider,
}))
vi.mock('../components/collab/CollaborativeSlipInput', () => ({
  CollaborativeSlipInput: (props: {
    provider: any
    fieldPath: string
    value: string
    onValueChange?: (value: string) => void
    coeditPending?: boolean
    readOnly?: boolean
    'aria-label': string
  }) => (
    <input
      aria-label={props['aria-label']}
      data-testid={`cash-receipt-detail-coedit-${props.fieldPath.replace(/\./g, '-')}`}
      data-field-path={props.fieldPath}
      data-provider-present={String(!!props.provider)}
      data-coedit-pending={String(!!props.coeditPending)}
      value={props.value}
      disabled={!!props.coeditPending || !!props.readOnly}
      onChange={(event) => {
        const nextValue = event.target.value
        props.onValueChange?.(nextValue)
        if (props.provider) props.provider.setHeaderValue(props.fieldPath.replace(/^header\./, ''), nextValue)
      }}
    />
  ),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: mocks.canAccess }),
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mocks.navigate }
})

import { CashReceiptDetailPage } from './CashReceiptDetailPage'

function receipt(overrides: Partial<CashReceiptRow> = {}): CashReceiptRow {
  return {
    id: 'receipt-1',
    slipNo: '2026/07/05-1',
    partnerCode: 'P-001',
    bizNo: '123-45-67890',
    partnerName: '삼한공조',
    amount: '2480000',
    transactionDate: '2026-07-05',
    kind: 'MANUAL_RECEIPT',
    status: 'DRAFT',
    memo: '수기 입금',
    journalNo: null,
    reverseJournalNo: null,
    externalRef: 'MANUAL-20260705-001',
    debitAccountCode: '102',
    creditAccountCode: '110',
    ...overrides,
  }
}

function renderPage(row: CashReceiptRow) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mocks.getCashReceipt.mockResolvedValue(row)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/accounting/admin/cash-receipts/receipt-1']}>
        <Routes>
          <Route path="/accounting/admin/cash-receipts/:id" element={<CashReceiptDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable in default test double'))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.canAccess.mockReturnValue(true)
})

describe('CashReceiptDetailPage', () => {
  it('상세 필드와 S4a kind 라벨을 렌더하고 DRAFT 액션을 활성화한다', async () => {
    renderPage(receipt())

    expect(await screen.findByRole('heading', { name: '2026/07/05-1' })).not.toBeNull()
    expect(screen.getAllByText('수기 입금').length).toBeGreaterThan(0)
    expect(screen.getByText('삼한공조')).not.toBeNull()
    expect((screen.getByRole('button', { name: '확정' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '편집' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '삭제' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('BANK_LINKED 상세는 편집을 비활성화하고 PATCH 진입을 막는다', async () => {
    renderPage(receipt({ kind: 'BANK_LINKED', status: 'CONFIRMED', journalNo: '2026/07/05-9' }))

    expect(await screen.findByText('통장연계')).not.toBeNull()
    const edit = screen.getByRole('button', { name: '편집 불가' })
    expect((edit as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '편집' })).toBeNull()
  })

  it('BANK_LINKED 편집 불가 버튼은 update 권한이 있을 때만 노출한다', async () => {
    mocks.canAccess.mockImplementation((_pageCode, action) => action !== 'update')
    renderPage(receipt({ kind: 'BANK_LINKED', status: 'CONFIRMED' }))

    await screen.findByText('통장연계')
    expect(screen.queryByRole('button', { name: '편집 불가' })).toBeNull()
  })

  it('CONFIRMED 수기 입금보고서는 편집 버튼과 coedit provider 를 노출하지 않는다', async () => {
    renderPage(receipt({ kind: 'MANUAL_RECEIPT', status: 'CONFIRMED', journalNo: '2026/07/05-9' }))

    await screen.findByText('확정')
    expect(screen.queryByRole('button', { name: '편집' })).toBeNull()
    expect(mocks.createDocCoeditProvider).not.toHaveBeenCalled()
  })

  it('kind와 CONFIRMED 상태 badge tone을 success로 렌더한다', async () => {
    renderPage(receipt({ kind: 'BANK_LINKED', status: 'CONFIRMED' }))

    expect((await screen.findByText('통장연계')).getAttribute('data-variant')).toBe('success')
    expect(screen.getByText('확정').getAttribute('data-variant')).toBe('success')
  })

  it('확정/취소/삭제 mutation을 호출한다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mocks.confirmCashReceipt.mockResolvedValue(receipt({ status: 'CONFIRMED' }))
    mocks.cancelCashReceipt.mockResolvedValue(receipt({ status: 'CANCELLED' }))
    mocks.deleteCashReceipt.mockResolvedValue(undefined)

    renderPage(receipt())
    fireEvent.click(await screen.findByRole('button', { name: '확정' }))
    await waitFor(() => expect(mocks.confirmCashReceipt).toHaveBeenCalledWith('receipt-1'))

    cleanup()
    renderPage(receipt({ status: 'CONFIRMED' }))
    fireEvent.click(await screen.findByRole('button', { name: '취소' }))
    await waitFor(() => expect(mocks.cancelCashReceipt).toHaveBeenCalledWith('receipt-1'))

    cleanup()
    renderPage(receipt())
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }))
    await waitFor(() => expect(mocks.deleteCashReceipt).toHaveBeenCalledWith('receipt-1'))
  })

  it('DRAFT 상세는 cash-receipt coedit provider 를 seed 하고 header fieldPath 를 배선한다', async () => {
    const provider = makeProvider()
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage(receipt())

    await waitFor(() => expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1))
    expect(mocks.createDocCoeditProvider).toHaveBeenCalledWith({
      documentId: 'receipt-1',
      basePath: '/accounting/cash-receipts/receipt-1',
      headerTextFields: new Set(['memo']),
    })
    expect(provider.setHeaderValue).toHaveBeenCalledWith('partnerName', '삼한공조')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('partnerCode', 'P-001')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('bizNo', '123-45-67890')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('transactionDate', '2026-07-05')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('amount', '2480000')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('debitAccountCode', '102')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('creditAccountCode', '110')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('memo', '수기 입금')

    for (const fieldPath of [
      'header.partnerName',
      'header.partnerCode',
      'header.bizNo',
      'header.transactionDate',
      'header.amount',
      'header.debitAccountCode',
      'header.creditAccountCode',
      'header.memo',
    ]) {
      const field = await screen.findByTestId(`cash-receipt-detail-coedit-${fieldPath.replace(/\./g, '-')}`)
      expect(field.getAttribute('data-field-path')).toBe(fieldPath)
      expect(field.getAttribute('data-provider-present')).toBe('true')
    }
  })

  it('BANK_LINKED 상세는 coedit provider 를 생성하지 않는다', async () => {
    renderPage(receipt({ kind: 'BANK_LINKED', status: 'DRAFT' }))

    await screen.findByText('통장연계')
    expect(mocks.createDocCoeditProvider).not.toHaveBeenCalled()
  })
})

function makeProvider() {
  const header = new Map<string, string>()
  const subscribers = new Set<() => void>()
  return {
    items: { toArray: () => [] },
    setHeaderValue: vi.fn((fieldName: string, value: string) => {
      header.set(fieldName, value)
    }),
    getHeaderValue: vi.fn((fieldName: string) => header.get(fieldName) ?? ''),
    replaceItems: vi.fn(),
    isEmpty: vi.fn(() => true),
    subscribeDoc: vi.fn((listener: () => void) => {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    }),
    subscribeAwareness: vi.fn(() => () => undefined),
    getRemoteCursors: vi.fn(() => []),
    getRemoteEdits: vi.fn(() => []),
    setLocalCursor: vi.fn(),
    setLocalLastEdit: vi.fn(),
    destroy: vi.fn(),
    __emit: () => {
      for (const subscriber of subscribers) subscriber()
    },
  }
}
