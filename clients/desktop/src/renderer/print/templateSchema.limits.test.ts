import { describe, expect, it } from 'vitest'

import { GROUPWARE_DEFAULT } from './approvalDefaultTemplate'
import { isAllowedImageSourceFormat, maxImageBytesForDocument, parseDocumentTemplate } from './templateSchema'

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

function boundaryDocument() {
  const document = structuredClone(GROUPWARE_DEFAULT.document)
  document.bands.find((band) => band.kind === 'HEADER')!.elements.push({
    key: 'image-1',
    type: 'IMAGE',
    src: '/print-logo.svg',
    alt: 'aaaa',
    geometry: { x: 70, y: 0, w: 25, h: 15 },
  })
  document.bands.find((band) => band.kind === 'BODY')!.elements.push({
    key: 'text-1',
    type: 'TEXT',
    text: 'x'.repeat(679),
  })
  return document
}

function dataUrlWithBytes(mime: 'png' | 'jpeg' | 'webp', signature: readonly number[], bytes: number): string {
  const raw = new Uint8Array(bytes)
  raw.set(signature)
  return `data:image/${mime};base64,${Buffer.from(raw).toString('base64')}`
}

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

  it('S1: 파일 선택 경계는 현재 document의 64KB 합성 상한을 넘지 않는다', () => {
    const document = structuredClone(GROUPWARE_DEFAULT.document)
    const header = document.bands.find((band) => band.kind === 'HEADER')!
    header.elements.push({ key: 'uploaded-image', type: 'IMAGE', src: '', alt: '업로드 이미지' })
    const maxBytes = maxImageBytesForDocument(document, 'uploaded-image')

    expect(maxBytes).toBeGreaterThan(0)
    expect(maxBytes).toBeLessThan(50 * 1024)

    const base64For = (bytes: number) => {
      const raw = new Uint8Array(bytes)
      raw.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      return Buffer.from(raw).toString('base64')
    }
    const atLimit = structuredClone(document)
    const atLimitElement = atLimit.bands[0]!.elements.find((element) => element.key === 'uploaded-image')!
    atLimitElement.src = `data:image/png;base64,${base64For(maxBytes)}`
    const atLimitEnvelope = { ...base, schemaVersion: 2, document: atLimit }
    expect(parseDocumentTemplate(atLimitEnvelope).ok).toBe(true)

    const overLimit = structuredClone(document)
    const overLimitElement = overLimit.bands[0]!.elements.find((element) => element.key === 'uploaded-image')!
    overLimitElement.src = `data:image/png;base64,${base64For(maxBytes + 1)}`
    expect(parseDocumentTemplate({ ...base, schemaVersion: 2, document: overLimit })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ENVELOPE' },
    })
  })

  // ubuntu-latest: Node의 TextEncoder·Buffer만 사용하며 경로 구분자, 로케일, OS 파일 선택기에 의존하지 않는다.
  it.each([
    ['PNG', 'png', [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
    ['JPEG', 'jpeg', [0xFF, 0xD8, 0xFF]],
    ['WebP', 'webp', [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]],
  ] as const)('표시된 최대 KB의 정확한 경계에서도 %s는 형식·문서 예산을 함께 통과한다', (label, mime, signature) => {
    const document = boundaryDocument()
    const computedMaxBytes = maxImageBytesForDocument(document, 'image-1')
    const displayedKB = Math.floor(computedMaxBytes / 1024)
    const fileBytes = displayedKB * 1024
    const src = dataUrlWithBytes(mime, signature, fileBytes)
    const withImage = structuredClone(document)
    withImage.bands.find((band) => band.kind === 'HEADER')!.elements.find((element) => element.key === 'image-1')!.src = src
    const finalDocumentBytes = new TextEncoder().encode(JSON.stringify(withImage)).byteLength
    const parsed = parseDocumentTemplate({ ...GROUPWARE_DEFAULT, schemaVersion: 2, document: withImage })
    const observed = {
      currentParseOk: parsed.ok,
      displayedKB,
      computedMaxBytes,
      fileBytes,
      formatGate: isAllowedImageSourceFormat(src),
      finalDocumentBytes,
      requestLimit: 64 * 1024,
      parseCode: parsed.ok ? null : parsed.error.code,
    }
    if (process.env.REPORT_IMAGE_BOUNDARY === '1') console.log(JSON.stringify({ label, ...observed }))

    expect(observed.currentParseOk, JSON.stringify(observed)).toBe(true)
    expect(observed.formatGate).toBe(true)
  })

  // ubuntu-latest: 순수 JSON·TextEncoder 계산만 사용하며 경로 구분자·OS 네이티브 API에 의존하지 않는다.
  it('형식별 data URL 접두사 상한을 계산해 기존 PNG 경계를 보존한다', () => {
    const document = boundaryDocument()

    expect(maxImageBytesForDocument(document, 'image-1', 'png')).toBe(48129)
    expect(maxImageBytesForDocument(document, 'image-1', 'jpeg')).toBe(48126)
    expect(maxImageBytesForDocument(document, 'image-1', 'webp')).toBe(48126)
  })
})
