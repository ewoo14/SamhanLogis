import { apiClient, type ApiEnvelope } from './client'

export type AccountingEditRequestType = 'EDIT' | 'DELETE'
export type AccountingEditRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

interface AccountingEditRequestResponse {
  requestId: string
  entityId: string
  requestType: AccountingEditRequestType
  status: AccountingEditRequestStatus
  reason: string | null
  requesterId: string
  requesterName: string
  targetRole: string
  decidedById: string | null
  decidedByName: string | null
  decisionReason: string | null
  requestedAt: string
  decidedAt: string | null
  expiresAt: string | null
}

export interface AccountingEditRequest {
  id: string
  entityId: string
  requestType: AccountingEditRequestType
  status: AccountingEditRequestStatus
  reason: string | null
  requesterId: string
  requesterName: string
  targetRole: string
  decidedById: string | null
  decidedByName: string | null
  decisionReason: string | null
  requestedAt: string
  decidedAt: string | null
  expiresAt: string | null
}

export interface RejectAccountingEditRequestBody {
  reason: string
}

export interface ApproveAccountingEditRequestBody {
  note?: string
}

function normalizeAccountingEditRequest(
  row: AccountingEditRequestResponse,
): AccountingEditRequest {
  return {
    id: row.requestId,
    entityId: row.entityId,
    requestType: row.requestType,
    status: row.status,
    reason: row.reason,
    requesterId: row.requesterId,
    requesterName: row.requesterName,
    targetRole: row.targetRole,
    decidedById: row.decidedById,
    decidedByName: row.decidedByName,
    decisionReason: row.decisionReason,
    requestedAt: row.requestedAt,
    decidedAt: row.decidedAt,
    expiresAt: row.expiresAt,
  }
}

export async function listAccountingEditRequests(): Promise<AccountingEditRequest[]> {
  const res = await apiClient.get<ApiEnvelope<AccountingEditRequestResponse[]>>(
    '/api/v1/accounting/edit-requests',
    { params: { targetRole: 'MANAGER' } },
  )
  return res.data.data.map(normalizeAccountingEditRequest)
}

export async function approveAccountingEditRequest(
  requestId: string,
  body: ApproveAccountingEditRequestBody = {},
): Promise<AccountingEditRequest> {
  const res = await apiClient.post<ApiEnvelope<AccountingEditRequestResponse>>(
    `/api/v1/accounting/edit-requests/${encodeURIComponent(requestId)}/approve`,
    body,
  )
  return normalizeAccountingEditRequest(res.data.data)
}

export async function rejectAccountingEditRequest(
  requestId: string,
  body: RejectAccountingEditRequestBody,
): Promise<AccountingEditRequest> {
  const res = await apiClient.post<ApiEnvelope<AccountingEditRequestResponse>>(
    `/api/v1/accounting/edit-requests/${encodeURIComponent(requestId)}/reject`,
    body,
  )
  return normalizeAccountingEditRequest(res.data.data)
}

export const ACCOUNTING_EDIT_REQUEST_TYPE_LABEL: Record<
  AccountingEditRequestType,
  string
> = {
  EDIT: '수정',
  DELETE: '삭제',
}

export const ACCOUNTING_EDIT_REQUEST_STATUS_LABEL: Record<
  AccountingEditRequestStatus,
  string
> = {
  PENDING: '처리 대기',
  APPROVED: '수락됨',
  REJECTED: '거절됨',
}
