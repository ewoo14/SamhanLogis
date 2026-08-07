/**
 * 견적품목 관리 페이지 (`/products/estimate-items`) — 기초품목 master 참조 기반 판매 노출 카탈로그.
 *
 * BE/데이터 모델은 변경하지 않고 기존 products endpoint 를 재사용한다.
 * - 목록: usageScope != NONE 품목, 견적 카테고리별 필터
 * - 노출: PATCH /api/v1/products/{modelCode}/usage
 * - 순서: PUT /api/v1/products/display-orders
 * - 추가: ProductAutocomplete 로 기초품목 선택 후 현재 견적 카테고리에 append
 */
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
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
  ProductAutocomplete,
  ProductMultiSelectAutocomplete,
  Select,
  type DataTableColumn,
  type ProductOption,
} from '@samhan/design-system'
import { isMockMode } from '../api/mock'
import { ProductRealtimeClient } from '../realtime/ProductRealtimeClient'
import {
  listProducts,
  listBundleComponents,
  updateDisplayOrders,
  updateBundleComponents,
  updateProductUsage,
  updateProductClassificationSettings,
  updateProductFixedDiscount,
  updateProductVariableDiscount,
  type BundleComponentInput,
  type ComponentKind,
  type EstimateCategory,
  type ProductCatalogRow,
  type UsageScope,
} from '../api/productCatalogApi'
import {
  listClassifications,
  type Classification,
} from '../api/classificationApi'
import { searchProducts as searchProductsApi } from '../api/productApi'
import { useIsMobile } from '../hooks/useIsMobile'
import { usePermissions } from '../hooks/usePermissions'
import { usePageTitleStore } from '../stores/pageTitle'
import {
  buildCategoryDisplayOrderInputs,
  estimateCategoryValues,
  exposureDisplayOrder,
  filterClassificationsByParent,
  formatClassificationPath,
  isVariableDiscountEligible,
  nextClassificationSelection,
  nextScopeForEstimateCategoryRemoval,
  normalizeEstimateCategoryExposures,
  resolveFixedDiscountAutoSave,
  resolveEstimateItemsPageTotals,
  type ClassificationSelection,
} from './ProductCatalogPageModel'
import {
  buildBundleComponentInputs,
  groupBundleComponentDrafts,
  normalizeBundleComponentDraftOrder,
  reorderBundleComponentDrafts,
  toggleComponentDefault,
  type ComponentDraftModel,
} from './componentsModalModel'

const DISPLAY_ORDER_FULL_SIZE = 999
const PAGE_SIZE = 50

const ESTIMATE_CATEGORY_LABEL: Record<EstimateCategory, string> = {
  HOME_MULTI: '홈멀티',
  SINGLE_SET: '싱글중대형',
  COMMERCIAL_MULTI: '상업멀티',
  LEGACY: '구형',
  OTHER: '기타',
}

const ESTIMATE_CATEGORY_TABS = [
  { value: 'HOME_MULTI', label: '홈멀티' },
  { value: 'SINGLE_SET', label: '싱글중대형' },
  { value: 'COMMERCIAL_MULTI', label: '상업멀티' },
  { value: 'LEGACY', label: '구형' },
] as const satisfies ReadonlyArray<{ value: EstimateCategory; label: string }>

const ESTIMATE_CATEGORY_OPTIONS: Array<{ value: EstimateCategory; label: string }> =
  ESTIMATE_CATEGORY_TABS.map((tab) => ({ value: tab.value, label: tab.label }))

const COMPONENT_KIND_OPTIONS: Array<{ value: ComponentKind; label: string }> = [
  { value: 'INDOOR', label: '실내기' },
  { value: 'OUTDOOR', label: '실외기' },
  { value: 'PANEL', label: '판넬' },
  { value: 'REMOTE', label: '리모컨' },
  { value: 'MATERIAL', label: '자재' },
  { value: 'ACCESSORY', label: '부속품' },
  { value: 'FOOT', label: '받침대' },
]

function isEstimateCategoryTab(
  value: string | null,
): value is (typeof ESTIMATE_CATEGORY_TABS)[number]['value'] {
  return ESTIMATE_CATEGORY_TABS.some((tab) => tab.value === value)
}

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

export interface EstimateItemsCatalogSuccessEffects {
  clearMutationError: () => void
  clearPatchingCode: () => void
  closeClassificationModal: () => void
  invalidateCatalogQueries: () => void
}

/** usage scope PATCH 성공은 분류 모달 상태를 건드리지 않는다. */
export function applyUsagePatchSuccessEffects(effects: EstimateItemsCatalogSuccessEffects): void {
  effects.clearMutationError()
  effects.clearPatchingCode()
  effects.invalidateCatalogQueries()
}

/** 고정DC 인라인 자동저장 성공은 분류 모달 상태를 건드리지 않는다. */
export function applyFixedDiscountPatchSuccessEffects(effects: EstimateItemsCatalogSuccessEffects): void {
  effects.clearMutationError()
  effects.clearPatchingCode()
  effects.invalidateCatalogQueries()
}

/** 분류 저장 성공 시 stale row 를 남기지 않도록 모달을 닫는다. */
export function applyClassificationSettingsSuccessEffects(
  effects: EstimateItemsCatalogSuccessEffects,
): void {
  effects.clearMutationError()
  effects.clearPatchingCode()
  effects.closeClassificationModal()
  effects.invalidateCatalogQueries()
}

async function fetchClassificationTree(estimateCategory: EstimateCategory): Promise<Classification[]> {
  const roots = await listClassifications({ estimateCategory })
  const midsByRoot = await Promise.all(
    roots.map((root) => listClassifications({ estimateCategory, parentId: root.id })),
  )
  const mids = midsByRoot.flat()
  const subsByMid = await Promise.all(
    mids.map((mid) => listClassifications({ estimateCategory, parentId: mid.id })),
  )
  return [...roots, ...mids, ...subsByMid.flat()]
}

function errorMsg(err: unknown): string {
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

function nextScopeForEstimateAppend(scope: UsageScope): UsageScope {
  return scope === 'PARTNER_ORDER' || scope === 'BOTH' ? 'BOTH' : 'ESTIMATE'
}

interface ToggleCellProps {
  row: ProductCatalogRow
  canEdit: boolean
  onPatch: (modelCode: string, scope: UsageScope, estimateCategories: EstimateCategory[]) => void
  patchLoading: boolean
}

function ToggleCell({
  row,
  canEdit,
  onPatch,
  patchLoading,
}: ToggleCellProps) {
  const { estimate, order } = fromUsageScope(row.usageScope)
  const selectedCategories = estimateCategoryValues(row)

  const handleEstimateChange = (checked: boolean) => {
    const newScope = toUsageScope(checked, order)
    onPatch(row.modelCode, newScope, checked ? selectedCategories : [])
  }

  const handleOrderChange = (checked: boolean) => {
    const newScope = toUsageScope(estimate, checked)
    const nextCategories = newScope === 'ESTIMATE' || newScope === 'BOTH'
      ? selectedCategories
      : []
    onPatch(row.modelCode, newScope, nextCategories)
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={estimate}
          disabled={!canEdit || patchLoading}
          onChange={(e) => handleEstimateChange(e.target.checked)}
          data-testid={`estimate-items-estimate-toggle-${row.modelCode}`}
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
          data-testid={`estimate-items-order-toggle-${row.modelCode}`}
          aria-label="주문 노출"
        />
        주문 노출
      </label>
    </div>
  )
}

interface VariableDiscountCellProps {
  row: ProductCatalogRow
  canEdit: boolean
  onVariableDiscountPatch: (modelCode: string, hasVariableDiscount: boolean) => void
  patchLoading: boolean
}

export function VariableDiscountCell({
  row,
  canEdit,
  onVariableDiscountPatch,
  patchLoading,
}: VariableDiscountCellProps) {
  if (!isVariableDiscountEligible(row)) {
    return <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
  }

  return (
    <span style={variableDiscountGroupStyle}>
      <label
        style={variableDiscountCheckboxLabelStyle}
        title="변동DC: 전역할인율 영향 없이 기초 납품가 그대로 표시"
      >
        <input
          type="checkbox"
          checked={row.hasVariableDiscount}
          disabled={!canEdit || patchLoading}
          onChange={(e) => onVariableDiscountPatch(row.modelCode, e.target.checked)}
          data-testid={`estimate-items-vdc-toggle-${row.modelCode}`}
          aria-label="변동DC"
        />
      </label>
    </span>
  )
}

interface FixedDiscountCellProps {
  row: ProductCatalogRow
  canEdit: boolean
  onFixedDiscountPatch: (modelCode: string, fixedDiscountRate: string | null) => void
  patchLoading: boolean
}

function FixedDiscountCell({
  row,
  canEdit,
  onFixedDiscountPatch,
  patchLoading,
}: FixedDiscountCellProps) {
  const initialValue = row.fixedDiscountRate == null ? '' : String(row.fixedDiscountRate)
  const [draft, setDraft] = useState(initialValue)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(initialValue)
    setLocalError(null)
  }, [initialValue])

  const handleBlur = () => {
    const decision = resolveFixedDiscountAutoSave(row.fixedDiscountRate, draft)
    if (decision.error) {
      setLocalError(decision.error)
      return
    }
    setLocalError(null)
    if (!decision.shouldPatch) return
    onFixedDiscountPatch(row.modelCode, decision.fixedDiscountRate)
  }

  return (
    <div style={fixedDiscountCellStyle}>
      <span style={fixedDiscountInputWrapStyle}>
        <Input
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            }
          }}
          disabled={!canEdit || patchLoading}
          data-testid={`estimate-items-fixed-dc-${row.modelCode}`}
          aria-label="고정DC율"
          inputSize="sm"
          fullWidth={false}
          style={{ width: 72 }}
        />
        <span style={fixedDiscountSuffixStyle}>%</span>
      </span>
      {localError ? (
        <span
          role="alert"
          title={localError}
          style={fixedDiscountErrorStyle}
          data-testid={`estimate-items-fixed-dc-error-${row.modelCode}`}
        >
          오류
        </span>
      ) : null}
    </div>
  )
}

interface ClassificationSettingsModalProps {
  open: boolean
  row: ProductCatalogRow
  classifications: Classification[]
  canEdit: boolean
  onPatch: (modelCode: string, selection: ClassificationSelection) => void
  patchLoading: boolean
  onClose: () => void
}

function ClassificationSettingsModal({
  open,
  row,
  classifications,
  canEdit,
  onPatch,
  patchLoading,
  onClose,
}: ClassificationSettingsModalProps) {
  const initialSelection: ClassificationSelection = {
    catLId: row.catL?.id ?? null,
    catMId: row.catM?.id ?? null,
    catSId: row.catS?.id ?? null,
  }
  const [selection, setSelection] = useState<ClassificationSelection>(initialSelection)

  useEffect(() => {
    if (!open) return
    setSelection(initialSelection)
  }, [
    open,
    initialSelection.catLId,
    initialSelection.catMId,
    initialSelection.catSId,
  ])

  const catLOptions = filterClassificationsByParent(classifications, 'L', null)
  const catMOptions = filterClassificationsByParent(classifications, 'M', selection.catLId)
  const catSOptions = filterClassificationsByParent(classifications, 'S', selection.catMId)

  const handleChange = (level: 'L' | 'M' | 'S', value: string) => {
    const next = nextClassificationSelection(selection, level, value || null)
    setSelection(next)
  }

  const handleSave = () => {
    onPatch(row.modelCode, selection)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`분류 설정 — ${row.modelCode}`}
      size="md"
      footer={
        canEdit ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={onClose} disabled={patchLoading}>
              닫기
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={patchLoading}
              disabled={patchLoading}
              data-testid="estimate-items-classification-modal-save"
            >
              저장
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={onClose}>닫기</Button>
        )
      }
    >
      <div
        style={classificationModalBodyStyle}
        data-testid={`estimate-items-classification-modal-${row.modelCode}`}
      >
        <div className="mobile-form-grid" style={classificationModalGridStyle}>
          <Select
            label="대분류"
            value={selection.catLId ?? ''}
            disabled={!canEdit || patchLoading}
            onChange={(e) => handleChange('L', e.target.value)}
            data-testid={`estimate-items-cat-l-${row.modelCode}`}
            selectSize="sm"
            aria-label="대분류"
          >
            <option value="">대분류 선택</option>
            {catLOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
          <Select
            label="중분류"
            value={selection.catMId ?? ''}
            disabled={!canEdit || patchLoading || !selection.catLId}
            onChange={(e) => handleChange('M', e.target.value)}
            data-testid={`estimate-items-cat-m-${row.modelCode}`}
            selectSize="sm"
            aria-label="중분류"
          >
            <option value="">중분류 선택</option>
            {catMOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
          <Select
            label="소분류"
            value={selection.catSId ?? ''}
            disabled={!canEdit || patchLoading || !selection.catMId}
            onChange={(e) => handleChange('S', e.target.value)}
            data-testid={`estimate-items-cat-s-${row.modelCode}`}
            selectSize="sm"
            aria-label="소분류"
          >
            <option value="">소분류 선택</option>
            {catSOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
        </div>
      </div>
    </Modal>
  )
}

function ClassificationSummaryCell({
  row,
  canEdit,
  patchLoading,
  onOpen,
}: {
  row: ProductCatalogRow
  canEdit: boolean
  patchLoading: boolean
  onOpen: () => void
}) {
  const summary = formatClassificationPath(row)

  return (
    <div style={classificationSummaryCellStyle} data-testid={`estimate-items-classification-${row.modelCode}`}>
      <div style={classificationSummaryTextStyle}>
        <span title={summary.pathText}>{summary.pathText}</span>
      </div>
      {canEdit ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpen}
          disabled={patchLoading}
          data-testid={`estimate-items-classification-settings-${row.modelCode}`}
        >
          설정
        </Button>
      ) : null}
    </div>
  )
}

interface CategoryCellProps {
  row: ProductCatalogRow
  canEdit: boolean
  onPatch: (modelCode: string, scope: UsageScope, estimateCategories: EstimateCategory[]) => void
  patchLoading: boolean
}

function CategoryCell({
  row,
  canEdit,
  onPatch,
  patchLoading,
}: CategoryCellProps) {
  const { estimate } = fromUsageScope(row.usageScope)
  const selectedCategories = estimateCategoryValues(row)
  const remainingOptions = ESTIMATE_CATEGORY_OPTIONS.filter(
    (opt) => !selectedCategories.includes(opt.value),
  )
  const showEstimateCategory = estimate && (row.usageScope === 'ESTIMATE' || row.usageScope === 'BOTH')

  const handleCategoryAdd = (value: string) => {
    if (!value) return
    const category = value as EstimateCategory
    if (selectedCategories.includes(category)) return
    onPatch(row.modelCode, row.usageScope, [...selectedCategories, category])
  }

  const handleCategoryRemove = (category: EstimateCategory) => {
    const nextCategories = selectedCategories.filter((current) => current !== category)
    const nextScope = nextCategories.length === 0
      ? nextScopeForEstimateCategoryRemoval(row.usageScope)
      : row.usageScope
    onPatch(
      row.modelCode,
      nextScope,
      nextCategories,
    )
  }

  if (!showEstimateCategory) {
    return <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
  }

  return (
    <div
      data-testid={`estimate-items-estimate-category-${row.modelCode}`}
      style={categoryCellStyle}
    >
      {normalizeEstimateCategoryExposures(row).map((exposure) => {
        const label = ESTIMATE_CATEGORY_LABEL[exposure.category]
        return (
          <span
            key={exposure.category}
            style={categoryChipStyle}
            data-testid={`estimate-items-estimate-category-${row.modelCode}-chip-${exposure.category}`}
          >
            <span>{label}</span>
            {canEdit && !patchLoading ? (
              <button
                type="button"
                aria-label={`${label} 제거`}
                onClick={() => handleCategoryRemove(exposure.category)}
                style={categoryChipRemoveStyle}
              >
                x
              </button>
            ) : null}
          </span>
        )
      })}
      {remainingOptions.length > 0 ? (
        <Select
          value=""
          disabled={!canEdit || patchLoading}
          onChange={(e) => handleCategoryAdd(e.target.value)}
          data-testid={`estimate-items-estimate-category-${row.modelCode}-add`}
          selectSize="sm"
          fullWidth={false}
          aria-label="견적 카테고리 추가"
          style={{ minWidth: 112 }}
        >
          <option value="">카테고리 추가</option>
          {remainingOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      ) : null}
    </div>
  )
}

interface ComponentsModalProps {
  open: boolean
  modelCode: string
  productName: string | null
  canEdit: boolean
  onClose: () => void
  onSaved: () => void
}

function ComponentsModal({
  open,
  modelCode,
  productName,
  canEdit,
  onClose,
  onSaved,
}: ComponentsModalProps) {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<ComponentDraftModel[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  const componentsQuery = useQuery({
    queryKey: ['bundle-components', modelCode],
    queryFn: () => listBundleComponents(modelCode),
    enabled: open && modelCode.length > 0,
    staleTime: 0,
  })

  const saveMutation = useMutation({
    mutationFn: (components: BundleComponentInput[]) =>
      updateBundleComponents(modelCode, components),
    onSuccess: () => {
      setModalError(null)
      void queryClient.invalidateQueries({ queryKey: ['estimate-items-catalog'] })
      void queryClient.invalidateQueries({ queryKey: ['product-catalog'] })
      void queryClient.invalidateQueries({ queryKey: ['bundle-components', modelCode] })
      onSaved()
    },
    onError: (err) => {
      setModalError(errorMsg(err))
    },
  })

  useEffect(() => {
    if (open && componentsQuery.data) {
      setDrafts(
        componentsQuery.data.map((c, idx) => ({
          componentProductCode: c.componentProductCode,
          componentName: c.componentName,
          defaultQty: c.defaultQty,
          qtyMode: c.qtyMode,
          componentKind: c.componentKind,
          componentVariant: c.componentVariant,
          isDefault: c.isDefault,
          specText: c.specText,
          displayOrder: idx + 1,
          _localId: `existing-${c.componentProductCode}-${idx}`,
          _isNew: false,
        })),
      )
    }
  }, [open, componentsQuery.data])

  const handleQuantityChange = (localId: string, value: string) => {
    const parsed = parseInt(value, 10)
    if (!isFinite(parsed) || parsed < 1) return
    setDrafts((prev) =>
      prev.map((d) => (d._localId === localId ? { ...d, defaultQty: parsed } : d)),
    )
  }

  const handleKindChange = (localId: string, value: string) => {
    setDrafts((prev) =>
      normalizeBundleComponentDraftOrder(
        prev.map((d) =>
          d._localId === localId
            ? { ...d, componentKind: value ? (value as ComponentKind) : null }
            : d,
        ),
      ),
    )
  }

  const handleDefaultChange = (localId: string, checked: boolean) => {
    setDrafts((prev) => normalizeBundleComponentDraftOrder(toggleComponentDefault(prev, localId, checked)))
  }

  const handleDelete = (localId: string) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d._localId !== localId)
      return normalizeBundleComponentDraftOrder(next)
    })
  }

  const searchComponentProducts = async (q: string): Promise<ProductOption[]> => {
    const products = await searchProductsApi(q)
    return products.filter((product) => {
      const visibleCode = product.modelCode ?? product.modelName
      return visibleCode !== modelCode && product.productType !== 'BUNDLE'
    })
  }

  const handleAdd = (product: ProductOption | null) => {
    if (!product) return
    const visibleCode = product.modelCode ?? product.modelName
    if (drafts.some((d) => d.componentProductCode === visibleCode)) return
    const newDraft: ComponentDraftModel = {
      componentProductCode: visibleCode,
      componentName: product.productName,
      defaultQty: 1,
      qtyMode: 'FOLLOW_SET',
      componentKind: null,
      componentVariant: null,
      isDefault: false,
      specText: null,
      displayOrder: drafts.length + 1,
      _localId: `new-${visibleCode}-${Date.now()}`,
      _isNew: true,
    }
    setDrafts((prev) => normalizeBundleComponentDraftOrder([...prev, newDraft]))
    setSelectedProduct(null)
  }

  const componentSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleComponentDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDrafts((prev) =>
      reorderBundleComponentDrafts(prev, String(active.id), String(over.id)),
    )
  }, [])

  const handleSave = () => {
    if (drafts.length === 0) {
      setModalError('구성품이 없습니다. 최소 1개 이상 등록해 주세요.')
      return
    }
    saveMutation.mutate(buildBundleComponentInputs(drafts))
  }

  const handleClose = () => {
    setSelectedProduct(null)
    setModalError(null)
    onClose()
  }

  const isLoading = componentsQuery.isLoading
  const isSaving = saveMutation.isPending
  const selectedProductCode = selectedProduct
    ? selectedProduct.modelCode ?? selectedProduct.modelName
    : ''
  const selectedAlreadyAdded = selectedProductCode
    ? drafts.some((d) => d.componentProductCode === selectedProductCode)
    : false
  const componentGroups = groupBundleComponentDrafts(drafts)
  const orderedDrafts = componentGroups.flatMap((group) => group.items)
  const titleProductName = productName?.trim()

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`구성품 편집 — ${modelCode}${titleProductName ? ` · ${titleProductName}` : ''}`}
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

        <section aria-label="구성품 목록">
          <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-neutral-700)' }}>
            구성품 ({drafts.length}개)
          </h4>
          {drafts.length === 0 && !isLoading ? (
            <p style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>구성품이 없습니다.</p>
          ) : null}
          <DndContext
            sensors={componentSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleComponentDragEnd}
          >
            <SortableContext
              items={orderedDrafts.map((draft) => draft._localId)}
              strategy={verticalListSortingStrategy}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {componentGroups.map((group) => (
                  <div
                    key={group.kind}
                    style={componentGroupStyle}
                    data-testid={`components-modal-kind-group-${group.kind}`}
                  >
                    <div style={componentKindHeaderStyle}>
                      {COMPONENT_KIND_OPTIONS.find((option) => option.value === group.kind)?.label ?? group.kind}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {group.items.map((draft) => {
                        const idx = orderedDrafts.findIndex((item) => item._localId === draft._localId)
                        return (
                          <SortableComponentRow
                            key={draft._localId}
                            draft={draft}
                            index={idx}
                            canEdit={canEdit}
                            isSaving={isSaving}
                            onKindChange={handleKindChange}
                            onDefaultChange={handleDefaultChange}
                            onQuantityChange={handleQuantityChange}
                            onDelete={handleDelete}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </section>

        {canEdit ? (
          <section aria-label="구성품 추가">
            <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-neutral-700)' }}>
              품목 추가 (단품만)
            </h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <ProductAutocomplete
                value={selectedProduct}
                onChange={setSelectedProduct}
                searchProducts={searchComponentProducts}
                label="품목 검색"
                placeholder="모델명 또는 품목명 입력"
                minChars={1}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAdd(selectedProduct)}
                disabled={!selectedProduct || isSaving || selectedAlreadyAdded}
                data-testid={
                  selectedProduct
                    ? `components-modal-add-${selectedProductCode}`
                    : 'components-modal-add-button'
                }
              >
                {selectedAlreadyAdded ? '추가됨' : '추가'}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </Modal>
  )
}

interface SortableComponentRowProps {
  draft: ComponentDraftModel
  index: number
  canEdit: boolean
  isSaving: boolean
  onKindChange: (localId: string, value: string) => void
  onDefaultChange: (localId: string, checked: boolean) => void
  onQuantityChange: (localId: string, value: string) => void
  onDelete: (localId: string) => void
}

function SortableComponentRow({
  draft,
  index,
  canEdit,
  isSaving,
  onKindChange,
  onDefaultChange,
  onQuantityChange,
  onDelete,
}: SortableComponentRowProps) {
  const canDrag = canEdit && !isSaving && !draft.isDefault
  const dragHandleTitle = draft.isDefault
    ? '기본 구성품은 종류 안 최상단에 고정됩니다'
    : isSaving
      ? '저장 중에는 구성품 순서를 변경할 수 없습니다'
      : '같은 종류 안에서 드래그'
  const dragHandleLabel = canDrag
    ? `${draft.componentProductCode} 구성품 드래그`
    : `${draft.componentProductCode} 구성품 드래그 비활성`
  const dragHandleDisabledStyle: CSSProperties | undefined = !canDrag
    ? { opacity: 0.35, cursor: 'not-allowed' }
    : undefined
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: draft._localId, disabled: !canDrag })

  const style: CSSProperties = {
    ...componentRowStyle,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      data-testid={`components-modal-component-row-${index}`}
      style={style}
    >
      {canEdit ? (
        <DragHandle
          label={dragHandleLabel}
          listeners={canDrag ? listeners as Record<string, unknown> | undefined : undefined}
          attributes={canDrag ? attributes as unknown as Record<string, unknown> : undefined}
          setActivatorNodeRef={setActivatorNodeRef}
          dragging={isDragging}
          disabled={!canDrag}
          data-testid={`components-modal-drag-handle-${index}`}
          title={dragHandleTitle}
          style={dragHandleDisabledStyle}
        />
      ) : null}
      <span style={{ flex: 1, fontSize: 12 }}>
        <span style={{ fontFamily: 'monospace' }}>{draft.componentProductCode}</span>
        {draft.componentName ? (
          <span style={{ color: 'var(--color-neutral-500)', marginLeft: 6 }}>{draft.componentName}</span>
        ) : null}
        <ComponentSpecBadge specText={draft.specText} index={index} />
      </span>
      {draft._isNew && canEdit ? (
        <Select
          value={draft.componentKind ?? ''}
          disabled={isSaving}
          onChange={(e) => onKindChange(draft._localId, e.target.value)}
          data-testid={`components-modal-kind-${index}`}
          selectSize="sm"
          fullWidth={false}
          style={{ minWidth: 80 }}
        >
          <option value="">분류</option>
          {COMPONENT_KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      ) : draft.componentKind ? (
        <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
          {COMPONENT_KIND_OPTIONS.find((o) => o.value === draft.componentKind)?.label ?? draft.componentKind}
        </span>
      ) : null}
      <label style={componentDefaultLabelStyle}>
        <input
          type="checkbox"
          checked={draft.isDefault}
          disabled={!canEdit || isSaving}
          onChange={(e) => onDefaultChange(draft._localId, e.target.checked)}
          data-testid={`components-modal-default-${index}`}
          aria-label={`기본 구성품 ${index + 1}`}
        />
        <span>기본</span>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>수량</span>
        <Input
          type="number"
          value={String(draft.defaultQty)}
          disabled={!canEdit || isSaving}
          onChange={(e) => onQuantityChange(draft._localId, e.target.value)}
          data-testid={`components-modal-quantity-${index}`}
          inputSize="sm"
          fullWidth={false}
          style={{ width: 64, textAlign: 'right' }}
          aria-label={`수량 ${index + 1}`}
          min={1}
          max={999}
          step={1}
        />
      </div>
      {canEdit ? (
        <button
          type="button"
          onClick={() => onDelete(draft._localId)}
          disabled={isSaving}
          data-testid={`components-modal-delete-${index}`}
          style={{ ...orderButtonStyle, color: 'var(--color-danger-600, #DC2626)' }}
          aria-label="삭제"
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}

interface ComponentSpecBadgeProps {
  specText: string | null | undefined
  index: number
}

export function ComponentSpecBadge({ specText, index }: ComponentSpecBadgeProps) {
  const componentSpecText = specText?.trim()
  if (!componentSpecText) return null

  return (
    <span
      style={componentSpecStyle}
      data-testid={`components-modal-spec-${index}`}
      title={`규격: ${componentSpecText}`}
    >
      규격 {componentSpecText}
    </span>
  )
}

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

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <tr ref={setNodeRef} style={style} data-testid={`estimate-items-row-${row.modelCode}`}>
      <td style={sortableTdStyle}>
        <DragHandle
          label={`${row.modelCode} 드래그`}
          listeners={listeners as Record<string, unknown> | undefined}
          attributes={attributes as unknown as Record<string, unknown>}
          setActivatorNodeRef={setActivatorNodeRef}
          dragging={isDragging}
        />
      </td>
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

export function EstimateItemsCatalogPage() {
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canEdit = canAccess('products.admin', 'update')
  const [searchParams, setSearchParams] = useSearchParams()

  const [searchInput, setSearchInput] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [committedCategory, setCommittedCategory] = useState<EstimateCategory>(() => {
    const requested = searchParams.get('category')
    return isEstimateCategoryTab(requested) ? requested : 'HOME_MULTI'
  })
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedProducts, setSelectedProducts] = useState<ProductOption[]>([])
  const [patchingCode, setPatchingCode] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [sortableRows, setSortableRows] = useState<ProductCatalogRow[]>([])
  const [orderDirty, setOrderDirty] = useState(false)
  const [orderSaving, setOrderSaving] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [classificationModalTarget, setClassificationModalTarget] = useState<ProductCatalogRow | null>(null)

  const hasCommittedSearch = committedSearch.trim().length > 0
  const isDragEnabled = canEdit && !hasCommittedSearch && !isMobile

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    setPageTitle({ title: '견적품목 관리', meta: '품목' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  useEffect(() => {
    const requested = searchParams.get('category')
    const nextCategory = isEstimateCategoryTab(requested) ? requested : 'HOME_MULTI'
    if (nextCategory !== committedCategory) {
      setCommittedCategory(nextCategory)
      setCurrentPage(0)
      setOrderDirty(false)
    }
    if (requested !== nextCategory) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('category', nextCategory)
        return next
      }, { replace: true })
    }
  }, [committedCategory, searchParams, setSearchParams])

  useEffect(() => {
    if (isMockMode()) return
    const ctrl = ProductRealtimeClient.subscribe('catalog', () => {
      void queryClient.invalidateQueries({ queryKey: ['estimate-items-catalog'] })
    })
    return () => ctrl.abort()
  }, [queryClient])

  const listQuery = useQuery({
    queryKey: ['estimate-items-catalog', committedSearch, committedCategory, currentPage],
    queryFn: () =>
      listProducts({
        q: committedSearch || undefined,
        category: committedCategory,
        page: currentPage,
        size: PAGE_SIZE,
      }),
    staleTime: 30_000,
  })

  const classificationsQuery = useQuery({
    queryKey: ['classifications-tree', committedCategory],
    queryFn: () => fetchClassificationTree(committedCategory),
    staleTime: 30_000,
  })

  const rawRows = listQuery.data?.content ?? []
  const rows = rawRows.filter((row) => row.usageScope !== 'NONE')

  useEffect(() => {
    if (!orderDirty) {
      setSortableRows(rows)
    }
  }, [rows, orderDirty])

  const catalogSuccessEffects: EstimateItemsCatalogSuccessEffects = {
    clearMutationError: () => setMutationError(null),
    clearPatchingCode: () => setPatchingCode(null),
    closeClassificationModal: () => setClassificationModalTarget(null),
    invalidateCatalogQueries: () => {
      void queryClient.invalidateQueries({ queryKey: ['estimate-items-catalog'] })
      void queryClient.invalidateQueries({ queryKey: ['product-catalog'] })
    },
  }

  const patchMutation = useMutation({
    mutationFn: ({
      modelCode,
      scope,
      estimateCategories,
    }: {
      modelCode: string
      scope: UsageScope
      estimateCategories: EstimateCategory[]
    }) =>
      updateProductUsage(modelCode, {
        usageScope: scope,
        estimateCategories: scope === 'ESTIMATE' || scope === 'BOTH'
          ? estimateCategories
          : [],
      }),
    onSuccess: () => {
      applyUsagePatchSuccessEffects(catalogSuccessEffects)
    },
    onError: (err) => {
      setMutationError(errorMsg(err))
      setPatchingCode(null)
    },
  })

  const variableDiscountMutation = useMutation({
    mutationFn: ({
      modelCode,
      hasVariableDiscount,
    }: {
      modelCode: string
      hasVariableDiscount: boolean
    }) => updateProductVariableDiscount(modelCode, hasVariableDiscount),
    onSuccess: () => {
      setMutationError(null)
      setPatchingCode(null)
      void queryClient.invalidateQueries({ queryKey: ['estimate-items-catalog'] })
      void queryClient.invalidateQueries({ queryKey: ['product-catalog'] })
    },
    onError: (err) => {
      setMutationError(errorMsg(err))
      setPatchingCode(null)
    },
  })

  const fixedDiscountMutation = useMutation({
    mutationFn: ({
      modelCode,
      fixedDiscountRate,
    }: {
      modelCode: string
      fixedDiscountRate: string | null
    }) => updateProductFixedDiscount(modelCode, fixedDiscountRate),
    onSuccess: () => {
      applyFixedDiscountPatchSuccessEffects(catalogSuccessEffects)
    },
    onError: (err) => {
      setMutationError(errorMsg(err))
      setPatchingCode(null)
    },
  })

  const classificationSettingsMutation = useMutation({
    mutationFn: ({
      modelCode,
      selection,
    }: {
      modelCode: string
      selection: ClassificationSelection
    }) =>
      updateProductClassificationSettings(modelCode, {
        ...selection,
      }),
    onSuccess: () => {
      applyClassificationSettingsSuccessEffects(catalogSuccessEffects)
    },
    onError: (err) => {
      setMutationError(errorMsg(err))
      setPatchingCode(null)
    },
  })

  const addProductMutation = useMutation({
    mutationFn: async (product: ProductOption) => {
      const modelCode = product.modelCode ?? product.modelName
      const detail = await listProducts({ q: modelCode, page: 0, size: 20 })
      const existing = detail.content.find((row) => row.modelCode === modelCode)
      if (!existing || existing.productCategory === 'MATERIAL') {
        throw new Error('견적품목으로 추가할 수 없는 기초품목입니다.')
      }
      if (estimateCategoryValues(existing).includes(committedCategory)) {
        throw new Error('이미 현재 카테고리에 노출 중인 품목입니다.')
      }
      const nextCategories = Array.from(new Set([
        ...(existing ? estimateCategoryValues(existing) : []),
        committedCategory,
      ]))
      const nextScope = nextScopeForEstimateAppend(existing?.usageScope ?? 'NONE')
      return updateProductUsage(modelCode, {
        usageScope: nextScope,
        estimateCategories: nextCategories,
      })
    },
    onSuccess: () => {
      setSelectedProducts([])
      setMutationError(null)
      void queryClient.invalidateQueries({ queryKey: ['estimate-items-catalog'] })
      void queryClient.invalidateQueries({ queryKey: ['product-catalog'] })
    },
    onError: (err) => {
      setMutationError(errorMsg(err))
    },
  })

  const handleQuery = useCallback(() => {
    setCurrentPage(0)
    setOrderDirty(false)
    setCommittedSearch(searchInput)
  }, [searchInput])

  const handleCategoryChange = useCallback((value: EstimateCategory) => {
    setCommittedCategory(value)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('category', value)
      return next
    }, { replace: true })
    setCurrentPage(0)
    setOrderDirty(false)
  }, [setSearchParams])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleQuery()
    },
    [handleQuery],
  )

  const handlePatch = useCallback(
    (modelCode: string, scope: UsageScope, estimateCategories: EstimateCategory[]) => {
      setPatchingCode(modelCode)
      setMutationError(null)
      patchMutation.mutate({ modelCode, scope, estimateCategories })
    },
    [patchMutation],
  )

  const handleVariableDiscountPatch = useCallback(
    (modelCode: string, hasVariableDiscount: boolean) => {
      setPatchingCode(modelCode)
      setMutationError(null)
      variableDiscountMutation.mutate({ modelCode, hasVariableDiscount })
    },
    [variableDiscountMutation],
  )

  const handleFixedDiscountPatch = useCallback(
    (modelCode: string, fixedDiscountRate: string | null) => {
      setPatchingCode(modelCode)
      setMutationError(null)
      fixedDiscountMutation.mutate({ modelCode, fixedDiscountRate })
    },
    [fixedDiscountMutation],
  )

  const handleClassificationSettingsPatch = useCallback(
    (modelCode: string, selection: ClassificationSelection) => {
      setPatchingCode(modelCode)
      setMutationError(null)
      classificationSettingsMutation.mutate({ modelCode, selection })
    },
    [classificationSettingsMutation],
  )

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

  const handleSaveOrder = useCallback(async () => {
    if (!isDragEnabled) return
    setOrderSaving(true)
    setOrderError(null)
    try {
      const firstPage = await listProducts({
        category: committedCategory,
        page: 0,
        size: DISPLAY_ORDER_FULL_SIZE,
      })
      const remainingPages = await Promise.all(
        Array.from({ length: Math.max(0, firstPage.totalPages - 1) }, (_, i) =>
          listProducts({
            category: committedCategory,
            page: i + 1,
            size: DISPLAY_ORDER_FULL_SIZE,
          }),
        ),
      )
      const allRows = [firstPage, ...remainingPages].flatMap((page) => page.content)
      const allExposed = allRows.filter((r) => r.usageScope !== 'NONE')
      const currentPageCodes = new Set(
        sortableRows.filter((r) => r.usageScope !== 'NONE').map((r) => r.modelCode),
      )
      const outsideItems = allExposed.filter((r) => !currentPageCodes.has(r.modelCode))
      const firstPageItemOriginalIdx = allExposed.findIndex((r) =>
        currentPageCodes.has(r.modelCode),
      )
      const insertAt = firstPageItemOriginalIdx < 0 ? outsideItems.length : firstPageItemOriginalIdx
      const currentPageOrdered = sortableRows.filter((r) => r.usageScope !== 'NONE')
      const merged = [
        ...outsideItems.slice(0, insertAt),
        ...currentPageOrdered,
        ...outsideItems.slice(insertAt),
      ]
      const orders = buildCategoryDisplayOrderInputs(merged, committedCategory)

      if (orders.length === 0) {
        setOrderError('노출 품목이 없어 순서를 저장할 수 없습니다.')
        return
      }

      await updateDisplayOrders(orders)
      setOrderDirty(false)
      void queryClient.invalidateQueries({ queryKey: ['estimate-items-catalog'] })
    } catch (err) {
      setOrderError(errorMsg(err))
    } finally {
      setOrderSaving(false)
    }
  }, [sortableRows, queryClient, committedCategory, isDragEnabled])

  const searchMasterProducts = useCallback(async (q: string): Promise<ProductOption[]> => {
    const products = await searchProductsApi(q, { size: 10000 })
    const checked = await Promise.all(
      products.map(async (product) => {
        const modelCode = product.modelCode ?? product.modelName
        if (!modelCode) return null
        const detail = await listProducts({ q: modelCode, page: 0, size: 20 })
        const catalogRow = detail.content.find((row) => row.modelCode === modelCode)
        if (!catalogRow || catalogRow.productCategory === 'MATERIAL') return null
        if (estimateCategoryValues(catalogRow).includes(committedCategory)) {
          return null
        }
        return product
      }),
    )
    return checked.filter((product): product is ProductOption => product != null)
  }, [committedCategory])

  const { totalElements, totalPages } = resolveEstimateItemsPageTotals(listQuery.data)
  const selectedProductCodes = selectedProducts.map((product) => product.modelCode ?? product.modelName)
  const selectedAlreadyAdded = selectedProductCodes.some((code) => rows.some(
    (row) => row.modelCode === code && estimateCategoryValues(row).includes(committedCategory),
  ))

  const columns: DataTableColumn<ProductCatalogRow>[] = [
    ...(isDragEnabled
      ? [
            {
              key: '_drag' as const,
              header: '',
              width: '32px',
              mobilePriority: 'hidden',
              render: () => null,
            } as DataTableColumn<ProductCatalogRow>,
        ]
      : []),
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
      key: 'catL',
      header: '분류',
      width: '240px',
      mobilePriority: 'hidden',
      render: (row) => (
        <ClassificationSummaryCell
          row={row}
          canEdit={canEdit}
          patchLoading={patchingCode === row.modelCode}
          onOpen={() => setClassificationModalTarget(row)}
        />
      ),
    },
    {
      key: 'estimateCategory',
      header: '카테고리',
      width: '280px',
      mobilePriority: 'secondary',
      render: (row) => (
        <CategoryCell
          row={row}
          canEdit={canEdit}
          onPatch={handlePatch}
          patchLoading={patchingCode === row.modelCode}
        />
      ),
    },
    {
      key: 'usageScope',
      header: '노출 설정',
      width: '190px',
      mobilePriority: 'hidden',
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
      key: 'hasVariableDiscount',
      header: '변동DC',
      width: '100px',
      mobilePriority: 'hidden',
      render: (row) => (
        <VariableDiscountCell
          row={row}
          canEdit={canEdit}
          onVariableDiscountPatch={handleVariableDiscountPatch}
          patchLoading={patchingCode === row.modelCode}
        />
      ),
    },
    {
      key: 'fixedDiscountRate',
      header: '고정DC%',
      width: '110px',
      mobilePriority: 'hidden',
      render: (row) => (
        <FixedDiscountCell
          row={row}
          canEdit={canEdit}
          onFixedDiscountPatch={handleFixedDiscountPatch}
          patchLoading={patchingCode === row.modelCode}
        />
      ),
    },
    {
      key: 'displayOrder',
      header: '표시순서',
      width: '80px',
      mobilePriority: 'hidden',
      render: (row) => {
        if (normalizeEstimateCategoryExposures(row).length === 0) {
          return <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
        }
        const order = exposureDisplayOrder(row, committedCategory)
        return order != null ? String(order) : <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
      },
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
            data-testid={`estimate-items-set-badge-${row.modelCode}`}
          >
            {`세트 · ${row.componentCount ?? 0}`}
          </Badge>
        ) : (
          <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
        ),
    },
  ]

  return (
    <div style={pageStyle}>
      <div style={headerRowStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>견적품목 관리</h3>
          <span style={subtitleStyle}>
            기초품목에서 선택한 판매 노출 항목과 카테고리별 표시순서를 관리합니다.
          </span>
        </div>
      </div>

      {canEdit ? null : (
        <div role="status" style={readOnlyBannerStyle} data-testid="estimate-items-readonly-banner">
          조회 전용 — 노출 변경 권한이 없습니다.
        </div>
      )}

      <section style={toolbarStyle} aria-label="조회 조건">
        <div
          role="tablist"
          aria-label="견적 카테고리"
          data-testid="estimate-items-category-tabs"
          style={tabsStyle}
        >
          {ESTIMATE_CATEGORY_TABS.map((tab) => {
            const selected = committedCategory === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selected}
                style={{
                  ...tabButtonStyle,
                  ...(selected ? tabButtonSelectedStyle : {}),
                }}
                onClick={() => handleCategoryChange(tab.value)}
                data-testid={`estimate-items-category-tab-${tab.value}`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <div style={fieldStyle}>
          <Input
            label="모델명 검색"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="모델명 또는 품목명 입력"
            data-testid="estimate-items-search-input"
            inputSize="sm"
            fullWidth={false}
            style={{ minWidth: 220 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <Button
            variant="primary"
            onClick={handleQuery}
            loading={listQuery.isFetching}
            disabled={listQuery.isFetching}
            data-testid="estimate-items-query-button"
          >
            조회
          </Button>
          {canEdit ? (
            <Button
              variant="primary"
              onClick={() => { void handleSaveOrder() }}
              loading={orderSaving}
              disabled={orderSaving || listQuery.isFetching || rows.length === 0 || !isDragEnabled}
              data-testid="estimate-items-save-order-button"
            >
              순서 저장
            </Button>
          ) : null}
          {isDragEnabled && !orderDirty && rows.length > 0 ? (
            <span style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>
              행을 드래그하여 순서 조정
            </span>
          ) : null}
          {canEdit && hasCommittedSearch ? (
            <span
              style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}
              data-testid="estimate-items-drag-disabled-caption"
            >
              검색 중 — 검색을 비우면 순서 조정 가능
            </span>
          ) : null}
          {listQuery.isError ? (
            <span role="alert" style={errorBannerStyle}>
              {errorMsg(listQuery.error)}
            </span>
          ) : null}
        </div>
      </section>

      {canEdit ? (
        <section
          style={toolbarStyle}
          aria-label="기초품목 선택 추가"
          data-testid="estimate-items-add-product"
        >
          <ProductMultiSelectAutocomplete
            selected={selectedProducts}
            onAdd={(product) => setSelectedProducts((current) => [...current, product])}
            onRemove={(product) => setSelectedProducts((current) => current.filter((item) => item.id !== product.id))}
            searchProducts={searchMasterProducts}
            label="기초품목 선택"
            placeholder="모델명 또는 품목명 입력"
            minChars={1}
          />
          <Button
            variant="secondary"
            size="sm"
              onClick={() => {
                selectedProducts.forEach((product) => addProductMutation.mutate(product))
              }}
              loading={addProductMutation.isPending}
              disabled={
              selectedProducts.length === 0 ||
              selectedAlreadyAdded ||
              addProductMutation.isPending
            }
            data-testid="estimate-items-add-product-button"
          >
            {selectedAlreadyAdded
              ? '이미 노출됨'
              : selectedProducts.length > 0
                ? `${selectedProducts.length}건 추가`
                : '현재 카테고리에 추가'}
          </Button>
        </section>
      ) : null}

      {mutationError ? (
        <div role="alert" style={errorBannerStyle} data-testid="estimate-items-mutation-error">
          {mutationError}
        </div>
      ) : null}

      {orderError ? (
        <div role="alert" style={errorBannerStyle} data-testid="estimate-items-order-error">
          {orderError}
        </div>
      ) : null}

      {classificationsQuery.isError ? (
        <div role="alert" style={errorBannerStyle} data-testid="estimate-items-classifications-error">
          분류 옵션을 불러오지 못했습니다. {errorMsg(classificationsQuery.error)}
        </div>
      ) : null}

      <section style={tableSectionStyle} data-testid="estimate-items-table">
        {isDragEnabled ? (
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
                        <th style={{ ...sortableThStyle, width: 32 }} />
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
                            colSpan={columns.filter((c) => c.key !== '_drag').length + 1}
                            style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--color-neutral-400)', fontSize: 13 }}
                          >
                            노출 중인 견적품목이 없습니다. 기초품목을 선택해 현재 카테고리에 추가하세요.
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
            emptyMessage="노출 중인 견적품목이 없습니다. 기초품목을 선택해 현재 카테고리에 추가하세요."
          />
        )}
      </section>

      {listQuery.isError && rows.length === 0 ? (
        <div role="alert" style={errorBannerStyle} data-testid="estimate-items-list-error">
          목록 조회 중 오류가 발생했습니다. {errorMsg(listQuery.error)}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div style={summaryStyle} data-testid="estimate-items-summary">
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
                onClick={() => {
                  setOrderDirty(false)
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
                  setOrderDirty(false)
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

      {classificationModalTarget ? (
        <ClassificationSettingsModal
          open={true}
          row={classificationModalTarget}
          classifications={classificationsQuery.data ?? []}
          canEdit={canEdit}
          onPatch={handleClassificationSettingsPatch}
          patchLoading={patchingCode === classificationModalTarget.modelCode}
          onClose={() => setClassificationModalTarget(null)}
        />
      ) : null}
    </div>
  )
}

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

const tabsStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  flexWrap: 'nowrap',
  gap: 4,
  padding: 2,
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 6,
  background: 'var(--color-neutral-50, #F7F8FA)',
  maxWidth: '100%',
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
}

const tabButtonStyle: CSSProperties = {
  appearance: 'none',
  border: '1px solid transparent',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--color-neutral-600, #4B5563)',
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const tabButtonSelectedStyle: CSSProperties = {
  borderColor: 'var(--color-primary-200, #BFDBFE)',
  background: 'var(--color-bg, #FFFFFF)',
  color: 'var(--color-primary-700, #1D4ED8)',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
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

const categoryCellStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
  alignItems: 'center',
  flexWrap: 'wrap',
}

const categoryChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 6px',
  border: '1px solid var(--color-primary-200, #BFDBFE)',
  borderRadius: 999,
  background: 'var(--color-primary-50, #EFF6FF)',
  color: 'var(--color-primary-700, #1D4ED8)',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
}

const categoryChipRemoveStyle: CSSProperties = {
  appearance: 'none',
  border: 0,
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  padding: '0 1px',
  fontSize: 12,
  lineHeight: 1,
}

const variableDiscountGroupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
}

const variableDiscountCheckboxLabelStyle: CSSProperties = {
  ...checkboxLabelStyle,
  justifyContent: 'center',
  gap: 0,
}

const fixedDiscountCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const fixedDiscountInputWrapStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
}

const fixedDiscountSuffixStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-neutral-500, #6B7280)',
}

const fixedDiscountErrorStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--color-danger-700, #991B1B)',
  whiteSpace: 'nowrap',
}

const tableSectionStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
}

const classificationSummaryCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minWidth: 0,
}

const classificationSummaryTextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
  fontSize: 12,
  color: 'var(--color-neutral-700, #363D49)',
}

const classificationModalBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 120,
}

const classificationModalGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))',
  gap: 10,
  alignItems: 'end',
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

const componentRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  background: 'var(--color-neutral-50, #F7F8FA)',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 4,
}

const componentGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const componentKindHeaderStyle: CSSProperties = {
  padding: '2px 4px',
  borderBottom: '1px solid var(--color-border, #E5E7EB)',
  color: 'var(--color-neutral-600, #4B5563)',
  fontSize: 11,
  fontWeight: 600,
}

const componentDefaultLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  color: 'var(--color-neutral-600, #4B5563)',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
}

const componentSpecStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  marginLeft: 6,
  color: 'var(--color-neutral-600, #4B5563)',
  fontSize: 11,
  whiteSpace: 'nowrap',
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
