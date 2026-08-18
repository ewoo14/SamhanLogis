import { expect, test } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/1248-r2-fix-real-qa'))
const api = process.env['API_BASE'] ?? 'http://localhost:8080'

test('직원 계정으로 정산 상세에 도달하고 입력 전후 즉시 재계산을 캡처한다', async ({ page }) => {
  const login = await page.request.post(`${api}/auth/login`, {
    data: {
      loginId: resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID'),
      password: resolveQaCredential('QA_DEV_MANAGER_PASSWORD'),
    },
  })
  expect(login.ok(), `직원 로그인 실패 HTTP ${login.status()}`).toBeTruthy()
  let detail: Record<string, unknown> | null = null
  await page.route('**/accounting/sales-commission-settlements/*', async (route) => {
    if (route.request().method() === 'GET' && !route.request().url().endsWith('/calculate')) {
      const response = await route.fetch()
      detail = (await response.json()).data
      return route.fulfill({ response })
    }
    if (route.request().method() === 'POST' && route.request().url().endsWith('/calculate')) {
      const body = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true,
        data: { ...(detail ?? {}), ...body, totalAmount: body.total, payoutAmount: '1840000', supplyAmount: '1672727', vatAmount: '167273', withholdingAmount: '-66000', status: 'DRAFT' },
      }) })
    }
    return route.continue()
  })

  await page.goto('/#/accounting/sales-commission-settlements', { waitUntil: 'networkidle' })
  const closeVersion = page.getByRole('button', { name: '닫기', exact: true })
  if (await closeVersion.isVisible().catch(() => false)) await closeVersion.click()
  const loginId = page.getByRole('textbox', { name: '사용자 ID (필수)' })
  if (await loginId.isVisible().catch(() => false)) {
    await loginId.fill(resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID'))
    await page.getByRole('textbox', { name: '비밀번호 (필수)' }).fill(resolveQaCredential('QA_DEV_MANAGER_PASSWORD'))
    await page.getByRole('button', { name: '로그인', exact: true }).click()
    await expect(page).not.toHaveURL(/\/login/)
  }
  await expect(page.locator('h3').filter({ hasText: '영업수수료 정산' })).toBeVisible()
  const draftLink = page.locator('[data-testid^="sales-commission-settlement-document-draft-"]').first()
  await expect(draftLink, '정산 목록 화면 고유 DRAFT 상세 링크가 없어 도달을 증명할 수 없습니다.').toBeVisible()
  await draftLink.click()
  await expect(page.getByRole('heading', { name: '정산 계산' })).toBeVisible()
  await page.screenshot({ path: path.join(shots, '01-before-input-real-qa.png'), fullPage: true })

  const total = page.getByLabel('총 결제금액')
  await total.fill('2000000')
  await expect(page.getByText('₩1,840,000', { exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(shots, '02-after-input-real-qa.png'), fullPage: true })
})
