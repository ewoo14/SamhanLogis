// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { AxiosError } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BankTransactionRow } from '../api/accounting'

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true, isLoading: false }),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const listBankTransactionsMock = vi.fn()
const listBankTransactionFilterLabelsMock = vi.fn()
const loadBankTransactionFilterPreferencesMock = vi.fn()
vi.mock('../api/accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/accounting')>()
  return {
    ...actual,
    listBankTransactions: (...args: unknown[]) => listBankTransactionsMock(...args),
    listBankTransactionFilterLabels: (...args: unknown[]) => listBankTransactionFilterLabelsMock(...args),
    loadBankTransactionFilterPreferences: (...args: unknown[]) => loadBankTransactionFilterPreferencesMock(...args),
  }
})

// CodefImportScopeForm 는 별도 api/codef 모듈을 쓴다 — 실 apiClient 호출은 테스트 서버가 없어
// reject 되지만, 그 하위 폼 자체의 에러 처리는 본 테스트 범위가 아니므로 그대로 둔다.

import {
  BANK_TRANSACTION_LIST_COLUMN_KEYS,
  partnerMatchEvidence,
  BankTransactionPage,
} from './BankTransactionPage'

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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BankTransactionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const sampleTxnRow: BankTransactionRow = {
  transactedAt: '2026-07-24T09:00:00',
  txnType: 'DEPOSIT',
  amount: '250000',
  description: '삼한공조 입금건',
  bankAccountLabel: '국민 운영계좌',
  source: 'CODEF_BANK',
  externalRef: 'ref-1',
  matchStatus: 'UNREFLECTED',
}

afterEach(() => {
  cleanup()
  listBankTransactionsMock.mockReset()
  listBankTransactionFilterLabelsMock.mockReset()
  loadBankTransactionFilterPreferencesMock.mockReset()
})

describe('BankTransactionPage — partner lookup UNAVAILABLE (#831 R-1, PM 라이브QA 확증)', () => {
  it('502 응답 시 빈 표(입출금 거래가 없습니다) 대신 장애 안내를 렌더한다 (G1)', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockRejectedValue(partnerLookupUnavailableError())
    renderPage()

    await waitFor(() => expect(screen.getByTestId('bank-transaction-error')).toBeTruthy())
    expect(screen.getByTestId('bank-transaction-error').textContent).toContain('거래처 조회를 일시적으로 할 수 없습니다')
    expect(screen.queryByText('입출금 거래가 없습니다')).toBeNull()
  })

  it('502 응답 시 입금/출금/건수 요약이 0 으로 표시되지 않는다 (G1 — PM 라이브QA: 316행 중 4건 매칭 실패로 312행까지 함께 사라짐)', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockRejectedValue(partnerLookupUnavailableError())
    renderPage()

    await waitFor(() => expect(screen.getByTestId('bank-transaction-error')).toBeTruthy())
    expect(screen.queryByText(/0건/)).toBeNull()
    expect(screen.queryByText(/입금 —/)).toBeNull()
  })

  it('다시 시도 버튼 클릭 시 refetch 한다 (G2 — 재시도 경로)', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockRejectedValue(partnerLookupUnavailableError())
    renderPage()

    await waitFor(() => expect(screen.getByTestId('bank-transaction-error')).toBeTruthy())
    const callsBefore = listBankTransactionsMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(listBankTransactionsMock.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('정상 응답에서는 표와 요약이 그대로 나온다 (무회귀)', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([sampleTxnRow])
    renderPage()

    expect(await screen.findByText('삼한공조 입금건')).toBeTruthy()
    expect(screen.getByText(/입금 250,000/)).toBeTruthy()
    expect(screen.queryByTestId('bank-transaction-error')).toBeNull()
  })
})

const baseRow: BankTransactionRow = {
  transactedAt: '2026-07-17T09:00:00',
  txnType: 'DEPOSIT',
  amount: '1000',
  description: '입금',
  bankAccountLabel: '국민 운영계좌',
  source: 'CSV_IMPORT',
  externalRef: 'evidence-test',
  matchStatus: 'UNREFLECTED',
  matchedPartnerCode: 'P-0001',
  matchedPartnerName: '테스트 거래처',
}

describe('BankTransactionPage 매칭근거 배지', () => {
  it.each([
    ['MANUAL', '수동'],
    ['DEPOSITOR_MAPPING', '자동·입금자명'],
    ['PARTNER_CODE_EXACT', '자동·코드일치'],
  ] as const)('근거 %s를 %s로 표시한다', (source, label) => {
    render(<>{partnerMatchEvidence({ ...baseRow, partnerMatchSource: source })}</>)
    expect(screen.getByText(label)).toBeTruthy()
  })

  it('입금자명 규칙 원본명을 tooltip으로 제공한다', () => {
    render(
      <>{partnerMatchEvidence({
        ...baseRow,
        partnerMatchSource: 'DEPOSITOR_MAPPING',
        appliedMappingRawName: '삼한상사',
      })}</>,
    )
    expect(screen.getByTitle("입금자명 '삼한상사' 규칙 적용")).toBeTruthy()
  })

  it('미매칭 근거가 null이면 배지를 렌더링하지 않는다', () => {
    const { container } = render(<>{partnerMatchEvidence({ ...baseRow, partnerMatchSource: null })}</>)
    expect(container.innerHTML).toBe('')
  })
})

describe('BankTransactionPage 열 계층화 (#897)', () => {
  it('상세 disclosure는 좁은 상세 셀이 아니라 표 밖 전폭 패널에 연결된다', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([{
      ...baseRow,
      externalRef: 'wide-detail-test',
      counterpartyAccount: '국민 123-456',
      cashReceiptSlipNo: '2026/07/04-11',
      partnerMatchSource: 'MANUAL',
    } satisfies BankTransactionRow])

    renderPage()

    const table = await screen.findByRole('table')
    const toggle = await screen.findByTestId('bank-transaction-detail-toggle-wide-detail-test')
    fireEvent.click(toggle)

    const panel = await screen.findByTestId('bank-transaction-detail-wide-detail-test')
    expect(table.contains(panel)).toBe(false)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(panel.textContent).toContain('국민 123-456')
    expect(panel.textContent).toContain('2026/07/04-11')
  })

  it('열 집합 상수는 화면 순서를 직접 표현하고 목록 필터의 뒤늦은 no-op가 아니다', () => {
    expect(BANK_TRANSACTION_LIST_COLUMN_KEYS).toEqual([
      'depositReceiptSelection',
      'transactedAt',
      'description',
      'matchedPartnerCode',
      'depositAmount',
      'withdrawalAmount',
      'balanceAfter',
      'source',
      'matchStatus',
      'detail',
    ])
  })

  it('목록은 핵심 열만 노출하고 상세 disclosure에서 감춘 원본 값을 실제로 확인한다', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([{
      ...baseRow,
      txnType: 'DEPOSIT',
      amount: '123000',
      balanceAfter: '456000',
      description: '입금 원문 적요',
      counterpartyName: '원문 거래처',
      counterpartyAccount: '국민 123-456',
      bankAccountLabel: '국민 운영계좌',
      source: 'CODEF_BANK',
      cardName: null,
      approvalId: null,
      loanName: null,
      partnerMatchSource: 'MANUAL',
      appliedMappingRawName: null,
    } satisfies BankTransactionRow])

    renderPage()

    const table = await screen.findByRole('table')
    await screen.findByText('입금 원문 적요')
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual([
      '선택',
      '거래일',
      '적요',
      '거래처',
      '입금',
      '출금',
      '잔액',
      '소스',
      '매칭상태',
      '상세',
    ])
    expect(within(table).queryByRole('columnheader', { name: '계좌/카드/대출' })).toBeNull()
    expect(within(table).queryByRole('columnheader', { name: '거래후잔액' })).toBeNull()

    const detailToggle = within(table).getByTestId('bank-transaction-detail-toggle-evidence-test')
    fireEvent.click(detailToggle)
    const details = screen.getByTestId('bank-transaction-detail-evidence-test')
    expect(details.textContent).toContain('국민 운영계좌')
    expect(details.textContent).toContain('국민 123-456')
    expect(details.textContent).toContain('계좌')
  })

  it('핵심 입금/출금 열과 매칭 조작 버튼은 좁은 화면에서도 DOM에 남는다', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([{
      ...baseRow,
      matchedPartnerCode: 'P-0001',
      matchedPartnerName: '테스트 거래처',
      partnerMatchSource: 'MANUAL',
    } satisfies BankTransactionRow])

    renderPage()

    const clearButton = await screen.findByRole('button', { name: '이 거래만 해제' })
    expect(clearButton).toBeTruthy()
    expect(clearButton.hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('columnheader', { name: '입금' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '출금' })).toBeTruthy()
  })

  it('소스·매칭상태 열은 기존 탭별 조건부 표시 규칙을 유지한다', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([baseRow])

    renderPage()

    let table = await screen.findByRole('table')
    expect(within(table).getByRole('columnheader', { name: '소스' })).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: '매칭상태' })).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: '계좌' }))
    table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).queryByRole('columnheader', { name: '소스' })).toBeNull())
    expect(within(table).getByRole('columnheader', { name: '매칭상태' })).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: '전체' }))
    fireEvent.click(screen.getByRole('button', { name: '미반영', exact: true }))
    table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).queryByRole('columnheader', { name: '매칭상태' })).toBeNull())
    expect(within(table).getByRole('columnheader', { name: '소스' })).toBeTruthy()
  })
})
