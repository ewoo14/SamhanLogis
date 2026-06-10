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
import { apiClient, type PageResponse } from './client'

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

/**
 * 구성품 항목 — `GET /api/v1/products/{modelCode}/components` 응답 DTO.
 * BundleComponent 엔티티 실 필드 기반.
 */
export interface BundleComponentItem {
  /** 구성 품목 모델코드 */
  componentModelCode: string
  /** 구성 품목명 (BE 선택적 포함) */
  name?: string
  /** 수량 */
  quantity: number
  /** 표시 순서 */
  displayOrder: number
}

/**
 * `PUT /api/v1/products/{modelCode}/components` 요청 body 항목.
 * index = 순서 (displayOrder 는 BE 에서 자동 계산하나 명시 전달).
 */
export interface BundleComponentInput {
  componentModelCode: string
  quantity: number
  displayOrder: number
}

/**
 * `PUT /api/v1/products/display-orders` 요청 body 항목.
 */
export interface DisplayOrderInput {
  modelCode: string
  displayOrder: number
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
 * BUNDLE 품목 전용. 권한: products.list VIEW.
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
 * 권한: products.admin UPDATE.
 *
 * @param modelCode BUNDLE 품목코드
 * @param components 교체할 구성품 목록 (index=순서)
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
