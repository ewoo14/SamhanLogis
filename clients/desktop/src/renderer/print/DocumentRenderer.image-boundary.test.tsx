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
  it('26×2.7px tiny 좌표 격자의 손상 IMAGE는 화면·인쇄 DOM에서 깨진 fallback을 칠하지 않는다', async () => {
    window.HTMLImageElement.prototype.decode = vi.fn().mockRejectedValue(new DOMException('디코드 실패', 'EncodingError'))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const image = this.matches('[data-template-image], [data-template-print-image]')
      if (image) return { x: 100, y: 0, width: 26, height: 20.53125, top: 0, right: 126, bottom: 20.53125, left: 100, toJSON: () => ({}) }
      return { x: 100, y: 2.7, width: 200, height: 10, top: 2.7, right: 300, bottom: 12.7, left: 100, toJSON: () => ({}) }
    })

    const fixture = approvalRenderFixtures[0]!
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2 as const,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => ({
          ...band,
          elements: [
            ...band.elements,
            {
              key: `tiny-${band.kind.toLowerCase()}`,
              type: 'IMAGE' as const,
              src: chromiumRejectedVp8lVersionOne,
              alt: `${band.kind} tiny 이미지`,
              geometry: { x: 0, y: 0, w: 5, h: 3 },
            },
            {
              key: `anchor-${band.kind.toLowerCase()}`,
              type: 'TEXT' as const,
              text: `${band.kind} 기준 문구`,
              geometry: { x: 0, y: 3, w: 100, h: 5 },
            },
          ],
        })),
      },
    }

    render(
      <StaticRouter location="/groupware/approvals/fixture-approval-id">
        <DocumentRenderer template={template as never} model={buildApprovalRenderModel(fixture.input)} />
      </StaticRouter>,
    )

    await waitFor(() => expect(screen.getByTestId('document-template-image-error-summary')).toBeTruthy())

    const imageNodes = Array.from(document.querySelectorAll('[data-template-image], [data-template-print-image]'))
    const anchorNodes = Array.from(document.querySelectorAll('[data-template-element], [data-template-print-element]'))
    const intersects = (left: DOMRect, right: DOMRect) => (
      left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
    )

    expect(imageNodes).toHaveLength(0)
    expect(imageNodes.some((image) => anchorNodes.some((anchor) => intersects(image.getBoundingClientRect(), anchor.getBoundingClientRect())))).toBe(false)
  })

  it('경고는 IMAGE 박스 안에 그리지 않고 아래 좌표 TEXT를 가리지 않는다', async () => {
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

    const alert = await waitFor(() => screen.getByTestId('document-template-image-error-summary'))
    const belowText = document.querySelector(
      '.document-template-v2-elements-ruler [data-template-element="below-image-text"]',
    )

    expect(belowText).not.toBeNull()
    expect(alert.textContent).toContain('저장된 WebP')
    expect(alert.textContent).toContain('positioned-undecodable-image')
    expect(alert.textContent).toContain('이미지를 교체하고 저장하세요')
    expect(alert.closest('.paper')).toBeNull()
    expect(document.querySelector('[data-testid="document-template-image-error-positioned-undecodable-image"]')).toBeNull()
  })
})
