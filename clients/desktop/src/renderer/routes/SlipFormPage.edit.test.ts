import { describe, expect, it } from 'vitest'
import {
  buildSalesSlipUpdateRequest,
  hydrateSalesSlipEditLines,
  isSalesSlipEditable,
} from './SlipFormPage'

describe('SlipFormPage 기존 판매전표 편집 계약', () => {
  it('편집 저장 payload는 확정 라인을 PUT에 포함하고 trailing 빈행은 제외한다', () => {
    const payload = buildSalesSlipUpdateRequest({
      updatedAt: '2026-08-05T00:00:00Z',
      partnerId: 'partner-1',
      partnerName: '거래처 A',
      memo: '수정 메모',
      lines: [
        {
          id: 'server-line-1',
          productId: 'product-1',
          modelName: 'MODEL-1',
          productName: '품목 1',
          specification: '',
          quantity: '2',
          unitPrice: '1100',
          supplyAmount: '2000',
          vatAmount: '200',
          lineTotal: '2200',
          authority: 'PRICE',
          vatWarning: false,
          priceSource: null,
          catalogUnitPrice: null,
          priceMemoryUpdatedAt: null,
          lookupError: null,
          lookupLoading: false,
          productType: null,
          modelCode: null,
        },
        {
          id: 'tmp-1',
          productId: null,
          modelName: '',
          productName: '',
          specification: '',
          quantity: '1',
          unitPrice: '0',
          supplyAmount: '0',
          vatAmount: '0',
          lineTotal: '0',
          authority: 'PRICE',
          vatWarning: false,
          priceSource: null,
          catalogUnitPrice: null,
          priceMemoryUpdatedAt: null,
          lookupError: null,
          lookupLoading: false,
          productType: null,
          modelCode: null,
        },
      ],
    })

    expect(payload.lines).toEqual([
      expect.objectContaining({
        lineId: 'server-line-1',
        productId: 'product-1',
        quantity: 2,
        unitPrice: '1100',
      }),
    ])
  })

  it('편집 hydrate 결과에는 항상 trailing 빈행이 남는다', () => {
    const lines = hydrateSalesSlipEditLines([
      {
        id: 'server-line-1',
        productId: 'product-1',
        modelName: 'MODEL-1',
        productName: '품목 1',
        specification: null,
        quantity: 1,
        unitPrice: '1100',
        lineTotal: '1100',
        note: null,
        supplyAmount: '1000',
        vatAmount: '100',
      },
    ])

    expect(lines).toHaveLength(2)
    expect(lines.at(-1)?.productId).toBeNull()
  })

  it('편집 가능 상태는 DRAFT와 SAVED뿐이다', () => {
    expect(isSalesSlipEditable('DRAFT')).toBe(true)
    expect(isSalesSlipEditable('SAVED')).toBe(true)
    expect(isSalesSlipEditable('CONFIRMED')).toBe(false)
  })
})
