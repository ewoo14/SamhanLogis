import { describe, expect, it } from 'vitest'
import { createBundleInstanceKey } from '../api/slip'
import {
  buildDetailLinePayload,
  computeDetailVatChange,
  computeDetailQuantityChange,
  toPurchaseEditLines,
} from './SlipDetailPage'

describe('PR #1131 R7 RED-A-2 — 기존 BUNDLE 수량 편집의 VAT 권위 경계', () => {
  it('구성품 수량만 바꾸면 hydrate가 만든 S/V/T를 권위 payload로 보내지 않는다', () => {
    const slip = {
      lines: [{
        id: 'bundle-line-1',
        productId: 'product-1',
        productName: '구성품 1',
        modelName: 'COMP-1',
        parentSetModel: 'BUNDLE-R7',
        setHead: false,
        quantity: 1,
        unitPrice: '100000',
        unitPriceWithVat: '110000',
        supplyAmount: '100000',
        vatAmount: '10000',
        lineTotal: '110000',
      }],
    } as never

    const hydrated = toPurchaseEditLines(slip)[0]!
    const changed = {
      ...hydrated,
      ...computeDetailQuantityChange(hydrated, '2'),
    }
    const payload = buildDetailLinePayload(changed)

    expect(payload.quantity).toBe(2)
    expect(hydrated.vatDirty).toBe(false)
    expect(payload.supplyAmount).toBeUndefined()
    expect(payload.vatAmount).toBeUndefined()
    expect(payload.lineTotalWithVat).toBeUndefined()
  })

  it('직접 공급가액 셀을 편집할 때만 VAT 권위와 S/V/T 전송을 켠다', () => {
    const slip = {
      lines: [{
        id: 'bundle-line-1',
        productId: 'product-1',
        productName: '구성품 1',
        modelName: 'COMP-1',
        parentSetModel: 'BUNDLE-R7',
        setHead: false,
        quantity: 1,
        unitPrice: '100000',
        unitPriceWithVat: '110000',
        supplyAmount: '100000',
        vatAmount: '10000',
        lineTotal: '110000',
      }],
    } as never

    const hydrated = toPurchaseEditLines(slip)[0]!
    const changed = { ...hydrated, ...computeDetailVatChange(hydrated, 'SUPPLY', '120000') }
    const payload = buildDetailLinePayload(changed)

    expect(changed.vatDirty).toBe(true)
    expect(payload.supplyAmount).toBeDefined()
    expect(payload.vatAmount).toBeDefined()
    expect(payload.lineTotalWithVat).toBeDefined()
  })

  it('과거 직접 금액 편집 행은 표식이 없는 legacy 여도 저장 S/V/T를 보존한다', () => {
    const slip = {
      lines: [{
        id: 'flat-line-1',
        productId: 'product-1',
        productName: '품목 1',
        modelName: 'ITEM-1',
        quantity: 1,
        unitPrice: '100000',
        unitPriceWithVat: '100000',
        supplyAmount: '100000',
        vatAmount: '0',
        lineTotal: '100000',
      }],
    } as never

    const hydrated = toPurchaseEditLines(slip)[0]!
    const payload = buildDetailLinePayload(hydrated)

    expect(hydrated.vatDirty).toBe(true)
    expect(payload.supplyAmount).toBe('100000')
    expect(payload.vatAmount).toBe('0')
    expect(payload.lineTotalWithVat).toBe('100000')
  })

  it('동일 parentSetModel의 명시적 instanceKey는 다른 행 삭제 후에도 남은 인스턴스에서 유지된다', () => {
    const slip = {
      lines: [1, 2].map((index) => ({
        id: `bundle-line-${index}`,
        productId: `product-${index}`,
        productName: `구성품 ${index}`,
        modelName: `COMP-${index}`,
        parentSetModel: 'BUNDLE-R7',
        setHead: index === 1,
        quantity: 1,
        unitPrice: '100000',
        setOptions: { instanceKey: `instance-${index}` },
        lineTotal: '110000',
      })),
    } as never

    const remaining = toPurchaseEditLines(slip).filter((line) => line.lineId === 'bundle-line-2')
    expect(remaining[0]!.bundleInstanceKey).toBe('instance-2')
    expect(buildDetailLinePayload(remaining[0]!).setOptions?.instanceKey).toBe('instance-2')
  })

  it('협업 세션에서 새로 추가한 두 BUNDLE 인스턴스는 서로 다른 key를 발급한다', () => {
    expect(createBundleInstanceKey()).not.toBe(createBundleInstanceKey())
  })
})
