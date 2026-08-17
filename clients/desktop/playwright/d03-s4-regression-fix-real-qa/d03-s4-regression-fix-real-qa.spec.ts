import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5180'
const SHOTS = resolveQaShotsDir(
  path.resolve(HERE, '../../../../docs/qa/d03-s4-regression-fix'),
  { protect: false },
)
fs.mkdirSync(SHOTS, { recursive: true })

async function optionValues(page: import('@playwright/test').Page, selector: string) {
  return page.locator(selector).evaluate((node) =>
    Array.from((node as HTMLSelectElement).options).map((option) => option.value),
  )
}

test('D-03 회귀 수정: 홈멀티·상업멀티·싱글 옵션 목록과 캡처', async ({ page }) => {
  await page.goto(`${BASE_URL}/?email=dev_master%40samhan-air.com`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  })
  await page.waitForSelector('#btnEnterHome', { timeout: 60_000 })

  const result: Record<string, string[]> = {}
  const capture = async (name: string, selector: string) => {
    await expect(page.locator(selector)).toBeVisible({ timeout: 30_000 })
    result[name] = await optionValues(page, selector)
    await page.locator(selector).screenshot({ path: path.resolve(SHOTS, `${name}-options.png`) })
  }

  await page.locator('#btnEnterHome').click()
  await capture('home-multi', '#home_panel')

  await page.locator('#btnGoComm').click()
  await capture('commercial-multi', '#comm_panel')

  await page.locator('#btnGoSingle').click()
  await capture('single', '#ss_panel')

  expect(result['home-multi']?.length).toBeGreaterThan(0)
  expect(result['commercial-multi']?.length).toBeGreaterThan(0)
  expect(result.single?.length).toBeGreaterThan(0)
  console.log(`[D03 options] ${JSON.stringify(result)}`)
})
