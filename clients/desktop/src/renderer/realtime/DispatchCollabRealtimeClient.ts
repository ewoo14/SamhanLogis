/**
 * DispatchTask 코멘트 SSE client — C1c.
 *
 * createRealtimeClient 공통 backoff/heartbeat 구현을 그대로 재사용한다.
 */
import { createRealtimeClient } from './createRealtimeClient'

export const DispatchCollabRealtimeClient = createRealtimeClient({
  name: 'dispatch-collab',
  endpointPath: (taskId) =>
    `/admin/dispatch-tasks/${taskId}/collab/stream`,
  allowMockMode: true,
})
