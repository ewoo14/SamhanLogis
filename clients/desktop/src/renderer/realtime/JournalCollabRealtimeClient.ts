/**
 * 회계전표 협업 SSE client.
 *
 * createRealtimeClient 공통 backoff/heartbeat 구현을 재사용한다.
 */
import { createRealtimeClient } from './createRealtimeClient'

export const JournalCollabRealtimeClient = createRealtimeClient({
  name: 'journal-collab',
  endpointPath: (journalId) =>
    `/accounting/journals/${encodeURIComponent(journalId)}/collab/stream`,
  allowMockMode: true,
})
