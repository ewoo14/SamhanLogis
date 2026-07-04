import type { BankTransactionRow } from '../api/accounting'

export interface BankTransactionFilterOption {
  label: string
  source: 'registered' | 'transaction'
}

export function normalizeBankTransactionLabels(labels: readonly string[] | null | undefined): string[] {
  const normalized = new Set<string>()
  for (const label of labels ?? []) {
    const trimmed = label.trim()
    if (trimmed) normalized.add(trimmed)
  }
  return Array.from(normalized).sort((a, b) => a.localeCompare(b, 'ko-KR'))
}

export function effectiveBankTransactionLabels(
  savedLabels: readonly string[] | null | undefined,
  options: readonly BankTransactionFilterOption[],
): string[] {
  const saved = normalizeBankTransactionLabels(savedLabels)
  if (saved.length === 0) return []

  const merged = new Set(saved)
  for (const option of options) {
    const label = option.label.trim()
    if (label) merged.add(label)
  }
  return Array.from(merged)
}

export function filterButtonLabel(label: '계좌' | '카드', selectedLabels: readonly string[]): string {
  return selectedLabels.length === 0 ? `${label} 전체` : `${label} ${selectedLabels.length}개`
}

export function filterLabelsForQuery(
  selectedLabels: readonly string[],
  options: readonly BankTransactionFilterOption[],
): string[] {
  if (selectedLabels.length === 0) return []
  const allLabels = normalizeBankTransactionLabels(options.map((option) => option.label))
  if (allLabels.length > 0 && selectedLabels.length === allLabels.length) {
    const selectedSet = new Set(selectedLabels)
    if (allLabels.every((label) => selectedSet.has(label))) return []
  }
  return normalizeBankTransactionLabels(selectedLabels)
}

export function bankTransactionPartnerDisplay(row: BankTransactionRow): string {
  const name = row.matchedPartnerName?.trim()
  return name || '—'
}
