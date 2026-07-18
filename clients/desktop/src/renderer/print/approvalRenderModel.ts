/**
 * 결재 문서 원시 API DTO를 렌더러 전용 projection slot으로 변환한다.
 *
 * 모델에는 route/API용 UUID와 내부 id를 복사하지 않는다. 정렬·필터·라벨·첨부
 * 상세 생성은 기존 `approvalDoc.ts` 헬퍼를 단일 진실원으로 재사용한다.
 */
import type { ApprovalLineAdminResponse } from '../api/groupwareApproval'
import {
  APPROVAL_ATTACHMENT_TYPE_LABEL,
  type ApprovalAttachment,
} from '../api/groupwareApprovalAttachment'
import type { ApprovalTemplateField } from '../api/groupwareApprovalTemplate'
import { krw } from './PrintLayout'
import {
  attachmentDetails,
  attachmentTitle,
  buildApprovalSteps,
  buildDocHeader,
  CLOSING_NOTE,
  contentParagraphs,
  fieldRows,
} from './approvalDoc'

export interface FrozenApprovalDocInput {
  approval: ApprovalLineAdminResponse
  templateFields: ApprovalTemplateField[]
  attachments: ApprovalAttachment[]
  backTo?: string
}

export interface ApprovalRenderHeader {
  title: string
  docNo: string
  issueDate?: string
}

export interface ApprovalRenderStep {
  label: string
  name?: string
  decidedAt?: string
  signaturePngBase64?: string
}

export interface ApprovalRenderFieldRow {
  label: string
  value: string
}

export interface ApprovalRenderAttachment {
  typeLabel: string
  title: string
  detail: string
}

export interface ApprovalRenderModel {
  header: ApprovalRenderHeader
  approvalSteps: ApprovalRenderStep[]
  body: {
    paragraphs: string[]
    fieldRows: ApprovalRenderFieldRow[]
    attachments: ApprovalRenderAttachment[]
  }
  closing: {
    note: string
  }
}

/** 원시 결재 입력 번들을 UUID 없는 문서 렌더 모델로 투영한다. */
export function buildApprovalRenderModel(input: FrozenApprovalDocInput): ApprovalRenderModel {
  const header = buildDocHeader(input.approval)
  const steps = buildApprovalSteps(input.approval)
  const rows = fieldRows(input.approval.fieldValues, input.templateFields)
  const sortedAttachments = input.attachments
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)

  return {
    header: {
      title: header.title,
      docNo: header.docNo ?? '',
      ...(header.issueDate ? { issueDate: header.issueDate } : {}),
    },
    approvalSteps: steps.map((step) => ({
      label: step.label,
      ...(step.name === undefined ? {} : { name: step.name }),
      ...(step.decidedAt === undefined ? {} : { decidedAt: step.decidedAt }),
      ...(step.signaturePngBase64 === undefined ? {} : { signaturePngBase64: step.signaturePngBase64 }),
    })),
    body: {
      paragraphs: contentParagraphs(input.approval.content),
      fieldRows: rows.map((row) => ({
        label: row.label,
        value: row.fieldType === 'NUMBER' ? krw(row.value) || row.value : row.value,
      })),
      attachments: sortedAttachments.map((attachment) => ({
        typeLabel: APPROVAL_ATTACHMENT_TYPE_LABEL[attachment.attachmentType],
        title: attachmentTitle(attachment),
        detail: attachmentDetails(attachment).join(' · '),
      })),
    },
    closing: { note: CLOSING_NOTE },
  }
}
