import { expect } from 'vitest'
import {
  PERMISSION_ACTIONS,
  PERMISSION_BITS_BY_ROLE,
  PERMISSION_PAGE_CODES,
  PERMISSION_ROLES,
} from './accounting-slip-permission-snapshot'

type PermissionCell = Record<(typeof PERMISSION_ACTIONS)[number], boolean>
type PermissionEnvelope = { data: Record<string, PermissionCell> }
type MockResponse = (config: { method: string; url: string }) => unknown

/**
 * Mock account endpoint와 auth_db role_page_permission_templates 스냅샷의
 * 역할 × page code × 7-action 전체 곱을 비교한다. 누락 셀도 0000000으로
 * 묵인하지 않고 page/role 집합 자체를 먼저 비교한다.
 */
export function assertExactPermissionMatrix({ getMockResponse }: { getMockResponse: MockResponse }): void {
  const expectedPages = [...PERMISSION_PAGE_CODES].sort()

  for (const role of PERMISSION_ROLES) {
    const response = getMockResponse({
      method: 'GET',
      url: `/auth/admin/permissions/account/mock-account-${role.toLowerCase()}`,
    }) as PermissionEnvelope
    const actual = response.data
    const actualPages = Object.keys(actual).sort()

    expect(actualPages, `${role} page-code catalog`).toEqual(expectedPages)

    const expectedByBits = PERMISSION_BITS_BY_ROLE[role]
    expect(expectedByBits, `${role} snapshot`).toBeDefined()

    for (const pageCode of PERMISSION_PAGE_CODES) {
      const expectedBits = Object.entries(expectedByBits ?? {})
        .find(([, pages]) => pages.includes(pageCode))?.[0] ?? '0000000'
      const cell = actual[pageCode]
      expect(cell, `${role} × ${pageCode} cell`).toBeDefined()
      const actualBits = PERMISSION_ACTIONS
        .map((action) => cell?.[action] ? '1' : '0')
        .join('')
      expect(actualBits, `${role} × ${pageCode}`).toBe(expectedBits)
    }
  }
}
