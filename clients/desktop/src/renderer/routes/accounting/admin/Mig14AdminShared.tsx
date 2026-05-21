import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { Badge, Button, DataTable, type DataTableColumn } from '@samhan/design-system'
import type { PageResponse } from '../../../api/client'
import { fmtKrw } from '../../../utils/currencyUtils'

export const PAGE_SIZE = 50

export const pageRootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

export const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  gap: 12,
  flexWrap: 'wrap',
}

export const filterBarStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  padding: 12,
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  background: 'var(--surface-card)',
}

export const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--line-default)',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
  fontSize: 13,
  minWidth: 132,
}

export const tableShellStyle: CSSProperties = {
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  background: 'var(--surface-card)',
  overflow: 'hidden',
}

export function FilterField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-secondary)' }}>
      {label}
      {children}
    </label>
  )
}

export function MoneyText({ value, strong = false }: { value?: string | number | null; strong?: boolean }) {
  return (
    <span
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontWeight: strong ? 'var(--font-weight-semibold)' : undefined,
      }}
    >
      {fmtKrw(value === null || value === undefined ? value : String(value))}
    </span>
  )
}

export function TimestampText({ value }: { value?: string | null }) {
  if (!value) return <span>—</span>
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return <span>{value}</span>
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`}
    </span>
  )
}

export function PlainText({ value }: { value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return <span style={{ color: '#9CA3AF' }}>—</span>
  return <span>{value}</span>
}

export function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: 'neutral' | 'success' | 'danger' | 'warning'
}) {
  return <Badge variant={tone}>{label}</Badge>
}

export function PaginationControls<T>({
  page,
  data,
  onPageChange,
}: {
  page: number
  data?: PageResponse<T>
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.max(1, data?.totalPages ?? 1)
  const totalElements = data?.totalElements ?? 0
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        borderTop: '1px solid var(--line-default)',
        fontSize: 13,
        color: 'var(--ink-secondary)',
      }}
    >
      <span>총 {totalElements.toLocaleString('ko-KR')}건 · {PAGE_SIZE}/페이지</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 0}
          onClick={() => onPageChange(Math.max(0, page - 1))}
        >
          이전
        </Button>
        <span style={{ minWidth: 64, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
          {page + 1} / {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
        >
          다음
        </Button>
      </div>
    </div>
  )
}

export function PagedTable<T>({
  columns,
  rows,
  loading,
  rowKey,
  emptyMessage,
  page,
  pageData,
  onPageChange,
  onRowClick,
  testId,
}: {
  columns: DataTableColumn<T>[]
  rows: T[]
  loading: boolean
  rowKey: (row: T) => string
  emptyMessage: string
  page: number
  pageData?: PageResponse<T>
  onPageChange: (page: number) => void
  onRowClick?: (row: T) => void
  testId: string
}) {
  const stableColumns = useMemo(() => columns, [columns])
  return (
    <div style={tableShellStyle} data-testid={testId}>
      <DataTable
        columns={stableColumns}
        rows={rows}
        loading={loading}
        rowKey={rowKey}
        onRowClick={onRowClick}
        emptyMessage={emptyMessage}
      />
      <PaginationControls page={page} data={pageData} onPageChange={onPageChange} />
    </div>
  )
}

export const CASH_KIND_LABEL: Record<string, string> = {
  EXPENSE_VOUCHER: '지출결의서',
  MANUAL_DISBURSEMENT: '수기 지출',
}

export const CASH_RECEIPT_KIND_LABEL: Record<string, string> = {
  DEPOSIT_REPORT: '입금보고서',
  MANUAL_RECEIPT: '수기 입금',
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  COMPLETED: '완료',
  IN_PROGRESS: '진행',
  CANCELED: '취소',
  PENDING: '대기',
}

export const LEDGER_TRANSFORM_STATUS_LABEL: Record<string, string> = {
  PENDING: '대기',
  TRANSFORMED: '변환완료',
  REJECTED: '제외',
}

export function orderStatusTone(status: string): 'neutral' | 'success' | 'danger' | 'warning' {
  if (status === 'COMPLETED') return 'success'
  if (status === 'CANCELED') return 'neutral'
  if (status === 'IN_PROGRESS') return 'warning'
  return 'neutral'
}

export function diffTone(diff: string | null | undefined): 'neutral' | 'success' | 'danger' {
  const n = Number(diff)
  if (!Number.isFinite(n)) return 'neutral'
  return n === 0 ? 'success' : 'danger'
}
