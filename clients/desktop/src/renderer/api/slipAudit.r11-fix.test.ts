import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { listAuditLogs } from './slipAudit'

vi.mock('./client', () => ({
  apiClient: { get: vi.fn() },
}))

describe('PR #1134 R11 slip audit contract', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
  })

  it('normalizes the live SlipAuditLogResponse shape before grouping', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: [
          {
            revisionNo: 3,
            fieldName: 'memo',
            oldValue: 'S33-open-overlay-ok',
            newValue: 'S33-open-collab-ok',
            actorId: 'actor-3',
            actorName: '[DEV-SEED] 개발영업',
            changedAt: '2026-08-10T09:03:00+09:00',
          },
          {
            revisionNo: 2,
            fieldName: 'memo',
            oldValue: 'S33-open-header-ok',
            newValue: 'S33-open-overlay-ok',
            actorId: 'actor-2',
            actorName: '[DEV-SEED] 개발영업',
            changedAt: '2026-08-10T09:02:00+09:00',
          },
          {
            revisionNo: 1,
            fieldName: 'memo',
            oldValue: 'S33-open-normal-path',
            newValue: 'S33-open-header-ok',
            actorId: 'actor-1',
            actorName: '[DEV-SEED] 개발영업',
            changedAt: '2026-08-10T09:01:00+09:00',
          },
        ],
      },
    } as never)

    const logs = await listAuditLogs('slip-2026-08-10-14')
    const auditByField = logs.reduce<Record<string, typeof logs>>((groups, log) => {
      ;(groups[log.field] ??= []).push(log)
      return groups
    }, {})

    expect(auditByField.memo).toHaveLength(3)
    expect(auditByField.memo[0]).toMatchObject({
      beforeValue: 'S33-open-overlay-ok',
      afterValue: 'S33-open-collab-ok',
      actorName: '[DEV-SEED] 개발영업',
    })
    expect(auditByField.undefined).toBeUndefined()
  })
})
