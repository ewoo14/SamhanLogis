import type { EstimateSummary } from '../api/estimateApi'
import type { PartnerOrderStatus, PartnerOrderSummary } from '../api/sales'
import { safeActorName } from '@samhan/design-system'

export type EstimateMenuSource = 'estimate' | 'web-quote-snapshot'
export type OrderMenuSource = 'order' | 'web-partner-order-draft'
export type SeparatedListSource = EstimateMenuSource | OrderMenuSource

export interface SourceSeparatedListRow {
  id: string
  source: SeparatedListSource
  sourceLabel: '종합견적서' | '주문서'
  storageLabel: '데스크톱' | '웹'
  documentNo: string
  partnerName: string | null
  partnerCode: string | null
  amount: string
  owner: string | null
  writtenAt: string | null
  sortAt: string | null
  status: string
  isDeleted: boolean
  restoreAvailable?: boolean
  navigationPath: string | null
}

type EstimateListSource = Pick<
  EstimateSummary,
  'id' | 'estimateNo' | 'estimateDate' | 'status' | 'partnerName' | 'totalAmount' | 'requesterName' | 'isDeleted' | 'restoreAvailable'
>
type OrderListSource = Pick<
  PartnerOrderSummary,
  'orderNumber' | 'partnerCode' | 'partnerName' | 'submittedAt' | 'createdAt' | 'status' | 'totalAmount' | 'isDeleted'
>

export interface WebQuoteSnapshotListSource {
  snapshotKey: string
  documentLabel: string
  custName: string | null
  created: string
  totalAmount: string | number | null
}

export interface WebPartnerOrderDraftListSource {
  draftKey: string
  documentLabel: string
  partnerCode: string | null
  partnerName?: string | null
  createdAt: string
  totalAmount: string | number | null
}

const estimateStatusLabel: Record<EstimateSummary['status'], string> = {
  QUOTE_DRAFT: '작성중',
  QUOTE_SENT: '발송완료',
  QUOTE_ACCEPTED: '수주완료',
  QUOTE_REJECTED: '거절',
  QUOTE_CONVERTED: '전표변환완료',
}

const orderStatusLabel: Record<PartnerOrderStatus, string> = {
  DRAFT: '진행중',
  ON_HOLD: '보류',
  CONFIRMING: '확인중',
  CONFIRMED: '완료',
  CANCELED: '취소',
  CONVERTED: '전환완료',
}

const asTimestamp = (value: string | null): number => {
  if (!value) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

const sortRows = (rows: SourceSeparatedListRow[]): SourceSeparatedListRow[] => [...rows].sort((a, b) => {
  const dateOrder = asTimestamp(b.sortAt) - asTimestamp(a.sortAt)
  return dateOrder !== 0 ? dateOrder : a.id.localeCompare(b.id)
})

export function mergeEstimateRows(
  estimates: EstimateListSource[],
  webQuoteSnapshots: WebQuoteSnapshotListSource[] = [],
): SourceSeparatedListRow[] {
  return sortRows([
    ...estimates.map((row): SourceSeparatedListRow => ({
      id: `estimate:${row.id}`,
      source: 'estimate',
      sourceLabel: '종합견적서',
      storageLabel: '데스크톱',
      documentNo: row.estimateNo,
      partnerName: row.partnerName ?? null,
      partnerCode: null,
      amount: String(row.totalAmount),
      owner: safeActorName(row.requesterName),
      writtenAt: row.estimateDate,
      sortAt: row.estimateDate,
      status: estimateStatusLabel[row.status],
      isDeleted: row.isDeleted === true,
      restoreAvailable: row.restoreAvailable,
      navigationPath: row.isDeleted ? null : `/sales/estimates/${encodeURIComponent(row.id)}`,
    })),
    ...webQuoteSnapshots.map((row): SourceSeparatedListRow => ({
      id: `web-quote:${row.snapshotKey}`,
      source: 'web-quote-snapshot',
      sourceLabel: '종합견적서',
      storageLabel: '웹',
      documentNo: row.documentLabel,
      partnerName: row.custName ?? null,
      partnerCode: null,
      amount: String(row.totalAmount ?? '0'),
      owner: null,
      writtenAt: row.created,
      sortAt: row.created,
      status: '저장됨',
      isDeleted: false,
      navigationPath: `/sales/estimates/web-snapshots/${encodeURIComponent(row.snapshotKey)}`,
    })),
  ])
}

export function mergeOrderRows(
  orders: OrderListSource[],
  webPartnerOrderDrafts: WebPartnerOrderDraftListSource[] = [],
): SourceSeparatedListRow[] {
  return sortRows([
    ...orders.map((row): SourceSeparatedListRow => ({
      id: `order:${row.orderNumber}`,
      source: 'order',
      sourceLabel: '주문서',
      storageLabel: '데스크톱',
      documentNo: row.orderNumber,
      partnerName: row.partnerName ?? null,
      partnerCode: row.partnerCode || null,
      amount: String(row.totalAmount),
      owner: null,
      writtenAt: row.createdAt ?? null,
      sortAt: row.submittedAt ?? row.createdAt ?? null,
      status: orderStatusLabel[row.status],
      isDeleted: row.isDeleted === true,
      navigationPath: row.isDeleted ? null : `/sales/partner-orders/${encodeURIComponent(row.orderNumber)}`,
    })),
    ...webPartnerOrderDrafts.map((row): SourceSeparatedListRow => ({
      id: `web-order-draft:${row.draftKey}`,
      source: 'web-partner-order-draft',
      sourceLabel: '주문서',
      storageLabel: '웹',
      documentNo: row.documentLabel,
      partnerName: row.partnerName ?? null,
      partnerCode: row.partnerCode || null,
      amount: String(row.totalAmount ?? '0'),
      owner: null,
      writtenAt: row.createdAt,
      sortAt: row.createdAt,
      status: '저장됨',
      isDeleted: false,
      navigationPath: `/sales/partner-orders/web-drafts/${encodeURIComponent(row.draftKey)}`,
    })),
  ])
}

export function paginateSeparatedRows(
  rows: SourceSeparatedListRow[],
  page: number,
  size: number,
): { content: SourceSeparatedListRow[]; totalElements: number; totalPages: number } {
  const totalElements = rows.length
  return {
    content: rows.slice(page * size, (page + 1) * size),
    totalElements,
    totalPages: Math.max(1, Math.ceil(totalElements / size)),
  }
}

export function filterSeparatedRows(
  rows: SourceSeparatedListRow[],
  partnerKeyword: string,
): SourceSeparatedListRow[] {
  const keyword = partnerKeyword.trim().toLocaleLowerCase()
  if (!keyword) return rows
  return rows.filter((row) => [row.partnerName, row.partnerCode, row.documentNo]
    .some((value) => value?.toLocaleLowerCase().includes(keyword)))
}
