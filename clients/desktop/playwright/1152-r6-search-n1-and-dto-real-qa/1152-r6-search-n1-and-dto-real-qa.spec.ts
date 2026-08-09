import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1152-r6-search-n1-and-dto-real-qa'))

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

test('PR #1152 R6 라이브 — 검색 1회와 비상품/상품 수량 동작', async ({ page }) => {
  const token = await loginAndInstallStub(page)
  const catalogResponse = await page.request.get(`${API_BASE}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { page: 0, size: 50 },
  })
  expect(catalogResponse.ok(), `품목 검색 준비 조회 실패: HTTP ${catalogResponse.status()}`).toBeTruthy()
  const catalogBody = await catalogResponse.json()
  const catalogRows = Array.isArray(catalogBody.data?.content) ? catalogBody.data.content : []
  const nonGoods = catalogRows.find((row: { goodsType?: string }) => row.goodsType === 'NON_GOODS')
  const goods = catalogRows.find((row: { goodsType?: string }) => row.goodsType === 'GOODS')
  expect(nonGoods?.modelCode, '실 검색 응답에 NON_GOODS 품목이 없어 판정 불가').toBeTruthy()
  expect(goods?.modelCode, '실 검색 응답에 GOODS 품목이 없어 판정 불가').toBeTruthy()

  await page.goto(`${BASE_URL}/#/sales/estimates/new`)
  const saveButton = page.getByTestId('estimate-form-save-button')
  await expect(saveButton, '견적 작성 화면의 저장 버튼이 없어 화면 도달을 증명할 수 없음').toBeVisible({ timeout: 30000 })
  const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  const quantity = page.locator('[data-testid="estimate-form-line-0-qty"]')
  const unitPrice = page.locator('[data-testid="estimate-form-line-0-unit-price"]')

  let searchCalls = 0
  const onRequest = (request: { method(): string; url(): string }) => {
    if (request.method() === 'GET' && request.url().includes('/api/products')) searchCalls += 1
  }
  page.on('request', onRequest)
  await modelInput.fill(nonGoods.modelCode)
  await page.waitForTimeout(700)
  expect(searchCalls, '검색 1회가 건별 재조회로 늘어남').toBe(1)
  await modelInput.press('Enter')
  await unitPrice.fill('12345')
  await unitPrice.blur()
  await expect(quantity, '비상품 납품가 입력 후 수량이 1이 아님').toHaveValue('1', { timeout: 15000 })
  await page.screenshot({ path: path.join(SHOTS, '01-non-goods-quantity-one.png'), fullPage: false })

  await modelInput.fill(goods.modelCode)
  await page.waitForTimeout(700)
  await modelInput.press('Enter')
  await quantity.fill('3')
  await unitPrice.fill('54321')
  await unitPrice.blur()
  await expect(quantity, '상품 라인 수량이 보존되지 않음').toHaveValue('3', { timeout: 15000 })
  await page.screenshot({ path: path.join(SHOTS, '02-goods-quantity-preserved.png'), fullPage: false })
  page.off('request', onRequest)
})
