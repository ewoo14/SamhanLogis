import { describe, expect, it } from 'vitest'
import { vatExclusiveOf, vatInclusiveOf } from './vatPrice'
import { supplyFromVatInclusive } from './vatRounding'

describe('vatPrice — 수정화면(VAT제외) ↔ 기억/카탈로그(VAT포함) 변환 (BE 미러)', () => {
  it('vatExclusiveOf: 기억 854,700(포함) → 777,000(제외) — 라이브 QA 실측 케이스 왕복 무손실', () => {
    expect(vatExclusiveOf('854700')).toBe('777000')
    // 왕복: BE collectPriceMemory(×1.1 scale2 HALF_UP)와 동일 → 원값 복원
    expect(vatInclusiveOf('777000')).toBe('854700')
  })

  it('vatExclusiveOf: 기억 500,000(포함) → 454,545(원 단위 HALF_UP) — 드리프트 fix 케이스', () => {
    // 종전 결함: 500,000 을 제외 필드에 그대로 기입 → 저장 시 ×1.1 = 550,000 (10% 팽창).
    // fix: 공용 VAT 포함 분리기와 같은 ÷1.1 HALF_UP → 454,545.
    expect(vatExclusiveOf('500000')).toBe(String(supplyFromVatInclusive(500000n)))
    // 첫 저장 후 기억 = 454,545 × 1.1 = 499,999.5 (원 미만 수렴, 이후 고정 — 복리 팽창 아님)
    expect(vatInclusiveOf('454545')).toBe('499999.5')
    // 수렴 확인: 499,999.5 → 다시 454,545 (고정점)
    expect(vatExclusiveOf('499999.5')).toBe('454545')
  })

  it('vatInclusiveOf: BE setScale(2, HALF_UP) 미러 — 소수 2자리 유지', () => {
    expect(vatInclusiveOf('1850000')).toBe('2035000')
    expect(vatInclusiveOf(0)).toBe('0')
  })

  it('십진 경계도 이진 부동소수 오차 없이 BE BigDecimal HALF_UP 과 일치한다', () => {
    // 1.15 × 1.1 = 1.265 → scale(2, HALF_UP) = 1.27.
    // Math.round(value * 100)은 JS 이진 표현에서 126.4999…가 되어 1.26으로 틀릴 수 있다.
    expect(vatInclusiveOf('1.15')).toBe('1.27')
    expect(vatInclusiveOf('2.15')).toBe('2.37')
    expect(vatInclusiveOf('-1.15')).toBe('-1.27')
  })

  it('경계: 0 원·number 입력 처리', () => {
    expect(vatExclusiveOf(0)).toBe('0')
    expect(vatExclusiveOf(854700)).toBe('777000')
    expect(vatInclusiveOf(777000)).toBe('854700')
  })

  it('비수치 입력은 빈 문자열(방어) — 호출자가 skip 판단', () => {
    expect(vatExclusiveOf('')).toBe('0') // Number('') = 0 — 빈 문자열은 0 취급(Number 관례)
    expect(vatExclusiveOf('abc')).toBe('')
    expect(vatInclusiveOf('abc')).toBe('')
  })

  it('가격기억 VAT 포함 7,900원도 레거시 HALF_UP 계약을 사용한다', () => {
    expect(vatExclusiveOf('7900')).toBe(String(supplyFromVatInclusive(7900n)))
    expect(vatExclusiveOf('7900')).toBe('7182')
  })
})
