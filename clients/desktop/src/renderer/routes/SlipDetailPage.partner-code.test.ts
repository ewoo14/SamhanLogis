import { describe, expect, it } from 'vitest'
import { toSlipPartnerOption } from './SlipDetailPage'

describe('매입·매출 direct edit 거래처 옵션 매핑', () => {
  it('거래처코드와 사업자번호를 서로 바꾸지 않는다', () => {
    expect(toSlipPartnerOption({
      partnerId: 'partner-uuid-redacted',
      partnerCode: 'P-2026-0001',
      businessRegistrationNumber: '113-07-10031',
      companyName: '(주)서울에어컨',
      representativeName: null,
      contactPhone: null,
      address: null,
      groupName: null,
      note: null,
    })).toEqual({
      id: 'partner-uuid-redacted',
      partnerCode: 'P-2026-0001',
      name: '(주)서울에어컨',
      bizNo: '113-07-10031',
      phone: undefined,
    })
  })
})
