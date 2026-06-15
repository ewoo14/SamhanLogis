import {
  useEffect,
  useMemo,
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
  ProductAutocomplete,
  Select,
  Spinner,
  type ProductOption,
} from '@samhan/design-system'
import {
  createProduct,
  getProductByModelName,
  listProductCategories,
  listProducts,
  searchProductSummaries,
  updateProduct,
  type BundleMode,
  type ComponentKind,
  type ProductCategory,
  type ProductCategoryNode,
  type ProductGoodsType,
  type ProductItemKind,
} from '../api/productCatalogApi'
import { searchProducts as searchProductsApi } from '../api/productApi'
import { usePageTitleStore } from '../stores/pageTitle'
import {
  buildCreateProductRequest,
  buildUpdateProductRequest,
  editSeedToProductFormValues,
  initialProductFormValues,
  validateProductForm,
  type ProductFormErrors,
  type ProductFormValues,
} from './productFormModel'

const ITEM_KIND_OPTIONS: Array<{ value: ProductItemKind; label: string }> = [
  { value: 'GENERAL', label: '일반품목' },
  { value: 'SET', label: '세트' },
  { value: 'SET_COMPONENT', label: '세트구성품' },
]

const GOODS_TYPE_OPTIONS: Array<{ value: ProductGoodsType; label: string }> = [
  { value: 'GOODS', label: '상품' },
  { value: 'NON_GOODS', label: '비상품' },
]

const PRODUCT_CATEGORY_OPTIONS: Array<{ value: ProductCategory; label: string }> = [
  { value: 'HOME_MULTI', label: '홈멀티' },
  { value: 'SINGLE_SET', label: '단일 세트' },
  { value: 'SINGLE_PART', label: '단일 구성품' },
  { value: 'COMMERCIAL_MULTI', label: '상업멀티' },
  { value: 'COMMERCIAL_PART', label: '상업 구성품' },
  { value: 'OLD', label: '레거시' },
  { value: 'MATERIAL', label: '자재' },
]

const BUNDLE_MODE_OPTIONS: Array<{ value: BundleMode; label: string }> = [
  { value: 'EXPAND', label: '구성품 펼침' },
  { value: 'KEEP', label: '세트 유지' },
]

const COMPONENT_KIND_OPTIONS: Array<{ value: ComponentKind; label: string }> = [
  { value: 'INDOOR', label: '실내기' },
  { value: 'OUTDOOR', label: '실외기' },
  { value: 'PANEL', label: '판넬' },
  { value: 'REMOTE', label: '리모컨' },
  { value: 'MATERIAL', label: '자재' },
  { value: 'ACCESSORY', label: '부속품' },
  { value: 'FOOT', label: '받침대' },
]

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

function defaultCategoryForItemKind(itemKind: ProductItemKind): ProductCategory {
  if (itemKind === 'SET') return 'SINGLE_SET'
  if (itemKind === 'SET_COMPONENT') return 'SINGLE_PART'
  return 'SINGLE_PART'
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
  const [parentSet, setParentSet] = useState<ProductOption | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    setPageTitle({ title: mode === 'create' ? '품목 등록' : '품목 수정', meta: '품목' })
    return () => setPageTitle({ title: '' })
  }, [mode, setPageTitle])

  const categoriesQuery = useQuery({
    queryKey: ['product-categories'],
    queryFn: listProductCategories,
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

  useEffect(() => {
    const seed = editSeedQuery.data
    if (!seed) return
    setValues(editSeedToProductFormValues(seed))
  }, [editSeedQuery.data])

  const categoryOptions = useMemo(
    () => flattenCategories(categoriesQuery.data ?? []),
    [categoriesQuery.data],
  )

  const invalidateProducts = () => {
    void queryClient.invalidateQueries({ queryKey: ['product-catalog'] })
    void queryClient.invalidateQueries({ queryKey: ['product-catalog-search'] })
    void queryClient.invalidateQueries({ queryKey: ['product-form'] })
    void queryClient.invalidateQueries({ queryKey: ['bundle-components'] })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
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
      return updateProduct(id, buildUpdateProductRequest(values))
    },
    onSuccess: () => {
      setFormError(null)
      invalidateProducts()
      navigate('/products/catalog')
    },
    onError: (err) => {
      setFormError(errorMsg(err))
    },
  })

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

  const handleItemKindChange = (itemKind: ProductItemKind) => {
    patchValues({
      itemKind,
      productCategory: defaultCategoryForItemKind(itemKind),
      parentSetModelCode: itemKind === 'SET_COMPONENT' ? values.parentSetModelCode : '',
      bundleMode: itemKind === 'SET' ? values.bundleMode : 'EXPAND',
    })
    if (itemKind !== 'SET_COMPONENT') {
      setParentSet(null)
    }
  }

  const searchBundleProducts = async (q: string): Promise<ProductOption[]> => {
    const products = await searchProductsApi(q)
    return products.filter((product) => product.productType === 'BUNDLE')
  }

  const handleParentSetChange = (product: ProductOption | null) => {
    setParentSet(product)
    patchValues({
      parentSetModelCode: product?.modelCode ?? product?.modelName ?? '',
    })
  }

  const addSpecRow = () => {
    patchValues({ specs: [...values.specs, { specKey: '', specValue: '' }] })
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
              ? '일반품목, 세트, 세트구성품을 등록합니다.'
              : `모델코드 ${modelCode ?? ''} 품목을 수정합니다.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => navigate('/products/catalog')} disabled={isSaving}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={() => saveMutation.mutate()}
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

        <div style={gridStyle}>
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
            onChange={(event) => patchValues({ productCategory: event.target.value as ProductCategory })}
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

      {values.itemKind === 'SET_COMPONENT' ? (
        <section style={sectionStyle}>
          <h4 style={sectionTitleStyle}>부모 세트</h4>
          <div style={gridStyle}>
            <ProductAutocomplete
              value={parentSet}
              onChange={handleParentSetChange}
              searchProducts={searchBundleProducts}
              label="부모 세트"
              placeholder="세트 모델명 또는 품목명 검색"
              required
              error={errors.parentSetModelCode}
              minChars={1}
            />
            <Select
              label="구성 분류"
              value={values.componentKind}
              onChange={(event) => patchValues({ componentKind: event.target.value as ComponentKind })}
              data-testid="product-form-component-kind"
            >
              {COMPONENT_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
          {values.parentSetModelCode ? (
            <p style={hintStyle}>선택한 부모 세트: {values.parentSetModelCode}</p>
          ) : null}
        </section>
      ) : null}

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h4 style={sectionTitleStyle}>사양</h4>
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
            {values.specs.map((spec, index) => (
              <div key={index} style={specRowStyle}>
                <Input
                  label="사양명"
                  value={spec.specKey}
                  onChange={(event) => updateSpecRow(index, { specKey: event.target.value })}
                  placeholder="예: 냉방성능"
                  data-testid={`product-form-spec-${index}-key`}
                />
                <Input
                  label="값"
                  value={spec.specValue}
                  onChange={(event) => updateSpecRow(index, { specValue: event.target.value })}
                  placeholder="예: 6.0kW"
                  data-testid={`product-form-spec-${index}-value`}
                />
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
            ))}
          </div>
        ) : (
          <p style={hintStyle}>등록된 사양이 없습니다.</p>
        )}
      </section>

      <section style={sectionStyle}>
        <h4 style={sectionTitleStyle}>가격</h4>
        <div style={gridStyle}>
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
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
  alignItems: 'end',
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
