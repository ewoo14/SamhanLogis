import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1131-r3-adversarial/screenshots'))

test('R3 BUNDLE 전개행의 수량·단가·삭제가 사용자 입력으로 실제 도달한다', async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.goto(`${APP_BASE}/#/sales/slip-005?mockRole=MASTER&mockBundleMode=EXPAND`, {
    waitUntil: 'domcontentloaded',
  })
  await page.getByTestId('sales-slip-edit-button').click()
  await expect(page.getByTestId('sales-slip-edit-modal')).toBeVisible()

  const rows = page.locator('[data-testid="sales-slip-edit-lines"] tbody tr')
  const before = await rows.count()
  const draftLineNo = before
  const product = page.getByRole('combobox', { name: `라인 ${draftLineNo} 품목` })
  await product.fill('SET-HM2WAY')
  await expect.poll(() => rows.count()).toBeGreaterThan(before)

  const afterExpand = await rows.count()
  const componentCount = afterExpand - before
  expect(componentCount).toBeGreaterThanOrEqual(3)

  const firstComponentLineNo = draftLineNo
  const secondComponentLineNo = draftLineNo + 1
  const thirdComponentLineNo = draftLineNo + 2
  const quantity = page.getByRole('spinbutton', { name: `수량 ${firstComponentLineNo}` })
  const unitPrice = page.getByRole('spinbutton', { name: new RegExp(`단가\\(VAT포함\\) ${secondComponentLineNo}$`) })
  await quantity.fill('9')
  await unitPrice.fill('123456')
  await page.getByRole('button', { name: `${thirdComponentLineNo}번 행 삭제` }).click()

  await expect(quantity).toHaveValue('9')
  await expect(unitPrice).toHaveValue('123456')
  await expect(rows).toHaveCount(afterExpand - 1)
  await expect(page.getByTestId('sales-slip-edit-save')).toBeEnabled()
  await page.screenshot({
    path: path.join(SHOTS, '01-r3-bundle-user-edits-before-save.png'),
    fullPage: true,
  })
})
