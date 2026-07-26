// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BankTransactionRow } from '../api/accounting'

const listAccountsMock = vi.fn()
vi.mock('../api/accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/accounting')>()
  return {
    ...actual,
    listAccounts: (...args: unknown[]) => listAccountsMock(...args),
  }
})

import { BankDepositReceiptModal } from './BankDepositReceiptModal'

function renderModal(rows: BankTransactionRow[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BankDepositReceiptModal open rows={rows} submitting={false} onClose={() => {}} onCreate={() => {}} />
    </QueryClientProvider>,
  )
}

const baseRow: BankTransactionRow = {
  transactedAt: '2026-07-20T09:00:00',
  txnType: 'DEPOSIT',
  amount: '100000',
  description: '입금',
  bankAccountLabel: '국민 운영계좌',
  source: 'CODEF_BANK',
  externalRef: 'dep-1',
  matchStatus: 'UNREFLECTED',
  matchedPartnerCode: 'P-0001',
  matchedPartnerName: '테스트 거래처',
}

afterEach(() => {
  cleanup()
  listAccountsMock.mockReset()
})

/**
 * [머지 전 재수렴 S3] 파괴적 확인 모달(입금보고서 확정)이 대상을 특정한다.
 *
 * <p>리뷰 실측: 요약바는 계좌를 보여주는데(R2) 확정 모달 자체는 "선택/합산액/거래처"
 * 3-그리드만 렌더해 계좌가 빠져 있었다 — bankDepositReceiptSelectionSummary 는 이미
 * accountLabels 를 반환하지만(BankDepositReceiptModal.model.ts) 모달이 그 값을
 * 렌더하지 않았다. 모달은 "생성 즉시 확정되며 수정할 수 없다"는 파괴적 동작이므로
 * 확정 직전 화면 자체에서 대상(계좌)을 보여줘야 한다.
 */
describe('BankDepositReceiptModal 확정 대상 특정 (머지 전 재수렴 S3)', () => {
  it('선택 거래의 계좌가 확정 모달 자체 안에 표시된다(계좌 2종 — 외 N개 형식)', async () => {
    listAccountsMock.mockResolvedValue([])
    renderModal([
      { ...baseRow, externalRef: 'dep-1', bankAccountLabel: '국민 운영계좌', amount: '100000' },
      { ...baseRow, externalRef: 'dep-2', bankAccountLabel: '신한 예비계좌', amount: '30000' },
    ])

    await screen.findByTestId('bank-deposit-receipt-confirm')
    const accountsBlock = screen.getByTestId('bank-deposit-receipt-accounts')
    expect(accountsBlock.textContent, `모달 안에 계좌가 없음: ${accountsBlock.textContent}`).toContain('국민 운영계좌')
    expect(accountsBlock.textContent).toContain('외 1개')
  })

  it('계좌가 하나뿐이면 "외 N개" 없이 그 계좌만 표시한다', async () => {
    listAccountsMock.mockResolvedValue([])
    renderModal([{ ...baseRow }])

    await screen.findByTestId('bank-deposit-receipt-confirm')
    const accountsBlock = screen.getByTestId('bank-deposit-receipt-accounts')
    expect(accountsBlock.textContent).toContain('국민 운영계좌')
    expect(accountsBlock.textContent).not.toMatch(/외 \d+개/)
  })
})

/**
 * [#929 재수렴 T3] BankTransactionPage 일괄바(#929 재수렴 S5)와 동일 계약 —
 * formatCashReceiptAmount 는 0/null 을 '—' 로 반환하는데 이 모달의 합산액(:135)이
 * 그 뒤에 무조건 '원'을 붙여 '—원'이 됐다. rows=[] (선택 0건)에서 재현한다.
 */
describe('BankDepositReceiptModal 합산액 placeholder (#929 재수렴 T3)', () => {
  it('선택 행이 0건이면 합산액이 —원이 아니라 단위 없는 —로 표시된다', async () => {
    listAccountsMock.mockResolvedValue([])
    renderModal([])

    const amountLabel = await screen.findByText('합산액')
    const amountValue = amountLabel.nextElementSibling as HTMLElement
    expect(amountValue, '합산액 값 엘리먼트를 찾을 수 없음').toBeTruthy()
    expect(amountValue.textContent, `합산액에 '—원' 잔존: ${amountValue.textContent}`).not.toBe('—원')
    expect(amountValue.textContent).toBe('—')
  })
})
