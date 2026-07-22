import { vatFromSupply } from '../utils/vatRounding'

export interface StoredLineAmountInput {
  supplyAmount?: string | number | null
  vatAmount?: string | number | null
  /** BE의 lineTotal은 부가세 제외 라인 금액이다. */
  lineTotal?: string | number | null
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
