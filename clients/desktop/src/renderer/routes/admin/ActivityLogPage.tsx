import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, DataTable, Input, type DataTableColumn } from '@samhan/design-system'
import {
  fetchActivityLogs,
  type ActivityLogItem,
  type ActivityLogQuery,
} from '../../api/activityLog'
import { usePageTitle } from '../../hooks/usePageTitle'
import { formatKstDateTimeInputValue } from '../../utils/formatDate'
import styles from './ActivityLogPage.module.css'

const PAGE_SIZE = 20

const PAGE_LABELS: Record<string, string> = {
  'admin.app-release': '버전 관리',
  'dev.popup-notice': '팝업공지',
  'dev.activity-log': '로그',
  'P-001': '거래처 P-001',
  '거래처 인증': '거래처 인증',
}

const ACTION_LABELS: Record<string, string> = {
  MENU_ACCESS: '메뉴 진입',
  CREATE: '등록',
  UPDATE: '수정',
  DELETE: '삭제',
  RESTORE: '복구',
  LOGIN: '로그인',
  ACCOUNT_LOGIN: '로그인',
  SLIP_CREATE: '전표 등록',
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  MENU: '메뉴',
  SLIP: '전표',
  ACCOUNT: '계정',
  DC_CONFIG: 'DC 설정',
  AUTH: '인증',
}

const SERVICE_LABELS: Record<string, string> = {
  desktop: '데스크톱',
  'dashboard-service': '대시보드',
  'logging-service': '로그',
  'dc-config-service': 'DC 설정',
  'partner-auth-service': '거래처 인증',
}

function kstInputToInstant(value: string): string | undefined {
  if (!value.trim()) return undefined
  const normalized = value.length === 16 ? `${value}:00` : value
  return `${normalized}+09:00`
}

function formatKst(value: string): string {
  return formatKstDateTimeInputValue(value).replace('T', ' ')
}

function label(map: Record<string, string>, value: string): string {
  return map[value] ?? '기타'
}

export function ActivityLogPage() {
  usePageTitle('로그')

  const now = new Date()
  const [page, setPage] = useState(0)
  const [resourceId, setResourceId] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState(formatKstDateTimeInputValue(new Date(now.getTime() - 24 * 60 * 60 * 1000)))
  const [to, setTo] = useState(formatKstDateTimeInputValue(now))
  const [q, setQ] = useState('')

  const queryParams = useMemo<ActivityLogQuery>(() => ({
    action,
    resourceType: resourceId ? 'MENU' : undefined,
    resourceId,
    q,
    fromInstant: kstInputToInstant(from),
    toInstant: kstInputToInstant(to),
    page,
    size: PAGE_SIZE,
  }), [action, from, page, q, resourceId, to])

  const query = useQuery({
    queryKey: ['activity-logs', queryParams],
    queryFn: () => fetchActivityLogs(queryParams),
  })

  const rows = query.data?.items ?? []
  const totalPages = query.data?.totalPages ?? 0
  const totalElements = query.data?.totalElements ?? 0
  const errorMessage = query.isError
    ? '활동 로그를 불러오지 못했습니다(권한 또는 서버 오류).'
    : null

  const columns = useMemo<DataTableColumn<ActivityLogItem>[]>(() => [
    {
      key: 'occurredAt',
      header: '시각(KST)',
      width: '150px',
      mobilePriority: 'primary',
      render: (row) => formatKst(row.occurredAt),
    },
    {
      key: 'resourceId',
      header: '메뉴',
      width: '150px',
      mobilePriority: 'primary',
      render: (row) => <span className={styles.codePill}>{label(PAGE_LABELS, row.resourceId)}</span>,
    },
    {
      key: 'user',
      header: '사용자',
      width: '110px',
      mobilePriority: 'primary',
      render: (row) => row.user,
    },
    {
      key: 'action',
      header: '작업',
      width: '110px',
      mobilePriority: 'secondary',
      render: (row) => (
        <Badge variant={row.action === 'MENU_ACCESS' ? 'brand' : 'neutral'}>
          {label(ACTION_LABELS, row.action)}
        </Badge>
      ),
    },
    {
      key: 'resourceType',
      header: '대상',
      width: '150px',
      mobilePriority: 'secondary',
      render: (row) => (
        <span className={styles.targetText}>
          {label(RESOURCE_TYPE_LABELS, row.resourceType)} · {label(PAGE_LABELS, row.resourceId)}
        </span>
      ),
    },
    {
      key: 'description',
      header: '내용',
      mobilePriority: 'hidden',
      render: (row) => <span className={styles.description}>{row.description}</span>,
    },
    {
      key: 'serviceName',
      header: '서비스',
      width: '120px',
      mobilePriority: 'hidden',
      render: (row) => label(SERVICE_LABELS, row.serviceName),
    },
  ], [])

  const resetPage = (fn: () => void) => {
    fn()
    setPage(0)
  }

  return (
    <div className={styles.activityPage} data-testid="activity-log-page">
      <div className={styles.toolbar} data-testid="activity-log-filters">
        <label className={styles.field}>
          메뉴
          <select
            value={resourceId}
            onChange={(event) => resetPage(() => setResourceId(event.target.value))}
            data-testid="activity-log-menu-filter"
          >
            <option value="">전체</option>
            <option value="admin.app-release">버전 관리</option>
            <option value="dev.popup-notice">팝업공지</option>
            <option value="dev.activity-log">로그</option>
          </select>
        </label>
        <label className={styles.field}>
          작업
          <select
            value={action}
            onChange={(event) => resetPage(() => setAction(event.target.value))}
            data-testid="activity-log-action-filter"
          >
            <option value="">전체</option>
            <option value="MENU_ACCESS">메뉴 진입</option>
            <option value="CREATE">등록</option>
            <option value="UPDATE">수정</option>
            <option value="DELETE">삭제</option>
          </select>
        </label>
        <label className={styles.field}>
          시작(KST)
          <Input
            type="datetime-local"
            value={from}
            onChange={(event) => resetPage(() => setFrom(event.target.value))}
            data-testid="activity-log-from-filter"
          />
        </label>
        <label className={styles.field}>
          종료(KST)
          <Input
            type="datetime-local"
            value={to}
            onChange={(event) => resetPage(() => setTo(event.target.value))}
            data-testid="activity-log-to-filter"
          />
        </label>
        <label className={styles.field}>
          검색
          <Input
            value={q}
            onChange={(event) => resetPage(() => setQ(event.target.value))}
            placeholder="내용 검색"
            data-testid="activity-log-search-filter"
          />
        </label>
      </div>

      <div className={styles.summaryLine}>
        <span data-testid="activity-log-total">총 {totalElements.toLocaleString('ko-KR')}건</span>
        {query.isFetching ? <span>조회 중</span> : null}
      </div>

      {errorMessage ? (
        <div className={styles.errorMessage} role="alert">
          {errorMessage}
        </div>
      ) : null}

      {!errorMessage ? (
        <div data-testid="activity-log-table">
          <DataTable<ActivityLogItem>
            rows={rows}
            columns={columns}
            rowKey={(row) => `${row.occurredAt}-${row.resourceId}-${row.action}-${row.description}`}
            emptyMessage="조회된 활동 로그가 없습니다."
          />
        </div>
      ) : null}

      <div className={styles.pagination}>
        <Button type="button" variant="secondary" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          이전
        </Button>
        <span className={styles.pageIndicator} data-testid="activity-log-page-indicator">
          {page + 1} / {Math.max(totalPages, 1)}
        </span>
        <Button
          type="button"
          variant="secondary"
          disabled={totalPages === 0 || page + 1 >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          다음
        </Button>
      </div>
    </div>
  )
}
