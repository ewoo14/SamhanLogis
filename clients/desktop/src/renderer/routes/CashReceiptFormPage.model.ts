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

/**
 * 편집 hydrate 시점에 거래처 표시(partnerCode/partnerName)가 partner-service 조회 실패로
 * 공란인지 판단한다 (#831 R-3/R-5).
 *
 * 영속화된 입금보고서는 항상 거래처가 있다 — BE `resolvePartner`가 create/update 시
 * partnerCode/bizNo/partnerName 중 하나라도 없으면 422 로 막는다(CashReceiptService.java).
 * 따라서 편집 화면에 이미 저장된 건을 불러왔는데 partnerCode 와 partnerName 이 둘 다
 * 공란이면, 그 receipt 가 "원래 거래처가 없다"일 수 없고 partner-service 장애로 표시명
 * enrichment 만 실패한 것이다(#924 write/detail 공란 성사 결정). 이 판정은 폼이 그 값을
 * 그대로 되돌려 보내(하이드레이트) 저장하면 거래처 귀속이 무경고로 사라지는 것을 막는 데 쓴다.
 */
export function partnerLookupUnavailableOnHydrate(
  row: { partnerCode?: string | null; partnerName?: string | null },
): boolean {
  return !(row.partnerCode ?? '').trim() && !(row.partnerName ?? '').trim()
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
