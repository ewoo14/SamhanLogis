import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'

import type { ApprovalLineAdminResponse, ApprovalStepView } from '../api/groupwareApproval'
import type { ApprovalAttachment } from '../api/groupwareApprovalAttachment'
import type { ApprovalTemplateField } from '../api/groupwareApprovalTemplate'
import { GROUPWARE_DEFAULT } from './approvalDefaultTemplate'
import { buildApprovalRenderModel, type FrozenApprovalDocInput } from './approvalRenderModel'
import { compileApprovalDocument, DocumentRenderer } from './DocumentRenderer'

function render(element: JSX.Element): string {
  return renderToStaticMarkup(<StaticRouter location="/">{element}</StaticRouter>)
}

function step(sequence: number, input: Partial<ApprovalStepView> = {}): ApprovalStepView {
  return {
    sequence,
    stepType: 'USER',
    approverGroupId: null,
    approverId: `approver-${sequence}`,
    approverName: input.approverName ?? `결재자${sequence}`,
    status: input.status ?? 'APPROVED',
    decidedAt: input.decidedAt ?? `2026-07-${String(sequence).padStart(2, '0')}T10:00:00`,
    reason: null,
  }
}

function approval(input: Partial<ApprovalLineAdminResponse> = {}): ApprovalLineAdminResponse {
  return {
    approvalId: input.approvalId ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    approvalNo: input.approvalNo ?? 'GW-DS1-001',
    requesterId: input.requesterId ?? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    requesterName: input.requesterName ?? '작성자',
    title: input.title ?? 'DS-1 회귀 문서',
    content: 'content' in input ? input.content ?? null : '첫 문단\n\n둘째 문단',
    templateId: input.templateId ?? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    templateName: null,
    fieldValues: input.fieldValues ?? { amount: '12000', memo: '검증' },
    status: input.status ?? 'APPROVED',
    steps: input.steps ?? [step(1), step(2)],
  }
}

function templateField(input: Partial<ApprovalTemplateField> & Pick<ApprovalTemplateField, 'fieldKey'>): ApprovalTemplateField {
  return {
    fieldKey: input.fieldKey,
    label: input.label ?? input.fieldKey,
    fieldType: input.fieldType ?? 'TEXT',
    required: false,
    displayOrder: input.displayOrder ?? 1,
    options: [],
    placeholder: null,
  }
}

function attachment(input: Partial<ApprovalAttachment>): ApprovalAttachment {
  return {
    id: input.id ?? 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    attachmentType: input.attachmentType ?? 'FILE',
    label: input.label ?? null,
    displayOrder: input.displayOrder ?? 1,
    refSlipNo: input.refSlipNo ?? null,
    refSlipType: null,
    refPartnerCode: null,
    refPartnerName: input.refPartnerName ?? null,
    refPeriod: input.refPeriod ?? null,
    refDocType: null,
    refDocNo: input.refDocNo ?? null,
    refDocLabel: input.refDocLabel ?? null,
    fileName: input.fileName ?? '문서.pdf',
    contentType: null,
    fileSize: null,
    downloadUrl: null,
  }
}

function input(overrides: Partial<FrozenApprovalDocInput> = {}): FrozenApprovalDocInput {
  return {
    approval: approval(),
    templateFields: [
      templateField({ fieldKey: 'amount', label: '금액', fieldType: 'NUMBER', displayOrder: 1 }),
      templateField({ fieldKey: 'memo', label: '메모', displayOrder: 2 }),
    ],
    attachments: [attachment({ displayOrder: 2, label: '첨부' })],
    backTo: '/groupware/approvals/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ...overrides,
  }
}

describe('buildApprovalRenderModel', () => {
  it('UUID와 내부 id 없이 projection slot을 만든다', () => {
    const model = buildApprovalRenderModel(input())
    const serialized = JSON.stringify(model)

    expect(model.header).toEqual({
      title: 'DS-1 회귀 문서',
      docNo: 'GW-DS1-001',
      issueDate: '2026-07-02T10:00:00',
    })
    expect(model.body.fieldRows).toEqual([
      { label: '금액', value: '12,000' },
      { label: '메모', value: '검증' },
    ])
    expect(model.body.attachments).toEqual([
      { typeLabel: '파일', title: '첨부', detail: '' },
    ])
    expect(serialized).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(serialized).not.toContain('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    expect(serialized).not.toContain('dddddddd-dddd-4ddd-8ddd-dddddddddddd')
  })

  it('NUMBER만 krw로 포맷하고 numeric TEXT는 원문을 보존한다', () => {
    const model = buildApprovalRenderModel(input({
      approval: approval({ fieldValues: { amount: 'bad-number', code: '1234' } }),
      templateFields: [
        templateField({ fieldKey: 'amount', label: '금액', fieldType: 'NUMBER', displayOrder: 1 }),
        templateField({ fieldKey: 'code', label: '코드', fieldType: 'TEXT', displayOrder: 2 }),
      ],
    }))

    expect(model.body.fieldRows).toEqual([
      { label: '금액', value: 'bad-number' },
      { label: '코드', value: '1234' },
    ])
  })
})

describe('compileApprovalDocument and DocumentRenderer', () => {
  it('기본 template을 PrintLayout props 동형 slot으로 compile한다', () => {
    const model = buildApprovalRenderModel(input())
    const compiled = compileApprovalDocument(GROUPWARE_DEFAULT, model)

    expect(compiled.paper).toBe('a4-portrait')
    expect(compiled.docHeader).toEqual(model.header)
    expect(compiled.approvalSteps).toEqual(model.approvalSteps)
    expect(compiled.closingNote).toBe(model.closing.note)
    expect(render(<DocumentRenderer template={GROUPWARE_DEFAULT} model={model} backTo="/back" />)).toContain(
      '상세로 돌아가기',
    )
  })

  it('5개를 넘는 approval step은 기존 PrintLayout slice로 결재칸이 잘린다', () => {
    const model = buildApprovalRenderModel(input({
      approval: approval({ steps: [step(1), step(2), step(3), step(4), step(5), step(6)] }),
    }))
    const html = render(<DocumentRenderer template={GROUPWARE_DEFAULT} model={model} />)

    expect(html.match(/class="print-approval-cell"/g)).toHaveLength(5)
    expect(html).toContain('>합의</div>')
    expect(html).not.toContain('>결재</div>')
  })

  it('body element 순서를 template 순서대로 조립하고 빈 section은 생략한다', () => {
    const model = buildApprovalRenderModel(input({
      approval: approval({ content: null, fieldValues: {} }),
      templateFields: [],
      attachments: [],
    }))
    const template = {
      ...GROUPWARE_DEFAULT,
      document: {
        ...GROUPWARE_DEFAULT.document,
        bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
          ? { ...band, elements: [...band.elements].reverse() }
          : band),
      },
    }
    const html = render(<DocumentRenderer template={template} model={model} />)

    expect(html).not.toContain('결재문서 내용')
    expect(html).not.toContain('결재문서 세부 필드')
    expect(html).not.toContain('결재문서 첨부')
    expect(html).toContain('print-approval-body')
  })
})
