import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1131-r2-adversarial/screenshots'))

test('HEAD 수정 화면에서 BUNDLE 선택이 구성품 여러 행으로 전개되는 사용자 표면', async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.goto(`${APP_BASE}/#/sales/slip-005?mockRole=MASTER&mockBundleMode=EXPAND`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.getByTestId('sales-slip-edit-button')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('sales-slip-edit-button').click()
  await expect(page.getByTestId('sales-slip-edit-modal')).toBeVisible({ timeout: 30_000 })

  const product = page.getByRole('combobox', { name: '라인 4 품목' })
  await expect(product).toBeVisible()
  await product.fill('SET-HM2WAY')

  const rows = page.locator('[data-testid="sales-slip-edit-lines"] tbody tr')
  await expect(rows).toHaveCount(8, { timeout: 30_000 })
  await expect(page.getByRole('combobox', { name: '라인 4 품목' })).toHaveValue(/AJ040RXH4BC1/)
  await expect(page.getByRole('combobox', { name: '라인 5 품목' })).not.toHaveValue('')
  await page.screenshot({
    path: path.join(SHOTS, '07-head-mock-bundle-expanded-user-surface.png'),
    fullPage: true,
  })
})
