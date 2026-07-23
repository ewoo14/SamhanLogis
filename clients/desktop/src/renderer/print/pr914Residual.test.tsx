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

/** binding이 `body.fieldRow[key]`인 FIELD 요소 하나만 담은 v2 문서를 만든다. */
function templateWithFieldBinding(fieldKey: string): typeof GROUPWARE_DEFAULT & { schemaVersion: 2 } {
  return {
    ...GROUPWARE_DEFAULT,
    schemaVersion: 2 as const,
    document: {
      ...GROUPWARE_DEFAULT.document,
      bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
        ? { ...band, elements: [{ key: 'field-probe', type: 'FIELD' as const, binding: `body.fieldRow[${fieldKey}]` as const }] }
        : band),
    },
  }
}

describe('SONNET5 라운드 fix N-1 — 완성된 결재문서 지면에 진단 문구가 나타나지 않는다', () => {
  it('실서버 지출결의서처럼 필드는 알려져 있지만(memo, required=false) 값이 비어 있으면 진단 문구 없이 빈 칸으로 렌더한다', () => {
    // 실측: groupware_db.approval_template_fields — EXPENSE_REPORT.memo(적요) required=false.
    // 이 승인 건은 memo를 채우지 않았다(정상적인 업무 상황 — "값이 빈 것"이지 "참조가 잘못된 것"이 아니다).
    const model = buildApprovalRenderModel({
      approval: approval({ expenseItem: '미리보기 지출항목' }), // memo 키 자체가 없음 = 빈 문자열 입력과 동일한 실사용자 결과
      templateFields: [field('expenseItem', '지출항목'), field('memo', '적요')],
      attachments: [],
    })

    const html = renderDocument(<DocumentRenderer template={templateWithFieldBinding('memo')} model={model} />)

    expect(html).not.toContain('사용할 수 없는 본문 필드 참조')
    expect(html).not.toContain('[사용할 수 없는')
  })

  it('양식 작성 당시 존재했으나 지금은 이 결재유형에 없는 참조(진짜 깨진 참조)도 진단 문구를 지면에 싣지 않는다', () => {
    // F2(가리킬 수 없는 값을 사용자가 아는 것)는 편집기 ElementInspector 경고가 담당한다 — 완성된
    // 결재문서 자체는 두 사건(빈 값/깨진 참조) 모두 조용히 빈 칸으로 렌더해야 한다(디버그 문자열 금지).
    const model = buildApprovalRenderModel({
      approval: approval({ expenseItem: '미리보기 지출항목' }),
      templateFields: [field('expenseItem', '지출항목')],
      attachments: [],
    })

    const html = renderDocument(<DocumentRenderer template={templateWithFieldBinding('definitelyRemovedFieldKey')} model={model} />)

    expect(html).not.toContain('사용할 수 없는 본문 필드 참조')
    expect(html).not.toContain('[사용할 수 없는')
  })

  it('값이 있는 필드는 여전히 정상적으로 그 값을 렌더한다(회귀 방지)', () => {
    const model = buildApprovalRenderModel({
      approval: approval({ expenseItem: '미리보기 지출항목' }),
      templateFields: [field('expenseItem', '지출항목')],
      attachments: [],
    })

    const html = renderDocument(<DocumentRenderer template={templateWithFieldBinding('expenseItem')} model={model} />)

    expect(html).toContain('미리보기 지출항목')
    expect(html).not.toContain('사용할 수 없는 본문 필드 참조')
  })
})

/** BODY에 geometry가 있는 TEXT 요소 하나만 담은 v2 문서를 만든다 — PositionedElementBand로 들어간다. */
function templateWithPositionedText(text: string) {
  return {
    ...GROUPWARE_DEFAULT,
    schemaVersion: 2 as const,
    document: {
      ...GROUPWARE_DEFAULT.document,
      bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
        ? {
            ...band,
            elements: [{
              key: 'text-probe',
              type: 'TEXT' as const,
              text,
              geometry: { x: 0, y: 0, w: 100, h: 10 },
            }],
          }
        : band),
    },
  }
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('SONNET5 라운드 fix N-7(Q-1) — FIELD/TEXT 인쇄 측정 사본이 실제 DOM과 같은 속성을 중복 발행하지 않는다', () => {
  it('data-template-element는 화면(실제) 사본에만 붙고, 인쇄 측정 사본은 다른 속성을 쓴다 — #869 회귀 가드가 기대하는 toHaveCount(1)의 전제', () => {
    const model = buildApprovalRenderModel({ approval: approval({}), templateFields: [], attachments: [] })

    const html = renderDocument(<DocumentRenderer template={templateWithPositionedText('Q1 검증 문구')} model={model} />)

    // IMAGE는 이미 이 패턴을 따른다(data-template-image vs data-template-print-image) — FIELD/TEXT도
    // 같은 대칭을 가져야 실 DOM에서 [data-template-element] 쿼리가 화면 사본 1개만 매칭한다.
    expect(countOccurrences(html, 'data-template-element="text-probe"')).toBe(1)
    expect(countOccurrences(html, 'data-template-print-element="text-probe"')).toBe(1)
    // 인쇄 측정 사본에도 실제 문구 텍스트가 있어야 한다(측정용으로 계속 기능해야 하므로 — 속성 이름만
    // 바뀌고 렌더링 자체가 빠지면 안 된다).
    expect(countOccurrences(html, 'Q1 검증 문구')).toBe(2)
  })
})
