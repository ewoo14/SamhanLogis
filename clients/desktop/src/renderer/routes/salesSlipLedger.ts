import type { SlipDetail } from '../api/slip'

export type SalesSlipLedgerSource = Pick<
  SlipDetail,
  'partnerName' | 'partnerCode' | 'businessNumber' | 'slipDate'
>

export interface SalesSlipPartnerHeader {
  name: string
  partnerCode: string
  businessNumber: string
}

export interface SalesSlipLedgerRequest {
  partnerCode: string
  from: string
  to: string
}

export type SalesSlipLedgerDisplay =
  | { status: 'unavailable'; message: string }
  | { status: 'loading'; message: string }
  | { status: 'error'; message: string }
  | { status: 'success'; openingBalance: string; closingBalance: string }

/** 판매전표 상세 응답에 저장된 거래처 snapshot을 헤더 표시·수정 폼에 공급한다. */
export function resolveSalesSlipPartnerHeader(
  source: Pick<SalesSlipLedgerSource, 'partnerName' | 'partnerCode' | 'businessNumber'>,
): SalesSlipPartnerHeader {
  return {
    name: source.partnerName?.trim() ?? '',
    partnerCode: source.partnerCode?.trim() ?? '',
    businessNumber: source.businessNumber?.trim() ?? '',
  }
}

/** accounting-service의 일자별 원장 계약을 위한 판매전표 단일일 조회 조건을 만든다. */
export function buildSalesSlipLedgerRequest(
  source: SalesSlipLedgerSource,
): SalesSlipLedgerRequest | null {
  const partnerCode = source.partnerCode?.trim() ?? ''
  const slipDate = source.slipDate?.trim() ?? ''
  if (!partnerCode || !slipDate) return null
  return { partnerCode, from: slipDate, to: slipDate }
}

/** 조회 상태를 화면 표시 계약으로 변환한다. 실패 상태에는 금액을 넣지 않는다. */
export function toSalesSlipLedgerDisplay(input: {
  status: 'loading' | 'error' | 'success'
  openingBalance?: string
  closingBalance?: string
}): SalesSlipLedgerDisplay {
  if (input.status === 'loading') {
    return { status: 'loading', message: '전잔·후잔 조회 중…' }
  }
  if (input.status === 'error') {
    return { status: 'error', message: '전잔·후잔을 불러오지 못했습니다.' }
  }
  return {
    status: 'success',
    openingBalance: input.openingBalance ?? '0',
    closingBalance: input.closingBalance ?? '0',
  }
}

/** accounting-service가 반환한 금액을 표시용으로만 포맷한다. 산식은 수행하지 않는다. */
export function formatSalesSlipLedgerAmount(value: string): string {
  const amount = Number(value)
  return Number.isFinite(amount) ? `${amount.toLocaleString('ko-KR')}원` : '—'
}
