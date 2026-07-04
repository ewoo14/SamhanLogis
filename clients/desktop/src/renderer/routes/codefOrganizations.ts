import type { CodefConnectionBusinessType } from '../api/codefConnectionApi'

/**
 * CODEF 기관 코드 ↔ 한국어 기관명 공용 매핑.
 *
 * 계좌/카드 관리(BankCardAdminPage)와 입출금내역(BankTransactionPage)이 공유한다.
 * (과거 두(+구 CodefConnectionPage 3) 화면에 축자 중복돼 신규 기관 추가 시 다중 갱신·표기 불일치 위험이 있었다.)
 */
export interface CodefOrganization {
  code: string
  name: string
  businessType: CodefConnectionBusinessType
}

export const CODEF_ORGANIZATIONS: CodefOrganization[] = [
  { code: '0004', name: '국민은행', businessType: 'BANK' },
  { code: '088', name: '신한은행', businessType: 'BANK' },
  { code: '081', name: '하나은행', businessType: 'BANK' },
  { code: '020', name: '우리은행', businessType: 'BANK' },
  { code: '0301', name: '신한카드', businessType: 'CARD' },
  { code: '0302', name: '국민카드', businessType: 'CARD' },
]

const NAME_BY_CODE = new Map(CODEF_ORGANIZATIONS.map((org) => [org.code, org.name]))

/** 기관 코드를 한국어 기관명으로 변환한다. 미등록 코드는 코드 원문을 반환한다. */
export function codefOrganizationName(code: string): string {
  return NAME_BY_CODE.get(code) ?? code
}

/** 업무 구분에 해당하는 기관 옵션(datalist 등)을 반환한다. */
export function codefOrganizationsByBusinessType(
  businessType: CodefConnectionBusinessType,
): CodefOrganization[] {
  return CODEF_ORGANIZATIONS.filter((org) => org.businessType === businessType)
}
