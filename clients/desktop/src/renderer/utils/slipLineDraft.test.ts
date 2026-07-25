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

/**
 * #902 R3 — PM 추가지시(2차 적대검증 CODEX SOL 도달가능 결함 5건 중 S1·S2·S3·S4).
 *
 * 공통 뿌리: isLineContentPristine/isLineContentEqual 의 "표시상 동일" 판정이 Number()로
 * 접는데, 화면(LineRow.tsx)은 원문 문자열("01") 또는 Number() 변환 그대로("∞")를 보여줘
 * 판정과 실제 표시가 어긋난다. 판정이 참조하는 "표시"를 화면과 일치시켜 고친다.
 */
describe('isLineContentPristine/Equal — 판정=표시 정합 회귀 가드(S1 수량 · S3 극단값)', () => {
  // S1: "01"을 Number()로 접으면 1과 같지만, 화면(<input value={quantity}>)은 '01'을 그대로
  // 보여준다 — 표시상 동일이 아니므로 pristine/equal 모두 아니어야 한다.
  it('수량 "01"은 pristine 기본값 "1"과 표시상 다르다(S1)', () => {
    expect(isLineContentPristine({ ...pristine(), quantity: '01' })).toBe(false)
  })

  it('수량 "01"과 "1"은 표시상 달라 자동증식 트리거 대상이다(S1)', () => {
    expect(isLineContentEqual(pristine(), { ...pristine(), quantity: '01' })).toBe(false)
  })

  it('수량 "007"과 "07"도 표시상 다르다(S1 계열)', () => {
    expect(isLineContentEqual({ ...pristine(), quantity: '007' }, { ...pristine(), quantity: '07' })).toBe(false)
  })

  // S3: 309자리 숫자는 Number() 변환 시 Infinity → 화면(priceDisplay)엔 "∞"로 보인다.
  // 종전엔 이 비교 함수가 non-finite 를 0 으로 접어 "0(pristine)과 동일"로 오판했다.
  it('309자리 단가는 Number() 로 Infinity 가 된다(전제 확인)', () => {
    expect(Number.isFinite(Number('9'.repeat(309)))).toBe(false)
  })

  it('309자리 단가는 화면에 "∞"로 보이므로 pristine 이 아니다(S3)', () => {
    expect(isLineContentPristine({ ...pristine(), unitPrice: '9'.repeat(309) })).toBe(false)
  })

  it('309자리 단가는 "0"과 표시상 달라 자동증식 트리거 대상이다(S3)', () => {
    expect(isLineContentEqual(pristine(), { ...pristine(), unitPrice: '9'.repeat(309) })).toBe(false)
  })

  // SOL 이 이미 "결함 없음"으로 확인한 케이스 — 회귀 가드(화면 표시가 전부 '0'으로 접힘).
  it.each(['', '0', '00', '0.0', ' 0 '])('단가 %j 는 여전히 0 과 동일(pristine) — 결함 아님', (raw) => {
    expect(isLineContentPristine({ ...pristine(), unitPrice: raw })).toBe(true)
  })
})

// S2: U+200B(zero-width space) 등은 렌더 폭이 0 이라 화면엔 "비어 보이는" 입력이다.
// trim() 만으로는 제거되지 않아, 화면은 비어 있는데 "입력함"으로 오판(유령 입력)한다.
describe('isLineContentPristine/Equal — 폭 없는 문자 유령 입력 가드(S2)', () => {
  // 소스에 폭 없는 문자를 직접 심으면 에디터/리뷰에서 육안 확인이 불가능하므로
  // String.fromCharCode 로 코드포인트를 명시한다(가독성·감사가능성).
  const ZWSP = String.fromCharCode(0x200b) // zero-width space — 렌더 폭 0.
  const ZWNJ_BOM_WORDJOINER = [0x200c, 0xfeff, 0x2060].map((cp) => String.fromCharCode(cp)).join('')

  it('규격이 U+200B 로만 채워져도 화면은 비어 보이므로 pristine 이다(S2)', () => {
    expect(isLineContentPristine({ ...pristine(), specification: ZWSP.repeat(2) })).toBe(true)
  })

  it('규격 빈 문자열과 U+200B 는 표시상 동일 — 자동증식되면 안 된다(S2)', () => {
    expect(
      isLineContentEqual(
        { ...pristine(), specification: '' },
        { ...pristine(), specification: ZWSP },
      ),
    ).toBe(true)
  })

  // 결함 계열 전수 sweep — modelName 도 같은 trim() 패턴을 쓴다(같은 유령 입력 표면).
  it('모델명이 폭 없는 문자로만 채워져도 화면은 비어 보이므로 pristine 이다(S2 sweep)', () => {
    expect(isLineContentPristine({ ...pristine(), modelName: ZWNJ_BOM_WORDJOINER })).toBe(true)
  })

  it('일반 공백은 종전처럼 여전히 빈칸으로 접힌다(회귀 가드)', () => {
    expect(isLineContentPristine({ ...pristine(), specification: '   ' })).toBe(true)
  })
})

// S4: BUNDLE 세트 옵션 변경이 비교 대상에서 누락 — 마지막 행에서 옵션만 바꿔도 자동증식이
// 트리거되지 않았다(행 수 5→5). 근거: 종전 ComparableLine 에 setOptions 가 없었다.
describe('isLineContentEqual — BUNDLE 세트 옵션 변경 감지(S4)', () => {
  const bundleBase = () => ({
    ...pristine(),
    productId: 'p-1',
    setOptions: {
      remoteOption: '',
      remoteExcluded: false,
      panelOption: '',
      panelShape360: '',
      materialIncluded: false,
    },
  })

  it('실외기 제외 옵션만 바뀌어도 다르다고 판정한다(S4)', () => {
    const before = bundleBase()
    const after = { ...before, setOptions: { ...before.setOptions, remoteExcluded: true } }
    expect(isLineContentEqual(before, after)).toBe(false)
  })

  it('자재 포함 옵션만 바뀌어도 다르다고 판정한다(S4 sweep)', () => {
    const before = bundleBase()
    const after = { ...before, setOptions: { ...before.setOptions, materialIncluded: true } }
    expect(isLineContentEqual(before, after)).toBe(false)
  })

  it('실외기 교체 모델코드만 바뀌어도 다르다고 판정한다(S4 sweep)', () => {
    const before = bundleBase()
    const after = { ...before, setOptions: { ...before.setOptions, remoteOption: 'RXH-100' } }
    expect(isLineContentEqual(before, after)).toBe(false)
  })

  it('세트 옵션이 실제로 같으면(재편집 무변화) 동일하다', () => {
    const before = bundleBase()
    const after = { ...before, setOptions: { ...before.setOptions } }
    expect(isLineContentEqual(before, after)).toBe(true)
  })

  it('세트 옵션 미보유(undefined) 두 스냅샷은 동일하다(SINGLE 라인 무영향)', () => {
    expect(isLineContentEqual(pristine(), pristine())).toBe(true)
  })
})
