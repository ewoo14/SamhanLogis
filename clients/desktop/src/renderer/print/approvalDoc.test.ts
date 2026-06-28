import { describe, it, expect } from 'vitest'

import type {
  ApprovalLineAdminResponse,
  ApprovalStepView,
} from '../api/groupwareApproval'
import type { ApprovalAttachment } from '../api/groupwareApprovalAttachment'
import type { ApprovalTemplateField } from '../api/groupwareApprovalTemplate'
import {
  attachmentDetails,
  attachmentTitle,
  buildApprovalSteps,
  buildDocHeader,
  contentParagraphs,
  fieldRows,
  finalDecidedAt,
} from './approvalDoc'

function step(
  input: Partial<ApprovalStepView> & Pick<ApprovalStepView, 'sequence'>,
): ApprovalStepView {
  return {
    sequence: input.sequence,
    stepType: input.stepType ?? 'USER',
    approverGroupId: input.approverGroupId ?? null,
    approverId: input.approverId ?? `approver-${input.sequence}`,
    approverName: 'approverName' in input
      ? input.approverName ?? null
      : `결재자${input.sequence}`,
    status: input.status ?? 'PENDING',
    decidedAt: input.decidedAt ?? null,
    reason: input.reason ?? null,
  }
}

function approval(input: Partial<ApprovalLineAdminResponse> = {}): ApprovalLineAdminResponse {
  return {
    approvalId: input.approvalId ?? 'approval-id',
    approvalNo: input.approvalNo ?? 'GW-2026-001',
    requesterId: input.requesterId ?? 'requester-id',
    requesterName: 'requesterName' in input
      ? input.requesterName ?? null
      : '작성자',
    title: input.title ?? '결재문서',
    content: input.content ?? null,
    templateId: input.templateId ?? null,
    templateName: input.templateName ?? null,
    fieldValues: input.fieldValues ?? {},
    status: input.status ?? 'PENDING',
    steps: input.steps ?? [],
  }
}

function templateField(
  input: Partial<ApprovalTemplateField> & Pick<ApprovalTemplateField, 'fieldKey'>,
): ApprovalTemplateField {
  return {
    fieldKey: input.fieldKey,
    label: input.label ?? input.fieldKey,
    fieldType: input.fieldType ?? 'TEXT',
    required: input.required ?? false,
    displayOrder: input.displayOrder ?? 0,
    options: input.options ?? [],
    placeholder: input.placeholder ?? null,
  }
}

function attachment(input: Partial<ApprovalAttachment> = {}): ApprovalAttachment {
  return {
    id: input.id ?? 'attachment-id',
    attachmentType: input.attachmentType ?? 'SLIP_REF',
    label: input.label ?? null,
    displayOrder: input.displayOrder ?? 0,
    refSlipNo: input.refSlipNo ?? null,
    refSlipType: input.refSlipType ?? null,
    refPartnerCode: input.refPartnerCode ?? null,
    refPartnerName: input.refPartnerName ?? null,
    refPeriod: input.refPeriod ?? null,
    refDocType: input.refDocType ?? null,
    refDocNo: input.refDocNo ?? null,
    refDocLabel: input.refDocLabel ?? null,
    fileName: input.fileName ?? null,
    contentType: input.contentType ?? null,
    fileSize: input.fileSize ?? null,
    downloadUrl: input.downloadUrl ?? null,
  }
}

describe('buildApprovalSteps', () => {
  it('작성칸 이름은 requesterName 이 null 이면 - 로 표시한다', () => {
    expect(buildApprovalSteps(approval({ requesterName: null }))[0]).toEqual({
      label: '작성',
      name: '-',
    })
  })

  it('2-step 결재선은 작성, 합의, 결재 라벨로 구성한다', () => {
    const steps = buildApprovalSteps(approval({
      steps: [step({ sequence: 1 }), step({ sequence: 2 })],
    }))

    expect(steps.map((item) => item.label)).toEqual(['작성', '합의', '결재'])
  })

  it('단일 step 결재선은 작성, 결재 라벨로 구성한다', () => {
    const steps = buildApprovalSteps(approval({
      steps: [step({ sequence: 1 })],
    }))

    expect(steps.map((item) => item.label)).toEqual(['작성', '결재'])
  })

  it('APPROVED step 만 decidedAt 을 채운다', () => {
    const steps = buildApprovalSteps(approval({
      steps: [
        step({ sequence: 1, status: 'APPROVED', decidedAt: '2026-06-01T09:00:00' }),
        step({ sequence: 2, status: 'PENDING', decidedAt: '2026-06-02T09:00:00' }),
        step({ sequence: 3, status: 'REJECTED', decidedAt: '2026-06-03T09:00:00' }),
      ],
    }))

    expect(steps[1]?.decidedAt).toBe('2026-06-01T09:00:00')
    expect(steps[2]?.decidedAt).toBeUndefined()
    expect(steps[3]?.decidedAt).toBeUndefined()
  })

  it('approverName 이 null 이면 결재칸 이름을 - 로 표시한다', () => {
    const steps = buildApprovalSteps(approval({
      steps: [step({ sequence: 1, approverName: null, status: 'PENDING' })],
    }))

    expect(steps[1]?.name).toBe('-')
  })

  it('빈 steps 는 작성칸만 반환하고 결재칸을 만들지 않는다', () => {
    const steps = buildApprovalSteps(approval({ steps: [] }))

    expect(steps).toHaveLength(1)
    expect(steps[0]?.label).toBe('작성')
  })

  it('sequence 순으로 정렬한다', () => {
    const steps = buildApprovalSteps(approval({
      steps: [
        step({ sequence: 3, approverName: '3번' }),
        step({ sequence: 1, approverName: '1번' }),
        step({ sequence: 2, approverName: '2번' }),
      ],
    }))

    expect(steps.map((item) => item.name)).toEqual(['작성자', '1번', '2번', '3번'])
  })
})

describe('finalDecidedAt', () => {
  it('APPROVED step 의 decidedAt 만 반환한다', () => {
    expect(finalDecidedAt([
      step({ sequence: 1, status: 'PENDING', decidedAt: '2026-06-01T09:00:00' }),
      step({ sequence: 2, status: 'APPROVED', decidedAt: '2026-06-02T09:00:00' }),
    ])).toBe('2026-06-02T09:00:00')
  })

  it('여러 APPROVED 중 최고 sequence 의 decidedAt 을 반환한다', () => {
    expect(finalDecidedAt([
      step({ sequence: 3, status: 'APPROVED', decidedAt: '2026-06-03T09:00:00' }),
      step({ sequence: 1, status: 'APPROVED', decidedAt: '2026-06-01T09:00:00' }),
      step({ sequence: 2, status: 'APPROVED', decidedAt: '2026-06-02T09:00:00' }),
    ])).toBe('2026-06-03T09:00:00')
  })

  it('REJECTED step 의 decidedAt 은 제외한다', () => {
    expect(finalDecidedAt([
      step({ sequence: 1, status: 'APPROVED', decidedAt: '2026-06-01T09:00:00' }),
      step({ sequence: 2, status: 'REJECTED', decidedAt: '2026-06-02T09:00:00' }),
    ])).toBe('2026-06-01T09:00:00')
  })

  it('전부 PENDING 이면 undefined 를 반환한다', () => {
    expect(finalDecidedAt([
      step({ sequence: 1, status: 'PENDING' }),
      step({ sequence: 2, status: 'PENDING' }),
    ])).toBeUndefined()
  })
})

describe('buildDocHeader', () => {
  it('issueDate 가 있으면 헤더에 포함한다', () => {
    expect(buildDocHeader(approval({
      title: '품의서',
      approvalNo: 'GW-2026-002',
      steps: [step({ sequence: 1, status: 'APPROVED', decidedAt: '2026-06-04T10:00:00' })],
    }))).toEqual({
      title: '품의서',
      docNo: 'GW-2026-002',
      issueDate: '2026-06-04T10:00:00',
    })
  })

  it('issueDate 가 없으면 키 자체를 생략한다', () => {
    const header = buildDocHeader(approval({
      steps: [step({ sequence: 1, status: 'PENDING' })],
    }))

    expect('issueDate' in header).toBe(false)
  })
})

describe('fieldRows', () => {
  it('템플릿 displayOrder 순서대로 정렬한다', () => {
    const rows = fieldRows(
      { amount: '1000', memo: '메모' },
      [
        templateField({ fieldKey: 'memo', label: '메모', displayOrder: 2 }),
        templateField({ fieldKey: 'amount', label: '금액', displayOrder: 1 }),
      ],
    )

    expect(rows.map((row) => row.key)).toEqual(['amount', 'memo'])
  })

  it('빈 문자열과 공백 value 는 제외한다', () => {
    const rows = fieldRows(
      { amount: ' ', memo: '내용', empty: '' },
      [
        templateField({ fieldKey: 'amount', label: '금액', displayOrder: 1 }),
        templateField({ fieldKey: 'memo', label: '메모', displayOrder: 2 }),
      ],
    )

    expect(rows.map((row) => row.key)).toEqual(['memo'])
  })

  it('템플릿에 없는 key 는 뒤에 추가 필드 N 라벨로 붙인다', () => {
    const rows = fieldRows(
      { memo: '내용', extraA: 'A', extraB: 'B' },
      [templateField({ fieldKey: 'memo', label: '메모', displayOrder: 1 })],
    )

    expect(rows.map((row) => row.label)).toEqual(['메모', '추가 필드 1', '추가 필드 2'])
  })

  it('fieldType 을 전달한다', () => {
    const rows = fieldRows(
      { amount: '12000' },
      [templateField({ fieldKey: 'amount', label: '금액', fieldType: 'NUMBER' })],
    )

    expect(rows[0]?.fieldType).toBe('NUMBER')
  })

  it('템플릿 label 을 우선 사용한다', () => {
    const rows = fieldRows(
      { amount: '12000' },
      [templateField({ fieldKey: 'amount', label: '청구 금액' })],
    )

    expect(rows[0]?.label).toBe('청구 금액')
  })
})

describe('attachmentTitle', () => {
  it('label 을 우선 사용한다', () => {
    expect(attachmentTitle(attachment({
      label: '사용자 라벨',
      refDocLabel: '참조 라벨',
      fileName: 'approval.pdf',
    }))).toBe('사용자 라벨')
  })

  it('label 이 null 이면 refDocLabel 을 사용한다', () => {
    expect(attachmentTitle(attachment({
      label: null,
      refDocLabel: '참조 라벨',
      fileName: 'approval.pdf',
    }))).toBe('참조 라벨')
  })

  it('label 과 refDocLabel 이 null 이면 fileName 을 사용한다', () => {
    expect(attachmentTitle(attachment({
      label: null,
      refDocLabel: null,
      fileName: 'approval.pdf',
    }))).toBe('approval.pdf')
  })

  it('label, refDocLabel, fileName 이 모두 null 이면 - 로 표시한다', () => {
    expect(attachmentTitle(attachment({
      label: null,
      refDocLabel: null,
      fileName: null,
    }))).toBe('-')
  })
})

describe('attachmentDetails', () => {
  it('refSlipNo 가 있으면 stripSlipNoZeros 를 적용한다', () => {
    expect(attachmentDetails(attachment({ refSlipNo: '2026/01/01-001' }))).toEqual(['2026/01/01-1'])
  })

  it('refSlipNo 가 null 이고 refDocNo 가 있으면 refDocNo 를 사용한다', () => {
    expect(attachmentDetails(attachment({ refDocNo: 'DOC-001' }))).toEqual(['DOC-001'])
  })

  it('빈 항목은 제외한다', () => {
    expect(attachmentDetails(attachment())).toEqual([])
  })

  it('refPartnerName 과 refPeriod 를 함께 표시한다', () => {
    expect(attachmentDetails(attachment({
      refSlipNo: '2026/01/01-001',
      refPartnerName: '삼한상사',
      refPeriod: '2026-01',
    }))).toEqual(['2026/01/01-1', '삼한상사', '2026-01'])
  })
})

describe('contentParagraphs', () => {
  it('null 은 빈 배열로 변환한다', () => {
    expect(contentParagraphs(null)).toEqual([])
  })

  it('멀티라인을 분리하고 trim 한 뒤 빈 줄은 제외한다', () => {
    expect(contentParagraphs(' 첫 줄 \n\n  둘째 줄\r\n   \n셋째 줄  ')).toEqual([
      '첫 줄',
      '둘째 줄',
      '셋째 줄',
    ])
  })
})
