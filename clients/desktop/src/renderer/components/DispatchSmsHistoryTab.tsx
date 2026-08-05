import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataGrid, Input, Select, type DataGridColumn } from '@samhan/design-system'
import {
  getDispatchSmsHistoryDetail,
  listDispatchSmsHistory,
  type DispatchSmsProgramType,
  type DispatchSmsSaveHistoryDetailResponse,
  type DispatchSmsSaveHistoryListRow,
  type DispatchSmsSaveMode,
} from '../api/dispatchSmsSaveHistoryApi'
import { maskCreatedBy } from '../utils/maskCreatedBy'

interface DispatchSmsHistoryTabProps {
  programType: DispatchSmsProgramType
  testIdPrefix: string
  isSaving?: boolean
  onRestore: (detail: DispatchSmsSaveHistoryDetailResponse) => void
}

type HistoryGridRow = DispatchSmsSaveHistoryListRow & { __index: number }
type HistoryQuery = {
  from: string
  to: string
  mode: DispatchSmsSaveMode | 'ALL'
}

export function dispatchSmsHistoryListQueryKey(
  programType?: DispatchSmsProgramType,
  query?: HistoryQuery,
) {
  return [
    'dispatch-sms-history-list',
    ...(programType ? [programType] : []),
    ...(query ? [query] : []),
  ] as const
}

/** 배차문자 저장내역 목록 탭. */
export function DispatchSmsHistoryTab({
  programType,
  testIdPrefix,
  isSaving = false,
  onRestore,
}: DispatchSmsHistoryTabProps) {
  const queryClient = useQueryClient()
  const today = useMemo(todayIso, [])
  const [from, setFrom] = useState(today.slice(0, 8) + '01')
  const [to, setTo] = useState(today)
  const [mode, setMode] = useState<DispatchSmsSaveMode | 'ALL'>('MANUAL_NAMED')
  const [query, setQuery] = useState({ from, to, mode })
  const [error, setError] = useState<string | null>(null)

  const historyQueryKey = dispatchSmsHistoryListQueryKey(programType, query)
  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: () => listDispatchSmsHistory({ programType, ...query }),
  })

  const handleRestore = useCallback(async (id: string) => {
    try {
      setError(null)
      const detail = await getDispatchSmsHistoryDetail(id)
      onRestore(detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장내역 복원에 실패했습니다.')
    }
  }, [onRestore])

  const rows: HistoryGridRow[] = (historyQuery.data?.content ?? []).map((row, index) => ({
    ...row,
    __index: index,
  }))

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
          onChange={(e) => setMode(e.target.value as DispatchSmsSaveMode | 'ALL')}
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
          onClick={() => {
            setQuery({ from, to, mode })
            void queryClient.invalidateQueries({ queryKey: dispatchSmsHistoryListQueryKey(programType) })
          }}
          loading={historyQuery.isFetching || isSaving}
          data-testid={`${testIdPrefix}-query`}
        >
          조회
        </Button>
      </div>

      {error ? <div role="alert" style={errorStyle}>{error}</div> : null}

      <DataGrid
        columns={columns(testIdPrefix)}
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

function columns(testIdPrefix: string): DataGridColumn<HistoryGridRow>[] {
  return [
    {
      key: 'createdAt',
      label: '작성시각',
      filter: false,
      render: (row) => (
        <span data-testid={`${testIdPrefix}-row-${row.__index}-created-at`}>
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'createdBy',
      label: '작성자',
      filter: false,
      render: (row) => maskCreatedBy(row.createdBy),
    },
    {
      key: 'topic',
      label: '저장주제',
      filter: false,
      render: (row) => row.topic,
    },
    {
      key: 'mode',
      label: '구분',
      filter: false,
      render: (row) => modeLabel(row.saveMode),
    },
    {
      key: 'rowCount',
      label: '건수',
      align: 'right',
      filter: false,
      render: (row) => (row.rowCount ?? 0).toLocaleString('ko-KR'),
    },
  ]
}

function modeLabel(mode: DispatchSmsSaveMode): string {
  if (mode === 'AUTO_LATEST') return '자동'
  return '명시'
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
