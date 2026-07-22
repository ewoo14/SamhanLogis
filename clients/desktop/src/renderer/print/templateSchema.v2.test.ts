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

  it('BLOCKING-1: 부분 지정 style(fontSize/align/bold 각각 단독)은 파싱을 통과한다', () => {
    const variants = [{ fontSize: 14 }, { align: 'center' as const }, { bold: true }]
    for (const style of variants) {
      const result = parseDocumentTemplate({
        ...v2Template,
        document: {
          ...v2Template.document,
          bands: v2Template.document.bands.map((band) => band.kind === 'BODY'
            ? { ...band, elements: [{ ...band.elements[0], style }, band.elements[1]] }
            : band),
        },
      })
      expect(result.ok, JSON.stringify(style)).toBe(true)
    }
  })

  it('BLOCKING-1: 명시적 null로 채워진 style 필드는 미지정과 동일하게 파싱된다(BE round-trip 방어선)', () => {
    const result = parseDocumentTemplate({
      ...v2Template,
      document: {
        ...v2Template.document,
        bands: v2Template.document.bands.map((band) => band.kind === 'BODY'
          ? {
              ...band,
              elements: [
                { ...band.elements[0], style: { fontSize: 14, bold: null, align: null, border: null } },
                band.elements[1],
              ],
            }
          : band),
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const field = result.value.document.bands[1]?.elements[0]
      expect(field && 'style' in field ? field.style : undefined).toEqual({ fontSize: 14 })
    }
  })

  it('M-A: TEXT 문구 상한은 BE와 동일한 4,096자다(4,096 통과·4,097 거부·거부 사유가 길이 초과임을 명시)', () => {
    const atLimit = 'a'.repeat(4096)
    const overLimit = 'a'.repeat(4097)
    const withText = (text: string) => parseDocumentTemplate({
      ...v2Template,
      document: {
        ...v2Template.document,
        bands: v2Template.document.bands.map((band) => band.kind === 'BODY'
          ? { ...band, elements: [band.elements[0], { ...band.elements[1], text }] }
          : band),
      },
    })
    expect(withText(atLimit).ok).toBe(true)
    const rejected = withText(overLimit)
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect(rejected.error.message).toContain('4096')
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
