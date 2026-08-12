/**
 * 거래처 단가설정 SSE realtime client — PR-H4c FE-A.
 *
 * <p>BE endpoint: {@code GET /api/v1/dc-configs/{partnerCode}/realtime}
 *
 * <p>partner-service 와 다르게 dc-config-service 는 partnerCode (string) 를 entityId
 * 로 사용. encodeURIComponent 적용 후 path 전달.
 */
import { createRealtimeClient } from './createRealtimeClient'

export const DcConfigRealtimeClient = createRealtimeClient({
  name: 'DcConfigRealtimeClient',
  endpointPath: (partnerCode) =>
    `/api/v1/dc-configs/${encodeURIComponent(partnerCode)}/realtime`,
  allowMockMode: true,
})
