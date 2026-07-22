import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'

import { GROUPWARE_DEFAULT } from './approvalDefaultTemplate'
import { approvalRenderFixtures } from './__fixtures__/approvalRenderFixtures'
import { buildApprovalRenderModel } from './approvalRenderModel'
import { DocumentRenderer } from './DocumentRenderer'
import { upcastDocumentTemplate } from './templateSchema'

function render(template: typeof GROUPWARE_DEFAULT): string {
  const fixture = approvalRenderFixtures[0]!
  const model = buildApprovalRenderModel(fixture.input)
  return renderToStaticMarkup(React.createElement(
    StaticRouter,
    { location: '/' },
    React.createElement(DocumentRenderer, { template, model }),
  ))
}

describe('v1 to v2 upcast', () => {
  it('R5: 업캐스트 결과는 schema v2이면서 레거시 렌더 DOM을 바꾸지 않는다', () => {
    const upcasted = upcastDocumentTemplate(GROUPWARE_DEFAULT, 1)

    expect(upcasted.schemaVersion).toBe(2)
    expect(upcasted.document).toEqual(GROUPWARE_DEFAULT.document)
    expect(render(upcasted as typeof GROUPWARE_DEFAULT)).toBe(render(GROUPWARE_DEFAULT))
  })
})
