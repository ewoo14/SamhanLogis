import { describe, expect, it } from 'vitest'
import { findMissingProductIds } from './productLinkWarning'

describe('findMissingProductIds', () => {
  it('returns only line products absent from a successful bulk lookup', () => {
    expect(findMissingProductIds(['p-1', 'p-2', 'p-2'], ['p-1'])).toEqual(['p-2'])
  })

  it('does not warn for a normal slip whose all products are present', () => {
    expect(findMissingProductIds(['p-1', 'p-2'], ['p-1', 'p-2'])).toEqual([])
  })

  it('does not treat a failed lookup as a deleted product', () => {
    expect(findMissingProductIds(['p-1'], [], ['p-1'])).toEqual([])
  })
})
