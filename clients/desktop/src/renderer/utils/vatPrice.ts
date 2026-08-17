/**
 * 전표 단가 VAT 도메인 변환 — BE slip-service 규약의 FE 미러.
 *
 * <p>🚨 <b>#937 R-3 갱신 — 아래 "전표 수정 필드 = VAT 제외" 전제는 더 이상 사실이 아니다.</b>
 * 2026-07-16(#809 R8 fix 2차) 시점엔 사실이었지만, 2026-07-26 1041bad17(2차 적대검증 E-1
 * 근본수정)이 전표 상세(수정) 화면의 실제 계산을 생성 화면과 같은 함수(lineVat.ts
 * {@code recalculateLineVat}, PRICE 권위 — 단가=VAT 포함)로 정렬했고, 071e6c7ac 가 라벨도
 * 데이터 무관 상수 "단가(VAT포함)"로 고정했다. 즉 <b>지금은 생성·수정 두 화면 모두 단가 필드가
 * VAT 포함이다</b>. 이 파일의 {@link vatExclusiveOf}/{@link vatInclusiveOf} 는 "수정 필드=VAT
 * 제외"였던 시절 거래처 변경 재조회(SlipDetailPage {@code repriceEditLinesForPartner})가
 * 기억/카탈로그(VAT 포함)를 필드 도메인으로 변환하는 데 썼던 함수다 — 그 소비처가 이제
 * 변환을 쓰지 않도록 고쳐졌으므로({@link repricedFieldValue} 참고) 그 원래 소비처 기준으로는
 * 여전히 호출되지 않는다. BigDecimal 정밀도로 정확히 구현돼 있으므로 삭제하지 않고 남겨
 * 뒀는데, 🚨 <b>재수렴 3차(#937) 근본수정이 실제로 그 "장래 재사용"을 만들었다</b> —
 * {@code SlipDetailPage.toPurchaseEditLines}(하이드레이션)의 U1 근본수정이
 * {@link vatInclusiveOf} 를 {@code unit_price_with_vat} 가 null 인 legacy 라인의 VAT 포함
 * 승격 폴백으로 쓴다(BE {@code collectPriceMemory} 의 ×1.1 정규화와 같은 계약 — 2026-07-27
 * 실측 활성 라인 0건이라 방어적 경로이지만 코드 경로 자체는 production 이다). {@link vatExclusiveOf}
 * 만 여전히 호출자가 없다(자체 단위 테스트만 남아 있다).
 *
 * <p><b>코드로 실증한 세만틱</b> (2026-07-16, #809 R8 fix 2차 — 아래 세 번째 항목만 이후 뒤집혔다):
 * <ul>
 *   <li><b>가격기억 store = VAT 포함</b> — {@code PartnerProductPriceMemory} javadoc
 *       "저장 단가는 전표/견적 입력 필드와 동일한 VAT 포함 단가", 응답 Schema
 *       "VAT 포함 입력 단가"({@code PartnerProductPriceMemoryResponse}). (현재도 사실)</li>
 *   <li><b>전표 작성 폼 필드 = VAT 포함</b> — SlipFormPage 는 {@code priceVatInclusive: true} 로
 *       전송하고 BE {@code SlipService.collectPriceMemory} 는 그 값을 그대로 기억한다(드리프트 0).
 *       (현재도 사실)</li>
 *   <li><b>전표 수정(모달/인라인) 필드 = VAT 제외 공급단가</b> — 🚨 <b>더 이상 사실이 아니다</b>(위
 *       #937 R-3 갱신 참고). 당시엔 BE {@code SalesSlipUpdateService}/{@code SlipUpdateService}
 *       javadoc "수정 화면 라인 단가는 VAT 제외 공급단가"·{@code collectPriceMemory} 의
 *       {@code unitPrice × 1.1, setScale(2, HALF_UP)} 정규화와 일치했으나, 지금은 필드=VAT
 *       포함이라 이 BE 정규화가 오히려 두 경로로 갈린다 — <b>authoritative 경로</b>(FE 가
 *       vatDirty=true 로 supplyAmount/vatAmount/lineTotalWithVat 3값을 함께 보내는 저장 —
 *       reprice 로 실제 값이 바뀐 라인은 항상 이 경로다, doc-sync 에코가 즉시 vatDirty 를
 *       true 로 승격한다)는 {@code SlipLine.createFromAuthoritativeAmounts} 가 unitPrice 를
 *       {@code unitPriceWithVat} 컬럼에 그대로 복사해 변환이 없고(라이브 실증 #937-R3:
 *       저장된 라인 {@code unit_price == unit_price_with_vat == 500000.00}), 그래서 이
 *       파일의 fix 만으로 BE 변경 없이 정합이 닫힌다. <b>legacy 비authoritative 경로</b>
 *       ({@code SlipLine.create}, vatDirty=false 로 unitPrice 만 보내는 저장)만 여전히
 *       {@code unitPrice × 1.1} 을 적용하는데, reprice 가 실제로 값을 바꾼 라인은 위 에코
 *       메커니즘 때문에 이 경로로 저장될 수 없어 R-3 결함 표면에서는 도달 불가능하다 — BE
 *       변경은 하지 않았다.</li>
 *   <li><b>BE 자체의 포함→제외 규약</b> — {@code SlipLine.createFromVatInclusive}:
 *       {@code supply = incl ÷ 1.1} 의 원 단위 HALF_UP이다. FE도
 *       {@code vatRounding.supplyFromVatInclusive} 와 같은 계약으로 미러한다. (현재도 사실 —
 *       생성 화면·수정 화면의 PRICE 권위 분리 공식이 둘 다 이 규약을 쓴다.)</li>
 *   <li><b>카탈로그 판매가(product.sellingPrice) = VAT 포함 도메인</b> — 폼이 sellingPrice 를
 *       VAT 포함 필드에 그대로 채우고 priceVatInclusive=true 로 전송하는 것으로 실증(폼 패리티).
 *       (현재도 사실)</li>
 * </ul>
 *
 * <p><b>역사적 기록(더 이상 소비처 없음)</b>: 수정 화면 필드가 VAT 제외였던 시절, 재조회가
 * 기억단가(VAT포함)를 변환 없이 그대로 기입하면 저장 시 BE 가 다시 ×1.1 해 기억이 ~10%
 * 팽창하고 거래처를 바꿀 때마다 누적됐다(라이브 실증: 기억 500,000 → 저장 후 550,000). 기억→
 * 필드는 {@link vatExclusiveOf}, 필드→기억 도메인 비교는 {@link vatInclusiveOf} 로 변환해
 * 막았다. 왕복 안정성: 기억값이 (정수 제외단가 × 1.1) 산물이면 왕복 무손실이었다
 * (854,700 → 777,000 → 854,700.00). 그렇지 않은 기억값(예: 폼에서 포함단가 500,000 직접 입력)은
 * 첫 저장에서 원 미만 수렴(500,000 → 454,545 → 499,999.50)하고 이후 고정됐다.
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
 * VAT 포함(기억/카탈로그) → VAT 제외(수정 화면 필드) — 레거시 종합견적서의
 * ({@code incl ÷ 1.1} 원 단위 HALF_UP) 미러.
 *
 * @returns 원 단위 정수 문자열. 비수치 입력은 빈 문자열.
 */
export function vatExclusiveOf(inclusive: string | number): string {
  if (typeof inclusive === 'number' && !Number.isFinite(inclusive)) return ''
  const decimal = decimalParts(inclusive)
  if (!decimal) return ''
  // value ÷ 1.1을 원 단위 HALF_UP으로: coefficient / 10^scale × 10/11.
  return String(divideHalfUp(
    decimal.coefficient * 10n,
    11n * (10n ** BigInt(decimal.scale)),
  ))
}
