import { useEffect, useMemo, useState } from 'react'
import type { QueryKey } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  Input,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import { usePageTitle } from '../../hooks/usePageTitle'
import {
  DISPATCH_TASK_STATUS_LABEL,
  type DispatchTaskStatus,
  type DispatchTaskSummaryResponse,
} from '../../api/dispatchTask'
import { offsetIsoSeoul, todayIsoSeoul } from '../../api/dispatchBoard'
import {
  dispatchTaskQueryKey,
  useDispatchTaskQuery,
  useDispatchTasksQuery,
} from './hooks/useDispatchTask'
import { DispatchTaskDetailModal } from './components/DispatchTaskDetailModal'
import { DispatchTaskRealtimeClient } from '../../realtime/DispatchTaskRealtimeClient'
import { useCollectionRealtime } from '../../realtime/useCollectionRealtime'

const PAGE_SIZE = 20

// "완료배차 이력" = 완료(DISPATCHED) 전용.
// FAILED(배차 불가)·CANCELLED(배차 취소)는 추후 "배차현황" 화면으로 분리한다.
const HISTORY_STATUS_OPTIONS: DispatchTaskStatus[] = ['DISPATCHED']

function statusBadgeVariant(status: DispatchTaskStatus): 'success' | 'danger' | 'neutral' {
  if (status === 'DISPATCHED') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'neutral'
}

export function DispatchHistoryPage() {
  usePageTitle('배차현황')

  const today = useMemo(() => todayIsoSeoul(), [])
  const [from, setFrom] = useState(() => offsetIsoSeoul(today, -30))
  const [to, setTo] = useState(today)
  const [status, setStatus] = useState<DispatchTaskStatus>('DISPATCHED')
  const [page, setPage] = useState(0)
  const [selectedDetailKey, setSelectedDetailKey] = useState<string | null>(null)
  const [detailErrorVisible, setDetailErrorVisible] = useState(false)

  const listQuery = useDispatchTasksQuery({
    from,
    to,
    status: [status],
    page,
    size: PAGE_SIZE,
  })
  // 열린 상세 모달도 board SSE 변경 시 stale 로 남지 않게 함께 무효화한다.
  const realtimeQueryKeys = useMemo<QueryKey[]>(
    () => [
      ...(selectedDetailKey ? [dispatchTaskQueryKey(selectedDetailKey)] : []),
      ['dispatchTasks'],
    ],
    [selectedDetailKey],
  )
  useCollectionRealtime(DispatchTaskRealtimeClient, 'board', realtimeQueryKeys)
  const detailQuery = useDispatchTaskQuery(selectedDetailKey)

  const columns: DataTableColumn<DispatchTaskSummaryResponse>[] = useMemo(
    () => [
      {
        key: 'taskCode',
        header: '배차 작업번호',
        width: '160px',
        mobilePriority: 'primary',
        render: (row) => (
          <span data-testid={`dispatch-history-row-${row.taskCode}`}>
            {row.taskCode}
          </span>
        ),
      },
      {
        key: 'dispatchDate',
        header: '배차일',
        width: '120px',
        mobilePriority: 'secondary',
      },
      {
        key: 'status',
        header: '상태',
        width: '150px',
        mobilePriority: 'secondary',
        render: (row) => (
          <Badge variant={statusBadgeVariant(row.status)}>
            {DISPATCH_TASK_STATUS_LABEL[row.status]}
          </Badge>
        ),
      },
      {
        key: 'vehicleGroupCount',
        header: '차량',
        width: '80px',
        mobilePriority: 'hidden',
        render: (row) => `${row.vehicleGroupCount}대`,
      },
      {
        key: 'slipCount',
        header: '전표',
        width: '80px',
        mobilePriority: 'hidden',
        render: (row) => `${row.slipCount}건`,
      },
      {
        key: 'partnerNames',
        header: '거래처',
        mobilePriority: 'secondary',
        render: (row) => row.partnerNames || '-',
      },
      {
        key: 'driverCount',
        header: '기사',
        width: '80px',
        mobilePriority: 'hidden',
        render: (row) => `${row.driverCount}명`,
      },
    ],
    [],
  )

  const rows = listQuery.data?.content ?? []
  const totalElements = listQuery.data?.totalElements ?? 0
  const totalPages = listQuery.data?.totalPages ?? 1
  const isFirst = listQuery.data?.first ?? true
  const isLast = listQuery.data?.last ?? true

  const handleApplyFilters = () => {
    setPage(0)
    void listQuery.refetch()
  }

  const handleRowClick = (row: DispatchTaskSummaryResponse) => {
    setDetailErrorVisible(false)
    setSelectedDetailKey(row.id)
  }

  useEffect(() => {
    if (!selectedDetailKey || !detailQuery.isError) return
    setDetailErrorVisible(true)
    setSelectedDetailKey(null)
  }, [detailQuery.isError, selectedDetailKey])

  return (
    <div
      data-testid="dispatch-history-page"
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <section
        aria-label="배차현황 필터"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          시작일
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.currentTarget.value)}
            data-testid="dispatch-history-from"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          종료일
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.currentTarget.value)}
            data-testid="dispatch-history-to"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          상태
          <select
            value={status}
            onChange={(e) => setStatus(e.currentTarget.value as DispatchTaskStatus)}
            data-testid="dispatch-history-status"
            style={{
              height: 36,
              minWidth: 160,
              border: '1px solid var(--color-neutral-300)',
              borderRadius: 6,
              padding: '0 10px',
              background: 'var(--color-neutral-0)',
            }}
          >
            {HISTORY_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {DISPATCH_TASK_STATUS_LABEL[option]}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="primary"
          onClick={handleApplyFilters}
          data-testid="dispatch-history-filter-submit"
        >
          조회
        </Button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-neutral-500)' }}>
          총 {totalElements}건
        </span>
      </section>

      {listQuery.isError ? (
        <div
          role="alert"
          style={{
            padding: 12,
            border: '1px solid var(--color-danger-200)',
            borderRadius: 6,
            background: 'var(--color-danger-50)',
            color: 'var(--color-danger-700)',
            fontSize: 13,
          }}
        >
          배차현황을 불러오지 못했습니다.
        </div>
      ) : null}

      {detailErrorVisible ? (
        <div
          role="alert"
          data-testid="dispatch-history-detail-error"
          style={{
            padding: 12,
            border: '1px solid var(--color-danger-200)',
            borderRadius: 6,
            background: 'var(--color-danger-50)',
            color: 'var(--color-danger-700)',
            fontSize: 13,
          }}
        >
          배차현황 상세를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : null}

      <div data-testid="dispatch-history-table">
        <DataTable
          columns={columns}
          rows={rows}
          loading={listQuery.isLoading}
          rowKey={(row) => row.taskCode}
          emptyMessage="조회 조건에 맞는 배차현황이 없습니다."
          onRowClick={handleRowClick}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
          fontSize: 13,
        }}
      >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isFirst}
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          data-testid="dispatch-history-prev"
        >
          이전
        </Button>
        <span>
          {page + 1} / {Math.max(totalPages, 1)}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isLast}
          onClick={() => setPage((current) => current + 1)}
          data-testid="dispatch-history-next"
        >
          다음
        </Button>
      </div>

      {selectedDetailKey && detailQuery.isLoading ? (
        <div
          data-testid="dispatch-history-detail-loading"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(255,255,255,0.5)',
            zIndex: 999,
          }}
        >
          <Spinner size="md" />
        </div>
      ) : null}

      {selectedDetailKey && detailQuery.data ? (
        // Round C Option A — 배차현황 상세에서 수정/취소 요청·재배차 시작 허용.
        // readOnly 는 코멘트 조회 전용 유지, task 액션은 allowTaskActions 로 개방
        // (UPDATE 권한 가드는 모달 내부 canAccess('dispatch.board','update') 가 적용).
        <DispatchTaskDetailModal
          task={detailQuery.data}
          readOnly
          allowTaskActions
          onClose={() => setSelectedDetailKey(null)}
        />
      ) : null}
    </div>
  )
}
