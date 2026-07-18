import { describe, expect, it } from 'vitest'

import {
  GROUPWARE_DEFAULT,
  resolveDocumentTemplate,
} from './approvalDefaultTemplate'

describe('document template immutability', () => {
  it('recursively freezes the canonical default', () => {
    expect(Object.isFrozen(GROUPWARE_DEFAULT)).toBe(true)
    expect(Object.isFrozen(GROUPWARE_DEFAULT.document)).toBe(true)
    expect(Object.isFrozen(GROUPWARE_DEFAULT.document.bands)).toBe(true)
    expect(Object.isFrozen(GROUPWARE_DEFAULT.document.bands[0]?.elements)).toBe(true)
  })

  it('returns a deep clone so callers cannot mutate shared template state', () => {
    const resolved = resolveDocumentTemplate(null)
    resolved.document.bands[0]!.elements[0]!.key = 'caller-mutation'

    expect(GROUPWARE_DEFAULT.document.bands[0]!.elements[0]!.key).toBe('approval-title')
    expect(resolveDocumentTemplate(null).document.bands[0]!.elements[0]!.key).toBe('approval-title')
  })
})
