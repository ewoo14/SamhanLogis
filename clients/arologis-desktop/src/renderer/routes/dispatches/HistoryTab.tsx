import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, DataGrid, Input, Select, type DataGridColumn } from '@samhan/design-system'
import {
  getDispatchHistoryDetail,
  listDispatchHistory,
  type DispatchProgramType,
  type DispatchSaveHistoryDetailResponse,
  type DispatchSaveHistoryListRow,
  type DispatchSaveMode,
} from '../../api/dispatchSaveHistoryApi'
import { maskCreatedBy } from '../../utils/maskCreatedBy'

export interface HistoryColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  render: (row: DispatchSaveHistoryListRow) => ReactNode
}

interface HistoryTabProps {
  programType: DispatchProgramType
  testIdPrefix: string
  api?: HistoryApiAdapter
  isSaving?: boolean
  columns?: HistoryColumn[]
  renderSummary?: (row: DispatchSaveHistoryListRow) => ReactNode
  rowCountLabel?: string
  onRestore: (detail: DispatchSaveHistoryDetailResponse) => void
}

interface HistoryApiAdapter {
  list: typeof listDispatchHistory
  detail: typeof getDispatchHistoryDetail
}

type HistoryGridRow = DispatchSaveHistoryListRow & { __index: number }

const defaultApi: HistoryApiAdapter = {
  list: listDispatchHistory,
  detail: getDispatchHistoryDetail,
}

/** 아로로지스 배차 저장내역 목록 공통 탭. */
export function HistoryTab({
  programType,
  testIdPrefix,
  api = defaultApi,
  isSaving = false,
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
    queryFn: () => api.list({ programType, ...query }),
  })

  const handleRestore = useCallback(async (id: string) => {
    try {
      setError(null)
      const detail = await api.detail(id)
      onRestore(detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장내역 복원에 실패했습니다.')
    }
  }, [api, onRestore])

  const rows: HistoryGridRow[] = (historyQuery.data?.content ?? []).map((row, index) => ({
    ...row,
    __index: index,
  }))
  const tableColumns = columns ?? defaultColumns(rowCountLabel, renderSummary)
  const gridColumns = toGridColumns(tableColumns, testIdPrefix)

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
        <Select
          label="모드"
          value={mode}
          onChange={(e) => setMode(e.target.value as DispatchSaveMode | 'ALL')}
          selectSize="sm"
          fullWidth={false}
          data-testid={`${testIdPrefix}-mode`}
        >
          <option value="MANUAL_NAMED">명시 저장만</option>
          <option value="AUTO_LATEST">자동 저장만</option>
          <option value="ALL">전체</option>
        </Select>
        <Button
          variant="primary"
          onClick={() => setQuery({ from, to, mode })}
          loading={historyQuery.isFetching || isSaving}
          data-testid={`${testIdPrefix}-query`}
        >
          조회
        </Button>
      </div>

      {error ? <div role="alert" style={errorStyle}>{error}</div> : null}

      <DataGrid
        columns={gridColumns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={historyQuery.isFetching}
        emptyMessage="저장내역이 없습니다."
        enableMultiSelect={false}
        enableCopy={false}
        getRowTestId={(row) => `${testIdPrefix}-row-${row.__index}`}
        onRowClick={(row) => void handleRestore(row.id)}
      />
    </section>
  )
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

function toGridColumns(
  columns: HistoryColumn[],
  testIdPrefix: string,
): DataGridColumn<HistoryGridRow>[] {
  return columns.map((column) => ({
    key: column.key,
    label: column.label,
    align: column.align,
    filter: false,
    render: (row) => column.key === 'createdAt'
      ? (
          <span data-testid={`${testIdPrefix}-row-${row.__index}-created-at`}>
            {column.render(row)}
          </span>
        )
      : column.render(row),
  }))
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
const errorStyle: CSSProperties = {
  padding: 8,
  border: '1px solid var(--state-danger)',
  borderRadius: 4,
  background: 'var(--state-danger-bg)',
  color: 'var(--state-danger)',
  fontSize: 12,
}
