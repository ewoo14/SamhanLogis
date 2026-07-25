import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const qaShotsDir = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '897-column-hierarchy'))

type LoginResult = {
  token: string
  userId: string
  role: string
  displayName: string
}

async function realLogin(page: Page): Promise<LoginResult> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: 'dev_p05_pass!' },
  })
  expect(response.ok(), `실 로그인 HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as { data?: Partial<LoginResult> }
  const data = body.data ?? {}
  return {
    token: data.token ?? '',
    userId: data.userId ?? '',
    role: data.role ?? '',
    displayName: data.displayName ?? 'dev_master',
  }
}

async function installAuth(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript((auth) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: auth.token,
          userId: auth.userId,
          role: auth.role,
          fullName: auth.displayName,
          partnerCode: null,
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, login)
}

async function dismissUpdateModal(page: Page): Promise<void> {
  for (const label of ['닫기', '확인']) {
    const button = page.getByRole('button', { name: label, exact: true })
    if (await button.count()) await button.first().click().catch(() => undefined)
  }
}

async function readGeometry(table: import('@playwright/test').Locator) {
  return table.evaluate((node) => {
    const scroll = node.parentElement
    const wrapper = scroll?.parentElement
    return {
      tableW: Math.round(node.getBoundingClientRect().width),
      wrapperW: Math.round(wrapper?.getBoundingClientRect().width ?? 0),
      docW: document.documentElement.clientWidth,
      scrollW: scroll?.scrollWidth ?? 0,
      headers: Array.from(node.querySelectorAll('thead th')).map((header) => header.textContent?.trim() ?? ''),
    }
  })
}

test.describe.serial('897 실 서버 U-gate', () => {
  test('입출금 내역: 폭·상세·실 캡처', async ({ page }) => {
    const login = await realLogin(page)
    await installAuth(page, login)
    await page.goto('/#/accounting/bank-transactions', { waitUntil: 'domcontentloaded' })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('header-page-title')).toContainText('입출금 내역', { timeout: 30_000 })

    const table = page.locator('.bank-transaction-table table').first()
    await expect(table).toBeVisible({ timeout: 30_000 })
    const geometry = await readGeometry(table)
    console.log('[897 라이브 폭 실측] bank', JSON.stringify(geometry))
    expect(geometry.tableW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)
    expect(geometry.scrollW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)

    const detail = page.locator('details[data-testid^="bank-transaction-detail-"]').first()
    if (await detail.count()) {
      await detail.locator('summary').click()
      const detailValue = await detail.locator('dd').first().textContent()
      console.log('[897 라이브 C2] bank 상세 첫 값', JSON.stringify(detailValue?.trim() ?? ''))
      expect(detailValue?.trim()).toBeTruthy()
    }

    await page.screenshot({ path: join(qaShotsDir, 'bank-live-1600.png'), fullPage: true })
  })

  test('일일 마감: 폭·기존 상세 경로·실 캡처', async ({ page }) => {
    const login = await realLogin(page)
    await installAuth(page, login)
    await page.goto('/#/accounting/daily-closing', { waitUntil: 'domcontentloaded' })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('daily-closing-page')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('daily-closing-filter-date').fill('2020-01-02')

    const table = page.getByTestId('daily-closing-list-table').locator('table')
    await expect(table).toBeVisible({ timeout: 30_000 })
    await expect(table).toContainText('2020-01-02', { timeout: 30_000 })
    const geometry = await readGeometry(table)
    console.log('[897 라이브 폭 실측] daily', JSON.stringify(geometry))
    expect(geometry.tableW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)
    expect(geometry.scrollW, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.wrapperW)

    const detailButton = page.locator('[data-testid^="daily-closing-detail-button-"]').first()
    if (await detailButton.count()) {
      await detailButton.click()
      const detail = page.locator('#daily-closing-detail')
      await expect(detail).toContainText(/\S+/, { timeout: 30_000 })
      console.log('[897 라이브 C2] daily 상세 값', JSON.stringify((await detail.innerText()).slice(0, 240)))
    }

    await page.screenshot({ path: join(qaShotsDir, 'daily-live-1600.png'), fullPage: true })
  })

  test('좁은 폭: #880 조작 버튼 도달성', async ({ page }) => {
    const login = await realLogin(page)
    await installAuth(page, login)
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto('/#/accounting/bank-transactions', { waitUntil: 'domcontentloaded' })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('header-page-title')).toContainText('입출금 내역', { timeout: 30_000 })

    const bankAction = page.locator('td[data-mobile-priority="secondary"] button').first()
    if (await bankAction.count()) {
      await expect(bankAction).toBeVisible()
      await expect(bankAction).toBeEnabled()
    }

    await page.goto('/#/accounting/daily-closing', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('daily-closing-page')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('daily-closing-filter-date').fill('2020-01-02')
    await expect(page.getByTestId('daily-closing-list-table')).toContainText('2020-01-02', { timeout: 30_000 })
    const dailyAction = page.locator('[data-testid^="daily-closing-reverse-button-"]').first()
    if (await dailyAction.count()) {
      await expect(dailyAction).toBeVisible()
      await expect(dailyAction).toBeEnabled()
    }
    expect(await page.locator('td[data-mobile-priority="secondary"] button').count()).toBeGreaterThan(0)
  })
})
