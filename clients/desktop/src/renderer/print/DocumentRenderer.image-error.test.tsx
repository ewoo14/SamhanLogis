// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StaticRouter } from 'react-router-dom/server'

import { GROUPWARE_DEFAULT } from './approvalDefaultTemplate'
import { buildApprovalRenderModel } from './approvalRenderModel'
import { DocumentRenderer } from './DocumentRenderer'
import { approvalRenderFixtures } from './__fixtures__/approvalRenderFixtures'

const chromiumRejectedVp8lVersionOne = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvA8AAIAA='

function templateWithHeaderImage(elementKey: string, extra: Record<string, unknown> = {}) {
  return {
    ...GROUPWARE_DEFAULT,
    schemaVersion: 2 as const,
    document: {
      ...GROUPWARE_DEFAULT.document,
      bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'HEADER'
        ? {
            ...band,
            elements: [...band.elements, {
              key: elementKey,
              type: 'IMAGE' as const,
              src: chromiumRejectedVp8lVersionOne,
              alt: '저장된 WebP',
              ...extra,
            }],
          }
        : band),
    },
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DocumentRenderer C3 image decode notice', () => {
  it('flow 배치 IMAGE — 렌더 엔진 error를 인쇄 이전 단계의 no-print 경고로 표시한다(수동 이벤트)', () => {
    const fixture = approvalRenderFixtures[0]!
    const template = templateWithHeaderImage('undecodable-saved-image')

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

  /**
   * 🔴 #968 R1 결함1 회귀 가드 — 라이브 실측(PR #968 R1 코멘트): 좌표 배치(geometry 지정) IMAGE는
   * onError 만으로는 첫 진입 경고가 5/5 뜨지 않았다. React가 `<img>`를 DOM에 삽입하기 전에 이미
   * data URL 디코드가 실패해(마운트 전) 마운트 경로의 synthetic onError가 그 native error 이벤트를
   * 못 받는다. jsdom은 이미지를 실제로 디코드하지 않으므로 이 브라우저 레이스 자체를 재현할 수는
   * 없지만(REAL Chromium 라이브 QA로 별도 재현·확인했다 — PR 코멘트), fix가 실제로 의존하는
   * 메커니즘(마운트 후 `HTMLImageElement#decode()`를 직접 호출)은 여기서 결정론적으로 검증한다.
   * `fireEvent.error`를 전혀 쓰지 않는다 — 이게 바로 구 테스트가 원리적으로 이 결함을 못 덮었던 지점이다.
   */
  it('좌표 배치(geometry) IMAGE — decode() 실패만으로 첫 렌더에서 경고를 표시한다(수동 이벤트 디스패치 없음)', async () => {
    const decode = vi.fn().mockRejectedValue(new DOMException('디코드 실패', 'EncodingError'))
    window.HTMLImageElement.prototype.decode = decode

    const fixture = approvalRenderFixtures[0]!
    // useTemplateDraft.ts:165-172 의 IMAGE 기본 geometry와 동일 — 실사용 형태 재현.
    const template = templateWithHeaderImage('positioned-undecodable-image', {
      geometry: { x: 70, y: 0, w: 25, h: 15 },
    })

    render(
      <StaticRouter location="/groupware/approvals/fixture-approval-id">
        <DocumentRenderer
          template={template as never}
          model={buildApprovalRenderModel(fixture.input)}
        />
      </StaticRouter>,
    )

    expect(decode).toHaveBeenCalled()
    const alert = await waitFor(() => screen.getByTestId('document-template-image-error-positioned-undecodable-image'))
    expect(alert.textContent).toContain('현재 화면에서 표시할 수 없습니다')
    expect(alert.classList.contains('no-print')).toBe(true)
  })

  it('decode()가 성공하면 경고를 표시하지 않는다(정상 이미지 회귀 방지)', async () => {
    const decode = vi.fn().mockResolvedValue(undefined)
    window.HTMLImageElement.prototype.decode = decode

    const fixture = approvalRenderFixtures[0]!
    const template = templateWithHeaderImage('positioned-decodable-image', {
      geometry: { x: 70, y: 0, w: 25, h: 15 },
    })

    render(
      <StaticRouter location="/groupware/approvals/fixture-approval-id">
        <DocumentRenderer
          template={template as never}
          model={buildApprovalRenderModel(fixture.input)}
        />
      </StaticRouter>,
    )

    await waitFor(() => expect(decode).toHaveBeenCalled())
    expect(screen.queryByTestId('document-template-image-error-positioned-decodable-image')).toBeNull()
  })
})
