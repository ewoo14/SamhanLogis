import { describe, expect, it } from 'vitest'
import { editLineVat, editSlipLineAmount, recalculateLineVat, type LineVatAuthority } from './lineVat'

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

// ────────────────────────────────────────────────────────────────────────────
// #902 금액 열 편집 정책 — 개발책임자 결정(2026-07-25, 정정 포함) RED-first 가드.
//
// editLineVat/recalculateLineVat(위 테스트 전부)는 변경하지 않는다 — 견적(EstimateFormPage)·
// 전표 상세(SlipDetailPage)가 그 함수들을 원래 방향(SUPPLY 편집 시 부가세 10% 재계산 +
// 단가 역산)으로 계속 쓰기 때문(P5). 전표(SlipFormPage) 전용 정책은 별도 함수
// editSlipLineAmount 로 분리한다 — 공유 분기를 건드리지 않아 다른 화면에 영향이 없다.
//
// 정책(정정 반영):
//   P4: 공급가액·부가세를 편집해도 단가는 결코 바뀌지 않는다(역산 금지).
//   P6: 공급가액을 편집해도 부가세는 그대로, 부가세를 편집해도 공급가액은 그대로 —
//       어느 쪽을 바꾸든 합계만(공급가액+부가세) 재계산된다.
// ────────────────────────────────────────────────────────────────────────────
describe('editSlipLineAmount — 전표 전용 금액 편집 정책(#902 P4/P6, 2026-07-25 결정)', () => {
  it('P4: 공급가액을 편집해도 단가는 바뀌지 않는다(역산 금지)', () => {
    const before = { quantity: 2, unitPrice: '11000', supplyAmount: '20000', vatAmount: '2000', lineTotal: '22000' }
    const after = editSlipLineAmount(before, 'SUPPLY', '50000')

    expect(after.unitPrice).toBe('11000')
  })

  it('P4: 부가세를 편집해도 단가는 바뀌지 않는다(역산 금지)', () => {
    const before = { quantity: 2, unitPrice: '11000', supplyAmount: '20000', vatAmount: '2000', lineTotal: '22000' }
    const after = editSlipLineAmount(before, 'VAT', '7000')

    expect(after.unitPrice).toBe('11000')
  })

  it('P6: 공급가액을 편집해도 부가세는 그대로다 — 합계만 재계산된다', () => {
    const before = { quantity: 2, unitPrice: '11000', supplyAmount: '20000', vatAmount: '2000', lineTotal: '22000' }
    const after = editSlipLineAmount(before, 'SUPPLY', '50000')

    expect(after.supplyAmount).toBe('50000')
    expect(after.vatAmount).toBe('2000') // 유지 — 10% 재계산 금지
    expect(after.lineTotal).toBe('52000') // 50000 + 2000
  })

  it('P6: 부가세를 편집해도 공급가액은 그대로다 — 합계만 재계산된다', () => {
    const before = { quantity: 2, unitPrice: '11000', supplyAmount: '20000', vatAmount: '2000', lineTotal: '22000' }
    const after = editSlipLineAmount(before, 'VAT', '7000')

    expect(after.vatAmount).toBe('7000')
    expect(after.supplyAmount).toBe('20000') // 유지
    expect(after.lineTotal).toBe('27000') // 20000 + 7000
  })

  it('P2 회귀 가드: 두 편집 모두 공급가액+부가세=합계 항등식을 보존한다', () => {
    const before = { quantity: 1, unitPrice: '0', supplyAmount: '0', vatAmount: '0', lineTotal: '0' }
    const supply = editSlipLineAmount(before, 'SUPPLY', '100005')
    const vat = editSlipLineAmount(supply, 'VAT', '9999')

    expect(BigInt(supply.supplyAmount) + BigInt(supply.vatAmount)).toBe(BigInt(supply.lineTotal))
    expect(BigInt(vat.supplyAmount) + BigInt(vat.vatAmount)).toBe(BigInt(vat.lineTotal))
  })

  it('authority 태그를 편집한 열로 반영한다', () => {
    const before = { quantity: 1, unitPrice: '0', supplyAmount: '0', vatAmount: '0', lineTotal: '0' }

    expect(editSlipLineAmount(before, 'SUPPLY', '100').authority).toBe('SUPPLY')
    expect(editSlipLineAmount(before, 'VAT', '100').authority).toBe('VAT')
  })
})
