/**
 * 안전재고 알림 목록 페이지 (`/inventory/safety-stock-alerts`).
 *
 * P1-3 슬라이스. BE `GET /inventory/alerts/safety-stock` backing — TM PR #143 정합 (BE List 평면).
 * 임계 미만 (productId, warehouseId) 조합을 표 형태로 표시.
 *
 * UUID 노출 가드 — 본 화면은 관리자/창고 운영자(MASTER/MANAGER/INVENTORY/WAREHOUSE) 전용
 * 이므로 productId/warehouseId UUID 노출은 허용 (cf. memory `feedback_uuid_no_user_visibility`).
 * 향후 product-service / warehouse 조인을 BE 에서 enrich 하면 productCode/warehouseCode 로 교체.
 *
 * 권한: SAFETY_STOCK_ROLES (MASTER / MANAGER / INVENTORY / WAREHOUSE).
 *
 * data-testid:
 * - safety-stock-alerts-table
 * - safety-stock-alerts-warehouse-filter
 * - safety-stock-alerts-refresh-button
 * - safety-stock-alerts-empty
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  listSafetyStockAlerts,
  type SafetyStockAlert,
} from '../api/safetyStockApi'
import { listWarehouses, type Warehouse } from '../api/inventory'
import { usePageTitle } from '../hooks/usePageTitle'

export function SafetyStockAlertsPage() {
  usePageTitle('안전재고 알림')

  // FE 측 클라이언트 필터 — BE 가 warehouse 필터 query 를 미지원하므로 화면단 필터로 처리.
  const [warehouseId, setWarehouseId] = useState('')

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const alertsQuery = useQuery({
    queryKey: ['inventory', 'safety-stock-alerts'],
    queryFn: listSafetyStockAlerts,
    refetchInterval: 60_000,
  })

  // warehouseId 가 선택된 경우 클라이언트 필터링.
  const alerts = useMemo<SafetyStockAlert[]>(() => {
    const all = alertsQuery.data ?? []
    if (!warehouseId) return all
    return all.filter((a) => a.warehouseId === warehouseId)
  }, [alertsQuery.data, warehouseId])

  // 창고 UUID → 화면 표시용 코드/이름 매핑 (UUID 비표시 보조).
  const warehouseLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const w of warehousesQuery.data ?? []) {
      map.set(w.id, `${w.code} · ${w.name}`)
    }
    return (id: string | null): string => {
      if (!id) return '전체 창고 합산'
      return map.get(id) ?? id.slice(0, 8) + '…'
    }
  }, [warehousesQuery.data])

  const columns: DataTableColumn<SafetyStockAlert>[] = [
    {
      key: 'warehouseId',
      header: '창고',
      width: '220px',
      render: (a) => warehouseLabel(a.warehouseId),
    },
    {
      key: 'productId',
      header: '제품 ID',
      render: (a) => (
        <code style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
          {a.productId.slice(0, 8)}…
        </code>
      ),
    },
    {
      key: 'currentQty',
      header: '현재 가용',
      width: '110px',
      align: 'right',
      render: (a) => (
        <span style={{ color: 'var(--color-danger-600)', fontWeight: 600 }}>
          {a.currentQty.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'threshold',
      header: '임계값',
      width: '110px',
      align: 'right',
      render: (a) => a.threshold.toLocaleString(),
    },
    {
      key: 'shortage',
      header: '부족분',
      width: '110px',
      align: 'right',
      render: (a) => (
        <Badge variant="danger">
          -{a.shortage.toLocaleString()}
        </Badge>
      ),
    },
    {
      key: 'note',
      header: '메모',
      render: (a) => a.note ?? '—',
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
          <h3 style={{ margin: 0 }}>안전재고 알림</h3>
          <span
            style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
          >
            임계 미만 품목 · 1분 자동 갱신
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* 창고 필터 (클라이언트단) */}
          <select
            data-testid="safety-stock-alerts-warehouse-filter"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            style={{
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 13,
              color: 'var(--color-neutral-800)',
              background: 'var(--color-neutral-0)',
            }}
          >
            <option value="">전체 창고</option>
            {(warehousesQuery.data ?? []).map((w: Warehouse) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </select>

          <Button
            variant="secondary"
            data-testid="safety-stock-alerts-refresh-button"
            onClick={() => void alertsQuery.refetch()}
          >
            새로고침
          </Button>
        </div>
      </div>

      {/* 알림 요약 배너 */}
      {alerts.length > 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            background: 'var(--color-danger-50)',
            border: '1px solid var(--color-danger-200)',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            color: 'var(--color-danger-700)',
          }}
        >
          <span style={{ fontWeight: 700 }}>재고 부족 경고</span>
          <span>
            현재 안전재고 임계 미만 품목{' '}
            <strong>{alerts.length}건</strong>이 있습니다. 발주를 검토하세요.
          </span>
        </div>
      ) : null}

      {alertsQuery.isLoading ? (
        <p style={{ color: 'var(--color-neutral-500)', fontSize: 13 }}>
          불러오는 중...
        </p>
      ) : alerts.length === 0 ? (
        <div
          data-testid="safety-stock-alerts-empty"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '60px 24px',
            color: 'var(--color-neutral-400)',
            fontSize: 14,
            gap: 8,
          }}
        >
          <span style={{ fontSize: 32 }}>✓</span>
          <span>
            {warehouseId
              ? '선택 창고에 안전재고 미만 품목이 없습니다.'
              : '현재 안전재고 미만 품목이 없습니다.'}
          </span>
        </div>
      ) : (
        <DataTable
          data-testid="safety-stock-alerts-table"
          columns={columns}
          rows={alerts}
          rowKey={(a) => `${a.productId}-${a.warehouseId ?? 'GLOBAL'}`}
        />
      )}
    </>
  )
}
