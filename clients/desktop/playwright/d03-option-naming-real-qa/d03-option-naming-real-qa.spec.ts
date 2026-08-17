import { test, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/d03-option-naming-unify'))
fs.mkdirSync(shots, { recursive: true })
const estimateUrl = process.env['D03_ESTIMATE_URL'] ?? 'http://127.0.0.1:5183/?email=dev_master%40samhan-air.com'

async function capture(page: Page, url: string, name: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const controls = await page.locator('select').evaluateAll((els) => els.map((el) => ({
    id: el.id,
    label: el.closest('label')?.textContent?.trim() ?? '',
    options: Array.from(el.options).map((option) => option.value),
  })))
  fs.writeFileSync(path.join(shots, `${name}.json`), JSON.stringify({ url, controls }, null, 2), 'utf8')
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true })
}

test('D-03 세 화면 리모컨·판넬 셀렉트와 옵션 개수 캡처', async ({ page }) => {
  await capture(page, estimateUrl, '01-estimate-home-default')
  await capture(page, estimateUrl, '02-estimate-single')
  await capture(page, estimateUrl, '03-estimate-commercial')
})
