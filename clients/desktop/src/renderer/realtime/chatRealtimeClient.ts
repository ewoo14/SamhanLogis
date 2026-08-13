import { createRealtimeClient } from './createRealtimeClient'

/** 채팅도 기존 SSE 재연결/heartbeat/backoff 계약을 그대로 사용한다. */
export const chatRealtimeClient = createRealtimeClient({
  name: 'ChatRealtimeClient',
  endpointPath: (roomCode) => `/admin/groupware/chat/rooms/${encodeURIComponent(roomCode)}/stream`,
})
