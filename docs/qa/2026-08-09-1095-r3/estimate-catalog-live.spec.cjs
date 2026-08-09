const path = require('node:path')
const { test, expect } = require('../../../clients/web/estimate-app/node_modules/playwright/test')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')
const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')

const shotsDir = resolveQaShotsDir(__dirname)
const baseUrl = process.env.QA_URL || 'http://127.0.0.1:5195/?email=dev_master%40samhan-air.com'

test('R3 estimate catalog — 차단 2종, 품절 유지, ACTIVE 입력', async ({ page }) => {
  let qaPassword
  try {
    qaPassword = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error.message}`)
    return
  }
  void qaPassword

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#btnGoSingle')).toBeVisible()
  await page.locator('#btnGoSingle').click()
  await expect(page.locator('#singleBody tr').first()).toBeVisible()

  const search = page.locator('#singleFilterText')
  const exactModelCell = (model) => page.locator('#singleBody tr td.model').filter({ hasText: new RegExp(`^${model}$`) })
  const exactModelRow = (model) => page.locator('#singleBody tr:has(td.model)').filter({ hasText: model })

  await search.fill('AC072BSCPBH2SY')
  await expect(exactModelCell('AC072BSCPBH2SY')).toHaveCount(0)
  await page.screenshot({ path: path.join(shotsDir, '01-discontinued-hidden.png'), fullPage: true })

  await search.fill('AF60F17D11LS')
  await expect(exactModelCell('AF60F17D11LS')).toHaveCount(0)
  await page.screenshot({ path: path.join(shotsDir, '02-not-for-sale-hidden.png'), fullPage: true })

  await search.fill('AR60F09C13WS')
  const outOfStockRow = exactModelRow('AR60F09C13WS')
  await expect(outOfStockRow).toHaveCount(1)
  await expect(outOfStockRow.locator('td.qty')).toHaveText('품절')
  await expect(outOfStockRow.locator('input.qty-input')).toHaveCount(0)
  await page.screenshot({ path: path.join(shotsDir, '03-out-of-stock-visible-locked.png'), fullPage: true })

  await search.fill('AC060CS6PBH1SY')
  const activeRow = exactModelRow('AC060CS6PBH1SY')
  await expect(activeRow).toHaveCount(1)
  const qty = activeRow.locator('input.qty-input')
  await expect(qty).toHaveCount(1)
  await qty.fill('2')
  await qty.dispatchEvent('input')
  await qty.dispatchEvent('change')
  await expect(activeRow.locator('td.sub')).toContainText('3,320,000')
  await page.screenshot({ path: path.join(shotsDir, '04-active-visible-quantity.png'), fullPage: true })

})
