import { describe, expect, it } from 'vitest'
import { resolveSalesExternalUrl } from './salesExternalUrl'

describe('resolveSalesExternalUrl', () => {
  it('packaged build with no injected URL does not fall back to localhost', () => {
    expect(resolveSalesExternalUrl(undefined, false, 'http://localhost:5183')).toBeUndefined()
  })

  it('dev build with no injected URL still opens the local estimate app', () => {
    expect(resolveSalesExternalUrl(undefined, true, 'http://localhost:5183')).toBe(
      'http://localhost:5183',
    )
  })

  it('uses an injected production URL without changing it', () => {
    expect(
      resolveSalesExternalUrl('https://estimate.samhan-air.com/', false, 'http://localhost:5183'),
    ).toBe('https://estimate.samhan-air.com/')
    expect(
      resolveSalesExternalUrl('https://order.samhan-air.com', false, 'http://localhost:5180'),
    ).toBe('https://order.samhan-air.com')
  })

  it('treats an empty injected value as missing', () => {
    expect(resolveSalesExternalUrl('  ', false, 'http://localhost:5180')).toBeUndefined()
  })
})
