import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Input } from '@samhan/design-system'
import {
  getDispatchHistoryDetail,
  listDispatchHistory,
  type DispatchProgramType,
  type DispatchSaveHistoryDetailResponse,
  type DispatchSaveHistoryListRow,
  type DispatchSaveMode,
} from '../../api/dispatchSaveHistoryApi'

export interface HistoryColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  render: (row: DispatchSaveHistoryListRow) => ReactNode
}

interface HistoryTabProps {
  programType: DispatchProgramType
  testIdPrefix: string
  columns?: HistoryColumn[]
  renderSummary?: (row: DispatchSaveHistoryListRow) => ReactNode
  rowCountLabel?: string
  onRestore: (detail: DispatchSaveHistoryDetailResponse) => void
}

/** 아로로지스 배차 저장내역 목록 공통 탭. */
export function HistoryTab({
  programType,
  testIdPrefix,
  columns,
  renderSummary,
  rowCountLabel = '행 수',
  onRestore,
}: HistoryTabProps) {
  const today = useMemo(todayIso, [])
  const [from, setFrom] = useState(today.slice(0, 8) + '01')
  const [to, setTo] = useState(today)
  const [mode, setMode] = useState<DispatchSaveMode | 'ALL'>('MANUAL_NAMED')
  const [query, setQuery] = useState({ from, to, mode })
  const [error, setError] = useState<string | null>(null)

  const historyQuery = useQuery({
    queryKey: ['arologis-dispatch-history-list', programType, query],
    queryFn: () => listDispatchHistory({ programType, ...query }),
  })

  const handleRestore = useCallback(async (id: string) => {
    try {
      setError(null)
      const detail = await getDispatchHistoryDetail(id)
      onRestore(detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장내역 복원에 실패했습니다.')
    }
  }, [onRestore])

  const rows = historyQuery.data?.content ?? []
  const tableColumns = columns ?? defaultColumns(rowCountLabel, renderSummary)

  return (
    <section style={rootStyle}>
      <div style={filterRowStyle}>
        <Input
          label="기간 시작"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          inputSize="sm"
          fullWidth={false}
          data-testid={`${testIdPrefix}-from`}
        />
        <Input
          label="기간 종료"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          inputSize="sm"
          fullWidth={false}
          data-testid={`${testIdPrefix}-to`}
        />
        <label style={fieldStyle}>
          <span>모드</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as DispatchSaveMode | 'ALL')}
            style={selectStyle}
            data-testid={`${testIdPrefix}-mode`}
          >
            <option value="MANUAL_NAMED">명시 저장만</option>
            <option value="AUTO_LATEST">자동 저장만</option>
            <option value="ALL">전체</option>
          </select>
        </label>
        <Button
          variant="primary"
          onClick={() => setQuery({ from, to, mode })}
          loading={historyQuery.isFetching}
          data-testid={`${testIdPrefix}-query`}
        >
          조회
        </Button>
      </div>

      {error ? <div role="alert" style={errorStyle}>{error}</div> : null}

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {tableColumns.map((column) => (
                <th
                  key={column.key}
                  style={{ ...thStyle, textAlign: column.align ?? 'left' }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={tableColumns.length} style={emptyStyle}>
                  저장내역이 없습니다.
                </td>
              </tr>
            ) : rows.map((row, index) => (
              <tr
                key={row.id}
                data-testid={`${testIdPrefix}-row-${index}`}
                onClick={() => void handleRestore(row.id)}
                style={clickableRowStyle}
              >
                {tableColumns.map((column) => (
                  <td
                    key={column.key}
                    data-testid={
                      column.key === 'createdAt'
                        ? `${testIdPrefix}-row-${index}-created-at`
                        : undefined
                    }
                    style={{ ...tdStyle, textAlign: column.align ?? 'left' }}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** UUID 형태의 createdBy 는 화면에 그대로 노출하지 않는다. */
export function maskCreatedBy(value: string | null | undefined): string {
  if (!value) return 'system'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return '사용자'
  }
  return value
}

function defaultColumns(
  rowCountLabel: string,
  renderSummary?: (row: DispatchSaveHistoryListRow) => ReactNode,
): HistoryColumn[] {
  return [
    {
      key: 'createdAt',
      label: '작성시각',
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'createdBy',
      label: '작성자',
      render: (row) => maskCreatedBy(row.createdBy),
    },
    {
      key: 'topic',
      label: '저장주제',
      render: (row) => row.topic,
    },
    {
      key: 'mode',
      label: '구분',
      render: (row) => row.saveMode === 'AUTO_LATEST' ? '자동' : '명시',
    },
    {
      key: 'summary',
      label: rowCountLabel,
      align: 'right',
      render: (row) => renderSummary?.(row) ?? row.rowCount.toLocaleString('ko-KR'),
    },
  ]
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

const rootStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 }
const filterRowStyle: CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }
const selectStyle: CSSProperties = { height: 32, padding: '0 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13 }
const errorStyle: CSSProperties = { padding: 8, border: '1px solid #FECACA', borderRadius: 4, background: '#FEF2F2', color: '#B91C1C', fontSize: 12 }
const tableWrapStyle: CSSProperties = { border: '1px solid #E5E7EB', borderRadius: 6, overflow: 'auto', background: '#FFFFFF' }
const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const thStyle: CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB', fontWeight: 600, whiteSpace: 'nowrap' }
const tdStyle: CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #F3F4F6' }
const emptyStyle: CSSProperties = { ...tdStyle, textAlign: 'center', color: '#6B7280', padding: 24 }
const clickableRowStyle: CSSProperties = { cursor: 'pointer' }
