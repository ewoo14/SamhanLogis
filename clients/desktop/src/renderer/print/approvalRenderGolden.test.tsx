import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'

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

describe('DS-1 frozen golden DOM gate', () => {
  it.each(approvalRenderFixtures)('$id는 frozen과 새 renderer golden이 바이트 동일하다', (fixture) => {
    const model = buildApprovalRenderModel(fixture.input)
    const template = fixture.templateInput === undefined
      ? GROUPWARE_DEFAULT
      : resolveDocumentTemplate(fixture.templateInput)
    const frozenHtml = render(<FrozenApprovalDocLegacy {...fixture.input} />)
    const newHtml = render(
      <DocumentRenderer template={template} model={model} backTo={fixture.input.backTo} />,
    )
    const goldenPath = path.join(goldenDirectory, `${fixture.id}.html`)
    const goldenHtml = readFileSync(goldenPath, 'utf8')

    expect(frozenHtml, `${fixture.id}: frozen !== golden`).toBe(goldenHtml)
    expect(newHtml, `${fixture.id}: new !== golden`).toBe(goldenHtml)
    expect(newHtml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  })
})
