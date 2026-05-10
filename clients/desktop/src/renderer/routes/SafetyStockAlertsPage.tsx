/**
 * 안전재고 알림 목록 페이지 (`/inventory/safety-stock-alerts`).
 *
 * P1-3 슬라이스. BE `GET /inventory/safety-stock-alerts` backing.
 * 임계 미만 (availableQty < threshold) 인 (제품, 창고) 조합을 표 형태로 표시.
 *
 * UUID 비공개 가드: productCode / modelName / warehouseCode 만 화면 노출.
 *
 * 권한: MASTER / MANAGER / WAREHOUSE (RoleGuard — safetyStockApi.SAFETY_STOCK_ROLES).
 *
 * data-testid:
 * - safety-stock-alerts-table
 * - safety-stock-alerts-warehouse-filter
 * - safety-stock-alerts-refresh-button
 * - safety-stock-alerts-empty
 */
import { useState } from 'react'
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

  const [warehouseCode, setWarehouseCode] = useState('')

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const alertsQuery = useQuery({
    queryKey: ['inventory', 'safety-stock-alerts', warehouseCode],
    queryFn: () =>
      listSafetyStockAlerts({
        warehouseCode: warehouseCode || undefined,
        page: 0,
        size: 100,
      }),
    refetchInterval: 60_000,
  })

  const alerts = alertsQuery.data?.content ?? []

  const columns: DataTableColumn<SafetyStockAlert>[] = [
    {
      key: 'productCode',
      header: '제품코드',
      width: '130px',
    },
    {
      key: 'modelName',
      header: '모델명',
      width: '220px',
    },
    {
      key: 'productName',
      header: '제품명',
    },
    {
      key: 'warehouseCode',
      header: '창고',
      width: '150px',
      render: (a) => `${a.warehouseCode} · ${a.warehouseName}`,
    },
    {
      key: 'availableQty',
      header: '현재 가용',
      width: '110px',
      align: 'right',
      render: (a) => (
        <span style={{ color: 'var(--color-danger-600)', fontWeight: 600 }}>
          {a.availableQty.toLocaleString()}
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
      key: 'shortfall',
      header: '부족분',
      width: '110px',
      align: 'right',
      render: (a) => (
        <Badge variant="danger">
          -{a.shortfall.toLocaleString()}
        </Badge>
      ),
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
          {/* 창고 필터 */}
          <select
            data-testid="safety-stock-alerts-warehouse-filter"
            value={warehouseCode}
            onChange={(e) => setWarehouseCode(e.target.value)}
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
              <option key={w.id} value={w.code}>
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
            {warehouseCode
              ? `선택 창고(${warehouseCode})에 안전재고 미만 품목이 없습니다.`
              : '현재 안전재고 미만 품목이 없습니다.'}
          </span>
        </div>
      ) : (
        <DataTable
          data-testid="safety-stock-alerts-table"
          columns={columns}
          rows={alerts}
          rowKey={(a) => `${a.productCode}-${a.warehouseCode}`}
        />
      )}
    </>
  )
}
