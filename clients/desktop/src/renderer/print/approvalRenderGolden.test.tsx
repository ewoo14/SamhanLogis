import { readdirSync, readFileSync } from 'node:fs'
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
  it('fixture/golden 개수·대응 가드 — truth-table 축소 시 조용한 커버리지 소실 방지', () => {
    // truth-table fixture 총수 앵커 — 배열이 줄면 golden 커버리지가 조용히 사라지므로 명시 고정.
    expect(approvalRenderFixtures.length).toBe(18)

    // id 중복은 두 fixture 가 한 golden 을 공유해 커버리지가 소실되므로 고유해야 한다.
    const uniqueIds = new Set(approvalRenderFixtures.map((fixture) => fixture.id))
    expect(uniqueIds.size).toBe(approvalRenderFixtures.length)

    // golden 디렉토리의 .html 파일수 === fixture수, 그리고 각 fixture 는 대응 golden 을 가진다.
    const goldenFiles = new Set(
      readdirSync(goldenDirectory).filter((name) => name.endsWith('.html')),
    )
    expect(goldenFiles.size).toBe(approvalRenderFixtures.length)
    for (const fixture of approvalRenderFixtures) {
      expect(goldenFiles.has(`${fixture.id}.html`), `${fixture.id}: golden 누락`).toBe(true)
    }
  })

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
