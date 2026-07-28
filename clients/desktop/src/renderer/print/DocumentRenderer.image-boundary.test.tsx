// @vitest-environment jsdom

import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StaticRouter } from 'react-router-dom/server'

import { GROUPWARE_DEFAULT } from './approvalDefaultTemplate'
import { buildApprovalRenderModel } from './approvalRenderModel'
import { DocumentRenderer } from './DocumentRenderer'
import { approvalRenderFixtures } from './__fixtures__/approvalRenderFixtures'

const chromiumRejectedVp8lVersionOne = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvA8AAIAA='

function templateWithPositionedImageAndText() {
  return {
    ...GROUPWARE_DEFAULT,
    schemaVersion: 2 as const,
    document: {
      ...GROUPWARE_DEFAULT.document,
      bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'HEADER'
        ? {
            ...band,
            elements: [
              ...band.elements,
              {
                key: 'positioned-undecodable-image',
                type: 'IMAGE' as const,
                src: chromiumRejectedVp8lVersionOne,
                alt: '저장된 WebP',
                geometry: { x: 70, y: 0, w: 25, h: 15 },
              },
              {
                key: 'below-image-text',
                type: 'TEXT' as const,
                text: '아래 요소',
                geometry: { x: 70, y: 25, w: 25, h: 10 },
              },
            ],
          }
        : band),
    },
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('#968 SOL 결함1 — 좌표 IMAGE 경고 경계', () => {
  it('경고는 IMAGE geometry 높이 안에서 잘려 아래 좌표 TEXT를 가리지 않는다', async () => {
    window.HTMLImageElement.prototype.decode = vi.fn().mockRejectedValue(new DOMException('디코드 실패', 'EncodingError'))

    const fixture = approvalRenderFixtures[0]!
    render(
      <StaticRouter location="/groupware/approvals/fixture-approval-id">
        <DocumentRenderer
          template={templateWithPositionedImageAndText() as never}
          model={buildApprovalRenderModel(fixture.input)}
        />
      </StaticRouter>,
    )

    const alert = await waitFor(() => screen.getByTestId('document-template-image-error-positioned-undecodable-image'))
    const belowText = document.querySelector(
      '.document-template-v2-elements-ruler [data-template-element="below-image-text"]',
    )

    expect(belowText).not.toBeNull()
    expect(alert.style.height).toBe('15%')
    expect(alert.style.overflow).toBe('hidden')
    expect(alert.style.whiteSpace).toBe('nowrap')
    expect(alert.style.textOverflow).toBe('ellipsis')
  })
})
