/** 주문서 앱 접근권한 설정의 비밀번호 초기화 안전 게이트. */
export function canResetPartnerPassword(
  partnerCode: string,
  previewPartnerCodes: ReadonlySet<string>,
  canUpdate: boolean,
): boolean {
  return canUpdate && previewPartnerCodes.has(partnerCode)
}
