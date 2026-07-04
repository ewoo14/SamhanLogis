import type {
  BankDepositReceiptRequest,
  BankTransactionNaturalKey,
  BankTransactionRow,
} from '../api/accounting'

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
  blockingMessage?: string
}

function amountOf(row: BankTransactionRow): number {
  const amount = Number(row.amount)
  return Number.isFinite(amount) ? amount : 0
}

function partnerIdentity(row: BankTransactionRow): string {
  return String(row.matchedPartnerCode || row.matchedPartnerName || '').trim()
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

export function bankDepositReceiptSelectionSummary(
  rows: BankTransactionRow[],
): BankDepositReceiptSelectionSummary {
  const count = rows.length
  const totalAmount = rows.reduce((sum, row) => sum + amountOf(row), 0)
  const identities = new Set(rows.map(partnerIdentity).filter(Boolean))
  const first = rows[0]
  const mixedPartner = identities.size > 1
  return {
    count,
    totalAmount,
    partnerName: first?.matchedPartnerName ?? '',
    partnerCode: first?.matchedPartnerCode ?? '',
    mixedPartner,
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
    debitAccountCode: '102',
    creditAccountCode: '110',
    memo: '',
  }
}

function localTodayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function buildBankDepositReceiptRequest(
  rows: BankTransactionRow[],
  form: BankDepositReceiptFormState,
): BankDepositReceiptRequest {
  const memo = form.memo.trim()
  return {
    transactions: rows.map(bankTransactionNaturalKeyFromRow),
    transactionDate: form.transactionDate,
    memo: memo || undefined,
    debitAccountCode: form.debitAccountCode || undefined,
    creditAccountCode: form.creditAccountCode || undefined,
  }
}
