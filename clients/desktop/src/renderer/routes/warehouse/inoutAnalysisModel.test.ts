import { describe, expect, it } from 'vitest'
import { filterInOutRows, modelChips, withProfitFields, type InOutAnalysisRow } from './inoutAnalysisModel'

describe('입출고 모델 복수 칩 필터', () => {
  it('품목명과 상품 대분류를 모두 칩 집합으로 보존한다', () => {
    expect(modelChips({ name: '판넬 실내기', productCategory: 'HOME_MULTI' })).toEqual(
      new Set(['판넬', '실내기', '홈멀티']),
    )
  })

  it('선택 칩이 여러 개면 OR로 통과시키고 미선택이면 전체를 반환한다', () => {
    const rows = [
      { modelCode: 'A', productName: '실외기', productCategory: 'SINGLE_PART' },
      { modelCode: 'B', productName: '판넬', productCategory: 'COMMERCIAL_MULTI' },
    ]
    expect(filterInOutRows(rows, new Set())).toHaveLength(2)
    expect(filterInOutRows(rows, new Set(['실외기', '판넬']))).toHaveLength(2)
    expect(filterInOutRows(rows, new Set(['홈멀티']))).toHaveLength(0)
  })

  it('원가 없는 판매 품목도 행으로 남기고 이익률만 대시로 표시한다', () => {
    const rows: InOutAnalysisRow[] = [
      withProfitFields({ modelCode: 'MODEL-COST-MISSING', productName: '원가없는 품목', inboundQuantity: 0, outboundQuantity: 2, purchaseAmount: null, salesAmount: 200 }),
      withProfitFields({ modelCode: 'MODEL-COST-KNOWN', productName: '원가있는 품목', inboundQuantity: 2, outboundQuantity: 1, purchaseAmount: 100, salesAmount: 200 }),
    ]
    const filtered = filterInOutRows(rows, new Set())
    expect(filtered.map((row) => row.modelCode)).toEqual(['MODEL-COST-MISSING', 'MODEL-COST-KNOWN'])
    expect(filtered[0].profitRate).toBeNull()
    expect(filtered[0].profitRateDisplay).toBe('—')
    console.log(`C 실행 확인: 모델코드=${filtered[0].modelCode}, 목록행=있음, 이익률=${filtered[0].profitRateDisplay}`)
  })

  it('매입·판매 금액 차이로 이익률을 계산한다', () => {
    const row: InOutAnalysisRow = withProfitFields({
      modelCode: 'MODEL-PROFIT', productName: '산정 품목', inboundQuantity: 1, outboundQuantity: 1,
      purchaseAmount: 100, salesAmount: 125,
    })
    expect(row.profitAmount).toBe(25)
    expect(row.profitRate).toBe(25)
    expect(row.profitRateDisplay).toBe('25.00%')
    console.log(`A 숫자 확인: 매입=${row.purchaseAmount}, 판매=${row.salesAmount}, 이익률=${row.profitRateDisplay}`)
  })
})
