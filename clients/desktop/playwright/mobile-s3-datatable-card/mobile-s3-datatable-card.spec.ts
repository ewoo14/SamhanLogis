import { expect, test, type Page } from '@playwright/test'

const USERS_URL = '/#/admin/users?mockRole=MASTER&mockDepartment=대표실'

async function gotoUsers(page: Page): Promise<void> {
  await page.goto(USERS_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.getByTestId('admin-users-table').waitFor({ timeout: 15_000 })
  await expect(page.getByTestId('admin-users-table').locator('tbody tr').first()).toBeVisible({
    timeout: 15_000,
  })
}

test.describe('모바일 슬3 DataTable 카드 렌더링', () => {
  test('390px 모바일에서는 행이 라벨-값 카드로 렌더되고 가로 overflow 가 없다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoUsers(page)

    const table = page.getByTestId('admin-users-table').locator('table')
    const firstRow = table.locator('tbody tr').first()
    const firstCell = firstRow.locator('td').first()

    await expect(firstCell).toHaveAttribute('data-label', '로그인ID')

    const rowDisplay = await firstRow.evaluate((el) => getComputedStyle(el).display)
    const cellDisplay = await firstCell.evaluate((el) => getComputedStyle(el).display)
    const labelContent = await firstCell.evaluate((el) => getComputedStyle(el, '::before').content)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

    expect(rowDisplay).toBe('block')
    expect(cellDisplay).toBe('flex')
    expect(labelContent).toContain('로그인ID')
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('1280px 데스크탑에서는 테이블 헤더가 보이고 테이블 레이아웃을 유지한다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await gotoUsers(page)

    const table = page.getByTestId('admin-users-table').locator('table')
    const thead = table.locator('thead')
    const firstRow = table.locator('tbody tr').first()

    await expect(thead).toBeVisible()
    await expect(thead.locator('th', { hasText: '로그인ID' })).toBeVisible()

    const tableDisplay = await table.evaluate((el) => getComputedStyle(el).display)
    const rowDisplay = await firstRow.evaluate((el) => getComputedStyle(el).display)

    expect(tableDisplay).toBe('table')
    expect(rowDisplay).toBe('table-row')
  })
})
