/**
 * arologis 도메인 SSE realtime client — PR-H4c FE-B.
 *
 * <p>BE endpoint (PR-H4b BE-B 5bcb7ad):
 * <ul>
 *   <li>{@code GET /admin/arologis/dispatches/{id}/realtime}</li>
 * </ul>
 *
 * <p>이벤트:
 * <ul>
 *   <li>{@code arologis:edit} — Dispatch/VehicleStop 본문 수정</li>
 *   <li>{@code arologis:edit-request:created/decided} — 수정 요청 라이프사이클</li>
 * </ul>
 *
 * <p>본 client 는 dispatch entity 1:1 구독 — 가배차/미배차/지방가배차/SMS/대사 page 는
 * 단일 entity 가 없으므로 page 단위 cache invalidate 트리거로만 사용된다 (page 진입 시
 * 최근 작업한 dispatch id 를 props 로 전달받는 방식).
 */
import { createRealtimeClient } from './createRealtimeClient'

export const ArologisDispatchRealtimeClient = createRealtimeClient({
  name: 'ArologisDispatchRealtimeClient',
  endpointPath: (id) => `/admin/arologis/dispatches/${encodeURIComponent(id)}/realtime`,
  allowMockMode: true,
})
