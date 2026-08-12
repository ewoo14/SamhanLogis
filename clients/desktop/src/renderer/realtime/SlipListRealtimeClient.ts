/**
 * 전표 목록 레벨 실시간 SSE 클라이언트 (E2).
 *
 * <p>BE endpoint: {@code GET /slips/list-realtime}.
 */
import { createRealtimeClient } from './createRealtimeClient'

export const SlipListRealtimeClient = createRealtimeClient({
  name: 'SlipListRealtimeClient',
  endpointPath: (_entityId) => '/slips/list-realtime',
  allowMockMode: true,
})
