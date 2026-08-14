import { resolveUnitPrices } from '../utils/lineVat'
import { vatFromSupply } from '../utils/vatRounding'

export interface StoredLineAmountInput {
  supplyAmount?: string | number | null
  vatAmount?: string | number | null
  /** BE의 lineTotal은 부가세 제외 라인 금액이다. */
  lineTotal?: string | number | null
}

export interface StoredLineUnitPriceInput extends StoredLineAmountInput {
  quantity?: string | number | null
  unitPrice?: string | number | null
  unitPriceWithVat?: string | number | null
  /**
   * 저장 시점 단가 권위 도메인 (#937 재수렴 6차 A안, V59) — 있으면 휴리스틱 없이 해석한다.
   * 인쇄가 화면과 <b>같은 단가</b>를 보이려면 같은 정보를 읽어야 한다.
   */
  unitPriceDomain?: string | null
}

export interface StoredLineUnitPrices {
  /** VAT 제외 공급단가 — 세금계산서·입고전표의 "단가" 열. */
  supplyUnit: number
  /** VAT 포함 단가 — 거래명세서의 "단가" 열. */
  inclusiveUnit: number
}

/**
 * 인쇄용 라인 단가를 저장 snapshot에서 읽는다 — 재수렴 4차·5차(#937) 근본수정.
 *
 * <p>세금계산서/입고전표의 "단가" 열은 바로 옆 "공급가액" 열과 같은 VAT 제외 도메인이라
 * 사용자가 읽는 항등식이 {@code 단가 × 수량 = 공급가액} 이고, 거래명세서의 "단가" 열은 VAT
 * 포함이라 {@code 단가 × 수량 = 공급가액 + 부가세} 다.
 *
 * <p>🚨 <b>후자는 정의상 보장되지 않는다</b>(4차 커밋 문안의 과장 정정 — 재수렴 5차 PM 지적).
 * {@code unit_price}(VAT 제외)는 BE 파생 컬럼이라 언제나 공급가액에서 유도할 수 있지만,
 * {@code unit_price_with_vat}(VAT 포함)는 <b>사용자 권위 입력</b>이라 2026-07-25 개발책임자
 * 결정 P4 대로 역산하지 않는다 — 사용자가 <b>부가세만</b> 직접 편집하면(P6) 단가는 그대로인 채
 * 합계만 바뀌므로 거래명세서에서 {@code 단가 × 수량 ≠ 공급가액 + 부가세} 가 되며, 그것이
 * 사용자가 입력한 그대로의 상태다. 인쇄가 보장하는 것은 <b>세금계산서·입고전표의 VAT 제외
 * 항등식</b>과 <b>화면·인쇄가 같은 단가를 보인다</b>는 것이다.
 *
 * <p>판정·유도 규칙은 화면과 같은 단일 진실원({@link resolveUnitPrices})을 쓴다.
 */
export function storedLineUnitPrices(line: StoredLineUnitPriceInput): StoredLineUnitPrices {
  const { supply, vat } = storedLineAmounts(line)
  const resolved = resolveUnitPrices({
    quantity: line.quantity ?? 1,
    unitPrice: line.unitPrice,
    unitPriceWithVat: line.unitPriceWithVat,
    supplyAmount: supply,
    vatAmount: vat,
    unitPriceDomain: line.unitPriceDomain,
  })
  return {
    supplyUnit: Number(resolved.supplyUnit),
    inclusiveUnit: Number(resolved.inclusiveUnit),
  }
}

export interface StoredLineAmounts {
  supply: number
  vat: number
  total: number
}

/**
 * 인쇄용 라인 금액을 저장 snapshot에서 읽는다.
 * 공급가액과 세액은 어떤 세율도 재계산하지 않고 저장값을 그대로 사용한다.
 * BE의 lineTotal은 부가세 제외 금액이므로 인쇄 합계는 항상 S + V로 만든다.
 * legacy 응답에서 누락된 필드만 기존 호환 규칙으로 보완한다.
 */
export function storedLineAmounts(line: StoredLineAmountInput): StoredLineAmounts {
  const supply = line.supplyAmount != null
    ? Number(line.supplyAmount)
    : Number(line.lineTotal ?? 0)
  const vat = line.vatAmount != null ? Number(line.vatAmount) : vatFromSupply(supply)
  const total = supply + vat
  return { supply, vat, total }
}
