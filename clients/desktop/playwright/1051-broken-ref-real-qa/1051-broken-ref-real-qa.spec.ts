import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-11-1051-real-qa'))
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

test('끊긴 품목 참조가 있어도 재고 잔고 화면이 행과 수량을 보존한다', async ({ page }) => {
  await installAuth(page)

  await page.goto(`${BASE_URL}/#/inventory/stock-balance?realQa=1051`, {
    waitUntil: 'domcontentloaded',
  })

  // 화면 도달 증명: 이 페이지 전용 제목과 조회 버튼을 캡처 전에 단정한다.
  await expect(page.getByTestId('header-page-title')).toHaveText('재고 현황', { timeout: 30_000 })
  await expect(page.getByTestId('inventory-balance-query-button')).toBeVisible()
  const warehouseSelect = page.getByTestId('inventory-balance-warehouse-select')
  await expect(warehouseSelect.locator('option', { hasText: '본사창고' })).toHaveCount(1, { timeout: 30_000 })
  await warehouseSelect.selectOption({ label: '본사창고' })

  await page.getByTestId('inventory-balance-query-button').click()
  const grid = page.getByTestId('inventory-balance-grid')
  await expect(grid).toBeVisible({ timeout: 30_000 })
  await expect(grid).toContainText('품목코드')
  await expect(grid).toContainText('참조 끊김', { timeout: 30_000 })
  await expect(grid).toContainText('제품 마스터 없음')
  await expect(page.getByTestId('inventory-balance-summary')).toBeVisible()

  const bodyText = await grid.innerText()
  expect(bodyText).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)

  await page.screenshot({
    path: path.join(SHOTS, '1051-broken-reference-balance-screen.png'),
    fullPage: true,
  })
})
