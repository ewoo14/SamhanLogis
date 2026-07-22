/**
 * 전표 단가 VAT 도메인 변환 — BE slip-service 규약의 FE 미러 (R8 잔여 2 · VAT 드리프트 fix).
 *
 * <p><b>코드로 실증한 세만틱</b> (2026-07-16, #809 R8 fix 2차):
 * <ul>
 *   <li><b>가격기억 store = VAT 포함</b> — {@code PartnerProductPriceMemory} javadoc
 *       "저장 단가는 전표/견적 입력 필드와 동일한 VAT 포함 단가", 응답 Schema
 *       "VAT 포함 입력 단가"({@code PartnerProductPriceMemoryResponse}).</li>
 *   <li><b>전표 작성 폼 필드 = VAT 포함</b> — SlipFormPage 는 {@code priceVatInclusive: true} 로
 *       전송하고 BE {@code SlipService.collectPriceMemory} 는 그 값을 그대로 기억한다(드리프트 0).</li>
 *   <li><b>전표 수정(모달/인라인) 필드 = VAT 제외 공급단가</b> — BE {@code SalesSlipUpdateService}/
 *       {@code SlipUpdateService} javadoc "수정 화면 라인 단가는 VAT 제외 공급단가", 저장 시
 *       {@code collectPriceMemory} 가 <b>{@code unitPrice × 1.1, setScale(2, HALF_UP)}</b> 로
 *       정규화해 각인한다. <b>라인별 세구분(과세/면세/영세) 분기는 없다</b> — {@code SlipLine}
 *       엔티티에 taxType 필드가 없고 전 라인 균일 10% 이므로, FE 미러도 균일 변환이 유일한 정합이다.</li>
 *   <li><b>BE 자체의 포함→제외 규약</b> — {@code SlipLine.createFromVatInclusive}:
 *       {@code supply = incl × 10 ÷ 11} 의 정수 나눗셈(소수부 절사, 0 방향)이다. FE도
 *       {@code vatRounding.supplyFromVatInclusive} 와 같은 계약으로 미러한다.</li>
 *   <li><b>카탈로그 판매가(product.sellingPrice) = VAT 포함 도메인</b> — 폼이 sellingPrice 를
 *       VAT 포함 필드에 그대로 채우고 priceVatInclusive=true 로 전송하는 것으로 실증(폼 패리티).</li>
 * </ul>
 *
 * <p><b>왜 필요한가</b>: 수정 화면에서 기억단가(VAT포함)를 VAT제외 필드에 그대로 기입하면 저장 시
 * BE 가 다시 ×1.1 해 기억이 ~10% 팽창하고, 거래처를 바꿀 때마다 누적된다(라이브 실증:
 * 기억 500,000 → 저장 후 550,000). 기억→필드는 {@link vatExclusiveOf}, 필드→기억 도메인 비교는
 * {@link vatInclusiveOf} 로 변환해야 한다.
 *
 * <p><b>왕복 안정성</b>: 기억값이 (정수 제외단가 × 1.1) 산물이면 왕복 무손실이다
 * (854,700 → 777,000 → 854,700.00). 그렇지 않은 기억값(예: 폼에서 포함단가 500,000 직접 입력)은
 * 첫 저장에서 원 미만 수렴(500,000 → 454,545 → 499,999.50)하고 이후 고정된다 — 종전의
 * ×1.1 복리 팽창과 달리 누적되지 않는다.
 */

interface DecimalParts {
  coefficient: bigint
  scale: number
}

/** 문자열/number를 이진 부동소수 연산 없이 십진 계수와 scale로 분해한다. */
function decimalParts(raw: string | number): DecimalParts | null {
  const text = String(raw).trim() || '0'
  const matched = text.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/)
  if (!matched || (!matched[2] && !matched[3])) return null
  const sign = matched[1] === '-' ? -1n : 1n
  const integer = matched[2] || '0'
  const fraction = matched[3] || ''
  const exponent = Number(matched[4] || '0')
  if (!Number.isSafeInteger(exponent)) return null
  let coefficient = sign * BigInt(`${integer}${fraction}`)
  let scale = fraction.length - exponent
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale)
    scale = 0
  }
  return { coefficient, scale }
}

/** BigDecimal HALF_UP과 동일하게 절댓값 0.5 경계에서 0에서 멀어지는 방향으로 반올림한다. */
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const sign = numerator < 0n ? -1n : 1n
  const absolute = numerator < 0n ? -numerator : numerator
  const quotient = absolute / denominator
  const remainder = absolute % denominator
  return sign * (remainder * 2n >= denominator ? quotient + 1n : quotient)
}

/** BE VAT 포함 금액 분해와 동일한 정수 나눗셈(소수부 절사, 0 방향)을 적용한다. */
function divideTowardZero(numerator: bigint, denominator: bigint): bigint {
  return numerator / denominator
}

/** scale 고정 정수를 불필요한 후행 0 없이 화면/API 문자열로 변환한다. */
function formatScaled(value: bigint, scale: number): string {
  if (scale === 0) return String(value)
  const sign = value < 0n ? '-' : ''
  const absolute = value < 0n ? -value : value
  const padded = absolute.toString().padStart(scale + 1, '0')
  const integer = padded.slice(0, -scale)
  const fraction = padded.slice(-scale).replace(/0+$/, '')
  return fraction ? `${sign}${integer}.${fraction}` : `${sign}${integer}`
}

/**
 * VAT 제외(공급단가) → VAT 포함 — BE 수정경로 {@code collectPriceMemory}
 * ({@code × 1.1, setScale(2, HALF_UP)}) 미러. 기억 도메인과의 비교/후보 구성용.
 *
 * @returns 소수 2자리 반올림 문자열. 비수치 입력은 빈 문자열.
 */
export function vatInclusiveOf(exclusive: string | number): string {
  if (typeof exclusive === 'number' && !Number.isFinite(exclusive)) return ''
  const decimal = decimalParts(exclusive)
  if (!decimal) return ''
  // value × 1.1을 소수 2자리로: coefficient / 10^scale × 11/10 × 100.
  const cents = divideHalfUp(decimal.coefficient * 110n, 10n ** BigInt(decimal.scale))
  return formatScaled(cents, 2)
}

/**
 * VAT 포함(기억/카탈로그) → VAT 제외(수정 화면 필드) — BE {@code SlipLine.createFromVatInclusive}
 * ({@code incl × 10 ÷ 11} 정수 나눗셈, 소수부 절사) 미러.
 *
 * @returns 원 단위 정수 문자열. 비수치 입력은 빈 문자열.
 */
export function vatExclusiveOf(inclusive: string | number): string {
  if (typeof inclusive === 'number' && !Number.isFinite(inclusive)) return ''
  const decimal = decimalParts(inclusive)
  if (!decimal) return ''
  // value ÷ 1.1을 원 단위로: coefficient / 10^scale × 10/11.
  return String(divideTowardZero(
    decimal.coefficient * 10n,
    11n * (10n ** BigInt(decimal.scale)),
  ))
}
