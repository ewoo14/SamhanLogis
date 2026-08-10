import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1152-r7-search-completeness-real-qa'))

async function loginAndInstallStub(page: Page) {
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

test('PR #1152 R7 라이브 — A 절단을 알리고 AP110BAPPBH2S를 모달에서 선택한다', async ({ page }) => {
  const token = await loginAndInstallStub(page)
  const response = await page.request.get(`${API_BASE}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { q: 'A', page: 0, size: 50 },
  })
  expect(response.ok(), `A 검색 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = await response.json()
  const pageData = body.data
  expect(pageData.totalElements).toBeGreaterThan(50)
  expect(pageData.content).toHaveLength(50)
  expect(pageData.content.some((row: { modelCode?: string }) => row.modelCode === 'AP110BAPPBH2S')).toBe(false)

  await page.goto(`${BASE_URL}/#/sales/estimates/new`)
  await expect(page.getByTestId('estimate-form-save-button')).toBeVisible({ timeout: 30000 })
  const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  let searchCalls = 0
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes('/api/products')) searchCalls += 1
  })

  await modelInput.fill('A')
  await expect(page.getByRole('dialog', { name: '품목 검색 결과' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('product-search-truncation-notice')).toContainText('건 중 50건 표시')
  expect(searchCalls).toBe(1)
  await page.screenshot({ path: path.join(SHOTS, '01-a-search-truncated-notice.png'), fullPage: false })

  const modalFilter = page.getByRole('searchbox', { name: '검색 결과 필터' })
  await modalFilter.fill('AP110BAPPBH2S')
  await modalFilter.press('Enter')
  const target = page.getByRole('radio', { name: 'AP110BAPPBH2S' })
  await expect(target).toBeVisible({ timeout: 15000 })
  await target.check()
  await page.getByRole('button', { name: '선택 확정' }).click()
  await expect(modelInput).toHaveValue('AP110BAPPBH2S')
  await page.screenshot({ path: path.join(SHOTS, '02-ap110bappbh2s-selected.png'), fullPage: false })
  expect(searchCalls).toBe(2)
})
