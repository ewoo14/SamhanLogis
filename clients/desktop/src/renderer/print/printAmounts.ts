import { vatFromSupply } from '../utils/vatRounding'

export interface StoredLineAmountInput {
  supplyAmount?: string | number | null
  vatAmount?: string | number | null
  lineTotal?: string | number | null
}

export interface StoredLineAmounts {
  supply: number
  vat: number
  total: number
}

/**
 * 인쇄용 라인 금액을 저장 snapshot에서 읽는다.
 * 완전한 S/V/T가 있으면 어떤 세율도 재계산하지 않고 그대로 사용하고,
 * legacy 응답에서 누락된 필드만 기존 호환 규칙으로 보완한다.
 */
export function storedLineAmounts(line: StoredLineAmountInput): StoredLineAmounts {
  const supply = line.supplyAmount != null
    ? Number(line.supplyAmount)
    : Number(line.lineTotal ?? 0)
  const vat = line.vatAmount != null ? Number(line.vatAmount) : vatFromSupply(supply)
  const total = line.lineTotal != null ? Number(line.lineTotal) : supply + vat
  return { supply, vat, total }
}
