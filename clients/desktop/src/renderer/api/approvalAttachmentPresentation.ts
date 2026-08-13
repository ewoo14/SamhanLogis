/**
 * 결재 참조 첨부의 사용자 표면 계약.
 *
 * `attachmentType`은 저장 transport 분류이고 `refDocType`이 업무 문서 유형이다.
 * 알려진 refDocType은 이 맵을 우선 사용하며, legacy refDocType=null만 기존
 * attachmentType/refSlipType fallback으로 해석한다.
 */
import type { ApprovalAttachment } from './groupwareApprovalAttachment'
import type { ApprovalReferenceDocType } from './documentReferenceSearch'

export function resolveApprovalAttachmentDocType(
  attachment: ApprovalAttachment,
): ApprovalReferenceDocType | null {
  if (attachment.refDocType) return attachment.refDocType
  if (attachment.attachmentType === 'PARTNER_LEDGER_REF') return 'PARTNER_LEDGER'
  if (attachment.refSlipType === 'SLIP_INBOUND' || attachment.refSlipType === 'INBOUND') {
    return 'INBOUND_SLIP'
  }
  if (attachment.attachmentType === 'SLIP_REF') return 'OUTBOUND_SLIP'
  return null
}

/** 현재 인쇄 표면의 기존 6종 라벨은 그대로 두고 정산서만 신규 라벨을 부여한다. */
const PRINT_LABEL_BY_DOC_TYPE: Record<ApprovalReferenceDocType, string> = {
  OUTBOUND_SLIP: '전표 참조',
  INBOUND_SLIP: '전표 참조',
  JOURNAL: '전표 참조',
  TAX_INVOICE: '전표 참조',
  STATEMENT: '전표 참조',
  PARTNER_LEDGER: '거래처원장 참조',
  SALES_COMMISSION_SETTLEMENT: '영업수수료 정산서',
}

const DETAIL_LABEL_BY_DOC_TYPE: Record<ApprovalReferenceDocType, string> = {
  OUTBOUND_SLIP: '출고전표',
  INBOUND_SLIP: '입고전표',
  JOURNAL: '분개장',
  TAX_INVOICE: '세금계산서',
  STATEMENT: '거래명세서',
  PARTNER_LEDGER: '거래처원장',
  SALES_COMMISSION_SETTLEMENT: '영업수수료 정산서',
}

const LEGACY_ATTACHMENT_TYPE_LABEL: Record<ApprovalAttachment['attachmentType'], string> = {
  SLIP_REF: '전표 참조',
  PARTNER_LEDGER_REF: '거래처원장 참조',
  FILE: '파일',
}

const DETAIL_HREF_BY_DOC_TYPE: Record<
  ApprovalReferenceDocType,
  (attachment: ApprovalAttachment) => string | null
> = {
  OUTBOUND_SLIP: (attachment) => `#/sales?slipNo=${encodeURIComponent(attachment.refDocNo ?? attachment.refSlipNo ?? '')}`,
  INBOUND_SLIP: (attachment) => `#/purchases?slipNo=${encodeURIComponent(attachment.refDocNo ?? attachment.refSlipNo ?? '')}`,
  JOURNAL: (attachment) => `#/accounting/journals?journalNo=${encodeURIComponent(attachment.refDocNo ?? '')}`,
  TAX_INVOICE: (attachment) => `#/accounting/tax-invoices?taxInvoiceNo=${encodeURIComponent(attachment.refDocNo ?? '')}`,
  STATEMENT: (attachment) => `#/accounting/statement-batch?statementNo=${encodeURIComponent(attachment.refDocNo ?? '')}`,
  PARTNER_LEDGER: (attachment) => `#/accounting/ledgers?partnerCode=${encodeURIComponent(attachment.refPartnerCode ?? '')}&period=${encodeURIComponent(attachment.refPeriod ?? '')}`,
  // S4 route가 생기기 전에는 사용자가 누를 수 있는 링크를 만들지 않는다.
  SALES_COMMISSION_SETTLEMENT: () => null,
}

export function approvalAttachmentPrintLabel(attachment: ApprovalAttachment): string {
  const docType = resolveApprovalAttachmentDocType(attachment)
  return docType
    ? PRINT_LABEL_BY_DOC_TYPE[docType]
    : LEGACY_ATTACHMENT_TYPE_LABEL[attachment.attachmentType]
}

export function approvalAttachmentDetailLabel(attachment: ApprovalAttachment): string {
  const docType = resolveApprovalAttachmentDocType(attachment)
  return docType
    ? DETAIL_LABEL_BY_DOC_TYPE[docType]
    : LEGACY_ATTACHMENT_TYPE_LABEL[attachment.attachmentType]
}

export function approvalAttachmentHref(attachment: ApprovalAttachment): string | null {
  const docType = resolveApprovalAttachmentDocType(attachment)
  return docType ? DETAIL_HREF_BY_DOC_TYPE[docType](attachment) : null
}
