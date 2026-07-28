// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StaticRouter } from 'react-router-dom/server'

import { GROUPWARE_DEFAULT } from './approvalDefaultTemplate'
import { buildApprovalRenderModel } from './approvalRenderModel'
import { DocumentRenderer } from './DocumentRenderer'
import { approvalRenderFixtures } from './__fixtures__/approvalRenderFixtures'

const chromiumRejectedVp8lVersionOne = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvA8AAIAA='

describe('DocumentRenderer C3 image decode notice', () => {
  it('렌더 엔진 error를 인쇄 이전 단계의 no-print 경고로 표시한다', () => {
    const fixture = approvalRenderFixtures[0]!
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2 as const,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'HEADER'
          ? {
              ...band,
              elements: [...band.elements, {
                key: 'undecodable-saved-image',
                type: 'IMAGE' as const,
                src: chromiumRejectedVp8lVersionOne,
                alt: '저장된 WebP',
              }],
            }
          : band),
      },
    }

    render(
      <StaticRouter location="/groupware/approvals/fixture-approval-id">
        <DocumentRenderer
          template={template as never}
          model={buildApprovalRenderModel(fixture.input)}
        />
      </StaticRouter>,
    )

    const images = screen.getAllByAltText('저장된 WebP')
    fireEvent.error(images[0]!)

    const alert = screen.getByTestId('document-template-image-error-undecodable-saved-image')
    expect(alert.textContent).toContain('현재 화면에서 표시할 수 없습니다')
    expect(alert.classList.contains('no-print')).toBe(true)
  })
})
