import { describe, expect, it } from 'vitest'
import { shouldUseHashRouter } from './routerSelection'

describe('본체 hash deep-link router contract', () => {
  it('web deployment still opens legacy /#/chat deep links', () => {
    expect(shouldUseHashRouter('web', '#/chat')).toBe(true)
  })

  it('web deployment keeps browser routing for canonical paths', () => {
    expect(shouldUseHashRouter('web', '')).toBe(false)
  })
})
