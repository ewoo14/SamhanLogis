import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, DataGrid, Input, Select, type DataGridColumn } from '@samhan/design-system'
import {
  getSlipCleanupHistoryDetail,
  listSlipCleanupHistory,
  type SlipCleanupProgramType,
  type SlipCleanupSaveHistoryDetailResponse,
  type SlipCleanupSaveHistoryListRow,
  type SlipCleanupSaveMode,
} from '../api/slipCleanupSaveHistoryApi'
import { maskCreatedBy } from '../utils/maskCreatedBy'

interface SlipCleanupHistoryTabProps {
  programType: SlipCleanupProgramType
  testIdPrefix: string
  isSaving?: boolean
  onRestore: (detail: SlipCleanupSaveHistoryDetailResponse) => void
}

type HistoryGridRow = SlipCleanupSaveHistoryListRow & { __index: number }

/** 전표정리 저장내역 목록 탭. */
export function SlipCleanupHistoryTab({
  programType,
  testIdPrefix,
  isSaving = false,
  onRestore,
}: SlipCleanupHistoryTabProps) {
  const today = useMemo(todayIso, [])
  const [from, setFrom] = useState(today.slice(0, 8) + '01')
  const [to, setTo] = useState(today)
  const [mode, setMode] = useState<SlipCleanupSaveMode | 'ALL'>('MANUAL_NAMED')
  const [query, setQuery] = useState({ from, to, mode })
  const [error, setError] = useState<string | null>(null)

  const historyQuery = useQuery({
    queryKey: ['slip-cleanup-history-list', programType, query],
    queryFn: () => listSlipCleanupHistory({ programType, ...query }),
  })

  const handleRestore = useCallback(async (id: string) => {
    try {
      setError(null)
      const detail = await getSlipCleanupHistoryDetail(id)
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
          onChange={(e) => setMode(e.target.value as SlipCleanupSaveMode | 'ALL')}
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
      render: (row) => row.saveMode === 'AUTO_LATEST' ? '자동' : '명시',
    },
    {
      key: 'rowCount',
      label: '전표 수',
      align: 'right',
      filter: false,
      render: (row) => row.rowCount.toLocaleString('ko-KR'),
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
const errorStyle: CSSProperties = {
  padding: 8,
  border: '1px solid var(--state-danger)',
  borderRadius: 4,
  background: 'var(--state-danger-bg)',
  color: 'var(--state-danger)',
  fontSize: 12,
}
