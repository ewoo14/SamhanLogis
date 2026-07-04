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

/**
 * 저장된 필터 선택을 복원한다.
 *
 * 빈 목록은 전체 선택(무필터)을 의미하고, 비어있지 않으면 저장된 부분선택을 그대로 복원한다.
 * (과거 구현은 저장값이 있으면 현재 options 전체를 union 해 부분선택을 항상 전체로 팽창시키는
 * 결함이 있었다 — 저장값을 있는 그대로 복원해야 "계좌 N개만 보기"가 동작한다.)
 */
export function effectiveBankTransactionLabels(
  savedLabels: readonly string[] | null | undefined,
): string[] {
  return normalizeBankTransactionLabels(savedLabels)
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
