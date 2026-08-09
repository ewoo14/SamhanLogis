import { describe, expect, it } from 'vitest'
import { asBusinessNumber, asPartnerCode } from './partnerIdentity'

describe('partner identity branded boundary', () => {
  it('브랜드는 런타임 문자열 값을 변경하지 않는다', () => {
    expect(asPartnerCode('P-2026-0001')).toBe('P-2026-0001')
    expect(asBusinessNumber('113-07-10031')).toBe('113-07-10031')
  })
})
