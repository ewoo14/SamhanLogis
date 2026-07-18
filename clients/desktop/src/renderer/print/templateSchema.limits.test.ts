import { describe, expect, it } from 'vitest'

import { parseDocumentTemplate } from './templateSchema'

const base = {
  schemaVersion: 1,
  revision: 1,
  docType: 'GROUPWARE_LIMIT_TEST',
  name: '상한 테스트',
  document: {
    paper: 'A4_PORTRAIT',
    bands: [
      { key: 'header', kind: 'HEADER', elements: [
        { key: 'title', type: 'TITLE' },
        { key: 'approval', type: 'APPROVAL_GRID' },
      ] },
      { key: 'body', kind: 'BODY', elements: [{ key: 'content', type: 'CONTENT_PARAGRAPHS' }] },
      { key: 'footer', kind: 'FOOTER', elements: [{ key: 'closing', type: 'CLOSING' }] },
    ],
  },
} as const

describe('document template limits', () => {
  it('rejects a key longer than 100 characters', () => {
    const input = structuredClone(base) as Record<string, any>
    input.document.bands[0].elements[0].key = 'k'.repeat(101)

    expect(parseDocumentTemplate(input).ok).toBe(false)
  })

  it('rejects more than 32 bands and more than 64 elements in a band', () => {
    const tooManyBands = structuredClone(base) as Record<string, any>
    tooManyBands.document.bands = [
      ...tooManyBands.document.bands,
      ...Array.from({ length: 30 }, (_, index) => ({
        key: `extra-${index}`,
        kind: 'BODY',
        elements: [],
      })),
    ]
    const tooManyElements = structuredClone(base) as Record<string, any>
    tooManyElements.document.bands[1].elements = [
      ...tooManyElements.document.bands[1].elements,
      ...Array.from({ length: 64 }, (_, index) => ({
        key: `extra-element-${index}`,
        type: 'CONTENT_PARAGRAPHS',
      })),
    ]

    expect(parseDocumentTemplate(tooManyBands).ok).toBe(false)
    expect(parseDocumentTemplate(tooManyElements).ok).toBe(false)
  })
})
