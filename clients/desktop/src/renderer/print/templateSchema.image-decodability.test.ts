// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import * as templateSchema from './templateSchema'

const validPng = 'data:image/png;base64,iVBORw0KGgo='

afterEach(() => {
  vi.restoreAllMocks()
})

describe('#968 저장 차단 이미지 식별', () => {
  it('디코드 불가 이미지 전체를 밴드·대체 문구·key와 함께 반환한다', async () => {
    const findUndecodableImages = (templateSchema as Record<string, unknown>).findUndecodableImages
    expect(findUndecodableImages).toBeTypeOf('function')

    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException('디코드 실패', 'EncodingError')),
    })
    const document = {
      paper: 'A4_PORTRAIT' as const,
      bands: (['HEADER', 'BODY', 'FOOTER'] as const).map((kind, bandIndex) => ({
        key: kind.toLowerCase(),
        kind,
        elements: [
          {
            key: `grid-image-${bandIndex + 1}`,
            type: 'IMAGE' as const,
            src: validPng,
            alt: `GRID 이미지 ${bandIndex + 1}`,
          },
        ],
      })),
    }

    const issues = await (findUndecodableImages as (input: typeof document) => Promise<Array<Record<string, string>>>)(document)

    expect(issues.map(({ key, alt, bandKind }) => ({ key, alt, bandKind }))).toEqual([
      { key: 'grid-image-1', alt: 'GRID 이미지 1', bandKind: 'HEADER' },
      { key: 'grid-image-2', alt: 'GRID 이미지 2', bandKind: 'BODY' },
      { key: 'grid-image-3', alt: 'GRID 이미지 3', bandKind: 'FOOTER' },
    ])

    const saveError = new templateSchema.ImageSourceDecodeError(issues as never)
    expect(saveError.message).toContain('머리말 · GRID 이미지 1 (grid-image-1)')
    expect(saveError.message).toContain('본문 · GRID 이미지 2 (grid-image-2)')
    expect(saveError.message).toContain('맺음말 · GRID 이미지 3 (grid-image-3)')
    expect(saveError.message).toContain('이미지를 바꾼 뒤 다시 저장하세요')
  })
})
