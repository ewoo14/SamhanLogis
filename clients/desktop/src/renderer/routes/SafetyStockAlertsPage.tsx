/**
 * 안전재고 알림 목록 페이지 (`/inventory/safety-stock-alerts`).
 *
 * P1-3 슬라이스. BE `GET /inventory/alerts/safety-stock` backing — TM PR #143 정합.
 * 임계 미만 (productCode, warehouseName) 조합을 표 형태로 표시.
 *
 * UUID 노출 가드 (memory `feedback_uuid_no_user_visibility`):
 * - 화면에는 productCode / productName / warehouseName 만 표시.
 * - UUID(productId / warehouseId) 는 path param 으로만 사용, 화면 미노출.
 *
 * 긴급도 (UrgencyBadge, P1-3 신규 컴포넌트):
 * - CRITICAL : 재고 = 0
 * - DANGER   : 충족률 1~49%
 * - WARNING  : 충족률 50~79%
 * - NOTICE   : 충족률 80~99%
 *
 * QA 정책: shortage = max(0, threshold - currentQty), 알림 조건 currentQty < threshold.
 *
 * 권한: inventory.safety-stock VIEW page-code 계약.
 *
 * data-testid spec (Designer 7건 + FE 1건 정합):
 * - safety-stock-alerts-page     루트 div
 * - safety-stock-table           DataTable wrapper
 * - safety-stock-row-{productCode}  행 단위 (FE F-3)
 * - safety-stock-badge-{productCode} 긴급도 배지 (Designer)
 * - safety-stock-count           알림 건수 숫자
 * - safety-stock-empty           빈 상태 div
 * - header-safety-stock-count-chip 헤더 count chip (AppLayout 에 위치)
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  UrgencyBadge,
  calcUrgencyLevel,
  Input,
  TagChip,
} from '@samhan/design-system'
import {
  listSafetyStockAlerts,
  setSafetyStock,
  type SafetyStockAlert,
} from '../api/safetyStockApi'
import { listWarehouses, type Warehouse } from '../api/inventory'
import { usePageTitle } from '../hooks/usePageTitle'

/** 컬럼 7개 (Designer spec) — 긴급도 필터 옵션 */
const URGENCY_OPTIONS = [
  { value: '',         label: '전체 긴급도' },
  { value: 'CRITICAL', label: '즉시 발주' },
  { value: 'DANGER',   label: '위험' },
  { value: 'WARNING',  label: '주의' },
  { value: 'NOTICE',   label: '관심' },
] as const

export function SafetyStockAlertsPage() {
  usePageTitle('안전재고 알림')

  // 클라이언트 필터 — 창고 + 긴급도
  const [warehouseId, setWarehouseId] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('')
  const [configProductId, setConfigProductId] = useState('')
  const [configScopeMode, setConfigScopeMode] = useState<'ALL' | 'SELECTED' | null>(null)
  const [configWarehouseId, setConfigWarehouseId] = useState('')
  const [configThreshold, setConfigThreshold] = useState('')
  const queryClient = useQueryClient()

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const alertsQuery = useQuery({
    queryKey: ['inventory', 'safety-stock-alerts'],
    queryFn: listSafetyStockAlerts,
    refetchInterval: 60_000,
  })

  // 클라이언트 필터링 (창고 + 긴급도)
  const alerts = useMemo<SafetyStockAlert[]>(() => {
    let all = Array.isArray(alertsQuery.data) ? alertsQuery.data : []
    if (warehouseId) {
      all = all.filter((a) => a.warehouseId === warehouseId)
    }
    if (urgencyFilter) {
      all = all.filter(
        (a) => calcUrgencyLevel(a.currentQty, a.threshold) === urgencyFilter,
      )
    }
    return all
  }, [alertsQuery.data, warehouseId, urgencyFilter])

  const products = useMemo(() => {
    const seen = new Set<string>()
    return (Array.isArray(alertsQuery.data) ? alertsQuery.data : []).filter((alert) => {
      if (seen.has(alert.productId)) return false
      seen.add(alert.productId)
      return true
    })
  }, [alertsQuery.data])

  const configMutation = useMutation({
    mutationFn: () => setSafetyStock(configProductId, {
      warehouseId: configScopeMode === 'SELECTED' ? configWarehouseId : null,
      threshold: Number(configThreshold),
      scopeMode: configScopeMode ?? 'ALL',
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'safety-stock-alerts'] })
    },
  })

  const configReady = Boolean(configProductId)
    && configScopeMode !== null
    && (configScopeMode === 'ALL' || Boolean(configWarehouseId))
    && configThreshold.trim() !== ''
    && Number.isInteger(Number(configThreshold))
    && Number(configThreshold) >= 0

  const selectAllConfigScope = () => {
    setConfigScopeMode('ALL')
    setConfigWarehouseId('')
  }

  return (
    <div data-testid="safety-stock-alerts-page">
      {/* 헤더 영역 */}
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
          {/* Designer 4: h3 → h1 */}
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            안전재고 알림
          </h1>
          {/* Designer 2: safety-stock-count */}
          {!alertsQuery.isLoading ? (
            <span
              data-testid="safety-stock-count"
              style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
            >
              임계 미만{' '}
              <strong>{(Array.isArray(alertsQuery.data) ? alertsQuery.data : []).length}건</strong>
              {' · '}1분 자동 갱신
            </span>
          ) : null}
        </div>

        {/* 필터 + 새로고침 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* 창고 필터 */}
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
            {(Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []).map((w: Warehouse) => (
              <option key={w.id} value={w.id}>
                {/* Designer 7: warehouseCode 제거 — warehouseName 단독 표시 */}
                {w.name}
              </option>
            ))}
          </select>

          {/* 긴급도 필터 — Designer 3: 긴급도 컬럼 + 필터 */}
          <select
            data-testid="safety-stock-alerts-urgency-filter"
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            style={{
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 13,
              color: 'var(--color-neutral-800)',
              background: 'var(--color-neutral-0)',
            }}
          >
            {URGENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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

      <section
        aria-labelledby="safety-stock-config-title"
        data-testid="safety-stock-config"
        style={{
          marginBottom: 16,
          padding: 16,
          border: '1px solid var(--color-neutral-200)',
          borderRadius: 8,
          background: 'var(--color-neutral-0)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 id="safety-stock-config-title" style={{ margin: 0, fontSize: 16 }}>안전재고 설정</h2>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
            제품과 범위를 명시한 뒤 저장하세요.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            제품
            <select
              value={configProductId}
              onChange={(event) => setConfigProductId(event.target.value)}
              data-testid="safety-stock-config-product"
              style={{ marginLeft: 6, padding: '6px 8px' }}
            >
              <option value="">제품 선택</option>
              {products.map((product) => (
                <option key={product.productId} value={product.productId}>
                  {product.productCode ?? '제품 코드 미확인'} · {product.productName ?? '제품명 미확인'}
                </option>
              ))}
            </select>
          </label>
          <TagChip
            label="범위"
            value="전체"
            removeLabel="전체 창고 범위"
            onClick={selectAllConfigScope}
            onRemove={configScopeMode === 'ALL' ? () => setConfigScopeMode(null) : undefined}
            data-testid="safety-stock-all-chip"
            role="button"
            tabIndex={0}
          />
          <select
            value={configWarehouseId}
            disabled={configScopeMode === 'ALL'}
            onChange={(event) => {
              setConfigWarehouseId(event.target.value)
              setConfigScopeMode(event.target.value ? 'SELECTED' : null)
            }}
            data-testid="safety-stock-config-warehouse"
            aria-label="안전재고 대상 창고"
            style={{ padding: '6px 8px' }}
          >
            <option value="">창고 선택</option>
            {(Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []).map((warehouse: Warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
            ))}
          </select>
          <Input
            type="number"
            min={0}
            step={1}
            value={configThreshold}
            onChange={(event) => setConfigThreshold(event.target.value)}
            placeholder="임계값"
            aria-label="안전재고 임계값"
            data-testid="safety-stock-config-threshold"
          />
          <Button
            variant="primary"
            disabled={!configReady || configMutation.isPending}
            onClick={() => configMutation.mutate()}
            data-testid="safety-stock-config-save"
          >
            {configMutation.isPending ? '저장 중' : '저장'}
          </Button>
        </div>
        {configScopeMode === null ? (
          <p
            role="alert"
            data-testid="safety-stock-scope-hint"
            style={{ margin: '8px 0 0', color: 'var(--color-neutral-500)', fontSize: 12 }}
          >
            전체로 처리하려면 '전체' 칩을 선택하세요.
          </p>
        ) : null}
      </section>

      {/* 알림 요약 배너 */}
      {(Array.isArray(alertsQuery.data) ? alertsQuery.data : []).length > 0 ? (
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
            <strong>{(Array.isArray(alertsQuery.data) ? alertsQuery.data : []).length}건</strong>이 있습니다.
            발주를 검토하세요.
          </span>
        </div>
      ) : null}

      {/* 로딩 / 빈 상태 / 테이블 */}
      {alertsQuery.isLoading ? (
        <p style={{ color: 'var(--color-neutral-500)', fontSize: 13 }}>
          불러오는 중...
        </p>
      ) : alerts.length === 0 ? (
        /* Designer 2: safety-stock-empty (-alerts- 제거) */
        <div
          data-testid="safety-stock-empty"
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
            {warehouseId || urgencyFilter
              ? '선택 조건에 해당하는 안전재고 미만 품목이 없습니다.'
              : '현재 안전재고 미만 품목이 없습니다.'}
          </span>
        </div>
      ) : (
        /* Designer 2: safety-stock-table (-alerts- 제거) */
        <div
          data-testid="safety-stock-table"
          style={{ overflowX: 'auto' }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              color: 'var(--color-neutral-800)',
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--color-neutral-50)',
                  borderBottom: '2px solid var(--color-neutral-200)',
                }}
              >
                {/* Designer 3: 컬럼 7개 — 제품코드/제품명/현재재고/임계값/부족수량/창고/긴급도 */}
                <Th>제품코드</Th>
                <Th>제품명</Th>
                <Th align="right">현재재고</Th>
                <Th align="right">임계값</Th>
                <Th align="right">부족수량</Th>
                {/* Designer 7: warehouseCode 제거 → 창고명 단독 */}
                <Th>창고</Th>
                <Th>긴급도</Th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => {
                const level = calcUrgencyLevel(a.currentQty, a.threshold)
                return (
                  /* FE F-3 + Designer 2: safety-stock-row-{productCode} */
                  <tr
                    key={`${a.productId}-${a.warehouseId ?? 'GLOBAL'}`}
                    data-testid={`safety-stock-row-${a.productCode}`}
                    style={{
                      borderBottom: '1px solid var(--color-neutral-100)',
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLTableRowElement).style.background =
                        'var(--color-neutral-50)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLTableRowElement).style.background =
                        'transparent'
                    }}
                  >
                    <Td>
                      <code
                        style={{
                          fontSize: 12,
                          color: 'var(--color-neutral-600)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {a.productCode}
                      </code>
                    </Td>
                    <Td>{a.productName}</Td>
                    <Td align="right">
                      <span
                        style={{
                          color: 'var(--color-danger-600)',
                          fontWeight: 600,
                        }}
                      >
                        {a.currentQty.toLocaleString()}
                      </span>
                    </Td>
                    <Td align="right">{a.threshold.toLocaleString()}</Td>
                    <Td align="right">
                      <Badge variant="danger">
                        -{a.shortage.toLocaleString()}
                      </Badge>
                    </Td>
                    {/* Designer 7: warehouseName 단독 표시 */}
                    <Td>
                      {a.warehouseName ?? '전체 창고 합산'}
                    </Td>
                    {/* Designer 1 + Designer 2: safety-stock-badge-{productCode} */}
                    <Td>
                      <UrgencyBadge
                        level={level}
                        data-testid={`safety-stock-badge-${a.productCode}`}
                      />
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** 테이블 헤더 셀 — 내부 helper */
function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <th
      scope="col"
      style={{
        padding: '10px 12px',
        textAlign: align,
        fontWeight: 600,
        fontSize: 12,
        color: 'var(--color-neutral-600)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  )
}

/** 테이블 데이터 셀 — 내부 helper */
function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <td
      style={{
        padding: '10px 12px',
        textAlign: align,
        verticalAlign: 'middle',
      }}
    >
      {children}
    </td>
  )
}
