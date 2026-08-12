import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, subscribe } = vi.hoisted(() => ({
  get: vi.fn(),
  subscribe: vi.fn(() => new AbortController()),
}))

vi.mock('./client', () => ({
  apiClient: { get },
}))
vi.mock('../auth/collabHeaders', () => ({
  collabHeaders: vi.fn(async () => ({})),
}))
vi.mock('../realtime/createRealtimeClient', () => ({
  createRealtimeClient: vi.fn(() => ({ subscribe })),
}))

import { getEstimateCollabComments, getEstimateCollabEdits } from './estimateCollab'
import { listRevisions } from './estimateRevision'
import { makeCoeditApi } from '../realtime/coeditApi'
import { EstimatePresenceClient } from '../realtime/createPresenceClient'
import { EstimateCollabRealtimeClient } from '../realtime/EstimateCollabRealtimeClient'

describe('estimate detail request identifier contract', () => {
  beforeEach(() => {
    get.mockReset()
    get.mockResolvedValue({ data: { data: [] } })
    subscribe.mockClear()
  })

  it('sends the same opaque token through every detail collaboration GET/stream client', async () => {
    const token = 'AAAAAAAAAAAAAAAAAAAAAQ'

    await getEstimateCollabComments(token)
    await EstimatePresenceClient.list(token)
    await getEstimateCollabEdits(token)
    await makeCoeditApi(`/slips/estimates/${token}`).getUpdates()
    await listRevisions(token)
    EstimateCollabRealtimeClient.subscribe(token, vi.fn())

    const paths = get.mock.calls.map(([path]) => path)
    expect(paths).toEqual([
      `/api/v1/slips/estimates/${token}/collab/comments`,
      `/api/v1/slips/estimates/${token}/collab/presence`,
      `/api/v1/slips/estimates/${token}/collab/edits`,
      `/api/v1/slips/estimates/${token}/collab/coedit`,
      `/api/v1/slips/estimates/${token}/revisions`,
    ])
    expect(subscribe).toHaveBeenCalledWith(token, expect.any(Function))
  })
})
