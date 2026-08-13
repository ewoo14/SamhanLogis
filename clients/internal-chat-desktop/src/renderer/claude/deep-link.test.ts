import { describe, expect, it } from 'vitest'
import { buildDeepLink, validateDeepLink } from './deep-link'

describe('Claude deep-link boundary', () => {
  it('builds an allowed route without UUIDs', () => {
    const link = buildDeepLink('arologis', '/dispatches/manual')
    expect(link).toBe('samhan://arologis/dispatches/manual')
    expect(link).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i)
  })

  it('rejects links that could bypass the target app permission boundary', () => {
    expect(() => validateDeepLink('samhan://arologis/admin/permissions')).toThrow('허용되지 않은')
    expect(() => validateDeepLink('https://evil.example/steal')).toThrow('허용되지 않은')
    expect(() => validateDeepLink('samhan://arologis/dispatches/detail/550e8400-e29b-41d4-a716-446655440000')).toThrow('UUID')
  })
})
