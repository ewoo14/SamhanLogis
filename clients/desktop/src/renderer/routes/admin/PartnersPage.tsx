/**
 * 관리자 — 거래처 관리 (`/admin/partners`).
 *
 * <p>P0-6 보강:
 * <ul>
 *   <li>복합 필터: 거래처 유형(type) / 상태(status) / 거래액 범위 (미래 슬라이스 준비 — disabled 표시)</li>
 *   <li>[신규 등록] 버튼 → `/admin/partners/new` (PartnerCreatePage) 이동</li>
 *   <li>행 클릭 → PartnerDetailDialog (4탭 상세 + 인라인 편집)</li>
 *   <li>30초 polling — 멀티 워크스테이션 동기화 안전망</li>
 * </ul>
 *
 * <p>UUID 비공개 — 모든 식별자는 partnerCode (상호 / 사업자번호 표시 가능).
 *
 * <p>@PreAuthorize — SALES / MANAGER / MASTER (BE 와 1:1).
 *
 * data-testid:
 * - admin-partners-table
 * - admin-partners-search-input
 * - admin-partners-status-filter
 * - admin-partners-type-filter
 * - admin-partners-row-{partnerCode}
 * - admin-partners-realtime-indicator
 * - admin-partners-create-btn
 * - admin-partners-excel-export (P1-6 신규)
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
} from '@samhan/design-system'
import { exportPartners } from '../../api/excelExportApi'
import { useExcelDownload, makeExportFilename } from '../../hooks/useExcelDownload'
import {
  listAdminPartners,
  PARTNER_STATUS_LABEL,
  type PartnerStatus,
  type PartnerSummary,
} from '../../api/adminApi'
import { PARTNER_TYPE_LABEL, type PartnerType } from '../../api/partnerApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PartnerDetailDialog } from './PartnerDetailDialog'

// ---------------------------------------------------------------------------
// 상태 variant 맵
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<
  PartnerStatus,
  'brand' | 'neutral' | 'success' | 'warning' | 'danger'
> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  TERMINATED: 'danger',
}

/** KRW 정수 (string 또는 number) → "₩1,234,567" 표시. */
function formatKrw(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '—'
  const n = typeof raw === 'string' ? Number.parseFloat(raw) : raw
  if (!Number.isFinite(n)) return '—'
  return '₩' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

/**
 * 거래처 admin 목록 + 4탭 상세 다이얼로그.
 */
export function PartnersPage() {
  usePageTitle('거래처 관리')
  const navigate = useNavigate()

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<PartnerStatus | ''>('')
  const [typeFilter, setTypeFilter] = useState<PartnerType | ''>('')
  const [page, setPage] = useState(0)

  // P1-6: Excel export
  const { downloading, download } = useExcelDownload()

  // 4탭 상세 다이얼로그 상태
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    null,
  )
  const [selectedPartnerName, setSelectedPartnerName] = useState<string | null>(
    null,
  )
  const [dialogOpen, setDialogOpen] = useState(false)

  const query = useQuery({
    queryKey: ['admin', 'partners', q, statusFilter, typeFilter, page],
    queryFn: () =>
      listAdminPartners({
        q: q || undefined,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        page,
        size: 20,
      }),
    // PR-H4c FE-C: 30초 polling — 멀티 워크스테이션 동기화 안전망.
    refetchInterval: 30_000,
  })

  const totalPages = query.data
    ? Math.max(1, Math.ceil(query.data.total / query.data.size))
    : 1

  function openDetail(partner: PartnerSummary) {
    // BE Partner4TabController 의 path variable 은 partnerCode (UUID 아님).
    // TM PR #141 cross-check 로 정정 — UUID 비공개 가드 + BE 와 1:1 정렬.
    setSelectedPartnerId(partner.partnerCode)
    setSelectedPartnerName(partner.name)
    setDialogOpen(true)
  }

  const columns: DataTableColumn<PartnerSummary>[] = [
    { key: 'partnerCode', header: '거래처 코드', width: '140px' },
    {
      key: 'name',
      header: '상호',
      render: (p) => (
        <span data-testid={`admin-partners-row-${p.partnerCode}`}>
          {p.name}
        </span>
      ),
    },
    { key: 'bizNo', header: '사업자번호', width: '140px' },
    {
      key: 'phone',
      header: '전화',
      width: '140px',
      render: (p) => p.phone ?? '—',
    },
    {
      key: 'status',
      header: '상태',
      width: '110px',
      render: (p) => (
        <Badge variant={STATUS_VARIANT[p.status]}>
          {PARTNER_STATUS_LABEL[p.status]}
        </Badge>
      ),
    },
    {
      key: 'creditLimit',
      header: '신용한도',
      width: '140px',
      align: 'right',
      render: (p) => formatKrw(p.creditLimit),
    },
    {
      key: 'outstandingBalance',
      header: '미수금',
      width: '140px',
      align: 'right',
      render: (p) => formatKrw(p.outstandingBalance),
    },
  ]

  return (
    <>
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0 }}>거래처 관리</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            data-testid="admin-partners-realtime-indicator"
            style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}
          >
            실시간 자동 갱신 · 30초
          </span>
          {/* P1-6: Excel 다운로드 — 현재 검색어(q) + 상태 필터 BE 시그니처와 일치
              (BE PartnerAdminController.exportXlsx(q, status) 는 type 미지원 — TM PR #146 cross-check) */}
          <Button
            variant="secondary"
            size="sm"
            loading={downloading}
            disabled={downloading}
            onClick={() =>
              download(
                () =>
                  exportPartners({
                    q: q.trim() || undefined,
                    status: statusFilter || undefined,
                  }),
                makeExportFilename('거래처목록'),
              )
            }
            data-testid="admin-partners-excel-export"
          >
            Excel 다운로드
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/admin/partners/new')}
            data-testid="admin-partners-create-btn"
          >
            신규 등록
          </Button>
        </div>
      </div>

      {/* 필터 바 */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="search"
          placeholder="코드 / 상호 / 사업자번호 / 전화 검색"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(0)
          }}
          data-testid="admin-partners-search-input"
          style={filterInputStyle}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as PartnerStatus | '')
            setPage(0)
          }}
          data-testid="admin-partners-status-filter"
          style={filterSelectStyle}
        >
          <option value="">상태 전체</option>
          <option value="ACTIVE">{PARTNER_STATUS_LABEL.ACTIVE}</option>
          <option value="SUSPENDED">{PARTNER_STATUS_LABEL.SUSPENDED}</option>
          <option value="TERMINATED">{PARTNER_STATUS_LABEL.TERMINATED}</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as PartnerType | '')
            setPage(0)
          }}
          data-testid="admin-partners-type-filter"
          style={filterSelectStyle}
        >
          <option value="">유형 전체</option>
          {(Object.keys(PARTNER_TYPE_LABEL) as PartnerType[]).map((t) => (
            <option key={t} value={t}>
              {PARTNER_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      {/* 테이블 */}
      <div data-testid="admin-partners-table">
        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          loading={query.isLoading}
          rowKey={(p) => p.partnerCode}
          emptyMessage="조건에 맞는 거래처가 없습니다."
          onRowClick={openDetail}
        />
      </div>

      {/* 페이지네이션 */}
      {query.data && totalPages > 1 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            marginTop: 16,
            fontSize: 13,
          }}
        >
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => p - 1)}
            style={pagerBtnStyle}
          >
            이전
          </button>
          <span>
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={pagerBtnStyle}
          >
            다음
          </button>
        </div>
      ) : null}

      {/* 4탭 상세 다이얼로그 */}
      <PartnerDetailDialog
        partnerId={selectedPartnerId}
        partnerName={selectedPartnerName}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setSelectedPartnerId(null)
          setSelectedPartnerName(null)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// 공통 스타일
// ---------------------------------------------------------------------------

const filterInputStyle: React.CSSProperties = {
  flex: '1 1 280px',
  minWidth: 240,
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  fontSize: 13,
}

const filterSelectStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  fontSize: 13,
}

const pagerBtnStyle: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  border: '1px solid var(--line-default)',
  borderRadius: 4,
  background: 'var(--surface-card)',
  cursor: 'pointer',
  fontSize: 13,
}
