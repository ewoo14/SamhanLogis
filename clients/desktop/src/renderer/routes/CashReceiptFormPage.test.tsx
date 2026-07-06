// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { DocCoeditProvider } from '../realtime/createCoeditProvider'

const mocks = vi.hoisted(() => ({
  createCashReceipt: vi.fn(),
  getCashReceipt: vi.fn(),
  updateCashReceipt: vi.fn(),
  listAccounts: vi.fn(),
  searchPartners: vi.fn(),
  createDocCoeditProvider: vi.fn(),
  canAccess: vi.fn(() => true),
  navigate: vi.fn(),
}))

vi.mock('@samhan/design-system', () => ({
  AccountCodeSelect: ({ value, onChange, ariaLabel, disabled }: any) => (
    <input
      aria-label={ariaLabel ?? '계정과목'}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
  Button: ({ children, variant: _variant, size: _size, loading: _loading, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Input: React.forwardRef<HTMLInputElement, any>(function Input({ label, error, ...props }, ref) {
    const id = React.useId()
    return (
      <div>
        {label ? <label htmlFor={id}>{label}</label> : null}
        <input id={id} ref={ref} aria-invalid={error ? true : undefined} {...props} />
        {error ? <span role="alert">{error}</span> : null}
      </div>
    )
  }),
  PartnerAutocomplete: ({ value, onChange, label, disabled }: any) => (
    <label>
      {label ? <span>{label}</span> : null}
      <input
        data-testid="cash-receipt-partner-autocomplete"
        disabled={disabled}
        value={value?.name ?? ''}
        onChange={(event) => onChange({
          partnerCode: 'P-001',
          name: event.target.value,
          bizNo: '123-45-67890',
        })}
      />
    </label>
  ),
  Spinner: ({ label }: { label?: string }) => <div role="status">{label}</div>,
}))

vi.mock('../api/accounting', () => ({
  createCashReceipt: mocks.createCashReceipt,
  getCashReceipt: mocks.getCashReceipt,
  updateCashReceipt: mocks.updateCashReceipt,
  listAccounts: mocks.listAccounts,
}))

vi.mock('../api/partnerApi', () => ({ searchPartners: mocks.searchPartners }))
vi.mock('../realtime/createCoeditProvider', () => ({
  createDocCoeditProvider: mocks.createDocCoeditProvider,
}))
vi.mock('../components/collab/CollaborativeSlipInput', () => ({
  CollaborativeSlipInput: (props: {
    provider: DocCoeditProvider | null
    fieldPath: string
    value: string
    onValueChange?: (value: string) => void
    coeditPending?: boolean
    readOnly?: boolean
    error?: string
    'aria-label': string
  }) => (
    <label>
      <input
        aria-label={props['aria-label']}
        data-testid={`cash-receipt-coedit-${props.fieldPath.replace(/\./g, '-')}`}
        data-field-path={props.fieldPath}
        data-provider-present={String(!!props.provider)}
        data-coedit-pending={String(!!props.coeditPending)}
        value={props.value}
        disabled={!!props.coeditPending || !!props.readOnly}
        onChange={(event) => {
          const nextValue = event.target.value
          props.onValueChange?.(nextValue)
          if (props.provider) {
            props.provider.setHeaderValue(props.fieldPath.replace(/^header\./, ''), nextValue)
          }
        }}
      />
      {props.error ? <span role="alert">{props.error}</span> : null}
    </label>
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

import { CashReceiptFormPage } from './CashReceiptFormPage'

const accounts = [
  { code: '102', name: '보통예금', category: '100' },
  { code: '110', name: '외상매출금', category: '100' },
  { code: '103', name: '당좌예금', category: '100' },
]

function renderPage(path = '/accounting/admin/cash-receipts/new') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mocks.listAccounts.mockResolvedValue(accounts)
  return {
    client,
    ...render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/accounting/admin/cash-receipts/new" element={<CashReceiptFormPage />} />
          <Route path="/accounting/admin/cash-receipts/:id/edit" element={<CashReceiptFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
    ),
  }
}

beforeEach(() => {
  mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable in default test double'))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.canAccess.mockReturnValue(true)
})

describe('CashReceiptFormPage', () => {
  it('신규 작성은 오늘 날짜와 기본 계정 102/110을 프리필한다', async () => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    renderPage()

    expect(await screen.findByRole('heading', { name: '입금보고서 작성' })).not.toBeNull()
    expect(screen.getByLabelText('거래일')).toHaveProperty('value', today)
    expect(screen.getByLabelText('차변 계정')).toHaveProperty('value', '102')
    expect(screen.getByLabelText('대변 계정')).toHaveProperty('value', '110')
  })

  it('필수값 오류를 표시하고 유효한 신규 저장은 createCashReceipt를 호출한다', async () => {
    mocks.createCashReceipt.mockResolvedValue({ id: 'receipt-1', slipNo: '2026/07/05-1' })
    renderPage()

    fireEvent.change(await screen.findByLabelText('금액'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('금액은 0보다 커야 합니다.')).not.toBeNull()
    expect(mocks.createCashReceipt).not.toHaveBeenCalled()

    fireEvent.change(screen.getByTestId('cash-receipt-partner-autocomplete'), { target: { value: '삼한공조' } })
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '2480000' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(mocks.createCashReceipt).toHaveBeenCalledWith({
      partnerCode: 'P-001',
      bizNo: '123-45-67890',
      partnerName: '삼한공조',
      amount: '2480000',
      transactionDate: expect.any(String),
      memo: undefined,
      debitAccountCode: '102',
      creditAccountCode: '110',
    }))
  })

  it('편집 모드는 기존 DRAFT를 hydrate하고 PATCH 저장을 호출한다', async () => {
    mocks.getCashReceipt.mockResolvedValue({
      id: 'receipt-1',
      slipNo: '2026/07/05-1',
      partnerCode: 'P-EDIT',
      bizNo: '222-22-22222',
      partnerName: '편집거래처',
      amount: '760000',
      transactionDate: '2026-07-04',
      kind: 'MANUAL_RECEIPT',
      status: 'DRAFT',
      memo: '초기 적요',
      debitAccountCode: '103',
      creditAccountCode: '110',
    })
    mocks.updateCashReceipt.mockResolvedValue({ id: 'receipt-1', slipNo: '2026/07/05-1' })
    renderPage('/accounting/admin/cash-receipts/receipt-1/edit')

    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '편집거래처'))
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '880000' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(mocks.updateCashReceipt).toHaveBeenCalledWith('receipt-1', expect.objectContaining({
      partnerCode: 'P-EDIT',
      partnerName: '편집거래처',
      amount: '880000',
      transactionDate: '2026-07-04',
      debitAccountCode: '103',
      creditAccountCode: '110',
    })))
  })

  it('CONFIRMED 편집 모드는 편집 가능하고 역분개 재게시 경고를 표시하며 coedit provider 를 생성하지 않는다', async () => {
    mocks.getCashReceipt.mockResolvedValue({
      id: 'receipt-confirmed',
      slipNo: '2026/07/05-7',
      partnerCode: 'P-CONFIRMED',
      bizNo: '333-33-33333',
      partnerName: '확정거래처',
      amount: '760000',
      transactionDate: '2026-07-05',
      kind: 'MANUAL_RECEIPT',
      status: 'CONFIRMED',
      memo: '확정 적요',
      debitAccountCode: '102',
      creditAccountCode: '110',
    })
    renderPage('/accounting/admin/cash-receipts/receipt-confirmed/edit')

    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '확정거래처'))
    expect(screen.getByText('확정된 입금보고서를 수정하면 기존 분개가 역분개되고 새 분개로 재게시됩니다.')).not.toBeNull()
    expect((screen.getByLabelText('금액') as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(false)
    expect(mocks.createDocCoeditProvider).not.toHaveBeenCalled()
  })

  it('BANK_LINKED+CONFIRMED 편집 모드는 read-only이며 coedit provider 를 생성하지 않는다', async () => {
    mocks.getCashReceipt.mockResolvedValue({
      id: 'receipt-bank-linked-confirmed',
      slipNo: '2026/07/05-9',
      partnerCode: 'P-BANK',
      bizNo: '555-55-55555',
      partnerName: '통장거래처',
      amount: '920000',
      transactionDate: '2026-07-05',
      kind: 'BANK_LINKED',
      status: 'CONFIRMED',
      memo: '통장연계 적요',
      debitAccountCode: '102',
      creditAccountCode: '110',
    })
    renderPage('/accounting/admin/cash-receipts/receipt-bank-linked-confirmed/edit')

    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '통장거래처'))
    expect(screen.getByText('통장연계 입금보고서는 수정할 수 없습니다. 취소 후 다시 생성하세요.')).not.toBeNull()
    expect((screen.getByLabelText('금액') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.createDocCoeditProvider).not.toHaveBeenCalled()
  })

  it('UPDATE 권한 없이 편집 URL에 직접 진입하면 read-only이며 coedit provider 를 생성하지 않는다', async () => {
    mocks.canAccess.mockImplementation((_pageCode, action) => action !== 'update')
    mocks.getCashReceipt.mockResolvedValue({
      id: 'receipt-no-update',
      slipNo: '2026/07/05-10',
      partnerCode: 'P-DENY',
      bizNo: '666-66-66666',
      partnerName: '권한없음거래처',
      amount: '450000',
      transactionDate: '2026-07-05',
      kind: 'MANUAL_RECEIPT',
      status: 'DRAFT',
      memo: '권한 없음 적요',
      debitAccountCode: '102',
      creditAccountCode: '110',
    })
    renderPage('/accounting/admin/cash-receipts/receipt-no-update/edit')

    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '권한없음거래처'))
    expect((screen.getByLabelText('금액') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.createDocCoeditProvider).not.toHaveBeenCalled()
  })

  it('CANCELLED 편집 모드는 read-only이며 coedit provider 를 생성하지 않는다', async () => {
    mocks.getCashReceipt.mockResolvedValue({
      id: 'receipt-cancelled',
      slipNo: '2026/07/05-8',
      partnerCode: 'P-CANCELLED',
      bizNo: '444-44-44444',
      partnerName: '취소거래처',
      amount: '500000',
      transactionDate: '2026-07-05',
      kind: 'MANUAL_RECEIPT',
      status: 'CANCELLED',
      memo: '취소 적요',
      debitAccountCode: '102',
      creditAccountCode: '110',
    })
    renderPage('/accounting/admin/cash-receipts/receipt-cancelled/edit')

    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '취소거래처'))
    expect(screen.getByText('취소된 입금보고서는 수정할 수 없습니다.')).not.toBeNull()
    expect((screen.getByLabelText('금액') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.createDocCoeditProvider).not.toHaveBeenCalled()
  })

  it('DRAFT 편집 모드는 cash-receipt provider 를 seed 하고 header fieldPath 를 배선한다', async () => {
    const provider = makeProvider()
    mocks.getCashReceipt.mockResolvedValue({
      id: 'receipt-1',
      slipNo: '2026/07/05-1',
      partnerCode: 'P-EDIT',
      bizNo: '222-22-22222',
      partnerName: '편집거래처',
      amount: '760000',
      transactionDate: '2026-07-04',
      kind: 'MANUAL_RECEIPT',
      status: 'DRAFT',
      memo: '초기 적요',
      debitAccountCode: '103',
      creditAccountCode: '110',
    })
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage('/accounting/admin/cash-receipts/receipt-1/edit')

    await waitFor(() => expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1))
    expect(mocks.createDocCoeditProvider).toHaveBeenCalledWith({
      documentId: 'receipt-1',
      basePath: '/accounting/cash-receipts/receipt-1',
      headerTextFields: new Set(['memo']),
    })
    expect(provider.setHeaderValue).toHaveBeenCalledWith('partnerName', '편집거래처')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('partnerCode', 'P-EDIT')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('bizNo', '222-22-22222')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('transactionDate', '2026-07-04')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('amount', '760000')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('debitAccountCode', '103')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('creditAccountCode', '110')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('memo', '초기 적요')

    for (const fieldPath of [
      'header.partnerName',
      'header.bizNo',
      'header.partnerCode',
      'header.amount',
      'header.transactionDate',
      'header.memo',
    ]) {
      const field = await screen.findByTestId(`cash-receipt-coedit-${fieldPath.replace(/\./g, '-')}`)
      expect(field.getAttribute('data-field-path')).toBe(fieldPath)
      expect(field.getAttribute('data-provider-present')).toBe('true')
    }
    expect((screen.getByTestId('cash-receipt-partner-autocomplete') as HTMLInputElement).disabled).toBe(true)
  })

  it('React Query data 참조가 바뀌어도 provider 를 재생성하지 않는다', async () => {
    const provider = makeProvider()
    mocks.getCashReceipt.mockResolvedValue({
      id: 'receipt-1',
      slipNo: '2026/07/05-1',
      partnerCode: 'P-EDIT',
      bizNo: '222-22-22222',
      partnerName: '편집거래처',
      amount: '760000',
      transactionDate: '2026-07-04',
      kind: 'MANUAL_RECEIPT',
      status: 'DRAFT',
      memo: '초기 적요',
      debitAccountCode: '103',
      creditAccountCode: '110',
    })
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    const { client } = renderPage('/accounting/admin/cash-receipts/receipt-1/edit')

    await waitFor(() => expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1))
    client.setQueryData(['accounting', 'cash-receipt', 'receipt-1'], {
      id: 'receipt-1',
      slipNo: '2026/07/05-1',
      partnerCode: 'P-EDIT',
      bizNo: '222-22-22222',
      partnerName: '리페치거래처',
      amount: '770000',
      transactionDate: '2026-07-04',
      kind: 'MANUAL_RECEIPT',
      status: 'DRAFT',
      memo: '리페치 적요',
      debitAccountCode: '103',
      creditAccountCode: '110',
    })
    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '편집거래처'))

    expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1)
    expect(provider.destroy).not.toHaveBeenCalled()
  })
})

type TestDocCoeditProvider = DocCoeditProvider & {
  __emit: () => void
}

function makeProvider(): TestDocCoeditProvider {
  const header = new Map<string, string>()
  const subscribers = new Set<() => void>()
  return {
    doc: {} as DocCoeditProvider['doc'],
    header: {} as DocCoeditProvider['header'],
    items: { toArray: () => [] } as DocCoeditProvider['items'],
    awareness: {} as DocCoeditProvider['awareness'],
    applyRemoteUpdate: vi.fn(),
    applyRemoteAwareness: vi.fn(),
    setHeaderValue: vi.fn((fieldName: string, value: string) => {
      header.set(fieldName, value)
    }),
    getHeaderValue: vi.fn((fieldName: string) => header.get(fieldName) ?? ''),
    getItemValue: vi.fn(() => ''),
    setItemValue: vi.fn(),
    getItemIndexById: vi.fn(() => -1),
    getItemValueById: vi.fn(() => ''),
    setItemValueById: vi.fn(),
    addItem: vi.fn(() => 'line-1'),
    removeItem: vi.fn(),
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
