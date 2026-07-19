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
  it('accepts docType length 70 and rejects length 71', () => {
    const atLimit = { ...base, docType: 'D'.repeat(70) }
    expect(parseDocumentTemplate(atLimit).ok).toBe(true)

    const overLimit = { ...base, docType: 'D'.repeat(71) }
    expect(parseDocumentTemplate(overLimit).ok).toBe(false)
  })

  it('accepts key length 100 and rejects key length 101', () => {
    const atLimit = structuredClone(base) as Record<string, any>
    atLimit.document.bands[0].elements[0].key = 'k'.repeat(100)
    expect(parseDocumentTemplate(atLimit).ok).toBe(true)

    const input = structuredClone(base) as Record<string, any>
    input.document.bands[0].elements[0].key = 'k'.repeat(101)

    expect(parseDocumentTemplate(input).ok).toBe(false)
  })

  it('accepts 32 bands and rejects 33 bands', () => {
    const atLimit = structuredClone(base) as Record<string, any>
    atLimit.document.bands = [
      ...atLimit.document.bands,
      ...Array.from({ length: 29 }, (_, index) => ({
        key: `extra-${index}`,
        kind: 'BODY',
        elements: [],
      })),
    ]
    expect(parseDocumentTemplate(atLimit).ok).toBe(true)

    const tooManyBands = structuredClone(base) as Record<string, any>
    tooManyBands.document.bands = [
      ...tooManyBands.document.bands,
      ...Array.from({ length: 30 }, (_, index) => ({
        key: `extra-${index}`,
        kind: 'BODY',
        elements: [],
      })),
    ]
    expect(parseDocumentTemplate(tooManyBands).ok).toBe(false)
  })

  it('checks the 64/65 element boundary before semantic element-count validation', () => {
    const atLimit = structuredClone(base) as Record<string, any>
    atLimit.document.bands[1].elements = [
      ...atLimit.document.bands[1].elements,
      ...Array.from({ length: 63 }, (_, index) => ({
        key: `extra-element-${index}`,
        type: 'CONTENT_PARAGRAPHS',
      })),
    ]
    expect(parseDocumentTemplate(atLimit)).toMatchObject({ ok: false, error: { code: 'INVALID_ELEMENT_COUNT' } })

    const tooManyElements = structuredClone(base) as Record<string, any>
    tooManyElements.document.bands[1].elements = [
      ...tooManyElements.document.bands[1].elements,
      ...Array.from({ length: 64 }, (_, index) => ({
        key: `extra-element-${index}`,
        type: 'CONTENT_PARAGRAPHS',
      })),
    ]
    expect(parseDocumentTemplate(tooManyElements)).toMatchObject({ ok: false, error: { code: 'INVALID_ELEMENT' } })
  })

  it('accepts JSON depth 16 and rejects JSON depth 17', () => {
    const atLimit = structuredClone(base) as Record<string, any>
    let atLimitNode: Record<string, any> = atLimit.document
    for (let depth = 0; depth < 16; depth++) {
      atLimitNode.nested = {}
      atLimitNode = atLimitNode.nested
    }
    expect(parseDocumentTemplate(atLimit).ok).toBe(true)

    const tooDeep = structuredClone(base) as Record<string, any>
    let tooDeepNode: Record<string, any> = tooDeep.document
    for (let depth = 0; depth < 17; depth++) {
      tooDeepNode.nested = {}
      tooDeepNode = tooDeepNode.nested
    }
    expect(parseDocumentTemplate(tooDeep).ok).toBe(false)
  })

  it('accepts request document bytes 65536 and rejects 65537', () => {
    const atLimit = structuredClone(base) as Record<string, any>
    atLimit.document.padding = ''
    const baseBytes = new TextEncoder().encode(JSON.stringify(atLimit.document)).byteLength
    atLimit.document.padding = 'x'.repeat(65536 - baseBytes)
    expect(new TextEncoder().encode(JSON.stringify(atLimit.document)).byteLength).toBe(65536)
    expect(parseDocumentTemplate(atLimit).ok).toBe(true)

    const overLimit = structuredClone(atLimit) as Record<string, any>
    overLimit.document.padding += 'x'
    expect(new TextEncoder().encode(JSON.stringify(overLimit.document)).byteLength).toBe(65537)
    expect(parseDocumentTemplate(overLimit)).toMatchObject({ ok: false, error: { code: 'INVALID_ENVELOPE' } })
  })
})
