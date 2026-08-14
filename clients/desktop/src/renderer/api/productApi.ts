/**
 * 품목 도메인 API 클라이언트 — AC-2 슬라이스 신규.
 *
 * 노출 endpoint:
 * - `GET /api/products?q={q}&size=20` — 모델명/품목명 부분일치 검색
 *   (product-service `GET /products?q=`, gateway StripPrefix=1 으로 `/api/products` 경유)
 * - `POST /api/products/lookup` — productId 배열 batch 조회 (BE `ProductController.lookup`,
 *   요청당 ids ≤ 100). 전표 수정 거래처 변경 재조회의 카탈로그 판매가 소스(R8 잔여 1).
 *
 * 응답 shape:
 * - `ApiEnvelope<Page<ProductSummaryResponse>>` (검색) / `ApiEnvelope<ProductSummaryResponse[]>` (lookup)
 * - `ProductSummaryResponse`: `{ id: UUID, name: string, modelName: string,
 *     productCode: string|null, categoryId: UUID, sellingPrice: BigDecimal,
 *     deliveryPrice: BigDecimal, status: string }`
 *
 * UUID 비공개 가드: `id` 는 내부 사용 전용 — 화면 표시 금지.
 * 표시 식별자는 `modelName` / `name` (productName).
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'
import type { ProductOption } from '@samhan/design-system'
import type { EstimateCategory, ProductCategory, UsageScope } from './productCatalogApi'

/**
 * product-service `ProductSummaryResponse` 매핑 타입 (FE 전용).
 * `categoryId` 는 BE 응답에 존재하나 FE 에서 미사용 — 타입 노출 제거 (F-04).
 */
interface ProductSummaryResponse {
  id: string
  name: string
  modelName: string
  productCode: string | null
  sellingPrice: string | null
  deliveryPrice?: string | number | null
  specification?: string | null
  /** 품목코드 — BE ProductSummaryResponse 신규 (세트 전개 부모 식별). */
  modelCode?: string | null
  /** 품목 유형 — "SINGLE" | "BUNDLE". BE ProductSummaryResponse 신규. */
  productType?: string | null
  categoryKey?: string | null
  fixedDiscountRate?: number | null
  fixedDiscountSource?: string | null
  discountOption?: 'THREE_SIXTY' | 'FOUR_WAY' | 'ONE_WAY' | 'STAND' | 'DELUXE' | 'FIRST_GRADE' | null
  classificationAssigned?: boolean
  hasVariableDiscount?: boolean | null
  status?: string | null
  goodsType?: 'GOODS' | 'NON_GOODS' | null
  usageScope?: UsageScope | null
  estimateCategories?: EstimateCategory[] | null
  productCategory?: ProductCategory | null
}

/** 서버 페이지 메타데이터를 보존한 품목 검색 배열. 배열 호환 호출자는 그대로 사용할 수 있다. */
export type ProductSearchResults = ProductOption[] & {
  totalElements?: number
  displayedElements?: number
  truncated?: boolean
}

/**
 * 품목 부분 검색 — `GET /api/products?q={q}&size=20`.
 *
 * <p>product-service `ProductController.search` 로 라우팅 (gateway `/api/products/**` → StripPrefix=1).
 * `q` 파라미터로 모델명/품목명 LIKE 검색.
 *
 * @param q 검색어 (모델명 또는 품목명 부분 입력)
 * @returns `ProductOption[]` — 실패 시 빈 배열 (graceful degradation)
 */
export async function searchProducts(
  q: string,
  options: { usageScope?: UsageScope; size?: number } = {},
): Promise<ProductOption[]> {
  try {
    const res = await apiClient.get<ApiEnvelope<PageResponse<ProductSummaryResponse>>>(
      '/api/products',
      {
        params: {
          q,
          size: options.size ?? 20,
          ...(options.usageScope ? { usageScope: options.usageScope } : {}),
        },
      },
    )
    const page = res.data.data
    const content = Array.isArray(page?.content) ? page.content : []
    const results = content.map(toProductOption) as ProductSearchResults
    const totalElements = Number(page?.totalElements ?? content.length)
    results.totalElements = totalElements
    results.displayedElements = results.length
    results.truncated = totalElements > results.length
    return results
  } catch {
    // 네트워크/서버 오류 시 graceful 빈 배열 반환
    return []
  }
}

/** BE `ProductSummaryResponse` → design-system `ProductOption` 공통 매핑 (검색/lookup 공용). */
function toProductOption(p: ProductSummaryResponse): ProductOption {
  return {
    id: p.id,
    modelName: p.modelName ?? '',
    productName: p.name ?? '',
    productCode: p.productCode ?? null,
    sellingPrice:
      p.sellingPrice != null
        ? Number(p.sellingPrice)
        : undefined,
    deliveryPrice:
      p.deliveryPrice != null
        ? Number(p.deliveryPrice)
        : undefined,
    modelCode: p.modelCode ?? undefined,
      productType: p.productType ?? undefined,
      specification: p.specification ?? undefined,
      categoryKey: p.categoryKey ?? undefined,
      fixedDiscountRate: p.fixedDiscountRate ?? null,
      fixedDiscountSource: p.fixedDiscountSource ?? null,
      discountOption: p.discountOption ?? null,
      classificationAssigned: p.discountOption != null,
      hasVariableDiscount: p.hasVariableDiscount ?? null,
      status: p.status ?? null,
      goodsType: p.goodsType ?? undefined,
      usageScope: p.usageScope ?? undefined,
      estimateCategories: p.estimateCategories ?? undefined,
      productCategory: p.productCategory ?? undefined,
  }
}

/** 새로 선택할 수 있는 후보 상태. OUT_OF_STOCK은 표시·수량 잠금 대상이라 포함한다. */
export function isSelectableProductStatus(status?: string | null): boolean {
  return status !== 'DISCONTINUED' && status !== 'NOT_FOR_SALE'
}

/** BE `LookupRequest` 상한 — 요청당 productId 최대 100개 (`@Size(max = 100)`). */
const PRODUCT_LOOKUP_CHUNK_SIZE = 100

/**
 * 품목 batch 조회 — `POST /api/products/lookup` (BE `ProductController.lookup`).
 *
 * <p>전표 수정(모달/인라인) 거래처 변경 재조회에서 각 라인 productId 의 <b>카탈로그 판매가
 * (VAT 포함 도메인 — utils/vatPrice.ts 실증)</b>를 miss fallback 으로 공급하기 위해 쓴다
 * (R8 잔여 1: miss fallback 이 현재단가=옛 거래처값이면 협상가가 새 거래처에 각인).
 *
 * <p>BE 상한(100개) 초과분은 chunk 순차 호출로 합산하고, chunk 실패는 해당 품목만 미확보로
  * 처리한다. 호출자는 결과에서 누락된 품목을 반드시 <b>카탈로그 미확보</b>로 판정해 옛 거래처
  * 단가를 비우고 사용자 재입력을 요구한다(R9 #4 fail-open 차단). 가격기억 hit 교정은 별도라
  * 카탈로그 누락과 무관하게 적용할 수 있다.
 *
 * @param ids productId UUID 배열 (중복/빈값 자동 제거)
 * @returns 조회 성공 품목의 `ProductOption[]` — 미존재/실패 품목은 결과에서 생략
 */
export async function lookupProducts(ids: string[]): Promise<ProductOption[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean)
  if (uniqueIds.length === 0) return []
  const results: ProductOption[] = []
  for (let start = 0; start < uniqueIds.length; start += PRODUCT_LOOKUP_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(start, start + PRODUCT_LOOKUP_CHUNK_SIZE)
    try {
      const res = await apiClient.post<ApiEnvelope<ProductSummaryResponse[]>>(
        '/api/products/lookup',
        { ids: chunk },
      )
      const items = Array.isArray(res.data.data) ? res.data.data : []
      results.push(...items.map(toProductOption))
    } catch {
      // 실패 chunk 는 결과에서 누락 — 호출자가 UNAVAILABLE로 처리하며 현재단가 fallback은 금지.
    }
  }
  return results
}

/** 전표 상세의 삭제 품목 경고용 벌크 존재 확인. 조회 실패 품목은 경고 대상에서 제외한다. */
export async function lookupProductPresence(ids: string[]): Promise<{
  foundProductIds: string[]
  unresolvedProductIds: string[]
}> {
  const uniqueIds = [...new Set(ids)].filter(Boolean)
  if (uniqueIds.length === 0) return { foundProductIds: [], unresolvedProductIds: [] }

  const foundProductIds: string[] = []
  const unresolvedProductIds: string[] = []
  for (let start = 0; start < uniqueIds.length; start += PRODUCT_LOOKUP_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(start, start + PRODUCT_LOOKUP_CHUNK_SIZE)
    try {
      const res = await apiClient.post<ApiEnvelope<ProductSummaryResponse[]>>(
        '/api/products/lookup',
        { ids: chunk },
      )
      const items = Array.isArray(res.data.data) ? res.data.data : []
      foundProductIds.push(...items.map((item) => item.id))
      const found = new Set(items.map((item) => item.id))
      unresolvedProductIds.push(...chunk.filter((id) => !found.has(id)))
    } catch {
      unresolvedProductIds.push(...chunk)
    }
  }
  return { foundProductIds, unresolvedProductIds }
}
