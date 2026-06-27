/**
 * 알림 내역 페이지 — Issue 4 Slice 2.
 *
 * /notifications 라우트. 사이드바 "알림 내역" 메뉴 → 본 페이지.
 * BE GET /api/notifications/history Pageable (page, size).
 * 채널/읽음 필터는 client-side 필터 (1차 — 향후 BE 필터 endpoint 추가 시 server-side 로 이동).
 */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { DataTable, type DataTableColumn } from '@samhan/design-system'
import {
  CHANNEL_LABEL,
  fetchHistory,
  type NotificationCenter,
  type NotificationSeverity,
} from '../api/notificationApi'
import { usePageTitle } from '../hooks/usePageTitle'

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500] as const

export function NotificationHistoryPage() {
  usePageTitle('알림 내역')

  const [page, setPage] = useState(0)
  const [size, setSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(50)
  const [channelFilter, setChannelFilter] = useState<string>('')
  const [showOnlyUnread, setShowOnlyUnread] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications', 'history', page, size],
    queryFn: () => fetchHistory(page, size),
    staleTime: 30_000,
  })

  const rows = (data?.content ?? []).filter((n) => {
    if (channelFilter && n.channel !== channelFilter) return false
    if (showOnlyUnread && n.readAt !== null) return false
    return true
  })

  const channels = Array.from(new Set((data?.content ?? []).map((n) => n.channel)))

  const columns: DataTableColumn<NotificationCenter>[] = [
    { key: 'title', header: '제목', mobilePriority: 'primary' },
    {
      key: 'createdAt',
      header: '발생 시각',
      mobilePriority: 'secondary',
      render: (n) => <span style={{ fontSize: 12 }}>{n.createdAt}</span>,
    },
    {
      key: 'channel',
      header: '채널',
      mobilePriority: 'secondary',
      render: (n) => CHANNEL_LABEL[n.channel] ?? '알 수 없는 채널',
    },
    {
      key: 'severity',
      header: '심각도',
      mobilePriority: 'secondary',
      render: (n) => <SeverityBadge severity={n.severity} />,
    },
    {
      key: 'readAt',
      header: '확인',
      mobilePriority: 'secondary',
      render: (n) =>
        n.readAt ? (
          <span style={{ color: 'var(--color-neutral-500)', fontSize: 12 }}>확인됨</span>
        ) : (
          <span style={{ color: 'var(--color-danger-500)', fontSize: 12, fontWeight: 600 }}>
            미확인
          </span>
        ),
    },
    {
      key: 'body',
      header: '본문',
      mobilePriority: 'hidden',
      render: (n) => (
        <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
          {n.body ?? ''}
        </span>
      ),
    },
  ]

  return (
    <div data-testid="notification-history-page" style={{ padding: 16 }}>
      <h2 style={{ margin: '0 0 16px 0' }}>알림 내역</h2>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <label>
          채널{' '}
          <select
            data-testid="notification-channel-filter"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
          >
            <option value="">전체</option>
            {channels.map((ch) => (
              <option key={ch} value={ch}>
                {CHANNEL_LABEL[ch] ?? '알 수 없는 채널'}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            data-testid="notification-unread-only"
            checked={showOnlyUnread}
            onChange={(e) => setShowOnlyUnread(e.target.checked)}
          />{' '}
          미확인만
        </label>
        <label>
          페이지 크기{' '}
          <select
            data-testid="notification-page-size"
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])
              setPage(0)
            }}
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <div>로딩 중...</div>
      ) : isError ? (
        <div style={{ color: 'var(--color-danger-500)' }}>알림 내역을 불러오지 못했습니다</div>
      ) : (
        <>
          <div data-testid="notification-history-table">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(n) => n.id}
              emptyMessage="조건에 맞는 알림이 없습니다"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center', alignItems: 'center' }}>
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              이전
            </button>
            <span data-testid="notification-history-page-info">
              {data?.number != null ? data.number + 1 : 1} / {data?.totalPages ?? 1} (전체 {data?.totalElements ?? 0}건)
            </span>
            <button
              type="button"
              disabled={data == null || data.number >= data.totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: NotificationSeverity }) {
  const colorMap: Record<NotificationSeverity, string> = {
    INFO: 'var(--color-neutral-400)',
    WARNING: 'var(--color-warning-500)',
    CRITICAL: 'var(--color-danger-500)',
  }
  const labelMap: Record<NotificationSeverity, string> = {
    INFO: '정보',
    WARNING: '경고',
    CRITICAL: '긴급',
  }
  return (
    <span
      style={{
        background: colorMap[severity],
        color: 'var(--color-neutral-0)',
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: 4,
      }}
    >
      {labelMap[severity]}
    </span>
  )
}
