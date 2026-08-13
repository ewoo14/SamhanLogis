import type { SlipType } from '../../api/slip'

export interface StockLedgerDateRange {
  start: string
  end: string
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 수불부 기본 기간 — 조회일 기준 최근 3개월. */
export function recentThreeMonthsRange(today = new Date()): StockLedgerDateRange {
  const start = new Date(today.getFullYear(), today.getMonth() - 3, 1)
  const lastDayOfStartMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  start.setDate(Math.min(today.getDate(), lastDayOfStartMonth))
  return { start: toIsoDate(start), end: toIsoDate(today) }
}

/** 수불부에서 전표번호를 눌렀을 때 사용하는 전표별 opaque 화면 경로. */
export function stockLedgerSlipDestination(slipType: SlipType, slipNo: string): string {
  const pathname = slipType === 'OUTBOUND' ? '/sales/by-number' : '/purchases/by-number'
  return `${pathname}?slipNo=${encodeURIComponent(slipNo)}`
}
