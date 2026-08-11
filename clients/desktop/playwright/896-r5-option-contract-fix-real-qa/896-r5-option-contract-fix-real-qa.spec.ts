import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env['QA_ESTIMATE_BASE'] ?? 'http://127.0.0.1:5317'
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-09-896-r5'))
const SOURCE = 'AM052BN6PBH1'
const REMOTE = 'AWR-WE13N'
const PHASE = process.env['QA_PHASE'] ?? 'after'

function qty(page: Page, model: string) {
  return page.locator(`input.qty-input[data-m="${model}"]:not(.fix-dc-inp)`)
}

async function measure(page: Page, option: string, serverFailure = false): Promise<{ qty: string; amount: string }> {
  await page.goto(`${BASE}/?email=dev_master%40samhan-air.com`, { waitUntil: 'domcontentloaded' })
  await page.locator('#btnGoHome').click()
  await expect(qty(page, SOURCE)).toBeVisible({ timeout: 30_000 })
  await page.locator('#home_remote').selectOption(option)
  if (serverFailure) {
    await page.evaluate(() => {
      window.SamhanQuantitySync.evaluateQuantitySyncRules = () => null
    })
  }
  await qty(page, SOURCE).fill('2')
  await qty(page, SOURCE).blur()
  await page.waitForTimeout(500)
  const mode = serverFailure ? 'failure' : PHASE
  await page.locator('#homeOpts').screenshot({ path: path.join(SHOTS, `r5-${mode}-${option}.png`) })
  await page.locator(`tr[data-m="${REMOTE}"]`).screenshot({ path: path.join(SHOTS, `r5-${mode}-${option}-row.png`) })
  return {
    qty: (await qty(page, REMOTE).inputValue()) || '0',
    amount: await page.locator(`td.sub[data-sub="${REMOTE}"]`).innerText(),
  }
}

test.describe.serial(`#896 R5 ${PHASE} — 홈 리모컨 옵션 계약`, () => {
  const expected = { 기본: '2', 유선: '2', 컬러: '0', 제외: '0' }
  for (const option of Object.keys(expected)) {
    test(`${option} 옵션의 AWR-WE13N 수량·금액`, async ({ page }) => {
      const measured = await measure(page, option)
      console.log(`[R5 ${PHASE} option=${option}] ${SOURCE}=2 ${REMOTE}=${measured.qty} amount=${measured.amount}`)
      if (PHASE === 'after') {
        expect(measured.qty).toBe(expected[option as keyof typeof expected])
        expect(measured.amount).toBe(expected[option as keyof typeof expected] === '0' ? '0' : '90,750')
      } else if (option === '제외') {
        expect(measured).toMatchObject({ qty: '0', amount: /0/ })
      }
    })
  }
})

test.describe.serial('#896 R5 규칙 실패 fallback — 레거시 옵션 계약', () => {
  const expected = { 기본: '0', 유선: '2', 컬러: '0', 제외: '0' }
  for (const option of Object.keys(expected)) {
    test(`서버 규칙 실패 ${option} 옵션`, async ({ page }) => {
      const measured = await measure(page, option, true)
      console.log(`[R5 failure option=${option}] ${SOURCE}=2 ${REMOTE}=${measured.qty} amount=${measured.amount}`)
      expect(measured.qty).toBe(expected[option as keyof typeof expected])
      expect(measured.amount).toBe(expected[option as keyof typeof expected] === '0' ? '0' : '90,750')
    })
  }
})
