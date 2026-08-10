import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { dcConfigAuditApi, normalizeAuditLogEntry } from './createAuditApi'

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

  it('normalizes UUID actorName to a neutral display label', () => {
    expect(normalizeAuditLogEntry({
      revisionNo: 1,
      fieldName: 'memo',
      oldValue: '이전',
      newValue: '이후',
      actorId: '550e8400-e29b-41d4-a716-446655440000',
      actorName: '550e8400-e29b-41d4-a716-446655440000',
      changedAt: '2026-08-10T09:01:00+09:00',
    }).actorName).toBe('변경자 미상')
  })

  it('preserves UUID-like but non-canonical actorName', () => {
    expect(normalizeAuditLogEntry({
      revisionNo: 1,
      fieldName: 'memo',
      oldValue: '이전',
      newValue: '이후',
      actorId: '550e8400-e29b-41d4-a716-446655440000',
      actorName: '1-1-1-1-1',
      changedAt: '2026-08-10T09:01:00+09:00',
    }).actorName).toBe('1-1-1-1-1')
  })
})
