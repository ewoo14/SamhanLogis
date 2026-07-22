import { describe, expect, it } from 'vitest'

import { parseDocumentTemplate } from './templateSchema'

const v2Template = {
  schemaVersion: 2,
  revision: 1,
  docType: 'GROUPWARE_DS3B',
  name: '문서 편집기 MVP',
  document: {
    paper: 'A4_PORTRAIT',
    bands: [
      {
        key: 'header',
        kind: 'HEADER',
        elements: [
          { key: 'title', type: 'TITLE' },
          { key: 'approval', type: 'APPROVAL_GRID' },
        ],
      },
      {
        key: 'body',
        kind: 'BODY',
        elements: [
          { key: 'field-doc-no', type: 'FIELD', binding: 'header.docNo', geometry: { x: 10, y: 10, w: 40, h: 8 }, style: { bold: true } },
          { key: 'text-body', type: 'TEXT', text: '편집 중인 문구', geometry: { x: 5, y: 25, w: 90, h: 12 }, style: { align: 'center' } },
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

describe('schema v2 parser', () => {
  it('R3: FIELD/TEXT geometry style binding text를 파싱 결과에 보존한다', () => {
    const result = parseDocumentTemplate(v2Template)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(2)
      expect(result.value.document.bands[1]?.elements).toEqual(v2Template.document.bands[1].elements)
    }
  })

  it('FIELD binding은 허용 목록 밖의 경로와 UUID를 거부한다', () => {
    expect(parseDocumentTemplate({
      ...v2Template,
      document: {
        ...v2Template.document,
        bands: v2Template.document.bands.map((band) => band.kind === 'BODY'
          ? { ...band, elements: [{ ...band.elements[0], binding: 'approval.internal-id' }, band.elements[1]] }
          : band),
      },
    }).ok).toBe(false)
  })
})
