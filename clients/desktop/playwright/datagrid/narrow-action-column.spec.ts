import { expect, test, type Locator, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const VIEWPORTS = [
  { name: '768px', width: 768 },
  { name: '375px', width: 375 },
  { name: '1920px', width: 1920 },
] as const

type MockRole = 'MASTER' | 'MANAGER'

async function installAuthMock(page: Page, role: MockRole = 'MASTER') {
  await page.addInitScript((mockRole) => {
    const auth = {
      token: `narrow-action-${mockRole}`,
      userId: '00000000-0000-0000-0000-000000010001',
      role: mockRole,
      fullName: mockRole === 'MASTER' ? '오병승' : '김관리',
      partnerCode: 'P-MOCK-001',
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, role)
}

async function openPage(
  page: Page,
  path: string,
  width: number,
  rootTestId?: string,
  role: MockRole = 'MASTER',
) {
  await page.setViewportSize({ width, height: 900 })
  await installAuthMock(page, role)
  await page.goto(`${BASE_URL}/#${path}?mockRole=${role}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  })
  if (rootTestId) {
    await expect(page.getByTestId(rootTestId)).toBeVisible({ timeout: 15_000 })
  }
  await expect(page.locator('table').first()).toBeVisible({ timeout: 15_000 })
}

async function assertVisibleAndClickable(button: Locator, width: number) {
  await expect(button).toHaveCount(1)
  await expect(button).toBeVisible()
  await expect(button).toBeEnabled()

  const cell = button.locator('xpath=ancestor::td[1]')
  if (width <= 768) {
    await expect(cell).toHaveAttribute('data-mobile-priority', 'secondary')
  }
  await expect.poll(async () => button.evaluate((element) => {
    const style = window.getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })).toBe(true)

  await button.click()
}

for (const viewport of VIEWPORTS) {
  test(`수금계획 조작 버튼 ${viewport.name} 도달·실행`, async ({ page }) => {
    await openPage(page, '/accounting/reports/collection-plans', viewport.width)

    const action = page.locator('table').first().getByRole('button', { name: '연체', exact: true }).first()
    await assertVisibleAndClickable(action, viewport.width)
    await expect(page.locator('table tbody tr').first()).toContainText('연체')
  })

  test(`받을어음 조작 버튼 ${viewport.name} 도달·실행`, async ({ page }) => {
    await openPage(page, '/accounting/reports/notes-receivable', viewport.width)

    const action = page.locator('table').first().getByRole('button', { name: '추심', exact: true }).first()
    await assertVisibleAndClickable(action, viewport.width)
    await expect(page.locator('table tbody tr').first()).toContainText('추심')
  })

  test(`권한그룹 조작 버튼 ${viewport.name} 도달·빌트인 잠금 보존`, async ({ page }) => {
    await openPage(page, '/admin/permission-groups/manage', viewport.width, 'perm-group-manage-table')

    const builtinEdit = page.getByTestId('perm-group-edit-master')
    const builtinDelete = page.getByTestId('perm-group-delete-master')
    await expect(builtinEdit).toBeVisible()
    await expect(builtinEdit).toBeDisabled()
    await expect(builtinDelete).toBeVisible()
    await expect(builtinDelete).toBeDisabled()

    const action = page.getByTestId('perm-group-edit-영업팀')
    await assertVisibleAndClickable(action, viewport.width)
    await expect(page.getByTestId('perm-group-form-name')).toHaveValue('영업팀')
  })

  test(`입고전표 DRAFT 전기 버튼 ${viewport.name} 도달·실행`, async ({ page }) => {
    await openPage(page, '/accounting/purchase-slips', viewport.width, 'purchase-accounting-slip-page')

    const pageRoot = page.getByTestId('purchase-accounting-slip-page')
    const dateFilters = pageRoot.locator('input[type="date"]')
    await dateFilters.nth(0).fill('2026-05-01')
    await dateFilters.nth(1).fill('2026-05-31')
    const table = pageRoot.locator('table').first()
    const postedRow = table.getByRole('row').filter({ hasText: '반영완료(전기)' })
    await expect(postedRow.getByRole('button', { name: '전기', exact: true })).toHaveCount(0)
    const action = table.getByRole('button', { name: '전기', exact: true }).first()
    await assertVisibleAndClickable(action, viewport.width)
  })

  test(`출고전표 DRAFT 전기 버튼 ${viewport.name} 도달·실행`, async ({ page }) => {
    await openPage(page, '/accounting/sales-slips', viewport.width, 'sales-accounting-slip-page')

    const pageRoot = page.getByTestId('sales-accounting-slip-page')
    const dateFilters = pageRoot.locator('input[type="date"]')
    await dateFilters.nth(0).fill('2026-05-01')
    await dateFilters.nth(1).fill('2026-05-31')
    const table = pageRoot.locator('table').first()
    const postedRow = table.getByRole('row').filter({ hasText: '반영완료(전기)' })
    await expect(postedRow.getByRole('button', { name: '전기', exact: true })).toHaveCount(0)
    const action = table.getByRole('button', { name: '전기', exact: true }).first()
    await assertVisibleAndClickable(action, viewport.width)
  })

  test(`발송금지 거래처 MASTER 조작 버튼 ${viewport.name} 도달·실행`, async ({ page }) => {
    await openPage(page, '/admin/blocked-partners', viewport.width, 'admin-blocked-table')

    const action = page.getByTestId('admin-blocked-unblock-6789012345')
    await assertVisibleAndClickable(action, viewport.width)
    await expect(page.getByRole('heading', { name: '차단 해제 확인' })).toBeVisible()
  })
}

test('발송금지 거래처 MANAGER에서는 MASTER 전용 조건을 좁은 폭에서도 보존', async ({ page }) => {
  await openPage(page, '/admin/blocked-partners', 768, 'admin-blocked-table', 'MANAGER')

  await expect(page.getByTestId('admin-blocked-unblock-6789012345')).toHaveCount(0)
  await expect(page.getByTestId('admin-blocked-table')).toContainText('MASTER 전용')
})

test('권한그룹 관리 목록은 375·320px에서 전폭을 사용하고 1280px에서는 2열을 유지', async ({ page }) => {
  for (const width of [375, 320]) {
    await openPage(page, '/admin/permission-groups/manage', width, 'perm-group-manage-table')

    const tableContainer = page.getByTestId('perm-group-manage-table')
    const layout = tableContainer.locator('xpath=../..')
    const listSection = layout.locator(':scope > section').first()
    const layoutBox = await layout.boundingBox()
    const listSectionBox = await listSection.boundingBox()

    expect(layoutBox, `${width}px 권한그룹 layout 실측`).not.toBeNull()
    expect(listSectionBox, `${width}px 권한그룹 목록 실측`).not.toBeNull()
    expect(listSectionBox!.width, `${width}px 권한그룹 목록이 전폭이 아님`).toBeGreaterThanOrEqual(layoutBox!.width * 0.9)
  }

  await openPage(page, '/admin/permission-groups/manage', 1280, 'perm-group-manage-table')
  const wideLayout = page.getByTestId('perm-group-manage-table').locator('xpath=../..')
  const wideSections = wideLayout.locator(':scope > section')
  const firstWideSection = await wideSections.nth(0).boundingBox()
  const secondWideSection = await wideSections.nth(1).boundingBox()

  expect(firstWideSection, '1280px 권한그룹 목록 실측').not.toBeNull()
  expect(secondWideSection, '1280px 계정 배속 폼 실측').not.toBeNull()
  expect(firstWideSection!.width, '1280px 권한그룹 목록 1열이 사라짐').toBeGreaterThan(300)
  expect(secondWideSection!.width, '1280px 계정 배속 폼 2열이 사라짐').toBeGreaterThan(300)
})
