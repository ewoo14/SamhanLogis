/**
 * 품목 도메인 API 클라이언트 — AC-2 슬라이스 신규.
 *
 * 노출 endpoint:
 * - `GET /api/products?q={q}&size=20` — 모델명/품목명 부분일치 검색
 *   (product-service `GET /products?q=`, gateway StripPrefix=1 으로 `/api/products` 경유)
 *
 * 응답 shape:
 * - `ApiEnvelope<Page<ProductSummaryResponse>>`
 * - `ProductSummaryResponse`: `{ id: UUID, name: string, modelName: string,
 *     productCode: string|null, categoryId: UUID, sellingPrice: BigDecimal, status: string }`
 *
 * UUID 비공개 가드: `id` 는 내부 사용 전용 — 화면 표시 금지.
 * 표시 식별자는 `modelName` / `name` (productName).
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'
import type { ProductOption } from '@samhan/design-system'

/** product-service `ProductSummaryResponse` 매핑 타입 (FE 전용). */
interface ProductSummaryResponse {
  id: string
  name: string
  modelName: string
  productCode: string | null
  sellingPrice: string | null
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
export async function searchProducts(q: string): Promise<ProductOption[]> {
  try {
    const res = await apiClient.get<ApiEnvelope<PageResponse<ProductSummaryResponse>>>(
      '/api/products',
      {
        params: { q, size: 20 },
      },
    )
    const page = res.data.data
    const content = Array.isArray(page?.content) ? page.content : []
    return content.map((p): ProductOption => ({
      id: p.id,
      modelName: p.modelName ?? '',
      productName: p.name ?? '',
      sellingPrice:
        p.sellingPrice != null
          ? Number(p.sellingPrice)
          : undefined,
    }))
  } catch {
    // 네트워크/서버 오류 시 graceful 빈 배열 반환
    return []
  }
}
