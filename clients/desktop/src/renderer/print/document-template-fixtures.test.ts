import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ReactElement } from 'react'

import { parseDocumentTemplate, type TemplateEnvelope } from './templateSchema'
import { compileApprovalDocument } from './DocumentRenderer'
import { buildApprovalRenderModel, type ApprovalRenderModel } from './approvalRenderModel'
import type { LegacyApprovalDocSection } from './LegacyApprovalDocBody'
import type { ApprovalLineAdminResponse } from '../api/groupwareApproval'

const fixtureDir = resolve(process.cwd(), '../../services/groupware-service/src/test/resources/document-template-fixtures')

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixtureDir, name), 'utf8')) as unknown
}

function parsedFixture(name: string): TemplateEnvelope {
  const parsed = parseDocumentTemplate(fixture(name))
  if (!parsed.ok) throw new Error(`fixture ${name} 는 파싱되어야 합니다: ${parsed.error.message}`)
  return parsed.value
}

function sampleModel(): ApprovalRenderModel {
  const approval: ApprovalLineAdminResponse = {
    approvalId: 'compile-id',
    approvalNo: 'GW-COMPILE-001',
    requesterId: 'requester-id',
    requesterName: '작성자',
    title: '컴파일 검증',
    content: '본문',
    templateId: null,
    templateName: null,
    documentType: 'GROUPWARE_REORDERED_FIXTURE',
    fieldValues: {},
    status: 'APPROVED',
    steps: [],
  }
  return buildApprovalRenderModel({ approval, templateFields: [], attachments: [] })
}

/** compiled body(ReactNode)에서 실제 배치된 본문 섹션 type 순서를 추출한다. */
function bodySectionTypes(body: ReturnType<typeof compileApprovalDocument>['body']): string[] {
  const element = body as ReactElement<{ orderedSections: LegacyApprovalDocSection[] }>
  return element.props.orderedSections.map((section) => section.type)
}

describe('shared document template fixture corpus', () => {
  it('accepts both canonical valid fixtures', () => {
    expect(parseDocumentTemplate(fixture('valid-default.json')).ok).toBe(true)
    expect(parseDocumentTemplate(fixture('valid-reordered-sparse.json')).ok).toBe(true)
    expect(parseDocumentTemplate(fixture('canonical-active-response.json')).ok).toBe(true)
    const parsed = parseDocumentTemplate(fixture('valid-unknown-field.json'))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value).not.toHaveProperty('unknownEnvelopeField')
      expect(parsed.value.document.bands[0]).not.toHaveProperty('unknownBandField')
      expect(parsed.value.document.bands[0].elements[0]).not.toHaveProperty('unknownElementField')
    }
  })

  it.each([
    'invalid-duplicate-key.json',
    'invalid-missing-singleton.json',
    'invalid-placement.json',
    'invalid-unknown-version.json',
    'invalid-paper.json',
  ])('rejects %s', (name) => {
    expect(parseDocumentTemplate(fixture(name)).ok).toBe(false)
  })
})

describe('document template compiler branch coverage', () => {
  it('sparse 재정렬 fixture: META_ROWS 생략→docNo undefined, APPROVAL_GRID 반영, 첨부→본문 순서·FIELD_TABLE 부재', () => {
    const compiled = compileApprovalDocument(parsedFixture('valid-reordered-sparse.json'), sampleModel())
    // hasMetaRows=false → docHeader.docNo 미설정(문서번호 미노출)
    expect(compiled.docHeader.docNo).toBeUndefined()
    // hasApprovalGrid=true → 결재란 steps 반영(작성 step 최소 1개)
    expect(compiled.approvalSteps.length).toBeGreaterThan(0)
    // body 요소: ATTACHMENT_TABLE 가 CONTENT_PARAGRAPHS 보다 앞·FIELD_TABLE 는 부재
    expect(bodySectionTypes(compiled.body)).toEqual(['ATTACHMENT_TABLE', 'CONTENT_PARAGRAPHS'])
  })

  it('default fixture: META_ROWS 존재→docNo 유지, 본문→필드→첨부 순서', () => {
    const compiled = compileApprovalDocument(parsedFixture('valid-default.json'), sampleModel())
    expect(compiled.docHeader.docNo).toBe('GW-COMPILE-001')
    expect(compiled.approvalSteps.length).toBeGreaterThan(0)
    expect(bodySectionTypes(compiled.body)).toEqual(['CONTENT_PARAGRAPHS', 'FIELD_TABLE', 'ATTACHMENT_TABLE'])
  })
})
