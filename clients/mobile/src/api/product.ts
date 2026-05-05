/**
 * product-service (M1a) endpoint wrapper.
 *
 * 출처: migration/analysis/04-migration-plan.md §2.1.7
 *   GET /api/v1/products?usageScope=PARTNER_ORDER,BOTH&category=HW
 *
 * UUID 미노출 — modelCode 가 사용자 노출 식별자.
 */

import { api } from './client';

/** EstimateCategory — 4 카테고리 (HW=원자재 / ACC=부속품 / ETC=기타 / CTRL=컨트롤러) */
export type EstimateCategory = 'HW' | 'ACC' | 'ETC' | 'CTRL';

export interface ProductMaster {
  id: string;
  modelCode: string;
  modelName: string;
  category: EstimateCategory;
  unit?: string;
  defaultUnitPrice?: number;
  /** spec list — displayOrder 순 */
  productSpecs?: Array<{ specKey: string; specValue: string; unit?: string }>;
}

/**
 * 카테고리별 품목 목록 조회.
 * default 필터: usageScope IN (PARTNER_ORDER, BOTH).
 */
export async function fetchProducts(category?: EstimateCategory, q?: string): Promise<ProductMaster[]> {
  const { data } = await api.get<ProductMaster[]>('/api/v1/products', {
    params: {
      usageScope: 'PARTNER_ORDER,BOTH',
      category,
      q,
    },
  });
  return data;
}
