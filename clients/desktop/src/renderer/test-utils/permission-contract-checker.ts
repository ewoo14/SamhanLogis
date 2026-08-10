import { expect } from 'vitest'
import {
  PERMISSION_ACTIONS,
  PERMISSION_BITS_BY_ROLE,
  PERMISSION_PAGE_CODES,
  PERMISSION_ROLES,
} from './accounting-slip-permission-snapshot'
import { PERMISSION_DB_BITS_BY_ROLE } from './accounting-slip-permission-db-snapshot'
import { PERMISSION_MOCK_DIVERGENCES } from './permission-mock-divergences'

type PermissionCell = Record<(typeof PERMISSION_ACTIONS)[number], boolean>
type PermissionEnvelope = { data: Record<string, PermissionCell> }
type MockResponse = (config: { method: string; url: string }) => unknown

function mockRoleCatalog(mockSource: string): string[] {
  const match = mockSource.match(/mock-account-\(([^)]+)\)/)
  return match?.[1]
    ?.split('|')
    .map((role) => role.toUpperCase())
    .sort() ?? []
}

export function assertPermissionCatalogSymmetry({
  mockPageCodes,
  snapshotPageCodes,
  mockRoles,
  snapshotRoles,
}: {
  mockPageCodes: readonly string[]
  snapshotPageCodes: readonly string[]
  mockRoles: readonly string[]
  snapshotRoles: readonly string[]
}): void {
  expect([...mockPageCodes].sort(), 'mock ↔ snapshot page-code catalog').toEqual([...snapshotPageCodes].sort())
  expect([...mockRoles].sort(), 'mock ↔ snapshot role catalog').toEqual([...snapshotRoles].sort())
}

function snapshotPageCatalog(): string[] {
  return [...new Set(Object.values(PERMISSION_BITS_BY_ROLE).flatMap((groups) => Object.values(groups).flat()))].sort()
}

function mockBits(cell: PermissionCell | undefined): string {
  return PERMISSION_ACTIONS.map((action) => cell?.[action] ? '1' : '0').join('')
}

export function collectPermissionMockDivergences({
  getMockResponse,
}: { getMockResponse: MockResponse }): Array<{
  role: string
  pageCode: string
  snapshotBits: string
  mockBits: string
}> {
  return PERMISSION_ROLES.flatMap((role) => {
    const response = getMockResponse({
      method: 'GET',
      url: `/auth/admin/permissions/account/mock-account-${role.toLowerCase()}`,
    }) as PermissionEnvelope
    const expectedByBits = PERMISSION_DB_BITS_BY_ROLE[role]
    return PERMISSION_PAGE_CODES.flatMap((pageCode) => {
      const snapshotBits = expectedByBits?.[pageCode] ?? '0000000'
      const actual = response.data[pageCode]
      const actualBits = mockBits(actual)
      return snapshotBits === actualBits ? [] : [{ role, pageCode, snapshotBits, mockBits: actualBits }]
    })
  })
}

/**
 * Mock account endpoint와 auth_db role_page_permission_templates 스냅샷의
 * 역할 × page code × 7-action 전체 곱을 비교한다. 누락 셀도 0000000으로
 * 묵인하지 않고 page/role 집합 자체를 먼저 비교한다.
 */
export function assertExactPermissionMatrix({
  getMockResponse,
  mockSource,
}: { getMockResponse: MockResponse; mockSource: string }): void {
  const expectedPages = [...PERMISSION_PAGE_CODES].sort()
  const snapshotPages = snapshotPageCatalog()
  assertPermissionCatalogSymmetry({
    mockPageCodes: expectedPages,
    snapshotPageCodes: snapshotPages,
    mockRoles: mockRoleCatalog(mockSource),
    snapshotRoles: [...PERMISSION_ROLES],
  })
  const expectedRoles = [...PERMISSION_ROLES].sort()
  expect(mockRoleCatalog(mockSource), 'mock role catalog').toEqual(expectedRoles)
  const actualDivergences: Array<{
    role: string
    pageCode: string
    snapshotBits: string
    mockBits: string
  }> = []

  for (const role of PERMISSION_ROLES) {
    const response = getMockResponse({
      method: 'GET',
      url: `/auth/admin/permissions/account/mock-account-${role.toLowerCase()}`,
    }) as PermissionEnvelope
    const actual = response.data
    const actualPages = Object.keys(actual).sort()

    expect(actualPages, `${role} page-code catalog`).toEqual(expectedPages)

    const expectedByBits = PERMISSION_DB_BITS_BY_ROLE[role]
    expect(expectedByBits, `${role} snapshot`).toBeDefined()

    for (const pageCode of PERMISSION_PAGE_CODES) {
      const expectedBits = expectedByBits?.[pageCode] ?? '0000000'
      const cell = actual[pageCode]
      expect(cell, `${role} × ${pageCode} cell`).toBeDefined()
      const actualBits = PERMISSION_ACTIONS
        .map((action) => cell?.[action] ? '1' : '0')
        .join('')
      const frozenDivergence = PERMISSION_MOCK_DIVERGENCES.find(
        (item) => item.role === role && item.pageCode === pageCode,
      )
      expect(actualBits, `${role} × ${pageCode}`).toBe(frozenDivergence?.mockBits ?? expectedBits)
    }

    const roleDivergences = PERMISSION_PAGE_CODES
      .map((pageCode) => ({
        role,
        pageCode,
        snapshotBits: expectedByBits?.[pageCode] ?? '0000000',
        mockBits: mockBits(actual[pageCode]),
      }))
      .filter((item) => item.snapshotBits !== item.mockBits)
    actualDivergences.push(...roleDivergences)
    expect(roleDivergences, `${role} frozen mock divergence set`).toEqual(
      PERMISSION_MOCK_DIVERGENCES.filter((item) => item.role === role),
    )
  }
  expect(actualDivergences, 'all frozen mock divergence set').toEqual([...PERMISSION_MOCK_DIVERGENCES])
}
