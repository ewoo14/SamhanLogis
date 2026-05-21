import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Card } from '@samhan/design-system'
import {
  getEcountMigOpsDashboard,
  type DailyClosingDiffMetric,
  type EcountMigOpsDashboardResponse,
  type MigOpsMetric,
  type ReimportRunMetric,
  type RejectedMetric,
  type TransformStatusMetric,
} from '../../../api/migOpsDashboardApi'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { MoneyText, PlainText, StatusBadge, pageRootStyle } from './Mig14AdminShared'

const POLLING_MS = 300_000

export function MigOpsDashboardPage() {
  usePageTitle('이카운트 마이그레이션 운영 대시보드')

  const query = useQuery({
    queryKey: ['ecount-mig-ops-dashboard'],
    queryFn: getEcountMigOpsDashboard,
    refetchInterval: POLLING_MS,
  })

  const data = query.data
  const totals = useMemo(() => summarize(data), [data])

  return (
    <div style={pageRootStyle} data-testid="mig21-ops-dashboard-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <h3 style={{ margin: 0 }}>마이그레이션 운영 대시보드</h3>
          <p style={{ margin: '6px 0 0', color: 'var(--ink-secondary)', fontSize: 13 }}>
            Prometheus 기준 5분 주기 자동 갱신
          </p>
        </div>
        <span style={{ color: 'var(--ink-secondary)', fontSize: 12 }}>
          관측시각 {formatObservedAt(data?.observedAt)}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        <MetricCard title="변환 상태" value={totals.transformed + totals.pending + totals.rejected} suffix="건">
          <StatusRows rows={data?.transformStatus ?? []} />
        </MetricCard>
        <MetricCard title="누적 imported" value={totals.imported} suffix="건">
          <SliceRows rows={data?.importedTotals ?? []} />
        </MetricCard>
        <MetricCard title="누적 rejected" value={totals.rejected} suffix="건" danger={totals.rejected > 0}>
          <RejectedRows rows={data?.rejectedTotals ?? []} />
        </MetricCard>
        <MetricCard title="Aging net" value="" suffix="">
          <div style={{ display: 'grid', gap: 8 }}>
            <InlineMetric label="순미수" value={<MoneyText value={data?.agingNet.netReceivable ?? '0'} strong />} />
            <InlineMetric label="순미지급" value={<MoneyText value={data?.agingNet.netPayable ?? '0'} strong />} />
          </div>
        </MetricCard>
        <MetricCard title="재import 이력" value={totals.reimportRuns} suffix="회">
          <ReimportRows rows={data?.reimportRuns ?? []} scannedRows={data?.reimportFilesScanned ?? []} />
        </MetricCard>
        <MetricCard title="DailyClosing 차이" value={totals.dailyDiff} suffix="건" danger={totals.dailyDiff > 0}>
          <DailyClosingRows rows={data?.dailyClosingDiffs ?? []} />
        </MetricCard>
      </div>

      {query.isError ? (
        <div className="error-banner" role="alert">
          마이그레이션 운영 지표를 불러오지 못했습니다.
        </div>
      ) : null}
    </div>
  )
}

function MetricCard({
  title,
  value,
  suffix,
  danger = false,
  children,
}: {
  title: string
  value: number | string
  suffix: string
  danger?: boolean
  children: ReactNode
}) {
  return (
    <Card padding={4} shadow="sm">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <p className="stat-label" style={{ margin: 0 }}>{title}</p>
        {danger ? <Badge variant="danger">확인필요</Badge> : <Badge variant="success">정상</Badge>}
      </div>
      {value !== '' ? (
        <p className="stat-value" style={{ marginBottom: 12 }}>
          {Number(value).toLocaleString('ko-KR')}<span style={{ fontSize: 13, marginLeft: 4 }}>{suffix}</span>
        </p>
      ) : null}
      {children}
    </Card>
  )
}

function StatusRows({ rows }: { rows: TransformStatusMetric[] }) {
  if (rows.length === 0) return <EmptyRows />
  return (
    <div style={rowsStyle}>
      {rows.map((row) => (
        <InlineMetric
          key={`${row.slice}-${row.status}`}
          label={`${row.slice} · ${row.status}`}
          value={<StatusBadge label={formatCount(row.count)} tone={statusTone(row.status)} />}
        />
      ))}
    </div>
  )
}

function SliceRows({ rows }: { rows: MigOpsMetric[] }) {
  if (rows.length === 0) return <EmptyRows />
  return (
    <div style={rowsStyle}>
      {rows.map((row) => (
        <InlineMetric key={row.slice} label={row.slice} value={formatCount(row.count)} />
      ))}
    </div>
  )
}

function RejectedRows({ rows }: { rows: RejectedMetric[] }) {
  if (rows.length === 0) return <EmptyRows />
  return (
    <div style={rowsStyle}>
      {rows.map((row) => (
        <InlineMetric key={`${row.slice}-${row.errorCode}`} label={`${row.slice} · ${row.errorCode}`} value={formatCount(row.count)} />
      ))}
    </div>
  )
}

function ReimportRows({ rows, scannedRows }: { rows: ReimportRunMetric[]; scannedRows: MigOpsMetric[] }) {
  if (rows.length === 0 && scannedRows.length === 0) return <EmptyRows />
  return (
    <div style={rowsStyle}>
      {rows.map((row) => (
        <InlineMetric key={`${row.slice}-${row.status}`} label={`${row.slice} · ${row.status}`} value={formatCount(row.count)} />
      ))}
      {scannedRows.map((row) => (
        <InlineMetric key={`${row.slice}-scanned`} label={`${row.slice} · 파일 스캔`} value={formatCount(row.count)} />
      ))}
    </div>
  )
}

function DailyClosingRows({ rows }: { rows: DailyClosingDiffMetric[] }) {
  if (rows.length === 0) return <EmptyRows />
  return (
    <div style={rowsStyle}>
      {rows.map((row) => (
        <InlineMetric key={`${row.closingKind}-${row.sourceKind}`} label={`${row.closingKind} · ${row.sourceKind}`} value={formatCount(row.diffCount)} />
      ))}
    </div>
  )
}

function InlineMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', fontSize: 13 }}>
      <span style={{ color: 'var(--ink-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <PlainText value={label} />
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function EmptyRows() {
  return <p style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: 13 }}>수집된 지표가 없습니다.</p>
}

function summarize(data?: EcountMigOpsDashboardResponse) {
  return {
    transformed: sum(data?.transformStatus.filter((row) => row.status === 'TRANSFORMED')),
    pending: sum(data?.transformStatus.filter((row) => row.status === 'PENDING')),
    rejected: sum(data?.rejectedTotals),
    imported: sum(data?.importedTotals),
    reimportRuns: sum(data?.reimportRuns),
    dailyDiff: sum(data?.dailyClosingDiffs.map((row) => ({ slice: row.closingKind, count: row.diffCount }))),
  }
}

function sum(rows?: Array<{ count: string }>): number {
  return rows?.reduce((acc, row) => acc + Number(row.count || 0), 0) ?? 0
}

function formatCount(value?: string | null): string {
  return Number(value ?? 0).toLocaleString('ko-KR')
}

function formatObservedAt(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR')
}

function statusTone(status: string): 'neutral' | 'success' | 'danger' | 'warning' {
  if (status === 'TRANSFORMED' || status === 'SUCCESS') return 'success'
  if (status === 'REJECTED' || status === 'FAIL') return 'danger'
  if (status === 'PENDING' || status === 'SKIP') return 'warning'
  return 'neutral'
}

const rowsStyle = {
  display: 'grid',
  gap: 8,
  maxHeight: 180,
  overflow: 'auto',
} satisfies CSSProperties
