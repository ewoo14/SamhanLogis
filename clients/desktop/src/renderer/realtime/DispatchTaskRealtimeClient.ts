/**
 * 배차현황 목록 레벨 실시간 SSE 클라이언트 (E2 기둥1).
 *
 * <p>BE endpoint: {@code GET /admin/dispatch-tasks/board-realtime}
 * (DispatchBoardRealtimeController). 목록 전체 브로드캐스트 채널을 구독해 동시 시청자
 * 배차현황 목록을 실시간 갱신한다.
 *
 * <h2>entityId 규약</h2>
 * <p>목록 endpoint 는 entity-level ID 를 갖지 않는다. 호출자는
 * {@code subscribe('board', handler)} 처럼 sentinel 값을 넘긴다.
 *
 * <h2>게이트웨이 경로</h2>
 * <p>{@code /admin/dispatch-tasks/board-realtime} → {@code slip-dispatch-admin-noprefix}
 * 라우트(no-strip, JwtAuthentication 필터 적용).
 */
import { createRealtimeClient } from './createRealtimeClient'

export const DispatchTaskRealtimeClient = createRealtimeClient({
  name: 'DispatchTaskRealtimeClient',
  endpointPath: (_entityId) => '/admin/dispatch-tasks/board-realtime',
  allowMockMode: true,
})
