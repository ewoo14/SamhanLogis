import { describe, expect, it } from 'vitest'
import {
  addQuantitySyncTarget,
  getQuantitySyncFeatureOptions,
  QUANTITY_SYNC_SHAPE_OPTIONS,
  removeQuantitySyncTarget,
  toQuantitySyncTargetRequest,
  type QuantitySyncTargetModalDraft,
} from './quantitySyncTargetModal'

const panel = (productCode: string, productName = '판넬') => ({
  id: productCode,
  modelCode: productCode,
  modelName: productCode,
  productName,
  multiplier: '1',
  roundingMode: 'NONE' as const,
  componentVariant: '',
  componentShape: '',
})

describe('수량 동기화 target 모달 RED', () => {
  it('불변식 1: 품목을 추가하고 칩에서 삭제할 수 있다', () => {
    const added = addQuantitySyncTarget([], panel('PANEL-1'))
    expect(added).toHaveLength(1)
    expect(removeQuantitySyncTarget(added, 'PANEL-1')).toEqual([])
  })

  it('불변식 2: 칩의 배수·특징·형상을 저장 요청으로 직렬화한다', () => {
    const draft: QuantitySyncTargetModalDraft = {
      ...panel('PANEL-1'),
      multiplier: '2.5',
      componentVariant: '기본',
      componentShape: '사각',
    }
    expect(toQuantitySyncTargetRequest([draft])).toEqual([{
      productCode: 'PANEL-1',
      multiplier: 2.5,
      roundingMode: 'NONE',
      componentVariant: '기본',
      componentShape: '사각',
      displayOrder: 1,
    }])
  })

  it('불변식 3: 판넬·리모컨 특징 후보가 구성품 화면과 동일하다', () => {
    expect(getQuantitySyncFeatureOptions('PANEL')).toEqual([
      '기본', '블랙', '승강', '공청',
      '인피니트 기본', '인피니트 25년형', '인피니트 공청', '인피니트 공청+동작감지 AI',
    ])
    expect(getQuantitySyncFeatureOptions('REMOTE')).toEqual(['기본', '유선', '컬러'])
  })

  it('불변식 4: 형상 후보는 빈 값이 기본이고 항상 활성이다', () => {
    expect(QUANTITY_SYNC_SHAPE_OPTIONS).toEqual(['', '원형', '사각'])
  })

  it('불변식 5 RED: 기존 26건을 아무것도 바꾸지 않고 저장해도 26건이 유지된다', () => {
    const existing = Array.from({ length: 26 }, (_, index) => panel(`TARGET-${index + 1}`))
    const request = toQuantitySyncTargetRequest(existing)
    expect(request).toHaveLength(26)
    expect(request.map((target) => target.productCode)).toEqual(existing.map((target) => target.modelCode))
  })
})
