import { describe, expect, it } from 'vitest'
import { maskCreatedBy } from './maskCreatedBy'

describe('arologis maskCreatedBy', () => {
  it('uses the display resolver contract for UUID variants and SYSTEM', () => {
    expect(maskCreatedBy('urn：uuid：ＣＡＦＥＢＡＢＥ‐ＣＡＦＥ‐ＢＡＢＥ‐ＣＡＦＥ‐ＢＡＢＥＣＡＦＥＢＡＢＥ')).toBe('사용자')
    expect(maskCreatedBy('system')).toBe('시스템')
    expect(maskCreatedBy(undefined)).toBe('시스템')
  })
})
