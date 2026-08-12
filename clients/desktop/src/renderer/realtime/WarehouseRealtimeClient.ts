/**
 * inventory-service 도메인 SSE realtime clients.
 *
 * <p>BE endpoint:
 * <ul>
 *   <li>{@code GET /inventory/audits/{id}/realtime}     — 재고 실사 (PR-H4b)</li>
 *   <li>{@code GET /inventory/warehouses/{id}/realtime} — 창고 audit overlay (본 module 신규)</li>
 * </ul>
 *
 * <p>이벤트:
 * <ul>
 *   <li>{@code inventory:edit} — InventoryAudit/StockBalance/Warehouse 본문 수정</li>
 *   <li>{@code inventory:edit-request:created/decided} — 수정 요청 라이프사이클 (audits 채널만)</li>
 * </ul>
 *
 * <p>Slip 도메인은 기존 {@link ../realtime/SlipRealtimeClient.ts} 가 PR-H1 부터 사용 중.
 */
import { createRealtimeClient } from './createRealtimeClient'

export const InventoryAuditRealtimeClient = createRealtimeClient({
  name: 'InventoryAuditRealtimeClient',
  endpointPath: (id) => `/inventory/audits/${encodeURIComponent(id)}/realtime`,
  allowMockMode: true,
})

/** 창고 audit overlay 실시간 채널 — PATCH / soft-delete 시 inventory:edit 이벤트 수신. */
export const WarehouseRealtimeClient = createRealtimeClient({
  name: 'WarehouseRealtimeClient',
  endpointPath: (id) => `/inventory/warehouses/${encodeURIComponent(id)}/realtime`,
  allowMockMode: true,
})
