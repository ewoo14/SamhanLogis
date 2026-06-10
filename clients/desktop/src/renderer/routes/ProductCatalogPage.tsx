/**
 * 품목 관리 페이지 (`/products/catalog`) — PR-B 품목 노출 수동 토글 신설.
 *
 * <h2>핵심 기능</h2>
 * <ul>
 *   <li>전 품목 목록 (제한 없음 — products.list VIEW)</li>
 *   <li>컬럼: 모델명 / 카테고리 / 견적 노출 / 주문 노출 / 출처 뱃지 / displayOrder</li>
 *   <li>수동 토글: '견적 노출' / '주문 노출' 체크 2개 → usageScope 매핑 → PATCH</li>
 *   <li>estimateCategory 셀렉트: ESTIMATE/BOTH 선택 시에만 노출</li>
 *   <li>시트 자동 복귀 버튼: DELETE /usage</li>
 * </ul>
 *
 * <h2>게이트</h2>
 * <ul>
 *   <li>페이지 진입: products.list VIEW (PermissionGuard)</li>
 *   <li>토글/복귀 CTA: products.admin UPDATE (canAccess 기반 read-only)</li>
 * </ul>
 *
 * <h2>UUID 비공개</h2>
 * <p>modelCode (modelName 동일값) 만 사용자에게 표시. id(UUID) 미노출.
 *
 * <h2>design-system 컴포넌트</h2>
 * <ul>
 *   <li>{@code Button} — 조회, 시트 자동 복귀</li>
 *   <li>{@code Badge} — 출처 뱃지 (시트 자동 / 수동)</li>
 *   <li>{@code DataTable} — 품목 목록</li>
 * </ul>
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code product-catalog-search-input} — 모델명 검색</li>
 *   <li>{@code product-catalog-query-button} — 조회 버튼</li>
 *   <li>{@code product-catalog-table} — DataTable wrapper</li>
 *   <li>{@code product-catalog-row-{modelCode}} — 각 행</li>
 *   <li>{@code product-catalog-estimate-toggle-{modelCode}} — 견적 노출 체크박스</li>
 *   <li>{@code product-catalog-order-toggle-{modelCode}} — 주문 노출 체크박스</li>
 *   <li>{@code product-catalog-estimate-category-{modelCode}} — 카테고리 셀렉트</li>
 *   <li>{@code product-catalog-clear-{modelCode}} — 시트 자동 복귀 버튼</li>
 *   <li>{@code product-catalog-source-badge-{modelCode}} — 출처 뱃지</li>
 * </ul>
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, DataTable, type DataTableColumn } from '@samhan/design-system'
import {
  listProducts,
  updateProductUsage,
  clearProductUsage,
  type ProductCatalogRow,
  type EstimateCategory,
  type UsageScope,
} from '../api/productCatalogApi'
import { usePageTitleStore } from '../stores/pageTitle'
import { usePermissions } from '../hooks/usePermissions'

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50

const ESTIMATE_CATEGORY_LABEL: Record<EstimateCategory, string> = {
  HOME_MULTI: '홈멀티',
  SINGLE_SET: '단일 세트',
  COMMERCIAL_MULTI: '상업멀티',
  LEGACY: '레거시',
  OTHER: '기타',
}

const ESTIMATE_CATEGORY_OPTIONS: Array<{ value: EstimateCategory; label: string }> = [
  { value: 'HOME_MULTI', label: '홈멀티' },
  { value: 'SINGLE_SET', label: '단일 세트' },
  { value: 'COMMERCIAL_MULTI', label: '상업멀티' },
  { value: 'LEGACY', label: '레거시' },
  { value: 'OTHER', label: '기타' },
]

// ---------------------------------------------------------------------------
// usageScope 체크박스 ↔ enum 매핑
// ---------------------------------------------------------------------------

function toUsageScope(estimate: boolean, order: boolean): UsageScope {
  if (estimate && order) return 'BOTH'
  if (estimate) return 'ESTIMATE'
  if (order) return 'PARTNER_ORDER'
  return 'NONE'
}

function fromUsageScope(scope: UsageScope): { estimate: boolean; order: boolean } {
  return {
    estimate: scope === 'ESTIMATE' || scope === 'BOTH',
    order: scope === 'PARTNER_ORDER' || scope === 'BOTH',
  }
}

// ---------------------------------------------------------------------------
// 에러 메시지 추출
// ---------------------------------------------------------------------------

function errorMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  return '처리 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

// ---------------------------------------------------------------------------
// 토글 행 컴포넌트 (인라인 — 토글 + 카테고리)
// ---------------------------------------------------------------------------

interface ToggleCellProps {
  row: ProductCatalogRow
  canEdit: boolean
  onPatch: (modelCode: string, scope: UsageScope, estimateCategory: EstimateCategory | null) => void
  onClear: (modelCode: string) => void
  patchLoading: boolean
  clearLoading: boolean
}

function ToggleCell({ row, canEdit, onPatch, onClear, patchLoading, clearLoading }: ToggleCellProps) {
  const { estimate, order } = fromUsageScope(row.usageScope)

  const handleEstimateChange = (checked: boolean) => {
    const newScope = toUsageScope(checked, order)
    const cat = (checked || order) ? (row.estimateCategory ?? null) : null
    onPatch(row.modelCode, newScope, cat)
  }

  const handleOrderChange = (checked: boolean) => {
    const newScope = toUsageScope(estimate, checked)
    const cat = (estimate || checked) ? (row.estimateCategory ?? null) : null
    onPatch(row.modelCode, newScope, cat)
  }

  const handleCategoryChange = (value: string) => {
    onPatch(
      row.modelCode,
      row.usageScope,
      value ? (value as EstimateCategory) : null,
    )
  }

  const showEstimateCategory = estimate && (row.usageScope === 'ESTIMATE' || row.usageScope === 'BOTH')
  const isLoading = patchLoading || clearLoading

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={estimate}
          disabled={!canEdit || isLoading}
          onChange={(e) => handleEstimateChange(e.target.checked)}
          data-testid={`product-catalog-estimate-toggle-${row.modelCode}`}
        />
        견적
      </label>
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={order}
          disabled={!canEdit || isLoading}
          onChange={(e) => handleOrderChange(e.target.checked)}
          data-testid={`product-catalog-order-toggle-${row.modelCode}`}
        />
        주문
      </label>
      {showEstimateCategory ? (
        <select
          value={row.estimateCategory ?? ''}
          disabled={!canEdit || isLoading}
          onChange={(e) => handleCategoryChange(e.target.value)}
          data-testid={`product-catalog-estimate-category-${row.modelCode}`}
          style={selectSmallStyle}
        >
          <option value="">카테고리 선택</option>
          {ESTIMATE_CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : null}
      {row.usageScopeManual && canEdit ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onClear(row.modelCode)}
          loading={clearLoading}
          disabled={isLoading}
          data-testid={`product-catalog-clear-${row.modelCode}`}
        >
          시트 자동 복귀
        </Button>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

/**
 * 품목 관리 페이지 — 전 품목 목록 + usageScope 수동 토글.
 */
export function ProductCatalogPage() {
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canEdit = canAccess('products.admin', 'update')

  const [searchInput, setSearchInput] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(0)

  // 활성 패치/클리어 중인 modelCode 추적
  const [patchingCode, setPatchingCode] = useState<string | null>(null)
  const [clearingCode, setClearingCode] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  useEffect(() => {
    setPageTitle({ title: '품목 관리', meta: '상품' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  const listQuery = useQuery({
    queryKey: ['product-catalog', committedSearch, currentPage],
    queryFn: () =>
      listProducts({
        q: committedSearch || undefined,
        page: currentPage,
        size: PAGE_SIZE,
      }),
    staleTime: 30_000,
  })

  const patchMutation = useMutation({
    mutationFn: ({
      modelCode,
      scope,
      estimateCategory,
    }: {
      modelCode: string
      scope: UsageScope
      estimateCategory: EstimateCategory | null
    }) =>
      updateProductUsage(modelCode, {
        usageScope: scope,
        estimateCategory: estimateCategory ?? null,
      }),
    onSuccess: () => {
      setMutationError(null)
      setPatchingCode(null)
      void queryClient.invalidateQueries({ queryKey: ['product-catalog'] })
    },
    onError: (err) => {
      setMutationError(errorMsg(err))
      setPatchingCode(null)
    },
  })

  const clearMutation = useMutation({
    mutationFn: (modelCode: string) => clearProductUsage(modelCode),
    onSuccess: () => {
      setMutationError(null)
      setClearingCode(null)
      void queryClient.invalidateQueries({ queryKey: ['product-catalog'] })
    },
    onError: (err) => {
      setMutationError(errorMsg(err))
      setClearingCode(null)
    },
  })

  const handleQuery = useCallback(() => {
    setCurrentPage(0)
    setCommittedSearch(searchInput)
  }, [searchInput])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleQuery()
    },
    [handleQuery],
  )

  const handlePatch = useCallback(
    (modelCode: string, scope: UsageScope, estimateCategory: EstimateCategory | null) => {
      setPatchingCode(modelCode)
      setMutationError(null)
      patchMutation.mutate({ modelCode, scope, estimateCategory })
    },
    [patchMutation],
  )

  const handleClear = useCallback(
    (modelCode: string) => {
      setClearingCode(modelCode)
      setMutationError(null)
      clearMutation.mutate(modelCode)
    },
    [clearMutation],
  )

  const rows = listQuery.data?.content ?? []
  const totalElements = listQuery.data?.totalElements ?? 0
  const totalPages = listQuery.data?.totalPages ?? 1

  // ---------------------------------------------------------------------------
  // DataTable 컬럼 정의
  // ---------------------------------------------------------------------------

  const columns: DataTableColumn<ProductCatalogRow>[] = [
    {
      key: 'modelCode',
      header: '모델명',
      width: '160px',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.modelCode}</span>
      ),
    },
    {
      key: 'name',
      header: '품목명',
      width: '220px',
    },
    {
      key: 'estimateCategory',
      header: '카테고리',
      width: '100px',
      render: (row) =>
        row.estimateCategory
          ? ESTIMATE_CATEGORY_LABEL[row.estimateCategory]
          : '—',
    },
    {
      key: 'usageScope',
      header: '노출 설정',
      width: '320px',
      render: (row) => (
        <ToggleCell
          row={row}
          canEdit={canEdit}
          onPatch={handlePatch}
          onClear={handleClear}
          patchLoading={patchingCode === row.modelCode}
          clearLoading={clearingCode === row.modelCode}
        />
      ),
    },
    {
      key: 'usageScopeManual',
      header: '출처',
      width: '90px',
      render: (row) => (
        <Badge
          variant={row.usageScopeManual ? 'warning' : 'neutral'}
          data-testid={`product-catalog-source-badge-${row.modelCode}`}
        >
          {row.usageScopeManual ? '수동' : '시트자동'}
        </Badge>
      ),
    },
    {
      key: 'displayOrder',
      header: '표시순서',
      width: '80px',
      render: (row) =>
        row.displayOrder != null ? String(row.displayOrder) : '—',
    },
  ]

  return (
    <div style={pageStyle}>
      {/* ── 헤더 ─────────────────────────────────────── */}
      <div style={headerRowStyle}>
        <h3 style={{ margin: 0 }}>품목 관리</h3>
        <span style={subtitleStyle}>
          품목별 견적/주문 노출 범위 수동 설정
        </span>
      </div>

      {canEdit ? null : (
        <div role="status" style={readOnlyBannerStyle} data-testid="product-catalog-readonly-banner">
          조회 전용 — 토글 변경 권한이 없습니다.
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────── */}
      <section style={toolbarStyle} aria-label="조회 조건">
        <div style={fieldStyle}>
          <span style={fieldLabelStyle}>모델명 검색</span>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="모델명 또는 품목명 입력"
            data-testid="product-catalog-search-input"
            style={{ ...inputStyle, minWidth: 220 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <Button
            variant="primary"
            onClick={handleQuery}
            loading={listQuery.isFetching}
            disabled={listQuery.isFetching}
            data-testid="product-catalog-query-button"
          >
            조회
          </Button>
          {listQuery.isError ? (
            <span role="alert" style={errorBannerStyle}>
              {errorMsg(listQuery.error)}
            </span>
          ) : null}
        </div>
      </section>

      {/* ── 변형 오류 배너 ────────────────────────────── */}
      {mutationError ? (
        <div role="alert" style={errorBannerStyle} data-testid="product-catalog-mutation-error">
          {mutationError}
        </div>
      ) : null}

      {/* ── DataTable ─────────────────────────────────── */}
      <section style={tableSectionStyle} data-testid="product-catalog-table">
        <DataTable<ProductCatalogRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.modelCode}
          loading={listQuery.isFetching}
          emptyMessage="조회 결과가 없습니다."
        />
      </section>

      {/* ── 하단 요약 + 페이지네이션 ───────────────────── */}
      {!listQuery.isFetching && rows.length > 0 ? (
        <div style={summaryStyle} data-testid="product-catalog-summary">
          <span>
            총 <strong>{totalElements.toLocaleString('ko-KR')}</strong>건
          </span>
          {totalPages > 1 ? (
            <div style={paginationStyle}>
              <button
                type="button"
                style={pageButtonStyle}
                disabled={currentPage === 0 || listQuery.isFetching}
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                aria-label="이전 페이지"
              >
                이전
              </button>
              <span style={pageInfoStyle}>
                {currentPage + 1} / {totalPages}
              </span>
              <button
                type="button"
                style={pageButtonStyle}
                disabled={currentPage >= totalPages - 1 || listQuery.isFetching}
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                aria-label="다음 페이지"
              >
                다음
              </button>
            </div>
          ) : null}
        </div>
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

const selectSmallStyle: CSSProperties = {
  height: 26,
  padding: '0 6px',
  border: '1px solid #D1D5DB',
  borderRadius: 4,
  fontSize: 12,
  outline: 'none',
}

const checkboxLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  fontSize: 12,
  color: 'var(--color-neutral-700, #363D49)',
  cursor: 'pointer',
  userSelect: 'none',
}

const tableSectionStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
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

const errorBannerStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-danger-700, #991B1B)',
  background: '#FEF2F2',
  border: '1px solid var(--color-danger-200, #FECACA)',
  borderRadius: 4,
  padding: '4px 8px',
}

const readOnlyBannerStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-neutral-600, #4B5563)',
  background: 'var(--color-neutral-50, #F7F8FA)',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 4,
  padding: '6px 10px',
}
