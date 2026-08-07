import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Input,
  Select,
  Spinner,
} from '@samhan/design-system'
import {
  createProduct,
  getProductByModelName,
  listProductCategories,
  listProducts,
  listSpecKeyTemplates,
  searchProductSummaries,
  updateProduct,
  type BundleMode,
  type EstimateCategory,
  type ProductFormItemKind,
  type ProductCategory,
  type ProductCategoryNode,
  type ProductDetailResponse,
  type ProductGoodsType,
  type SpecKeyTemplateResponse,
  type SpecKeyValueType,
} from '../api/productCatalogApi'
import { usePageTitleStore } from '../stores/pageTitle'
import {
  buildCreateProductRequest,
  buildUpdateProductRequest,
  applyProductCategoryDefaults,
  composeDimensionSpecValue,
  composeRangeSpecValue,
  editSeedToProductFormValues,
  initialProductFormValues,
  moveSpecRow,
  reconcileSpecValueType,
  specPatchForKeyChange,
  splitDimensionSpecValue,
  splitRangeSpecValue,
  validateProductForm,
  type ProductFormErrors,
  type ProductFormValues,
} from './productFormModel'

const ITEM_KIND_OPTIONS: Array<{ value: ProductFormItemKind; label: string }> = [
  { value: 'GENERAL', label: '단일' },
  { value: 'SET', label: '세트' },
]

const GOODS_TYPE_OPTIONS: Array<{ value: ProductGoodsType; label: string }> = [
  { value: 'GOODS', label: '상품' },
  { value: 'NON_GOODS', label: '비상품' },
]

const PRODUCT_CATEGORY_OPTIONS: Array<{ value: ProductCategory; label: string }> = [
  { value: 'HOME_MULTI', label: '홈멀티' },
  { value: 'SINGLE_SET', label: '싱글중대형' },
  { value: 'SINGLE_PART', label: '싱글 구성품' },
  { value: 'COMMERCIAL_MULTI', label: '상업멀티' },
  { value: 'COMMERCIAL_PART', label: '상업 구성품' },
  { value: 'OLD', label: '구형' },
  { value: 'MATERIAL', label: '자재' },
]

const BUNDLE_MODE_OPTIONS: Array<{ value: BundleMode; label: string }> = [
  { value: 'EXPAND', label: '구성품 펼침' },
  { value: 'KEEP', label: '세트 유지' },
]

const VALUE_TYPE_LABELS: Record<SpecKeyValueType, string> = {
  NUMBER: '숫자',
  DIMENSION: '크기',
  RANGE: '범위',
  TEXT: '텍스트',
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

function flattenCategories(nodes: ProductCategoryNode[], depth = 0): Array<{ id: string; label: string }> {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'　'.repeat(depth)}${node.name} (${node.code})` },
    ...flattenCategories(node.children ?? [], depth + 1),
  ])
}

function defaultCategoryForItemKind(itemKind: ProductFormItemKind): ProductCategory {
  if (itemKind === 'SET') return 'SINGLE_SET'
  return 'SINGLE_PART'
}

function estimateCategoryForProductCategory(category: ProductCategory): EstimateCategory | undefined {
  if (category === 'HOME_MULTI') return 'HOME_MULTI'
  if (category === 'SINGLE_SET' || category === 'SINGLE_PART') return 'SINGLE_SET'
  if (category === 'COMMERCIAL_MULTI' || category === 'COMMERCIAL_PART') return 'COMMERCIAL_MULTI'
  return undefined // OLD/MATERIAL 등 — 홈/싱글/상업 외(개발책임자 스코프). 전체 템플릿 fallback.
}

function sortedTemplates(templates: SpecKeyTemplateResponse[]): SpecKeyTemplateResponse[] {
  return [...templates].sort((a, b) =>
    (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER) ||
    a.specKey.localeCompare(b.specKey, 'ko'),
  )
}

export function ProductFormPage() {
  const params = useParams()
  const modelCode = params['modelCode'] ?? null
  const mode: 'create' | 'edit' = modelCode ? 'edit' : 'create'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setPageTitle = usePageTitleStore((state) => state.setPageTitle)

  const [values, setValues] = useState<ProductFormValues>(() => initialProductFormValues())
  const [errors, setErrors] = useState<ProductFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [draggingSpecIndex, setDraggingSpecIndex] = useState<number | null>(null)
  const editSeedReconciledModelRef = useRef<string | null>(null)

  useEffect(() => {
    setPageTitle({ title: mode === 'create' ? '품목 등록' : '품목 수정', meta: '품목' })
    return () => setPageTitle({ title: '' })
  }, [mode, setPageTitle])

  const categoriesQuery = useQuery({
    queryKey: ['product-categories'],
    queryFn: listProductCategories,
    staleTime: 5 * 60 * 1000,
  })

  const estimateCategory = useMemo(
    () => estimateCategoryForProductCategory(values.productCategory),
    [values.productCategory],
  )

  const specKeyTemplatesQuery = useQuery({
    queryKey: ['spec-key-templates', estimateCategory ?? 'all'],
    queryFn: async () => {
      try {
        return await listSpecKeyTemplates(estimateCategory)
      } catch {
        return []
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  const editSeedQuery = useQuery({
    queryKey: ['product-form', modelCode],
    enabled: mode === 'edit' && !!modelCode,
    queryFn: async () => {
      const summaries = await searchProductSummaries(modelCode ?? '', 20)
      const summary = summaries.find((item) => {
        const visibleCode = item.modelCode ?? item.modelName
        return visibleCode === modelCode || item.modelName === modelCode
      }) ?? summaries[0]
      if (!summary) {
        throw new Error('수정할 품목을 찾을 수 없습니다.')
      }
      const [detail, catalogPage] = await Promise.all([
        getProductByModelName(summary.modelName),
        listProducts({ q: modelCode ?? '', size: 20 }),
      ])
      const catalog = catalogPage.content.find((row) => row.modelCode === modelCode)
      return { summary, detail, catalog }
    },
  })

  const bundleComponentCount = editSeedQuery.data?.catalog?.componentCount ?? 0
  const bundleComponentSetToken = editSeedQuery.data?.catalog?.componentSetToken
  const requiresBundleChildrenConfirmation = mode === 'edit'
    && editSeedQuery.data?.summary.productType === 'BUNDLE'
    && (values.itemKind !== 'SET' || values.productCategory === 'MATERIAL')

  // #831-hydrate — editSeed 하이드레이션을 useEffect 대신 렌더 중 파생으로 처리한다(같은 계열,
  // CashReceiptFormPage #831-hydrate 수단 1과 동일). useEffect 로 하면 "isLoading→false 렌더"
  // (values 는 아직 initialProductFormValues())와 "values 가 채워지는 렌더"(effect 실행 후)
  // 사이에 실제로 커밋되는 프레임이 존재한다. 이 파일의 Save 버튼은 isSaving 으로만 disabled
  // 되므로(CashReceiptFormPage 와 달리 JournalFormPage 의 isBalanced 같은 추가 게이트가 없다)
  // 그 프레임에서 저장을 누르면 validateProductForm 이 initialProductFormValues() 의 빈
  // name/modelName/categoryId 에 대해 "~입력해 주세요" 오류를 실제 품목에 대해 낸다. 렌더 중
  // setState 를 호출하면 React 는 이 프레임을 커밋하지 않고 새 state 로 즉시 재렌더하므로
  // (공식 패턴: "Adjusting state when a prop changes") 이 창 자체가 사라진다.
  //
  // 기존 useEffect 는 ref(editSeedLoadedModelRef)로 "이 modelCode 는 이미 hydrate 했다"를
  // 추적해 재조회(refetch)가 로컬 편집을 덮어쓰지 않게 했다 — 그 시맨틱을 identical 하게
  // 보존하기 위해 ref 대신 state(hydratedModelCode)로 동일 가드를 둔다(렌더 중 setState 패턴은
  // state 로 가드해야 StrictMode 재호출에서도 순수하다 — ref 를 가드 조건으로 쓰면 재호출 시
  // 조건이 먼저 mutate 된 ref 때문에 어긋날 수 있다). 아래 두 번째 useEffect(사양 reconcile)의
  // "이 modelCode 는 이미 base hydrate 됐다" 가드도 동일 state 를 그대로 사용해 순서 보장을
  // 유지한다(하이드레이션 자체가 렌더 중 먼저 끝나므로 순서는 항상 만족된다).
  const [hydratedModelCode, setHydratedModelCode] = useState<string | null>(null)
  if (mode === 'edit' && modelCode && editSeedQuery.data && hydratedModelCode !== modelCode) {
    setHydratedModelCode(modelCode)
    editSeedReconciledModelRef.current = null
    setValues(editSeedToProductFormValues(editSeedQuery.data))
  }

  const categoryOptions = useMemo(
    () => flattenCategories(categoriesQuery.data ?? []),
    [categoriesQuery.data],
  )

  const specTemplates = useMemo(() => sortedTemplates(specKeyTemplatesQuery.data ?? []), [specKeyTemplatesQuery.data])

  const specTemplateByKey = useMemo(() => {
    const map = new Map<string, SpecKeyTemplateResponse>()
    for (const template of specTemplates) {
      map.set(template.specKey, template)
    }
    return map
  }, [specTemplates])

  useEffect(() => {
    const seed = editSeedQuery.data
    if (!seed || mode !== 'edit' || !modelCode) return
    // #831-hydrate — 위 base hydrate 의 완료 여부를 이제 ref 대신 hydratedModelCode state 로
    // 판정한다(base hydrate 가 렌더 중 파생으로 바뀌어도 "이 modelCode 는 이미 base hydrate
    // 됐다" 판정 시맨틱은 동일하게 유지).
    if (hydratedModelCode !== modelCode) return
    if (editSeedReconciledModelRef.current === modelCode) return
    if (specTemplateByKey.size === 0) return

    const seedValues = editSeedToProductFormValues(seed)
    const seedEstimateCategory = estimateCategoryForProductCategory(seedValues.productCategory)
    if (seedEstimateCategory && estimateCategory !== seedEstimateCategory) return

    editSeedReconciledModelRef.current = modelCode
    setValues((current) => ({
      ...current,
      specs: current.specs.map((spec) => {
        const template = specTemplateByKey.get(spec.specKey)
        if (!template) return spec
        return {
          ...spec,
          unit: spec.unit || template.defaultUnit || '',
          valueType: reconcileSpecValueType(template.valueType, spec.specValue),
        }
      }),
    }))
  }, [editSeedQuery.data, estimateCategory, hydratedModelCode, mode, modelCode, specTemplateByKey])

  const selectedSpecKeys = useMemo(() => {
    return new Set(values.specs.map((spec) => spec.specKey.trim()).filter(Boolean))
  }, [values.specs])

  const availableTemplatesForRow = (index: number) => {
    const currentKey = values.specs[index]?.specKey.trim()
    return specTemplates.filter((template) =>
      template.specKey === currentKey || !selectedSpecKeys.has(template.specKey),
    )
  }

  const selectedTemplateCount = useMemo(() => {
    return specTemplates.filter((template) => selectedSpecKeys.has(template.specKey)).length
  }, [selectedSpecKeys, specTemplates])

  const invalidateProducts = () => {
    void queryClient.invalidateQueries({ queryKey: ['product-catalog'] })
    void queryClient.invalidateQueries({ queryKey: ['product-catalog-search'] })
    void queryClient.invalidateQueries({ queryKey: ['product-form'] })
    void queryClient.invalidateQueries({ queryKey: ['bundle-components'] })
  }

  const saveMutation = useMutation<ProductDetailResponse, unknown, boolean>({
    mutationFn: async (confirmBundleChildrenDeletion = false) => {
      const nextErrors = validateProductForm(values, mode)
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length > 0) {
        throw new Error('입력값을 확인해 주세요.')
      }
      if (mode === 'create') {
        return createProduct(buildCreateProductRequest(values))
      }
      const id = editSeedQuery.data?.detail.id ?? editSeedQuery.data?.summary.id
      if (!id) throw new Error('수정할 품목을 찾을 수 없습니다.')
      return updateProduct(id, {
        ...buildUpdateProductRequest(values),
        ...(confirmBundleChildrenDeletion ? {
          confirmBundleChildrenDeletion: true,
          expectedBundleComponentSetToken: bundleComponentSetToken,
        } : {}),
      })
    },
    onSuccess: () => {
      setFormError(null)
      invalidateProducts()
      navigate('/products/catalog')
    },
    onError: (err) => {
      setFormError(errorMsg(err))
      if (requiresBundleChildrenConfirmation) {
        void editSeedQuery.refetch()
      }
    },
  })

  const handleSave = () => {
    const needsConfirmation = requiresBundleChildrenConfirmation && bundleComponentCount > 0
    if (needsConfirmation && !window.confirm(
      `이 세트의 구성품 ${bundleComponentCount}건이 삭제됩니다. 계속 저장하시겠습니까?`,
    )) {
      return
    }
    saveMutation.mutate(needsConfirmation)
  }

  const patchValues = (patch: Partial<ProductFormValues>) => {
    setValues((current) => ({ ...current, ...patch }))
    setErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(patch) as Array<keyof ProductFormValues>) {
        delete next[key]
      }
      return next
    })
  }

  const handleItemKindChange = (itemKind: ProductFormItemKind) => {
    patchValues({
      itemKind,
      productCategory: defaultCategoryForItemKind(itemKind),
      bundleMode: itemKind === 'SET' ? values.bundleMode : 'EXPAND',
    })
  }

  const handleProductCategoryChange = (productCategory: ProductCategory) => {
    patchValues(applyProductCategoryDefaults(values, productCategory))
  }

  const addSpecRow = () => {
    patchValues({ specs: [...values.specs, { specKey: '', specValue: '', unit: '', valueType: 'TEXT' }] })
  }

  const updateSpecRow = (
    index: number,
    patch: Partial<ProductFormValues['specs'][number]>,
  ) => {
    patchValues({
      specs: values.specs.map((spec, currentIndex) =>
        currentIndex === index ? { ...spec, ...patch } : spec,
      ),
    })
  }

  const removeSpecRow = (index: number) => {
    patchValues({
      specs: values.specs.filter((_, currentIndex) => currentIndex !== index),
    })
  }

  const changeSpecKey = (index: number, specKey: string) => {
    const current = values.specs[index]
    const template = specTemplateByKey.get(specKey)
    updateSpecRow(index, specPatchForKeyChange(current, specKey, template))
  }

  const reorderSpecRows = (fromIndex: number, toIndex: number) => {
    patchValues({
      specs: moveSpecRow(values.specs, fromIndex, toIndex),
    })
  }

  const updateDimensionPart = (
    index: number,
    partIndex: 0 | 1 | 2,
    nextValue: string,
  ) => {
    const current = values.specs[index]
    if (!current) return
    const parts = splitDimensionSpecValue(current.specValue)
    parts[partIndex] = nextValue
    updateSpecRow(index, {
      specValue: composeDimensionSpecValue(parts[0], parts[1], parts[2]),
    })
  }

  const updateRangePart = (
    index: number,
    partIndex: 0 | 1 | 2,
    nextValue: string,
  ) => {
    const current = values.specs[index]
    if (!current) return
    const parts = splitRangeSpecValue(current.specValue)
    parts[partIndex] = nextValue
    updateSpecRow(index, {
      specValue: composeRangeSpecValue(parts[0], parts[1], parts[2]),
    })
  }

  const isLoading = categoriesQuery.isLoading || editSeedQuery.isLoading
  const isSaving = saveMutation.isPending

  if (isLoading) {
    return (
      <div style={loadingStyle}>
        <Spinner size="md" label="품목 정보를 불러오는 중" />
      </div>
    )
  }

  if (editSeedQuery.isError) {
    return (
      <div style={pageStyle}>
        <div role="alert" style={errorBannerStyle}>{errorMsg(editSeedQuery.error)}</div>
        <Button variant="secondary" onClick={() => navigate('/products/catalog')}>목록으로</Button>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={{ margin: 0 }}>{mode === 'create' ? '품목 등록' : '품목 수정'}</h3>
          <p style={subtitleStyle}>
            {mode === 'create'
              ? '단일 품목과 세트를 등록합니다.'
              : `모델코드 ${modelCode ?? ''} 품목을 수정합니다.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => navigate('/products/catalog')} disabled={isSaving}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={isSaving}
            disabled={isSaving}
            data-testid="product-form-save-button"
          >
            저장
          </Button>
        </div>
      </div>

      {formError ? (
        <div role="alert" style={errorBannerStyle} data-testid="product-form-error">
          {formError}
        </div>
      ) : null}

      <section style={sectionStyle}>
        <h4 style={sectionTitleStyle}>기본 정보</h4>

        <div style={fieldBlockStyle}>
          <span style={labelStyle}>품목 종류</span>
          <div style={segmentedStyle} role="radiogroup" aria-label="품목 종류">
            {ITEM_KIND_OPTIONS.map((option) => (
              <label key={option.value} style={radioPillStyle(values.itemKind === option.value)}>
                <input
                  type="radio"
                  name="itemKind"
                  value={option.value}
                  checked={values.itemKind === option.value}
                  onChange={() => handleItemKindChange(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="mobile-form-grid" style={gridStyle}>
          <Input
            label="모델명"
            required
            value={values.modelName}
            onChange={(event) => patchValues({ modelName: event.target.value })}
            error={errors.modelName}
            data-testid="product-form-model-name"
          />
          <Input
            label="품목명"
            required
            value={values.name}
            onChange={(event) => patchValues({ name: event.target.value })}
            error={errors.name}
            data-testid="product-form-name"
          />
          <Select
            label="카테고리"
            required
            value={values.categoryId}
            onChange={(event) => patchValues({ categoryId: event.target.value })}
            error={errors.categoryId}
            data-testid="product-form-category"
          >
            <option value="">카테고리 선택</option>
            {categoryOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </Select>
          <Select
            label="상품 구분"
            value={values.goodsType}
            onChange={(event) => patchValues({ goodsType: event.target.value as ProductGoodsType })}
            data-testid="product-form-goods-type"
          >
            {GOODS_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          <Select
            label="내부 분류"
            value={values.productCategory}
            onChange={(event) => handleProductCategoryChange(event.target.value as ProductCategory)}
            data-testid="product-form-product-category"
          >
            {PRODUCT_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          <Input
            label="단위"
            value={values.unit}
            onChange={(event) => patchValues({ unit: event.target.value })}
            placeholder="EA"
            data-testid="product-form-unit"
          />
        </div>
      </section>

      {values.itemKind === 'SET' ? (
        <section style={sectionStyle}>
          <h4 style={sectionTitleStyle}>세트 설정</h4>
          <Select
            label="세트 처리"
            value={values.bundleMode}
            onChange={(event) => patchValues({ bundleMode: event.target.value as BundleMode })}
            data-testid="product-form-bundle-mode"
          >
            {BUNDLE_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </section>
      ) : null}

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h4 style={sectionTitleStyle}>사양</h4>
            <p style={hintStyle}>
              {estimateCategory ? `${estimateCategory} 사양 ${specTemplates.length}개` : '전체 사양'}
              {selectedTemplateCount > 0 ? ` · 선택됨 ${selectedTemplateCount}개` : ''}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={addSpecRow}
            disabled={isSaving}
            data-testid="product-form-add-spec"
          >
            사양 추가
          </Button>
        </div>
        {values.specs.length > 0 ? (
          <div style={specRowsStyle}>
            {values.specs.map((spec, index) => {
              const dimensionParts = splitDimensionSpecValue(spec.specValue)
              const rangeParts = splitRangeSpecValue(spec.specValue)
              const specKeyOptionsId = `spec-key-options-${index}`
              return (
                <div
                  className="mobile-form-grid"
                  key={index}
                  style={specRowStyle}
                  draggable
                  onDragStart={() => setDraggingSpecIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (draggingSpecIndex !== null) reorderSpecRows(draggingSpecIndex, index)
                    setDraggingSpecIndex(null)
                  }}
                  onDragEnd={() => setDraggingSpecIndex(null)}
                  data-testid={`product-form-spec-${index}-row`}
                >
                  <div style={specOrderCellStyle}>
                    <button
                      type="button"
                      style={specDragHandleStyle}
                      disabled={isSaving}
                      aria-label={`${index + 1}번째 사양 드래그`}
                      data-testid={`product-form-spec-${index}-drag-handle`}
                    >
                      ≡
                    </button>
                    <Button
                      variant="secondary"
                      onClick={() => reorderSpecRows(index, index - 1)}
                      disabled={isSaving || index === 0}
                      aria-label="위로 이동"
                      data-testid={`product-form-spec-${index}-move-up`}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => reorderSpecRows(index, index + 1)}
                      disabled={isSaving || index === values.specs.length - 1}
                      aria-label="아래로 이동"
                      data-testid={`product-form-spec-${index}-move-down`}
                    >
                      ↓
                    </Button>
                  </div>
                  <div style={specNameCellStyle}>
                    <Input
                      label="사양"
                      value={spec.specKey}
                      onChange={(event) => changeSpecKey(index, event.target.value)}
                      placeholder="예: 냉방능력, kW"
                      list={specKeyOptionsId}
                      data-testid={`product-form-spec-${index}-key`}
                    />
                    <datalist id={specKeyOptionsId}>
                      {availableTemplatesForRow(index).map((template) => (
                        <option
                          key={template.id}
                          value={template.specKey}
                          label={VALUE_TYPE_LABELS[template.valueType]}
                        />
                      ))}
                    </datalist>
                  </div>
                  <div style={specValueCellStyle}>
                    {spec.valueType === 'NUMBER' ? (
                      <div style={unitInputWrapStyle}>
                        <Input
                          label="값"
                          type="number"
                          value={spec.specValue}
                          onChange={(event) => updateSpecRow(index, { specValue: event.target.value })}
                          placeholder="예: 6.0"
                          data-testid={`product-form-spec-${index}-value`}
                        />
                        {spec.unit ? <span style={unitSuffixStyle}>{spec.unit}</span> : null}
                      </div>
                    ) : spec.valueType === 'DIMENSION' ? (
                      <div style={dimensionWrapStyle}>
                        <Input
                          label="W"
                          type="number"
                          value={dimensionParts[0]}
                          onChange={(event) => updateDimensionPart(index, 0, event.target.value)}
                          data-testid={`product-form-spec-${index}-dimension-width`}
                        />
                        <span style={dimensionSeparatorStyle}>x</span>
                        <Input
                          label="H"
                          type="number"
                          value={dimensionParts[1]}
                          onChange={(event) => updateDimensionPart(index, 1, event.target.value)}
                          data-testid={`product-form-spec-${index}-dimension-height`}
                        />
                        <span style={dimensionSeparatorStyle}>x</span>
                        <Input
                          label="D"
                          type="number"
                          value={dimensionParts[2]}
                          onChange={(event) => updateDimensionPart(index, 2, event.target.value)}
                          data-testid={`product-form-spec-${index}-dimension-depth`}
                        />
                        {spec.unit ? <span style={unitSuffixStyle}>{spec.unit}</span> : null}
                      </div>
                    ) : spec.valueType === 'RANGE' ? (
                      <div style={dimensionWrapStyle}>
                        <Input
                          label="최소"
                          type="number"
                          value={rangeParts[0]}
                          onChange={(event) => updateRangePart(index, 0, event.target.value)}
                          data-testid={`product-form-spec-${index}-range-min`}
                        />
                        <span style={dimensionSeparatorStyle}>/</span>
                        <Input
                          label="정격"
                          type="number"
                          value={rangeParts[1]}
                          onChange={(event) => updateRangePart(index, 1, event.target.value)}
                          data-testid={`product-form-spec-${index}-range-rated`}
                        />
                        <span style={dimensionSeparatorStyle}>/</span>
                        <Input
                          label="최대"
                          type="number"
                          value={rangeParts[2]}
                          onChange={(event) => updateRangePart(index, 2, event.target.value)}
                          data-testid={`product-form-spec-${index}-range-max`}
                        />
                        {spec.unit ? <span style={unitSuffixStyle}>{spec.unit}</span> : null}
                      </div>
                    ) : (
                      <div style={unitInputWrapStyle}>
                        <Input
                          label="값"
                          value={spec.specValue}
                          onChange={(event) => updateSpecRow(index, { specValue: event.target.value })}
                          placeholder="예: 6/12 또는 10/12/15"
                          data-testid={`product-form-spec-${index}-value`}
                        />
                        {spec.unit ? <span style={unitSuffixStyle}>{spec.unit}</span> : null}
                      </div>
                    )}
                  </div>
                  <div style={specRemoveCellStyle}>
                    <Button
                      variant="secondary"
                      onClick={() => removeSpecRow(index)}
                      disabled={isSaving}
                      data-testid={`product-form-spec-${index}-remove`}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p style={hintStyle}>등록된 사양이 없습니다.</p>
        )}
      </section>

      <section style={sectionStyle}>
        <h4 style={sectionTitleStyle}>가격</h4>
        <div className="mobile-form-grid" style={gridStyle}>
          <Input
            label="판매가"
            type="number"
            min="0"
            value={values.sellingPrice}
            onChange={(event) => patchValues({ sellingPrice: event.target.value })}
            disabled={mode === 'edit'}
            error={errors.sellingPrice}
            data-testid="product-form-selling-price"
          />
          <Input
            label="매입가"
            type="number"
            min="0"
            value={values.purchasePrice}
            onChange={(event) => patchValues({ purchasePrice: event.target.value })}
            disabled={mode === 'edit'}
            error={errors.purchasePrice}
            data-testid="product-form-purchase-price"
          />
          <Input
            label="출고가"
            type="number"
            min="0"
            value={values.releasePrice}
            onChange={(event) => patchValues({ releasePrice: event.target.value })}
            error={errors.releasePrice}
            data-testid="product-form-release-price"
          />
          <Input
            label="배송가"
            type="number"
            min="0"
            value={values.deliveryPrice}
            onChange={(event) => patchValues({ deliveryPrice: event.target.value })}
            error={errors.deliveryPrice}
            data-testid="product-form-delivery-price"
          />
        </div>
      </section>

      <section style={sectionStyle}>
        <h4 style={sectionTitleStyle}>설명</h4>
        <textarea
          value={values.description}
          onChange={(event) => patchValues({ description: event.target.value })}
          maxLength={1000}
          rows={4}
          style={textareaStyle}
          data-testid="product-form-description"
          aria-label="설명"
        />
      </section>
    </div>
  )
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxWidth: 980,
}

const loadingStyle: CSSProperties = {
  minHeight: 320,
  display: 'grid',
  placeItems: 'center',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
}

const subtitleStyle: CSSProperties = {
  margin: '4px 0 0',
  color: 'var(--color-neutral-500, #6B7280)',
  fontSize: 13,
}

const sectionStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 16,
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 8,
  background: 'var(--color-bg, #FFFFFF)',
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: 'var(--color-neutral-800, #1F2937)',
}

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}

const fieldBlockStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
}

const specRowsStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const specRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(124px, auto) minmax(220px, 1fr) minmax(260px, 1.2fr) auto',
  gap: 10,
  alignItems: 'end',
  padding: 10,
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 6,
  background: 'var(--color-neutral-50, #F9FAFB)',
}

const specOrderCellStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '32px 1fr 1fr',
  gap: 6,
  alignItems: 'end',
}

const specDragHandleStyle: CSSProperties = {
  width: 32,
  minWidth: 32,
  height: 32,
  border: '1px solid var(--color-border, #D1D5DB)',
  borderRadius: 6,
  background: 'var(--color-bg, #FFFFFF)',
  color: 'var(--color-neutral-600, #4B5563)',
  cursor: 'grab',
}

const specNameCellStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const specValueCellStyle: CSSProperties = {
  minWidth: 0,
}

const unitInputWrapStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(120px, 1fr) auto',
  alignItems: 'end',
  gap: 8,
}

const dimensionWrapStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(70px, 1fr) auto minmax(70px, 1fr) auto minmax(70px, 1fr) auto',
  alignItems: 'end',
  gap: 6,
}

const dimensionSeparatorStyle: CSSProperties = {
  alignSelf: 'center',
  paddingTop: 18,
  color: 'var(--color-neutral-500, #6B7280)',
  fontSize: 13,
}

const unitSuffixStyle: CSSProperties = {
  minWidth: 28,
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 6,
  color: 'var(--color-neutral-600, #4B5563)',
  background: 'var(--color-bg, #FFFFFF)',
  fontSize: 12,
}

const specRemoveCellStyle: CSSProperties = {
  minWidth: 68,
  display: 'flex',
  justifyContent: 'flex-end',
}

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-neutral-700, #363D49)',
}

const segmentedStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

function radioPillStyle(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    border: active
      ? '1px solid var(--color-primary-500, #2563EB)'
      : '1px solid var(--color-border, #E5E7EB)',
    borderRadius: 6,
    color: active
      ? 'var(--color-primary-700, #1D4ED8)'
      : 'var(--color-neutral-700, #363D49)',
    background: active
      ? 'var(--color-primary-50, #EFF6FF)'
      : 'var(--color-bg, #FFFFFF)',
    fontSize: 13,
    cursor: 'pointer',
  }
}

const hintStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-neutral-500, #6B7280)',
  fontSize: 12,
}

const textareaStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 6,
  font: 'inherit',
  resize: 'vertical',
}

const errorBannerStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-danger-700, #991B1B)',
  background: 'var(--color-danger-50, #FEF2F2)',
  border: '1px solid var(--color-danger-200, #FECACA)',
  borderRadius: 4,
  padding: '8px 10px',
}
