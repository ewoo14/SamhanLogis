import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { resolveQaShotsDir } = require('../../../../scripts/lib/qa-shots-dir.cjs')
const { resolveQaCredential } = require('../../../../scripts/lib/qa-credentials.cjs')
const __dirname = path.dirname(fileURLToPath(import.meta.url))

test.describe.configure({ mode: 'serial' })

const shotsDir = resolveQaShotsDir(__dirname)
const desktopUrl = process.env.QA_DESKTOP_URL || 'http://127.0.0.1:5295'
const estimateUrl = process.env.QA_ESTIMATE_URL || 'http://127.0.0.1:5195/?email=dev_master%40samhan-air.com'
const apiBase = process.env.QA_API_BASE || 'http://127.0.0.1:8080'

const models = {
  active: 'AC060CS6PBH1SY',
  activeHome: 'AJ016BN1PBC2',
  discontinued: 'AC072BSCPBH2SY',
  discontinuedHome: 'AJ012MB1PBC2',
  notForSale: 'AF60F17D11LS',
  outOfStock: 'AR60F09C13WS',
  nonGoods: '운임',
  blankPreserve: 'ACL-KORGHP07',
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(shotsDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function realLogin(page, password) {
  const response = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(response.ok(), `dev_master login HTTP ${response.status()}`).toBeTruthy()
  return (await response.json()).data
}

async function installAuthStub(page, login) {
  await page.addInitScript(({ token, role, userId, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, login)
}

function observeNetwork(page, sink) {
  page.on('response', (response) => {
    const url = response.url()
    if (/127\.0\.0\.1:(5195|5295|5296|28084|8080)/.test(url)
      && /(products|expand-line|safety-stock|auth\/login|rpc\/)/.test(url)) {
      sink.push({
        method: response.request().method(),
        status: response.status(),
        url: url.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig, '<redacted-id>'),
      })
    }
  })
  page.on('requestfailed', (request) => {
    sink.push({ method: request.method(), status: 'FAILED', url: request.url(), error: request.failure()?.errorText })
  })
}

test('R5 종합견적 실 카탈로그 — 과차단·품절 도달성', async ({ page }) => {
  test.setTimeout(90_000)
  let password
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error.message}`)
    return
  }
  void password

  const network = []
  observeNetwork(page, network)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(estimateUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#btnGoSingle')).toBeVisible({ timeout: 30_000 })
  await page.locator('#btnGoSingle').click()
  await expect(page.locator('#singleBody tr').first()).toBeVisible({ timeout: 30_000 })

  const search = page.locator('#singleFilterText')
  const exactCell = (model) => page.locator('#singleBody tr td.model').filter({ hasText: new RegExp(`^${model}$`) })
  const exactRow = (model) => page.locator('#singleBody tr:has(td.model)').filter({ hasText: model })
  const result = {}

  await search.fill(models.discontinued)
  result.discontinuedRows = await exactCell(models.discontinued).count()
  await page.screenshot({ path: path.join(shotsDir, '01-estimate-discontinued.png'), fullPage: true })

  await search.fill(models.notForSale)
  result.notForSaleRows = await exactCell(models.notForSale).count()

  await search.fill(models.outOfStock)
  const outRow = exactRow(models.outOfStock)
  result.outOfStockRows = await outRow.count()
  result.outOfStockQuantityInputs = await outRow.locator('input.qty-input').count()
  result.outOfStockQuantityText = await outRow.locator('td.qty').textContent()
  await page.screenshot({ path: path.join(shotsDir, '02-estimate-out-of-stock.png'), fullPage: true })

  await search.fill(models.active)
  const activeRow = exactRow(models.active)
  result.activeRows = await activeRow.count()
  const activeQty = activeRow.locator('input.qty-input')
  result.activeQuantityInputs = await activeQty.count()
  if (result.activeQuantityInputs === 1) {
    await activeQty.fill('2')
    await activeQty.dispatchEvent('input')
    await activeQty.dispatchEvent('change')
    result.activeSubtotal = await activeRow.locator('td.sub').textContent()
  }
  await page.screenshot({ path: path.join(shotsDir, '03-estimate-active.png'), fullPage: true })

  writeJson('estimate-observations.json', result)
  writeJson('estimate-browser-network.json', network)
})

test('R5 데스크톱 실 사용자 경로 — 후보·수량 잠금·비상품·BUNDLE', async ({ page }) => {
  test.setTimeout(120_000)
  let password
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error.message}`)
    return
  }

  const login = await realLogin(page, password)
  await installAuthStub(page, login)
  const network = []
  observeNetwork(page, network)
  const result = {}

  await page.goto(`${desktopUrl}/#/sales/estimates/new`)
  let modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  await expect(modelInput).toBeVisible({ timeout: 30_000 })
  for (const [key, model] of [['discontinued', models.discontinued], ['notForSale', models.notForSale]]) {
    await modelInput.fill(model)
    await page.waitForTimeout(1_000)
    result[`${key}ProductName`] = await page.getByLabel('라인 1 품목명').inputValue()
    await modelInput.fill('')
  }

  await modelInput.fill(models.outOfStock)
  await expect(page.getByLabel('라인 1 품목명')).not.toHaveValue('', { timeout: 15_000 })
  const estimateOutQty = page.getByLabel('라인 1 수량 품절')
  result.estimateOutOfStockEditable = await estimateOutQty.isEditable()
  result.estimateOutOfStockValueBefore = await estimateOutQty.inputValue()
  if (result.estimateOutOfStockEditable) await estimateOutQty.fill('7')
  result.estimateOutOfStockValueAfter = await estimateOutQty.inputValue()
  await page.screenshot({ path: path.join(shotsDir, '04-desktop-estimate-out-of-stock.png'), fullPage: true })

  await page.reload()
  modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  await expect(modelInput).toBeVisible({ timeout: 30_000 })
  await modelInput.fill(models.active)
  await expect(page.getByLabel('라인 1 품목명')).not.toHaveValue('', { timeout: 15_000 })
  const estimateActiveQty = page.getByLabel('라인 1 수량')
  result.estimateActiveEditable = await estimateActiveQty.isEditable()
  if (result.estimateActiveEditable) await estimateActiveQty.fill('2')
  result.estimateActiveValue = await estimateActiveQty.inputValue()

  await page.reload()
  modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  await expect(modelInput).toBeVisible({ timeout: 30_000 })
  await modelInput.fill(models.nonGoods)
  await expect(page.getByLabel('라인 1 품목명')).not.toHaveValue('', { timeout: 15_000 })
  const nonGoodsQty = page.getByLabel('라인 1 수량')
  await nonGoodsQty.fill('')
  await page.getByLabel('라인 1 단가').fill('10000')
  result.nonGoodsQuantityAfterPrice = await nonGoodsQty.inputValue()
  await page.screenshot({ path: path.join(shotsDir, '05-desktop-non-goods-auto-one.png'), fullPage: true })

  let expandCalls = []
  page.on('response', (response) => {
    if (response.url().endsWith('/slips/expand-line')) expandCalls.push(response.status())
  })
  await page.goto(`${desktopUrl}/#/sales/new`)
  let slipProduct = page.getByRole('combobox', { name: '라인 1 품목' })
  await expect(slipProduct).toBeVisible({ timeout: 30_000 })
  await slipProduct.fill(models.outOfStock)
  await expect(slipProduct).toHaveValue(models.outOfStock, { timeout: 15_000 })
  await page.waitForTimeout(1_000)
  const slipOutQty = page.getByLabel('라인 1 수량 품절')
  result.slipOutOfStockDisabled = await slipOutQty.isDisabled()
  result.slipOutOfStockExpandCalls = [...expandCalls]
  await page.screenshot({ path: path.join(shotsDir, '06-desktop-slip-out-of-stock.png'), fullPage: true })

  await page.reload()
  slipProduct = page.getByRole('combobox', { name: '라인 1 품목' })
  await expect(slipProduct).toBeVisible({ timeout: 30_000 })
  expandCalls = []
  await slipProduct.fill(models.active)
  await page.waitForTimeout(3_000)
  result.activeBundleExpandCalls = [...expandCalls]
  result.activeBundleLineCount = await page.locator('[aria-label^="라인 "][aria-label$=" 품목"]').count()
  await page.screenshot({ path: path.join(shotsDir, '07-desktop-active-bundle-expanded.png'), fullPage: true })

  await page.goto(`${desktopUrl}/#/inventory/safety-stock-alerts`)
  const safetyProduct = page.getByRole('combobox', { name: '제품' })
  await expect(safetyProduct).toBeVisible({ timeout: 30_000 })
  await safetyProduct.fill(models.discontinued)
  await page.waitForTimeout(1_000)
  await page.getByTestId('safety-stock-all-chip').click()
  await page.getByTestId('safety-stock-config-threshold').fill('1')
  result.safetyDiscontinuedSaveEnabled = await page.getByTestId('safety-stock-config-save').isEnabled()
  await page.screenshot({ path: path.join(shotsDir, '08-safety-discontinued-candidate.png'), fullPage: true })

  await page.goto(`${desktopUrl}/#/products/estimate-items`)
  const addSection = page.getByTestId('estimate-items-add-product')
  await expect(addSection).toBeVisible({ timeout: 30_000 })
  const addProduct = addSection.getByRole('combobox')
  await addProduct.fill(models.discontinuedHome)
  await page.waitForTimeout(1_000)
  result.estimateItemsDiscontinuedExactTexts = await page.getByText(models.discontinuedHome, { exact: true }).count()
  const addToCategoryButton = page.getByRole('button', { name: '현재 카테고리에 추가' })
  result.estimateItemsDiscontinuedAddEnabled = await addToCategoryButton.isEnabled()
  await page.screenshot({ path: path.join(shotsDir, '09-estimate-items-discontinued-candidate.png'), fullPage: true })

  await addProduct.fill(models.activeHome)
  await page.waitForTimeout(1_000)
  result.estimateItemsActiveAddEnabled = await addToCategoryButton.isEnabled()

  const managementSearch = page.getByTestId('estimate-items-search-input')
  await managementSearch.fill(models.discontinuedHome)
  await page.getByRole('button', { name: '조회', exact: true }).click()
  await page.waitForTimeout(1_000)
  result.estimateItemsDiscontinuedManagedRows = await page.locator('tbody tr').filter({ hasText: models.discontinuedHome }).count()
  await page.screenshot({ path: path.join(shotsDir, '09b-estimate-items-discontinued-management.png'), fullPage: true })

  writeJson('desktop-observations.json', result)
  writeJson('desktop-browser-network.json', network)
})

test('R5 실 관리자 API — 공란 동기화와 goodsType×status 결합', async ({ page }) => {
  test.setTimeout(240_000)
  let password
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error.message}`)
    return
  }

  const login = await realLogin(page, password)
  await installAuthStub(page, login)
  const claims = JSON.parse(Buffer.from(login.token.split('.')[1], 'base64url').toString('utf8'))
  const directHeaders = {
    Authorization: `Bearer ${login.token}`,
    'X-User-Id': String(claims.sub ?? login.userId ?? ''),
    'X-User-Role': String(login.role ?? claims.role ?? 'MASTER'),
    'X-Is-System-Master': String(claims.isSystemMaster === true),
    'X-User-Groups': Array.isArray(claims.groups) ? claims.groups.join(',') : '',
    'X-User-Name': encodeURIComponent(String(login.displayName ?? claims.name ?? 'R5 QA')),
  }
  const gatewayHeaders = { Authorization: `Bearer ${login.token}` }
  const productBase = 'http://127.0.0.1:28084'
  const result = { calls: [] }
  const recordCall = async (label, response) => {
    const text = await response.text()
    result.calls.push({ label, status: response.status(), body: text.slice(0, 2000).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig, '<redacted-id>') })
    expect(response.ok(), `${label} HTTP ${response.status()} ${text}`).toBeTruthy()
    return text ? JSON.parse(text) : null
  }

  let blankProduct
  let originalBlankTags = {}
  let qaProduct
  let outProduct
  let originalOutTags = {}
  let outGoodsChanged = false
  let safetyCreated = false

  try {
    const blankPayload = await recordCall('GET blank-source product', await page.request.get(
      `${productBase}/products/by-model/${models.blankPreserve}`,
      { headers: directHeaders },
    ))
    blankProduct = blankPayload.data
    originalBlankTags = blankProduct.tags ?? {}
    await recordCall('PUT R5 blank-source tag', await page.request.put(
      `${productBase}/products/${blankProduct.id}/tags`,
      { headers: directHeaders, data: { ...originalBlankTags, qaRound: 'R5-1095-BLANK-SYNC' } },
    ))
    await recordCall('POST discontinue blank-source', await page.request.post(
      `${productBase}/products/${blankProduct.id}/discontinue`,
      { headers: directHeaders },
    ))
    const beforeSync = await recordCall('GET before blank sync', await page.request.get(
      `${productBase}/products/${blankProduct.id}`,
      { headers: directHeaders },
    ))
    result.blankStatusBeforeSync = beforeSync.data.status

    const sync = await recordCall('POST actual sheet sync', await page.request.post(
      `${productBase}/api/v1/products/admin/sync`,
      { headers: directHeaders, timeout: 180_000 },
    ))
    result.syncSummary = {
      totalTabs: sync.data.totalTabs,
      successfulTabs: sync.data.successfulTabs,
      failedTabs: sync.data.failedTabs,
      totalInsertedRows: sync.data.totalInsertedRows,
      totalUpdatedRows: sync.data.totalUpdatedRows,
      totalSoftDeletedRows: sync.data.totalSoftDeletedRows,
      durationMs: sync.data.durationMs,
    }
    const afterSync = await recordCall('GET after blank sync', await page.request.get(
      `${productBase}/products/${blankProduct.id}`,
      { headers: directHeaders },
    ))
    result.blankStatusAfterSync = afterSync.data.status

    const createPayload = await recordCall('POST R5 NON_GOODS product', await page.request.post(
      `${productBase}/products`,
      {
        headers: directHeaders,
        data: {
          name: 'R5 비상품 상태 결합 표본',
          modelName: `R5-NONGOODS-${Date.now()}`,
          categoryId: blankProduct.categoryId,
          sellingPrice: 0,
          purchasePrice: 0,
          currency: 'KRW',
          tags: { qaRound: 'R5-1095-COMBINED' },
          description: 'R5 적대검증 표본',
          goodsType: 'NON_GOODS',
          usageScope: 'BOTH',
        },
      },
    ))
    qaProduct = createPayload.data

    await recordCall('POST R5 safety stock config', await page.request.post(
      `${apiBase}/inventory/products/${qaProduct.id}/safety-stock`,
      {
        headers: gatewayHeaders,
        data: { warehouseId: null, threshold: 1, note: 'R5-1095-COMBINED', scopeMode: 'ALL' },
      },
    ))
    safetyCreated = true
    await recordCall('POST discontinue R5 NON_GOODS', await page.request.post(
      `${productBase}/products/${qaProduct.id}/discontinue`,
      { headers: directHeaders },
    ))
    const combinedDiscontinued = await recordCall('GET NON_GOODS+DISCONTINUED', await page.request.get(
      `${productBase}/products/${qaProduct.id}`,
      { headers: directHeaders },
    ))
    result.nonGoodsDiscontinued = {
      modelName: combinedDiscontinued.data.modelName,
      goodsType: combinedDiscontinued.data.goodsType,
      status: combinedDiscontinued.data.status,
    }

    await page.goto(`${desktopUrl}/#/inventory/safety-stock-alerts`)
    await expect(page.getByTestId('safety-stock-alerts-page')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(2_000)
    result.discontinuedSafetyAlertVisible = await page.getByText(qaProduct.modelName, { exact: true }).count()
    await page.screenshot({ path: path.join(shotsDir, '10-discontinued-safety-alert-management.png'), fullPage: true })

    await page.goto(`${desktopUrl}/#/sales/estimates/new`)
    const combinedHiddenInput = page.getByRole('combobox', { name: '라인 1 모델명' })
    await expect(combinedHiddenInput).toBeVisible({ timeout: 30_000 })
    await combinedHiddenInput.fill(qaProduct.modelName)
    await page.waitForTimeout(1_000)
    result.nonGoodsDiscontinuedProductName = await page.getByLabel('라인 1 품목명').inputValue()

    const outPayload = await recordCall('GET OUT_OF_STOCK source', await page.request.get(
      `${productBase}/products/by-model/${models.outOfStock}`,
      { headers: directHeaders },
    ))
    outProduct = outPayload.data
    originalOutTags = outProduct.tags ?? {}
    await recordCall('PUT R5 OUT_OF_STOCK tag', await page.request.put(
      `${productBase}/products/${outProduct.id}/tags`,
      { headers: directHeaders, data: { ...originalOutTags, qaRound: 'R5-1095-COMBINED' } },
    ))
    const changedOut = await recordCall('PATCH OUT_OF_STOCK goodsType', await page.request.patch(
      `${productBase}/products/${outProduct.id}`,
      { headers: directHeaders, data: { goodsType: 'NON_GOODS' } },
    ))
    outGoodsChanged = true
    result.nonGoodsOutOfStock = {
      modelName: changedOut.data.modelName,
      goodsType: changedOut.data.goodsType,
      status: changedOut.data.status,
    }

    await page.goto(`${desktopUrl}/#/sales/estimates/new`)
    const combinedOutInput = page.getByRole('combobox', { name: '라인 1 모델명' })
    await expect(combinedOutInput).toBeVisible({ timeout: 30_000 })
    await combinedOutInput.fill(models.outOfStock)
    await expect(page.getByLabel('라인 1 품목명')).not.toHaveValue('', { timeout: 15_000 })
    const combinedOutQty = page.getByLabel('라인 1 수량 품절')
    result.nonGoodsOutOfStockQuantityEditable = await combinedOutQty.isEditable()
    result.nonGoodsOutOfStockQuantity = await combinedOutQty.inputValue()
    await page.screenshot({ path: path.join(shotsDir, '11-non-goods-out-of-stock.png'), fullPage: true })
  } finally {
    if (outProduct && outGoodsChanged) {
      const restoreGoods = await page.request.patch(`${productBase}/products/${outProduct.id}`, {
        headers: directHeaders,
        data: { goodsType: 'GOODS' },
      })
      const restoreOutTags = await page.request.put(`${productBase}/products/${outProduct.id}/tags`, {
        headers: directHeaders,
        data: originalOutTags,
      })
      result.cleanupOutOfStock = { goodsTypeHttp: restoreGoods.status(), tagsHttp: restoreOutTags.status() }
    }
    if (qaProduct) {
      if (safetyCreated) {
        const disableSafety = await page.request.post(`${apiBase}/inventory/products/${qaProduct.id}/safety-stock`, {
          headers: gatewayHeaders,
          data: { warehouseId: null, threshold: 0, note: 'R5-1095-RESIDUE-THRESHOLD-0', scopeMode: 'ALL' },
        })
        result.cleanupSafetyHttp = disableSafety.status()
      }
      const deleteQa = await page.request.delete(`${productBase}/products/${qaProduct.id}`, { headers: directHeaders })
      result.cleanupQaProductHttp = deleteQa.status()
    }
    if (blankProduct) {
      const reactivateBlank = await page.request.post(`${productBase}/products/${blankProduct.id}/reactivate`, { headers: directHeaders })
      const restoreBlankTags = await page.request.put(`${productBase}/products/${blankProduct.id}/tags`, {
        headers: directHeaders,
        data: originalBlankTags,
      })
      result.cleanupBlank = { reactivateHttp: reactivateBlank.status(), tagsHttp: restoreBlankTags.status() }
    }
    writeJson('admin-api-observations.json', result)
  }
})

test('R5 안전재고 상태 전환 — 알림 식별자 도달성', async ({ page }) => {
  test.setTimeout(120_000)
  let password
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error.message}`)
    return
  }

  const login = await realLogin(page, password)
  await installAuthStub(page, login)
  const claims = JSON.parse(Buffer.from(login.token.split('.')[1], 'base64url').toString('utf8'))
  const directHeaders = {
    Authorization: `Bearer ${login.token}`,
    'X-User-Id': String(claims.sub ?? login.userId ?? ''),
    'X-User-Role': String(login.role ?? claims.role ?? 'MASTER'),
    'X-Is-System-Master': String(claims.isSystemMaster === true),
    'X-User-Groups': Array.isArray(claims.groups) ? claims.groups.join(',') : '',
    'X-User-Name': encodeURIComponent(String(login.displayName ?? claims.name ?? 'R5 QA')),
  }
  const gatewayHeaders = { Authorization: `Bearer ${login.token}` }
  const productBase = 'http://127.0.0.1:28084'
  const result = {}
  let product
  let originalTags = {}
  let safetyCreated = false

  try {
    const productResponse = await page.request.get(`${productBase}/products/by-model/${models.blankPreserve}`, {
      headers: directHeaders,
    })
    expect(productResponse.ok()).toBeTruthy()
    product = (await productResponse.json()).data
    originalTags = product.tags ?? {}

    expect((await page.request.put(`${productBase}/products/${product.id}/tags`, {
      headers: directHeaders,
      data: { ...originalTags, qaRound: 'R5-1095-SAFETY-TRANSITION' },
    })).ok()).toBeTruthy()
    const configResponse = await page.request.post(`${apiBase}/inventory/products/${product.id}/safety-stock`, {
      headers: gatewayHeaders,
      data: { warehouseId: null, threshold: 1, note: 'R5-1095-SAFETY-TRANSITION', scopeMode: 'ALL' },
    })
    expect(configResponse.ok()).toBeTruthy()
    safetyCreated = true
    const activeAlertsResponse = await page.request.get(`${apiBase}/inventory/alerts/safety-stock`, {
      headers: gatewayHeaders,
    })
    expect(activeAlertsResponse.ok()).toBeTruthy()
    const activeAlertsPayload = await activeAlertsResponse.json()
    const activeTarget = activeAlertsPayload.data.find((alert) => alert.productId === product.id)
    result.activeTarget = activeTarget ? {
      productCode: activeTarget.productCode,
      productName: activeTarget.productName,
      threshold: activeTarget.threshold,
      note: activeTarget.note,
    } : null
    expect((await page.request.post(`${productBase}/products/${product.id}/discontinue`, {
      headers: directHeaders,
    })).ok()).toBeTruthy()

    const alertsResponse = await page.request.get(`${apiBase}/inventory/alerts/safety-stock`, {
      headers: gatewayHeaders,
    })
    expect(alertsResponse.ok()).toBeTruthy()
    const alertsPayload = await alertsResponse.json()
    const target = alertsPayload.data.find((alert) => alert.productId === product.id)
    result.alertsHttp = alertsResponse.status()
    result.target = target ? {
      productCode: target.productCode,
      productName: target.productName,
      threshold: target.threshold,
      currentQty: target.currentQty,
      shortage: target.shortage,
      warehouseName: target.warehouseName,
      note: target.note,
    } : null
    result.totalAlerts = alertsPayload.data.length

    await page.goto(`${desktopUrl}/#/inventory/safety-stock-alerts`)
    await expect(page.getByTestId('safety-stock-alerts-page')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(2_000)
    result.screenHasModel = await page.getByText(product.modelName, { exact: true }).count()
    result.blankProductCodeCells = await page.locator('[data-testid="safety-stock-table"] tbody tr td:first-child').filter({ hasText: /^$/ }).count()
    await page.screenshot({ path: path.join(shotsDir, '12-safety-discontinued-blank-identity.png'), fullPage: true })
  } finally {
    if (product) {
      const reactivate = await page.request.post(`${productBase}/products/${product.id}/reactivate`, {
        headers: directHeaders,
      })
      const restoreTags = await page.request.put(`${productBase}/products/${product.id}/tags`, {
        headers: directHeaders,
        data: originalTags,
      })
      result.cleanupProduct = { reactivateHttp: reactivate.status(), tagsHttp: restoreTags.status() }
      if (safetyCreated) {
        const disableSafety = await page.request.post(`${apiBase}/inventory/products/${product.id}/safety-stock`, {
          headers: gatewayHeaders,
          data: { warehouseId: null, threshold: 0, note: 'R5-1095-RESIDUE-THRESHOLD-0', scopeMode: 'ALL' },
        })
        result.cleanupSafetyHttp = disableSafety.status()
      }
    }
    writeJson('safety-status-transition-observations.json', result)
  }
})
