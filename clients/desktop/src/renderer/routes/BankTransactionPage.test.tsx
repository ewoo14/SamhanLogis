// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { partnerMatchEvidence } from './BankTransactionPage'
import type { BankTransactionRow } from '../api/accounting'

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
