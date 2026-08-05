import { describe, expect, it } from 'vitest'
import {
  decodeEstimateSpecification,
  encodeEstimateSpecification,
} from './estimateSpecificationProvenance'

describe('estimate specification provenance', () => {
  it('round-trips catalog values without exposing the marker', () => {
    const encoded = encodeEstimateSpecification('4HP', 'CATALOG')
    expect(encoded).not.toBe('4HP')
    expect(decodeEstimateSpecification(encoded)).toEqual({ value: '4HP', source: 'CATALOG' })
  })

  it('treats an unmarked persisted value as user input, including a catalog-original revert', () => {
    expect(decodeEstimateSpecification('4HP')).toEqual({ value: '4HP', source: 'USER' })
    expect(encodeEstimateSpecification('4HP', 'USER')).toBe('4HP')
  })
})
