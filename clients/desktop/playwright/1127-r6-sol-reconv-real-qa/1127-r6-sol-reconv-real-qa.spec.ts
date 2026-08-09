import { expect, test } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5233'
const apiBase = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const shots = resolveQaShotsDir(
  path.resolve(dirname, '../../../../docs/qa/1127-r6-sol-reconv-real-qa'),
)

test('PR #1127 R6 실 API 카운터와 화면 숫자가 일치한다', async ({ page }) => {
  const loginResponse = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(loginResponse.status(), 'dev_master 실 로그인 HTTP').toBe(200)
  const loginData = (await loginResponse.json()).data ?? {}
  expect(loginData.token, '실 JWT 부재').toBeTruthy()

  await page.addInitScript(
    ({ token, userId, role, fullName }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token, userId, role, fullName, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    {
      token: loginData.token,
      userId: loginData.userId,
      role: loginData.role,
      fullName: loginData.displayName ?? 'dev_master',
    },
  )

  const lastSyncResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/products/admin/sync/last') &&
      response.request().method() === 'GET',
  )
  await page.goto(`${baseUrl}/#/admin/sheet-sync`)

  // 캡처 전에 이 화면 전용 요소를 단정해 해시 라우트의 조용한 홈 낙착을 차단한다.
  await expect(page.getByTestId('admin-sheetsync-trigger-btn')).toHaveText('지금 동기화')
  await expect(page.getByRole('heading', { name: '구글 시트 동기화', level: 3 })).toBeVisible()

  const response = await lastSyncResponse
  expect(response.status(), '실 GET /sync/last HTTP').toBe(200)
  const body = await response.json()
  expect(body.success, '실 API envelope success').toBe(true)

  await page.screenshot({
    path: path.join(shots, '01-sheet-sync-counter-real-qa.png'),
    fullPage: true,
  })

  const summary = body.data?.summary
  expect(summary, '공유 DB sync POST 금지 상태에서 마지막 summary가 없어 화면 카운터를 검증할 수 없음').not.toBeNull()

  await expect(page.getByText(`총 skip occurrence ${summary.totalSkippedOccurrences}`, { exact: true })).toBeVisible()
  await expect(page.getByText(`수동 보존 Product occurrence ${summary.totalPreservedManualProductOccurrences}`, { exact: true })).toBeVisible()
  await expect(page.getByText(`수동 보존 구성품 occurrence ${summary.totalPreservedManualComponentOccurrences}`, { exact: true })).toBeVisible()

  expect(summary.totalPreservedManualProductOccurrences).toBe(0)
  expect(summary.totalPreservedManualComponentOccurrences).toBe(2)
  expect(summary.totalSkippedOccurrences).toBe(37)

  const componentRows = page.getByTestId('admin-sheetsync-tab-row').filter({ hasText: '구성품 ·' })
  let linkedOccurrences = 0
  for (let index = 0; index < (await componentRows.count()); index += 1) {
    linkedOccurrences += Number((await componentRows.nth(index).locator('td').nth(1).innerText()).replaceAll(',', ''))
  }
  expect(linkedOccurrences).toBe(1_600)
})
