import type { BadgeVariant } from '@samhan/design-system'
import type { ListCashReceiptsOptions } from '../api/accounting'

export interface CashReceiptFilterState {
  partnerName: string
  slipNo: string
  kind: string
  from: string
  to: string
}

export const CASH_RECEIPT_KIND_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'DEPOSIT_REPORT', label: '입금보고서' },
  { value: 'MANUAL_RECEIPT', label: '수기 입금' },
  { value: 'BANK_LINKED', label: '통장연계' },
] as const

export const CASH_RECEIPT_KIND_LABEL: Record<string, string> = {
  DEPOSIT_REPORT: '입금보고서',
  MANUAL_RECEIPT: '수기 입금',
  BANK_LINKED: '통장연계',
}

export const KIND_TONE: Record<string, BadgeVariant> = {
  DEPOSIT_REPORT: 'brand',
  MANUAL_RECEIPT: 'neutral',
  BANK_LINKED: 'success',
}

export function cashReceiptKindLabel(kind: string): string {
  return CASH_RECEIPT_KIND_LABEL[kind] ?? kind
}

export function formatCashReceiptAmount(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  const n = Number(raw)
  if (!Number.isFinite(n)) return String(raw)
  if (n === 0) return '—'
  const abs = Math.abs(Math.round(n)).toLocaleString('ko-KR')
  return n < 0 ? `-${abs}` : abs
}

export function formatCashReceiptDate(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(0, 10)
}

export function truncatePartnerName(value: string | null | undefined): string {
  if (!value) return '—'
  return value.length > 18 ? `${value.slice(0, 18)}...` : value
}

export function listCashReceiptQueryOptions(
  filters: CashReceiptFilterState,
  page: number,
  size: number,
): ListCashReceiptsOptions {
  const options: ListCashReceiptsOptions = { page, size }
  const partnerName = filters.partnerName.trim()
  const slipNo = filters.slipNo.trim()
  if (partnerName) options.partnerName = partnerName
  if (slipNo) options.slipNo = slipNo
  if (filters.kind) options.kind = filters.kind as ListCashReceiptsOptions['kind']
  if (filters.from) options.from = filters.from
  if (filters.to) options.to = filters.to
  return options
}
