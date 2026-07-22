import { describe, expect, it } from 'vitest'
import { editLineVat, recalculateLineVat, type LineVatAuthority } from './lineVat'

describe('lineVat — 품목행 권위 열 계산', () => {
  it('끝수가 있는 동일 공급가액에서 세금계산서 절사와 전표 계산이 어긋난다 (RED)', () => {
    const supplyAmount = 100005
    const taxInvoiceVat = Math.trunc(supplyAmount * 0.1)
    const slipVat = recalculateLineVat({
      quantity: 1,
      unitPrice: String(supplyAmount),
      supplyAmount: String(supplyAmount),
      vatAmount: '0',
      lineTotal: '0',
    }, 'SUPPLY').vatAmount

    expect(slipVat).toBe(String(taxInvoiceVat))
  })

  it.each([
    ['SUPPLY', '100005', '10000', '110005'],
    ['SUPPLY', '5', '0', '5'],
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

  // BLOCKING-2 (#824 R1): PRICE 경로가 HALF_UP(divideHalfUp)을 써 BE VatAmountCalculator
  // (0 방향 절사·DOWN)와 어긋났다. 100005 계열 fixture 는 ÷11 나머지가 5.5 미만이라
  // HALF_UP·DOWN 이 같은 값을 내는 무감도 fixture — 실제로 갈리는 단가만 RED 를 잡는다.
  it.each([
    // [unitPrice, quantity, 기대 supply(BE DOWN), 기대 vat]
    ['7900', 1, '7181', '719'],
    ['100', 1, '90', '10'],
    ['1234500', 1, '1122272', '112228'],
  ] as const)('PRICE 경로 단가 %s 는 BE 와 같은 절사(DOWN) 공급가액 %s 를 낸다', (unitPrice, quantity, expectedSupply, expectedVat) => {
    const line = recalculateLineVat({
      quantity,
      unitPrice,
      supplyAmount: '0',
      vatAmount: '0',
      lineTotal: '0',
    }, 'PRICE')

    expect(line.supplyAmount).toBe(expectedSupply)
    expect(line.vatAmount).toBe(expectedVat)
    // 항등식은 항상 유지되어야 한다(반올림 지점과 무관).
    expect(BigInt(line.supplyAmount) + BigInt(line.vatAmount)).toBe(BigInt(line.lineTotal))
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
