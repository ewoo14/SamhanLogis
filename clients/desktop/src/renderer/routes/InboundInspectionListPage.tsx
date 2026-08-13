/**
 * 입고 검수 목록 (`/warehouse/inbound-inspections`).
 *
 * P0-9 슬라이스. BE `GET /api/v1/inventory/inbound-inspections` backing.
 * 매뉴얼 docs/manual/02-창고/01-입고-처리.md 참조.
 *
 * UUID 비공개 가드 — 화면에는 slipNo / 거래처 코드 / 거래처 / 입고일 / 상태 / 검수자 표시.
 * `slipId` 는 InboundInspectionDialog 의 path param 으로만 사용.
 *
 * data-testid:
 * - inbound-inspection-list-table
 * - inbound-inspection-status-filter
 * - inbound-inspection-realtime-indicator
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
} from '@samhan/design-system'
import { safeActorName } from '@samhan/design-system'
import {
  listInboundInspections,
  INSPECTION_STATUS_LABEL,
  type InboundInspectionStatus,
  type InboundInspectionSummary,
} from '../api/inboundInspectionApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { InboundInspectionDialog } from './components/InboundInspectionDialog'

const STATUS_VARIANT: Record<
  InboundInspectionStatus,
  'neutral' | 'warning' | 'success' | 'danger'
> = {
  PENDING: 'warning',
  COMPLETED: 'success',
  CANCELED: 'danger',
}

const selectStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 6,
  fontSize: 13,
  minWidth: 140,
}

export function InboundInspectionListPage() {
  usePageTitle('입고 검수')

  const [statusFilter, setStatusFilter] = useState<InboundInspectionStatus | ''>('')
  const [selectedSlipId, setSelectedSlipId] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['inbound-inspections', statusFilter],
    queryFn: () =>
      listInboundInspections({
        status: statusFilter || undefined,
        page: 0,
        size: 50,
      }),
    // 30초 polling — 멀티 워크스테이션 동기화 안전망 (InventoryAuditListPage 패턴)
    refetchInterval: 30_000,
  })

  const columns: DataTableColumn<InboundInspectionSummary>[] = [
    {
      key: 'slipNo',
      header: '전표번호',
      width: '180px',
      mobilePriority: 'primary',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
          {row.slipNo}
        </span>
      ),
    },
    {
      key: 'partnerBusinessNo',
      header: '거래처 코드',
      width: '140px',
      mobilePriority: 'hidden',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {row.partnerBusinessNo ? row.partnerBusinessNo.replace(/\D/g, '') : '—'}
        </span>
      ),
    },
    {
      key: 'partnerName',
      header: '거래처',
      mobilePriority: 'secondary',
      render: (row) => row.partnerName ?? '—',
    },
    {
      key: 'slipDate',
      header: '입고일',
      width: '120px',
      mobilePriority: 'hidden',
      render: (row) => row.slipDate ?? '—',
    },
    {
      key: 'status',
      header: '상태',
      width: '110px',
      mobilePriority: 'secondary',
      render: (row) => (
        <Badge variant={STATUS_VARIANT[row.status]}>
          {INSPECTION_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
    {
      key: 'inspectorName',
      header: '검수자',
      width: '120px',
      mobilePriority: 'hidden',
      render: (row) => safeActorName(row.inspectorName) ?? '—',
    },
    {
      key: 'slipId',
      header: '',
      width: '80px',
      mobilePriority: 'hidden',
      render: (row) =>
        row.status !== 'COMPLETED' ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setSelectedSlipId(row.slipId)
            }}
          >
            검수
          </Button>
        ) : null,
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
          <h3 style={{ margin: 0 }}>입고 검수</h3>
          <span
            data-testid="inbound-inspection-realtime-indicator"
            style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
          >
            실시간 자동 갱신 · 30초
          </span>
        </div>

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as InboundInspectionStatus | '')
          }
          data-testid="inbound-inspection-status-filter"
          style={selectStyle}
        >
          <option value="">상태 전체</option>
          <option value="PENDING">{INSPECTION_STATUS_LABEL.PENDING}</option>
          <option value="COMPLETED">{INSPECTION_STATUS_LABEL.COMPLETED}</option>
          <option value="CANCELED">{INSPECTION_STATUS_LABEL.CANCELED}</option>
        </select>
      </div>

      <div data-testid="inbound-inspection-list-table">
        <DataTable
          columns={columns}
          rows={query.data?.content ?? []}
          loading={query.isLoading}
          rowKey={(row) => row.slipId}
          onRowClick={(row) => setSelectedSlipId(row.slipId)}
          emptyMessage="등록된 입고 검수가 없습니다."
        />
      </div>

      {query.isError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          입고 검수 목록을 불러오지 못했습니다.
        </div>
      ) : null}

      {/* 검수 Dialog */}
      {selectedSlipId ? (
        <InboundInspectionDialog
          slipId={selectedSlipId}
          open={!!selectedSlipId}
          onClose={() => setSelectedSlipId(null)}
          onSuccess={() => {
            setSelectedSlipId(null)
            void query.refetch()
          }}
        />
      ) : null}
    </>
  )
}
