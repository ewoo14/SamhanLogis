const path = require('node:path')
const { test, expect } = require('../../../clients/desktop/node_modules/@playwright/test')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')
const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')

const shotsDir = resolveQaShotsDir(__dirname)
const baseUrl = process.env.QA_DESKTOP_URL || 'http://127.0.0.1:5295'
const apiBase = process.env.QA_API_BASE || 'http://127.0.0.1:8080'
const discontinuedModel = 'AC072BSCPBH2SY'
const notForSaleModel = 'AF60F17D11LS'
const outOfStockModel = 'AR60F09C13WS'

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

test('R3 미수정 후보 경로 — 안전재고와 견적품목 추가에 단종 노출', async ({ page }) => {
  test.setTimeout(60_000)
  let password
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error.message}`)
    return
  }

  const login = await realLogin(page, password)
  await installAuthStub(page, login)
  const headers = { Authorization: `Bearer ${login.token}` }
  const searchResponse = await page.request.get(
    `${apiBase}/api/products?q=${discontinuedModel}&size=20`,
    { headers },
  )
  expect(searchResponse.ok(), `product search HTTP ${searchResponse.status()}`).toBeTruthy()
  const payload = await searchResponse.json()
  const products = payload.data?.content ?? []
  const discontinued = products.filter((item) => item.status === 'DISCONTINUED')
  expect(discontinued.some((item) => item.modelName === discontinuedModel)).toBe(true)

  await page.goto(`${baseUrl}/#/inventory/safety-stock-alerts`)
  const safetyCombo = page.getByRole('combobox', { name: '제품' })
  await expect(safetyCombo).toBeVisible({ timeout: 30_000 })
  await safetyCombo.fill(discontinuedModel)
  await page.waitForTimeout(1_200)
  await expect(safetyCombo).toHaveValue(discontinuedModel, { timeout: 10_000 })
  await page.getByTestId('safety-stock-all-chip').click()
  await page.getByTestId('safety-stock-config-threshold').fill('1')
  await expect(page.getByTestId('safety-stock-config-save')).toBeEnabled()
  await page.screenshot({ path: path.join(shotsDir, '05-safety-stock-discontinued-visible-defect.png'), fullPage: true })

  await page.reload()
  const safetyNfsCombo = page.getByRole('combobox', { name: '제품' })
  await safetyNfsCombo.fill(notForSaleModel)
  await page.waitForTimeout(1_200)
  await page.getByTestId('safety-stock-all-chip').click()
  await page.getByTestId('safety-stock-config-threshold').fill('1')
  await expect(page.getByTestId('safety-stock-config-save')).toBeEnabled()

  await page.goto(`${baseUrl}/#/products/estimate-items`)
  const addSection = page.getByTestId('estimate-items-add-product')
  await expect(addSection).toBeVisible({ timeout: 30_000 })
  const addCombo = addSection.getByRole('combobox')
  await addCombo.fill(discontinuedModel)
  await page.waitForTimeout(800)
  const estimateCandidate = page.getByText(discontinuedModel, { exact: true })
  await expect(estimateCandidate.first()).toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: path.join(shotsDir, '06-estimate-items-discontinued-visible-defect.png'), fullPage: false })

  console.log(`[PUBLIC SEARCH] model=${discontinuedModel} status=${discontinued[0]?.status} count=${discontinued.length}`)
})

test('R3 반대급부 — 데스크톱 견적 품절 수량 미잠금·판매전표 품절 선택 실패', async ({ page }) => {
  page.on('response', (response) => {
    if (response.status() >= 400) console.log(`[HTTP ${response.status()}] ${response.url()}`)
  })
  page.on('requestfailed', (request) => console.log(`[REQUEST FAILED] ${request.url()} ${request.failure()?.errorText}`))
  let password
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error.message}`)
    return
  }

  const login = await realLogin(page, password)
  await installAuthStub(page, login)

  await page.goto(`${baseUrl}/#/sales/estimates/new`)
  const estimateProduct = page.getByRole('combobox', { name: '라인 1 모델명' })
  await expect(estimateProduct).toBeVisible({ timeout: 30_000 })
  await estimateProduct.fill(outOfStockModel)
  await expect(estimateProduct).toHaveValue(outOfStockModel, { timeout: 10_000 })
  await expect(page.getByLabel('라인 1 품목명')).not.toHaveValue('', { timeout: 10_000 })
  const estimateQty = page.getByLabel('라인 1 수량')
  await expect(estimateQty).toBeEnabled()
  await page.screenshot({ path: path.join(shotsDir, '07-estimate-out-of-stock-quantity-unlocked-defect.png'), fullPage: false })

  await page.goto(`${baseUrl}/#/sales/new`)
  const slipProduct = page.getByRole('combobox', { name: '라인 1 품목' })
  await expect(slipProduct).toBeVisible({ timeout: 30_000 })
  const expansionResponse = page.waitForResponse((response) => response.url().endsWith('/slips/expand-line'))
  await slipProduct.fill(outOfStockModel)
  expect((await expansionResponse).status()).toBe(500)
  await expect(slipProduct).toHaveValue('', { timeout: 10_000 })
  const expansionError = page.getByText('세트 구성품을 불러오지 못했습니다. 다시 선택해 주세요.')
  await expect(expansionError).toBeVisible()
  await expansionError.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: path.join(shotsDir, '08-slip-out-of-stock-selection-fails-defect.png'), fullPage: false })
})

test('R3 원 결함 — 데스크톱 견적·판매전표에서 단종·미판매가 선택되지 않음', async ({ page }) => {
  let password
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error.message}`)
    return
  }

  const login = await realLogin(page, password)
  await installAuthStub(page, login)

  await page.goto(`${baseUrl}/#/sales/estimates/new`)
  const estimateProduct = page.getByRole('combobox', { name: '라인 1 모델명' })
  for (const blockedModel of [discontinuedModel, notForSaleModel]) {
    await estimateProduct.fill(blockedModel)
    await page.waitForTimeout(900)
    await expect(page.getByLabel('라인 1 품목명')).toHaveValue('')
    await estimateProduct.fill('')
  }

  let expansionCalls = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/slips/expand-line')) expansionCalls += 1
  })
  await page.goto(`${baseUrl}/#/sales/new`)
  const slipProduct = page.getByRole('combobox', { name: '라인 1 품목' })
  for (const blockedModel of [discontinuedModel, notForSaleModel]) {
    await slipProduct.fill(blockedModel)
    await page.waitForTimeout(900)
    await expect(page.getByText('모델명 조회 후 자동입력').first()).toBeVisible()
    await slipProduct.fill('')
  }
  expect(expansionCalls).toBe(0)
})
