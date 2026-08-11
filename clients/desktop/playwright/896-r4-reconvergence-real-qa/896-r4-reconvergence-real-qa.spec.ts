import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const ESTIMATE_BASE = process.env['QA_ESTIMATE_BASE'] ?? 'http://127.0.0.1:5317'
const ORDER_BASE = process.env['QA_ORDER_BASE'] ?? 'http://127.0.0.1:5318'
const SHOTS = resolveQaShotsDir(
  path.resolve(dirname, '../../../../docs/qa/2026-08-09-896-r4'),
)
const SOURCE = 'AM052BN6PBH1'
const REMOTE = 'AWR-WE13N'

function qty(page: Page, model: string) {
  return page.locator(`input.qty-input[data-m="${model}"]:not(.fix-dc-inp)`)
}

async function enterHome(page: Page): Promise<void> {
  await page.goto(`${ESTIMATE_BASE}/?email=dev_master%40samhan-air.com`, {
    waitUntil: 'domcontentloaded',
  })
  await page.locator('#btnGoHome').click()
  await expect(qty(page, SOURCE)).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('#home_remote')).toBeVisible()
}

async function measureOption(page: Page, option: string, slug: string): Promise<string> {
  await enterHome(page)
  await page.locator('#home_remote').selectOption(option)
  await expect(page.locator('#home_remote')).toHaveValue(option)
  await qty(page, SOURCE).fill('2')
  await qty(page, SOURCE).blur()
  await expect(qty(page, REMOTE)).toHaveValue('2', { timeout: 15_000 })
  const remoteQty = await qty(page, REMOTE).inputValue()
  console.log(`[R4 option=${option}] ${SOURCE}=2 ${REMOTE}=${remoteQty}`)
  await page.locator('#homeOpts').screenshot({ path: path.join(SHOTS, `${slug}-option.png`) })
  await page.locator(`tr[data-m="${REMOTE}"]`).screenshot({
    path: path.join(SHOTS, `${slug}-${REMOTE}-row.png`),
  })
  return remoteQty
}

test.describe.serial('#896 R4 적대검증 — 실 종합견적서 옵션별 서버 규칙 도달성', () => {
  test('기본 옵션에서도 AWR-WE13N이 서버 규칙 target 수량 2로 수렴한다', async ({ page }) => {
    expect(await measureOption(page, '기본', '01-default')).toBe('2')
  })

  test('유선 옵션에서도 AWR-WE13N이 수량 2로 수렴한다', async ({ page }) => {
    expect(await measureOption(page, '유선', '02-wired')).toBe('2')
  })

  test('컬러 옵션에서도 서버 규칙이 AWR-WE13N을 수량 2로 덮는다', async ({ page }) => {
    expect(await measureOption(page, '컬러', '03-color')).toBe('2')
  })

  test('부분 실패 bootstrap 18개 키를 실제 order-app이 undefined 없이 소비한다', async ({ page }) => {
    const pageErrors: string[] = []
    const consoleErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    const bootstrapResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/partner-orders/bootstrap'),
    )
    await page.goto(ORDER_BASE, { waitUntil: 'domcontentloaded' })
    const response = await bootstrapResponse
    const raw = await response.text()
    expect(response.status(), raw).toBe(200)
    await page.waitForFunction(() => {
      const payload = window.__SAMHAN_BOOTSTRAP__ as Record<string, unknown> | undefined
      return Array.isArray(payload?.homemulti) && payload.homemulti.length === 121
    })
    const measured = await page.evaluate(() => {
      const payload = window.__SAMHAN_BOOTSTRAP__ as Record<string, unknown>
      return {
        keys: Object.keys(payload),
        homemulti: Array.isArray(payload.homemulti) ? payload.homemulti.length : -1,
        commercialMulti: Array.isArray(payload.commercialMulti) ? payload.commercialMulti.length : -1,
        singleSets: Array.isArray(payload.singleSets) ? payload.singleSets.length : -1,
        homeIncPresent: Object.prototype.hasOwnProperty.call(payload, 'homeInc'),
        commIncPresent: Object.prototype.hasOwnProperty.call(payload, 'commInc'),
        singleIncPresent: Object.prototype.hasOwnProperty.call(payload, 'singleInc'),
      }
    })
    console.log('[R4 order-app bootstrap 실측]', JSON.stringify(measured))
    expect(measured.keys).toHaveLength(18)
    expect(measured).toMatchObject({
      homemulti: 121,
      commercialMulti: 0,
      singleSets: 0,
      homeIncPresent: true,
      commIncPresent: true,
      singleIncPresent: true,
    })
    expect(pageErrors).toEqual([])
    expect(consoleErrors.filter((message) => message.includes('bootstrap'))).toEqual([])
    await page.screenshot({ path: path.join(SHOTS, '05-order-app-partial-fallback-consumed.png') })
  })

  test('제외 옵션에서도 서버 규칙이 AWR-WE13N을 수량 2로 되살린다', async ({ page }) => {
    const remoteQty = await measureOption(page, '제외', '04-excluded')
    expect(remoteQty, '리모컨 제외 옵션이면 AWR-WE13N 수량은 0이어야 한다').toBe('0')
  })
})
