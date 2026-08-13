import { describe, expect, it } from 'vitest'
import { maskCreatedBy } from './maskCreatedBy'

describe('maskCreatedBy', () => {
  it('uses the display resolver contract for UUID variants and SYSTEM', () => {
    expect(maskCreatedBy('\u2063cafebabe-cafe-babe-cafe-babecafebabe\u2063')).toBe('사용자')
    expect(maskCreatedBy('system')).toBe('시스템')
    expect(maskCreatedBy(null)).toBe('시스템')
  })
})
