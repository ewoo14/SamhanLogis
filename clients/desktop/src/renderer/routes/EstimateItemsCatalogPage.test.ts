import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  applyClassificationSettingsSuccessEffects,
  applyFixedDiscountPatchSuccessEffects,
  applyUsagePatchSuccessEffects,
  VariableDiscountCell,
  type EstimateItemsCatalogSuccessEffects,
} from './EstimateItemsCatalogPage'
import type { ProductCatalogRow } from '../api/productCatalogApi'
import { searchMasterProducts } from './EstimateItemsCatalogPage'

function effects(): EstimateItemsCatalogSuccessEffects & {
  clearMutationError: ReturnType<typeof vi.fn>
  clearPatchingCode: ReturnType<typeof vi.fn>
  closeClassificationModal: ReturnType<typeof vi.fn>
  invalidateCatalogQueries: ReturnType<typeof vi.fn>
} {
  return {
    clearMutationError: vi.fn(),
    clearPatchingCode: vi.fn(),
    closeClassificationModal: vi.fn(),
    invalidateCatalogQueries: vi.fn(),
  }
}

describe('EstimateItemsCatalogPage mutation success wiring', () => {
  it('분류/고정DC 저장 성공은 모달을 닫고 목록을 갱신한다', () => {
    const fns = effects()

    applyClassificationSettingsSuccessEffects(fns)

    expect(fns.clearMutationError).toHaveBeenCalledTimes(1)
    expect(fns.clearPatchingCode).toHaveBeenCalledTimes(1)
    expect(fns.closeClassificationModal).toHaveBeenCalledTimes(1)
    expect(fns.invalidateCatalogQueries).toHaveBeenCalledTimes(1)
  })

  it('usage scope PATCH 성공은 분류/고정DC 모달을 닫지 않는다', () => {
    const fns = effects()

    applyUsagePatchSuccessEffects(fns)

    expect(fns.clearMutationError).toHaveBeenCalledTimes(1)
    expect(fns.clearPatchingCode).toHaveBeenCalledTimes(1)
    expect(fns.closeClassificationModal).not.toHaveBeenCalled()
    expect(fns.invalidateCatalogQueries).toHaveBeenCalledTimes(1)
  })

  it('고정DC 자동저장 성공은 분류 모달을 닫지 않고 목록만 갱신한다', () => {
    const fns = effects()

    applyFixedDiscountPatchSuccessEffects(fns)

    expect(fns.clearMutationError).toHaveBeenCalledTimes(1)
    expect(fns.clearPatchingCode).toHaveBeenCalledTimes(1)
    expect(fns.closeClassificationModal).not.toHaveBeenCalled()
    expect(fns.invalidateCatalogQueries).toHaveBeenCalledTimes(1)
  })
})

describe('EstimateItemsCatalogPage master search', () => {
  it('검색 1회 응답의 메타데이터만 사용하고 목록 API를 건별 재호출하지 않는다', async () => {
    const searchProducts = vi.fn().mockResolvedValue([
      {
        id: 'p-1',
        modelName: 'NON-GOODS-1',
        productName: '비상품',
        modelCode: 'NON-GOODS-1',
        productCategory: 'SINGLE_PART',
        usageScope: 'NONE',
        estimateCategories: [],
        goodsType: 'NON_GOODS',
      },
      {
        id: 'p-2',
        modelName: 'MATERIAL-1',
        productName: '자재',
        modelCode: 'MATERIAL-1',
        productCategory: 'MATERIAL',
        usageScope: 'NONE',
        estimateCategories: [],
        goodsType: 'GOODS',
      },
    ])
    const listProducts = vi.fn()

    const result = await searchMasterProducts(searchProducts, 'NON', 'HOME_MULTI')

    expect(result).toHaveLength(1)
    expect(result[0]?.goodsType).toBe('NON_GOODS')
    expect(searchProducts).toHaveBeenCalledTimes(1)
    expect(searchProducts).toHaveBeenCalledWith('NON', { size: 50 })
    expect(listProducts).not.toHaveBeenCalled()
  })
})

const variableDiscountRow: ProductCatalogRow = {
  modelCode: 'AC-VDC-1000',
  name: '변동DC 테스트 품목',
  usageScope: 'BOTH',
  estimateCategories: [{ category: 'HOME_MULTI', displayOrder: 1 }],
  productCategory: 'HOME_MULTI',
  usageScopeManual: false,
  releasePrice: 1000,
  deliveryPrice: 1000,
  hasVariableDiscount: true,
  variableDiscountManual: true,
  productType: 'SINGLE',
  componentCount: 0,
}

describe('VariableDiscountCell', () => {
  it('행 셀은 변동DC 가시 라벨 없이 체크박스 접근성 라벨과 툴팁만 유지한다', () => {
    const markup = renderToStaticMarkup(
      createElement(VariableDiscountCell, {
        row: variableDiscountRow,
        canEdit: true,
        patchLoading: false,
        onVariableDiscountPatch: vi.fn(),
      }),
    )
    const visibleText = markup.replace(/<[^>]+>/g, '')

    expect(visibleText).not.toContain('변동DC')
    expect(markup).toContain('aria-label="변동DC"')
    expect(markup).toContain('title="변동DC: 전역할인율 영향 없이 기초 납품가 그대로 표시"')
  })
})
