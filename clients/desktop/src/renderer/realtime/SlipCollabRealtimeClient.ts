/**
 * 전표 협업 SSE client.
 *
 * createRealtimeClient 공통 backoff/heartbeat 구현을 재사용한다.
 */
import { createRealtimeClient } from './createRealtimeClient'

export const SlipCollabRealtimeClient = createRealtimeClient({
  name: 'slip-collab',
  endpointPath: (slipId) =>
    `/api/v1/slips/${encodeURIComponent(slipId)}/collab/stream`,
  allowMockMode: true,
})
