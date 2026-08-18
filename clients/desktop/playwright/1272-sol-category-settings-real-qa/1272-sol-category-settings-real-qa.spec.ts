import { expect, test } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const AUTH_BASE = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const BRANCH_PRODUCT_BASE = process.env['BRANCH_PRODUCT_API_BASE'] ?? 'http://127.0.0.1:18085'
const ESTIMATE_APP_BASE = process.env['ESTIMATE_APP_BASE'] ?? 'http://127.0.0.1:5183'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1272-sol-merge-verdict/category-settings-real-qa'))
const PROBE_VARIANT = 'SOL1272-REACHABILITY-PROBE'

async function login(page: import('@playwright/test').Page) {
  const response = await page.request.post(`${AUTH_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  return JSON.parse(raw).data
}

test('견적품목 설정 모달과 기초품목 편집 경계가 실제 브랜치 API에 도달한다', async ({ context, page }) => {
  const auth = await login(page)
  await context.addInitScript(({ token, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, auth)

  await page.route('**/api/v1/products**', async (route) => {
    const source = new URL(route.request().url())
    if (source.pathname.endsWith('/catalog-realtime')) {
      await route.continue()
      return
    }
    const headers = {
      ...route.request().headers(),
      'x-user-id': String(auth.userId),
    }
    delete headers.host
    const response = await route.fetch({
      url: `${BRANCH_PRODUCT_BASE}${source.pathname}${source.search}`,
      headers,
    })
    await route.fulfill({ response })
  })

  await page.goto(`${APP_BASE}/#/products/estimate-items`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '견적품목 관리', exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('estimate-items-category-tab-COMMERCIAL_MULTI').click()
  await expect(page.getByTestId('estimate-items-category-tab-COMMERCIAL_MULTI')).toHaveAttribute('aria-selected', 'true')
  await page.getByTestId('estimate-items-search-input').fill('AM260AXVHHH1SY')
  await page.getByTestId('estimate-items-query-button').click()
  const catalogRows = page.getByRole('row').filter({ hasText: 'AM260AXVHHH1SY' })
  await expect(catalogRows).toHaveCount(1, { timeout: 30_000 })
  await expect(catalogRows).toBeVisible()
  const catalogRowCount = await catalogRows.count()
  await page.screenshot({ path: path.join(SHOTS, '01-estimate-items-filtered-row-real-qa.png'), fullPage: true })

  await page.getByTestId('estimate-items-component-settings-AM260AXVHHH1SY').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('카테고리별 설정 · AM260AXVHHH1SY')).toBeVisible()
  const settingRows = dialog.locator('strong')
  await expect(settingRows).toHaveCount(2, { timeout: 30_000 })
  await expect(dialog.getByLabel('수량 동기화')).toHaveCount(2)
  await expect(dialog.getByLabel('품목구분')).toHaveCount(2)
  await expect(dialog.getByLabel('옵션')).toHaveCount(2)
  const settingRowCount = await settingRows.count()
  await page.screenshot({ path: path.join(SHOTS, '02-estimate-items-category-settings-modal-real-qa.png'), fullPage: true })

  await dialog.getByLabel('수량 동기화').nth(0).selectOption('FIXED')
  await dialog.getByLabel('품목구분').nth(0).selectOption('ACCESSORY')
  await dialog.getByLabel('옵션').nth(0).fill(PROBE_VARIANT)
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  await page.getByTestId('estimate-items-component-settings-AM260AXVHHH1SY').click()
  await expect(dialog.getByLabel('수량 동기화').nth(0)).toHaveValue('FIXED')
  await expect(dialog.getByLabel('품목구분').nth(0)).toHaveValue('ACCESSORY')
  await expect(dialog.getByLabel('옵션').nth(0)).toHaveValue(PROBE_VARIANT)
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(SHOTS, '05-saved-setting-reopened-real-qa.png'), fullPage: true })

  const internalCatalog = await page.request.get(
    `${BRANCH_PRODUCT_BASE}/products/internal/estimate-catalog/components?category=COMMERCIAL_MULTI`,
    { headers: { 'X-Internal-Token': resolveQaCredential('QA_INTERNAL_TOKEN') } },
  )
  expect(internalCatalog.status()).toBe(200)
  const internalRows = (await internalCatalog.json()).data as Array<{
    setModelCode: string
    componentModelCode: string
    kind: string | null
    variant: string | null
  }>
  const consumedRow = internalRows.find((row) =>
    row.setModelCode === 'AM260AXVHHH1SY' && row.componentModelCode === 'AM100AXVHHH1')
  expect(consumedRow).toBeTruthy()
  expect(consumedRow?.variant).not.toBe(PROBE_VARIANT)
  expect(consumedRow?.kind).toBe('OUTDOOR')
  await page.keyboard.press('Escape')

  await page.goto(`${APP_BASE}/#/products/AM260AXVHHH1SY/edit`, { waitUntil: 'domcontentloaded' })
  const editor = page.getByTestId('product-form-components-editor')
  await expect(editor).toBeVisible({ timeout: 30_000 })
  const componentRows = editor.locator('[data-testid^="product-form-component-row-"]')
  await expect(componentRows).toHaveCount(2)
  await expect(editor.getByLabel('수량 동기화')).toHaveCount(0)
  await expect(editor.getByLabel('품목구분')).toHaveCount(0)
  await expect(editor.getByLabel('옵션')).toHaveCount(0)
  await expect(editor.getByLabel('고정금액')).toHaveCount(2)
  await expect(editor.getByText(/구성품 관계·기본수량·납품가는 이 화면의 정본/).first()).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '03-basic-product-components-editor-real-qa.png'), fullPage: true })

  console.log(JSON.stringify({
    estimateItemsFilteredRows: catalogRowCount,
    categorySettingRows: settingRowCount,
    basicProductComponentRows: await componentRows.count(),
    savedSetting: { qtyMode: 'FIXED', kind: 'ACCESSORY', variant: PROBE_VARIANT },
    consumedByComprehensiveEstimate: { kind: consumedRow?.kind, variant: consumedRow?.variant },
  }))
  await page.unrouteAll({ behavior: 'wait' })
})

test('종합견적서 SINGLE_SET 실제 카탈로그를 렌더링한다', async ({ page }) => {
  await page.goto(`${ESTIMATE_APP_BASE}/?email=${encodeURIComponent('dev_master@samhan-air.com')}`, {
    waitUntil: 'load',
    timeout: 60_000,
  })
  await page.waitForTimeout(6_500)
  await page.locator('#btnGoSingle').click()
  await page.waitForTimeout(1_000)
  const injectedRows = await page.evaluate(() => {
    // @ts-expect-error legacy inline global
    return Array.isArray(SINGLE_SETS) ? SINGLE_SETS.length : -1
  })
  expect(injectedRows).toBe(224)
  const renderedRows = page.locator('#singleBody > tr')
  expect(await renderedRows.count()).toBeGreaterThan(0)
  await page.screenshot({ path: path.join(SHOTS, '04-comprehensive-estimate-single-catalog-real-qa.png'), fullPage: false })
  console.log(JSON.stringify({ comprehensiveEstimateInjectedRows: injectedRows, comprehensiveEstimateRenderedRows: await renderedRows.count() }))
})
