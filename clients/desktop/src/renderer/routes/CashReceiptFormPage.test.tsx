// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  createCashReceipt: vi.fn(),
  getCashReceipt: vi.fn(),
  updateCashReceipt: vi.fn(),
  listAccounts: vi.fn(),
  searchPartners: vi.fn(),
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
  Input: React.forwardRef<HTMLInputElement, any>(function Input({ label, ...props }, ref) {
    return (
      <label>
        {label ? <span>{label}</span> : null}
        <input ref={ref} {...props} />
      </label>
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
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
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
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/accounting/admin/cash-receipts/new" element={<CashReceiptFormPage />} />
          <Route path="/accounting/admin/cash-receipts/:id/edit" element={<CashReceiptFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
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
})
