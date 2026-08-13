/**
 * 견적 협업 SSE client.
 *
 * createRealtimeClient 공통 backoff/heartbeat 구현을 재사용한다.
 */
import { createRealtimeClient } from './createRealtimeClient'
import { toOrderPathId } from '../utils/orderNo'

export const EstimateCollabRealtimeClient = createRealtimeClient({
  name: 'estimate-collab',
  endpointPath: (estimateId) =>
    `/api/v1/slips/estimates/${encodeURIComponent(toOrderPathId(estimateId))}/collab/stream`,
  allowMockMode: true,
})
