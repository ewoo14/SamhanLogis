import { describe, expect, it } from 'vitest'
import { getAutocompleteSelectionStart } from './autocompleteSelection'

describe('getAutocompleteSelectionStart', () => {
  it.each([
    ['HQ-001 · 본사 창고', 'h', 1],
    ['HQ-001 · 본사 창고', ' H ', 1],
    ['HQ-001 · 본사 창고', ' H Q ', 2],
    ['HQ-001 · 본사 창고', '본사', 11],
  ])('finds the selection boundary for %j in %j', (label, draft, expected) => {
    expect(getAutocompleteSelectionStart(label, draft)).toBe(expected)
  })

  it('selects the complete label when the draft is not represented in it', () => {
    expect(getAutocompleteSelectionStart('HQ-001 · 본사 창고', '차량')).toBe(0)
  })
})
