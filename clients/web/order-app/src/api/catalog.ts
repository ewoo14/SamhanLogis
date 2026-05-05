/**
 * 카탈로그 (ProductMaster + ProductSpec) API — M1a product-service.
 *
 * <p>Migration Plan §2.1.7 endpoint:
 * <ul>
 *   <li>GET /api/v1/products?usageScope&category — 카테고리별 ProductMaster</li>
 *   <li>GET /api/v1/products/{modelCode}/specs — ProductSpec 조회</li>
 *   <li>GET /api/v1/partner-orders/catalog/home — partner-order-service (M4) 위임</li>
 * </ul>
 *
 * <p>v2 정정 #12: ProductCatalog 의 가격은 `releasePrice` (출고가) — DC 적용 전.
 * 거래처 노출 시 `LinePriceDisplay` 가 DC + 옵션 가산 후 최종가 표시.
 *
 * <p>현 단계 partner-order-service (M4) 미존재 → product-service `/api/v1/products`
 * 직접 호출 + UI 단에서 카테고리 필터.
 *
 * <p>Bundle EXPAND/KEEP UI 표시는 `ProductCatalog.isBundle` 기준이며,
 * 실제 펼침은 발송 시점 partner-order-service 가 처리 (M4).
 */
import axios from 'axios'
import { apiClient, type PageResponse } from './client'
import type { EstimateCategory, ProductCatalog, ProductSpecRow, UsageScope } from '../types'

interface ListParams {
  usageScope?: UsageScope
  category?: EstimateCategory
  page?: number
  size?: number
}

/**
 * 카테고리별 ProductCatalog 조회.
 *
 * @returns Spring Data Page 응답 (`content` 안에 ProductCatalog row).
 */
export async function listProducts(params: ListParams): Promise<PageResponse<ProductCatalog>> {
  try {
    const res = await apiClient.get<PageResponse<ProductCatalog>>('/api/v1/products', { params })
    return res.data
  } catch (err) {
    if (axios.isAxiosError(err) && (err.response === undefined || err.response.status === 404)) {
      return mockListProducts(params)
    }
    throw err
  }
}

/** 단일 product 의 ProductSpec 조회. */
export async function listProductSpecs(modelCode: string): Promise<ProductSpecRow[]> {
  try {
    const res = await apiClient.get<ProductSpecRow[]>(`/api/v1/products/${encodeURIComponent(modelCode)}/specs`)
    return res.data
  } catch (err) {
    if (axios.isAxiosError(err) && (err.response === undefined || err.response.status === 404)) {
      return []
    }
    throw err
  }
}

/* ==========================================================================
 * mock — BE 미존재 시 시연용 fixture
 * ========================================================================== */
function mockListProducts(params: ListParams): PageResponse<ProductCatalog> {
  const all = MOCK_PRODUCTS
  const filtered = all.filter((p) => {
    if (params.category && p.estimateCategory !== params.category) return false
    if (params.usageScope && params.usageScope !== 'BOTH' && p.usageScope !== params.usageScope && p.usageScope !== 'BOTH') {
      return false
    }
    return true
  })
  return {
    content: filtered,
    totalElements: filtered.length,
    totalPages: 1,
    number: 0,
    size: filtered.length,
    first: true,
    last: true,
  }
}

const MOCK_PRODUCTS: ProductCatalog[] = [
  {
    modelCode: 'AC080AHX5SH',
    productName: '홈멀티 실외기 8.0kW',
    categoryL: '에어컨',
    categoryM: '홈멀티',
    categoryS: '실외기',
    categoryD: '8.0kW',
    unit: '대',
    releasePrice: 2_400_000,
    estimateCategory: 'HOME_MULTI',
    usageScope: 'BOTH',
    isBundle: false,
  },
  {
    modelCode: 'AC026FNCDH',
    productName: '홈멀티 실내기 2.6kW (천장형)',
    categoryL: '에어컨',
    categoryM: '홈멀티',
    categoryS: '실내기',
    categoryD: '2.6kW 천장',
    unit: '대',
    releasePrice: 720_000,
    estimateCategory: 'HOME_MULTI',
    usageScope: 'BOTH',
    isBundle: false,
  },
  {
    modelCode: 'AP-CST-15',
    productName: '360 CST UV 15평형 (싱글세트)',
    categoryL: '에어컨',
    categoryM: '싱글세트',
    categoryS: '천장카세트',
    categoryD: '15평형',
    unit: '셋트',
    releasePrice: 1_180_000,
    estimateCategory: 'SINGLE_SET',
    usageScope: 'BOTH',
    isBundle: true,
  },
  {
    modelCode: 'AP-WALL-9',
    productName: '벽걸이 9평형 (싱글세트)',
    categoryL: '에어컨',
    categoryM: '싱글세트',
    categoryS: '벽걸이',
    categoryD: '9평형',
    unit: '셋트',
    releasePrice: 540_000,
    estimateCategory: 'SINGLE_SET',
    usageScope: 'BOTH',
    isBundle: true,
  },
  {
    modelCode: 'AR140KAX',
    productName: '상업멀티 실외기 14.0kW',
    categoryL: '에어컨',
    categoryM: '상업멀티',
    categoryS: '실외기',
    categoryD: '14.0kW',
    unit: '대',
    releasePrice: 4_320_000,
    estimateCategory: 'COMMERCIAL_MULTI',
    usageScope: 'BOTH',
    isBundle: false,
  },
  {
    modelCode: 'AR036FCST',
    productName: '상업멀티 실내기 3.6kW (천장카세트)',
    categoryL: '에어컨',
    categoryM: '상업멀티',
    categoryS: '실내기',
    categoryD: '3.6kW 천장카세트',
    unit: '대',
    releasePrice: 980_000,
    estimateCategory: 'COMMERCIAL_MULTI',
    usageScope: 'BOTH',
    isBundle: false,
  },
  {
    modelCode: 'AF-OLD-RC',
    productName: '구형 리모컨 (단종 부속)',
    categoryL: '부속품',
    categoryM: '리모컨',
    categoryS: '구형',
    categoryD: '단종',
    unit: '개',
    releasePrice: 35_000,
    estimateCategory: 'LEGACY',
    usageScope: 'PARTNER_ORDER',
    isBundle: false,
  },
]
