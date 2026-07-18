import { describe, expect, it } from 'vitest'

import {
  parseDocumentTemplate,
  paperToPrintLayout,
  upcastDocumentTemplate,
} from './templateSchema'
import {
  GROUPWARE_DEFAULT,
  resolveApprovalDocumentTemplate,
} from './approvalDefaultTemplate'

const validTemplate = {
  schemaVersion: 1,
  revision: 3,
  docType: 'GROUPWARE_EXPENSE',
  name: '지출결의서 기본 양식',
  document: {
    paper: 'A4_PORTRAIT',
    bands: [
      {
        key: 'header',
        kind: 'HEADER',
        elements: [
          { key: 'title', type: 'TITLE' },
          { key: 'meta', type: 'META_ROWS' },
          { key: 'approval', type: 'APPROVAL_GRID' },
        ],
      },
      {
        key: 'body',
        kind: 'BODY',
        elements: [
          { key: 'content', type: 'CONTENT_PARAGRAPHS' },
          { key: 'fields', type: 'FIELD_TABLE' },
          { key: 'attachments', type: 'ATTACHMENT_TABLE' },
        ],
      },
      {
        key: 'footer',
        kind: 'FOOTER',
        elements: [{ key: 'closing', type: 'CLOSING' }],
      },
    ],
  },
} as const

describe('parseDocumentTemplate', () => {
  it('허용된 discriminated union 요소를 파싱한다', () => {
    const result = parseDocumentTemplate(validTemplate)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.document.paper).toBe('A4_PORTRAIT')
      expect(result.value.document.bands[1]?.elements[0]).toEqual({
        key: 'content',
        type: 'CONTENT_PARAGRAPHS',
      })
    }
  })

  it.each([
    ['TITLE', 'BODY'],
    ['APPROVAL_GRID', 'FOOTER'],
    ['CLOSING', 'HEADER'],
    ['FIELD_TABLE', 'HEADER'],
  ])('%s를 허용되지 않은 %s band에 두면 거부한다', (type, kind) => {
    const input = structuredClone(validTemplate) as Record<string, unknown>
    const document = input.document as { bands: Array<{ kind: string; elements: Array<{ type: string }> }> }
    const band = document.bands.find((item) => item.elements.some((element) => element.type === type))!
    band.kind = kind

    const result = parseDocumentTemplate(input)

    expect(result.ok).toBe(false)
  })

  it('필수 요소 중복과 문서 key 중복을 거부한다', () => {
    const input = structuredClone(validTemplate) as Record<string, unknown>
    const document = input.document as { bands: Array<{ elements: Array<{ key: string; type: string }> }> }
    document.bands[0]!.elements.push({ key: 'title-2', type: 'TITLE' })
    document.bands[1]!.elements[0]!.key = 'title'

    expect(parseDocumentTemplate(input).ok).toBe(false)
  })

  it('미지원 schemaVersion과 element type을 거부한다', () => {
    const unknownVersion = { ...validTemplate, schemaVersion: 99 }
    const unknownElement = structuredClone(validTemplate) as Record<string, unknown>
    const document = unknownElement.document as { bands: Array<{ elements: Array<Record<string, string>> }> }
    document.bands[1]!.elements[0]!.type = 'UNKNOWN'

    expect(parseDocumentTemplate(unknownVersion).ok).toBe(false)
    expect(parseDocumentTemplate(unknownElement).ok).toBe(false)
  })

  it('순환 참조와 bigint JSON은 throw하지 않고 INVALID_ENVELOPE로 수렴한다', () => {
    const cyclic = structuredClone(validTemplate) as Record<string, any>
    cyclic.document.self = cyclic.document
    expect(parseDocumentTemplate(cyclic)).toMatchObject({ ok: false, error: { code: 'INVALID_ENVELOPE' } })

    const bigint = structuredClone(validTemplate) as Record<string, any>
    bigint.document.value = BigInt(1)
    expect(parseDocumentTemplate(bigint)).toMatchObject({ ok: false, error: { code: 'INVALID_ENVELOPE' } })
  })
})

describe('document template compatibility', () => {
  it('schema version 1을 upcast하고 다른 version은 명시적으로 거부한다', () => {
    expect(upcastDocumentTemplate(validTemplate, 1)).toEqual(validTemplate)
    expect(() => upcastDocumentTemplate(validTemplate, 2)).toThrow('지원하지 않는 문서 양식 버전')
  })

  it('paper mapping은 A4 portrait만 지원한다', () => {
    expect(paperToPrintLayout('A4_PORTRAIT')).toBe('a4-portrait')
    expect(() => paperToPrintLayout('A4_LANDSCAPE' as never)).toThrow('지원하지 않는 용지')
  })
})

describe('approval default template', () => {
  it('기본 양식은 canonical GROUPWARE_DEFAULT 레이아웃이다', () => {
    expect(resolveApprovalDocumentTemplate(null)).toEqual(GROUPWARE_DEFAULT)
    expect(resolveApprovalDocumentTemplate(undefined)).toEqual(GROUPWARE_DEFAULT)
    expect(GROUPWARE_DEFAULT.document.bands.flatMap((band) => band.elements).map((element) => element.type)).toEqual([
      'TITLE',
      'META_ROWS',
      'APPROVAL_GRID',
      'CONTENT_PARAGRAPHS',
      'FIELD_TABLE',
      'ATTACHMENT_TABLE',
      'CLOSING',
    ])
  })

  it('활성 결재양식 code는 GROUPWARE docType으로 해석한다', () => {
    const resolved = resolveApprovalDocumentTemplate({
      id: 'template-id',
      code: 'TRAVEL',
      name: '출장 품의',
      description: null,
      active: true,
      displayOrder: 1,
      fields: [],
    })

    expect(resolved.docType).toBe('GROUPWARE_TRAVEL')
    expect(resolved.document).toEqual(GROUPWARE_DEFAULT.document)
  })
})
