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
  path.resolve(dirname, '../../../../docs/qa/1127-r5-sol-reconv-real-qa'),
)

test('PR #1127 R5 구글 시트 동기화 화면 실 API 도달', async ({ page }) => {
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

  // 이 화면에만 있는 요소를 캡처보다 먼저 단정해 해시 라우트 조용한 홈 낙착을 차단한다.
  await expect(page.getByTestId('admin-sheetsync-trigger-btn')).toHaveText('지금 동기화')
  await expect(page.getByRole('heading', { name: '구글 시트 동기화', level: 3 })).toBeVisible()
  const response = await lastSyncResponse
  expect(response.status(), '실 GET /sync/last HTTP').toBe(200)
  const body = await response.json()
  expect(body.success, '실 API envelope success').toBe(true)

  await page.screenshot({
    path: path.join(shots, '01-sheet-sync-reached-real-qa.png'),
    fullPage: true,
  })

  console.log(
    JSON.stringify({
      reachedHashRoute: page.url(),
      loginStatus: loginResponse.status(),
      lastSyncStatus: response.status(),
      lastSyncAt: body.data?.lastSyncAt ?? null,
      summaryIsNull: body.data?.summary == null,
    }),
  )
})
