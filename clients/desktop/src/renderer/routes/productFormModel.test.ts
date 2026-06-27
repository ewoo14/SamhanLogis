import { describe, expect, it } from 'vitest'
import {
  applyProductCategoryDefaults,
  buildCreateProductRequest,
  buildSpecs,
  buildUpdateProductRequest,
  composeDimensionSpecValue,
  composeRangeSpecValue,
  editSeedToProductFormValues,
  initialProductFormValues,
  isSingleNumeric,
  moveSpecRow,
  specPatchForKeyChange,
  splitRangeSpecValue,
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
  specs: [
    { specKey: '냉방능력, kW', specValue: '6.0', unit: 'kW', valueType: 'NUMBER' },
    { specKey: '전원', specValue: '220V', unit: '', valueType: 'TEXT' },
    { specKey: ' ', specValue: 'ignored', unit: '', valueType: 'TEXT' },
    { specKey: '크기', specValue: ' ', unit: 'mm', valueType: 'DIMENSION' },
  ],
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
      unit: 'EA',
      releasePrice: '1000000',
      deliveryPrice: '30000',
      goodsType: 'GOODS',
      specs: [
        { specKey: '냉방능력, kW', specValue: '6.0', unit: 'kW' },
        { specKey: '전원', specValue: '220V', unit: null },
      ],
    })
  })

  it('템플릿에 없는 커스텀 사양명을 그대로 보존한다', () => {
    const request = buildCreateProductRequest({
      ...baseForm,
      specs: [
        { specKey: '커스텀특수사양', specValue: '현장별 별도 협의', unit: '', valueType: 'TEXT' },
      ],
    })

    expect(request.specs).toEqual([
      { specKey: '커스텀특수사양', specValue: '현장별 별도 협의', unit: null },
    ])
  })

  it('DIMENSION 사양은 숫자 3분할 값을 x 조인 문자열과 단위로 저장한다', () => {
    expect(composeDimensionSpecValue('947', '365', '947')).toBe('947x365x947')
    expect(buildSpecs({
      ...baseForm,
      specs: [
        { specKey: '제품크기, mm', specValue: '947 x 365 x 947', unit: 'mm', valueType: 'DIMENSION' },
      ],
    })).toEqual([
      { specKey: '제품크기, mm', specValue: '947x365x947', unit: 'mm' },
    ])
  })

  it('DIMENSION 부분 입력(W/H/D 미완)은 저장에서 제외된다', () => {
    expect(buildSpecs({
      ...baseForm,
      specs: [
        { specKey: '제품크기, mm', specValue: '1800x', unit: 'mm', valueType: 'DIMENSION' }, // W만
        { specKey: '포장치수, mm', specValue: '1800x2370x', unit: 'mm', valueType: 'DIMENSION' }, // W·H만
        { specKey: '냉방능력, kW', specValue: '6.0', unit: 'kW', valueType: 'NUMBER' },
      ],
    })).toEqual([
      { specKey: '냉방능력, kW', specValue: '6.0', unit: 'kW' }, // 완전 입력만 저장(깨진 차원 값 미영속)
    ])
  })

  it('RANGE 사양은 최소/정격/최대 3분할 값을 슬래시 조인 문자열과 단위로 저장한다', () => {
    expect(composeRangeSpecValue('1.80', '5.20', '7.20')).toBe('1.80/5.20/7.20')
    expect(splitRangeSpecValue(' 1.80 / 5.20 / 7.20 ')).toEqual(['1.80', '5.20', '7.20'])
    expect(buildSpecs({
      ...baseForm,
      specs: [
        { specKey: '냉방능력, kW', specValue: '1.80 / 5.20 / 7.20', unit: 'kW', valueType: 'RANGE' },
      ],
    })).toEqual([
      { specKey: '냉방능력, kW', specValue: '1.80/5.20/7.20', unit: 'kW' },
    ])
  })

  it('RANGE 부분 입력은 입력된 값만 / 결합(최소 미입력 시 최소 없이)', () => {
    expect(buildSpecs({
      ...baseForm,
      specs: [
        { specKey: '냉방능력, kW', specValue: '/5.20/7.20', unit: 'kW', valueType: 'RANGE' }, // 최소 미입력 → 최소 없이
        { specKey: '난방능력, kW', specValue: '1.80/', unit: 'kW', valueType: 'RANGE' }, // 최소만
        { specKey: '냉방소비전력, kW', specValue: '//', unit: 'kW', valueType: 'RANGE' }, // 모두 비면 제외
      ],
    })).toEqual([
      { specKey: '냉방능력, kW', specValue: '5.20/7.20', unit: 'kW' }, // 최소 없이 정격/최대
      { specKey: '난방능력, kW', specValue: '1.80', unit: 'kW' }, // 입력된 값만
    ])
  })

  it('사양 배열 순서 변경은 저장 요청 순서로 보존된다', () => {
    const moved = moveSpecRow([
      { specKey: '배관경', specValue: '6/12', unit: '', valueType: 'TEXT' },
      { specKey: '제품크기, mm', specValue: '947x365x947', unit: 'mm', valueType: 'DIMENSION' },
      { specKey: '냉방능력, kW', specValue: '6.0', unit: 'kW', valueType: 'NUMBER' },
    ], 2, 0)

    expect(buildSpecs({ ...baseForm, specs: moved }).map((spec) => spec.specKey)).toEqual([
      '냉방능력, kW',
      '배관경',
      '제품크기, mm',
    ])
  })

  it('사양명 자유편집은 기존 valueType/unit/specValue 를 보존한다', () => {
    const current = { specKey: '냉방능력, kW', specValue: '6.0', unit: 'kW', valueType: 'NUMBER' as const }

    expect({ ...current, ...specPatchForKeyChange(current, '냉방능력, kW 특주', undefined) }).toEqual({
      specKey: '냉방능력, kW 특주',
      specValue: '6.0',
      unit: 'kW',
      valueType: 'NUMBER',
    })
  })

  it('NUMBER reconcile 허용 여부는 빈 값과 단일 숫자만 true 로 판단한다', () => {
    expect(isSingleNumeric('29.0')).toBe(true)
    expect(isSingleNumeric('')).toBe(true)
    expect(isSingleNumeric('1 / 2 / 3')).toBe(false)
    expect(isSingleNumeric('abc')).toBe(false)
  })

  it('동일 valueType 템플릿 재선택은 값을 보존하고 valueType 변경만 값을 초기화한다', () => {
    const current = { specKey: '냉방능력, kW', specValue: '6.0', unit: 'kW', valueType: 'NUMBER' as const }

    expect({
      ...current,
      ...specPatchForKeyChange(current, '난방능력, kW', {
        specKey: '난방능력, kW',
        defaultUnit: 'kW',
        valueType: 'NUMBER',
      }),
    }).toEqual({
      specKey: '난방능력, kW',
      specValue: '6.0',
      unit: 'kW',
      valueType: 'NUMBER',
    })

    expect({
      ...current,
      ...specPatchForKeyChange(current, '제품크기, mm', {
        specKey: '제품크기, mm',
        defaultUnit: 'mm',
        valueType: 'DIMENSION',
      }),
    }).toEqual({
      specKey: '제품크기, mm',
      specValue: '',
      unit: 'mm',
      valueType: 'DIMENSION',
    })
  })

  it('NUMBER 템플릿이라도 legacy 다중값은 TEXT 로 유지한다', () => {
    const current = { specKey: '능력', specValue: '688 / 0.8', unit: '', valueType: 'TEXT' as const }

    expect({
      ...current,
      ...specPatchForKeyChange(current, '능력', {
        specKey: '능력',
        defaultUnit: '',
        valueType: 'NUMBER',
      }),
    }).toEqual({
      specKey: '능력',
      specValue: '688 / 0.8',
      unit: '',
      valueType: 'TEXT',
    })
  })

  it('SET 선택 시 bundleMode 를 포함한다', () => {
    const request = buildCreateProductRequest({
      ...baseForm,
      itemKind: 'SET',
      productCategory: 'SINGLE_SET',
      bundleMode: 'EXPAND',
    })

    expect(request.itemKind).toBe('SET')
    expect(request.bundleMode).toBe('EXPAND')
  })

  it('MATERIAL 내부 분류 선택은 비상품 자재 기본값을 적용한다', () => {
    const values = applyProductCategoryDefaults({
      ...baseForm,
      productCategory: 'SINGLE_PART',
      goodsType: 'GOODS',
      unit: '',
    }, 'MATERIAL')

    expect(values.productCategory).toBe('MATERIAL')
    expect(values.goodsType).toBe('NON_GOODS')
    expect(values.unit).toBe('EA')
    expect(buildCreateProductRequest(values)).toMatchObject({
      productCategory: 'MATERIAL',
      goodsType: 'NON_GOODS',
      unit: 'EA',
    })
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
      unit: 'EA',
      releasePrice: '1000000',
      deliveryPrice: '30000',
      goodsType: 'GOODS',
      specs: [
        { specKey: '냉방능력, kW', specValue: '6.0', unit: 'kW' },
        { specKey: '전원', specValue: '220V', unit: null },
      ],
    })
  })

  it('edit seed 는 legacy SET_COMPONENT 상세 응답도 단일 품목으로 열고 제품 쪽 부모/구성 분류를 비운다', () => {
    const values = editSeedToProductFormValues({
      summary: {
        id: 'product-id',
        name: '실내기',
        modelName: 'IDU-001',
        productCode: null,
        categoryId: baseForm.categoryId,
        sellingPrice: '1200000',
        status: 'ACTIVE',
        goods: true,
        modelCode: 'IDU-001',
        productType: 'SINGLE',
      },
      detail: {
        id: 'product-id',
        name: '실내기',
        modelName: 'IDU-001',
        modelCode: 'IDU-001',
        categoryId: baseForm.categoryId,
        categoryName: '벽걸이형',
        sellingPrice: '1200000',
        purchasePrice: '900000',
        currency: 'KRW',
        tags: null,
        description: null,
        itemKind: 'SET_COMPONENT',
        productCategory: 'COMMERCIAL_PART',
        bundleMode: null,
        parentSetModelCode: 'SET-001',
        componentKind: 'INDOOR',
        unit: 'SET',
        releasePrice: '1000000',
        deliveryPrice: '30000',
        goodsType: 'NON_GOODS',
        specs: [
          { id: 'spec-1', specKey: '냉방능력, kW', specValue: '5.2', unit: 'kW', displayOrder: 1 },
          { id: 'spec-2', specKey: '전원', specValue: '220V', unit: null, displayOrder: 2 },
        ],
      },
      catalog: {
        modelCode: 'IDU-001',
        name: '실내기',
        usageScope: 'NONE',
        estimateCategory: null,
        productCategory: 'COMMERCIAL_PART',
        usageScopeManual: false,
        displayOrder: null,
        releasePrice: 1,
        deliveryPrice: 2,
        productType: 'SINGLE',
        componentCount: 0,
      },
    })

    expect(values.itemKind).toBe('GENERAL')
    expect(values.productCategory).toBe('COMMERCIAL_PART')
    expect(values).not.toHaveProperty('parentSetModelCode')
    expect(values).not.toHaveProperty('componentKind')
    expect(values.unit).toBe('SET')
    expect(values.goodsType).toBe('NON_GOODS')
    expect(values.specs).toEqual([
      { specKey: '냉방능력, kW', specValue: '5.2', unit: 'kW', valueType: 'TEXT' },
      { specKey: '전원', specValue: '220V', unit: '', valueType: 'TEXT' },
    ])
  })
})
