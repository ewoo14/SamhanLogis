import { describe, expect, it } from 'vitest'
import type {
  AccountStatementAccountSection,
  AccountStatementTotal,
} from '../api/accounting'
import {
  accountStatementTotalItems,
  bizNoDigits,
  buildAccountStatementRows,
  fmtAmount,
  isNegativeAmount,
  partnerLabel,
} from './accountStatementPageModel'

function sectionWithDuplicatePartnerNames(): AccountStatementAccountSection {
  return {
    accountCode: '1089',
    accountName: '외상매출금',
    category: 'ASSET',
    categoryDisplayName: '자산',
    balanceDirection: 'DEBIT',
    balanceDirectionDisplayName: '차변잔액',
    lines: [
      {
        accountCode: '1089',
        accountName: '외상매출금',
        partnerCode: '',
        bizNo: '',
        partnerName: '(미조회)',
        openingBalance: '0',
        increase: '1000.00',
        decrease: '0',
        debitTotal: '1000.00',
        creditTotal: '0',
        balance: '1000.00',
      },
      {
        accountCode: '1089',
        accountName: '외상매출금',
        partnerCode: '',
        bizNo: '',
        partnerName: '(미조회)',
        openingBalance: '0',
        increase: '2000.00',
        decrease: '0',
        debitTotal: '2000.00',
        creditTotal: '0',
        balance: '2000.00',
      },
    ],
    subtotal: {
      openingBalance: '0',
      increase: '3000.00',
      decrease: '0',
      debitTotal: '3000.00',
      creditTotal: '0',
      balance: '3000.00',
    },
  }
}

describe('accountStatementPageModel', () => {
  it('금액 표시와 음수 판정을 분리한다', () => {
    expect(fmtAmount('0.00')).toBe('—')
    expect(fmtAmount('1234567.00')).toBe('1,234,567')
    expect(fmtAmount('-2500.00')).toBe('-2,500')
    expect(isNegativeAmount('-1.00')).toBe(true)
    expect(isNegativeAmount('0.00')).toBe(false)
  })

  it('채권/채무 합계를 단일 잔액으로 합산하지 않고 방향별로 표시한다', () => {
    const total: AccountStatementTotal = {
      receivableTotal: {
        openingBalance: '0',
        increase: '15000.00',
        decrease: '3000.00',
        debitTotal: '15000.00',
        creditTotal: '3000.00',
        balance: '12000.00',
      },
      payableTotal: {
        openingBalance: '0',
        increase: '8000.00',
        decrease: '2000.00',
        debitTotal: '2000.00',
        creditTotal: '8000.00',
        balance: '6000.00',
      },
    }

    expect(accountStatementTotalItems(total)).toEqual([
      { label: '채권 합계', value: '12000.00', direction: 'DEBIT' },
      { label: '채무 합계', value: '6000.00', direction: 'CREDIT' },
    ])
  })

  it('단일 방향 조회에서는 존재하는 방향 합계만 반환한다', () => {
    const total: AccountStatementTotal = {
      receivableTotal: {
        openingBalance: '0',
        increase: '15000.00',
        decrease: '3000.00',
        debitTotal: '15000.00',
        creditTotal: '3000.00',
        balance: '12000.00',
      },
      payableTotal: null,
    }

    expect(accountStatementTotalItems(total)).toEqual([
      { label: '채권 합계', value: '12000.00', direction: 'DEBIT' },
    ])
  })

  it('동일 계정의 중복 거래처명 라인도 rowKey 가 충돌하지 않는다', () => {
    const rows = buildAccountStatementRows(sectionWithDuplicatePartnerNames())

    expect(rows.map((row) => row.rowKey)).toEqual(['1089:0', '1089:1'])
    expect(new Set(rows.map((row) => row.rowKey)).size).toBe(rows.length)
  })

  it('사업자번호 하이픈을 제거한 거래처코드를 반환한다', () => {
    expect(bizNoDigits({ bizNo: '123-45-67890' })).toBe('1234567890')
    expect(bizNoDigits({ bizNo: '1234567890' })).toBe('1234567890')
    expect(bizNoDigits({ bizNo: '' })).toBe('')
  })

  it('거래처명은 partnerCode를 인라인으로 붙이지 않는다', () => {
    expect(partnerLabel({ partnerName: '(주)서울에어컨' })).toBe('(주)서울에어컨')
    expect(partnerLabel({ partnerName: '(미조회)' })).toBe('(미조회)')
  })
})
