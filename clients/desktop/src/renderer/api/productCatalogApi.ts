/**
 * 품목 카탈로그 관리 API — PR-B 품목 노출 수동 토글 + PR-E 세트·구성품·표시순서 슬라이스.
 *
 * 노출 endpoint:
 * - `GET /api/v1/products?q=&usageScope=&category=&page=&size=` — 품목 목록 (필터)
 * - `PATCH /api/v1/products/{modelCode}/usage` — 수동 노출 설정
 * - `DELETE /api/v1/products/{modelCode}/usage` — 시트 자동 복귀 (수동 override 해제)
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

/** 품목 등록 화면 요청 전용 3구분 — BE ProductItemKind enum 과 정확히 일치 */
export type ProductItemKind = 'GENERAL' | 'SET' | 'SET_COMPONENT'

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

// ---------------------------------------------------------------------------
// 응답 DTO
// ---------------------------------------------------------------------------

/** 품목 타입 — BUNDLE: 세트 품목, SINGLE 외: 단품 */
export type ProductType = 'BUNDLE' | 'SINGLE' | string

/**
 * 품목 카탈로그 행 — `GET /api/v1/products` 응답 DTO.
 *
 * usageScope/estimateCategory/usageScopeManual/displayOrder 포함 (PR-B 확장).
 * productType/componentCount 추가 (PR-E 확장).
 */
export interface ProductCatalogRow {
  /** 품목코드 (사용자 식별자 — UUID 아님). modelName 과 동일값 */
  modelCode: string
  /** 품목명 */
  name: string
  /** 노출 범위 */
  usageScope: UsageScope
  /** 견적 카테고리 (ESTIMATE/BOTH 시에만 의미 있음) */
  estimateCategory: EstimateCategory | null
  /** 수동 override 여부 — true: 수동 설정, false: 시트 자동 */
  usageScopeManual: boolean
  /** 시트 기준 표시 순서 */
  displayOrder: number | null
  /** 출고 단가 */
  releasePrice: number | null
  /** 배송 단가 */
  deliveryPrice: number | null
  /** 품목 타입 (BUNDLE=세트, 그 외=단품). BE 응답 없을 시 undefined */
  productType?: ProductType
  /** 활성 구성품 수 — BUNDLE 외 0. BE 응답 없을 시 undefined */
  componentCount?: number
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
  displayOrder: number
}

/** `POST /api/v1/products` 요청 body — BE CreateProductRequest record 와 필드명 동일 */
export interface CreateProductRequest {
  name: string
  modelName: string
  categoryId: string
  sellingPrice: string
  purchasePrice: string
  currency: string
  tags: Record<string, string>
  description: string | null
  itemKind: ProductItemKind
  productCategory: ProductCategory
  bundleMode: BundleMode | null
  parentSetModelCode: string | null
  componentKind: ComponentKind | null
  unit: string | null
  releasePrice: string | null
  deliveryPrice: string | null
  goodsType: ProductGoodsType
}

/** `PATCH /api/v1/products/{id}` 요청 body — BE UpdateProductRequest record 와 필드명 동일 */
export interface UpdateProductRequest {
  name: string | null
  modelName: string | null
  categoryId: string | null
  description: string | null
  itemKind: ProductItemKind | null
  productCategory: ProductCategory | null
  bundleMode: BundleMode | null
  parentSetModelCode: string | null
  componentKind: ComponentKind | null
  unit: string | null
  releasePrice: string | null
  deliveryPrice: string | null
  goodsType: ProductGoodsType | null
}

// ---------------------------------------------------------------------------
// 요청 타입
// ---------------------------------------------------------------------------

/** `PATCH /api/v1/products/{modelCode}/usage` 요청 body */
export interface UpdateProductUsageRequest {
  usageScope: UsageScope
  /** ESTIMATE/BOTH 시에만 필요. null 로 보내면 초기화 */
  estimateCategory?: EstimateCategory | null
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
 * @param req usageScope + estimateCategory
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
