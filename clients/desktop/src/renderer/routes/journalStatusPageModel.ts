import type {
  JournalStatusGroup,
  JournalStatusGroupBy,
  JournalStatusLine,
  JournalStatusSourceType,
  JournalStatusSummary,
} from '../api/accounting'

export interface JournalStatusTableRow extends JournalStatusLine {
  rowKind: 'line' | 'subtotal'
  rowKey: string
}

export const JOURNAL_STATUS_SOURCE_OPTIONS: Array<{
  value: JournalStatusSourceType
  label: string
}> = [
  { value: 'SLIP', label: '전표' },
  { value: 'MANUAL', label: '수기' },
  { value: 'CLOSING', label: '결산' },
  { value: 'CASH_DISBURSEMENT', label: '지출결의서' },
  { value: 'CASH_RECEIPT', label: '현금입금' },
]

export const JOURNAL_STATUS_GROUP_OPTIONS: Array<{
  value: JournalStatusGroupBy
  label: string
}> = [
  { value: 'DATE', label: '일자별' },
  { value: 'SOURCE_TYPE', label: '출처별' },
  { value: 'PARTNER', label: '거래처별' },
]

/** KRW 정수/소수 string → "1,234" 형식. 0은 em-dash, 음수는 "-1,234" 유지. */
export function fmtJournalStatusKrw(raw: string | number): string {
  const n = typeof raw === 'string' ? Number(raw) : raw
  if (!Number.isFinite(n)) return String(raw)
  if (n === 0) return '—'
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 0 })
}

/** 음수 금액 여부. */
export function isNegativeJournalStatusAmount(raw: string | number): boolean {
  const n = typeof raw === 'string' ? Number(raw) : raw
  return Number.isFinite(n) && n < 0
}

/** 전표현황 그룹에 표시용 소계 행을 붙인다. */
export function buildJournalStatusRows(group: JournalStatusGroup): JournalStatusTableRow[] {
  const rows: JournalStatusTableRow[] = group.lines.map((line, index) => ({
    ...line,
    rowKind: 'line',
    rowKey: `${group.groupKey}:${line.journalNo}:${index}`,
  }))
  rows.push({
    journalNo: '소계',
    journalDate: '',
    sourceType: 'MANUAL',
    sourceTypeDisplayName: '',
    bizNo: '',
    partnerName: '',
    description: `${group.subtotal.journalCount}건`,
    totalDebit: group.subtotal.totalDebit,
    totalCredit: group.subtotal.totalCredit,
    rowKind: 'subtotal',
    rowKey: `${group.groupKey}:subtotal`,
  })
  return rows
}

/** 전표현황 거래처코드 표시값. BE 가 다중 거래처 사업자번호를 숫자화 후 " / " 로 join 한다. */
export function displayJournalStatusBizNo(row: Pick<JournalStatusTableRow, 'rowKind' | 'bizNo'>): string {
  if (row.rowKind === 'subtotal') return '—'
  return row.bizNo || '—'
}

/** 소계/총합 요약 라벨. */
export function summaryLabel(summary: JournalStatusSummary): string {
  return `${summary.journalCount}건 · 차변 ${fmtJournalStatusKrw(summary.totalDebit)} · 대변 ${fmtJournalStatusKrw(summary.totalCredit)}`
}
