import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1152-r3-non-goods-live-qa'))

async function loginAndInstallStub(page: Page): Promise<string> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(response.ok(), `실서버 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = await response.json()
  const token = body.data?.token ?? ''
  expect(token, '실서버 로그인 토큰이 비어 있음').not.toBe('')
  await page.addInitScript(({ token: tok, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token: tok, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, {
    token,
    userId: body.data?.userId ?? '',
    role: body.data?.role ?? 'MASTER',
    displayName: body.data?.displayName ?? '개발마스터',
  })
  return token
}

test('PR #1152 R5 라이브 — 지정·견적 라인·저장·견적서 인쇄', async ({ page }) => {
  const token = await loginAndInstallStub(page)
  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  const catalogTable = page.locator('[data-testid="estimate-items-table"]')
  await expect(catalogTable, '품목 확정 화면에 도달하지 못함').toBeVisible({ timeout: 30000 })

  const catalogResponse = await page.request.get(`${API_BASE}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { page: 0, size: 10000 },
  })
  expect(catalogResponse.ok(), `실서버 카탈로그 조회 실패: HTTP ${catalogResponse.status()}`).toBeTruthy()
  const catalog = await catalogResponse.json()
  const catalogRows = Array.isArray(catalog.data?.content) ? catalog.data.content : []
  const exposedNonGoods = catalogRows.filter((row: { goods?: boolean; goodsType?: string; usageScope?: string }) =>
    row.goods === false && row.usageScope !== 'NONE')
  expect(exposedNonGoods.length, '노출 비상품 건수 — 0이면 판정 불가').toBe(2)
  const nonGoodsModelCode = exposedNonGoods[0].modelCode
  const goodsModelCode = catalogRows.find((row: { goods?: boolean; modelCode?: string }) =>
    row.goods === true)?.modelCode ?? ''
  expect(nonGoodsModelCode).not.toBe('')
  expect(goodsModelCode).not.toBe('')

  const goodsType = page.locator('select[aria-label="상품/비상품"]:not([disabled])').first()
  await expect(goodsType, '편집 가능한 품목 확정 행이 없음').toBeVisible()
  const goodsTypeTestId = await goodsType.getAttribute('data-testid')
  const modelCode = goodsTypeTestId?.replace('estimate-items-goods-type-', '') ?? ''
  expect(modelCode).not.toBe('')
  const row = page.locator(`[data-testid="estimate-items-row-${modelCode}"]`)
  await expect(row, '품목 확정 대상 행이 없음').toBeVisible()
  const estimateToggle = page.locator(`[data-testid="estimate-items-estimate-toggle-${modelCode}"]`)
  const originalGoodsType = await goodsType.inputValue()
  const originalEstimateIncluded = await estimateToggle.isChecked()
  await goodsType.selectOption('NON_GOODS')
  await expect(goodsType).toHaveValue('NON_GOODS')
  if (!await estimateToggle.isChecked()) await estimateToggle.click()
  await expect(estimateToggle).toBeChecked()
  await page.screenshot({ path: path.join(SHOTS, '01-non-goods-confirmed.png'), fullPage: false })

  await page.goto(`${BASE_URL}/#/sales/estimates/new`)
  const saveButton = page.getByTestId('estimate-form-save-button')
  await expect(saveButton, '견적 작성 화면에 도달하지 못함').toBeVisible({ timeout: 30000 })
  const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  const nonGoodsSearchResponse = page.waitForResponse((response) =>
    response.request().method() === 'GET' && response.url().includes('/api/products'))
  await modelInput.fill(nonGoodsModelCode)
  await page.waitForTimeout(500)
  await modelInput.press('Enter')
  const nonGoodsSearchBody = await (await nonGoodsSearchResponse).json()
  const nonGoodsWireRow = nonGoodsSearchBody.data?.content?.find((item: { modelCode?: string }) =>
    item.modelCode === nonGoodsModelCode)
  expect(nonGoodsWireRow?.goodsType, 'API 응답의 NON_GOODS goodsType이 없음').toBe('NON_GOODS')
  const quantity = page.locator('[data-testid="estimate-form-line-0-qty"]')
  const unitPrice = page.locator('[data-testid="estimate-form-line-0-unit-price"]')
  await quantity.fill('7')
  await unitPrice.fill('12345')
  await unitPrice.blur()
  await expect(quantity, '비상품 납품가 입력 후 수량이 1이 아님').toHaveValue('1', { timeout: 15000 })
  await page.screenshot({ path: path.join(SHOTS, '02-estimate-non-goods-quantity-one.png'), fullPage: false })

  const goodsSearchResponse = page.waitForResponse((response) =>
    response.request().method() === 'GET' && response.url().includes('/api/products'))
  await modelInput.fill(goodsModelCode)
  await page.waitForTimeout(500)
  await modelInput.press('Enter')
  const goodsSearchBody = await (await goodsSearchResponse).json()
  const goodsWireRow = goodsSearchBody.data?.content?.find((item: { modelCode?: string }) =>
    item.modelCode === goodsModelCode)
  expect(goodsWireRow?.goodsType, 'API 응답의 GOODS goodsType이 없음').toBe('GOODS')
  await quantity.fill('3')
  await unitPrice.fill('54321')
  await unitPrice.blur()
  await expect(quantity, 'GOODS 수량이 보존되지 않음').toHaveValue('3', { timeout: 15000 })
  await page.screenshot({ path: path.join(SHOTS, '03-estimate-goods-quantity-preserved.png'), fullPage: false })

  await saveButton.click()
  await expect(page).toHaveURL(/\/#\/sales\/estimates\/[^/]+$/, { timeout: 30000 })
  const detailNo = page.getByTestId('estimate-detail-no')
  await expect(detailNo, '저장 후 견적 상세 화면에 도달하지 못함').toBeVisible({ timeout: 30000 })
  await page.screenshot({ path: path.join(SHOTS, '04-estimate-saved.png'), fullPage: false })

  const popupPromise = page.waitForEvent('popup')
  await page.getByTestId('estimate-detail-print-button').click()
  const printPage = await popupPromise
  await printPage.waitForLoadState('domcontentloaded')
  const printArea = printPage.getByTestId('quote-print-area')
  await expect(printArea, '견적서 인쇄 화면에 도달하지 못함').toBeVisible({ timeout: 30000 })
  await printPage.screenshot({ path: path.join(SHOTS, '05-quote-print.png'), fullPage: true })
  await printPage.close()

  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await expect(catalogTable, '복구 후 품목 확정 화면에 도달하지 못함').toBeVisible({ timeout: 30000 })
  const restoreGoods = page.locator(`[data-testid="estimate-items-goods-type-${modelCode}"]`)
  const restoreEstimate = page.locator(`[data-testid="estimate-items-estimate-toggle-${modelCode}"]`)
  await restoreGoods.selectOption(originalGoodsType)
  if (originalEstimateIncluded !== await restoreEstimate.isChecked()) await restoreEstimate.click()
})
