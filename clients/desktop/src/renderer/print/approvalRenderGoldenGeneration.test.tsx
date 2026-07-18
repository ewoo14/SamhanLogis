// 이 테스트는 일반 실행에서는 golden을 변경하지 않는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { describe, expect, it } from 'vitest'

import { GROUPWARE_DEFAULT, resolveDocumentTemplate } from './approvalDefaultTemplate'
import { buildApprovalRenderModel } from './approvalRenderModel'
import { DocumentRenderer } from './DocumentRenderer'
import { FrozenApprovalDocLegacy } from './__frozen__/FrozenApprovalDocLegacy'
import { approvalRenderFixtures } from './__fixtures__/approvalRenderFixtures'

const goldenDirectory = fileURLToPath(new URL('./__goldens__/', import.meta.url))

function render(element: JSX.Element): string {
  return renderToStaticMarkup(
    <StaticRouter location="/groupware/approvals/fixture-approval-id">
      {element}
    </StaticRouter>,
  )
}

describe('DS-1 explicit golden generation guard', () => {
  it('일반 실행은 golden을 변경하지 않고 명시 script만 갱신한다', () => {
    if (process.env['DS1_GOLDEN_UPDATE'] !== '1') {
      expect(true).toBe(true)
      return
    }

    mkdirSync(goldenDirectory, { recursive: true })
    for (const fixture of approvalRenderFixtures) {
      const template = fixture.templateInput === undefined
        ? GROUPWARE_DEFAULT
        : resolveDocumentTemplate(fixture.templateInput)
      const frozenHtml = render(<FrozenApprovalDocLegacy {...fixture.input} />)
      const newHtml = render(
        <DocumentRenderer
          template={template}
          model={buildApprovalRenderModel(fixture.input)}
          backTo={fixture.input.backTo}
        />,
      )
      expect(newHtml, `${fixture.id}: frozen/new DOM drift`).toBe(frozenHtml)
      writeFileSync(path.join(goldenDirectory, `${fixture.id}.html`), frozenHtml, 'utf8')
    }
  })
})
