/**
 * 결재 문서 원시 API DTO를 렌더러 전용 projection slot으로 변환한다.
 *
 * 모델에는 route/API용 UUID와 내부 id를 복사하지 않는다. 정렬·필터·라벨·첨부
 * 상세 생성은 기존 `approvalDoc.ts` 헬퍼를 단일 진실원으로 재사용한다.
 */
import type { ApprovalLineAdminResponse } from '../api/groupwareApproval'
import type { ApprovalAttachment } from '../api/groupwareApprovalAttachment'
import { approvalAttachmentPrintLabel } from '../api/approvalAttachmentPresentation'
import type { ApprovalTemplateField } from '../api/groupwareApprovalTemplate'
import type { EstimateLine } from '../api/estimateApi'
import type { SlipLineDetail } from '../api/slip'
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
  /** 파일럿 detail adapter 입력 — 실제 EstimateLineResponse의 FE 정규화 타입. */
  lineItems?: EstimateLine[]
  /** 결재 첨부의 기존 OUTBOUND_SLIP 상세에서 온 라인. */
  slipLineItems?: SlipLineDetail[]
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
  key: string
  label: string
  value: string
}

export interface ApprovalRenderAttachment {
  typeLabel: string
  title: string
  detail: string
}

export type ApprovalLineItemsAvailability = 'CONNECTED' | 'UNAVAILABLE'

/** EstimateLineResponse에서 UUID/계보 필드를 제거한 detail 반복행 projection. */
export interface ApprovalRenderLineItem {
  productName: string
  modelName: string
  specification: string
  quantity: number
  supplyAmount: string
  vatAmount: string
  lineTotal: string
  note: string
}

/** 실제 견적 응답 DTO를 인쇄 renderer가 소비하는 UUID 없는 행으로 투영한다. */
export function projectEstimateLineItems(lines: EstimateLine[]): ApprovalRenderLineItem[] {
  return lines.map((line) => ({
    productName: line.productName ?? '',
    modelName: line.modelName ?? '',
    specification: line.specification ?? '',
    quantity: line.quantity,
    supplyAmount: line.supplyAmount,
    vatAmount: line.vatAmount,
    lineTotal: line.lineTotal,
    note: line.note ?? '',
  }))
}

/** 기존 출고전표 상세 응답의 라인을 UUID 없는 결재 인쇄 행으로 투영한다. */
export function projectSlipLineItems(lines: SlipLineDetail[]): ApprovalRenderLineItem[] {
  return lines.map((line) => ({
    productName: line.productName ?? '',
    modelName: line.modelName ?? '',
    specification: line.specification ?? '',
    quantity: line.quantity,
    supplyAmount: line.supplyAmount ?? '',
    vatAmount: line.vatAmount ?? '',
    lineTotal: line.lineTotal,
    note: line.note ?? '',
  }))
}

export interface ApprovalRenderModel {
  header: ApprovalRenderHeader
  approvalSteps: ApprovalRenderStep[]
  body: {
    paragraphs: string[]
    fieldRows: ApprovalRenderFieldRow[]
    attachments: ApprovalRenderAttachment[]
    lineItems: ApprovalRenderLineItem[]
    lineItemsAvailability: ApprovalLineItemsAvailability
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
        key: row.key,
        label: row.label,
        value: row.fieldType === 'NUMBER' ? krw(row.value) || row.value : row.value,
      })),
      attachments: sortedAttachments.map((attachment) => ({
        typeLabel: approvalAttachmentPrintLabel(attachment),
        title: attachmentTitle(attachment),
        detail: attachmentDetails(attachment).join(' · '),
      })),
      lineItems: input.slipLineItems !== undefined
        ? projectSlipLineItems(input.slipLineItems)
        : projectEstimateLineItems(input.lineItems ?? []),
      lineItemsAvailability: input.slipLineItems !== undefined || input.lineItems !== undefined
        ? 'CONNECTED'
        : 'UNAVAILABLE',
    },
    closing: { note: CLOSING_NOTE },
  }
}
