import { describe, expect, it } from 'vitest'
import {
  deriveLegacyAnalysis,
  filterInOutRows,
  modelChips,
  withProfitFields,
  type InOutAnalysisRow,
} from './inoutAnalysisModel'

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

  it('분류 근거가 없는 행은 분류 칩 선택에서 제외된다', () => {
    const rows = [
      { modelCode: 'LEGACY-UNKNOWN-1', productName: '이카운트 품목', productCategory: null },
      { modelCode: 'CLASSIFIED-1', productName: '실외기', productCategory: null },
    ]

    expect(filterInOutRows(rows, new Set(['홈멀티']))).toHaveLength(0)
    expect(filterInOutRows(rows, new Set(['미분류']))).toHaveLength(1)
    expect(filterInOutRows(rows, new Set(['미분류']))[0].modelCode).toBe('LEGACY-UNKNOWN-1')
  })

  it('분류 근거가 없는 61행은 미분류 칩에서만 보인다', () => {
    const rows = Array.from({ length: 61 }, (_, index) => ({
      modelCode: `LEGACY-MODEL-${String(index + 1).padStart(3, '0')}`,
      productName: `테스트제품-${index + 1}`,
      productCategory: null,
    }))

    expect(rows).toHaveLength(61)
    for (const chip of ['실외기', '실내기', '홈멀티', '싱글중대형', '상업멀티', '판넬'] as const) {
      expect(filterInOutRows(rows, new Set([chip]))).toHaveLength(0)
    }
    expect(filterInOutRows(rows, new Set(['미분류']))).toHaveLength(61)
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

  it('매입·판매 단가 차이로 이익률을 계산해 수량 차이를 손실로 오인하지 않는다', () => {
    const row: InOutAnalysisRow = withProfitFields({
      modelCode: 'MODEL-PROFIT', productName: '산정 품목', inboundQuantity: 1, outboundQuantity: 1,
      purchaseAmount: 100, salesAmount: 125,
    })
    expect(row.profitAmount).toBe(25)
    expect(row.profitRate).toBe(25)
    expect(row.profitRateDisplay).toBe('25.00%')
    console.log(`A 숫자 확인: 매입=${row.purchaseAmount}, 판매=${row.salesAmount}, 이익률=${row.profitRateDisplay}`)
  })

  it('매입·판매 단가가 같으면 입출고 수량이 달라도 이익률은 0%다', () => {
    const row = withProfitFields({
      modelCode: 'TEST-MODEL-0080', productName: '실상품', inboundQuantity: 8, outboundQuantity: 12,
      purchaseAmount: 7_176_000, salesAmount: 10_764_000,
    })
    expect(row.profitRate).toBe(0)
    expect(row.profitRateDisplay).toBe('0.00%')
  })

  it('모델-연-월 점을 보존하고 전년·당년 출고 추이를 집계한다', () => {
    const rows = [
      withProfitFields({
        modelCode: 'A', productName: 'A', inboundQuantity: 4, outboundQuantity: 7,
        purchaseAmount: 100, salesAmount: 200,
        monthly: [
          { year: 2025, month: 1, inboundQuantity: 2, outboundQuantity: 3 },
          { year: 2026, month: 1, inboundQuantity: 2, outboundQuantity: 4 },
        ],
      }),
    ]
    const analysis = deriveLegacyAnalysis(rows)

    expect(rows.flatMap((row) => row.monthly ?? [])).toHaveLength(2)
    expect(analysis.trend.find((point) => point.month === 1)).toEqual({
      month: 1, previousYearOutbound: 3, currentYearOutbound: 4,
    })
  })

  it('레거시 수요예측 규칙은 마지막 당년 출고월 이후를 전년 월량×증감률로 산출한다', () => {
    const rows = [
      withProfitFields({
        modelCode: 'A', productName: 'A', inboundQuantity: 0, outboundQuantity: 4,
        purchaseAmount: null, salesAmount: 100,
        monthly: [
          { year: 2025, month: 2, inboundQuantity: 0, outboundQuantity: 10 },
          { year: 2025, month: 3, inboundQuantity: 0, outboundQuantity: 20 },
          { year: 2026, month: 2, inboundQuantity: 0, outboundQuantity: 20 },
          { year: 2026, month: 3, inboundQuantity: 0, outboundQuantity: 30 },
        ],
      }),
    ]
    const analysis = deriveLegacyAnalysis(rows)

    expect(analysis.forecast).toEqual([
      { month: 4, quantity: 0 }, { month: 5, quantity: 0 }, { month: 6, quantity: 0 },
      { month: 7, quantity: 0 }, { month: 8, quantity: 0 }, { month: 9, quantity: 0 },
      { month: 10, quantity: 0 }, { month: 11, quantity: 0 }, { month: 12, quantity: 0 },
    ])
  })

  it('Top 3·Bottom 3와 추천·알림은 실제 모델 집계에서 산출한다', () => {
    const rows = ['A', 'B', 'C', 'D'].map((modelCode, index) => withProfitFields({
      modelCode, productName: modelCode, inboundQuantity: index === 0 ? 1 : 10,
      outboundQuantity: 40 - index * 10, purchaseAmount: 100, salesAmount: 200,
      monthly: [{ year: 2026, month: 1, inboundQuantity: index === 0 ? 1 : 10, outboundQuantity: 40 - index * 10 }],
    }))
    const analysis = deriveLegacyAnalysis(rows)

    expect(analysis.top3).toHaveLength(3)
    expect(analysis.top3[0]).toMatchObject({ modelCode: 'A', outboundQuantity: 40 })
    expect(analysis.bottom3).toHaveLength(3)
    expect(analysis.recommendations.length).toBeGreaterThan(0)
  })
})
