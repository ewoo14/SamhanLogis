/**
 * 기초품목 관리 페이지 (`/products/catalog`) — 물리 SKU master 등록/수정 전용 화면.
 *
 * 견적/주문 노출, 견적 카테고리, 표시순서 관리는 `EstimateItemsCatalogPage` 로 분리한다.
 * 세트 구성품 편집은 세트 기초품목 상세(`ProductFormPage`)에서 관리한다.
 */
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { isMockMode } from '../api/mock'
import { ProductRealtimeClient } from '../realtime/ProductRealtimeClient'
import {
  Badge,
  Button,
  DataTable,
  Input,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  listProducts,
  listProductCategories,
  type ProductCatalogRow,
  type ProductCategoryNode,
  type ProductCategory,
} from '../api/productCatalogApi'
import { usePageTitleStore } from '../stores/pageTitle'
import { usePermissions } from '../hooks/usePermissions'

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50

/*
Legacy mojibake label map removed. Keep PRODUCT_CATEGORY_LABEL below as the single source of truth.
  HOME_MULTI: '?덈???,
  SINGLE_SET: '?⑥씪 ?명듃',
  SINGLE_PART: '?⑥씪 援ъ꽦??,
  COMMERCIAL_MULTI: '?곸뾽硫??,
  COMMERCIAL_PART: '?곸뾽 援ъ꽦??,
  OLD: '?덇굅??,
  MATERIAL: '자재',
}

*/
const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  HOME_MULTI: '홈멀티',
  SINGLE_SET: '싱글중대형',
  SINGLE_PART: '싱글 구성품',
  COMMERCIAL_MULTI: '상업 멀티',
  COMMERCIAL_PART: '상업 구성품',
  OLD: '구형',
  MATERIAL: '자재',
}

/** 물리 제품구분 트리를 필터용 평면 목록으로 변환한다. */
function flattenProductCategories(nodes: ProductCategoryNode[]): ProductCategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenProductCategories(node.children ?? [])])
}

// ---------------------------------------------------------------------------
// 에러 메시지 추출
// ---------------------------------------------------------------------------

function errorMsg(err: unknown): string {
  // axios error 의 envelope message 우선 추출 (BE ApiResponse.message 한국어)
  if (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    typeof (err as { response?: unknown }).response === 'object' &&
    (err as { response?: { data?: { message?: unknown } } }).response?.data?.message
  ) {
    const msg = (err as { response: { data: { message: unknown } } }).response.data.message
    if (typeof msg === 'string' && msg.length > 0) return msg
  }
  if (err instanceof Error) return err.message
  return '처리 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

/**
 * 기초품목 관리 페이지 — 물리 SKU master 등록/수정 전용.
 */
export function ProductCatalogPage() {
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { canAccess } = usePermissions()
  const canEdit = canAccess('products.admin', 'update')
  const canCreate = canAccess('products.admin', 'create')

  const [searchInput, setSearchInput] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [selectedPhysicalCategoryId, setSelectedPhysicalCategoryId] = useState('')
  const [currentPage, setCurrentPage] = useState(0)

  useEffect(() => {
    setPageTitle({ title: '기초품목 관리', meta: '품목' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  /**
   * §2-2 실시간 동기화: ProductCatalogPage 마운트 시 카탈로그 레벨 SSE 구독.
   * 이벤트 수신 시 react-query cache invalidate → 목록 자동 갱신.
   * VITE_MOCK_MODE 에서는 구독 skip (SSE 서버 미가동).
   * unmount 시 abort() 로 cleanup ([[SlipDetailPage 348행 패턴]]).
   */
  useEffect(() => {
    if (isMockMode()) return // mock 모드: SSE 구독 skip
    const ctrl = ProductRealtimeClient.subscribe('catalog', () => {
      void queryClient.invalidateQueries({ queryKey: ['product-catalog'] })
    })
    return () => ctrl.abort()
  }, [queryClient])

  const categoriesQuery = useQuery({
    queryKey: ['product-categories-tree'],
    queryFn: listProductCategories,
    staleTime: 60_000,
  })

  const listQuery = useQuery({
    queryKey: ['product-catalog', committedSearch, selectedPhysicalCategoryId, currentPage],
    queryFn: () =>
      listProducts({
        q: committedSearch || undefined,
        categoryId: selectedPhysicalCategoryId || undefined,
        page: currentPage,
        size: PAGE_SIZE,
      }),
    staleTime: 30_000,
  })

  const rows = listQuery.data?.content ?? []
  const categoryOptions = flattenProductCategories(categoriesQuery.data ?? [])
  const selectedPhysicalCategory = categoryOptions.find(
    (category) => category.id === selectedPhysicalCategoryId,
  )

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
      mobilePriority: 'primary',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.modelCode}</span>
      ),
    },
    {
      key: 'name',
      header: '품목명',
      width: '220px',
      mobilePriority: 'secondary',
    },
    {
      key: 'physicalCategory',
      header: '제품구분',
      width: '140px',
      mobilePriority: 'secondary',
      render: (row) => row.physicalCategory ? (
        <span
          style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}
          data-testid={`product-catalog-physical-category-${row.modelCode}`}
        >
          {row.physicalCategory.name}
        </span>
      ) : (
        <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
      ),
    },
    {
      key: 'estimateCategory',
      header: '카테고리',
      width: '160px',
      mobilePriority: 'secondary',
      render: (row) => row.productCategory ? (
        <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
          {PRODUCT_CATEGORY_LABEL[row.productCategory]}
        </span>
      ) : (
        <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
      ),
    },
    {
      key: 'productType',
      header: '세트',
      width: '100px',
      mobilePriority: 'hidden',
      render: (row) =>
        row.productType === 'BUNDLE' ? (
          <Badge
            variant="brand"
            data-testid={`product-catalog-set-badge-${row.modelCode}`}
          >
            {`세트 · ${row.componentCount ?? 0}`}
          </Badge>
        ) : (
          <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
        ),
    },
    {
      key: '_actions' as const,
      header: '관리',
      width: '80px',
      mobilePriority: 'hidden',
      render: (row) =>
        canEdit ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/products/${encodeURIComponent(row.modelCode)}/edit`)}
            data-testid={`product-catalog-edit-button-${row.modelCode}`}
          >
            수정
          </Button>
        ) : null,
    },
  ]

  return (
    <div style={pageStyle}>
      {/* ── 헤더 ─────────────────────────────────────── */}
      <div style={headerRowStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>기초품목 관리</h3>
          <span style={subtitleStyle}>
            물리 SKU master 등록/수정을 관리합니다. 세트 구성품은 세트 기초품목 상세에서 설정합니다.
          </span>
        </div>
        {canCreate ? (
          <Button
            variant="primary"
            onClick={() => navigate('/products/new')}
            data-testid="product-catalog-create-button"
          >
            품목 등록
          </Button>
        ) : null}
      </div>

      {canEdit ? null : (
        <div role="status" style={readOnlyBannerStyle} data-testid="product-catalog-readonly-banner">
          조회 전용 — 품목 수정 권한이 없습니다.
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────── */}
      <section style={toolbarStyle} aria-label="조회 조건">
        <div style={fieldStyle}>
          <Input
            label="모델명 검색"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="모델명 또는 품목명 입력"
            data-testid="product-catalog-search-input"
            inputSize="sm"
            fullWidth={false}
            style={{ minWidth: 220 }}
          />
        </div>
        <div style={fieldStyle}>
          <label htmlFor="product-catalog-physical-category" style={filterLabelStyle}>
            제품구분
          </label>
          <select
            id="product-catalog-physical-category"
            aria-label="제품구분"
            value={selectedPhysicalCategoryId}
            onChange={(e) => {
              setCurrentPage(0)
              setSelectedPhysicalCategoryId(e.target.value)
            }}
            disabled={categoriesQuery.isLoading || listQuery.isFetching}
            data-testid="product-catalog-physical-category-filter"
            style={selectStyle}
          >
            <option value="">전체</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} ({category.code})
              </option>
            ))}
          </select>
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

      <section style={tableSectionStyle} data-testid="product-catalog-table">
        <DataTable<ProductCatalogRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.modelCode}
          loading={listQuery.isFetching}
          emptyMessage="조회 결과가 없습니다."
        />
      </section>

      {/* ── 오류 안내 ─────────────────────────────────── */}
      {listQuery.isError && rows.length === 0 ? (
        <div role="alert" style={errorBannerStyle} data-testid="product-catalog-list-error">
          목록 조회 중 오류가 발생했습니다. {errorMsg(listQuery.error)}
        </div>
      ) : null}

      {/* ── 하단 요약 + 페이지네이션 ───────────────────── */}
      {rows.length > 0 ? (
        <div style={summaryStyle} data-testid="product-catalog-summary">
          <span>
            총 <strong>{totalElements.toLocaleString('ko-KR')}</strong>건
            {selectedPhysicalCategory ? (
              <span
                style={{ marginLeft: 10, color: 'var(--color-brand-700, #1D4ED8)' }}
                data-testid="product-catalog-physical-category-count"
              >
                {selectedPhysicalCategory.name} {totalElements.toLocaleString('ko-KR')}건
              </span>
            ) : null}
            {listQuery.isFetching ? <span style={{ marginLeft: 6, color: 'var(--color-neutral-400)' }}>갱신 중…</span> : null}
          </span>
          {totalPages > 1 ? (
            <div style={paginationStyle}>
              <button
                type="button"
                style={{
                  ...pageButtonStyle,
                  ...(currentPage === 0 || listQuery.isFetching ? pageButtonDisabledStyle : {}),
                }}
                disabled={currentPage === 0 || listQuery.isFetching}
                onClick={() => {
                  setCurrentPage((p) => Math.max(0, p - 1))
                }}
                aria-label="이전 페이지"
              >
                이전
              </button>
              <span style={pageInfoStyle}>
                {currentPage + 1} / {totalPages}
              </span>
              <button
                type="button"
                style={{
                  ...pageButtonStyle,
                  ...(currentPage >= totalPages - 1 || listQuery.isFetching ? pageButtonDisabledStyle : {}),
                }}
                disabled={currentPage >= totalPages - 1 || listQuery.isFetching}
                onClick={() => {
                  setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
                }}
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
  alignItems: 'center',
  justifyContent: 'space-between',
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

const filterLabelStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-neutral-700, #363D49)',
  fontWeight: 600,
}

const selectStyle: CSSProperties = {
  minWidth: 190,
  height: 32,
  padding: '0 8px',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 4,
  background: 'var(--color-bg, #FFFFFF)',
  color: 'var(--color-neutral-700, #363D49)',
  fontSize: 13,
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

const pageButtonDisabledStyle: CSSProperties = {
  opacity: 0.4,
  cursor: 'not-allowed',
  background: 'var(--color-neutral-50, #F7F8FA)',
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
  background: 'var(--color-danger-50, #FEF2F2)',
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
