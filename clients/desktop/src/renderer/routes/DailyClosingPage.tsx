import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Badge, Card, Spinner } from '@samhan/design-system'
import { getDailyClosingRows, type DailyClosingSourceRow } from '../api/closingApi'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '../hooks/usePageTitle'

type PostedTab = 'RESULT' | 'PRE_ISSUED'

export const DAILY_CLOSING_HEADERS = [
  'DC', '일자', '번호', '창고명', '품목명', '수량', '단가(VAT포함)',
  '공급가액', '부가세', '합계', '거래처명', '거래처코드', '출고가',
  '할인율', '총계', '확인', '회계반영일자',
] as const

const MERGE_COLS = new Set(['DC', '일자', '번호', '창고명', '거래처명', '거래처코드', '회계반영일자'])
const DISCOUNT_COLORS: Record<string, string> = {
  'dc-45': '#fecaca',
  'dc-46': '#fed7aa',
  'dc-47': '#fef08a',
  'dc-48': '#d9f99d',
  'dc-49': '#bfdbfe',
}

const TAB_LABEL: Record<PostedTab, string> = {
  RESULT: '결과',
  PRE_ISSUED: '선발행',
}

const inputStyle = {
  height: 34,
  padding: '0 10px',
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  color: 'var(--ink-primary)',
  background: 'var(--surface-card)',
} as const

const tableStyle = {
  width: '100%',
  minWidth: 1680,
  borderCollapse: 'collapse' as const,
  tableLayout: 'fixed' as const,
  fontSize: 12,
}

const cellStyle = {
  padding: '8px 6px',
  border: '1px solid var(--line-default)',
  verticalAlign: 'middle' as const,
  overflowWrap: 'anywhere' as const,
}

/** GAS 원문과 같은 숫자 표시: Math.round(Number(n) || 0).toLocaleString(). */
export function formatLegacyNumber(value: string | number | null | undefined): string {
  return Math.round(Number(value) || 0).toLocaleString()
}

function formatDateTime(value: string | null): string {
  if (!value) return ''
  return value.replace('T', ' ').slice(0, 16)
}

function discountRatePercent(value: string | number | null | undefined): number {
  return Math.round(Number(value) || 0)
}

function discountClass(rate: number): string {
  return rate >= 45 && rate <= 49 ? `dc-${rate}` : ''
}

function confirmationLabel(value: DailyClosingSourceRow['confirmation']): string {
  if (value === 'CONFIRMED') return '확인'
  if (value === 'MISMATCH') return '불일치'
  return '판정불가'
}

function isPosted(row: DailyClosingSourceRow): boolean {
  return Boolean(row.accountingPostedAt)
}

function sum(rows: DailyClosingSourceRow[], field: keyof DailyClosingSourceRow): string {
  return formatLegacyNumber(rows.reduce((total, row) => total + (Number(row[field]) || 0), 0))
}

function statusBadge(row: DailyClosingSourceRow) {
  const variant = row.confirmation === 'CONFIRMED'
    ? 'success'
    : row.confirmation === 'MISMATCH'
      ? 'danger'
      : 'neutral'
  return (
    <span style={{ display: 'grid', gap: 3, justifyItems: 'center' }}>
      <Badge variant={variant}>{confirmationLabel(row.confirmation)}</Badge>
      {row.confirmationReason ? (
        <span style={{ color: 'var(--ink-secondary)', fontSize: 11 }}>{row.confirmationReason}</span>
      ) : null}
    </span>
  )
}

export function DailyClosingPage() {
  usePageTitle('일마감')
  const [slipDate, setSlipDate] = useState('2026-08-14')
  const [tab, setTab] = useState<PostedTab>('RESULT')
  const [expandedSeqNo, setExpandedSeqNo] = useState<number | null>(null)

  const rowsQuery = useQuery({
    queryKey: ['daily-closing-source-rows', slipDate],
    queryFn: () => getDailyClosingRows(slipDate),
  })

  const rows = rowsQuery.data ?? []
  const visibleRows = useMemo(
    () => rows.filter((row) => tab === 'RESULT' ? isPosted(row) : !isPosted(row)),
    [rows, tab],
  )

  const mergeInfo = useMemo(() => visibleRows.map((row, index) => {
    const key = `${row.slipDate}_${row.seqNo}`
    const previous = visibleRows[index - 1]
    const previousKey = index > 0 && previous ? `${previous.slipDate}_${previous.seqNo}` : null
    if (key === previousKey) return { isStart: false, span: 0 }
    let span = 1
    while (index + span < visibleRows.length) {
      const next = visibleRows[index + span]!
      if (`${next.slipDate}_${next.seqNo}` !== key) break
      span += 1
    }
    return { isStart: true, span }
  }), [visibleRows])

  const setTabAndCollapse = (next: PostedTab) => {
    setTab(next)
    setExpandedSeqNo(null)
  }

  return (
    <div data-testid="daily-closing-page">
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>일마감</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--ink-secondary)', fontSize: 13 }}>
              출고일 기준 원본 전표를 회계반영일자로 구분합니다.
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            대상일
            <input
              type="date"
              value={slipDate}
              onChange={(event) => { setSlipDate(event.target.value); setExpandedSeqNo(null) }}
              data-testid="daily-closing-filter-date"
              style={inputStyle}
            />
          </label>
        </div>
        <div role="tablist" aria-label="회계반영일자 구분" style={{ display: 'flex', gap: 6, marginTop: 16 }}>
          {(Object.keys(TAB_LABEL) as PostedTab[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTabAndCollapse(key)}
              data-testid={`daily-closing-tab-${key.toLowerCase()}`}
              style={{
                ...inputStyle,
                cursor: 'pointer',
                fontWeight: tab === key ? 700 : 400,
                background: tab === key ? 'var(--surface-selected)' : 'var(--surface-card)',
              }}
            >
              {TAB_LABEL[key]} ({rows.filter((row) => key === 'RESULT' ? isPosted(row) : !isPosted(row)).length})
            </button>
          ))}
        </div>
      </Card>

      <Card>
        {rowsQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 180 }}><Spinner size="lg" label="일마감 조회 중" /></div>
        ) : rowsQuery.isError ? (
          <div role="alert" className="error-banner">일마감 원본행을 불러오지 못했습니다.</div>
        ) : (
          <div data-testid="daily-closing-table" style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <colgroup>{DAILY_CLOSING_HEADERS.map((header) => <col key={header} />)}</colgroup>
              <thead>
                <tr data-testid="daily-closing-columns">
                  {DAILY_CLOSING_HEADERS.map((header) => (
                    <th key={header} scope="col" style={{ ...cellStyle, background: 'var(--surface-subtle)', fontWeight: 700 }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => {
                  const expanded = expandedSeqNo === row.seqNo
                  const { isStart, span } = mergeInfo[index]!
                  const mergeCell = (content: ReactNode, column: string, style: CSSProperties = cellStyle) => (
                    MERGE_COLS.has(column) && !isStart ? null : (
                      <td rowSpan={MERGE_COLS.has(column) ? span : undefined} style={style}>{content}</td>
                    )
                  )
                  return (
                    <Fragment key={`${row.slipDate}-${row.seqNo}-${index}`}>
                      <tr key={`${row.slipDate}-${row.seqNo}-${index}`}>
                        {mergeCell(row.dcCondition || '', 'DC')}
                        {mergeCell(row.slipDate, '일자')}
                        {mergeCell(formatLegacyNumber(row.seqNo), '번호', { ...cellStyle, textAlign: 'right' })}
                        {mergeCell(row.warehouseName || '', '창고명')}
                        <td style={cellStyle}>{row.productName}</td>
                        <td style={{ ...cellStyle, textAlign: 'right' }}>{formatLegacyNumber(row.quantity)}</td>
                        <td style={{ ...cellStyle, textAlign: 'right' }}>{formatLegacyNumber(row.unitPriceWithVat)}</td>
                        <td style={{ ...cellStyle, textAlign: 'right' }}>{formatLegacyNumber(row.supplyAmount)}</td>
                        <td style={{ ...cellStyle, textAlign: 'right' }}>{formatLegacyNumber(row.vatAmount)}</td>
                        <td style={{ ...cellStyle, textAlign: 'right' }}>{formatLegacyNumber(row.total)}</td>
                        {mergeCell(row.partnerName || '', '거래처명')}
                        {mergeCell(row.partnerCode || '', '거래처코드')}
                        <td style={{ ...cellStyle, textAlign: 'right' }}>{formatLegacyNumber(row.productPrice)}</td>
                        {(() => {
                          const rate = discountRatePercent(row.discountRate)
                          const className = discountClass(rate)
                          return <td className={className} style={{ ...cellStyle, textAlign: 'right', background: DISCOUNT_COLORS[className] }}>{rate}%</td>
                        })()}
                        <td style={{ ...cellStyle, textAlign: 'right' }}>{formatLegacyNumber(row.grandTotal)}</td>
                        <td style={{ ...cellStyle, textAlign: 'center' }}>{statusBadge(row)}</td>
                        {mergeCell(formatDateTime(row.accountingPostedAt), '회계반영일자')}
                      </tr>
                      {expanded ? (
                        <tr key={`${row.slipDate}-${row.seqNo}-expanded`} data-testid={`daily-closing-expanded-${row.seqNo}`}>
                          <td colSpan={17} style={{ ...cellStyle, background: 'var(--surface-subtle)' }}>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                              <span><strong>모델</strong> {row.modelName || '0'}</span>
                              <span><strong>카테고리</strong> {row.categoryKey || '0'}</span>
                              <span><strong>기준 납품가</strong> {formatLegacyNumber(row.deliveryPrice)}</span>
                              <span><strong>기대율</strong> {formatLegacyNumber(row.expectedRate)}%</span>
                              <span><strong>DC액</strong> {formatLegacyNumber(row.dcAmount)}</span>
                              <span><strong>확인 사유</strong> {row.confirmationReason || '0'}</span>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      <tr key={`${row.slipDate}-${row.seqNo}-action`}>
                        <td colSpan={17} style={{ padding: '3px 6px', border: 0, textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => setExpandedSeqNo(expanded ? null : row.seqNo)}
                            aria-label={`${expanded ? '상세 접기' : '상세 펼치기'} ${row.seqNo}`}
                            style={{ border: 0, background: 'transparent', color: 'var(--ink-link)', cursor: 'pointer', fontSize: 12 }}
                          >
                            {expanded ? '상세 접기' : '상세 펼치기'}
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
                {visibleRows.length === 0 ? (
                  <tr><td colSpan={17} style={{ ...cellStyle, textAlign: 'center', padding: 24 }}>해당 탭의 원본행이 없습니다.</td></tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={5} style={{ ...cellStyle, textAlign: 'right' }}>소계</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{sum(visibleRows, 'quantity')}</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{sum(visibleRows, 'unitPriceWithVat')}</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{sum(visibleRows, 'supplyAmount')}</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{sum(visibleRows, 'vatAmount')}</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{sum(visibleRows, 'total')}</th>
                  <th colSpan={2} style={cellStyle} />
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{sum(visibleRows, 'productPrice')}</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{sum(visibleRows, 'discountRate')}</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{sum(visibleRows, 'grandTotal')}</th>
                  <th style={cellStyle} />
                  <th style={cellStyle} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
