/**
 * 안전재고 알림 목록 페이지 (`/inventory/safety-stock-alerts`).
 *
 * P1-3 슬라이스. BE `GET /inventory/alerts/safety-stock` backing — TM PR #143 정합.
 * 임계 미만 (productCode, warehouseName) 조합을 표 형태로 표시.
 *
 * UUID 노출 가드 (memory `feedback_uuid_no_user_visibility`):
 * - 화면에는 productCode / productName / warehouseName 만 표시.
 * - productId / warehouseId opaque token 은 path param 으로만 사용, 화면 미노출.
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
import { useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  ProductAutocomplete,
  UrgencyBadge,
  calcUrgencyLevel,
  Input,
  TagChip,
  type ProductOption,
} from '@samhan/design-system'
import {
  listSafetyStockAlerts,
  setSafetyStock,
  type SafetyStockAlert,
} from '../api/safetyStockApi'
import { listWarehouses, type Warehouse } from '../api/inventory'
import { isSelectableProductStatus, searchProducts } from '../api/productApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

/** 범위 미선택 안내 문구 id — 잠긴 저장 버튼/칩에서 aria-describedby 로 사유를 연결(#825 슬5 R1 item4). */
const SCOPE_HINT_ID = 'safety-stock-scope-hint-text'

function saveErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: unknown } | undefined
    if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim()
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return '안전재고 설정 저장에 실패했습니다.'
}

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

  // [#825 슬5 R1 결정2ⓐ] BE @RequirePermission(inventory.safety-stock, UPDATE) 와 정확히
  // 일치하는 page-code/action — 조회 권한(VIEW, 라우트 PermissionGuard)만 있고 설정 권한이
  // 없는 사용자(예: WAREHOUSE 역할 구성에 따라)에게 저장이 항상 403 나는 폼을 그대로
  // 노출하지 않는다.
  const { canAccess } = usePermissions()
  const canUpdate = canAccess('inventory.safety-stock', 'update')

  // 클라이언트 필터 — 창고 + 긴급도
  const [warehouseId, setWarehouseId] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('')
  // [#825 슬5 R1 결정2ⓒ] 제품 선택을 alertsQuery(알림 목록)에서 파생하지 않는다 — 알림이
  // 없는(=아직 설정이 없거나 재고가 충분한) 제품은 목록에 존재하지 않아, 알림 파생 옵션만으로는
  // "알림이 뜬 제품만 최초 설정 가능"한 순환 구조가 된다. product-service 전체 검색
  // (ProductAutocomplete)으로 대체해 모든 제품에 최초 임계값을 설정할 수 있게 한다.
  const [configProduct, setConfigProduct] = useState<ProductOption | null>(null)
  const [configScopeMode, setConfigScopeMode] = useState<'ALL' | 'SELECTED' | null>(null)
  const [configWarehouseId, setConfigWarehouseId] = useState('')
  const [configThreshold, setConfigThreshold] = useState('')
  const allScopeChipRef = useRef<HTMLSpanElement | null>(null)
  const queryClient = useQueryClient()

  const focusAllScopeChip = () => {
    setTimeout(() => {
      allScopeChipRef.current?.querySelector<HTMLElement>('[role="button"]')?.focus()
    }, 0)
  }

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const alertsQuery = useQuery({
    queryKey: ['inventory', 'safety-stock-alerts'],
    queryFn: listSafetyStockAlerts,
    refetchInterval: 60_000,
  })

  // 창고 목록과 알림 응답이 동일한 opaque warehouseId 축을 사용하므로 문자열을 직접 매칭한다.
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

  const configMutation = useMutation({
    mutationFn: () => {
      if (configScopeMode === null) {
        // 방어적 가드 — 저장 버튼이 이미 configScopeMode!==null 을 강제하므로 정상 경로로는
        // 도달하지 않는다. 도달 시에도 '전체'로 무음 폴백하지 않고 명시적으로 거부한다
        // (#825 슬5 R1 item10 — 방어 방향은 reject 여야 한다).
        throw new Error('범위를 선택하지 않아 저장할 수 없습니다. 전체 또는 창고를 선택하세요.')
      }
      if (!configProduct) {
        throw new Error('제품을 먼저 선택하세요.')
      }
      return setSafetyStock(configProduct.id, {
        warehouseId: configScopeMode === 'SELECTED' ? configWarehouseId : null,
        threshold: Number(configThreshold),
        scopeMode: configScopeMode,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'safety-stock-alerts'] })
    },
  })

  const postSaveAlertsRefreshing = configMutation.isSuccess && alertsQuery.isFetching
  const postSaveAlertsRefreshFailed = configMutation.isSuccess && alertsQuery.isError

  const configReady = Boolean(configProduct)
    && configScopeMode !== null
    && (configScopeMode === 'ALL' || Boolean(configWarehouseId))
    && configThreshold.trim() !== ''
    && Number.isInteger(Number(configThreshold))
    && Number(configThreshold) >= 0

  const selectAllConfigScope = () => {
    setConfigScopeMode('ALL')
    setConfigWarehouseId('')
    configMutation.reset()
  }

  const toggleAllConfigScope = () => {
    if (configScopeMode === 'ALL') {
      setConfigScopeMode(null)
      configMutation.reset()
      return
    }
    selectAllConfigScope()
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
        {!canUpdate ? (
          // --state-danger(#EF4444) 는 흰 배경 12px 텍스트 대비 3.76:1(AA 미달)이라 사용하지 않는다.
          // 이 화면이 이미 쓰는 --color-danger-700(대비 8.3:1, "재고 부족 경고" 배너와 동일 톤) 재사용.
          <p style={{ margin: '0 0 12px', color: 'var(--color-danger-700)', fontSize: 12 }}>
            안전재고 설정 권한이 없습니다 — 안전재고 설정 권한 보유자만 가능합니다.
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* [#825 슬5 R1 CM4 재발 방지] 공용 wrapper 가 width:100% 라 인라인 flex 행에서
              단독 행으로 감겨 설정 행 정렬이 붕괴한다(DailyClosingPage.tsx:601 선례) —
              폭 제약 래퍼로 인라인 복원. */}
          <div style={{ width: 260, flex: '0 0 260px' }}>
            <ProductAutocomplete
              value={configProduct}
              onChange={(product) => {
                setConfigProduct(product)
                configMutation.reset()
              }}
              searchProducts={async (query) => (await searchProducts(query)).filter((product) => isSelectableProductStatus(product.status))}
              label=""
              ariaLabel="제품"
              placeholder="모델명 또는 품목명 검색"
              disabled={!canUpdate}
            />
          </div>
          <TagChip
            label="범위"
            value="전체"
            removeLabel="전체 창고 범위"
            onClick={canUpdate ? toggleAllConfigScope : undefined}
            ref={allScopeChipRef}
            onRemove={configScopeMode === 'ALL' && canUpdate ? () => {
              setConfigScopeMode(null)
              configMutation.reset()
              focusAllScopeChip()
            } : undefined}
            data-testid="safety-stock-all-chip"
            className={!canUpdate ? 'scope-chip--disabled' : undefined}
            role={canUpdate ? 'button' : undefined}
            tabIndex={canUpdate ? 0 : undefined}
            aria-pressed={canUpdate ? configScopeMode === 'ALL' : undefined}
            aria-describedby={canUpdate && configScopeMode === null ? SCOPE_HINT_ID : undefined}
          />
          <select
            value={configWarehouseId}
            disabled={configScopeMode === 'ALL' || !canUpdate}
            onChange={(event) => {
              setConfigWarehouseId(event.target.value)
              setConfigScopeMode(event.target.value ? 'SELECTED' : null)
              configMutation.reset()
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
          {/* [#825 슬5 R1 item11] Input 기본 fullWidth=true 가 이 인라인 flex 행에서 폭 100%로
              늘어나 레이아웃을 붕괴시킨다 — DailyClosingPage.tsx:601 CM4 와 동일 함정의 재발.
              PartnerAutocomplete 와 달리 Input 은 fullWidth prop 을 직접 지원하므로 그 해법을
              그대로(폭 제약) 적용하되 래퍼 div 대신 컴포넌트 자체의 fullWidth=false 로 해소한다. */}
          <Input
            type="number"
            min={0}
            step={1}
            value={configThreshold}
            onChange={(event) => {
              setConfigThreshold(event.target.value)
              configMutation.reset()
            }}
            placeholder="임계값"
            aria-label="안전재고 임계값"
            data-testid="safety-stock-config-threshold"
            disabled={!canUpdate}
            fullWidth={false}
          />
          <Button
            variant="primary"
            disabled={!configReady || configMutation.isPending || !canUpdate}
            onClick={() => configMutation.mutate()}
            data-testid="safety-stock-config-save"
            aria-describedby={configScopeMode === null ? SCOPE_HINT_ID : undefined}
          >
            {configMutation.isPending ? '저장 중' : '저장'}
          </Button>
        </div>
        {configScopeMode === null ? (
          // #825 슬5 R1 item12 — 상시 표시 안내는 role="alert"(긴급/동적 공지 전용) 대신
          // role="status"(polite)로, 색은 대비가 더 넉넉한 --ink-secondary 로 세 화면 통일.
          <p
            role="status"
            id={SCOPE_HINT_ID}
            data-testid="safety-stock-scope-hint"
            style={{ margin: '8px 0 0', color: 'var(--ink-secondary, #5C6773)', fontSize: 12 }}
          >
            {canUpdate
              ? "전체로 처리하려면 '전체' 칩을 선택하세요. 특정 창고만 처리하려면 창고를 선택하세요."
              : '안전재고 설정 권한이 없어 범위를 선택하거나 저장할 수 없습니다. 권한 보유자에게 요청하세요.'}
          </p>
        ) : null}
        {/* [#825 슬5 R1 결정2ⓑ] 저장 성공/실패 피드백 — 종전에는 onError 가 없어 실패(예: 존재하지
            않는 productId 의 404)가 화면에 아무 변화 없이 무피드백이었다(라이브 QA d2-f3 로 실증). */}
        {configMutation.isSuccess ? (
          // --state-success(#10B981) 는 흰 배경 텍스트 대비 2.54:1(AA 미달)이라 사용하지 않는다.
          // 기존 SP-08-6-2 .success-banner(어두운 텍스트 #047857 on 연한 배경, 대비 5.2:1) 재사용.
          <div
            role="status"
            data-testid="safety-stock-config-save-success"
            className="success-banner"
            style={{ marginTop: 8, fontSize: 12 }}
          >
            안전재고 설정을 저장했습니다.
          </div>
        ) : null}
        {configMutation.isError ? (
          <div
            role="alert"
            data-testid="safety-stock-config-save-error"
            className="error-banner"
            style={{ marginTop: 8, fontSize: 12 }}
          >
            {saveErrorMessage(configMutation.error)}
          </div>
        ) : null}
        {postSaveAlertsRefreshing ? (
          <p
            role="status"
            data-testid="safety-stock-alerts-refreshing"
            style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-neutral-600)' }}
          >
            저장은 완료됐습니다. 안전재고 알림을 새로 고치는 중입니다.
          </p>
        ) : null}
        {postSaveAlertsRefreshFailed ? (
          <p
            role="alert"
            data-testid="safety-stock-alerts-refresh-error"
            style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-danger-700)' }}
          >
            저장은 완료됐지만 안전재고 알림을 새로 고치지 못했습니다. 잠시 후 다시 시도하세요.
          </p>
        ) : null}
      </section>

      {/* 알림 요약 배너 */}
      {(Array.isArray(alertsQuery.data) ? alertsQuery.data : []).length > 0
        && !postSaveAlertsRefreshing
        && !postSaveAlertsRefreshFailed ? (
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
