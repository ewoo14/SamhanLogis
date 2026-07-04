import type { CashReceiptRequest, CashReceiptRow } from '../api/accounting'
import type { PartnerOption } from '@samhan/design-system'
import { localTodayIso } from './localDate'

export const CASH_RECEIPT_DEFAULT_DEBIT_ACCOUNT_CODE = '102'
export const CASH_RECEIPT_DEFAULT_CREDIT_ACCOUNT_CODE = '110'

export interface CashReceiptFormState {
  partnerCode: string
  bizNo: string
  partnerName: string
  amount: string
  transactionDate: string
  memo: string
  debitAccountCode: string
  creditAccountCode: string
}

export type CashReceiptFormErrors = Partial<Record<keyof CashReceiptFormState | 'partner', string>>

export function cashReceiptInitialFormState(
  overrides: Partial<CashReceiptFormState> = {},
): CashReceiptFormState {
  return {
    partnerCode: '',
    bizNo: '',
    partnerName: '',
    amount: '',
    transactionDate: localTodayIso(),
    memo: '',
    debitAccountCode: CASH_RECEIPT_DEFAULT_DEBIT_ACCOUNT_CODE,
    creditAccountCode: CASH_RECEIPT_DEFAULT_CREDIT_ACCOUNT_CODE,
    ...overrides,
  }
}

export function cashReceiptFormStateFromRow(row: CashReceiptRow): CashReceiptFormState {
  return cashReceiptInitialFormState({
    partnerCode: row.partnerCode ?? '',
    bizNo: row.bizNo ?? '',
    partnerName: row.partnerName ?? '',
    amount: row.amount == null ? '' : String(row.amount),
    transactionDate: row.transactionDate ?? localTodayIso(),
    memo: row.memo ?? '',
    debitAccountCode: row.debitAccountCode ?? CASH_RECEIPT_DEFAULT_DEBIT_ACCOUNT_CODE,
    creditAccountCode: row.creditAccountCode ?? CASH_RECEIPT_DEFAULT_CREDIT_ACCOUNT_CODE,
  })
}

export function partnerOptionFromFormState(state: CashReceiptFormState): PartnerOption | null {
  if (!state.partnerCode && !state.partnerName) return null
  return {
    partnerCode: state.partnerCode || state.bizNo || state.partnerName,
    name: state.partnerName,
    bizNo: state.bizNo || undefined,
  }
}

export function validateCashReceiptForm(state: CashReceiptFormState): CashReceiptFormErrors {
  const errors: CashReceiptFormErrors = {}
  if (!state.partnerCode.trim() && !state.partnerName.trim()) {
    errors.partner = '거래처를 선택하거나 거래처명을 입력하세요.'
  }
  const amount = Number(state.amount)
  if (!state.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
    errors.amount = '금액은 0보다 커야 합니다.'
  }
  if (!state.transactionDate) {
    errors.transactionDate = '거래일을 입력하세요.'
  }
  if (state.memo.length > 494) {
    errors.memo = '적요는 494자 이하로 입력하세요.'
  }
  if (!state.debitAccountCode.trim()) {
    errors.debitAccountCode = '차변 계정을 선택하세요.'
  }
  if (!state.creditAccountCode.trim()) {
    errors.creditAccountCode = '대변 계정을 선택하세요.'
  }
  return errors
}

function optionalTrim(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed || undefined
}

export function buildCashReceiptRequest(state: CashReceiptFormState): CashReceiptRequest {
  return {
    partnerCode: optionalTrim(state.partnerCode),
    bizNo: optionalTrim(state.bizNo),
    partnerName: optionalTrim(state.partnerName),
    amount: state.amount.trim(),
    transactionDate: state.transactionDate,
    memo: optionalTrim(state.memo),
    debitAccountCode: optionalTrim(state.debitAccountCode),
    creditAccountCode: optionalTrim(state.creditAccountCode),
  }
}
