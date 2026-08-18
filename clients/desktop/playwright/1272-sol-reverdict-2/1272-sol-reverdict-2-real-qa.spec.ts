import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1272-sol-reverdict-2/screenshots'))
const DESKTOP = 'http://127.0.0.1:5175'
const ESTIMATE = 'http://127.0.0.1:5183'
const SHARED_GATEWAY = 'http://127.0.0.1:8080'
const BRANCH_GATEWAY = 'http://127.0.0.1:18084'
const MODEL = 'AM260AXVHHH1SY'
const PART = 'AM100AXVHHH1'
const SINGLE_MODEL = 'AC023CS1DBC1SY'
const SINGLE_PART = 'AC023CN1DBC1'
const COMM_PROBE = 'SOL1272-R2-COMM-FIXED'

async function session(page: Page) {
  const response = await page.request.post(`${SHARED_GATEWAY}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  const body = await response.json()
  expect(response.status(), JSON.stringify(body)).toBe(200)
  return body.data
}

async function installDesktopSession(page: Page, auth: any) {
  await page.context().addInitScript(({ token, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, auth)
  await page.route(`${BRANCH_GATEWAY}/**`, async (route) => {
    const target = new URL(route.request().url())
    if (target.pathname.startsWith('/api/v1/products') || target.pathname.startsWith('/api/products')) {
      await route.continue()
      return
    }
    target.port = '8080'
    const headers = { ...route.request().headers() }
    delete headers.host
    const response = await route.fetch({ url: target.toString(), headers })
    await route.fulfill({ response })
  })
}

function settingRows(rows: any[], first: { qtyMode: string; componentKind: string; componentVariant: string | null }) {
  return rows.map((row, index) => ({
    componentProductCode: row.componentProductCode,
    qtyMode: index === 0 ? first.qtyMode : 'FOLLOW_SET',
    componentKind: index === 0 ? first.componentKind : 'OUTDOOR',
    componentVariant: index === 0 ? first.componentVariant : null,
    componentShape: null,
    isDefault: true,
  }))
}

async function openEstimate(page: Page) {
  await page.goto(`${ESTIMATE}/?email=${encodeURIComponent('dev_master@samhan-air.com')}`, { waitUntil: 'load', timeout: 60_000 })
  await expect(page.locator('#btnGoComm')).toBeVisible({ timeout: 30_000 })
  await page.locator('#btnGoComm').dispatchEvent('click')
  await expect.poll(
    () => page.locator('#commBody > tr').count(),
    { timeout: 30_000 },
  ).toBeTruthy()
}

async function estimateSnapshot(page: Page) {
  return page.evaluate(({ model, part, singleModel, singlePart }) => {
    const comm = ((window as any).eval('COMM_PARTS') || []).filter((row: any) => row.setModel === model || row.refModel === model)
    const single = ((window as any).eval('SINGLE_PARTS') || []).filter((row: any) => row.setModel === singleModel || row.refModel === singleModel)
    return {
      commBaseRows: document.querySelectorAll('#commBody > tr:not([data-part-of])').length,
      commPartRows: document.querySelectorAll('#commBody > tr[data-part-of]').length,
      singleBaseRows: document.querySelectorAll('#singleBody > tr:not([data-part-of])').length,
      singlePartRows: document.querySelectorAll('#singleBody > tr[data-part-of]').length,
      totalRows: document.querySelectorAll('#commBody > tr, #singleBody > tr').length,
      commTarget: comm.find((row: any) => row.model === part),
      singleTarget: single.find((row: any) => row.model === singlePart),
    }
  }, { model: MODEL, part: PART, singleModel: SINGLE_MODEL, singlePart: SINGLE_PART })
}

async function setQtyAndReadPart(page: Page, section: 'comm' | 'single') {
  if (section === 'comm') {
    await page.locator('#btnGoComm').dispatchEvent('click')
    const setRow = page.locator(`#commBody > tr[data-m="${MODEL}"]:not([data-part-of])`)
    await expect(setRow).toHaveCount(1)
    await setRow.locator(`.qty-input[data-model="${MODEL}"]`).fill('2')
    await setRow.scrollIntoViewIfNeeded()
    const value = await page.evaluate(({ model, part }) => {
      const rows = (window as any).eval('COMMULTI')
      const target = rows.find((row: any) => row.model === model)
      const expanded = (window as any).eval('explodeCommSets_')(target, 2)
      return expanded.find((row: any) => row.model === part)?.qty
    }, { model: MODEL, part: PART })
    return { value, setRow }
  }
  await page.locator('#btnGoSingle').dispatchEvent('click')
  const setRow = page.locator('#singleBody > tr:not([data-part-of])').filter({ has: page.locator(`td.model:text-is("${SINGLE_MODEL}")`) })
  await expect(setRow).toHaveCount(1)
  const setId = await setRow.getAttribute('data-id')
  expect(setId).toBeTruthy()
  await setRow.locator('.qty-input').first().fill('2')
  await setRow.scrollIntoViewIfNeeded()
  const value = await page.evaluate(({ model, part }) => {
    const rows = (window as any).eval('SINGLE_SETS')
    const target = rows.find((row: any) => row.model === model)
    const expanded = (window as any).eval('explodeSetParts')(target, 2, null)
    return expanded.find((row: any) => row.model === part)?.qty
  }, { model: SINGLE_MODEL, part: SINGLE_PART })
  return { value, setRow }
}

test('게이트웨이 no-strip 200과 인접 기존 경로 보존', async ({ page }) => {
  const auth = await session(page)
  const headers = { Authorization: `Bearer ${auth.token}` }
  const probes = [
    `/api/v1/products/${MODEL}/component-settings?estimateCategory=COMMERCIAL_MULTI`,
    `/api/v1/products/${MODEL}/components`,
    `/api/v1/products/${MODEL}/specs`,
    '/api/v1/products?estimateCategory=COMMERCIAL_MULTI&page=0&size=1',
  ]
  const results = []
  for (const probe of probes) {
    const response = await page.request.get(`${BRANCH_GATEWAY}${probe}`, { headers })
    results.push({ path: new URL(`${BRANCH_GATEWAY}${probe}`).pathname, status: response.status() })
    expect(response.status(), probe).toBe(200)
  }
  const suffix = await page.request.get(`${BRANCH_GATEWAY}/api/v1/products/${MODEL}/component-settings/extra?estimateCategory=COMMERCIAL_MULTI`, { headers })
  expect(suffix.status()).toBe(404)
  console.log(JSON.stringify({ gatewayRoutes: results, nonMatchingSuffix: suffix.status() }))
})

test('화면 저장 후 카테고리 격리와 종합견적 실제 전개', async ({ page }) => {
  const auth = await session(page)
  const headers = { Authorization: `Bearer ${auth.token}` }
  const getRows = async (category: string) => {
    const response = await page.request.get(`${BRANCH_GATEWAY}/api/v1/products/${MODEL}/component-settings?estimateCategory=${category}`, { headers })
    expect(response.status()).toBe(200)
    return response.json()
  }
  const putRows = async (category: string, rows: any[]) => {
    const response = await page.request.put(`${BRANCH_GATEWAY}/api/v1/products/${MODEL}/component-settings?estimateCategory=${category}`, {
      headers: { ...headers, 'content-type': 'application/json' }, data: rows,
    })
    expect(response.status(), await response.text()).toBe(200)
  }

  const commRows = await getRows('COMMERCIAL_MULTI')
  const singleResponse = await page.request.get(`${BRANCH_GATEWAY}/api/v1/products/${SINGLE_MODEL}/component-settings?estimateCategory=SINGLE_SET`, { headers })
  expect(singleResponse.status()).toBe(200)
  const singleRows = await singleResponse.json()
  expect(commRows).toHaveLength(2)
  expect(singleRows).toHaveLength(7)
  await putRows('COMMERCIAL_MULTI', settingRows(commRows, { qtyMode: 'FOLLOW_SET', componentKind: 'OUTDOOR', componentVariant: null }))

  await openEstimate(page)
  const before = await estimateSnapshot(page)
  expect(before.commTarget.qtyMode).toBe('FOLLOW_SET')
  expect(before.singleTarget.qtyMode).toBe('FOLLOW_SET')
  expect((await setQtyAndReadPart(page, 'comm')).value).toBe(2)

  await installDesktopSession(page, auth)
  await page.goto(`${DESKTOP}/#/products/estimate-items`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '견적품목 관리', exact: true })).toBeVisible({ timeout: 30_000 })
  const editorUpdateClose = page.getByRole('button', { name: '닫기', exact: true })
  if (await editorUpdateClose.count()) await editorUpdateClose.first().click()
  await page.getByTestId('estimate-items-category-tab-COMMERCIAL_MULTI').click()
  await page.getByTestId('estimate-items-search-input').fill(MODEL)
  await page.getByTestId('estimate-items-query-button').click()
  await expect(page.getByRole('row').filter({ hasText: MODEL })).toHaveCount(1, { timeout: 30_000 })
  await page.getByTestId(`estimate-items-component-settings-${MODEL}`).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('수량 동기화').first().selectOption('FIXED')
  await dialog.getByLabel('품목구분').first().selectOption('ACCESSORY')
  await dialog.getByLabel('옵션').first().fill(COMM_PROBE)
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByTestId(`estimate-items-component-settings-${MODEL}`).click()
  await expect(dialog.getByLabel('수량 동기화').first()).toHaveValue('FIXED')
  await dialog.screenshot({ path: path.join(SHOTS, '01-commercial-fixed-saved-real-qa.png') })
  await dialog.getByRole('button', { name: '닫기', exact: true }).click()

  await page.getByTestId('estimate-items-category-tab-SINGLE_SET').click()
  await page.getByTestId('estimate-items-search-input').fill(SINGLE_MODEL)
  await page.getByTestId('estimate-items-query-button').click()
  await expect(page.getByRole('row').filter({ hasText: SINGLE_MODEL })).toHaveCount(1, { timeout: 30_000 })
  await page.getByTestId(`estimate-items-component-settings-${SINGLE_MODEL}`).click()
  await expect(dialog.getByLabel('수량 동기화').first()).toHaveValue('FOLLOW_SET')
  await expect(dialog.getByLabel('품목구분').first()).toHaveValue('INDOOR')
  await expect(dialog.getByLabel('옵션').first()).toHaveValue('기본')
  await dialog.screenshot({ path: path.join(SHOTS, '02-single-unchanged-real-qa.png') })

  await openEstimate(page)
  const after = await estimateSnapshot(page)
  expect(after.commTarget.qtyMode).toBe('FIXED')
  expect(after.commTarget.feat).toBe(COMM_PROBE)
  expect(after.singleTarget.qtyMode).toBe('FOLLOW_SET')
  expect(after.singleTarget.feat).toBe(before.singleTarget.feat)
  const singleAfterResponse = await page.request.get(`${BRANCH_GATEWAY}/api/v1/products/${SINGLE_MODEL}/component-settings?estimateCategory=SINGLE_SET`, { headers })
  expect(await singleAfterResponse.json()).toEqual(singleRows)
  expect(after.commBaseRows).toBe(before.commBaseRows)
  expect(after.commPartRows).toBe(before.commPartRows)
  expect(after.singleBaseRows).toBe(before.singleBaseRows)
  expect(after.singlePartRows).toBe(before.singlePartRows)
  expect(after.totalRows).toBe(before.totalRows)

  const comm = await setQtyAndReadPart(page, 'comm')
  expect(comm.value).toBe(1)
  await page.screenshot({ path: path.join(SHOTS, '03-commercial-set-qty-two-real-qa.png'), fullPage: false })
  const single = await setQtyAndReadPart(page, 'single')
  expect(single.value).toBe(2)
  await page.screenshot({ path: path.join(SHOTS, '04-single-follow-set-remains-two-real-qa.png'), fullPage: false })
  await page.goto(`${DESKTOP}/#/products/${MODEL}/edit`, { waitUntil: 'domcontentloaded' })
  const updateClose = page.getByRole('button', { name: '닫기', exact: true })
  if (await updateClose.count()) await updateClose.first().click()
  const editor = page.getByTestId('product-form-components-editor')
  await expect(editor).toBeVisible({ timeout: 30_000 })
  const rows = editor.locator('[data-testid^="product-form-component-row-"]')
  await expect(rows).toHaveCount(2)
  await expect(editor.getByLabel('수량 동기화')).toHaveCount(0)
  await expect(editor.getByLabel('품목구분')).toHaveCount(0)
  await expect(editor.getByLabel('옵션')).toHaveCount(0)
  await expect(editor.getByLabel('고정금액')).toHaveCount(2)
  const delivery = page.getByTestId('product-form-delivery-price')
  await expect(delivery).toBeVisible()
  const deliveryValue = await delivery.inputValue()
  expect(Number(deliveryValue.replace(/,/g, ''))).toBeGreaterThan(0)
  await page.screenshot({ path: path.join(SHOTS, '05-basic-product-boundary-real-qa.png'), fullPage: true })
  console.log(JSON.stringify({ before, after, setQty: 2, commercialFixedExpected: 1, commercialRendered: comm.value, singleFollowExpected: 2, singleRendered: single.value, basicComponentRows: await rows.count(), removedEditors: { qtyMode: 0, kind: 0, variant: 0 }, fixedAmountEditors: 2, deliveryPriceValue: deliveryValue }))
})
