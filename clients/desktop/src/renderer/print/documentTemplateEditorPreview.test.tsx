import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { describe, expect, it } from 'vitest'

import type { ApprovalTemplateField } from '../api/groupwareApprovalTemplate'
import { GROUPWARE_DEFAULT } from './approvalDefaultTemplate'
import { buildPreviewFieldRows, buildPreviewModel } from './documentTemplateEditorPreview'
import { DocumentRenderer } from './DocumentRenderer'
import type { DocElement } from './templateSchema'

function renderDocument(element: JSX.Element): string {
  return renderToStaticMarkup(<StaticRouter location="/">{element}</StaticRouter>)
}

function fieldOption(fieldKey: string, label: string): Pick<ApprovalTemplateField, 'fieldKey' | 'label'> {
  return { fieldKey, label }
}

// 실측(2026-07-23, groupware_db.approval_template_fields, EXPENSE_REPORT/LEAVE_REQUEST, is_deleted=false):
//   EXPENSE_REPORT: expenseItem(지출항목) amount(금액) account(계정과목) spentAt(지출일) memo(적요)
//   LEAVE_REQUEST : leaveType(휴가종류) startDate(시작일) endDate(종료일) reason(사유)
// PREVIEW_MODEL이 과거 하드코딩했던 accountCode/expenseDate/summary는 mock.ts 전용 키였고 실서버와
// 달랐다(A-2) — 리뷰 지시대로 expenseItem 하나만이 아니라 실서버 9개 필드 전부를 지나는 단언을 세운다.
const EXPENSE_REPORT_FIELDS = [
  fieldOption('expenseItem', '지출항목'),
  fieldOption('amount', '금액'),
  fieldOption('account', '계정과목'),
  fieldOption('spentAt', '지출일'),
  fieldOption('memo', '적요'),
]
const LEAVE_REQUEST_FIELDS = [
  fieldOption('leaveType', '휴가종류'),
  fieldOption('startDate', '시작일'),
  fieldOption('endDate', '종료일'),
  fieldOption('reason', '사유'),
]
const ALL_9_REAL_FIELDS = [...EXPENSE_REPORT_FIELDS, ...LEAVE_REQUEST_FIELDS]

/** binding이 `body.fieldRow[key]`인 FIELD 요소 하나만 담은 v2 문서를 만든다(미리보기 편집기와 동형). */
function templateWithFieldBinding(fieldKey: string) {
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

/** FIELD_TABLE 레거시 요소 하나만 담은 v2 문서를 만든다 — model.body.fieldRows 전체를 그대로 렌더한다. */
function templateWithFieldTable() {
  return {
    ...GROUPWARE_DEFAULT,
    schemaVersion: 2 as const,
    document: {
      ...GROUPWARE_DEFAULT.document,
      bands: GROUPWARE_DEFAULT.document.bands.map((band) => band.kind === 'BODY'
        ? { ...band, elements: [{ key: 'approval-fields', type: 'FIELD_TABLE' as DocElement['type'] }] }
        : band),
    },
  }
}

describe('SONNET5 라운드 fix N-2 — buildPreviewFieldRows는 fieldOptions에서만 파생한다', () => {
  it('실서버 9개 필드 전부에서 key/label이 그대로 보존되고 값은 진단 문구가 아니다', () => {
    const rows = buildPreviewFieldRows(ALL_9_REAL_FIELDS)

    expect(rows).toHaveLength(9)
    for (const field of ALL_9_REAL_FIELDS) {
      const row = rows.find((candidate) => candidate.key === field.fieldKey)
      expect(row, `${field.fieldKey} 행이 없다`).toBeDefined()
      expect(row!.label).toBe(field.label)
      expect(row!.value.length).toBeGreaterThan(0)
      expect(row!.value).not.toContain('사용할 수 없는')
      expect(row!.value).not.toContain('undefined')
    }
  })

  it('fieldOptions가 비어 있으면(문서 유형 미선택) 빈 배열을 만든다 — 다른 유형 필드로 채우지 않는다', () => {
    expect(buildPreviewFieldRows([])).toEqual([])
  })
})

describe('SONNET5 라운드 fix N-2 — 미리보기가 실제 문서 유형의 실제 본문 필드를 보여준다', () => {
  it.each(EXPENSE_REPORT_FIELDS)('지출결의서 필드 $fieldKey($label)을 선택하면 미리보기가 그 값을 렌더한다', (field) => {
    const model = buildPreviewModel({ fieldOptions: EXPENSE_REPORT_FIELDS })
    const html = renderDocument(<DocumentRenderer template={templateWithFieldBinding(field.fieldKey)} model={model} />)

    expect(html).toContain(`미리보기 ${field.label}`)
    expect(html).not.toContain('사용할 수 없는 본문 필드 참조')
  })

  it.each(LEAVE_REQUEST_FIELDS)('휴가신청서 필드 $fieldKey($label)을 선택하면 미리보기가 그 값을 렌더한다', (field) => {
    const model = buildPreviewModel({ fieldOptions: LEAVE_REQUEST_FIELDS })
    const html = renderDocument(<DocumentRenderer template={templateWithFieldBinding(field.fieldKey)} model={model} />)

    expect(html).toContain(`미리보기 ${field.label}`)
    expect(html).not.toContain('사용할 수 없는 본문 필드 참조')
  })

  it('P2 — 지출결의서를 편집 중일 때 미리보기 FIELD_TABLE에 휴가신청서 필드가 섞이지 않는다', () => {
    const model = buildPreviewModel({ fieldOptions: EXPENSE_REPORT_FIELDS })
    const html = renderDocument(<DocumentRenderer template={templateWithFieldTable()} model={model} />)

    for (const field of EXPENSE_REPORT_FIELDS) {
      expect(html, `${field.label}(지출결의서 필드)이 보여야 한다`).toContain(field.label)
    }
    for (const field of LEAVE_REQUEST_FIELDS) {
      expect(html, `${field.label}(휴가신청서 필드)이 섞여 보이면 P2 위반이다`).not.toContain(field.label)
    }
  })

  it('P2 — 휴가신청서를 편집 중일 때 미리보기 FIELD_TABLE에 지출결의서 필드가 섞이지 않는다', () => {
    const model = buildPreviewModel({ fieldOptions: LEAVE_REQUEST_FIELDS })
    const html = renderDocument(<DocumentRenderer template={templateWithFieldTable()} model={model} />)

    for (const field of LEAVE_REQUEST_FIELDS) {
      expect(html, `${field.label}(휴가신청서 필드)이 보여야 한다`).toContain(field.label)
    }
    for (const field of EXPENSE_REPORT_FIELDS) {
      expect(html, `${field.label}(지출결의서 필드)이 섞여 보이면 P2 위반이다`).not.toContain(field.label)
    }
  })
})
