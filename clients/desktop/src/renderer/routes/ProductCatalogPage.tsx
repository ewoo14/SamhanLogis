/**
 * 품목 관리 페이지 (`/products/catalog`) — PR-B 품목 노출 수동 토글 + PR-E 세트·구성품·표시순서.
 *
 * <h2>핵심 기능</h2>
 * <ul>
 *   <li>전 품목 목록 (제한 없음 — products.list VIEW)</li>
 *   <li>컬럼: 모델명 / 품목명 / 카테고리 / 세트 / 노출 설정 / displayOrder</li>
 *   <li>수동 토글: '견적 노출' / '주문 노출' 체크 2개 → usageScope 매핑 → PATCH</li>
 *   <li>estimateCategory 셀렉트: ESTIMATE/BOTH 선택 시에만 노출</li>
 *   <li>세트 컬럼: BUNDLE 품목이면 '세트' 뱃지 + 구성품 수 ("세트 · 3"), 일반 품목은 —</li>
 *   <li>구성품 편집 모달: BUNDLE 행 '구성품' 버튼 → 구성 목록 + 추가/삭제/수량/순서 → PUT replace-all</li>
 *   <li>표시 순서 드래그: @dnd-kit/sortable 행 드래그 → '순서 저장' 버튼 → PUT /display-orders</li>
 * </ul>
 *
 * <h2>순서 저장 방침 (§2-1, §2-2 갱신)</h2>
 * <p>드래그 활성 조건: canEdit=true + <b>카테고리 필터 선택</b> (검색/전체 목록 상태 비활성).
 * 전체 목록 상태에서는 드래그 비활성 + "카테고리를 선택하면 순서를 조정할 수 있습니다" 캡션.
 * 재번호 전송 = 해당 카테고리의 usageScope≠NONE 품목만 (카테고리 한정 재번호 BE 계약).
 * NONE 품목은 displayOrder '—' + 드래그 핸들 미노출 + 재번호 대상 제외.
 * 카테고리 검증은 BE PUT /display-orders 에서도 혼합 400 처리.</p>
 *
 * <h2>게이트</h2>
 * <ul>
 *   <li>페이지 진입: products.list VIEW (PermissionGuard)</li>
 *   <li>토글/구성품 편집/순서 저장: products.admin UPDATE (canAccess 기반 read-only)</li>
 * </ul>
 *
 * <h2>UUID 비공개</h2>
 * <p>modelCode (modelName 동일값) 만 사용자에게 표시. id(UUID) 미노출.
 *
 * <h2>design-system 컴포넌트</h2>
 * <ul>
 *   <li>{@code Button} — 조회, 순서 저장, 구성품 모달 저장/닫기</li>
 *   <li>{@code Badge} — 세트 뱃지</li>
 *   <li>{@code DataTable} — 품목 목록</li>
 *   <li>{@code Modal} — 구성품 편집 모달</li>
 *   <li>{@code Input} — 수량 입력, 품목 검색</li>
 *   <li>{@code Select} — estimateCategory 셀렉트</li>
 *   <li>{@code DragHandle} — 행 드래그 핸들</li>
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
 *   <li>{@code product-catalog-set-badge-{modelCode}} — 세트 뱃지</li>
 *   <li>{@code product-catalog-components-button-{modelCode}} — 구성품 편집 버튼</li>
 *   <li>{@code product-catalog-list-error} — 목록 조회 오류 배너 (isError + rows.length===0 시)</li>
 *   <li>{@code product-catalog-mutation-error} — 변형(토글/복귀) 오류 배너</li>
 *   <li>{@code product-catalog-readonly-banner} — 조회 전용 안내 배너 (canEdit=false 시)</li>
 *   <li>{@code product-catalog-category-select} — 카테고리 필터 셀렉트</li>
 *   <li>{@code product-catalog-drag-disabled-caption} — 카테고리 미선택 드래그 비활성 캡션</li>
 *   <li>{@code product-catalog-save-order-button} — 순서 저장 버튼</li>
 *   <li>{@code components-modal} — 구성품 편집 모달 (data-testid on modal wrapper)</li>
 *   <li>{@code components-modal-component-row-{index}} — 구성품 행</li>
 *   <li>{@code components-modal-quantity-{index}} — 수량 입력</li>
 *   <li>{@code components-modal-delete-{index}} — 구성품 삭제 버튼</li>
 *   <li>{@code components-modal-up-{index}} — 위로 버튼</li>
 *   <li>{@code components-modal-down-{index}} — 아래로 버튼</li>
 *   <li>{@code components-modal-search-input} — 품목 검색 인풋</li>
 *   <li>{@code components-modal-add-{modelCode}} — 품목 추가 버튼</li>
 *   <li>{@code components-modal-save-button} — 저장 버튼</li>
 * </ul>
 */
import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type CSSProperties,
} from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { isMockMode } from '../api/mock'
import { ProductRealtimeClient } from '../realtime/ProductRealtimeClient'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Badge,
  Button,
  DataTable,
  DragHandle,
  Input,
  Modal,
  Select,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  listProducts,
  updateProductUsage,
  listBundleComponents,
  updateBundleComponents,
  updateDisplayOrders,
  type ProductCatalogRow,
  type EstimateCategory,
  type UsageScope,
  type BundleComponentItem,
  type BundleComponentInput,
} from '../api/productCatalogApi'
import { usePageTitleStore } from '../stores/pageTitle'
import { usePermissions } from '../hooks/usePermissions'

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** 표시 순서 일괄 저장 시 사용하는 전체 조회 size (충분히 크게 — 부분 재번호 방지) */
const DISPLAY_ORDER_FULL_SIZE = 999

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
// 토글 행 컴포넌트 (인라인 — 토글 + 카테고리)
// ---------------------------------------------------------------------------

interface ToggleCellProps {
  row: ProductCatalogRow
  canEdit: boolean
  onPatch: (modelCode: string, scope: UsageScope, estimateCategory: EstimateCategory | null) => void
  patchLoading: boolean
}

function ToggleCell({ row, canEdit, onPatch, patchLoading }: ToggleCellProps) {
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

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={estimate}
          disabled={!canEdit || patchLoading}
          onChange={(e) => handleEstimateChange(e.target.checked)}
          data-testid={`product-catalog-estimate-toggle-${row.modelCode}`}
          aria-label="견적 노출"
        />
        견적 노출
      </label>
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={order}
          disabled={!canEdit || patchLoading}
          onChange={(e) => handleOrderChange(e.target.checked)}
          data-testid={`product-catalog-order-toggle-${row.modelCode}`}
          aria-label="주문 노출"
        />
        주문 노출
      </label>
      {showEstimateCategory ? (
        <Select
          value={row.estimateCategory ?? ''}
          disabled={!canEdit || patchLoading}
          onChange={(e) => handleCategoryChange(e.target.value)}
          data-testid={`product-catalog-estimate-category-${row.modelCode}`}
          selectSize="sm"
          fullWidth={false}
          style={{ minWidth: 100 }}
        >
          <option value="">카테고리 선택</option>
          {ESTIMATE_CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 구성품 편집 모달
// ---------------------------------------------------------------------------

interface ComponentsModalProps {
  open: boolean
  modelCode: string
  canEdit: boolean
  onClose: () => void
  onSaved: () => void
}

interface ComponentDraft extends BundleComponentItem {
  /** 검색/추가 후 신규 여부 (로컬 임시 ID — 저장 시 제거) */
  _localId: string
}

function ComponentsModal({
  open,
  modelCode,
  canEdit,
  onClose,
  onSaved,
}: ComponentsModalProps) {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<ComponentDraft[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [searchResults, setSearchResults] = useState<ProductCatalogRow[]>([])
  const [modalError, setModalError] = useState<string | null>(null)

  // 구성품 목록 로드
  const componentsQuery = useQuery({
    queryKey: ['bundle-components', modelCode],
    queryFn: () => listBundleComponents(modelCode),
    enabled: open && modelCode.length > 0,
    staleTime: 0,
  })

  // 품목 검색 (기존 listProducts 재사용 — 자기 자신·BUNDLE 제외)
  const searchQuery = useQuery({
    queryKey: ['product-catalog-search', searchInput],
    queryFn: () => listProducts({ q: searchInput, size: 20 }),
    enabled: searchInput.trim().length >= 1,
    staleTime: 10_000,
  })

  // 구성품 저장 (PUT replace-all)
  const saveMutation = useMutation({
    mutationFn: (components: BundleComponentInput[]) =>
      updateBundleComponents(modelCode, components),
    onSuccess: () => {
      setModalError(null)
      void queryClient.invalidateQueries({ queryKey: ['product-catalog'] })
      void queryClient.invalidateQueries({ queryKey: ['bundle-components', modelCode] })
      onSaved()
    },
    onError: (err) => {
      setModalError(errorMsg(err))
    },
  })

  // 모달 열릴 때 drafts 초기화
  useEffect(() => {
    if (open && componentsQuery.data) {
      setDrafts(
        componentsQuery.data.map((c, idx) => ({
          ...c,
          displayOrder: idx + 1,
          _localId: `existing-${c.componentModelCode}-${idx}`,
        })),
      )
    }
  }, [open, componentsQuery.data])

  // 검색 결과 업데이트 (자기 자신·BUNDLE 제외)
  useEffect(() => {
    if (searchQuery.data) {
      const results = searchQuery.data.content.filter(
        (p) => p.modelCode !== modelCode && p.productType !== 'BUNDLE',
      )
      setSearchResults(results)
    } else {
      setSearchResults([])
    }
  }, [searchQuery.data, modelCode])

  const handleQuantityChange = (localId: string, value: string) => {
    const num = parseInt(value, 10)
    if (isNaN(num) || num < 1) return
    setDrafts((prev) =>
      prev.map((d) => (d._localId === localId ? { ...d, quantity: num } : d)),
    )
  }

  const handleDelete = (localId: string) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d._localId !== localId)
      return next.map((d, idx) => ({ ...d, displayOrder: idx + 1 }))
    })
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    setDrafts((prev) => {
      const next = [...prev]
      const temp = next[index - 1]!
      next[index - 1] = next[index]!
      next[index] = temp
      return next.map((d, idx) => ({ ...d, displayOrder: idx + 1 }))
    })
  }

  const handleMoveDown = (index: number) => {
    setDrafts((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      const temp = next[index + 1]!
      next[index + 1] = next[index]!
      next[index] = temp
      return next.map((d, idx) => ({ ...d, displayOrder: idx + 1 }))
    })
  }

  const handleAdd = (product: ProductCatalogRow) => {
    // 중복 추가 방지
    if (drafts.some((d) => d.componentModelCode === product.modelCode)) return
    const newDraft: ComponentDraft = {
      componentModelCode: product.modelCode,
      name: product.name,
      quantity: 1,
      displayOrder: drafts.length + 1,
      _localId: `new-${product.modelCode}-${Date.now()}`,
    }
    setDrafts((prev) => [...prev, newDraft])
    setSearchInput('')
    setSearchResults([])
  }

  const handleSave = () => {
    if (drafts.length === 0) {
      setModalError('구성품이 없습니다. 최소 1개 이상 등록해 주세요.')
      return
    }
    const components: BundleComponentInput[] = drafts.map((d, idx) => ({
      componentModelCode: d.componentModelCode,
      quantity: d.quantity,
      displayOrder: idx + 1,
    }))
    saveMutation.mutate(components)
  }

  const handleClose = () => {
    setSearchInput('')
    setSearchResults([])
    setModalError(null)
    onClose()
  }

  const isLoading = componentsQuery.isLoading
  const isSaving = saveMutation.isPending

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`구성품 편집 — ${modelCode}`}
      size="lg"
      footer={
        canEdit ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={handleClose} disabled={isSaving}>
              닫기
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={isSaving}
              disabled={isSaving || isLoading}
              data-testid="components-modal-save-button"
            >
              저장
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={handleClose}>닫기</Button>
        )
      }
    >
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 200 }}
        data-testid="components-modal"
      >
        {isLoading ? (
          <p style={{ color: 'var(--color-neutral-500)', fontSize: 13 }}>불러오는 중…</p>
        ) : null}

        {modalError ? (
          <div role="alert" style={errorBannerStyle} data-testid="components-modal-error">
            {modalError}
          </div>
        ) : null}

        {/* 현재 구성품 목록 */}
        <section aria-label="구성품 목록">
          <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-neutral-700)' }}>
            구성품 ({drafts.length}개)
          </h4>
          {drafts.length === 0 && !isLoading ? (
            <p style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>구성품이 없습니다.</p>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {drafts.map((draft, idx) => (
              <div
                key={draft._localId}
                data-testid={`components-modal-component-row-${idx}`}
                style={componentRowStyle}
              >
                <span style={{ flex: 1, fontSize: 12 }}>
                  <span style={{ fontFamily: 'monospace' }}>{draft.componentModelCode}</span>
                  {draft.name ? (
                    <span style={{ color: 'var(--color-neutral-500)', marginLeft: 6 }}>{draft.name}</span>
                  ) : null}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>수량</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.quantity}
                    disabled={!canEdit || isSaving}
                    onChange={(e) => handleQuantityChange(draft._localId, e.target.value)}
                    data-testid={`components-modal-quantity-${idx}`}
                    style={quantityInputStyle}
                    aria-label={`수량 ${idx + 1}`}
                  />
                </div>
                {canEdit ? (
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button
                      type="button"
                      onClick={() => handleMoveUp(idx)}
                      disabled={idx === 0 || isSaving}
                      data-testid={`components-modal-up-${idx}`}
                      style={orderButtonStyle}
                      aria-label="위로"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(idx)}
                      disabled={idx >= drafts.length - 1 || isSaving}
                      data-testid={`components-modal-down-${idx}`}
                      style={orderButtonStyle}
                      aria-label="아래로"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(draft._localId)}
                      disabled={isSaving}
                      data-testid={`components-modal-delete-${idx}`}
                      style={{ ...orderButtonStyle, color: 'var(--color-danger-600, #DC2626)' }}
                      aria-label="삭제"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {/* 품목 검색 + 추가 (canEdit 시에만) */}
        {canEdit ? (
          <section aria-label="구성품 추가">
            <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-neutral-700)' }}>
              품목 추가 (단품만)
            </h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Input
                label="품목 검색"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="모델명 또는 품목명 입력"
                inputSize="sm"
                fullWidth={false}
                style={{ minWidth: 200 }}
                data-testid="components-modal-search-input"
              />
            </div>
            {searchResults.length > 0 ? (
              <div style={searchResultsStyle}>
                {searchResults.map((p) => {
                  const alreadyAdded = drafts.some((d) => d.componentModelCode === p.modelCode)
                  return (
                    <div key={p.modelCode} style={searchResultRowStyle}>
                      <span style={{ flex: 1, fontSize: 12 }}>
                        <span style={{ fontFamily: 'monospace' }}>{p.modelCode}</span>
                        <span style={{ color: 'var(--color-neutral-500)', marginLeft: 6 }}>{p.name}</span>
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleAdd(p)}
                        disabled={alreadyAdded || isSaving}
                        data-testid={`components-modal-add-${p.modelCode}`}
                      >
                        {alreadyAdded ? '추가됨' : '추가'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : searchInput.trim().length >= 1 && !searchQuery.isFetching ? (
              <p style={{ fontSize: 11, color: 'var(--color-neutral-400)', marginTop: 4 }}>
                검색 결과가 없습니다.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Sortable 행 (dnd-kit) — 드래그 활성 시 커스텀 테이블에서 사용
// ---------------------------------------------------------------------------

interface SortableRowProps {
  row: ProductCatalogRow
  columns: DataTableColumn<ProductCatalogRow>[]
}

function SortableRow({ row, columns }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.modelCode })

  /** §2-1: NONE 품목은 드래그 핸들 미노출 (정렬 대상 제외). */
  const isNone = row.usageScope === 'NONE'

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <tr ref={setNodeRef} style={style} data-testid={`product-catalog-row-${row.modelCode}`}>
      {/* 드래그 핸들 셀 — NONE 품목은 핸들 미노출 (빈 셀) */}
      <td style={sortableTdStyle}>
        {isNone ? null : (
          <DragHandle
            label={`${row.modelCode} 드래그`}
            listeners={listeners as Record<string, unknown> | undefined}
            attributes={attributes as unknown as Record<string, unknown>}
            setActivatorNodeRef={setActivatorNodeRef}
            dragging={isDragging}
          />
        )}
      </td>
      {/* 데이터 셀 (drag 컬럼 제외) */}
      {columns.filter((c) => c.key !== '_drag').map((col) => (
        <td key={String(col.key)} style={sortableTdStyle}>
          {col.render
            ? col.render(row)
            : String((row as unknown as Record<string, unknown>)[String(col.key)] ?? '')}
        </td>
      ))}
    </tr>
  )
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

/**
 * 품목 관리 페이지 — 전 품목 목록 + usageScope 수동 토글 + 세트·구성품·표시순서.
 */
export function ProductCatalogPage() {
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canEdit = canAccess('products.admin', 'update')

  const [searchInput, setSearchInput] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [committedCategory, setCommittedCategory] = useState<EstimateCategory | ''>('')
  const [currentPage, setCurrentPage] = useState(0)

  // 활성 패치 중인 modelCode 추적
  const [patchingCode, setPatchingCode] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  // 구성품 모달
  const [componentsModalCode, setComponentsModalCode] = useState<string | null>(null)

  // 드래그 표시 순서 상태
  // sortableRows: 현재 화면에 보이는 순서 (드래그로 변경됨)
  const [sortableRows, setSortableRows] = useState<ProductCatalogRow[]>([])
  const [orderDirty, setOrderDirty] = useState(false)
  const [orderSaving, setOrderSaving] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  /**
   * 드래그 활성 여부 — §2-2 정책:
   * - canEdit=true
   * - 카테고리 필터 선택됨 (committedCategory 비어있지 않음)
   * - 검색(q) 비활성 (검색 중 드래그 순서 모호)
   */
  const isDragEnabled = canEdit && !!committedCategory && !committedSearch

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    setPageTitle({ title: '품목 관리', meta: '품목' })
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

  const listQuery = useQuery({
    queryKey: ['product-catalog', committedSearch, committedCategory, currentPage],
    queryFn: () =>
      listProducts({
        q: committedSearch || undefined,
        category: committedCategory || undefined,
        page: currentPage,
        size: PAGE_SIZE,
      }),
    staleTime: 30_000,
  })

  // rows → sortableRows 동기화 (query 결과 변경 시 또는 드래그 dirty 아닐 때)
  const rows = listQuery.data?.content ?? []
  const prevRowsRef = useRef<ProductCatalogRow[]>([])

  useEffect(() => {
    if (!orderDirty) {
      setSortableRows(rows)
      prevRowsRef.current = rows
    }
  }, [rows, orderDirty])

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

  const handleQuery = useCallback(() => {
    setCurrentPage(0)
    setOrderDirty(false)
    setCommittedSearch(searchInput)
  }, [searchInput])

  /** 카테고리 필터 즉시 반영 (조회 버튼 불필요 — 카테고리 변경 즉시 적용). */
  const handleCategoryChange = useCallback((value: EstimateCategory | '') => {
    setCommittedCategory(value)
    setCurrentPage(0)
    setOrderDirty(false)
  }, [])

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

  // 드래그 종료 처리
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSortableRows((prev) => {
      const oldIndex = prev.findIndex((r) => r.modelCode === String(active.id))
      const newIndex = prev.findIndex((r) => r.modelCode === String(over.id))
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
    setOrderDirty(true)
  }, [])

  /**
   * 표시 순서 저장 — §2-1 + §2-2 정책:
   * 카테고리 한정 재번호: 선택된 카테고리의 usageScope≠NONE 품목만 재번호 전송.
   * NONE 품목은 displayOrder 그대로 유지 (재번호 대상 제외).
   * BE 는 동일 카테고리 검증 후 처리 (혼합 시 400).
   */
  const handleSaveOrder = useCallback(async () => {
    if (!committedCategory) return // 카테고리 미선택 시 저장 불가 (isDragEnabled 가 이미 가드)
    setOrderSaving(true)
    setOrderError(null)
    try {
      // 선택된 카테고리의 전체 목록(충분히 큰 size)을 재조회하여 NONE 제외 후 재번호 전송.
      const allRows = await listProducts({
        category: committedCategory,
        size: DISPLAY_ORDER_FULL_SIZE,
      })
      const allItems = allRows.content

      // sortableRows 의 현재 화면 순서를 기준으로 재번호 계산.
      // usageScope=NONE 품목은 재번호 대상 제외 (displayOrder '—' — NONE 은 순서 없음).
      const exposedSortedCodes = sortableRows
        .filter((r) => r.usageScope !== 'NONE')
        .map((r) => r.modelCode)

      // 화면에 없는 노출 품목(다른 페이지) = sortableRows 에 없는 카테고리 품목 뒤에 붙임
      const otherExposedItems = allItems.filter(
        (r) => r.usageScope !== 'NONE' && !exposedSortedCodes.includes(r.modelCode),
      )

      // sortableRows 에서 NONE 제외된 순서 + 나머지 노출 품목 (NONE 제외)
      const exposedOrdered = [
        ...sortableRows.filter((r) => r.usageScope !== 'NONE'),
        ...otherExposedItems,
      ]

      const orders = exposedOrdered.map((r, idx) => ({
        modelCode: r.modelCode,
        displayOrder: idx + 1,
      }))

      if (orders.length === 0) {
        setOrderError('노출 품목이 없어 순서를 저장할 수 없습니다.')
        return
      }

      await updateDisplayOrders(orders)
      setOrderDirty(false)
      void queryClient.invalidateQueries({ queryKey: ['product-catalog'] })
    } catch (err) {
      setOrderError(errorMsg(err))
    } finally {
      setOrderSaving(false)
    }
  }, [sortableRows, queryClient, committedCategory])

  const totalElements = listQuery.data?.totalElements ?? 0
  const totalPages = listQuery.data?.totalPages ?? 1

  // ---------------------------------------------------------------------------
  // DataTable 컬럼 정의
  // ---------------------------------------------------------------------------

  const columns: DataTableColumn<ProductCatalogRow>[] = [
    ...(isDragEnabled
      ? [
          {
            key: '_drag' as const,
            header: '',
            width: '32px',
            render: () => null, // SortableRow 내에서 DragHandle 렌더 — 컬럼 셀은 비워둠
          } as DataTableColumn<ProductCatalogRow>,
        ]
      : []),
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
      key: 'productType',
      header: '세트',
      width: '100px',
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
      key: 'usageScope',
      header: '노출 설정',
      width: '280px',
      render: (row) => (
        <ToggleCell
          row={row}
          canEdit={canEdit}
          onPatch={handlePatch}
          patchLoading={patchingCode === row.modelCode}
        />
      ),
    },
    {
      key: '_components' as const,
      header: '구성품',
      width: '90px',
      render: (row) =>
        row.productType === 'BUNDLE' ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setComponentsModalCode(row.modelCode)}
            data-testid={`product-catalog-components-button-${row.modelCode}`}
          >
            구성품
          </Button>
        ) : null,
    },
    {
      key: 'displayOrder',
      header: '표시순서',
      width: '80px',
      render: (row) =>
        // §2-1: NONE 품목은 displayOrder '—' 표시 (정렬 대상 제외)
        row.usageScope === 'NONE'
          ? <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
          : row.displayOrder != null
          ? String(row.displayOrder)
          : '—',
    },
  ]

  return (
    <div style={pageStyle}>
      {/* ── 헤더 ─────────────────────────────────────── */}
      <div style={headerRowStyle}>
        <h3 style={{ margin: 0 }}>품목 관리</h3>
        <span style={subtitleStyle}>
          품목별 견적/주문 노출 범위 수동 설정 + 세트 구성품 편집
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
        {/* 카테고리 필터 — 드래그 순서 조정 활성화 조건 (§2-2) */}
        <div style={fieldStyle}>
          <Select
            label="카테고리"
            value={committedCategory}
            onChange={(e) => handleCategoryChange(e.target.value as EstimateCategory | '')}
            selectSize="sm"
            fullWidth={false}
            style={{ minWidth: 130 }}
            data-testid="product-catalog-category-select"
          >
            <option value="">전체</option>
            {ESTIMATE_CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
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
          {canEdit && orderDirty ? (
            <Button
              variant="primary"
              onClick={() => { void handleSaveOrder() }}
              loading={orderSaving}
              disabled={orderSaving || listQuery.isFetching}
              data-testid="product-catalog-save-order-button"
            >
              순서 저장
            </Button>
          ) : null}
          {isDragEnabled && !orderDirty && rows.length > 0 ? (
            <span style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>
              행을 드래그하여 순서 조정
            </span>
          ) : null}
          {/* §2-2: 전체 목록(카테고리 미선택) 상태 드래그 비활성 캡션 */}
          {canEdit && !committedCategory && !committedSearch ? (
            <span
              style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}
              data-testid="product-catalog-drag-disabled-caption"
            >
              카테고리를 선택하면 순서를 조정할 수 있습니다
            </span>
          ) : null}
          {committedSearch ? (
            <span style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>
              검색 중 — 드래그 비활성
            </span>
          ) : null}
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

      {/* ── 순서 오류 배너 ────────────────────────────── */}
      {orderError ? (
        <div role="alert" style={errorBannerStyle} data-testid="product-catalog-order-error">
          {orderError}
        </div>
      ) : null}

      {/* ── DataTable (드래그 활성 시 DndContext + 커스텀 테이블) ── */}
      <section style={tableSectionStyle} data-testid="product-catalog-table">
        {isDragEnabled ? (
          /* 드래그 활성: DndContext + SortableContext + 커스텀 <table>
           * DataTable 은 renderRow 미지원이므로 같은 시각 스타일을 인라인 복제.
           * 열 헤더는 drag 핸들 컬럼(+) + 나머지 data 컬럼.
           */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableRows.map((r) => r.modelCode)}
              strategy={verticalListSortingStrategy}
            >
              <div style={sortableTableWrapStyle}>
                <div style={{ width: '100%', overflowX: 'auto' }}>
                  <table style={sortableTableStyle}>
                    <thead style={sortableTheadStyle}>
                      <tr>
                        {/* 드래그 핸들 헤더 */}
                        <th style={{ ...sortableThStyle, width: 32 }} />
                        {/* 나머지 컬럼 헤더 (drag 더미 컬럼 제외) */}
                        {columns.filter((c) => c.key !== '_drag').map((col) => (
                          <th
                            key={String(col.key)}
                            style={{
                              ...sortableThStyle,
                              ...(col.width ? { width: col.width } : {}),
                            }}
                          >
                            {col.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortableRows.length === 0 && !listQuery.isFetching ? (
                        <tr>
                          <td
                            colSpan={columns.length + 1}
                            style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--color-neutral-400)', fontSize: 13 }}
                          >
                            조회 결과가 없습니다.
                          </td>
                        </tr>
                      ) : (
                        sortableRows.map((row) => (
                          <SortableRow key={row.modelCode} row={row} columns={columns} />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {listQuery.isFetching ? (
                  <div style={loadingOverlayStyle} role="status" aria-live="polite">
                    로딩 중…
                  </div>
                ) : null}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <DataTable<ProductCatalogRow>
            columns={columns}
            rows={sortableRows}
            rowKey={(row) => row.modelCode}
            loading={listQuery.isFetching}
            emptyMessage="조회 결과가 없습니다."
          />
        )}
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
                style={{
                  ...pageButtonStyle,
                  ...(currentPage >= totalPages - 1 || listQuery.isFetching ? pageButtonDisabledStyle : {}),
                }}
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

      {/* ── 구성품 편집 모달 ───────────────────────────── */}
      {componentsModalCode ? (
        <ComponentsModal
          open={true}
          modelCode={componentsModalCode}
          canEdit={canEdit}
          onClose={() => setComponentsModalCode(null)}
          onSaved={() => setComponentsModalCode(null)}
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

const componentRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  background: 'var(--color-neutral-50, #F7F8FA)',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 4,
}

const quantityInputStyle: CSSProperties = {
  width: 56,
  padding: '2px 6px',
  fontSize: 12,
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 3,
  textAlign: 'right',
}

const orderButtonStyle: CSSProperties = {
  appearance: 'none',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 3,
  background: 'var(--color-bg, #FFFFFF)',
  cursor: 'pointer',
  padding: '2px 5px',
  fontSize: 10,
  lineHeight: 1,
}

const searchResultsStyle: CSSProperties = {
  marginTop: 8,
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 4,
  maxHeight: 180,
  overflowY: 'auto',
}

const searchResultRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderBottom: '1px solid var(--color-border, #E5E7EB)',
}

// Sortable 테이블 (드래그 활성 시 DataTable 대체 — renderRow 미지원 우회)
const sortableTableWrapStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 6,
  background: 'var(--color-bg, #FFFFFF)',
  overflow: 'hidden',
}

const sortableTableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  fontSize: 13,
  color: 'var(--color-text, #1A1D23)',
}

const sortableTheadStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: 'var(--color-bg-subtle, #F7F8FA)',
}

const sortableThStyle: CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--color-border, #E5E7EB)',
  background: 'var(--color-bg-subtle, #F7F8FA)',
  color: 'var(--color-text-muted, #6B7280)',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  textAlign: 'left',
}

const sortableTdStyle: CSSProperties = {
  padding: '6px 12px',
  borderBottom: '1px solid var(--color-border, #E5E7EB)',
  verticalAlign: 'middle',
}

const loadingOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,0.6)',
  pointerEvents: 'none',
  fontSize: 12,
  color: 'var(--color-neutral-500, #6B7280)',
}
