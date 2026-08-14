/**
 * 재고 실사 목록 (`/warehouse/audit`).
 *
 * Phase 10 P2-6 슬라이스 9. BE `GET /inventory/audits?warehouseId=&year=&status=` backing.
 * 매뉴얼 docs/manual/02-창고/05-재고-실사.md 참조.
 *
 * UUID 비공개 — 화면에는 auditNo / warehouseCode / auditDate / status / 차이금액 표시.
 *
 * <h2>PR-H4c FE-B 보강 — 실시간 동기화</h2>
 * <ul>
 *   <li>30초 polling refetchInterval — 멀티 워크스테이션 동기화 안전망.</li>
 *   <li>BE inventory-service 는 PR-H4b BE-B 로 entity 단위 SSE 노출 — list 화면은 단일
 *       entityId 가 없으므로 broadcast endpoint 합류 전까지 polling fallback 유지.</li>
 *   <li>헤더 우측 "실시간 자동 갱신" 안내 — UsersPage (FE-C) 패턴 1:1.</li>
 * </ul>
 *
 * data-testid:
 * - audit-list-table
 * - audit-list-warehouse-filter
 * - audit-list-year-filter
 * - audit-list-status-filter
 * - audit-list-new-button
 * - audit-list-realtime-indicator
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  AUDIT_STATUS_LABEL,
  listAudits,
  type AuditStatus,
  type AuditSummary,
} from '../api/auditApi'
import { listWarehouses, type Warehouse } from '../api/inventory'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { DocumentNumberLink } from '../components/DocumentNumberLink'

const STATUS_VARIANT: Record<
  AuditStatus,
  'brand' | 'neutral' | 'success' | 'warning' | 'danger'
> = {
  PLANNED: 'neutral',
  IN_PROGRESS: 'brand',
  COMPLETED: 'success',
  CANCELLED: 'danger',
}

/** KRW 정수 string → "₩1,234,567" 표시 (음수 ▲표시). */
function formatDiff(raw: string): string {
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n) || n === 0) return '—'
  const formatted = '₩' + Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n < 0 ? `▼ ${formatted}` : `▲ ${formatted}`
}

export function InventoryAuditListPage() {
  usePageTitle('재고 실사')
  const navigate = useNavigate()
  const { canAccess } = usePermissions()

  const currentYear = new Date().getFullYear()
  const [warehouseId, setWarehouseId] = useState('')
  const [year, setYear] = useState<number | ''>('')
  const [status, setStatus] = useState<AuditStatus | ''>('')

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const auditsQuery = useQuery({
    queryKey: ['inventory', 'audits', warehouseId, year, status],
    queryFn: () =>
      listAudits({
        warehouseId: warehouseId || undefined,
        year: year === '' ? undefined : year,
        status: status || undefined,
        page: 0,
        size: 50,
      }),
    // PR-H4c FE-B: 30초 polling — 멀티 워크스테이션 동기화 안전망
    refetchInterval: 30_000,
  })

  const yearOptions = useMemo(() => {
    const years: number[] = []
    for (let y = currentYear; y >= currentYear - 4; y -= 1) years.push(y)
    return years
  }, [currentYear])

  const columns: DataTableColumn<AuditSummary>[] = [
    {
      key: 'auditNo', header: '실사번호', width: '180px', mobilePriority: 'primary',
      render: (row) => <DocumentNumberLink number={row.auditNo} to={row.id ? `/warehouse/audit/${row.id}` : ''} detailWindow={{ documentType: 'INVENTORY_AUDIT', documentId: row.id }} />,
    },
    {
      key: 'warehouseCode',
      header: '창고',
      width: '140px',
      mobilePriority: 'secondary',
      render: (a) => `${a.warehouseCode} · ${a.warehouseName}`,
    },
    {
      key: 'auditDate',
      header: '실사일자',
      width: '120px',
      mobilePriority: 'hidden',
    },
    {
      key: 'status',
      header: '상태',
      width: '110px',
      mobilePriority: 'secondary',
      render: (a) => (
        <Badge variant={STATUS_VARIANT[a.status]}>
          {AUDIT_STATUS_LABEL[a.status]}
        </Badge>
      ),
    },
    {
      key: 'totalDiffAmount',
      header: '차이금액',
      width: '160px',
      align: 'right',
      mobilePriority: 'secondary',
      render: (a) => formatDiff(a.totalDiffAmount),
    },
  ]

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h3 style={{ margin: 0 }}>재고 실사</h3>
          {/* PR-H4c FE-B: 실시간 자동 갱신 안내 (30s polling — UsersPage FE-C 패턴 1:1) */}
          <span
            data-testid="audit-list-realtime-indicator"
            style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
          >
            실시간 자동 갱신 · 30초
          </span>
        </div>
        {canAccess('inventory.adjust', 'create') ? (
          <Button
            variant="primary"
            data-testid="audit-list-new-button"
            onClick={() => navigate('/warehouse/audit/new')}
          >
            신규 실사
          </Button>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          data-testid="audit-list-warehouse-filter"
          style={selectStyle}
        >
          <option value="">창고 전체</option>
          {(Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []).map((w: Warehouse) => (
            <option key={w.id} value={w.id}>
              {w.code} · {w.name}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) =>
            setYear(e.target.value === '' ? '' : Number(e.target.value))
          }
          data-testid="audit-list-year-filter"
          style={selectStyle}
        >
          <option value="">연도 전체</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AuditStatus | '')}
          data-testid="audit-list-status-filter"
          style={selectStyle}
        >
          <option value="">상태 전체</option>
          <option value="PLANNED">{AUDIT_STATUS_LABEL.PLANNED}</option>
          <option value="IN_PROGRESS">{AUDIT_STATUS_LABEL.IN_PROGRESS}</option>
          <option value="COMPLETED">{AUDIT_STATUS_LABEL.COMPLETED}</option>
          <option value="CANCELLED">{AUDIT_STATUS_LABEL.CANCELLED}</option>
        </select>
      </div>

      <div data-testid="audit-list-table">
        <DataTable
          columns={columns}
          rows={auditsQuery.data?.content ?? []}
          loading={auditsQuery.isLoading}
          rowKey={(a) => a.id}
          onRowClick={(a) => navigate(`/warehouse/audit/${a.id}`)}
          emptyMessage="등록된 실사가 없습니다."
        />
      </div>

      {auditsQuery.isError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          재고 실사 목록을 불러오지 못했습니다.
        </div>
      ) : null}
    </>
  )
}

const selectStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 13,
  minWidth: 160,
}
