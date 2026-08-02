/**
 * 그룹웨어 결재자 검색 API client.
 *
 * userId 는 결재 생성 payload 전용이며, 화면 표시는 name/department 만 사용한다.
 */
import { apiClient, type ApiEnvelope } from './client'

export interface ApproverOption {
  userId: string
  name: string
  department: string | null
}

export async function searchApprovers(q: string): Promise<ApproverOption[]> {
  const res = await apiClient.get<ApiEnvelope<ApproverOption[]>>(
    '/admin/groupware/approvals/approver-search',
    { params: { q, limit: '10000' } },
  )
  return res.data.data
}
