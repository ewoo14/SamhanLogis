// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  { code: '1039', name: '보통예금', category: '1018' },
  { code: '1089', name: '외상매출금', category: '1087' },
  { code: '103', name: '당좌예금', category: '100' },
]

function renderPage(path: string | { pathname: string; state?: unknown } = '/accounting/admin/cash-receipts/new') {
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
  it('신규 작성은 오늘 날짜와 기본 계정 1039/1089를 프리필한다', async () => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    renderPage()

    expect(await screen.findByRole('heading', { name: '입금보고서 조회' })).not.toBeNull()
    expect(screen.getByLabelText('거래일')).toHaveProperty('value', today)
    expect(screen.getByLabelText('차변 계정')).toHaveProperty('value', '1039')
    expect(screen.getByLabelText('대변 계정')).toHaveProperty('value', '1089')
  })

  it('필수값 오류를 표시하고 유효한 신규 저장은 createCashReceipt를 호출한다', async () => {
    mocks.createCashReceipt.mockResolvedValue({ id: 'receipt-1', slipNo: '2026/07/05-1' })
    renderPage()

    fireEvent.change(await screen.findByLabelText('금액'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('금액은 0보다 커야 합니다.')).not.toBeNull()
    expect(mocks.createCashReceipt).not.toHaveBeenCalled()

    const firstReceiptLine = within(screen.getByTestId('cash-receipt-line-0'))
    fireEvent.change(firstReceiptLine.getByTestId('cash-receipt-partner-autocomplete'), { target: { value: '삼한공조' } })
    fireEvent.change(firstReceiptLine.getByLabelText('입금 행 1 금액'), { target: { value: '2480000' } })
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '2480000' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(mocks.createCashReceipt).toHaveBeenCalledWith({
      partnerCode: 'P-001',
      bizNo: '123-45-67890',
      partnerName: '삼한공조',
      amount: '2480000',
      transactionDate: expect.any(String),
      memo: undefined,
      debitAccountCode: '1039',
      creditAccountCode: '1089',
      lines: [{
        partnerCode: 'P-001',
        bizNo: '123-45-67890',
        partnerName: '삼한공조',
        amount: '2480000',
        memo: undefined,
      }],
    }))
  })

  it('편집 모드는 기존 DRAFT를 hydrate하고 PATCH 저장을 호출한다', async () => {
    mocks.getCashReceipt.mockResolvedValue({
      id: 'receipt-1',
      slipNo: '2026/07/05-1',
      partnerCode: 'P-EDIT',
      bizNo: '222-22-22222',
      partnerName: '편집거래처',
      amount: '1008',
      transactionDate: '2026-07-04',
      kind: 'MANUAL_RECEIPT',
      status: 'DRAFT',
      memo: '초기 적요',
      debitAccountCode: '1029',
      creditAccountCode: '1089',
    })
    mocks.updateCashReceipt.mockResolvedValue({ id: 'receipt-1', slipNo: '2026/07/05-1' })
    renderPage({
      pathname: '/accounting/admin/cash-receipts/receipt-1/edit',
      state: {
        returnTo: { pathname: '/accounting/admin/cash-receipts', search: '?kind=DEPOSIT_REPORT&page=2' },
        returnEntryKey: 'source-entry',
      },
    })

    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '편집거래처'))
    expect((screen.getByLabelText('금액') as HTMLInputElement).value).toBe('1008')
    expect((screen.getByLabelText('입금 행 1 금액') as HTMLInputElement).value).toBe('1008')
    fireEvent.change(screen.getByLabelText('입금 행 1 금액'), { target: { value: '880000' } })
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '880000' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(mocks.updateCashReceipt).toHaveBeenCalledWith('receipt-1', expect.objectContaining({
      partnerCode: 'P-EDIT',
      partnerName: '편집거래처',
      amount: '880000',
      transactionDate: '2026-07-04',
      debitAccountCode: '1029',
      creditAccountCode: '1089',
    })))
  })

  it('RED-LUNA-1: 2026/08/07-8 부분 행 hydrate 첫 금액은 서버 1008이어야 한다', async () => {
    renderCashReceiptHydrateCase('receipt-liveqa-1008', [{ partnerName: '대구HVAC솔루션' }], [{ partnerName: '대구HVAC솔루션', amount: 1008, memo: 'S5-1094-08' }], '1008')
    await waitFor(() => {
      expect(screen.getByLabelText('입금 행 1 금액').getAttribute('data-provider-present')).toBe('true')
      expect(screen.getByLabelText('입금 행 1 금액')).toHaveProperty('value', '1008')
    })
  })

  it('RED-LUNA-2: 2026/08/07-8 hydrate 합계는 행 합계 1008원과 입금 총액 1008원이어야 한다', async () => {
    renderCashReceiptHydrateCase('receipt-liveqa-1008-total', [{ partnerName: '대구HVAC솔루션' }], [{ partnerName: '대구HVAC솔루션', amount: 1008, memo: 'S5-1094-08' }], '1008')
    await waitFor(() => {
      expect(screen.getByLabelText('입금 행 1 금액').getAttribute('data-provider-present')).toBe('true')
      expect(screen.getByText('행 합계: 1,008원 / 입금 총액 1,008원')).toBeTruthy()
    })
  })

  it('RED-LUNA-3A: 거래처-only 행은 서버 금액 1008와 적요를 보존해야 한다', async () => {
    renderCashReceiptHydrateCase('receipt-partner-only', [{ partnerName: '대구HVAC솔루션' }], [{ partnerName: '대구HVAC솔루션', amount: 1008, memo: 'S5-1094-08' }], '1008')
    await waitFor(() => {
      expect(screen.getByLabelText('입금 행 1 금액').getAttribute('data-provider-present')).toBe('true')
      expect(screen.getByLabelText('입금 행 1 금액')).toHaveProperty('value', '1008')
      expect(screen.getByLabelText('입금 행 1 적요')).toHaveProperty('value', 'S5-1094-08')
    })
  })

  it('RED-LUNA-3B: 금액-only 행은 서버 거래처와 적요를 보존해야 한다', async () => {
    renderCashReceiptHydrateCase('receipt-amount-only', [{ amount: '2024' }], [{ partnerName: '대구 HVAC 솔루션', amount: 2024, memo: 'RECONV2-AMOUNT-ONLY' }], '2024')
    await waitFor(() => {
      expect(screen.getByLabelText('입금 행 1 금액').getAttribute('data-provider-present')).toBe('true')
      expect(within(screen.getByTestId('cash-receipt-line-0')).getByTestId('cash-receipt-partner-autocomplete')).toHaveProperty('value', '대구 HVAC 솔루션')
      expect(screen.getByLabelText('입금 행 1 적요')).toHaveProperty('value', 'RECONV2-AMOUNT-ONLY')
    })
  })

  it('RED-LUNA-3C: 혼합 여러 행은 각 행의 서버 금액과 적요를 보존해야 한다', async () => {
    renderCashReceiptHydrateCase('receipt-mixed', [{ partnerName: '대구 HVAC 솔루션' }, { amount: '2222' }], [
      { partnerName: '대구 HVAC 솔루션', amount: 1111, memo: 'RECONV2-MULTI-A' },
      { partnerName: '능동에어컨(박수천)', amount: 2222, memo: 'RECONV2-MULTI-B' },
    ], '3333')
    await waitFor(() => {
      expect(screen.getByLabelText('입금 행 1 금액').getAttribute('data-provider-present')).toBe('true')
      expect(screen.getByLabelText('입금 행 1 금액')).toHaveProperty('value', '1111')
      expect(screen.getByLabelText('입금 행 2 적요')).toHaveProperty('value', 'RECONV2-MULTI-B')
    })
  })

  it('RED-LUNA-3D: 단일 빈 provider 행은 서버 금액 4040과 거래처를 보존해야 한다', async () => {
    renderCashReceiptHydrateCase('receipt-single-empty', [{}], [{ partnerName: '능동에어컨(박수천)', amount: 4040, memo: null }], '4040')
    await waitFor(() => {
      expect(screen.getByLabelText('입금 행 1 금액').getAttribute('data-provider-present')).toBe('true')
      expect(screen.getByLabelText('입금 행 1 금액')).toHaveProperty('value', '4040')
      expect(within(screen.getByTestId('cash-receipt-line-0')).getByTestId('cash-receipt-partner-autocomplete')).toHaveProperty('value', '능동에어컨(박수천)')
    })
  })

  it('편집 저장은 목록 쿼리를 갱신한 뒤 원래 목록 history entry로 복귀한다', async () => {
    const saved = {
      id: 'receipt-1',
      slipNo: '2026/07/05-1',
      partnerCode: 'P-EDIT',
      bizNo: '222-22-22222',
      partnerName: '편집거래처',
      amount: '880000',
      transactionDate: '2026-07-04',
      kind: 'MANUAL_RECEIPT',
      status: 'DRAFT',
      memo: '갱신 적요',
      debitAccountCode: '1029',
      creditAccountCode: '1089',
    }
    mocks.getCashReceipt.mockResolvedValue({ ...saved, amount: '760000', memo: '초기 적요' })
    mocks.updateCashReceipt.mockResolvedValue(saved)
    renderPage({
      pathname: '/accounting/admin/cash-receipts/receipt-1/edit',
      state: {
        returnTo: { pathname: '/accounting/admin/cash-receipts', search: '?kind=DEPOSIT_REPORT&page=2' },
        returnEntryKey: 'source-entry',
      },
    })

    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '편집거래처'))
    fireEvent.change(screen.getByLabelText('입금 행 1 금액'), { target: { value: '880000' } })
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '880000' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(mocks.updateCashReceipt).toHaveBeenCalled())
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(-2))
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
      debitAccountCode: '1039',
      creditAccountCode: '1089',
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
      debitAccountCode: '1039',
      creditAccountCode: '1089',
    })
    renderPage('/accounting/admin/cash-receipts/receipt-bank-linked-confirmed/edit')

    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '통장거래처'))
    expect(screen.getByText('통장연계 입금보고서는 수정할 수 없습니다. 취소 후 다시 생성하세요.')).not.toBeNull()
    expect((screen.getByLabelText('금액') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('차변 계정') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('대변 계정') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.createDocCoeditProvider).not.toHaveBeenCalled()
  })

  it('BANK_LINKED+CANCELLED+무권한 편집 모드는 취소 배너 하나만 alert로 표시한다', async () => {
    mocks.canAccess.mockImplementation((_pageCode, action) => action !== 'update')
    mocks.getCashReceipt.mockResolvedValue({
      id: 'receipt-bank-linked-cancelled',
      slipNo: '2026/07/05-11',
      partnerCode: 'P-CANCELLED-BANK',
      bizNo: '777-77-77777',
      partnerName: '취소통장거래처',
      amount: '120000',
      transactionDate: '2026-07-05',
      kind: 'BANK_LINKED',
      status: 'CANCELLED',
      memo: '취소 통장연계 적요',
      debitAccountCode: '1039',
      creditAccountCode: '1089',
    })
    renderPage('/accounting/admin/cash-receipts/receipt-bank-linked-cancelled/edit')

    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '취소통장거래처'))
    expect(screen.getByRole('alert').textContent).toBe('취소된 입금보고서는 수정할 수 없습니다.')
    expect(screen.queryByText('통장연계 입금보고서는 수정할 수 없습니다. 취소 후 다시 생성하세요.')).toBeNull()
    expect(screen.queryByText('입금보고서 수정 권한이 없어 읽기 전용으로 표시됩니다.')).toBeNull()
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
      debitAccountCode: '1039',
      creditAccountCode: '1089',
    })
    renderPage('/accounting/admin/cash-receipts/receipt-no-update/edit')

    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '권한없음거래처'))
    expect((screen.getByLabelText('금액') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('차변 계정') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('대변 계정') as HTMLInputElement).disabled).toBe(true)
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
      debitAccountCode: '1039',
      creditAccountCode: '1089',
    })
    renderPage('/accounting/admin/cash-receipts/receipt-cancelled/edit')

    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '취소거래처'))
    expect(screen.getByRole('alert').textContent).toBe('취소된 입금보고서는 수정할 수 없습니다.')
    expect((screen.getByLabelText('금액') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('차변 계정') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('대변 계정') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.createDocCoeditProvider).not.toHaveBeenCalled()
  })

  it('저장 실패 topError 배너는 danger-700 텍스트 대비를 사용한다', async () => {
    mocks.getCashReceipt.mockResolvedValue({
      id: 'receipt-save-fail',
      slipNo: '2026/07/05-12',
      partnerCode: 'P-FAIL',
      bizNo: '888-88-88888',
      partnerName: '저장실패거래처',
      amount: '330000',
      transactionDate: '2026-07-05',
      kind: 'MANUAL_RECEIPT',
      status: 'DRAFT',
      memo: '저장 실패 적요',
      debitAccountCode: '1039',
      creditAccountCode: '1089',
    })
    mocks.updateCashReceipt.mockRejectedValue(new Error('서버 오류'))
    renderPage('/accounting/admin/cash-receipts/receipt-save-fail/edit')

    await waitFor(() => expect(screen.getByLabelText('거래처명')).toHaveProperty('value', '저장실패거래처'))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('저장 실패: 서버 오류')
    expect(alert.getAttribute('style')).toContain('color: var(--color-danger-700, #991B1B)')
  })

  it('#831 R-3/R-5: partnerCode/partnerName 이 모두 공란인 편집 hydrate 는 "조회 실패" 안내를 보여준다 (일반 필수입력 오인 방지)', async () => {
    mocks.getCashReceipt.mockResolvedValue({
      id: 'receipt-lookup-unavailable',
      slipNo: '2026/07/05-13',
      partnerCode: '',
      bizNo: '',
      partnerName: '',
      amount: '410000',
      transactionDate: '2026-07-05',
      kind: 'MANUAL_RECEIPT',
      status: 'DRAFT',
      memo: '조회장애 적요',
      debitAccountCode: '1039',
      creditAccountCode: '1089',
    })
    renderPage('/accounting/admin/cash-receipts/receipt-lookup-unavailable/edit')

    const notice = await screen.findByText(/거래처 조회.*(장애|실패|불가)/)
    expect(notice).toBeTruthy()
    expect(screen.queryByText('거래처를 선택하거나 거래처명을 입력하세요.')).toBeNull()
  })

  it('#831 R-3/R-5: 조회 실패 hydrate 상태에서 저장을 시도하면 "필수 입력" 문구가 아니라 조회 실패 문구를 보여준다 (G2)', async () => {
    mocks.getCashReceipt.mockResolvedValue({
      id: 'receipt-lookup-unavailable-2',
      slipNo: '2026/07/05-14',
      partnerCode: '',
      bizNo: '',
      partnerName: '',
      amount: '410000',
      transactionDate: '2026-07-05',
      kind: 'MANUAL_RECEIPT',
      status: 'DRAFT',
      memo: '조회장애 적요',
      debitAccountCode: '1039',
      creditAccountCode: '1089',
    })
    renderPage('/accounting/admin/cash-receipts/receipt-lookup-unavailable-2/edit')

    await screen.findByLabelText('금액')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(mocks.updateCashReceipt).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('조회')
    expect(alert.textContent).not.toBe('거래처를 선택하거나 거래처명을 입력하세요.')
  })

  it('#831-hydrate (H2/H4): receiptQuery 데이터 커밋 직후 hydrate effect 가 아직 실행되지 않은 프레임에서 저장해도 초기값 기반 오류가 섞이지 않는다', async () => {
    // 이 결함은 "isLoading→false 렌더"와 "state 가 채워지는 렌더(useEffect)" 사이의 한 틱
    // 창에서만 재현된다. act() 로 감싸인 waitFor/findBy*(fireEvent 도 act 래핑)는 이 창에서
    // 예약된 passive effect 까지 우연히 flush 해버릴 수 있어 로컬 dev PC 에서는 이 결함이 늘
    // GREEN 이었다(CI 는 vCPU 경합으로 매크로태스크 순서가 뒤집혀 우연히만 노출).
    //
    // 결정적 재현: setQueryData 알림(react-query notifyManager)과 그로 인한 React 커밋은
    // 마이크로태스크 경유이지만, 커밋 이후 예약되는 passive effect(hydrate useEffect) 실행은
    // 스케줄러의 매크로태스크다. act()/waitFor 를 전혀 쓰지 않고 "마이크로태스크만" 흘려보내면
    // (매크로태스크로는 절대 안 넘어감) "커밋은 됐지만 effect 는 아직" 프레임을 머신/부하와
    // 무관하게 100% 결정적으로 잡을 수 있다.
    //
    // #831-hydrate 계열 4파일 통일 기법(ba83641af + 2026-07-26 PM 지적) — 매크로태스크
    // 1틱은 setTimeout(fn,0) 대신 MessageChannel 로 만든다. setTimeout(fn,0) 은 WHATWG
    // 스펙상 "중첩 타이머 4ms 클램프" 대상이라 실행 컨텍스트(파일 내 이전 테스트 유무 등)에
    // 따라 React 스케줄러의 매크로태스크와 큐 순서가 뒤집힐 수 있음을 실측 확인했다(이 파일을
    // pre-fix 코드로 되돌려 전체 스위트 실행에서는 RED 가 정확히 재현됐지만 `-t` 격리
    // 실행에서는 콜드스타트 타이밍 차이로 false-GREEN 이 났었다). MessageChannel 은 React
    // 스케줄러와 동일 메커니즘이라 이 클램프 편차가 없다.
    //
    // 이 컴포넌트는 accountsQuery 외에 coedit 관련 부수 상태도 있어 커밋 1회를 "관측 가능한
    // 상태"로 만드는 데 매크로태스크가 정확히 몇 틱 필요한지가 다른 3파일(1틱)과 다르게 실측
    // 됐다(2틱) — 그래서 "커밋을 처음 관측하는 순간 즉시 멈춘다" 는 상한 있는 재시도 루프로
    // 짠다(더 돌리지 않는다 — 그래야 pre-fix 코드에서 hydrate effect 의 macrotask 까지
    // 우연히 넘어가는 일이 없다). 렌더 중 파생(이 파일의 fix)은 "커밋 = 이미 hydrate 완료"를
    // 구조적으로 보장하므로, fix 적용 후에는 몇 틱이 걸리든 이 루프가 항상 안전하게 GREEN 이다.
    const receiptId = 'receipt-hydrate-race'
    const receiptKey = ['accounting', 'cash-receipt', receiptId]
    const row = {
      id: receiptId,
      slipNo: '2026/07/05-99',
      partnerCode: '',
      bizNo: '',
      partnerName: '',
      amount: '410000',
      transactionDate: '2026-07-05',
      kind: 'MANUAL_RECEIPT',
      status: 'DRAFT',
      memo: '',
      debitAccountCode: '1039',
      creditAccountCode: '1089',
    }
    // getCashReceipt 는 절대 resolve 되지 않는 pending Promise 로 둔다 — react-query 의 fetch
    // 경로(마이크로태스크 체인 다수 hop)를 아예 안 타야 "언제 commit 되는지"를 완전히 통제할
    // 수 있다.
    mocks.getCashReceipt.mockImplementation(() => new Promise(() => {}))
    const { client } = renderPage(`/accounting/admin/cash-receipts/${receiptId}/edit`)
    // listAccounts 는 resolve 되는 진짜 Promise 라 최소 한 틱이 필요하다 — 이 대기는 accounts
    // 게이트에만 관여하고(receiptQuery.data 는 아직 undefined 라 하이드레이트 effect 의 guard 가
    // 즉시 return, flush 할 게 없다) 우리가 통제하려는 receipt hydrate 창과는 무관하다.
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('입금보고서 불러오는 중'))

    client.setQueryData(receiptKey, row)
    // 매크로태스크를 정확히 1틱씩 MessageChannel 로 만들고(React 스케줄러와 동일 메커니즘 —
    // setTimeout(fn,0) 의 WHATWG 중첩 타이머 4ms 클램프 편차 없음), 그때마다 마이크로태스크를
    // 흘려 "커밋을 처음 관측하는 순간" 즉시 멈춘다(더 돌리지 않는다). 이 컴포넌트는
    // accountsQuery·coedit 관련 부수 상태가 더 있어 다른 3파일(1 매크로태스크)과 달리 커밋
    // 관측까지 매크로태스크가 몇 틱 필요한지가 실행 컨텍스트에 따라 다를 수 있음을 실측
    // 확인했다 — 그래서 상한 있는 재시도로 짠다. "처음 관측 즉시 멈춤" 이라 pre-fix 코드에서
    // hydrate effect 의 (반드시 한 틱 더 뒤에 오는) macrotask 까지 넘어갈 위험은 없다. 렌더
    // 중 파생(이 파일의 fix)은 "커밋 = 이미 hydrate 완료" 를 구조적으로 보장하므로, fix 적용
    // 후에는 몇 틱이 걸리든 이 루프가 항상 안전하게 GREEN 이다.
    let saveButton: HTMLElement | null = null
    for (let macroTick = 0; macroTick < 10 && !saveButton; macroTick++) {
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = () => resolve()
        channel.port2.postMessage(undefined)
      })
      saveButton = screen.queryByRole('button', { name: '저장' })
      // 마이크로태스크만 정밀하게 추가로 흘려보낸다 — 매크로태스크는 절대 안 섞이므로(아래는
      // 전부 Promise.resolve() 마이크로태스크뿐) hydrate effect 가 끼어들 수 없다.
      for (let microTick = 0; microTick < 300 && !saveButton; microTick++) {
        // 마이크로태스크를 한 틱씩만 정밀하게 흘려보내야 하므로 루프 안 await 가 의도적이다.
        await Promise.resolve()
        saveButton = screen.queryByRole('button', { name: '저장' })
      }
    }
    if (!saveButton) {
      throw new Error('receiptQuery 커밋을 관측하지 못했다 (매크로 10틱 + 매 틱마다 마이크로 300틱)')
    }

    fireEvent.click(saveButton)

    expect(mocks.updateCashReceipt).not.toHaveBeenCalled()
    const alerts = screen.queryAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.textContent).toContain('조회')
    expect(alerts[0]!.textContent).not.toMatch(/0보다/)
  })

  it('#831 신규 발견: getCashReceipt 실패 시(PM 라이브QA — 검색 hang 이 detail 호출까지 지연시켜 timeout) 재시도 버튼을 제공한다 (이전엔 dead-end)', async () => {
    mocks.getCashReceipt.mockRejectedValue(new Error('timeout of 10000ms exceeded'))
    renderPage('/accounting/admin/cash-receipts/receipt-timeout/edit')

    await screen.findByRole('alert')
    expect(mocks.getCashReceipt).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(mocks.getCashReceipt).toHaveBeenCalledTimes(2))
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
      debitAccountCode: '1029',
      creditAccountCode: '1089',
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
    expect(provider.setHeaderValue).toHaveBeenCalledWith('debitAccountCode', '1029')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('creditAccountCode', '1089')
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
    expect((within(screen.getByTestId('cash-receipt-line-0')).getByTestId('cash-receipt-partner-autocomplete') as HTMLInputElement).disabled).toBe(true)
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
      debitAccountCode: '1029',
      creditAccountCode: '1089',
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
      debitAccountCode: '1029',
      creditAccountCode: '1089',
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

function renderCashReceiptHydrateCase(
  id: string,
  providerRows: Array<Record<string, string>>,
  serverLines: Array<{ partnerName: string; amount: number; memo: string | null }>,
  headerAmount: string,
) {
  const provider = makeProvider()
  provider.isEmpty.mockReturnValue(false)
  provider.items = { toArray: () => providerRows } as DocCoeditProvider['items']
  provider.getItemValue.mockImplementation((index: number, fieldName: string) => providerRows[index]?.[fieldName] ?? '')
  provider.setItemValue.mockImplementation((index: number, fieldName: string, value: string) => {
    if (providerRows[index]) providerRows[index]![fieldName] = value
  })
  provider.replaceItems.mockImplementation((nextRows: Array<Record<string, string>>) => {
    providerRows.splice(0, providerRows.length, ...nextRows)
  })
  mocks.createDocCoeditProvider.mockResolvedValue(provider)
  mocks.getCashReceipt.mockResolvedValue({
    id,
    slipNo: id === 'receipt-liveqa-1008' ? '2026/08/07-8' : id,
    partnerCode: 'P-2026-0005',
    bizNo: '165-35-10155',
    partnerName: serverLines[0]?.partnerName ?? '',
    amount: headerAmount,
    transactionDate: '2026-08-07',
    kind: 'MANUAL_RECEIPT',
    status: 'DRAFT',
    memo: serverLines[0]?.memo ?? '',
    debitAccountCode: '1039',
    creditAccountCode: '1089',
    lines: serverLines.map((line) => ({
      partnerCode: 'P-2026-0005',
      bizNo: '165-35-10155',
      ...line,
    })),
  })
  renderPage(`/accounting/admin/cash-receipts/${id}/edit`)
}
