/**
 * 주문 협업 SSE client.
 *
 * createRealtimeClient 공통 backoff/heartbeat 구현을 재사용한다.
 */
import { createRealtimeClient } from './createRealtimeClient'

export const PartnerOrderCollabRealtimeClient = createRealtimeClient({
  name: 'partner-order-collab',
  endpointPath: (orderId) =>
    `/api/v1/partner-orders/${encodeURIComponent(orderId)}/collab/stream`,
  allowMockMode: true,
})
