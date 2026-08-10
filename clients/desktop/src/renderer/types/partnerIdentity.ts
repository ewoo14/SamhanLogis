/** 거래처 코드와 사업자번호를 컴파일 시 서로 대입할 수 없게 하는 nominal 타입. */
export type PartnerCode = string & { readonly __brand: 'PartnerCode' }
export type BusinessNumber = string & { readonly __brand: 'BusinessNumber' }

/** 거래처 선택 UI가 소비하는 분리된 최소 계약. */
export type PartnerSelectionOption = {
  partnerCode: PartnerCode
  name: string
  bizNo?: BusinessNumber
}

/** 외부 JSON 경계에서 거래처 코드로 명시적 변환한다. 런타임 문자열은 그대로 보존한다. */
export function asPartnerCode(value: string): PartnerCode {
  return value as PartnerCode
}

/** 외부 JSON 경계에서 사업자번호로 명시적 변환한다. 런타임 문자열은 그대로 보존한다. */
export function asBusinessNumber(value: string): BusinessNumber {
  return value as BusinessNumber
}
