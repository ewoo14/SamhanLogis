/**
 * 견적 목록 레벨 실시간 SSE 클라이언트 (E2).
 *
 * <p>BE endpoint: {@code GET /slips/estimates/list-realtime}.
 */
import { createRealtimeClient } from './createRealtimeClient'

export const EstimateListRealtimeClient = createRealtimeClient({
  name: 'EstimateListRealtimeClient',
  endpointPath: (_entityId) => '/slips/estimates/list-realtime',
  allowMockMode: true,
})
