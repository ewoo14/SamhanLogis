import type {
  BankDepositReceiptRequest,
  BankTransactionNaturalKey,
  BankTransactionRow,
} from '../api/accounting'
import {
  CASH_RECEIPT_DEFAULT_CREDIT_ACCOUNT_CODE,
  CASH_RECEIPT_DEFAULT_DEBIT_ACCOUNT_CODE,
} from './CashReceiptFormPage.model'
import { localTodayIso } from './localDate'

export const MAX_BANK_DEPOSIT_RECEIPT_SELECTION = 100

export interface BankDepositReceiptFormState {
  transactionDate: string
  debitAccountCode: string
  creditAccountCode: string
  memo: string
}

export interface BankDepositReceiptSelectionSummary {
  count: number
  totalAmount: number
  partnerName: string
  partnerCode: string
  mixedPartner: boolean
  /**
   * [머지 전 재수렴 R2] 선택된 거래가 속한 계좌/카드/대출 라벨(중복 제거, 등장 순서).
   * 목록 열에서 계좌가 상세로 옮겨간 뒤 "어느 계좌의 입금을 체크했는지 모른 채 전표를
   * 생성한다"는 업무 차단을 선택 요약에서도 닫는다. 계좌가 섞여도 차단하지 않는다 —
   * 업무 규칙 변경이 아니라 가시성 보강이다.
   */
  accountLabels: string[]
  blockingMessage?: string
}

function amountOf(row: BankTransactionRow): number {
  const amount = Number(row.amount)
  return Number.isFinite(amount) ? amount : 0
}

function partnerIdentity(row: BankTransactionRow): string {
  return String(row.matchedPartnerCode || row.matchedPartnerName || '').trim()
}

function accountIdentity(row: BankTransactionRow): string {
  return String(row.bankAccountLabel || '').trim()
}

export function bankTransactionRowKey(row: BankTransactionRow): string {
  return `${row.source}|${row.bankAccountLabel}|${row.transactedAt}|${row.amount}|${row.externalRef}`
}

export function bankTransactionNaturalKeyFromRow(row: BankTransactionRow): BankTransactionNaturalKey {
  return {
    bankAccountLabel: row.bankAccountLabel,
    transactedAt: row.transactedAt,
    amount: amountOf(row),
    externalRef: row.externalRef,
  }
}

export function isBankDepositReceiptSelectable(row: BankTransactionRow): boolean {
  return row.matchStatus === 'UNREFLECTED'
    && row.txnType === 'DEPOSIT'
    && row.source !== 'CODEF_LOAN'
    && Boolean(String(row.matchedPartnerName ?? '').trim())
    && amountOf(row) > 0
}

export function bankDepositReceiptSelectableRows(
  rows: BankTransactionRow[],
): BankTransactionRow[] {
  return rows.filter(isBankDepositReceiptSelectable)
}

export function bankDepositReceiptPrunedSelectedRowKeys(
  rows: BankTransactionRow[],
  selectedRowKeys: ReadonlySet<string>,
): Set<string> {
  const selectableKeys = new Set(bankDepositReceiptSelectableRows(rows).map(bankTransactionRowKey))
  return new Set(Array.from(selectedRowKeys).filter((key) => selectableKeys.has(key)))
}

export function bankDepositReceiptSelectedRows(
  rows: BankTransactionRow[],
  selectedRowKeys: ReadonlySet<string>,
): BankTransactionRow[] {
  return rows.filter((row) => (
    selectedRowKeys.has(bankTransactionRowKey(row))
    && isBankDepositReceiptSelectable(row)
  ))
}

export function bankDepositReceiptSelectionDisabledReason(row: BankTransactionRow): string {
  if (row.matchStatus !== 'UNREFLECTED') return '이미 반영된 거래입니다.'
  if (row.txnType === 'WITHDRAWAL') return '출금 거래는 입금보고서로 생성할 수 없습니다.'
  if (row.source === 'CODEF_LOAN') return '대출 거래는 입금보고서 대상이 아닙니다.'
  if (!String(row.matchedPartnerName ?? '').trim()) return '미매칭 거래처는 먼저 매칭해야 합니다.'
  if (amountOf(row) <= 0) return '0원 이하 거래는 입금보고서로 생성할 수 없습니다.'
  return ''
}

export function bankDepositReceiptSelectionLimitExceeded(rows: BankTransactionRow[]): boolean {
  return rows.length > MAX_BANK_DEPOSIT_RECEIPT_SELECTION
}

/**
 * [머지 전 재수렴 S3] 계좌 라벨 목록 → "라벨 외 N개" 요약 문자열.
 *
 * <p>일괄 처리 바(BankTransactionPage)와 확정 모달(BankDepositReceiptModal)이 같은
 * 문구를 공유해, 한쪽만 계좌를 보여주고 다른 쪽(확정 모달)은 빠뜨리는 드리프트를
 * 막는다 — 계좌 혼재도 값을 그대로 보여줄 뿐 차단하지 않는다(가시성 보강, 업무 규칙
 * 변경 아님).
 */
export function bankDepositReceiptAccountsLabel(accountLabels: readonly string[]): string {
  if (accountLabels.length === 0) return ''
  const [first, ...rest] = accountLabels
  return rest.length > 0 ? `${first} 외 ${rest.length}개` : String(first)
}

export function bankDepositReceiptSelectionSummary(
  rows: BankTransactionRow[],
): BankDepositReceiptSelectionSummary {
  const count = rows.length
  const totalAmount = rows.reduce((sum, row) => sum + amountOf(row), 0)
  const identities = new Set(rows.map(partnerIdentity).filter(Boolean))
  const first = rows[0]
  const mixedPartner = identities.size > 1
  const accountLabels = Array.from(new Set(rows.map(accountIdentity).filter(Boolean)))
  return {
    count,
    totalAmount,
    partnerName: first?.matchedPartnerName ?? '',
    partnerCode: first?.matchedPartnerCode ?? '',
    mixedPartner,
    accountLabels,
    blockingMessage: mixedPartner ? '동일 거래처 거래만 한 번에 입금보고서로 생성할 수 있습니다.' : undefined,
  }
}

export function bankDepositReceiptDefaultFormState(
  rows: BankTransactionRow[],
): BankDepositReceiptFormState {
  const latest = [...rows]
    .map((row) => row.transactedAt)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0]
  return {
    transactionDate: latest ? latest.slice(0, 10) : localTodayIso(),
    debitAccountCode: CASH_RECEIPT_DEFAULT_DEBIT_ACCOUNT_CODE,
    creditAccountCode: CASH_RECEIPT_DEFAULT_CREDIT_ACCOUNT_CODE,
    memo: '',
  }
}

export function buildBankDepositReceiptRequest(
  rows: BankTransactionRow[],
  form: BankDepositReceiptFormState,
): BankDepositReceiptRequest {
  const memo = form.memo.trim()
  const selectableRows = bankDepositReceiptSelectableRows(rows)
  return {
    transactions: selectableRows.map(bankTransactionNaturalKeyFromRow),
    transactionDate: form.transactionDate,
    memo: memo || undefined,
    debitAccountCode: form.debitAccountCode || undefined,
    creditAccountCode: form.creditAccountCode || undefined,
  }
}
