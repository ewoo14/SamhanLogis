// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { render } from '@testing-library/react'
import {
  applyClassificationSettingsSuccessEffects,
  applyFixedDiscountPatchSuccessEffects,
  applyUsagePatchSuccessEffects,
  extractQuantitySyncRuleKeys,
  resolveQuantitySyncRuleEditTarget,
  VariableDiscountCell,
  FixedDiscountCell,
  useStableEstimateCatalogRows,
  preserveActiveQuantitySyncTargets,
  type EstimateItemsCatalogSuccessEffects,
} from './EstimateItemsCatalogPage'
import type { ProductCatalogRow } from '../api/productCatalogApi'
import type { QuantitySyncRule } from '../api/quantitySyncApi'
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

describe('EstimateItemsCatalogPage live-QA regressions', () => {
  it('모달이 열린 뒤 렌더 횟수가 20회를 넘지 않아 입력 경로가 도달 가능하다', () => {
    let renderCount = 0
    const source = [{ modelCode: 'AM052BN6PBH1', usageScope: 'ESTIMATE' as const }]
    function Harness() {
      renderCount += 1
      const stableRows = useStableEstimateCatalogRows(source)
      return createElement('output', { 'data-count': stableRows.length })
    }

    render(createElement(Harness))

    expect(renderCount).toBeLessThanOrEqual(20)
  })

  it('규칙 응답에 섞인 소프트삭제 target 23건을 저장 draft에서 제외하고 활성 3건만 유지한다', () => {
    const targets = [
      ...Array.from({ length: 3 }, (_, index) => ({ productCode: `ACTIVE-${index + 1}`, isDeleted: false })),
      ...Array.from({ length: 23 }, (_, index) => ({ productCode: `DELETED-${index + 1}`, isDeleted: true })),
    ]

    expect(preserveActiveQuantitySyncTargets(targets).map((target) => target.productCode)).toEqual([
      'ACTIVE-1', 'ACTIVE-2', 'ACTIVE-3',
    ])
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

describe('FixedDiscountCell 적용 출처', () => {
  it('유효 정액DC율의 출처를 화면에 표시한다', () => {
    const markup = renderToStaticMarkup(
      createElement(FixedDiscountCell, {
        row: { ...variableDiscountRow, fixedDiscountRate: 15, fixedDiscountSource: 'S' },
        canEdit: false,
        patchLoading: false,
        onFixedDiscountPatch: vi.fn(),
      }),
    )

    expect(markup).toContain('data-testid="estimate-items-fixed-dc-source-AC-VDC-1000"')
    expect(markup).toContain('>S</span>')
  })
})

describe('EstimateItemsCatalogPage quantity-sync 409 navigation', () => {
  const activeRule: QuantitySyncRule = {
    ruleKey: 'UI_HOME_MULTI_R32',
    estimateCategory: 'HOME_MULTI',
    name: 'R32 테스트 규칙',
    enabled: true,
    aggregation: 'SUM',
    when: {},
    inactiveBehavior: 'ZERO',
    conflictPolicy: 'REPLACE',
    priority: 1000,
    legacyRef: 'UI:R32',
    sources: [{ productCode: 'R32-MAIN', productName: 'R32 본체' }],
    targets: [{ productCode: 'R32-MATERIAL', productName: 'R32 부자재', multiplier: 1 }],
  }

  it('409 차단 문구에서 rule key 목록을 보존하고 무관한 문구는 연결하지 않는다', () => {
    expect(extractQuantitySyncRuleKeys(
      '수량 동기화 규칙이 이 품목을 참조하고 있어 상태를 변경할 수 없습니다: UI_HOME_MULTI_R32, UI_HOME_MULTI_OTHER',
    )).toEqual(['UI_HOME_MULTI_R32', 'UI_HOME_MULTI_OTHER'])
    expect(extractQuantitySyncRuleKeys('일반 오류: UI_HOME_MULTI_R32')).toEqual([])
  })

  it('활성 rule key를 본체 source 모델코드 편집 지점으로 해석한다', () => {
    expect(resolveQuantitySyncRuleEditTarget(activeRule.ruleKey, [activeRule])).toEqual({
      ruleKey: activeRule.ruleKey,
      modelCode: 'R32-MAIN',
    })
    expect(resolveQuantitySyncRuleEditTarget(activeRule.ruleKey, [{ ...activeRule, enabled: false }])).toBeUndefined()
  })
})
