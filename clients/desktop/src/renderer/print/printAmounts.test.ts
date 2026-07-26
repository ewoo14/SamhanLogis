import { describe, expect, it } from 'vitest'
import { storedLineAmounts, storedLineUnitPrices } from './printAmounts'

describe('저장 권위 금액 인쇄 계약', () => {
  it('저장된 비표준 S/V/T를 재계산하지 않고 그대로 반환한다', () => {
    expect(storedLineAmounts({
      supplyAmount: '100005',
      vatAmount: '9999',
      lineTotal: '110004',
    })).toEqual({ supply: 100005, vat: 9999, total: 110004 })
  })

  it('저장된 비표준 공급가액과 세액의 합계를 인쇄 합계로 사용한다', () => {
    expect(storedLineAmounts({
      supplyAmount: 100000,
      vatAmount: 9999,
      lineTotal: 100000,
    }).total).toBe(109999)
  })

  it('표준 10% 전표도 공급가액과 세액을 더한 합계를 사용한다', () => {
    expect(storedLineAmounts({
      supplyAmount: 100000,
      vatAmount: 10000,
      lineTotal: 100000,
    }).total).toBe(110000)
  })
})

/**
 * 재수렴 4차(#937) 근본수정 — 인쇄 단가의 세금 도메인 (RED-first).
 *
 * <p>세금계산서/매입전표 인쇄의 "단가" 열은 바로 옆 "공급가액" 열과 같은 VAT 제외 도메인이어야
 * 한다 — 사용자가 읽는 항등식이 {@code 단가 × 수량 = 공급가액} 이기 때문이다. 종전에는 저장된
 * {@code unit_price} 컬럼을 그대로 찍었는데, 그 컬럼이 VAT 포함 값으로 오염된 행(2026-07-27
 * 실측 44건)에서 단가만 10% 부풀어 그 항등식이 깨졌다. 거래명세서는 반대로 VAT 포함 도메인이라
 * {@code 단가 × 수량 = 공급가액 + 부가세} 가 성립해야 한다.
 */
describe('인쇄 단가의 세금 도메인 (재수렴 4차 #937, RED-first)', () => {
  it('저장 단가가 권위 금액과 정합이면 그대로 쓴다', () => {
    expect(storedLineUnitPrices({
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: '110000',
      supplyAmount: '200000',
      vatAmount: '20000',
    })).toEqual({ supplyUnit: 100000, inclusiveUnit: 110000 })
  })

  it('VAT 포함 값으로 오염된 unit_price 는 공급가액에서 유도해 단가 x 수량 = 공급가액 을 지킨다', () => {
    const amounts = storedLineUnitPrices({
      quantity: 2,
      unitPrice: '110000',
      unitPriceWithVat: '110000',
      supplyAmount: '200000',
      vatAmount: '20000',
    })

    expect(amounts.supplyUnit).toBe(100000)
    expect(amounts.supplyUnit * 2).toBe(200000)
    expect(amounts.inclusiveUnit * 2).toBe(220000)
  })

  it('VAT 제외 값으로 오염된 unit_price_with_vat 는 거래명세서 단가를 유도한다', () => {
    const amounts = storedLineUnitPrices({
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: '100000',
      supplyAmount: '200000',
      vatAmount: '20000',
    })

    expect(amounts.inclusiveUnit).toBe(110000)
    expect(amounts.inclusiveUnit * 2).toBe(220000)
  })

  it('legacy 라인(권위 금액 일부 null)도 lineTotal 폴백으로 단가를 유도한다', () => {
    expect(storedLineUnitPrices({
      quantity: 2,
      unitPrice: null,
      unitPriceWithVat: null,
      supplyAmount: null,
      vatAmount: null,
      lineTotal: '200000',
    })).toEqual({ supplyUnit: 100000, inclusiveUnit: 110000 })
  })
})

/**
 * 재수렴 5차(#937) 근본수정 — 인쇄도 사용자 권위 단가를 보인다 (RED-first).
 *
 * <p>거래명세서의 "단가" 열은 VAT 포함 도메인이고, 그 값의 원천은 사용자가 화면에 입력한
 * 단가({@code unit_price_with_vat})다. 부가세만 직접 편집해 {@code 단가 x 수량 = 공급가액+부가세}
 * 가 정당하게 깨진 라인에서 재수렴 4차는 그 단가를 역산해(112,500) 사용자가 입력한 적 없는
 * 값을 인쇄했다. 세금계산서/매입전표의 "단가" 열은 반대로 BE 파생 컬럼({@code S ÷ Q})과 같은
 * VAT 제외 도메인이라 종전대로 권위 공급가액에서 유도한다.
 */
describe('인쇄 단가 — 사용자 권위 단가 보존 (재수렴 5차 #937, RED-first)', () => {
  it('부가세만 편집한 라인 — 거래명세서는 사용자 입력 단가를, 세금계산서는 유도 공급단가를 쓴다', () => {
    const amounts = storedLineUnitPrices({
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: '110000',
      supplyAmount: '200000',
      vatAmount: '25000',
    })

    // RED(수정 전): inclusiveUnit 112500.
    expect(amounts.inclusiveUnit).toBe(110000)
    expect(amounts.supplyUnit).toBe(100000)
    expect(amounts.supplyUnit * 2, '세금계산서 단가 x 수량 == 공급가액').toBe(200000)
  })
})
