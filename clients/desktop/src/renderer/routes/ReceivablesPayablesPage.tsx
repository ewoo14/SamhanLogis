import { useState } from 'react'
import type React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Input, Select, Spinner } from '@samhan/design-system'
import {
  getReceivablesPayables,
  type ReceivablesPayablesDirection,
  type ReceivablesPayablesLine,
  type ReceivablesPayablesResponse,
} from '../api/accounting'
import { PartnerLookupErrorBanner } from '../components/common/PartnerLookupErrorBanner'
import { usePageTitle } from '../hooks/usePageTitle'

const DIRECTION_LABEL: Record<ReceivablesPayablesDirection, string> = {
  RECEIVABLE: '채권',
  PAYABLE: '채무',
  ALL: '전체',
}

function prevMonthEnd(): string {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  d.setDate(0)
  return formatLocalDate(d)
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function amountNumber(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function formatKrw(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  const n = amountNumber(raw)
  if (n === 0) return '—'
  const abs = Math.abs(Math.round(n)).toLocaleString('ko-KR')
  return n < 0 ? `-${abs}` : abs
}

function formatRate(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  const n = Number(raw)
  if (!Number.isFinite(n) || n === 0) return '—'
  return `${n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`
}

function amountStyle(raw: string | number | null | undefined): React.CSSProperties {
  return {
    color: amountNumber(raw) < 0 ? 'var(--state-danger)' : undefined,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
  }
}

function sortedLines(lines: ReceivablesPayablesLine[]): ReceivablesPayablesLine[] {
  return [...lines].sort((a, b) => {
    const byAbsNet = Math.abs(amountNumber(b.netBalance)) - Math.abs(amountNumber(a.netBalance))
    if (byAbsNet !== 0) return byAbsNet
    return a.partnerName.localeCompare(b.partnerName, 'ko-KR')
  })
}

function downloadCsv(data: ReceivablesPayablesResponse): void {
  const header = [
    '거래처코드',
    '거래처명',
    '채권잔액',
    '채무잔액',
    '순잔액',
    '당월',
    '1개월',
    '2개월',
    '3개월+',
    '여신한도',
    '여신소진율',
    '받을어음보유',
    '받을어음만기임박',
    '수금계획예정',
    '수금계획연체',
  ].join(',')
  const rows = data.lines.map((row) => [
    row.bizNo,
    row.partnerName,
    row.receivableBalance,
    row.payableBalance,
    row.netBalance,
    row.agingBuckets.currentMonth,
    row.agingBuckets.oneMonthElapsed,
    row.agingBuckets.twoMonthsElapsed,
    row.agingBuckets.threeMonthsOver,
    row.creditLimit ?? '',
    row.creditUsageRate ?? '',
    row.notesHeldAmount,
    row.notesMaturingSoonAmount,
    row.collectionPlanPlannedAmount,
    row.collectionPlanOverdueAmount,
  ].join(','))
  const blob = new Blob(['\uFEFF' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `receivables-payables-${data.direction}-${data.asOfDate}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ReceivablesPayablesPage() {
  const [asOfDate, setAsOfDate] = useState(prevMonthEnd())
  const [direction, setDirection] = useState<ReceivablesPayablesDirection>('ALL')
  const [queryAsOfDate, setQueryAsOfDate] = useState(prevMonthEnd())
  const [queryDirection, setQueryDirection] = useState<ReceivablesPayablesDirection>('ALL')

  usePageTitle('채권채무 현황', `${queryAsOfDate} · ${DIRECTION_LABEL[queryDirection]}`)

  const query = useQuery({
    queryKey: ['accounting', 'reports', 'receivables-payables', queryAsOfDate, queryDirection],
    queryFn: () => getReceivablesPayables(queryAsOfDate, queryDirection),
  })

  const data = query.data
  const lines = data ? sortedLines(data.lines) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>채권채무 현황</h3>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-neutral-500)' }}>
            기준일 잔액 · 월별 aging · 여신/어음/수금계획
          </div>
        </div>
        {query.isFetching ? <Spinner size="sm" /> : null}
      </div>

      <Card style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            기준일
            <Input type="date" value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            방향
            <Select
              value={direction}
              onChange={(event) => setDirection(event.target.value as ReceivablesPayablesDirection)}
            >
              <option value="ALL">전체</option>
              <option value="RECEIVABLE">채권</option>
              <option value="PAYABLE">채무</option>
            </Select>
          </label>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setQueryAsOfDate(asOfDate)
              setQueryDirection(direction)
            }}
            disabled={query.isFetching}
          >
            조회
          </Button>
          <Button size="sm" variant="ghost" onClick={() => data && downloadCsv(data)} disabled={!data}>
            CSV
          </Button>
        </div>
      </Card>

      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 220 }}>
          <Spinner size="lg" label="채권채무 현황 불러오는 중" />
        </div>
      ) : query.isError ? (
        <PartnerLookupErrorBanner
          error={query.error}
          onRetry={() => query.refetch()}
          subject="채권채무 현황"
        />
      ) : data ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))',
              gap: 10,
            }}
          >
            <SummaryCell label="채권 합계" value={data.receivableTotal} />
            <SummaryCell label="채무 합계" value={data.payableTotal} />
            <SummaryCell label="순잔액" value={data.netTotal} />
            <SummaryCell label="거래처 수" value={`${data.partnerCount}개`} text />
          </div>

          <Card style={{ padding: 16 }}>
            <div style={{ overflowX: 'auto' }}>
              <table
                data-testid="accounting-receivables-payables-table"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: 1280,
                  fontSize: 13,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-neutral-900)', textAlign: 'left' }}>
                    <Th>거래처코드</Th>
                    <Th>거래처명</Th>
                    <Th align="right">채권잔액</Th>
                    <Th align="right">채무잔액</Th>
                    <Th align="right">순잔액</Th>
                    <Th align="right">당월</Th>
                    <Th align="right">1개월</Th>
                    <Th align="right">2개월</Th>
                    <Th align="right">3개월+</Th>
                    <Th align="right">여신한도</Th>
                    <Th align="right">소진율</Th>
                    <Th align="right">받을어음</Th>
                    <Th align="right">만기임박</Th>
                    <Th align="right">수금계획</Th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((row, index) => (
                    <tr
                      key={`${row.partnerCode}-${row.bizNo}`}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        background: index % 2 === 0 ? 'transparent' : 'var(--color-bg-subtle)',
                      }}
                    >
                      <Td>{row.bizNo || '—'}</Td>
                      <Td strong>{row.partnerName}</Td>
                      <AmountTd value={row.receivableBalance} />
                      <AmountTd value={row.payableBalance} />
                      <AmountTd value={row.netBalance} />
                      <AmountTd value={row.agingBuckets.currentMonth} />
                      <AmountTd value={row.agingBuckets.oneMonthElapsed} />
                      <AmountTd value={row.agingBuckets.twoMonthsElapsed} />
                      <AmountTd value={row.agingBuckets.threeMonthsOver} />
                      <AmountTd value={row.creditLimit} />
                      <Td align="right">{formatRate(row.creditUsageRate)}</Td>
                      <AmountTd value={row.notesHeldAmount} />
                      <AmountTd value={row.notesMaturingSoonAmount} />
                      <AmountTd value={row.collectionPlanTotalAmount} />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="report-grand-total-row" style={{ borderTop: '2px solid var(--color-neutral-900)' }}>
                    <Td colSpan={2} strong>합계</Td>
                    <AmountTd value={data.receivableTotal} strong />
                    <AmountTd value={data.payableTotal} strong />
                    <AmountTd value={data.netTotal} strong />
                    <Td colSpan={9} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div style={{ marginTop: 10, textAlign: 'right', fontSize: 12, color: 'var(--color-neutral-400)' }}>
              보고서 생성: {new Date(data.generatedAt).toLocaleString('ko-KR')}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  )
}

function SummaryCell({ label, value, text = false }: { label: string; value: string | number; text?: boolean }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        background: 'var(--color-bg-subtle)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, textAlign: 'right', ...amountStyle(text ? 0 : value) }}>
        {text ? value : formatKrw(value)}
      </div>
    </div>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ padding: '7px 8px', textAlign: align, whiteSpace: 'nowrap' }}>{children}</th>
}

function Td({
  children,
  align = 'left',
  strong = false,
  colSpan,
}: {
  children?: React.ReactNode
  align?: 'left' | 'right'
  strong?: boolean
  colSpan?: number
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: '7px 8px',
        textAlign: align,
        whiteSpace: 'nowrap',
        fontWeight: strong ? 700 : 400,
      }}
    >
      {children}
    </td>
  )
}

function AmountTd({ value, strong = false }: { value: string | number | null | undefined; strong?: boolean }) {
  return (
    <td style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap', ...amountStyle(value), fontWeight: strong ? 700 : 600 }}>
      {formatKrw(value)}
    </td>
  )
}
