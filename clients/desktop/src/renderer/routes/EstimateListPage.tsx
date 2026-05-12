/**
 * 견적서 목록 화면 — `/sales/estimates` (P2-1 #5).
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
 * <p>컬럼: 견적번호 / 거래처 / 유효기간 / 합계 / 상태.
 * UUID 비공개 가드 — id 컬럼 미포함, 사용자 노출은 estimateNo + partnerName 만.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  Input,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  ESTIMATE_STATUS_LABEL,
  canMutateEstimate,
  listEstimates,
  type EstimateStatus,
  type EstimateSummary,
} from '../api/estimateApi'
import { useSessionStore } from '../stores/session'
import { usePageTitle } from '../hooks/usePageTitle'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import styles from '../components/sales/sales.module.css'

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

const fmtKrw = (raw: string): string => {
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) return raw
  return '₩' + Math.trunc(n).toLocaleString('ko-KR')
}

export function EstimateListPage() {
  const navigate = useNavigate()
  const role = useSessionStore((s) => s.auth?.role)

  usePageTitle('견적서')

  const [statusFilter, setStatusFilter] = useState<EstimateStatus | ''>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [partnerKeyword, setPartnerKeyword] = useState<string>('')

  const query = useQuery({
    queryKey: ['estimates', 'list', statusFilter, startDate, endDate],
    queryFn: () =>
      listEstimates({
        page: 0,
        size: 50,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      }),
  })

  const filteredRows = useMemo(() => {
    const rows = query.data?.content ?? []
    const kw = partnerKeyword.trim().toLowerCase()
    if (!kw) return rows
    return rows.filter((r) => (r.partnerName ?? '').toLowerCase().includes(kw))
  }, [query.data?.content, partnerKeyword])

  const columns: DataTableColumn<EstimateSummary>[] = [
    {
      key: 'estimateNo',
      header: '견적번호',
      width: '180px',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
          {row.estimateNo}
        </span>
      ),
    },
    {
      key: 'partnerName',
      header: '거래처',
      render: (row) => (
        <div>
          <div>{row.partnerName}</div>
          {row.partnerBusinessNo ? (
            <div
              style={{
                fontSize: 11,
                color: '#6B7280',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {row.partnerBusinessNo}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'estimateDate',
      header: '작성일',
      width: '110px',
    },
    {
      key: 'validUntil',
      header: '유효기간',
      width: '120px',
      render: (row) =>
        row.validUntil ? (
          <span>{row.validUntil}</span>
        ) : (
          <span style={{ color: '#9CA3AF' }}>—</span>
        ),
    },
    {
      key: 'totalAmount',
      header: '합계',
      width: '160px',
      align: 'right',
      render: (row) => (
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtKrw(row.totalAmount)}
        </strong>
      ),
    },
    {
      key: 'status',
      header: '상태',
      width: '120px',
      render: (row) => (
        <Badge variant={STATUS_VARIANT[row.status]}>
          {ESTIMATE_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
  ]

  const canCreate = canMutateEstimate(role)

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
            견적서{' '}
            <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 8 }}>
              전체 {query.data?.totalElements ?? 0}건
            </span>
          </h3>
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
        </div>

        <div data-testid="estimate-list-table">
          <DataTable
            columns={columns}
            rows={filteredRows}
            loading={query.isLoading}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/sales/estimates/${r.id}`)}
            emptyMessage="등록된 견적서가 없습니다."
          />
        </div>

        {query.isError ? (
          <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
            견적서 목록을 불러오지 못했습니다. slip-service 의 estimate endpoint
            (`/slips/estimates`) 가 가동 중인지 확인하세요.
          </div>
        ) : null}
      </div>
    </div>
  )
}
