/**
 * 거래처 주문 SSE realtime client — PR-H4c FE-A.
 *
 * <p>BE endpoint: {@code GET /api/v1/partner-orders/{partnerOrderId}/realtime}
 *
 * <p>이벤트:
 * <ul>
 *   <li>{@code partner-order:edit} — 본문 수정</li>
 *   <li>{@code partner-order:reverted} — revert</li>
 *   <li>{@code partner-order:edit-request:created/decided}</li>
 * </ul>
 */
import { createRealtimeClient } from './createRealtimeClient'

export const PartnerOrderRealtimeClient = createRealtimeClient({
  name: 'PartnerOrderRealtimeClient',
  endpointPath: (id) =>
    `/api/v1/partner-orders/${encodeURIComponent(id)}/realtime`,
  allowMockMode: true,
})
