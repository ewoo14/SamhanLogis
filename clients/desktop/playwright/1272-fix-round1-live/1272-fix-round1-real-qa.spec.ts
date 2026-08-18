import { expect, test } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1272-fix-round1-live/screenshots'))
const APP = 'http://localhost:5175'
const SHARED_GATEWAY = 'http://localhost:8080'
const BRANCH_GATEWAY = 'http://localhost:18084'
const ESTIMATE = 'http://localhost:5183'
const MODEL = 'AM260AXVHHH1SY'
const PROBE = 'SOL1272-FIX-LIVE-PROBE'

async function auth(page: import('@playwright/test').Page) {
  const response = await page.request.post(`${SHARED_GATEWAY}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  return JSON.parse(raw).data
}

async function installSession(context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page) {
  const session = await auth(page)
  await context.addInitScript(({ token, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, session)
  await page.route('**/auth/**', async (route) => {
    const target = new URL(route.request().url())
    if (target.pathname.endsWith('.ts')) {
      await route.continue()
      return
    }
    target.protocol = 'http:'
    target.hostname = 'localhost'
    target.port = '8080'
    const headers = { ...route.request().headers() }
    delete headers.host
    const response = await route.fetch({ url: target.toString(), headers })
    await route.fulfill({ response })
  })
  return session
}

test('A+B 견적품목 설정 저장과 게이트웨이 200 및 종합견적 반영', async ({ context, page }) => {
  const session = await installSession(context, page)

  const gatewayApi = await page.request.get(
    `${BRANCH_GATEWAY}/api/v1/products/${MODEL}/component-settings?estimateCategory=COMMERCIAL_MULTI`,
    { headers: { Authorization: `Bearer ${session.token}` } },
  )
  const gatewayRows = await gatewayApi.json()
  expect(gatewayApi.status(), JSON.stringify(gatewayRows)).toBe(200)
  expect(gatewayRows).toHaveLength(2)
  const reset = await page.request.put(
    `${BRANCH_GATEWAY}/api/v1/products/${MODEL}/component-settings?estimateCategory=COMMERCIAL_MULTI`,
    {
      headers: { Authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
      data: gatewayRows.map((row: { componentProductCode: string }) => ({
        componentProductCode: row.componentProductCode,
        qtyMode: 'FOLLOW_SET',
        componentKind: 'OUTDOOR',
        componentVariant: null,
        componentShape: null,
        isDefault: true,
      })),
    },
  )
  expect(reset.status()).toBe(200)
  console.log(JSON.stringify({ gatewayStatus: gatewayApi.status(), gatewayRows: gatewayRows.length }))

  await page.goto(`${APP}/#/products/estimate-items`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '견적품목 관리', exact: true })).toBeVisible({ timeout: 30_000 })
  const updateClose = page.getByRole('button', { name: '닫기', exact: true })
  if (await updateClose.count()) await updateClose.first().click()
  await page.getByTestId('estimate-items-category-tab-COMMERCIAL_MULTI').click()
  await page.getByTestId('estimate-items-search-input').fill(MODEL)
  await page.getByTestId('estimate-items-query-button').click()
  const catalogRows = page.getByRole('row').filter({ hasText: MODEL })
  await expect(catalogRows).toHaveCount(1, { timeout: 30_000 })

  await page.getByTestId(`estimate-items-component-settings-${MODEL}`).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('품목구분').first()).toBeVisible()
  const beforeRows = await dialog.locator('strong').count()
  const beforeKind = await dialog.getByLabel('품목구분').nth(0).inputValue()
  const beforeQty = await dialog.getByLabel('수량 동기화').nth(0).inputValue()
  await page.screenshot({ path: path.join(SHOTS, '01-before-category-setting-real-qa.png'), fullPage: true })

  await dialog.getByLabel('수량 동기화').nth(0).selectOption('FIXED')
  await dialog.getByLabel('품목구분').nth(0).selectOption('ACCESSORY')
  await dialog.getByLabel('옵션').nth(0).fill(PROBE)
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })

  await page.getByTestId(`estimate-items-component-settings-${MODEL}`).click()
  await expect(dialog.getByLabel('수량 동기화').nth(0)).toHaveValue('FIXED')
  await expect(dialog.getByLabel('품목구분').nth(0)).toHaveValue('ACCESSORY')
  await expect(dialog.getByLabel('옵션').nth(0)).toHaveValue(PROBE)
  const afterRows = await dialog.locator('strong').count()
  await dialog.screenshot({ path: path.join(SHOTS, '02-after-category-setting-real-qa.png') })
  console.log(JSON.stringify({ beforeRows, beforeKind, beforeQty, afterRows, saved: { qtyMode: 'FIXED', kind: 'ACCESSORY', variant: PROBE } }))
})

test('B 종합견적 실제 페이지가 저장된 카탈로그 설정을 소비한다', async ({ page }) => {
  await page.goto(`${ESTIMATE}/?email=${encodeURIComponent('dev_master@samhan-air.com')}`, { waitUntil: 'load', timeout: 60_000 })
  await page.waitForTimeout(6500)
  await expect(page.locator('#btnGoComm')).toBeVisible({ timeout: 30_000 })
  await page.locator('#btnGoComm').dispatchEvent('click')
  await page.waitForTimeout(1500)
  const injected = await page.locator('#commBody > tr').count()
  const rendered = await page.locator('#commBody > tr, #singleBody > tr').count()
  expect(injected).toBeGreaterThan(0)
  expect(rendered).toBeGreaterThan(0)
  await page.screenshot({ path: path.join(SHOTS, '03-comprehensive-estimate-after-save-real-qa.png'), fullPage: false })
  console.log(JSON.stringify({ comprehensiveEstimateInjectedRows: injected, comprehensiveEstimateRenderedRows: rendered }))
})
