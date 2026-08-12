/**
 * 품목 카탈로그 목록 레벨 실시간 SSE 클라이언트 — §2-2 (2026-06-11).
 *
 * <p>BE endpoint: {@code GET /api/v1/products/catalog-realtime}
 * (ProductCatalogRealtimeController — 개별 productId 기반의 ProductRealtimeController 와 다름)
 *
 * <p>카탈로그 목록 전체 브로드캐스트 채널을 구독한다. 동일 채널 구독자 전원에게
 * 이벤트가 전달되어 동시 시청자 화면이 실시간 갱신된다.
 *
 * <p>수신 이벤트:
 * <ul>
 *   <li>{@code connected} — 초기 1회</li>
 *   <li>{@code product:catalog:changed} — usage PATCH/DELETE, components PUT,
 *       display-orders PUT 성공 시 broadcast</li>
 *   <li>SSE comment {@code :ping} — 30s heartbeat</li>
 * </ul>
 *
 * <h2>entityId 규약</h2>
 * <p>카탈로그 endpoint 는 entity-level ID 를 갖지 않는다. {@code createRealtimeClient}
 * 의 {@code endpointPath} 는 항상 고정 경로를 반환하며, 호출자는
 * {@code subscribe('catalog', handler)} 처럼 sentinel 값을 넘긴다.
 *
 * <h2>VITE_MOCK_MODE 가드</h2>
 * <p>mock 모드에서는 SSE 구독을 skip 한다. {@code ProductCatalogPage} 에서
 * {@code isMockMode()} 체크 후 subscribe 를 호출하지 않는다.
 *
 * <h2>게이트웨이 경로</h2>
 * <p>{@code /api/v1/products/catalog-realtime} → product-catalog-realtime-v1 라우트
 * (no-strip, JwtAuthentication 필터 적용).
 */
import { createRealtimeClient } from './createRealtimeClient'

export const ProductRealtimeClient = createRealtimeClient({
  name: 'ProductRealtimeClient',
  endpointPath: (_entityId) => `/api/v1/products/catalog-realtime`,
  allowMockMode: true,
})
