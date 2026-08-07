/**
 * 품목 카탈로그 관리 API — PR-B 품목 노출 수동 토글 + PR-E 세트·구성품·표시순서 슬라이스.
 *
 * 노출 endpoint:
 * - `GET /api/v1/products?q=&usageScope=&category=&page=&size=` — 품목 목록 (필터)
 * - `PATCH /api/v1/products/{modelCode}/usage` — 수동 노출 설정
 * - `DELETE /api/v1/products/{modelCode}/usage` — 시트 자동 복귀 (수동 override 해제)
 * - `PATCH /api/v1/products/{modelCode}/variable-discount` — 변동DC 수동 설정
 * - `DELETE /api/v1/products/{modelCode}/variable-discount` — 변동DC 시트 자동 복귀
 * - `PATCH /api/v1/products/{modelCode}/fixed-discount` — 고정DC 인라인 수동 설정
 * - `GET /api/v1/products/{modelCode}/components` — 구성품 목록 (BUNDLE 전용)
 * - `PUT /api/v1/products/{modelCode}/components` — 구성품 replace-all 저장
 * - `PUT /api/v1/products/display-orders` — 표시 순서 일괄 갱신
 *
 * UUID 비공개 가드: `id` 는 내부 전용 — 화면 표시 금지.
 * 표시 식별자는 modelCode (modelName 동일값) 만.
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

// ---------------------------------------------------------------------------
// 공통 enum 타입 (BE 계약 1:1)
// ---------------------------------------------------------------------------

/** 품목 노출 범위 — BE UsageScope enum 과 정확히 일치 */
export type UsageScope = 'NONE' | 'ESTIMATE' | 'PARTNER_ORDER' | 'BOTH'

/** 견적 카테고리 — BE EstimateCategory enum 과 정확히 일치 */
export type EstimateCategory =
  | 'HOME_MULTI'
  | 'SINGLE_SET'
  | 'COMMERCIAL_MULTI'
  | 'LEGACY'
  | 'OTHER'

/** 품목 종류 — BE ProductItemKind enum 과 정확히 일치. legacy SET_COMPONENT 응답 호환용으로 유지 */
export type ProductItemKind = 'GENERAL' | 'SET' | 'SET_COMPONENT'

/** 품목 등록/수정 폼에서 선택 가능한 종류 — 구성품 여부는 세트 구성 관계에서만 관리 */
export type ProductFormItemKind = Exclude<ProductItemKind, 'SET_COMPONENT'>

/** 내부 품목 카테고리 — BE ProductCategory enum 과 정확히 일치 */
export type ProductCategory =
  | 'HOME_MULTI'
  | 'SINGLE_SET'
  | 'SINGLE_PART'
  | 'COMMERCIAL_MULTI'
  | 'COMMERCIAL_PART'
  | 'OLD'
  | 'MATERIAL'

/** BUNDLE 처리 모드 — BE BundleMode enum 과 정확히 일치 */
export type BundleMode = 'EXPAND' | 'KEEP'

/** 상품/비상품 — BE ProductGoodsType enum 과 정확히 일치 */
export type ProductGoodsType = 'GOODS' | 'NON_GOODS'

/** 사양 값 입력 방식 — BE SpecKeyValueType enum 과 정확히 일치 */
export type SpecKeyValueType = 'NUMBER' | 'DIMENSION' | 'RANGE' | 'TEXT'

// ---------------------------------------------------------------------------
// 응답 DTO
// ---------------------------------------------------------------------------

/** 품목 타입 — BUNDLE: 세트 품목, SINGLE 외: 단품 */
export type ProductType = 'BUNDLE' | 'SINGLE' | string

/**
 * 품목 카탈로그 행 — `GET /api/v1/products` 응답 DTO.
 *
 * usageScope/estimateCategories/usageScopeManual 포함 (품목 다중 카테고리 노출).
 * productType/componentCount 추가 (PR-E 확장).
 */
export interface EstimateCategoryExposure {
  category: EstimateCategory
  displayOrder: number | null
}

export interface ProductCatalogRow {
  /** 품목코드 (사용자 식별자 — UUID 아님). modelName 과 동일값 */
  modelCode: string
  /** 품목명 */
  name: string
  /** 노출 범위 */
  usageScope: UsageScope
  /** 견적 노출 카테고리 목록 (ESTIMATE/BOTH 시에만 의미 있음) */
  estimateCategories?: EstimateCategoryExposure[]
  /** @deprecated BE 하위호환 파생값. 신규 코드는 estimateCategories 를 사용한다. */
  estimateCategory?: EstimateCategory | null
  productCategory: ProductCategory | null
  /** F1-a 품목별 대분류 */
  catL?: ClassificationRef | null
  /** F1-a 품목별 중분류 */
  catM?: ClassificationRef | null
  /** F1-a 품목별 소분류 */
  catS?: ClassificationRef | null
  /** 수동 override 여부 — true: 수동 설정, false: 시트 자동 */
  usageScopeManual: boolean
  /** @deprecated BE 하위호환 파생값. 신규 코드는 estimateCategories[].displayOrder 를 사용한다. */
  displayOrder?: number | null
  /** 출고 단가 */
  releasePrice: number | null
  /** 배송 단가 */
  deliveryPrice: number | null
  /** 고정DC율(%) */
  fixedDiscountRate?: number | string | null
  /** 변동DC 적용 여부 */
  hasVariableDiscount: boolean
  /** 변동DC 수동 override 여부 — true 이면 시트 sync 가 덮어쓰지 않는다. */
  variableDiscountManual: boolean
  /** 품목 타입 (BUNDLE=세트, 그 외=단품). BE 응답 없을 시 undefined */
  productType?: ProductType
  /** 활성 구성품 수 — BUNDLE 외 0. BE 응답 없을 시 undefined */
  componentCount?: number
}

/** Classification 단계 — BE Classification.CatLevel enum 과 동일 */
export type ClassificationLevel = 'L' | 'M' | 'S'

/** 카탈로그 행 안에 포함되는 분류 표시 DTO */
export interface ClassificationRef {
  id: string
  name: string
}

/** F1-a ClassificationResponse DTO */
export interface Classification {
  id: string
  estimateCategory: EstimateCategory
  catLevel: ClassificationLevel
  parentId: string | null
  name: string
  displayOrder: number
  active: boolean
}

/** POST /api/v1/classifications 요청 */
export interface CreateClassificationRequest {
  estimateCategory: EstimateCategory
  catLevel: ClassificationLevel
  parentId?: string | null
  name: string
  displayOrder?: number | null
  active?: boolean | null
}

/** PATCH /api/v1/classifications/{id} 요청 */
export interface UpdateClassificationRequest {
  parentId?: string | null
  name?: string | null
  displayOrder?: number | null
  active?: boolean | null
}

/** 카테고리 트리 노드 — BE CategoryResponse record 와 1:1 대응 */
export interface ProductCategoryNode {
  id: string
  code: string
  name: string
  parentId: string | null
  displayOrder: number
  children: ProductCategoryNode[]
}

/** 제품 단건 상세 — UUID 는 내부 편집 호출 전용, 화면 미노출 */
export interface ProductDetailResponse {
  id: string
  name: string
  modelName: string
  modelCode: string | null
  categoryId: string
  categoryName: string
  sellingPrice: string | number | null
  purchasePrice: string | number | null
  currency: string | null
  tags: Record<string, string> | null
  description: string | null
  productCategory: ProductCategory | null
  itemKind: ProductItemKind | null
  bundleMode: BundleMode | null
  parentSetModelCode: string | null
  componentKind: ComponentKind | null
  unit: string | null
  releasePrice: string | number | null
  deliveryPrice: string | number | null
  goodsType: ProductGoodsType | null
  specs?: ProductSpecResponse[] | null
}

/** 제품 동적 사양 — ProductSpec specKey/specValue 필드명과 동일 */
export interface ProductSpecInput {
  specKey: string
  specValue: string
  unit: string | null
}

/** 제품 동적 사양 응답 — id 는 내부 편집 보조용, 화면 표시 금지 */
export interface ProductSpecResponse extends ProductSpecInput {
  id?: string | null
  displayOrder?: number | null
}

/** 사양명 제안 템플릿 DTO. `specKey` 는 입력 보조 후보이며 자유입력을 제한하지 않는다. */
export interface SpecKeyTemplateResponse {
  id: string
  estimateCategory: EstimateCategory
  specKey: string
  defaultUnit: string | null
  valueType: SpecKeyValueType
  displayOrder: number
  isRecommended: boolean
}

/** 검색 요약 — edit route 에서 modelCode 기반 UUID 내부 해소용 */
export interface ProductSummaryResponse {
  id: string
  name: string
  modelName: string
  productCode: string | null
  categoryId: string | null
  sellingPrice: string | number | null
  status: string
  goods?: boolean
  modelCode?: string | null
  productType?: ProductType | null
}

/**
 * 수량 모드 — BE BundleComponent.QtyMode enum 과 정확히 일치.
 * FIXED: 고정 수량, FOLLOW_SET: 세트 수량에 비례.
 */
export type QtyMode = 'FIXED' | 'FOLLOW_SET'

/**
 * 구성 분류 — BE BundleComponent.ComponentKind enum 과 정확히 일치.
 */
export type ComponentKind =
  | 'INDOOR'
  | 'OUTDOOR'
  | 'PANEL'
  | 'REMOTE'
  | 'MATERIAL'
  | 'ACCESSORY'
  | 'FOOT'

/**
 * 구성품 항목 — `GET /api/v1/products/{modelCode}/components` 응답 DTO.
 * BE BundleComponentResponse record 1:1 대응 (§1c 2026-06-11).
 */
export interface BundleComponentItem {
  /** 구성 품목 모델코드 (식별자 — UUID 아님) */
  componentProductCode: string
  /** 구성 품목명 (Product.name join; 없으면 componentProductCode) */
  componentName: string
  /** 기본 수량 */
  defaultQty: number
  /** 수량 모드 */
  qtyMode: QtyMode
  /** 구성 분류 */
  componentKind: ComponentKind
  /** 구성품 특징 (기본/사각/WIFI 등; null 가능) */
  componentVariant: string | null
  /** 기본 옵션 여부 */
  isDefault: boolean
  /** 규격 (null 가능) */
  specText: string | null
  /** 표시 순서 (PUT 시 배열 인덱스 기준 부여) */
  displayOrder: number
}

/**
 * `PUT /api/v1/products/{modelCode}/components` 요청 body 항목.
 * BE BundleComponentRequest record 1:1 대응 (§1c 2026-06-11).
 * 배열 인덱스가 표시 순서(0-based)가 된다.
 */
export interface BundleComponentInput {
  /** 구성 품목 모델코드 */
  componentProductCode: string
  /** 기본 수량 (양수 필수) */
  defaultQty: number
  /** 수량 모드 (null → BE 기본 FOLLOW_SET) */
  qtyMode?: QtyMode | null
  /** 구성 분류 (null → BE 기본 ACCESSORY) */
  componentKind?: ComponentKind | null
  /** 구성품 특징 */
  componentVariant?: string | null
  /** 기본 옵션 여부 */
  isDefault?: boolean
  /** 규격 */
  specText?: string | null
}

/**
 * `PUT /api/v1/products/display-orders` 요청 body 항목.
 */
export interface DisplayOrderInput {
  modelCode: string
  estimateCategory: EstimateCategory
  displayOrder: number
}

/** `POST /api/v1/products` 요청 body — 폼에서는 단일/세트만 등록한다 */
export interface CreateProductRequest {
  name: string
  modelName: string
  categoryId: string
  sellingPrice: string
  purchasePrice: string
  currency: string
  tags: Record<string, string>
  description: string | null
  itemKind: ProductFormItemKind
  productCategory: ProductCategory
  bundleMode: BundleMode | null
  unit: string | null
  releasePrice: string | null
  deliveryPrice: string | null
  goodsType: ProductGoodsType
  usageScope?: UsageScope | null
  estimateCategories?: EstimateCategory[] | null
  specs: ProductSpecInput[]
  /** BUNDLE 구성품 soft-delete 확인. 생략/false면 서버가 위험 전환을 차단한다. */
  confirmBundleChildrenDeletion?: boolean
}

/** `PATCH /api/v1/products/{id}` 요청 body — 폼에서는 단일/세트만 수정한다 */
export interface UpdateProductRequest {
  name: string | null
  modelName: string | null
  categoryId: string | null
  description: string | null
  itemKind: ProductFormItemKind | null
  productCategory: ProductCategory | null
  bundleMode: BundleMode | null
  unit: string | null
  releasePrice: string | null
  deliveryPrice: string | null
  goodsType: ProductGoodsType | null
  usageScope?: UsageScope | null
  estimateCategories?: EstimateCategory[] | null
  specs: ProductSpecInput[]
}

// ---------------------------------------------------------------------------
// 요청 타입
// ---------------------------------------------------------------------------

/** `PATCH /api/v1/products/{modelCode}/usage` 요청 body */
export interface UpdateProductUsageRequest {
  usageScope: UsageScope
  /** ESTIMATE/BOTH 시에만 의미 있음. NONE/PARTNER_ORDER 는 빈 배열 전송 */
  estimateCategories?: EstimateCategory[]
}

/** `PATCH /api/v1/products/{modelCode}/variable-discount` 요청 body */
export interface UpdateProductVariableDiscountRequest {
  hasVariableDiscount: boolean
}

/** `PATCH /api/v1/products/{modelCode}/fixed-discount` 요청 body */
export interface UpdateProductFixedDiscountRequest {
  fixedDiscountRate: string | null
}

/**
 * F1-b 품목 분류 부분 수정 요청.
 */
export interface UpdateProductClassificationSettingsRequest {
  catLId: string | null
  catMId: string | null
  catSId: string | null
}

/** `GET /api/v1/products` 필터 파라미터 */
export interface ListProductsParams {
  q?: string
  usageScope?: UsageScope | ''
  category?: EstimateCategory | ''
  page?: number
  size?: number
}

// ---------------------------------------------------------------------------
// API 함수
// ---------------------------------------------------------------------------

/**
 * 품목 목록 조회 — `GET /api/v1/products`.
 *
 * usageScope / category optional 필터 적용.
 * 결과는 Page<ProductCatalogRow> 형태.
 */
export async function listProducts(
  params: ListProductsParams = {},
): Promise<PageResponse<ProductCatalogRow>> {
  const res = await apiClient.get<PageResponse<ProductCatalogRow>>(
    '/api/v1/products',
    {
      params: {
        ...(params.q ? { q: params.q } : {}),
        ...(params.usageScope ? { usageScope: params.usageScope } : {}),
        ...(params.category ? { category: params.category } : {}),
        page: params.page ?? 0,
        size: params.size ?? 50,
      },
    },
  )
  return res.data
}

/** 카테고리 트리 조회 — `GET /api/products/categories`. */
export async function listProductCategories(): Promise<ProductCategoryNode[]> {
  const res = await apiClient.get<ApiEnvelope<ProductCategoryNode[]>>('/api/products/categories')
  return res.data.data
}

/** 사양명 제안 템플릿 조회 — `GET /api/v1/spec-key-templates`. */
export async function listSpecKeyTemplates(
  category?: EstimateCategory,
): Promise<SpecKeyTemplateResponse[]> {
  const res = await apiClient.get<SpecKeyTemplateResponse[]>(
    '/api/v1/spec-key-templates',
    { params: category ? { category } : undefined },
  )
  return res.data
}

/** 제품 요약 검색 — edit route 의 내부 UUID 해소용. UUID 는 화면에 표시하지 않는다. */
export async function searchProductSummaries(
  q: string,
  size = 20,
): Promise<ProductSummaryResponse[]> {
  const res = await apiClient.get<ApiEnvelope<PageResponse<ProductSummaryResponse>>>(
    '/api/products',
    { params: { q, size } },
  )
  return res.data.data?.content ?? []
}

/** 모델명 정확 조회 — edit form 초기값 구성용. UUID 는 화면에 표시하지 않는다. */
export async function getProductByModelName(modelName: string): Promise<ProductDetailResponse> {
  const res = await apiClient.get<ApiEnvelope<ProductDetailResponse>>(
    `/api/products/by-model/${encodeURIComponent(modelName)}`,
  )
  return res.data.data
}

/** 품목 신규 등록 — `POST /api/products` (게이트웨이 StripPrefix=1 → ProductController.create). */
export async function createProduct(req: CreateProductRequest): Promise<ProductDetailResponse> {
  const res = await apiClient.post<ApiEnvelope<ProductDetailResponse>>('/api/products', req)
  return res.data.data
}

/** 품목 부분 수정 — `PATCH /api/products/{id}` (게이트웨이 StripPrefix=1 → ProductController.update). */
export async function updateProduct(
  id: string,
  req: UpdateProductRequest,
): Promise<ProductDetailResponse> {
  const res = await apiClient.patch<ApiEnvelope<ProductDetailResponse>>(
    `/api/products/${encodeURIComponent(id)}`,
    req,
  )
  return res.data.data
}

/**
 * 품목 노출 수동 설정 — `PATCH /api/v1/products/{modelCode}/usage`.
 *
 * usageScopeManual=true 로 설정되어 시트 sync 재실행 시에도 유지됨.
 *
 * @param modelCode 품목코드 (사용자 식별자)
 * @param req usageScope + estimateCategories
 */
export async function updateProductUsage(
  modelCode: string,
  req: UpdateProductUsageRequest,
): Promise<ProductCatalogRow> {
  const res = await apiClient.patch<ProductCatalogRow>(
    `/api/v1/products/${encodeURIComponent(modelCode)}/usage`,
    req,
  )
  return res.data
}

/**
 * 품목 노출 시트 자동 복귀 — `DELETE /api/v1/products/{modelCode}/usage`.
 *
 * usageScopeManual=false 로 해제. 값은 유지되며 다음 시트 sync 에서 자동 재분류됨.
 * BE 응답은 204 무본문 — 반환값 없음.
 *
 * @param modelCode 품목코드 (사용자 식별자)
 */
export async function clearProductUsage(modelCode: string): Promise<void> {
  await apiClient.delete(
    `/api/v1/products/${encodeURIComponent(modelCode)}/usage`,
  )
}

/**
 * 변동DC 수동 설정 — `PATCH /api/v1/products/{modelCode}/variable-discount`.
 *
 * variableDiscountManual=true 로 설정되어 시트 sync 재실행 시에도 유지됨.
 *
 * @param modelCode 품목코드 (사용자 식별자)
 * @param hasVariableDiscount 변동DC 적용 여부
 */
export async function updateProductVariableDiscount(
  modelCode: string,
  hasVariableDiscount: boolean,
): Promise<ProductCatalogRow> {
  const req: UpdateProductVariableDiscountRequest = { hasVariableDiscount }
  const res = await apiClient.patch<ProductCatalogRow>(
    `/api/v1/products/${encodeURIComponent(modelCode)}/variable-discount`,
    req,
  )
  return res.data
}

/**
 * 변동DC 시트 자동 복귀 — `DELETE /api/v1/products/{modelCode}/variable-discount`.
 *
 * variableDiscountManual=false 로 해제. 값은 유지되며 다음 시트 sync 에서 자동 재분류됨.
 *
 * @param modelCode 품목코드 (사용자 식별자)
 */
export async function clearProductVariableDiscount(modelCode: string): Promise<void> {
  await apiClient.delete(
    `/api/v1/products/${encodeURIComponent(modelCode)}/variable-discount`,
  )
}

/**
 * 고정DC 인라인 수동 설정 — `PATCH /api/v1/products/{modelCode}/fixed-discount`.
 *
 * fixedDiscountRate=null 은 빈칸 저장이며 전역DC율 영향 품목으로 처리한다.
 */
export async function updateProductFixedDiscount(
  modelCode: string,
  fixedDiscountRate: string | null,
): Promise<ProductCatalogRow> {
  const req: UpdateProductFixedDiscountRequest = { fixedDiscountRate }
  const res = await apiClient.patch<ProductCatalogRow>(
    `/api/v1/products/${encodeURIComponent(modelCode)}/fixed-discount`,
    req,
  )
  return res.data
}

/** 분류 마스터 목록 — `GET /api/v1/classifications?estimateCategory=&parentId=`. */
export async function listClassifications(params: {
  estimateCategory: EstimateCategory
  parentId?: string | null
}): Promise<Classification[]> {
  const res = await apiClient.get<Classification[]>('/api/v1/classifications', {
    params: {
      estimateCategory: params.estimateCategory,
      ...(params.parentId ? { parentId: params.parentId } : {}),
    },
  })
  return res.data
}

/** 분류 마스터 생성 — `POST /api/v1/classifications`. */
export async function createClassification(
  req: CreateClassificationRequest,
): Promise<Classification> {
  const res = await apiClient.post<Classification>('/api/v1/classifications', req)
  return res.data
}

/** 분류 마스터 수정 — `PATCH /api/v1/classifications/{id}`. */
export async function updateClassification(
  id: string,
  req: UpdateClassificationRequest,
): Promise<Classification> {
  const res = await apiClient.patch<Classification>(
    `/api/v1/classifications/${encodeURIComponent(id)}`,
    req,
  )
  return res.data
}

/** 분류 마스터 삭제 — `DELETE /api/v1/classifications/{id}`. */
export async function deleteClassification(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/classifications/${encodeURIComponent(id)}`)
}

/** 품목별 분류 수정. */
export async function updateProductClassificationSettings(
  modelCode: string,
  req: UpdateProductClassificationSettingsRequest,
): Promise<ProductCatalogRow> {
  const res = await apiClient.patch<ProductCatalogRow>(
    `/api/v1/products/${encodeURIComponent(modelCode)}/classification`,
    req,
  )
  return res.data
}

/**
 * 구성품 목록 조회 — `GET /api/v1/products/{modelCode}/components`.
 *
 * BUNDLE 품목 전용. 비-BUNDLE 에 대해서는 BE 가 200 빈배열 반환.
 * 권한: products.list VIEW.
 *
 * @param modelCode BUNDLE 품목코드
 */
export async function listBundleComponents(
  modelCode: string,
): Promise<BundleComponentItem[]> {
  const res = await apiClient.get<BundleComponentItem[]>(
    `/api/v1/products/${encodeURIComponent(modelCode)}/components`,
  )
  return res.data
}

/**
 * 구성품 replace-all 저장 — `PUT /api/v1/products/{modelCode}/components`.
 *
 * 현재 구성품을 전량 교체. 빈 배열/비-BUNDLE/미해소 모델코드 시 BE 오류.
 * 배열 인덱스가 displayOrder(0-based) 역할을 한다 (별도 displayOrder 필드 불필요).
 * 권한: products.admin UPDATE.
 *
 * @param modelCode BUNDLE 품목코드
 * @param components 교체할 구성품 목록 (배열 순서 = displayOrder)
 */
export async function updateBundleComponents(
  modelCode: string,
  components: BundleComponentInput[],
): Promise<BundleComponentItem[]> {
  const res = await apiClient.put<BundleComponentItem[]>(
    `/api/v1/products/${encodeURIComponent(modelCode)}/components`,
    components,
  )
  return res.data
}

/**
 * 표시 순서 일괄 갱신 — `PUT /api/v1/products/display-orders`.
 *
 * 드래그 후 저장 1콜로 전체 재번호 전송.
 * 권한: products.admin UPDATE.
 *
 * 구현 방침: 전체 목록 조회(충분히 큰 size) 후 드래그 결과 순서로 재번호 → 전건 전송.
 * 페이지 단위 부분 재번호는 전체 순서 모호로 인해 사용하지 않는다.
 *
 * @param orders 모든 품목의 새 표시 순서 목록
 */
export async function updateDisplayOrders(
  orders: DisplayOrderInput[],
): Promise<void> {
  await apiClient.put('/api/v1/products/display-orders', orders)
}

// ---------------------------------------------------------------------------
// 단가변동 스케줄 admin (S4a #774 BE + S4b FE 배선, #17 단가변동 관리)
// ---------------------------------------------------------------------------

/**
 * 단가변동 카테고리 4종 — BE `PriceChangeSchedule.CATEGORY_KEYS` 와 정확히 일치.
 * order-app `PartnerOrderLine.categoryKey` 와 동일 문자열 키.
 */
export type PriceChangeScheduleCategory =
  | 'homemulti'
  | 'singleSets'
  | 'commercialMulti'
  | 'oldProducts'

/**
 * 단가변동 스케줄 admin 항목 — `GET /api/v1/products/admin/price-change-schedule` 응답 DTO.
 * BE `PriceChangeScheduleAdminResponse` record 와 1:1 대응.
 */
export interface PriceChangeScheduleAdminItem {
  category: PriceChangeScheduleCategory
  /** KST 업무일 기준 단가변동 적용 시작일 (yyyy-MM-dd) */
  effectiveDate: string
  /** 견적 "인상 전 단가" 체크박스 초기값 (estimate-app 소비) */
  defaultPreChange: boolean
}

/**
 * `PUT /api/v1/products/admin/price-change-schedule/{category}` 요청 body.
 *
 * null-keep 부분 수정 — 생략(undefined)하거나 `null` 을 보낸 필드는 BE 가 기존 값을 유지한다
 * (`PriceChangeSchedule#update`).
 */
export interface UpdatePriceChangeScheduleRequest {
  effectiveDate?: string | null
  defaultPreChange?: boolean | null
}

/**
 * 단가변동 스케줄 admin 목록 조회 — `GET /api/v1/products/admin/price-change-schedule`.
 *
 * 카테고리 4종(homemulti/singleSets/commercialMulti/oldProducts)의 적용일 + "인상 전 단가"
 * 체크박스 기본값을 조회한다. 권한: products.price-schedule VIEW.
 */
export async function getPriceChangeScheduleAdmin(): Promise<PriceChangeScheduleAdminItem[]> {
  const res = await apiClient.get<ApiEnvelope<PriceChangeScheduleAdminItem[]>>(
    '/api/v1/products/admin/price-change-schedule',
  )
  return res.data.data
}

/**
 * 단가변동 스케줄 admin 부분 수정 — `PUT /api/v1/products/admin/price-change-schedule/{category}`.
 *
 * null-keep 부분 수정 — patch 에 담기지 않은 필드는 기존 값을 유지한다. 권한:
 * products.price-schedule UPDATE.
 *
 * @param category 카테고리 키 (homemulti/singleSets/commercialMulti/oldProducts)
 * @param patch 적용일/기본값 부분 수정 요청
 */
export async function updatePriceChangeSchedule(
  category: PriceChangeScheduleCategory,
  patch: UpdatePriceChangeScheduleRequest,
): Promise<PriceChangeScheduleAdminItem> {
  const res = await apiClient.put<ApiEnvelope<PriceChangeScheduleAdminItem>>(
    `/api/v1/products/admin/price-change-schedule/${encodeURIComponent(category)}`,
    patch,
  )
  return res.data.data
}
