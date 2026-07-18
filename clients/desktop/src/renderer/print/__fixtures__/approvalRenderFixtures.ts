/** DS-1 결재 렌더러 truth-table fixture 모음. */
import type { ApprovalLineAdminResponse, ApprovalStepView } from '../../api/groupwareApproval'
import type { ApprovalAttachment } from '../../api/groupwareApprovalAttachment'
import type { ApprovalTemplateField } from '../../api/groupwareApprovalTemplate'
import type { FrozenApprovalDocInput } from '../approvalRenderModel'

export interface ApprovalRenderFixture {
  id: string
  input: FrozenApprovalDocInput
  templateInput?: unknown
}

function step(sequence: number, input: Partial<ApprovalStepView> = {}): ApprovalStepView {
  return {
    sequence,
    stepType: 'USER',
    approverGroupId: null,
    // approverId 는 렌더 모델에서 투영 제외되므로 override 를 허용해도 golden 은 불변이다.
    // (F12 UUID 누출 가드가 approverId 에 실 UUID 를 주입하기 위해 사용)
    approverId: input.approverId ?? `fixture-approver-${sequence}`,
    approverName: 'approverName' in input ? input.approverName ?? null : `결재자${sequence}`,
    status: input.status ?? 'APPROVED',
    decidedAt: 'decidedAt' in input
      ? input.decidedAt ?? null
      : `2026-07-${String(Math.min(sequence, 9)).padStart(2, '0')}T10:00:00`,
    reason: null,
  }
}

function approval(input: Partial<ApprovalLineAdminResponse> = {}): ApprovalLineAdminResponse {
  return {
    approvalId: input.approvalId ?? 'fixture-approval-id',
    approvalNo: input.approvalNo ?? 'GW-FIXTURE-001',
    requesterId: input.requesterId ?? 'fixture-requester-id',
    requesterName: 'requesterName' in input ? input.requesterName ?? null : '작성자',
    title: input.title ?? 'DS-1 fixture 문서',
    content: 'content' in input ? input.content ?? null : '첫 문단\n둘째 문단',
    templateId: input.templateId ?? 'fixture-template-id',
    templateName: null,
    fieldValues: input.fieldValues ?? {},
    status: input.status ?? 'APPROVED',
    steps: input.steps ?? [step(1)],
  }
}

function field(input: Partial<ApprovalTemplateField> & Pick<ApprovalTemplateField, 'fieldKey'>): ApprovalTemplateField {
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

function attachment(input: Partial<ApprovalAttachment> = {}): ApprovalAttachment {
  return {
    id: input.id ?? 'fixture-attachment-id',
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
    fileName: input.fileName ?? null,
    contentType: null,
    fileSize: null,
    downloadUrl: null,
  }
}

function input(
  approvalInput: Partial<ApprovalLineAdminResponse> = {},
  templateFields: ApprovalTemplateField[] = [],
  attachments: ApprovalAttachment[] = [],
): FrozenApprovalDocInput {
  return {
    approval: approval(approvalInput),
    templateFields,
    attachments,
    backTo: '/groupware/approvals/fixture-approval-id',
  }
}

function invalidTemplate(): unknown {
  return {
    schemaVersion: 1,
    revision: 1,
    docType: 'GROUPWARE_INVALID',
    name: '위반 양식',
    document: {
      paper: 'A4_PORTRAIT',
      bands: [{
        key: 'wrong-header',
        kind: 'HEADER',
        elements: [
          { key: 'title', type: 'TITLE' },
          { key: 'approval', type: 'APPROVAL_GRID' },
          { key: 'closing', type: 'CLOSING' },
        ],
      }],
    },
  }
}

const longContent = Array.from({ length: 40 }, (_, index) => `긴 본문 ${index + 1} — 다중 페이지 pagination DOM 회귀 확인`).join('\n\n')

export const approvalRenderFixtures: ApprovalRenderFixture[] = [
  { id: 'F1-single-step', input: input({}, [], []) },
  { id: 'F2-raw-0-step', input: input({ steps: [] }) },
  { id: 'F2-raw-4-step', input: input({ steps: [step(1), step(2), step(3), step(4)] }) },
  { id: 'F2-raw-5-step', input: input({ steps: [step(1), step(2), step(3), step(4), step(5)] }) },
  { id: 'F2-raw-6-step', input: input({ steps: [step(1), step(2), step(3), step(4), step(5), step(6)] }) },
  {
    id: 'F3-unsorted',
    input: input({ steps: [step(3), step(1), step(2)] }),
  },
  {
    id: 'F4-status-mixed',
    input: input({ steps: [
      step(1, { status: 'APPROVED', decidedAt: '2026-07-01T10:00:00' }),
      step(2, { status: 'PENDING', decidedAt: '2026-07-02T10:00:00' }),
      step(3, { status: 'REJECTED', decidedAt: '2026-07-03T10:00:00' }),
    ] }),
  },
  {
    id: 'F5-null-names',
    input: input({ requesterName: null, steps: [step(1, { approverName: null, status: 'PENDING', decidedAt: null })] }),
  },
  {
    id: 'F6-number-format',
    input: input(
      { fieldValues: { validNumber: '1234567', invalidNumber: 'not-a-number', numericText: '1234567' } },
      [
        field({ fieldKey: 'validNumber', label: '유효 금액', fieldType: 'NUMBER', displayOrder: 1 }),
        field({ fieldKey: 'invalidNumber', label: '무효 금액', fieldType: 'NUMBER', displayOrder: 2 }),
        field({ fieldKey: 'numericText', label: '숫자 텍스트', fieldType: 'TEXT', displayOrder: 3 }),
      ],
    ),
  },
  {
    id: 'F7-orphan-field',
    input: input({ fieldValues: { orphan: '고아 값' } }, [field({ fieldKey: 'known', label: '알려진 필드' })]),
  },
  { id: 'F8-invalid-template-fallback', input: input(), templateInput: invalidTemplate() },
  {
    id: 'F9-attachments-reverse-fallback',
    input: input({}, [], [
      attachment({ attachmentType: 'FILE', displayOrder: 3, label: null, fileName: '파일.txt' }),
      attachment({ attachmentType: 'PARTNER_LEDGER_REF', displayOrder: 2, refDocLabel: '원장 참조', refPartnerName: '거래처' }),
      attachment({ attachmentType: 'SLIP_REF', displayOrder: 1, refSlipNo: '2026/07/01-1', refPartnerName: '삼한상사', refPeriod: '2026-07' }),
    ]),
  },
  { id: 'F10-all-sections-empty', input: input({ content: null, fieldValues: {} }, [], []) },
  { id: 'F11-empty-issue-date', input: input({ steps: [step(1, { status: 'PENDING', decidedAt: null })] }) },
  {
    // UUID 누출 가드 — id 성 필드(approvalId·requesterId·templateId·approverId·fieldKey·attachmentId)를
    // 전부 distinctive UUID 로 채워도 렌더 모델이 모두 투영에서 제거해 golden DOM 에 UUID 가 없어야 한다.
    id: 'F12-uuid-free-model',
    input: input(
      {
        approvalId: '123e4567-e89b-12d3-a456-426614174000',
        requesterId: '987e6543-e21b-32d3-a456-426614174999',
        templateId: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
        fieldValues: { 'f6f6f6f6-a7a7-4b8b-8c9c-d0d0d0d0d0d0': 'UUID 키 필드 값' },
        steps: [step(1, { approverId: 'c2c2c2c2-d3d3-4e4e-8f5f-a6a6a6a6a6a6' })],
      },
      [field({ fieldKey: 'f6f6f6f6-a7a7-4b8b-8c9c-d0d0d0d0d0d0', label: 'UUID 키 라벨' })],
      [attachment({ id: 'b3b3b3b3-c4c4-4d5d-8e6e-f7f7f7f7f7f7', attachmentType: 'FILE', fileName: 'uuid-free.txt', displayOrder: 1 })],
    ),
  },
  { id: 'F13-long-content', input: input({ content: longContent }) },
  { id: 'F14-whitespace-crlf', input: input({ content: '  첫 줄  \r\n\r\n  \r\n 둘째 줄 \r\n' }) },
]
