import { describe, expect, it } from 'vitest'
import {
  isLineContentEqual,
  isLineContentPristine,
  lineIncompleteReason,
  willLineBeSaved,
} from './slipLineDraft'

/**
 * #902 R2 8건 결함 리뷰 — 근본원인 회귀 가드.
 *
 * 종전 touchedLineIds(이력 Set)는 "onChange 가 한 번이라도 발화했는가"만 기억해,
 * 값을 원복해도 안내가 남고(D1) 화면상 아무 변화 없는 제스처(단가 셀 Backspace 1회 등)도
 * "입력함"으로 오판했다(D2). 아래는 그 대체 판정(현재 내용만의 순수 함수)의 단위 테스트다.
 */

function pristine() {
  return {
    productId: null as string | null,
    modelName: '',
    specification: '',
    quantity: '1',
    unitPrice: '0',
  }
}

describe('isLineContentPristine — H1 근본 판정(이력이 아닌 현재 내용의 함수)', () => {
  it('새 빈 행 형태는 pristine 이다', () => {
    expect(isLineContentPristine(pristine())).toBe(true)
  })

  it('단가가 빈 문자열이어도 0 과 표시상 동일하므로 pristine 이다(D2 근본)', () => {
    expect(isLineContentPristine({ ...pristine(), unitPrice: '' })).toBe(true)
  })

  it('productId 가 있으면 pristine 이 아니다', () => {
    expect(isLineContentPristine({ ...pristine(), productId: 'p-1' })).toBe(false)
  })

  it('규격에 값이 있으면 pristine 이 아니다', () => {
    expect(isLineContentPristine({ ...pristine(), specification: 'x' })).toBe(false)
  })

  it('규격을 원복하면(D1) 다시 pristine 이다', () => {
    const dirty = { ...pristine(), specification: 'x' }
    const reverted = { ...dirty, specification: '' }
    expect(isLineContentPristine(reverted)).toBe(true)
  })

  it('수량이 빈 문자열이면 pristine(기본값 1)과 다르다 — 화면 표시 자체가 바뀌므로', () => {
    expect(isLineContentPristine({ ...pristine(), quantity: '' })).toBe(false)
  })
})

describe('isLineContentEqual — 자동 증식 트리거(H2) 기준', () => {
  it('단가 0 과 빈 문자열은 표시상 동일하다(D2)', () => {
    expect(isLineContentEqual(pristine(), { ...pristine(), unitPrice: '' })).toBe(true)
  })

  it('수량 1 과 빈 문자열은 다르다(화면 표시 자체가 달라짐)', () => {
    expect(isLineContentEqual(pristine(), { ...pristine(), quantity: '' })).toBe(false)
  })

  it('규격이 다르면 다르다', () => {
    expect(isLineContentEqual(pristine(), { ...pristine(), specification: 'x' })).toBe(false)
  })

  it('이미 손댄 행이라도 실제 값이 같으면 동일하다(재편집 무변화)', () => {
    const a = { ...pristine(), productId: 'p-1', quantity: '3' }
    const b = { ...a }
    expect(isLineContentEqual(a, b)).toBe(true)
  })
})

describe('willLineBeSaved — 기획 동결 판정식(productId && quantity>0)과 항상 일치', () => {
  it.each([
    [null, '1', false],
    ['p-1', '1', true],
    ['p-1', '0', false],
    ['p-1', '-3', false],
    // D8: 현재 판정식은 소수도 유효로 본다 — 그래서 입력 단계 정수화로 별도 차단해야 한다.
    ['p-1', '0.5', true],
  ] as const)('productId=%s quantity=%s → %s', (productId, quantity, expected) => {
    expect(willLineBeSaved({ productId, quantity })).toBe(expected)
  })
})

describe('lineIncompleteReason — 안내 문구 분기(H4) 단일 진실원', () => {
  it('pristine 행은 사유 없음(null)', () => {
    expect(lineIncompleteReason(pristine())).toBeNull()
  })

  it('품목 미선택 + 내용 있음 → NEEDS_PRODUCT', () => {
    expect(lineIncompleteReason({ ...pristine(), quantity: '2' })).toBe('NEEDS_PRODUCT')
  })

  it('품목 선택 + 수량 0 → NEEDS_POSITIVE_QUANTITY', () => {
    expect(lineIncompleteReason({ ...pristine(), productId: 'p-1', quantity: '0' })).toBe(
      'NEEDS_POSITIVE_QUANTITY',
    )
  })

  it('품목 선택 + 수량 음수 → NEEDS_POSITIVE_QUANTITY', () => {
    expect(lineIncompleteReason({ ...pristine(), productId: 'p-1', quantity: '-3' })).toBe(
      'NEEDS_POSITIVE_QUANTITY',
    )
  })

  it('품목 선택 + 수량>0 → 사유 없음(완결, 저장됨)', () => {
    expect(lineIncompleteReason({ ...pristine(), productId: 'p-1', quantity: '1' })).toBeNull()
  })
})
