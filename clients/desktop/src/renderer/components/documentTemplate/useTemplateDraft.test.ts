import { describe, expect, it } from 'vitest'

import { createUniqueElementKey, moveElementToBand } from './useTemplateDraft'
import type { DocumentPayload } from '../../print/templateSchema'

describe('template draft helpers', () => {
  it('R8: 요소 추가 key는 band·기존 요소 전체에서 전역 유일하다', () => {
    const existingKeys = new Set(['header', 'body', 'footer', 'text-1', 'text-2'])

    const first = createUniqueElementKey('TEXT', existingKeys)
    existingKeys.add(first)
    const second = createUniqueElementKey('TEXT', existingKeys)

    expect(first).not.toBe(second)
    expect(existingKeys.has(second)).toBe(false)
  })

  it('B1: IMAGE는 HEADER/BODY/FOOTER 사이를 실제로 이동할 수 있다', () => {
    const document: DocumentPayload = {
      paper: 'A4_PORTRAIT',
      bands: [
        { key: 'header', kind: 'HEADER', elements: [{ key: 'logo', type: 'IMAGE', src: '/print-logo.svg', alt: '로고' }] },
        { key: 'body', kind: 'BODY', elements: [] },
        { key: 'footer', kind: 'FOOTER', elements: [] },
      ],
    }

    const moved = moveElementToBand(document, 'logo', 'FOOTER')

    expect(moved.bands.find((band) => band.kind === 'HEADER')?.elements).toEqual([])
    expect(moved.bands.find((band) => band.kind === 'FOOTER')?.elements[0]).toMatchObject({ key: 'logo', type: 'IMAGE' })
  })
})
