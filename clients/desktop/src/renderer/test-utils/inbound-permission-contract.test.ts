import { afterEach, describe, expect, it, vi } from 'vitest'

const ACTIONS = ['view', 'create', 'update', 'delete', 'restore', 'download', 'print'] as const
type Action = typeof ACTIONS[number]

type PermissionResponse = {
  data: Record<string, string[]>
}

const expectedBits: Record<string, string> = {
  MANAGER: '1010000',
  SALES: '0000000',
  ACCOUNTANT: '0000000',
  WAREHOUSE: '1111000',
  INVENTORY: '1111000',
  DISPATCH: '0000000',
  DRIVER: '0000000',
  STAFF: '0000000',
  DEVELOPER: '0000000',
  PARTNER: '0000000',
}

async function readInboundBits(role: string): Promise<string> {
  vi.resetModules()
  vi.stubGlobal('window', { location: { search: `?mockRole=${role}`, hash: '' } })
  const { getMockResponse } = await import('../api/mock')
  const response = getMockResponse({ method: 'GET', url: '/auth/admin/permissions/my' }) as PermissionResponse
  const granted = new Set(response.data['inbound.inspection'] ?? [])
  return ACTIONS.map((action) => granted.has(action.toUpperCase()) ? '1' : '0').join('')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('inbound.inspection permission contract', () => {
  it('compares every non-MASTER role against the auth_db 7-bit model exactly', async () => {
    for (const [role, expected] of Object.entries(expectedBits)) {
      await expect(readInboundBits(role), `${role} inbound.inspection`).resolves.toBe(expected)
    }
  })
})
