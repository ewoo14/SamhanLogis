// @vitest-environment jsdom
import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import type { ApprovalLineAdminResponse } from '../api/groupwareApproval'
import type { ApprovalAttachment } from '../api/groupwareApprovalAttachment'
import {
  approvalAttachmentDetailLabel,
  approvalAttachmentHref,
  approvalAttachmentPrintLabel,
} from '../api/approvalAttachmentPresentation'
import { FrozenApprovalDocLegacy } from './__frozen__/FrozenApprovalDocLegacy'
import { buildApprovalRenderModel } from './approvalRenderModel'

const settlementAttachment: ApprovalAttachment = {
  id: 'settlement-attachment',
  attachmentType: 'SLIP_REF',
  label: null,
  displayOrder: 1,
  refSlipNo: null,
  refSlipType: null,
  refPartnerCode: null,
  refPartnerName: null,
  refPeriod: null,
  refDocType: 'SALES_COMMISSION_SETTLEMENT',
  refDocNo: '2026/08/11-1',
  refDocLabel: 'CONFIRMED',
  fileName: null,
  contentType: null,
  fileSize: null,
  downloadUrl: null,
}

const approval: ApprovalLineAdminResponse = {
  approvalId: 'approval-1',
  approvalNo: 'GW-2026-001',
  requesterId: 'requester-1',
  requesterName: '작성자',
  title: '정산서 참조 인쇄 회귀',
  content: null,
  templateId: null,
  templateName: null,
  documentType: null,
  documentTemplateDefaultPinned: false,
  fieldValues: {},
  status: 'PENDING',
  steps: [],
}

function renderFrozen(): string {
  return renderToStaticMarkup(
    <StaticRouter location="/groupware/approvals/approval-1/print">
      <FrozenApprovalDocLegacy
        approval={approval}
        templateFields={[]}
        attachments={[settlementAttachment]}
      />
    </StaticRouter>,
  )
}

describe('정산서 SLIP_REF 인쇄 소비자', () => {
  it('새 renderer는 refDocType 라벨을 인쇄한다', () => {
    const model = buildApprovalRenderModel({
      approval,
      templateFields: [],
      attachments: [settlementAttachment],
    })

    expect(model.body.attachments[0]?.typeLabel).toBe('영업수수료 정산서')
  })

  it('frozen fallback도 refDocType 라벨을 인쇄한다', () => {
    expect(renderFrozen()).toContain('영업수수료 정산서')
  })

  it.each([
    ['OUTBOUND_SLIP', '전표 참조', '출고전표', '#/sales?slipNo=2026%2F08%2F11-1'],
    ['INBOUND_SLIP', '전표 참조', '입고전표', '#/purchases?slipNo=2026%2F08%2F11-1'],
    ['JOURNAL', '전표 참조', '분개장', '#/accounting/journals?journalNo=2026%2F08%2F11-1'],
    ['TAX_INVOICE', '전표 참조', '세금계산서', '#/accounting/tax-invoices?taxInvoiceNo=2026%2F08%2F11-1'],
    ['STATEMENT', '전표 참조', '거래명세서', '#/accounting/statement-batch?statementNo=2026%2F08%2F11-1'],
    ['PARTNER_LEDGER', '거래처원장 참조', '거래처원장', '#/accounting/ledgers?partnerCode=P-001&period=2026-08'],
  ] as const)('%s의 기존 인쇄·상세 라벨과 링크를 보존한다', (docType, printLabel, detailLabel, href) => {
    const attachment: ApprovalAttachment = {
      ...settlementAttachment,
      attachmentType: docType === 'PARTNER_LEDGER' ? 'PARTNER_LEDGER_REF' : 'SLIP_REF',
      refDocType: docType,
      refDocNo: docType === 'PARTNER_LEDGER' ? null : '2026/08/11-1',
      refPartnerCode: docType === 'PARTNER_LEDGER' ? 'P-001' : null,
      refPeriod: docType === 'PARTNER_LEDGER' ? '2026-08' : null,
    }

    expect(approvalAttachmentPrintLabel(attachment)).toBe(printLabel)
    expect(approvalAttachmentDetailLabel(attachment)).toBe(detailLabel)
    expect(approvalAttachmentHref(attachment)).toBe(href)
  })

  it('legacy refDocType=null도 기존 attachment type fallback을 보존한다', () => {
    expect(approvalAttachmentPrintLabel({
      ...settlementAttachment,
      attachmentType: 'SLIP_REF',
      refDocType: null,
      refSlipType: 'SLIP_INBOUND',
    })).toBe('전표 참조')
    expect(approvalAttachmentDetailLabel({
      ...settlementAttachment,
      attachmentType: 'SLIP_REF',
      refDocType: null,
      refSlipType: 'SLIP_INBOUND',
    })).toBe('입고전표')
  })
})
