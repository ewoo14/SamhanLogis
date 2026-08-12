import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('./client', () => ({ apiClient: apiClientMock }))

import { listRevisions, restoreRevision } from './estimateRevision'

describe('estimate revision document-number paths', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    apiClientMock.get.mockResolvedValue({ data: { data: [] } })
    apiClientMock.post.mockResolvedValue({ data: { data: {} } })
  })

  it('revision 조회와 복원은 하이픈 path id를 공유한다', async () => {
    const documentNo = '2026/08/10-9'
    await listRevisions(documentNo)
    await restoreRevision(documentNo, 2)

    expect(apiClientMock.get).toHaveBeenCalledWith(
      '/api/v1/slips/estimates/2026-08-10-9/revisions',
    )
    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/api/v1/slips/estimates/2026-08-10-9/revisions/2/restore',
    )
  })
})
