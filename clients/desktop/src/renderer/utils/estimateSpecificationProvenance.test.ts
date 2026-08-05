import { describe, expect, it } from 'vitest'
import {
  decodeEstimateSpecification,
  encodeEstimateSpecification,
} from './estimateSpecificationProvenance'

describe('estimate specification provenance', () => {
  it('round-trips catalog values without exposing the marker', () => {
    const encoded = encodeEstimateSpecification('4HP', 'CATALOG')
    expect(encoded).toBe('4HP')
    expect(decodeEstimateSpecification('\u20604HP')).toEqual({ value: '4HP', source: 'CATALOG' })
  })

  it.each([49, 50])('keeps a %i-character catalog value within the server specification limit', (length) => {
    const specification = '가'.repeat(length)
    const encoded = encodeEstimateSpecification(specification, 'CATALOG')
    expect(encoded).toBe(specification)
    expect(encoded.length).toBe(length)
  })

  it('treats an unmarked persisted value as user input, including a catalog-original revert', () => {
    expect(decodeEstimateSpecification('4HP')).toEqual({ value: '4HP', source: 'USER' })
    expect(encodeEstimateSpecification('4HP', 'USER')).toBe('4HP')
  })

  it('keeps a 50-character user value unchanged', () => {
    const specification = '나'.repeat(50)
    expect(encodeEstimateSpecification(specification, 'USER')).toBe(specification)
    expect(decodeEstimateSpecification(specification)).toEqual({ value: specification, source: 'USER' })
  })
})
