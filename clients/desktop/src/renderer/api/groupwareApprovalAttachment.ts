/**
 * 그룹웨어 결재 첨부 API client.
 *
 * UUID 는 path/key 전용이다. 화면에는 전표번호, 거래처명, 기간, 파일명만 노출한다.
 */
import { apiClient, type ApiEnvelope } from './client'

export type ApprovalAttachmentType = 'SLIP_REF' | 'PARTNER_LEDGER_REF' | 'FILE'

export const APPROVAL_ATTACHMENT_TYPE_LABEL: Record<ApprovalAttachmentType, string> = {
  SLIP_REF: '전표 참조',
  PARTNER_LEDGER_REF: '거래처원장 참조',
  FILE: '파일',
}

export interface ApprovalAttachment {
  id: string
  attachmentType: ApprovalAttachmentType
  label: string | null
  displayOrder: number
  refSlipNo: string | null
  refSlipType: string | null
  refPartnerCode: string | null
  refPartnerName: string | null
  refPeriod: string | null
  fileName: string | null
  contentType: string | null
  fileSize: number | null
  downloadUrl: string | null
}

export interface ApprovalAttachmentReferenceInput {
  attachmentType: Exclude<ApprovalAttachmentType, 'FILE'>
  label?: string | null
  displayOrder?: number
  refSlipNo?: string | null
  refSlipType?: string | null
  refPartnerCode?: string | null
  refPartnerName?: string | null
  refPeriod?: string | null
}

export function approvalAttachmentDownloadUrl(approvalId: string, attachmentId: string): string {
  return `/admin/groupware/approvals/${encodeURIComponent(approvalId)}/attachments/${encodeURIComponent(attachmentId)}/download`
}

export async function listApprovalAttachments(approvalId: string): Promise<ApprovalAttachment[]> {
  const res = await apiClient.get<ApiEnvelope<ApprovalAttachment[]>>(
    `/admin/groupware/approvals/${encodeURIComponent(approvalId)}/attachments`,
  )
  return res.data.data ?? []
}

export async function addApprovalAttachmentReference(
  approvalId: string,
  input: ApprovalAttachmentReferenceInput,
): Promise<ApprovalAttachment> {
  const res = await apiClient.post<ApiEnvelope<ApprovalAttachment>>(
    `/admin/groupware/approvals/${encodeURIComponent(approvalId)}/attachments`,
    {
      attachmentType: input.attachmentType,
      label: input.label?.trim() || null,
      displayOrder: input.displayOrder ?? 0,
      refSlipNo: input.refSlipNo?.trim() || null,
      refSlipType: input.refSlipType?.trim() || null,
      refPartnerCode: input.refPartnerCode?.trim() || null,
      refPartnerName: input.refPartnerName?.trim() || null,
      refPeriod: input.refPeriod?.trim() || null,
    },
  )
  return res.data.data
}

export async function uploadApprovalAttachmentFile(
  approvalId: string,
  file: File,
  label?: string | null,
  displayOrder = 0,
): Promise<ApprovalAttachment> {
  const formData = new FormData()
  formData.append('file', file)
  if (label?.trim()) formData.append('label', label.trim())
  formData.append('displayOrder', String(displayOrder))
  const res = await apiClient.post<ApiEnvelope<ApprovalAttachment>>(
    `/admin/groupware/approvals/${encodeURIComponent(approvalId)}/attachments/file`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return res.data.data
}

export async function downloadApprovalAttachment(
  approvalId: string,
  attachmentId: string,
): Promise<Blob> {
  const res = await apiClient.get<Blob>(
    approvalAttachmentDownloadUrl(approvalId, attachmentId),
    { responseType: 'blob' },
  )
  return res.data
}

export async function deleteApprovalAttachment(
  approvalId: string,
  attachmentId: string,
): Promise<void> {
  await apiClient.delete<ApiEnvelope<null>>(
    `/admin/groupware/approvals/${encodeURIComponent(approvalId)}/attachments/${encodeURIComponent(attachmentId)}`,
  )
}
