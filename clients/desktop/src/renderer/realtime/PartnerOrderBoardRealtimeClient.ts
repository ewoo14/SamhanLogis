/**
 * 거래처 주문 목록 레벨 실시간 SSE 클라이언트.
 *
 * BE endpoint: GET /api/v1/partner-orders/board-realtime
 * entityId 는 목록 sentinel 값('board')만 사용한다.
 */
import { createRealtimeClient } from './createRealtimeClient'

export const PartnerOrderBoardRealtimeClient = createRealtimeClient({
  name: 'PartnerOrderBoardRealtimeClient',
  endpointPath: (_entityId) => '/api/v1/partner-orders/board-realtime',
  allowMockMode: true,
})
