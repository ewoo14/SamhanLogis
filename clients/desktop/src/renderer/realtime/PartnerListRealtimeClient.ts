/**
 * 거래처 목록 레벨 실시간 SSE 클라이언트 (E2).
 *
 * <p>BE endpoint: {@code GET /admin/partners/list-realtime}.
 */
import { createRealtimeClient } from './createRealtimeClient'

export const PartnerListRealtimeClient = createRealtimeClient({
  name: 'PartnerListRealtimeClient',
  endpointPath: (_entityId) => '/admin/partners/list-realtime',
  allowMockMode: true,
})
