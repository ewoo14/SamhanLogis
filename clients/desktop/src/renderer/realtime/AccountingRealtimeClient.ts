/**
 * 회계 도메인 SSE realtime client — PR-H4c FE-A.
 *
 * <p>BE endpoint:
 * <ul>
 *   <li>{@code GET /accounting/tax-invoices/{id}/realtime}</li>
 *   <li>{@code GET /accounting/journals/{id}/realtime}</li>
 *   <li>{@code GET /accounting/closings/{id}/realtime}</li>
 * </ul>
 *
 * <p>이벤트:
 * <ul>
 *   <li>{@code accounting:edit} — entity 본문 수정 시</li>
 *   <li>{@code accounting:edit-request:created/decided} — 수정 요청 라이프사이클</li>
 * </ul>
 */
import { createRealtimeClient } from './createRealtimeClient'

export const TaxInvoiceRealtimeClient = createRealtimeClient({
  name: 'TaxInvoiceRealtimeClient',
  endpointPath: (id) => `/accounting/tax-invoices/${encodeURIComponent(id)}/realtime`,
  allowMockMode: true,
})

export const ClosingRealtimeClient = createRealtimeClient({
  name: 'ClosingRealtimeClient',
  endpointPath: (id) => `/accounting/closings/${encodeURIComponent(id)}/realtime`,
  allowMockMode: true,
})

export const JournalRealtimeClient = createRealtimeClient({
  name: 'JournalRealtimeClient',
  endpointPath: (id) => `/accounting/journals/${encodeURIComponent(id)}/realtime`,
  allowMockMode: true,
})
