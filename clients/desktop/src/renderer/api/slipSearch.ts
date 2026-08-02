/**
 * 그룹웨어 결재 전표 참조 자동완성 API.
 *
 * UUID 비공개 가드: 응답에는 전표번호, 전표유형, 거래처명, 금액, 일자만 포함된다.
 */
import { apiClient, type ApiEnvelope } from './client'

export type SlipSearchType = 'OUTBOUND' | 'INBOUND'
export type ApprovalSlipReferenceType = 'SLIP_OUTBOUND' | 'SLIP_INBOUND' | 'ACCOUNTING_VOUCHER'

export interface SlipSearchResult {
  slipNo: string
  slipType: SlipSearchType
  partnerName: string | null
  totalAmount: string | number | null
  /** 사용자 화면 표시용 부가세 포함 금액. legacy 응답에는 없을 수 있다. */
  displayTotalAmount?: string | number | null
  slipDate: string
}

export const APPROVAL_SLIP_TYPE_LABEL: Record<ApprovalSlipReferenceType, string> = {
  SLIP_OUTBOUND: '출고전표',
  SLIP_INBOUND: '입고전표',
  ACCOUNTING_VOUCHER: '회계전표',
}

export function toApprovalSlipReferenceType(slipType: SlipSearchType): ApprovalSlipReferenceType {
  return slipType === 'INBOUND' ? 'SLIP_INBOUND' : 'SLIP_OUTBOUND'
}

export function toSlipSearchType(value: string | null | undefined): SlipSearchType {
  return value === 'SLIP_INBOUND' || value === 'INBOUND' ? 'INBOUND' : 'OUTBOUND'
}

export function approvalSlipTypeLabel(value: string | null | undefined): string {
  if (value === 'SLIP_OUTBOUND' || value === 'SLIP_INBOUND' || value === 'ACCOUNTING_VOUCHER') {
    return APPROVAL_SLIP_TYPE_LABEL[value]
  }
  if (value === 'OUTBOUND') return '출고전표'
  if (value === 'INBOUND') return '입고전표'
  return ''
}

export async function searchSlips(q: string, limit = 10, slipType?: SlipSearchType): Promise<SlipSearchResult[]> {
  const keyword = q.trim()
  if (!keyword) return []
  const res = await apiClient.get<ApiEnvelope<SlipSearchResult[]>>('/admin/slips/search', {
    params: { q: keyword, limit, ...(slipType ? { slipType } : {}) },
  })
  return res.data.data ?? []
}
