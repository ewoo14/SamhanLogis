import { afterEach, describe, expect, it, vi } from 'vitest'

const ACTIONS = ['view', 'create', 'update', 'delete', 'restore', 'download', 'print'] as const
type Action = typeof ACTIONS[number]

type PermissionResponse = {
  data: Record<string, string[]>
}

const masterRuntimeBits = '1111111'
const templateExpectedBits: Record<string, string> = {
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

function expectedBitsForRole(role: string): string {
  // MASTER 는 role_page_permission_templates 조회 대상이 아니다.
  // DynamicPermissionService.java:192-205가 DB row와 무관하게 모든 PageCode를
  // canView=true/canEdit=true로 반환하므로, MASTER 정본은 템플릿이 아닌 전권 규칙이다.
  if (role === 'MASTER') return masterRuntimeBits
  return templateExpectedBits[role]
}

async function readInboundBits(role: string): Promise<string> {
  vi.resetModules()
  vi.stubGlobal('window', { location: { search: `?mockRole=${role}`, hash: '' } })
  const { getMockResponse } = await import('../api/mock')
  const response = getMockResponse({ method: 'GET', url: '/auth/admin/permissions/my' }) as PermissionResponse
  const granted = new Set(response.data['inbound.inspection'] ?? [])
  return ACTIONS.map((action) => granted.has(action.toUpperCase()) ? '1' : '0').join('')
}

async function readMockRoles(): Promise<string[]> {
  vi.resetModules()
  const { getMockResponse } = await import('../api/mock')
  const response = getMockResponse({ method: 'GET', url: '/auth/admin/permissions' }) as {
    data: Record<string, unknown>
  }
  return Object.keys(response.data).sort()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('inbound.inspection permission contract', () => {
  it('compares every mock-emitted role against the auth_db 7-bit model exactly', async () => {
    const mockRoles = await readMockRoles()
    expect(mockRoles).toEqual(Object.keys({ MASTER: masterRuntimeBits, ...templateExpectedBits }).sort())

    for (const role of mockRoles) {
      await expect(readInboundBits(role), `${role} inbound.inspection`).resolves.toBe(expectedBitsForRole(role))
    }

    // MASTER 런타임 전권 규칙 단정: 모든 page code가 7개 action을 가져야 한다.
    vi.resetModules()
    vi.stubGlobal('window', { location: { search: '?mockRole=MASTER', hash: '' } })
    const { getMockResponse } = await import('../api/mock')
    const response = getMockResponse({ method: 'GET', url: '/auth/admin/permissions/my' }) as PermissionResponse
    const expectedActions = ACTIONS.map((action) => action.toUpperCase())

    for (const [pageCode, actions] of Object.entries(response.data)) {
      expect(actions, `MASTER ${pageCode}`).toEqual(expectedActions)
    }
  })
})
