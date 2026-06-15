import type {
  BundleMode,
  ComponentKind,
  CreateProductRequest,
  ProductCatalogRow,
  ProductCategory,
  ProductDetailResponse,
  ProductGoodsType,
  ProductItemKind,
  ProductSummaryResponse,
  UpdateProductRequest,
} from '../api/productCatalogApi'

export interface ProductFormValues {
  name: string
  modelName: string
  categoryId: string
  sellingPrice: string
  purchasePrice: string
  currency: string
  description: string
  itemKind: ProductItemKind
  productCategory: ProductCategory
  bundleMode: BundleMode
  parentSetModelCode: string
  componentKind: ComponentKind
  unit: string
  releasePrice: string
  deliveryPrice: string
  goodsType: ProductGoodsType
}

export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>

export function initialProductFormValues(): ProductFormValues {
  return {
    name: '',
    modelName: '',
    categoryId: '',
    sellingPrice: '0',
    purchasePrice: '0',
    currency: 'KRW',
    description: '',
    itemKind: 'GENERAL',
    productCategory: 'SINGLE_PART',
    bundleMode: 'EXPAND',
    parentSetModelCode: '',
    componentKind: 'ACCESSORY',
    unit: 'EA',
    releasePrice: '',
    deliveryPrice: '',
    goodsType: 'GOODS',
  }
}

export interface ProductEditSeed {
  summary: ProductSummaryResponse
  detail: ProductDetailResponse
  catalog?: ProductCatalogRow | undefined
}

function itemKindFromSeed(detail: ProductDetailResponse, summary: ProductSummaryResponse): ProductItemKind {
  if (detail.itemKind) return detail.itemKind
  return summary.productType === 'BUNDLE' ? 'SET' : 'GENERAL'
}

function defaultCategoryForItemKind(itemKind: ProductItemKind): ProductCategory {
  if (itemKind === 'SET') return 'SINGLE_SET'
  if (itemKind === 'SET_COMPONENT') return 'SINGLE_PART'
  return 'SINGLE_PART'
}

function inputValue(value: string | number | null | undefined): string {
  return value == null ? '' : String(value)
}

export function editSeedToProductFormValues(seed: ProductEditSeed): ProductFormValues {
  const itemKind = itemKindFromSeed(seed.detail, seed.summary)
  return {
    ...initialProductFormValues(),
    name: seed.detail.name ?? seed.summary.name ?? '',
    modelName: seed.detail.modelName ?? seed.summary.modelName ?? '',
    categoryId: seed.detail.categoryId ?? seed.summary.categoryId ?? '',
    sellingPrice: inputValue(seed.detail.sellingPrice ?? seed.summary.sellingPrice),
    purchasePrice: inputValue(seed.detail.purchasePrice),
    currency: seed.detail.currency ?? 'KRW',
    description: seed.detail.description ?? '',
    itemKind,
    productCategory: seed.detail.productCategory ?? defaultCategoryForItemKind(itemKind),
    bundleMode: itemKind === 'SET' ? seed.detail.bundleMode ?? 'EXPAND' : 'EXPAND',
    parentSetModelCode: itemKind === 'SET_COMPONENT' ? seed.detail.parentSetModelCode ?? '' : '',
    componentKind: seed.detail.componentKind ?? 'ACCESSORY',
    unit: seed.detail.unit ?? 'EA',
    releasePrice: inputValue(seed.detail.releasePrice ?? seed.catalog?.releasePrice),
    deliveryPrice: inputValue(seed.detail.deliveryPrice ?? seed.catalog?.deliveryPrice),
    goodsType: seed.detail.goodsType ?? (seed.summary.goods === false ? 'NON_GOODS' : 'GOODS'),
  }
}

function trimmed(value: string): string {
  return value.trim()
}

function nullableText(value: string): string | null {
  const next = trimmed(value)
  return next.length > 0 ? next : null
}

function decimalOrZero(value: string): string {
  const next = trimmed(value)
  return next.length > 0 ? next : '0'
}

function nullableDecimal(value: string): string | null {
  const next = trimmed(value)
  return next.length > 0 ? next : null
}

function hasInvalidDecimal(value: string): boolean {
  const next = trimmed(value)
  if (!next) return false
  const parsed = Number(next)
  return !Number.isFinite(parsed) || parsed < 0
}

export function validateProductForm(values: ProductFormValues, mode: 'create' | 'edit' = 'create'): ProductFormErrors {
  const errors: ProductFormErrors = {}

  if (!trimmed(values.name)) errors.name = '품목명을 입력해 주세요.'
  if (!trimmed(values.modelName)) errors.modelName = '모델명을 입력해 주세요.'
  if (!trimmed(values.categoryId)) errors.categoryId = '카테고리를 선택해 주세요.'

  if (mode === 'create') {
    if (hasInvalidDecimal(values.sellingPrice)) errors.sellingPrice = '판매가는 0 이상 숫자로 입력해 주세요.'
    if (hasInvalidDecimal(values.purchasePrice)) errors.purchasePrice = '매입가는 0 이상 숫자로 입력해 주세요.'
  }
  if (hasInvalidDecimal(values.releasePrice)) errors.releasePrice = '출고가는 0 이상 숫자로 입력해 주세요.'
  if (hasInvalidDecimal(values.deliveryPrice)) errors.deliveryPrice = '배송가는 0 이상 숫자로 입력해 주세요.'

  if (values.itemKind === 'SET_COMPONENT' && !trimmed(values.parentSetModelCode)) {
    errors.parentSetModelCode = '부모 세트를 선택해 주세요.'
  }

  return errors
}

export function buildCreateProductRequest(values: ProductFormValues): CreateProductRequest {
  return {
    name: trimmed(values.name),
    modelName: trimmed(values.modelName),
    categoryId: trimmed(values.categoryId),
    sellingPrice: decimalOrZero(values.sellingPrice),
    purchasePrice: decimalOrZero(values.purchasePrice),
    currency: trimmed(values.currency) || 'KRW',
    tags: {},
    description: nullableText(values.description),
    itemKind: values.itemKind,
    productCategory: values.productCategory,
    bundleMode: values.itemKind === 'SET' ? values.bundleMode : null,
    parentSetModelCode: values.itemKind === 'SET_COMPONENT' ? trimmed(values.parentSetModelCode) : null,
    componentKind: values.itemKind === 'SET_COMPONENT' ? values.componentKind : null,
    unit: nullableText(values.unit),
    releasePrice: nullableDecimal(values.releasePrice),
    deliveryPrice: nullableDecimal(values.deliveryPrice),
    goodsType: values.goodsType,
  }
}

export function buildUpdateProductRequest(values: ProductFormValues): UpdateProductRequest {
  return {
    name: trimmed(values.name),
    modelName: trimmed(values.modelName),
    categoryId: trimmed(values.categoryId),
    description: nullableText(values.description),
    itemKind: values.itemKind,
    productCategory: values.productCategory,
    bundleMode: values.itemKind === 'SET' ? values.bundleMode : null,
    parentSetModelCode: values.itemKind === 'SET_COMPONENT' ? trimmed(values.parentSetModelCode) : null,
    componentKind: values.itemKind === 'SET_COMPONENT' ? values.componentKind : null,
    unit: nullableText(values.unit),
    releasePrice: nullableDecimal(values.releasePrice),
    deliveryPrice: nullableDecimal(values.deliveryPrice),
    goodsType: values.goodsType,
  }
}
