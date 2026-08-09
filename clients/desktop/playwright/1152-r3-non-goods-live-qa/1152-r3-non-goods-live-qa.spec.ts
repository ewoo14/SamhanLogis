import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1152-r3-non-goods-live-qa'))

async function loginAndInstallStub(page: Page): Promise<void> {
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
}

test('PR #1152 R3 라이브 — 상품/비상품 지정·견적 포함·비상품 수량 1', async ({ page }) => {
  const goodsTypeResponses: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('/goods-type')) goodsTypeResponses.push(`${response.status()} ${response.url()}`)
  })
  await loginAndInstallStub(page)
  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })

  const goodsType = page.locator('select[aria-label="상품/비상품"]:not([disabled])').first()
  await expect(goodsType, '편집 가능한 견적품목 행이 필요합니다').toBeVisible()
  const goodsTypeTestId = await goodsType.getAttribute('data-testid')
  const modelCode = goodsTypeTestId?.replace('estimate-items-goods-type-', '') ?? ''
  expect(modelCode).not.toBe('')
  const row = page.locator(`[data-testid="estimate-items-row-${modelCode}"]`)
  await expect(row).toBeVisible()
  const estimateToggle = page.locator(`[data-testid="estimate-items-estimate-toggle-${modelCode}"]`)
  const originalGoodsType = await goodsType.inputValue()
  const originalEstimateIncluded = await estimateToggle.isChecked()

  await goodsType.selectOption('GOODS')
  await expect(goodsType).toHaveValue('GOODS')
  await page.screenshot({ path: path.join(SHOTS, '01-product-designated.png'), fullPage: false })

  await goodsType.selectOption('NON_GOODS')
  await expect(goodsType, `상품/비상품 PATCH 응답: ${goodsTypeResponses.join(', ')}`).toHaveValue('NON_GOODS')
  if (!await estimateToggle.isChecked()) await estimateToggle.click()
  await expect(estimateToggle).toBeChecked()
  await page.screenshot({ path: path.join(SHOTS, '02-non-goods-in-estimate-catalog.png'), fullPage: false })

  await page.goto(`${BASE_URL}/#/sales/estimates/new`)
  await page.waitForSelector('[data-testid="estimate-form-line-0"]', { timeout: 30000 })
  const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  await modelInput.fill(modelCode)
  await page.waitForTimeout(500)
  await modelInput.press('Enter')
  await expect(page.locator('[data-testid="estimate-form-line-0-qty"]')).toHaveValue('1', { timeout: 15000 })
  const unitPrice = page.locator('[data-testid="estimate-form-line-0-unit-price"]')
  await unitPrice.fill('12345')
  await unitPrice.blur()
  await expect(page.locator('[data-testid="estimate-form-line-0-qty"]')).toHaveValue('1')
  await page.screenshot({ path: path.join(SHOTS, '03-estimate-non-goods-price-quantity-one.png'), fullPage: false })

  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })
  const restoreGoods = page.locator(`[data-testid="estimate-items-goods-type-${modelCode}"]`)
  const restoreEstimate = page.locator(`[data-testid="estimate-items-estimate-toggle-${modelCode}"]`)
  await restoreGoods.selectOption(originalGoodsType)
  if (originalEstimateIncluded !== await restoreEstimate.isChecked()) await restoreEstimate.click()
})
