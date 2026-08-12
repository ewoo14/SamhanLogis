/**
 * 재고 현황 조회 페이지 (`/inventory/stock-balance`) — Phase 2.6c 신규.
 *
 * <h2>핵심 신규 기능 (Phase 2.6c 도메인 모델)</h2>
 * <p>재고를 <b>가용재고 / 실재고 / 예약재고</b> 3구분으로 표시한다.
 * <ul>
 *   <li>가용재고(availableQty) = 실재고 - 예약재고 — 전환(전표 발행) 가능 수량</li>
 *   <li>실재고(totalQty) = 물리 보유 수량</li>
 *   <li>예약재고(reservedQty) = 주문 전환(reserve) 으로 잠긴 수량</li>
 * </ul>
 *
 * <h2>BE endpoint</h2>
 * <p>`GET /inventory/balances` — `StockBalanceResponse` 리스트 (warehouseId 필터 + 페이지).
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>화면 노출 식별자 = productCode / productName / warehouseCode / warehouseName 만.
 * productId / warehouseId 는 API 파라미터 전용, 화면 미노출. (feedback_uuid_no_user_visibility)
 *
 * <h2>design-system 컴포넌트</h2>
 * <ul>
 *   <li>{@code Button} — 조회 버튼</li>
 *   <li>{@code Badge} — 창고 타입 + 가용수량 강조</li>
 *   <li>{@code DataGrid} — 재고 matrix (열 필터 + 다중 선택 + 복사)</li>
 * </ul>
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code inventory-balance-warehouse-select} — 창고 필터</li>
 *   <li>{@code inventory-balance-query-button} — 조회 버튼</li>
 *   <li>{@code inventory-balance-grid} — DataGrid wrapper</li>
 *   <li>{@code inventory-balance-summary} — 하단 요약</li>
 * </ul>
 *
 * <h2>페이지네이션</h2>
 * <p>서버 page/size 파라미터 연동. 기본 50건/페이지. 대량 데이터 대비.
 * 총 페이지 하단 페이지 버튼으로 이동.
 */
import { useState, useCallback, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, DataGrid, type DataGridColumn } from '@samhan/design-system'
import {
  listStockBalances,
  listWarehouses,
  type StockBalanceListRow,
  type WarehouseType,
  listStockInstances,
  updateStockInstanceQuality,
  getStockLedger,
} from '../../api/inventory'
import { usePageTitle } from '../../hooks/usePageTitle'
import { StockInstanceListModal } from './StockInstanceListModal'
import { StockLedgerModal } from './StockLedgerModal'

// ---------------------------------------------------------------------------
// 페이지당 행 수 (서버 page/size 파라미터 연동)
// ---------------------------------------------------------------------------
const PAGE_SIZE = 50

// ---------------------------------------------------------------------------
// 창고 타입 → 뱃지 variant
// ---------------------------------------------------------------------------

const WAREHOUSE_TYPE_VARIANT: Record<
  WarehouseType,
  'brand' | 'neutral' | 'success' | 'warning'
> = {
  HEADQUARTERS: 'brand',
  VEHICLE: 'success',
  CONSIGNMENT: 'warning',
  VIRTUAL: 'neutral',
}

const WAREHOUSE_TYPE_LABEL: Record<WarehouseType, string> = {
  HEADQUARTERS: '본사',
  VEHICLE: '차량',
  CONSIGNMENT: '위탁',
  VIRTUAL: '가상',
}

// ---------------------------------------------------------------------------
// 수량 포맷 헬퍼
// ---------------------------------------------------------------------------

function fmtQty(v: unknown): string {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('ko-KR')
}

// ---------------------------------------------------------------------------
// DataGrid 컬럼 정의 (가용/실재고/예약 3구분이 핵심)
// ---------------------------------------------------------------------------

const COLUMNS: DataGridColumn<StockBalanceListRow>[] = [
  {
    key: 'productCode',
    label: '품목코드',
    width: 140,
    filter: 'text',
    align: 'left',
  },
  {
    key: 'productName',
    label: '품목명',
    width: 220,
    filter: 'text',
    align: 'left',
  },
  {
    key: 'warehouseCode',
    label: '창고코드',
    width: 90,
    filter: 'text',
    align: 'left',
  },
  {
    key: 'warehouseName',
    label: '창고명',
    width: 130,
    filter: 'text',
    align: 'left',
  },
  {
    key: 'warehouseType',
    label: '창고구분',
    width: 80,
    filter: false,
    align: 'center',
    render: (row) => (
      <Badge variant={WAREHOUSE_TYPE_VARIANT[row.warehouseType]}>{WAREHOUSE_TYPE_LABEL[row.warehouseType]}</Badge>
    ),
  },
  {
    key: 'availableQty',
    label: '가용재고',
    width: 90,
    filter: false,
    align: 'right',
    copyValue: (row) => row.warehouseType === 'VIRTUAL' ? '—' : String(row.availableQty),
    render: (row) => {
      const isZero = row.availableQty === 0
      const isVirtual = row.warehouseType === 'VIRTUAL'
      return (
        <span
          style={{
            fontWeight: isZero && !isVirtual ? 600 : undefined,
            // design-system 토큰: --color-danger-700(#991B1B) 가용 0 강조 / --color-neutral-400(#8E97A4) 가상창고
            color: isZero && !isVirtual
              ? 'var(--color-danger-700, #991B1B)'
              : isVirtual
                ? 'var(--color-neutral-400, #8E97A4)'
                : undefined,
          }}
        >
          {isVirtual ? '—' : fmtQty(row.availableQty)}
        </span>
      )
    },
  },
  {
    key: 'reservedQty',
    label: '예약재고',
    width: 90,
    filter: false,
    align: 'right',
    copyValue: (row) => row.warehouseType === 'VIRTUAL' ? '—' : String(row.reservedQty),
    render: (row) => {
      const isVirtual = row.warehouseType === 'VIRTUAL'
      return (
        <span style={{ color: isVirtual ? 'var(--color-neutral-400, #8E97A4)' : undefined }}>
          {isVirtual ? '—' : fmtQty(row.reservedQty)}
        </span>
      )
    },
  },
  {
    key: 'totalQty',
    label: '실재고',
    width: 90,
    filter: false,
    align: 'right',
    copyValue: (row) => row.warehouseType === 'VIRTUAL' ? '—' : String(row.totalQty),
    render: (row) => {
      const isVirtual = row.warehouseType === 'VIRTUAL'
      return (
        <span style={{ color: isVirtual ? 'var(--color-neutral-400, #8E97A4)' : undefined }}>
          {isVirtual ? '—' : fmtQty(row.totalQty)}
        </span>
      )
    },
  },
]

// ---------------------------------------------------------------------------
// 에러 메시지 추출
// ---------------------------------------------------------------------------

function errorMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  return '재고 조회 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

/**
 * 재고 현황 조회 페이지.
 *
 * 가용재고/실재고/예약재고 3구분 표시. 창고 필터 + "조회" 버튼.
 * 가용재고 0 건 → 빨강 강조 (전환 불가 경고).
 */
export function InventoryStockBalancePage() {
  usePageTitle('재고 현황')

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('')
  const [queryWarehouseId, setQueryWarehouseId] = useState<string | undefined>(undefined)
  const [queried, setQueried] = useState(false)
  /** 현재 페이지 (0-based, 서버 page 파라미터 연동) */
  const [currentPage, setCurrentPage] = useState(0)
  const [instanceProductCode, setInstanceProductCode] = useState<string | null>(null)
  const [ledgerProductCode, setLedgerProductCode] = useState<string | null>(null)
  const [ledgerRange, setLedgerRange] = useState<{ start: string; end: string } | undefined>(undefined)
  const queryClient = useQueryClient()

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const balancesQuery = useQuery({
    queryKey: ['inventory-balances', queryWarehouseId, currentPage],
    queryFn: () =>
      listStockBalances({
        warehouseId: queryWarehouseId || undefined,
        page: currentPage,
        size: PAGE_SIZE,
      }),
    enabled: queried,
  })

  const instancesQuery = useQuery({
    queryKey: ['inventory-instances', instanceProductCode],
    queryFn: () => listStockInstances(instanceProductCode!),
    enabled: instanceProductCode !== null,
  })
  const qualityMutation = useMutation({
    mutationFn: ({ serialKey, quality }: { serialKey: string; quality: Parameters<typeof updateStockInstanceQuality>[1] }) =>
      updateStockInstanceQuality(serialKey, quality),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory-instances', instanceProductCode] }),
  })
  const ledgerQuery = useQuery({
    queryKey: ['inventory-ledger', ledgerProductCode, ledgerRange?.start, ledgerRange?.end],
    queryFn: () => getStockLedger(ledgerProductCode!, ledgerRange?.start, ledgerRange?.end),
    enabled: ledgerProductCode !== null,
  })

  const handleQuery = useCallback(() => {
    setCurrentPage(0)
    setQueryWarehouseId(selectedWarehouseId || undefined)
    setQueried(true)
  }, [selectedWarehouseId])

  const rows = balancesQuery.data?.content ?? []
  // product-service 누락 행은 같은 표시 문구를 공유할 수 있으므로 품목 UUID를 화면 key로
  // 되살리지 않는다. 페이지 내 순번을 붙여 React key 충돌만 방지한다.
  const rowKeyByRow = new Map(
    rows.map((row, index) => [row, `${row.productCode}-${row.warehouseCode}-${index}`] as const),
  )
  const totalElements = balancesQuery.data?.totalElements ?? 0
  const totalPages = balancesQuery.data?.totalPages ?? 1
  const zeroAvailableCount = rows.filter(
    (r) => r.availableQty === 0 && r.warehouseType !== 'VIRTUAL',
  ).length

  const columns = COLUMNS.map((column) => column.key === 'productCode'
    ? { ...column, render: (row: StockBalanceListRow) => (
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setInstanceProductCode(row.productCode)}
          style={productLinkStyle}
          aria-label={`${row.productCode} 품목리스트 열기`}
        >{row.productCode}</button>
        <button
          type="button"
          onClick={() => { setLedgerRange(undefined); setLedgerProductCode(row.productCode) }}
          style={ledgerLinkStyle}
          aria-label={`${row.productCode} 재고수불부 열기`}
        >수불부</button>
      </span>
      ) }
    : column)

  return (
    <div style={pageStyle}>
      {/* ── 헤더 ─────────────────────────────────────────── */}
      <div style={headerRowStyle}>
        <h3 style={{ margin: 0 }}>재고 현황</h3>
        <span style={subtitleStyle}>
          가용재고 / 실재고 / 예약재고 3구분 표시
        </span>
      </div>

      {/* ── 범례 ─────────────────────────────────────────── */}
      <div style={legendStyle} aria-label="수량 구분 안내">
        <span style={legendItemStyle}>
          {/* 가용재고 도트: brand-500(#2D77A8) — 실제 가용재고 기본 텍스트와 일관 */}
          <span style={legendDotStyle('var(--color-brand-500, #2D77A8)')} />
          <strong>가용재고</strong> = 실재고 &minus; 예약재고 (전환 가능)
        </span>
        <span style={legendItemStyle}>
          {/* 예약재고 도트: neutral-500(#6B7280) */}
          <span style={legendDotStyle('var(--color-neutral-500, #6B7280)')} />
          <strong>예약재고</strong> = 전환(전표 발행) 으로 잠긴 수량
        </span>
        <span style={legendItemStyle}>
          {/* 실재고 도트: neutral-700(#363D49) */}
          <span style={legendDotStyle('var(--color-neutral-700, #363D49)')} />
          <strong>실재고</strong> = 물리 보유 수량
        </span>
        <span style={{ ...legendItemStyle, color: 'var(--color-danger-700, #991B1B)', fontWeight: 500 }}>
          가용 0 → 빨강 강조 (전환 불가)
        </span>
        <span style={{ ...legendItemStyle, color: 'var(--color-neutral-500, #6B7280)' }}>
          가상 창고(VIRTUAL): 수량 개념 없음 (— 표시)
        </span>
      </div>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <section style={toolbarStyle} aria-label="조회 조건">
        <div style={fieldStyle}>
          <span style={fieldLabelStyle}>창고</span>
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            data-testid="inventory-balance-warehouse-select"
            style={{ ...inputStyle, minWidth: 160 }}
          >
            <option value="">전체 창고</option>
            {(warehousesQuery.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <Button
            variant="primary"
            onClick={handleQuery}
            loading={balancesQuery.isFetching}
            disabled={balancesQuery.isFetching}
            data-testid="inventory-balance-query-button"
          >
            조회
          </Button>
          {balancesQuery.isError ? (
            <span role="alert" style={errorBannerStyle}>
              {errorMsg(balancesQuery.error)}
            </span>
          ) : null}
        </div>
      </section>

      {/* ── DataGrid 본문 ─────────────────────────────────── */}
      <section style={gridSectionStyle} data-testid="inventory-balance-grid">
        <DataGrid<StockBalanceListRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => rowKeyByRow.get(row) ?? `${row.productCode}-${row.warehouseCode}`}
          loading={balancesQuery.isFetching}
          emptyMessage={
            !queried
              ? '"조회" 버튼을 눌러 재고 현황을 불러오세요.'
              : '조회 결과가 없습니다.'
          }
          enableMultiSelect={true}
          enableCopy={true}
          className={undefined}
        />
      </section>

      {/* ── 하단 요약 + 페이지네이션 ─────────────────────── */}
      {queried && !balancesQuery.isFetching && rows.length > 0 ? (
        <div style={summaryStyle} data-testid="inventory-balance-summary">
          <span>
            총 <strong>{totalElements.toLocaleString('ko-KR')}</strong>건
          </span>
          {zeroAvailableCount > 0 ? (
            <span
              style={{
                marginLeft: 16,
                color: 'var(--color-danger-700, #991B1B)',
                fontWeight: 500,
              }}
            >
              가용재고 0 품목: <strong>{zeroAvailableCount}</strong>건 (전환 불가)
            </span>
          ) : null}
          {/* 페이지네이션 — 총 페이지 > 1 시 노출 */}
          {totalPages > 1 ? (
            <div style={paginationStyle}>
              <button
                style={pageButtonStyle}
                disabled={currentPage === 0 || balancesQuery.isFetching}
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                aria-label="이전 페이지"
              >
                이전
              </button>
              <span style={pageInfoStyle}>
                {currentPage + 1} / {totalPages}
              </span>
              <button
                style={pageButtonStyle}
                disabled={currentPage >= totalPages - 1 || balancesQuery.isFetching}
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                aria-label="다음 페이지"
              >
                다음
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {instanceProductCode !== null ? (
        <StockInstanceListModal
          open
          productCode={instanceProductCode}
          rows={instancesQuery.data ?? []}
          onClose={() => setInstanceProductCode(null)}
          onQualityChange={(serialKey, quality) => qualityMutation.mutate({ serialKey, quality })}
        />
      ) : null}
      {ledgerProductCode !== null ? (
        <StockLedgerModal
          open
          data={ledgerQuery.data}
          onClose={() => setLedgerProductCode(null)}
          onRangeChange={(startDate, endDate) => setLedgerRange({ start: startDate, end: endDate })}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 스타일
// ---------------------------------------------------------------------------

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  height: '100%',
}

const productLinkStyle: CSSProperties = {
  border: 0,
  padding: 0,
  background: 'transparent',
  color: 'var(--color-brand-700, #185B86)',
  textDecoration: 'underline',
  cursor: 'pointer',
  font: 'inherit',
}

const ledgerLinkStyle: CSSProperties = {
  border: 0,
  padding: 0,
  background: 'transparent',
  color: 'var(--color-neutral-600, #4B5563)',
  textDecoration: 'underline',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 11,
}

const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  flexWrap: 'wrap',
}

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-neutral-500, #6B7280)',
}

const legendStyle: CSSProperties = {
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap',
  fontSize: 12,
  color: 'var(--color-neutral-700, #363D49)',
  padding: '8px 12px',
  background: 'var(--color-neutral-50, #F7F8FA)',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 6,
}

const legendItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

function legendDotStyle(color: string): CSSProperties {
  return {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  padding: '12px 16px',
  background: 'var(--color-bg, #FFFFFF)',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 8,
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const fieldLabelStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-neutral-700, #363D49)',
  fontWeight: 500,
}

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 13,
  outline: 'none',
}

// 인라인 에러 배너 (조회 버튼 옆) — WCAG AA 대비 7.8:1 (--color-danger-700 on #FEF2F2)
const errorBannerStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-danger-700, #991B1B)',
  background: '#FEF2F2',
  border: '1px solid var(--color-danger-200, #FECACA)',
  borderRadius: 4,
  padding: '4px 8px',
}

const gridSectionStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
}

const summaryStyle: CSSProperties = {
  padding: '8px 12px',
  background: 'var(--color-neutral-50, #F7F8FA)',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 6,
  fontSize: 13,
  color: 'var(--color-neutral-700, #363D49)',
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
}

const paginationStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginLeft: 'auto',
}

const pageButtonStyle: CSSProperties = {
  appearance: 'none',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 4,
  background: 'var(--color-bg, #FFFFFF)',
  color: 'var(--color-neutral-700, #363D49)',
  padding: '2px 10px',
  fontSize: 12,
  cursor: 'pointer',
}

const pageInfoStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-neutral-500, #6B7280)',
  minWidth: 48,
  textAlign: 'center',
}
