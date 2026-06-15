import { describe, expect, it } from 'vitest'
import {
  buildCreateProductRequest,
  buildUpdateProductRequest,
  initialProductFormValues,
  validateProductForm,
  type ProductFormValues,
} from './productFormModel'

const baseForm: ProductFormValues = {
  ...initialProductFormValues(),
  name: '천장형 실내기',
  modelName: 'AC-1000',
  categoryId: '11111111-1111-1111-1111-111111111111',
  sellingPrice: '1200000',
  purchasePrice: '900000',
  itemKind: 'GENERAL',
  goodsType: 'GOODS',
  productCategory: 'SINGLE_PART',
  unit: 'EA',
  releasePrice: '1000000',
  deliveryPrice: '30000',
}

describe('productFormModel', () => {
  it('CreateProductRequest 필드명과 값 매핑을 BE DTO 와 동일하게 만든다', () => {
    expect(buildCreateProductRequest(baseForm)).toEqual({
      name: '천장형 실내기',
      modelName: 'AC-1000',
      categoryId: '11111111-1111-1111-1111-111111111111',
      sellingPrice: '1200000',
      purchasePrice: '900000',
      currency: 'KRW',
      tags: {},
      description: null,
      itemKind: 'GENERAL',
      productCategory: 'SINGLE_PART',
      bundleMode: null,
      parentSetModelCode: null,
      componentKind: null,
      unit: 'EA',
      releasePrice: '1000000',
      deliveryPrice: '30000',
      goodsType: 'GOODS',
    })
  })

  it('SET 선택 시 bundleMode 를 포함하고 parentSetModelCode 는 보내지 않는다', () => {
    const request = buildCreateProductRequest({
      ...baseForm,
      itemKind: 'SET',
      productCategory: 'SINGLE_SET',
      bundleMode: 'EXPAND',
      parentSetModelCode: 'IGNORED-PARENT',
    })

    expect(request.itemKind).toBe('SET')
    expect(request.bundleMode).toBe('EXPAND')
    expect(request.parentSetModelCode).toBeNull()
  })

  it('SET_COMPONENT 선택 시 부모 세트 modelCode 와 componentKind 를 포함한다', () => {
    const request = buildCreateProductRequest({
      ...baseForm,
      itemKind: 'SET_COMPONENT',
      parentSetModelCode: 'SET-HM2WAY',
      componentKind: 'INDOOR',
    })

    expect(request.itemKind).toBe('SET_COMPONENT')
    expect(request.parentSetModelCode).toBe('SET-HM2WAY')
    expect(request.componentKind).toBe('INDOOR')
  })

  it('세트구성품은 부모 세트 선택 없이는 저장할 수 없다', () => {
    const errors = validateProductForm({
      ...baseForm,
      itemKind: 'SET_COMPONENT',
      parentSetModelCode: '',
    })

    expect(errors.parentSetModelCode).toBe('부모 세트를 선택해 주세요.')
  })

  it('UpdateProductRequest 는 수정 가능한 필드만 포함하고 가격 필드는 제외한다', () => {
    expect(buildUpdateProductRequest(baseForm)).toEqual({
      name: '천장형 실내기',
      modelName: 'AC-1000',
      categoryId: '11111111-1111-1111-1111-111111111111',
      description: null,
      itemKind: 'GENERAL',
      productCategory: 'SINGLE_PART',
      bundleMode: null,
      parentSetModelCode: null,
      componentKind: null,
      unit: 'EA',
      releasePrice: '1000000',
      deliveryPrice: '30000',
      goodsType: 'GOODS',
    })
  })
})
