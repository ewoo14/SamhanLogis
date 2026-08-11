import { expect, test } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/2026-08-10-896-r10'))

test('실 견적 운임 입력은 비상품 수량을 7에서 1로 동기화한다', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격 증명을 읽지 못했습니다.')
    return
  }

  const login = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(login.ok()).toBeTruthy()
  const auth = (await login.json()).data ?? {}
  await page.addInitScript((token) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => token, setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: auth.token, userId: auth.userId ?? '', role: auth.role ?? 'MASTER', fullName: '<redacted>', partnerCode: null })

  const catalogResponse = await page.request.get(`${API_BASE}/api/products`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    params: { q: '운임', page: 0, size: 20 },
  })
  expect(catalogResponse.ok()).toBeTruthy()
  const catalog = await catalogResponse.json()
  const nonGoods = (catalog.data?.content ?? []).filter((row: { goodsType?: string; goods?: boolean }) => row.goodsType === 'NON_GOODS' || row.goods === false)
  expect(nonGoods.length).toBeGreaterThan(0)
  const sample = nonGoods.find((row: { modelCode?: string }) => row.modelCode === '운임')
  expect(sample?.modelCode).toBeTruthy()

  await page.goto(`${DESKTOP_BASE}/#/sales/estimates/new`)
  await expect(page.getByTestId('estimate-form-save-button')).toBeVisible({ timeout: 30_000 })
  const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  await modelInput.fill(sample.modelCode)
  await page.waitForTimeout(500)
  await modelInput.press('Enter')
  await expect(page.getByLabel('라인 1 품목명')).not.toHaveValue('', { timeout: 20_000 })
  const quantity = page.getByTestId('estimate-form-line-0-qty')
  const unitPrice = page.getByTestId('estimate-form-line-0-unit-price')
  await quantity.fill('7')
  await quantity.blur()
  await expect(quantity).toHaveValue('7')
  await page.screenshot({ path: path.join(SHOTS, '01-nongoods-before-price-quantity-7.png'), fullPage: false })
  await unitPrice.fill('12345')
  await unitPrice.blur()
  await expect(quantity).toHaveValue('1', { timeout: 15_000 })
  await page.screenshot({ path: path.join(SHOTS, '02-nongoods-after-price-quantity-1.png'), fullPage: false })
})
