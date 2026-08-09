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

test('PR #1152 R3 라이브 — 상품/비상품 지정·견적 포함·비상품 수량 1', async ({ page }) => {
  const token = await loginAndInstallStub(page)
  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })

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
  await page.screenshot({ path: path.join(SHOTS, '01-non-goods-in-estimate-catalog.png'), fullPage: false })

  await page.goto(`${BASE_URL}/#/sales/estimates/new`)
  await page.waitForSelector('[data-testid="estimate-form-line-0"]', { timeout: 30000 })
  const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  await modelInput.fill(nonGoodsModelCode)
  await page.waitForTimeout(500)
  await modelInput.press('Enter')
  const quantity = page.locator('[data-testid="estimate-form-line-0-qty"]')
  await quantity.fill('7')
  const unitPrice = page.locator('[data-testid="estimate-form-line-0-unit-price"]')
  await unitPrice.fill('12345')
  await unitPrice.blur()
  await expect(quantity).toHaveValue('1', { timeout: 15000 })
  await page.screenshot({ path: path.join(SHOTS, '03-estimate-non-goods-price-quantity-one.png'), fullPage: false })

  await modelInput.fill(goodsModelCode)
  await page.waitForTimeout(500)
  await modelInput.press('Enter')
  await quantity.fill('3')
  await unitPrice.fill('54321')
  await unitPrice.blur()
  await expect(quantity).toHaveValue('3', { timeout: 15000 })
  await page.screenshot({ path: path.join(SHOTS, '04-estimate-goods-quantity-preserved.png'), fullPage: false })
})
