/**
 * 그룹웨어 결재 협업 SSE client.
 */
import { createRealtimeClient } from './createRealtimeClient'

export const GroupwareApprovalCollabRealtimeClient = createRealtimeClient({
  name: 'groupware-approval-collab',
  endpointPath: (approvalId) =>
    `/admin/groupware/approvals/${encodeURIComponent(approvalId)}/collab/stream`,
  allowMockMode: true,
})
