import { describe, expect, it } from 'vitest'
import { editLineVat, recalculateLineVat, type LineVatAuthority } from './lineVat'

describe('lineVat — 품목행 권위 열 계산', () => {
  it.each([
    ['SUPPLY', '100005', '10001', '110006'],
    ['SUPPLY', '5', '1', '6'],
  ] as const)('%s 편집은 끝수에서도 공급+부가세=합계를 보장한다', (authority, value, vat, total) => {
    const line = editLineVat({ quantity: 1, unitPrice: '0', supplyAmount: '0', vatAmount: '0', lineTotal: '0' }, authority, value)

    expect(line.supplyAmount).toBe(value)
    expect(line.vatAmount).toBe(vat)
    expect(line.lineTotal).toBe(total)
    expect(BigInt(line.supplyAmount) + BigInt(line.vatAmount)).toBe(BigInt(line.lineTotal))
  })

  it('부가세 0 직접 입력은 경고 상태를 만든다', () => {
    const line = editLineVat({ quantity: 1, unitPrice: '0', supplyAmount: '100', vatAmount: '10', lineTotal: '110' }, 'VAT', '0')

    expect(line.vatAmount).toBe('0')
    expect(line.lineTotal).toBe('100')
    expect(line.vatWarning).toBe(true)
  })

  it('단가→공급가액→부가세→합계 권위 전환을 순서대로 보존한다', () => {
    const price = recalculateLineVat({ quantity: 2, unitPrice: '1100', supplyAmount: '0', vatAmount: '0', lineTotal: '0' }, 'PRICE')
    const supply = editLineVat(price, 'SUPPLY', '100005')
    const vat = editLineVat(supply, 'VAT', '9999')
    const total = editLineVat(vat, 'TOTAL', '110004')

    expect([price, supply, vat, total].map(line => line.authority)).toEqual(['PRICE', 'SUPPLY', 'VAT', 'TOTAL'] satisfies LineVatAuthority[])
    for (const line of [price, supply, vat, total]) {
      expect(BigInt(line.supplyAmount) + BigInt(line.vatAmount)).toBe(BigInt(line.lineTotal))
    }
  })
})
