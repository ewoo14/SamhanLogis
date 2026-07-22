import { describe, expect, it } from 'vitest'

import { createUniqueElementKey } from './useTemplateDraft'

describe('template draft helpers', () => {
  it('R8: 요소 추가 key는 band·기존 요소 전체에서 전역 유일하다', () => {
    const existingKeys = new Set(['header', 'body', 'footer', 'text-1', 'text-2'])

    const first = createUniqueElementKey('TEXT', existingKeys)
    existingKeys.add(first)
    const second = createUniqueElementKey('TEXT', existingKeys)

    expect(first).not.toBe(second)
    expect(existingKeys.has(second)).toBe(false)
  })
})
