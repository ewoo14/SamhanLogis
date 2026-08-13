import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-11-1051-sol'))
fs.mkdirSync(SHOTS, { recursive: true })

async function installAuth(page: Page): Promise<void> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: {
      loginId: 'dev_master',
      password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'),
    },
  })
  expect(response.ok(), `라이브 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const data = (await response.json()).data
  await page.addInitScript((auth) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, {
    token: data.token,
    userId: data.userId,
    role: data.role,
    fullName: data.displayName ?? 'dev_master',
    partnerCode: null,
  })
}

test('끊긴 재고 행은 수량·페이지·복사에 남고 UUID나 조작 표면은 생기지 않는다', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL })
  await installAuth(page)

  await page.goto(`${BASE_URL}/#/inventory/stock-balance?realQa=1051-sol-r1`, {
    waitUntil: 'domcontentloaded',
  })

  await expect(page.getByTestId('header-page-title')).toHaveText('재고 현황', { timeout: 30_000 })
  await expect(page.getByTestId('inventory-balance-query-button')).toBeVisible()
  const warehouseSelect = page.getByTestId('inventory-balance-warehouse-select')
  await expect(warehouseSelect.locator('option', { hasText: '본사창고' })).toHaveCount(1, { timeout: 30_000 })
  await warehouseSelect.selectOption({ label: '본사창고' })
  await page.getByTestId('inventory-balance-query-button').click()

  const grid = page.getByTestId('inventory-balance-grid')
  const summary = page.getByTestId('inventory-balance-summary')
  await expect(grid).toContainText('참조 끊김', { timeout: 30_000 })
  await expect(grid).toContainText('제품 마스터 없음')

  const firstPageRows = grid.locator('tbody tr')
  const firstPageRowCount = await firstPageRows.count()
  expect(firstPageRowCount).toBeGreaterThan(0)
  expect(firstPageRowCount).toBeLessThanOrEqual(50)
  const missingRow = firstPageRows.filter({ hasText: '참조 끊김' }).first()
  await expect(missingRow).toContainText('제품 마스터 없음')
  const normalRows = firstPageRows.filter({ hasNotText: '참조 끊김' })
  expect(await normalRows.count()).toBeGreaterThan(0)
  const availableText = (await missingRow.locator('td').nth(5).innerText()).replaceAll(',', '')
  const totalText = (await missingRow.locator('td').nth(7).innerText()).replaceAll(',', '')
  expect(Number(availableText)).toBeGreaterThan(0)
  expect(totalText).toBe(availableText)

  const summaryText = await summary.innerText()
  const totalMatch = summaryText.match(/총\s+([\d,]+)건/)
  const pageMatch = summaryText.match(/(\d+)\s*\/\s*(\d+)/)
  expect(totalMatch).not.toBeNull()
  expect(pageMatch).not.toBeNull()
  const totalElements = Number(totalMatch?.[1]?.replaceAll(',', ''))
  const totalPages = Number(pageMatch?.[2])
  expect(totalElements).toBeGreaterThanOrEqual(firstPageRowCount)
  expect(totalPages).toBe(Math.ceil(totalElements / 50))
  expect(totalPages).toBeGreaterThan(1)

  const gridText = await grid.innerText()
  expect(gridText).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)
  await expect(page.getByRole('button', { name: /수정|이동|조정|출고/ })).toHaveCount(0)

  const copiedWarehouseCode = await missingRow.locator('td').nth(2).innerText()
  await missingRow.locator('td').first().click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+C')
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('참조 끊김')
  expect(copied).toContain('제품 마스터 없음')
  expect(copied).toContain(copiedWarehouseCode)

  await page.getByRole('button', { name: '다음 페이지' }).click()
  await expect(summary).toContainText(new RegExp(`2\\s*/\\s*${totalPages}`))
  const secondPageRows = grid.locator('tbody tr')
  const secondPageRowCount = await secondPageRows.count()
  expect(secondPageRowCount).toBeGreaterThan(0)
  expect(secondPageRowCount).toBeLessThanOrEqual(50)

  await page.getByRole('button', { name: '이전 페이지' }).click()
  await expect(summary).toContainText(new RegExp(`1\\s*/\\s*${totalPages}`))
  await expect(grid.locator('tbody tr')).toHaveCount(firstPageRowCount)
  await expect(grid).toContainText('참조 끊김')

  // 복사 선택 강조를 지운 깨끗한 화면으로 최종 증거를 남긴다.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('header-page-title')).toHaveText('재고 현황', { timeout: 30_000 })
  const updateClose = page.getByRole('button', { name: '닫기', exact: true })
  if (await updateClose.isVisible()) await updateClose.click()
  await page.getByTestId('inventory-balance-warehouse-select').selectOption({ label: '본사창고' })
  await page.getByTestId('inventory-balance-query-button').click()
  await expect(page.getByTestId('inventory-balance-grid')).toContainText('참조 끊김', { timeout: 30_000 })
  await expect(page.getByTestId('inventory-balance-summary')).toContainText(/총\s+[\d,]+건/)
  await page.screenshot({
    path: path.join(SHOTS, '1051-sol-first-adversarial-real-qa.png'),
    fullPage: true,
  })
})
