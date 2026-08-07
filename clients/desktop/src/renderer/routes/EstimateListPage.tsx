/**
 * 견적서 관리 화면 — `/sales/estimates` (P2-1 #5).
 *
 * <p>매뉴얼 출처: {@code docs/manual/01-영업/06-견적서.md}.
 *
 * <p>필터:
 * <ul>
 *   <li>status — QUOTE_DRAFT/SENT/ACCEPTED/REJECTED/CONVERTED (전체)</li>
 *   <li>기간 — estimateDate startDate / endDate</li>
 *   <li>partner — 거래처명 부분 매칭 (client-side filter)</li>
 * </ul>
 *
 * <p>컬럼: 견적번호 / 거래처 코드 / 거래처 / 유효기간 / 합계 / 상태.
 * UUID 비공개 가드 — id 컬럼 미포함, 사용자 노출은 estimateNo + partnerName 만.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  Input,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  ESTIMATE_STATUS_LABEL,
  listEstimates,
  restoreEstimate,
  type EstimateStatus,
  type EstimateSummary,
} from '../api/estimateApi'
import { listPartnerOrders } from '../api/sales'
import { extractApiErrorResponseMessage } from '../api/apiError'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { EstimateListRealtimeClient } from '../realtime/EstimateListRealtimeClient'
import { useCollectionRealtime } from '../realtime/useCollectionRealtime'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import styles from '../components/sales/sales.module.css'
import {
  deletedBadgeAriaLabel,
  deletedBadgeLabel,
} from './admin/partnerDeletedRow'
import { mergeEstimateAndOrderRows, type UnifiedEstimateListRow } from './estimateUnifiedListModel'

const STATUS_OPTIONS: Array<{ value: EstimateStatus | ''; label: string }> = [
  { value: '', label: '전체' },
  { value: 'QUOTE_DRAFT', label: '작성중' },
  { value: 'QUOTE_SENT', label: '발송완료' },
  { value: 'QUOTE_ACCEPTED', label: '수주완료' },
  { value: 'QUOTE_REJECTED', label: '거절' },
  { value: 'QUOTE_CONVERTED', label: '전표변환완료' },
]

const STATUS_VARIANT: Record<EstimateStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  QUOTE_DRAFT: 'neutral',
  QUOTE_SENT: 'brand',
  QUOTE_ACCEPTED: 'success',
  QUOTE_REJECTED: 'danger',
  QUOTE_CONVERTED: 'warning',
}

const ESTIMATE_LIST_REALTIME_KEYS: QueryKey[] = [['estimates', 'list']]

const DELETED_ROW_TEXT_STYLE: CSSProperties = {
  textDecoration: 'line-through',
  color: 'var(--color-neutral-600)',
}

const UNIFIED_LIST_FETCH_SIZE = 10_000

const fmtKrw = (raw: string): string => {
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) return raw
  return '₩' + Math.trunc(n).toLocaleString('ko-KR')
}

async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ content: T[]; totalPages: number }>,
): Promise<T[]> {
  const firstPage = await fetchPage(0)
  if (firstPage.totalPages <= 1) return firstPage.content
  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) => fetchPage(index + 1)),
  )
  return [firstPage.content, ...remainingPages.map((page) => page.content)].flat()
}

export function EstimateListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()

  usePageTitle('견적서 관리')

  const [statusFilter, setStatusFilter] = useState<EstimateStatus | ''>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [partnerKeyword, setPartnerKeyword] = useState<string>('')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [showUnifiedList, setShowUnifiedList] = useState(false)
  const [page, setPage] = useState(0)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  useCollectionRealtime(EstimateListRealtimeClient, 'list', ESTIMATE_LIST_REALTIME_KEYS)

  useEffect(() => {
    setPage(0)
  }, [statusFilter, startDate, endDate, partnerKeyword, includeDeleted])

  const query = useQuery({
    queryKey: ['estimates', 'list', statusFilter, startDate, endDate, partnerKeyword, includeDeleted, page],
    queryFn: () =>
      listEstimates({
        page,
        size: 50,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(includeDeleted ? { includeDeleted: true } : {}),
      }),
  })

  const unifiedQuery = useQuery({
    queryKey: ['estimates', 'unified', statusFilter, startDate, endDate, partnerKeyword, includeDeleted],
    enabled: showUnifiedList,
    queryFn: async () => {
      const [estimateResult, orderResult] = await Promise.allSettled([
        fetchAllPages((page) => listEstimates({
          page,
          size: UNIFIED_LIST_FETCH_SIZE,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
          ...(includeDeleted ? { includeDeleted: true } : {}),
        })),
        fetchAllPages((page) => listPartnerOrders(page, UNIFIED_LIST_FETCH_SIZE, {
          ...(startDate ? { dateFrom: startDate } : {}),
          ...(endDate ? { dateTo: endDate } : {}),
          ...(includeDeleted ? { includeDeleted: true } : {}),
        })),
      ])

      return {
        estimates: estimateResult.status === 'fulfilled' ? estimateResult.value : [],
        orders: orderResult.status === 'fulfilled' ? orderResult.value : [],
        errors: [
          ...(estimateResult.status === 'rejected' ? ['종합견적서'] : []),
          ...(orderResult.status === 'rejected' ? ['주문서'] : []),
        ],
      }
    },
  })

  const restoreMutation = useMutation({
    mutationFn: restoreEstimate,
    onSuccess: async () => {
      setRestoreError(null)
      await queryClient.invalidateQueries({ queryKey: ['estimates', 'list'] })
    },
    onError: (error) =>
      setRestoreError(
        extractApiErrorResponseMessage(error)
          ?? '복원에 실패했습니다. 견적서 상태 또는 권한을 확인하세요.',
      ),
  })

  const filteredRows = useMemo(() => {
    const rows = query.data?.content ?? []
    const kw = partnerKeyword.trim().toLowerCase()
    if (!kw) return rows
    return rows.filter((r) => (r.partnerName ?? '').toLowerCase().includes(kw))
  }, [query.data?.content, partnerKeyword])

  const unifiedRows = useMemo(() => {
    const data = unifiedQuery.data
    if (!data) return []
    const keyword = partnerKeyword.trim().toLowerCase()
    return mergeEstimateAndOrderRows(
      data.estimates.filter((row) => !keyword || (row.partnerName ?? '').toLowerCase().includes(keyword)),
      data.orders.filter((row) => !keyword || (row.partnerName ?? '').toLowerCase().includes(keyword)),
    )
  }, [unifiedQuery.data, partnerKeyword])

  const columns: DataTableColumn<EstimateSummary>[] = [
    {
      key: 'estimateNo',
      header: '견적번호',
      width: '180px',
      mobilePriority: 'primary',
      render: (row) => (
        <>
          <span
            data-testid={`estimate-list-row-${row.id}-number`}
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 500,
              ...(row.isDeleted ? DELETED_ROW_TEXT_STYLE : {}),
            }}
          >
            {row.estimateNo}
          </span>
          {row.isDeleted ? (
            <Badge
              variant="neutral"
              title={deletedBadgeAriaLabel(row.deletedByName, row.deletedAt)}
              aria-label={deletedBadgeAriaLabel(row.deletedByName, row.deletedAt)}
              data-testid={`estimate-list-row-${row.id}-deleted-badge`}
              style={{
                marginLeft: 8,
                maxWidth: 160,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                verticalAlign: 'middle',
              }}
            >
              {deletedBadgeLabel(row.deletedByName)}
            </Badge>
          ) : null}
        </>
      ),
    },
    {
      key: 'partnerBusinessNo',
      header: '거래처 코드',
      width: '140px',
      mobilePriority: 'hidden',
      render: (row) => (
        <span
          style={{
            fontVariantNumeric: 'tabular-nums',
            ...(row.isDeleted ? DELETED_ROW_TEXT_STYLE : {}),
          }}
        >
          {row.partnerBusinessNo ? row.partnerBusinessNo.replace(/\D/g, '') : '—'}
        </span>
      ),
    },
    {
      key: 'partnerName',
      header: '거래처',
      mobilePriority: 'secondary',
      render: (row) => (
        <span style={row.isDeleted ? DELETED_ROW_TEXT_STYLE : undefined}>
          {row.partnerName}
        </span>
      ),
    },
    {
      key: 'estimateDate',
      header: '작성일',
      width: '110px',
      mobilePriority: 'hidden',
      render: (row) => (
        <span style={row.isDeleted ? DELETED_ROW_TEXT_STYLE : undefined}>
          {row.estimateDate}
        </span>
      ),
    },
    {
      key: 'validUntil',
      header: '유효기간',
      width: '120px',
      mobilePriority: 'secondary',
      render: (row) => (
        <span
          style={{
            ...(row.validUntil ? {} : { color: '#9CA3AF' }),
            ...(row.isDeleted ? DELETED_ROW_TEXT_STYLE : {}),
          }}
        >
          {row.validUntil ?? '—'}
        </span>
      ),
    },
    {
      key: 'totalAmount',
      header: '합계',
      width: '160px',
      align: 'right',
      mobilePriority: 'secondary',
      render: (row) => (
        <strong
          style={{
            fontVariantNumeric: 'tabular-nums',
            ...(row.isDeleted ? DELETED_ROW_TEXT_STYLE : {}),
          }}
        >
          {fmtKrw(row.totalAmount)}
        </strong>
      ),
    },
    {
      key: 'status',
      header: '상태',
      width: '120px',
      mobilePriority: 'secondary',
      render: (row) => (
        <Badge
          variant={row.isDeleted ? 'neutral' : STATUS_VARIANT[row.status]}
          aria-label={row.isDeleted ? `삭제됨, 기존 견적 상태 ${ESTIMATE_STATUS_LABEL[row.status]}` : undefined}
        >
          {row.isDeleted ? '삭제됨' : ESTIMATE_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '96px',
      align: 'right',
      mobilePriority: 'secondary',
      render: (row) =>
        row.isDeleted && row.restoreAvailable && canAccess('estimates.list', 'restore') ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={restoreMutation.isPending && restoreMutation.variables === row.id}
            disabled={restoreMutation.isPending}
            onClick={(event) => {
              event.stopPropagation()
              restoreMutation.mutate(row.id)
            }}
            data-testid={`estimate-list-row-${row.id}-restore`}
            aria-label={`${row.estimateNo} 견적서 복원`}
          >
            복원
          </Button>
        ) : null,
    },
  ]

  const unifiedColumns: DataTableColumn<UnifiedEstimateListRow>[] = [
    {
      key: 'sourceLabel',
      header: '구분',
      width: '120px',
      mobilePriority: 'secondary',
      render: (row) => <span style={row.isDeleted ? DELETED_ROW_TEXT_STYLE : undefined}>{row.sourceLabel}</span>,
    },
    {
      key: 'documentNo',
      header: '문서번호',
      width: '180px',
      mobilePriority: 'primary',
      render: (row) => <span style={row.isDeleted ? DELETED_ROW_TEXT_STYLE : undefined}>{row.documentNo}</span>,
    },
    {
      key: 'partnerCode',
      header: '거래처 코드',
      width: '140px',
      mobilePriority: 'hidden',
      render: (row) => <span style={row.isDeleted ? DELETED_ROW_TEXT_STYLE : undefined}>{row.partnerCode ?? '—'}</span>,
    },
    {
      key: 'partnerName',
      header: '거래처',
      mobilePriority: 'secondary',
      render: (row) => <span style={row.isDeleted ? DELETED_ROW_TEXT_STYLE : undefined}>{row.partnerName ?? '—'}</span>,
    },
    {
      key: 'writtenAt',
      header: '작성일',
      width: '160px',
      mobilePriority: 'hidden',
      render: (row) => <span style={row.isDeleted ? DELETED_ROW_TEXT_STYLE : undefined}>{row.writtenAt ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: '합계',
      width: '160px',
      align: 'right',
      mobilePriority: 'secondary',
      render: (row) => <strong style={row.isDeleted ? DELETED_ROW_TEXT_STYLE : undefined}>{fmtKrw(row.amount)}</strong>,
    },
    {
      key: 'status',
      header: '상태',
      width: '120px',
      mobilePriority: 'secondary',
      render: (row) => <Badge variant={row.isDeleted ? 'neutral' : 'neutral'}>{row.isDeleted ? '삭제됨' : row.status}</Badge>,
    },
  ]

  const canCreate = canAccess('estimates.list', 'create')

  return (
    <div className={styles['salesScope']}>
      <SalesSubNav />
      <div className={styles['wrap']}>
        {/* [3a 데스크탑 ↔ 웹 분리] 본 화면은 내부 영업/관리자용 견적 관리 UI 임을 명시.
            거래처가 직접 작성하는 종합견적서 흐름은 별도 외부 웹앱 (sub-nav 우측 "웹 종합견적서 ↗") 으로 분리. */}
        <div
          data-testid="estimate-audience-banner"
          role="note"
          style={{
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            color: '#1E3A8A',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <strong>내부 영업·관리자용 화면입니다.</strong>{' '}
          거래처가 직접 작성하는 종합견적서는 상단 우측{' '}
          <em>「웹 종합견적서 ↗」</em> 외부 웹앱을 사용합니다.
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 16,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <h3 style={{ margin: 0 }}>
            견적서 관리{' '}
            <span style={{ fontSize: 12, color: 'var(--color-neutral-600)', marginLeft: 8 }}>
              전체 {query.data?.totalElements ?? 0}건
            </span>
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={showUnifiedList}
                onChange={(event) => setShowUnifiedList(event.target.checked)}
                data-testid="estimate-list-unified-toggle"
              />
              통합 목록 보기
            </label>
            {canCreate ? (
              <Button
                variant="primary"
                onClick={() => navigate('/sales/estimates/new')}
                data-testid="estimate-new-button"
              >
                신규 작성
              </Button>
            ) : null}
          </div>
        </div>

        {/* 필터 */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 16,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
          data-testid="estimate-list-filter"
        >
          <label style={{ fontSize: 13, color: 'var(--ink-primary)' }}>
            상태
            <br />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as EstimateStatus | '')
              }
              style={{
                height: 36,
                padding: '0 8px',
                borderRadius: 6,
                border: '1px solid var(--color-neutral-300)',
                fontSize: 13,
                minWidth: 140,
              }}
              data-testid="estimate-list-filter-status"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="기간 (시작)"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            fullWidth={false}
            data-testid="estimate-list-filter-start"
          />
          <Input
            label="기간 (종료)"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            fullWidth={false}
            data-testid="estimate-list-filter-end"
          />
          <Input
            label="거래처명"
            placeholder="거래처명 부분 검색"
            value={partnerKeyword}
            onChange={(e) => setPartnerKeyword(e.target.value)}
            fullWidth={false}
            data-testid="estimate-list-filter-partner"
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              data-testid="estimate-list-include-deleted"
            />
            삭제 문서 포함
          </label>
        </div>

        {restoreError ? (
          <div
            className="error-banner"
            role="alert"
            data-testid="estimate-list-restore-error"
            style={{ marginBottom: 12, padding: 12, color: 'var(--color-danger-700, #991B1B)' }}
          >
            {restoreError}
          </div>
        ) : null}

        <div data-testid="estimate-list-table">
          <DataTable
            columns={columns}
            rows={filteredRows}
            loading={query.isLoading}
            rowKey={(r) => `${r.id}:${r.isDeleted ? 'D' : 'A'}`}
            rowTestId={(r) => `estimate-list-row-${r.id}`}
            rowClickable={(r) => r.isDeleted !== true}
            rowClassName={(r) => (r.isDeleted ? styles['partnerOrderRowDeleted'] : undefined)}
            onRowClick={(r) => {
              if (r.isDeleted === true) return
              navigate(`/sales/estimates/${r.id}`)
            }}
            emptyMessage="등록된 견적서가 없습니다."
          />
        </div>

        {query.data && query.data.totalPages > 1 ? (
          <div data-testid="estimate-list-pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <Button
              variant="secondary"
              size="sm"
              data-testid="estimate-list-previous-page"
              disabled={page === 0 || query.isFetching}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              이전
            </Button>
            <span data-testid="estimate-list-page-indicator">{page + 1} / {query.data.totalPages}</span>
            <Button
              variant="secondary"
              size="sm"
              data-testid="estimate-list-next-page"
              disabled={page + 1 >= query.data.totalPages || query.isFetching}
              onClick={() => setPage((current) => Math.min(query.data!.totalPages - 1, current + 1))}
            >
              다음
            </Button>
          </div>
        ) : null}

        {query.isError ? (
          <div
            className="error-banner"
            role="alert"
            style={{ marginTop: 16, color: 'var(--color-danger-700, #991B1B)' }}
          >
            견적서 목록을 불러오지 못했습니다. slip-service 의 estimate endpoint
            (`/slips/estimates`) 가 가동 중인지 확인하세요.
          </div>
        ) : null}

        {showUnifiedList ? (
          <section aria-labelledby="estimate-unified-list-heading" style={{ marginTop: 28 }}>
            <h3 id="estimate-unified-list-heading" style={{ margin: '0 0 12px' }}>
              통합 목록 <span style={{ fontSize: 12, color: 'var(--color-neutral-600)', marginLeft: 8 }}>{unifiedRows.length}건</span>
            </h3>
            {unifiedQuery.data?.errors.length ? (
              <div
                className="error-banner"
                role="alert"
                data-testid="estimate-unified-list-error"
                style={{ marginBottom: 12, color: 'var(--color-danger-700, #991B1B)' }}
              >
                {unifiedQuery.data.errors.join(', ')} 목록을 불러오지 못했습니다. 가능한 데이터만 표시합니다.
              </div>
            ) : null}
            <div data-testid="estimate-unified-list-table">
              <DataTable
                columns={unifiedColumns}
                rows={unifiedRows}
                loading={unifiedQuery.isLoading}
                rowKey={(row) => row.id}
                rowTestId={(row) => `estimate-unified-row-${row.id}`}
                rowClickable={(row) => row.navigationPath !== null}
                onRowClick={(row) => {
                  if (row.navigationPath) navigate(row.navigationPath)
                }}
                emptyMessage="통합 목록에 표시할 문서가 없습니다."
              />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
