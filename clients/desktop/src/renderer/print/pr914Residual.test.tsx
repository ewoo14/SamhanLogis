import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { describe, expect, it } from 'vitest'

import type { ApprovalLineAdminResponse } from '../api/groupwareApproval'
import type { ApprovalTemplateField } from '../api/groupwareApprovalTemplate'
import { GROUPWARE_DEFAULT } from './approvalDefaultTemplate'
import { buildApprovalRenderModel } from './approvalRenderModel'
import { DocumentRenderer } from './DocumentRenderer'
import { parseDocumentTemplate } from './templateSchema'

function renderDocument(element: JSX.Element): string {
  return renderToStaticMarkup(<StaticRouter location="/">{element}</StaticRouter>)
}

function approval(fieldValues: Record<string, string>): ApprovalLineAdminResponse {
  return {
    approvalId: 'approval-1',
    approvalNo: 'GW-PR914-001',
    requesterId: 'requester-1',
    requesterName: '작성자',
    title: 'PR #914 문서',
    content: null,
    templateId: 'template-1',
    templateName: null,
    documentType: 'GROUPWARE_EXPENSE_REPORT',
    fieldValues,
    status: 'APPROVED',
    steps: [],
  }
}

function field(fieldKey: string, label: string): ApprovalTemplateField {
  return {
    fieldKey,
    label,
    fieldType: 'TEXT',
    required: false,
    displayOrder: 1,
    options: [],
    placeholder: null,
  }
}

describe('PR #914 FIELD 참조 게이트', () => {
  it('렌더 모델이 본문 field key를 label과 함께 보존한다', () => {
    const model = buildApprovalRenderModel({
      approval: approval({ expenseItem: '미리보기 지출항목' }),
      templateFields: [field('expenseItem', '지출항목')],
      attachments: [],
    })

    expect(model.body.fieldRows).toEqual([
      { key: 'expenseItem', label: '지출항목', value: '미리보기 지출항목' },
    ])
  })

  it('FIELD binding은 본문 label이 아니라 저장된 key로 실제 값을 렌더한다', () => {
    const model = buildApprovalRenderModel({
      approval: approval({ expenseItem: '미리보기 지출항목' }),
      templateFields: [field('expenseItem', '지출항목')],
      attachments: [],
    })
    const template = {
      ...GROUPWARE_DEFAULT,
      schemaVersion: 2 as const,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
          ? { ...band, elements: [{ key: 'field-probe', type: 'FIELD' as const, binding: 'body.fieldRow[expenseItem]' as const }] }
          : band),
      },
    }

    expect(renderDocument(<DocumentRenderer template={template} model={model} />)).toContain('미리보기 지출항목')
  })

  it('한글 본문 field key를 binding 문법으로 파싱한다', () => {
    const template = structuredClone(GROUPWARE_DEFAULT) as Record<string, unknown>
    template.schemaVersion = 2
    const document = template.document as { bands: Array<{ kind: string; elements: unknown[] }> }
    const body = document.bands.find((band) => band.kind === 'BODY')!
    body.elements = [{ key: 'field-korean', type: 'FIELD', binding: 'body.fieldRow[지출항목]' }]

    expect(parseDocumentTemplate(template).ok).toBe(true)
  })
})
