import { describe, expect, it } from 'vitest'
import {
  editLineVat,
  editSlipLineAmount,
  hasVatWarning,
  recalculateLineVat,
  resolveUnitPrices,
  sumDisplayedLineVatAmounts,
  type LineVatAuthority,
} from './lineVat'

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
  it('D-1: 공급가액을 편집한 행의 하단 합계도 행과 같은 S/V/T를 합산한다', () => {
    const before = { quantity: 2, unitPrice: '11000', supplyAmount: '20000', vatAmount: '2000', lineTotal: '22000' }
    const after = editSlipLineAmount(before, 'SUPPLY', '50000')

    expect(sumDisplayedLineVatAmounts([after])).toEqual({ supply: 50000, vat: 2000, total: 52000 })
  })

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

/**
 * 재수렴 3차(#937) 근본수정 — U2, RED-first.
 *
 * <p>{@link hasVatWarning} 는 종전 정확 일치({@code warningFor})를 그대로 썼다 — 공급가액×10%
 * (별도 절사)와 부가세가 한 원이라도 다르면 무조건 경고였다. 그런데 PRICE/TOTAL 권위의 실제
 * 분리 공식({@link supplyFromVatInclusive} 미러, 합계를 ÷1.1·0 방향 절사)은 "공급가액×10%"와
 * 수학적으로 다른 절사 경계를 가져 <b>항상 0 또는 +1원만큼만</b> 어긋난다 — 증명: 합계
 * T=11k+r(0≤r≤10) 로 두면 공급가액 S=10k+⌊10r/11⌋, 부가세 V=T-S=k+r-⌊10r/11⌋, "공급가액의
 * 10%"(별도 절사)는 k 이고, 그 차 r-⌊10r/11⌋ 은 r=0 이면 0, r=1..10 이면 항상 1이다. 실측
 * (2026-07-27, 활성 라인 2,717건 — slip_lines 직접 조회)도 이를 뒷받침한다: 정확히 10% 2,658건,
 * ±1원 잔차 48건(diff=+1 40건·diff=-1 8건 — SUPPLY/VAT 권위 직접편집 등 다른 경로에서도 1원
 * 잔차가 남을 수 있음을 보여준다), 그 밖의 실질 불일치(3,000~18,000원) 11건뿐이었다.
 *
 * <p>이 경계를 반영하지 않고 무조건 엄격 일치를 쓰면(RED) 정상 계산 라인 태반이 거짓 경고를
 * 받고, SlipDetailPage 하이드레이션이 그 결과를 그대로 쓰면(재수렴 3차 U2) 저장 직후
 * 재열기만으로도 경고가 뜬다(#937 R-2 최초 발견) — 그렇다고 무조건 경고를 억제하면(#937 R-2
 * fix) 실질 불일치 11건까지 함께 숨는다(재수렴 3차 신규 발견). ±1원을 허용 오차로 두는 것이
 * 두 결함을 모두 피하는 유일한 경계다.
 */
describe('lineVat — hasVatWarning ±1원 허용 오차 (재수렴 3차 #937 U2, RED-first)', () => {
  it('공급가액의 정확한 10%(diff=0)는 경고하지 않는다', () => {
    expect(hasVatWarning('200000', '20000')).toBe(false)
  })

  it('PRICE/TOTAL 권위 분리 잔차(diff=+1) — ÷1.1 분리가 낳는 구조적 잔차는 경고하지 않는다', () => {
    // 단가 60,000·수량 2 → 합계 120,000 을 ÷1.1 분리한 실측값(#937 R-2 원 재현 시나리오).
    expect(hasVatWarning('109090', '10910')).toBe(false)
    // 단가 100,000(VAT 포함, 수량 3 반영) → 합계 300,000 분리값(재수렴 3차 U1/U3 시나리오).
    expect(hasVatWarning('272727', '27273')).toBe(false)
  })

  it('diff=-1 도 허용 오차다 — SUPPLY/VAT 권위 등 다른 경로의 1원 잔차까지 함께 허용한다(실측 8건)', () => {
    expect(hasVatWarning('100000', '9999')).toBe(false)
  })

  it('diff=±2 부터는 더 이상 허용 오차가 아니다 — 허용 범위의 정확한 경계', () => {
    expect(hasVatWarning('100000', '10002')).toBe(true) // diff=+2
    expect(hasVatWarning('100000', '9998')).toBe(true) // diff=-2
  })

  it('실질 불일치(3,000원·18,000원 — 2026-07-27 slip_lines 실측 11건 중 2건)는 경고한다', () => {
    expect(hasVatWarning('50000', '2000')).toBe(true) // 기대 5,000, 실제 2,000 — 3,000원 과소
    expect(hasVatWarning('200000', '2000')).toBe(true) // 기대 20,000, 실제 2,000 — 18,000원 과소
  })
})

/**
 * 재수렴 4차(#937) 근본수정 — 저장된 두 단가 컬럼의 세금 도메인 해석 (RED-first).
 *
 * <p><b>계약</b>: 전표 라인의 권위값은 공급가액(S)·부가세(V)·수량(Q) 이고, 두 단가 컬럼은
 * 그 권위값의 "1개당 표시"다 — {@code unit_price = S ÷ Q}(VAT 제외), {@code unit_price_with_vat
 * = (S+V) ÷ Q}(VAT 포함). 저장된 컬럼이 이 항등식을 만족하면 사용자가 입력한 원래 값(끝수
 * 포함)을 그대로 쓰고, 만족하지 않으면(=그 컬럼이 다른 세금 도메인 값으로 오염됐다) 권위값에서
 * 유도한다.
 *
 * <p><b>왜 "저장값 우선 + 불일치 시 유도" 인가</b>: 2026-07-27 slip_lines 실측(활성 2,779건)
 * 결과 {@code unit_price × 수량 ≠ 공급가액} 44건, {@code unit_price_with_vat × 수량 ≠ 공급가액+
 * 부가세} 22건이 이미 존재한다. 두 컬럼이 같은 값인 행도 55건 있는데, 그 상태만으로는 "둘 다
 * VAT 포함" 인지 "둘 다 VAT 제외" 인지 구별할 수 없다 — 권위값과 대조해야만 판정된다. 저장값을
 * 무조건 믿으면 그 행들에서 세금 도메인이 뒤집히고(재수렴 4차 진단 ①②③⑤), 반대로 무조건
 * 유도하면 사용자가 입력한 끝수 단가(예: 499,999.5)가 반올림되어 가격기억 왕복이 흔들린다.
 */
describe('lineVat — resolveUnitPrices 저장 단가 컬럼의 세금 도메인 (재수렴 4차 #937, RED-first)', () => {
  it('두 컬럼이 모두 권위값과 정합이면 저장값을 그대로 쓴다', () => {
    expect(resolveUnitPrices({
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: '110000',
      supplyAmount: '200000',
      vatAmount: '20000',
    })).toEqual({ supplyUnit: '100000', inclusiveUnit: '110000' })
  })

  it('⑤ 두 컬럼이 같은 VAT 제외 값인 행 — VAT 포함 단가는 권위값에서 유도한다', () => {
    // 실 DB 재현(2026-07-27 live): main 편집화면 페이로드가 저장한 100000|100000|200000|20000|2.
    // 100,000 × 2 = 200,000 = 공급가액 → VAT 제외 단가는 정합(저장값 유지),
    // 100,000 × 2 = 200,000 ≠ 220,000 = 공급가액+부가세 → VAT 포함 단가는 오염(유도).
    expect(resolveUnitPrices({
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: '100000',
      supplyAmount: '200000',
      vatAmount: '20000',
    })).toEqual({ supplyUnit: '100000', inclusiveUnit: '110000' })
  })

  it('두 컬럼이 같은 VAT 포함 값인 행 — VAT 제외 단가를 권위값에서 유도한다(인쇄 단가×수량=공급가액)', () => {
    // 재수렴 4차 진단 ①②: HEAD 무수정 재저장이 만드는 110000|110000|200000|20000|2.
    expect(resolveUnitPrices({
      quantity: 2,
      unitPrice: '110000',
      unitPriceWithVat: '110000',
      supplyAmount: '200000',
      vatAmount: '20000',
    })).toEqual({ supplyUnit: '100000', inclusiveUnit: '110000' })
  })

  it('끝수 입력 단가는 권위값과 정합인 한 반올림하지 않는다(가격기억 왕복 보존)', () => {
    // 기억 499,999.5 → 수량 1 → 합계 500,000(HALF_UP) → 공급 454,545 / 부가세 45,455.
    expect(resolveUnitPrices({
      quantity: 1,
      unitPrice: '454545',
      unitPriceWithVat: '499999.5',
      supplyAmount: '454545',
      vatAmount: '45455',
    })).toEqual({ supplyUnit: '454545', inclusiveUnit: '499999.5' })
  })

  it('legacy 컬럼 null 은 권위값에서 유도한다', () => {
    expect(resolveUnitPrices({
      quantity: 1,
      unitPrice: null,
      unitPriceWithVat: null,
      supplyAmount: '100000',
      vatAmount: '10000',
    })).toEqual({ supplyUnit: '100000', inclusiveUnit: '110000' })
  })

  it('나눠떨어지지 않는 수량은 BE divide(scale 2, HALF_UP) 와 같은 자릿수로 유도한다', () => {
    expect(resolveUnitPrices({
      quantity: 3,
      unitPrice: null,
      unitPriceWithVat: null,
      supplyAmount: '100005',
      vatAmount: '10001',
    })).toEqual({ supplyUnit: '33335', inclusiveUnit: '36668.67' })
  })

  it('수량 0·비수치 저장값 같은 병리 입력에서도 권위값 유도로 닫는다', () => {
    expect(resolveUnitPrices({
      quantity: 0,
      unitPrice: '',
      unitPriceWithVat: 'abc',
      supplyAmount: '0',
      vatAmount: '0',
    })).toEqual({ supplyUnit: '0', inclusiveUnit: '0' })
  })
})

/**
 * 재수렴 5차(#937) 근본수정 — 저장된 VAT 포함 단가는 사용자 권위 입력이다 (RED-first).
 *
 * <p>재수렴 4차는 두 단가 컬럼을 모두 "권위 금액의 1개당 표시"(파생값)로 보고, 항등식이
 * 깨지면 예외 없이 유도했다. 그런데 {@code unit_price_with_vat} 는 파생값이 아니라 <b>사용자가
 * 화면에 직접 입력한 값</b>이다 — BE 가 {@code createFromAuthoritativeAmounts} 에서 요청 단가를
 * 그대로 각인하고(끝수까지 무손실), {@code collectPriceMemory} 가 가격기억 각인 원천으로 읽는
 * 컬럼도 이것이다. 반면 {@code unit_price} 는 BE 가 {@code S ÷ Q} 로 계산하는 순수 파생값이다.
 *
 * <p>2026-07-25 개발책임자 결정 P4 — <b>"단가는 결코 역산되지 않는다"</b>. 부가세만 편집하면
 * ({@link editSlipLineAmount} — 같은 결정의 P6) 단가는 그대로 두고 S/V 만 바뀌므로 항등식
 * {@code 단가 × 수량 = S + V} 가 <b>정당하게</b> 깨진다. 4차의 판정은 그 정당한 상태와 BE 구
 * 저장이 만든 오염을 구별하지 못해, 부가세만 편집한 라인의 단가를 표시 계층에서 역산했다
 * (라이브 실증 2026-07-27: 사용자 입력 110,000 → 표시 112,500 → 무편집 재저장이 DB 를 112,500
 * 으로 덮음. 실 DB 활성 22행 중 10행에서 11,000 → 26,000, +136%).
 *
 * <p>구별 기준은 <b>저장값이 어느 세금 도메인의 총액과 맞아떨어지는가</b> 다:
 * {@code 저장단가 × 수량 = S} 이면 그 컬럼은 VAT <b>제외</b> 값을 담고 있다(= 구 BE 가 화면
 * 단가를 두 컬럼에 그대로 각인한 오염 — 라이브 실증 {@code 100000|100000|200000|20000|2}),
 * 그 밖에는 사용자 권위 단가로 보존한다. VAT 포함 총액과 맞으면(정상) 물론 그대로 쓴다.
 */
describe('lineVat — resolveUnitPrices 사용자 권위 단가 보존 (재수렴 5차 #937, RED-first)', () => {
  it('D-1 부가세만 편집한 라인 — 사용자 입력 단가를 역산하지 않는다', () => {
    // 라이브 실증: 단가(VAT포함) 110,000 x 2 저장 후 부가세만 20,000 → 25,000.
    // RED(수정 전): inclusiveUnit '112500'((200000+25000)/2) — 사용자가 입력한 적 없는 값.
    expect(resolveUnitPrices({
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: '110000',
      supplyAmount: '200000',
      vatAmount: '25000',
    })).toEqual({ supplyUnit: '100000', inclusiveUnit: '110000' })
  })

  it('실 DB 활성 10행 재현 — 공급가액·부가세를 직접 편집한 라인도 단가가 그대로다', () => {
    // 실 DB(2026/07/25-1 등 10건): 11000|11000|50000|2000|2.
    // 11,000 x 2 = 22,000 은 공급가액(50,000)과도 합계(52,000)와도 다르다 — P4 대상.
    // RED(수정 전): inclusiveUnit '26000'(52000/2) — 저장값 대비 +136%.
    // supplyUnit 은 BE 파생 컬럼이라 항등식(단가 x 수량 = 공급가액)을 지켜 유도한다.
    expect(resolveUnitPrices({
      quantity: 2,
      unitPrice: '11000',
      unitPriceWithVat: '11000',
      supplyAmount: '50000',
      vatAmount: '2000',
    })).toEqual({ supplyUnit: '25000', inclusiveUnit: '11000' })
  })

  it('E2 끝수 단가 + 부가세 편집 — 끝수가 반올림으로 증발하지 않는다', () => {
    // 라이브 실증: 33,333.33 x 3 저장 후 부가세만 9,091 → 12,000.
    // RED(수정 전): inclusiveUnit '34303'((90909+12000)/3).
    expect(resolveUnitPrices({
      quantity: 3,
      unitPrice: '30303',
      unitPriceWithVat: '33333.33',
      supplyAmount: '90909',
      vatAmount: '12000',
    })).toEqual({ supplyUnit: '30303', inclusiveUnit: '33333.33' })
  })

  it('⑤ 회귀 — 저장값이 공급가액 총액과 맞는 행(VAT 제외 오염)은 계속 유도한다', () => {
    // 54,545 x 2 = 109,090 = 공급가액 → 그 컬럼은 VAT 제외 값을 담고 있다(구 BE 각인).
    // 사용자가 실제로 입력한 값은 60,000(= 120,000 / 2)이다.
    expect(resolveUnitPrices({
      quantity: 2,
      unitPrice: '54545',
      unitPriceWithVat: '54545',
      supplyAmount: '109090',
      vatAmount: '10910',
    })).toEqual({ supplyUnit: '54545', inclusiveUnit: '60000' })
  })

  it('부가세 0(면세) 라인 — 공급 총액과 합계가 같아도 저장값을 그대로 쓴다', () => {
    expect(resolveUnitPrices({
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: '100000',
      supplyAmount: '200000',
      vatAmount: '0',
    })).toEqual({ supplyUnit: '100000', inclusiveUnit: '100000' })
  })
})

/**
 * 재수렴 6차(#937) — 개발책임자 결정 A안 "저장 시점에 도메인 기록".
 *
 * <p>판정식으로는 닫히지 않는다는 것이 6라운드로 실증됐다: 기준을 세 번 바꿨지만(동일성 →
 * 항등식 → 공급가액 일치) 오판 표면이 22행 → 10행으로 줄었을 뿐 0 이 되지 않았다. 같은 DB 행
 * {@code 100000|100000|200000|20000|2} 에 대해 <b>구 BE 오염</b>이면 유도(110,000)가,
 * <b>사용자가 "부가세 별도"로 정정한 정당한 상태</b>면 보존(100,000)이 정답인데 두 경우의 저장
 * 상태가 완전히 같다 — DB 에 이를 가르는 정보가 없었다.
 *
 * <p>이제 저장 시점에 {@code unitPriceDomain} 을 남긴다. 이 값이 있으면 <b>휴리스틱을 아예
 * 타지 않는다</b>. 값이 없는 legacy 행만 위 5차 휴리스틱으로 해석한다(개발책임자 결정).
 */
describe('lineVat — resolveUnitPrices 저장 시점 단가 도메인 (재수렴 6차 #937, RED-first)', () => {
  it('D-1R6 — "부가세 별도" 정정 행은 사용자 입력 단가를 그대로 보인다', () => {
    // 라이브 실증(전표 2026/07/27-209): 단가(VAT포함) 100,000 x 2 저장 → 공급가액 200,000 ·
    // 부가세 20,000 으로 정정(P6, 승인된 편집) → DB 100000|100000|200000|20000|2.
    // RED(수정 전): inclusiveUnit '110000' — 사용자가 입력한 적 없는 값(읽기전용 표 실측).
    expect(resolveUnitPrices({
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: '100000',
      supplyAmount: '200000',
      vatAmount: '20000',
      unitPriceDomain: 'VAT_INCLUSIVE',
    })).toEqual({ supplyUnit: '100000', inclusiveUnit: '100000' })
  })

  it('legacy(도메인 null) 동일 좌표는 현행 휴리스틱을 그대로 유지한다 — 개발책임자 결정', () => {
    // 위와 <b>완전히 같은 저장 상태</b>인데 도메인만 없다. 이 행은 구 BE 오염일 수 있으므로
    // 5차 규칙대로 권위 합계에서 유도한다. 두 케이스를 가르는 것은 오직 도메인 기록이다.
    expect(resolveUnitPrices({
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: '100000',
      supplyAmount: '200000',
      vatAmount: '20000',
    })).toEqual({ supplyUnit: '100000', inclusiveUnit: '110000' })
  })

  it('SUPPLY 도메인 — VAT 제외 단가로 저장된 행도 파생 VAT 포함 단가를 그대로 쓴다', () => {
    // create() 평문 경로: unit_price 90,909 가 권위, unit_price_with_vat 는 x1.1 파생값.
    expect(resolveUnitPrices({
      quantity: 2,
      unitPrice: '90909',
      unitPriceWithVat: '99999.90',
      supplyAmount: '181818',
      vatAmount: '18181',
      unitPriceDomain: 'SUPPLY',
    })).toEqual({ supplyUnit: '90909', inclusiveUnit: '99999.90' })
  })

  it('도메인이 있어도 저장 단가가 비어 있으면 legacy 휴리스틱으로 떨어진다', () => {
    // V12 이전 라인처럼 unit_price_with_vat 가 null 이면 기록할 도메인 값 자체가 없다.
    expect(resolveUnitPrices({
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: null,
      supplyAmount: '200000',
      vatAmount: '20000',
      unitPriceDomain: 'VAT_INCLUSIVE',
    })).toEqual({ supplyUnit: '100000', inclusiveUnit: '110000' })
  })

  it('끝수 단가 — 도메인이 있으면 반올림 없이 끝수까지 보존한다', () => {
    expect(resolveUnitPrices({
      quantity: 3,
      unitPrice: '30303',
      unitPriceWithVat: '33333.33',
      supplyAmount: '90909',
      vatAmount: '9091',
      unitPriceDomain: 'VAT_INCLUSIVE',
    })).toEqual({ supplyUnit: '30303', inclusiveUnit: '33333.33' })
  })

  it('알 수 없는 도메인 문자열은 신뢰하지 않고 legacy 휴리스틱으로 떨어진다', () => {
    expect(resolveUnitPrices({
      quantity: 2,
      unitPrice: '100000',
      unitPriceWithVat: '100000',
      supplyAmount: '200000',
      vatAmount: '20000',
      unitPriceDomain: 'MYSTERY',
    })).toEqual({ supplyUnit: '100000', inclusiveUnit: '110000' })
  })
})
