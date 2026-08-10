import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { dcConfigAuditApi } from './createAuditApi'

vi.mock('./client', () => ({
  apiClient: { get: vi.fn() },
}))

describe('PR #1134 R11 DC audit path contract', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: [] } } as never)
  })

  it('uses the public partner-dc-config controller path', async () => {
    await dcConfigAuditApi.listAuditLogs('BIZ-1')

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/partner-dc-configs/BIZ-1/audit-logs',
    )
  })
})
