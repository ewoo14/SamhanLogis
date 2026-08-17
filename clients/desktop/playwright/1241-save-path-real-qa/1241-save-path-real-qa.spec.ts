import { expect, test, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'

const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/1241-save-path-luna/screenshots'))
fs.mkdirSync(SHOTS, { recursive: true })
const API_BASE = process.env['REAL_QA_API_BASE_URL'] ?? 'http://127.0.0.1:8080'
const BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5175'
const BUNDLE_CODE = process.env['REAL_QA_1241_BUNDLE_CODE'] ?? 'AC110CS6PBH1SY'

async function login(page: Page): Promise<void> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  if (!response.ok()) {
    throw new Error(`로그인 실패: HTTP ${response.status()} 본문: ${await response.text()}`)
  }
  const body = await response.json()
  const session = body?.data
  if (!session?.token) throw new Error(`로그인 응답에 data.token이 없습니다. 본문: ${JSON.stringify(body)}`)
  await page.addInitScript((snapshot) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => snapshot,
      setToken: async () => undefined,
      clearToken: async () => undefined,
    } })
  }, {
    token: session.token,
    userId: session.userId,
    role: session.role,
    fullName: session.displayName,
    partnerCode: session.partnerCode ?? null,
    groups: session.groups ?? [],
  })
}

test('견적품목 구성품 고정금액·반올림 단위 저장 후 재조회하고 원복한다', async ({ page }) => {
  const authResponses: string[] = []
  page.on('response', async (response) => {
    if (!response.url().includes('/auth/')) return
    try {
      authResponses.push(`HTTP ${response.status()} ${response.url()} ${await response.text()}`)
    } catch {
      authResponses.push(`HTTP ${response.status()} ${response.url()} <본문 읽기 실패>`)
    }
  })
  await login(page)
  await page.goto(`${BASE_URL}/#/products/${BUNDLE_CODE}/edit`)
  const loginId = page.getByRole('textbox', { name: '사용자 ID (필수)' })
  const updateDialog = page.getByRole('status').filter({ hasText: '업데이트 서버에 연결하지 못했습니다' })
  if (await updateDialog.isVisible().catch(() => false)) {
    await updateDialog.getByRole('button', { name: '닫기' }).click()
  }
  if (await loginId.isVisible().catch(() => false)) {
    await loginId.fill('dev_master')
    await page.getByRole('textbox', { name: '비밀번호 (필수)' }).fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '로그인', exact: true }).click()
  }
  await page.waitForTimeout(5000)
  if (await page.getByTestId('product-form-components-editor').count() === 0) {
    await page.screenshot({ path: path.join(SHOTS, '04-login-blocked.png'), fullPage: true })
    throw new Error(`라이브 QA 로그인 후 화면 진입 실패. URL=${page.url()}\n${authResponses.join('\n')}`)
  }
  await page.getByTestId('product-form-components-editor').waitFor({ state: 'visible', timeout: 30000 })
  const firstRow = page.getByTestId('product-form-component-row-0')
  const roundInput = firstRow.locator('input[type="number"]').last()
  const originalRound = await roundInput.inputValue()
  const originalAmountInput = firstRow.locator('input[type="text"]:not([disabled])')
  const hasEditableAmount = await originalAmountInput.count() > 0
  const originalAmount = hasEditableAmount ? await originalAmountInput.inputValue() : ''
  const testAmount = hasEditableAmount ? '12345' : ''

  await roundInput.fill('777')
  if (hasEditableAmount) await originalAmountInput.fill(testAmount)
  await page.screenshot({ path: path.join(SHOTS, '01-before-save.png') })
  await page.getByTestId('product-form-components-save').click()
  await expect(page.getByTestId('product-form-components-save')).toBeEnabled({ timeout: 30000 })

  await page.reload()
  await page.getByTestId('product-form-components-editor').waitFor({ state: 'visible', timeout: 30000 })
  const reopenedRow = page.getByTestId('product-form-component-row-0')
  await expect(reopenedRow.locator('input[type="number"]').last()).toHaveValue('777')
  if (hasEditableAmount) await expect(reopenedRow.locator('input[type="text"]:not([disabled])')).toHaveValue(testAmount)
  await page.screenshot({ path: path.join(SHOTS, '02-reopened-persisted.png') })

  const reopenedRound = reopenedRow.locator('input[type="number"]').last()
  await reopenedRound.fill(originalRound)
  if (hasEditableAmount) await reopenedRow.locator('input[type="text"]:not([disabled])').fill(originalAmount)
  await page.getByTestId('product-form-components-save').click()
  await expect(page.getByTestId('product-form-components-save')).toBeEnabled({ timeout: 30000 })
  await page.screenshot({ path: path.join(SHOTS, '03-restored.png') })
})
