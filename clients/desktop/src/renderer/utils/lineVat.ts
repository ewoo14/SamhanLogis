import { supplyFromVatInclusive, vatFromIntegerSupply } from './vatRounding'

/**
 * 품목행 공급가액·부가세·VAT 포함 합계 계산.
 *
 * <p>라인별 권위 열을 기억하며, 반올림은 공급가액 또는 부가세 중 하나에만 적용한다.
 * 나머지 값은 정수 덧셈·뺄셈으로 닫아 {@code 공급가액+부가세=합계}를 정의상 보장한다.
 */

export type LineVatAuthority = 'PRICE' | 'SUPPLY' | 'VAT' | 'TOTAL'

export interface LineVatLine {
  quantity: string | number
  unitPrice: string | number
  supplyAmount: string
  vatAmount: string
  lineTotal: string
  authority?: LineVatAuthority
  vatWarning?: boolean
}

export interface DisplayedLineVatTotals {
  supply: number
  vat: number
  total: number
}

/** 행이 현재 표시하는 공급가액·부가세·합계를 그대로 합산한다. */
export function sumDisplayedLineVatAmounts(
  lines: Array<Pick<LineVatLine, 'supplyAmount' | 'vatAmount' | 'lineTotal'>>,
): DisplayedLineVatTotals {
  return lines.reduce<DisplayedLineVatTotals>(
    (totals, line) => ({
      supply: totals.supply + Number(line.supplyAmount),
      vat: totals.vat + Number(line.vatAmount),
      total: totals.total + Number(line.lineTotal),
    }),
    { supply: 0, vat: 0, total: 0 },
  )
}

interface DecimalParts {
  coefficient: bigint
  scale: number
}

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

function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const sign = numerator < 0n ? -1n : 1n
  const absolute = numerator < 0n ? -numerator : numerator
  const quotient = absolute / denominator
  const remainder = absolute % denominator
  return sign * (remainder * 2n >= denominator ? quotient + 1n : quotient)
}

function integerAmount(value: string | number): bigint {
  const decimal = decimalParts(value)
  if (!decimal) return 0n
  return divideHalfUp(decimal.coefficient, 10n ** BigInt(decimal.scale))
}

/** 수량×단가 등 두 십진 값의 곱을 정수(scale 0)로 HALF_UP 반올림한다 — BigInt 정밀 연산. */
export function roundProduct(left: string | number, right: string | number): bigint {
  const a = decimalParts(left)
  const b = decimalParts(right)
  if (!a || !b) return 0n
  return divideHalfUp(
    a.coefficient * b.coefficient,
    10n ** BigInt(a.scale + b.scale),
  )
}

function formatScaled(value: bigint, scale: number): string {
  if (scale === 0) return String(value)
  const sign = value < 0n ? '-' : ''
  const absolute = value < 0n ? -value : value
  const padded = absolute.toString().padStart(scale + 1, '0')
  const integer = padded.slice(0, -scale)
  const fraction = padded.slice(-scale).replace(/0+$/, '')
  return fraction ? `${sign}${integer}.${fraction}` : `${sign}${integer}`
}

function divideToScale(value: bigint, divisor: bigint, scale: number): string {
  return formatScaled(divideHalfUp(value * 10n ** BigInt(scale), divisor), scale)
}

function warningFor(supplyAmount: bigint, vatAmount: bigint): boolean {
  return vatAmount !== vatFromIntegerSupply(supplyAmount)
}

/**
 * 공급가액 기준 10%(별도 절사)과 저장된 부가세의 "실질" 불일치를 판정한다 — ±1원은 허용 오차.
 *
 * <p>재수렴 3차(#937) 근본수정 — 종전엔 {@link warningFor}(엄격 일치)를 그대로 썼다.
 * PRICE/TOTAL 권위의 실제 분리 공식({@link supplyFromVatInclusive} 미러, 합계를 ÷1.1·원 단위
 * HALF_UP)은 "공급가액×10%, 별도 절사"와 수학적으로 다른 반올림 경계를 가져 <b>항상 0 또는 ±1원만큼만</b>
 * 어긋난다 — 증명: 합계 T=11k+r(0≤r≤10) 로 두면 공급가액 S=10k+⌊10r/11⌋, 부가세 V=T-S=
 * k+r-⌊10r/11⌋, "공급가액의 10%"(별도 절사)는 k 이고, 그 차 r-⌊10r/11⌋ 은 r=0 이면 0, r=1..10
 * 이면 항상 1이다(자기 자신과 비교해도 반올림 경계마다 거짓 경고가 붙던 #937 R-2 최초 발견의
 * 원인). 실측(2026-07-27, 활성 slip_lines 2,717건)도 이를 뒷받침한다 — 정확히 10%: 2,658건,
 * ±1원 잔차: 48건(diff=+1 40건·diff=-1 8건, 후자는 SUPPLY/VAT 권위 직접편집 등 다른 경로에서도
 * 1원 잔차가 남을 수 있음을 보여준다), 그 밖의 실질 불일치(3,000~18,000원): 11건뿐이었다.
 *
 * <p>±1원을 허용 오차로 두지 않으면(엄격 일치) 정상 계산 라인 대다수가 거짓 경고를 받고
 * (#937 R-2 최초 발견 — SlipDetailPage 하이드레이션이 저장 직후 재열기만으로 경고를 띄웠다),
 * 반대로 무조건 억제하면(#937 R-2 fix, 이 함수를 실사용하기 전) 그 11건의 실질 불일치까지
 * 함께 숨는다(재수렴 3차 U2 신규 발견). SlipDetailPage 하이드레이션·원격 피어 동기화가 이
 * 함수를 실사용한다(재수렴 3차 이전엔 정의만 있고 호출자가 없었다).
 */
export function hasVatWarning(supplyAmount: string | number, vatAmount: string | number): boolean {
  const diff = integerAmount(vatAmount) - vatFromIntegerSupply(integerAmount(supplyAmount))
  return diff > 1n || diff < -1n
}

/**
 * 저장 시점에 기록된 단가 권위 도메인 (slip_lines.unit_price_domain, V59) — 재수렴 6차 #937.
 *
 * <ul>
 *   <li>{@code VAT_INCLUSIVE} — {@code unit_price_with_vat} 가 이 라인의 VAT 포함 단가다.</li>
 *   <li>{@code SUPPLY} — {@code unit_price} 가 권위이고 {@code unit_price_with_vat} 는 x1.1 파생값.
 *       어느 쪽이든 {@code unit_price_with_vat} 는 <b>충실한 VAT 포함 단가</b>이므로 표시는 같다.</li>
 * </ul>
 */
export type StoredUnitPriceDomain = 'VAT_INCLUSIVE' | 'SUPPLY'

const KNOWN_UNIT_PRICE_DOMAINS: readonly string[] = ['VAT_INCLUSIVE', 'SUPPLY']

export interface StoredUnitPriceSource {
  quantity: string | number
  /** 저장된 VAT 제외 공급단가 컬럼 (slip_lines.unit_price). */
  unitPrice?: string | number | null
  /** 저장된 VAT 포함 단가 컬럼 (slip_lines.unit_price_with_vat). */
  unitPriceWithVat?: string | number | null
  supplyAmount: string | number
  vatAmount: string | number
  /**
   * 저장 시점에 기록된 단가 권위 도메인 (slip_lines.unit_price_domain, V59) — 재수렴 6차 #937.
   * 값이 있으면 <b>휴리스틱 판정을 아예 하지 않는다</b>. V59 이전 legacy 행은 null/undefined 이며
   * 그 행만 현행 휴리스틱으로 해석한다(개발책임자 결정).
   * BE 응답 문자열을 그대로 받으므로 알 수 없는 값이 올 수 있어 타입을 넓게 둔다.
   */
  unitPriceDomain?: StoredUnitPriceDomain | string | null
}

export interface ResolvedUnitPrices {
  /** VAT 제외 공급단가 — 세금계산서·입고전표 인쇄의 "단가" 열 도메인. */
  supplyUnit: string
  /** VAT 포함 단가 — 상세/수정 화면·거래명세서의 "단가(VAT포함)" 도메인. */
  inclusiveUnit: string
}

/**
 * 파생 단가 컬럼({@code unit_price = S ÷ Q}) — 저장값이 자기 항등식과 맞으면 그대로, 아니면
 * 권위 금액에서 유도한다. 이 컬럼은 사용자 입력이 아니라 BE 가 계산해 넣는 값이다
 * ({@code SlipLine.createFromAuthoritativeAmounts}).
 */
function resolveUnit(stored: string | number | null | undefined, target: bigint, quantity: number): string {
  if (stored != null && String(stored).trim() !== '' && decimalParts(stored) !== null
      && roundProduct(quantity, stored) === target) {
    return String(stored)
  }
  return divideToScale(target, BigInt(quantity), 2)
}

/**
 * 사용자 권위 단가 컬럼({@code unit_price_with_vat}) — 재수렴 5차(#937) 근본수정.
 *
 * <p>이 컬럼은 파생값이 아니라 <b>사용자가 화면에 입력한 VAT 포함 단가</b>다. BE 가 요청 단가를
 * 끝수까지 무손실로 각인하고({@code SlipLine.createFromAuthoritativeAmounts}), 가격기억 각인
 * 원천({@code collectPriceMemory} 의 {@code getUnitPriceWithVat})도 이 컬럼이다. 2026-07-25
 * 개발책임자 결정 P4 — <b>"단가는 결코 역산되지 않는다"</b> — 는 편집 계층({@link
 * editSlipLineAmount})뿐 아니라 표시·하이드레이션 계층에도 그대로 적용된다.
 *
 * <p>부가세(또는 공급가액)만 편집하면(P6) 단가는 그대로 두고 S/V 만 바뀌므로 항등식
 * {@code 단가 × 수량 = S + V} 가 <b>정당하게</b> 깨진다. 그 정당한 상태와 BE 구 저장이 만든
 * 오염(화면 단가를 두 컬럼에 그대로 각인 — 라이브 실증 {@code 100000|100000|200000|20000|2})은
 * <b>저장값이 어느 세금 도메인의 총액과 맞아떨어지는지</b>로 구별된다: {@code 저장단가 × 수량 = S}
 * 면 그 컬럼은 VAT <b>제외</b> 값을 담고 있으므로(오염) 권위 합계에서 유도하고, 그 밖에는 사용자
 * 권위 단가로 보존한다. 부가세 0(면세) 라인은 {@code S = S + V} 라 유도해도 같은 값이 나온다.
 *
 * <p>재수렴 4차는 이 구별 없이 "항등식 불만족이면 무조건 유도"했고, 그래서 부가세만 편집한
 * 라인의 단가를 표시 계층에서 역산했다 — 라이브 실증 2026-07-27: 사용자 입력 110,000 이 표시
 * 112,500 이 되고, 무편집 재저장만으로 DB {@code unit_price_with_vat} 가 112,500 으로 덮여
 * 사용자가 입력한 단가가 영구 소멸했다(실 DB 활성 22행 중 10행은 11,000 → 26,000, +136%).
 */
function resolveAuthoredUnit(
  stored: string | number | null | undefined,
  inclusiveTarget: bigint,
  supplyTarget: bigint,
  quantity: number,
): string {
  if (stored != null && String(stored).trim() !== '' && decimalParts(stored) !== null
      && roundProduct(quantity, stored) !== supplyTarget) {
    return String(stored)
  }
  return resolveUnit(stored, inclusiveTarget, quantity)
}

/**
 * 저장된 두 단가 컬럼을 각자의 세금 도메인으로 해석한다 — 재수렴 4차·5차(#937) 근본수정.
 *
 * <p><b>계약</b>: 전표 라인의 금액 권위값은 공급가액(S)·부가세(V)·수량(Q) 이고({@code
 * SlipLine.createFromAuthoritativeAmounts} 가 요청 3값을 재계산 없이 그대로 저장한다), 두 단가
 * 컬럼의 <b>성격은 서로 다르다</b>:
 * <ul>
 *   <li>{@code unit_price}(VAT 제외) = <b>파생값</b>. BE 가 {@code S ÷ Q} 로 계산해 넣는다 —
 *       세금계산서·입고전표의 "단가 × 수량 = 공급가액"이 이 컬럼의 항등식이다.</li>
 *   <li>{@code unit_price_with_vat}(VAT 포함) = <b>사용자 권위 입력</b>. 화면 단가(2026-06-09
 *       개발책임자 확정으로 VAT 포함)를 끝수까지 그대로 각인하며, 가격기억 각인 원천이다.
 *       2026-07-25 결정 P4 대로 어떤 경로에서도 역산하지 않는다({@link resolveAuthoredUnit}).</li>
 * </ul>
 *
 * <p><b>왜 저장값을 무조건 믿지 않는가</b>: 2026-07-27 slip_lines 실측(활성 2,781건) —
 * {@code unit_price × 수량 ≠ 공급가액} 44건, {@code unit_price_with_vat × 수량 ≠ 공급가액+부가세}
 * 22건, 두 컬럼이 같은 값인 행 55건. 구 BE 는 화면 단가를 <b>두 컬럼에 그대로</b> 각인해 한쪽이
 * 반드시 틀린 상태를 남겼다. BE 근본수정이 앞으로의 저장을 바로잡아도 이미 그 상태인 행은
 * 남으므로, 파생 컬럼은 권위값과 대조해 유도하고 권위 입력 컬럼은 "다른 도메인 총액과
 * 맞아떨어지는" 오염 신호가 있을 때만 유도한다.
 *
 * <p><b>왜 무조건 유도하지도 않는가</b>: 사용자가 입력한 끝수 단가(예: 가격기억 499,999.5)는
 * 권위값에서 되돌리면 반올림되어(500,000) 가격기억 왕복이 흔들리고, 부가세만 편집한 라인
 * (P6 — 정당하게 항등식이 깨진다)은 아예 다른 단가로 바뀐다.
 *
 * <p>🚨 <b>재수렴 6차(#937) — 개발책임자 결정 A안 "저장 시점에 도메인 기록"</b>.
 * 위 두 문단의 휴리스틱은 <b>legacy 행 전용</b>이 됐다. {@code unitPriceDomain}
 * ({@code slip_lines.unit_price_domain}, V59)이 실려 있으면 판정을 아예 하지 않고 저장된
 * {@code unitPriceWithVat} 를 그대로 쓴다.
 *
 * <p><b>왜 판정식을 또 고치지 않았나</b>: 6라운드에 걸쳐 기준을 세 번 바꿨다(동일성 → 항등식 →
 * 공급가액 일치). 오판 표면은 22행 → 10행으로 줄었을 뿐 <b>0 이 되지 않았다</b>. 같은 DB 행
 * {@code 100000|100000|200000|20000|2} 에 대해 "구 BE 오염 방지"는 유도(→110,000)를,
 * 2026-07-25 결정 P4 는 보존(→100,000)을 요구하는데 <b>DB 에 이를 가르는 정보가 없었다</b> —
 * 사용자가 공급가액을 {@code 단가 × 수량} 에 맞추는 순간(부가세 별도 정정, 한국 B2B 기본 관행)
 * 정당한 상태가 오염행과 완전히 같은 좌표가 되기 때문이다(라이브 실증 전표 2026/07/27-209:
 * 읽기전용 표 110,000 vs 수정모달 100,000 — 같은 전표·같은 세션 10,000원 차이). 그래서 판정을
 * 개선하는 대신 <b>저장 시점에 답을 기록</b>한다.
 *
 * <p>BE 미러: {@code SlipRevisionService.unitPriceDisplayValue} (버전이력·레드라인 공용).
 * 갈리면 화면과 감사 이력이 어긋난다.
 */
export function resolveUnitPrices(source: StoredUnitPriceSource): ResolvedUnitPrices {
  const quantity = Math.max(1, Math.trunc(Number(source.quantity) || 1))
  const supply = integerAmount(source.supplyAmount)
  const vat = integerAmount(source.vatAmount)
  const stored = source.unitPriceWithVat
  const domainKnown = source.unitPriceDomain != null
    && KNOWN_UNIT_PRICE_DOMAINS.includes(String(source.unitPriceDomain).trim())
  const storedUsable = stored != null && String(stored).trim() !== '' && decimalParts(stored) !== null
  return {
    supplyUnit: resolveUnit(source.unitPrice, supply, quantity),
    // A안 — 저장 시점 도메인이 있으면 추측하지 않고 저장값을 그대로 쓴다.
    inclusiveUnit: domainKnown && storedUsable
      ? String(stored)
      : resolveAuthoredUnit(stored, supply + vat, supply, quantity),
  }
}

function fromAmounts<T extends LineVatLine>(
  line: T,
  authority: LineVatAuthority,
  supplyAmount: bigint,
  vatAmount: bigint,
  lineTotal: bigint,
): T {
  const quantity = Math.max(1, Math.trunc(Number(line.quantity) || 1))
  return {
    ...line,
    quantity: line.quantity,
    unitPrice: divideToScale(lineTotal, BigInt(quantity), 2),
    supplyAmount: String(supplyAmount),
    vatAmount: String(vatAmount),
    lineTotal: String(lineTotal),
    authority,
    // PRICE/TOTAL은 VAT 포함 T를 권위로 삼아 V=T-S로 닫으므로 10% 단일값과
    // 소수점 경계가 달라도 경고하지 않는다. VAT 직접 입력만 약정 기준을 검증한다.
    vatWarning: authority === 'VAT' ? warningFor(supplyAmount, vatAmount) : false,
  } as T
}

/** 단가(P) 편집 경로 — 기존 VAT 포함 단가 계산을 유지한다. */
export function recalculateLineVat<T extends LineVatLine>(line: T, authority: LineVatAuthority = 'PRICE'): T {
  const quantity = Math.max(1, Math.trunc(Number(line.quantity) || 1))
  if (authority === 'PRICE') {
    const total = roundProduct(quantity, line.unitPrice)
    // P1-03: BE VatAmountCalculator/splitVatInclusive와 같은 레거시 원 단위 HALF_UP이다.
    // 단일 진실원(vatRounding.ts)의 계산기를 사용해 전표·견적 표시와 저장 계약을 맞춘다.
    const supply = supplyFromVatInclusive(total)
    return fromAmounts(line, authority, supply, total - supply, total)
  }
  if (authority === 'SUPPLY') {
    const supply = integerAmount(line.supplyAmount)
    const vat = vatFromIntegerSupply(supply)
    return fromAmounts(line, authority, supply, vat, supply + vat)
  }
  if (authority === 'VAT') {
    const supply = integerAmount(line.supplyAmount)
    const vat = integerAmount(line.vatAmount)
    return fromAmounts(line, authority, supply, vat, supply + vat)
  }
  const total = integerAmount(line.lineTotal)
  const supply = supplyFromVatInclusive(total)
  return fromAmounts(line, authority, supply, total - supply, total)
}

/** 공급가액·부가세·합계 중 사용자가 편집한 값을 권위로 반영한다. */
export function editLineVat<T extends LineVatLine>(
  line: T,
  authority: Exclude<LineVatAuthority, 'PRICE'>,
  value: string | number,
): T {
  const next = { ...line }
  if (authority === 'SUPPLY') next.supplyAmount = String(integerAmount(value))
  if (authority === 'VAT') next.vatAmount = String(integerAmount(value))
  if (authority === 'TOTAL') next.lineTotal = String(integerAmount(value))
  return recalculateLineVat(next, authority)
}

/**
 * 전표(SlipFormPage) 전용 — 공급가액·부가세 편집 (개발책임자 결정 2026-07-25, 정정 포함).
 *
 * <p>🚨 위 {@link editLineVat}/{@link recalculateLineVat} 의 SUPPLY/VAT 분기는 **일부러
 * 건드리지 않았다.** 그 두 함수는 견적(EstimateFormPage)·전표 상세(SlipDetailPage)가
 * 여전히 원래 방향(SUPPLY 편집 시 부가세를 공급가액의 10%로 재계산 + 단가 역산)으로 쓰고
 * 있어(P5 — 다른 화면 금액 계약 보존), 공유 분기를 고치면 그 화면들의 동작이 바뀐다.
 * 전표 화면만의 새 정책이 필요해 공유 계산을 고치는 대신 이 함수를 **별도로 추가**했다 —
 * 전표 화면(SlipFormPage)만 이 함수를 호출하므로 다른 화면은 영향을 받지 않는다.
 *
 * <p>규칙(2026-07-25 결정 + 정정 반영):
 * <ul>
 *   <li>P4 — 단가는 결코 역산되지 않는다. 이 함수는 애초에 단가 편집 대상이 아니므로
 *       {@code line.unitPrice} 를 전혀 건드리지 않고 그대로 승계한다.</li>
 *   <li>P6(정정) — 공급가액을 편집해도 부가세는 그대로, 부가세를 편집해도 공급가액은
 *       그대로 유지된다. 재계산의 출발점은 오직 단가({@link recalculateLineVat} 의 PRICE
 *       분기) 하나뿐이고, 이 함수는 그 반대 방향(공급가액·부가세 → 단가/서로)으로는
 *       아무 것도 역산하지 않는다 — 편집한 열 자신 + 합계(P2: 공급가액+부가세)만 바뀐다.</li>
 *   <li>합계(TOTAL) 권위는 이 함수에 없다 — 전표 화면은 합계 편집 UI 자체가 없다(P1,
 *       LineRow.tsx/SlipMobileLineCard 양쪽 읽기전용 표시로 전환).</li>
 *   <li>부가세 경고(⚠ 10%와 다름)는 공급가액 편집으로도 발생할 수 있다 — 종전에는 SUPPLY
 *       편집이 부가세를 강제로 10%에 맞춰 불일치가 애초에 존재할 수 없었지만, 이제는
 *       부가세를 그대로 두므로 새 공급가액과 어긋날 수 있다. 그래서 이 함수는 authority
 *       와 무관하게 항상 {@link warningFor} 로 판정한다(기존 editLineVat 은 VAT 편집일
 *       때만 판정 — 그 함수는 SUPPLY 가 여전히 10%를 강제해 무의미했기 때문).</li>
 * </ul>
 */
export function editSlipLineAmount<T extends LineVatLine>(
  line: T,
  authority: 'SUPPLY' | 'VAT',
  value: string | number,
): T {
  const amount = integerAmount(value)
  const supply = authority === 'SUPPLY' ? amount : integerAmount(line.supplyAmount)
  const vat = authority === 'VAT' ? amount : integerAmount(line.vatAmount)
  return {
    ...line,
    supplyAmount: String(supply),
    vatAmount: String(vat),
    lineTotal: String(supply + vat),
    authority,
    vatWarning: warningFor(supply, vat),
  } as T
}

/** 수량 변경 — 비단가 권위 라인은 파생 단가를 승격해 PRICE 경로로 복귀한다. */
export function changeLineQuantity<T extends LineVatLine>(line: T, quantity: string): T {
  const next = { ...line, quantity }
  if (line.authority && line.authority !== 'PRICE') {
    return recalculateLineVat(next, 'PRICE')
  }
  return recalculateLineVat(next, 'PRICE')
}
