import { expect, test } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5234'
const authApiBase = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const disposableProductApiBase = process.env['DISPOSABLE_PRODUCT_API_BASE'] ?? 'http://127.0.0.1:18085'
const password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const shots = resolveQaShotsDir(
  path.resolve(dirname, '../../../../docs/qa/1127-r7-sol-reconv-real-qa'),
)

test('PR #1127 R7 일회용 DB sync 결과가 화면 카운터와 라벨에 도달한다', async ({ page }) => {
  const loginResponse = await page.request.post(`${authApiBase}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(loginResponse.status(), 'dev_master 실 로그인 HTTP').toBe(200)
  const loginData = (await loginResponse.json()).data ?? {}
  expect(loginData.token, '실 JWT 부재').toBeTruthy()

  const authHeaders = { Authorization: `Bearer ${loginData.token}` }
  const existingResponse = await page.request.get(
    `${disposableProductApiBase}/api/v1/products/admin/sync/last`,
    { headers: authHeaders },
  )
  expect(existingResponse.status(), '일회용 DB 사전 GET /sync/last HTTP').toBe(200)
  const existingBody = await existingResponse.json()
  let summary = existingBody.data?.summary
  if (!summary) {
    const syncResponse = await page.request.post(
      `${disposableProductApiBase}/api/v1/products/admin/sync`,
      { headers: authHeaders },
    )
    expect([200, 207], '일회용 DB sync HTTP').toContain(syncResponse.status())
    const syncBody = await syncResponse.json()
    expect(syncBody.success, '일회용 DB sync envelope success').toBe(true)
    summary = syncBody.data
  }

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
      response.url().includes('/api/v1/products/admin/sync/last')
      && response.request().method() === 'GET',
  )
  await page.goto(`${baseUrl}/#/admin/sheet-sync`)

  // 캡처 전 이 화면에만 있는 요소를 단정해 해시 라우트의 홈 낙착을 차단한다.
  await expect(page.getByTestId('admin-sheetsync-trigger-btn')).toHaveText('지금 동기화')
  await expect(page.getByRole('heading', { name: '구글 시트 동기화', level: 3 })).toBeVisible()
  await expect(page.getByRole('columnheader', {
    name: '신규 Product row / 연결 occurrence',
  })).toBeVisible()

  const response = await lastSyncResponse
  expect(response.status(), '일회용 DB GET /sync/last HTTP').toBe(200)

  await expect(page.getByText(
    `수동 보존 Product occurrence ${summary.totalPreservedManualProductOccurrences}`,
    { exact: true },
  )).toBeVisible()
  await expect(page.getByText(
    `수동 보존 구성품 occurrence ${summary.totalPreservedManualComponentOccurrences}`,
    { exact: true },
  )).toBeVisible()
  await expect(page.getByText(
    `총 skip occurrence ${summary.totalSkippedOccurrences}`,
    { exact: true },
  )).toBeVisible()

  const componentRows = page.getByTestId('admin-sheetsync-tab-row').filter({ hasText: '구성품 ·' })
  let linkedOccurrences = 0
  let softDeletedComponentRows = 0
  for (let index = 0; index < (await componentRows.count()); index += 1) {
    const cells = componentRows.nth(index).locator('td')
    linkedOccurrences += Number((await cells.nth(1).innerText()).replaceAll(',', ''))
    softDeletedComponentRows += Number((await cells.nth(3).innerText()).replaceAll(',', ''))
  }
  expect(linkedOccurrences).toBe(summary.totalComponentLinkOccurrences)
  expect(softDeletedComponentRows).toBe(summary.totalSoftDeletedComponentRows)

  console.log(JSON.stringify({
    measuredAt: new Date().toISOString(),
    totalPreservedManualProductOccurrences: summary.totalPreservedManualProductOccurrences,
    totalPreservedManualComponentOccurrences: summary.totalPreservedManualComponentOccurrences,
    totalSkippedOccurrences: summary.totalSkippedOccurrences,
    totalComponentLinkOccurrences: summary.totalComponentLinkOccurrences,
    totalSoftDeletedComponentRows: summary.totalSoftDeletedComponentRows,
  }))

  await page.screenshot({
    path: path.join(shots, '01-sheet-sync-r7-disposable-db-real-qa.png'),
    fullPage: true,
  })
})
