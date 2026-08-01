import { describe, expect, it } from 'vitest'
import { filterInOutRows, modelChips } from './inoutAnalysisModel'

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
})
