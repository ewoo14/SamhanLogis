import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { dcConfigAuditApi, inventoryAuditAuditApi, normalizeAuditLogEntry } from './createAuditApi'

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

  it.each(['raw-audit-id', 'opaque_audit_token'])('keeps the audit entity token unchanged in the path: %s', async (entityId) => {
    await inventoryAuditAuditApi.listAuditLogs(entityId)

    expect(apiClient.get).toHaveBeenCalledWith(
      `/inventory/audits/${entityId}/audit-logs`,
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

  it.each([
    '{550e8400-e29b-41d4-a716-446655440000}',
    'urn:uuid:550e8400-e29b-41d4-a716-446655440000',
    '550e8400e29b41d4a716446655440000',
  ])('normalizes R15 non-canonical UUID actorName %s', (actorName) => {
    expect(normalizeAuditLogEntry({
      revisionNo: 1,
      fieldName: 'memo',
      oldValue: '이전',
      newValue: '이후',
      actorId: '550e8400-e29b-41d4-a716-446655440000',
      actorName,
      changedAt: '2026-08-10T09:01:00+09:00',
    }).actorName).toBe('변경자 미상')
  })

  it('keeps 32-character non-UUID display names', () => {
    for (const actorName of [
      '가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도루',
      '0000000000000000000000000000000G',
    ]) {
      expect(normalizeAuditLogEntry({
        revisionNo: 1,
        fieldName: 'memo',
        oldValue: '이전',
        newValue: '이후',
        actorId: '550e8400-e29b-41d4-a716-446655440000',
        actorName,
        changedAt: '2026-08-10T09:01:00+09:00',
      }).actorName).toBe(actorName)
    }
  })

  it('continues hiding uppercase and padded canonical UUID actorName', () => {
    expect(normalizeAuditLogEntry({
      revisionNo: 1,
      fieldName: 'memo',
      oldValue: '이전',
      newValue: '이후',
      actorId: '550e8400-e29b-41d4-a716-446655440000',
      actorName: '  550E8400-E29B-41D4-A716-446655440000  ',
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

  it.each([
    'cafebabecafebabecafebabecafebabe',
    '{cafebabecafebabecafebabecafebabe}',
    'urn:uuid:cafebabecafebabecafebabecafebabe',
  ])('hides a UUID-shaped actorName even when it differs from actorId: %s', (actorName) => {
    expect(normalizeAuditLogEntry({
      revisionNo: 1,
      fieldName: 'memo',
      oldValue: '이전',
      newValue: '이후',
      actorId: '550e8400-e29b-41d4-a716-446655440000',
      actorName,
      changedAt: '2026-08-10T09:01:00+09:00',
    }).actorName).toBe('변경자 미상')
  })
})
